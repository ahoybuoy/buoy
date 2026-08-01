import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import type { Component, DesignToken } from "@buoy-design/core";
import { buildSystemMap, findChangeImpact } from "../system-map.js";

const roots: string[] = [];

function component(name: string, path: string): Component {
  return {
    id: `react:${path}:${name}`,
    name,
    source: { type: "react", path, exportName: name },
    props: [],
    variants: [],
    tokens: [],
    dependencies: [],
    metadata: {},
    scannedAt: new Date(),
  };
}

function token(name: string, path: string): DesignToken {
  return {
    id: `css:${path}:${name}`,
    name,
    category: "color",
    value: { type: "color", hex: "#123456", r: 18, g: 52, b: 86, a: 1 },
    source: { type: "css", path, line: 1 },
    aliases: [],
    usedBy: [],
    metadata: {},
    scannedAt: new Date(),
  };
}

async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "buoy-system-map-"));
  roots.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      const file = join(root, path);
      await mkdir(join(file, ".."), { recursive: true });
      await writeFile(file, content);
    }),
  );
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("buildSystemMap", () => {
  it("separates declared canonical code from unmanaged surface and assigns owners", async () => {
    const root = await project({
      "packages/ui/src/Button.tsx": "export const Button = () => null;",
      "packages/tokens/src/colors.css": ":root { --color-primary: #123456; }",
      "apps/checkout/page.tsx":
        '<Button style={{ color: "var(--color-primary)" }} />',
      "apps/checkout/Card.tsx": "export const Card = () => null;",
    });

    const map = await buildSystemMap({
      projectRoot: root,
      config: {
        components: ["packages/ui/src/**"],
        tokens: ["packages/tokens/src/**"],
        owners: [{ name: "Checkout", paths: ["apps/checkout/**"] }],
      },
      components: [
        component("Button", "packages/ui/src/Button.tsx"),
        component("Card", "apps/checkout/Card.tsx"),
      ],
      tokens: [token("--color-primary", "packages/tokens/src/colors.css")],
    });

    expect(map.summary).toMatchObject({
      canonicalComponents: 1,
      canonicalTokens: 1,
      unmanagedComponents: 1,
      unmanagedTokens: 0,
    });
    expect(map.components.find((item) => item.name === "Button")).toMatchObject(
      {
        classification: "canonical",
        usageCount: 1,
        risk: "low",
        consumers: [
          { file: "apps/checkout/page.tsx", owner: "Checkout", usages: 1 },
        ],
      },
    );
    expect(
      map.components.find((item) => item.name === "Card")?.classification,
    ).toBe("unmanaged");
  });

  it("turns widespread usage into a migration recommendation", async () => {
    const root = await project({
      "packages/ui/src/Button.tsx": "export const Button = () => null;",
      "apps/a/page.tsx": "<Button /><Button />",
      "apps/b/page.tsx": "<Button />",
      "apps/c/page.tsx": "<Button />",
    });
    const map = await buildSystemMap({
      projectRoot: root,
      config: { components: ["packages/ui/src/**"], tokens: [], owners: [] },
      components: [component("Button", "packages/ui/src/Button.tsx")],
      tokens: [],
    });

    const impact = findChangeImpact(map, "Button", "component");
    expect(impact?.entity.risk).toBe("high");
    expect(impact?.recommendation).toContain("staged migration");
  });
});
