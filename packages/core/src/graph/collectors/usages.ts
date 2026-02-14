/**
 * Usage Collector
 *
 * Finds where tokens and components are used across the codebase.
 * Detects CSS variables, Tailwind classes, and hardcoded values.
 */

import { readFile } from 'fs/promises';
import { glob } from 'glob';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

export type UsageType = 'css-var' | 'tailwind' | 'js-import' | 'hardcoded' | 'scss-var';

export interface TokenUsage {
  tokenName: string;
  filePath: string;
  lineNumber: number;
  columnNumber: number;
  usageType: UsageType;
  context: string; // Surrounding code snippet
  rawValue?: string; // For hardcoded values
}

export interface ComponentUsage {
  componentName: string;
  filePath: string;
  lineNumber: number;
  propsUsed: string[];
  hasChildren: boolean;
  context: string;
}

export interface UsageCollectorOptions {
  /** Root directory to scan */
  projectRoot: string;
  /** File patterns to include */
  include?: string[];
  /** File patterns to exclude */
  exclude?: string[];
  /** Known token names to match against */
  knownTokens?: string[];
  /** Known component names to match against */
  knownComponents?: string[];
}

export interface UsageCollectorResult {
  tokenUsages: TokenUsage[];
  componentUsages: ComponentUsage[];
  hardcodedValues: TokenUsage[];
  stats: {
    filesScanned: number;
    tokenUsagesFound: number;
    componentUsagesFound: number;
    hardcodedValuesFound: number;
  };
}

// ============================================================================
// Patterns
// ============================================================================

// CSS variable usage: var(--name) or var(--name, fallback)
const CSS_VAR_PATTERN = /var\(\s*--([a-zA-Z0-9_-]+)(?:\s*,\s*[^)]+)?\s*\)/g;

// SCSS variable usage: $name
const SCSS_VAR_PATTERN = /\$([a-zA-Z][a-zA-Z0-9_-]*)/g;

// Tailwind arbitrary value: [#fff] or [16px]
const TAILWIND_ARBITRARY_PATTERN = /(?:bg|text|border|ring|shadow|fill|stroke)-\[([^\]]+)\]/g;

// Hardcoded hex colors: #fff, #ffffff, #ffffffff
const HEX_COLOR_PATTERN = /#([0-9a-fA-F]{3,8})\b/g;

// Hardcoded RGB/RGBA: rgb(255, 255, 255), rgba(0, 0, 0, 0.5)
const RGB_PATTERN = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)/g;

// Hardcoded HSL: hsl(0, 0%, 100%), hsla(0, 0%, 0%, 0.5)
const HSL_PATTERN = /hsla?\(\s*\d+\s*,\s*[\d.]+%\s*,\s*[\d.]+%(?:\s*,\s*[\d.]+)?\s*\)/g;

// JSX component usage: <ComponentName ... />
const JSX_COMPONENT_PATTERN = /<([A-Z][a-zA-Z0-9]*)\s*(?:[^>]*?)(?:\/>|>)/g;

// ============================================================================
// Collector
// ============================================================================

/**
 * Collect token and component usages from the codebase
 */
