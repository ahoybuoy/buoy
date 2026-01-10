/**
 * Drift Aggregator
 *
 * Post-processing layer that groups raw drift signals for actionability
 * while preserving total counts for severity scoring.
 */

import type { DriftSignal } from "../models/index.js";

// ============================================================================
// Types
// ============================================================================

export interface DriftGroup {
  /** Unique ID for this group */
  id: string;

  /** What grouped these signals together */
  groupingKey: {
    strategy: string;
    value: string;
  };

  /** Human-readable summary */
  summary: string;

  /** All individual signals (preserved for scoring) */
  signals: DriftSignal[];

  /** Quick access counts */
  totalCount: number;
  bySeverity: { critical: number; warning: number; info: number };

  /** Unified suggestion if all signals share one */
  commonSuggestion?: string;

  /** Representative signal for display */
  representative: DriftSignal;
}

export interface AggregationResult {
  groups: DriftGroup[];
  ungrouped: DriftSignal[];
  totalSignals: number;
  totalGroups: number;
  /** Noise reduction metric: 100 signals → 5 groups = 20x */
  reductionRatio: number;
}

export interface GroupingStrategy {
  /** Unique identifier for this strategy */
  type: string;

  /**
   * Extract a grouping key from a signal.
   * @returns Grouping key string, or null if strategy doesn't apply
   */
  getKey(signal: DriftSignal): string | null;

  /**
   * Generate human-readable summary for a group.
   */
  summarize(signals: DriftSignal[], key: string): string;
}

export type BuiltInStrategyType = "value" | "suggestion" | "path" | "entity";

export interface AggregatorOptions {
  /** Strategies to apply, in priority order. First match wins. */
  strategies?: Array<BuiltInStrategyType | GroupingStrategy>;

  /** Minimum signals to form a group (default: 2) */
  minGroupSize?: number;

  /** Path patterns for path-based grouping */
  pathPatterns?: string[];
}

// ============================================================================
// Built-in Strategies
// ============================================================================

const valueStrategy: GroupingStrategy = {
  type: "value",

  getKey(signal: DriftSignal): string | null {
    if (signal.type !== "hardcoded-value") return null;

    const actual = signal.details.actual;
    if (typeof actual !== "string") return null;

    return `value:${actual}`;
  },

  summarize(signals: DriftSignal[], key: string): string {
    const value = key.replace("value:", "");
    return `${signals.length} components use hardcoded value "${value}"`;
  },
};

const suggestionStrategy: GroupingStrategy = {
  type: "suggestion",

  getKey(signal: DriftSignal): string | null {
    const suggestions = signal.details.tokenSuggestions;
    if (!suggestions?.length) return null;

    // Parse: "value → tokenName (confidence)"
    const first = suggestions[0];
    if (!first) return null;

    const match = first.match(/→\s*([^\s(]+)/);
    if (!match) return null;

    return `suggestion:${match[1]}`;
  },

  summarize(signals: DriftSignal[], key: string): string {
    const token = key.replace("suggestion:", "");
    return `${signals.length} issues fixable by using ${token}`;
  },
};

function createPathStrategy(patterns: string[]): GroupingStrategy {
  return {
    type: "path",

    getKey(signal: DriftSignal): string | null {
      const location = signal.source.location;
      if (!location || !location.includes("/")) return null;

      // Check configured patterns first
      for (const pattern of patterns) {
        if (matchGlob(location, pattern)) {
          return `path:${pattern}`;
        }
      }

      // Fallback: group by directory
      const parts = location.split("/");
      if (parts.length >= 2) {
        const dir = parts.slice(0, -1).join("/");
        return `path:${dir}`;
      }

      return null;
    },

    summarize(signals: DriftSignal[], key: string): string {
      const path = key.replace("path:", "");
      const types = [...new Set(signals.map((s) => s.type))];
      return `${signals.length} issues in ${path}/ (${types.join(", ")})`;
    },
  };
}

const entityStrategy: GroupingStrategy = {
  type: "entity",

  getKey(signal: DriftSignal): string | null {
    return `entity:${signal.source.entityId}`;
  },

  summarize(signals: DriftSignal[], _key: string): string {
    const entityName = signals[0]?.source.entityName ?? "Unknown";
    const types = [...new Set(signals.map((s) => s.type))];

    if (types.length === 1) {
      return `${signals.length} ${types[0]} issues in ${entityName}`;
    }
    return `${signals.length} issues in ${entityName} (${types.join(", ")})`;
  },
};

// ============================================================================
// Helpers
// ============================================================================

function matchGlob(path: string, pattern: string): boolean {
  // Convert glob to regex
  // Use placeholder for ** to avoid single-star replacement affecting it
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/\*\*/g, "<<<GLOBSTAR>>>")
        .replace(/\*/g, "[^/]*")
        .replace(/<<<GLOBSTAR>>>/g, ".*") +
      "$"
  );
  return regex.test(path);
}

