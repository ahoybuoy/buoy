import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Component } from "@buoy-design/core";
import { IntentJudge, formatNotedLine, summarizeNoted } from "../intent-judge.js";
import { lineOfLocation, withoutDeliberateValues } from "../drift-analysis.js";

function repo(files: Record<string, string>, message = "initial"): string {
  const dir = mkdtempSync(join(tmpdir(), "buoy-intent-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  for (const [path, content] of Object.entries(files)) writeFileSync(join(dir, path), content);
  git("add", ".");
  git("commit", "-q", "-m", message);
  return dir;
}

describe("IntentJudge", () => {
  it("sets aside commented values and records why", () => {
    const dir = repo({ "a.css": ".a {\n  margin-top: 0.3rem; // align with the avatar baseline\n  color: #333;\n}\n" });
    const judge = new IntentJudge(dir, { history: false });
    expect(judge.judge("a.css", 2, { property: "margin-top", value: "0.3rem" })?.kind).toBe("explained");
    expect(judge.judge("a.css", 3, { property: "color", value: "#333" })).toBeNull();
    expect(judge.noted).toEqual([
      { file: "a.css", line: 2, value: "0.3rem", kind: "explained", reason: "align with the avatar baseline" },
    ]);
  });

  it("reads the commit that introduced the line", () => {
    const dir = repo({ "b.css": ".b { margin-left: 6px; }\n" }, "fix(header): align logo with nav items");
    const judge = new IntentJudge(dir);
    expect(judge.judge("b.css", 1, { property: "margin-left", value: "6px" })).toEqual({
      kind: "history", reason: "commit: fix(header): align logo with nav items",
    });
  });

  it("ignores ordinary commits and can be switched off", () => {
    const dir = repo({ "c.css": ".c { margin-left: 6px; }\n" }, "feat: add header");
    expect(new IntentJudge(dir).judge("c.css", 1, { property: "margin-left", value: "6px" })).toBeNull();
    const aligned = repo({ "d.css": ".d { margin-left: 6px; }\n" }, "align logo");
    expect(new IntentJudge(aligned, { history: false }).judge("d.css", 1, { property: "margin-left", value: "6px" })).toBeNull();
  });

  it("lists a value once even when two scanners read the file", () => {
    const dir = repo({ "e.css": ".e { margin: 3px; }\n" });
    const judge = new IntentJudge(dir, { history: false });
    judge.judge("e.css", 1, { property: "margin", value: "3px" });
    judge.judge(join(dir, "e.css"), 1, { property: "margin", value: "3px" });
    expect(judge.noted).toHaveLength(1);
  });

  it("summarises for JSON and text", () => {
    const noted = [
      { file: "a", line: 1, value: "3px", kind: "optical-nudge" as const, reason: "" },
      { file: "a", line: 2, value: "#f60", kind: "explained" as const, reason: "brand colour" },
      { file: "b", line: 3, value: "2px", kind: "optical-nudge" as const, reason: "" },
    ];
    expect(summarizeNoted(noted).byKind).toEqual({ "optical-nudge": 2, explained: 1 });
    expect(formatNotedLine(noted)).toBe(
      "  3 values look deliberate and were not counted (2 2-3px optical nudges, 1 explained in a comment). --json lists them.",
    );
  });
});

describe("withoutDeliberateValues", () => {
  it("drops only the deliberate values from a component", () => {
    const dir = repo({ "Card.tsx": [
      "export const Card = () => (",
      "  // brand partner colour, must match their logo",
      "  <div style={{ color: '#ff6600', padding: '12px' }} />",
      ");",
    ].join("\n") });
    const component = {
      id: "c", name: "Card", source: { type: "react", path: "Card.tsx", exportName: "Card" },
      props: [], variants: [], tokens: [], dependencies: [],
      metadata: { hardcodedValues: [
        { type: "color", value: "#ff6600", property: "color", location: "line 3" },
        { type: "spacing", value: "12px", property: "padding", location: "line 3" },
      ] },
    } as unknown as Component;
    const judged = withoutDeliberateValues(component, new IntentJudge(dir, { history: false }));
    // One comment covers the whole line: both values on it are explained.
    expect(judged.metadata.hardcodedValues).toBeUndefined();
    expect(component.metadata.hardcodedValues).toHaveLength(2);
  });

  it("parses the location formats scanners write", () => {
    expect(lineOfLocation("line 12")).toBe(12);
    expect(lineOfLocation("src/a.tsx:12")).toBe(12);
    expect(lineOfLocation("src/a.tsx:12:4")).toBe(12);
    expect(lineOfLocation("template")).toBeNull();
  });
});
