import { describe, it, expect } from 'vitest';
import { isIdiomaticLength } from './idioms.js';
import { extractBorderWidthSignals } from './border.js';
import { extractSpacingSignals } from './spacing.js';
import type { SignalContext } from '../types.js';

const ctx: SignalContext = { fileType: 'tsx', framework: 'react', scope: 'inline', isTokenized: false };

describe('isIdiomaticLength', () => {
  it('treats zero, sub-pixel, and 1px as idioms for every kind', () => {
    for (const kind of ['spacing', 'radius', 'border-width'] as const) {
      expect(isIdiomaticLength(kind, 0, 'px')).toBe(true);
      expect(isIdiomaticLength(kind, 0, 'rem')).toBe(true);
      expect(isIdiomaticLength(kind, 0.5, 'px')).toBe(true);
      expect(isIdiomaticLength(kind, 1, 'px')).toBe(true);
      expect(isIdiomaticLength(kind, 2, 'px')).toBe(false);
      expect(isIdiomaticLength(kind, 0.25, 'rem')).toBe(false);
    }
  });

  it('treats circles and pills as radius idioms only', () => {
    expect(isIdiomaticLength('radius', 50, '%')).toBe(true);
    expect(isIdiomaticLength('radius', 999, 'px')).toBe(true);
    expect(isIdiomaticLength('spacing', 50, '%')).toBe(false);
    expect(isIdiomaticLength('border-width', 999, 'px')).toBe(false);
  });
});

describe('extractors skip idioms', () => {
  it('border: 1px hairline is not drift, 2px is', () => {
    expect(extractBorderWidthSignals('1px', 'A.tsx', 1, 'borderWidth', ctx)).toHaveLength(0);
    expect(extractBorderWidthSignals('0px', 'A.tsx', 1, 'borderWidth', ctx)).toHaveLength(0);
    expect(extractBorderWidthSignals('2px', 'A.tsx', 1, 'borderWidth', ctx)).toHaveLength(1);
  });

  it('spacing: 0px, 1px, and 0.75px nudges are not drift, 16px is', () => {
    expect(extractSpacingSignals('0px', 'A.tsx', 1, 'padding', ctx)).toHaveLength(0);
    expect(extractSpacingSignals('1px', 'A.tsx', 1, 'marginTop', ctx)).toHaveLength(0);
    expect(extractSpacingSignals('-1px', 'A.tsx', 1, 'marginTop', ctx)).toHaveLength(0);
    expect(extractSpacingSignals('0.75px', 'A.tsx', 1, 'gap', ctx)).toHaveLength(0);
    expect(extractSpacingSignals('16px', 'A.tsx', 1, 'padding', ctx)).toHaveLength(1);
  });
});
