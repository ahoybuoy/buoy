import type { RawSignal, SignalContext } from '../types.js';
import { createSignalId } from '../types.js';

const BORDER_WIDTH_PATTERN = /^(\d+\.?\d*)(px|rem|em)$/;

const NAMED_WIDTHS = new Set(['thin', 'medium', 'thick']);

const SKIP_VALUES = new Set(['0', 'inherit', 'initial', 'unset', 'none']);

function isTokenReference(value: string): boolean {
  return (
    value.includes('var(--') ||
    value.includes('theme.') ||
    value.includes('tokens.') ||
    value.includes('$')
  );
}

export function extractBorderWidthSignals(
  value: string,
  path: string,
  line: number,
  property: string,
  context: SignalContext,
): RawSignal[] {
  if (isTokenReference(value)) return [];
  if (SKIP_VALUES.has(value)) return [];

  const trimmed = value.trim();

  // Named width: thin, medium, thick
  if (NAMED_WIDTHS.has(trimmed)) {
    return [{
      id: createSignalId('border-width', path, line, value),
      type: 'border-width',
      value: trimmed,
      location: { path, line },
      context,
      metadata: { namedValue: trimmed, property },
    }];
  }

  // Numeric width: 1px, 2px, 0.5rem
  const match = trimmed.match(BORDER_WIDTH_PATTERN);
  if (!match) return [];

  const [, numStr, unit] = match;
  return [{
    id: createSignalId('border-width', path, line, value),
    type: 'border-width',
    value: trimmed,
    location: { path, line },
    context,
    metadata: {
      numericValue: parseFloat(numStr!),
      unit,
      property,
    },
  }];
}
