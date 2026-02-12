import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { resolve, basename } from 'path';
import chalk from 'chalk';
import {
  spinner,
  success,
  error,
  info,
  warning,
  header,
  keyValue,
  newline,
  setJsonMode,
} from '../output/reporters.js';
import {
  parseTokenFile,
  detectFormat,
  compareTokens,
  findCloseMatches,
  type DesignToken,
} from '@buoy-design/core';
import { TokenScanner } from '@buoy-design/scanners';

export function createCompareCommand(): Command {
  const cmd = new Command('compare')
    .description('Compare design tokens from a file against your codebase')
    .argument('<design-tokens-file>', 'Path to design tokens JSON file (DTCG, Tokens Studio, or Style Dictionary format)')
    .option('--json', 'Output as JSON')
    .option('--strict', 'Exit with error code if any drift detected')
    .option('-v, --verbose', 'Show detailed match information')
    .action(async (designTokensPath: string, options) => {
      if (options.json) {
        setJsonMode(true);
      }

      const spin = spinner('Loading design tokens...');

      try {
        const cwd = process.cwd();
        const fullPath = resolve(cwd, designTokensPath);

        // Verify file exists
        if (!existsSync(fullPath)) {
          spin.stop();
          error(`File not found: ${designTokensPath}`);
          process.exit(1);
        }

        // Parse design tokens file
        const content = readFileSync(fullPath, 'utf-8');
        let designTokens: DesignToken[];

        try {
          const json = JSON.parse(content);
          const format = detectFormat(json);

          if (!options.json) {
            spin.stop();
            info(`Detected format: ${formatName(format)}`);
            spin.start('Parsing tokens...');
          }

          designTokens = parseTokenFile(content);
        } catch (parseErr) {
          spin.stop();
          error(`Failed to parse token file: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
          process.exit(1);
        }

        if (designTokens.length === 0) {
          spin.stop();
          warning('No tokens found in the design file');
          info('Make sure the file contains valid DTCG, Tokens Studio, or Style Dictionary format tokens');
          process.exit(0);
        }

        // Scan codebase for tokens
        spin.text = 'Scanning codebase for tokens...';

        const scanner = new TokenScanner({
          projectRoot: cwd,
          include: ['**/*.css', '**/*.scss', '**/*.json'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.min.css'],
        });

        const scanResult = await scanner.scan();
        const codeTokens = scanResult.items;
        spin.stop();

        // Compare tokens
        const result = compareTokens(designTokens, codeTokens);

        // Output results
        if (options.json) {
          console.log(JSON.stringify({
            designFile: basename(fullPath),
            ...result,
          }, null, 2));
          return;
        }

        newline();
        header('Token Comparison');
        newline();

        // Summary
        keyValue('Design tokens', String(result.summary.totalDesignTokens));
        keyValue('Code tokens', String(result.summary.totalCodeTokens));
        keyValue('Matched', String(result.summary.matched));
        if (result.summary.matchedWithDrift > 0) {
          keyValue('Value drift', chalk.yellow(String(result.summary.matchedWithDrift)));
        }
        if (result.summary.missing > 0) {
          keyValue('Missing in code', chalk.red(String(result.summary.missing)));
        }
        if (result.summary.orphan > 0) {
          keyValue('Orphan (code only)', chalk.dim(String(result.summary.orphan)));
        }
        newline();

        // Gap 1: Coverage percentage
        const coveragePct = result.summary.totalDesignTokens > 0
          ? Math.round((result.summary.matched / result.summary.totalDesignTokens) * 100)
          : 0;
        const coverageColor = coveragePct >= 80 ? chalk.green : coveragePct >= 50 ? chalk.yellow : chalk.red;
        keyValue('Coverage', coverageColor(`${coveragePct}% (${result.summary.matched} of ${result.summary.totalDesignTokens} design tokens matched)`));
        newline();

        // Gap 2: Per-category matched count breakdown
        const matchedByCategory = new Map<string, number>();
        for (const match of result.matches) {
          const cat = match.designToken.category;
          matchedByCategory.set(cat, (matchedByCategory.get(cat) || 0) + 1);
        }
        const missingByCategory = new Map<string, number>();
        for (const token of result.missingTokens) {
          const cat = token.category;
          missingByCategory.set(cat, (missingByCategory.get(cat) || 0) + 1);
        }
        const allCategories = new Set([...matchedByCategory.keys(), ...missingByCategory.keys()]);
        if (allCategories.size > 0) {
          console.log(chalk.bold('By Category:'));
          for (const cat of [...allCategories].sort()) {
            const matched = matchedByCategory.get(cat) || 0;
            const missing = missingByCategory.get(cat) || 0;
            const parts: string[] = [`${matched} matched`];
            if (missing > 0) {
              parts.push(chalk.red(`${missing} missing`));
            }
            console.log(`  ${cat}:${' '.repeat(Math.max(1, 12 - cat.length))}${parts.join(', ')}`);
          }
          newline();
        }

        // Match details
        if (options.verbose && result.matches.length > 0) {
          console.log(chalk.bold('Matches:'));
          for (const match of result.matches) {
            const icon = match.valueDrift ? chalk.yellow('⚠') : chalk.green('✓');
            const matchType = match.matchType === 'exact' ? '' : chalk.dim(` [${match.matchType}]`);
            console.log(`  ${icon} ${match.designToken.name}${matchType}`);
            if (match.valueDrift) {
              console.log(`     Design: ${formatValue(match.designToken.value)}`);
              console.log(`     Code:   ${formatValue(match.codeToken.value)}`);
            }
          }
          newline();
        }

        // Gap 4 (part 1): Build orphan usage frequency from codeTokens
        const orphanUsageCount = new Map<string, number>();
        for (const codeToken of codeTokens) {
          const name = codeToken.name;
          orphanUsageCount.set(name, (orphanUsageCount.get(name) || 0) + 1);
        }

        // Missing tokens
        if (result.missingTokens.length > 0) {
          console.log(chalk.bold.red('Missing in codebase:'));
          for (const token of result.missingTokens.slice(0, 10)) {
            // Gap 4: Show usage count (always 0 for missing tokens since they are not in code)
            console.log(`  ${chalk.red('✗')} ${token.name} ${chalk.dim('(used 0 times in code)')}`);
          }
          if (result.missingTokens.length > 10) {
            console.log(chalk.dim(`  ... and ${result.missingTokens.length - 10} more`));
          }
          newline();

          // Gap 3: Close matches / typo detection
          const closeMatches: Array<{ missingToken: DesignToken; orphanToken: DesignToken; distance: number }> = [];

          // Group missing and orphan tokens by category for close match detection
          const missingByCat = new Map<string, DesignToken[]>();
          for (const token of result.missingTokens) {
            const cat = token.category;
            if (!missingByCat.has(cat)) missingByCat.set(cat, []);
            missingByCat.get(cat)!.push(token);
          }
          const orphanByCat = new Map<string, DesignToken[]>();
          for (const token of result.orphanTokens) {
            const cat = token.category;
            if (!orphanByCat.has(cat)) orphanByCat.set(cat, []);
            orphanByCat.get(cat)!.push(token);
          }

          for (const [cat, missingTokens] of missingByCat) {
            const orphans = orphanByCat.get(cat) || [];
            if (orphans.length === 0) continue;

            const findCategory = (cat === 'color' || cat === 'spacing') ? cat : null;
            if (!findCategory) continue;

            const missingValues = missingTokens.map(t => formatValue(t.value));
            const orphanValues = orphans.map(t => formatValue(t.value));

            const matches = findCloseMatches(missingValues, orphanValues, findCategory as 'color' | 'spacing');

            for (const match of matches) {
              const missingToken = missingTokens.find(t => formatValue(t.value) === match.value);
              const orphanToken = orphans.find(t => formatValue(t.value) === match.closeTo);
              if (missingToken && orphanToken) {
                closeMatches.push({ missingToken, orphanToken, distance: match.distance });
              }
            }
          }

          if (closeMatches.length > 0) {
            console.log(chalk.bold.yellow('Close matches (possible typos):'));
            for (const { missingToken, orphanToken } of closeMatches) {
              console.log(`  ${chalk.yellow('⚠')} ${missingToken.name} (${formatValue(missingToken.value)}) → close to ${orphanToken.name} (${formatValue(orphanToken.value)})`);
            }
            newline();
          }
        }

        // Orphan tokens (optional, dimmed)
        if (options.verbose && result.orphanTokens.length > 0) {
          console.log(chalk.bold.dim('Code tokens not in design:'));
          for (const token of result.orphanTokens.slice(0, 5)) {
            // Gap 4: Show usage frequency for orphan code tokens
            const usages = orphanUsageCount.get(token.name) || 1;
            console.log(chalk.dim(`  ? ${token.name} (${usages} usage${usages !== 1 ? 's' : ''})`));
          }
          if (result.orphanTokens.length > 5) {
            console.log(chalk.dim(`  ... and ${result.orphanTokens.length - 5} more`));
          }
          newline();
        }

        // Summary message
        if (result.summary.missing === 0 && result.summary.matchedWithDrift === 0) {
          success('Design tokens are fully aligned with your codebase!');
        } else if (result.summary.matchedWithDrift > 0) {
          warning(`${result.summary.matchedWithDrift} tokens have value drift`);
        }

        if (result.summary.missing > 0) {
          info(`${result.summary.missing} design tokens are not used in code`);
        }

        // Exit with error if strict mode and issues found
        if (options.strict && (result.summary.missing > 0 || result.summary.matchedWithDrift > 0)) {
          process.exit(1);
        }

      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Comparison failed: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}

function formatName(format: string): string {
  switch (format) {
    case 'dtcg': return 'W3C DTCG';
    case 'tokens-studio': return 'Tokens Studio';
    case 'style-dictionary': return 'Style Dictionary';
    default: return format;
  }
}

function formatValue(value: DesignToken['value']): string {
  if (value.type === 'color') {
    return value.hex;
  }
  if (value.type === 'spacing') {
    return `${value.value}${value.unit}`;
  }
  if (value.type === 'raw') {
    return String(value.value);
  }
  return JSON.stringify(value);
}
