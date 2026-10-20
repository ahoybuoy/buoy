/**
 * Design context for one file, sized for an agent's prompt.
 *
 * A full token list (or a DESIGN.md) costs thousands of tokens on every
 * request and gets lost in long prompts. An agent about to edit a file only
 * needs what that file touches: the tokens already used there and next to
 * it, the scale steps for the kinds of values it contains, the components it
 * could reuse, and the drift already in it. This builds that, deterministic
 * and small.
 */
import { basename, dirname } from "node:path";
import type { Component, DesignToken } from "@buoy-design/core";
import { formatTokenValue, type DriftIssue } from "./project.js";

export interface SourceFile {
  /** Repository-relative path. */
  path: string;
  content: string;
}

export interface FileContextInput {
  file: SourceFile;
  /** Other source files in the same directory (and its parent), for "used nearby". */
  neighbors: SourceFile[];
  tokens: DesignToken[];
  components: Component[];
  /** Drift already in the file, from check_ui_against_design_system's engine. */
  issues: DriftIssue[];
}

/**
 * Compact on purpose: one short string per entry ("--color-brand #1a73e8 ×3")
 * instead of objects that repeat category and source path, so the context an
 * agent pulls stays a few hundred tokens even for large systems.
 */
export interface FileContext {
  file: string;
  /** Tokens this file already references, most used first: "name value ×uses". */
  usedHere: string[];
  /** Tokens neighbouring files reference that this one does not: "name value ×uses". */
  usedNearby: string[];
  /** Ordered steps per category the file deals in, e.g. spacing: ["--space-1 4px", ...]. */
  scales: Record<string, string[]>;
  /** Components to reuse before rebuilding: "Name path", "(imported)" when the file already imports it. */
  components: string[];
  /** Drift already in the file, at most a few. */
  existingIssues: { total: number; top: string[] };
  note: string;
}

const MAX_USED = 12;
const MAX_NEARBY = 8;
const MAX_STEPS = 10;
const MAX_COMPONENTS = 12;
const MAX_ISSUES = 5;
/** Categories whose tokens form an ordered scale worth listing as steps. */
const ORDERED_CATEGORIES = new Set(["spacing", "typography", "border", "sizing"]);
/** Letter-spacing and line-height tokens are often categorised as spacing but are not spacing steps. */
const NOT_A_STEP = /(?:^|-)(?:tracking|leading|letter-spacing|line-height)(?:-|$)/;

/**
 * Tailwind v4 utilities each token namespace feeds: `--color-buoy` is used as
 * `bg-buoy` or `text-buoy`, `--text-sm` only as `text-sm`. Matching only the
 * namespace's own utilities keeps `--text-sm` from counting `rounded-sm`.
 */
