import { describe, it, expect } from 'vitest';
import { extractZIndexSignals } from './z-index.js';
import type { SignalContext } from '../types.js';

describe('extractZIndexSignals', () => {
  const ctx: SignalContext = {
    fileType: 'tsx',
    framework: 'react',
    scope: 'inline',
    isTokenized: false,
  };

  it('extracts numeric z-index', () => {
    const signals = extractZIndexSignals('999', 'Modal.tsx', 10, ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('z-index');
    expect(signals[0].value).toBe('999');
    expect(signals[0].metadata.numericValue).toBe(999);
  });

  it('extracts negative z-index', () => {
    const signals = extractZIndexSignals('-1', 'Behind.tsx', 5, ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.numericValue).toBe(-1);
  });

  it('skips auto', () => {
    expect(extractZIndexSignals('auto', 'Modal.tsx', 10, ctx)).toHaveLength(0);
  });

  it('skips token references', () => {
    expect(extractZIndexSignals('var(--z-modal)', 'Modal.tsx', 10, ctx)).toHaveLength(0);
  });

  it('skips 0 and 1 (common non-magic values)', () => {
    expect(extractZIndexSignals('0', 'Modal.tsx', 10, ctx)).toHaveLength(0);
    expect(extractZIndexSignals('1', 'Modal.tsx', 10, ctx)).toHaveLength(0);
  });

  it('flags large magic numbers', () => {
    const signals = extractZIndexSignals('9999', 'Modal.tsx', 10, ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.isMagicNumber).toBe(true);
  });
});
