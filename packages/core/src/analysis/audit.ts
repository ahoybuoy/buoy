// Audit report generation - analyzes codebase for design system health
import type { DriftType } from "../models/drift.js";

export interface AuditValue {
  category: 'color' | 'spacing' | 'typography' | 'radius';
  value: string;
  file: string;
  line: number;
}

export interface CategoryStats {
  uniqueCount: number;
  totalUsages: number;
  mostCommon: Array<{ value: string; count: number }>;
}

export interface FileIssue {
  file: string;
  issueCount: number;
}

export interface CloseMatch {
  value: string;
  closeTo: string;
  distance: number;
}

export interface AuditReport {
  categories: Record<string, CategoryStats>;
  worstFiles: FileIssue[];
  totals: {
    uniqueValues: number;
    totalUsages: number;
    filesAffected: number;
  };
  closeMatches: CloseMatch[];
  score: number;
}

// --- 4-Pillar Health Score System ---

/**
 * Metrics gathered from drift analysis for health scoring.
 * All counts come from drift signals and scan results.
 */
export interface HealthMetrics {
  /** Total components found in codebase */
  componentCount: number;
  /** Total design tokens defined */
  tokenCount: number;
  /** Number of hardcoded-value drift signals */
  hardcodedValueCount: number;
  /** Number of unused-token drift signals */
  unusedTokenCount: number;
  /** Number of naming-inconsistency drift signals */
  namingInconsistencyCount: number;
  /** Number of critical-severity drift signals */
  criticalCount: number;
  /** Number of accessibility-conflict drift signals */
  accessibilityConflictCount?: number;
  /** Number of color-contrast drift signals */
  colorContrastCount?: number;
  /** Whether a utility CSS framework (Tailwind) is detected */
  hasUtilityFramework: boolean;
  /** Whether a design system library (MUI, Chakra, shadcn, etc.) is detected */
  hasDesignSystemLibrary: boolean;
  /** Total drift signals of ALL types (hardcoded-value, naming-inconsistency, repeated-pattern, etc.) */
  totalDriftCount?: number;
  /** Number of unused-component drift signals (dead code) */
  unusedComponentCount?: number;
  /** Number of repeated-pattern drift signals (extract to shared component) */
  repeatedPatternCount?: number;
  /** Number of orphaned-component drift signals (dead code) */
  orphanedComponentCount?: number;
  /** Number of semantic-mismatch drift signals (naming/structure inconsistencies) */
  semanticMismatchCount?: number;
  /** Number of deprecated-pattern drift signals (technical debt) */
  deprecatedPatternCount?: number;
  /** Number of orphaned-token drift signals (token exists in code but not canonical DS source) */
  orphanedTokenCount?: number;
  /** Number of value-divergence drift signals (code/design values differ) */
  valueDivergenceCount?: number;
  /** Number of missing-documentation drift signals */
  missingDocumentationCount?: number;
  /** Number of framework-sprawl drift signals */
  frameworkSprawlCount?: number;
  /** Number of files with >2 hardcoded values (severe maintenance burden) */
  highDensityFileCount?: number;
  /** Number of drift signals from vendored/template components (e.g., shadcn/ui) */
  vendoredDriftCount?: number;
  /** Most common hardcoded color (for suggestions) */
  topHardcodedColor?: { value: string; count: number };
  /** File with the most drift issues */
  worstFile?: { path: string; issueCount: number };
  /** Total unique spacing values found */
  uniqueSpacingValues?: number;
  /** Names of detected frameworks/libraries (for framework-aware suggestions) */
  detectedFrameworkNames?: string[];
}

export interface HealthPillar {
  name: string;
  score: number;
  maxScore: number;
  description: string;
}

export interface HealthScoreResult {
  /** Overall score 0-100, or null if no UI surface detected */
  score: number | null;
  /** Tier label */
  tier: 'Great' | 'Good' | 'OK' | 'Bad' | 'Terrible' | 'N/A';
  /** Individual pillar scores */
  pillars: {
    valueDiscipline: HealthPillar;
    tokenHealth: HealthPillar;
    consistency: HealthPillar;
    criticalIssues: HealthPillar;
  };
  /** Actionable improvement suggestions */
  suggestions: string[];
  /**
   * What stands between this score and 100: one step per pillar that is short
   * of full marks (plus the drift-density cap when it applies). The points add
   * up to 100 - score. Empty at 100; absent when the repo is not scored.
   */
  pathTo100?: PathTo100Step[];
  /** Raw metrics used for scoring */
  metrics: HealthMetrics;
}

