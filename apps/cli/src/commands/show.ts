import { Command, Option } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync, readdirSync } from "fs";
import { writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
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
import { calculateHealthScorePillar, type HealthMetrics, type HealthScoreResult, DriftAggregator } from "@buoy-design/core";
import type { BuoyConfig } from "../config/schema.js";
import { detectHookSystem } from "../hooks/index.js";
import {
  detectFrameworks,
  BUILTIN_SCANNERS,
  PLUGIN_INFO,
} from "../detect/frameworks.js";

// Design system library names detected by detectFrameworks()
const DS_LIBRARY_NAMES = [
  "mui", "chakra", "mantine", "ant-design", "radix",
  "headlessui", "fluentui", "nextui", "primereact",
  "ariakit", "vuetify", "element-plus", "naive-ui", "bootstrap",
];

// Utility/styling framework names
const UTILITY_FRAMEWORK_NAMES = [
  "tailwind", "styled-components", "emotion", "stitches",
];

// DS libraries that include their own styling systems
const DS_WITH_STYLING = ["chakra", "mantine", "mui"];

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
    .addOption(new Option("-S, --severity <level>", "Filter by minimum severity").choices(["info", "warning", "critical"]))
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
              info("Run " + chalk.cyan("buoy dock tokens") + " to extract design tokens.");
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
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json ?? parentOpts.json;
      if (json) setJsonMode(true);

      const spin = spinner("Analyzing design system health...");

      try {
        const config = await getOrBuildConfig();

        // Gather all health metrics from drift analysis
        const healthMetrics = await gatherHealthMetrics(config, spin, parentOpts.cache !== false);

        spin.stop();

        const result = calculateHealthScorePillar(healthMetrics);

        if (json) {
          console.log(JSON.stringify({
            score: result.score,
            tier: result.tier,
            pillars: {
              valueDiscipline: { score: result.pillars.valueDiscipline.score, max: 60 },
              tokenHealth: { score: result.pillars.tokenHealth.score, max: 20 },
              consistency: { score: result.pillars.consistency.score, max: 10 },
              criticalIssues: { score: result.pillars.criticalIssues.score, max: 10 },
            },
            suggestions: result.suggestions,
            metrics: result.metrics,
          }, null, 2));
        } else {
          printPillarHealthReport(result);
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

  // show config
  cmd
    .command("config")
    .description("Show current .buoy.yaml configuration")
    .option("--json", "Output as JSON")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      const configPath = getConfigPath();

      if (!configPath) {
        if (json) {
          console.log(JSON.stringify({ exists: false, path: null }, null, 2));
        } else {
          info("No config found. Run " + chalk.cyan("buoy dock config") + " to create .buoy.yaml.");
        }
        return;
      }

      try {
        const { config } = await loadConfig();

        if (json) {
          console.log(JSON.stringify({ exists: true, path: configPath, config }, null, 2));
        } else {
          header("Configuration");
          newline();
          keyValue("Path", configPath);
          if (config.project?.name) keyValue("Project", config.project.name);
          newline();

          // Show enabled sources
          if (config.sources) {
            header("Sources");
            for (const [key, source] of Object.entries(config.sources)) {
              if (source && typeof source === "object" && "enabled" in source) {
                const enabled = (source as { enabled: boolean }).enabled;
                const status = enabled ? chalk.green("enabled") : chalk.dim("disabled");
                keyValue(`  ${key}`, status);
              }
            }
          }
          newline();
        }
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // show skills
  cmd
    .command("skills")
    .description("Show AI agent skill files")
    .option("--json", "Output as JSON")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      const cwd = process.cwd();
      const skillsDir = join(cwd, ".claude", "skills", "design-system");

      if (!existsSync(skillsDir)) {
        if (json) {
          console.log(JSON.stringify({ exists: false, path: skillsDir, files: [] }, null, 2));
        } else {
          info("No skills found. Run " + chalk.cyan("buoy dock skills") + " to create AI agent skills.");
        }
        return;
      }

      try {
        const files = walkDir(skillsDir);

        if (json) {
          console.log(JSON.stringify({
            exists: true,
            path: skillsDir,
            fileCount: files.length,
            files: files.map(f => f.replace(cwd + "/", "")),
          }, null, 2));
        } else {
          header("Design System Skills");
          newline();
          keyValue("Path", skillsDir.replace(cwd + "/", ""));
          keyValue("Files", String(files.length));
          newline();
          for (const file of files) {
            console.log(`  ${chalk.green("•")} ${file.replace(cwd + "/", "")}`);
          }
          newline();
        }
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // show agents
  cmd
    .command("agents")
    .description("Show configured AI agents and commands")
    .option("--json", "Output as JSON")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      const cwd = process.cwd();
      const agentsDir = join(cwd, ".claude", "agents");
      const commandsDir = join(cwd, ".claude", "commands");

      const hasAgents = existsSync(agentsDir) && readdirSync(agentsDir).some(f => f.endsWith(".md"));
      const hasCommands = existsSync(commandsDir) && readdirSync(commandsDir).some(f => f.endsWith(".md"));

      if (!hasAgents && !hasCommands) {
        if (json) {
          console.log(JSON.stringify({ exists: false, agents: [], commands: [] }, null, 2));
        } else {
          info("No agents configured. Run " + chalk.cyan("buoy dock agents") + " to set up AI agents.");
        }
        return;
      }

      const agents = hasAgents
        ? readdirSync(agentsDir).filter(f => f.endsWith(".md")).map(f => ({
            name: f.replace(".md", ""),
            path: join(".claude", "agents", f),
          }))
        : [];

      const commands = hasCommands
        ? readdirSync(commandsDir).filter(f => f.endsWith(".md")).map(f => ({
            name: f.replace(".md", ""),
            path: join(".claude", "commands", f),
          }))
        : [];

      if (json) {
        console.log(JSON.stringify({ exists: true, agents, commands }, null, 2));
      } else {
        if (agents.length > 0) {
          header("Agents");
          newline();
          for (const agent of agents) {
            console.log(`  ${chalk.green("•")} ${agent.name}  ${chalk.dim(agent.path)}`);
          }
          newline();
        }
        if (commands.length > 0) {
          header("Commands");
          newline();
          for (const cmd of commands) {
            console.log(`  ${chalk.green("•")} /${cmd.name}  ${chalk.dim(cmd.path)}`);
          }
          newline();
        }
      }
    });

  // show context
  cmd
    .command("context")
    .description("Show design system context in CLAUDE.md")
    .option("--json", "Output as JSON")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      const cwd = process.cwd();
      const claudeMdPath = join(cwd, "CLAUDE.md");

      if (!existsSync(claudeMdPath)) {
        if (json) {
          console.log(JSON.stringify({ exists: false, path: claudeMdPath }, null, 2));
        } else {
          info("No design system context in CLAUDE.md. Run " + chalk.cyan("buoy dock context") + " to generate it.");
        }
        return;
      }

      const content = readFileSync(claudeMdPath, "utf-8");
      const sectionMatch = content.match(/^##?\s*Design\s*System\b.*$/m);

      if (!sectionMatch) {
        if (json) {
          console.log(JSON.stringify({ exists: false, path: claudeMdPath, hasSection: false }, null, 2));
        } else {
          info("No design system context in CLAUDE.md. Run " + chalk.cyan("buoy dock context") + " to generate it.");
        }
        return;
      }

      // Extract section content between ## Design System and next ## header
      const sectionStart = content.indexOf(sectionMatch[0]);
      const afterHeader = content.slice(sectionStart + sectionMatch[0].length);
      const nextHeaderMatch = afterHeader.match(/\n##?\s+[^\n]/);
      const sectionContent = nextHeaderMatch
        ? afterHeader.slice(0, nextHeaderMatch.index!)
        : afterHeader;

      const sectionLines = sectionContent.trim().split("\n").length;
      const sectionWords = sectionContent.trim().split(/\s+/).length;

      if (json) {
        console.log(JSON.stringify({
          exists: true,
          path: claudeMdPath,
          hasSection: true,
          sectionLines,
          sectionWords,
        }, null, 2));
      } else {
        header("Design System Context");
        newline();
        keyValue("Path", "CLAUDE.md");
        keyValue("Lines", String(sectionLines));
        keyValue("Words", String(sectionWords));
        newline();
        // Show preview (first 5 lines)
        const preview = sectionContent.trim().split("\n").slice(0, 5);
        for (const line of preview) {
          console.log(chalk.dim(`  ${line}`));
        }
        if (sectionLines > 5) {
          console.log(chalk.dim(`  ... ${sectionLines - 5} more lines`));
        }
        newline();
      }
    });

  // show hooks
  cmd
    .command("hooks")
    .description("Show configured hooks for drift checking")
    .option("--json", "Output as JSON")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      const cwd = process.cwd();

      // Detect git hook system
      const hookSystem = detectHookSystem(cwd);

      // Check for buoy in the hook
      let gitHookInstalled = false;
      let gitHookPath: string | null = null;

      if (hookSystem === "husky") {
        gitHookPath = join(cwd, ".husky", "pre-commit");
      } else if (hookSystem === "pre-commit") {
        gitHookPath = join(cwd, ".pre-commit-config.yaml");
      } else if (hookSystem === "git") {
        gitHookPath = join(cwd, ".git", "hooks", "pre-commit");
      }

      if (gitHookPath && existsSync(gitHookPath)) {
        try {
          const hookContent = readFileSync(gitHookPath, "utf-8");
          gitHookInstalled = hookContent.includes("buoy");
        } catch {
          // Ignore read errors
        }
      }

      // Check for Claude hooks
      const claudeSettingsPath = join(cwd, ".claude", "settings.local.json");
      let claudeHooksEnabled = false;
      let claudeEvents: string[] = [];

      if (existsSync(claudeSettingsPath)) {
        try {
          const settings = JSON.parse(readFileSync(claudeSettingsPath, "utf-8"));
          const hooks = settings.hooks;
          if (hooks) {
            if (hooks.SessionStart?.some((h: { hooks?: Array<{ command?: string }> }) =>
              h.hooks?.some(hk => hk.command?.includes("buoy") || hk.command?.includes("Design system"))
            )) {
              claudeHooksEnabled = true;
              claudeEvents.push("SessionStart");
            }
            if (hooks.PostToolUse?.some((h: { hooks?: Array<{ command?: string }> }) =>
              h.hooks?.some(hk => hk.command?.includes("buoy"))
            )) {
              claudeHooksEnabled = true;
              claudeEvents.push("PostToolUse");
            }
          }
        } catch {
          // Ignore parse errors
        }
      }

      if (!gitHookInstalled && !claudeHooksEnabled) {
        if (json) {
          console.log(JSON.stringify({
            gitHooks: { type: hookSystem, installed: false },
            claudeHooks: { enabled: false, events: [] },
          }, null, 2));
        } else {
          info("No hooks configured. Run " + chalk.cyan("buoy dock hooks") + " to set up drift checking.");
        }
        return;
      }

      if (json) {
        console.log(JSON.stringify({
          gitHooks: { type: hookSystem, path: gitHookPath, installed: gitHookInstalled },
          claudeHooks: { enabled: claudeHooksEnabled, events: claudeEvents },
        }, null, 2));
      } else {
        header("Hooks");
        newline();
        if (gitHookInstalled) {
          console.log(`  ${chalk.green("✓")} Git pre-commit hook (${hookSystem})`);
          if (gitHookPath) keyValue("    Path", gitHookPath.replace(cwd + "/", ""));
        } else {
          console.log(`  ${chalk.dim("○")} Git pre-commit hook not installed`);
        }
        if (claudeHooksEnabled) {
          console.log(`  ${chalk.green("✓")} Claude Code hooks`);
          keyValue("    Events", claudeEvents.join(", "));
        } else {
          console.log(`  ${chalk.dim("○")} Claude Code hooks not configured`);
        }
        newline();
      }
    });

  // show commands
  cmd
    .command("commands")
    .description("Show installed slash commands")
    .option("--json", "Output as JSON")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      const commandsDir = join(homedir(), ".claude", "commands");

      if (!existsSync(commandsDir)) {
        if (json) {
          console.log(JSON.stringify({ commands: [] }, null, 2));
        } else {
          info("No slash commands installed. Run " + chalk.cyan("buoy dock commands install") + " to set them up.");
        }
        return;
      }

      const buoyCommands = readdirSync(commandsDir)
        .filter(f => f.endsWith(".md"))
        .map(f => ({
          name: f.replace(".md", ""),
          installed: true,
        }));

      if (buoyCommands.length === 0) {
        if (json) {
          console.log(JSON.stringify({ commands: [] }, null, 2));
        } else {
          info("No slash commands installed. Run " + chalk.cyan("buoy dock commands install") + " to set them up.");
        }
        return;
      }

      if (json) {
        console.log(JSON.stringify({ commands: buoyCommands }, null, 2));
      } else {
        header("Slash Commands");
        newline();
        for (const cmd of buoyCommands) {
          console.log(`  ${chalk.green("✓")} /${cmd.name}`);
        }
        newline();
      }
    });

  // show graph
  cmd
    .command("graph")
    .description("Show knowledge graph statistics")
    .option("--json", "Output as JSON")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      const cwd = process.cwd();
      const graphPath = join(cwd, ".buoy", "graph.json");

      if (!existsSync(graphPath)) {
        if (json) {
          console.log(JSON.stringify({ exists: false }, null, 2));
        } else {
          info("No knowledge graph built. Run " + chalk.cyan("buoy dock graph") + " to build it.");
        }
        return;
      }

      try {
        const { importFromJSON, getGraphStats } = await import("@buoy-design/core");
        const graphData = JSON.parse(readFileSync(graphPath, "utf-8"));
        const graph = importFromJSON(graphData);
        const stats = getGraphStats(graph);

        if (json) {
          console.log(JSON.stringify({
            exists: true,
            path: graphPath,
            nodes: stats.nodeCount,
            edges: stats.edgeCount,
            nodesByType: stats.nodesByType,
            edgesByType: stats.edgesByType,
          }, null, 2));
        } else {
          header("Knowledge Graph");
          newline();
          keyValue("Path", ".buoy/graph.json");
          keyValue("Nodes", String(stats.nodeCount));
          keyValue("Edges", String(stats.edgeCount));
          newline();

          if (Object.keys(stats.nodesByType).length > 0) {
            header("Nodes by Type");
            for (const [type, count] of Object.entries(stats.nodesByType)) {
              keyValue(`  ${type}`, String(count));
            }
            newline();
          }
        }
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // show plugins
  cmd
    .command("plugins")
    .description("Show available scanners and plugins")
    .option("--json", "Output as JSON")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      const cwd = process.cwd();
      const detected = await detectFrameworks(cwd);

      const builtIn = Object.entries(BUILTIN_SCANNERS).map(([key, info]) => ({
        key,
        description: info.description,
        detects: info.detects,
      }));

      const optional = Object.entries(PLUGIN_INFO).map(([key, info]) => ({
        key,
        name: info.name,
        description: info.description,
      }));

      if (json) {
        console.log(JSON.stringify({
          builtIn,
          detected: detected.map(fw => ({
            name: fw.name,
            scanner: fw.scanner,
            plugin: fw.plugin,
            confidence: fw.confidence,
          })),
          optional,
        }, null, 2));
      } else {
        header("Built-in Scanners");
        newline();
        for (const scanner of builtIn) {
          console.log(`  ${chalk.green("✓")} ${chalk.cyan(scanner.description)}`);
          console.log(`    ${chalk.dim(`Detects: ${scanner.detects}`)}`);
        }
        newline();

        if (detected.length > 0) {
          header("Detected Frameworks");
          newline();
          for (const fw of detected) {
            console.log(`  ${chalk.green("•")} ${fw.name} ${chalk.dim(`(${fw.confidence})`)}`);
          }
          newline();
        }

        if (optional.length > 0) {
          header("Optional Plugins");
          newline();
          for (const plugin of optional) {
            console.log(`  ${chalk.dim("○")} ${chalk.cyan(plugin.name)}`);
            console.log(`    ${chalk.dim(plugin.description)}`);
          }
          newline();
        }
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

        const { scanResult, driftResult } = allResults;

        // Calculate health using 4-pillar system
        spin.text = "Calculating health score...";
        const drifts = driftResult.drifts;
        const detected = await detectFrameworks(process.cwd());

        const richContext = computeRichSuggestionContext(drifts);
        const healthMetrics: HealthMetrics = {
          componentCount: scanResult.components.length,
          tokenCount: scanResult.tokens.length,
          hardcodedValueCount: drifts.filter(d => d.type === "hardcoded-value").length,
          unusedTokenCount: drifts.filter(d => d.type === "unused-token").length,
          namingInconsistencyCount: drifts.filter(d => d.type === "naming-inconsistency").length,
          criticalCount: drifts.filter(d => d.severity === "critical").length,
          hasUtilityFramework: detected.some(f => UTILITY_FRAMEWORK_NAMES.includes(f.name))
            || detected.some(f => DS_WITH_STYLING.includes(f.name)),
          hasDesignSystemLibrary: detected.some(f => DS_LIBRARY_NAMES.includes(f.name)),
          totalDriftCount: drifts.length,
          topHardcodedColor: richContext.topHardcodedColor,
          worstFile: richContext.worstFile,
          uniqueSpacingValues: richContext.uniqueSpacingValues,
        };
        const healthResult = calculateHealthScorePillar(healthMetrics);

        spin.stop();

        // Aggregate drift signals
        const aggregationConfig = config.drift?.aggregation ?? {};
        const aggregator = new DriftAggregator({
          strategies: aggregationConfig.strategies,
          minGroupSize: aggregationConfig.minGroupSize,
          pathPatterns: aggregationConfig.pathPatterns,
        });
        const aggregated = aggregator.aggregate(driftResult.drifts);

        // Gather setup status
        const cwd = process.cwd();
        const setup = getSetupStatus(cwd);

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
            score: healthResult.score,
            tier: healthResult.tier,
            pillars: {
              valueDiscipline: { score: healthResult.pillars.valueDiscipline.score, max: 60 },
              tokenHealth: { score: healthResult.pillars.tokenHealth.score, max: 20 },
              consistency: { score: healthResult.pillars.consistency.score, max: 10 },
              criticalIssues: { score: healthResult.pillars.criticalIssues.score, max: 10 },
            },
            suggestions: healthResult.suggestions,
          },
          setup,
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

// Helper: Get setup status for all dock tools
function getSetupStatus(cwd: string): Record<string, unknown> {
  const hasConfig = !!getConfigPath();
  const hasSkills = existsSync(join(cwd, ".claude", "skills", "design-system"));
  const agentsDir = join(cwd, ".claude", "agents");
  const hasAgents = existsSync(agentsDir) && readdirSync(agentsDir).some(f => f.endsWith(".md"));

  // Check CLAUDE.md for Design System section
  const claudeMdPath = join(cwd, "CLAUDE.md");
  let hasContext = false;
  if (existsSync(claudeMdPath)) {
    try {
      const content = readFileSync(claudeMdPath, "utf-8");
      hasContext = /^##?\s*Design\s*System/m.test(content);
    } catch {
      // Ignore read errors
    }
  }

  // Check hooks
  const hookSystem = detectHookSystem(cwd);
  let gitHookInstalled = false;
  if (hookSystem === "husky") {
    const p = join(cwd, ".husky", "pre-commit");
    if (existsSync(p)) {
      try { gitHookInstalled = readFileSync(p, "utf-8").includes("buoy"); } catch { /* skip */ }
    }
  } else if (hookSystem === "git") {
    const p = join(cwd, ".git", "hooks", "pre-commit");
    if (existsSync(p)) {
      try { gitHookInstalled = readFileSync(p, "utf-8").includes("buoy"); } catch { /* skip */ }
    }
  }

  let claudeHooksEnabled = false;
  const claudeSettingsPath = join(cwd, ".claude", "settings.local.json");
  if (existsSync(claudeSettingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(claudeSettingsPath, "utf-8"));
      claudeHooksEnabled = !!settings.hooks?.SessionStart?.some(
        (h: { hooks?: Array<{ command?: string }> }) =>
          h.hooks?.some(hk => hk.command?.includes("buoy") || hk.command?.includes("Design system"))
      );
    } catch { /* skip */ }
  }

  // Check commands
  const commandsDir = join(homedir(), ".claude", "commands");
  const hasCommands = existsSync(commandsDir) && readdirSync(commandsDir).some(f => f.endsWith(".md"));

  // Check graph
  const hasGraph = existsSync(join(cwd, ".buoy", "graph.json"));

  return {
    config: hasConfig,
    skills: hasSkills,
    agents: hasAgents,
    context: hasContext,
    hooks: { git: gitHookInstalled, claude: claudeHooksEnabled },
    commands: hasCommands,
    graph: hasGraph,
  };
}


