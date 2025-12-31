import { Command } from "commander";
import chalk from "chalk";
import { existsSync } from "fs";
import { loadConfig } from "../config/loader.js";
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
} from "../output/reporters.js";
import {
  formatDriftTable,
  formatDriftList,
  formatJson,
  formatMarkdown,
} from "../output/formatters.js";
import { ScanOrchestrator } from "../scan/orchestrator.js";
import type { DriftSignal, Severity } from "@buoy-design/core";

export function createDriftCommand(): Command {
  const cmd = new Command("drift").description(
    "Detect and manage design system drift",
  );

  // drift check
  cmd
    .command("check")
    .description("Check for drift in the current project")
    .option(
      "-s, --severity <level>",
      "Filter by minimum severity (info, warning, critical)",
    )
    .option("-t, --type <type>", "Filter by drift type")
    .option("--json", "Output as JSON")
    .option("--markdown", "Output as Markdown")
    .option("--compact", "Compact table output (less detail)")
    .option("-v, --verbose", "Verbose output")
    .option("--include-baseline", "Include baselined drifts (show all)")
    .action(async (options) => {
      // Set JSON mode before creating spinner to redirect spinner to stderr
      if (options.json) {
        setJsonMode(true);
      }
      const spin = spinner("Loading configuration...");

      try {
        const { config } = await loadConfig();
        spin.text = "Scanning for drift...";

        // Scan components using orchestrator
        const orchestrator = new ScanOrchestrator(config);
        const { components: sourceComponents } =
          await orchestrator.scanComponents({
            onProgress: (msg) => {
              spin.text = msg;
            },
          });

        spin.text = "Analyzing drift...";

        // Run semantic diff engine
        const { SemanticDiffEngine } =
          await import("@buoy-design/core/analysis");
        const engine = new SemanticDiffEngine();
        const diffResult = engine.analyzeComponents(sourceComponents, {
          checkDeprecated: true,
          checkNaming: true,
          checkDocumentation: true,
        });

        let drifts: DriftSignal[] = diffResult.drifts;

        // Apply filters
        if (options.severity) {
          const severityOrder: Record<Severity, number> = {
            info: 0,
            warning: 1,
            critical: 2,
          };
          const minSeverity = severityOrder[options.severity as Severity] || 0;
          drifts = drifts.filter(
            (d) => severityOrder[d.severity] >= minSeverity,
          );
        }

        if (options.type) {
          drifts = drifts.filter((d) => d.type === options.type);
        }

        // Apply ignore rules from config
        for (const ignoreRule of config.drift.ignore) {
          drifts = drifts.filter((d) => {
            if (d.type !== ignoreRule.type) return true;
            if (!ignoreRule.pattern) return false;
            try {
              const regex = new RegExp(ignoreRule.pattern);
              return !regex.test(d.source.entityName);
            } catch {
              warning(
                `Invalid regex pattern "${ignoreRule.pattern}" in ignore rule, skipping`,
              );
              return true; // Don't filter out drift if regex is invalid
            }
          });
        }

        // Apply baseline filtering unless --include-baseline is set
        let baselinedCount = 0;
        if (!options.includeBaseline) {
          const { loadBaseline, filterBaseline } =
            await import("./baseline.js");
          const baseline = await loadBaseline();
          const filtered = filterBaseline(drifts, baseline);
          drifts = filtered.newDrifts;
          baselinedCount = filtered.baselinedCount;
        }

        spin.stop();

        // Output results
        if (options.json) {
          console.log(
            formatJson({
              drifts,
              summary: getSummary(drifts),
              baselinedCount,
            }),
          );
          return;
        }

        if (options.markdown) {
          console.log(formatMarkdown(drifts));
          return;
        }

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

        // Use compact table or detailed list
        if (options.compact) {
          console.log(formatDriftTable(drifts));
        } else {
          console.log(formatDriftList(drifts));
        }
        newline();

        if (summary.critical > 0) {
          warning(`${summary.critical} critical issues require attention.`);
        } else if (drifts.length === 0) {
          // Check if we have any reference sources to compare against
          const hasTokens = config.sources.tokens?.enabled &&
            (config.sources.tokens.files?.length ?? 0) > 0;
          const hasFigma = config.sources.figma?.enabled;
          const hasStorybook = config.sources.storybook?.enabled;
          const hasDesignTokensFile = existsSync('design-tokens.css') ||
            existsSync('design-tokens.json');

          if (!hasTokens && !hasFigma && !hasStorybook && !hasDesignTokensFile) {
            info("No drift detected, but no reference source is configured.");
            newline();
            info("To detect hardcoded values vs design tokens:");
            info("  1. Run " + chalk.cyan("buoy extract") + " to find hardcoded values");
            info("  2. Run " + chalk.cyan("buoy tokenize") + " to generate design-tokens.css");
            info("  3. Configure tokens in buoy.config.mjs:");
            console.log(chalk.gray(`
     sources: {
       tokens: {
         enabled: true,
         files: ['design-tokens.css'],
       },
     },
`));
            info("Or connect a design source: Figma, Storybook, or token files");
          } else {
            success("No drift detected. Your design system is aligned!");
          }
        } else {
          info(
            `Found ${drifts.length} drift signals. Run with --compact for summary view.`,
          );
        }
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Drift check failed: ${message}`);

        if (options.verbose) {
          console.error(err);
        }

        process.exit(1);
      }
    });

  // NOTE: `drift explain` and `drift resolve` commands are planned but not yet implemented.
  // They will be added once the following are complete:
  // - drift explain: Requires Claude API integration and git forensics
  // - drift resolve: Requires persistence layer for tracking resolutions
  // See: docs/ROADMAP.md for implementation timeline

  return cmd;
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
