/**
 * Hardcoded design values in stylesheets and Vue/Svelte <style> blocks.
 *
 * `drift check` analysed components and Tailwind classes but never looked
 * inside .css/.scss files, so `.btn { color: #3b82f6 }` next to
 * `--brand: #3b82f6` went unreported while PR reviews and the agent hook
 * flagged it. This runs the same per-line rules (mcp/file-check.ts) over
 * stylesheets and groups the results per file.
 */
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { glob } from "glob";
import type { DesignToken, DriftSignal } from "@buoy-design/core";
import { classifyFileContext } from "@buoy-design/core";
import type { IntentJudge } from "./intent-judge.js";
import { extractFileSignals, issuesFromSignals, type FileIssue } from "../mcp/file-check.js";

const STYLESHEETS = ["**/*.css", "**/*.scss", "**/*.vue", "**/*.svelte"];
const IGNORE = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.next/**", "**/out/**", "**/coverage/**",
  "**/vendor/**", "**/*.min.css", "**/public/**", "**/storybook-static/**"];
const MAX_BYTES = 400_000;

// Same categories the Tailwind rules count as design values. Motion (durations,
// easing), z-index, opacity and font-family keywords are mechanics or stacks,
// not token drift, in stylesheets as in utility classes.
const DESIGN_TYPES = new Set([
  "hardcoded-color", "hardcoded-spacing", "hardcoded-font-size", "hardcoded-radius", "hardcoded-shadow",
  "hardcoded-font-weight", "hardcoded-line-height", "hardcoded-letter-spacing", "hardcoded-border-width",
]);

/** `<style>` blocks of a Vue or Svelte file, as CSS padded with blank lines so line numbers stay true. */
export function styleBlocksAsCss(content: string): string {
  const lines = content.split("\n");
  const out = lines.map(() => "");
  let inStyle = false;
  lines.forEach((line, i) => {
    if (/<style[\s>]/i.test(line)) { inStyle = true; const after = line.replace(/.*<style[^>]*>/i, ""); if (after.trim()) out[i] = after; return; }
    if (/<\/style>/i.test(line)) { inStyle = false; out[i] = line.replace(/<\/style>.*/i, ""); return; }
    if (inStyle) out[i] = line;
  });
  return out.join("\n");
}

/**
 * `exclude` is the project's own exclude globs from .buoy.yaml sources: a
 * folder the user keeps out of the component scan stays out of this one too.
 */
export async function checkStylesheets(
  projectRoot: string,
  tokens: DesignToken[],
  exclude: string[] = [],
  judge?: IntentJudge,
): Promise<FileIssue[]> {
  const files = (await glob(STYLESHEETS, { cwd: projectRoot, ignore: [...IGNORE, ...exclude], nodir: true })).sort();
  const issues: FileIssue[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = await readFile(resolve(projectRoot, file), "utf-8");
    } catch {
      continue;
    }
    if (content.length > MAX_BYTES || classifyFileContext(file, content)) continue;
    const isComponent = /\.(vue|svelte)$/.test(file);
    const css = isComponent ? styleBlocksAsCss(content) : content;
    // Scan as CSS so the CSS property table applies; report the real path.
    // Line numbers match the real file (styleBlocksAsCss keeps them), so the
    // judge reads comments and history from the source as written.
    const lineJudge = judge
      ? (line: number, property: string, value: string, lines: readonly string[]) =>
        (judge.skip(file, line, { property, value }, lines) ? { kind: "allowlisted" as const, reason: "skipped" } : null)
      : undefined;
    const signals = extractFileSignals(css, isComponent ? `${file}.css` : file, lineJudge).map((s) => ({
      ...s,
      location: { ...s.location, path: file },
    }));
    issues.push(...issuesFromSignals(signals, tokens).filter((i) => DESIGN_TYPES.has(i.type)));
  }
  return issues;
}

const KIND: Record<string, string> = {
  "hardcoded-color": "colour", "hardcoded-spacing": "spacing", "hardcoded-font-size": "font size",
  "hardcoded-radius": "radius", "hardcoded-shadow": "shadow", "hardcoded-font-weight": "font weight",
  "hardcoded-line-height": "line height", "hardcoded-letter-spacing": "letter spacing", "hardcoded-font-family": "font family",
  "hardcoded-z-index": "z-index", "hardcoded-border-width": "border width", "hardcoded-opacity": "opacity",
  "hardcoded-motion-duration": "duration", "hardcoded-motion-easing": "easing",
};

/** One drift per file, like the Tailwind findings: names the values and any exact token. */
export function stylesheetIssuesToDrifts(issues: FileIssue[], projectRoot: string): DriftSignal[] {
  const byFile = new Map<string, FileIssue[]>();
  for (const issue of issues) byFile.set(issue.file, [...(byFile.get(issue.file) ?? []), issue]);
  const drifts: DriftSignal[] = [];
  for (const [file, list] of byFile) {
    const path = relative(projectRoot, resolve(projectRoot, file)) || file;
    const kinds = [...new Set(list.map((i) => KIND[i.type] ?? i.type.replace(/^hardcoded-/, "")))];
    const values = [...new Set(list.map((i) => (i.suggested ? `${i.current} (use ${i.suggested})` : i.current)))];
    const shown = values.slice(0, 4).join(", ") + (values.length > 4 ? ` and ${values.length - 4} more` : "");
    const withToken = list.filter((i) => i.suggested);
    drifts.push({
      id: `drift:hardcoded-value:stylesheet:${path}`,
      type: "hardcoded-value",
      severity: withToken.length > 0 || kinds.includes("colour") ? "warning" : "info",
      source: { entityType: "component", entityId: `stylesheet:${path}`, entityName: path, location: `${path}:${list[0]!.line}` },
      message: `Hardcoded ${kinds.join(" / ")} in ${path}: ${shown}.`,
      details: {
        affectedFiles: list.map((i) => `${KIND[i.type] ?? i.type}: ${i.current} (line ${i.line})`),
        tokenSuggestions: withToken.length ? [...new Set(withToken.map((i) => `${i.current} → ${i.suggested}`))] : undefined,
        suggestions: [withToken.length ? "Replace each value with the token that already has it" : "Use a design token instead of the literal value"],
      },
      detectedAt: new Date(),
    });
  }
  return drifts;
}
