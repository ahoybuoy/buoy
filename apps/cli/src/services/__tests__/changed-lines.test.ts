import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addedLinesFromDiff, fileChangedLines, stagedChangedLines } from "../changed-lines.js";
import { IntentJudge } from "../intent-judge.js";
import { runHook } from "../../mcp/hook.js";

function repo(): { dir: string; git: (...args: string[]) => void } {
  const dir = mkdtempSync(join(tmpdir(), "buoy-changed-"));
  const git = (...args: string[]) => { execFileSync("git", args, { cwd: dir, stdio: "ignore" }); };
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  return { dir, git };
}

describe("addedLinesFromDiff", () => {
  it("reads new-side line ranges per file", () => {
    const diff = [
      "diff --git a/src/a.css b/src/a.css",
      "--- a/src/a.css",
      "+++ b/src/a.css",
      "@@ -3 +3 @@",
      "@@ -10,0 +11,2 @@",
      "@@ -20,2 +22,0 @@",
      "diff --git a/old.css b/old.css",
      "--- a/old.css",
      "+++ /dev/null",
      "@@ -1,3 +0,0 @@",
    ].join("\n");
    expect([...addedLinesFromDiff(diff).get("src/a.css")!]).toEqual([3, 11, 12]);
    expect(addedLinesFromDiff(diff).has("old.css")).toBe(false);
  });
});

describe("changed lines in a real repository", () => {
  it("finds staged hunks and unstaged edits against HEAD", () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, "a.css"), ".a {\n  color: #111111;\n}\n");
    git("add", ".");
    git("commit", "-q", "-m", "init");
    writeFileSync(join(dir, "a.css"), ".a {\n  color: #111111;\n  margin: 13px;\n}\n");
    expect([...fileChangedLines(dir, "a.css")!]).toEqual([3]);
    git("add", "a.css");
    expect([...stagedChangedLines(dir)!.get("a.css")!]).toEqual([3]);
    writeFileSync(join(dir, "new.css"), ".n { color: #222222; }\n");
    expect(fileChangedLines(dir, "new.css")).toBeNull(); // untracked: every line is new
  });

  it("judge scope skips values outside the changed lines without noting them", () => {
    const judge = new IntentJudge("/r", { history: false, scope: new Map([["a.css", new Set([3])]]) });
    expect(judge.skip("a.css", 2, { property: "color", value: "#111111" }, [".a {", "  color: #111111;", "  margin: 13px;"])).toBe(true);
    expect(judge.skip("a.css", 3, { property: "margin", value: "13px" }, [".a {", "  color: #111111;", "  margin: 13px;"])).toBe(false);
    expect(judge.noted).toEqual([]);
  });

  it("the agent hook reports only what the edit added", async () => {
    const { dir, git } = repo();
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "h", dependencies: { react: "18" } }));
    writeFileSync(join(dir, "src", "tokens.css"), ":root { --brand: #2563eb; }\n");
    writeFileSync(join(dir, "src", "Old.tsx"), "export const Old = () => <div style={{ color: '#2563eb' }} />;\n");
    git("add", ".");
    git("commit", "-q", "-m", "init");
    writeFileSync(join(dir, "src", "Old.tsx"),
      "export const Old = () => <div style={{ color: '#2563eb' }} />;\nexport const New = () => <p style={{ color: '#2563eb' }} />;\n");
    const result = await runHook(dir, "src/Old.tsx");
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain("1 design drift issue");
    expect(result.message).toContain("src/Old.tsx:2");
    expect(result.message).not.toContain("src/Old.tsx:1 ");
  }, 60_000);
});
