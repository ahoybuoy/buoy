import { Command } from "commander";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
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
import { formatJson } from "../output/formatters.js";
import type { DriftSignal } from "@ahoybuoy/core";

const BASELINE_DIR = ".buoy";
const BASELINE_FILE = "baseline.json";

export interface BaselineEntry {
  reason: string;
  createdAt: string;
  createdBy?: string;
}

export interface Baseline {
  version: 1;
  createdAt: string;
  updatedAt: string;
  reason: string;
  driftIds: string[];
  /** Per-drift reasons (drift ID -> entry) */
  entries?: Record<string, BaselineEntry>;
  summary: {
    critical: number;
    warning: number;
    info: number;
    total: number;
  };
}

/**
 * Get the path to the baseline file
 */
export function getBaselinePath(projectRoot: string = process.cwd()): string {
  return join(projectRoot, BASELINE_DIR, BASELINE_FILE);
}

/**
 * Load existing baseline or return null if none exists
 */
export async function loadBaseline(
  projectRoot: string = process.cwd(),
): Promise<Baseline | null> {
  const baselinePath = getBaselinePath(projectRoot);

  if (!existsSync(baselinePath)) {
    return null;
  }

  try {
    const content = await readFile(baselinePath, "utf-8");
    const baseline = JSON.parse(content) as Baseline;
    return baseline;
  } catch {
    return null;
  }
}

/**
 * Save baseline to disk
 */
export async function saveBaseline(
  baseline: Baseline,
  projectRoot: string = process.cwd(),
): Promise<void> {
  const baselinePath = getBaselinePath(projectRoot);
  const baselineDir = dirname(baselinePath);

  // Ensure directory exists
  if (!existsSync(baselineDir)) {
    await mkdir(baselineDir, { recursive: true });
  }

  await writeFile(baselinePath, JSON.stringify(baseline, null, 2), "utf-8");
}

/**
 * Create baseline from current drift signals
 */
export function createBaseline(drifts: DriftSignal[], reason: string): Baseline {
  const now = new Date().toISOString();

  // Create per-drift entries with the reason
  const entries: Record<string, BaselineEntry> = {};
  for (const drift of drifts) {
    entries[drift.id] = {
      reason,
      createdAt: now,
    };
  }

  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    reason,
    driftIds: drifts.map((d) => d.id),
    entries,
    summary: {
      critical: drifts.filter((d) => d.severity === "critical").length,
      warning: drifts.filter((d) => d.severity === "warning").length,
      info: drifts.filter((d) => d.severity === "info").length,
      total: drifts.length,
    },
  };
}

/**
 * Filter out baselined drifts from results
 */
export function filterBaseline(
  drifts: DriftSignal[],
  baseline: Baseline | null,
): {
  newDrifts: DriftSignal[];
  baselinedCount: number;
} {
  if (!baseline) {
    return { newDrifts: drifts, baselinedCount: 0 };
  }

  const baselineSet = new Set(baseline.driftIds);
  const newDrifts = drifts.filter((d) => !baselineSet.has(d.id));
  const baselinedCount = drifts.length - newDrifts.length;

  return { newDrifts, baselinedCount };
}

