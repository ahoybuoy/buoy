import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { discoverAndGenerate, generateDesignMd } from "../init.js";
import { parseDesignMd } from "@buoy-design/core";
import type { DesignToken } from "@buoy-design/core";

const fakeTokens: DesignToken[] = [
  {
    id: "css:tokens.css:primary",
    name: "primary",
    category: "color",
    value: { type: "color", hex: "#1A1C1E" },
    source: { type: "css", path: "tokens.css" },
    aliases: [],
    usedBy: [],
    metadata: {},
    scannedAt: new Date(),
  },
  {
    id: "css:tokens.css:md",
    name: "md",
    category: "spacing",
    value: { type: "spacing", value: 16, unit: "px" },
    source: { type: "css", path: "tokens.css" },
    aliases: [],
    usedBy: [],
    metadata: {},
    scannedAt: new Date(),
  },
];

describe("generateDesignMd", () => {
  it("emits a DESIGN.md that parses cleanly", () => {
    const md = generateDesignMd({ name: "MyApp", tokens: fakeTokens });
    expect(md).toContain("name: MyApp");
    // Hex preserved verbatim in the source; upstream lowercases on parse,
    // so we assert the source string and the parse round-trip separately.
    expect(md).toMatch(/primary:\s*"#1A1C1E"/);
    // Spacing rendered as `${value}${unit}` from the discriminated union.
    expect(md).toMatch(/md:\s*16px/);
    const parsed = parseDesignMd(md);
    expect(parsed.summary.errors).toBe(0);
    expect(parsed.designSystem.name).toBe("MyApp");
  });

  it("emits a placeholder Overview prose block", () => {
    const md = generateDesignMd({ name: "X", tokens: [] });
    expect(md).toMatch(/## Overview/);
  });

  it("emits a parseable file even with zero tokens", () => {
    const md = generateDesignMd({ name: "Empty", tokens: [] });
    const parsed = parseDesignMd(md);
    expect(parsed.summary.errors).toBe(0);
  });

  // The test-fixture directory is gitignored and lives one level above the
  // worktree root (in the main checkout). Skip the integration test gracefully
  // when it isn't present so the suite stays portable across worktrees / CI.
  const fixtureRoot = resolve(
    __dirname,
    "../../../../../../../../test-fixture",
  );
  const fixtureExists = existsSync(fixtureRoot);
  const integrationIt = fixtureExists ? it : it.skip;

  integrationIt(
    "integration: discovers tokens from test-fixture and emits a parseable DESIGN.md",
    async () => {
      const md = await discoverAndGenerate({
        cwd: fixtureRoot,
        name: "TestFixture",
      });
      const parsed = parseDesignMd(md);
      expect(parsed.summary.errors).toBe(0);
      expect(parsed.designSystem.name).toBe("TestFixture");
      // Don't assert specific tokens — the fixture may evolve. Just confirm
      // we found at least some.
      const tokenCount =
        Object.keys(parsed.designSystem.colors ?? {}).length +
        Object.keys(parsed.designSystem.spacing ?? {}).length +
        Object.keys(parsed.designSystem.rounded ?? {}).length;
      expect(tokenCount).toBeGreaterThan(0);
    },
  );
});
