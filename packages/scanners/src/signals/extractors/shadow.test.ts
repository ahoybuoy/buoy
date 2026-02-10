import { describe, it, expect } from 'vitest';
import { extractShadowSignals } from './shadow.js';
import type { SignalContext } from '../types.js';

describe('extractShadowSignals', () => {
  const ctx: SignalContext = {
    fileType: 'css',
    framework: 'css',
    scope: 'inline',
    isTokenized: false,
  };

  it('extracts box-shadow', () => {
    const signals = extractShadowSignals(
      '0 2px 4px rgba(0,0,0,0.1)', 'Card.css', 10, 'boxShadow', ctx,
    );
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('shadow-value');
    expect(signals[0].metadata.shadowType).toBe('box');
    expect(signals[0].metadata.property).toBe('boxShadow');
  });

  it('extracts text-shadow', () => {
    const signals = extractShadowSignals(
      '1px 1px 2px black', 'Text.css', 5, 'textShadow', ctx,
    );
    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.shadowType).toBe('text');
  });

  it('extracts drop-shadow filter value', () => {
    const signals = extractShadowSignals(
      'drop-shadow(0 2px 4px rgba(0,0,0,0.25))', 'Card.css', 10, 'filter', ctx,
    );
    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.shadowType).toBe('drop');
  });

  it('skips none', () => {
    expect(extractShadowSignals('none', 'Card.css', 10, 'boxShadow', ctx)).toHaveLength(0);
  });

  it('skips token references', () => {
    expect(extractShadowSignals('var(--shadow-md)', 'Card.css', 10, 'boxShadow', ctx)).toHaveLength(0);
  });
});
