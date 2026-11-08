/**
 * The Tailwind class that gives exactly the same value as an arbitrary class:
 * `pt-[4px]` is `pt-1`, `rounded-[8px]` is `rounded-lg`, `font-[500]` is
 * `font-medium`, `text-[#6b7280]` is `text-gray-500`.
 *
 * Only values that mean the same in Tailwind v3 and v4 are mapped (v4 renamed
 * the small radii, so 2px/4px radii get no answer). Anything without an exact
 * match returns null: a near value is a different design, so no guess.
 */
import { parseArbitraryClass } from '@buoy-design/core';

/** Tailwind's default palette (v3 hex; v4's OKLCH steps are within ΔE ~2). */
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const FAMILIES: Record<string, string[]> = {
  slate: ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a', '#020617'],
  gray: ['#f9fafb', '#f3f4f6', '#e5e7eb', '#d1d5db', '#9ca3af', '#6b7280', '#4b5563', '#374151', '#1f2937', '#111827', '#030712'],
  zinc: ['#fafafa', '#f4f4f5', '#e4e4e7', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#3f3f46', '#27272a', '#18181b', '#09090b'],
  neutral: ['#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4', '#a3a3a3', '#737373', '#525252', '#404040', '#262626', '#171717', '#0a0a0a'],
  stone: ['#fafaf9', '#f5f5f4', '#e7e5e4', '#d6d3d1', '#a8a29e', '#78716c', '#57534e', '#44403c', '#292524', '#1c1917', '#0c0a09'],
  red: ['#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#450a0a'],
  orange: ['#fff7ed', '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#431407'],
  amber: ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#451a03'],
  yellow: ['#fefce8', '#fef9c3', '#fef08a', '#fde047', '#facc15', '#eab308', '#ca8a04', '#a16207', '#854d0e', '#713f12', '#422006'],
  lime: ['#f7fee7', '#ecfccb', '#d9f99d', '#bef264', '#a3e635', '#84cc16', '#65a30d', '#4d7c0f', '#3f6212', '#365314', '#1a2e05'],
  green: ['#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534', '#14532d', '#052e16'],
  emerald: ['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b', '#022c22'],
  teal: ['#f0fdfa', '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59', '#134e4a', '#042f2e'],
  cyan: ['#ecfeff', '#cffafe', '#a5f3fc', '#67e8f9', '#22d3ee', '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63', '#083344'],
  sky: ['#f0f9ff', '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985', '#0c4a6e', '#082f49'],
  blue: ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554'],
  indigo: ['#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81', '#1e1b4b'],
  violet: ['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#2e1065'],
  purple: ['#faf5ff', '#f3e8ff', '#e9d5ff', '#d8b4fe', '#c084fc', '#a855f7', '#9333ea', '#7e22ce', '#6b21a8', '#581c87', '#3b0764'],
  fuchsia: ['#fdf4ff', '#fae8ff', '#f5d0fe', '#f0abfc', '#e879f9', '#d946ef', '#c026d3', '#a21caf', '#86198f', '#701a75', '#4a044e'],
  pink: ['#fdf2f8', '#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899', '#db2777', '#be185d', '#9d174d', '#831843', '#500724'],
  rose: ['#fff1f2', '#ffe4e6', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c', '#9f1239', '#881337', '#4c0519'],
};

/** hex -> palette name (first family wins for shared greys: zinc/neutral #fafafa). */
const DEFAULT_PALETTE = new Map<string, string>([['#ffffff', 'white'], ['#000000', 'black']]);
for (const [family, hexes] of Object.entries(FAMILIES)) {
  hexes.forEach((hex, i) => {
    if (!DEFAULT_PALETTE.has(hex)) DEFAULT_PALETTE.set(hex, `${family}-${SHADES[i]}`);
  });
}

const COLOR_UTILITIES = /^(text|bg|border(-[xytrbl])?|ring|ring-offset|outline|divide|fill|stroke|from|via|to|decoration|accent|caret|placeholder|shadow)$/;
const SPACING_UTILITIES = /^(p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|right|bottom|left|start|end|w|h|size|scroll-m[xytrbl]?|scroll-p[xytrbl]?)$/;

/** The v3 spacing scale (in 0.25rem units); every step also exists in v4. */
const SPACING_STEPS = new Set([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96]);

const FONT_SIZES: Record<number, string> = { 12: 'xs', 14: 'sm', 16: 'base', 18: 'lg', 20: 'xl', 24: '2xl', 30: '3xl', 36: '4xl', 48: '5xl', 60: '6xl', 72: '7xl', 96: '8xl', 128: '9xl' };
/** Radii named the same in v3 and v4 (v4 shifted xs/sm/DEFAULT). */
const RADII: Record<number, string> = { 0: 'none', 6: 'md', 8: 'lg', 12: 'xl', 16: '2xl', 24: '3xl' };
const LEADING_RATIOS: Record<string, string> = { '1': 'none', '1.25': 'tight', '1.375': 'snug', '1.5': 'normal', '1.625': 'relaxed', '2': 'loose' };
const TRACKING: Record<string, string> = { '-0.05em': 'tighter', '-0.025em': 'tight', '0em': 'normal', '0': 'normal', '0.025em': 'wide', '0.05em': 'wider', '0.1em': 'widest' };
const WEIGHTS: Record<string, string> = { '100': 'thin', '200': 'extralight', '300': 'light', '400': 'normal', '500': 'medium', '600': 'semibold', '700': 'bold', '800': 'extrabold', '900': 'black' };

export interface ExactClassOptions {
  /** The project's own theme colours: hex -> class suffix (`brown-500`). Checked before the default palette. */
  themeColors?: Map<string, string>;
  /** The project's theme sizes in px -> class suffix, per scale. Checked before the defaults. */
  themeSizes?: ThemeSizes;
}

export interface ThemeSizes {
  text: Map<number, string>;
  spacing: Map<number, string>;
  radius: Map<number, string>;
}

/** `#FFF` -> `#ffffff`; anything else -> null. */
export function normalizeHexColor(value: string): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  const h = m[1]!.toLowerCase();
  return `#${h.length === 3 ? h.split('').map((c) => c + c).join('') : h}`;
}

/** `4px` -> 4, `0.25rem` -> 4 (16px root); other units -> null. */
function toPx(value: string): number | null {
  const m = /^(-?\d*\.?\d+)(px|rem)?$/.exec(value.trim());
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (!m[2]) return n === 0 ? 0 : null;
  return m[2] === 'rem' ? n * 16 : n;
}

function fmt(n: number): string {
  return String(Number(n.toFixed(4)));
}

/**
 * The exact scale class for an arbitrary class, keeping its variants
 * (`md:hover:`), `!important` and a negative sign. Null when there is none.
 */
export function exactTailwindClass(fullClass: string, options: ExactClassOptions = {}): string | null {
  const prefix = /^(?:(?:[^[\]:]|\[[^\]]*\])*:)*/.exec(fullClass)![0];
  let tail = fullClass.slice(prefix.length);
  // !important: v3 writes it first (!mb-4), v4 last (mb-4!).
  const important = tail.startsWith('!') ? '!' : '';
  if (important) tail = tail.slice(1);
  const importantAfter = !important && tail.endsWith('!') ? '!' : '';
  if (importantAfter) tail = tail.slice(0, -1);
  const parsed = parseArbitraryClass(tail);
  if (!parsed) return null;
  const negative = tail.startsWith('-') ? '-' : '';
  // An opacity modifier (bg-[#fff]/50) keeps its suffix.
  const modifier = /\](\/[\w.[\]]+)$/.exec(tail)?.[1] ?? '';
  const { utility } = parsed;
  const value = parsed.value.replace(/^(color|length|size|number|percentage):/, '');
  const sizes = options.themeSizes;
  const build = (suffix: string) =>
    `${prefix}${important}${negative}${utility}${suffix === 'DEFAULT' ? '' : `-${suffix}`}${modifier}${importantAfter}`;

  const hex = normalizeHexColor(value);
  if (hex) {
    if (!COLOR_UTILITIES.test(utility)) return null;
    const name = options.themeColors?.get(hex) ?? DEFAULT_PALETTE.get(hex);
    return name ? build(name) : null;
  }
  if (modifier) return null;

  if (utility === 'text') {
    const px = toPx(value);
    if (px === null) return null;
    const own = sizes?.text.get(px);
    if (own) return build(own);
    return FONT_SIZES[px] ? build(FONT_SIZES[px]!) : null;
  }
  if (utility === 'font') {
    return WEIGHTS[value] ? build(WEIGHTS[value]!) : null;
  }
  if (utility === 'tracking') {
    return TRACKING[value] ? build(TRACKING[value]!) : null;
  }
  if (utility === 'leading') {
    if (LEADING_RATIOS[value]) return build(LEADING_RATIOS[value]!);
    const px = toPx(value);
    // leading-3 .. leading-10 are 0.75rem .. 2.5rem in both versions.
    if (px !== null && px >= 12 && px <= 40 && px % 4 === 0) return build(fmt(px / 4));
    return null;
  }
  if (/^rounded/.test(utility)) {
    if (value === '9999px') return build('full');
    const px = toPx(value);
    if (px === null) return null;
    const own = sizes?.radius.get(px);
    if (own) return build(own);
    return RADII[px] !== undefined ? build(RADII[px]!) : null;
  }
  if (SPACING_UTILITIES.test(utility)) {
    const px = toPx(value);
    if (px === null) return null;
    const own = sizes?.spacing.get(px);
    if (own) return build(own);
    if (px === 1) return build('px');
    const step = px / 4;
    return SPACING_STEPS.has(step) ? build(fmt(step)) : null;
  }
  return null;
}

