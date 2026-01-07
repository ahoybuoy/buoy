/**
 * buoy tokens lookup - Find design tokens by name, value, or category
 *
 * Helps AI agents (and humans) quickly find the right token when they
 * know what they want but not the exact token name.
 *
 * Examples:
 *   buoy tokens lookup "primary blue"     # Fuzzy name search
 *   buoy tokens lookup --value "#3b82f6"  # Find by color value
 *   buoy tokens lookup --category color   # List all colors
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, getConfigPath } from '../config/loader.js';
import { buildAutoConfig } from '../config/auto-detect.js';
import { ScanOrchestrator } from '../scan/orchestrator.js';
import type { DesignToken } from '@buoy-design/core';
import {
  spinner,
  error,
  info,
  newline,
  header,
  keyValue,
} from '../output/reporters.js';

interface LookupResult {
  token: DesignToken;
  score: number;
  matchType: 'exact' | 'fuzzy' | 'value' | 'category';
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1,     // insertion
          matrix[i - 1]![j]! + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}

/**
 * Calculate fuzzy match score (0-100)
 */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact match
  if (q === t) return 100;

  // Contains match
  if (t.includes(q)) {
    const bonus = q.length / t.length * 50;
    return 70 + bonus;
  }

  // Word match (query words appear in target)
  const queryWords = q.split(/[-_\s]+/);
  const targetWords = t.split(/[-_\s]+/);
  const matchedWords = queryWords.filter(qw =>
    targetWords.some(tw => tw.includes(qw) || qw.includes(tw))
  );
  if (matchedWords.length > 0) {
    return 50 + (matchedWords.length / queryWords.length * 30);
  }

  // Levenshtein distance for close matches
  const distance = levenshtein(q, t);
  const maxLen = Math.max(q.length, t.length);
  const similarity = (1 - distance / maxLen) * 100;

  return Math.max(0, similarity - 20); // Penalize fuzzy matches
}

/**
 * Parse hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1]!, 16),
    g: parseInt(result[2]!, 16),
    b: parseInt(result[3]!, 16),
  } : null;
}

/**
 * Calculate color similarity (0-100)
 */
function colorSimilarity(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);

  if (!rgb1 || !rgb2) return 0;

  // Euclidean distance in RGB space
  const distance = Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
    Math.pow(rgb1.g - rgb2.g, 2) +
    Math.pow(rgb1.b - rgb2.b, 2)
  );

  // Max distance is sqrt(3 * 255^2) ≈ 441.67
  const maxDistance = 441.67;
  const similarity = (1 - distance / maxDistance) * 100;

  return similarity;
}

/**
 * Extract hex value from token
 */
function getTokenHex(token: DesignToken): string | null {
  if (token.value.type === 'color' && token.value.hex) {
    return token.value.hex;
  }
  return null;
}

/**
 * Format token value for display
 */
function formatTokenValue(token: DesignToken): string {
  const value = token.value;

  if (value.type === 'color' && value.hex) {
    return value.hex;
  }
  if (value.type === 'spacing') {
    return `${value.value}${value.unit}`;
  }
  if (value.type === 'typography') {
    return `${value.fontFamily}, ${value.fontSize}px`;
  }

  return JSON.stringify(value);
}

/**
 * Search tokens by fuzzy name match
 */
