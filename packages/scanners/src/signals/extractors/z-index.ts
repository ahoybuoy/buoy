import type { RawSignal, SignalContext } from '../types.js';
import { createSignalId } from '../types.js';

const SKIP_VALUES = new Set(['auto', 'inherit', 'initial', 'unset', '0', '1']);

const COMMON_SCALE = new Set([10, 20, 30, 40, 50, 100, 200, 500, 1000]);

function isTokenReference(value: string): boolean {
  return (
    value.includes('var(--') ||
    value.includes('theme.') ||
    value.includes('tokens.') ||
    value.includes('$')
  );
}

export function extractZIndexSignals(
  value: string,
  path: string,
  line: number,
  context: SignalContext,
): RawSignal[] {
  if (isTokenReference(value)) return [];
  if (SKIP_VALUES.has(value)) return [];

  const numericValue = parseInt(value, 10);
  if (isNaN(numericValue)) return [];

  return [{
    id: createSignalId('z-index', path, line, value),
    type: 'z-index',
    value,
    location: { path, line },
    context,
    metadata: {
      numericValue,
      isMagicNumber: !COMMON_SCALE.has(Math.abs(numericValue)),
    },
  }];
}
