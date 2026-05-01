import { describe, it, expect } from "vitest";
import { designMdToTokens } from "./to-tokens.js";
import type { DesignMdSystem } from "./types.js";

describe("designMdToTokens", () => {
  it("projects colors to DesignToken[] with category 'color'", () => {
    const ds: DesignMdSystem = {
      colors: { primary: "#1a1c1e", secondary: "#6c7278" },
    };
    const tokens = designMdToTokens(ds);
    expect(tokens).toHaveLength(2);

    const primary = tokens.find((t) => t.name === "primary");
    expect(primary?.category).toBe("color");
    expect(primary?.value).toEqual({ type: "color", hex: "#1a1c1e" });
    expect(primary?.source).toEqual({ type: "css", path: "DESIGN.md" });
  });

  it("projects spacing strings to DesignToken[] with category 'spacing'", () => {
    const ds: DesignMdSystem = {
      spacing: { md: "16px", lg: "24px" },
    };
    const tokens = designMdToTokens(ds);
    const md = tokens.find((t) => t.name === "md");
    expect(md?.category).toBe("spacing");
    expect(md?.value).toEqual({ type: "spacing", value: 16, unit: "px" });
  });

  it("supports rem and em units in spacing", () => {
    const ds: DesignMdSystem = { spacing: { sm: "0.5rem", xs: "0.25em" } };
    const tokens = designMdToTokens(ds);
    expect(tokens.find((t) => t.name === "sm")?.value).toEqual({
      type: "spacing",
      value: 0.5,
      unit: "rem",
    });
    expect(tokens.find((t) => t.name === "xs")?.value).toEqual({
      type: "spacing",
      value: 0.25,
      unit: "em",
    });
  });

  it("projects rounded values to category 'other' with raw value", () => {
    const ds: DesignMdSystem = { rounded: { md: "8px", lg: "12px" } };
    const tokens = designMdToTokens(ds);
    const md = tokens.find((t) => t.name === "md");
    expect(md?.category).toBe("other");
    expect(md?.value).toEqual({ type: "raw", value: "8px" });
  });

  it("skips typography and components for v1", () => {
    const ds: DesignMdSystem = {
      typography: { h1: { fontFamily: "x" } },
      components: { button: { backgroundColor: "y" } },
    };
    const tokens = designMdToTokens(ds);
    expect(tokens).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(designMdToTokens({})).toEqual([]);
  });

  it("skips spacing values that don't parse", () => {
    const ds: DesignMdSystem = { spacing: { weird: "not-a-dimension" } };
    expect(designMdToTokens(ds)).toEqual([]);
  });
});