export interface PathTo100Step {
  pillar: HealthPillarKey | "driftCap";
  /** Points this step is worth. */
  points: number;
  /** The concrete change that earns them. */
  action: string;
}

export type HealthPillarKey = "valueDiscipline" | "tokenHealth" | "consistency" | "criticalIssues";
export type HealthCoverageMode = "direct" | "indirect";

/**
 * Exhaustive mapping of drift signal types to the health score pillar they influence.
 * Keep this in sync with DriftType to prevent adding new drift types without scoring coverage.
 */
export const DRIFT_TYPE_HEALTH_COVERAGE: Record<DriftType, { pillar: HealthPillarKey; mode: HealthCoverageMode }> = {
  "deprecated-pattern": { pillar: "criticalIssues", mode: "direct" },
  "accessibility-conflict": { pillar: "criticalIssues", mode: "direct" },
  "semantic-mismatch": { pillar: "consistency", mode: "direct" },
  "orphaned-component": { pillar: "valueDiscipline", mode: "direct" },
  "orphaned-token": { pillar: "tokenHealth", mode: "direct" },
  "value-divergence": { pillar: "tokenHealth", mode: "direct" },
  "naming-inconsistency": { pillar: "consistency", mode: "direct" },
  "missing-documentation": { pillar: "criticalIssues", mode: "direct" },
  "hardcoded-value": { pillar: "valueDiscipline", mode: "direct" },
  "framework-sprawl": { pillar: "consistency", mode: "direct" },
  "unused-component": { pillar: "valueDiscipline", mode: "direct" },
  "unused-token": { pillar: "tokenHealth", mode: "direct" },
  "color-contrast": { pillar: "criticalIssues", mode: "direct" },
  "repeated-pattern": { pillar: "valueDiscipline", mode: "direct" },
};

/**
 * Generate an audit report from extracted values
 */
export function generateAuditReport(values: AuditValue[]): AuditReport {
  if (values.length === 0) {
    return {
      categories: {},
      worstFiles: [],
      totals: { uniqueValues: 0, totalUsages: 0, filesAffected: 0 },
      closeMatches: [],
      score: 100,
    };
  }

  // Group by category
  const byCategory = new Map<string, Map<string, number>>();
  const byFile = new Map<string, number>();
  const allFiles = new Set<string>();

  for (const v of values) {
    // Category stats
    if (!byCategory.has(v.category)) {
      byCategory.set(v.category, new Map());
    }
    const catMap = byCategory.get(v.category)!;
    catMap.set(v.value, (catMap.get(v.value) || 0) + 1);

    // File stats
    byFile.set(v.file, (byFile.get(v.file) || 0) + 1);
    allFiles.add(v.file);
  }

  // Build category stats
  const categories: Record<string, CategoryStats> = {};
  let totalUnique = 0;

  for (const [category, valueMap] of byCategory) {
    const entries = [...valueMap.entries()];
    const uniqueCount = entries.length;
    const totalUsages = entries.reduce((sum, [, count]) => sum + count, 0);

    // Sort by count descending for mostCommon
    const mostCommon = entries
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    categories[category] = { uniqueCount, totalUsages, mostCommon };
    totalUnique += uniqueCount;
  }

  // Build worst files list
  const worstFiles = [...byFile.entries()]
    .map(([file, issueCount]) => ({ file, issueCount }))
    .sort((a, b) => b.issueCount - a.issueCount)
    .slice(0, 10);

  const report: AuditReport = {
    categories,
    worstFiles,
    totals: {
      uniqueValues: totalUnique,
      totalUsages: values.length,
      filesAffected: allFiles.size,
    },
    closeMatches: [],
    score: 0,
  };

  report.score = calculateHealthScore(report);
  return report;
}

/**
 * Find values that are close to design tokens (likely typos)
 */
export function findCloseMatches(
  foundValues: string[],
  designTokens: string[],
  category: 'color' | 'spacing' | 'typography' | 'radius'
): CloseMatch[] {
  const matches: CloseMatch[] = [];
  const tokenSet = new Set(designTokens.map((t) => t.toLowerCase()));

  for (const value of foundValues) {
    const valueLower = value.toLowerCase();

    // Skip exact matches
    if (tokenSet.has(valueLower)) {
      continue;
    }

    // Find closest token
    let closestToken: string | null = null;
    let closestDistance = Infinity;

    for (const token of designTokens) {
      const distance = getDistance(value, token, category);
      if (distance < closestDistance && distance > 0) {
        closestDistance = distance;
        closestToken = token;
      }
    }

    // Only include if close enough (threshold depends on category)
    const threshold = category === 'color' ? 5 : 2;
    if (closestToken && closestDistance <= threshold) {
      matches.push({
        value,
        closeTo: closestToken,
        distance: closestDistance,
      });
    }
  }

  return matches;
}

