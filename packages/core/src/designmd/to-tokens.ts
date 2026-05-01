import type { DesignMdSystem } from "./types.js";
import type { DesignToken } from "../models/token.js";

const DIMENSION_RE = /^(-?\d*\.?\d+)(px|rem|em)$/;

function parseDimension(
  input: string,
): { value: number; unit: "px" | "rem" | "em" } | null {
  const m = DIMENSION_RE.exec(input.trim());
  if (!m) return null;
  return { value: parseFloat(m[1]!), unit: m[2] as "px" | "rem" | "em" };
}

function makeBaseToken(
  name: string,
  category: DesignToken["category"],
): Omit<DesignToken, "value"> {
  return {
    id: `designmd:${category}:${name}`,
    name,
    category,
    source: { type: "css", path: "DESIGN.md" },
    aliases: [],
    usedBy: [],
    metadata: {},
    scannedAt: new Date(),
  };
}

/**
 * Project a DESIGN.md design system to Buoy's DesignToken[] shape.
 *
 * v1 supports: colors, spacing, rounded.
 * Skipped: typography (complex shape), components (deferred).
 *
 * Note: rounded values are mapped to category "other" with `value: { type: "raw" }`
 * because there is no `radius`/`rounded` category in the existing token schema.
 */
export function designMdToTokens(ds: DesignMdSystem): DesignToken[] {
  const out: DesignToken[] = [];

  for (const [name, hex] of Object.entries(ds.colors ?? {})) {
    out.push({
      ...makeBaseToken(name, "color"),
      value: { type: "color", hex: String(hex) },
    });
  }

  for (const [name, raw] of Object.entries(ds.spacing ?? {})) {
    const dim = parseDimension(String(raw));
    if (!dim) continue;
    out.push({
      ...makeBaseToken(name, "spacing"),
      value: { type: "spacing", value: dim.value, unit: dim.unit },
    });
  }

  for (const [name, raw] of Object.entries(ds.rounded ?? {})) {
    out.push({
      ...makeBaseToken(name, "other"),
      value: { type: "raw", value: String(raw) },
    });
  }

  return out;
}
