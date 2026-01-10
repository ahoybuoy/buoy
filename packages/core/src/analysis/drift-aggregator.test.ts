// packages/core/src/analysis/drift-aggregator.test.ts
import { describe, it, expect } from "vitest";
import { DriftAggregator } from "./drift-aggregator.js";
import type { DriftSignal, DriftType, Severity } from "../models/index.js";

// Helper to create mock drift signals
function createDriftSignal(
  overrides: Partial<{
    id: string;
    type: DriftType;
    severity: Severity;
    entityId: string;
    entityName: string;
    location: string;
    actual: unknown;
    tokenSuggestions: string[];
  }> = {}
): DriftSignal {
  const id = overrides.id ?? `drift-${Math.random().toString(36).slice(2)}`;
  const entityId = overrides.entityId ?? `component-${Math.random().toString(36).slice(2)}`;

  return {
    id,
    type: overrides.type ?? "hardcoded-value",
    severity: overrides.severity ?? "warning",
    source: {
      entityType: "component",
      entityId,
      entityName: overrides.entityName ?? "TestComponent",
      location: overrides.location ?? "src/components/Test.tsx",
    },
    message: `Test drift signal ${id}`,
    details: {
      actual: overrides.actual,
      tokenSuggestions: overrides.tokenSuggestions,
    },
    detectedAt: new Date(),
  };
}