/**
 * Calculate distance between two values
 */
function getDistance(
  a: string,
  b: string,
  category: 'color' | 'spacing' | 'typography' | 'radius'
): number {
  if (category === 'color') {
    return colorDistance(a, b);
  }

  if (category === 'spacing' || category === 'radius') {
    return numericDistance(a, b);
  }

  // For typography, use simple string comparison
  return a.toLowerCase() === b.toLowerCase() ? 0 : Infinity;
}

/**
 * Calculate color distance (simple hex comparison)
 */
function colorDistance(a: string, b: string): number {
  const hexA = a.replace('#', '').toLowerCase();
  const hexB = b.replace('#', '').toLowerCase();

  if (hexA.length !== 6 || hexB.length !== 6) {
    return Infinity;
  }

  // Count differing characters
  let diff = 0;
  for (let i = 0; i < 6; i++) {
    if (hexA[i] !== hexB[i]) {
      diff++;
    }
  }

  return diff;
}

/**
 * Calculate numeric distance for spacing/radius
 */
function numericDistance(a: string, b: string): number {
  const numA = parseFloat(a);
  const numB = parseFloat(b);

  if (isNaN(numA) || isNaN(numB)) {
    return Infinity;
  }

  return Math.abs(numA - numB);
}

/**
 * @deprecated Use calculateHealthScorePillar() with proper HealthMetrics instead.
 * This legacy function approximates componentCount from filesAffected which
 * is inaccurate. Kept for backward compatibility with external callers.
 */
export function calculateHealthScore(report: AuditReport): number {
  const metrics: HealthMetrics = {
    componentCount: report.totals.filesAffected || 1,
    tokenCount: 0,
    hardcodedValueCount: report.totals.uniqueValues,
    unusedTokenCount: 0,
    namingInconsistencyCount: 0,
    criticalCount: 0,
    hasUtilityFramework: false,
    hasDesignSystemLibrary: false,
  };
  // Legacy callers approximate the component count, so no minimum applies.
  return calculateHealthScorePillar(metrics, { minComponents: 0 }).score ?? 0;
}

/**
 * 4-Pillar Health Score System
 *
 * Measures design system health across four dimensions:
 * - Value Discipline (0-60): Hardcoded values per component (density)
 * - Token Health (0-20): Token system existence and adoption
 * - Consistency (0-10): Naming convention adherence
 * - Critical Issues (0-10): Accessibility and critical failures
 *
 * Tiers: 80-100 Great, 60-79 Good, 40-59 OK, 20-39 Bad, 0-19 Terrible
 *
 * Note: A perfect 100 requires maxing all 4 pillars simultaneously.
 * In practice, the highest-scoring real-world apps reach ~95.
 * A score of 95 represents near-perfect design system health.
 */
/** Below this many detected components a score says more about the scanner than the code. */
export const MIN_SCORABLE_COMPONENTS = 5;

/** Hardcoded design values per component at which Value Discipline reaches 0. */
export const VALUE_DENSITY_FLOOR = 0.3;

