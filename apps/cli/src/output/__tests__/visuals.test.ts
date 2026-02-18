import { describe, it, expect } from 'vitest';
import {
  getScoreThreshold,
  scoreBar,
  scoreGauge,
  buoyMascot,
  summaryBox,
  separator,
  colorizeByScore,
  severityIcon,
  driftSeverityIcon,
} from '../visuals.js';

// Strip ANSI escape codes for content assertions
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

describe('getScoreThreshold', () => {
  it('returns good for score >= 75', () => {
    const result = getScoreThreshold(80);
    expect(result.state).toBe('good');
    expect(result.label).toBe('Good');
  });

  it('returns attention for score 50-74', () => {
    const result = getScoreThreshold(60);
    expect(result.state).toBe('attention');
    expect(result.label).toBe('Needs attention');
  });

  it('returns critical for score < 50', () => {
    const result = getScoreThreshold(30);
    expect(result.state).toBe('critical');
    expect(result.label).toBe('Critical');
  });

  it('handles boundary at 75', () => {
    expect(getScoreThreshold(75).state).toBe('good');
    expect(getScoreThreshold(74).state).toBe('attention');
  });

  it('handles boundary at 50', () => {
    expect(getScoreThreshold(50).state).toBe('attention');
    expect(getScoreThreshold(49).state).toBe('critical');
  });

  it('handles 0', () => {
    expect(getScoreThreshold(0).state).toBe('critical');
  });

  it('handles 100', () => {
    expect(getScoreThreshold(100).state).toBe('good');
  });
});

describe('colorizeByScore', () => {
  it('returns a string', () => {
    expect(typeof colorizeByScore('test', 80)).toBe('string');
  });

  it('preserves text content', () => {
    expect(stripAnsi(colorizeByScore('hello', 80))).toBe('hello');
  });
});

describe('scoreBar', () => {
  it('returns 50-char wide bar', () => {
    const result = stripAnsi(scoreBar(50));
    expect(result).toHaveLength(50);
  });

  it('shows full bar at 100', () => {
    const result = stripAnsi(scoreBar(100));
    expect(result).toBe('\u2588'.repeat(50));
  });

  it('shows empty bar at 0', () => {
    const result = stripAnsi(scoreBar(0));
    expect(result).toBe('\u2591'.repeat(50));
  });

  it('clamps values above 100', () => {
    const result = stripAnsi(scoreBar(150));
    expect(result).toBe('\u2588'.repeat(50));
  });

  it('clamps values below 0', () => {
    const result = stripAnsi(scoreBar(-10));
    expect(result).toBe('\u2591'.repeat(50));
  });

  it('shows proportional fill at 50%', () => {
    const result = stripAnsi(scoreBar(50));
    const filled = (result.match(/\u2588/g) || []).length;
    const empty = (result.match(/\u2591/g) || []).length;
    expect(filled).toBe(25);
    expect(empty).toBe(25);
  });
});

describe('scoreGauge', () => {
  it('shows score / 100 with label', () => {
    const result = stripAnsi(scoreGauge(80));
    expect(result).toContain('80');
    expect(result).toContain('/ 100');
    expect(result).toContain('Good');
  });

  it('shows attention label for mid score', () => {
    const result = stripAnsi(scoreGauge(60));
    expect(result).toContain('Needs attention');
  });

  it('shows critical label for low score', () => {
    const result = stripAnsi(scoreGauge(30));
    expect(result).toContain('Critical');
  });

  it('clamps score above 100', () => {
    const result = stripAnsi(scoreGauge(150));
    expect(result).toContain('100');
  });
});

describe('severityIcon', () => {
  it('has critical icon', () => {
    expect(stripAnsi(severityIcon.critical)).toBe('\u2717');
  });

  it('has warning icon', () => {
    expect(stripAnsi(severityIcon.warning)).toBe('\u26A0');
  });

  it('has info icon', () => {
    expect(stripAnsi(severityIcon.info)).toBe('\u2714');
  });
});

describe('driftSeverityIcon', () => {
  it('has critical icon', () => {
    expect(stripAnsi(driftSeverityIcon.critical)).toBe('\u2717');
  });

  it('has warning icon', () => {
    expect(stripAnsi(driftSeverityIcon.warning)).toBe('\u26A0');
  });

  it('has info icon', () => {
    expect(stripAnsi(driftSeverityIcon.info)).toBe('i');
  });
});

describe('buoyMascot', () => {
  it('shows floating buoy for good score', () => {
    const result = stripAnsi(buoyMascot(80));
    expect(result).toContain('BUOY');
    expect(result).toContain('\u25E0');
  });

  it('shows tilting buoy for attention score', () => {
    const result = stripAnsi(buoyMascot(60));
    expect(result).toContain('BUOY');
    expect(result).toContain('\u2022');
  });

  it('shows sinking buoy for critical score', () => {
    const result = stripAnsi(buoyMascot(30));
    expect(result).toContain('BUOY');
    expect(result).toContain('x');
  });

  it('has multiple lines', () => {
    const result = buoyMascot(80);
    const lineCount = result.split('\n').length;
    expect(lineCount).toBeGreaterThanOrEqual(6);
  });
});

describe('summaryBox', () => {
  const sampleData = {
    score: 80,
    components: 10,
    tokens: 50,
    drifts: { critical: 0, warning: 1, info: 2, total: 3 },
  };

  it('contains box-drawing characters', () => {
    const result = stripAnsi(summaryBox(sampleData));
    expect(result).toContain('\u250C');
    expect(result).toContain('\u2518');
    expect(result).toContain('\u2502');
  });

  it('contains score', () => {
    const result = stripAnsi(summaryBox(sampleData));
    expect(result).toContain('80');
    expect(result).toContain('100');
  });

  it('contains BUOY branding', () => {
    const result = stripAnsi(summaryBox(sampleData));
    expect(result).toContain('BUOY');
    expect(result).toContain('Design Drift Detection');
  });

  it('contains mascot', () => {
    const result = stripAnsi(summaryBox(sampleData));
    // The mascot contains BUOY text too
    const lines = result.split('\n');
    // Should have mascot lines with wave patterns
    expect(lines.some(l => l.includes('~'))).toBe(true);
  });

  it('shows drift stats when drifts exist', () => {
    const result = stripAnsi(summaryBox(sampleData));
    expect(result).toContain('warnings');
  });

  it('shows component/token counts when no drifts', () => {
    const noDriftData = {
      score: 95,
      components: 10,
      tokens: 50,
      drifts: { critical: 0, warning: 0, info: 0, total: 0 },
    };
    const result = stripAnsi(summaryBox(noDriftData));
    expect(result).toContain('10 components');
    expect(result).toContain('50 tokens');
  });

  it('includes elapsed time when provided', () => {
    const withElapsed = { ...sampleData, elapsed: '2.1s' };
    const result = stripAnsi(summaryBox(withElapsed));
    expect(result).toContain('2.1s');
  });
});

describe('separator', () => {
  it('returns correct default width', () => {
    expect(stripAnsi(separator())).toHaveLength(40);
  });

  it('returns correct custom width', () => {
    expect(stripAnsi(separator(60))).toHaveLength(60);
  });

  it('uses dash character', () => {
    const result = stripAnsi(separator(10));
    expect(result).toBe('\u2500'.repeat(10));
  });
});