/**
 * Extract rich suggestion context from drift signals for better health suggestions.
 */
function computeRichSuggestionContext(drifts: DriftSignal[]): {
  topHardcodedColor?: { value: string; count: number };
  worstFile?: { path: string; issueCount: number };
  uniqueSpacingValues?: number;
} {
  // Extract hardcoded colors from drift messages
  // Messages follow the pattern: 'Component "X" has N hardcoded colors: #fff, #000, #333'
  const colorCounts = new Map<string, number>();
  for (const d of drifts) {
    if (d.type !== "hardcoded-value") continue;
    if (!d.message.includes("color")) continue;

    // Extract color values from the message after the colon
    const colonIdx = d.message.lastIndexOf(":");
    if (colonIdx === -1) continue;
    const valuesStr = d.message.slice(colonIdx + 1).trim();
    const colors = valuesStr.split(",").map(v => v.trim()).filter(v =>
      v.startsWith("#") || v.startsWith("rgb")
    );
    for (const c of colors) {
      colorCounts.set(c, (colorCounts.get(c) || 0) + 1);
    }
  }
  const topColorEntry = [...colorCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topHardcodedColor = topColorEntry
    ? { value: topColorEntry[0], count: topColorEntry[1] }
    : undefined;

  // Find file with most drift issues
  const fileCounts = new Map<string, number>();
  for (const d of drifts) {
    const loc = d.source?.location;
    if (!loc) continue;
    const file = loc.split(":")[0];
    if (file) fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
  }
  const worstFileEntry = [...fileCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const worstFile = worstFileEntry
    ? { path: worstFileEntry[0], issueCount: worstFileEntry[1] }
    : undefined;

  // Count unique spacing values from hardcoded-value messages about size/spacing
  const spacingValues = new Set<string>();
  for (const d of drifts) {
    if (d.type !== "hardcoded-value") continue;
    if (!d.message.includes("size value")) continue;

    const colonIdx = d.message.lastIndexOf(":");
    if (colonIdx === -1) continue;
    const valuesStr = d.message.slice(colonIdx + 1).trim();
    const values = valuesStr.split(",").map(v => v.trim()).filter(v => v.length > 0);
    for (const v of values) {
      spacingValues.add(v);
    }
  }
  const uniqueSpacingValues = spacingValues.size > 0 ? spacingValues.size : undefined;

  return { topHardcodedColor, worstFile, uniqueSpacingValues };
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

/**
 * Gather all metrics needed for the 4-pillar health score.
 */
async function gatherHealthMetrics(
  config: BuoyConfig,
  spin: { text: string },
  useCache: boolean,
): Promise<HealthMetrics> {
  const cwd = process.cwd();

  // Run drift analysis to get all signals
  spin.text = "Scanning components and tokens...";
  const { result } = await withOptionalCache(
    cwd,
    useCache,
    async (cache: ScanCache | undefined) => {
      const orchestrator = new ScanOrchestrator(config, cwd, { cache });
      const scanResult = await orchestrator.scan({
        onProgress: (msg) => { spin.text = msg; },
      });

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

  const { scanResult, driftResult } = result;
  const drifts = driftResult.drifts;

  // Count drift types
  const hardcodedValueCount = drifts.filter(d => d.type === "hardcoded-value").length;
  const unusedTokenCount = drifts.filter(d => d.type === "unused-token").length;
  const namingInconsistencyCount = drifts.filter(d => d.type === "naming-inconsistency").length;
  const criticalCount = drifts.filter(d => d.severity === "critical").length;

  // Detect framework context
  const detected = await detectFrameworks(cwd);
  const hasUtilityFramework = detected.some(f => UTILITY_FRAMEWORK_NAMES.includes(f.name))
    || detected.some(f => DS_WITH_STYLING.includes(f.name));
  const hasDesignSystemLibrary = detected.some(f => DS_LIBRARY_NAMES.includes(f.name));

  // Compute rich suggestion context
  const richContext = computeRichSuggestionContext(drifts);

  return {
    componentCount: scanResult.components.length,
    tokenCount: scanResult.tokens.length,
    hardcodedValueCount,
    unusedTokenCount,
    namingInconsistencyCount,
    criticalCount,
    hasUtilityFramework,
    hasDesignSystemLibrary,
    totalDriftCount: drifts.length,
    topHardcodedColor: richContext.topHardcodedColor,
    worstFile: richContext.worstFile,
    uniqueSpacingValues: richContext.uniqueSpacingValues,
  };
}

function printPillarHealthReport(result: HealthScoreResult): void {
  newline();

  const scoreColor =
    result.score >= 80 ? chalk.green :
    result.score >= 60 ? chalk.yellow :
    chalk.red;

  console.log(`  Health Score: ${scoreColor.bold(`${result.score}/100`)} (${result.tier})`);
  newline();

  // Pillar breakdown with progress bars
  const pillars = [
    result.pillars.valueDiscipline,
    result.pillars.tokenHealth,
    result.pillars.consistency,
    result.pillars.criticalIssues,
  ];

  for (const pillar of pillars) {
    const barWidth = 20;
    const filled = Math.round((pillar.score / pillar.maxScore) * barWidth);
    const empty = barWidth - filled;
    const bar = chalk.green("\u2588".repeat(filled)) + chalk.dim("\u2591".repeat(empty));
    const label = pillar.name.padEnd(20);
    const scoreStr = `${pillar.score}/${pillar.maxScore}`;
    console.log(`    ${label}${bar} ${scoreStr}`);
  }

  newline();

  // Improvement suggestions
  if (result.suggestions.length > 0) {
    console.log("  Improve your score:");
    for (const suggestion of result.suggestions) {
      console.log(`    ${chalk.yellow("\u2192")} ${suggestion}`);
    }
    newline();
  }

  // Show upgrade hint after health score
  const hint = formatUpgradeHint("after-health-score");
  if (hint) {
    console.log(hint);
    console.log("");
  }
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

function walkDir(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
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
