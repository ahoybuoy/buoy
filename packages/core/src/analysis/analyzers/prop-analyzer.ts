/**
 * Prop Type Analyzer
 *
 * Analyzes prop type consistency and naming conventions across components.
 * Detects inconsistencies where the same prop name uses different types
 * in different components.
 */

import type { Component } from "../../models/index.js";
import { NAMING_CONFIG } from "../config.js";

/**
 * React type equivalents — these are the same type expressed differently
 */
const REACT_TYPE_EQUIVALENTS: Record<string, string> = {
  "ReactElement": "ReactNode",
  "JSX.Element": "ReactNode",
  "React.ReactNode": "ReactNode",
  "React.ReactElement": "ReactNode",
};

function normalizeType(type: string): string {
  return REACT_TYPE_EQUIVALENTS[type] ?? type;
}

/**
 * Utility type wrappers from TypeScript — inference artifacts, not design drift
 */
const UTILITY_TYPE_PATTERN = /^(Awaited|ReturnType|Partial|Pick|Omit|Record|Extract|Exclude|Required|Readonly)</;

/**
 * Props that intentionally have type variation across components
 */
const FLEXIBLE_PROPS = new Set(["children", "classname", "style", "ref", "key", "as", "component"]);

/**
 * Usage statistics for a prop type
 */
export interface PropTypeUsage {
  types: Map<string, { count: number; examples: string[] }>;
  total: number;
}

/**
 * Result of a prop type conflict check
 */
export interface PropTypeConflict {
  dominantType: string;
  examples: string[];
}

/**
 * Issue with prop naming consistency
 */
export interface PropNamingIssue {
  propName: string;
  message: string;
  suggestion: string;
}

/**
 * Build a map of prop names to their types across all components
 */
export function buildPropTypeMap(components: Component[]): Map<string, PropTypeUsage> {
  const map = new Map<string, PropTypeUsage>();

  for (const comp of components) {
    for (const prop of comp.props) {
      const normalizedName = prop.name.toLowerCase();
      if (!map.has(normalizedName)) {
        map.set(normalizedName, { types: new Map(), total: 0 });
      }
      const usage = map.get(normalizedName)!;
      const normalizedType = normalizeType(prop.type);
      const typeCount = usage.types.get(normalizedType) || {
        count: 0,
        examples: [],
      };
      typeCount.count++;
      if (typeCount.examples.length < 3) {
        typeCount.examples.push(comp.name);
      }
      usage.types.set(normalizedType, typeCount);
      usage.total++;
    }
  }

  return map;
}

/**
 * Check if a prop's type conflicts with the dominant type for that prop name
 */
export function checkPropTypeConsistency(
  prop: { name: string; type: string },
  propTypeMap: Map<string, PropTypeUsage>,
): PropTypeConflict | null {
  const normalizedName = prop.name.toLowerCase();

  // Fix 1.4: Skip inherently flexible props — intentional type variation
  if (FLEXIBLE_PROPS.has(normalizedName) || normalizedName.startsWith("data-") || normalizedName.startsWith("aria-")) {
    return null;
  }

  const usage = propTypeMap.get(normalizedName);
  if (!usage || usage.total < 5) return null; // Fix 1.5: Raised from 3 to reduce small-sample noise

  // Find dominant type
  let dominantType = "";
  let dominantCount = 0;
  for (const [type, data] of usage.types) {
    if (data.count > dominantCount) {
      dominantType = type;
      dominantCount = data.count;
    }
  }

  const normalizedPropType = normalizeType(prop.type);

  // Fix 1.1: Skip unknown comparisons — no meaningful comparison possible
  if (normalizedPropType === "unknown" || dominantType === "unknown") return null;

  // Fix 1.3: Skip utility type wrappers — TypeScript inference artifacts
  if (UTILITY_TYPE_PATTERN.test(normalizedPropType) || UTILITY_TYPE_PATTERN.test(dominantType)) return null;

  // Only flag if this prop's type differs and dominant exceeds threshold
  if (normalizedPropType === dominantType) return null;
  if (
    dominantCount / usage.total <
    NAMING_CONFIG.establishedConventionThreshold
  ) {
    return null;
  }

  const examples = usage.types.get(dominantType)?.examples || [];
  return { dominantType, examples };
}

/**
 * Build a map of semantic prop purposes to their naming patterns
 */
export function buildPropNamingMap(components: Component[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  // Group props by semantic purpose
  const clickHandlers: string[] = [];
  const changeHandlers: string[] = [];

  for (const comp of components) {
    for (const prop of comp.props) {
      const lower = prop.name.toLowerCase();
      if (lower.includes("click") || lower.includes("press")) {
        clickHandlers.push(prop.name);
      }
      if (lower.includes("change")) {
        changeHandlers.push(prop.name);
      }
    }
  }

  map.set("click", clickHandlers);
  map.set("change", changeHandlers);

  return map;
}

/**
 * Find the dominant prefix pattern in a list of prop names
 */
export function findDominantPropPattern(
  propNames: string[],
): { prefix: string; count: number } | null {
  const prefixes: Record<string, number> = {};

  for (const name of propNames) {
    if (name.startsWith("on")) prefixes["on"] = (prefixes["on"] || 0) + 1;
    else if (name.startsWith("handle"))
      prefixes["handle"] = (prefixes["handle"] || 0) + 1;
  }

  let dominant: { prefix: string; count: number } | null = null;
  for (const [prefix, count] of Object.entries(prefixes)) {
    if (!dominant || count > dominant.count) {
      dominant = { prefix, count };
    }
  }

  return dominant;
}

/**
 * Check prop naming consistency for a component against project patterns
 */
export function checkPropNamingConsistency(
  component: Component,
  propNamingMap: Map<string, string[]>,
): PropNamingIssue[] {
  const issues: PropNamingIssue[] = [];

  for (const prop of component.props) {
    const lower = prop.name.toLowerCase();

    // Check click handler naming
    if (lower.includes("click") || lower.includes("press")) {
      const allClickHandlers = propNamingMap.get("click") || [];
      if (allClickHandlers.length >= 5) {
        const dominant = findDominantPropPattern(allClickHandlers);
        if (dominant && !prop.name.startsWith(dominant.prefix)) {
          const dominantPct = Math.round(
            (dominant.count / allClickHandlers.length) * 100,
          );
          if (dominantPct >= 70) {
            issues.push({
              propName: prop.name,
              message: `"${prop.name}" in "${component.name}" - ${dominantPct}% of click handlers use "${dominant.prefix}..." pattern`,
              suggestion: `Consider using "${dominant.prefix}${prop.name.replace(/^(on|handle)/i, "")}" for consistency`,
            });
          }
        }
      }
    }
  }

  return issues;
}
