import { Command } from "commander";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "node:crypto";
import { loadConfig } from "../config/loader.js";
import { DriftAnalysisService } from "../services/drift-analysis.js";
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
import type { DriftSignal } from "@buoy-design/core";

const IGNORE_DIR = ".buoy";
const IGNORE_FILE = "ignore.json";

export interface IgnoreEntry {
  reason: string;
  createdAt: string;
  createdBy?: string;
}

export interface IgnoreList {
  version: 1 | 2;
  createdAt: string;
  updatedAt: string;
  reason: string;
  driftIds: string[];
  /** Stable fingerprints survive harmless line-number and generated-ID changes. */
  fingerprints?: string[];
  /** Per-drift reasons (fingerprint for v2, drift ID for v1 -> entry) */
  entries?: Record<string, IgnoreEntry>;
  summary: {
    critical: number;
    warning: number;
    info: number;
    total: number;
  };
}

/**
 * Get the path to the ignore file
 */
export function getIgnorePath(projectRoot: string = process.cwd()): string {
  return join(projectRoot, IGNORE_DIR, IGNORE_FILE);
}

/**
 * Load existing ignore list or return null if none exists
 */
export async function loadIgnoreList(
  projectRoot: string = process.cwd(),
): Promise<IgnoreList | null> {
  const ignorePath = getIgnorePath(projectRoot);

  if (!existsSync(ignorePath)) {
    return null;
  }

  try {
    const content = await readFile(ignorePath, "utf-8");
    const ignoreList = JSON.parse(content) as IgnoreList;
    return ignoreList;
  } catch {
    return null;
  }
}

/**
 * Save ignore list to disk
 */
export async function saveIgnoreList(
  ignoreList: IgnoreList,
  projectRoot: string = process.cwd(),
): Promise<void> {
  const ignorePath = getIgnorePath(projectRoot);
  const ignoreDir = dirname(ignorePath);

  // Ensure directory exists
  if (!existsSync(ignoreDir)) {
    await mkdir(ignoreDir, { recursive: true });
  }

  await writeFile(ignorePath, JSON.stringify(ignoreList, null, 2), "utf-8");
}

/**
 * Create ignore list from current drift signals
 */
export function fingerprintDrift(drift: DriftSignal): string {
  const location = (drift.source.location || "")
    .replace(/:\d+(?::\d+)?$/, "")
    .replaceAll("\\", "/");
  const details = drift.details || {};
  const suggestions = Array.isArray(details.suggestions)
    ? [...details.suggestions].map(String).sort()
    : [];
  const identity = JSON.stringify({
    type: drift.type,
    file: location,
    entityType: drift.source.entityType,
    entityName: drift.source.entityName,
    actual: details.actual ?? null,
    expected: details.expected ?? null,
    suggestions,
    message:
      details.actual == null &&
      details.expected == null &&
      suggestions.length === 0
        ? drift.message.replace(/\s+/g, " ").trim()
        : null,
  });
  return createHash("sha256").update(identity).digest("hex").slice(0, 24);
}

