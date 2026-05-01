// apps/cli/src/scan/__tests__/designmd-integration.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScanOrchestrator } from "../orchestrator.js";
import type { BuoyConfig } from "../../config/schema.js";

// Mock scanners so the orchestrator runs end-to-end without hitting the file
// system to discover components or tokens. The TokenScanner mock simulates a
// CSS-discovered token in the same category that DESIGN.md owns (color), so
// we can prove DESIGN.md REPLACES it rather than merging with it. We also
// emit a token in a category DESIGN.md does NOT own (typography) to prove
// it survives.
const mockScanners = {
  ReactComponentScanner: class {
    scan() { return Promise.resolve({ items: [], errors: [] }); }
  },
  NextJSScanner: class {
    scan() { return Promise.resolve({ items: [], errors: [] }); }
  },
  VueComponentScanner: class {
    scan() { return Promise.resolve({ items: [], errors: [] }); }
  },
  SvelteComponentScanner: class {
    scan() { return Promise.resolve({ items: [], errors: [] }); }
  },
  AngularComponentScanner: class {
    scan() { return Promise.resolve({ items: [], errors: [] }); }
  },
  WebComponentScanner: class {
    scan() { return Promise.resolve({ items: [], errors: [] }); }
  },
  TemplateScanner: class {
    scan() { return Promise.resolve({ items: [], errors: [] }); }
  },
  TokenScanner: class {
    scan() {
      return Promise.resolve({
        items: [
          {
            id: "css:src/tokens.css:color-from-css",
            name: "color-from-css",
            category: "color",
            value: { type: "color", hex: "#aaaaaa" },
            source: { type: "css", path: "src/tokens.css" },
            aliases: [],
            usedBy: [],
            metadata: {},
            scannedAt: new Date(),
          },
          {
            id: "css:src/tokens.css:font-body",
            name: "font-body",
            category: "typography",
            value: {
              type: "typography",
              fontFamily: "Inter",
              fontSize: 16,
              fontWeight: 400,
            },
            source: { type: "css", path: "src/tokens.css" },
            aliases: [],
            usedBy: [],
            metadata: {},
            scannedAt: new Date(),
          },
        ],
        errors: [],
      });
    }
  },
};

vi.mock("@buoy-design/scanners/git", () => mockScanners);
vi.mock("@buoy-design/scanners/figma", () => ({
  FigmaComponentScanner: class {
    scan() { return Promise.resolve({ items: [], errors: [] }); }
  },
}));
vi.mock("@buoy-design/scanners/storybook", () => ({
  StorybookScanner: class {
    scan() { return Promise.resolve({ items: [], errors: [] }); }
  },
}));

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "buoy-designmd-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "src", "tokens.css"),
    `:root {\n  --color-from-css: #aaaaaa;\n}\n`,
  );
  writeFileSync(
    join(dir, "DESIGN.md"),
    `---
name: Test
colors:
  primary: "#1a1c1e"
spacing:
  md: 16px
rounded:
  md: 8px
---

## Overview

Fixture.
`,
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const minimalConfig: BuoyConfig = {
  project: { name: "test-project" },
  sources: {
    tokens: {
      enabled: true,
      files: ["src/tokens.css"],
    },
  },
  drift: { ignore: [], severity: {} },
  claude: { enabled: false, model: "claude-sonnet-4-20250514" },
  output: { format: "table", colors: true },
} as BuoyConfig;

describe("DESIGN.md scanner integration", () => {
  it("replaces CSS-discovered tokens with DESIGN.md tokens when both exist", async () => {
    const orchestrator = new ScanOrchestrator(minimalConfig, dir);
    const result = await orchestrator.scan({ sources: ["tokens"] });

    // DESIGN.md tokens must be present
    expect(
      result.tokens.some(
        (t) => t.name === "primary" && t.category === "color",
      ),
    ).toBe(true);
    expect(
      result.tokens.some(
        (t) => t.name === "md" && t.category === "spacing",
      ),
    ).toBe(true);
    expect(
      result.tokens.some((t) => t.name === "md" && t.category === "other"),
    ).toBe(true);

    // CSS-discovered token in an OWNED category must NOT be present
    expect(
      result.tokens.some((t) => t.name === "color-from-css"),
    ).toBe(false);

    // CSS-discovered token in a NON-owned category (typography) MUST survive
    expect(
      result.tokens.some(
        (t) => t.name === "font-body" && t.category === "typography",
      ),
    ).toBe(true);

    // Surface flag is set
    expect(
      (result as typeof result & { designMdApplied?: boolean })
        .designMdApplied,
    ).toBe(true);
  });

  it("leaves CSS-discovered tokens intact when no DESIGN.md is present", async () => {
    const noDesignDir = mkdtempSync(join(tmpdir(), "buoy-no-designmd-"));
    try {
      const orchestrator = new ScanOrchestrator(minimalConfig, noDesignDir);
      const result = await orchestrator.scan({ sources: ["tokens"] });

      // Original CSS-discovered tokens preserved
      expect(
        result.tokens.some((t) => t.name === "color-from-css"),
      ).toBe(true);
      expect(
        result.tokens.some((t) => t.name === "font-body"),
      ).toBe(true);

      // DESIGN.md tokens NOT injected
      expect(
        result.tokens.some((t) => t.name === "primary"),
      ).toBe(false);

      expect(
        (result as typeof result & { designMdApplied?: boolean })
          .designMdApplied,
      ).toBe(false);
    } finally {
      rmSync(noDesignDir, { recursive: true, force: true });
    }
  });
});
