import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DesignToken, DriftSignal } from "@buoy-design/core";
import { checkDrift, findRepoRoot, findTokensByValue, normalizeValue, toIssue } from "../project.js";
import { extractFileSignals, issuesFromSignals } from "../file-check.js";
import { filePathFromHookPayload, formatHookFeedback, isStyleFile, runHook } from "../hook.js";
import { installClient, mergeClaudeHook, mergeMcpServers } from "../install.js";
import { cssVariableFor, withCssVariableAliases } from "../../scan/token-aliases.js";

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

  it("treats rem and px as the same length at the default root size", () => {
    expect(findTokensByValue(tokens, "0.5rem").map((t) => t.name)).toEqual(["--space-2"]);
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
    const props = "const SEV = { info: { bg: '#ffffff', fg: 'var(--x)' } };\n<Text c=\"#1a73e8\" p={8} radius=\"4px\" />\n";
    const propIssues = issuesFromSignals(extractFileSignals(props, "src/B.tsx"), tokens);
    expect(propIssues.map((i) => [i.line, i.current, i.suggested ?? null])).toEqual([
      [1, "#ffffff", "var(--color-white)"],
      [2, "#1a73e8", "var(--color-primary)"],
      [2, "8px", "var(--space-2)"],
      [2, "4px", "var(--radius-sm)"],
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

  it("does not point to tokens above when none matched", () => {
    const text = formatHookFeedback("src/a.tsx", {
      issues: [{ file: "src/a.tsx", line: 4, type: "hardcoded-value", severity: "warning", message: "Hardcoded color #123456 (no matching token)" }],
      summary: { total: 1, critical: 0, warning: 1, info: 0, fixable: 0 },
      tokenCount: 4,
    });
    expect(text).not.toContain("tokens above");
    expect(text).toContain("No token holds these values");
  });

  function repoWithTokens(): string {
    const dir = mkdtempSync(join(tmpdir(), "buoy-hook-"));
    mkdirSync(join(dir, ".git"));
    mkdirSync(join(dir, "src", "deep"), { recursive: true });
    mkdirSync(join(dir, "node_modules", "x"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "h", dependencies: { react: "18" } }));
    writeFileSync(join(dir, "src", "tokens.css"), ":root { --brand: #2563eb; }\n");
    const jsx = 'export const A = () => <div style={{ color: "#2563eb" }} />;\n';
    writeFileSync(join(dir, "src", "deep", "A.tsx"), jsx);
    writeFileSync(join(dir, "node_modules", "x", "A.tsx"), jsx);
    return dir;
  }

  it("finds the repository root from a subdirectory", () => {
    const dir = repoWithTokens();
    expect(findRepoRoot(join(dir, "src", "deep"))).toBe(dir);
  });

  it("uses the repo's tokens when run from a subdirectory with a relative path", async () => {
    const dir = repoWithTokens();
    const result = await runHook(join(dir, "src", "deep"), "A.tsx");
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain("var(--brand)");
  }, 60_000);

  it("reports paths it could not find instead of calling them clean", async () => {
    const dir = repoWithTokens();
    const check = await checkDrift({ config: { project: { name: "h" } } as never, projectRoot: dir }, ["src/deep/Missing.tsx"], []);
    expect(check.notFound).toEqual(["src/deep/Missing.tsx"]);
    expect(check.note).toContain("no such file");
  });

  it("skips dependencies and files outside the project", async () => {
    const dir = repoWithTokens();
    expect(await runHook(dir, "node_modules/x/A.tsx")).toEqual({ exitCode: 0, message: null });
    expect(await runHook(join(dir, "src"), "/elsewhere/A.tsx")).toEqual({ exitCode: 0, message: null });
  }, 60_000);
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

describe("css variable aliases", () => {
  it("gives JSON token paths a --prefix twin the agent can use", () => {
    expect(cssVariableFor("color.gray.2", { prefix: "cds", separator: "-" })).toBe("--cds-color-gray-2");
    expect(cssVariableFor("--x", { prefix: "cds", separator: "-" })).toBeNull();
    const json = [token("color.white", { type: "color", hex: "#ffffff" }, "color")];
    const out = withCssVariableAliases(json, { prefix: "cds", separator: "-" });
    expect(out.map((t) => t.name)).toEqual(["color.white", "--cds-color-white"]);
    expect(findTokensByValue(out, "#fff").map((t) => t.name)).toContain("--cds-color-white");
  });
});

describe("design-value rules in the agent hook", () => {
  it("leaves artwork, email templates and SVG paint alone", () => {
    const logo = 'export const Logo = () => (<svg><path style={{ fill: "#fbf0df" }} /></svg>);\n';
    expect(extractFileSignals(logo, "src/Logo.tsx")).toEqual([]);
    const email = "import { Button } from '@react-email/components';\nexport const E = () => <Button style={{ color: '#ffffff' }} />;\n";
    expect(extractFileSignals(email, "src/Welcome.tsx")).toEqual([]);
    const card = 'export const C = () => (<div style={{ color: "#333333" }}><svg><path fill="#ff0000" /></svg></div>);\n';
    expect(extractFileSignals(card, "src/Card.tsx").map((s) => s.value)).toEqual(["#333333"]);
  });
});
