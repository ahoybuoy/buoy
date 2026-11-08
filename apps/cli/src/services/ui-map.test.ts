import { describe, expect, it } from "vitest";
import type { Component, DesignToken, DriftSignal } from "@buoy-design/core";
import { buildUiMap, tokenKey, tokenReferences } from "./ui-map.js";

const comp = (name: string, path: string, deps: string[] = [], line = 1): Component =>
  ({
    id: `react:${path}:${name}`,
    name,
    source: { type: "react", path, exportName: name, line },
    props: [],
    variants: [],
    tokens: [],
    dependencies: deps,
    metadata: {},
    scannedAt: new Date(),
  }) as unknown as Component;

const token = (name: string, hex = "#123456"): DesignToken =>
  ({
    id: `t:${name}`,
    name,
    category: "color",
    value: { type: "color", hex },
    source: { type: "css", path: "styles/theme.css" },
    aliases: [],
    usedBy: [],
    metadata: {},
    scannedAt: new Date(),
  }) as unknown as DesignToken;

describe("tokenKey", () => {
  it("normalizes css vars, DEFAULT and dotted names", () => {
    expect(tokenKey("--primary")).toBe("primary");
    expect(tokenKey("primary.DEFAULT")).toBe("primary");
    expect(tokenKey("neutral.150")).toBe("neutral-150");
  });
});

describe("tokenReferences", () => {
  const keys = new Set(["primary", "primary-foreground", "neutral-150", "radius"]);
  it("counts utility classes with variants and opacity, and var()", () => {
    const refs = tokenReferences(
      `<b className="bg-primary/50 hover:text-primary-foreground border-neutral-150 p-[3px]" style={{ borderRadius: "var(--radius)" }} />`,
      keys,
    );
    expect(Object.fromEntries(refs)).toEqual({ primary: 1, "primary-foreground": 1, "neutral-150": 1, radius: 1 });
  });
  it("ignores words that only look like a token", () => {
    expect(tokenReferences(`"the primary button" "data-primary"`, keys).size).toBe(0);
  });
});

describe("buildUiMap", () => {
  const components = [
    comp("Button", "packages/ui/primitives/button.tsx"),
    comp("Dialog", "packages/ui/primitives/dialog.tsx", ["Button"]),
    comp("SettingsForm", "apps/web/components/settings-form.tsx", ["Button", "Dialog", "div"]),
    comp("SettingsPage", "apps/web/app/settings/page.tsx", ["SettingsForm"]),
    comp("IconCheck", "packages/ui/icons/check.tsx"),
    comp("Orphan", "apps/web/components/orphan.tsx"),
  ];
  const files: Record<string, string> = {
    "packages/ui/primitives/button.tsx": `cn("bg-primary text-primary-foreground")`,
    "apps/web/components/settings-form.tsx": `"text-primary"`,
  };
  const drifts = [
    { id: "d1", type: "hardcoded-value", severity: "warning", message: "Hardcoded color #fff", source: { location: "apps/web/components/settings-form.tsx:12" } },
  ] as unknown as DriftSignal[];

  const map = buildUiMap({
    components,
    tokens: [token("--primary"), token("--primary-foreground"), token("--unused")],
    drifts,
    readFile: (p) => files[p] ?? null,
    now: new Date("2026-11-08T00:00:00Z"),
  });
  const node = (name: string) => map.nodes.find((n) => n.name === name)!;

  it("classifies pages, primitives, icons and composites", () => {
    expect(node("SettingsPage").kind).toBe("page");
    expect(node("Button").kind).toBe("primitive");
    expect(node("IconCheck").kind).toBe("icon");
    expect(node("SettingsForm").kind).toBe("composite");
  });

  it("resolves render edges to known components and skips HTML tags", () => {
    const renders = map.edges.filter((e) => e.type === "renders").map((e) => `${e.source.split(":").pop()}>${e.target.split(":").pop()}`);
    expect(renders.sort()).toEqual(["Dialog>Button", "SettingsForm>Button", "SettingsForm>Dialog", "SettingsPage>SettingsForm"]);
  });

  it("links tokens to the components whose files reference them", () => {
    const uses = map.edges.filter((e) => e.type === "uses").map((e) => `${e.source}>${e.target.split(":").pop()}`);
    expect(uses.sort()).toEqual(["t:primary-foreground>Button", "t:primary>Button", "t:primary>SettingsForm"]);
    expect(map.stats.tokensUnused).toBe(1);
  });

  it("puts drift on the component that owns the line", () => {
    expect(node("SettingsForm").drift?.count).toBe(1);
    expect(map.stats.driftInComponents).toBe(1);
  });

  it("counts components nothing renders, leaving out pages and icons", () => {
    // SettingsPage (page) and IconCheck (icon) don't count; Orphan does.
    expect(map.stats.componentsUnused).toBe(1);
  });
});
