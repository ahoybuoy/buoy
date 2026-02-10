import type { RawSignal, SignalContext } from '../types.js';
import { createSignalId } from '../types.js';

const RADIUS_PATTERN = /^(\d+\.?\d*)(px|rem|em|%|vw|vh)$/;

const SKIP_VALUES = new Set(['0', 'inherit', 'initial', 'unset', 'none']);

function isTokenReference(value: string): boolean {
  return (
    value.includes('var(--') ||
    value.includes('theme.') ||
    value.includes('tokens.') ||
    value.includes('$')
  );
}

export function extractRadiusSignals(
  value: string,
  path: string,
  line: number,
  property: string,
  context: SignalContext,
): RawSignal[] {
  if (isTokenReference(value)) return [];
  if (SKIP_VALUES.has(value)) return [];

  const match = value.match(RADIUS_PATTERN);
  if (!match) return [];

  const [, numStr, unit] = match;
  return [{
    id: createSignalId('radius-value', path, line, value),
    type: 'radius-value',
    value,
    location: { path, line },
    context,
    metadata: {
      numericValue: parseFloat(numStr!),
      unit,
      property,
    },
  }];
}
