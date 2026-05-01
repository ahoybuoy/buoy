import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportDesignMd } from "../export.js";

vi.mock("node:fs", async (orig) => ({
  ...(await orig<typeof import("node:fs")>()),
  readFileSync: vi.fn(),
}));
import { readFileSync } from "node:fs";

const FIXTURE = `---
name: Test
colors:
  primary: "#1A1C1E"
spacing:
  md: 16px
rounded:
  md: 8px
---
`;

describe("exportDesignMd", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exports tailwind theme JSON", () => {
    vi.mocked(readFileSync).mockReturnValue(FIXTURE);
    const r = exportDesignMd({ file: "DESIGN.md", format: "tailwind" });
    expect(r.exitCode).toBe(0);
    const out = JSON.parse(r.stdout);
    // upstream lowercases hex
    expect(out.theme.colors.primary).toBe("#1a1c1e");
    expect(out.theme.spacing.md).toBe("16px");
    expect(out.theme.borderRadius.md).toBe("8px");
  });

  it("exports DTCG tokens JSON", () => {
    vi.mocked(readFileSync).mockReturnValue(FIXTURE);
    const r = exportDesignMd({ file: "DESIGN.md", format: "dtcg" });
    expect(r.exitCode).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.color.primary.$value).toBe("#1a1c1e");
    expect(out.color.primary.$type).toBe("color");
    expect(out.dimension.md.$value).toBe("16px");
    expect(out.dimension.md.$type).toBe("dimension");
  });

  it("returns exit 1 and the lint result when input has errors", () => {
    vi.mocked(readFileSync).mockReturnValue(
      `---\ncolors:\n  primary: not-a-hex\n---\n`,
    );
    const r = exportDesignMd({ file: "DESIGN.md", format: "tailwind" });
    expect(r.exitCode).toBe(1);
    // stdout should contain the lint result as JSON, not a tailwind theme
    const parsed = JSON.parse(r.stdout);
    expect(parsed).toHaveProperty("summary");
    expect(parsed.summary.errors).toBeGreaterThan(0);
  });
});