function searchByName(tokens: DesignToken[], query: string): LookupResult[] {
  const results: LookupResult[] = [];

  for (const token of tokens) {
    const score = fuzzyScore(query, token.name);
    if (score >= 30) {
      results.push({
        token,
        score,
        matchType: score === 100 ? 'exact' : 'fuzzy',
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Search tokens by value (for colors)
 */
function searchByValue(tokens: DesignToken[], value: string): LookupResult[] {
  const results: LookupResult[] = [];

  // Normalize the search value
  const searchHex = value.startsWith('#') ? value : `#${value}`;

  for (const token of tokens) {
    const tokenHex = getTokenHex(token);
    if (!tokenHex) continue;

    const similarity = colorSimilarity(searchHex, tokenHex);
    if (similarity >= 80) { // 80% threshold
      results.push({
        token,
        score: similarity,
        matchType: 'value',
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Filter tokens by category
 */
function searchByCategory(tokens: DesignToken[], category: string): LookupResult[] {
  return tokens
    .filter(t => t.category.toLowerCase() === category.toLowerCase())
    .map(token => ({
      token,
      score: 100,
      matchType: 'category' as const,
    }));
}

export function createTokensLookupCommand(): Command {
  return new Command('lookup')
    .description('Find design tokens by name, value, or category')
    .argument('[query]', 'Search query (token name or partial match)')
    .option('--value <value>', 'Search by value (e.g., "#3b82f6" for colors)')
    .option('--category <category>', 'Filter by category (color, spacing, typography)')
    .option('-n, --limit <number>', 'Maximum results to show', '10')
    .option('--json', 'Output as JSON')
    .action(async (query, options) => {
      const cwd = process.cwd();

      // Need either query, value, or category
      if (!query && !options.value && !options.category) {
        error('Please provide a search query, --value, or --category');
        info('Examples:');
        info('  buoy tokens lookup "primary"');
        info('  buoy tokens lookup --value "#3b82f6"');
        info('  buoy tokens lookup --category color');
        process.exit(1);
      }

      const spin = spinner('Loading tokens...').start();

      try {
        // Load config
        const configPath = getConfigPath();
        let config;
        if (configPath) {
          const result = await loadConfig();
          config = result.config;
        } else {
          const autoResult = await buildAutoConfig(cwd);
          config = autoResult.config;
        }

        // Scan for tokens
        spin.text = 'Scanning for tokens...';
        const orchestrator = new ScanOrchestrator(config, cwd);
        const { tokens } = await orchestrator.scanTokens({});

        if (tokens.length === 0) {
          spin.stop();
          error('No tokens found');
          info('Run `buoy sweep` to scan your codebase first');
          process.exit(1);
        }

        spin.stop();

        // Perform search
        let results: LookupResult[] = [];

        if (options.value) {
          results = searchByValue(tokens, options.value);
        } else if (options.category) {
          results = searchByCategory(tokens, options.category);
        } else if (query) {
          results = searchByName(tokens, query);
        }

        // Apply limit
        const limit = parseInt(options.limit, 10);
        results = results.slice(0, limit);

        // Output
        if (options.json) {
          console.log(JSON.stringify({
            query: query || null,
            value: options.value || null,
            category: options.category || null,
            results: results.map(r => ({
              name: r.token.name,
              category: r.token.category,
              value: formatTokenValue(r.token),
              score: Math.round(r.score),
              matchType: r.matchType,
            })),
            totalTokens: tokens.length,
          }, null, 2));
          return;
        }

        // Human-readable output
        if (results.length === 0) {
          newline();
          info('No matching tokens found');
          newline();
          if (query) {
            info(`Try a different search term or use --category to browse`);
          }
          return;
        }

        newline();
        header(`Found ${results.length} token${results.length === 1 ? '' : 's'}`);
        newline();

        for (const result of results) {
          const { token, score, matchType } = result;

          // Color indicator for color tokens
          const colorIndicator = token.category === 'color'
            ? chalk.hex(getTokenHex(token) || '#000')('●') + ' '
            : '';

          // Score indicator
          const scoreLabel = matchType === 'exact'
            ? chalk.green('exact')
            : matchType === 'value'
              ? chalk.cyan(`${Math.round(score)}% match`)
              : matchType === 'category'
                ? ''
                : chalk.dim(`${Math.round(score)}%`);

          console.log(
            `  ${colorIndicator}${chalk.bold(token.name)} ${scoreLabel}`
          );
          keyValue('    Value', formatTokenValue(token));
          keyValue('    Category', token.category);

          // Show usage hint
          if (token.category === 'color') {
            info(`    Use: var(--${token.name}) or theme.${token.name}`);
          }

          newline();
        }

        // Summary
        console.log(chalk.dim(`─`.repeat(40)));
        info(`${tokens.length} total tokens in project`);
        if (results.length === limit) {
          info(`Showing first ${limit} results. Use --limit to see more.`);
        }
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Token lookup failed: ${message}`);
        process.exit(1);
      }
    });
}
