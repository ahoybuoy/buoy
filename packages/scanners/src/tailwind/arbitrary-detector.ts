import { readFileSync } from 'fs';
import { glob } from 'glob';
import { relative } from 'path';
import type { DriftSignal, DriftSource } from '@buoy-design/core';
import { classifyFileContext, isTailwindDesignValue, parseArbitraryClass } from '@buoy-design/core';

export interface ArbitraryValue {
  type: 'color' | 'spacing' | 'size' | 'timing' | 'grid' | 'css-property' | 'border' | 'layout' | 'transform' | 'filter' | 'typography' | 'visual' | 'other';
  value: string;
  fullClass: string;
  file: string;
  line: number;
  column: number;
}

export interface ArbitraryDetectorConfig {
  projectRoot: string;
  include?: string[];
  exclude?: string[];
}

// Common modifiers that can prefix arbitrary value classes
// Handles: dark:, before:, after:, hover:, focus:, lg:, sm:, @md:, @min-[28rem]:, has-[>svg]:, etc.
// Also handles arbitrary variant selectors like [&>svg]:, [&_pre]:, [&>div]:
// The leading lookbehind stops a pattern starting mid-word: without it
// `border-[var(--x)]` also matched as `order-[...]` and `shadow-[...]` as `w-[...]`.
const MODIFIER_PREFIX = '(?<![\\w-])(?:(?:@(?:min|max)-\\[[^\\]]+\\]|@[a-z]+|[a-z-]+|has-\\[[^\\]]+\\]|\\[&[^\\]]+\\]):)*';

// Negative prefix for classes like -translate-x-[20px], -z-[1], -order-[1]
const NEGATIVE_PREFIX = '-?';

// Tailwind v4 uses parentheses syntax for CSS variables: w-(--button-width), p-(--spacing)
// This is distinct from the bracket syntax: w-[var(--button-width)]
const TAILWIND_V4_PATTERNS = {
  // Size utilities: w-(--var), h-(--var), min-w-(--var), max-w-(--var), etc.
  size: new RegExp(`${MODIFIER_PREFIX}(?:w|h|min-w|max-w|min-h|max-h|size)-\\(--[\\w-]+\\)`, 'g'),

  // Spacing utilities: p-(--var), m-(--var), gap-(--var), etc.
  spacing: new RegExp(`${MODIFIER_PREFIX}(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|right|bottom|left|start|end)-\\(--[\\w-]+\\)`, 'g'),

  // Color utilities: text-(--var), bg-(--var), border-(--var), etc.
  color: new RegExp(`${MODIFIER_PREFIX}(?:text|bg|border|fill|stroke|from|via|to|accent|caret|decoration|shadow)-\\(--[\\w-]+\\)`, 'g'),

  // Other utilities with CSS variables
  other: new RegExp(`${MODIFIER_PREFIX}[\\w-]+-\\(--[\\w-]+\\)`, 'g'),
};

