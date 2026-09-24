import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DesignToken } from "@buoy-design/core";
import { checkStylesheets, styleBlocksAsCss, stylesheetIssuesToDrifts } from "../stylesheet-drift.js";
import { configuredExcludes } from "../drift-analysis.js";
import type { BuoyConfig } from "../../config/schema.js";

const token = (name: string, value: DesignToken["value"], category: DesignToken["category"]): DesignToken =>
  ({ id: name, name, category, value, source: { type: "css", path: "style.css" }, aliases: [], usedBy: [], metadata: {}, scannedAt: new Date() }) as DesignToken;

describe("stylesheet drift", () => {
  it("skips examples, demos, benchmarks, tests and configured excludes", async () => {
    const root = mkdtempSync(join(tmpdir(), "buoy-css-scope-"));
    const css = ".a { color: #123456; }\n";
    for (const dir of ["src", "examples/cms/css", "bench/app", "test/e2e/case", "services/lang/cmd/demo", "legacy"]) {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, "style.css"), css);
    }
    const issues = await checkStylesheets(root, [], ["legacy/**"]);
    expect([...new Set(issues.map((i) => i.file))]).toEqual(["src/style.css"]);
  });

  it("collects exclude globs from enabled sources only", () => {
    const config = { sources: {
      react: { enabled: true, include: [], exclude: ["**/*.test.*", "legacy/**"] },
      vue: { enabled: false, include: [], exclude: ["old/**"] },
    } } as unknown as BuoyConfig;
    expect(configuredExcludes(config)).toEqual(["**/*.test.*", "legacy/**"]);
  });

  it("keeps <style> blocks on their real line numbers", () => {
    const vue = `<template><div class="c"/></template>\n<style scoped>\n.c { color: #fff; }\n</style>`;
    expect(styleBlocksAsCss(vue).split("\n")[2]).toBe(".c { color: #fff; }");
    expect(styleBlocksAsCss(vue).split("\n")[0]).toBe("");
  });

  it("flags design literals in CSS, SCSS and Vue, naming the token that already has the value", async () => {
    const root = mkdtempSync(join(tmpdir(), "buoy-css-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "style.css"), ":root { --brand: #3b82f6; }\n.btn { color: #3b82f6 !important; padding: 13px; width: 120px; margin: 0; transition: all 150ms ease-out; }\n");
    writeFileSync(join(root, "src/Card.vue"), "<template><div/></template>\n<style>\n.card { background: #ffffff; border-radius: 99px; }\n</style>\n");
    writeFileSync(join(root, "src/normalize.css"), "button { color: #000000; padding: 7px; }\n");
    const issues = await checkStylesheets(root, [token("--brand", { type: "color", hex: "#3b82f6" }, "color")]);
    expect(issues.map((i) => [i.file, i.line, i.current, i.suggested ?? null]).sort()).toEqual([
      ["src/Card.vue", 3, "#ffffff", null],
      ["style.css", 2, "#3b82f6", "var(--brand)"],
      ["style.css", 2, "13px", null],
    ]);
    const drifts = stylesheetIssuesToDrifts(issues, root);
    const css = drifts.find((d) => d.source.entityName === "style.css")!;
    expect(css.message).toBe("Hardcoded colour / spacing in style.css: #3b82f6 (use var(--brand)), 13px.");
    expect(css.details.tokenSuggestions).toEqual(["#3b82f6 → var(--brand)"]);
    expect(css.severity).toBe("warning");
  });
});
