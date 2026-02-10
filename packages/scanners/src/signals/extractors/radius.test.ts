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

  it('extracts percentage radius', () => {
    const signals = extractRadiusSignals('50%', 'Avatar.tsx', 5, 'borderRadius', ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.numericValue).toBe(50);
    expect(signals[0].metadata.unit).toBe('%');
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
