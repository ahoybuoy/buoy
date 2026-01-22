/**
 * buoy components query - Find and explore components in the codebase
 *
 * Helps AI agents quickly find relevant components when building features.
 *
 * Examples:
 *   buoy components query "button"          # Find button components
 *   buoy components query --prop "onClick"  # Find components with onClick
 *   buoy components query --pattern "form"  # Find form-related components
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, getConfigPath } from '../config/loader.js';
import { buildAutoConfig } from '../config/auto-detect.js';
import { ScanOrchestrator } from '../scan/orchestrator.js';
import type { Component } from '@buoy-design/core';
import {
  spinner,
  error,
  info,
  newline,
  header,
  keyValue,
} from '../output/reporters.js';

interface QueryResult {
  component: Component;
  score: number;
  matchType: 'exact' | 'fuzzy' | 'prop' | 'pattern';
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

  return 0;
}

/**
 * Search components by name
 */
function searchByName(components: Component[], query: string): QueryResult[] {
  const results: QueryResult[] = [];

  for (const component of components) {
    const score = fuzzyScore(query, component.name);
    if (score >= 30) {
      results.push({
        component,
        score,
        matchType: score === 100 ? 'exact' : 'fuzzy',
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Search components by prop name
 */
function searchByProp(components: Component[], propName: string): QueryResult[] {
  const results: QueryResult[] = [];
  const lowerProp = propName.toLowerCase();

  for (const component of components) {
    const props = component.props || [];
    const matchingProp = props.find(p =>
      p.name.toLowerCase().includes(lowerProp)
    );

    if (matchingProp) {
      results.push({
        component,
        score: matchingProp.name.toLowerCase() === lowerProp ? 100 : 80,
        matchType: 'prop',
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Search components by pattern (checks name, props, and variants)
 */
function searchByPattern(components: Component[], pattern: string): QueryResult[] {
  const results: QueryResult[] = [];
  const lowerPattern = pattern.toLowerCase();

  for (const component of components) {
    let score = 0;

    // Check name
    const nameScore = fuzzyScore(pattern, component.name);
    if (nameScore > 0) score += nameScore * 0.5;

    // Check props
    const props = component.props || [];
    const propMatch = props.some(p =>
      p.name.toLowerCase().includes(lowerPattern) ||
      (p.type && p.type.toLowerCase().includes(lowerPattern))
    );
    if (propMatch) score += 30;

    // Check variants
    const variants = component.variants || [];
    const variantMatch = variants.some(v =>
      v.name.toLowerCase().includes(lowerPattern)
    );
    if (variantMatch) score += 20;

    if (score >= 30) {
      results.push({
        component,
        score: Math.min(100, score),
        matchType: 'pattern',
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Format component path for display
 */
function getComponentPath(component: Component): string {
  if ('path' in component.source) {
    return component.source.path;
  }
  return 'unknown';
}

/**
 * Format props for display
 */
function formatProps(component: Component): string {
  const props = component.props || [];
  if (props.length === 0) return chalk.dim('(no props)');

  const propStrs = props.slice(0, 5).map(p => {
    const required = p.required ? '*' : '';
    const type = p.type ? chalk.dim(`: ${p.type}`) : '';
    return `${p.name}${required}${type}`;
  });

  if (props.length > 5) {
    propStrs.push(chalk.dim(`+${props.length - 5} more`));
  }

  return propStrs.join(', ');
}

export function createComponentsQueryCommand(): Command {
  return new Command('query')
    .description('Find components by name, prop, or pattern')
    .argument('[query]', 'Search query (component name or partial match)')
    .option('--prop <propName>', 'Search by prop name (e.g., "onClick")')
    .option('--pattern <pattern>', 'Search by pattern (checks name, props, variants)')
    .option('-n, --limit <number>', 'Maximum results to show', '10')
    .option('--json', 'Output as JSON')
    .action(async (query, options) => {
      const cwd = process.cwd();

      // Need either query, prop, or pattern
      if (!query && !options.prop && !options.pattern) {
        error('Please provide a search query, --prop, or --pattern');
        info('Examples:');
        info('  buoy components query "button"');
        info('  buoy components query --prop "onClick"');
        info('  buoy components query --pattern "form"');
        process.exit(1);
      }

      const spin = spinner('Scanning components...');

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

        // Scan for components
        const orchestrator = new ScanOrchestrator(config, cwd);
        const { components } = await orchestrator.scanComponents({});

        if (components.length === 0) {
          spin.stop();
          error('No components found');
          info('Run `buoy show all` to scan your codebase first');
          process.exit(1);
        }

        spin.stop();

        // Perform search
        let results: QueryResult[] = [];

        if (options.prop) {
          results = searchByProp(components, options.prop);
        } else if (options.pattern) {
          results = searchByPattern(components, options.pattern);
        } else if (query) {
          results = searchByName(components, query);
        }

        // Apply limit
        const limit = parseInt(options.limit, 10);
        results = results.slice(0, limit);

        // Output
        if (options.json) {
          console.log(JSON.stringify({
            query: query || null,
            prop: options.prop || null,
            pattern: options.pattern || null,
            results: results.map(r => ({
              name: r.component.name,
              path: getComponentPath(r.component),
              props: r.component.props?.map(p => ({
                name: p.name,
                type: p.type,
                required: p.required,
              })),
              variants: r.component.variants?.map(v => v.name),
              score: Math.round(r.score),
              matchType: r.matchType,
            })),
            totalComponents: components.length,
          }, null, 2));
          return;
        }

        // Human-readable output
        if (results.length === 0) {
          newline();
          info('No matching components found');
          newline();
          if (query) {
            info(`Try a different search term or use --pattern for broader search`);
          }
          return;
        }

        newline();
        header(`Found ${results.length} component${results.length === 1 ? '' : 's'}`);
        newline();

        for (const result of results) {
          const { component, score, matchType } = result;

          // Score indicator
          const scoreLabel = matchType === 'exact'
            ? chalk.green('exact')
            : matchType === 'prop'
              ? chalk.cyan('prop match')
              : matchType === 'pattern'
                ? chalk.yellow('pattern')
                : chalk.dim(`${Math.round(score)}%`);

          console.log(
            `  ${chalk.bold(component.name)} ${scoreLabel}`
          );
          keyValue('    Path', getComponentPath(component));
          keyValue('    Props', formatProps(component));

          // Show variants if present
          const variants = component.variants || [];
          if (variants.length > 0) {
            const variantNames = variants.slice(0, 4).map(v => v.name).join(', ');
            const more = variants.length > 4 ? ` +${variants.length - 4} more` : '';
            keyValue('    Variants', variantNames + more);
          }

          newline();
        }

        // Summary
        console.log(chalk.dim(`─`.repeat(40)));
        info(`${components.length} total components in project`);
        if (results.length === limit) {
          info(`Showing first ${limit} results. Use --limit to see more.`);
        }
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Component query failed: ${message}`);
        process.exit(1);
      }
    });
}
