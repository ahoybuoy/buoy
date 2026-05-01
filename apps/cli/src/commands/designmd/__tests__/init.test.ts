import { describe, it, expect } from "vitest";
import { generateDesignMd } from "../init.js";
import { parseDesignMd } from "@buoy-design/core";
import type { DesignToken } from "@buoy-design/core";

const fakeTokens: DesignToken[] = [
  {
    id: "color.primary",
    name: "primary",
    category: "color",
    value: { type: "string", raw: "#1A1C1E" } as any,
  } as any,
  {
    id: "spacing.md",
    name: "md",
    category: "spacing",
    value: { type: "string", raw: "16px" } as any,
  } as any,
];

describe("generateDesignMd", () => {
  it("emits a DESIGN.md that parses cleanly", () => {
    const md = generateDesignMd({ name: "MyApp", tokens: fakeTokens });
    expect(md).toContain("name: MyApp");
    // Hex preserved verbatim in the source; upstream lowercases on parse,
    // so we assert the source string and the parse round-trip separately.
    expect(md).toMatch(/primary:\s*"#1A1C1E"/);
    const parsed = parseDesignMd(md);
    expect(parsed.summary.errors).toBe(0);
    expect(parsed.designSystem.name).toBe("MyApp");
  });

  it("emits a placeholder Overview prose block", () => {
    const md = generateDesignMd({ name: "X", tokens: [] });
    expect(md).toMatch(/## Overview/);
  });

  it("emits a parseable file even with zero tokens", () => {
    const md = generateDesignMd({ name: "Empty", tokens: [] });
    const parsed = parseDesignMd(md);
    expect(parsed.summary.errors).toBe(0);
  });
});