export function createBaselineCommand(): Command {
  const cmd = new Command("baseline").description(
    "Manage drift baseline for existing projects",
  );

  // baseline create
  cmd
    .command("create")
    .description(
      "Create baseline from current drift signals (hides existing issues)",
    )
    .option("--json", "Output as JSON")
    .option("-f, --force", "Overwrite existing baseline without prompting")
    .requiredOption(
      "-r, --reason <reason>",
      "Reason for baselining these drift signals (required)",
    )
    .action(async (options) => {
      if (options.json) {
        setJsonMode(true);
      }
      const spin = spinner("Loading configuration...");

      try {
        const { config } = await loadConfig();

        // Check for existing baseline
        const existingBaseline = await loadBaseline();
        if (existingBaseline && !options.force) {
          spin.stop();
          warning(
            `Baseline already exists with ${existingBaseline.summary.total} drifts.`,
          );
          info(
            'Use --force to overwrite, or "buoy baseline update" to add new drifts.',
          );
          return;
        }

        spin.text = "Scanning for current drift...";

        // Import required modules
        const { ReactComponentScanner } =
          await import("@ahoybuoy/scanners/git");
        const { SemanticDiffEngine } =
          await import("@ahoybuoy/core/analysis");

        // Scan components
        const components: Awaited<
          ReturnType<typeof ReactComponentScanner.prototype.scan>
        >["items"] = [];

        if (config.sources.react?.enabled) {
          spin.text = "Scanning React components...";
          const scanner = new ReactComponentScanner({
            projectRoot: process.cwd(),
            include: config.sources.react.include,
            exclude: config.sources.react.exclude,
            designSystemPackage: config.sources.react.designSystemPackage,
          });

          const result = await scanner.scan();
          components.push(...result.items);
        }

        spin.text = "Analyzing drift...";

        // Run analysis
        const engine = new SemanticDiffEngine();
        const diffResult = engine.analyzeComponents(components, {
          checkDeprecated: true,
          checkNaming: true,
          checkDocumentation: true,
        });

        const drifts = diffResult.drifts;

        // Create and save baseline
        const baseline = createBaseline(drifts, options.reason);
        await saveBaseline(baseline);

        spin.stop();

        if (options.json) {
          console.log(
            formatJson({
              action: "created",
              baseline,
            }),
          );
          return;
        }

        header("Baseline Created");
        newline();
        keyValue("Reason", options.reason);
        keyValue("Total drifts baselined", String(baseline.summary.total));
        keyValue("Critical", String(baseline.summary.critical));
        keyValue("Warning", String(baseline.summary.warning));
        keyValue("Info", String(baseline.summary.info));
        newline();
        success(`Baseline saved to ${BASELINE_DIR}/${BASELINE_FILE}`);
        info(
          "Future drift checks will only show NEW issues not in this baseline.",
        );
        info(
          "Tip: Add .buoy/ to .gitignore or commit it to share with your team.",
        );
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Failed to create baseline: ${message}`);
        process.exit(1);
      }
    });

  // baseline show
  cmd
    .command("show")
    .description("Show current baseline status")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      if (options.json) {
        setJsonMode(true);
      }

      try {
        const baseline = await loadBaseline();

        if (options.json) {
          console.log(formatJson({ baseline }));
          return;
        }

        if (!baseline) {
          info("No baseline exists for this project.");
          info('Run "buoy baseline create" to establish a baseline.');
          return;
        }

        header("Current Baseline");
        newline();
        if (baseline.reason) {
          keyValue("Reason", baseline.reason);
        }
        keyValue("Created", baseline.createdAt);
        keyValue("Updated", baseline.updatedAt);
        keyValue("Total drifts", String(baseline.summary.total));
        keyValue("Critical", String(baseline.summary.critical));
        keyValue("Warning", String(baseline.summary.warning));
        keyValue("Info", String(baseline.summary.info));
        newline();
        info(`Baseline file: ${getBaselinePath()}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error(`Failed to read baseline: ${message}`);
        process.exit(1);
      }
    });

  // baseline update
  cmd
    .command("update")
    .description("Update baseline to include current drift signals")
    .option("--json", "Output as JSON")
    .requiredOption(
      "-r, --reason <reason>",
      "Reason for adding these drift signals to baseline (required)",
    )
    .action(async (options) => {
      if (options.json) {
        setJsonMode(true);
      }
      const spin = spinner("Loading configuration...");

      try {
        const { config } = await loadConfig();
        const existingBaseline = await loadBaseline();

        spin.text = "Scanning for current drift...";

        // Import required modules
        const { ReactComponentScanner } =
          await import("@ahoybuoy/scanners/git");
        const { SemanticDiffEngine } =
          await import("@ahoybuoy/core/analysis");

        // Scan components
        const components: Awaited<
          ReturnType<typeof ReactComponentScanner.prototype.scan>
        >["items"] = [];

        if (config.sources.react?.enabled) {
          spin.text = "Scanning React components...";
          const scanner = new ReactComponentScanner({
            projectRoot: process.cwd(),
            include: config.sources.react.include,
            exclude: config.sources.react.exclude,
            designSystemPackage: config.sources.react.designSystemPackage,
          });

          const result = await scanner.scan();
          components.push(...result.items);
        }

        spin.text = "Analyzing drift...";

        // Run analysis
        const engine = new SemanticDiffEngine();
        const diffResult = engine.analyzeComponents(components, {
          checkDeprecated: true,
          checkNaming: true,
          checkDocumentation: true,
        });

        const drifts = diffResult.drifts;

        // Create updated baseline, preserving existing entries
        const baseline = createBaseline(drifts, options.reason);
        if (existingBaseline) {
          baseline.createdAt = existingBaseline.createdAt;
          // Preserve existing per-drift entries, only add new ones with the new reason
          if (existingBaseline.entries) {
            for (const [id, entry] of Object.entries(existingBaseline.entries)) {
              if (baseline.entries && !baseline.entries[id]) {
                // This drift was removed, don't preserve
              } else if (baseline.entries && existingBaseline.driftIds.includes(id)) {
                // Preserve original entry for existing drifts
                baseline.entries[id] = entry;
              }
            }
          }
        }
        await saveBaseline(baseline);

        spin.stop();

        const added = existingBaseline
          ? baseline.summary.total - existingBaseline.summary.total
          : baseline.summary.total;

        if (options.json) {
          console.log(
            formatJson({
              action: "updated",
              baseline,
              added,
            }),
          );
          return;
        }

        header("Baseline Updated");
        newline();
        keyValue("Reason for new entries", options.reason);
        keyValue("Total drifts", String(baseline.summary.total));
        if (existingBaseline) {
          keyValue("Added to baseline", String(Math.max(0, added)));
        }
        newline();
        success("Baseline updated successfully.");
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Failed to update baseline: ${message}`);
        process.exit(1);
      }
    });

  // baseline clear
  cmd
    .command("clear")
    .description("Remove baseline (show all drift signals again)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      if (options.json) {
        setJsonMode(true);
      }

      try {
        const { unlink } = await import("fs/promises");
        const baselinePath = getBaselinePath();

        if (!existsSync(baselinePath)) {
          if (options.json) {
            console.log(formatJson({ action: "cleared", existed: false }));
            return;
          }
          info("No baseline exists.");
          return;
        }

        await unlink(baselinePath);

        if (options.json) {
          console.log(formatJson({ action: "cleared", existed: true }));
          return;
        }

        success("Baseline cleared. All drift signals will now be shown.");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error(`Failed to clear baseline: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}
