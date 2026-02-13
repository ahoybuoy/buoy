import { Command } from "commander";
import chalk from "chalk";
import { existsSync } from "fs";
import { writeFileSync } from "fs";
import { loadConfig, getConfigPath } from "../config/loader.js";
import { buildAutoConfig } from "../config/auto-detect.js";
import {
  spinner,
  error,
  info,
  success,
  header,
  keyValue,
  newline,
  setJsonMode,
} from "../output/reporters.js";
import {
  formatDriftTable,
  formatDriftList,
  formatDriftTree,
  formatMarkdown,
  formatHtml,
  formatAgent,
} from "../output/formatters.js";
import { ScanOrchestrator } from "../scan/orchestrator.js";
import { DriftAnalysisService } from "../services/drift-analysis.js";
import { withOptionalCache, type ScanCache } from "@buoy-design/scanners";
import type { DriftSignal, Severity } from "@buoy-design/core";
import { formatUpgradeHint } from "../utils/upgrade-hints.js";
import { generateAuditReport, findCloseMatches, type AuditValue, type AuditReport, DriftAggregator } from "@buoy-design/core";
import { extractStyles, extractCssFileStyles } from "@buoy-design/scanners";
import { parseCssValues } from "@buoy-design/core";
import { glob } from "glob";
import { readFile } from "fs/promises";
import type { BuoyConfig } from "../config/schema.js";

