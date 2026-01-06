// apps/cli/src/output/__tests__/reports.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DriftSignal, Component, DesignToken, Severity } from '@buoy-design/core';
import {
  formatDeveloperBrief,
  formatTeamDashboard,
  formatExecutiveSummary,
  formatRealityMirror,
  type DeveloperBriefData,
  type TeamDashboardData,
  type ExecutiveSummaryData,
  type RealityMirrorData,
} from '../reports.js';

// Helper to create mock drift signals
function createDrift(
  severity: Severity,
  type: string = 'hardcoded-value',
  entityName: string = 'Button',
  message: string = 'Test drift message',
): DriftSignal {
  return {
    id: `drift-${Math.random().toString(36).slice(2)}`,
    type: type as DriftSignal['type'],
    severity,
    source: {
      entityType: 'component',
      entityId: `comp-${entityName}`,
      entityName,
      location: `src/${entityName}.tsx:10`,
    },
    message,
    details: {
      expected: '#0066CC',
      actual: '#3B82F6',
    },
    detectedAt: new Date(),
  };
}

// Helper to create mock component
function createMockComponent(name: string, health: number = 0.95): Component {
  return {
    id: `comp-${name}`,
    name,
    source: {
      type: 'react',
      path: `src/${name}.tsx`,
      exportName: name,
      line: 1,
    },
    props: [{ name: 'onClick', type: '() => void', required: false }],
    variants: [],
    tokens: [],
    dependencies: [],
    metadata: { tags: [], health },
    scannedAt: new Date(),
  };
}

describe('Developer Daily Brief', () => {
  it('renders header with branch info', () => {
    const data: DeveloperBriefData = {
      branch: { source: 'feature/xyz', target: 'main' },
      filesChanged: ['Button.tsx', 'Card.tsx'],
      componentsModified: ['Button', 'Card'],
      drifts: [],
      componentHealth: {},
      personalStats: { driftRate: 3.2, teamAverage: 4.1, trend: 'improving' },
    };

    const output = formatDeveloperBrief(data);

    expect(output).toContain('DEVELOPER BRIEF');
    expect(output).toContain('main');
    expect(output).toContain('feature/xyz');
  });

  it('shows file change summary', () => {
    const data: DeveloperBriefData = {
      branch: { source: 'feature/xyz', target: 'main' },
      filesChanged: ['Button.tsx', 'Card.tsx', 'Modal.tsx', 'Input.tsx'],
      componentsModified: ['Button', 'Card'],
      drifts: [],
      componentHealth: {},
      personalStats: { driftRate: 3.2, teamAverage: 4.1, trend: 'improving' },
    };

    const output = formatDeveloperBrief(data);

    expect(output).toContain('Files touched: 4');
    expect(output).toContain('Components modified: 2');
  });

  it('displays action needed section with drift details', () => {
    const data: DeveloperBriefData = {
      branch: { source: 'feature/xyz', target: 'main' },
      filesChanged: ['Card.tsx'],
      componentsModified: ['Card'],
      drifts: [
        createDrift('warning', 'hardcoded-value', 'Card', 'Hardcoded color #3B82F6'),
      ],
      componentHealth: {},
      personalStats: { driftRate: 3.2, teamAverage: 4.1, trend: 'improving' },
    };

    const output = formatDeveloperBrief(data);

    expect(output).toContain('ACTION NEEDED');
    expect(output).toContain('Card.tsx');
    expect(output).toContain('Hardcoded color');
  });

  it('shows component health indicators', () => {
    const data: DeveloperBriefData = {
      branch: { source: 'feature/xyz', target: 'main' },
      filesChanged: ['Button.tsx'],
      componentsModified: ['Button'],
      drifts: [],
      componentHealth: {
        Button: { health: 98, usageCount: 847, driftCount: 12 },
        Card: { health: 67, usageCount: 234, driftCount: 78 },
      },
      personalStats: { driftRate: 3.2, teamAverage: 4.1, trend: 'improving' },
    };

    const output = formatDeveloperBrief(data);

    expect(output).toContain('Button');
    expect(output).toContain('98%');
    expect(output).toContain('Card');
    expect(output).toContain('67%');
  });

  it('shows personal drift stats with trend', () => {
    const data: DeveloperBriefData = {
      branch: { source: 'feature/xyz', target: 'main' },
      filesChanged: [],
      componentsModified: [],
      drifts: [],
      componentHealth: {},
      personalStats: { driftRate: 3.2, teamAverage: 4.1, trend: 'improving' },
    };

    const output = formatDeveloperBrief(data);

    expect(output).toContain('3.2%');
    expect(output).toContain('4.1%');
    expect(output).toContain('improving');
  });

  it('shows clean state when no drifts', () => {
    const data: DeveloperBriefData = {
      branch: { source: 'feature/xyz', target: 'main' },
      filesChanged: ['Button.tsx'],
      componentsModified: ['Button'],
      drifts: [],
      componentHealth: { Button: { health: 98, usageCount: 847, driftCount: 0 } },
      personalStats: { driftRate: 0, teamAverage: 4.1, trend: 'improving' },
    };

    const output = formatDeveloperBrief(data);

    expect(output).toContain('Clean');
  });
});

