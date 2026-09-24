/**
 * Repeated styling worth extracting into a shared component.
 *
 * The raw detector counts identical class strings. After the 2026-09 audit it
 * reported branches of one cn() call merged together ("cursor-pointer
 * cursor-not-allowed"), one copy-pasted input style six times as six
 * findings, and animation/positioning strings that are effects, not styling.
 * This keeps real duplicated styling and says what to do about it.
 */
import type { DriftSignal } from "@buoy-design/core";

export const REPEATED_PATTERN_MIN = { occurrences: 4, files: 3, classes: 4, stylingClasses: 3 };
const SIMILARITY = 0.75;

// Utilities that carry design decisions (colour, type, spacing, shape), as opposed
// to positioning, display, animation and interaction mechanics.
const STYLING = /^-?(bg|text|border|rounded|shadow|ring|outline|divide|font|leading|tracking|p[xytrblse]?|m[xytrblse]?|gap|space|decoration|placeholder|fill|stroke)(-|$)/;

function utilityOf(cls: string): string {
  return cls.replace(/^(?:(?:[^[\]:]|\[[^\]]*\])*:)*/, "");
}

export function stylingClassCount(classes: string[]): number {
  return classes.filter((c) => STYLING.test(utilityOf(c))).length;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

interface Cluster {
  pattern: string;
  classes: Set<string>;
  locations: string[];
  variants: number;
}

/** Merge near-identical patterns, drop non-styling ones, apply thresholds, and write useful messages. */
export function consolidateRepeatedPatterns(
  drifts: DriftSignal[],
  min = REPEATED_PATTERN_MIN,
): DriftSignal[] {
  const candidates = drifts
    .map((d) => ({
      pattern: d.source.entityName ?? "",
      locations: ((d.details?.locations as string[] | undefined) ?? []).slice(),
    }))
    .filter((c) => {
      const classes = c.pattern.split(/\s+/).filter(Boolean);
      return classes.length >= min.classes && stylingClassCount(classes) >= min.stylingClasses;
    })
    .sort((a, b) => b.locations.length - a.locations.length);

  const clusters: Cluster[] = [];
  for (const c of candidates) {
    const classes = new Set(c.pattern.split(/\s+/).filter(Boolean));
    const home = clusters.find((k) => jaccard(k.classes, classes) >= SIMILARITY);
    if (home) {
      home.locations.push(...c.locations);
      home.variants++;
    } else {
      clusters.push({ pattern: c.pattern, classes, locations: c.locations, variants: 1 });
    }
  }

  const out: DriftSignal[] = [];
  for (const k of clusters) {
    const locations = [...new Set(k.locations)];
    const files = [...new Set(locations.map((l) => l.split(":")[0]!))];
    if (locations.length < min.occurrences || files.length < min.files) continue;
    const classes = k.pattern.split(/\s+/).filter(Boolean);
    // Lead with the styling classes; the detector sorts alphabetically.
    const ordered = [...classes.filter((c) => STYLING.test(utilityOf(c))), ...classes.filter((c) => !STYLING.test(utilityOf(c)))];
    const shown = ordered.slice(0, 6).join(" ") + (ordered.length > 6 ? ` … (+${ordered.length - 6})` : "");
    const variantNote = k.variants > 1 ? ` in ${k.variants} slight variations` : "";
    const first = locations[0]!;
    out.push({
      id: `drift:repeated-pattern:${classes.slice(0, 8).join("-")}`,
      type: "repeated-pattern",
      severity: "info",
      source: { entityType: "component", entityId: `pattern:${classes.slice(0, 8).join("-")}`, entityName: k.pattern, location: first },
      message: `The same styling is copied ${locations.length} times across ${files.length} files${variantNote}: "${shown}". Extract a shared component or a variant so one change updates every copy.`,
      details: {
        occurrences: locations.length,
        locations,
        affectedFiles: files,
        suggestions: [
          `Create one component (or a cva/tailwind-variants variant) for this styling and use it in ${files.slice(0, 3).join(", ")}${files.length > 3 ? ` and ${files.length - 3} more` : ""}`,
        ],
      },
      detectedAt: new Date(),
    });
  }
  return out;
}
