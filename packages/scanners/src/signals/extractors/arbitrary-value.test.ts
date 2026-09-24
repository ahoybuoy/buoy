import { describe, it, expect } from 'vitest';
import { extractArbitraryValueSignals } from './arbitrary-value.js';

describe('extractArbitraryValueSignals', () => {
  it('extracts Tailwind arbitrary values', () => {
    const content = `<div className="bg-[#ff0000] p-[13px] text-[18px]">`;
    const signals = extractArbitraryValueSignals(content, 'Card.tsx');
    expect(signals).toHaveLength(3);
    expect(signals[0].type).toBe('arbitrary-value');
  });

  it('extracts arbitrary values with utility prefix', () => {
    const content = `<div className="gap-[18px] rounded-[10px]">`;
    const signals = extractArbitraryValueSignals(content, 'Layout.tsx');
    expect(signals).toHaveLength(2);
    expect(signals[0].metadata.utility).toBe('gap');
    expect(signals[0].metadata.rawValue).toBe('18px');
  });

  it('ignores layout sizes, maths, mechanics and keywords (not design values)', () => {
    const content = `<div className="w-[200px] max-h-[600px] min-h-[100dvh] w-[calc(100%-2rem)] transition-[transform,opacity] rounded-[inherit] grid-cols-[1fr_2fr] data-[state=open]:bg-white">`;
    expect(extractArbitraryValueSignals(content, 'Layout.tsx')).toHaveLength(0);
  });

  it('skips icon, email, OG and test files entirely', () => {
    const content = `<div className="bg-[#ff0000] p-[13px]">`;
    for (const path of ['src/icons/Logo.tsx', 'emails/welcome.tsx', 'app/opengraph-image.tsx', 'src/Card.test.tsx']) {
      expect(extractArbitraryValueSignals(content, path), path).toHaveLength(0);
    }
  });

  it('extracts from class= (Vue/Svelte)', () => {
    const content = `<div class="mt-[24px] rounded-[8px]">`;
    const signals = extractArbitraryValueSignals(content, 'Card.vue');
    expect(signals).toHaveLength(2);
  });

  it('skips CSS custom property values inside brackets', () => {
    const content = `<div className="bg-[var(--primary)]">`;
    const signals = extractArbitraryValueSignals(content, 'Card.tsx');
    expect(signals).toHaveLength(0);
  });

  it('skips lines without arbitrary values', () => {
    const content = `<div className="bg-blue-500 p-4 text-lg">`;
    const signals = extractArbitraryValueSignals(content, 'Card.tsx');
    expect(signals).toHaveLength(0);
  });

  it('extracts from template literals', () => {
    const content = "const cls = `bg-[#333] text-[14px]`;";
    const signals = extractArbitraryValueSignals(content, 'utils.ts');
    expect(signals).toHaveLength(2);
  });
});
