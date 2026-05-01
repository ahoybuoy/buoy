import { describe, it, expect, vi, beforeEach } from "vitest";
import { lintDesignMd, type LintCliResult } from "../lint.js";

vi.mock("node:fs", async (orig) => ({
  ...(await orig<typeof import("node:fs")>()),
  readFileSync: vi.fn(),
}));

import { readFileSync } from "node:fs";

describe("lintDesignMd CLI logic", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns exit 0 and JSON for a clean file", () => {
    vi.mocked(readFileSync).mockReturnValue(
      `---\nname: Test\ncolors:\n  primary: "#000000"\n---\n`
    );
    const result: LintCliResult = lintDesignMd({ file: "DESIGN.md" });
    expect(result.exitCode).toBe(0);
    expect(result.json.summary.errors).toBe(0);
  });

  it("returns exit 1 when errors are found", () => {
    // invalid hex triggers core validation in @google/design.md@0.1.1.
    // Token-reference rules ({colors.foo}) are NOT enforced at this version,
    // so we use an invalid color value to drive the error path.
    vi.mocked(readFileSync).mockReturnValue(
      `---\ncolors:\n  primary: not-a-hex\n---\n`
    );
    const result = lintDesignMd({ file: "DESIGN.md" });
    expect(result.exitCode).toBe(1);
    expect(result.json.summary.errors).toBeGreaterThan(0);
  });
});
