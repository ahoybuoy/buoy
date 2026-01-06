// apps/cli/src/output/reports.ts
// Visual 1-page reports for design system health

import chalk from 'chalk';
import type { DriftSignal } from '@buoy-design/core';

// ============================================================================
// Type Definitions
// ============================================================================

export interface DeveloperBriefData {
  branch: { source: string; target: string };
  filesChanged: string[];
  componentsModified: string[];
  drifts: DriftSignal[];
  componentHealth: Record<string, { health: number; usageCount: number; driftCount: number }>;
  personalStats: { driftRate: number; teamAverage: number; trend: 'improving' | 'stable' | 'declining' };
}

export interface TeamDashboardData {
  period: { start: Date; end: Date; label: string };
  version: string;
  health: {
    tokenCoverage: { current: number; change: number };
    componentAdoption: { current: number; change: number };
    patternConsistency: { current: number; change: number };
  };
  totals: {
    components: number;
    tokens: number;
    instances: number;
    repos: number;
    contributors: number;
    driftSignals: number;
  };
  driftDistribution: {
    byType: Record<string, number>;
    byTeam: Record<string, number>;
  };
  componentHealth: Array<{ name: string; health: number; category: 'healthy' | 'attention' | 'critical' }>;
  emergingPatterns: Array<{
    name: string;
    instances: number;
    repos: number;
    status: 'OBSERVING' | 'CANDIDATE' | 'EMERGING';
    firstSeen: Date;
    authors: string[];
  }>;
  actions: string[];
}

export interface ExecutiveSummaryData {
  period: { label: string };
  alignment: { current: number; previous: number; trend: number[] };
  impact: {
    designReviewTime: { reduction: number; from: number; to: number; unit: string };
    devRework: { reduction: number; from: number; to: number; unit: string };
    brandConsistency: { increase: number; nps: { from: number; to: number } };
    estimatedSavings: number;
  };
  trajectory: { current: number; projected: number; targetDate: string };
  risks: Array<{ title: string; description: string; recommendation: string }>;
  decisions: string[];
  teamPerformance: {
    leading: Array<{ name: string; alignment: number }>;
    needingSupport: Array<{ name: string; alignment: number; reason: string }>;
  };
}

export interface RealityMirrorData {
  designFile: string;
  lastSync: Date;
  fidelityScore: number;
  changes: Array<{
    category: 'COLORS' | 'SPACING' | 'TYPOGRAPHY';
    designed: string;
    shipped: string;
    impact: string;
  }>;
  patternDrift: Array<{
    component: string;
    designedAs: string;
    shippedAs: string;
    userImpact: string;
    devNote?: { author: string; date: Date; message: string };
  }>;
  conversations: Array<{
    action: 'discuss' | 'accept' | 'revert';
    label: string;
    target?: string;
  }>;
}

// ============================================================================
// Helper Functions
// ============================================================================

function section(title: string, width: number = 78): string {
  const line = '─'.repeat(width - title.length - 4);
  return `┌─ ${title} ${line}┐`;
}

function sectionEnd(width: number = 78): string {
  return `└${'─'.repeat(width - 2)}┘`;
}

function progressBar(percent: number, width: number = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
}

function healthDots(percent: number): string {
  const filled = Math.round(percent / 20);
  const empty = 5 - filled;
  return chalk.green('●'.repeat(filled)) + chalk.dim('○'.repeat(empty));
}

function trendArrow(trend: 'improving' | 'stable' | 'declining' | number): string {
  if (typeof trend === 'number') {
    if (trend > 0) return chalk.green(`↑ ${trend}%`);
    if (trend < 0) return chalk.red(`↓ ${Math.abs(trend)}%`);
    return chalk.dim('→ 0%');
  }
  switch (trend) {
    case 'improving': return chalk.green('↓ improving');
    case 'declining': return chalk.red('↑ declining');
    default: return chalk.dim('→ stable');
  }
}

function formatMoney(amount: number): string {
  return '$' + amount.toLocaleString('en-US');
}

