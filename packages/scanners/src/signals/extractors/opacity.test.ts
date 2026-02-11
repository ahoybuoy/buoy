import { describe, it, expect } from 'vitest';
import { extractOpacitySignals } from './opacity.js';
import type { SignalContext } from '../types.js';

describe('extractOpacitySignals', () => {
  const ctx: SignalContext = {
    fileType: 'tsx',
    framework: 'react',
    scope: 'inline',
    isTokenized: false,
  };

  it('extracts decimal opacity', () => {
    const signals = extractOpacitySignals('0.5', 'Card.tsx', 10, ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('opacity-value');
    expect(signals[0].value).toBe('0.5');
    expect(signals[0].metadata.numericValue).toBe(0.5);
  });

  it('extracts percentage opacity', () => {
    const signals = extractOpacitySignals('50%', 'Card.tsx', 10, ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.numericValue).toBe(0.5);
  });

  it('skips 0 and 1 (intentional values)', () => {
    expect(extractOpacitySignals('0', 'Card.tsx', 10, ctx)).toHaveLength(0);
    expect(extractOpacitySignals('1', 'Card.tsx', 10, ctx)).toHaveLength(0);
  });

  it('skips token references', () => {
    expect(extractOpacitySignals('var(--opacity-50)', 'Card.tsx', 10, ctx)).toHaveLength(0);
    expect(extractOpacitySignals('theme.opacity.muted', 'Card.tsx', 10, ctx)).toHaveLength(0);
  });

  it('skips special values', () => {
    expect(extractOpacitySignals('inherit', 'Card.tsx', 10, ctx)).toHaveLength(0);
    expect(extractOpacitySignals('initial', 'Card.tsx', 10, ctx)).toHaveLength(0);
  });

  it('skips values out of range', () => {
    expect(extractOpacitySignals('1.5', 'Card.tsx', 10, ctx)).toHaveLength(0);
    expect(extractOpacitySignals('200%', 'Card.tsx', 10, ctx)).toHaveLength(0);
  });

  it('extracts various decimal values', () => {
    expect(extractOpacitySignals('0.3', 'A.tsx', 1, ctx)).toHaveLength(1);
    expect(extractOpacitySignals('0.75', 'A.tsx', 1, ctx)).toHaveLength(1);
    expect(extractOpacitySignals('0.1', 'A.tsx', 1, ctx)).toHaveLength(1);
  });
});
