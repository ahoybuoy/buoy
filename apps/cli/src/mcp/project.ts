/**
 * Project snapshot for the MCP server and the agent hook.
 *
 * Both need the same thing: this repo's tokens, and drift for some files.
 * Everything here reuses the CLI's scan pipeline; nothing is re-detected.
 */
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { BuoyConfig } from "../config/schema.js";
import { loadConfig, getConfigPath } from "../config/loader.js";
import { buildAutoConfig } from "../config/auto-detect.js";
import { ScanOrchestrator } from "../scan/orchestrator.js";
import { DriftAnalysisService } from "../services/drift-analysis.js";
import { filterScannableFiles } from "../commands/check.js";
import { checkFiles } from "./file-check.js";
import type { DesignToken, DriftSignal } from "@buoy-design/core";

export interface ProjectContext {
  config: BuoyConfig;
  projectRoot: string;
}

export async function loadProject(cwd: string): Promise<ProjectContext> {
  const configPath = getConfigPath(cwd);
  if (configPath) {
    const loaded = await loadConfig(cwd);
    return { config: loaded.config, projectRoot: loaded.configPath ? dirname(loaded.configPath) : cwd };
  }
  // No config: agents and hooks can run from a subdirectory, where the repo's
  // tokens are out of sight. Use the repository root instead.
  const root = findRepoRoot(cwd) ?? cwd;
  const auto = await buildAutoConfig(root);
  return { config: auto.config, projectRoot: root };
}

/** The nearest ancestor with a `.git` entry (a directory, or a file in worktrees). */
export function findRepoRoot(start: string): string | null {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export interface TokenSummary {
  name: string;
  category: DesignToken["category"];
  value: string;
  source?: string;
  deprecated?: boolean;
}

export function formatTokenValue(token: DesignToken): string {
  const v = token.value;
  switch (v.type) {
    case "color": return v.hex;
    case "spacing": return `${v.value}${v.unit}`;
    case "typography": return `${v.fontFamily} ${v.fontSize}`;
    case "shadow": return `${v.x}px ${v.y}px ${v.blur}px ${v.spread}px ${v.color}`;
    case "border": return `${v.width}px ${v.style} ${v.color}`;
    case "raw": return String(v.value);
    default: return "(complex)";
  }
}

export function summarizeToken(token: DesignToken): TokenSummary {
  const source = "path" in token.source ? token.source.path : undefined;
  return {
    name: token.name,
    category: token.category,
    value: formatTokenValue(token),
    ...(source ? { source } : {}),
    ...(token.metadata?.deprecated ? { deprecated: true } : {}),
  };
}

/** Normalise a CSS-ish value so `#FFF`, `#ffffff` and ` 8px ` compare equal. */
export function normalizeValue(value: string): string {
  let v = value.trim().toLowerCase().replace(/\s+/g, " ");
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (shortHex) v = `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`;
  v = v.replace(/(\d)\.0+(px|rem|em|%)?$/, "$1$2").replace(/^0(px|rem|em)$/, "0");
  return v;
}

/** Root font size used to compare px with rem, matching core's token suggestions. */
const BASE_FONT_SIZE_PX = 16;

/** `1rem` and `16px` are the same length; compare them as px. */
function comparableValue(value: string): string {
  const v = normalizeValue(value);
  const rem = /^(-?\d*\.?\d+)rem$/.exec(v);
  if (!rem) return v;
  const px = Math.round(parseFloat(rem[1]!) * BASE_FONT_SIZE_PX * 1000) / 1000;
  return px === 0 ? "0" : `${px}px`;
}

export function findTokensByValue(tokens: DesignToken[], value: string, category?: string): TokenSummary[] {
  const wanted = comparableValue(value);
  return tokens
    .filter((t) => !category || t.category === category)
    .filter((t) => comparableValue(formatTokenValue(t)) === wanted)
    .map(summarizeToken);
}

export async function scanTokens(project: ProjectContext): Promise<DesignToken[]> {
  const orchestrator = new ScanOrchestrator(project.config, project.projectRoot);
  const result = await orchestrator.scan();
  return result.tokens;
}

export interface DriftIssue {
  file: string;
  line?: number;
  type: string;
  severity: string;
  message: string;
  current?: unknown;
  suggested?: string;
  tokenSuggestions?: string[];
}

export function toIssue(drift: DriftSignal): DriftIssue {
  const location = drift.source.location || "";
  const [file, lineStr] = location.split(":");
  const suggestions = drift.details?.suggestions;
  return {
    file: file || drift.source.entityName,
    ...(lineStr ? { line: parseInt(lineStr, 10) } : {}),
    type: drift.type,
    severity: drift.severity,
    message: drift.message,
    ...(drift.details?.actual !== undefined ? { current: drift.details.actual } : {}),
    ...(suggestions?.[0] ? { suggested: suggestions[0] } : typeof drift.details?.expected === "string" ? { suggested: drift.details.expected } : {}),
    ...(drift.details?.tokenSuggestions?.length ? { tokenSuggestions: drift.details.tokenSuggestions } : {}),
  };
}

export interface DriftCheck {
  issues: DriftIssue[];
  summary: { total: number; critical: number; warning: number; info: number; fixable: number };
  tokenCount: number;
  /** Requested paths that do not exist. They were not checked, so they are not "clean". */
  notFound?: string[];
  note?: string;
}

function summarize(issues: DriftIssue[], tokenCount: number): DriftCheck {
  return {
    issues,
    summary: {
      total: issues.length,
      critical: issues.filter((i) => i.severity === "critical").length,
      warning: issues.filter((i) => i.severity === "warning").length,
      info: issues.filter((i) => i.severity === "info").length,
      fixable: issues.filter((i) => i.suggested || i.tokenSuggestions).length,
    },
    tokenCount,
  };
}

/**
 * With `files`: line-level literal values in those files, each matched to a
 * token (fast, what an agent needs right after an edit). Without: the full
 * repo analysis, which also covers components, unused tokens and contrast.
 */
export async function checkDrift(project: ProjectContext, files?: string[], tokens?: DesignToken[]): Promise<DriftCheck> {
  if (files && files.length > 0) {
    const notFound = files.filter((file) => !existsSync(isAbsolute(file) ? file : join(project.projectRoot, file)));
    const scannable = filterScannableFiles(files.filter((file) => !notFound.includes(file)));
    const known = tokens ?? (await scanTokens(project));
    const issues = scannable.length ? await checkFiles(scannable, project.projectRoot, known) : [];
    const check = summarize(issues, known.length);
    if (notFound.length === 0) return check;
    return {
      ...check,
      notFound,
      note: `Not checked, no such file: ${notFound.join(", ")}. Paths are relative to ${project.projectRoot} or absolute.`,
    };
  }
  const service = new DriftAnalysisService(project.config, project.projectRoot);
  const result = await service.analyze({ includeIgnored: false });
  return summarize(result.drifts.map(toIssue), result.tokenCount);
}
