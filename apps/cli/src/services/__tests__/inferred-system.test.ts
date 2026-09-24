import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { inferDesignSystem, normalizeLiteral, summarizeInferredSystem } from "../inferred-system.js";
import { createBuoyMcpServer } from "../../mcp/server.js";

const CSS = `
.a{color:#1a1a1a;padding:16px;border-radius:8px;font-size:14px}
.b{color:#1b1b1b;padding:16px;margin:8px;border-radius:8px;font-size:14px}
.c{color:#1a1a1a;background:#2563eb;padding:24px;margin:8px;font-size:16px}
.d{color:#1c1c1c;background:#2563eb;padding:8px;margin:24px;border-radius:4px}
.e{color:#1a1a1a;background:#2463ea;padding:16px;margin:16px;font-size:14px}
.f{color:#fff;background:#2563eb;padding:24px;border-radius:8px;font-size:16px}
.g{color:#ffffff;background:#fefefe;padding:8px;border-radius:4px}
`;

function repoWithoutTokens(): string {
  const dir = mkdtempSync(join(tmpdir(), "buoy-inferred-"));
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "no-tokens" }));
  writeFileSync(join(dir, "src/app.css"), CSS);
  return dir;
}

describe("inferred design system", () => {
  it("finds the most-used values and merges near-duplicate colors", async () => {
    const system = await inferDesignSystem(repoWithoutTokens(), { sources: {} } as never);
    expect(system).not.toBeNull();
    const summary = summarizeInferredSystem(system!);
    expect(summary.tokens.filter((t) => t.category === "color").map((t) => t.value)).toEqual(["#1a1a1a", "#2563eb", "#ffffff"]);
    expect(summary.nearDuplicates).toContainEqual({ use: "#1a1a1a", insteadOf: ["#1b1b1b", "#1c1c1c"] });
    // #fff and #ffffff are one literal, not a near-duplicate
    expect(summary.nearDuplicates).toContainEqual({ use: "#ffffff", insteadOf: ["#fefefe"] });
    // Spacing/type clusters are too coarse to recommend swaps
    expect(summary.tokens.filter((t) => t.category !== "color").every((t) => !("replaces" in t))).toBe(true);
  });

  it("returns null when there is nothing to infer from", async () => {
    const dir = mkdtempSync(join(tmpdir(), "buoy-inferred-empty-"));
    expect(await inferDesignSystem(dir, { sources: {} } as never)).toBeNull();
  });

  it("normalises hex shorthand", () => {
    expect(normalizeLiteral(" #FFF ")).toBe("#ffffff");
  });

  it("gives MCP agents the inferred system when the repo has no tokens", async () => {
    const server = createBuoyMcpServer({ cwd: repoWithoutTokens(), version: "test" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const text = async (name: string, args: Record<string, unknown>) =>
      JSON.parse(((await client.callTool({ name, arguments: args })).content as { text: string }[])[0]!.text);

    const listed = await text("list_design_tokens", {});
    expect(listed.total).toBe(0);
    expect(listed.inferred.tokens.some((t: { value: string }) => t.value === "#2563eb")).toBe(true);

    const found = await text("find_token_for_value", { value: "#2463EA" });
    expect(found.inferredMatch.value).toBe("#2563eb");
    expect(found.suggestion).toContain("#2563eb");
  }, 30_000);
});
