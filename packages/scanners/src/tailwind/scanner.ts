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
}

export interface TailwindScanResult {
  tokens: DesignToken[];
  drifts: DriftSignal[];
  configPath: string | null;
  stats: {
    filesScanned: number;
    arbitraryValuesFound: number;
    tokensExtracted: number;
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

    return result;
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
