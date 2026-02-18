/**
 * Visual Feedback System
 *
 * Centralized visual primitives for CLI output, inspired by react-doctor.
 * Provides: highlighter, score bar, score gauge, buoy mascot, summary box,
 * severity icons, and separator.
 *
 * All functions are pure (return strings, no side effects).
 */

import chalk, { type ChalkInstance } from 'chalk';

// ============================================================================
// Highlighter (Semantic Color Palette)
// ============================================================================

export const highlight = {
  error: chalk.red,
  warn: chalk.yellow,
  info: chalk.cyan,
  success: chalk.green,
  dim: chalk.dim,
  brand: chalk.cyan.bold,
} as const;

// ============================================================================
// Score Thresholds
// ============================================================================

const SCORE_GOOD_THRESHOLD = 75;
const SCORE_ATTENTION_THRESHOLD = 50;

export interface ScoreThreshold {
  color: ChalkInstance;
  label: string;
  state: 'good' | 'attention' | 'critical';
}

export function getScoreThreshold(score: number): ScoreThreshold {
  if (score >= SCORE_GOOD_THRESHOLD) {
    return { color: highlight.success, label: 'Good', state: 'good' };
  }
  if (score >= SCORE_ATTENTION_THRESHOLD) {
    return { color: highlight.warn, label: 'Needs attention', state: 'attention' };
  }
  return { color: highlight.error, label: 'Critical', state: 'critical' };
}

export function colorizeByScore(text: string, score: number): string {
  const { color } = getScoreThreshold(score);
  return color(text);
}

// ============================================================================
// Score Bar
// ============================================================================

const SCORE_BAR_WIDTH = 50;

export function scoreBar(score: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const filled = Math.round((clamped / 100) * SCORE_BAR_WIDTH);
  const empty = SCORE_BAR_WIDTH - filled;
  const { color } = getScoreThreshold(clamped);
  return color('\u2588'.repeat(filled)) + highlight.dim('\u2591'.repeat(empty));
}

// ============================================================================
// Score Gauge
// ============================================================================

export function scoreGauge(score: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const { color, label } = getScoreThreshold(clamped);
  return `${color(String(clamped))} / 100  ${color(label)}`;
}

// ============================================================================
// Severity Icons
// ============================================================================

export const severityIcon = {
  critical: highlight.error('\u2717'),
  warning: highlight.warn('\u26A0'),
  info: highlight.success('\u2714'),
} as const;

export const driftSeverityIcon = {
  critical: highlight.error('\u2717'),
  warning: highlight.warn('\u26A0'),
  info: chalk.blue('i'),
} as const;

// ============================================================================
// Buoy ASCII Mascot
// ============================================================================

const BUOY_GOOD = [
  '     .         ',
  '    /_\\        ',
  '   / \u25E0 \\       ',
  '  |\u2500\u2500\u2500\u2500\u2500|      ',
  '  | BUOY|      ',
  '  |\u2500\u2500\u2500\u2500\u2500|      ',
  '~~~\\___/~~~~~~~',
  '~~~~~~~~~~~~~~~',
];

const BUOY_ATTENTION = [
  '        .      ',
  '       /_\\     ',
  '      / \u2022 \\    ',
  '     |\u2500\u2500\u2500\u2500\u2500|   ',
  '  ~~~| BUOY|   ',
  '~~/~~|\u2500\u2500\u2500\u2500\u2500|~~',
  '~~~~\\___/~~~~~~',
  '~~~~~~~~~~~~~~~',
];

const BUOY_CRITICAL = [
  '~~~~~~~~~~~~~~~',
  '~~~~~.~~~~~~~~~',
  '~~~~/\u2500\\~~~~~~~',
  '~~~/ x \\~~~~~~',
  '~~|\u2500\u2500\u2500\u2500\u2500|~~~~~',
  '~~| BUOY|~~~~~',
  '~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~',
];

export function buoyMascot(score: number): string {
  const { color, state } = getScoreThreshold(score);

  const mascots: Record<string, string[]> = {
    good: BUOY_GOOD,
    attention: BUOY_ATTENTION,
    critical: BUOY_CRITICAL,
  };

  const lines = mascots[state] ?? BUOY_GOOD;
  return lines.map(line => color(line)).join('\n');
}

// ============================================================================
// Framed Summary Box
// ============================================================================

const FRAME_WIDTH = 60;

export interface SummaryBoxData {
  score: number;
  components: number;
  tokens: number;
  drifts: { critical: number; warning: number; info: number; total: number };
  elapsed?: string;
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

function centerPad(text: string, width: number): string {
  const visibleLength = stripAnsi(text).length;
  const padding = Math.max(0, width - visibleLength);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
}

function frameLine(content: string, width: number = FRAME_WIDTH): string {
  const inner = width - 2; // account for border chars
  const visibleLen = stripAnsi(content).length;
  const rightPad = Math.max(0, inner - visibleLen);
  return highlight.dim('\u2502') + content + ' '.repeat(rightPad) + highlight.dim('\u2502');
}

function frameEmpty(width: number = FRAME_WIDTH): string {
  const inner = width - 2;
  return highlight.dim('\u2502') + ' '.repeat(inner) + highlight.dim('\u2502');
}

export function summaryBox(data: SummaryBoxData): string {
  const inner = FRAME_WIDTH - 2;
  const lines: string[] = [];

  // Top border
  lines.push(highlight.dim('\u250C' + '\u2500'.repeat(inner) + '\u2510'));

  // Mascot
  const mascotLines = buoyMascot(data.score).split('\n');
  for (const ml of mascotLines) {
    lines.push(frameLine(centerPad(ml, inner), FRAME_WIDTH));
  }

  // Blank
  lines.push(frameEmpty());

  // Branding
  lines.push(frameLine(centerPad(highlight.brand('BUOY'), inner), FRAME_WIDTH));
  lines.push(frameLine(centerPad(highlight.dim('Design Drift Detection'), inner), FRAME_WIDTH));

  // Blank
  lines.push(frameEmpty());

  // Score gauge
  lines.push(frameLine(centerPad(scoreGauge(data.score), inner), FRAME_WIDTH));

  // Blank
  lines.push(frameEmpty());

  // Score bar
  lines.push(frameLine(centerPad(scoreBar(data.score), inner), FRAME_WIDTH));

  // Blank
  lines.push(frameEmpty());

  // Summary stats
  const driftParts: string[] = [];
  if (data.drifts.critical > 0) {
    driftParts.push(`${driftSeverityIcon.critical} ${data.drifts.critical} errors`);
  }
  if (data.drifts.warning > 0) {
    driftParts.push(`${driftSeverityIcon.warning} ${data.drifts.warning} warnings`);
  }

  let statsLine: string;
  if (data.drifts.total > 0) {
    const driftStr = driftParts.join('  ');
    const suffix = data.elapsed ? `  in ${data.elapsed}` : '';
    statsLine = `${driftStr}  across ${data.components} components${suffix}`;
  } else {
    const suffix = data.elapsed ? `  in ${data.elapsed}` : '';
    statsLine = `${data.components} components  ${data.tokens} tokens${suffix}`;
  }
  lines.push(frameLine(centerPad(highlight.dim(statsLine), inner), FRAME_WIDTH));

  // Bottom border
  lines.push(highlight.dim('\u2514' + '\u2500'.repeat(inner) + '\u2518'));

  return lines.join('\n');
}

// ============================================================================
// Separator
// ============================================================================

export function separator(width: number = 40): string {
  return highlight.dim('\u2500'.repeat(width));
}
