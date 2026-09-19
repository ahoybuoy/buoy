import { describe, it, expect } from 'vitest';
import { extractRadiusSignals } from './radius.js';
import type { SignalContext } from '../types.js';

describe('extractRadiusSignals', () => {
  const ctx: SignalContext = {
    fileType: 'tsx',
    framework: 'react',
    scope: 'inline',
    isTokenized: false,
  };

  it('extracts px radius', () => {
    const signals = extractRadiusSignals('8px', 'Card.tsx', 10, 'borderRadius', ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('radius-value');
    expect(signals[0].value).toBe('8px');
    expect(signals[0].metadata.numericValue).toBe(8);
    expect(signals[0].metadata.unit).toBe('px');
  });

  it('extracts rem radius', () => {
    const signals = extractRadiusSignals('0.5rem', 'Card.tsx', 10, 'borderRadius', ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.unit).toBe('rem');
  });

  it('extracts percentage radius below the circle threshold', () => {
    const signals = extractRadiusSignals('25%', 'Avatar.tsx', 5, 'borderRadius', ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.numericValue).toBe(25);
    expect(signals[0].metadata.unit).toBe('%');
  });

  it('skips idioms: circles, pills, hairlines, and zero', () => {
    for (const v of ['50%', '100%', '999px', '9999px', '1px', '0.5px', '0px']) {
      expect(extractRadiusSignals(v, 'Avatar.tsx', 5, 'borderRadius', ctx), v).toHaveLength(0);
    }
    expect(extractRadiusSignals('2px', 'Card.tsx', 5, 'borderRadius', ctx)).toHaveLength(1);
  });

  it('skips token references', () => {
    expect(extractRadiusSignals('var(--radius-md)', 'Card.tsx', 10, 'borderRadius', ctx)).toHaveLength(0);
    expect(extractRadiusSignals('theme.radius.md', 'Card.tsx', 10, 'borderRadius', ctx)).toHaveLength(0);
  });

  it('skips special values', () => {
    expect(extractRadiusSignals('inherit', 'Card.tsx', 10, 'borderRadius', ctx)).toHaveLength(0);
    expect(extractRadiusSignals('0', 'Card.tsx', 10, 'borderRadius', ctx)).toHaveLength(0);
  });

  it('includes property in metadata', () => {
    const signals = extractRadiusSignals('4px', 'Card.tsx', 10, 'borderTopLeftRadius', ctx);
    expect(signals[0].metadata.property).toBe('borderTopLeftRadius');
  });
});
