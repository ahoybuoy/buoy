// apps/cli/src/commands/ci.ts
import { Command } from 'commander';
import { loadConfig, getConfigPath } from '../config/loader.js';
import { loadDiscoveredPlugins, registry } from '../plugins/index.js';
import type { DriftSignal, Severity } from '@buoy/core';

export interface CIOutput {
  version: string;
  timestamp: string;
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
  topIssues: Array<{
    type: string;
    severity: Severity;
    component: string;
    message: string;
    file?: string;
    line?: number;
    suggestion?: string;
  }>;
  exitCode: number;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export function createCICommand(): Command {
  const cmd = new Command('ci')
    .description('Run drift detection for CI environments')
    .option('--fail-on <severity>', 'Exit 1 if drift at this severity or higher: critical, warning, info, none', 'critical')
    .option('--format <format>', 'Output format: json, summary', 'json')
    .option('--quiet', 'Suppress non-essential output')
    .option('--top <n>', 'Number of top issues to include', '10')
    .option('--github-token <token>', 'GitHub token for PR comments (or use GITHUB_TOKEN env)')
    .option('--github-repo <repo>', 'GitHub repo in owner/repo format (or use GITHUB_REPOSITORY env)')
    .option('--github-pr <number>', 'PR number to comment on (or use GITHUB_PR_NUMBER env)')
    .action(async (options) => {
      const log = options.quiet ? () => {} : console.error.bind(console);

      try {
        // Check for config
        if (!getConfigPath()) {
          const output: CIOutput = {
            version: '0.0.1',
            timestamp: new Date().toISOString(),
            summary: { total: 0, critical: 0, warning: 0, info: 0 },
            topIssues: [],
            exitCode: 0,
          };
          console.log(JSON.stringify(output, null, 2));
          return;
        }

        log('Loading configuration...');
        const { config } = await loadConfig();

        log('Loading plugins...');
        await loadDiscoveredPlugins({ projectRoot: process.cwd() });

        log('Scanning for drift...');

        // Import analysis modules
        const { ReactComponentScanner } = await import('@buoy/scanners/git');
        const { SemanticDiffEngine } = await import('@buoy/core/analysis');

        // Scan components
        const components: Awaited<ReturnType<typeof ReactComponentScanner.prototype.scan>>['items'] = [];

        // Determine which sources to scan from config
        const sourcesToScan: string[] = [];
        if (config.sources.react?.enabled) sourcesToScan.push('react');
        if (config.sources.vue?.enabled) sourcesToScan.push('vue');
        if (config.sources.svelte?.enabled) sourcesToScan.push('svelte');
        if (config.sources.angular?.enabled) sourcesToScan.push('angular');

        // Scan each source
        for (const source of sourcesToScan) {
          const plugin = registry.getByDetection(source);

          if (plugin && plugin.scan) {
            // Use plugin
            const sourceConfig = config.sources[source as keyof typeof config.sources];
            const result = await plugin.scan({
              projectRoot: process.cwd(),
              config: (sourceConfig as Record<string, unknown>) || {},
              include: (sourceConfig as { include?: string[] })?.include,
              exclude: (sourceConfig as { exclude?: string[] })?.exclude,
            });
            components.push(...result.components);
            if (result.errors && result.errors.length > 0) {
              for (const err of result.errors) {
                log(`[${source}] ${err.file || ''}: ${err.message}`);
              }
            }
          } else {
            // Fall back to bundled scanner
            if (source === 'react' && config.sources.react) {
              const scanner = new ReactComponentScanner({
                projectRoot: process.cwd(),
                include: config.sources.react.include,
                exclude: config.sources.react.exclude,
                designSystemPackage: config.sources.react.designSystemPackage,
              });
              const result = await scanner.scan();
              components.push(...result.items);
            }
            // Add other framework fallbacks as needed
          }
        }

        // Run semantic diff
        const engine = new SemanticDiffEngine();
        const diffResult = engine.analyzeComponents(components, {
          checkDeprecated: true,
          checkNaming: true,
          checkDocumentation: true,
        });

        let drifts: DriftSignal[] = diffResult.drifts;

        // Apply ignore rules
        for (const ignoreRule of config.drift.ignore) {
          drifts = drifts.filter(d => {
            if (d.type !== ignoreRule.type) return true;
            if (!ignoreRule.pattern) return false;
            const regex = new RegExp(ignoreRule.pattern);
            return !regex.test(d.source.entityName);
          });
        }

        // Build output
        const output = buildCIOutput(drifts, options);

        // Post to GitHub if configured
        const githubToken = options.githubToken || process.env.GITHUB_TOKEN;
        const githubRepo = options.githubRepo || process.env.GITHUB_REPOSITORY;
        const githubPr = options.githubPr || process.env.GITHUB_PR_NUMBER;

        if (githubToken && githubRepo && githubPr) {
          try {
            const githubPlugin = registry.get('@buoy/plugin-github');
            if (githubPlugin && githubPlugin.report) {
              log('Posting to GitHub PR...');

              const driftResult = {
                signals: drifts.map(d => ({
                  type: d.type,
                  severity: d.severity,
                  message: d.message,
                  component: d.source.entityName,
                  file: d.source.location?.split(':')[0],
                  line: d.source.location?.includes(':')
                    ? parseInt(d.source.location.split(':')[1] || '0', 10)
                    : undefined,
                  suggestion: d.details.suggestions?.[0],
                })),
                summary: {
                  total: drifts.length,
                  critical: drifts.filter(d => d.severity === 'critical').length,
                  warning: drifts.filter(d => d.severity === 'warning').length,
                  info: drifts.filter(d => d.severity === 'info').length,
                },
              };

              await githubPlugin.report(driftResult, {
                ci: true,
                format: 'markdown',
                github: {
                  token: githubToken,
                  repo: githubRepo,
                  pr: parseInt(githubPr, 10),
                },
              });

              log('Posted PR comment');
            } else {
              log('GitHub plugin not installed, skipping PR comment');
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log(`Failed to post GitHub comment: ${msg}`);
          }
        }

        if (options.format === 'json') {
          console.log(JSON.stringify(output, null, 2));
        } else {
          printSummary(output);
        }

        process.exit(output.exitCode);

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ error: message }, null, 2));
        process.exit(1);
      }
    });

  return cmd;
}

