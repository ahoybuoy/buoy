import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RescueManifest } from "./types.js";

export function rescueRoot(projectRoot: string): string {
  return join(projectRoot, ".buoy", "rescue");
}

export function rescueRunDir(projectRoot: string, runId: string): string {
  return join(rescueRoot(projectRoot), "runs", runId);
}

export function rescueManifestPath(projectRoot: string, runId: string): string {
  return join(rescueRunDir(projectRoot, runId), "manifest.json");
}

function latestPath(projectRoot: string): string {
  return join(rescueRoot(projectRoot), "latest.json");
}

export async function saveRescueManifest(
  manifest: RescueManifest,
): Promise<void> {
  const runDir = rescueRunDir(manifest.projectRoot, manifest.id);
  await mkdir(runDir, { recursive: true });
  manifest.updatedAt = new Date().toISOString();
  await writeFile(
    rescueManifestPath(manifest.projectRoot, manifest.id),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
  await mkdir(rescueRoot(manifest.projectRoot), { recursive: true });
  await writeFile(
    latestPath(manifest.projectRoot),
    JSON.stringify({ runId: manifest.id }, null, 2),
    "utf8",
  );
}

export async function resolveRunId(
  projectRoot: string,
  requested?: string,
): Promise<string> {
  if (requested) return requested;
  const path = latestPath(projectRoot);
  if (!existsSync(path)) {
    throw new Error("No Rescue run found. Start with `buoy rescue plan`.");
  }
  const latest = JSON.parse(await readFile(path, "utf8")) as { runId?: string };
  if (!latest.runId)
    throw new Error("The latest Rescue run pointer is invalid.");
  return latest.runId;
}

export async function loadRescueManifest(
  projectRoot: string,
  requested?: string,
): Promise<RescueManifest> {
  const runId = await resolveRunId(projectRoot, requested);
  const path = rescueManifestPath(projectRoot, runId);
  if (!existsSync(path)) throw new Error(`Rescue run not found: ${runId}`);
  return JSON.parse(await readFile(path, "utf8")) as RescueManifest;
}

export function createRunId(now = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `rescue-${stamp}`;
}
