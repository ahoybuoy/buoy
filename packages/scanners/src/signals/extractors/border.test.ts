import { describe, it, expect } from 'vitest';
import { extractBorderWidthSignals } from './border.js';
import type { SignalContext } from '../types.js';

describe('extractBorderWidthSignals', () => {
  const ctx: SignalContext = {
    fileType: 'tsx',
    framework: 'react',
    scope: 'inline',
    isTokenized: false,
  };

  it('extracts px border width', () => {
    const signals = extractBorderWidthSignals('1px', 'Card.tsx', 10, 'borderWidth', ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('border-width');
    expect(signals[0].value).toBe('1px');
    expect(signals[0].metadata.numericValue).toBe(1);
    expect(signals[0].metadata.unit).toBe('px');
  });

  it('extracts rem border width', () => {
    const signals = extractBorderWidthSignals('0.5rem', 'Card.tsx', 10, 'borderWidth', ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.unit).toBe('rem');
  });

  it('extracts named widths', () => {
    const signals = extractBorderWidthSignals('thin', 'Card.tsx', 10, 'borderWidth', ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.namedValue).toBe('thin');
  });

  it('extracts thick named width', () => {
    const signals = extractBorderWidthSignals('thick', 'Card.tsx', 10, 'borderWidth', ctx);
    expect(signals).toHaveLength(1);
  });

  it('skips token references', () => {
    expect(extractBorderWidthSignals('var(--border-width)', 'Card.tsx', 10, 'borderWidth', ctx)).toHaveLength(0);
    expect(extractBorderWidthSignals('$border-width', 'Card.tsx', 10, 'borderWidth', ctx)).toHaveLength(0);
  });

  it('skips special values', () => {
    expect(extractBorderWidthSignals('inherit', 'Card.tsx', 10, 'borderWidth', ctx)).toHaveLength(0);
    expect(extractBorderWidthSignals('0', 'Card.tsx', 10, 'borderWidth', ctx)).toHaveLength(0);
    expect(extractBorderWidthSignals('none', 'Card.tsx', 10, 'borderWidth', ctx)).toHaveLength(0);
  });

  it('includes property in metadata', () => {
    const signals = extractBorderWidthSignals('2px', 'Card.tsx', 10, 'borderTopWidth', ctx);
    expect(signals[0].metadata.property).toBe('borderTopWidth');
  });
});
