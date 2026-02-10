import { describe, it, expect } from 'vitest';
import { extractSizingSignals } from './sizing.js';

describe('extractSizingSignals', () => {
  it('extracts width from CSS', () => {
    const content = `.card {\n  width: 300px;\n  height: 200px;\n}`;
    const signals = extractSizingSignals(content, 'card.css');
    expect(signals).toHaveLength(2);
    expect(signals[0].type).toBe('sizing-value');
    expect(signals[0].value).toBe('300px');
    expect(signals[0].metadata.property).toBe('width');
    expect(signals[0].metadata.numericValue).toBe(300);
  });

  it('extracts min/max dimensions', () => {
    const content = `.container {\n  max-width: 1200px;\n  min-height: 100vh;\n}`;
    const signals = extractSizingSignals(content, 'layout.css');
    expect(signals).toHaveLength(2);
    expect(signals.find(s => s.metadata.property === 'max-width')).toBeTruthy();
    expect(signals.find(s => s.metadata.property === 'min-height')).toBeTruthy();
  });

  it('skips token references', () => {
    const content = `.card { width: var(--card-width); }`;
    const signals = extractSizingSignals(content, 'card.css');
    expect(signals).toHaveLength(0);
  });

  it('skips lines with SCSS variables', () => {
    const content = `.card { width: $card-width; }`;
    const signals = extractSizingSignals(content, 'card.scss');
    expect(signals).toHaveLength(0);
  });

  it('extracts from JSX style objects', () => {
    const content = `const style = { width: '250px', maxHeight: '600px' };`;
    const signals = extractSizingSignals(content, 'Card.tsx');
    expect(signals).toHaveLength(2);
  });
});
