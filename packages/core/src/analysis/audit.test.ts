import { describe, it, expect } from 'vitest';
import {
  generateAuditReport,
  calculateHealthScore,
  calculateHealthScorePillar,
  getHealthTier,
  findCloseMatches,
  type AuditReport,
  type AuditValue,
  type HealthMetrics,
} from './audit.js';

// Helper to create extracted values
function createValue(
  category: 'color' | 'spacing' | 'typography' | 'radius',
  value: string,
  file: string,
  line: number = 1
): AuditValue {
  return { category, value, file, line };
}

describe('generateAuditReport', () => {
  it('counts unique values by category', () => {
    const values: AuditValue[] = [
      createValue('color', '#3b82f6', 'src/Button.tsx'),
      createValue('color', '#3b82f6', 'src/Card.tsx'), // duplicate
      createValue('color', '#ef4444', 'src/Alert.tsx'),
      createValue('spacing', '16px', 'src/Button.tsx'),
      createValue('spacing', '8px', 'src/Card.tsx'),
    ];

    const report = generateAuditReport(values);

    expect(report.categories.color.uniqueCount).toBe(2);
    expect(report.categories.color.totalUsages).toBe(3);
    expect(report.categories.spacing.uniqueCount).toBe(2);
    expect(report.categories.spacing.totalUsages).toBe(2);
  });

  it('identifies most common values per category', () => {
    const values: AuditValue[] = [
      createValue('color', '#3b82f6', 'src/A.tsx'),
      createValue('color', '#3b82f6', 'src/B.tsx'),
      createValue('color', '#3b82f6', 'src/C.tsx'),
      createValue('color', '#ef4444', 'src/D.tsx'),
    ];

    const report = generateAuditReport(values);

    expect(report.categories.color.mostCommon[0]).toEqual({
      value: '#3b82f6',
      count: 3,
    });
  });

  it('identifies worst offender files', () => {
    const values: AuditValue[] = [
      createValue('color', '#111', 'src/Bad.tsx', 1),
      createValue('color', '#222', 'src/Bad.tsx', 2),
      createValue('color', '#333', 'src/Bad.tsx', 3),
      createValue('color', '#444', 'src/Good.tsx', 1),
    ];

    const report = generateAuditReport(values);

    expect(report.worstFiles[0]).toEqual({
      file: 'src/Bad.tsx',
      issueCount: 3,
    });
  });

  it('provides totals across all categories', () => {
    const values: AuditValue[] = [
      createValue('color', '#3b82f6', 'src/A.tsx'),
      createValue('color', '#ef4444', 'src/B.tsx'),
      createValue('spacing', '16px', 'src/C.tsx'),
    ];

    const report = generateAuditReport(values);

    expect(report.totals.uniqueValues).toBe(3);
    expect(report.totals.totalUsages).toBe(3);
    expect(report.totals.filesAffected).toBe(3);
  });

  it('handles empty input', () => {
    const report = generateAuditReport([]);

    expect(report.totals.uniqueValues).toBe(0);
    expect(report.totals.totalUsages).toBe(0);
    expect(report.score).toBe(100); // Perfect score with no issues
  });
});

describe('findCloseMatches', () => {
  it('finds colors that are close to design tokens', () => {
    const designTokens = ['#3b82f6', '#ef4444'];
    const foundValues = ['#3b83f6', '#3b82f6']; // First is typo

    const matches = findCloseMatches(foundValues, designTokens, 'color');

    expect(matches).toContainEqual({
      value: '#3b83f6',
      closeTo: '#3b82f6',
      distance: expect.any(Number),
    });
  });

  it('does not flag exact matches', () => {
    const designTokens = ['#3b82f6'];
    const foundValues = ['#3b82f6'];

    const matches = findCloseMatches(foundValues, designTokens, 'color');

    expect(matches).toHaveLength(0);
  });

  it('finds spacing values close to a scale', () => {
    const designTokens = ['4px', '8px', '16px', '24px', '32px'];
    const foundValues = ['15px', '17px', '8px'];

    const matches = findCloseMatches(foundValues, designTokens, 'spacing');

    expect(matches).toContainEqual({
      value: '15px',
      closeTo: '16px',
      distance: 1,
    });
    expect(matches).toContainEqual({
      value: '17px',
      closeTo: '16px',
      distance: 1,
    });
  });

  it('returns empty array when no close matches', () => {
    const designTokens = ['#3b82f6'];
    const foundValues = ['#000000']; // Very different

    const matches = findCloseMatches(foundValues, designTokens, 'color');

    expect(matches).toHaveLength(0);
  });
});

