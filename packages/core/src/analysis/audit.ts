// Audit report generation - analyzes codebase for design system health

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
  /** Raw metrics used for scoring */
  metrics: HealthMetrics;
}

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
  return calculateHealthScorePillar(metrics).score ?? 0;
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
export function calculateHealthScorePillar(metrics: HealthMetrics): HealthScoreResult {
  const suggestions: string[] = [];
  const frameworks = metrics.detectedFrameworkNames ?? [];

  // No UI surface area — can't evaluate design system health
  if (metrics.componentCount === 0 && metrics.tokenCount === 0 && (metrics.totalDriftCount ?? 0) === 0) {
    return {
      score: null,
      tier: 'N/A' as const,
      pillars: {
        valueDiscipline: { name: 'Value Discipline', score: 0, maxScore: 60, description: 'Hardcoded values per component' },
        tokenHealth: { name: 'Token Health', score: 0, maxScore: 20, description: 'Token system adoption' },
        consistency: { name: 'Consistency', score: 0, maxScore: 10, description: 'Naming convention adherence' },
        criticalIssues: { name: 'Critical Issues', score: 0, maxScore: 10, description: 'Accessibility and critical failures' },
      },
      suggestions: ['No UI components or design tokens detected — this repo may not need design system health tracking'],
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
  const valueDisciplineScore = Math.round(60 * clamp(1 - density / 2, 0, 1));

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
  // Four sub-factors, each 0-5 points:
  //   1. Utility framework (0-5): Has Tailwind, CSS-in-JS, etc.
  //   2. Design system library (0-5): Has MUI, Chakra, Mantine, etc.
  //   3. Token definition coverage (0-5): Has tokens across categories
  //   4. Token usage ratio (0-5): What fraction of defined tokens are used

  // Sub-factor 1: Utility framework (0-5)
  // Scaled: 3 for having the framework, +2 when tokens are also defined
  const utilityPoints = metrics.hasUtilityFramework
    ? (metrics.tokenCount > 0 ? 5 : 3)
    : 0;

  // Sub-factor 2: Design system library (0-5)
  // Scaled: 3 for having the library, +2 when tokens are also defined
  const libraryPoints = metrics.hasDesignSystemLibrary
    ? (metrics.tokenCount > 0 ? 5 : 3)
    : 0;

  // Sub-factor 3: Token definition coverage (0-5)
  // More tokens = more structured. Cap at 20 tokens for full credit.
  // Continuous (not rounded) for granular scoring.
  const tokenCoveragePoints = metrics.tokenCount > 0
    ? 5 * clamp(metrics.tokenCount / 20, 0, 1)
    : 0;

  // Sub-factor 4: Token usage ratio (0-5)
  // What fraction of tokens are actually used? All used = 5, all unused = 0.
  let tokenUsagePoints: number;
  if (metrics.tokenCount > 0) {
    const usedTokens = metrics.tokenCount - metrics.unusedTokenCount;
    tokenUsagePoints = 5 * clamp(usedTokens / metrics.tokenCount, 0, 1);
  } else if (metrics.hasUtilityFramework || metrics.hasDesignSystemLibrary) {
    // No explicit tokens but has a framework/library — give partial credit
    // because the framework handles tokenization internally
    tokenUsagePoints = density < 0.5 ? 5 : density < 1.0 ? 3 : 1;
  } else if (density < 0.1) {
    // No explicit system but very few hardcoded values = implied system
    tokenUsagePoints = 3;
  } else {
    tokenUsagePoints = 0;
  }

  // Round the combined score for integer totals
  const tokenHealthScore = Math.round(utilityPoints + libraryPoints + tokenCoveragePoints + tokenUsagePoints);

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
  const inconsistencyCount = metrics.namingInconsistencyCount + (metrics.semanticMismatchCount ?? 0);
  const namingRate = inconsistencyCount / Math.max(metrics.componentCount, 1);
  const consistencyScore = Math.round(10 * clamp(1 - namingRate / 0.25, 0, 1));

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

  // Pillar 4: Critical Issues (0-10)
  // Includes critical severity + deprecated patterns (2 deprecated = 1 critical equivalent)
  const deprecatedCount = metrics.deprecatedPatternCount ?? 0;
  const highDensityFiles = metrics.highDensityFileCount ?? 0;
  const effectiveCriticalCount = metrics.criticalCount
    + Math.ceil(deprecatedCount / 2)
    + Math.floor(highDensityFiles / 3);
  const criticalScore = Math.max(0, 10 - effectiveCriticalCount * 3);

  if (metrics.criticalCount > 0) {
    suggestions.push(
      `${metrics.criticalCount} critical issue${metrics.criticalCount === 1 ? '' : 's'} (accessibility/contrast) — fix immediately`
    );
  }
  if (deprecatedCount > 0) {
    suggestions.push(
      `${deprecatedCount} deprecated pattern${deprecatedCount === 1 ? '' : 's'} — migrate to current API`
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
  const scaledConsistencyScore = Math.round(consistencyScore * componentScale);
  const scaledCriticalScore = Math.round(criticalScore * componentScale);

  let total = valueDisciplineScore + tokenHealthScore + scaledConsistencyScore + scaledCriticalScore;

  // Drift density penalty: prevent high-drift repos from scoring "Great"
  // Apps with many drift signals relative to their size should be capped
  const totalDrift = metrics.totalDriftCount ?? metrics.hardcodedValueCount;
  if (totalDrift > 0 && metrics.componentCount > 0) {
    const driftPerComponent = totalDrift / metrics.componentCount;
    if (totalDrift > 200) {
      // >200 drift signals: cap at OK (69)
      total = Math.min(total, 69);
    } else if (totalDrift > 100) {
      // >100 drift: graduated cap based on density (74-84)
      const densityFactor = clamp(driftPerComponent, 0, 1);
      const cap = Math.round(74 + (1 - densityFactor) * 10);
      total = Math.min(total, cap);
    } else if (totalDrift > 50 && driftPerComponent > 0.3) {
      // >50 drift + high density: cap at 89
      total = Math.min(total, 89);
    }
  }

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
    metrics,
  };
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