const UTILITIES_BY_NAMESPACE: Array<[RegExp, string]> = [
  [/^colors?-/, "bg|text|border(?:-[trblxyse])?|ring|ring-offset|outline|fill|stroke|accent|caret|decoration|divide|placeholder|shadow|from|via|to"],
  [/^(?:spacing|space)-/, "-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|w|h|min-w|max-w|min-h|max-h|size|scroll-[mp][xytrbl]?)"],
  [/^(?:text|font-size)-/, "text"],
  [/^font-/, "font"],
  [/^leading-/, "leading"],
  [/^tracking-/, "tracking"],
  [/^(?:radius|rounded)-/, "rounded(?:-[trblse]|-[tb][lr]|-[se][se])?"],
  [/^shadow-/, "shadow"],
  [/^border-/, "border(?:-[trblxyse])?"],
  [/^z-/, "z"],
  [/^ease-/, "ease"],
  [/^duration-/, "duration"],
];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The ways a token can appear in source: `var(--color-buoy)`, `$space-2`, `bg-buoy`, `theme.colors.buoy`. */
export function tokenNeedles(name: string): RegExp[] {
  const bare = name.replace(/^--/, "").replace(/^\$/, "");
  const needles = [new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`, "g")];
  if (name.startsWith("--")) {
    for (const [namespace, utilities] of UTILITIES_BY_NAMESPACE) {
      if (!namespace.test(bare)) continue;
      const suffix = bare.replace(namespace, "");
      if (suffix) needles.push(new RegExp(`(?<![\\w-])(?:${utilities})-${escapeRegExp(suffix)}(?![\\w-])`, "g"));
      break;
    }
  }
  if (bare.includes(".")) {
    // Dotted names (colors.brand.500) appear as brand-500 in classes and as is in JS.
    const tail = bare.split(".").slice(1).join("-");
    if (tail) needles.push(new RegExp(`(?<![\\w-])[a-z]+-${escapeRegExp(tail)}(?![\\w-])`, "g"));
  }
  return needles;
}

function countUses(content: string, needles: RegExp[]): number {
  let n = 0;
  for (const re of needles) n += content.match(re)?.length ?? 0;
  return n;
}

/** Which kinds of values a file deals in, from what it already contains. */
export function categoriesIn(content: string): Set<string> {
  const found = new Set<string>();
  if (/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|\b(?:bg|text|border|ring|fill|stroke)-[a-z]+-?\d{0,3}\b|\bcolor\s*:/.test(content)) found.add("color");
  if (/\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space-[xy])-[\d[]|\b(?:padding|margin|gap)\w*\s*:/.test(content)) found.add("spacing");
  if (/\btext-(?:xs|sm|base|lg|[2-9]?xl|\[)|\bfont-?(?:size|weight)?\s*:|\bfontSize\b|\bleading-|\btracking-/.test(content)) found.add("typography");
  if (/\brounded(?:-|\b)|\bborder-?radius\b|\bborderRadius\b/.test(content)) found.add("border");
  if (/\bshadow(?:-|\b)|\bbox-shadow\b|\bboxShadow\b/.test(content)) found.add("shadow");
  return found;
}

/** Sort a scale by its numeric value so agents see the steps in order. */
function numericValue(token: DesignToken): number {
  const v = token.value;
  if (v.type === "spacing") return v.unit === "rem" || v.unit === "em" ? v.value * 16 : v.value;
  const m = /(-?\d*\.?\d+)\s*(px|rem|em)?/.exec(formatTokenValue(token));
  if (!m) return Number.POSITIVE_INFINITY;
  const n = parseFloat(m[1]!);
  return m[2] === "rem" || m[2] === "em" ? n * 16 : n;
}

function importsIn(content: string): Set<string> {
  const names = new Set<string>();
  for (const m of content.matchAll(/import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
    for (const part of m[1]!.replace(/[{}]/g, ",").split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^[A-Z]/.test(name)) names.add(name);
    }
  }
  return names;
}

function componentPath(component: Component): string | null {
  return "path" in component.source ? (component.source as { path: string }).path : null;
}

export function buildFileContext(input: FileContextInput): FileContext {
  const { file, neighbors, tokens, components, issues } = input;
  const live = tokens.filter((t) => !t.metadata?.deprecated);

  type Used = { name: string; value: string; category: string; uses: number };
  const here: Used[] = [];
  const nearby: Used[] = [];
  const neighborText = neighbors.map((n) => n.content).join("\n");
  for (const token of live) {
    const needles = tokenNeedles(token.name);
    const inFile = countUses(file.content, needles);
    if (inFile > 0) {
      here.push({ name: token.name, value: formatTokenValue(token), category: token.category, uses: inFile });
      continue;
    }
    const around = neighborText ? countUses(neighborText, needles) : 0;
    if (around > 0) nearby.push({ name: token.name, value: formatTokenValue(token), category: token.category, uses: around });
  }
  here.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
  nearby.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));

  // Scales only for the kinds of values this file actually deals in, and only
  // where steps have an order. Colours and shadows are not a ladder; the
  // used-here and used-nearby lists already carry the relevant ones.
  const wanted = categoriesIn(file.content);
  for (const t of here) wanted.add(t.category);
  const scales: Record<string, string[]> = {};
  for (const category of wanted) {
    if (!ORDERED_CATEGORIES.has(category)) continue;
    const steps = live
      .filter((t) => t.category === category && !NOT_A_STEP.test(t.name))
      .sort((a, b) => numericValue(a) - numericValue(b) || a.name.localeCompare(b.name))
      .map((t) => `${t.name} ${formatTokenValue(t)}`);
    if (steps.length > 0) scales[category] = steps.slice(0, MAX_STEPS);
  }

  const dir = dirname(file.path);
  const parent = dirname(dir);
  const imported = importsIn(file.content);
  const self = basename(file.path).replace(/\.\w+$/, "");
  const reusable = components
    .map((c) => ({ name: c.name, path: componentPath(c) }))
    .filter((c): c is { name: string; path: string } => c.path !== null && c.path !== file.path && c.name !== self)
    .map((c) => ({ ...c, imported: imported.has(c.name) }))
    .filter((c) => c.imported || dirname(c.path) === dir || dirname(c.path) === parent)
    .sort((a, b) => Number(b.imported) - Number(a.imported) || a.name.localeCompare(b.name));
  const seen = new Set<string>();
  const uniqueComponents = reusable.filter((c) => !seen.has(c.name) && seen.add(c.name)).slice(0, MAX_COMPONENTS);

  const note = live.length === 0
    ? "This repo has no design tokens; call list_design_tokens for the values its code already uses most."
    : "Write values from usedHere and scales instead of new literals; reuse a listed component before writing a new one. After editing, run check_ui_against_design_system on this file.";

  const used = (u: Used) => `${u.name} ${u.value} ×${u.uses}`;
  return {
    file: file.path,
    usedHere: here.slice(0, MAX_USED).map(used),
    usedNearby: nearby.slice(0, MAX_NEARBY).map(used),
    scales,
    components: uniqueComponents.map((c) => `${c.name} ${c.path}${c.imported ? " (imported)" : ""}`),
    existingIssues: {
      total: issues.length,
      top: issues.slice(0, MAX_ISSUES).map((i) =>
        `line ${i.line ?? "?"}: ${typeof i.current === "string" ? i.current : JSON.stringify(i.current ?? "")}${i.suggested ? ` -> ${i.suggested}` : ""}`),
    },
    note,
  };
}
