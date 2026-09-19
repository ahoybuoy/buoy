/**
 * Length values that are CSS idioms rather than design decisions.
 *
 * Flagging these produced most of the noise in real reviews: 1px hairline
 * borders, 0px resets, sub-pixel optical nudges, 50% circles, and 999px
 * pills. None of them belong in a token scale, so a review that asks for a
 * token is asking for the wrong thing.
 */

export type LengthKind = 'spacing' | 'radius' | 'border-width';

export function isIdiomaticLength(kind: LengthKind, numericValue: number, unit: string): boolean {
  if (!Number.isFinite(numericValue)) return false;
  // 0 in any unit is a reset, never a scale step.
  if (numericValue === 0) return true;

  if (unit === 'px') {
    // Sub-pixel values are optical nudges, and 1px is a hairline. Neither
    // is tokenized in any design system we have seen.
    if (numericValue <= 1) return true;
    // 999px / 9999px radius is the "pill" idiom.
    if (kind === 'radius' && numericValue >= 999) return true;
  }

  // 50% or more radius makes a circle or ellipse; that is geometry, not a token.
  if (kind === 'radius' && unit === '%' && numericValue >= 50) return true;

  return false;
}