function countBySeverity(signals: DriftSignal[]): {
  critical: number;
  warning: number;
  info: number;
} {
  const counts = { critical: 0, warning: 0, info: 0 };
  for (const signal of signals) {
    counts[signal.severity]++;
  }
  return counts;
}

function generateGroupId(strategy: string, key: string): string {
  // Simple hash for stable IDs
  const content = `${strategy}:${key}`;
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `group:${strategy}:${Math.abs(hash).toString(16)}`;
}

// ============================================================================
// DriftAggregator
// ============================================================================

export class DriftAggregator {
  private strategies: GroupingStrategy[];
  private options: Required<Omit<AggregatorOptions, "strategies">>;

  constructor(options: AggregatorOptions = {}) {
    this.options = {
      minGroupSize: options.minGroupSize ?? 2,
      pathPatterns: options.pathPatterns ?? [],
    };

    // Build strategy list
    const strategyDefs = options.strategies ?? [
      "value",
      "suggestion",
      "path",
      "entity",
    ];
    this.strategies = strategyDefs.map((s) => this.resolveStrategy(s));
  }

  private resolveStrategy(
    strategy: BuiltInStrategyType | GroupingStrategy
  ): GroupingStrategy {
    if (typeof strategy === "object") {
      return strategy;
    }

    switch (strategy) {
      case "value":
        return valueStrategy;
      case "suggestion":
        return suggestionStrategy;
      case "path":
        return createPathStrategy(this.options.pathPatterns);
      case "entity":
        return entityStrategy;
      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }
  }

  /**
   * Aggregate signals into groups.
   * Returns both grouped and ungrouped for flexible consumption.
   */
  aggregate(signals: DriftSignal[]): AggregationResult {
    if (signals.length === 0) {
      return {
        groups: [],
        ungrouped: [],
        totalSignals: 0,
        totalGroups: 0,
        reductionRatio: 1,
      };
    }

    const groups: DriftGroup[] = [];
    let remaining = [...signals];

    // Multi-pass: each strategy gets a shot at remaining signals
    for (const strategy of this.strategies) {
      const { formed, leftover } = this.applyStrategy(strategy, remaining);
      groups.push(...formed);
      remaining = leftover;
    }

    const outputCount = groups.length + remaining.length;

    return {
      groups,
      ungrouped: remaining,
      totalSignals: signals.length,
      totalGroups: groups.length,
      reductionRatio: outputCount > 0 ? signals.length / outputCount : 1,
    };
  }

  private applyStrategy(
    strategy: GroupingStrategy,
    signals: DriftSignal[]
  ): { formed: DriftGroup[]; leftover: DriftSignal[] } {
    const buckets = new Map<string, DriftSignal[]>();
    const noKey: DriftSignal[] = [];

    for (const signal of signals) {
      const key = strategy.getKey(signal);
      if (key) {
        const bucket = buckets.get(key) ?? [];
        bucket.push(signal);
        buckets.set(key, bucket);
      } else {
        noKey.push(signal);
      }
    }

    const formed: DriftGroup[] = [];
    const leftover: DriftSignal[] = [...noKey];

    for (const [key, bucket] of buckets) {
      if (bucket.length >= this.options.minGroupSize) {
        formed.push(this.createGroup(strategy, key, bucket));
      } else {
        leftover.push(...bucket);
      }
    }

    return { formed, leftover };
  }

  private createGroup(
    strategy: GroupingStrategy,
    key: string,
    signals: DriftSignal[]
  ): DriftGroup {
    const keyValue = key.includes(":") ? key.split(":").slice(1).join(":") : key;

    return {
      id: generateGroupId(strategy.type, key),
      groupingKey: {
        strategy: strategy.type,
        value: keyValue,
      },
      summary: strategy.summarize(signals, key),
      signals,
      totalCount: signals.length,
      bySeverity: countBySeverity(signals),
      representative: signals[0]!,
    };
  }
}

// ============================================================================
// Exports for extensibility
// ============================================================================

export const builtInStrategies = {
  value: valueStrategy,
  suggestion: suggestionStrategy,
  path: createPathStrategy([]),
  entity: entityStrategy,
} as const;

export function createStrategy(config: GroupingStrategy): GroupingStrategy {
  return config;
}
