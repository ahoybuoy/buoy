import type { DesignToken, DriftSignal, TokenSource } from '@buoy-design/core';
import { createTokenId } from '@buoy-design/core';
import { TailwindConfigParser } from './config-parser.js';
import { ArbitraryValueDetector } from './arbitrary-detector.js';
import { readFileSync } from 'fs';
import { glob } from 'glob';

export interface TailwindScannerConfig {
  projectRoot: string;
  include?: string[];
  exclude?: string[];
  /** Whether to scan for arbitrary values (default: true) */
  detectArbitraryValues?: boolean;
  /** Whether to extract theme tokens from config (default: true) */
  extractThemeTokens?: boolean;
  /** Whether to extract semantic tokens from class usage in source files (default: false) */
  extractSemanticTokens?: boolean;
}

/**
 * Represents a semantic design token discovered from Tailwind class usage
 */
export interface SemanticToken {
  /** Token name (e.g., 'primary', 'primary-foreground', 'muted') */
  name: string;
  /** Token category inferred from usage */
  category: 'color' | 'spacing' | 'border' | 'typography' | 'other';
  /** Number of times this token is used */
  usageCount: number;
  /** Files where this token is used */
  usedInFiles: string[];
  /** Example classes using this token */
  exampleClasses: string[];
}

export interface TailwindScanResult {
  tokens: DesignToken[];
  drifts: DriftSignal[];
  configPath: string | null;
  /** Semantic tokens discovered from Tailwind class usage */
  semanticTokens?: SemanticToken[];
  stats: {
    filesScanned: number;
    arbitraryValuesFound: number;
    tokensExtracted: number;
    semanticTokensFound?: number;
  };
}

/**
 * Parsed result from Tailwind v4 CSS-based configuration
 */
interface TailwindV4Config {
  configPath: string;
  tokens: DesignToken[];
  hasThemeBlock: boolean;
  hasPlugins: boolean;
  hasCustomVariants: boolean;
  hasUtilities: boolean;
}

export class TailwindScanner {
  private config: TailwindScannerConfig;

  constructor(config: TailwindScannerConfig) {
    this.config = {
      detectArbitraryValues: true,
      extractThemeTokens: true,
      extractSemanticTokens: false,
      ...config,
    };
  }

  async scan(): Promise<TailwindScanResult> {
    const result: TailwindScanResult = {
      tokens: [],
      drifts: [],
      configPath: null,
      stats: {
        filesScanned: 0,
        arbitraryValuesFound: 0,
        tokensExtracted: 0,
      },
    };

    // Extract theme tokens from config
    if (this.config.extractThemeTokens) {
      // Try traditional tailwind.config.js first
      const parser = new TailwindConfigParser(this.config.projectRoot);
      const parsed = await parser.parse();

      if (parsed) {
        // Traditional JS/TS config found
        result.tokens = parsed.tokens;
        result.configPath = parsed.configPath;
        result.stats.tokensExtracted = parsed.tokens.length;
      } else {
        // Try Tailwind v4 CSS-based configuration
        const v4Config = await this.parseTailwindV4Config();
        if (v4Config) {
          result.tokens = v4Config.tokens;
          result.configPath = v4Config.configPath;
          result.stats.tokensExtracted = v4Config.tokens.length;
        }
      }
    }

    // Detect arbitrary values in source files
    if (this.config.detectArbitraryValues) {
      const detector = new ArbitraryValueDetector({
        projectRoot: this.config.projectRoot,
        include: this.config.include,
        exclude: this.config.exclude,
      });

      const arbitraryValues = await detector.detect();
      const driftSignals = await detector.detectAsDriftSignals();

      result.drifts = driftSignals;
      result.stats.arbitraryValuesFound = arbitraryValues.length;
      result.stats.filesScanned = new Set(arbitraryValues.map(v => v.file)).size;
    }

    // Extract semantic tokens from class usage in source files
    if (this.config.extractSemanticTokens) {
      const semanticTokens = await this.extractSemanticTokens();
      result.semanticTokens = semanticTokens;
      result.stats.semanticTokensFound = semanticTokens.length;
    }

    return result;
  }

