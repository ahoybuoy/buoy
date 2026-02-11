import type { RawSignal, SignalContext } from '../types.js';
import { createSignalId } from '../types.js';

// Duration pattern: 0.3s, 200ms, .5s
const DURATION_PATTERN = /^(\d*\.?\d+)(s|ms)$/;

// Named easing functions
const NAMED_EASINGS = new Set([
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'linear',
  'step-start',
  'step-end',
]);

// cubic-bezier(...)
const CUBIC_BEZIER_PATTERN = /^cubic-bezier\s*\(/;

// steps(...)
const STEPS_PATTERN = /^steps\s*\(/;

const SKIP_VALUES = new Set(['inherit', 'initial', 'unset', 'none', 'revert']);

function isTokenReference(value: string): boolean {
  return (
    value.includes('var(--') ||
    value.includes('theme.') ||
    value.includes('tokens.') ||
    value.includes('$')
  );
}

/**
 * Extract duration signals (transition-duration, animation-duration, etc.)
 */
export function extractDurationSignals(
  value: string,
  path: string,
  line: number,
  property: string,
  context: SignalContext,
): RawSignal[] {
  if (isTokenReference(value)) return [];
  if (SKIP_VALUES.has(value)) return [];

  const trimmed = value.trim();
  const match = trimmed.match(DURATION_PATTERN);
  if (!match) return [];

  const [, numStr, unit] = match;
  const ms = unit === 's' ? parseFloat(numStr!) * 1000 : parseFloat(numStr!);

  // Skip 0s/0ms — intentional instant
  if (ms === 0) return [];

  return [{
    id: createSignalId('motion-duration', path, line, value),
    type: 'motion-duration',
    value: trimmed,
    location: { path, line },
    context,
    metadata: {
      numericValue: parseFloat(numStr!),
      unit,
      milliseconds: ms,
      property,
    },
  }];
}

/**
 * Extract easing signals (transition-timing-function, animation-timing-function)
 */
export function extractEasingSignals(
  value: string,
  path: string,
  line: number,
  property: string,
  context: SignalContext,
): RawSignal[] {
  if (isTokenReference(value)) return [];
  if (SKIP_VALUES.has(value)) return [];

  const trimmed = value.trim();

  if (NAMED_EASINGS.has(trimmed)) {
    return [{
      id: createSignalId('motion-easing', path, line, value),
      type: 'motion-easing',
      value: trimmed,
      location: { path, line },
      context,
      metadata: { easingType: 'named', property },
    }];
  }

  if (CUBIC_BEZIER_PATTERN.test(trimmed)) {
    return [{
      id: createSignalId('motion-easing', path, line, value),
      type: 'motion-easing',
      value: trimmed,
      location: { path, line },
      context,
      metadata: { easingType: 'cubic-bezier', property },
    }];
  }

  if (STEPS_PATTERN.test(trimmed)) {
    return [{
      id: createSignalId('motion-easing', path, line, value),
      type: 'motion-easing',
      value: trimmed,
      location: { path, line },
      context,
      metadata: { easingType: 'steps', property },
    }];
  }

  return [];
}

/**
 * Extract signals from shorthand transition property.
 * e.g. "all 0.3s ease" or "opacity 200ms ease-in-out"
 */
export function extractTransitionShorthandSignals(
  value: string,
  path: string,
  line: number,
  context: SignalContext,
): RawSignal[] {
  if (isTokenReference(value)) return [];
  if (SKIP_VALUES.has(value)) return [];

  const signals: RawSignal[] = [];
  const trimmed = value.trim();

  // Split multiple transitions by comma, respecting parentheses
  const transitions: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of trimmed) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      transitions.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) transitions.push(current.trim());

  for (const transition of transitions) {
    const parts = transition.split(/\s+/);

    for (const part of parts) {
      // Check for duration
      const durMatch = part.match(DURATION_PATTERN);
      if (durMatch) {
        const [, numStr, unit] = durMatch;
        const ms = unit === 's' ? parseFloat(numStr!) * 1000 : parseFloat(numStr!);
        if (ms > 0) {
          signals.push({
            id: createSignalId('motion-duration', path, line, part),
            type: 'motion-duration',
            value: part,
            location: { path, line },
            context,
            metadata: {
              numericValue: parseFloat(numStr!),
              unit,
              milliseconds: ms,
              property: 'transition',
              fromShorthand: true,
            },
          });
        }
      }

      // Check for easing
      if (NAMED_EASINGS.has(part)) {
        signals.push({
          id: createSignalId('motion-easing', path, line, part),
          type: 'motion-easing',
          value: part,
          location: { path, line },
          context,
          metadata: {
            easingType: 'named',
            property: 'transition',
            fromShorthand: true,
          },
        });
      }
    }

    // Check for cubic-bezier in the full transition string
    const bezierMatch = transition.match(/(cubic-bezier\s*\([^)]+\))/);
    if (bezierMatch) {
      signals.push({
        id: createSignalId('motion-easing', path, line, bezierMatch[1]!),
        type: 'motion-easing',
        value: bezierMatch[1]!,
        location: { path, line },
        context,
        metadata: {
          easingType: 'cubic-bezier',
          property: 'transition',
          fromShorthand: true,
        },
      });
    }
  }

  return signals;
}
