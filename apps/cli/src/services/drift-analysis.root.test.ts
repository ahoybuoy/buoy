import { describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let capturedProjectRoot: string | undefined;

vi.mock("../scan/orchestrator.js", () => {
  return {
    ScanOrchestrator: class {
      constructor(_config: unknown, projectRoot: string) {
        capturedProjectRoot = projectRoot;
      }

      async scanComponents() {
        throw new Error("stop-after-root-capture");
      }
    },
  };
});

import { DriftAnalysisService } from "./drift-analysis.js";

describe("DriftAnalysisService project root", () => {
  it("uses the provided project root instead of process.cwd()", async () => {
    capturedProjectRoot = undefined;
    const service = new DriftAnalysisService({} as any, "/monorepo/root");

    await expect(service.analyze()).rejects.toThrow("stop-after-root-capture");
    expect(capturedProjectRoot).toBe("/monorepo/root");
  });

  it("builds usage collector globs from enabled source config (including monorepo relative paths)", () => {
    const service = new DriftAnalysisService({
      sources: {
        react: {
          enabled: true,
          include: ["../../packages/lambchop/src/components/**/*.tsx"],
          exclude: ["**/*.stories.tsx"],
        },
        tailwind: {
          enabled: true,
          files: ["../../packages/lambchop/src/components/**/*.tsx", "src/**/*.tsx"],
          exclude: ["**/.next/**"],
        },
        tokens: {
          enabled: true,
          files: ["src/styles/global.css"],
        },
      },
      drift: { ignore: [], promote: [], enforce: [], severity: {}, aggregation: { strategies: ["value", "suggestion", "path", "entity"], minGroupSize: 2, pathPatterns: [] }, types: {} },
      project: { name: "test" },
      health: {},
      claude: { enabled: false, model: "x" },
      output: { format: "table", colors: true },
      experimental: {},
    } as any, "/repo/apps/web");

    const globs = (service as any).getUsageCollectorGlobs();
    expect(globs.include).toEqual(
      expect.arrayContaining([
        "../../packages/lambchop/src/components/**/*.tsx",
        "src/**/*.tsx",
        "src/styles/global.css",
      ]),
    );
    expect(globs.exclude).toEqual(
      expect.arrayContaining(["**/*.stories.tsx", "**/.next/**"]),
    );
  });

  it("resolves Tailwind semantic aliases from imported local preset files", async () => {
    const root = await mkdtemp(join(tmpdir(), "buoy-tailwind-alias-"));
    try {
      await mkdir(join(root, "packages", "lambchop", "src"), { recursive: true });
      await writeFile(
        join(root, "tailwind.config.ts"),
        `
          import lambchopPreset from "./packages/lambchop/src/tailwind-preset";
          export default { presets: [lambchopPreset] };
        `,
        "utf-8",
      );
      await writeFile(
        join(root, "packages", "lambchop", "src", "tailwind-preset.ts"),
        `
          export default {
            theme: {
              extend: {
                colors: {
                  background: "rgb(var(--surface) / <alpha-value>)",
                  surface: { DEFAULT: "var(--surface)", border: "hsl(var(--surface-border))" },
                  accent: { DEFAULT: "var(--accent)" }
                }
              }
            }
          }
        `,
        "utf-8",
      );

      const service = new DriftAnalysisService({
        sources: { tailwind: { enabled: true, files: ["**/*.tsx"], exclude: [] } },
        drift: { ignore: [], promote: [], enforce: [], severity: {}, aggregation: { strategies: ["value", "suggestion", "path", "entity"], minGroupSize: 2, pathPatterns: [] }, types: {} },
        project: { name: "test" },
        health: {},
        claude: { enabled: false, model: "x" },
        output: { format: "table", colors: true },
        experimental: {},
      } as any, root);

      const aliases = await (service as any).resolveTailwindSemanticAliasMap();
      expect([...(aliases.get("background") ?? [])]).toContain("surface");
      expect([...(aliases.get("surface") ?? [])]).toContain("surface");
      expect([...(aliases.get("surface-border") ?? [])]).toContain("surface-border");
      expect([...(aliases.get("accent") ?? [])]).toContain("accent");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("applies Tailwind preset aliases to token usage counts from semantic classes", async () => {
    const root = await mkdtemp(join(tmpdir(), "buoy-tailwind-usage-"));
    try {
      await mkdir(join(root, "app"), { recursive: true });
      await mkdir(join(root, "packages", "tokens"), { recursive: true });
      await writeFile(
        join(root, "tailwind.config.ts"),
        `import preset from "./packages/tokens/tailwind-preset"; export default { presets: [preset] };`,
        "utf-8",
      );
      await writeFile(
        join(root, "packages", "tokens", "tailwind-preset.ts"),
        `
          export default {
            theme: { extend: { colors: {
              background: "var(--surface)",
              foreground: "var(--text)"
            } } }
          };
        `,
        "utf-8",
      );
      await writeFile(
        join(root, "app", "page.tsx"),
        `<div className="bg-background text-foreground hover:bg-background/80" />`,
        "utf-8",
      );

      const service = new DriftAnalysisService({
        sources: {
          nextjs: { enabled: true, include: ["app/**/*.tsx"], exclude: [] },
          tailwind: { enabled: true, files: ["app/**/*.tsx"], exclude: [] },
        },
        drift: { ignore: [], promote: [], enforce: [], severity: {}, aggregation: { strategies: ["value", "suggestion", "path", "entity"], minGroupSize: 2, pathPatterns: [] }, types: {} },
        project: { name: "test" },
        health: {},
        claude: { enabled: false, model: "x" },
        output: { format: "table", colors: true },
        experimental: {},
      } as any, root);

      const usageMap = new Map<string, number>();
      await (service as any).applyTailwindConfigAliasUsages(usageMap);

      expect((usageMap.get("surface") ?? 0)).toBeGreaterThan(0);
      expect((usageMap.get("text") ?? 0)).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