describe('calculateHealthScore (legacy)', () => {
  it('returns high score for no drift', () => {
    const report: AuditReport = {
      categories: {},
      worstFiles: [],
      totals: { uniqueValues: 0, totalUsages: 0, filesAffected: 0 },
      closeMatches: [],
      score: 0,
    };

    const score = calculateHealthScore(report);

    // With componentCount=1 (from filesAffected=0||1), consistency and criticalIssues
    // are scaled down by componentScale (1/3), so max is ~69 instead of ~83
    expect(score).toBeGreaterThanOrEqual(60);
  });

  it('decreases score based on value density', () => {
    const report: AuditReport = {
      categories: {
        color: {
          uniqueCount: 50,
          totalUsages: 100,
          mostCommon: [],
        },
      },
      worstFiles: [],
      totals: { uniqueValues: 50, totalUsages: 100, filesAffected: 20 },
      closeMatches: [],
      score: 0,
    };

    const score = calculateHealthScore(report);

    expect(score).toBeLessThan(50);
  });

  it('returns score between 0 and 100', () => {
    const report: AuditReport = {
      categories: {
        color: { uniqueCount: 100, totalUsages: 500, mostCommon: [] },
        spacing: { uniqueCount: 50, totalUsages: 200, mostCommon: [] },
      },
      worstFiles: [{ file: 'bad.tsx', issueCount: 100 }],
      totals: { uniqueValues: 150, totalUsages: 700, filesAffected: 50 },
      closeMatches: Array(20).fill({ value: 'x', closeTo: 'y', distance: 1 }),
      score: 0,
    };

    const score = calculateHealthScore(report);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('calculateHealthScorePillar', () => {
  function makeMetrics(overrides: Partial<HealthMetrics> = {}): HealthMetrics {
    return {
      componentCount: 50,
      tokenCount: 0,
      hardcodedValueCount: 0,
      unusedTokenCount: 0,
      namingInconsistencyCount: 0,
      criticalCount: 0,
      hasUtilityFramework: false,
      hasDesignSystemLibrary: false,
      ...overrides,
    };
  }

  describe('Pillar 1: Value Discipline (0-60)', () => {
    it('scores 60 when no hardcoded values', () => {
      const result = calculateHealthScorePillar(makeMetrics());
      expect(result.pillars.valueDiscipline.score).toBe(60);
    });

    it('scores 0 when density >= 2 (2+ hardcoded values per component)', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 10,
        hardcodedValueCount: 20, // density = 2
      }));
      expect(result.pillars.valueDiscipline.score).toBe(0);
    });

    it('scores proportionally to density', () => {
      // density = 1.5 → 1 - 1.5/2 = 0.25 → round(60 * 0.25) = 15
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 10,
        hardcodedValueCount: 15,
      }));
      expect(result.pillars.valueDiscipline.score).toBe(15);
    });
  });

  describe('Pillar 2: Token Health (0-20)', () => {
    it('scores based on used/total ratio when tokens exist', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        tokenCount: 100,
        unusedTokenCount: 20,
      }));
      // utility=0, library=0, coverage=5 (100/20 capped at 1), usage=round(5*80/100)=4 → 9
      expect(result.pillars.tokenHealth.score).toBe(9);
    });

    it('scores 20 when all tokens are used with full ecosystem', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        tokenCount: 50,
        unusedTokenCount: 0,
        hasUtilityFramework: true,
        hasDesignSystemLibrary: true,
      }));
      // utility=5, library=5, coverage=5 (50/20 capped at 1), usage=5 → 20
      expect(result.pillars.tokenHealth.score).toBe(20);
    });

    it('scores 10 for clean Tailwind projects without tokens', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        hasUtilityFramework: true,
        hardcodedValueCount: 5,
        componentCount: 50, // density = 0.1 < 0.5
      }));
      // utility=5, library=0, coverage=0, usage=5 (density < 0.5) → 10
      expect(result.pillars.tokenHealth.score).toBe(10);
    });

    it('scores 8 for leaky Tailwind projects', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        hasUtilityFramework: true,
        hardcodedValueCount: 40,
        componentCount: 50, // density = 0.8 (between 0.5 and 1.0)
      }));
      // utility=5, library=0, coverage=0, usage=3 (density 0.5-1.0) → 8
      expect(result.pillars.tokenHealth.score).toBe(8);
    });

    it('scores 3 for implied system (very low density, no tokens)', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        hardcodedValueCount: 5, // density = 0.05 < 0.1
      }));
      // utility=0, library=0, coverage=0, usage=3 (density < 0.1) → 3
      expect(result.pillars.tokenHealth.score).toBe(3);
    });

    it('scores 0 when no system detected and values are hardcoded', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 10,
        hardcodedValueCount: 20,
      }));
      expect(result.pillars.tokenHealth.score).toBe(0);
    });

    it('achieves score 100 when all four sub-factors are present', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        tokenCount: 50,
        unusedTokenCount: 0,
        hardcodedValueCount: 0,
        hasUtilityFramework: true,
        hasDesignSystemLibrary: true,
      }));
      expect(result.score).toBe(100);
      expect(result.pillars.tokenHealth.score).toBe(20);
    });

    it('gives partial credit for utility framework without tokens', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 50,
        hasUtilityFramework: true,
        hasDesignSystemLibrary: false,
      }));
      expect(result.pillars.tokenHealth.score).toBeGreaterThan(0);
      expect(result.pillars.tokenHealth.score).toBeLessThan(20);
    });

    it('gives more credit for library + framework than framework alone', () => {
      const fwOnly = calculateHealthScorePillar(makeMetrics({
        componentCount: 50,
        hasUtilityFramework: true,
        hasDesignSystemLibrary: false,
      }));
      const both = calculateHealthScorePillar(makeMetrics({
        componentCount: 50,
        hasUtilityFramework: true,
        hasDesignSystemLibrary: true,
      }));
      expect(both.pillars.tokenHealth.score).toBeGreaterThan(fwOnly.pillars.tokenHealth.score);
    });

    it('penalizes unused tokens proportionally', () => {
      const halfUnused = calculateHealthScorePillar(makeMetrics({
        tokenCount: 100,
        unusedTokenCount: 50,
        hasUtilityFramework: true,
        hasDesignSystemLibrary: true,
      }));
      const allUsed = calculateHealthScorePillar(makeMetrics({
        tokenCount: 100,
        unusedTokenCount: 0,
        hasUtilityFramework: true,
        hasDesignSystemLibrary: true,
      }));
      expect(allUsed.pillars.tokenHealth.score).toBeGreaterThan(halfUnused.pillars.tokenHealth.score);
    });

    it('gives token coverage credit proportionally', () => {
      const fewTokens = calculateHealthScorePillar(makeMetrics({
        tokenCount: 5,
        unusedTokenCount: 0,
      }));
      const manyTokens = calculateHealthScorePillar(makeMetrics({
        tokenCount: 50,
        unusedTokenCount: 0,
      }));
      // Both have usage=5, but coverage differs: round(5*5/20)=1 vs round(5*50/20)=5
      expect(manyTokens.pillars.tokenHealth.score).toBeGreaterThan(fewTokens.pillars.tokenHealth.score);
    });
  });

  describe('Pillar 3: Consistency (0-10)', () => {
    it('scores 10 when no naming issues', () => {
      const result = calculateHealthScorePillar(makeMetrics());
      expect(result.pillars.consistency.score).toBe(10);
    });

    it('scores 0 when naming rate >= 25%', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        namingInconsistencyCount: 25, // 25%
      }));
      expect(result.pillars.consistency.score).toBe(0);
    });

    it('scores proportionally', () => {
      // namingRate = 5/100 = 0.05 → 1 - 0.05/0.25 = 0.8 → round(10 * 0.8) = 8
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        namingInconsistencyCount: 5,
      }));
      expect(result.pillars.consistency.score).toBe(8);
    });
  });

  describe('Pillar 4: Critical Issues (0-10)', () => {
    it('scores 10 when no critical issues', () => {
      const result = calculateHealthScorePillar(makeMetrics());
      expect(result.pillars.criticalIssues.score).toBe(10);
    });

    it('deducts 3 per critical issue', () => {
      const result = calculateHealthScorePillar(makeMetrics({ criticalCount: 1 }));
      expect(result.pillars.criticalIssues.score).toBe(7);
    });

    it('scores 0 when 4+ criticals', () => {
      const result = calculateHealthScorePillar(makeMetrics({ criticalCount: 4 }));
      expect(result.pillars.criticalIssues.score).toBe(0);
    });
  });

  describe('Total score and tiers', () => {
    it('perfect score: clean project with full token ecosystem', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        tokenCount: 50,
        unusedTokenCount: 0,
        hasUtilityFramework: true,
        hasDesignSystemLibrary: true,
      }));
      expect(result.score).toBe(100);
      expect(result.tier).toBe('Great');
    });

    it('clean Tailwind project scores Great', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        hasUtilityFramework: true,
        componentCount: 50,
        hardcodedValueCount: 2, // density 0.04
      }));
      // P1: ~59, P2: utility(5)+usage(5)=10, P3: 10, P4: 10 = ~89
      expect(result.tier).toBe('Great');
    });

    it('high-drift project scores low', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 10,
        hardcodedValueCount: 100,
        namingInconsistencyCount: 5,
        criticalCount: 2,
      }));
      expect(result.score).toBeLessThan(20);
      expect(result.tier).toBe('Terrible');
    });
  });

  describe('total drift density penalty', () => {
    it('penalizes high drift density even without hardcoded values', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        hardcodedValueCount: 0,
        tokenCount: 50,
        unusedTokenCount: 0,
        hasUtilityFramework: true,
        hasDesignSystemLibrary: true,
        totalDriftCount: 500,
      }));
      // totalDriftDensity = 500/100 = 5, * 0.5 = 2.5
      // density = max(0, 2.5) = 2.5
      // valueDiscipline = round(60 * clamp(1 - 2.5/2, 0, 1)) = round(60 * 0) = 0
      expect(result.score).toBeLessThan(90);
      expect(result.pillars.valueDiscipline.score).toBeLessThan(60);
    });

    it('does not penalize when totalDriftCount is not provided', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        hardcodedValueCount: 0,
        tokenCount: 50,
        unusedTokenCount: 0,
        hasUtilityFramework: true,
        hasDesignSystemLibrary: true,
      }));
      expect(result.pillars.valueDiscipline.score).toBe(60);
    });

    it('uses hardcoded density when worse than half drift density', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        hardcodedValueCount: 200, // density = 2
        totalDriftCount: 200, // totalDrift density * 0.5 = 1
      }));
      // hardcoded density (2) > totalDrift density * 0.5 (1)
      // so uses hardcoded density = 2
      // valueDiscipline = round(60 * clamp(1 - 2/2, 0, 1)) = round(60 * 0) = 0
      expect(result.pillars.valueDiscipline.score).toBe(0);
    });
  });

  describe('design system library detection', () => {
    it('scores token health higher when hasDesignSystemLibrary is true', () => {
      const without = calculateHealthScorePillar(makeMetrics({
        componentCount: 50,
        hardcodedValueCount: 10,
        hasDesignSystemLibrary: false,
        hasUtilityFramework: false,
      }));

      const with_ = calculateHealthScorePillar(makeMetrics({
        componentCount: 50,
        hardcodedValueCount: 10,
        hasDesignSystemLibrary: true,
        hasUtilityFramework: false,
      }));

      expect(with_.pillars.tokenHealth.score).toBeGreaterThan(without.pillars.tokenHealth.score);
    });
  });

  describe('suggestions', () => {
    it('suggests extracting hardcoded values when density > 0.5', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 10,
        hardcodedValueCount: 10,
      }));
      expect(result.suggestions.some(s => s.includes('hardcoded'))).toBe(true);
    });

    it('suggests wiring unused tokens', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        tokenCount: 50,
        unusedTokenCount: 20,
      }));
      expect(result.suggestions.some(s => s.includes('unused'))).toBe(true);
    });

    it('suggests adding token system when missing', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 10,
        hardcodedValueCount: 5,
      }));
      expect(result.suggestions.some(s => s.includes('token system'))).toBe(true);
    });

    it('provides aspirational suggestion for near-perfect project', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        tokenCount: 50,
        unusedTokenCount: 0,
      }));
      // Score is 90 (no utility framework or DS library), so gets aspirational suggestion
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]).toContain('to reach 100');
    });
  });

  describe('rich suggestions', () => {
    it('includes specific color in suggestion when topHardcodedColor provided', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 10,
        hardcodedValueCount: 20,
        topHardcodedColor: { value: '#ff6b6b', count: 8 },
      }));
      expect(result.suggestions.some(s => s.includes('#ff6b6b') && s.includes('8'))).toBe(true);
    });

    it('includes worst file in suggestion when provided (moderate density)', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 20,
        hardcodedValueCount: 10, // density ~0.5 → moderate tier
        worstFile: { path: 'src/components/Card.tsx', issueCount: 15 },
      }));
      expect(result.suggestions.some(s => s.includes('Card.tsx') && s.includes('15'))).toBe(true);
    });

    it('includes color in severe suggestion and worst file in moderate suggestion', () => {
      // Severe tier: color is included
      const severe = calculateHealthScorePillar(makeMetrics({
        componentCount: 10,
        hardcodedValueCount: 20,
        topHardcodedColor: { value: '#ff6b6b', count: 8 },
      }));
      expect(severe.suggestions.some(s => s.includes('#ff6b6b') && s.includes('8'))).toBe(true);

      // Moderate tier: worst file is included
      const moderate = calculateHealthScorePillar(makeMetrics({
        componentCount: 20,
        hardcodedValueCount: 10,
        worstFile: { path: 'src/components/Card.tsx', issueCount: 15 },
      }));
      expect(moderate.suggestions.some(s => s.includes('Card.tsx') && s.includes('15'))).toBe(true);
    });

    it('falls back to generic suggestion when no rich context', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 10,
        hardcodedValueCount: 20,
      }));
      expect(result.suggestions.some(s => s.includes('hardcoded values across your components'))).toBe(true);
    });

    it('suggests spacing consolidation when many unique values', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        uniqueSpacingValues: 25,
      }));
      expect(result.suggestions.some(s => s.includes('25 unique spacing'))).toBe(true);
    });

    it('does not add spacing suggestion when few values', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        uniqueSpacingValues: 5,
      }));
      expect(result.suggestions.every(s => !s.includes('spacing'))).toBe(true);
    });

    it('does not add spacing suggestion when undefined', () => {
      const result = calculateHealthScorePillar(makeMetrics({}));
      expect(result.suggestions.every(s => !s.includes('spacing'))).toBe(true);
    });

    it('appends worst file to moderate-density suggestion', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 20,
        hardcodedValueCount: 12, // density ~0.6 → moderate tier
        worstFile: { path: 'src/App.tsx', issueCount: 12 },
      }));
      const suggestion = result.suggestions.find(s => s.includes('hardcoded value'));
      expect(suggestion).toBeDefined();
      expect(suggestion).toContain('App.tsx');
      expect(suggestion).toContain('12 issues');
    });
  });

  describe('tiered, framework-aware suggestions', () => {
    it('severe tier: Tailwind-specific advice for high density', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 10,
        hardcodedValueCount: 30, // density 3.0 → severe
        detectedFrameworkNames: ['react', 'tailwind'],
      }));
      expect(result.suggestions.some(s =>
        s.includes('high density') && s.includes('Tailwind theme config')
      )).toBe(true);
    });

    it('severe tier: MUI-specific advice for high density', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 10,
        hardcodedValueCount: 30,
        detectedFrameworkNames: ['react', 'mui'],
      }));
      expect(result.suggestions.some(s =>
        s.includes('high density') && s.includes('theme.palette')
      )).toBe(true);
    });

    it('severe tier: generic advice when no framework detected', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 10,
        hardcodedValueCount: 30,
      }));
      expect(result.suggestions.some(s =>
        s.includes('high density') && s.includes('design token file')
      )).toBe(true);
    });

    it('moderate tier: Tailwind + shadcn advice uses cn() utility', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 20,
        hardcodedValueCount: 10, // density ~0.5 → moderate
        detectedFrameworkNames: ['react', 'tailwind', 'shadcn'],
      }));
      expect(result.suggestions.some(s => s.includes('cn()'))).toBe(true);
    });

    it('moderate tier: Tailwind-only advice extends config', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 20,
        hardcodedValueCount: 10,
        detectedFrameworkNames: ['react', 'tailwind'],
      }));
      expect(result.suggestions.some(s => s.includes('tailwind.config'))).toBe(true);
    });

    it('low tier: encouraging message for near-clean codebases', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        hardcodedValueCount: 3, // density 0.03 → low
      }));
      expect(result.suggestions.some(s => s.includes('Nearly there'))).toBe(true);
    });

    it('low tier: includes worst file when it has multiple issues', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        hardcodedValueCount: 5,
        worstFile: { path: 'src/Card.tsx', issueCount: 3 },
      }));
      expect(result.suggestions.some(s =>
        s.includes('Nearly there') && s.includes('Card.tsx') && s.includes('3')
      )).toBe(true);
    });

    it('excludes vendored drift from user count', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 20,
        hardcodedValueCount: 15,
        vendoredDriftCount: 5, // userCount = 10
        detectedFrameworkNames: ['react', 'tailwind'],
      }));
      expect(result.suggestions.some(s => s.includes('10 hardcoded'))).toBe(true);
    });

    it('token health: Tailwind-specific suggestion when token coverage is low', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 50,
        hardcodedValueCount: 30,
        detectedFrameworkNames: ['react', 'tailwind'],
      }));
      expect(result.suggestions.some(s => s.includes('Tailwind detected but token coverage is low'))).toBe(true);
    });

    it('token health: design system library suggestion for MUI', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 50,
        hardcodedValueCount: 30,
        detectedFrameworkNames: ['react', 'mui'],
      }));
      expect(result.suggestions.some(s => s.includes('mui detected'))).toBe(true);
    });

    it('token health: generic suggestion when no framework', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 50,
        hardcodedValueCount: 30,
      }));
      expect(result.suggestions.some(s => s.includes('add CSS custom properties'))).toBe(true);
    });

    it('userCount never goes negative', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 10,
        hardcodedValueCount: 5,
        vendoredDriftCount: 10, // vendored > hardcoded → userCount clamped to 0
      }));
      // With userCount = 0, hardcodedValueCount is still > 0 so we enter the block
      // but userCount = Math.max(0, 5 - 10) = 0
      const suggestion = result.suggestions.find(s => s.includes('hardcoded'));
      if (suggestion) {
        expect(suggestion).not.toMatch(/-\d+ hardcoded/);
      }
    });
  });

  describe('silent drift type mapping', () => {
    it('penalizes value discipline for unused/orphaned/repeated components', () => {
      const clean = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        hardcodedValueCount: 0,
      }));
      const withDeadCode = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        hardcodedValueCount: 0,
        unusedComponentCount: 50,
        orphanedComponentCount: 10,
        repeatedPatternCount: 20,
      }));
      expect(withDeadCode.pillars.valueDiscipline.score).toBeLessThan(clean.pillars.valueDiscipline.score);
    });

    it('penalizes consistency for semantic-mismatch signals', () => {
      const clean = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
      }));
      const withMismatch = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        semanticMismatchCount: 10,
      }));
      expect(withMismatch.pillars.consistency.score).toBeLessThan(clean.pillars.consistency.score);
    });

    it('penalizes critical issues for deprecated-pattern signals', () => {
      const clean = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
      }));
      const withDeprecated = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        deprecatedPatternCount: 4,
      }));
      expect(withDeprecated.pillars.criticalIssues.score).toBeLessThan(clean.pillars.criticalIssues.score);
    });

    it('does not change scores when silent drift counts are zero or undefined', () => {
      const withZero = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        unusedComponentCount: 0,
        repeatedPatternCount: 0,
        orphanedComponentCount: 0,
        semanticMismatchCount: 0,
        deprecatedPatternCount: 0,
      }));
      const withUndefined = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
      }));
      expect(withZero.score).toBe(withUndefined.score);
    });

    it('adds deprecated pattern suggestion', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        deprecatedPatternCount: 3,
      }));
      expect(result.suggestions.some(s => s.includes('deprecated'))).toBe(true);
    });

    it('counts 2 deprecated patterns as 1 critical equivalent', () => {
      // 2 deprecated = ceil(2/2) = 1 critical equivalent
      // effectiveCriticalCount = 0 + 1 = 1 → score = 10 - 3 = 7
      const result = calculateHealthScorePillar(makeMetrics({
        criticalCount: 0,
        deprecatedPatternCount: 2,
      }));
      expect(result.pillars.criticalIssues.score).toBe(7);
    });

    it('combines semantic-mismatch with naming-inconsistency for consistency score', () => {
      // 5 naming + 5 semantic = 10 / 100 = 0.10 rate
      // 1 - 0.10/0.25 = 0.6 → round(10 * 0.6) = 6
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        namingInconsistencyCount: 5,
        semanticMismatchCount: 5,
      }));
      expect(result.pillars.consistency.score).toBe(6);
    });

    it('dead code density adds 30% penalty on top of hardcoded density', () => {
      // hardcodedDensity = 10/100 = 0.1
      // deadCodeDensity = 50/100 = 0.5
      // density = max(0.1 + 0.5*0.3, 60/100*0.5) = max(0.25, 0.30) = 0.30
      // valueDiscipline = round(60 * (1 - 0.30/2)) = round(60 * 0.85) = 51
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        hardcodedValueCount: 10,
        unusedComponentCount: 50,
        totalDriftCount: 60,
      }));
      expect(result.pillars.valueDiscipline.score).toBe(51);
    });
  });

  describe('score distribution calibration', () => {
    it('moderate drift repo scores Good, not Great', () => {
      // A typical repo: 50 components, 30 hardcoded values, some naming issues
      // density = 30/50 = 0.6 → valueDiscipline = round(60 * (1 - 0.6/2)) = round(60 * 0.7) = 42
      // tokenHealth: utility(5) + usage(5) = 10
      // namingRate = (3+5)/50 = 0.16 → consistency = round(10 * (1 - 0.16/0.25)) = round(10 * 0.36) = 4
      // criticalScore = 10
      // total = 42 + 10 + 4 + 10 = 66 → Good
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 50,
        hardcodedValueCount: 30, // density 0.6
        namingInconsistencyCount: 3,
        semanticMismatchCount: 5,
        hasUtilityFramework: true,
      }));
      expect(result.tier).toBe('Good');
    });

    it('heavy drift repo scores OK or worse', () => {
      // Lots of drift signals
      // hardcodedDensity = 100/100 = 1, deadCode = 30/100 = 0.3 * 0.3 = 0.09
      // totalDriftDensity = 200/100 = 2 * 0.5 = 1
      // density = max(1 + 0.09, 1) = 1.09
      // valueDiscipline = round(60 * (1 - 1.09/2)) = round(60 * clamp(0.455, 0, 1)) = round(27.3) = 27
      // tokenHealth = 0
      // namingRate = 25/100 = 0.25 → consistency = 0
      // criticalScore = 10
      // total = 27 + 0 + 0 + 10 = 37 → Bad
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        hardcodedValueCount: 100,
        namingInconsistencyCount: 10,
        semanticMismatchCount: 15,
        unusedComponentCount: 30,
        totalDriftCount: 200,
      }));
      expect(result.score).toBeLessThan(60); // OK or worse
    });
  });

  describe('suggestions for all repos with drift', () => {
    it('provides encouraging suggestion for low-density hardcoded values', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        hardcodedValueCount: 5, // density 0.05 — low tier
        hasUtilityFramework: true,
        hasDesignSystemLibrary: true,
        tokenCount: 50,
        unusedTokenCount: 0,
      }));
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.some(s => s.includes('Nearly there'))).toBe(true);
    });

    it('provides severe suggestion for high-density hardcoded values', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 10,
        hardcodedValueCount: 20, // density 2.0 — severe tier
      }));
      expect(result.suggestions.some(s => s.includes('high density'))).toBe(true);
    });

    it('provides gentle consistency suggestion for few inconsistencies', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 100,
        namingInconsistencyCount: 6, // rate 0.06 > 0.05 threshold
      }));
      expect(result.suggestions.some(s => s.includes('naming inconsistencies'))).toBe(true);
    });

    it('suggests removing unused components', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        unusedComponentCount: 15,
      }));
      expect(result.suggestions.some(s => s.includes('unused components'))).toBe(true);
    });

    it('suggests extracting repeated patterns', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        repeatedPatternCount: 8,
      }));
      expect(result.suggestions.some(s => s.includes('repeated patterns'))).toBe(true);
    });

    it('provides congratulatory suggestion for truly perfect project', () => {
      const result = calculateHealthScorePillar(makeMetrics({
        componentCount: 50,
        tokenCount: 50,
        unusedTokenCount: 0,
        hasUtilityFramework: true,
        hasDesignSystemLibrary: true,
      }));
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]).toContain('Perfect design system health');
    });
  });
});

describe('getHealthTier', () => {
  it('returns correct tier for each range', () => {
    expect(getHealthTier(100)).toBe('Great');
    expect(getHealthTier(80)).toBe('Great');
    expect(getHealthTier(79)).toBe('Good');
    expect(getHealthTier(60)).toBe('Good');
    expect(getHealthTier(59)).toBe('OK');
    expect(getHealthTier(40)).toBe('OK');
    expect(getHealthTier(39)).toBe('Bad');
    expect(getHealthTier(20)).toBe('Bad');
    expect(getHealthTier(19)).toBe('Terrible');
    expect(getHealthTier(0)).toBe('Terrible');
  });
});
