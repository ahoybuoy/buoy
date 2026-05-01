import { describe, it, expect, vi, beforeEach } from "vitest";
import { diffDesignMd } from "../diff.js";

vi.mock("node:fs", async (orig) => ({
  ...(await orig<typeof import("node:fs")>()),
  readFileSync: vi.fn(),
}));
import { readFileSync } from "node:fs";

describe("diffDesignMd", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns exit 0 when 'after' has no new errors/warnings vs 'before'", () => {
    const clean = `---\nname: A\ncolors:\n  primary: "#000000"\n---\n`;
    vi.mocked(readFileSync)
      .mockReturnValueOnce(clean)
      .mockReturnValueOnce(clean);
    const r = diffDesignMd({ before: "a.md", after: "b.md" });
    expect(r.exitCode).toBe(0);
    expect(r.json.regression).toBe(false);
  });

  it("returns exit 1 when 'after' introduces a regression", () => {
    const clean = `---\nname: A\ncolors:\n  primary: "#000000"\n---\n`;
    // Use 'not-a-hex' (real upstream-error trigger in v0.1.1)
    const broken = `---\nname: A\ncolors:\n  primary: not-a-hex\n---\n`;
    vi.mocked(readFileSync)
      .mockReturnValueOnce(clean)
      .mockReturnValueOnce(broken);
    const r = diffDesignMd({ before: "a.md", after: "b.md" });
    expect(r.exitCode).toBe(1);
    expect(r.json.regression).toBe(true);
  });

  it("reports added/removed/modified tokens by category", () => {
    const before = `---\nname: A\ncolors:\n  primary: "#000000"\n  secondary: "#111111"\nspacing:\n  md: 16px\n---\n`;
    const after = `---\nname: A\ncolors:\n  primary: "#222222"\n  tertiary: "#333333"\nspacing:\n  md: 16px\n---\n`;
    vi.mocked(readFileSync)
      .mockReturnValueOnce(before)
      .mockReturnValueOnce(after);
    const r = diffDesignMd({ before: "a.md", after: "b.md" });
    expect(r.json.tokens.colors).toEqual({
      added: ["tertiary"],
      removed: ["secondary"],
      modified: ["primary"],
    });
    expect(r.json.tokens.spacing).toEqual({
      added: [],
      removed: [],
      modified: [],
    });
  });
});