function buildCIOutput(drifts: DriftSignal[], options: { failOn: string; top: string }): CIOutput {
  const summary = {
    total: drifts.length,
    critical: drifts.filter(d => d.severity === 'critical').length,
    warning: drifts.filter(d => d.severity === 'warning').length,
    info: drifts.filter(d => d.severity === 'info').length,
  };

  // Sort by severity (critical first)
  const sorted = [...drifts].sort((a, b) =>
    SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
  );

  const topN = parseInt(options.top, 10) || 10;
  const topIssues = sorted.slice(0, topN).map(d => {
    const locationParts = d.source.location?.split(':');
    return {
      type: d.type,
      severity: d.severity,
      component: d.source.entityName,
      message: d.message,
      file: locationParts?.[0],
      line: locationParts?.[1] ? parseInt(locationParts[1], 10) : undefined,
      suggestion: d.details.suggestions?.[0],
    };
  });

  // Determine exit code
  let exitCode = 0;
  const failOn = options.failOn as Severity | 'none';

  if (failOn !== 'none') {
    const threshold = SEVERITY_ORDER[failOn] ?? SEVERITY_ORDER.critical;
    const hasFailure = drifts.some(d => SEVERITY_ORDER[d.severity] >= threshold);
    exitCode = hasFailure ? 1 : 0;
  }

  return {
    version: '0.0.1',
    timestamp: new Date().toISOString(),
    summary,
    topIssues,
    exitCode,
  };
}

function printSummary(output: CIOutput): void {
  const icon = output.exitCode === 0 ? '✓' : '✗';
  const status = output.exitCode === 0 ? 'PASS' : 'FAIL';

  console.log(`${icon} Buoy Drift Check: ${status}`);
  console.log('');
  console.log(`  Total:    ${output.summary.total}`);
  console.log(`  Critical: ${output.summary.critical}`);
  console.log(`  Warning:  ${output.summary.warning}`);
  console.log(`  Info:     ${output.summary.info}`);

  if (output.topIssues.length > 0) {
    console.log('');
    console.log('Top issues:');
    for (const issue of output.topIssues.slice(0, 5)) {
      const sev = issue.severity === 'critical' ? '!' :
                  issue.severity === 'warning' ? '~' : 'i';
      const loc = issue.file ? ` (${issue.file}${issue.line ? `:${issue.line}` : ''})` : '';
      console.log(`  [${sev}] ${issue.component}: ${issue.message}${loc}`);
    }

    if (output.topIssues.length > 5) {
      console.log(`  ... and ${output.topIssues.length - 5} more`);
    }
  }
}