describe("DriftAggregator", () => {
  describe("aggregate", () => {
    it("returns empty result for empty input", () => {
      const aggregator = new DriftAggregator();
      const result = aggregator.aggregate([]);

      expect(result.groups).toHaveLength(0);
      expect(result.ungrouped).toHaveLength(0);
      expect(result.totalSignals).toBe(0);
      expect(result.totalGroups).toBe(0);
      expect(result.reductionRatio).toBe(1);
    });

    it("leaves single signals ungrouped", () => {
      const aggregator = new DriftAggregator();
      const signal = createDriftSignal({ actual: "#3b82f6" });
      const result = aggregator.aggregate([signal]);

      expect(result.groups).toHaveLength(0);
      expect(result.ungrouped).toHaveLength(1);
      expect(result.totalSignals).toBe(1);
    });

    it("preserves total count in groups", () => {
      const aggregator = new DriftAggregator();
      const signals = Array.from({ length: 50 }, () =>
        createDriftSignal({ actual: "#3b82f6" })
      );
      const result = aggregator.aggregate(signals);

      expect(result.totalSignals).toBe(50);
      // All 50 should be in one group
      expect(result.groups.length).toBeGreaterThan(0);
      const totalInGroups = result.groups.reduce((sum, g) => sum + g.totalCount, 0);
      expect(totalInGroups + result.ungrouped.length).toBe(50);
    });

    it("calculates reduction ratio", () => {
      const aggregator = new DriftAggregator();
      const signals = Array.from({ length: 100 }, () =>
        createDriftSignal({ actual: "#3b82f6" })
      );
      const result = aggregator.aggregate(signals);

      // 100 signals → 1 group = 100x reduction
      expect(result.reductionRatio).toBeGreaterThan(1);
    });
  });

  describe("value strategy", () => {
    it("groups signals with same hardcoded value", () => {
      const aggregator = new DriftAggregator();
      const signals = [
        createDriftSignal({ actual: "#3b82f6", entityName: "Button" }),
        createDriftSignal({ actual: "#3b82f6", entityName: "Card" }),
        createDriftSignal({ actual: "#3b82f6", entityName: "Modal" }),
      ];
      const result = aggregator.aggregate(signals);

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]!.signals).toHaveLength(3);
      expect(result.groups[0]!.groupingKey.strategy).toBe("value");
      expect(result.groups[0]!.groupingKey.value).toContain("#3b82f6");
    });

    it("creates separate groups for different values", () => {
      const aggregator = new DriftAggregator();
      const signals = [
        createDriftSignal({ actual: "#3b82f6", entityName: "Button1" }),
        createDriftSignal({ actual: "#3b82f6", entityName: "Button2" }),
        createDriftSignal({ actual: "#ef4444", entityName: "Error1" }),
        createDriftSignal({ actual: "#ef4444", entityName: "Error2" }),
      ];
      const result = aggregator.aggregate(signals);

      expect(result.groups).toHaveLength(2);
      expect(result.ungrouped).toHaveLength(0);
    });

    it("only applies to hardcoded-value drift type", () => {
      const aggregator = new DriftAggregator();
      const signals = [
        createDriftSignal({ type: "naming-inconsistency", actual: "same-value" }),
        createDriftSignal({ type: "naming-inconsistency", actual: "same-value" }),
      ];
      const result = aggregator.aggregate(signals);

      // Should not group by value since type is not hardcoded-value
      const valueGroups = result.groups.filter(g => g.groupingKey.strategy === "value");
      expect(valueGroups).toHaveLength(0);
    });
  });

  describe("suggestion strategy", () => {
    it("groups signals with same suggested fix", () => {
      const aggregator = new DriftAggregator();
      const signals = [
        createDriftSignal({
          actual: "#3b82f6",
          tokenSuggestions: ["#3b82f6 → colors.primary.500 (95% match)"],
        }),
        createDriftSignal({
          actual: "#3b83f7",
          tokenSuggestions: ["#3b83f7 → colors.primary.500 (90% match)"],
        }),
      ];
      const result = aggregator.aggregate(signals);

      // Both should be grouped by suggestion since they resolve to same token
      const suggestionGroups = result.groups.filter(g => g.groupingKey.strategy === "suggestion");
      expect(suggestionGroups.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("path strategy", () => {
    it("groups signals in same directory", () => {
      const aggregator = new DriftAggregator();
      const signals = [
        createDriftSignal({ location: "src/legacy/Button.tsx", entityName: "Button" }),
        createDriftSignal({ location: "src/legacy/Card.tsx", entityName: "Card" }),
        createDriftSignal({ location: "src/legacy/Modal.tsx", entityName: "Modal" }),
      ];
      const result = aggregator.aggregate(signals);

      const pathGroups = result.groups.filter(g => g.groupingKey.strategy === "path");
      expect(pathGroups.length).toBeGreaterThanOrEqual(1);
      expect(pathGroups[0]!.signals).toHaveLength(3);
    });

    it("respects configured path patterns", () => {
      const aggregator = new DriftAggregator({
        pathPatterns: ["src/legacy/**"],
      });
      const signals = [
        createDriftSignal({ location: "src/legacy/deep/Button.tsx" }),
        createDriftSignal({ location: "src/legacy/deep/nested/Card.tsx" }),
      ];
      const result = aggregator.aggregate(signals);

      const pathGroups = result.groups.filter(g => g.groupingKey.strategy === "path");
      expect(pathGroups.length).toBeGreaterThanOrEqual(1);
      // Both should match the pattern, regardless of depth
      expect(pathGroups[0]!.groupingKey.value).toContain("src/legacy");
    });
  });

  describe("entity strategy", () => {
    it("groups multiple issues in same component", () => {
      // Use only entity strategy to isolate this test
      const aggregator = new DriftAggregator({
        strategies: ["entity"],
      });
      const entityId = "component-button";
      const signals = [
        createDriftSignal({ entityId, entityName: "Button", type: "hardcoded-value", actual: "#fff" }),
        createDriftSignal({ entityId, entityName: "Button", type: "naming-inconsistency" }),
        createDriftSignal({ entityId, entityName: "Button", type: "deprecated-pattern" }),
      ];
      const result = aggregator.aggregate(signals);

      // Should be grouped by entity (all same component)
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]!.groupingKey.strategy).toBe("entity");
      expect(result.groups[0]!.signals).toHaveLength(3);
    });
  });

  describe("priority order", () => {
    it("applies value strategy before path strategy", () => {
      const aggregator = new DriftAggregator();
      const signals = [
        createDriftSignal({ actual: "#3b82f6", location: "src/a/Button.tsx" }),
        createDriftSignal({ actual: "#3b82f6", location: "src/b/Card.tsx" }),
      ];
      const result = aggregator.aggregate(signals);

      // Should group by value, not path (even though paths differ)
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]!.groupingKey.strategy).toBe("value");
    });

    it("falls through to next strategy when first doesn't apply", () => {
      const aggregator = new DriftAggregator();
      const signals = [
        createDriftSignal({ type: "naming-inconsistency", location: "src/legacy/A.tsx" }),
        createDriftSignal({ type: "naming-inconsistency", location: "src/legacy/B.tsx" }),
      ];
      const result = aggregator.aggregate(signals);

      // Value strategy doesn't apply (not hardcoded-value type)
      // Should fall through to path strategy
      const pathGroups = result.groups.filter(g => g.groupingKey.strategy === "path");
      expect(pathGroups.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("minGroupSize option", () => {
    it("respects minimum group size", () => {
      const aggregator = new DriftAggregator({ minGroupSize: 3 });
      const signals = [
        createDriftSignal({ actual: "#3b82f6" }),
        createDriftSignal({ actual: "#3b82f6" }),
      ];
      const result = aggregator.aggregate(signals);

      // Only 2 signals, min is 3, so should be ungrouped
      expect(result.groups).toHaveLength(0);
      expect(result.ungrouped).toHaveLength(2);
    });

    it("groups when meeting minimum size", () => {
      const aggregator = new DriftAggregator({ minGroupSize: 3 });
      const signals = [
        createDriftSignal({ actual: "#3b82f6" }),
        createDriftSignal({ actual: "#3b82f6" }),
        createDriftSignal({ actual: "#3b82f6" }),
      ];
      const result = aggregator.aggregate(signals);

      expect(result.groups).toHaveLength(1);
      expect(result.ungrouped).toHaveLength(0);
    });
  });

  describe("DriftGroup structure", () => {
    it("includes all required fields", () => {
      const aggregator = new DriftAggregator();
      const signals = [
        createDriftSignal({ actual: "#3b82f6", severity: "warning" }),
        createDriftSignal({ actual: "#3b82f6", severity: "critical" }),
        createDriftSignal({ actual: "#3b82f6", severity: "info" }),
      ];
      const result = aggregator.aggregate(signals);

      const group = result.groups[0]!;
      expect(group.id).toBeDefined();
      expect(group.groupingKey).toBeDefined();
      expect(group.summary).toBeDefined();
      expect(group.signals).toHaveLength(3);
      expect(group.totalCount).toBe(3);
      expect(group.bySeverity).toEqual({ critical: 1, warning: 1, info: 1 });
      expect(group.representative).toBeDefined();
    });

    it("generates human-readable summary", () => {
      const aggregator = new DriftAggregator();
      const signals = [
        createDriftSignal({ actual: "#3b82f6" }),
        createDriftSignal({ actual: "#3b82f6" }),
      ];
      const result = aggregator.aggregate(signals);

      expect(result.groups[0]!.summary).toContain("2");
      expect(result.groups[0]!.summary).toContain("#3b82f6");
    });
  });

  describe("custom strategies", () => {
    it("accepts custom strategy objects", () => {
      const customStrategy = {
        type: "custom" as const,
        getKey: (signal: DriftSignal) => `custom:${signal.severity}`,
        summarize: (signals: DriftSignal[], key: string) =>
          `${signals.length} signals with ${key}`,
      };

      const aggregator = new DriftAggregator({
        strategies: [customStrategy],
        minGroupSize: 1, // Allow single-item groups for this test
      });
      const signals = [
        createDriftSignal({ severity: "warning" }),
        createDriftSignal({ severity: "warning" }),
        createDriftSignal({ severity: "critical" }),
      ];
      const result = aggregator.aggregate(signals);

      expect(result.groups).toHaveLength(2); // warning group + critical group
    });
  });
});