  /**
   * Extract semantic design tokens from Tailwind class usage in source files
   */
  private async extractSemanticTokens(): Promise<SemanticToken[]> {
    const tokenMap = new Map<string, SemanticToken>();

    // File patterns to scan for Tailwind classes
    const sourcePatterns = this.config.include || [
      '**/*.tsx',
      '**/*.jsx',
      '**/*.ts',
      '**/*.js',
      '**/*.vue',
      '**/*.svelte',
    ];

    const exclude = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/*.test.*',
      '**/*.spec.*',
      ...(this.config.exclude || []),
    ];

    for (const pattern of sourcePatterns) {
      try {
        const files = await glob(pattern, {
          cwd: this.config.projectRoot,
          ignore: exclude,
          absolute: true,
        });

        for (const file of files) {
          const content = readFileSync(file, 'utf-8');
          const relativePath = file.replace(this.config.projectRoot + '/', '');
          this.extractSemanticTokensFromContent(content, relativePath, tokenMap);
        }
      } catch {
        // Continue to next pattern
      }
    }

    return Array.from(tokenMap.values());
  }

  /**
   * Extract semantic tokens from file content
   */
  private extractSemanticTokensFromContent(
    content: string,
    filePath: string,
    tokenMap: Map<string, SemanticToken>
  ): void {
    // Extract all string literals that could contain Tailwind classes
    const classStrings = this.extractClassStrings(content);

    for (const classString of classStrings) {
      const classes = classString.split(/\s+/).filter(Boolean);

      for (const cls of classes) {
        const semanticToken = this.parseSemanticToken(cls);
        if (semanticToken) {
          const existing = tokenMap.get(semanticToken.name);
          if (existing) {
            existing.usageCount++;
            if (!existing.usedInFiles.includes(filePath)) {
              existing.usedInFiles.push(filePath);
            }
            if (existing.exampleClasses.length < 5 && !existing.exampleClasses.includes(cls)) {
              existing.exampleClasses.push(cls);
            }
          } else {
            tokenMap.set(semanticToken.name, {
              ...semanticToken,
              usageCount: 1,
              usedInFiles: [filePath],
              exampleClasses: [cls],
            });
          }
        }
      }
    }
  }

  /**
   * Extract class strings from source code content
   */
  private extractClassStrings(content: string): string[] {
    const classStrings: string[] = [];

    // Match className="..." or class="..."
    const classNameRegex = /(?:className|class)\s*=\s*["']([^"']+)["']/g;
    let match;
    while ((match = classNameRegex.exec(content)) !== null) {
      classStrings.push(match[1]!);
    }

    // Match className={cn(...)} or className={clsx(...)} or className={classNames(...)}
    const cnCallRegex = /(?:cn|clsx|classNames|cva)\s*\(\s*[\s\S]*?\)/g;
    while ((match = cnCallRegex.exec(content)) !== null) {
      // Extract string literals from within the function call
      const innerStrings = this.extractStringsFromFunctionCall(match[0]);
      classStrings.push(...innerStrings);
    }

    // Match cva variant definitions - look for object values that are strings
    const variantRegex = /variants\s*:\s*\{[\s\S]*?\}/g;
    while ((match = variantRegex.exec(content)) !== null) {
      const innerStrings = this.extractStringsFromFunctionCall(match[0]);
      classStrings.push(...innerStrings);
    }

    return classStrings;
  }

  /**
   * Extract string literals from a function call or object
   */
  private extractStringsFromFunctionCall(code: string): string[] {
    const strings: string[] = [];
    // Match both single and double quoted strings
    const stringRegex = /["']([^"']+)["']/g;
    let match;
    while ((match = stringRegex.exec(code)) !== null) {
      strings.push(match[1]!);
    }
    // Match template literals
    const templateRegex = /`([^`]+)`/g;
    while ((match = templateRegex.exec(code)) !== null) {
      strings.push(match[1]!);
    }
    return strings;
  }

  /**
   * Parse a Tailwind class to extract semantic token name
   * Returns null if the class doesn't reference a semantic token
   */
  private parseSemanticToken(cls: string): Omit<SemanticToken, 'usageCount' | 'usedInFiles' | 'exampleClasses'> | null {
    // Known semantic token patterns in shadcn-ui and similar design systems
    const semanticPatterns = [
      // Color tokens: bg-primary, text-foreground, border-input, etc.
      /^(?:bg|text|border|ring|outline|fill|stroke|shadow|from|to|via)-([a-z]+-?[a-z]*(?:-foreground)?)(?:\/\d+)?$/,
      // Hover/focus variants: hover:bg-primary, focus:ring-ring
      /^(?:hover|focus|active|disabled|focus-visible):(?:bg|text|border|ring|outline|fill|stroke|from|to|via)-([a-z]+-?[a-z]*(?:-foreground)?)(?:\/\d+)?$/,
      // Placeholder variants: placeholder:text-muted-foreground
      /^placeholder:(?:text|bg)-([a-z]+-?[a-z]*(?:-foreground)?)(?:\/\d+)?$/,
    ];

    // Known semantic token names from shadcn-ui and common design systems
    const knownSemanticTokens = new Set([
      'primary', 'primary-foreground',
      'secondary', 'secondary-foreground',
      'destructive', 'destructive-foreground',
      'muted', 'muted-foreground',
      'accent', 'accent-foreground',
      'popover', 'popover-foreground',
      'card', 'card-foreground',
      'background', 'foreground',
      'border', 'input', 'ring',
      'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
      'sidebar', 'sidebar-foreground',
      'sidebar-primary', 'sidebar-primary-foreground',
      'sidebar-accent', 'sidebar-accent-foreground',
      'sidebar-border', 'sidebar-ring',
    ]);

    for (const pattern of semanticPatterns) {
      const match = cls.match(pattern);
      if (match && match[1]) {
        const tokenName = match[1];
        // Only return if it's a known semantic token or looks like one
        if (knownSemanticTokens.has(tokenName) || this.looksLikeSemanticToken(tokenName)) {
          return {
            name: tokenName,
            category: this.categorizeSemanticToken(tokenName, cls),
          };
        }
      }
    }

    return null;
  }

  /**
   * Check if a token name looks like a semantic design token
   */
  private looksLikeSemanticToken(name: string): boolean {
    // Semantic tokens typically have meaningful names, not utility values
    // Exclude standard Tailwind color names like 'red-500', 'blue-200', etc.
    const utilityColorPattern = /^(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(-\d+)?$/;
    if (utilityColorPattern.test(name)) {
      return false;
    }

    // Semantic tokens usually have descriptive names
    const semanticPatterns = [
      /foreground$/,
      /background$/,
      /^primary/,
      /^secondary/,
      /^accent/,
      /^muted/,
      /^destructive/,
      /^success/,
      /^warning/,
      /^error/,
      /^info/,
      /^surface/,
      /^popover/,
      /^card/,
      /^sidebar/,
      /^input$/,
      /^ring$/,
      /^border$/,
    ];

    return semanticPatterns.some(pattern => pattern.test(name));
  }

  /**
   * Categorize a semantic token based on its name and usage
   */
  private categorizeSemanticToken(name: string, cls: string): 'color' | 'spacing' | 'border' | 'typography' | 'other' {
    // If used with text-*, it's text color
    if (cls.includes('text-')) {
      return 'color';
    }
    // If used with bg-*, it's background color
    if (cls.includes('bg-')) {
      return 'color';
    }
    // Border-related
    if (cls.includes('border-') || name.includes('border')) {
      return name === 'border' ? 'color' : 'border';
    }
    // Ring-related
    if (cls.includes('ring-') || name === 'ring') {
      return 'color';
    }

    // Default based on name
    if (name.includes('foreground') || name.includes('background')) {
      return 'color';
    }

    return 'color';
  }

  /**
   * Parse Tailwind v4 CSS-based configuration
   * Looks for CSS files with @import "tailwindcss" and extracts theme tokens
   */
  private async parseTailwindV4Config(): Promise<TailwindV4Config | null> {
    // Find CSS files that might contain Tailwind v4 config
    const cssPatterns = [
      'src/styles/globals.css',
      'src/globals.css',
      'app/globals.css',
      'styles/globals.css',
      'src/styles.css',
      'styles.css',
      'src/index.css',
      'src/app.css',
      '**/*.css',
    ];

    const exclude = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      ...(this.config.exclude || []),
    ];

    for (const pattern of cssPatterns) {
      try {
        const files = await glob(pattern, {
          cwd: this.config.projectRoot,
          ignore: exclude,
          absolute: true,
        });

        for (const file of files) {
          const content = readFileSync(file, 'utf-8');

          // Check if this is a Tailwind v4 CSS file
          if (this.isTailwindV4CSSFile(content)) {
            const tokens = this.extractTokensFromCSS(content, file);
            const relativePath = file.replace(this.config.projectRoot + '/', '');

            return {
              configPath: relativePath,
              tokens,
              hasThemeBlock: /@theme\s+(inline\s+)?{/.test(content),
              hasPlugins: /@plugin\s+['"]/.test(content),
              hasCustomVariants: /@custom-variant\s+/.test(content),
              hasUtilities: /@utility\s+/.test(content),
            };
          }
        }
      } catch {
        // Continue to next pattern
      }
    }

    return null;
  }

  /**
   * Check if a CSS file is a Tailwind v4 configuration file
   */
  private isTailwindV4CSSFile(content: string): boolean {
    // Tailwind v4 uses @import "tailwindcss" or @import 'tailwindcss'
    const hasTailwindImport = /@import\s+['"]tailwindcss['"]/.test(content);

    // Also check for @theme, @plugin, @custom-variant which are v4-specific
    const hasV4Features =
      /@theme\s+(inline\s+)?{/.test(content) ||
      /@plugin\s+['"]/.test(content) ||
      /@custom-variant\s+/.test(content);

    return hasTailwindImport || hasV4Features;
  }

  /**
   * Extract design tokens from Tailwind v4 CSS configuration
   */
  private extractTokensFromCSS(content: string, filePath: string): DesignToken[] {
    const tokens: DesignToken[] = [];
    const relativePath = filePath.replace(this.config.projectRoot + '/', '');

    const source: TokenSource = {
      type: 'css',
      path: relativePath,
    };

    // Extract tokens from @theme inline { } blocks
    const themeTokens = this.extractThemeBlockTokens(content, source);
    tokens.push(...themeTokens);

    // Extract CSS custom properties from :root
    const rootTokens = this.extractRootVariables(content, source);
    tokens.push(...rootTokens);

    return tokens;
  }

  /**
   * Extract tokens from @theme inline { } blocks
   */
  private extractThemeBlockTokens(content: string, source: TokenSource): DesignToken[] {
    const tokens: DesignToken[] = [];

    // Match @theme inline { ... } or @theme { ... }
    const themeBlockRegex = /@theme\s+(?:inline\s+)?{([^}]+)}/gs;
    let match;

    while ((match = themeBlockRegex.exec(content)) !== null) {
      const blockContent = match[1]!;

      // Extract CSS custom properties from the theme block
      const varRegex = /--([\w-]+):\s*([^;]+);/g;
      let varMatch;

      while ((varMatch = varRegex.exec(blockContent)) !== null) {
        const name = varMatch[1]!;
        const value = varMatch[2]!.trim();

        const token = this.createTokenFromCSSVar(name, value, source, 'theme');
        if (token) {
          tokens.push(token);
        }
      }
    }

    return tokens;
  }

  /**
   * Extract CSS custom properties from :root { } selectors
   */
  private extractRootVariables(content: string, source: TokenSource): DesignToken[] {
    const tokens: DesignToken[] = [];

    // Match :root { ... } blocks
    const rootBlockRegex = /:root\s*{([^}]+)}/gs;
    let match;

    while ((match = rootBlockRegex.exec(content)) !== null) {
      const blockContent = match[1]!;

      // Extract CSS custom properties
      const varRegex = /--([\w-]+):\s*([^;]+);/g;
      let varMatch;

      while ((varMatch = varRegex.exec(blockContent)) !== null) {
        const name = varMatch[1]!;
        const value = varMatch[2]!.trim();

        const token = this.createTokenFromCSSVar(name, value, source, 'root');
        if (token) {
          tokens.push(token);
        }
      }
    }

    return tokens;
  }

  /**
   * Create a design token from a CSS custom property
   */
  private createTokenFromCSSVar(
    name: string,
    value: string,
    source: TokenSource,
    origin: 'theme' | 'root'
  ): DesignToken | null {
    // Skip if value is just a var() reference
    if (/^var\(--[^)]+\)$/.test(value)) {
      // Still create a token for mapping purposes
      return {
        id: createTokenId(source, `tw-${name}`),
        name: `tw-${name}`,
        category: this.categorizeToken(name),
        value: { type: 'raw', value },
        source,
        aliases: [name],
        usedBy: [],
        metadata: { tags: ['tailwind', 'v4', origin, 'reference'] },
        scannedAt: new Date(),
      };
    }

    // Detect token category from name
    const category = this.categorizeToken(name);

    // Parse value based on category
    const tokenValue = this.parseTokenValue(value, category);

    return {
      id: createTokenId(source, `tw-${name}`),
      name: `tw-${name}`,
      category,
      value: tokenValue,
      source,
      aliases: [name],
      usedBy: [],
      metadata: { tags: ['tailwind', 'v4', origin] },
      scannedAt: new Date(),
    };
  }

  /**
   * Categorize a token based on its CSS variable name
   */
  private categorizeToken(name: string): 'color' | 'spacing' | 'border' | 'typography' | 'other' {
    const lowercaseName = name.toLowerCase();

    // Color-related names
    if (
      lowercaseName.includes('color') ||
      lowercaseName.includes('background') ||
      lowercaseName.includes('foreground') ||
      lowercaseName.includes('primary') ||
      lowercaseName.includes('secondary') ||
      lowercaseName.includes('accent') ||
      lowercaseName.includes('muted') ||
      lowercaseName.includes('destructive') ||
      lowercaseName.includes('border') ||
      lowercaseName.includes('ring') ||
      lowercaseName.includes('chart') ||
      lowercaseName.includes('sidebar') ||
      lowercaseName.includes('popover') ||
      lowercaseName.includes('card') ||
      lowercaseName.includes('input') ||
      lowercaseName.includes('surface') ||
      lowercaseName.includes('selection') ||
      lowercaseName.includes('code')
    ) {
      return 'color';
    }

    // Spacing-related names
    if (
      lowercaseName.includes('spacing') ||
      lowercaseName.includes('gap') ||
      lowercaseName.includes('margin') ||
      lowercaseName.includes('padding') ||
      lowercaseName.includes('breakpoint')
    ) {
      return 'spacing';
    }

    // Border/radius-related names
    if (lowercaseName.includes('radius')) {
      return 'border';
    }

    // Typography-related names
    if (
      lowercaseName.includes('font') ||
      lowercaseName.includes('text') ||
      lowercaseName.includes('letter') ||
      lowercaseName.includes('line')
    ) {
      return 'typography';
    }

    return 'other';
  }

  /**
   * Parse a CSS value into a typed token value
   */
  private parseTokenValue(
    value: string,
    category: string
  ): { type: 'color'; hex: string } | { type: 'spacing'; value: number; unit: 'rem' | 'px' | 'em' } | { type: 'raw'; value: string } {
    // Try to parse as color
    if (category === 'color') {
      // Handle hex colors
      if (value.startsWith('#')) {
        return { type: 'color', hex: value };
      }

      // Handle oklch, rgb, hsl colors - keep as raw for now
      if (value.startsWith('oklch') || value.startsWith('rgb') || value.startsWith('hsl')) {
        return { type: 'raw', value };
      }
    }

    // Try to parse as spacing
    const spacingMatch = value.match(/^([\d.]+)(rem|px|em)$/);
    if (spacingMatch) {
      return {
        type: 'spacing',
        value: parseFloat(spacingMatch[1]!),
        unit: spacingMatch[2] as 'rem' | 'px' | 'em',
      };
    }

    // Default to raw value
    return { type: 'raw', value };
  }
}
