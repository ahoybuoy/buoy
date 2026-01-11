import { describe, it, expect } from "vitest";
import {
  normalizeClassPattern,
  groupPatterns,
  detectRepeatedPatterns,
  type ClassOccurrence,
} from "./pattern-analyzer.js";

describe("normalizeClassPattern", () => {
  it("should sort classes alphabetically", () => {
    expect(normalizeClassPattern("flex items-center gap-2")).toBe("flex gap-2 items-center");
  });

  it("should handle single class", () => {
    expect(normalizeClassPattern("flex")).toBe("flex");
  });

  it("should trim whitespace", () => {
    expect(normalizeClassPattern("  flex   gap-2  ")).toBe("flex gap-2");
  });
});

describe("groupPatterns", () => {
  it("should group identical patterns", () => {
    const occurrences: ClassOccurrence[] = [
      { classes: "flex gap-2", file: "a.tsx", line: 1 },
      { classes: "gap-2 flex", file: "b.tsx", line: 5 },
      { classes: "flex gap-2", file: "c.tsx", line: 10 },
    ];
    const groups = groupPatterns(occurrences, "exact");
    expect(groups.size).toBe(1);
    expect(groups.get("flex gap-2")?.length).toBe(3);
  });
});

describe("detectRepeatedPatterns", () => {
  it("should return patterns appearing 3+ times by default", () => {
    const occurrences: ClassOccurrence[] = [
      { classes: "flex gap-2", file: "a.tsx", line: 1 },
      { classes: "flex gap-2", file: "b.tsx", line: 5 },
      { classes: "flex gap-2", file: "c.tsx", line: 10 },
      { classes: "p-4", file: "d.tsx", line: 1 },
    ];
    const drifts = detectRepeatedPatterns(occurrences, { minOccurrences: 3 });
    expect(drifts.length).toBe(1);
    expect(drifts[0]!.message).toContain("flex gap-2");
    expect(drifts[0]!.message).toContain("3 times");
  });

  it("should respect minOccurrences option", () => {
    const occurrences: ClassOccurrence[] = [
      { classes: "flex gap-2", file: "a.tsx", line: 1 },
      { classes: "flex gap-2", file: "b.tsx", line: 5 },
    ];
    const drifts = detectRepeatedPatterns(occurrences, { minOccurrences: 2 });
    expect(drifts.length).toBe(1);
  });

  it("should suggest utility for simple patterns (1-3 classes)", () => {
    const occurrences: ClassOccurrence[] = [
      { classes: "flex", file: "a.tsx", line: 1 },
      { classes: "flex", file: "b.tsx", line: 5 },
      { classes: "flex", file: "c.tsx", line: 10 },
    ];
    const drifts = detectRepeatedPatterns(occurrences, { minOccurrences: 3 });
    const suggestions = drifts[0]!.details.suggestions as string[];
    expect(suggestions.some(s => s.toLowerCase().includes("utility"))).toBe(true);
  });

  it("should suggest component for complex patterns (4+ classes)", () => {
    const occurrences: ClassOccurrence[] = [
      { classes: "flex items-center gap-2 text-sm font-medium", file: "a.tsx", line: 1 },
      { classes: "flex items-center gap-2 text-sm font-medium", file: "b.tsx", line: 5 },
      { classes: "flex items-center gap-2 text-sm font-medium", file: "c.tsx", line: 10 },
    ];
    const drifts = detectRepeatedPatterns(occurrences, { minOccurrences: 3 });
    const suggestions = drifts[0]!.details.suggestions as string[];
    expect(suggestions.some(s => s.toLowerCase().includes("component"))).toBe(true);
  });
});

describe("tight matching mode", () => {
  it("should group patterns with shadow variants together", () => {
    const occurrences: ClassOccurrence[] = [
      { classes: "flex items-center shadow-sm", file: "a.tsx", line: 1 },
      { classes: "flex items-center shadow-lg", file: "b.tsx", line: 5 },
      { classes: "flex items-center shadow-xl", file: "c.tsx", line: 10 },
    ];
    const groups = groupPatterns(occurrences, "tight");
    expect(groups.size).toBe(1);
  });

  it("should group patterns with gap variants together", () => {
    const occurrences: ClassOccurrence[] = [
      { classes: "flex gap-2", file: "a.tsx", line: 1 },
      { classes: "flex gap-4", file: "b.tsx", line: 5 },
      { classes: "flex gap-6", file: "c.tsx", line: 10 },
    ];
    const groups = groupPatterns(occurrences, "tight");
    expect(groups.size).toBe(1);
  });

  it("should group patterns with rounded variants together", () => {
    const occurrences: ClassOccurrence[] = [
      { classes: "bg-white rounded-sm", file: "a.tsx", line: 1 },
      { classes: "bg-white rounded-lg", file: "b.tsx", line: 5 },
      { classes: "bg-white rounded-full", file: "c.tsx", line: 10 },
    ];
    const groups = groupPatterns(occurrences, "tight");
    expect(groups.size).toBe(1);
  });

  it("should identify variants in drift details", () => {
    const occurrences: ClassOccurrence[] = [
      { classes: "flex gap-2", file: "a.tsx", line: 1 },
      { classes: "flex gap-4", file: "b.tsx", line: 5 },
      { classes: "flex gap-6", file: "c.tsx", line: 10 },
    ];
    const drifts = detectRepeatedPatterns(occurrences, { minOccurrences: 3, matching: "tight" });
    expect(drifts.length).toBe(1);
    // The details should include variants info
    expect(drifts[0]!.details.suggestions).toBeDefined();
  });
});