function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}hr ago`;
  return date.toLocaleDateString();
}

// ============================================================================
// Developer Daily Brief
// ============================================================================

export function formatDeveloperBrief(data: DeveloperBriefData): string {
  const lines: string[] = [];
  const width = 80;

  // Header
  lines.push('');
  lines.push(chalk.bold.cyan('╭' + '─'.repeat(width - 2) + '╮'));
  lines.push(chalk.bold.cyan('│') + '  ' + chalk.bold('BUOY DEVELOPER BRIEF') + ' '.repeat(width - 46) + chalk.dim(`${data.branch.target} ← ${data.branch.source}`) + '  ' + chalk.bold.cyan('│'));
  lines.push(chalk.bold.cyan('│') + '  ' + chalk.dim('Your changes vs. design system') + ' '.repeat(width - 57) + chalk.dim(`Generated: just now`) + '  ' + chalk.bold.cyan('│'));
  lines.push(chalk.bold.cyan('╰' + '─'.repeat(width - 2) + '╯'));
  lines.push('');

  // Your Changes Section
  lines.push(section('YOUR CHANGES', width));
  lines.push('│' + ' '.repeat(width - 2) + '│');
  lines.push('│  ' + `Files touched: ${chalk.bold(data.filesChanged.length)}`.padEnd(width - 4) + '│');
  lines.push('│  ' + `Components modified: ${chalk.bold(data.componentsModified.length)}`.padEnd(width - 4) + '│');

  // Show component status indicators
  if (data.componentsModified.length > 0) {
    lines.push('│' + ' '.repeat(width - 2) + '│');
    const componentLine = data.componentsModified.slice(0, 3).map(comp => {
      const hasDrift = data.drifts.some(d => d.source.entityName === comp);
      if (hasDrift) {
        return `  ${chalk.yellow('⚠')} ${comp}`;
      }
      return `  ${chalk.green('✓')} ${comp} ${chalk.dim('Clean')}`;
    }).join('    ');
    lines.push('│  ' + componentLine.padEnd(width - 4 + 20) + '│'); // Extra padding for ANSI
  }
  lines.push('│' + ' '.repeat(width - 2) + '│');
  lines.push(sectionEnd(width));
  lines.push('');

  // Action Needed Section
  if (data.drifts.length > 0) {
    lines.push(section('ACTION NEEDED', width));
    lines.push('│' + ' '.repeat(width - 2) + '│');

    for (const drift of data.drifts.slice(0, 3)) {
      const icon = drift.severity === 'critical' ? chalk.red('!') : chalk.yellow('⚠');
      lines.push(`│  ${icon}  ${chalk.bold(drift.source.location || drift.source.entityName)}`.padEnd(width + 8) + '│');
      lines.push(`│     └─ ${drift.message}`.padEnd(width - 2) + '│');

      // Show fix suggestion
      if (drift.type === 'hardcoded-value') {
        lines.push(`│     └─ ${chalk.dim('Use:')} ${chalk.cyan('var(--color-primary)')} ${chalk.dim('or theme token')}`.padEnd(width + 15) + '│');
      }
      lines.push('│' + ' '.repeat(width - 2) + '│');
    }

    // Quick actions
    lines.push('│  ' + chalk.bold.cyan('Quick actions:') + ' '.repeat(width - 18) + '│');
    lines.push('│  ' + `  ${chalk.cyan('buoy fix --interactive')}    ${chalk.dim('Fix with guided prompts')}`.padEnd(width + 10) + '│');
    lines.push('│  ' + `  ${chalk.cyan('buoy ignore <file>:<line>')} ${chalk.dim('Mark as intentional')}`.padEnd(width + 10) + '│');
    lines.push('│' + ' '.repeat(width - 2) + '│');
    lines.push(sectionEnd(width));
    lines.push('');
  }

  // Components You're Using
  const healthEntries = Object.entries(data.componentHealth).slice(0, 3);
  if (healthEntries.length > 0) {
    lines.push(section('COMPONENTS YOU\'RE USING', width));
    lines.push('│' + ' '.repeat(width - 2) + '│');

    const healthLine = healthEntries.map(([name, stats]) => {
      return `  ${chalk.bold(name)} ${healthDots(stats.health)} ${stats.health}%`;
    }).join('   ');
    lines.push('│' + healthLine.padEnd(width + 25) + '│');

    const usageLine = healthEntries.map(([_name, stats]) => {
      return `  └─ ${stats.usageCount} uses, ${stats.driftCount} drift`;
    }).join('   ');
    lines.push('│' + chalk.dim(usageLine).padEnd(width + 10) + '│');

    lines.push('│' + ' '.repeat(width - 2) + '│');
    lines.push(sectionEnd(width));
    lines.push('');
  }

  // Quick Stats
  lines.push(section('QUICK STATS', width));
  const statsLine = `│  Your drift rate: ${chalk.bold(data.personalStats.driftRate + '%')}  │  Team avg: ${chalk.bold(data.personalStats.teamAverage + '%')}  │  Trend: ${trendArrow(data.personalStats.trend)}`;
  lines.push(statsLine.padEnd(width + 25) + '│');
  lines.push(sectionEnd(width));

  return lines.join('\n');
}

// ============================================================================
// Team Dashboard
// ============================================================================

export function formatTeamDashboard(data: TeamDashboardData): string {
  const lines: string[] = [];
  const width = 80;

  // Header
  lines.push('');
  lines.push(chalk.bold.blue('╭' + '─'.repeat(width - 2) + '╮'));
  lines.push(chalk.bold.blue('│') + '  ' + chalk.bold('DESIGN SYSTEM HEALTH REPORT') + ' '.repeat(width - 54) + chalk.dim(data.period.label) + '  ' + chalk.bold.blue('│'));
  lines.push(chalk.bold.blue('│') + '  ' + chalk.dim(`@acme/design-system v${data.version}`) + ' '.repeat(width - 50) + chalk.dim('vs. last week') + '  ' + chalk.bold.blue('│'));
  lines.push(chalk.bold.blue('╰' + '─'.repeat(width - 2) + '╯'));
  lines.push('');

  // System Health Section
  lines.push(section('SYSTEM HEALTH', width));
  lines.push('│' + ' '.repeat(width - 2) + '│');

  // Health metrics
  const tokenBar = progressBar(data.health.tokenCoverage.current, 14);
  const componentBar = progressBar(data.health.componentAdoption.current, 14);
  const patternBar = progressBar(data.health.patternConsistency.current, 14);

  lines.push(`│     ${chalk.bold('TOKEN COVERAGE')}          ${chalk.bold('COMPONENT ADOPTION')}         ${chalk.bold('PATTERN CONSISTENCY')}   │`);
  lines.push(`│     ${tokenBar} ${data.health.tokenCoverage.current}%      ${componentBar} ${data.health.componentAdoption.current}%       ${patternBar} ${data.health.patternConsistency.current}%   │`);
  lines.push(`│          ${trendArrow(data.health.tokenCoverage.change)}                    ${trendArrow(data.health.componentAdoption.change)}                       ${trendArrow(data.health.patternConsistency.change)}             │`);
  lines.push('│' + ' '.repeat(width - 2) + '│');
  lines.push(`│     Components: ${data.totals.components}           Instances: ${data.totals.instances.toLocaleString()}    Active repos: ${data.totals.repos}     │`);
  lines.push(`│     Tokens: ${data.totals.tokens}               Drift signals: ${data.totals.driftSignals}       Contributors: ${data.totals.contributors}    │`);
  lines.push('│' + ' '.repeat(width - 2) + '│');
  lines.push(sectionEnd(width));
  lines.push('');

  // Drift Distribution
  const byTypeEntries = Object.entries(data.driftDistribution.byType).slice(0, 5);
  const byTeamEntries = Object.entries(data.driftDistribution.byTeam).slice(0, 5);

  if (byTypeEntries.length > 0 || byTeamEntries.length > 0) {
    lines.push(section('DRIFT DISTRIBUTION', width));
    lines.push('│' + ' '.repeat(width - 2) + '│');
    lines.push(`│  ${chalk.bold('By Type')}                              ${chalk.bold('By Team')}`.padEnd(width + 5) + '│');
    lines.push(`│  ${'─'.repeat(25)}                ${'─'.repeat(25)}`.padEnd(width - 2) + '│');

    const maxRows = Math.max(byTypeEntries.length, byTeamEntries.length);
    for (let i = 0; i < maxRows; i++) {
      const typeEntry = byTypeEntries[i];
      const teamEntry = byTeamEntries[i];

      const typePart = typeEntry
        ? `${typeEntry[0].padEnd(18)} ${chalk.cyan('█'.repeat(Math.min(8, Math.ceil(typeEntry[1] / 50))))} ${typeEntry[1]}`
        : '';
      const teamPart = teamEntry
        ? `${teamEntry[0].padEnd(15)} ${chalk.yellow('█'.repeat(Math.min(8, Math.ceil(teamEntry[1] / 50))))} ${teamEntry[1]}`
        : '';

      lines.push(`│  ${typePart.padEnd(38)}      ${teamPart}`.padEnd(width + 15) + '│');
    }
    lines.push('│' + ' '.repeat(width - 2) + '│');
    lines.push(sectionEnd(width));
    lines.push('');
  }

  // Component Health
  const healthy = data.componentHealth.filter(c => c.category === 'healthy').slice(0, 4);
  const attention = data.componentHealth.filter(c => c.category === 'attention').slice(0, 4);
  const critical = data.componentHealth.filter(c => c.category === 'critical').slice(0, 2);

  if (data.componentHealth.length > 0) {
    lines.push(section('COMPONENT HEALTH', width));
    lines.push('│' + ' '.repeat(width - 2) + '│');
    lines.push(`│  ${chalk.green.bold('✓ HEALTHY (>90%)')}        ${chalk.yellow.bold('⚠ ATTENTION (<70%)')}         ${chalk.red.bold('✗ CRITICAL (<50%)')}       │`);
    lines.push(`│  ${'───────────────'}        ${'─────────────────'}          ${'────────────────'}        │`);

    const maxRows = Math.max(healthy.length, attention.length, critical.length);
    for (let i = 0; i < maxRows; i++) {
      const h = healthy[i];
      const a = attention[i];
      const c = critical[i];

      const hPart = h ? `${h.name.padEnd(12)} ${h.health}%` : '';
      const aPart = a ? `${a.name.padEnd(12)} ${a.health}%` : '';
      const cPart = c ? `${c.name.padEnd(12)} ${c.health}%` : '';

      lines.push(`│  ${chalk.green(hPart.padEnd(18))}        ${chalk.yellow(aPart.padEnd(18))}         ${chalk.red(cPart.padEnd(18))}       │`);
    }
    lines.push('│' + ' '.repeat(width - 2) + '│');
    lines.push(sectionEnd(width));
    lines.push('');
  }

  // Emerging Patterns
  if (data.emergingPatterns.length > 0) {
    lines.push(section('EMERGING PATTERNS', width));
    lines.push('│' + ' '.repeat(width - 2) + '│');

    for (const pattern of data.emergingPatterns.slice(0, 3)) {
      lines.push(`│  ${chalk.cyan('🆕')} ${chalk.bold(pattern.name)}    ${pattern.instances} instances across ${pattern.repos} repos    Status: ${chalk.yellow(pattern.status)}`.padEnd(width + 10) + '│');
      lines.push(`│     First seen: ${pattern.firstSeen.toLocaleDateString()}   Authors: ${pattern.authors.join(', ')}`.padEnd(width - 2) + '│');
      lines.push('│' + ' '.repeat(width - 2) + '│');
    }
    lines.push(sectionEnd(width));
    lines.push('');
  }

  // Actions
  if (data.actions.length > 0) {
    lines.push(section('ACTIONS', width));
    data.actions.forEach((action, i) => {
      lines.push(`│  ${i + 1}. ${action}`.padEnd(width - 2) + '│');
    });
    lines.push(sectionEnd(width));
  }

  return lines.join('\n');
}

// ============================================================================
// Executive Summary
// ============================================================================

export function formatExecutiveSummary(data: ExecutiveSummaryData): string {
  const lines: string[] = [];
  const width = 80;

  // Header
  lines.push('');
  lines.push(chalk.bold.magenta('╭' + '─'.repeat(width - 2) + '╮'));
  lines.push(chalk.bold.magenta('│') + '  ' + chalk.bold('DESIGN SYSTEM EXECUTIVE SUMMARY') + ' '.repeat(width - 52) + chalk.dim(data.period.label) + '  ' + chalk.bold.magenta('│'));
  lines.push(chalk.bold.magenta('│') + '  ' + chalk.dim('Design-Development Alignment Report') + ' '.repeat(width - 41) + chalk.bold.magenta('│'));
  lines.push(chalk.bold.magenta('╰' + '─'.repeat(width - 2) + '╯'));
  lines.push('');

  // The Headline
  lines.push(section('THE HEADLINE', width));
  lines.push('│' + ' '.repeat(width - 2) + '│');

  const alignmentBar = progressBar(data.alignment.current, 30);
  lines.push(`│     ${alignmentBar}  ${chalk.bold.green(data.alignment.current + '% ALIGNED')}`.padEnd(width + 15) + '│');
  lines.push('│' + ' '.repeat(width - 2) + '│');
  lines.push(`│     "${data.alignment.current}% of shipped code matches design intent. Up from ${data.alignment.previous}% last period."`.padEnd(width - 2) + '│');
  lines.push('│' + ' '.repeat(width - 2) + '│');

  lines.push('│' + ' '.repeat(width - 2) + '│');
  lines.push(sectionEnd(width));
  lines.push('');

  // Business Impact
  lines.push(section('BUSINESS IMPACT', width));
  lines.push('│' + ' '.repeat(width - 2) + '│');
  lines.push(`│     ${chalk.bold('DESIGN REVIEW TIME')}          ${chalk.bold('DEV REWORK REDUCTION')}       ${chalk.bold('BRAND CONSISTENCY')}   │`);
  lines.push(`│     ${chalk.green('↓ ' + data.impact.designReviewTime.reduction + '%')}                       ${chalk.green('↓ ' + data.impact.devRework.reduction + '%')}                      ${chalk.green('↑ ' + data.impact.brandConsistency.increase + '%')}            │`);
  lines.push(`│     ${data.impact.designReviewTime.from} → ${data.impact.designReviewTime.to} ${data.impact.designReviewTime.unit}     ${data.impact.devRework.from} → ${data.impact.devRework.to} ${data.impact.devRework.unit}        NPS: ${data.impact.brandConsistency.nps.from} → ${data.impact.brandConsistency.nps.to}       │`);
  lines.push('│' + ' '.repeat(width - 2) + '│');
  lines.push(`│     Estimated savings: ${chalk.bold.green(formatMoney(data.impact.estimatedSavings))} in reduced rework and review cycles`.padEnd(width - 2) + '│');
  lines.push('│' + ' '.repeat(width - 2) + '│');
  lines.push(sectionEnd(width));
  lines.push('');

  // Adoption Trajectory
  lines.push(section('ADOPTION TRAJECTORY', width));
  lines.push('│' + ' '.repeat(width - 2) + '│');
  lines.push(`│  At current velocity: ${chalk.bold(data.trajectory.projected + '%')} alignment achievable by ${chalk.bold(data.trajectory.targetDate)}`.padEnd(width - 2) + '│');
  lines.push('│' + ' '.repeat(width - 2) + '│');
  lines.push(sectionEnd(width));
  lines.push('');

  // Risk Areas
  if (data.risks.length > 0) {
    lines.push(section('RISK AREAS', width));
    lines.push('│' + ' '.repeat(width - 2) + '│');

    for (const risk of data.risks) {
      lines.push(`│  ${chalk.yellow('⚠')} ${chalk.bold(risk.title)}`.padEnd(width + 5) + '│');
      lines.push(`│    ${risk.description}`.padEnd(width - 2) + '│');
      lines.push(`│    ${chalk.dim('Recommendation:')} ${risk.recommendation}`.padEnd(width - 2) + '│');
      lines.push('│' + ' '.repeat(width - 2) + '│');
    }
    lines.push(sectionEnd(width));
    lines.push('');
  }

  // Key Decisions Needed
  if (data.decisions.length > 0) {
    lines.push(section('KEY DECISIONS NEEDED', width));
    lines.push('│' + ' '.repeat(width - 2) + '│');
    data.decisions.forEach((decision, i) => {
      lines.push(`│  ${i + 1}. ${decision}`.padEnd(width - 2) + '│');
    });
    lines.push('│' + ' '.repeat(width - 2) + '│');
    lines.push(sectionEnd(width));
    lines.push('');
  }

  // Team Performance
  if (data.teamPerformance.leading.length > 0 || data.teamPerformance.needingSupport.length > 0) {
    const leadingPart = data.teamPerformance.leading.slice(0, 3).map(t =>
      `${chalk.green('🏆')} ${t.name}: ${t.alignment}%`
    ).join('   ');

    const supportPart = data.teamPerformance.needingSupport.slice(0, 3).map(t =>
      `${chalk.yellow('🔧')} ${t.name}: ${t.alignment}% (${t.reason})`
    ).join('   ');

    lines.push(`┌─ TEAMS LEADING ──────────────────┬─ TEAMS NEEDING SUPPORT ──────────────────┐`);
    lines.push(`│  ${leadingPart}`.padEnd(36) + `│  ${supportPart}`.padEnd(45) + '│');
    lines.push(`└──────────────────────────────────┴──────────────────────────────────────────┘`);
  }

  return lines.join('\n');
}

// ============================================================================
// Reality Mirror (Designer Report)
// ============================================================================

export function formatRealityMirror(data: RealityMirrorData): string {
  const lines: string[] = [];
  const width = 80;

  // Header
  lines.push('');
  lines.push(chalk.bold.yellow('╭' + '─'.repeat(width - 2) + '╮'));
  lines.push(chalk.bold.yellow('│') + '  ' + chalk.bold('REALITY MIRROR') + ' '.repeat(width - 42) + chalk.dim(data.designFile) + '  ' + chalk.bold.yellow('│'));
  lines.push(chalk.bold.yellow('│') + '  ' + chalk.dim('What you designed vs. what shipped') + ' '.repeat(width - 56) + chalk.dim(`Last sync: ${formatDate(data.lastSync)}`) + '  ' + chalk.bold.yellow('│'));
  lines.push(chalk.bold.yellow('╰' + '─'.repeat(width - 2) + '╯'));
  lines.push('');

  // Fidelity Score
  lines.push(section('FIDELITY SCORE', width));
  lines.push('│' + ' '.repeat(width - 2) + '│');

  const fidelityBar = progressBar(data.fidelityScore, 20);
  const fidelityColor = data.fidelityScore >= 90 ? chalk.green : data.fidelityScore >= 70 ? chalk.yellow : chalk.red;

  lines.push(`│     ${chalk.bold('YOUR DESIGN')}              ${chalk.bold('SHIPPED CODE')}              ${chalk.bold('MATCH')}         │`);
  lines.push(`│     ┌─────────────┐          ┌─────────────┐          ┌───────────┐   │`);
  lines.push(`│     │  ${chalk.green('▓▓▓▓▓▓▓▓▓')}  │    →     │  ${fidelityColor('▓▓▓▓▓' + '░'.repeat(4))}  │    =     │  ${fidelityColor.bold(data.fidelityScore + '%')}      │   │`);
  lines.push(`│     └─────────────┘          └─────────────┘          │  ${fidelityBar.slice(0, 10)}│   │`);
  lines.push(`│                                                       └───────────┘   │`);
  lines.push('│' + ' '.repeat(width - 2) + '│');

  if (data.fidelityScore === 100) {
    lines.push(`│     "${chalk.green('100% of your design intent made it to production unchanged. Perfect match!')}"`.padEnd(width - 2) + '│');
  } else {
    lines.push(`│     "${data.fidelityScore}% of your design intent made it to production unchanged."`.padEnd(width - 2) + '│');
  }
  lines.push('│' + ' '.repeat(width - 2) + '│');
  lines.push(sectionEnd(width));
  lines.push('');

  // What Changed
  if (data.changes.length > 0) {
    lines.push(section('WHAT CHANGED', width));
    lines.push('│' + ' '.repeat(width - 2) + '│');

    for (const change of data.changes) {
      lines.push(`│  ${chalk.bold(change.category)}`.padEnd(width + 5) + '│');
      lines.push(`│  ${'─'.repeat(width - 4)}`.padEnd(width - 2) + '│');
      lines.push(`│  Your value    →   Shipped as          Why it matters`.padEnd(width - 2) + '│');

      const designedColor = change.category === 'COLORS' ? chalk.bgHex(change.designed.replace('#', '')).black(' ') : '';
      const shippedColor = change.category === 'COLORS' ? chalk.bgHex(change.shipped.replace('#', '')).black(' ') : '';

      lines.push(`│  ${designedColor} ${change.designed}        ${shippedColor} ${change.shipped}        ${change.impact}`.padEnd(width + 10) + '│');
      lines.push('│' + ' '.repeat(width - 2) + '│');
    }
    lines.push(sectionEnd(width));
    lines.push('');
  }

  // Pattern Drift
  if (data.patternDrift.length > 0) {
    lines.push(section('PATTERN DRIFT', width));
    lines.push('│' + ' '.repeat(width - 2) + '│');
    lines.push(`│  ${chalk.bold('Component')}        ${chalk.bold('Your Intent')}              ${chalk.bold('Shipped')}`.padEnd(width - 2) + '│');
    lines.push(`│  ${'─'.repeat(width - 4)}`.padEnd(width - 2) + '│');

    for (const pattern of data.patternDrift) {
      lines.push(`│  ${chalk.bold(pattern.component)}`.padEnd(width + 5) + '│');
      lines.push(`│                   ${pattern.designedAs}`.padEnd(width - 2) + '│');
      lines.push(`│                   ${chalk.dim('→')} ${pattern.shippedAs}`.padEnd(width - 2) + '│');
      lines.push('│' + ' '.repeat(width - 2) + '│');
      lines.push(`│  ${chalk.dim('User Impact:')} ${pattern.userImpact}`.padEnd(width - 2) + '│');
      if (pattern.devNote) {
        lines.push(`│  ${chalk.dim('Dev Note:')} "${pattern.devNote.message}" - ${pattern.devNote.author}, ${pattern.devNote.date.toLocaleDateString()}`.padEnd(width - 2) + '│');
      }
      lines.push('│' + ' '.repeat(width - 2) + '│');
    }
    lines.push(sectionEnd(width));
    lines.push('');
  }

  // Start a Conversation
  if (data.conversations.length > 0) {
    lines.push(section('START A CONVERSATION', width));
    lines.push('│' + ' '.repeat(width - 2) + '│');
    lines.push(`│  These changes might be intentional improvements. Want to discuss?`.padEnd(width - 2) + '│');
    lines.push('│' + ' '.repeat(width - 2) + '│');
    lines.push(`│  ┌${'─'.repeat(width - 6)}┐ │`);

    for (const conv of data.conversations) {
      const icon = conv.action === 'discuss' ? '💬' : conv.action === 'accept' ? '✓' : '↩';
      const target = conv.target ? ` → ${conv.target}` : '';
      lines.push(`│  │  ${icon} "${conv.label}"${target}`.padEnd(width - 2) + '│ │');
    }

    lines.push(`│  └${'─'.repeat(width - 6)}┘ │`);
    lines.push('│' + ' '.repeat(width - 2) + '│');
    lines.push(sectionEnd(width));
  }

  return lines.join('\n');
}
