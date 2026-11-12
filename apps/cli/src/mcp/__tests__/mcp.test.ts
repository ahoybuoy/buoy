import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DesignToken, DriftSignal } from "@buoy-design/core";
import { checkDrift, findRepoRoot, findTokensByValue, normalizeValue, toIssue } from "../project.js";
import { applyFileIgnoreRules, extractFileSignals, issuesFromSignals, lineEdit, type FileIssue } from "../file-check.js";
import { cursorHookOutput, filePathFromHookPayload, formatHookFeedback, hookErrorLine, isStyleFile, parseCursorHookPayload, runHook } from "../hook.js";
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

  it("never offers a radius token for spacing or a border width", () => {
    // shadcn puts --radius (0.5rem) next to the spacing scale; 8px padding is not a radius.
    const shadcn = [
      token("--radius", { type: "raw", value: "0.5rem" }, "border"),
      token("--border-thick", { type: "raw", value: "2px" }, "border"),
      token("--rounded-xs", { type: "raw", value: "2px" }, "border"),
    ];
    const css = ".a {\n  padding: 8px;\n  border-radius: 8px;\n  border-width: 2px;\n  border-radius: 2px;\n}\n";
    const issues = issuesFromSignals(extractFileSignals(css, "src/a.css"), shadcn);
    expect(issues.map((i) => [i.line, i.current, i.suggested ?? null])).toEqual([
      [2, "8px", null],
      [3, "8px", "var(--radius)"],
      [4, "2px", "var(--border-thick)"],
      [5, "2px", "var(--rounded-xs)"],
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

  it("honours drift.ignore from a .buoy.yaml with no project section", async () => {
    const dir = repoWithTokens();
    mkdirSync(join(dir, "src", "legacy"));
    writeFileSync(join(dir, "src", "legacy", "Old.tsx"), 'export const O = () => <div style={{ color: "#2563eb" }} />;\n');
    writeFileSync(join(dir, ".buoy.yaml"), 'drift:\n  ignore:\n    - file: "src/legacy/**"\n');
    // The ignored folder is quiet; everything else is still checked.
    expect(await runHook(dir, "src/legacy/Old.tsx")).toEqual({ exitCode: 0, message: null });
    const other = await runHook(dir, "src/deep/A.tsx");
    expect(other.exitCode).toBe(2);
    expect(other.message).toContain("var(--brand)");
  }, 60_000);

  it("names the config file and the problem in one line when .buoy.yaml is invalid", async () => {
    const dir = repoWithTokens();
    const configPath = join(dir, ".buoy.yaml");
    writeFileSync(configPath, "drift:\n  failOn: sometimes\n");
    const error = await runHook(dir, "src/deep/A.tsx").then(() => null, (e: unknown) => e);
    expect(error).not.toBeNull();
    const line = hookErrorLine(error);
    expect(line).not.toContain("\n");
    expect(line).toContain(`invalid config ${configPath}`);
    expect(line).toContain('at "drift.failOn"');
  }, 60_000);

  it("keeps other hook failures to one line", () => {
    expect(hookErrorLine(new Error("first\n\nsecond"))).toBe("Buoy hook skipped: first");
    expect(hookErrorLine("plain")).toBe("Buoy hook skipped: plain");
  });

  it("skips dependencies and files outside the project", async () => {
    const dir = repoWithTokens();
    expect(await runHook(dir, "node_modules/x/A.tsx")).toEqual({ exitCode: 0, message: null });
    expect(await runHook(join(dir, "src"), "/elsewhere/A.tsx")).toEqual({ exitCode: 0, message: null });
  }, 60_000);
});

describe("Cursor hook", () => {
  function repoWithTokens(): string {
    const dir = mkdtempSync(join(tmpdir(), "buoy-cursor-hook-"));
    mkdirSync(join(dir, ".git"));
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "h", dependencies: { react: "18" } }));
    writeFileSync(join(dir, "src", "tokens.css"), ":root { --brand: #2563eb; }\n");
    writeFileSync(join(dir, "src", "A.tsx"), 'export const A = () => <div style={{ color: "#2563eb" }} />;\n');
    writeFileSync(join(dir, "src", "Clean.tsx"), 'export const B = () => <div style={{ color: "var(--brand)" }} />;\n');
    return dir;
  }

  it("reads the project root and edited path from a postToolUse payload", () => {
    const payload = { hook_event_name: "postToolUse", tool_name: "Write", tool_input: { file_path: "/r/src/a.tsx" }, cwd: "/r", workspace_roots: ["/w"] };
    expect(parseCursorHookPayload(JSON.stringify(payload))).toEqual({ cwd: "/r", file: "/r/src/a.tsx" });
    expect(parseCursorHookPayload(JSON.stringify({ tool_input: { path: "src/a.tsx" }, workspace_roots: ["/w"] }))).toEqual({ cwd: "/w", file: "src/a.tsx" });
    expect(parseCursorHookPayload(JSON.stringify({ hook_event_name: "afterFileEdit", file_path: "/w/a.css" }))).toEqual({ cwd: null, file: "/w/a.css" });
    expect(parseCursorHookPayload(JSON.stringify({ tool_name: "Shell", tool_input: { command: "ls" }, cwd: "/r" }))).toEqual({ cwd: "/r", file: null });
    expect(parseCursorHookPayload("not json")).toEqual({ cwd: null, file: null });
  });

  it("answers with additional_context, and prints nothing for a clean result", () => {
    expect(cursorHookOutput({ exitCode: 0, message: null })).toBeNull();
    expect(JSON.parse(cursorHookOutput({ exitCode: 2, message: "Buoy: 1 design drift issue" })!)).toEqual({ additional_context: "Buoy: 1 design drift issue" });
  });

  it("checks the edited file against the payload's project, not the hook's own folder", async () => {
    const dir = repoWithTokens();
    // The shape Cursor 2026.11 sends for an agent edit: no cwd, workspace_roots instead.
    const input = parseCursorHookPayload(JSON.stringify({
      hook_event_name: "postToolUse", tool_name: "Write",
      tool_input: { file_path: join(dir, "src", "A.tsx"), content: "..." },
      tool_output: "{}", workspace_roots: [dir],
    }));
    expect(input.cwd).toBe(dir);
    const drift = JSON.parse(cursorHookOutput(await runHook(input.cwd!, input.file))!);
    expect(drift.additional_context).toContain("design drift issue in src/A.tsx");
    expect(drift.additional_context).toContain("var(--brand)");
    expect(cursorHookOutput(await runHook(dir, join(dir, "src", "Clean.tsx")))).toBeNull();
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

  it("treats Tailwind @utility and @theme blocks as definitions, not drift", () => {
    // Formbricks globals.css: `@utility bg-auth-backdrop { background-color: #d9f6f4; }`
    const css = [
      "@utility bg-auth-backdrop {",
      "  background-color: #d9f6f4;",
      "}",
      "@theme { --color-brand: #123456; }",
      "@utility tight { margin: 3px; }",
      ".card {",
      "  color: #333333;",
      "  font-weight: 700;",
      "}",
    ].join("\n");
    expect(extractFileSignals(css, "src/globals.css").map((s) => s.value)).toEqual(["#333333"]);
  });
});

describe("exact line edits for agents", () => {
  const issue = (over: Partial<FileIssue>): FileIssue => ({
    file: "a.css", line: 3, type: "hardcoded-color", severity: "warning",
    message: "", current: "#fff", suggested: "var(--color-white)", ...over,
  });

  it("swaps the literal for the token", () => {
    expect(lineEdit(issue({}), "  color: #fff;")).toEqual({ line: 3, before: "  color: #fff;", after: "  color: var(--color-white);" });
  });

  it("works inside a Tailwind arbitrary value", () => {
    expect(lineEdit(issue({ file: "a.tsx" }), '<div className="bg-[#fff] p-2">')?.after).toBe('<div className="bg-[var(--color-white)] p-2">');
  });

  it("skips ambiguous lines, missing suggestions and JSX bare numbers", () => {
    expect(lineEdit(issue({}), "  border: 1px solid #fff; color: #fff;")).toBeNull();
    expect(lineEdit(issue({ suggested: undefined }), "  color: #fff;")).toBeNull();
    expect(lineEdit(issue({ file: "a.tsx", current: "16px", suggested: "var(--space-4)" }), "style={{ padding: 16 }}")).toBeNull();
  });

  it("only puts Sass variables into Sass files", () => {
    expect(lineEdit(issue({ suggested: "$white" }), "  color: #fff;")).toBeNull();
    expect(lineEdit(issue({ file: "a.scss", suggested: "$white" }), "  color: #fff;")?.after).toBe("  color: $white;");
  });

  it("attaches the edit through checkDrift", async () => {
    const dir = mkdtempSync(join(tmpdir(), "buoy-edit-"));
    writeFileSync(join(dir, "tokens.css"), ":root { --color-brand: #1a73e8; }\n");
    writeFileSync(join(dir, "card.css"), ".card {\n  color: #1a73e8;\n}\n");
    const tokens = [{ name: "--color-brand", category: "color", value: { type: "color", hex: "#1a73e8" }, source: { type: "css", path: "tokens.css" } }] as unknown as DesignToken[];
    const result = await checkDrift({ projectRoot: dir, config: {} } as never, ["card.css"], tokens);
    expect(result.issues[0]?.edit).toEqual({ line: 2, before: "  color: #1a73e8;", after: "  color: var(--color-brand);" });
  });
});

describe("values inside expressions (ternaries, &&/||, templates, cn)", () => {
  const values = (tsx: string) => extractFileSignals(tsx, "src/Status.tsx").map((s) => [s.location.line, s.value]);

  it("flags both branches of a ternary in a style object or style prop", () => {
    expect(values("<div style={{ color: isError ? '#dc2626' : '#16a34a' }} />")).toEqual([[1, "#dc2626"], [1, "#16a34a"]]);
    expect(values("<Box bg={isError ? '#dc2626' : '#16a34a'} p={dense ? 8 : 16} />")).toEqual([
      [1, "#dc2626"], [1, "#16a34a"], [1, "8px"], [1, "16px"],
    ]);
  });

  it("flags literals behind && / || / ?? and in template literals", () => {
    expect(values('<div style={{ color: isError && "#dc2626" }} />')).toEqual([[1, "#dc2626"]]);
    expect(values('<div style={{ color: c || "#dc2626", background: d ?? "#16a34a" }} />')).toEqual([[1, "#dc2626"], [1, "#16a34a"]]);
    expect(values("<div style={{ color: `#dc2626` }} />")).toEqual([[1, "#dc2626"]]);
    expect(values("<div style={{ border: `1px solid ${x ? '#dc2626' : '#16a34a'}` }} />")).toEqual([[1, "#dc2626"], [1, "#16a34a"]]);
  });

  it("reports each branch of a multi-line ternary on its own line", () => {
    const tsx = [
      "export const S = ({ isError }) => (",
      "  <div",
      "    style={{",
      "      color: isError",
      "        ? '#dc2626'",
      "        : '#16a34a',",
      "    }}",
      "    className={cn(",
      "      'p-2',",
      "      isError && 'bg-[#fef2f2]',",
      "    )}",
      "  />",
      ");",
    ].join("\n");
    expect(values(tsx)).toEqual([[5, "#dc2626"], [6, "#16a34a"], [10, "#fef2f2"]]);
  });

  it("flags Tailwind arbitrary values in className, ternaries and cn/clsx/cva calls", () => {
    expect(values('<div className="bg-[#dc2626] p-2" />')).toEqual([[1, "#dc2626"]]);
    expect(values("<div className={active ? 'bg-[#dc2626]' : 'bg-white'} />")).toEqual([[1, "#dc2626"]]);
    expect(values("<div className={clsx('p-[13px]', { 'text-[#16a34a]': ok })} />")).toEqual([[1, "13px"], [1, "#16a34a"]]);
    expect(values("const button = cva('rounded-[6px]', { variants: { intent: { danger: 'hover:bg-[#dc2626]' } } });")).toEqual([
      [1, "6px"], [1, "#dc2626"],
    ]);
    expect(values("<div className={`flex ${open ? 'border-[#e5e7eb]' : ''} text-[14px]`} />")).toEqual([[1, "#e5e7eb"], [1, "14px"]]);
  });

  it("names the matching token and gives an exact edit for a class value", () => {
    const tsx = "<div className={active ? 'bg-[#1a73e8]' : 'bg-white'} />\n";
    const [issue] = issuesFromSignals(extractFileSignals(tsx, "src/A.tsx"), tokens);
    expect(issue).toMatchObject({ line: 1, current: "#1a73e8", suggested: "var(--color-primary)" });
    expect(lineEdit(issue!, tsx.split("\n")[0])?.after).toBe("<div className={active ? 'bg-[var(--color-primary)]' : 'bg-white'} />");
  });

  it("does not flag token references, CSS variables, conditions or partial template values", () => {
    expect(values([
      "<div style={{ color: isError ? 'var(--color-danger)' : theme.colors.ok, padding: `${n}px` }} />",
      "<div style={{ background: `rgba(0,0,0,${alpha})`, color: `#${hex}` }} />",
      "<div style={{ color: variant === '#fff' ? fg : undefined }} />",
      "<div className={cn('bg-[var(--brand)]', on && 'bg-(--brand) text-red-500', 'w-[37px] top-[3px]')} />",
      "// old: className=\"bg-[#dc2626]\"",
      "<p>Use bg-[#dc2626] for errors</p>",
      "<svg className={on ? 'fill-[#dc2626]' : ''} />",
    ].join("\n"))).toEqual([]);
  });
});

describe("bare numbers in JSX", () => {
  it("are pixels, z-index stays a number, and weights/opacities stay unchecked", () => {
    const tsx = "<div style={{ zIndex: dragging ? 10 : 1, padding: 8, fontWeight: 600, opacity: 0.5 }} />";
    const values = extractFileSignals(tsx, "src/A.tsx").map((s) => String(s.value));
    expect(values).toContain("8px");
    expect(values.filter((v) => v.endsWith("px"))).toEqual(["8px"]);
    expect(values).not.toContain("600");
    expect(values).not.toContain("0.5");
  });
});

describe("drift.ignore in file checks (the hook and check_drift with files)", () => {
  const issue = (over: Partial<FileIssue>): FileIssue => ({
    file: "src/Card.tsx", line: 3, type: "hardcoded-spacing", severity: "warning", message: "", current: "8px", ...over,
  });

  it("drops issues a rule matches, with the full scan's meaning for each field", () => {
    const all = [issue({}), issue({ current: "#fff", type: "hardcoded-color" }), issue({ file: "src/legacy/Old.tsx" })];
    expect(applyFileIgnoreRules(all, [{ value: "^8px$" }]).map((i) => i.current)).toEqual(["#fff"]);
    expect(applyFileIgnoreRules(all, [{ file: "src/legacy/**" }])).toHaveLength(2);
    expect(applyFileIgnoreRules(all, [{ type: "hardcoded-value" }])).toHaveLength(0);
    expect(applyFileIgnoreRules(all, [{ type: "hardcoded-color", file: "src/legacy/**" }])).toHaveLength(3);
  });

  it("never matches on component/token rules, empty rules or a broken regex", () => {
    const all = [issue({})];
    expect(applyFileIgnoreRules(all, [{ component: "Card" }, { token: "space" }, {}, { value: "(" }])).toHaveLength(1);
    expect(applyFileIgnoreRules(all, undefined)).toHaveLength(1);
  });

  it("applies the project's rules through checkDrift", async () => {
    const dir = mkdtempSync(join(tmpdir(), "buoy-ignore-"));
    writeFileSync(join(dir, "card.css"), ".card {\n  padding: 8px;\n  color: #1a73e8;\n}\n");
    const config = { drift: { ignore: [{ value: "^8px$", reason: "deliberate" }] } };
    const result = await checkDrift({ projectRoot: dir, config } as never, ["card.css"], []);
    expect(result.issues.map((i) => i.current)).toEqual(["#1a73e8"]);
  });
});