export function calculateHealthScorePillar(
  metrics: HealthMetrics,
  options: { minComponents?: number } = {},
): HealthScoreResult {
  const suggestions: string[] = [];
  const frameworks = metrics.detectedFrameworkNames ?? [];

  // Too little UI surface to judge. Scoring it anyway produced "Terrible 14"
  // for repos where the scanner simply did not recognise the components
  // (unkey, plausible in the 2026-09 reports): a coverage gap, not a verdict.
  const minComponents = options.minComponents ?? MIN_SCORABLE_COMPONENTS;
  const noSurface = metrics.componentCount === 0 && metrics.tokenCount === 0 && (metrics.totalDriftCount ?? 0) === 0;
  if (noSurface || metrics.componentCount < minComponents) {
    return {
      score: null,
      tier: 'N/A' as const,
      pillars: {
        valueDiscipline: { name: 'Value Discipline', score: 0, maxScore: 60, description: 'Hardcoded values per component' },
        tokenHealth: { name: 'Token Health', score: 0, maxScore: 20, description: 'Token system adoption' },
        consistency: { name: 'Consistency', score: 0, maxScore: 10, description: 'Naming convention adherence' },
        criticalIssues: { name: 'Critical Issues', score: 0, maxScore: 10, description: 'Accessibility and critical failures' },
      },
      suggestions: [noSurface
        ? 'No UI components or design tokens detected — this repo may not need design system health tracking'
        : `Only ${metrics.componentCount} UI component${metrics.componentCount === 1 ? '' : 's'} detected, too few to score. If this repo has more, Buoy may not recognise its framework yet.`],
      metrics,
    };
  }

  // Pillar 1: Value Discipline (0-60)
  // Primary: hardcoded value density
  // Secondary: dead code density (unused/orphaned components, repeated patterns)
  // Tertiary: total drift density as backstop
  const userHardcodedCount = Math.max(0, metrics.hardcodedValueCount - (metrics.vendoredDriftCount ?? 0));
  const hardcodedDensity = userHardcodedCount / Math.max(metrics.componentCount, 1);
  const deadCodeCount = (metrics.unusedComponentCount ?? 0)
    + (metrics.orphanedComponentCount ?? 0)
    + (metrics.repeatedPatternCount ?? 0);
  const deadCodeDensity = deadCodeCount / Math.max(metrics.componentCount, 1);
  const totalDriftDensity = (metrics.totalDriftCount ?? metrics.hardcodedValueCount) / Math.max(metrics.componentCount, 1);
  // Hardcoded density is primary; dead code adds 30% partial penalty; total drift as backstop
  const density = Math.max(
    hardcodedDensity + deadCodeDensity * 0.3,
    totalDriftDensity * 0.5,
  );
  // Smooth curve with no free zone: every real hardcoded value costs a little,
  // and 0.3 per component (roughly one in three components) empties the pillar.
  // The old "<0.1 per component counts as perfect" rule offset findings that
  // were mostly noise; once icons, email templates and layout values stopped
  // counting (2026-09), it scored repos with 87 real literals as 100.
  const valueDisciplineRaw = 60 * clamp(1 - density / VALUE_DENSITY_FLOOR, 0, 1);
  const valueDisciplineScore = Math.round(valueDisciplineRaw);

  if (metrics.hardcodedValueCount > 0) {
    const hasTailwind = frameworks.includes('tailwind');
    const hasShadcn = frameworks.includes('shadcn');
    const hasMui = frameworks.includes('mui');

    let suggestion: string;

    if (density > 1.0) {
      // Severe — high urgency
      suggestion = `${userHardcodedCount} hardcoded values across your components — high density`;
      if (metrics.topHardcodedColor) {
        suggestion += `. Most common: ${metrics.topHardcodedColor.value} (${metrics.topHardcodedColor.count}\u00d7)`;
      }
      if (hasTailwind) {
        suggestion += '. Add values to your Tailwind theme config instead of using arbitrary values';
      } else if (hasMui) {
        suggestion += '. Use the `sx` prop or `theme.palette` instead of inline colors';
      } else {
        suggestion += '. Create a design token file (e.g., tokens.css with CSS custom properties)';
      }
    } else if (density > 0.3) {
      // Moderate
      suggestion = `${userHardcodedCount} hardcoded value${userHardcodedCount === 1 ? '' : 's'} to extract`;
      if (hasTailwind && hasShadcn) {
        suggestion += ' — use `cn()` utility with Tailwind theme classes';
      } else if (hasTailwind) {
        suggestion += ' — extend your tailwind.config theme instead of arbitrary values';
      }
      if (metrics.worstFile) {
        suggestion += `. Focus on ${metrics.worstFile.path} (${metrics.worstFile.issueCount} issues)`;
      }
    } else {
      // Low — encouraging
      suggestion = `Nearly there — just ${userHardcodedCount} hardcoded value${userHardcodedCount === 1 ? '' : 's'} left to tokenize`;
      if (metrics.worstFile && metrics.worstFile.issueCount > 1) {
        suggestion += `. ${metrics.worstFile.path} has the most (${metrics.worstFile.issueCount})`;
      }
    }

    suggestions.push(suggestion);
  }

  if ((metrics.vendoredDriftCount ?? 0) > 0) {
    suggestions.push(
      `${metrics.vendoredDriftCount} additional hardcoded values in vendored components (shadcn/ui templates) — these are from the library, not your code`
    );
  }

  // Dead code suggestions (threshold-based to reduce noise)
  const unusedComponentCount = metrics.unusedComponentCount ?? 0;
  const repeatedPatternCount = metrics.repeatedPatternCount ?? 0;
  if (unusedComponentCount > 10) {
    if (unusedComponentCount > 50) {
      suggestions.push(
        `${unusedComponentCount} unused components detected — consider a cleanup sprint to remove dead code`
      );
    } else {
      suggestions.push(
        `${unusedComponentCount} unused components — review and remove dead code`
      );
    }
  }
  if (repeatedPatternCount > 5) {
    if (repeatedPatternCount > 20) {
      suggestions.push(
        `${repeatedPatternCount} repeated patterns — significant duplication, extract to a shared component library`
      );
    } else {
      suggestions.push(
        `${repeatedPatternCount} repeated patterns — extract to shared components`
      );
    }
  }

  // Pillar 2: Token Health (0-20)
  //   1. A token system (0-10): the repo's own tokens (full credit at 20), or a
  //      utility framework whose theme is a token scale (Tailwind). A component
  //      library alone gives partial credit.
  //   2. Token hygiene (0-10): defined tokens are used, not left stale.
  // How much of the code actually uses tokens is Value Discipline's job; it is
  // not counted twice here. Until 2026-09 half of this pillar was "has
  // Tailwind" plus "has a component library", so n8n (637 tokens, no Tailwind)
  // and Plane (82 tokens, no Radix) could never pass 15/20.
  const ownTokenPoints = metrics.tokenCount > 0 ? 10 * clamp(metrics.tokenCount / 20, 0, 1) : 0;
  const frameworkPoints = metrics.hasUtilityFramework ? 10 : metrics.hasDesignSystemLibrary ? 5 : 0;
  const systemPoints = Math.max(ownTokenPoints, frameworkPoints);

  let hygienePoints: number;
  if (metrics.tokenCount > 0) {
    const effectiveUnusedTokenCount = Math.min(
      metrics.tokenCount,
      metrics.unusedTokenCount + (metrics.orphanedTokenCount ?? 0),
    );
    hygienePoints = 10 * clamp((metrics.tokenCount - effectiveUnusedTokenCount) / metrics.tokenCount, 0, 1);
  } else {
    // No tokens of its own: a framework's theme has nothing to go stale.
    hygienePoints = systemPoints > 0 ? 10 : 0;
  }

  // Round the combined score for integer totals
  const valueDivergencePenalty = Math.min(3, Math.ceil((metrics.valueDivergenceCount ?? 0) / 5));
  const tokenHealthScore = Math.max(
    0,
    Math.round(systemPoints + hygienePoints) - valueDivergencePenalty,
  );

  // Token health suggestions (threshold-based)
  if (metrics.tokenCount > 0 && metrics.unusedTokenCount > 5) {
    const unusedPct = Math.round((metrics.unusedTokenCount / metrics.tokenCount) * 100);
    if (unusedPct > 50) {
      suggestions.push(
        `${metrics.unusedTokenCount} of ${metrics.tokenCount} tokens unused (${unusedPct}%) — many tokens may be stale, audit your token definitions`
      );
    } else {
      suggestions.push(
        `${metrics.unusedTokenCount} tokens defined but unused — wire them into components or remove stale definitions`
      );
    }
  }
  if ((metrics.orphanedTokenCount ?? 0) > 0) {
    suggestions.push(
      `${metrics.orphanedTokenCount} token${metrics.orphanedTokenCount === 1 ? '' : 's'} exist in code but not in the canonical design system source`
    );
  }
  if ((metrics.valueDivergenceCount ?? 0) > 0) {
    suggestions.push(
      `${metrics.valueDivergenceCount} value divergence issue${metrics.valueDivergenceCount === 1 ? '' : 's'} — sync code values with design system definitions`
    );
  }
  if (tokenHealthScore < 10 && metrics.componentCount > 0) {
    if (frameworks.includes('tailwind')) {
      suggestions.push('Tailwind detected but token coverage is low — extend your theme config with custom values');
    } else if (frameworks.includes('mui') || frameworks.includes('chakra') || frameworks.includes('mantine')) {
      const lib = frameworks.find(f => ['mui', 'chakra', 'mantine'].includes(f)) ?? 'your library';
      suggestions.push(`${lib} detected — use its theming API for consistent values across components`);
    } else {
      suggestions.push('No design token system detected — add CSS custom properties or a utility framework like Tailwind');
    }
  }

  // Pillar 3: Consistency (0-10)
  // Includes naming-inconsistency + semantic-mismatch signals
  const frameworkSprawlCount = metrics.frameworkSprawlCount ?? 0;
  const inconsistencyCount = metrics.namingInconsistencyCount + (metrics.semanticMismatchCount ?? 0) + frameworkSprawlCount * 2;
  const namingRate = inconsistencyCount / Math.max(metrics.componentCount, 1);
  const consistencyRaw = 10 * clamp(1 - namingRate / 0.25, 0, 1);

  // Only surface naming inconsistencies above noise threshold
  if (inconsistencyCount > 3 || (inconsistencyCount > 0 && namingRate > 0.05)) {
    if (namingRate > 0.15) {
      suggestions.push(
        `${inconsistencyCount} naming/semantic inconsistencies across ${metrics.componentCount} components — establish and document naming conventions`
      );
    } else if (namingRate > 0.05) {
      suggestions.push(
        `${inconsistencyCount} naming inconsistencies — standardize prop/component conventions`
      );
    } else {
      suggestions.push(
        `${inconsistencyCount} minor naming inconsistencies — consider standardizing conventions`
      );
    }
  }
  if (frameworkSprawlCount > 0) {
    suggestions.push(
      `${frameworkSprawlCount} framework sprawl signal${frameworkSprawlCount === 1 ? '' : 's'} — standardize on fewer UI/styling frameworks`
    );
  }

  // Pillar 4: Critical Issues (0-10)
  // Includes critical severity + deprecated patterns (2 deprecated = 1 critical equivalent)
  const deprecatedCount = metrics.deprecatedPatternCount ?? 0;
  const accessibilityConflictCount = metrics.accessibilityConflictCount ?? 0;
  const colorContrastCount = metrics.colorContrastCount ?? 0;
  const missingDocumentationCount = metrics.missingDocumentationCount ?? 0;
  const otherCriticalCount = Math.max(
    0,
    metrics.criticalCount - accessibilityConflictCount - colorContrastCount,
  );
  const effectiveCriticalCount = otherCriticalCount
    + accessibilityConflictCount
    + colorContrastCount
    + Math.ceil(deprecatedCount / 2)
    + Math.ceil(missingDocumentationCount / 10);
  // Files dense with hardcoded values used to count here too (floor(n / 3)),
  // charging them twice: Ghost scored 2/10 on "critical issues" with none.
  // Use 2-point steps for finer granularity (was 3-point)
  const criticalRaw = Math.max(0, 10 - effectiveCriticalCount * 2);

  if (accessibilityConflictCount > 0) {
    suggestions.push(
      `${accessibilityConflictCount} accessibility conflict${accessibilityConflictCount === 1 ? '' : 's'} — fix immediately`
    );
  }
  if (colorContrastCount > 0) {
    suggestions.push(
      `${colorContrastCount} color contrast issue${colorContrastCount === 1 ? '' : 's'} — fix immediately`
    );
  }
  if (otherCriticalCount > 0) {
    suggestions.push(
      `${otherCriticalCount} critical issue${otherCriticalCount === 1 ? '' : 's'} — fix immediately`
    );
  }
  if (deprecatedCount > 0) {
    suggestions.push(
      `${deprecatedCount} deprecated pattern${deprecatedCount === 1 ? '' : 's'} — migrate to current API`
    );
  }
  if (missingDocumentationCount > 0) {
    suggestions.push(
      `${missingDocumentationCount} component${missingDocumentationCount === 1 ? '' : 's'} missing documentation/examples — add docs to reduce misuse`
    );
  }

  if (metrics.uniqueSpacingValues && metrics.uniqueSpacingValues > 15) {
    suggestions.push(
      `${metrics.uniqueSpacingValues} unique spacing values — consolidate to a consistent spacing scale (e.g., 4px/8px grid)`
    );
  }

  // Scale consistency and criticalIssues for repos with very few components
  // Prevents trivially maxing these pillars when there's nothing to evaluate
  const componentScale = Math.min(metrics.componentCount / 3, 1);
  // Use raw (unrounded) values for total calculation to produce more distinct scores
  const scaledConsistencyRaw = consistencyRaw * componentScale;
  const scaledCriticalRaw = criticalRaw * componentScale;
  const scaledConsistencyScore = Math.round(scaledConsistencyRaw);
  const scaledCriticalScore = Math.round(scaledCriticalRaw);

  // Total uses raw values, rounded once at the end for maximum granularity
  let total = Math.round(valueDisciplineRaw + tokenHealthScore + scaledConsistencyRaw + scaledCriticalRaw);

  // Drift density guard: a codebase with a lot of drift per component cannot
  // score "Great". This used to cap on the absolute count (>200 findings ->
  // 69), which put every large codebase on exactly 69 whatever its quality:
  // 11 of 20 public reports in 2026-09. Size is not drift; density is.
  const totalDrift = metrics.totalDriftCount ?? metrics.hardcodedValueCount;
  let driftCap: number | null = null;
  if (totalDrift > 0 && metrics.componentCount > 0) {
    const driftPerComponent = totalDrift / metrics.componentCount;
    if (driftPerComponent > 1) driftCap = 69;
    else if (driftPerComponent > 0.5) driftCap = 79;
    else if (driftPerComponent > 0.3) driftCap = 89;
    if (driftCap !== null) total = Math.min(total, driftCap);
  }

  const pathTo100 = buildPathTo100({
    total,
    pillarScores: {
      valueDiscipline: valueDisciplineScore,
      tokenHealth: tokenHealthScore,
      consistency: scaledConsistencyScore,
      criticalIssues: scaledCriticalScore,
    },
    metrics,
    userHardcodedCount,
    deadCodeCount,
    systemPoints,
    hygienePoints,
    inconsistencyCount,
    critical: {
      contrast: colorContrastCount,
      accessibility: accessibilityConflictCount,
      other: otherCriticalCount,
      deprecated: deprecatedCount,
      undocumented: missingDocumentationCount,
    },
    driftCap,
    totalDrift,
  });

  // Ensure every scored app gets at least 1 suggestion
  if (suggestions.length === 0) {
    if (total === 100) {
      suggestions.push('Perfect design system health — no issues detected');
    } else if (total >= 90) {
      // Find the weakest pillar for aspirational suggestions
      const vdPct = valueDisciplineScore / 60;
      const thPct = tokenHealthScore / 20;
      const coPct = scaledConsistencyScore / 10;
      const ciPct = scaledCriticalScore / 10;
      const minPct = Math.min(vdPct, thPct, coPct, ciPct);
      if (minPct === vdPct && valueDisciplineScore < 60) {
        suggestions.push(`Score ${total} — to reach 100, reduce the remaining hardcoded values in your components`);
      } else if (minPct === thPct && tokenHealthScore < 20) {
        suggestions.push(`Score ${total} — to reach 100, improve token coverage and usage`);
      } else if (minPct === coPct && scaledConsistencyScore < 10) {
        suggestions.push(`Score ${total} — to reach 100, address remaining naming inconsistencies`);
      } else {
        suggestions.push(`Score ${total} — nearly perfect, review remaining drift signals for final improvements`);
      }
    } else {
      // 80-89: point to the weakest pillar
      const vdPct = valueDisciplineScore / 60;
      const thPct = tokenHealthScore / 20;
      const coPct = metrics.componentCount >= 3 ? scaledConsistencyScore / 10 : 1;
      const ciPct = metrics.componentCount >= 3 ? scaledCriticalScore / 10 : 1;
      const minPct = Math.min(vdPct, thPct, coPct, ciPct);
      if (minPct === vdPct) {
        suggestions.push(`Your weakest area is Value Discipline (${valueDisciplineScore}/60) — focus on reducing hardcoded values`);
      } else if (minPct === thPct) {
        suggestions.push(`Your weakest area is Token Health (${tokenHealthScore}/20) — improve token definitions and usage`);
      } else if (minPct === coPct) {
        suggestions.push(`Your weakest area is Consistency (${scaledConsistencyScore}/10) — standardize naming conventions`);
      } else {
        suggestions.push(`Your weakest area is Critical Issues (${scaledCriticalScore}/10) — address accessibility and deprecated patterns`);
      }
    }
  }

  return {
    score: total,
    tier: getHealthTier(total),
    pillars: {
      valueDiscipline: {
        name: 'Value Discipline',
        score: valueDisciplineScore,
        maxScore: 60,
        description: 'Hardcoded values per component',
      },
      tokenHealth: {
        name: 'Token Health',
        score: tokenHealthScore,
        maxScore: 20,
        description: 'Token system adoption',
      },
      consistency: {
        name: 'Consistency',
        score: scaledConsistencyScore,
        maxScore: 10,
        description: 'Naming convention adherence',
      },
      criticalIssues: {
        name: 'Critical Issues',
        score: scaledCriticalScore,
        maxScore: 10,
        description: 'Accessibility and critical failures',
      },
    },
    suggestions,
    pathTo100,
    metrics,
  };
}

