import { describe, expect, it } from "vitest";
import type { DriftSignal } from "@buoy-design/core";
import { consolidateRepeatedPatterns, stylingClassCount } from "../repeated-patterns.js";

const pattern = (classes: string, locations: string[]): DriftSignal => ({
  id: `p:${classes}`, type: "repeated-pattern", severity: "info",
  source: { entityType: "component", entityId: classes, entityName: classes, location: locations[0]! },
  message: "", details: { occurrences: locations.length, locations }, detectedAt: new Date(),
} as unknown as DriftSignal);

const input = "block border-neutral-300 focus:border-neutral-500 focus:outline-none focus:ring-neutral-500 placeholder-neutral-400 rounded-md sm:text-sm w-full";

describe("consolidateRepeatedPatterns", () => {
  it("merges slight variations of one copied style into a single finding", () => {
    const out = consolidateRepeatedPatterns([
      pattern(input, ["a.tsx:1", "b.tsx:2", "c.tsx:3"]),
      pattern(`${input} border-red-300`, ["d.tsx:4", "e.tsx:5"]),
      pattern(`${input} bg-neutral-50`, ["f.tsx:6"]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.details.occurrences).toBe(6);
    expect(out[0]!.message).toContain("copied 6 times across 6 files in 3 slight variations");
    expect(out[0]!.message).toContain("Extract a shared component");
    expect(out[0]!.message).toContain('"border-neutral-300 focus:border-neutral-500');
  });

  it("drops effects and positioning that carry no styling", () => {
    const effect = "absolute inset-0 opacity-0 transition-[transform,opacity] translate-y-1";
    expect(stylingClassCount(effect.split(" "))).toBe(0);
    expect(consolidateRepeatedPatterns([pattern(effect, ["a:1", "b:1", "c:1", "d:1"])])).toEqual([]);
  });

  it("needs enough copies in enough files", () => {
    expect(consolidateRepeatedPatterns([pattern(input, ["a.tsx:1", "a.tsx:9", "b.tsx:2", "b.tsx:3"])])).toEqual([]);
  });
});
