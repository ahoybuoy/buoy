/**
 * The UI map: how a codebase's UI hangs together, as nodes and edges.
 *
 *   token ──uses──▶ component ──renders──▶ component ──▶ … ──▶ page
 *
 * Built from what a drift scan already finds (components with the names they
 * render, design tokens, drift signals) plus one pass over each component file
 * for token references (Tailwind classes and var(--x)). Output is plain JSON so
 * any viewer can draw it; `buoy show map` prints it.
 */
import type { Component, DesignToken, DriftSignal } from "@buoy-design/core";

export type MapNodeKind = "token" | "icon" | "primitive" | "composite" | "page";

export interface MapNode {
  id: string;
  kind: MapNodeKind;
  name: string;
  /** Repo-relative file path (components) or the file that defines the token. */
  path?: string;
  line?: number;
  /** Token category (color, spacing, …). */
  category?: string;
  /** Token value for display, e.g. "#ededed" or "16px". */
  value?: string;
  /** Drift signals located in this component. */
  drift?: { count: number; types: Record<string, number>; examples: string[]; ids: string[] };
}

export interface MapEdge {
  source: string;
  target: string;
  type: "renders" | "uses";
  /** How many references (class names / var() calls) for "uses". */
  weight: number;
}

export interface SystemMap {
  version: 1;
  generatedAt: string;
  stats: {
    components: number;
    pages: number;
    primitives: number;
    icons: number;
    tokens: number;
    renders: number;
    uses: number;
    tokensUnused: number;
    /** Components (not pages or icons) no other scanned component renders. */
    componentsUnused: number;
    driftInComponents: number;
  };
  nodes: MapNode[];
  edges: MapEdge[];
}

export interface BuildUiMapInput {
  components: Component[];
  tokens: DesignToken[];
  drifts: DriftSignal[];
  /** Reads a repo-relative file; returns null when it can't. */
  readFile: (path: string) => string | null;
  now?: Date;
}

const PAGE_FILE = /(^|\/)(app|pages|routes|views|screens)\/(.*\/)?(page|layout|template|route|index|\+page|\+layout)\.(tsx|jsx|ts|js|vue|svelte|astro)$/;
const PAGES_DIR = /(^|\/)(pages|routes)\/.+\.(tsx|jsx|vue|astro|svelte)$/;
const ICON = /(^|\/)icons?\//;
const PRIMITIVE_DIR = /(^|\/)(ui|primitives|design-system|ds)\//;

const UTILITY_PREFIXES = new Set([
  "bg", "text", "border", "ring", "outline", "fill", "stroke", "from", "via", "to", "divide", "placeholder",
  "shadow", "accent", "caret", "decoration", "ring-offset", "p", "px", "py", "pt", "pr", "pb", "pl", "m", "mx",
  "my", "mt", "mr", "mb", "ml", "gap", "gap-x", "gap-y", "space-x", "space-y", "w", "h", "min-w", "min-h", "max-w",
  "max-h", "size", "rounded", "rounded-t", "rounded-b", "rounded-l", "rounded-r", "rounded-tl", "rounded-tr",
  "rounded-bl", "rounded-br", "font", "leading", "tracking", "z", "inset", "top", "right", "bottom", "left",
  "border-t", "border-b", "border-l", "border-r", "border-x", "border-y", "opacity", "duration", "ease", "blur",
  "drop-shadow", "scroll-m", "scroll-p",
]);

/** primary.DEFAULT, --primary, neutral.150 → primary, primary, neutral-150 */
export function tokenKey(name: string): string {
  return name
    .trim()
    .replace(/^--/, "")
    .replace(/[.-]DEFAULT$/i, "")
    .replace(/\./g, "-")
    .toLowerCase();
}

function tokenValue(token: DesignToken): string | undefined {
  const v = token.value as unknown as Record<string, unknown> | undefined;
  if (!v) return undefined;
  if (typeof v.hex === "string") return v.hex;
  if (v.value !== undefined && v.value !== null) return `${v.value}${typeof v.unit === "string" ? v.unit : ""}`;
  if (typeof v.raw === "string") return v.raw;
  return undefined;
}

