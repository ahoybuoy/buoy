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
}

export interface HealthPillar {
  name: string;
  score: number;
  maxScore: number;
  description: string;
}

export interface HealthScoreResult {
  /** Overall score 0-100 */
  score: number;
  /** Tier label */
  tier: 'Great' | 'Good' | 'OK' | 'Bad' | 'Terrible';
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
  return calculateHealthScorePillar(metrics).score;
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
 */
export function calculateHealthScorePillar(metrics: HealthMetrics): HealthScoreResult {
  const suggestions: string[] = [];

  // Pillar 1: Value Discipline (0-60)
  const density = metrics.hardcodedValueCount / Math.max(metrics.componentCount, 1);
  const valueDisciplineScore = Math.round(60 * clamp(1 - density / 3, 0, 1));

  if (density > 0.5) {
    suggestions.push(
      `${metrics.hardcodedValueCount} hardcoded values across your components — extract to design tokens`
    );
  }

  // Pillar 2: Token Health (0-20)
  let tokenHealthScore: number;
  if (metrics.tokenCount > 0) {
    const usedTokens = metrics.tokenCount - metrics.unusedTokenCount;
    tokenHealthScore = Math.round(20 * clamp(usedTokens / metrics.tokenCount, 0, 1));
    if (metrics.unusedTokenCount > 0) {
      suggestions.push(
        `${metrics.unusedTokenCount} tokens defined but unused — wire them into components`
      );
    }
  } else if (metrics.hasUtilityFramework || metrics.hasDesignSystemLibrary) {
    // Utility framework or design system library acts as token system
    tokenHealthScore = density < 0.5 ? 15 : density < 1.0 ? 10 : 5;
  } else if (density < 0.1) {
    // No explicit system but very few hardcoded values = implied system
    tokenHealthScore = 10;
  } else {
    tokenHealthScore = 0;
    if (metrics.componentCount > 0) {
      suggestions.push(
        'No design token system detected — add tokens or a utility framework'
      );
    }
  }

  // Pillar 3: Consistency (0-10)
  const namingRate = metrics.namingInconsistencyCount / Math.max(metrics.componentCount, 1);
  const consistencyScore = Math.round(10 * clamp(1 - namingRate / 0.15, 0, 1));

  if (namingRate > 0.05) {
    suggestions.push(
      `${metrics.namingInconsistencyCount} naming inconsistencies — standardize prop/component conventions`
    );
  }

  // Pillar 4: Critical Issues (0-10)
  const criticalScore = Math.max(0, 10 - metrics.criticalCount * 5);

  if (metrics.criticalCount > 0) {
    suggestions.push(
      `${metrics.criticalCount} critical issue${metrics.criticalCount === 1 ? '' : 's'} (accessibility/contrast) — fix immediately`
    );
  }

  const total = valueDisciplineScore + tokenHealthScore + consistencyScore + criticalScore;

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
        score: consistencyScore,
        maxScore: 10,
        description: 'Naming convention adherence',
      },
      criticalIssues: {
        name: 'Critical Issues',
        score: criticalScore,
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
