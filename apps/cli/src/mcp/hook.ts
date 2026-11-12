/**
 * Claude Code PostToolUse hook: after the agent edits a file, check that
 * file for drift and hand the issues back as feedback (exit code 2). Other
 * agents can call `buoy mcp hook --file <path>` the same way.
 *
 * Cursor (`buoy mcp hook --cursor`): its postToolUse hook reads
 * `{"additional_context": ...}` from stdout, and exit code 2 there means
 * "block", so this mode always exits 0.
 */
import { isAbsolute, relative, resolve } from "node:path";
import { checkDrift, loadProject, type DriftCheck } from "./project.js";
import { fileChangedLines } from "../services/changed-lines.js";
import { ConfigFileError } from "../config/loader.js";

const STYLE_FILE = /\.(tsx|jsx|vue|svelte|css|scss|html)$/;
/** Dependencies and build output: an agent may touch them, but they are not the repo's UI code. */
const NOT_SOURCE = /(^|\/)(node_modules|dist|\.next|\.nuxt|\.svelte-kit|\.output)\//;

/** Pull the edited path out of a Claude Code hook payload. */
export function filePathFromHookPayload(raw: string): string | null {
  try {
    const payload = JSON.parse(raw) as { tool_input?: { file_path?: string; path?: string }; tool_response?: { filePath?: string } };
    return payload.tool_input?.file_path ?? payload.tool_input?.path ?? payload.tool_response?.filePath ?? null;
  } catch {
    return null;
  }
}

export interface CursorHookInput {
  /** Project root: the payload's cwd or first workspace root. Plugin hooks run from the plugin's own folder, so process.cwd() is not the project. */
  cwd: string | null;
  file: string | null;
}

/** Pull the project root and edited path out of a Cursor postToolUse (or afterFileEdit) payload. */
export function parseCursorHookPayload(raw: string): CursorHookInput {
  try {
    const payload = JSON.parse(raw) as {
      cwd?: string;
      workspace_roots?: string[];
      file_path?: string;
      tool_input?: Record<string, unknown>;
    };
    const input = payload.tool_input ?? {};
    const candidate = [input.file_path, input.path, input.target_file, input.filePath, payload.file_path]
      .find((value): value is string => typeof value === "string" && value.length > 0);
    const cwd = [payload.cwd, payload.workspace_roots?.[0]]
      .find((value): value is string => typeof value === "string" && value.length > 0);
    return { cwd: cwd ?? null, file: candidate ?? null };
  } catch {
    return { cwd: null, file: null };
  }
}

/** Cursor's hook output: feedback goes in as context after the tool result; a clean file prints nothing. */
export function cursorHookOutput(result: HookResult): string | null {
  return result.message ? JSON.stringify({ additional_context: result.message }) : null;
}

export function isStyleFile(path: string): boolean {
  return STYLE_FILE.test(path);
}

export function formatHookFeedback(file: string, check: DriftCheck): string {
  const lines = [`Buoy: ${check.summary.total} design drift issue${check.summary.total === 1 ? "" : "s"} in ${file}`];
  for (const issue of check.issues.slice(0, 15)) {
    const where = issue.line ? `:${issue.line}` : "";
    const fix = issue.suggested ? ` -> use ${issue.suggested}` : issue.tokenSuggestions?.[0] ? ` -> ${issue.tokenSuggestions[0]}` : "";
    lines.push(`- ${issue.file}${where} ${issue.message}${fix}`);
  }
  if (check.issues.length > 15) lines.push(`- ... and ${check.issues.length - 15} more`);
  lines.push(check.summary.fixable > 0
    ? "Replace the literal values with the tokens above, then continue."
    : "No token holds these values. Use the nearest token from list_design_tokens, or keep the value if it is deliberate.");
  return lines.join("\n");
}

/**
 * The one stderr line for a hook that could not run. A rejected .buoy.yaml
 * names the file and the problem, so a team whose config is refused learns
 * why their drift.ignore is not applied instead of the hook going quiet.
 */
export function hookErrorLine(error: unknown): string {
  if (error instanceof ConfigFileError) {
    return `Buoy hook skipped: invalid config ${error.configPath}: ${error.problem}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split("\n").find((line) => line.trim().length > 0) ?? message;
  return `Buoy hook skipped: ${firstLine.trim()}`;
}

export interface HookResult {
  exitCode: 0 | 2;
  message: string | null;
}

export async function runHook(cwd: string, file: string | null): Promise<HookResult> {
  if (!file || !isStyleFile(file)) return { exitCode: 0, message: null };
  const project = await loadProject(cwd);
  // Relative paths come from the caller's directory, which may not be the project root.
  const absolute = isAbsolute(file) ? file : resolve(cwd, file);
  const inProject = relative(project.projectRoot, absolute);
  if (inProject.startsWith("..") || isAbsolute(inProject) || NOT_SOURCE.test(inProject.split("\\").join("/"))) {
    return { exitCode: 0, message: null };
  }
  const full = await checkDrift(project, [absolute]);
  // Only what this edit changed: an agent touching one line of an old file
  // should not be sent after every literal already in it.
  const changed = fileChangedLines(project.projectRoot, absolute);
  const check = changed === null ? full : onlyLines(full, changed);
  if (check.summary.total === 0) return { exitCode: 0, message: null };
  // Name the file the way the issue lines do: Cursor sends absolute paths.
  return { exitCode: 2, message: formatHookFeedback(inProject.split("\\").join("/"), check) };
}

/** The same check restricted to the given lines, with the summary recounted. */
export function onlyLines(check: DriftCheck, lines: Set<number>): DriftCheck {
  const issues = check.issues.filter((issue) => issue.line !== undefined && lines.has(issue.line));
  return {
    ...check,
    issues,
    summary: {
      total: issues.length,
      critical: issues.filter((i) => i.severity === "critical").length,
      warning: issues.filter((i) => i.severity === "warning").length,
      info: issues.filter((i) => i.severity === "info").length,
      fixable: issues.filter((i) => i.suggested || i.tokenSuggestions).length,
    },
  };
}