/** Findings per component at which each pillar or cap stops costing points. */
const FULL_VALUE_DISCIPLINE_DENSITY = VALUE_DENSITY_FLOOR / 120; // under half a point lost
const DRIFT_CAP_DENSITY = 0.3;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function buildPathTo100(input: {
  total: number;
  pillarScores: Record<HealthPillarKey, number>;
  metrics: HealthMetrics;
  userHardcodedCount: number;
  deadCodeCount: number;
  systemPoints: number;
  hygienePoints: number;
  inconsistencyCount: number;
  critical: { contrast: number; accessibility: number; other: number; deprecated: number; undocumented: number };
  driftCap: number | null;
  totalDrift: number;
}): PathTo100Step[] {
  const { total, pillarScores, metrics } = input;
  const max: Record<HealthPillarKey, number> = { valueDiscipline: 60, tokenHealth: 20, consistency: 10, criticalIssues: 10 };
  const steps: PathTo100Step[] = [];

  const vdGap = max.valueDiscipline - pillarScores.valueDiscipline;
  if (vdGap > 0) {
    const allowed = Math.floor(metrics.componentCount * FULL_VALUE_DISCIPLINE_DENSITY);
    const toFix = Math.max(0, input.userHardcodedCount - allowed);
    const parts: string[] = [];
    if (toFix > 0) {
      parts.push(allowed === 0
        ? `Replace the hardcoded values in all ${plural(input.userHardcodedCount, "finding")} with tokens or scale steps`
        : `Replace the hardcoded values in ${toFix} of the ${plural(input.userHardcodedCount, "finding")} with tokens or scale steps`);
    }
    if (input.deadCodeCount > 0) {
      parts.push(`remove or reuse ${plural(input.deadCodeCount, "unused component or repeated pattern", "unused components and repeated patterns")}`);
    }
    steps.push({ pillar: "valueDiscipline", points: vdGap, action: parts.length ? parts.join(", and ") : "Clear the remaining drift findings" });
  }

  const thGap = max.tokenHealth - pillarScores.tokenHealth;
  if (thGap > 0) {
    const parts: string[] = [];
    if (input.systemPoints < 10) {
      if (metrics.tokenCount > 0) {
        parts.push(`Define ${20 - metrics.tokenCount} more design tokens (${metrics.tokenCount} of the 20 that earn full credit)`);
      } else if (metrics.hasDesignSystemLibrary) {
        parts.push("Add a token system: CSS custom properties, a tokens file or a Tailwind theme (a component library alone earns half)");
      } else {
        parts.push("Add a token system: CSS custom properties, a tokens file or a Tailwind theme");
      }
    }
    const unused = Math.min(metrics.tokenCount, metrics.unusedTokenCount + (metrics.orphanedTokenCount ?? 0));
    if (input.hygienePoints < 10 && unused > 0) parts.push(`use or remove ${plural(unused, "unused token")}`);
    const divergence = metrics.valueDivergenceCount ?? 0;
    if (divergence > 0) parts.push(`sync ${plural(divergence, "token value")} that differ from the design source`);
    steps.push({ pillar: "tokenHealth", points: thGap, action: parts.join(", and ") || "Tidy the token system" });
  }

  const coGap = max.consistency - pillarScores.consistency;
  if (coGap > 0) {
    steps.push({
      pillar: "consistency",
      points: coGap,
      action: input.inconsistencyCount > 0
        ? `Resolve ${plural(input.inconsistencyCount, "naming or semantic inconsistency", "naming or semantic inconsistencies")}`
        : "Scan more components: tiny codebases cannot earn full consistency credit",
    });
  }

  const ciGap = max.criticalIssues - pillarScores.criticalIssues;
  if (ciGap > 0) {
    const c = input.critical;
    const parts = [
      c.contrast > 0 ? `fix ${plural(c.contrast, "colour contrast failure")}` : "",
      c.accessibility > 0 ? `fix ${plural(c.accessibility, "accessibility conflict")}` : "",
      c.other > 0 ? `fix ${plural(c.other, "other critical finding")}` : "",
      c.deprecated > 0 ? `migrate ${plural(c.deprecated, "deprecated pattern")}` : "",
      c.undocumented > 0 ? `document ${plural(c.undocumented, "component")}` : "",
    ].filter(Boolean);
    const action = parts.join(", ");
    steps.push({ pillar: "criticalIssues", points: ciGap, action: action ? action[0]!.toUpperCase() + action.slice(1) : "Scan more components: tiny codebases cannot earn full critical-issues credit" });
  }

  const pillarSum = Object.values(pillarScores).reduce((a, b) => a + b, 0);
  if (input.driftCap !== null && total < pillarSum) {
    const limit = Math.floor(metrics.componentCount * DRIFT_CAP_DENSITY);
    steps.push({
      pillar: "driftCap",
      points: pillarSum - total,
      action: `Findings per component cap this score at ${input.driftCap}. Get from ${input.totalDrift} findings to ${limit} or fewer to lift the cap`,
    });
  }

  // Pillars round separately from the total; keep the steps summing to 100 - score.
  const remainder = (100 - total) - steps.reduce((sum, step) => sum + step.points, 0);
  if (remainder !== 0 && steps.length > 0) {
    const largest = steps.reduce((a, b) => (b.points > a.points ? b : a));
    largest.points += remainder;
  }
  return steps.filter((step) => step.points > 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getHealthTier(score: number): 'Great' | 'Good' | 'OK' | 'Bad' | 'Terrible' {
  if (score >= 80) return 'Great';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'OK';
  if (score >= 20) return 'Bad';
  return 'Terrible';
}