// Patterns for arbitrary values in Tailwind classes
const ARBITRARY_PATTERNS = {
  // Colors: text-[#fff], bg-[#ff6b6b], border-[rgb(...)], via-[#hex]/opacity, etc.
  // Note: This pattern should only match color VALUES, not width/sizing values
  // Also handles modifier prefixes like dark:bg-[#1a1a1a]
  color: new RegExp(`${MODIFIER_PREFIX}(?:text|bg|border|fill|stroke|from|via|to|accent|caret|decoration|shadow)-\\[([^\\]]+)\\](?:/\\d+)?`, 'g'),

  // Type hint color syntax: bg-[color:rgba(...)], text-[color:hsl(...)], etc.
  // This is Tailwind's explicit type hint syntax for disambiguation
  typeHintColor: new RegExp(`${MODIFIER_PREFIX}(?:text|bg|border|fill|stroke|from|via|to|accent|caret|decoration|shadow)-\\[color:([^\\]]+)\\]`, 'g'),

  // Spacing: p-[17px], m-[2rem], gap-[10px], scroll-m-[10px], scroll-p-[20px], etc.
  // Also handles modifier prefixes like before:p-[10px]
  spacing: new RegExp(`${MODIFIER_PREFIX}(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|right|bottom|left|start|end|scroll-m|scroll-mx|scroll-my|scroll-mt|scroll-mr|scroll-mb|scroll-ml|scroll-p|scroll-px|scroll-py|scroll-pt|scroll-pr|scroll-pb|scroll-pl)-\\[([^\\]]+)\\]`, 'g'),

  // Sizing: w-[100px], h-[50vh], min-w-[300px], etc.
  // Also handles modifier prefixes like before:h-[300px], after:w-[240px]
  size: new RegExp(`${MODIFIER_PREFIX}(?:w|h|min-w|max-w|min-h|max-h|size)-\\[([^\\]]+)\\]`, 'g'),

  // Font size: text-[14px], text-[1.5rem]
  fontSize: new RegExp(`${MODIFIER_PREFIX}text-\\[(\\d+(?:\\.\\d+)?(?:px|rem|em))\\]`, 'g'),

  // Grid templates: grid-cols-[...], grid-rows-[...], cols-[...], rows-[...], auto-cols-[...], auto-rows-[...]
  // Note: cols-[...] and rows-[...] are Tailwind shorthands for grid-template-columns/rows
  grid: new RegExp(`${MODIFIER_PREFIX}(?:grid-cols|grid-rows|cols|rows|auto-cols|auto-rows)-\\[([^\\]]+)\\]`, 'g'),

  // Timing/animation: duration-[5s], delay-[200ms], transition-[...]
  timing: new RegExp(`${MODIFIER_PREFIX}(?:duration|delay|transition|ease)-\\[([^\\]]+)\\]`, 'g'),

  // Drop shadow and other shadow variants with arbitrary values
  dropShadow: new RegExp(`${MODIFIER_PREFIX}drop-shadow-\\[([^\\]]+)\\]`, 'g'),

  // Border radius: rounded-[2px], rounded-t-[4px], rounded-bl-[8px]
  borderRadius: new RegExp(`${MODIFIER_PREFIX}rounded(?:-(?:t|r|b|l|tl|tr|bl|br|s|e|ss|se|es|ee))?-\\[([^\\]]+)\\]`, 'g'),

  // Ring width: ring-[3px] (not ring color which would be ring-[#color])
  ringWidth: new RegExp(`${MODIFIER_PREFIX}ring-\\[(\\d+(?:\\.\\d+)?(?:px|rem|em)?)\\]`, 'g'),

  // Divide width: divide-x-[3px], divide-y-[2px]
  divideWidth: new RegExp(`${MODIFIER_PREFIX}divide-(?:x|y)-\\[([^\\]]+)\\]`, 'g'),

  // Outline width and offset: outline-[3px], outline-offset-[4px]
  outline: new RegExp(`${MODIFIER_PREFIX}outline(?:-offset)?-\\[(\\d+(?:\\.\\d+)?(?:px|rem|em)?)\\]`, 'g'),

  // Border width: border-[1.5px], border-t-[2px], border-x-[3px], etc.
  // Matches only size values (px, rem, em), not colors
  borderWidth: new RegExp(`${MODIFIER_PREFIX}border(?:-(?:t|r|b|l|x|y|s|e))?-\\[(\\d+(?:\\.\\d+)?(?:px|rem|em))\\]`, 'g'),

  // Aspect ratio: aspect-[2/0.5], aspect-[16/9]
  aspect: new RegExp(`${MODIFIER_PREFIX}aspect-\\[([^\\]]+)\\]`, 'g'),

  // Z-index: z-[100], -z-[1]
  zIndex: new RegExp(`${MODIFIER_PREFIX}${NEGATIVE_PREFIX}z-\\[([^\\]]+)\\]`, 'g'),

  // Flex/layout: basis-[25%], grow-[2], shrink-[0], order-[13], columns-[3]
  flexLayout: new RegExp(`${MODIFIER_PREFIX}${NEGATIVE_PREFIX}(?:basis|grow|shrink|order|columns)-\\[([^\\]]+)\\]`, 'g'),

  // Transform: translate-x-[10px], rotate-[45deg], scale-[1.1], skew-x-[12deg], origin-[center_bottom]
  transform: new RegExp(`${MODIFIER_PREFIX}${NEGATIVE_PREFIX}(?:translate-x|translate-y|rotate|scale|scale-x|scale-y|skew-x|skew-y|origin)-\\[([^\\]]+)\\]`, 'g'),

  // Filters: blur-[2px], brightness-[1.25], contrast-[1.1], saturate-[1.2], hue-rotate-[90deg], invert-[0.5], sepia-[0.75]
  // Note: Uses negative lookbehind to avoid matching backdrop-* variants
  filter: new RegExp(`${MODIFIER_PREFIX}(?<!backdrop-)(?:blur|brightness|contrast|saturate|hue-rotate|invert|sepia|grayscale)-\\[([^\\]]+)\\]`, 'g'),

  // Backdrop filters: backdrop-blur-[4px], backdrop-brightness-[0.5], etc.
  backdropFilter: new RegExp(`${MODIFIER_PREFIX}backdrop-(?:blur|brightness|contrast|saturate|hue-rotate|invert|sepia|grayscale|opacity)-\\[([^\\]]+)\\]`, 'g'),

  // Opacity: opacity-[0.85], opacity-[.5], opacity-[33%]
  opacity: new RegExp(`${MODIFIER_PREFIX}opacity-\\[([^\\]]+)\\]`, 'g'),

  // Typography: leading-[1.5], tracking-[0.02em], font-[500], underline-offset-[4px], indent-[2em]
  leading: new RegExp(`${MODIFIER_PREFIX}leading-\\[([^\\]]+)\\]`, 'g'),
  tracking: new RegExp(`${MODIFIER_PREFIX}tracking-\\[([^\\]]+)\\]`, 'g'),
  fontWeight: new RegExp(`${MODIFIER_PREFIX}font-\\[(\\d+)\\]`, 'g'),
  underlineOffset: new RegExp(`${MODIFIER_PREFIX}underline-offset-\\[([^\\]]+)\\]`, 'g'),
  indent: new RegExp(`${MODIFIER_PREFIX}indent-\\[([^\\]]+)\\]`, 'g'),

  // Line clamp: line-clamp-[3], line-clamp-[5]
  lineClamp: new RegExp(`${MODIFIER_PREFIX}line-clamp-\\[([^\\]]+)\\]`, 'g'),

  // Box shadow: shadow-[0_0_0_1px_hsl(...)], shadow-[0_35px_60px_-15px_rgba(...)]
  // Matches arbitrary box-shadow values (not color-only patterns)
  boxShadow: new RegExp(`${MODIFIER_PREFIX}shadow-\\[(\\d[^\\]]+)\\]`, 'g'),

  // Content: content-[''], content-['*'], content-['Hello']
  // Used with ::before and ::after pseudo-elements
  content: new RegExp(`${MODIFIER_PREFIX}content-\\[('[^']*'|"[^"]*"|[^\\]]+)\\]`, 'g'),

  // Stroke width: stroke-[2px], stroke-[1.5px] (not stroke color which matches color pattern)
  strokeWidth: new RegExp(`${MODIFIER_PREFIX}stroke-\\[(\\d+(?:\\.\\d+)?(?:px|rem|em))\\]`, 'g'),

  // Will-change: will-change-[transform], will-change-[opacity,transform]
  willChange: new RegExp(`${MODIFIER_PREFIX}will-change-\\[([^\\]]+)\\]`, 'g'),

  // List style: list-[upper-roman], list-[lower-alpha]
  listStyle: new RegExp(`${MODIFIER_PREFIX}list-\\[([^\\]]+)\\]`, 'g'),

  // Object position: object-[center_top], object-[25%_75%]
  objectPosition: new RegExp(`${MODIFIER_PREFIX}object-\\[([^\\]]+)\\]`, 'g'),

  // Cursor: cursor-[pointer], cursor-[url(hand.cur),_pointer], cursor-[grab]
  cursor: new RegExp(`${MODIFIER_PREFIX}cursor-\\[([^\\]]+)\\]`, 'g'),

  // Arbitrary CSS properties: [--custom-prop:value], [color:red]
  cssProperty: /\[(-{0,2}[\w-]+:[^\]]+)\]/g,

  // Other arbitrary values (catch-all)
  other: new RegExp(`${MODIFIER_PREFIX}[\\w-]+-\\[([^\\]]+)\\]`, 'g'),
};

