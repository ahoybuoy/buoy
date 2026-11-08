/**
 * buoy-snapshot/v1: the one document every Buoy visualizer reads.
 *
 * Everything a scan knows about a codebase's UI, as plain JSON: tokens with
 * values, components with props and kind, how they connect (renders / uses),
 * and every drift finding with its hardcoded values parsed out. `buoy show
 * snapshot` prints it; the cloud stores one per repository per scan and hands
 * it to sandboxed visualizers.
 *
 * Stability: fields are only ever added within v1. Removing or changing the
 * meaning of a field means buoy-snapshot/v2.
 */
import type { Component, DesignToken, DriftSignal } from "@buoy-design/core";
import { buildUiMap, type MapNodeKind } from "./ui-map.js";

export const SNAPSHOT_SCHEMA = "buoy-snapshot/v1" as const;

export interface SnapshotToken {
  /** Stable id, also used in edges: "t:<normalized name>" */
  id: string;
  name: string;
  category?: string;
  /** Display value: "#ededed", "16px", "222.2 47.4% 11.2%" (raw HSL channels), … */
  value?: string;
  /** File that defines the token. */
  path?: string;
  /** Components whose files reference this token. */
  usedBy: number;
}

export interface SnapshotComponent {
  /** Stable id, also used in edges: "c:<path>:<name>" */
  id: string;
  name: string;
  kind: Exclude<MapNodeKind, "token">;
  path: string;
  line?: number;
  props: string[];
  variants: string[];
  /** Components this one renders / components that render this one. */
  renders: number;
  renderedBy: number;
  /** Drift findings located in this component. */
  drift: number;
}

export interface SnapshotEdge {
  /** renders: component → component it renders. uses: token → component that references it. */
  type: "renders" | "uses";
  source: string;
  target: string;
  /** For uses: number of references in the component's file. */
  weight: number;
}

export interface SnapshotValue {
  /** CSS property or utility kind when known: "backgroundColor", "padding", "text". */
  property?: string;
  value: string;
  line?: number;
}

export interface SnapshotDrift {
  id: string;
  type: string;
  severity: string;
  message: string;
  path?: string;
  line?: number;
  /** Component id that owns the line, when the finding is inside a component. */
  component?: string;
  /** Hardcoded values named by the finding, parsed from its details. */
  values: SnapshotValue[];
  suggestions: string[];
}

export interface Snapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  generatedAt: string;
  cliVersion: string;
  stats: {
    tokens: number;
    components: number;
    pages: number;
    primitives: number;
    icons: number;
    composites: number;
    renders: number;
    uses: number;
    drift: number;
    tokensUnused: number;
    componentsUnused: number;
  };
  tokens: SnapshotToken[];
  components: SnapshotComponent[];
  edges: SnapshotEdge[];
  drift: SnapshotDrift[];
}

export interface BuildSnapshotInput {
  components: Component[];
  tokens: DesignToken[];
  drifts: DriftSignal[];
  readFile: (path: string) => string | null;
  cliVersion: string;
  now?: Date;
}

/**
 * "backgroundColor: #f9f9f9 (line 665)", "p-[13px] (line 4)", "colour: #fff (line 3)"
 * → { property, value, line }
 */
export function parseAffectedEntry(entry: string): SnapshotValue | null {
  const line = /\(line (\d+)\)\s*$/.exec(entry);
  const body = entry.replace(/\s*\(line \d+\)\s*$/, "").trim();
  if (!body) return null;
  const arbitrary = /^([!\w:-]*?)-?\[([^\]]+)\]$/.exec(body.split(/\s+/).pop()!);
  if (arbitrary && !body.includes(":")) {
    return { property: arbitrary[1] || undefined, value: arbitrary[2]!.replace(/_/g, " "), line: line ? Number(line[1]) : undefined };
  }
  const kv = /^([\w-]+)\s*:\s*(.+)$/.exec(body);
  if (kv) return { property: kv[1], value: kv[2]!.trim(), line: line ? Number(line[1]) : undefined };
  return { value: body, line: line ? Number(line[1]) : undefined };
}

function locate(loc: string | undefined): { path?: string; line?: number } {
  if (!loc) return {};
  const m = /^(.*?):(\d+)/.exec(loc);
  return m ? { path: m[1], line: Number(m[2]) } : { path: loc };
}

export function buildSnapshot(input: BuildSnapshotInput): Snapshot {
  const map = buildUiMap(input);
  const byId = new Map<string, Component>();
  for (const c of input.components) {
    const path = "path" in c.source && typeof c.source.path === "string" ? c.source.path : "";
    if (path) byId.set(`c:${path}:${c.name}`, c);
  }

  const renders = new Map<string, number>();
  const renderedBy = new Map<string, number>();
  const usedBy = new Map<string, number>();
  for (const e of map.edges) {
    if (e.type === "renders") {
      renders.set(e.source, (renders.get(e.source) ?? 0) + 1);
      renderedBy.set(e.target, (renderedBy.get(e.target) ?? 0) + 1);
    } else {
      usedBy.set(e.source, (usedBy.get(e.source) ?? 0) + 1);
    }
  }

  const driftOwner = new Map<string, string>();
  const tokens: SnapshotToken[] = [];
  const components: SnapshotComponent[] = [];
  for (const n of map.nodes) {
    if (n.kind === "token") {
      tokens.push({ id: n.id, name: n.name, category: n.category, value: n.value, path: n.path, usedBy: usedBy.get(n.id) ?? 0 });
      continue;
    }
    for (const id of n.drift?.ids ?? []) driftOwner.set(id, n.id);
    const c = byId.get(n.id);
    components.push({
      id: n.id,
      name: n.name,
      kind: n.kind,
      path: n.path ?? "",
      line: n.line,
      props: [...new Set((c?.props ?? []).map((p) => p.name))],
      variants: [...new Set((c?.variants ?? []).map((v) => v.name))],
      renders: renders.get(n.id) ?? 0,
      renderedBy: renderedBy.get(n.id) ?? 0,
      drift: n.drift?.count ?? 0,
    });
  }

  const drift: SnapshotDrift[] = input.drifts.map((d) => {
    const { path, line } = locate(d.source?.location);
    return {
      id: d.id,
      type: d.type,
      severity: d.severity,
      message: d.message,
      path,
      line,
      component: driftOwner.get(d.id),
      values: (d.details?.affectedFiles ?? []).map(parseAffectedEntry).filter((v): v is SnapshotValue => v !== null),
      suggestions: d.details?.suggestions ?? [],
    };
  });

  const s = map.stats;
  return {
    schema: SNAPSHOT_SCHEMA,
    generatedAt: map.generatedAt,
    cliVersion: input.cliVersion,
    stats: {
      tokens: s.tokens,
      components: s.components,
      pages: s.pages,
      primitives: s.primitives,
      icons: s.icons,
      composites: s.components - s.pages - s.primitives - s.icons,
      renders: s.renders,
      uses: s.uses,
      drift: drift.length,
      tokensUnused: s.tokensUnused,
      componentsUnused: s.componentsUnused,
    },
    tokens,
    components,
    edges: map.edges,
    drift,
  };
}
