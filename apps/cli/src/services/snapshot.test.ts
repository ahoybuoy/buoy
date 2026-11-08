import { describe, expect, it } from "vitest";
import type { Component, DesignToken, DriftSignal } from "@buoy-design/core";
import { buildSnapshot, parseAffectedEntry, SNAPSHOT_SCHEMA } from "./snapshot.js";

const comp = (name: string, path: string, deps: string[] = [], line = 1, props: string[] = []): Component =>
  ({
    id: `react:${path}:${name}`,
    name,
    source: { type: "react", path, exportName: name, line },
    props: props.map((p) => ({ name: p, type: "string", required: false })),
    variants: [],
    tokens: [],
    dependencies: deps,
    metadata: {},
    scannedAt: new Date(),
  }) as unknown as Component;

describe("parseAffectedEntry", () => {
  it("reads property: value (line n)", () => {
    expect(parseAffectedEntry("backgroundColor: #f9f9f9 (line 665)")).toEqual({ property: "backgroundColor", value: "#f9f9f9", line: 665 });
  });
  it("reads Tailwind arbitrary values", () => {
    expect(parseAffectedEntry("p-[13px] (line 4)")).toEqual({ property: "p", value: "13px", line: 4 });
    expect(parseAffectedEntry("bg-[#fdfae6] (line 2)")).toEqual({ property: "bg", value: "#fdfae6", line: 2 });
  });
  it("keeps anything else as a bare value", () => {
    expect(parseAffectedEntry("1.5rem")).toEqual({ value: "1.5rem", line: undefined });
    expect(parseAffectedEntry("  ")).toBeNull();
  });
});

describe("buildSnapshot", () => {
  const snapshot = buildSnapshot({
    components: [
      comp("Button", "ui/primitives/button.tsx", [], 1, ["variant", "size", "variant"]),
      comp("Form", "app/components/form.tsx", ["Button"], 1),
      comp("FormPage", "app/routes/form/page.tsx", ["Form"]),
    ],
    tokens: [
      { id: "t1", name: "--primary", category: "color", value: { type: "color", hex: "#123456" }, source: { type: "css", path: "theme.css" }, aliases: [], usedBy: [], metadata: {}, scannedAt: new Date() },
    ] as unknown as DesignToken[],
    drifts: [
      {
        id: "d1", type: "hardcoded-value", severity: "warning", message: "2 hardcoded colors",
        source: { entityType: "component", entityId: "x", entityName: "Form", location: "app/components/form.tsx:9" },
        details: { affectedFiles: ["color: #999 (line 9)", "bg-[#fff] (line 10)"], suggestions: ["Use a token"] },
      },
      { id: "d2", type: "hardcoded-value", severity: "info", message: "stylesheet", source: { entityType: "token", entityId: "y", entityName: "g", location: "styles/globals.css:3" }, details: {} },
    ] as unknown as DriftSignal[],
    readFile: (p) => (p === "ui/primitives/button.tsx" ? `cn("bg-primary")` : null),
    cliVersion: "9.9.9",
    now: new Date("2026-11-08T00:00:00Z"),
  });

  it("names its schema and the CLI that wrote it", () => {
    expect(snapshot.schema).toBe(SNAPSHOT_SCHEMA);
    expect(snapshot.cliVersion).toBe("9.9.9");
  });

  it("gives components kind, unique props and connection counts", () => {
    const button = snapshot.components.find((c) => c.name === "Button")!;
    expect(button).toMatchObject({ kind: "primitive", props: ["variant", "size"], renders: 0, renderedBy: 1 });
    expect(snapshot.components.find((c) => c.name === "FormPage")!.kind).toBe("page");
  });

  it("counts token use and keeps edges", () => {
    expect(snapshot.tokens[0]).toMatchObject({ id: "t:primary", value: "#123456", usedBy: 1 });
    expect(snapshot.edges.filter((e) => e.type === "renders")).toHaveLength(2);
  });

  it("keeps every drift finding, with its owner and parsed values", () => {
    expect(snapshot.drift).toHaveLength(2);
    expect(snapshot.drift[0]).toMatchObject({
      component: "c:app/components/form.tsx:Form",
      path: "app/components/form.tsx",
      line: 9,
      values: [{ property: "color", value: "#999", line: 9 }, { property: "bg", value: "#fff", line: 10 }],
      suggestions: ["Use a token"],
    });
    expect(snapshot.drift[1]!.component).toBeUndefined();
    expect(snapshot.stats.drift).toBe(2);
  });
});