describe('Team Dashboard', () => {
  it('renders system health metrics', () => {
    const data: TeamDashboardData = {
      period: { start: new Date('2026-01-01'), end: new Date('2026-01-07'), label: 'Week of Jan 6, 2026' },
      version: '4.2.1',
      health: {
        tokenCoverage: { current: 84, change: 2 },
        componentAdoption: { current: 91, change: -1 },
        patternConsistency: { current: 72, change: 4 },
      },
      totals: { components: 47, tokens: 186, instances: 12847, repos: 8, contributors: 34, driftSignals: 1203 },
      driftDistribution: { byType: {}, byTeam: {} },
      componentHealth: [],
      emergingPatterns: [],
      actions: [],
    };

    const output = formatTeamDashboard(data);

    expect(output).toContain('DESIGN SYSTEM HEALTH');
    expect(output).toContain('84%');
    expect(output).toContain('91%');
    expect(output).toContain('72%');
  });

  it('shows drift distribution by type and team', () => {
    const data: TeamDashboardData = {
      period: { start: new Date('2026-01-01'), end: new Date('2026-01-07'), label: 'Week of Jan 6, 2026' },
      version: '4.2.1',
      health: {
        tokenCoverage: { current: 84, change: 2 },
        componentAdoption: { current: 91, change: -1 },
        patternConsistency: { current: 72, change: 4 },
      },
      totals: { components: 47, tokens: 186, instances: 12847, repos: 8, contributors: 34, driftSignals: 1203 },
      driftDistribution: {
        byType: {
          'Hardcoded colors': 342,
          'Non-token spacing': 267,
        },
        byTeam: {
          'Checkout team': 412,
          'Dashboard': 301,
        },
      },
      componentHealth: [],
      emergingPatterns: [],
      actions: [],
    };

    const output = formatTeamDashboard(data);

    expect(output).toContain('Hardcoded colors');
    expect(output).toContain('342');
    expect(output).toContain('Checkout team');
    expect(output).toContain('412');
  });

  it('categorizes component health levels', () => {
    const data: TeamDashboardData = {
      period: { start: new Date('2026-01-01'), end: new Date('2026-01-07'), label: 'Week of Jan 6, 2026' },
      version: '4.2.1',
      health: {
        tokenCoverage: { current: 84, change: 2 },
        componentAdoption: { current: 91, change: -1 },
        patternConsistency: { current: 72, change: 4 },
      },
      totals: { components: 47, tokens: 186, instances: 12847, repos: 8, contributors: 34, driftSignals: 1203 },
      driftDistribution: { byType: {}, byTeam: {} },
      componentHealth: [
        { name: 'Button', health: 98, category: 'healthy' },
        { name: 'Card', health: 67, category: 'attention' },
        { name: 'DataTable', health: 42, category: 'critical' },
      ],
      emergingPatterns: [],
      actions: [],
    };

    const output = formatTeamDashboard(data);

    expect(output).toContain('HEALTHY');
    expect(output).toContain('Button');
    expect(output).toContain('ATTENTION');
    expect(output).toContain('Card');
    expect(output).toContain('CRITICAL');
    expect(output).toContain('DataTable');
  });

  it('shows emerging patterns', () => {
    const data: TeamDashboardData = {
      period: { start: new Date('2026-01-01'), end: new Date('2026-01-07'), label: 'Week of Jan 6, 2026' },
      version: '4.2.1',
      health: {
        tokenCoverage: { current: 84, change: 2 },
        componentAdoption: { current: 91, change: -1 },
        patternConsistency: { current: 72, change: 4 },
      },
      totals: { components: 47, tokens: 186, instances: 12847, repos: 8, contributors: 34, driftSignals: 1203 },
      driftDistribution: { byType: {}, byTeam: {} },
      componentHealth: [],
      emergingPatterns: [
        { name: 'Skeleton Loading', instances: 23, repos: 4, status: 'CANDIDATE', firstSeen: new Date('2026-01-02'), authors: ['@alex', '@jordan'] },
      ],
      actions: [],
    };

    const output = formatTeamDashboard(data);

    expect(output).toContain('EMERGING PATTERNS');
    expect(output).toContain('Skeleton Loading');
    expect(output).toContain('23');
    expect(output).toContain('CANDIDATE');
  });

  it('lists recommended actions', () => {
    const data: TeamDashboardData = {
      period: { start: new Date('2026-01-01'), end: new Date('2026-01-07'), label: 'Week of Jan 6, 2026' },
      version: '4.2.1',
      health: {
        tokenCoverage: { current: 84, change: 2 },
        componentAdoption: { current: 91, change: -1 },
        patternConsistency: { current: 72, change: 4 },
      },
      totals: { components: 47, tokens: 186, instances: 12847, repos: 8, contributors: 34, driftSignals: 1203 },
      driftDistribution: { byType: {}, byTeam: {} },
      componentHealth: [],
      emergingPatterns: [],
      actions: [
        'Schedule token training for new contractors',
        'Create migration path to DataGridV2',
      ],
    };

    const output = formatTeamDashboard(data);

    expect(output).toContain('ACTIONS');
    expect(output).toContain('Schedule token training');
    expect(output).toContain('migration path');
  });
});

