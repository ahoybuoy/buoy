import { Command } from "commander";
import chalk from "chalk";
import { existsSync } from "fs";
import { loadConfig } from "../config/loader.js";
import {
  spinner,
  success,
  error,
  info,
  header,
  keyValue,
  newline,
  setJsonMode,
} from "../output/reporters.js";
import {
  formatDriftTable,
  formatDriftList,
  formatDriftTree,
  formatJson,
  formatMarkdown,
  formatHtml,
  formatAgent,
} from "../output/formatters.js";
import { writeFileSync } from "fs";
import type { DriftSignal, Severity } from "@ahoybuoy/core";
import { DriftAnalysisService } from "../services/drift-analysis.js";
import { withOptionalCache, type ScanCache } from "@ahoybuoy/scanners";
import { formatUpgradeHint } from "../utils/upgrade-hints.js";

export function createDriftCommand(): Command {
  const cmd = new Command("drift")
    .description("Detect design system drift in your codebase")
    .option(
      "-S, --severity <level>",
      "Filter by minimum severity (info, warning, critical)",
    )
    .option("-t, --type <type>", "Filter by drift type")
    .option("--json", "Output as JSON")
    .option("--markdown", "Output as Markdown")
    .option("--html [file]", "Output as HTML report (optionally specify filename)")
    .option("--agent", "Output optimized for AI agents (concise, actionable)")
    .option("--table", "Show as table instead of tree view")
    .option("-v, --verbose", "Verbose output with full details")
    .option("--include-baseline", "Include baselined drifts (show all)")
    .option("--no-cache", "Disable incremental scanning cache")
    .option("--clear-cache", "Clear cache before scanning")
    .action(async (options) => {
      // Set JSON mode before creating spinner to redirect spinner to stderr
      if (options.json || options.agent) {
        setJsonMode(true);
      }
      const spin = spinner("🛟 Scanning for design drift...");

      try {
        const { config } = await loadConfig();
        spin.text = "Scanning for drift...";

        // Use cache wrapper for guaranteed cleanup
        const { result } = await withOptionalCache(
          process.cwd(),
          options.cache !== false,
          async (cache: ScanCache | undefined) => {
            const service = new DriftAnalysisService(config);
            return service.analyze({
              onProgress: (msg) => {
                spin.text = msg;
              },
              includeBaseline: options.includeBaseline,
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

        // Output results
        if (options.agent) {
          console.log(formatAgent(drifts));
          return;
        }

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

        if (options.html) {
          const htmlContent = formatHtml(drifts, { designerFriendly: true });
          const filename = typeof options.html === 'string' ? options.html : 'drift-report.html';
          writeFileSync(filename, htmlContent);
          success(`HTML report saved to ${filename}`);
          return;
        }

        // Get unique file count for summary
        const uniqueFiles = new Set(
          drifts.map(d => d.source.location?.split(':')[0] || d.source.entityName)
        );

        // Choose output format based on flags
        if (options.verbose) {
          // Verbose: full details with actions
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
        } else if (options.table) {
          // Table: compact tabular format
          header("Drift Analysis");
          newline();
          console.log(formatDriftTable(drifts));
        } else {
          // Default: tree view like buoy.design homepage
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
              info("Run " + chalk.cyan("buoy tokens") + " to extract design tokens.");
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
        const message = err instanceof Error ? err.message : String(err);
        error(`Drift check failed: ${message}`);

        if (options.verbose) {
          console.error(err);
        }

        process.exit(1);
      }
    });

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