export function createIgnoreList(
  drifts: DriftSignal[],
  reason: string,
  createdBy?: string,
): IgnoreList {
  const now = new Date().toISOString();
  const fingerprints = drifts.map(fingerprintDrift);

  // Create per-drift entries with the reason
  const entries: Record<string, IgnoreEntry> = {};
  for (const fingerprint of fingerprints) {
    entries[fingerprint] = {
      reason,
      createdAt: now,
      createdBy,
    };
  }

  return {
    version: 2,
    createdAt: now,
    updatedAt: now,
    reason,
    driftIds: drifts.map((d) => d.id),
    fingerprints,
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
 * Filter out ignored drifts from results
 */
export function filterIgnored(
  drifts: DriftSignal[],
  ignoreList: IgnoreList | null,
): {
  newDrifts: DriftSignal[];
  ignoredCount: number;
} {
  if (!ignoreList) {
    return { newDrifts: drifts, ignoredCount: 0 };
  }

  const ignoreSet = new Set(ignoreList.driftIds || []);
  const fingerprintSet = new Set(ignoreList.fingerprints || []);
  const newDrifts = drifts.filter(
    (d) => !ignoreSet.has(d.id) && !fingerprintSet.has(fingerprintDrift(d)),
  );
  const ignoredCount = drifts.length - newDrifts.length;

  return { newDrifts, ignoredCount };
}

export function preserveIgnoreEntries(
  next: IgnoreList,
  existing: IgnoreList,
  currentDrifts: DriftSignal[],
): void {
  if (!next.entries || !existing.entries) return;
  const fingerprintById = new Map(
    currentDrifts.map((drift) => [drift.id, fingerprintDrift(drift)]),
  );

  for (const [key, entry] of Object.entries(existing.entries)) {
    const migratedKey =
      existing.version === 1 ? fingerprintById.get(key) || key : key;
    if (next.entries[migratedKey]) next.entries[migratedKey] = entry;
  }
}

export function createIgnoreCommand(): Command {
  const cmd = new Command("ignore").description(
    "Manage ignored drift signals for existing projects",
  );

  // ignore all
  cmd
    .command("all")
    .description("Ignore all current drift signals (hides existing issues)")
    .option("--json", "Output as JSON")
    .option("-f, --force", "Overwrite existing ignore list without prompting")
    .option("--actor <name>", "Person or team accepting the baseline")
    .requiredOption(
      "-r, --reason <reason>",
      "Reason for ignoring these drift signals (required)",
    )
    .action(async (options) => {
      if (options.json) {
        setJsonMode(true);
      }
      const spin = spinner("Loading configuration...");

      try {
        const { config, configPath } = await loadConfig();
        const projectRoot = configPath ? dirname(configPath) : process.cwd();

        // Check for existing ignore list
        const existing = await loadIgnoreList(projectRoot);
        if (existing && !options.force) {
          spin.stop();
          warning(
            `Ignore list already exists with ${existing.summary.total} drifts.`,
          );
          info(
            'Use --force to overwrite, or "buoy drift ignore add" to add new drift.',
          );
          return;
        }

        spin.text = "Scanning for current drift...";

        const service = new DriftAnalysisService(config, projectRoot);
        const result = await service.analyze({
          includeIgnored: true,
          onProgress: (message) => {
            spin.text = message;
          },
        });
        const drifts = result.drifts;

        // Create and save ignore list
        const ignoreList = createIgnoreList(
          drifts,
          options.reason,
          options.actor,
        );
        await saveIgnoreList(ignoreList, projectRoot);

        spin.stop();

        if (options.json) {
          console.log(
            formatJson({
              action: "created",
              ignoreList,
            }),
          );
          return;
        }

        header("Ignore List Created");
        newline();
        keyValue("Reason", options.reason);
        keyValue("Total drifts ignored", String(ignoreList.summary.total));
        keyValue("Critical", String(ignoreList.summary.critical));
        keyValue("Warning", String(ignoreList.summary.warning));
        keyValue("Info", String(ignoreList.summary.info));
        newline();
        success(`Ignore list saved to ${getIgnorePath(projectRoot)}`);
        info(
          "Future drift checks will only show NEW issues not in this ignore list.",
        );
        info(
          "Tip: Add .buoy/ to .gitignore or commit it to share with your team.",
        );
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Failed to create ignore list: ${message}`);
        process.exit(1);
      }
    });

  // ignore show
  cmd
    .command("show")
    .description("Show currently ignored drift signals")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      if (options.json) {
        setJsonMode(true);
      }

      try {
        const { configPath } = await loadConfig();
        const projectRoot = configPath ? dirname(configPath) : process.cwd();
        const ignoreList = await loadIgnoreList(projectRoot);

        if (options.json) {
          console.log(formatJson({ ignoreList }));
          return;
        }

        if (!ignoreList) {
          info("No ignored drifts for this project.");
          info('Run "buoy drift ignore all" to ignore existing drift.');
          return;
        }

        header("Ignored Drift Signals");
        newline();
        if (ignoreList.reason) {
          keyValue("Reason", ignoreList.reason);
        }
        keyValue("Created", ignoreList.createdAt);
        keyValue("Updated", ignoreList.updatedAt);
        keyValue("Total drifts", String(ignoreList.summary.total));
        keyValue("Critical", String(ignoreList.summary.critical));
        keyValue("Warning", String(ignoreList.summary.warning));
        keyValue("Info", String(ignoreList.summary.info));
        newline();
        info(`Ignore file: ${getIgnorePath(projectRoot)}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error(`Failed to read ignore list: ${message}`);
        process.exit(1);
      }
    });

  // ignore add
  cmd
    .command("add")
    .description("Add current drift signals to the ignore list")
    .option("--json", "Output as JSON")
    .option("--actor <name>", "Person or team accepting the baseline")
    .requiredOption(
      "-r, --reason <reason>",
      "Reason for ignoring these drift signals (required)",
    )
    .action(async (options) => {
      if (options.json) {
        setJsonMode(true);
      }
      const spin = spinner("Loading configuration...");

      try {
        const { config, configPath } = await loadConfig();
        const projectRoot = configPath ? dirname(configPath) : process.cwd();
        const existing = await loadIgnoreList(projectRoot);

        spin.text = "Scanning for current drift...";

        const service = new DriftAnalysisService(config, projectRoot);
        const result = await service.analyze({
          includeIgnored: true,
          onProgress: (message) => {
            spin.text = message;
          },
        });
        const drifts = result.drifts;

        // Create updated ignore list, preserving existing entries
        const ignoreList = createIgnoreList(
          drifts,
          options.reason,
          options.actor,
        );
        if (existing) {
          ignoreList.createdAt = existing.createdAt;
          preserveIgnoreEntries(ignoreList, existing, drifts);
        }
        await saveIgnoreList(ignoreList, projectRoot);

        spin.stop();

        const added = existing
          ? ignoreList.summary.total - existing.summary.total
          : ignoreList.summary.total;

        if (options.json) {
          console.log(
            formatJson({
              action: "updated",
              ignoreList,
              added,
            }),
          );
          return;
        }

        header("Ignore List Updated");
        newline();
        keyValue("Reason for new entries", options.reason);
        keyValue("Total drifts", String(ignoreList.summary.total));
        if (existing) {
          keyValue("Added to ignore list", String(Math.max(0, added)));
        }
        newline();
        success("Ignore list updated successfully.");
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Failed to update ignore list: ${message}`);
        process.exit(1);
      }
    });

  // ignore clear
  cmd
    .command("clear")
    .description("Remove ignore list (show all drift signals again)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      if (options.json) {
        setJsonMode(true);
      }

      try {
        const { unlink } = await import("fs/promises");
        const { configPath } = await loadConfig();
        const projectRoot = configPath ? dirname(configPath) : process.cwd();
        const ignorePath = getIgnorePath(projectRoot);

        if (!existsSync(ignorePath)) {
          if (options.json) {
            console.log(formatJson({ action: "cleared", existed: false }));
            return;
          }
          info("No ignore list exists.");
          return;
        }

        await unlink(ignorePath);

        if (options.json) {
          console.log(formatJson({ action: "cleared", existed: true }));
          return;
        }

        success("Ignore list cleared. All drift signals will now be shown.");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error(`Failed to clear ignore list: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}
