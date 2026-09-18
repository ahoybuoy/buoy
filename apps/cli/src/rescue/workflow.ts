import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { DriftSignal, Fix } from "@buoy-design/core";
import { generateFixes } from "@buoy-design/core";
import { loadConfig } from "../config/loader.js";
import {
  DriftAnalysisService,
  calculateDriftSummary,
} from "../services/drift-analysis.js";
import {
  createIgnoreList,
  fingerprintDrift,
  getIgnorePath,
  loadIgnoreList,
  saveIgnoreList,
} from "../commands/ignore.js";
import { applyFixes, validateFixTargets } from "../fix/index.js";
import { writeRescueReports } from "./report.js";
import {
  createRunId,
  loadRescueManifest,
  rescueRunDir,
  saveRescueManifest,
} from "./store.js";
import type {
  RescueBackup,
  RescueFinding,
  RescueManifest,
  RescueVerification,
  RescueVerificationCommand,
} from "./types.js";

type Progress = (message: string) => void;

export async function resolveProject(cwd = process.cwd()) {
  const loaded = await loadConfig(cwd);
  const projectRoot = loaded.configPath
    ? dirname(loaded.configPath)
    : resolve(cwd);
  return { ...loaded, projectRoot };
}

function gitValue(projectRoot: string, args: string[]): string | null {
  try {
    return (
      execFileSync("git", args, {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || null
    );
  } catch {
    return null;
  }
}

function pathInside(projectRoot: string, file: string): boolean {
  const absolute = resolve(projectRoot, file);
  const rel = relative(projectRoot, absolute);
  return (
    rel !== "" &&
    !rel.startsWith(`..${sep}`) &&
    rel !== ".." &&
    !isAbsolute(rel)
  );
}

export function selectSafeFixes(
  fixes: Fix[],
  drifts: DriftSignal[],
  projectRoot: string,
  acceptedFingerprints: Set<string>,
): Fix[] {
  const driftById = new Map(drifts.map((drift) => [drift.id, drift]));
  const candidates = validateFixTargets(fixes).valid.filter((fix) => {
    const drift = driftById.get(fix.driftSignalId);
    return (
      !!drift &&
      (fix.confidence === "exact" || fix.confidence === "high") &&
      pathInside(projectRoot, fix.file) &&
      !acceptedFingerprints.has(fingerprintDrift(drift))
    );
  });
  const counts = new Map<string, number>();
  for (const fix of candidates) {
    const key = `${resolve(projectRoot, fix.file)}:${fix.line}:${fix.column}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return candidates.filter((fix) => {
    const key = `${resolve(projectRoot, fix.file)}:${fix.line}:${fix.column}`;
    return counts.get(key) === 1;
  });
}

export function acceptedFingerprintsFor(
  drifts: DriftSignal[],
  ignoreList: Awaited<ReturnType<typeof loadIgnoreList>>,
): Set<string> {
  const accepted = new Set(ignoreList?.fingerprints || []);
  if (!ignoreList) return accepted;

  const acceptedIds = new Set(ignoreList.driftIds || []);
  for (const drift of drifts) {
    if (acceptedIds.has(drift.id)) accepted.add(fingerprintDrift(drift));
  }
  return accepted;
}

function findingFromDrift(
  drift: DriftSignal,
  safeFixIds: Set<string>,
  acceptedFingerprints: Set<string>,
): RescueFinding {
  const location = drift.source.location || "";
  const match = location.match(/^(.*?)(?::(\d+))?(?::\d+)?$/);
  const fingerprint = fingerprintDrift(drift);
  return {
    id: drift.id,
    fingerprint,
    type: drift.type,
    severity: drift.severity,
    file: match?.[1] || location || drift.source.entityName,
    line: match?.[2] ? Number.parseInt(match[2], 10) : undefined,
    entity: drift.source.entityName,
    message: drift.message,
    classification: acceptedFingerprints.has(fingerprint)
      ? "accepted-legacy"
      : safeFixIds.has(drift.id)
        ? "safe-fix"
        : "review-required",
  };
}

export async function createRescuePlan(
  cwd = process.cwd(),
  onProgress?: Progress,
): Promise<RescueManifest> {
  const { config, projectRoot } = await resolveProject(cwd);
  const service = new DriftAnalysisService(config, projectRoot);
  const analysis = await service.analyze({ includeIgnored: true, onProgress });
  const existingBaseline = await loadIgnoreList(projectRoot);
  const acceptedFingerprints = acceptedFingerprintsFor(
    analysis.drifts,
    existingBaseline,
  );
  const generated = generateFixes(analysis.drifts, analysis.tokens, {
    minConfidence: "high",
  });
  const safeFixes = selectSafeFixes(
    generated,
    analysis.drifts,
    projectRoot,
    acceptedFingerprints,
  );
  const safeFixIds = new Set(safeFixes.map((fix) => fix.driftSignalId));
  const now = new Date().toISOString();
  const manifest: RescueManifest = {
    version: 1,
    id: createRunId(),
    projectRoot,
    projectName: config.project.name,
    createdAt: now,
    updatedAt: now,
    status: "planned",
    source: {
      branch: gitValue(projectRoot, ["branch", "--show-current"]),
      head: gitValue(projectRoot, ["rev-parse", "HEAD"]),
    },
    before: {
      summary: analysis.summary,
      componentCount: analysis.components.length,
      tokenCount: analysis.tokenCount,
    },
    findings: analysis.drifts.map((drift) =>
      findingFromDrift(drift, safeFixIds, acceptedFingerprints),
    ),
    safeFixes,
    appliedFixIds: [],
    backups: [],
  };
  await saveRescueManifest(manifest);
  await writeRescueReports(manifest);
  return manifest;
}

function hash(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function dirtyPaths(projectRoot: string): string[] {
  const output = gitValue(projectRoot, [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  if (!output) return [];
  return output
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter((path) => path && !path.startsWith(".buoy/rescue/"));
}

async function backupFiles(
  manifest: RescueManifest,
  fixes: Fix[],
): Promise<RescueBackup[]> {
  const files = [...new Set(fixes.map((fix) => fix.file))];
  const backups: RescueBackup[] = [];
  for (const file of files) {
    const absolute = resolve(manifest.projectRoot, file);
    const rel = relative(manifest.projectRoot, absolute);
    const backupPath = join(
      rescueRunDir(manifest.projectRoot, manifest.id),
      "backups",
      rel,
    );
    await mkdir(dirname(backupPath), { recursive: true });
    const content = await readFile(absolute);
    await copyFile(absolute, backupPath);
    backups.push({ file: rel, backupPath, beforeHash: hash(content) });
  }
  return backups;
}

export interface VerificationSpec {
  label: string;
  command: string;
  args: string[];
}

export function detectVerificationCommands(
  projectRoot: string,
): VerificationSpec[] {
  const packagePath = join(projectRoot, "package.json");
  if (!existsSync(packagePath)) return [];
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
    packageManager?: string;
    scripts?: Record<string, string>;
  };
  const scripts = pkg.scripts || {};
  const packageManager =
    pkg.packageManager?.split("@")[0] ||
    (existsSync(join(projectRoot, "pnpm-lock.yaml"))
      ? "pnpm"
      : existsSync(join(projectRoot, "yarn.lock"))
        ? "yarn"
        : "npm");
  const selected = [
    scripts.typecheck ? "typecheck" : null,
    scripts["test:ci"] ? "test:ci" : scripts.test ? "test" : null,
  ].filter((value): value is string => !!value);
  return selected.map((script) => ({
    label: script,
    command: packageManager,
    args: packageManager === "npm" ? ["run", script] : ["run", script],
  }));
}

export function runVerification(
  projectRoot: string,
  specs = detectVerificationCommands(projectRoot),
  onProgress?: Progress,
): RescueVerification {
  const commands: RescueVerificationCommand[] = [];
  for (const spec of specs) {
    onProgress?.(`Running ${spec.label}...`);
    const result = spawnSync(spec.command, spec.args, {
      cwd: projectRoot,
      encoding: "utf8",
      env: { ...process.env, CI: "1" },
      maxBuffer: 10 * 1024 * 1024,
    });
    const combined = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    commands.push({
      ...spec,
      exitCode: result.status,
      passed: result.status === 0,
      output: combined.slice(-8000),
    });
    if (result.status !== 0) break;
  }
  return {
    completedAt: new Date().toISOString(),
    passed: commands.length > 0 && commands.every((command) => command.passed),
    skipped: commands.length === 0,
    commands,
  };
}

export function statusAfterVerification(
  current: RescueManifest["status"],
  verification: RescueVerification,
): RescueManifest["status"] {
  if (verification.skipped) return current;
  return verification.passed ? "verified" : "verification_failed";
}

export async function restoreBackups(
  manifest: RescueManifest,
  force: boolean,
): Promise<void> {
  for (const backup of manifest.backups) {
    const target = resolve(manifest.projectRoot, backup.file);
    if (!pathInside(manifest.projectRoot, backup.file)) {
      throw new Error(
        `Refusing to restore a path outside the project: ${backup.file}`,
      );
    }
    if (existsSync(target) && backup.afterHash && !force) {
      const currentHash = hash(await readFile(target));
      if (
        currentHash !== backup.afterHash &&
        currentHash !== backup.beforeHash
      ) {
        throw new Error(
          `${backup.file} changed after Rescue. Review it or rerun rollback with --force.`,
        );
      }
    }
    await copyFile(backup.backupPath, target);
  }
}

async function analyzeAfter(manifest: RescueManifest, onProgress?: Progress) {
  const { config } = await loadConfig(manifest.projectRoot);
  const service = new DriftAnalysisService(config, manifest.projectRoot);
  const analysis = await service.analyze({ includeIgnored: true, onProgress });
  manifest.after = {
    summary: calculateDriftSummary(analysis.drifts),
    componentCount: analysis.components.length,
    tokenCount: analysis.tokenCount,
  };
}

export async function applyRescuePlan(
  cwd = process.cwd(),
  requestedRun?: string,
  options: { limit?: number } = {},
  onProgress?: Progress,
): Promise<RescueManifest> {
  const { projectRoot } = await resolveProject(cwd);
  const manifest = await loadRescueManifest(projectRoot, requestedRun);
  if (manifest.status !== "planned") {
    throw new Error(
      `Run ${manifest.id} is ${manifest.status}; only a planned run can be applied.`,
    );
  }
  if (!manifest.source.head || !manifest.source.branch) {
    throw new Error(
      "Rescue apply requires a Git repository with a named branch.",
    );
  }
  const currentHead = gitValue(projectRoot, ["rev-parse", "HEAD"]);
  if (currentHead !== manifest.source.head) {
    throw new Error(
      "The repository changed after planning. Create a new Rescue plan.",
    );
  }
  const dirty = dirtyPaths(projectRoot);
  if (dirty.length > 0) {
    throw new Error(
      `Commit or stash existing changes before Rescue apply: ${dirty.slice(0, 5).join(", ")}`,
    );
  }
  const fixes = options.limit
    ? manifest.safeFixes.slice(0, options.limit)
    : manifest.safeFixes;
  if (fixes.length === 0)
    throw new Error("This plan has no high-confidence fixes to apply.");

  manifest.rescueBranch = `buoy/${manifest.id}`;
  execFileSync("git", ["switch", "-c", manifest.rescueBranch], {
    cwd: projectRoot,
    stdio: "ignore",
  });
  manifest.backups = await backupFiles(manifest, fixes);
  await saveRescueManifest(manifest);

  const absoluteFixes = fixes.map((fix) => ({
    ...fix,
    file: resolve(projectRoot, fix.file),
  }));
  const applied = await applyFixes(absoluteFixes, { minConfidence: "high" });
  if (applied.failed > 0) {
    await restoreBackups(manifest, true);
    manifest.status = "rolled_back";
    await saveRescueManifest(manifest);
    await writeRescueReports(manifest);
    throw new Error(
      `${applied.failed} fix(es) failed; all Rescue edits were rolled back.`,
    );
  }
  manifest.appliedFixIds = applied.results
    .filter((result) => result.status === "applied")
    .map((result) => result.fixId);
  for (const backup of manifest.backups) {
    backup.afterHash = hash(await readFile(resolve(projectRoot, backup.file)));
  }
  manifest.status = "applied";
  manifest.verification = runVerification(projectRoot, undefined, onProgress);
  if (!manifest.verification.skipped && !manifest.verification.passed) {
    await restoreBackups(manifest, true);
    manifest.status = "verification_failed";
    await saveRescueManifest(manifest);
    await writeRescueReports(manifest);
    throw new Error(
      "Project verification failed; Rescue restored every modified file.",
    );
  }
  if (manifest.verification.passed) manifest.status = "verified";
  await analyzeAfter(manifest, onProgress);
  await saveRescueManifest(manifest);
  await writeRescueReports(manifest);
  return manifest;
}

export async function verifyRescueRun(
  cwd = process.cwd(),
  requestedRun?: string,
  onProgress?: Progress,
): Promise<RescueManifest> {
  const { projectRoot } = await resolveProject(cwd);
  const manifest = await loadRescueManifest(projectRoot, requestedRun);
  manifest.verification = runVerification(projectRoot, undefined, onProgress);
  manifest.status = statusAfterVerification(
    manifest.status,
    manifest.verification,
  );
  await analyzeAfter(manifest, onProgress);
  await saveRescueManifest(manifest);
  await writeRescueReports(manifest);
  return manifest;
}

export async function guardRescueRun(
  cwd = process.cwd(),
  requestedRun: string | undefined,
  reason: string,
  actor?: string,
  onProgress?: Progress,
): Promise<RescueManifest> {
  const { config, projectRoot } = await resolveProject(cwd);
  const manifest = await loadRescueManifest(projectRoot, requestedRun);
  const service = new DriftAnalysisService(config, projectRoot);
  const analysis = await service.analyze({ includeIgnored: true, onProgress });
  const baseline = createIgnoreList(analysis.drifts, reason, actor);
  await saveIgnoreList(baseline, projectRoot);
  manifest.baseline = {
    reason,
    actor,
    count: baseline.summary.total,
    path: getIgnorePath(projectRoot),
    createdAt: new Date().toISOString(),
  };
  manifest.status = "guarded";
  await saveRescueManifest(manifest);
  await writeRescueReports(manifest);
  return manifest;
}

export async function rollbackRescueRun(
  cwd = process.cwd(),
  requestedRun?: string,
  force = false,
): Promise<RescueManifest> {
  const { projectRoot } = await resolveProject(cwd);
  const manifest = await loadRescueManifest(projectRoot, requestedRun);
  if (manifest.backups.length === 0)
    throw new Error("This Rescue run has no applied files to roll back.");
  await restoreBackups(manifest, force);
  const currentBranch = gitValue(projectRoot, ["branch", "--show-current"]);
  if (
    manifest.rescueBranch &&
    currentBranch === manifest.rescueBranch &&
    manifest.source.branch
  ) {
    execFileSync("git", ["switch", manifest.source.branch], {
      cwd: projectRoot,
      stdio: "ignore",
    });
  }
  manifest.status = "rolled_back";
  await saveRescueManifest(manifest);
  await writeRescueReports(manifest);
  return manifest;
}

export async function reportRescueRun(
  cwd = process.cwd(),
  requestedRun?: string,
) {
  const { projectRoot } = await resolveProject(cwd);
  const manifest = await loadRescueManifest(projectRoot, requestedRun);
  return { manifest, paths: await writeRescueReports(manifest) };
}
