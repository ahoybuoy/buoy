import { describe, it, expect } from 'vitest';
import { extractInlineStyleSignals } from './inline-style.js';

describe('extractInlineStyleSignals', () => {
  it('extracts style= attributes in JSX', () => {
    const content = `<div style={{ color: '#ff0000', padding: '16px' }}>`;
    const signals = extractInlineStyleSignals(content, 'Banner.tsx');
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('inline-style');
    expect(signals[0].metadata.styleCount).toBe(2);
  });

  it('extracts HTML style attributes', () => {
    const content = `<div style="color: red; margin: 10px;">`;
    const signals = extractInlineStyleSignals(content, 'page.html');
    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.styleCount).toBe(2);
  });

  it('extracts multiple inline styles on different lines', () => {
    const content = `<div style={{ color: 'blue' }}>\n  <span style={{ fontSize: '14px' }}>text</span>\n</div>`;
    const signals = extractInlineStyleSignals(content, 'Text.tsx');
    expect(signals).toHaveLength(2);
  });

  it('skips lines without style attributes', () => {
    const content = `<div className="card"><p>Hello</p></div>`;
    const signals = extractInlineStyleSignals(content, 'Card.tsx');
    expect(signals).toHaveLength(0);
  });
});
