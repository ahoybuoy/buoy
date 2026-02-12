import { describe, it, expect } from "vitest";
import { BuoyConfigSchema } from "../schema.js";

describe("experimental config", () => {
  it("should accept experimental.repeatedPatternDetection", () => {
    const config = {
      project: { name: "test" },
      experimental: {
        repeatedPatternDetection: true,
      },
    };
    const result = BuoyConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.experimental?.repeatedPatternDetection).toBe(true);
    }
  });

  it("should accept tokens.canonical glob patterns", () => {
    const config = {
      project: { name: "test" },
      sources: {
        tokens: {
          enabled: true,
          canonical: ["design-tokens/**/*.json", "tokens/variables.css"],
        },
      },
    };
    const result = BuoyConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sources.tokens?.canonical).toEqual([
        "design-tokens/**/*.json",
        "tokens/variables.css",
      ]);
    }
  });

  it("should default canonical to empty array", () => {
    const config = {
      project: { name: "test" },
      sources: {
        tokens: { enabled: true },
      },
    };
    const result = BuoyConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sources.tokens?.canonical).toEqual([]);
    }
  });

  it("should accept drift.types configuration", () => {
    const config = {
      project: { name: "test" },
      drift: {
        types: {
          "repeated-pattern": {
            enabled: true,
            severity: "warning",
            minOccurrences: 5,
            matching: "tight",
          },
          "hardcoded-value": {
            enabled: false,
          },
        },
      },
    };
    const result = BuoyConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});