/** Theme colour map from Tailwind config tokens (`brown.500` -> `brown-500`, `DEFAULT` dropped). */
export function themeColorMap(tokens: Array<{ name: string; category?: string; value: { type: string; hex?: string } }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of tokens) {
    if (t.category !== 'color' || t.value.type !== 'color' || !t.value.hex) continue;
    if (/-dark$/.test(t.name)) continue;
    const hex = normalizeHexColor(t.value.hex);
    if (!hex || map.has(hex)) continue;
    // Config-parser tokens are `tw-brown-500`; token-scanner ones `brown.500`.
    map.set(hex, t.name.replace(/^tw-/, '').replace(/\.DEFAULT$/, '').replace(/\./g, '-'));
  }
  return map;
}

/**
 * Theme size scales from Tailwind config tokens (`tw-text-2xs` 0.625rem,
 * `tw-spacing-18`, `tw-radius-DEFAULT`), as px -> class suffix.
 */
export function themeSizeMap(tokens: Array<{ name: string; value: { type: string; value?: unknown; unit?: string } }>): ThemeSizes {
  const out: ThemeSizes = { text: new Map(), spacing: new Map(), radius: new Map() };
  for (const t of tokens) {
    const m = /^tw-(text|spacing|radius)-([\w.\/-]+)$/.exec(t.name);
    if (!m || m[2]!.includes('--') || (m[2] !== 'DEFAULT' && /[A-Z]/.test(m[2]!))) continue;
    let raw: string | null = null;
    if (t.value.type === 'spacing' && typeof t.value.value === 'number') raw = `${t.value.value}${t.value.unit ?? 'px'}`;
    else if (typeof t.value.value === 'string') raw = t.value.value.split(/[\s,[]/)[0] ?? null;
    const px = raw ? toPx(raw) : null;
    if (px === null) continue;
    const map = out[m[1] as keyof ThemeSizes];
    if (!map.has(px)) map.set(px, m[2]!);
  }
  return out;
}
