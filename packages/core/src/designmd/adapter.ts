import { lint } from "@google/design.md/linter";
import type {
  DesignMdResult,
  DesignMdFinding,
  DesignMdSeverity,
  DesignMdSummary,
  DesignMdSystem,
  DesignMdToken,
} from "./types.js";

type AnyRec = Record<string, unknown>;

function mapToRecord<V>(m: unknown): Record<string, V> | undefined {
  if (m instanceof Map) return Object.fromEntries(m) as Record<string, V>;
  if (m && typeof m === "object") return m as Record<string, V>;
  return undefined;
}

function dimensionToString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as AnyRec;
    if (typeof o.value === "number" && typeof o.unit === "string") {
      return `${o.value}${o.unit}`;
    }
  }
  return undefined;
}

function colorsRecord(m: unknown): Record<string, string> | undefined {
  const rec = mapToRecord<unknown>(m);
  if (!rec) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v && typeof v === "object" && typeof (v as AnyRec).hex === "string") {
      out[k] = (v as AnyRec).hex as string;
    } else if (typeof v === "string") {
      out[k] = v;
    }
  }
  return out;
}

function dimensionsRecord(m: unknown): Record<string, string> | undefined {
  const rec = mapToRecord<unknown>(m);
  if (!rec) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    const s = dimensionToString(v);
    if (s !== undefined) out[k] = s;
  }
  return out;
}

function typographyRecord(
  m: unknown
): Record<string, DesignMdToken> | undefined {
  const rec = mapToRecord<unknown>(m);
  if (!rec) return undefined;
  const out: Record<string, DesignMdToken> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v && typeof v === "object") out[k] = v as DesignMdToken;
  }
  return out;
}

function componentsRecord(
  m: unknown
): Record<string, Record<string, string>> | undefined {
  const rec = mapToRecord<unknown>(m);
  if (!rec) return undefined;
  const out: Record<string, Record<string, string>> = {};
  for (const [k, v] of Object.entries(rec)) {
    const props = (v as AnyRec)?.properties;
    const propRec = mapToRecord<unknown>(props);
    if (!propRec) continue;
    const inner: Record<string, string> = {};
    for (const [pk, pv] of Object.entries(propRec)) {
      if (typeof pv === "string") inner[pk] = pv;
      else {
        const s = dimensionToString(pv);
        if (s !== undefined) inner[pk] = s;
        else if (pv && typeof pv === "object" && typeof (pv as AnyRec).hex === "string") {
          inner[pk] = (pv as AnyRec).hex as string;
        }
      }
    }
    out[k] = inner;
  }
  return out;
}

function normalizeDesignSystem(raw: unknown): DesignMdSystem {
  const r = (raw ?? {}) as AnyRec;
  const sys: DesignMdSystem = {};
  if (typeof r.version === "string") sys.version = r.version;
  if (typeof r.name === "string") sys.name = r.name;
  if (typeof r.description === "string") sys.description = r.description;
  const colors = colorsRecord(r.colors);
  if (colors) sys.colors = colors;
  const typography = typographyRecord(r.typography);
  if (typography) sys.typography = typography;
  const rounded = dimensionsRecord(r.rounded);
  if (rounded) sys.rounded = rounded;
  const spacing = dimensionsRecord(r.spacing);
  if (spacing) sys.spacing = spacing;
  const components = componentsRecord(r.components);
  if (components) sys.components = components;
  return sys;
}

function normalizeFindings(raw: unknown): DesignMdFinding[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((f) => {
    const o = (f ?? {}) as AnyRec;
    const sev = o.severity;
    const severity: DesignMdSeverity =
      sev === "error" || sev === "warning" || sev === "info" ? sev : "info";
    return {
      rule: typeof o.rule === "string" ? o.rule : "",
      severity,
      path: typeof o.path === "string" ? o.path : "",
      message: typeof o.message === "string" ? o.message : "",
    };
  });
}

function normalizeSummary(raw: unknown): DesignMdSummary {
  const o = (raw ?? {}) as AnyRec;
  const errors = typeof o.errors === "number" ? o.errors : 0;
  const warnings = typeof o.warnings === "number" ? o.warnings : 0;
  // Upstream uses `infos`; we expose `info`.
  const infoVal =
    typeof o.info === "number"
      ? o.info
      : typeof o.infos === "number"
        ? o.infos
        : 0;
  return { errors, warnings, info: infoVal };
}

/**
 * Parse and lint a DESIGN.md source string. Never throws — failures surface
 * as findings with severity "error".
 */
export function parseDesignMd(source: string): DesignMdResult {
  try {
    const report = lint(source) as unknown as AnyRec;
    return {
      designSystem: normalizeDesignSystem(report.designSystem),
      findings: normalizeFindings(report.findings),
      summary: normalizeSummary(report.summary),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      designSystem: {},
      findings: [
        { rule: "parse-error", severity: "error", path: "", message },
      ],
      summary: { errors: 1, warnings: 0, info: 0 },
    };
  }
}

export type {
  DesignMdResult,
  DesignMdFinding,
  DesignMdSummary,
  DesignMdSystem,
  DesignMdSeverity,
} from "./types.js";
