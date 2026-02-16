import { describe, it, expect } from "vitest";
import { applyIgnoreRules } from "./drift-analysis.js";
import type { DriftSignal } from "@buoy-design/core";

function createDrift(overrides: {
  type?: string;
  severity?: "info" | "warning" | "critical";
  entityType?: "component" | "token";
  entityName?: string;
  location?: string;
  actual?: unknown;
  message?: string;
} = {}): DriftSignal {
  return {
    id: `drift:${overrides.type ?? "hardcoded-value"}:${overrides.entityName ?? "Button"}`,
    type: (overrides.type ?? "hardcoded-value") as DriftSignal["type"],
    severity: overrides.severity ?? "warning",
    source: {
      entityType: overrides.entityType ?? "component",
      entityId: overrides.entityName ?? "Button",
      entityName: overrides.entityName ?? "Button",
      location: overrides.location ?? "src/components/Button.tsx",
    },
    message: overrides.message ?? "Hardcoded value detected",
    details: {
      actual: overrides.actual ?? "#ff0000",
    },
    detectedAt: new Date(),
  };
}

describe("applyIgnoreRules", () => {
  // === TYPE FILTERING (existing behavior) ===

  it("filters drifts by type (exact match)", () => {
    const drifts = [
      createDrift({ type: "hardcoded-value" }),
      createDrift({ type: "naming-inconsistency" }),
    ];
    const rules = [{ type: "hardcoded-value" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("naming-inconsistency");
  });

  // === FILE FILTERING (new) ===

  it("filters drifts by file glob", () => {
    const drifts = [
      createDrift({ location: "src/icons/ArrowIcon.tsx" }),
      createDrift({ location: "src/components/Button.tsx" }),
    ];
    const rules = [{ file: "src/icons/**" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(1);
    expect(result[0].source.location).toBe("src/components/Button.tsx");
  });

  it("filters drifts by file glob with extension", () => {
    const drifts = [
      createDrift({ location: "src/components/Button.tsx" }),
      createDrift({ location: "src/components/Button.test.tsx" }),
      createDrift({ location: "src/utils/helpers.ts" }),
    ];
    const rules = [{ file: "**/*.test.tsx" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(2);
  });

  // === COMPONENT FILTERING (new, replaces pattern) ===

  it("filters drifts by component name regex", () => {
    const drifts = [
      createDrift({ entityType: "component", entityName: "IconArrow" }),
      createDrift({ entityType: "component", entityName: "IconCheck" }),
      createDrift({ entityType: "component", entityName: "Button" }),
    ];
    const rules = [{ component: "^Icon" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(1);
    expect(result[0].source.entityName).toBe("Button");
  });

  it("does not match component rule against token entities", () => {
    const drifts = [
      createDrift({ entityType: "token", entityName: "IconColor" }),
      createDrift({ entityType: "component", entityName: "IconArrow" }),
    ];
    const rules = [{ component: "^Icon" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(1);
    expect(result[0].source.entityType).toBe("token");
  });

  // === TOKEN FILTERING (new) ===

  it("filters drifts by token name regex", () => {
    const drifts = [
      createDrift({ entityType: "token", entityName: "legacy-blue-500" }),
      createDrift({ entityType: "token", entityName: "legacy-red-300" }),
      createDrift({ entityType: "token", entityName: "primary-blue" }),
    ];
    const rules = [{ token: "^legacy-" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(1);
    expect(result[0].source.entityName).toBe("primary-blue");
  });

  it("does not match token rule against component entities", () => {
    const drifts = [
      createDrift({ entityType: "component", entityName: "LegacyButton" }),
      createDrift({ entityType: "token", entityName: "legacy-spacing" }),
    ];
    const rules = [{ token: "legacy" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(1);
    expect(result[0].source.entityType).toBe("component");
  });

  // === VALUE FILTERING (new) ===

  it("filters drifts by exact value match", () => {
    const drifts = [
      createDrift({ actual: "#000000" }),
      createDrift({ actual: "#ff0000" }),
      createDrift({ actual: "#ffffff" }),
    ];
    const rules = [{ value: "#000000" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(2);
  });

  it("filters drifts by value regex", () => {
    const drifts = [
      createDrift({ actual: "16px" }),
      createDrift({ actual: "24px" }),
      createDrift({ actual: "1.5rem" }),
    ];
    const rules = [{ value: "\\d+px" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(1);
    expect(result[0].details.actual).toBe("1.5rem");
  });

  it("handles non-string actual values for value matching", () => {
    const drifts = [
      createDrift({ actual: 16 }),
      createDrift({ actual: "16px" }),
    ];
    const rules = [{ value: "16" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(0);
  });

  // === AND COMBINATIONS ===

  it("combines type + file as AND", () => {
    const drifts = [
      createDrift({ type: "hardcoded-value", location: "src/layouts/Grid.tsx" }),
      createDrift({ type: "hardcoded-value", location: "src/components/Button.tsx" }),
      createDrift({ type: "naming-inconsistency", location: "src/layouts/Flex.tsx" }),
    ];
    const rules = [{ type: "hardcoded-value", file: "src/layouts/**" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(2);
    // Keeps the hardcoded-value NOT in layouts, and the naming-inconsistency in layouts
    expect(result.map(d => d.source.location)).toContain("src/components/Button.tsx");
    expect(result.map(d => d.type)).toContain("naming-inconsistency");
  });

  it("combines type + component as AND", () => {
    const drifts = [
      createDrift({ type: "hardcoded-value", entityType: "component", entityName: "IconArrow" }),
      createDrift({ type: "hardcoded-value", entityType: "component", entityName: "Button" }),
      createDrift({ type: "naming-inconsistency", entityType: "component", entityName: "IconCheck" }),
    ];
    const rules = [{ type: "hardcoded-value", component: "^Icon" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(2);
    expect(result.map(d => d.source.entityName)).toContain("Button");
    expect(result.map(d => d.source.entityName)).toContain("IconCheck");
  });

  // === MULTIPLE RULES (OR) ===

  it("applies multiple rules as OR", () => {
    const drifts = [
      createDrift({ type: "hardcoded-value", entityName: "Button" }),
      createDrift({ type: "naming-inconsistency", entityName: "Card" }),
      createDrift({ type: "deprecated-pattern", entityName: "Modal" }),
    ];
    const rules = [
      { type: "hardcoded-value" },
      { type: "naming-inconsistency" },
    ];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("deprecated-pattern");
  });

  // === EDGE CASES ===

  it("returns all drifts when rules array is empty", () => {
    const drifts = [createDrift(), createDrift()];
    const result = applyIgnoreRules(drifts, []);
    expect(result).toHaveLength(2);
  });

  it("warns on invalid regex in component field", () => {
    const drifts = [createDrift({ entityName: "Button" })];
    const warnings: string[] = [];
    const rules = [{ component: "[invalid" }];

    const result = applyIgnoreRules(drifts, rules, (msg) => warnings.push(msg));
    expect(result).toHaveLength(1); // keeps drift when regex is invalid
    expect(warnings).toHaveLength(1);
  });

  it("warns on invalid regex in token field", () => {
    const drifts = [createDrift({ entityType: "token", entityName: "spacing" })];
    const warnings: string[] = [];
    const rules = [{ token: "[invalid" }];

    const result = applyIgnoreRules(drifts, rules, (msg) => warnings.push(msg));
    expect(result).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });

  it("warns on invalid regex in value field", () => {
    const drifts = [createDrift({ actual: "#000" })];
    const warnings: string[] = [];
    const rules = [{ value: "[invalid" }];

    const result = applyIgnoreRules(drifts, rules, (msg) => warnings.push(msg));
    expect(result).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });

  it("ignores rules with only reason (no filter dimensions)", () => {
    const drifts = [createDrift(), createDrift()];
    const rules = [{ reason: "just a note" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(2);
  });

  it("strips line numbers from location when matching file glob", () => {
    const drifts = [
      createDrift({ location: "src/icons/Arrow.tsx:42" }),
      createDrift({ location: "src/components/Button.tsx:10" }),
    ];
    const rules = [{ file: "src/icons/**" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(1);
    expect(result[0].source.location).toBe("src/components/Button.tsx:10");
  });

  // === SEVERITY FILTERING (new) ===

  it("filters drifts by severity", () => {
    const drifts = [
      createDrift({ severity: "info" }),
      createDrift({ severity: "warning" }),
      createDrift({ severity: "critical" }),
    ];
    const rules = [{ severity: "info" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(2);
    expect(result.map(d => d.severity)).toEqual(["warning", "critical"]);
  });

  it("combines severity + file as AND", () => {
    const drifts = [
      createDrift({ severity: "info", location: "src/tests/Button.test.tsx" }),
      createDrift({ severity: "warning", location: "src/tests/Card.test.tsx" }),
      createDrift({ severity: "info", location: "src/components/Button.tsx" }),
    ];
    const rules = [{ severity: "info", file: "src/tests/**" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(2);
    // Keeps the warning in tests and the info NOT in tests
    expect(result.map(d => d.severity)).toContain("warning");
    expect(result.map(d => d.source.location)).toContain("src/components/Button.tsx");
  });

  it("combines severity + type as AND", () => {
    const drifts = [
      createDrift({ severity: "info", type: "naming-inconsistency" }),
      createDrift({ severity: "info", type: "hardcoded-value" }),
      createDrift({ severity: "warning", type: "naming-inconsistency" }),
    ];
    const rules = [{ severity: "info", type: "naming-inconsistency" }];

    const result = applyIgnoreRules(drifts, rules);
    expect(result).toHaveLength(2);
    expect(result.map(d => d.type)).toContain("hardcoded-value");
    expect(result.map(d => d.severity)).toContain("warning");
  });
});
