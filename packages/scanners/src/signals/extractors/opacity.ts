import type { RawSignal, SignalContext } from '../types.js';
import { createSignalId } from '../types.js';

const SKIP_VALUES = new Set(['inherit', 'initial', 'unset', 'revert']);

function isTokenReference(value: string): boolean {
  return (
    value.includes('var(--') ||
    value.includes('theme.') ||
    value.includes('tokens.') ||
    value.includes('$')
  );
}

export function extractOpacitySignals(
  value: string,
  path: string,
  line: number,
  context: SignalContext,
): RawSignal[] {
  if (isTokenReference(value)) return [];
  if (SKIP_VALUES.has(value)) return [];

  const trimmed = value.trim();

  // Percentage form: 50%, 100%
  const pctMatch = trimmed.match(/^(\d+\.?\d*)%$/);
  if (pctMatch) {
    const pct = parseFloat(pctMatch[1]!);
    if (pct < 0 || pct > 100) return [];
    return [{
      id: createSignalId('opacity-value', path, line, value),
      type: 'opacity-value',
      value: trimmed,
      location: { path, line },
      context,
      metadata: { numericValue: pct / 100, raw: trimmed },
    }];
  }

  // Decimal form: 0, 0.5, 1
  const numMatch = trimmed.match(/^(\d+\.?\d*)$/);
  if (!numMatch) return [];

  const num = parseFloat(numMatch[1]!);
  if (num < 0 || num > 1) return [];

  // Skip 0 and 1 — these are intentional, not drift
  if (num === 0 || num === 1) return [];

  return [{
    id: createSignalId('opacity-value', path, line, value),
    type: 'opacity-value',
    value: trimmed,
    location: { path, line },
    context,
    metadata: { numericValue: num, raw: trimmed },
  }];
}