export class ArbitraryValueDetector {
  private config: ArbitraryDetectorConfig;

  constructor(config: ArbitraryDetectorConfig) {
    this.config = config;
  }

  async detect(): Promise<ArbitraryValue[]> {
    const files = await this.findSourceFiles();
    const arbitraryValues: ArbitraryValue[] = [];

    for (const file of files) {
      const values = this.scanFile(file);
      arbitraryValues.push(...values);
    }

    return arbitraryValues;
  }

  async detectAsDriftSignals(): Promise<DriftSignal[]> {
    const values = await this.detect();
    return this.valuesToDriftSignals(values);
  }

  private async findSourceFiles(): Promise<string[]> {
    const patterns = this.config.include || [
      '**/*.html',
      '**/*.jsx',
      '**/*.tsx',
      '**/*.vue',
      '**/*.svelte',
      '**/*.astro',
      '**/*.php',
      '**/*.blade.php',
      '**/*.erb',
      '**/*.twig',
      '**/*.cshtml',
    ];

    const ignore = this.config.exclude || [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/vendor/**',
    ];

    const allFiles: string[] = [];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.config.projectRoot,
        ignore,
        absolute: true,
      });
      allFiles.push(...matches);
    }

    return [...new Set(allFiles)];
  }

  private scanFile(filePath: string): ArbitraryValue[] {
    const content = readFileSync(filePath, 'utf-8');
    const relativePath = relative(this.config.projectRoot, filePath);
    // Icons, email templates, OG images and tests hold literals on purpose.
    if (classifyFileContext(relativePath, content)) return [];
    const lines = content.split('\n');
    const values: ArbitraryValue[] = [];
    const seen = new Set<string>(); // Track seen matches to avoid duplicates

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum]!;

      // Check for color arbitrary values (including with alpha modifiers)
      for (const match of line.matchAll(ARBITRARY_PATTERNS.color)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key) && this.isHardcodedColor(match[1]!)) {
          seen.add(key);
          values.push({
            type: 'color',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for type hint color syntax: bg-[color:rgba(...)], text-[color:hsl(...)]
      for (const match of line.matchAll(ARBITRARY_PATTERNS.typeHintColor)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        // The value inside color:... is always a color value
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'color',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for Tailwind v4 CSS variable syntax: w-(--button-width), h-(--header-height)
      for (const match of line.matchAll(TAILWIND_V4_PATTERNS.size)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          // Extract the CSS variable name from the parentheses
          const varMatch = fullClass.match(/\(--[\w-]+\)/);
          values.push({
            type: 'size',
            value: varMatch ? varMatch[0].slice(1, -1) : fullClass,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for Tailwind v4 spacing syntax: p-(--padding), m-(--margin), gap-(--gap)
      for (const match of line.matchAll(TAILWIND_V4_PATTERNS.spacing)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          const varMatch = fullClass.match(/\(--[\w-]+\)/);
          values.push({
            type: 'spacing',
            value: varMatch ? varMatch[0].slice(1, -1) : fullClass,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for Tailwind v4 color syntax: text-(--color), bg-(--background)
      for (const match of line.matchAll(TAILWIND_V4_PATTERNS.color)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          const varMatch = fullClass.match(/\(--[\w-]+\)/);
          values.push({
            type: 'css-property',
            value: varMatch ? varMatch[0].slice(1, -1) : fullClass,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for spacing arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.spacing)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'spacing',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for size arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.size)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'size',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for font size arbitrary values (typography, not layout size)
      for (const match of line.matchAll(ARBITRARY_PATTERNS.fontSize)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'typography',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for grid template arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.grid)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'grid',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for timing/animation arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.timing)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'timing',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for drop shadow arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.dropShadow)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'other',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for border-radius arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.borderRadius)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'border',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for ring width arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.ringWidth)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        // Only count as border if it's a size value, not a color
        if (!seen.has(key) && !this.isHardcodedColor(match[1]!)) {
          seen.add(key);
          values.push({
            type: 'border',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for divide width arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.divideWidth)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'border',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for outline arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.outline)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        // Only count as border if it's a size value, not a color
        if (!seen.has(key) && !this.isHardcodedColor(match[1]!)) {
          seen.add(key);
          values.push({
            type: 'border',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for border width arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.borderWidth)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'border',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for aspect ratio arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.aspect)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'layout',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for z-index arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.zIndex)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'layout',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for flex/layout arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.flexLayout)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'layout',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for transform arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.transform)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'transform',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for filter arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.filter)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'filter',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for backdrop filter arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.backdropFilter)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'filter',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for opacity arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.opacity)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'visual',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for leading (line-height) arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.leading)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'typography',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for tracking (letter-spacing) arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.tracking)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'typography',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for font-weight arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.fontWeight)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'typography',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for line-clamp arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.lineClamp)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'typography',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for box-shadow arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.boxShadow)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'visual',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for content arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.content)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'other',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for stroke width arbitrary values (not stroke color)
      for (const match of line.matchAll(ARBITRARY_PATTERNS.strokeWidth)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'border',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for will-change arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.willChange)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'other',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for list style arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.listStyle)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'other',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for object position arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.objectPosition)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'layout',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for cursor arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.cursor)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'other',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for underline-offset arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.underlineOffset)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'typography',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for text indent arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.indent)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'typography',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for arbitrary CSS properties
      for (const match of line.matchAll(ARBITRARY_PATTERNS.cssProperty)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'css-property',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }
    }

    // Only literal design values (colour, spacing, font size, radius, shadow,
    // type scale, border width). Layout maths, mechanics, keywords and token
    // references are correct code, not drift.
    return values.filter((v) => isTailwindDesignValue(v.fullClass));
  }

  private isHardcodedColor(value: string): boolean {
    // Hex colors: #fff, #ff6b6b, #ffffff70
    if (/^#[0-9a-fA-F]{3,8}$/.test(value)) {
      return true;
    }

    // RGB/RGBA/HSL/HSLA functional colors
    if (/^(?:rgb|rgba|hsl|hsla)\s*\(/.test(value)) {
      return true;
    }

    // CSS variable references are OK
    if (/^var\(/.test(value)) {
      return false;
    }

    // color(...) function
    if (/^color\s*\(/.test(value)) {
      return true;
    }

    return false;
  }

  private valuesToDriftSignals(values: ArbitraryValue[]): DriftSignal[] {
    const byFile = new Map<string, ArbitraryValue[]>();
    for (const value of values) {
      const existing = byFile.get(value.file) || [];
      existing.push(value);
      byFile.set(value.file, existing);
    }

    const signals: DriftSignal[] = [];

    for (const [file, fileValues] of byFile) {
      const colors = fileValues.filter(v => v.type === 'color');
      const spacing = fileValues.filter(v => v.type === 'spacing');
      const sizes = fileValues.filter(v => v.type === 'size');
      const grids = fileValues.filter(v => v.type === 'grid');
      const timing = fileValues.filter(v => v.type === 'timing');
      const cssProps = fileValues.filter(v => v.type === 'css-property');
      const borders = fileValues.filter(v => v.type === 'border');
      const layouts = fileValues.filter(v => v.type === 'layout');
      const transforms = fileValues.filter(v => v.type === 'transform');
      const filters = fileValues.filter(v => v.type === 'filter');
      const typography = fileValues.filter(v => v.type === 'typography');
      const visuals = fileValues.filter(v => v.type === 'visual');
      const others = fileValues.filter(v => v.type === 'other');

      if (colors.length > 0) {
        signals.push(this.createDriftSignal(
          'color',
          file,
          colors,
          `${colors.length} hardcoded color${colors.length > 1 ? 's' : ''} found. Use theme colors instead.`
        ));
      }

      if (spacing.length > 0) {
        signals.push(this.createDriftSignal(
          'spacing',
          file,
          spacing,
          `${spacing.length} arbitrary spacing value${spacing.length > 1 ? 's' : ''} found. Use theme spacing instead.`
        ));
      }

      if (sizes.length > 0) {
        signals.push(this.createDriftSignal(
          'size',
          file,
          sizes,
          `${sizes.length} arbitrary size value${sizes.length > 1 ? 's' : ''} found. Consider using theme values.`
        ));
      }

      if (grids.length > 0) {
        signals.push(this.createDriftSignal(
          'grid',
          file,
          grids,
          `${grids.length} arbitrary grid template${grids.length > 1 ? 's' : ''} found. Consider defining in theme.`
        ));
      }

      if (timing.length > 0) {
        signals.push(this.createDriftSignal(
          'timing',
          file,
          timing,
          `${timing.length} arbitrary timing value${timing.length > 1 ? 's' : ''} found. Consider using theme transitions.`
        ));
      }

      if (cssProps.length > 0) {
        signals.push(this.createDriftSignal(
          'css-property',
          file,
          cssProps,
          `${cssProps.length} arbitrary CSS propert${cssProps.length > 1 ? 'ies' : 'y'} found. Consider using utility classes.`
        ));
      }

      if (borders.length > 0) {
        signals.push(this.createDriftSignal(
          'border',
          file,
          borders,
          `${borders.length} arbitrary border value${borders.length > 1 ? 's' : ''} found. Consider using theme border tokens.`
        ));
      }

      if (layouts.length > 0) {
        signals.push(this.createDriftSignal(
          'layout',
          file,
          layouts,
          `${layouts.length} arbitrary layout value${layouts.length > 1 ? 's' : ''} found. Consider using theme values.`
        ));
      }

      if (transforms.length > 0) {
        signals.push(this.createDriftSignal(
          'transform',
          file,
          transforms,
          `${transforms.length} arbitrary transform value${transforms.length > 1 ? 's' : ''} found. Consider using theme transform values.`
        ));
      }

      if (filters.length > 0) {
        signals.push(this.createDriftSignal(
          'filter',
          file,
          filters,
          `${filters.length} arbitrary filter value${filters.length > 1 ? 's' : ''} found. Consider using theme filter values.`
        ));
      }

      if (typography.length > 0) {
        signals.push(this.createDriftSignal(
          'typography',
          file,
          typography,
          `${typography.length} arbitrary typography value${typography.length > 1 ? 's' : ''} found. Consider using theme typography tokens.`
        ));
      }

      if (visuals.length > 0) {
        signals.push(this.createDriftSignal(
          'visual',
          file,
          visuals,
          `${visuals.length} arbitrary visual value${visuals.length > 1 ? 's' : ''} found. Consider using theme opacity values.`
        ));
      }

      if (others.length > 0) {
        signals.push(this.createDriftSignal(
          'other',
          file,
          others,
          `${others.length} other arbitrary value${others.length > 1 ? 's' : ''} found. Review for theme consistency.`
        ));
      }
    }

    return signals;
  }

  private createDriftSignal(
    valueType: string,
    file: string,
    values: ArbitraryValue[],
    _legacyMessage: string
  ): DriftSignal {
    const source: DriftSource = {
      entityType: 'component',
      entityId: `tailwind:${file}`,
      entityName: file,
      location: `${file}:${values[0]!.line}`,
    };
    const { message, fix } = describeArbitraryValues(values);

    return {
      id: `drift:hardcoded-value:tailwind:${file}:${valueType}`,
      type: 'hardcoded-value',
      severity: valueType === 'color' ? 'warning' : 'info',
      source,
      message,
      details: {
        expected: 'Use Tailwind theme tokens',
        actual: `${values.length} arbitrary ${valueType} value${values.length === 1 ? '' : 's'}`,
        // One entry per class, so reports and reviewers can see exactly what was found.
        affectedFiles: values.map((v) => `${v.fullClass} (line ${v.line})`),
        suggestions: [fix, 'Add the value to your Tailwind theme if it is a real part of the design'],
      },
      detectedAt: new Date(),
    };
  }
}

/** What kind of design value an arbitrary class sets, in plain words. */
export function arbitraryValueKind(fullClass: string): { kind: string; fix: string } {
  const parsed = parseArbitraryClass(fullClass);
  const u = parsed?.utility ?? '';
  const v = parsed?.value ?? '';
  const isColour = /^(#|rgb|hsl|oklch|oklab|lab|lch|hwb)/i.test(v.replace(/^color:/, ''));
  if (isColour) return { kind: 'colour', fix: 'a theme colour (bg-primary, text-muted-foreground) or a --color token' };
  if (/^rounded/.test(u)) return { kind: 'radius', fix: 'a theme radius (rounded-sm, rounded-md) or a --radius token' };
  if (u === 'text') return { kind: 'font size', fix: 'a type scale step (text-xs, text-sm) or a font-size token' };
  if (u === 'leading') return { kind: 'line height', fix: 'a leading step (leading-tight, leading-6) or a line-height token' };
  if (u === 'tracking') return { kind: 'letter spacing', fix: 'a tracking step (tracking-tight) or a letter-spacing token' };
  if (u === 'font') return { kind: 'font weight', fix: 'a weight step (font-medium, font-semibold)' };
  if (u === 'shadow' || u === 'drop-shadow') return { kind: 'shadow', fix: 'a theme shadow (shadow-sm, shadow-md) or a --shadow token' };
  if (/^(border|outline|ring|divide)/.test(u) && !/offset/.test(u)) return { kind: 'border width', fix: 'a border width step (border-2) or a token' };
  return { kind: 'spacing', fix: 'the spacing scale (p-2, gap-3, mt-4) or a --space token' };
}

/**
 * "Hardcoded radius: rounded-[2px], rounded-[3px]. Use a theme radius ..." rather
 * than "2 arbitrary border values found".
 */
export function describeArbitraryValues(values: ArbitraryValue[]): { message: string; fix: string } {
  const classes = [...new Set(values.map((v) => v.fullClass.replace(/^(?:(?:[^[\]:]|\[[^\]]*\])*:)*/, '')))];
  const kinds = [...new Set(values.map((v) => arbitraryValueKind(v.fullClass).kind))];
  const first = arbitraryValueKind(values[0]!.fullClass);
  const label = kinds.length === 1 ? kinds[0]! : kinds.join(' / ');
  const shown = classes.slice(0, 4).join(', ') + (classes.length > 4 ? ` and ${classes.length - 4} more` : '');
  const fix = kinds.length === 1 ? `Use ${first.fix} instead.` : 'Use the matching theme values instead.';
  return { message: `Hardcoded ${label}: ${shown}. ${fix}`, fix };
}
