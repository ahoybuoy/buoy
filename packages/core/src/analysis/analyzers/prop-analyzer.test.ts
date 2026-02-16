import { describe, it, expect } from "vitest";
import {
  buildPropTypeMap,
  checkPropTypeConsistency,
} from "./prop-analyzer.js";
import type { Component } from "../../models/index.js";

function makeComponent(name: string, props: Array<{ name: string; type: string }>): Component {
  return {
    id: `comp-${name}`,
    name,
    source: { type: "react" as const, path: `${name}.tsx` },
    props: props.map((p) => ({ ...p, required: false, defaultValue: undefined })),
    variants: [],
    dependencies: [],
    metadata: {},
  };
}

function makeComponents(propName: string, dominantType: string, count: number, outlierType?: string): Component[] {
  const comps: Component[] = [];
  for (let i = 0; i < count; i++) {
    comps.push(makeComponent(`Comp${i}`, [{ name: propName, type: dominantType }]));
  }
  if (outlierType) {
    comps.push(makeComponent("Outlier", [{ name: propName, type: outlierType }]));
  }
  return comps;
}

describe("checkPropTypeConsistency", () => {
  it("returns null when either side is unknown", () => {
    // 6 components with "string", 1 with "unknown" — should NOT flag
    const comps = makeComponents("label", "string", 6, "unknown");
    const map = buildPropTypeMap(comps);
    const result = checkPropTypeConsistency({ name: "label", type: "unknown" }, map);
    expect(result).toBeNull();
  });

  it("returns null when dominant type is unknown", () => {
    // 6 components with "unknown", 1 with "string"
    const comps = makeComponents("label", "unknown", 6, "string");
    const map = buildPropTypeMap(comps);
    const result = checkPropTypeConsistency({ name: "label", type: "string" }, map);
    expect(result).toBeNull();
  });

  it("normalizes React type equivalents", () => {
    // 5 with ReactNode, 1 with JSX.Element — should be treated as same type
    const comps = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeComponent(`Comp${i}`, [{ name: "icon", type: "ReactNode" }]),
      ),
      makeComponent("CompX", [{ name: "icon", type: "JSX.Element" }]),
    ];
    const map = buildPropTypeMap(comps);
    const result = checkPropTypeConsistency({ name: "icon", type: "JSX.Element" }, map);
    expect(result).toBeNull();
  });

  it("normalizes React.ReactNode to ReactNode", () => {
    const comps = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeComponent(`Comp${i}`, [{ name: "content", type: "ReactNode" }]),
      ),
      makeComponent("CompX", [{ name: "content", type: "React.ReactNode" }]),
    ];
    const map = buildPropTypeMap(comps);
    const result = checkPropTypeConsistency({ name: "content", type: "React.ReactNode" }, map);
    expect(result).toBeNull();
  });

  it("skips utility type wrappers", () => {
    const comps = makeComponents("data", "string", 6, "Partial<string>");
    const map = buildPropTypeMap(comps);
    const result = checkPropTypeConsistency({ name: "data", type: "Partial<string>" }, map);
    expect(result).toBeNull();
  });

  it("skips ReturnType wrapper", () => {
    const comps = makeComponents("result", "number", 6, "ReturnType<typeof fn>");
    const map = buildPropTypeMap(comps);
    const result = checkPropTypeConsistency({ name: "result", type: "ReturnType<typeof fn>" }, map);
    expect(result).toBeNull();
  });

  it("skips flexible props: children", () => {
    const comps = makeComponents("children", "ReactNode", 6, "string");
    const map = buildPropTypeMap(comps);
    const result = checkPropTypeConsistency({ name: "children", type: "string" }, map);
    expect(result).toBeNull();
  });

  it("skips flexible props: className", () => {
    const comps = makeComponents("className", "string", 6, "string | undefined");
    const map = buildPropTypeMap(comps);
    const result = checkPropTypeConsistency({ name: "className", type: "string | undefined" }, map);
    expect(result).toBeNull();
  });

  it("skips flexible props: style", () => {
    const comps = makeComponents("style", "CSSProperties", 6, "object");
    const map = buildPropTypeMap(comps);
    const result = checkPropTypeConsistency({ name: "style", type: "object" }, map);
    expect(result).toBeNull();
  });

  it("skips data- prefixed props", () => {
    const comps = makeComponents("data-testid", "string", 6, "number");
    const map = buildPropTypeMap(comps);
    const result = checkPropTypeConsistency({ name: "data-testid", type: "number" }, map);
    expect(result).toBeNull();
  });

  it("skips aria- prefixed props", () => {
    const comps = makeComponents("aria-label", "string", 6, "number");
    const map = buildPropTypeMap(comps);
    const result = checkPropTypeConsistency({ name: "aria-label", type: "number" }, map);
    expect(result).toBeNull();
  });

  it("returns null when fewer than 5 usages", () => {
    // Only 4 usages total — below threshold
    const comps = makeComponents("title", "string", 3, "number");
    const map = buildPropTypeMap(comps);
    const result = checkPropTypeConsistency({ name: "title", type: "number" }, map);
    expect(result).toBeNull();
  });

  it("detects valid mismatch with 5+ usages", () => {
    // 6 with string (dominant), 1 with number — genuine mismatch
    const comps = makeComponents("title", "string", 6, "number");
    const map = buildPropTypeMap(comps);
    const result = checkPropTypeConsistency({ name: "title", type: "number" }, map);
    expect(result).not.toBeNull();
    expect(result!.dominantType).toBe("string");
  });

  it("returns null when no clear dominant type", () => {
    // 3 string, 3 number — no dominant (50/50 split, below 70% threshold)
    const comps = [
      ...Array.from({ length: 3 }, (_, i) =>
        makeComponent(`StrComp${i}`, [{ name: "value", type: "string" }]),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makeComponent(`NumComp${i}`, [{ name: "value", type: "number" }]),
      ),
    ];
    const map = buildPropTypeMap(comps);
    const result = checkPropTypeConsistency({ name: "value", type: "number" }, map);
    expect(result).toBeNull();
  });
});

describe("buildPropTypeMap", () => {
  it("normalizes React type equivalents in the map", () => {
    const comps = [
      makeComponent("A", [{ name: "icon", type: "ReactNode" }]),
      makeComponent("B", [{ name: "icon", type: "JSX.Element" }]),
      makeComponent("C", [{ name: "icon", type: "React.ReactElement" }]),
    ];
    const map = buildPropTypeMap(comps);
    const usage = map.get("icon")!;
    // All three should be normalized to ReactNode
    expect(usage.types.size).toBe(1);
    expect(usage.types.has("ReactNode")).toBe(true);
    expect(usage.types.get("ReactNode")!.count).toBe(3);
  });
});
