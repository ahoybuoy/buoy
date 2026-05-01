import { describe, it, expect } from "vitest";
import { parseDesignMd, type DesignMdResult } from "./adapter.js";

const FIXTURE = `---
name: Heritage
colors:
  primary: "#1A1C1E"
  tertiary: "#B8422E"
spacing:
  md: 16px
---

## Overview

A test fixture.
`;

describe("parseDesignMd", () => {
  it("parses tokens, findings, and summary from a valid DESIGN.md", () => {
    const result: DesignMdResult = parseDesignMd(FIXTURE);

    expect(result.designSystem.name).toBe("Heritage");
    // Upstream linter lowercases hex values during parse.
    expect(result.designSystem.colors?.primary?.toLowerCase()).toBe("#1a1c1e");
    expect(result.designSystem.spacing?.md).toBe("16px");

    expect(result.summary).toEqual(
      expect.objectContaining({ errors: expect.any(Number) })
    );
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it("returns errors for malformed front matter", () => {
    const broken = `---\ncolors:\n  primary: not-a-hex\n---\n`;
    const result = parseDesignMd(broken);
    // Either lint surfaces the bad value as a finding, or parse rejects.
    // Adapter contract: never throws — always returns a result.
    expect(result.summary.errors + result.summary.warnings).toBeGreaterThan(0);
  });
});
