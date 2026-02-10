import type { RawSignal, SignalContext } from '../types.js';
import { createSignalId } from '../types.js';

const SKIP_VALUES = new Set(['none', 'inherit', 'initial', 'unset']);

const DROP_SHADOW_PATTERN = /^drop-shadow\s*\(/i;

function isTokenReference(value: string): boolean {
  return (
    value.includes('var(--') ||
    value.includes('theme.') ||
    value.includes('tokens.') ||
    value.includes('$')
  );
}

function getShadowType(property: string, value: string): string | null {
  if (property === 'boxShadow' || property === 'box-shadow') return 'box';
  if (property === 'textShadow' || property === 'text-shadow') return 'text';
  if (DROP_SHADOW_PATTERN.test(value)) return 'drop';
  if (/\d+\w*\s+\d+\w*/.test(value)) return 'box';
  return null;
}

export function extractShadowSignals(
  value: string,
  path: string,
  line: number,
  property: string,
  context: SignalContext,
): RawSignal[] {
  if (isTokenReference(value)) return [];
  if (SKIP_VALUES.has(value)) return [];

  const shadowType = getShadowType(property, value);
  if (!shadowType) return [];

  return [{
    id: createSignalId('shadow-value', path, line, value),
    type: 'shadow-value',
    value,
    location: { path, line },
    context,
    metadata: {
      shadowType,
      property,
    },
  }];
}