export function createShowCommand(): Command {
  const cmd = new Command("show")
    .description("Show design system information")
    .option("--json", "Output as JSON (default)")
    .option("--no-cache", "Disable incremental scanning cache")
;

  // show components [query]
  cmd
    .command("components")
    .description("Show components found in the codebase (with optional search)")
    .argument("[query]", "Search query (component name or partial match)")
    .option("--json", "Output as JSON")
    .option("--prop <propName>", "Search by prop name (e.g., \"onClick\")")
    .option("--pattern <pattern>", "Search by pattern (checks name, props, variants)")
    .option("-n, --limit <number>", "Maximum results to show", "10")
    .action(async (query: string | undefined, options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      const spin = spinner("Scanning components...");

      try {
        const config = await getOrBuildConfig();

        const { result: scanResult } = await withOptionalCache(
          process.cwd(),
          parentOpts.cache !== false,
          async (cache: ScanCache | undefined) => {
            const orchestrator = new ScanOrchestrator(config, process.cwd(), { cache });
            return orchestrator.scanComponents({
              onProgress: (msg) => { spin.text = msg; },
            });
          },
        );

        spin.stop();

        const components = scanResult.components;

        // If no search query/options, list all components
        if (!query && !options.prop && !options.pattern) {
          console.log(JSON.stringify({ components }, null, 2));
          return;
        }

        // Search mode
        let results: Array<{ component: typeof components[0]; score: number; matchType: string }> = [];

        if (options.prop) {
          const lowerProp = options.prop.toLowerCase();
          for (const component of components) {
            const props = component.props || [];
            const matchingProp = props.find((p: { name: string }) => p.name.toLowerCase().includes(lowerProp));
            if (matchingProp) {
              results.push({
                component,
                score: matchingProp.name.toLowerCase() === lowerProp ? 100 : 80,
                matchType: "prop",
              });
            }
          }
        } else if (options.pattern) {
          const lowerPattern = options.pattern.toLowerCase();
          for (const component of components) {
            let score = 0;
            const nameScore = fuzzyScore(options.pattern, component.name);
            if (nameScore > 0) score += nameScore * 0.5;
            const props = component.props || [];
            if (props.some((p: { name: string; type?: string }) =>
              p.name.toLowerCase().includes(lowerPattern) ||
              (p.type && p.type.toLowerCase().includes(lowerPattern))
            )) score += 30;
            const variants = component.variants || [];
            if (variants.some((v: { name: string }) => v.name.toLowerCase().includes(lowerPattern))) score += 20;
            if (score >= 30) {
              results.push({ component, score: Math.min(100, score), matchType: "pattern" });
            }
          }
        } else if (query) {
          for (const component of components) {
            const score = fuzzyScore(query, component.name);
            if (score >= 30) {
              results.push({
                component,
                score,
                matchType: score === 100 ? "exact" : "fuzzy",
              });
            }
          }
        }

        results.sort((a, b) => b.score - a.score);
        const limit = parseInt(options.limit, 10);
        results = results.slice(0, limit);

        if (json) {
          console.log(JSON.stringify({
            query: query || null,
            prop: options.prop || null,
            pattern: options.pattern || null,
            results: results.map(r => ({
              name: r.component.name,
              path: "path" in r.component.source ? r.component.source.path : "unknown",
              props: r.component.props?.map((p: { name: string; type?: string; required?: boolean }) => ({
                name: p.name, type: p.type, required: p.required,
              })),
              variants: r.component.variants?.map((v: { name: string }) => v.name),
              score: Math.round(r.score),
              matchType: r.matchType,
            })),
            totalComponents: components.length,
          }, null, 2));
          return;
        }

        if (results.length === 0) {
          newline();
          info("No matching components found");
          if (query) info("Try a different search term or use --pattern for broader search");
          return;
        }

        newline();
        header(`Found ${results.length} component${results.length === 1 ? "" : "s"}`);
        newline();

        for (const { component, score, matchType } of results) {
          const scoreLabel = matchType === "exact" ? chalk.green("exact")
            : matchType === "prop" ? chalk.cyan("prop match")
            : matchType === "pattern" ? chalk.yellow("pattern")
            : chalk.dim(`${Math.round(score)}%`);
          console.log(`  ${chalk.bold(component.name)} ${scoreLabel}`);
          keyValue("    Path", "path" in component.source ? component.source.path : "unknown");
          const props = component.props || [];
          const propStr = props.length === 0 ? chalk.dim("(no props)") : props.slice(0, 5).map((p: { name: string; required?: boolean; type?: string }) => {
            const req = p.required ? "*" : "";
            const t = p.type ? chalk.dim(`: ${p.type}`) : "";
            return `${p.name}${req}${t}`;
          }).join(", ") + (props.length > 5 ? chalk.dim(` +${props.length - 5} more`) : "");
          keyValue("    Props", propStr);
          const variants = component.variants || [];
          if (variants.length > 0) {
            const variantNames = variants.slice(0, 4).map((v: { name: string }) => v.name).join(", ");
            const more = variants.length > 4 ? chalk.dim(` +${variants.length - 4} more`) : "";
            keyValue("    Variants", variantNames + more);
          }
          newline();
        }

        console.log(chalk.dim("─".repeat(40)));
        info(`${components.length} total components in project`);
        if (results.length === limit) info(`Showing first ${limit} results. Use --limit to see more.`);
      } catch (err) {
        spin.stop();
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // show tokens
  cmd
    .command("tokens")
    .description("Show design tokens found in the codebase")
    .option("--json", "Output as JSON")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      const spin = spinner("Scanning tokens...");

      try {
        const config = await getOrBuildConfig();

        const { result: scanResult } = await withOptionalCache(
          process.cwd(),
          parentOpts.cache !== false,
          async (cache: ScanCache | undefined) => {
            const orchestrator = new ScanOrchestrator(config, process.cwd(), { cache });
            return orchestrator.scanTokens({
              onProgress: (msg) => { spin.text = msg; },
            });
          },
        );

        spin.stop();
        console.log(JSON.stringify({ tokens: scanResult.tokens }, null, 2));
      } catch (err) {
        spin.stop();
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // show drift
  cmd
    .command("drift")
    .description("Show drift signals (design system violations)")
    .option("--json", "Output as JSON")
    .option("--raw", "Output raw signals without grouping")
    .option("-f, --format <type>", "Output format: json, markdown, html, table, tree, agent")
    .option("-S, --severity <level>", "Filter by minimum severity (info, warning, critical)")
    .option("-t, --type <type>", "Filter by drift type")
    .option("-v, --verbose", "Verbose output with full details")
    .option("--include-baseline", "Include baselined drifts (show all)")
    .option("--clear-cache", "Clear cache before scanning")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      const useJson = json && !options.format && !options.verbose;
      if (useJson || options.format === "json" || options.format === "agent") {
        setJsonMode(true);
      }

      const spin = spinner("Analyzing drift...");

      try {
        const { config } = await loadConfig();

        const { result } = await withOptionalCache(
          process.cwd(),
          parentOpts.cache !== false,
          async (cache: ScanCache | undefined) => {
            const service = new DriftAnalysisService(config);
            return service.analyze({
              onProgress: (msg) => { spin.text = msg; },
              includeBaseline: options.includeBaseline ?? false,
              minSeverity: options.severity as Severity | undefined,
              filterType: options.type,
              cache,
            });
          },
          {
            clearCache: options.clearCache,
            onVerbose: options.verbose ? info : undefined,
          },
        );

        const drifts = result.drifts;
        const sourceComponents = result.components;
        const baselinedCount = result.baselinedCount;

        spin.stop();

        // Determine output format
        const format = options.format;

        if (format === "agent") {
          console.log(formatAgent(drifts));
          return;
        }

        if (format === "markdown") {
          console.log(formatMarkdown(drifts));
          return;
        }

        if (format === "html") {
          const htmlContent = formatHtml(drifts, { designerFriendly: true });
          const filename = "drift-report.html";
          writeFileSync(filename, htmlContent);
          success(`HTML report saved to ${filename}`);
          return;
        }

        // Raw mode: output signals without grouping
        if (options.raw) {
          const output = {
            drifts: result.drifts,
            summary: {
              total: result.drifts.length,
              critical: result.drifts.filter((d: DriftSignal) => d.severity === "critical").length,
              warning: result.drifts.filter((d: DriftSignal) => d.severity === "warning").length,
              info: result.drifts.filter((d: DriftSignal) => d.severity === "info").length,
            },
          };
          console.log(JSON.stringify(output, null, 2));
          return;
        }

        // JSON output (explicit --json or --format json)
        if (format === "json" || useJson) {
          // Grouped mode: aggregate signals for actionability
          const aggregationConfig = config.drift?.aggregation ?? {};
          const aggregator = new DriftAggregator({
            strategies: aggregationConfig.strategies,
            minGroupSize: aggregationConfig.minGroupSize,
            pathPatterns: aggregationConfig.pathPatterns,
          });

          const aggregated = aggregator.aggregate(result.drifts);

          const output = {
            groups: aggregated.groups.map(g => ({
              id: g.id,
              strategy: g.groupingKey.strategy,
              key: g.groupingKey.value,
              summary: g.summary,
              count: g.totalCount,
              severity: g.bySeverity,
              representative: {
                type: g.representative.type,
                message: g.representative.message,
                location: g.representative.source.location,
              },
            })),
            ungrouped: aggregated.ungrouped.map(d => ({
              id: d.id,
              type: d.type,
              severity: d.severity,
              message: d.message,
              location: d.source.location,
            })),
            summary: {
              totalSignals: aggregated.totalSignals,
              totalGroups: aggregated.totalGroups,
              ungroupedCount: aggregated.ungrouped.length,
              reductionRatio: Math.round(aggregated.reductionRatio * 10) / 10,
              bySeverity: {
                critical: result.drifts.filter((d: DriftSignal) => d.severity === "critical").length,
                warning: result.drifts.filter((d: DriftSignal) => d.severity === "warning").length,
                info: result.drifts.filter((d: DriftSignal) => d.severity === "info").length,
              },
            },
            baselinedCount,
          };

          console.log(JSON.stringify(output, null, 2));
          return;
        }

        // Human-readable output formats
        const uniqueFiles = new Set(
          drifts.map(d => d.source.location?.split(':')[0] || d.source.entityName)
        );

        if (options.verbose) {
          header("Drift Analysis");
          newline();
          const summary = getSummary(drifts);
          keyValue("Components scanned", String(sourceComponents.length));
          keyValue("Critical", String(summary.critical));
          keyValue("Warning", String(summary.warning));
          keyValue("Info", String(summary.info));
          if (baselinedCount > 0) {
            keyValue("Baselined (hidden)", String(baselinedCount));
          }
          newline();
          console.log(formatDriftList(drifts));
        } else if (format === "table") {
          header("Drift Analysis");
          newline();
          console.log(formatDriftTable(drifts));
        } else {
          // Default: tree view
          newline();
          console.log(formatDriftTree(drifts, uniqueFiles.size));
        }

        // Handle empty results
        if (drifts.length === 0) {
          if (sourceComponents.length === 0) {
            newline();
            info("No components found to analyze.");
            info("To find hardcoded inline styles:");
            info("  " + chalk.cyan("buoy show health") + "  # See all hardcoded values");
          } else {
            const hasTokens = config.sources.tokens?.enabled &&
              (config.sources.tokens.files?.length ?? 0) > 0;
            const hasFigma = config.sources.figma?.enabled;
            const hasStorybook = config.sources.storybook?.enabled;
            const hasDesignTokensFile = existsSync('design-tokens.css') ||
              existsSync('design-tokens.json');

            if (!hasTokens && !hasFigma && !hasStorybook && !hasDesignTokensFile) {
              newline();
              info("No reference source configured.");
              info("Run " + chalk.cyan("buoy build tokens") + " to extract design tokens.");
            }
          }
        }

        // Show upgrade hint when drifts found
        if (drifts.length > 0) {
          const hint = formatUpgradeHint('after-drift-found');
          if (hint) {
            newline();
            console.log(hint);
          }
        }
      } catch (err) {
        spin.stop();
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // show health
  cmd
    .command("health")
    .description("Show design system health score")
    .option("--json", "Output as JSON")
    .option("--tokens <path>", "Path to design tokens file for close-match detection")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json ?? parentOpts.json;
      if (json) setJsonMode(true);

      const spin = spinner("Auditing codebase...");

      try {
        const extractedValues = await extractAllValues(spin);
        spin.stop();

        if (extractedValues.length === 0) {
          if (json) {
            console.log(JSON.stringify({
              score: 100,
              message: "No hardcoded design values found",
              categories: {},
              worstFiles: [],
            }, null, 2));
          } else {
            console.log('');
            console.log(chalk.green.bold('  Health Score: 100/100 (Good)'));
            console.log('');
            console.log(chalk.dim('  No hardcoded design values found.'));
            console.log(chalk.dim('  Your codebase is using design tokens correctly!'));
            console.log('');
          }
          return;
        }

        const report = generateAuditReport(extractedValues);

        // Load design tokens for close-match detection if provided
        if (options.tokens) {
          try {
            const tokenContent = await readFile(options.tokens, "utf-8");
            const tokenData = JSON.parse(tokenContent);
            const colorTokens = extractTokenValues(tokenData, "color");
            const spacingTokens = extractTokenValues(tokenData, "spacing");

            const colorValues = extractedValues
              .filter((v) => v.category === "color")
              .map((v) => v.value);
            const spacingValues = extractedValues
              .filter((v) => v.category === "spacing")
              .map((v) => v.value);

            report.closeMatches = [
              ...findCloseMatches(colorValues, colorTokens, "color"),
              ...findCloseMatches(spacingValues, spacingTokens, "spacing"),
            ];
          } catch {
            // Ignore token loading errors
          }
        }

        if (json) {
          console.log(JSON.stringify({
            score: report.score,
            categories: report.categories,
            worstFiles: report.worstFiles,
            totals: report.totals,
            closeMatches: report.closeMatches,
          }, null, 2));
        } else {
          printHealthReport(report);
        }
      } catch (err) {
        spin.stop();
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // show history
  const historyCmd = cmd
    .command("history")
    .description("Show scan history and trends")
    .argument("[scan-id]", "Show details of a specific scan")
    .option("--json", "Output as JSON")
    .option("-n, --limit <number>", "Number of entries to show", "10")
    .option("-v, --verbose", "Show detailed information")
    .action(async (scanId: string | undefined, options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      try {
        // Import store dynamically to avoid circular deps
        const { createStore, getProjectName } = await import("../store/index.js");

        // If a scan ID was provided, show details for that scan
        if (scanId) {
          const spin = spinner("Loading scan details...");
          const store = createStore({ forceLocal: true });

          const scan = await store.getScan(scanId);
          if (!scan) {
            spin.stop();
            error(`Scan not found: ${scanId}`);
            store.close();
            process.exit(1);
          }

          const components = await store.getComponents(scanId);
          const tokens = await store.getTokens(scanId);
          const drifts = await store.getDriftSignals(scanId);

          spin.stop();

          if (json) {
            console.log(JSON.stringify({
              scan: {
                id: scan.id,
                status: scan.status,
                sources: scan.sources,
                stats: scan.stats,
                startedAt: scan.startedAt,
                completedAt: scan.completedAt,
              },
              components,
              tokens,
              drifts,
            }, null, 2));
            store.close();
            return;
          }

          header(`Scan: ${scan.id}`);
          newline();

          keyValue("Status", scan.status);
          keyValue("Sources", scan.sources.join(", "));
          if (scan.startedAt) {
            keyValue("Started", scan.startedAt.toLocaleString());
          }
          if (scan.completedAt) {
            keyValue("Completed", scan.completedAt.toLocaleString());
          }
          if (scan.stats?.duration) {
            keyValue("Duration", `${(scan.stats.duration / 1000).toFixed(1)}s`);
          }
          newline();

          keyValue("Components", String(components.length));
          keyValue("Tokens", String(tokens.length));
          keyValue("Drift signals", String(drifts.length));

          if (components.length > 0) {
            const componentsWithDrift = new Set(
              drifts.map(d => d.source?.location).filter(Boolean)
            ).size;
            const coveragePercent = Math.round(
              ((components.length - componentsWithDrift) / components.length) * 100
            );
            const coverageColor = coveragePercent >= 80 ? chalk.green : coveragePercent >= 50 ? chalk.yellow : chalk.red;
            keyValue("Coverage", coverageColor(`${coveragePercent}%`));
          }

          newline();

          if (drifts.length > 0) {
            const critical = drifts.filter((d) => d.severity === "critical").length;
            const warning = drifts.filter((d) => d.severity === "warning").length;
            const infoCount = drifts.filter((d) => d.severity === "info").length;

            console.log(chalk.bold("Drift Breakdown"));
            console.log(
              `  ${chalk.red("Critical:")} ${critical}  ` +
                `${chalk.yellow("Warning:")} ${warning}  ` +
                `${chalk.blue("Info:")} ${infoCount}`
            );
          }

          store.close();
          return;
        }

        // Default: list all scans
        const spin = spinner("Loading scan history...");
        const store = createStore({ forceLocal: true });
        const projectName = getProjectName();

        try {
          const project = await store.getOrCreateProject(projectName);
          const limit = parseInt(options.limit, 10) || 10;

          const scans = await store.getScans(project.id, limit);
          const snapshots = await store.getSnapshots(project.id, limit);

          spin.stop();

          if (json) {
            console.log(JSON.stringify({
              project: {
                id: project.id,
                name: project.name,
              },
              scans: scans.map((s) => ({
                id: s.id,
                status: s.status,
                sources: s.sources,
                stats: s.stats,
                startedAt: s.startedAt,
                completedAt: s.completedAt,
              })),
              snapshots: snapshots.map((s) => ({
                scanId: s.scanId,
                componentCount: s.componentCount,
                tokenCount: s.tokenCount,
                driftCount: s.driftCount,
                summary: s.summary,
                createdAt: s.createdAt,
              })),
            }, null, 2));
            store.close();
            return;
          }

          header("Scan History");
          newline();

          keyValue("Project", project.name);
          keyValue("Total scans", String(scans.length));
          newline();

          if (scans.length === 0) {
            info("No scans recorded yet. Run " + chalk.cyan("buoy show all") + " to start tracking.");
            store.close();
            return;
          }

          // Display scans in a table format
          console.log(
            chalk.dim("ID".padEnd(15)) +
              chalk.dim("Status".padEnd(12)) +
              chalk.dim("Components".padEnd(12)) +
              chalk.dim("Drift".padEnd(8)) +
              chalk.dim("Coverage".padEnd(10)) +
              chalk.dim("Date")
          );
          console.log(chalk.dim("─".repeat(70)));

          for (const scan of scans) {
            const snapshot = snapshots.find((s) => s.scanId === scan.id);
            const statusColor =
              scan.status === "completed"
                ? chalk.green
                : scan.status === "failed"
                ? chalk.red
                : chalk.yellow;

            const date = scan.completedAt || scan.startedAt || scan.createdAt;
            const dateStr = date ? formatRelativeDate(date) : "—";

            const compCount = snapshot?.componentCount ?? scan.stats?.componentCount ?? "—";
            const driftCount = snapshot?.driftCount ?? scan.stats?.driftCount ?? "—";
            const coverage = snapshot?.coverageScore != null
              ? `${snapshot.coverageScore}%`
              : "—";

            console.log(
              chalk.cyan(scan.id.padEnd(15)) +
                statusColor(scan.status.padEnd(12)) +
                String(compCount).padEnd(12) +
                String(driftCount).padEnd(8) +
                coverage.padEnd(10) +
                chalk.dim(dateStr)
            );

            if (options.verbose && snapshot) {
              console.log(
                chalk.dim("  ") +
                  `Critical: ${snapshot.summary.critical}, ` +
                  `Warning: ${snapshot.summary.warning}, ` +
                  `Info: ${snapshot.summary.info}`
              );
              if (snapshot.summary.frameworks?.length > 0) {
                console.log(
                  chalk.dim("  Frameworks: ") +
                    snapshot.summary.frameworks.join(", ")
                );
              }
            }
          }

          newline();

          // Show trend summary
          if (snapshots.length >= 2) {
            const latest = snapshots[0]!;
            const previous = snapshots[1]!;

            const driftDelta = latest.driftCount - previous.driftCount;
            const compDelta = latest.componentCount - previous.componentCount;

            console.log(chalk.bold("Trend Summary"));
            console.log(chalk.dim("─".repeat(30)));

            if (driftDelta > 0) {
              console.log(`Drift: ${chalk.red("+" + driftDelta)} since last scan`);
            } else if (driftDelta < 0) {
              console.log(`Drift: ${chalk.green(driftDelta)} since last scan`);
            } else {
              console.log(`Drift: ${chalk.dim("no change")}`);
            }

            if (compDelta > 0) {
              console.log(`Components: ${chalk.green("+" + compDelta)} since last scan`);
            } else if (compDelta < 0) {
              console.log(`Components: ${chalk.red(compDelta)} since last scan`);
            } else {
              console.log(`Components: ${chalk.dim("no change")}`);
            }

            if (latest.coverageScore != null && previous.coverageScore != null) {
              const covDelta = latest.coverageScore - previous.coverageScore;
              if (covDelta > 0) {
                console.log(`Coverage: ${chalk.green("+" + covDelta + "%")} since last scan`);
              } else if (covDelta < 0) {
                console.log(`Coverage: ${chalk.red(covDelta + "%")} since last scan`);
              } else {
                console.log(`Coverage: ${chalk.dim("no change")}`);
              }
            }
          }

          store.close();
        } catch (storeErr) {
          spin.stop();
          store.close();
          const msg = storeErr instanceof Error ? storeErr.message : String(storeErr);
          error(`Failed to load history: ${msg}`);
          info("Run " + chalk.cyan("buoy show all") + " first to start tracking history.");
          process.exit(1);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // show history compare <scan1> <scan2>
  historyCmd
    .command("compare <scan1> <scan2>")
    .description("Compare two scans")
    .option("--json", "Output as JSON")
    .action(async (scan1: string, scan2: string, options) => {
      if (options.json) {
        setJsonMode(true);
      }
      const spin = spinner("Comparing scans...");

      try {
        const { createStore } = await import("../store/index.js");
        const store = createStore({ forceLocal: true });

        const diff = await store.compareScan(scan1, scan2);

        spin.stop();

        if (options.json) {
          console.log(JSON.stringify(diff, null, 2));
          store.close();
          return;
        }

        header(`Comparing ${scan1} → ${scan2}`);
        newline();

        console.log(chalk.bold("Components"));
        console.log(
          `  ${chalk.green("Added:")} ${diff.added.components.length}  ` +
            `${chalk.red("Removed:")} ${diff.removed.components.length}  ` +
            `${chalk.yellow("Modified:")} ${diff.modified.components.length}`
        );

        if (diff.added.components.length > 0) {
          console.log(chalk.green("  + ") + diff.added.components.map((c: { name: string }) => c.name).join(", "));
        }
        if (diff.removed.components.length > 0) {
          console.log(chalk.red("  - ") + diff.removed.components.map((c: { name: string }) => c.name).join(", "));
        }

        newline();

        console.log(chalk.bold("Tokens"));
        console.log(
          `  ${chalk.green("Added:")} ${diff.added.tokens.length}  ` +
            `${chalk.red("Removed:")} ${diff.removed.tokens.length}  ` +
            `${chalk.yellow("Modified:")} ${diff.modified.tokens.length}`
        );

        newline();

        console.log(chalk.bold("Drift Signals"));
        console.log(
          `  ${chalk.green("New:")} ${diff.added.drifts.length}  ` +
            `${chalk.red("Resolved:")} ${diff.removed.drifts.length}`
        );

        if (diff.added.drifts.length > 0) {
          newline();
          console.log(chalk.yellow("New drift signals:"));
          for (const d of diff.added.drifts.slice(0, 5)) {
            console.log(`  ${d.severity === "critical" ? chalk.red("!") : chalk.yellow("~")} ${d.message}`);
          }
          if (diff.added.drifts.length > 5) {
            console.log(chalk.dim(`  ... and ${diff.added.drifts.length - 5} more`));
          }
        }

        newline();
        console.log(chalk.bold("Summary"));
        if (diff.removed.drifts.length > 0) {
          console.log(`  ${chalk.green("\u2193")} ${diff.removed.drifts.length} issues resolved`);
        }
        if (diff.added.drifts.length > 0) {
          console.log(`  ${chalk.red("\u2191")} ${diff.added.drifts.length} new issues introduced`);
        }

        store.close();
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Compare failed: ${message}`);
        process.exit(1);
      }
    });

  // show all
  cmd
    .command("all")
    .description("Show everything: components, tokens, drift, and health")
    .option("--json", "Output as JSON")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      const spin = spinner("Gathering design system data...");

      try {
        const config = await getOrBuildConfig();

        const { result: allResults } = await withOptionalCache(
          process.cwd(),
          parentOpts.cache !== false,
          async (cache: ScanCache | undefined) => {
            // Scan components and tokens
            spin.text = "Scanning components and tokens...";
            const orchestrator = new ScanOrchestrator(config, process.cwd(), { cache });
            const scanResult = await orchestrator.scan({
              onProgress: (msg) => { spin.text = msg; },
            });

            // Analyze drift
            spin.text = "Analyzing drift...";
            const service = new DriftAnalysisService(config);
            const driftResult = await service.analyze({
              onProgress: (msg) => { spin.text = msg; },
              includeBaseline: false,
              cache,
            });

            return { scanResult, driftResult };
          },
        );

        // Calculate health (doesn't need cache)
        spin.text = "Calculating health score...";
        const extractedValues = await extractAllValues(spin);
        const healthReport = extractedValues.length > 0
          ? generateAuditReport(extractedValues)
          : { score: 100, categories: {}, worstFiles: [], totals: { uniqueValues: 0, totalUsages: 0, filesAffected: 0 } };

        const { scanResult, driftResult } = allResults;
        spin.stop();

        // Aggregate drift signals
        const aggregationConfig = config.drift?.aggregation ?? {};
        const aggregator = new DriftAggregator({
          strategies: aggregationConfig.strategies,
          minGroupSize: aggregationConfig.minGroupSize,
          pathPatterns: aggregationConfig.pathPatterns,
        });
        const aggregated = aggregator.aggregate(driftResult.drifts);

        const output = {
          components: scanResult.components,
          tokens: scanResult.tokens,
          drift: {
            groups: aggregated.groups.map(g => ({
              id: g.id,
              strategy: g.groupingKey.strategy,
              key: g.groupingKey.value,
              summary: g.summary,
              count: g.totalCount,
              severity: g.bySeverity,
            })),
            ungrouped: aggregated.ungrouped.length,
            summary: {
              totalSignals: aggregated.totalSignals,
              totalGroups: aggregated.totalGroups,
              reductionRatio: Math.round(aggregated.reductionRatio * 10) / 10,
              bySeverity: {
                critical: driftResult.drifts.filter((d: DriftSignal) => d.severity === "critical").length,
                warning: driftResult.drifts.filter((d: DriftSignal) => d.severity === "warning").length,
                info: driftResult.drifts.filter((d: DriftSignal) => d.severity === "info").length,
              },
            },
          },
          health: {
            score: healthReport.score,
            categories: healthReport.categories,
            worstFiles: healthReport.worstFiles.slice(0, 5),
          },
        };

        console.log(JSON.stringify(output, null, 2));
      } catch (err) {
        spin.stop();
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  return cmd;
}

// Helper: Load or auto-build config
async function getOrBuildConfig(): Promise<BuoyConfig> {
  const existingConfigPath = getConfigPath();
  if (existingConfigPath) {
    const { config } = await loadConfig();
    return config;
  }
  const autoResult = await buildAutoConfig(process.cwd());
  return autoResult.config;
}

// Helper: Extract all hardcoded values for health audit
async function extractAllValues(spin: { text: string }): Promise<AuditValue[]> {
  const cwd = process.cwd();

  spin.text = "Finding source files...";
  const patterns = [
    "**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.svelte",
    "**/*.css", "**/*.scss",
  ];
  const ignore = [
    "**/node_modules/**", "**/dist/**", "**/build/**",
    "**/*.min.css", "**/*.test.*", "**/*.spec.*", "**/*.stories.*",
  ];

  const files: string[] = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, { cwd, ignore, absolute: true });
    files.push(...matches);
  }

  if (files.length === 0) return [];

  spin.text = `Scanning ${files.length} files...`;
  const extractedValues: AuditValue[] = [];

  for (const filePath of files) {
    try {
      const content = await readFile(filePath, "utf-8");
      const relativePath = filePath.replace(cwd + "/", "");
      const ext = filePath.split(".").pop()?.toLowerCase();
      const isCss = ext === "css" || ext === "scss";

      const styles = isCss
        ? extractCssFileStyles(content)
        : extractStyles(content, ext === "vue" ? "vue" : ext === "svelte" ? "svelte" : "react");

      for (const style of styles) {
        const { values } = parseCssValues(style.css);
        for (const v of values) {
          extractedValues.push({
            category: mapCategory(v.property),
            value: v.value,
            file: relativePath,
            line: 1,
          });
        }
      }
    } catch {
      // Skip files that can't be processed
    }
  }

  return extractedValues;
}

function mapCategory(property: string): AuditValue["category"] {
  const colorProps = ["color", "background", "background-color", "border-color", "fill", "stroke"];
  const spacingProps = ["padding", "margin", "gap", "top", "right", "bottom", "left", "width", "height"];
  const radiusProps = ["border-radius"];
  const typographyProps = ["font-size", "line-height", "font-weight", "font-family"];

  const propLower = property.toLowerCase();

  if (colorProps.some(p => propLower.includes(p))) return "color";
  if (radiusProps.some(p => propLower.includes(p))) return "radius";
  if (typographyProps.some(p => propLower.includes(p))) return "typography";
  if (spacingProps.some(p => propLower.includes(p))) return "spacing";

  return "spacing";
}

function getSummary(drifts: DriftSignal[]): {
  critical: number;
  warning: number;
  info: number;
} {
  return {
    critical: drifts.filter((d) => d.severity === "critical").length,
    warning: drifts.filter((d) => d.severity === "warning").length,
    info: drifts.filter((d) => d.severity === "info").length,
  };
}

function printHealthReport(report: AuditReport): void {
  newline();
  header("Design System Health Report");
  newline();

  const scoreColor =
    report.score >= 80 ? chalk.green :
    report.score >= 50 ? chalk.yellow :
    chalk.red;

  const scoreLabel =
    report.score >= 80 ? "Good" :
    report.score >= 50 ? "Fair" :
    report.score < 30 ? "Poor" : "Needs Work";

  console.log(`Overall Score: ${scoreColor.bold(`${report.score}/100`)} (${scoreLabel})`);
  newline();

  // Category breakdown
  for (const [category, stats] of Object.entries(report.categories)) {
    const expected = getExpectedCount(category);
    const drift = stats.uniqueCount - expected;
    const driftColor = drift > 5 ? chalk.red : drift > 0 ? chalk.yellow : chalk.green;

    console.log(chalk.bold(capitalize(category)));
    keyValue("  Found", `${stats.uniqueCount} unique values`);
    keyValue("  Expected", `~${expected}`);
    if (drift > 0) {
      keyValue("  Drift", driftColor(`+${drift} extra values`));
    }

    if (stats.mostCommon.length > 0) {
      console.log(chalk.dim("  Most common:"));
      for (const { value, count } of stats.mostCommon.slice(0, 3)) {
        console.log(chalk.dim(`    ${value}  (${count} usages)`));
      }
    }
    newline();
  }

  // Close matches (typos)
  if (report.closeMatches.length > 0) {
    console.log(chalk.bold.yellow("Possible Typos"));
    for (const match of report.closeMatches.slice(0, 5)) {
      console.log(`  ${chalk.yellow("⚠")} ${match.value} → close to ${chalk.cyan(match.closeTo)}`);
    }
    if (report.closeMatches.length > 5) {
      console.log(chalk.dim(`  ... and ${report.closeMatches.length - 5} more`));
    }
    newline();
  }

  // Worst files
  if (report.worstFiles.length > 0) {
    console.log(chalk.bold("Worst Offenders"));
    for (const { file, issueCount } of report.worstFiles.slice(0, 5)) {
      console.log(`  ${chalk.red(issueCount.toString().padStart(3))} issues  ${file}`);
    }
    newline();
  }

  // Summary
  console.log(chalk.dim("─".repeat(50)));
  keyValue("Total unique values", String(report.totals.uniqueValues));
  keyValue("Total usages", String(report.totals.totalUsages));
  keyValue("Files affected", String(report.totals.filesAffected));
  newline();

  if (report.score < 50) {
    console.log(chalk.yellow("Run `buoy show drift` for detailed fixes."));
  }

  // Show upgrade hint after health score
  const hint = formatUpgradeHint("after-health-score");
  if (hint) {
    console.log(hint);
    console.log("");
  }
}

function extractTokenValues(tokenData: Record<string, unknown>, _category: string): string[] {
  const values: string[] = [];

  function traverse(obj: unknown): void {
    if (typeof obj !== "object" || obj === null) return;

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === "$value" || key === "value") {
        if (typeof value === "string") {
          values.push(value);
        }
      } else if (typeof value === "object") {
        traverse(value);
      }
    }
  }

  traverse(tokenData);
  return values;
}

function getExpectedCount(category: string): number {
  const expected: Record<string, number> = {
    color: 12,
    spacing: 8,
    typography: 6,
    radius: 4,
  };
  return expected[category] || 10;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (q === t) return 100;

  if (t.includes(q)) {
    const bonus = q.length / t.length * 50;
    return 70 + bonus;
  }

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

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return date.toLocaleDateString();
  } else if (days > 0) {
    return `${days}d ago`;
  } else if (hours > 0) {
    return `${hours}h ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  } else {
    return "just now";
  }
}