describe('Executive Summary', () => {
  it('renders headline alignment percentage', () => {
    const data: ExecutiveSummaryData = {
      period: { label: 'Q4 2025' },
      alignment: { current: 78, previous: 61, trend: [54, 61, 78] },
      impact: {
        designReviewTime: { reduction: 45, from: 12, to: 6.5, unit: 'hrs/sprint' },
        devRework: { reduction: 62, from: 8.2, to: 3.1, unit: 'days/month' },
        brandConsistency: { increase: 31, nps: { from: 72, to: 94 } },
        estimatedSavings: 127000,
      },
      trajectory: { current: 78, projected: 95, targetDate: 'Q2 2026' },
      risks: [],
      decisions: [],
      teamPerformance: { leading: [], needingSupport: [] },
    };

    const output = formatExecutiveSummary(data);

    expect(output).toContain('EXECUTIVE SUMMARY');
    expect(output).toContain('78%');
    expect(output).toContain('ALIGNED');
  });

  it('shows business impact metrics', () => {
    const data: ExecutiveSummaryData = {
      period: { label: 'Q4 2025' },
      alignment: { current: 78, previous: 61, trend: [54, 61, 78] },
      impact: {
        designReviewTime: { reduction: 45, from: 12, to: 6.5, unit: 'hrs/sprint' },
        devRework: { reduction: 62, from: 8.2, to: 3.1, unit: 'days/month' },
        brandConsistency: { increase: 31, nps: { from: 72, to: 94 } },
        estimatedSavings: 127000,
      },
      trajectory: { current: 78, projected: 95, targetDate: 'Q2 2026' },
      risks: [],
      decisions: [],
      teamPerformance: { leading: [], needingSupport: [] },
    };

    const output = formatExecutiveSummary(data);

    expect(output).toContain('BUSINESS IMPACT');
    expect(output).toContain('45%');
    expect(output).toContain('62%');
    expect(output).toContain('$127,000');
  });

  it('displays adoption trajectory', () => {
    const data: ExecutiveSummaryData = {
      period: { label: 'Q4 2025' },
      alignment: { current: 78, previous: 61, trend: [54, 61, 78] },
      impact: {
        designReviewTime: { reduction: 45, from: 12, to: 6.5, unit: 'hrs/sprint' },
        devRework: { reduction: 62, from: 8.2, to: 3.1, unit: 'days/month' },
        brandConsistency: { increase: 31, nps: { from: 72, to: 94 } },
        estimatedSavings: 127000,
      },
      trajectory: { current: 78, projected: 95, targetDate: 'Q2 2026' },
      risks: [],
      decisions: [],
      teamPerformance: { leading: [], needingSupport: [] },
    };

    const output = formatExecutiveSummary(data);

    expect(output).toContain('TRAJECTORY');
    expect(output).toContain('95%');
    expect(output).toContain('Q2 2026');
  });

  it('shows risk areas', () => {
    const data: ExecutiveSummaryData = {
      period: { label: 'Q4 2025' },
      alignment: { current: 78, previous: 61, trend: [54, 61, 78] },
      impact: {
        designReviewTime: { reduction: 45, from: 12, to: 6.5, unit: 'hrs/sprint' },
        devRework: { reduction: 62, from: 8.2, to: 3.1, unit: 'days/month' },
        brandConsistency: { increase: 31, nps: { from: 72, to: 94 } },
        estimatedSavings: 127000,
      },
      trajectory: { current: 78, projected: 95, targetDate: 'Q2 2026' },
      risks: [
        { title: 'AI-GENERATED CODE', description: '47% of new PRs contain AI-assisted code', recommendation: 'Deploy AI Context Layer' },
      ],
      decisions: [],
      teamPerformance: { leading: [], needingSupport: [] },
    };

    const output = formatExecutiveSummary(data);

    expect(output).toContain('RISK AREAS');
    expect(output).toContain('AI-GENERATED CODE');
    expect(output).toContain('47%');
  });

  it('lists key decisions needed', () => {
    const data: ExecutiveSummaryData = {
      period: { label: 'Q4 2025' },
      alignment: { current: 78, previous: 61, trend: [54, 61, 78] },
      impact: {
        designReviewTime: { reduction: 45, from: 12, to: 6.5, unit: 'hrs/sprint' },
        devRework: { reduction: 62, from: 8.2, to: 3.1, unit: 'days/month' },
        brandConsistency: { increase: 31, nps: { from: 72, to: 94 } },
        estimatedSavings: 127000,
      },
      trajectory: { current: 78, projected: 95, targetDate: 'Q2 2026' },
      risks: [],
      decisions: [
        'Invest $45K in AI Context Layer?',
        'Fund mobile SDK unification project?',
      ],
      teamPerformance: { leading: [], needingSupport: [] },
    };

    const output = formatExecutiveSummary(data);

    expect(output).toContain('DECISIONS NEEDED');
    expect(output).toContain('$45K');
    expect(output).toContain('mobile SDK');
  });

  it('shows team performance comparison', () => {
    const data: ExecutiveSummaryData = {
      period: { label: 'Q4 2025' },
      alignment: { current: 78, previous: 61, trend: [54, 61, 78] },
      impact: {
        designReviewTime: { reduction: 45, from: 12, to: 6.5, unit: 'hrs/sprint' },
        devRework: { reduction: 62, from: 8.2, to: 3.1, unit: 'days/month' },
        brandConsistency: { increase: 31, nps: { from: 72, to: 94 } },
        estimatedSavings: 127000,
      },
      trajectory: { current: 78, projected: 95, targetDate: 'Q2 2026' },
      risks: [],
      decisions: [],
      teamPerformance: {
        leading: [{ name: 'Auth team', alignment: 94 }],
        needingSupport: [{ name: 'Checkout', alignment: 58, reason: 'new contractors' }],
      },
    };

    const output = formatExecutiveSummary(data);

    expect(output).toContain('TEAMS LEADING');
    expect(output).toContain('Auth team');
    expect(output).toContain('94%');
    expect(output).toContain('TEAMS NEEDING SUPPORT');
    expect(output).toContain('Checkout');
    expect(output).toContain('58%');
  });
});

