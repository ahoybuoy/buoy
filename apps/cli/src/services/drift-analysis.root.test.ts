import { describe, expect, it, vi } from "vitest";

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
});
