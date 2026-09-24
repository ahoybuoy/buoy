/**
 * Claude Code PostToolUse hook: after the agent edits a file, check that
 * file for drift and hand the issues back as feedback (exit code 2). Other
 * agents can call `buoy mcp hook --file <path>` the same way.
 */
import { isAbsolute, relative, resolve } from "node:path";
import { checkDrift, loadProject, type DriftCheck } from "./project.js";
import { fileChangedLines } from "../services/changed-lines.js";

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
  return { exitCode: 2, message: formatHookFeedback(file, check) };
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
