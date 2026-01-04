import type { RawSignal, SignalContext } from '../types.js';
import { createSignalId } from '../types.js';

// Color detection patterns
const HEX_PATTERN = /^#[0-9a-fA-F]{3,8}$/;
const RGB_PATTERN = /^rgb\s*\(/i;
const RGBA_PATTERN = /^rgba\s*\(/i;
const HSL_PATTERN = /^hsl\s*\(/i;
const HSLA_PATTERN = /^hsla\s*\(/i;
const OKLCH_PATTERN = /^oklch\s*\(/i;

// Values to skip
const SKIP_VALUES = new Set([
  'inherit',
  'transparent',
  'currentColor',
  'initial',
  'unset',
  'none',
]);

/**
 * Detect the format of a color value
 */
function detectColorFormat(value: string): string | null {
  if (HEX_PATTERN.test(value)) return 'hex';
  if (RGBA_PATTERN.test(value)) return 'rgba';
  if (RGB_PATTERN.test(value)) return 'rgb';
  if (HSLA_PATTERN.test(value)) return 'hsla';
  if (HSL_PATTERN.test(value)) return 'hsl';
  if (OKLCH_PATTERN.test(value)) return 'oklch';
  return null;
}

/**
 * Check if value is a token reference (should be skipped)
 */
function isTokenReference(value: string): boolean {
  return (
    value.includes('var(--') ||
    value.includes('theme.') ||
    value.includes('tokens.') ||
    value.includes('$') // SCSS variable
  );
}

/**
 * Extract color signals from a value
 */
export function extractColorSignals(
  value: string,
  path: string,
  line: number,
  property: string,
  context: SignalContext,
): RawSignal[] {
  // Skip token references
  if (isTokenReference(value)) {
    return [];
  }

  // Skip special values
  if (SKIP_VALUES.has(value)) {
    return [];
  }

  // Detect format
  const format = detectColorFormat(value);
  if (!format) {
    return [];
  }

  const signal: RawSignal = {
    id: createSignalId('color-value', path, line, value),
    type: 'color-value',
    value,
    location: {
      path,
      line,
    },
    context,
    metadata: {
      format,
      property,
      hasAlpha: format === 'rgba' || format === 'hsla',
    },
  };

  return [signal];
}