describe('Reality Mirror (Designer Report)', () => {
  it('renders fidelity score', () => {
    const data: RealityMirrorData = {
      designFile: 'Checkout Flow v2.3',
      lastSync: new Date(),
      fidelityScore: 84,
      changes: [],
      patternDrift: [],
      conversations: [],
    };

    const output = formatRealityMirror(data);

    expect(output).toContain('REALITY MIRROR');
    expect(output).toContain('Checkout Flow');
    expect(output).toContain('84%');
  });

  it('shows color changes with impact explanation', () => {
    const data: RealityMirrorData = {
      designFile: 'Checkout Flow v2.3',
      lastSync: new Date(),
      fidelityScore: 84,
      changes: [
        {
          category: 'COLORS',
          designed: '#0066CC',
          shipped: '#0065CB',
          impact: '1 shade darker. Less vibrant.',
        },
      ],
      patternDrift: [],
      conversations: [],
    };

    const output = formatRealityMirror(data);

    expect(output).toContain('COLORS');
    expect(output).toContain('#0066CC');
    expect(output).toContain('#0065CB');
    expect(output).toContain('Less vibrant');
  });

  it('shows spacing changes', () => {
    const data: RealityMirrorData = {
      designFile: 'Checkout Flow v2.3',
      lastSync: new Date(),
      fidelityScore: 84,
      changes: [
        {
          category: 'SPACING',
          designed: '24px',
          shipped: '20px',
          impact: '4px tighter. Feels cramped on mobile.',
        },
      ],
      patternDrift: [],
      conversations: [],
    };

    const output = formatRealityMirror(data);

    expect(output).toContain('SPACING');
    expect(output).toContain('24px');
    expect(output).toContain('20px');
    expect(output).toContain('cramped');
  });

  it('shows pattern drift with component comparison', () => {
    const data: RealityMirrorData = {
      designFile: 'Checkout Flow v2.3',
      lastSync: new Date(),
      fidelityScore: 84,
      changes: [],
      patternDrift: [
        {
          component: 'Add to Cart',
          designedAs: 'Primary Button, icon left, full width',
          shippedAs: 'Secondary Button, no icon, auto width',
          userImpact: 'Less visual prominence. May reduce conversions.',
          devNote: { author: '@jordan', date: new Date('2026-01-03'), message: 'Button was too wide on desktop' },
        },
      ],
      conversations: [],
    };

    const output = formatRealityMirror(data);

    expect(output).toContain('PATTERN DRIFT');
    expect(output).toContain('Add to Cart');
    expect(output).toContain('Primary Button');
    expect(output).toContain('Secondary Button');
    expect(output).toContain('conversions');
  });

  it('shows conversation options', () => {
    const data: RealityMirrorData = {
      designFile: 'Checkout Flow v2.3',
      lastSync: new Date(),
      fidelityScore: 84,
      changes: [],
      patternDrift: [],
      conversations: [
        { action: 'discuss', label: 'Why was the CTA button changed?', target: '@jordan' },
        { action: 'accept', label: 'Accept this as new baseline' },
        { action: 'revert', label: 'Request revert to original' },
      ],
    };

    const output = formatRealityMirror(data);

    expect(output).toContain('CONVERSATION');
    expect(output).toContain('Why was the CTA');
    expect(output).toContain('Accept');
    expect(output).toContain('revert');
  });

  it('handles 100% fidelity (perfect match)', () => {
    const data: RealityMirrorData = {
      designFile: 'Settings Page v1.0',
      lastSync: new Date(),
      fidelityScore: 100,
      changes: [],
      patternDrift: [],
      conversations: [],
    };

    const output = formatRealityMirror(data);

    expect(output).toContain('100%');
    expect(output).toMatch(/perfect|unchanged|aligned/i);
  });
});
