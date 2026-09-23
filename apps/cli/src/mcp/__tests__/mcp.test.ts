import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DesignToken, DriftSignal } from "@buoy-design/core";
import { findTokensByValue, normalizeValue, toIssue } from "../project.js";
import { extractFileSignals, issuesFromSignals } from "../file-check.js";
import { filePathFromHookPayload, formatHookFeedback, isStyleFile } from "../hook.js";
import { installClient, mergeClaudeHook, mergeMcpServers } from "../install.js";

function token(name: string, value: DesignToken["value"], category: DesignToken["category"]): DesignToken {
  return { id: name, name, category, value, source: { type: "css", path: "src/tokens.css" }, aliases: [], usedBy: [], metadata: {}, scannedAt: new Date() };
}

const tokens = [
  token("--color-primary", { type: "color", hex: "#1A73E8" }, "color"),
  token("--color-white", { type: "color", hex: "#ffffff" }, "color"),
  token("--space-2", { type: "spacing", value: 8, unit: "px" }, "spacing"),
  token("--radius-sm", { type: "raw", value: "4px" }, "border"),
];

describe("value matching", () => {
  it("normalises hex shorthand, case and whitespace", () => {
    expect(normalizeValue("#FFF")).toBe("#ffffff");
    expect(normalizeValue(" 8.0px ")).toBe("8px");
    expect(normalizeValue("0px")).toBe("0");
  });

  it("finds tokens by literal value regardless of formatting", () => {
    expect(findTokensByValue(tokens, "#fff").map((t) => t.name)).toEqual(["--color-white"]);
    expect(findTokensByValue(tokens, "#1a73e8").map((t) => t.name)).toEqual(["--color-primary"]);
    expect(findTokensByValue(tokens, "8px").map((t) => t.name)).toEqual(["--space-2"]);
    expect(findTokensByValue(tokens, "4px", "border").map((t) => t.name)).toEqual(["--radius-sm"]);
    expect(findTokensByValue(tokens, "4px", "spacing")).toEqual([]);
  });
});

describe("drift issues", () => {
  const drift = (location: string): DriftSignal => ({
    id: location,
    type: "hardcoded-value",
    severity: "warning",
    message: "Hardcoded color",
    source: { entityName: "Button", location },
    details: { actual: "#fff", suggestions: ["var(--color-white)"] },
    detectedAt: new Date(),
  } as unknown as DriftSignal);

  it("finds literal values line by line in CSS and JSX and names the token to use", () => {
    const css = ".hero {\n  color: #FFF;\n  padding: 8px;\n  background: var(--color-navy);\n  margin: 13px;\n  border: 1px solid #1A73E8;\n}\n";
    const cssIssues = issuesFromSignals(extractFileSignals(css, "src/a.css"), tokens);
    expect(cssIssues.map((i) => [i.line, i.current, i.suggested ?? null])).toEqual([
      [2, "#FFF", "var(--color-white)"],
      [3, "8px", "var(--space-2)"],
      [5, "13px", null],
      [6, "#1A73E8", "var(--color-primary)"],
    ]);
    expect(cssIssues[0].severity).toBe("warning");
    expect(cssIssues[2].severity).toBe("info");

    const tsx = 'export const A = () => <div style={{ color: "#1a73e8", padding: 8 }} />;\n';
    const tsxIssues = issuesFromSignals(extractFileSignals(tsx, "src/A.tsx"), tokens);
    expect(tsxIssues.map((i) => [i.current, i.suggested])).toEqual([
      ["#1a73e8", "var(--color-primary)"],
      ["8px", "var(--space-2)"],
    ]);
    expect(extractFileSignals("# hi", "README.md")).toEqual([]);

    // Mantine/Chakra style props and theme-object keys
    const props = "const SEV = { info: { bg: '#ffffff', fg: 'var(--x)' } };\n<Box p={8} radius=\"4px\" />\n";
    const propIssues = issuesFromSignals(extractFileSignals(props, "src/B.tsx"), tokens);
    expect(propIssues.map((i) => [i.line, i.current, i.suggested ?? null])).toEqual([
      [1, "#ffffff", "var(--color-white)"],
    ]);
  });

  it("flattens a drift into an agent-friendly issue", () => {
    expect(toIssue(drift("src/Button.tsx:12"))).toEqual({
      file: "src/Button.tsx", line: 12, type: "hardcoded-value", severity: "warning",
      message: "Hardcoded color", current: "#fff", suggested: "var(--color-white)",
    });
  });
});

describe("Claude Code hook", () => {
  it("extracts the edited file from the hook payload and ignores non-style files", () => {
    expect(filePathFromHookPayload(JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "/r/src/a.tsx" } }))).toBe("/r/src/a.tsx");
    expect(filePathFromHookPayload("not json")).toBeNull();
    expect(isStyleFile("src/a.tsx")).toBe(true);
    expect(isStyleFile("README.md")).toBe(false);
  });

  it("formats feedback with the fix on each line", () => {
    const text = formatHookFeedback("src/a.tsx", {
      issues: [{ file: "src/a.tsx", line: 4, type: "hardcoded-value", severity: "warning", message: "Hardcoded color #fff", suggested: "var(--color-white)" }],
      summary: { total: 1, critical: 0, warning: 1, info: 0, fixable: 1 },
      tokenCount: 4,
    });
    expect(text).toContain("1 design drift issue in src/a.tsx");
    expect(text).toContain("src/a.tsx:4 Hardcoded color #fff -> use var(--color-white)");
  });
});

describe("install", () => {
  it("merges into existing config without clobbering other servers or hooks", () => {
    const merged = mergeMcpServers({ mcpServers: { other: { command: "x" } }, extra: 1 });
    expect(Object.keys(merged.mcpServers as object)).toEqual(["other", "buoy"]);
    expect(merged.extra).toBe(1);
    const once = mergeClaudeHook({ hooks: { PostToolUse: [{ matcher: "Bash", hooks: [] }] } });
    const twice = mergeClaudeHook(once);
    expect((twice.hooks as { PostToolUse: unknown[] }).PostToolUse).toHaveLength(2);
  });

  it("writes the files for claude and cursor into the project", () => {
    const dir = mkdtempSync(join(tmpdir(), "buoy-mcp-"));
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, ".claude/settings.json"), JSON.stringify({ permissions: { allow: ["Bash"] } }));
    expect(installClient("claude", dir).files).toEqual([".mcp.json", ".claude/settings.json"]);
    expect(installClient("cursor", dir).files).toEqual([".cursor/mcp.json"]);
    const settings = JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8"));
    expect(settings.permissions.allow).toEqual(["Bash"]);
    expect(JSON.stringify(settings.hooks.PostToolUse)).toContain("mcp hook");
    expect(JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")).mcpServers.buoy.args).toContain("serve");
  });
});
