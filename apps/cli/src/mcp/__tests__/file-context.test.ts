import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Component, DesignToken } from "@buoy-design/core";
import { buildFileContext, categoriesIn, tokenNeedles } from "../file-context.js";
import { createBuoyMcpServer } from "../server.js";

const color = (name: string, hex: string) =>
  ({ name, category: "color", value: { type: "color", hex }, source: { type: "css", path: "src/tokens.css" } }) as unknown as DesignToken;
const space = (name: string, value: number) =>
  ({ name, category: "spacing", value: { type: "spacing", value, unit: "px" }, source: { type: "css", path: "src/tokens.css" } }) as unknown as DesignToken;
const component = (name: string, path: string) =>
  ({ id: `react:${path}:${name}`, name, source: { type: "react", path, exportName: name } }) as unknown as Component;

describe("tokenNeedles", () => {
  const count = (name: string, text: string) => tokenNeedles(name).reduce((n, re) => n + (text.match(re)?.length ?? 0), 0);

  it("finds CSS variables, Tailwind v4 utilities and Sass variables", () => {
    expect(count("--color-buoy", "color: var(--color-buoy);")).toBe(1);
    expect(count("--color-buoy", 'className="bg-buoy text-buoy hover:bg-buoy-light"')).toBe(2);
    expect(count("$space-2", "padding: $space-2;")).toBe(1);
  });

  it("does not count a longer token that shares the name", () => {
    expect(count("--color-navy", 'className="bg-navy-dark"')).toBe(0);
  });

  it("only counts utilities from the token's own namespace", () => {
    expect(count("--text-sm", 'className="text-sm rounded-sm shadow-sm"')).toBe(1);
    expect(count("--radius-sm", 'className="text-sm rounded-sm rounded-tl-sm"')).toBe(2);
    expect(count("--spacing-4", 'className="p-4 mt-4 gap-x-4 text-4"')).toBe(3);
  });
});

describe("categoriesIn", () => {
  it("reads the kinds of values a file deals in", () => {
    expect([...categoriesIn('<p className="text-sm p-4 rounded-lg bg-gray-100">')].sort())
      .toEqual(["border", "color", "spacing", "typography"]);
    expect([...categoriesIn("export const x = 1;")]).toEqual([]);
  });
});

describe("buildFileContext", () => {
  const tokens = [
    color("--color-brand", "#1a73e8"), color("--color-muted", "#6b7280"), color("--color-danger", "#dc2626"),
    space("--space-4", 16), space("--space-1", 4), space("--space-2", 8),
  ];
  const components = [
    component("Button", "src/components/Button.tsx"),
    component("Badge", "src/components/Badge.tsx"),
    component("Modal", "src/overlays/Modal.tsx"),
    component("Card", "src/components/Card.tsx"),
  ];

  it("returns what the file needs, not the whole system", () => {
    const ctx = buildFileContext({
      file: { path: "src/components/Card.tsx", content: 'import { Modal } from "../overlays/Modal";\n<div className="bg-brand p-[12px]">' },
      neighbors: [{ path: "src/components/Button.tsx", content: 'className="text-muted"' }],
      tokens, components,
      issues: [{ file: "src/components/Card.tsx", line: 2, type: "hardcoded-spacing", severity: "warning", message: "", current: "12px", suggested: "--space-3" }],
    });
    expect(ctx.usedHere).toEqual(["--color-brand #1a73e8 ×1"]);
    expect(ctx.usedNearby).toEqual(["--color-muted #6b7280 ×1"]);
    // Only ordered scales the file deals in (spacing here; colours come from the used lists).
    expect(Object.keys(ctx.scales)).toEqual(["spacing"]);
    expect(ctx.scales.spacing).toEqual(["--space-1 4px", "--space-2 8px", "--space-4 16px"]);
    // Imported first, then the same folder; not the file's own component.
    expect(ctx.components).toEqual([
      "Modal src/overlays/Modal.tsx (imported)",
      "Badge src/components/Badge.tsx",
      "Button src/components/Button.tsx",
    ]);
    expect(ctx.existingIssues).toEqual({ total: 1, top: ["line 2: 12px -> --space-3"] });
  });

  it("handles a file that does not exist yet", () => {
    const ctx = buildFileContext({ file: { path: "src/components/New.tsx", content: "" }, neighbors: [], tokens, components, issues: [] });
    expect(ctx.usedHere).toEqual([]);
    expect(ctx.scales).toEqual({});
    expect(ctx.components.map((c) => c.split(" ")[0])).toEqual(["Badge", "Button", "Card"]);
  });
});

describe("MCP server: slim tokens and context_for_file", () => {
  async function connect(dir: string) {
    const server = createBuoyMcpServer({ cwd: dir, version: "test" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "test", version: "1" });
    await client.connect(clientSide);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const res = await client.callTool({ name, arguments: args });
      return JSON.parse((res.content as Array<{ text: string }>)[0]!.text);
    };
    return call;
  }

  function repo() {
    const dir = mkdtempSync(join(tmpdir(), "buoy-ctx-"));
    mkdirSync(join(dir, ".git"));
    mkdirSync(join(dir, "src", "components"), { recursive: true });
    const vars = Array.from({ length: 20 }, (_, i) => `  --color-shade-${i}: #${(100000 + i * 1111).toString().slice(0, 6)};`).join("\n");
    writeFileSync(join(dir, "src", "tokens.css"), `:root {\n  --color-brand: #1a73e8;\n${vars}\n  --space-2: 8px;\n  --space-4: 16px;\n}\n`);
    writeFileSync(join(dir, "src", "components", "Card.tsx"), 'export function Card() {\n  return <div style={{ color: "var(--color-brand)", padding: "16px" }}>hi</div>;\n}\n');
    return dir;
  }

  it("lists a summary without arguments and the full list with a category", async () => {
    const call = await connect(repo());
    const slim = await call("list_design_tokens");
    expect(slim.tokens).toBeUndefined();
    expect(slim.sample.color.length).toBeLessThanOrEqual(6);
    expect(slim.byCategory.color).toBeGreaterThan(6);
    const full = await call("list_design_tokens", { category: "color" });
    expect(full.tokens.length).toBe(full.byCategory.color);
  }, 60_000);

  it("returns the context for one file", async () => {
    const dir = repo();
    const call = await connect(dir);
    const ctx = await call("context_for_file", { file: "src/components/Card.tsx" });
    expect(ctx.file).toBe("src/components/Card.tsx");
    expect(ctx.usedHere.some((t: string) => t.startsWith("--color-brand "))).toBe(true);
    expect(ctx.scales.spacing).toEqual(["--space-2 8px", "--space-4 16px"]);
    expect(ctx.teamDecisions.sources[0]).toBe(".buoy.yaml");
    const outside = await call("context_for_file", { file: "../elsewhere.tsx" });
    expect(outside.error).toMatch(/outside the repository/);
  }, 60_000);
});
