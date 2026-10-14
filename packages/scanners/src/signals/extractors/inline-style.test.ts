import { describe, it, expect } from 'vitest';
import { extractInlineStyleSignals, onlyReferencesTokens } from './inline-style.js';

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

  it('leaves inline styles alone when every value references the design system', () => {
    const content = [
      `<p style={{ color: MP.neutral400 }}>`,
      `<div style={{ color: MP.navy500, borderColor: AUDIT.border }}>`,
      `<span style={{ background: theme.colors['gray-100'], padding: tokens?.space }}>`,
      `<div style={{ color: 'var(--color-text)', gap: 'var(--space-2)' }}>`,
      `<div style="color: var(--text); margin: var(--space-4);">`,
    ].join('\n');
    expect(extractInlineStyleSignals(content, 'Panel.tsx')).toHaveLength(0);
  });

  it('still flags an inline style that mixes references and literals', () => {
    const content = `<div style={{ color: MP.navy500, padding: '20px 32px', gap: 16 }}>`;
    expect(extractInlineStyleSignals(content, 'Panel.tsx')).toHaveLength(1);
  });
});

describe('onlyReferencesTokens', () => {
  it('treats identifiers and var() as references, literals as values', () => {
    expect(onlyReferencesTokens(' color: MP.neutral400 ', true)).toBe(true);
    expect(onlyReferencesTokens(" color: '#ff0000' ", true)).toBe(false);
    expect(onlyReferencesTokens(' gap: 14 ', true)).toBe(false);
    expect(onlyReferencesTokens(' display: grid ', true)).toBe(true); // an identifier in JSX is a variable
    expect(onlyReferencesTokens(' hidden: true ', true)).toBe(false);
    expect(onlyReferencesTokens(" gridTemplateColumns: 'repeat(2, 1fr)' ", true)).toBe(false);
    expect(onlyReferencesTokens('color: red', false)).toBe(false);
    expect(onlyReferencesTokens('color: var(--text)', false)).toBe(true);
    expect(onlyReferencesTokens("color: 'var(--text, #ff0000)'", true)).toBe(false); // literal fallback
    expect(onlyReferencesTokens('color: var(--text, #ff0000)', false)).toBe(false);
  });
});
