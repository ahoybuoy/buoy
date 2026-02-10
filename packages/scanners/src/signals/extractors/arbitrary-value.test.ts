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
    const content = `<div className="w-[200px] max-h-[600px]">`;
    const signals = extractArbitraryValueSignals(content, 'Layout.tsx');
    expect(signals).toHaveLength(2);
    expect(signals[0].metadata.utility).toBe('w');
    expect(signals[0].metadata.rawValue).toBe('200px');
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