export async function collectUsages(
  options: UsageCollectorOptions
): Promise<UsageCollectorResult> {
  const {
    projectRoot,
    include = ['**/*.{ts,tsx,js,jsx,vue,svelte,css,scss,sass,less}'],
    exclude = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
  } = options;

  // Find all matching files
  const files = await glob(include, {
    cwd: projectRoot,
    ignore: exclude,
    absolute: false,
  });

  const tokenUsages: TokenUsage[] = [];
  const componentUsages: ComponentUsage[] = [];
  const hardcodedValues: TokenUsage[] = [];

  for (const file of files) {
    const fullPath = join(projectRoot, file);
    let content: string;

    try {
      content = await readFile(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    // Collect CSS variable usages
    collectPatternUsages(
      content,
      lines,
      file,
      CSS_VAR_PATTERN,
      'css-var',
      tokenUsages
    );

    // Collect SCSS variable usages
    if (file.endsWith('.scss') || file.endsWith('.sass')) {
      collectPatternUsages(
        content,
        lines,
        file,
        SCSS_VAR_PATTERN,
        'scss-var',
        tokenUsages
      );
    }

    // Collect hardcoded colors
    collectPatternUsages(
      content,
      lines,
      file,
      HEX_COLOR_PATTERN,
      'hardcoded',
      hardcodedValues,
      true
    );

    collectPatternUsages(
      content,
      lines,
      file,
      RGB_PATTERN,
      'hardcoded',
      hardcodedValues,
      true
    );

    collectPatternUsages(
      content,
      lines,
      file,
      HSL_PATTERN,
      'hardcoded',
      hardcodedValues,
      true
    );

    // Collect Tailwind arbitrary values
    collectPatternUsages(
      content,
      lines,
      file,
      TAILWIND_ARBITRARY_PATTERN,
      'tailwind',
      hardcodedValues,
      true
    );

    // Collect component usages (JSX/template files)
    if (file.endsWith('.tsx') || file.endsWith('.jsx') || file.endsWith('.vue') || file.endsWith('.svelte')) {
      collectComponentUsages(content, lines, file, componentUsages, options.knownComponents);
    }
  }

  // Filter to known tokens if provided
  let filteredTokenUsages = tokenUsages;
  if (options.knownTokens && options.knownTokens.length > 0) {
    // Normalize token names by stripping -- and $ prefixes before comparison.
    // Token scanner outputs names WITH prefix (--primary-color, $primary)
    // but usage regex captures WITHOUT prefix (primary-color, primary).
    const normalize = (name: string) => name.replace(/^--|^\$/, '').toLowerCase();
    const knownSet = new Set(options.knownTokens.map(normalize));
    filteredTokenUsages = tokenUsages.filter(u =>
      knownSet.has(normalize(u.tokenName))
    );
  }

  // Filter to known components if provided
  let filteredComponentUsages = componentUsages;
  if (options.knownComponents && options.knownComponents.length > 0) {
    const knownSet = new Set(options.knownComponents);
    filteredComponentUsages = componentUsages.filter(u =>
      knownSet.has(u.componentName)
    );
  }

  return {
    tokenUsages: filteredTokenUsages,
    componentUsages: filteredComponentUsages,
    hardcodedValues,
    stats: {
      filesScanned: files.length,
      tokenUsagesFound: filteredTokenUsages.length,
      componentUsagesFound: filteredComponentUsages.length,
      hardcodedValuesFound: hardcodedValues.length,
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function collectPatternUsages(
  content: string,
  lines: string[],
  filePath: string,
  pattern: RegExp,
  usageType: UsageType,
  usages: TokenUsage[],
  storeRawValue = false
): void {
  // Reset pattern state
  pattern.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const { lineNumber, columnNumber } = getPosition(content, match.index);
    const line = lines[lineNumber - 1] ?? '';

    // Skip if in a comment
    if (isInComment(line, columnNumber)) continue;

    // Get context (surrounding lines)
    const contextStart = Math.max(0, lineNumber - 2);
    const contextEnd = Math.min(lines.length, lineNumber + 1);
    const context = lines.slice(contextStart, contextEnd).join('\n');

    usages.push({
      tokenName: match[1] ?? match[0],
      filePath,
      lineNumber,
      columnNumber,
      usageType,
      context,
      rawValue: storeRawValue ? match[0] : undefined,
    });
  }
}

function collectComponentUsages(
  content: string,
  lines: string[],
  filePath: string,
  usages: ComponentUsage[],
  knownComponents?: string[]
): void {
  const pattern = new RegExp(JSX_COMPONENT_PATTERN.source, 'g');

  // Built-in HTML elements and React fragments to skip
  const skipComponents = new Set([
    'Fragment',
    'React',
    'Suspense',
    'StrictMode',
    'Provider',
    'Consumer',
  ]);

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const componentName = match[1];
    if (!componentName) continue;

    // Skip built-in/common wrappers
    if (skipComponents.has(componentName)) continue;

    // If we have known components, only include those
    if (knownComponents && !knownComponents.includes(componentName)) continue;

    const { lineNumber, columnNumber } = getPosition(content, match.index);
    const line = lines[lineNumber - 1] ?? '';

    // Skip if in a comment
    if (isInComment(line, columnNumber)) continue;

    // Extract props from the JSX
    const propsUsed = extractProps(match[0]);

    // Check if has children (not self-closing)
    const hasChildren = !match[0].endsWith('/>');

    // Get context
    const contextStart = Math.max(0, lineNumber - 2);
    const contextEnd = Math.min(lines.length, lineNumber + 2);
    const context = lines.slice(contextStart, contextEnd).join('\n');

    usages.push({
      componentName,
      filePath,
      lineNumber,
      propsUsed,
      hasChildren,
      context,
    });
  }
}

function getPosition(
  content: string,
  index: number
): { lineNumber: number; columnNumber: number } {
  const before = content.slice(0, index);
  const lineNumber = (before.match(/\n/g) ?? []).length + 1;
  const lastNewline = before.lastIndexOf('\n');
  const columnNumber = index - lastNewline;

  return { lineNumber, columnNumber };
}

function isInComment(line: string, column: number): boolean {
  // Check for // comment before the position
  const commentIndex = line.indexOf('//');
  if (commentIndex !== -1 && commentIndex < column) {
    return true;
  }

  // Check for /* comment (simplified - doesn't handle multi-line)
  const blockCommentStart = line.indexOf('/*');
  const blockCommentEnd = line.indexOf('*/');
  if (
    blockCommentStart !== -1 &&
    blockCommentStart < column &&
    (blockCommentEnd === -1 || blockCommentEnd > column)
  ) {
    return true;
  }

  return false;
}

function extractProps(jsxString: string): string[] {
  const props: string[] = [];

  // Simple regex to extract prop names
  // Matches: propName= or propName (for boolean props)
  const propPattern = /\s([a-zA-Z][a-zA-Z0-9]*)(?:=|\s|\/?>)/g;

  let match: RegExpExecArray | null;
  while ((match = propPattern.exec(jsxString)) !== null) {
    const propName = match[1];
    if (propName && !['className', 'style', 'key', 'ref'].includes(propName)) {
      props.push(propName);
    }
  }

  return [...new Set(props)];
}

// ============================================================================
// Specialized Collectors
// ============================================================================

/**
 * Find all hardcoded color values in the codebase
 */
export async function findHardcodedColors(
  projectRoot: string
): Promise<TokenUsage[]> {
  const result = await collectUsages({ projectRoot });
  return result.hardcodedValues.filter(
    (u) =>
      u.rawValue?.startsWith('#') ||
      u.rawValue?.startsWith('rgb') ||
      u.rawValue?.startsWith('hsl')
  );
}

/**
 * Find all CSS variable usages
 */
export async function findCSSVariableUsages(
  projectRoot: string
): Promise<TokenUsage[]> {
  const result = await collectUsages({ projectRoot });
  return result.tokenUsages.filter((u) => u.usageType === 'css-var');
}

/**
 * Find usages of a specific token
 */
export async function findTokenUsagesInFiles(
  projectRoot: string,
  tokenName: string
): Promise<TokenUsage[]> {
  const result = await collectUsages({
    projectRoot,
    knownTokens: [tokenName],
  });
  return result.tokenUsages;
}

/**
 * Find usages of a specific component
 */
export async function findComponentUsagesInFiles(
  projectRoot: string,
  componentName: string
): Promise<ComponentUsage[]> {
  const result = await collectUsages({
    projectRoot,
    knownComponents: [componentName],
  });
  return result.componentUsages;
}
