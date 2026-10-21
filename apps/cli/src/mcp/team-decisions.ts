/**
 * The team's design decisions, for the file an agent is about to edit.
 *
 * Two sources: rules committed in `.buoy.yaml` (drift.ignore / enforce /
 * promote, with their reasons), and, when the CLI is logged in, the values
 * the team declined on pull requests (Buoy Cloud's remembered dismissals,
 * e.g. a deliberate 12.5px). An agent that knows these before it writes
 * neither "fixes" a deliberate value nor reintroduces a banned one.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { minimatch } from "minimatch";
import type { BuoyConfig } from "../config/schema.js";
import { getApiEndpoint, getApiToken } from "../cloud/config.js";

const run = promisify(execFile);
const CLOUD_TIMEOUT_MS = 2_000;

export interface TeamDecisions {
  /** Values the team decided to keep: do not replace them. */
  leaveAlone: string[];
  /** Values or patterns the team always wants flagged: never write them. */
  alwaysFlag: string[];
  /** Where the decisions came from, or why the cloud part is missing. */
  sources: string[];
}

type Rule = { type?: string; file?: string; component?: string; token?: string; value?: string; reason?: string };

function describe(rule: Rule): string {
  const what = [rule.value && `${rule.value}`, rule.type && `type ${rule.type}`, rule.token && `token ${rule.token}`, rule.component && `component ${rule.component}`]
    .filter(Boolean).join(", ") || "all drift";
  const where = rule.file ? ` in ${rule.file}` : "";
  return `${what}${where}${rule.reason ? `: ${rule.reason}` : ""}`;
}

function applies(rule: Rule, file: string): boolean {
  return !rule.file || minimatch(file, rule.file, { dot: true }) || file === rule.file;
}

/** Rules committed in .buoy.yaml that apply to this file. */
export function configDecisions(config: BuoyConfig, file: string): Pick<TeamDecisions, "leaveAlone" | "alwaysFlag"> {
  const drift = config.drift ?? ({} as BuoyConfig["drift"]);
  return {
    leaveAlone: (drift?.ignore ?? []).filter((r) => applies(r, file)).map(describe),
    alwaysFlag: [...(drift?.enforce ?? []), ...(drift?.promote ?? [])].filter((r) => applies(r, file)).map(describe),
  };
}

/** `git@github.com:o/r.git` or `https://github.com/o/r` → `o/r`. */
export function parseGitHubRepo(remote: string): string | null {
  const m = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(remote.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

async function originRepo(projectRoot: string): Promise<string | null> {
  try {
    const { stdout } = await run("git", ["remote", "get-url", "origin"], { cwd: projectRoot, timeout: 1_000 });
    return parseGitHubRepo(stdout);
  } catch {
    return null;
  }
}

export interface CloudDecisions {
  file: Array<{ value: string; reason: string; source: string }>;
  recurring: Array<{ value: string; files: number; reason: string }>;
}

/** Decisions from Buoy Cloud, or a short reason why there are none. */
export async function fetchCloudDecisions(
  projectRoot: string,
  file: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CloudDecisions | { unavailable: string }> {
  const token = getApiToken();
  if (!token) return { unavailable: "not logged in (run `buoy ahoy login` to include decisions from PR reviews)" };
  const repo = await originRepo(projectRoot);
  if (!repo) return { unavailable: "no GitHub origin remote" };
  const url = `${getApiEndpoint()}/api/v1/decisions?repo=${encodeURIComponent(repo)}&file=${encodeURIComponent(file)}`;
  try {
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS),
    });
    if (res.status === 404) return { unavailable: `${repo} is not on Buoy Cloud in this account` };
    if (!res.ok) return { unavailable: `Buoy Cloud returned ${res.status}` };
    const body = (await res.json()) as CloudDecisions;
    return { file: body.file ?? [], recurring: body.recurring ?? [] };
  } catch {
    return { unavailable: "Buoy Cloud did not answer in time" };
  }
}

export function mergeDecisions(local: Pick<TeamDecisions, "leaveAlone" | "alwaysFlag">, cloud: CloudDecisions | { unavailable: string }): TeamDecisions {
  const sources = [".buoy.yaml"];
  const leaveAlone = [...local.leaveAlone];
  if ("unavailable" in cloud) {
    sources.push(`PR reviews: ${cloud.unavailable}`);
  } else {
    sources.push("PR reviews (Buoy Cloud)");
    for (const d of cloud.file) leaveAlone.push(`${d.value} in this file: ${d.reason}`);
    for (const d of cloud.recurring) leaveAlone.push(`${d.value} (kept in ${d.files} files): ${d.reason}`);
  }
  return { leaveAlone: [...new Set(leaveAlone)].slice(0, 20), alwaysFlag: local.alwaysFlag.slice(0, 20), sources };
}