/**
 * Token keys referenced in source text, with counts. Tailwind classes count
 * when a utility prefix is followed by a token key (bg-primary/50,
 * hover:text-neutral-150); var(--x) counts when x is a token key.
 */
export function tokenReferences(text: string, keys: Set<string>): Map<string, number> {
  const hits = new Map<string, number>();
  const add = (k: string) => hits.set(k, (hits.get(k) ?? 0) + 1);

  for (const m of text.matchAll(/var\(\s*--([\w-]+)/g)) {
    const k = m[1]!.toLowerCase();
    if (keys.has(k)) add(k);
  }

  for (const lit of text.matchAll(/["'`]([^"'`\n]{1,800})["'`]/g)) {
    for (const word of lit[1]!.split(/\s+/)) {
      if (!word || word.length > 80 || !/^[!-]?[a-z]/.test(word)) continue;
      let cls = word.split(":").pop()!.replace(/^[!-]+/, "");
      cls = cls.replace(/\/[\w.[\]]+$/, ""); // opacity modifier
      if (cls.includes("[")) continue; // arbitrary values aren't token references
      const parts = cls.split("-");
      for (let i = 1; i < parts.length; i++) {
        const prefix = parts.slice(0, i).join("-");
        if (!UTILITY_PREFIXES.has(prefix)) continue;
        const k = parts.slice(i).join("-");
        if (keys.has(k)) {
          add(k);
          break;
        }
      }
    }
  }
  return hits;
}

function pathOf(c: Component): string {
  return "path" in c.source && typeof c.source.path === "string" ? c.source.path : "";
}

function lineOf(c: Component): number | undefined {
  return "line" in c.source && typeof c.source.line === "number" ? c.source.line : undefined;
}

function packageOf(path: string): string {
  const parts = path.split("/");
  return parts[0] === "apps" || parts[0] === "packages" ? parts.slice(0, 2).join("/") : parts[0] ?? "";
}

function commonPrefix(a: string, b: string): number {
  const x = a.split("/");
  const y = b.split("/");
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  return n;
}

export function buildUiMap(input: BuildUiMapInput): SystemMap {
  const { tokens, drifts, readFile } = input;

  // One node per component; the scanner can report the same export twice.
  const seen = new Set<string>();
  const components = input.components.filter((c) => {
    if (!pathOf(c)) return false;
    const key = `${pathOf(c)}:${c.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const byName = new Map<string, Component[]>();
  const byFile = new Map<string, Component[]>();
  for (const c of components) {
    if (!byName.has(c.name)) byName.set(c.name, []);
    byName.get(c.name)!.push(c);
    if (!byFile.has(pathOf(c))) byFile.set(pathOf(c), []);
    byFile.get(pathOf(c))!.push(c);
  }
  const idOf = (c: Component) => `c:${pathOf(c)}:${c.name}`;

  // renders: resolve each dependency name to the closest component of that name.
  const rendersKey = new Set<string>();
  const renderedBy = new Map<string, number>();
  const rendersOut = new Map<string, number>();
  for (const c of components) {
    for (const dep of new Set(c.dependencies ?? [])) {
      const candidates = (byName.get(dep) ?? []).filter((d) => d !== c);
      if (candidates.length === 0) continue;
      const pkg = packageOf(pathOf(c));
      const target = candidates
        .map((d) => ({ d, score: (packageOf(pathOf(d)) === pkg ? 100 : 0) + commonPrefix(pathOf(d), pathOf(c)) }))
        .sort((a, b) => b.score - a.score || pathOf(a.d).localeCompare(pathOf(b.d)))[0]!.d;
      const key = `${idOf(c)}>${idOf(target)}`;
      if (rendersKey.has(key)) continue;
      rendersKey.add(key);
      edges.push({ source: idOf(c), target: idOf(target), type: "renders", weight: 1 });
      renderedBy.set(idOf(target), (renderedBy.get(idOf(target)) ?? 0) + 1);
      rendersOut.set(idOf(c), (rendersOut.get(idOf(c)) ?? 0) + 1);
    }
  }

  // tokens: one node per key (aliases across themes collapse into one).
  const tokenNode = new Map<string, MapNode>();
  for (const t of tokens) {
    const key = tokenKey(t.name);
    if (!key || tokenNode.has(key)) continue;
    tokenNode.set(key, {
      id: `t:${key}`,
      kind: "token",
      name: t.name.replace(/\.DEFAULT$/, ""),
      path: t.source && "path" in t.source ? (t.source as { path?: string }).path : undefined,
      category: t.category,
      value: tokenValue(t),
    });
  }
  const keys = new Set(tokenNode.keys());

  // uses: token references per file, given to the file's components.
  const usedTokens = new Set<string>();
  if (keys.size > 0) {
    for (const [path, comps] of byFile) {
      const text = readFile(path);
      if (!text) continue;
      const refs = tokenReferences(text, keys);
      for (const [key, count] of refs) {
        usedTokens.add(key);
        for (const c of comps) {
          edges.push({ source: `t:${key}`, target: idOf(c), type: "uses", weight: count });
        }
      }
    }
  }

  // drift: each located signal goes to the component whose definition starts
  // closest above its line in the same file.
  const driftOf = new Map<string, NonNullable<MapNode["drift"]>>();
  let driftInComponents = 0;
  for (const d of drifts) {
    const loc = d.source?.location;
    if (!loc) continue;
    const m = /^(.*?):(\d+)/.exec(loc);
    const path = m ? m[1]! : loc;
    const line = m ? Number(m[2]) : 0;
    const comps = byFile.get(path);
    if (!comps?.length) continue;
    const owner = [...comps]
      .sort((a, b) => (lineOf(b) ?? 0) - (lineOf(a) ?? 0))
      .find((c) => (lineOf(c) ?? 0) <= line) ?? comps[0]!;
    const entry = driftOf.get(idOf(owner)) ?? { count: 0, types: {}, examples: [], ids: [] };
    entry.count++;
    entry.ids.push(d.id);
    entry.types[d.type] = (entry.types[d.type] ?? 0) + 1;
    if (entry.examples.length < 3) entry.examples.push(d.message);
    driftOf.set(idOf(owner), entry);
    driftInComponents++;
  }

  let pages = 0;
  let primitives = 0;
  let componentsUnused = 0;
  for (const c of components) {
    const id = idOf(c);
    const p = pathOf(c);
    const isPage = PAGE_FILE.test(p) || PAGES_DIR.test(p);
    const used = renderedBy.get(id) ?? 0;
    const isIcon = (ICON.test(p) || /Icon$|^Icon[A-Z]/.test(c.name)) && !rendersOut.get(id);
    const kind: MapNodeKind = isPage
      ? "page"
      : isIcon
        ? "icon"
        : PRIMITIVE_DIR.test(p) || (used >= 5 && (rendersOut.get(id) ?? 0) <= 2)
        ? "primitive"
        : "composite";
    if (kind === "page") pages++;
    if (kind === "primitive") primitives++;
    if (kind !== "page" && kind !== "icon" && used === 0) componentsUnused++;
    nodes.push({ id, kind, name: c.name, path: p, line: lineOf(c), drift: driftOf.get(id) });
  }
  nodes.push(...tokenNode.values());

  return {
    version: 1,
    generatedAt: (input.now ?? new Date()).toISOString(),
    stats: {
      components: components.length,
      pages,
      primitives,
      icons: nodes.filter((n) => n.kind === "icon").length,
      tokens: tokenNode.size,
      renders: edges.filter((e) => e.type === "renders").length,
      uses: edges.filter((e) => e.type === "uses").length,
      tokensUnused: tokenNode.size - usedTokens.size,
      componentsUnused,
      driftInComponents,
    },
    nodes,
    edges,
  };
}
