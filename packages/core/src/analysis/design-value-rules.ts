/**
 * Which literal values are design decisions worth flagging.
 *
 * An audit of 2,895 findings across six well-known codebases (2026-09-24)
 * found most of what Buoy reported was correct code: brand logos, email
 * templates (email clients do not support CSS variables), OG image routes,
 * fixtures, layout maths like calc() and 100dvh, and Tailwind classes that
 * already reference a token. Every scanner (CLI drift check, public
 * reports, the agent hook, and PR reviews) asks these rules before flagging,
 * so they all agree on what counts.
 */

export type ExemptFileContext = "artwork" | "email" | "og-image" | "test-or-story";

const ARTWORK_PATH = /(^|\/)(icons?|logos?|illustrations?|svgs?|brand(ing)?|flags?|emojis?|avatars?\/presets?)(\/|$)|(^|\/)[\w.-]*(icon|logo|illustration|flag)s?\.(tsx|jsx|vue|svelte|astro)$|\.svg\.(tsx|jsx)$/i;
const TEST_PATH = /(^|\/)(__tests__|__mocks__|mocks?|fixtures?|storybook|\.storybook|stories)(\/|$)|\.(test|spec|stories|story)\.[jt]sx?$|(^|\/)routes\/storybook[./]/i;
const EMAIL_PATH = /(^|\/)(emails?|email-templates|mail-templates)(\/|$)/i;
const EMAIL_IMPORT = /from\s+['"](@react-email\/[\w-]+|react-email|jsx-email|mjml|mjml-react|@mjmlio\/[\w-]+)['"]/;
const OG_PATH = /(^|\/)(opengraph-image|twitter-image|og-image|og)(\.[\w]+)?\.(tsx|jsx|ts|js)$|(^|\/)og(\/|$)/i;
const OG_IMPORT = /from\s+['"](next\/og|@vercel\/og|satori)['"]/;

// SVG drawing elements. A file whose markup is only these is artwork.
const SVG_TAGS = new Set([
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs", "use", "symbol",
  "lineargradient", "radialgradient", "stop", "clippath", "mask", "pattern", "filter", "title", "desc",
  "text", "tspan", "textpath", "image", "marker", "foreignobject", "animate", "animatetransform",
]);

/** Lowercase JSX/HTML tags used in the file (components, which start uppercase, are ignored). */
function intrinsicTags(content: string): Set<string> {
  const tags = new Set<string>();
  for (const m of content.matchAll(/<([a-z][\w.:-]*)[\s/>]/g)) tags.add(m[1]!.toLowerCase());
  if (/<fe[A-Z]\w*[\s/>]/.test(content)) tags.add("filter");
  return tags;
}

/**
 * Why a whole file should not be scanned for hardcoded values, or null.
 * `content` is optional; path rules apply without it.
 */
export function classifyFileContext(path: string, content?: string): ExemptFileContext | null {
  const p = path.replace(/\\/g, "/");
  if (TEST_PATH.test(p)) return "test-or-story";
  if (EMAIL_PATH.test(p) || (content && EMAIL_IMPORT.test(content))) return "email";
  if (OG_PATH.test(p) || (content && OG_IMPORT.test(content))) return "og-image";
  if (ARTWORK_PATH.test(p)) return "artwork";
  if (content && /<svg[\s>]/.test(content)) {
    const tags = intrinsicTags(content);
    if (tags.size > 0 && [...tags].every((t) => SVG_TAGS.has(t) || t.startsWith("fe"))) return "artwork";
  }
  return null;
}

const SVG_PAINT = new Set(["fill", "stroke", "stop-color", "stopcolor", "flood-color", "floodcolor", "lighting-color", "lightingcolor"]);

/** Colour on an SVG drawing element is artwork, not a themed UI colour. */
export function isSvgPaintProperty(property: string): boolean {
  return SVG_PAINT.has(property.trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// Tailwind arbitrary values
// ---------------------------------------------------------------------------

const COLOR_LITERAL = /^(#[0-9a-f]{3,8}|(rgba?|hsla?|oklch|oklab|lab|lch|hwb)\([^)]*\))$/i;
const LENGTH_LITERAL = /^-?(\d+\.?\d*|\.\d+)(px|rem|em)$/;
const NOT_A_LITERAL = /var\(|theme\(|calc\(|min\(|max\(|clamp\(|env\(|%|\b\d*\.?\d+(vh|vw|dvh|svh|lvh|dvw|svw|lvw|vmin|vmax|ch|ex|fr|cqw|cqh)\b|minmax|repeat\(|gradient|url\(|^(inherit|initial|unset|revert|auto|none|currentcolor|transparent|full|screen|fit|min|max)$/i;

const COLOR_UTILITIES = /^(text|bg|border(-[xytrblse])?|fill|stroke|from|via|to|accent|caret|decoration|outline|ring|divide|placeholder|shadow)$/;
const SPACING_UTILITIES = /^(p[xytrblse]?|m[xytrblse]?|gap(-[xy])?|space-[xy]|inset(-[xy])?|top|right|bottom|left|start|end|scroll-[mp][xytrblse]?|outline-offset|ring-offset)$/;
const RADIUS_UTILITIES = /^rounded(-(t|r|b|l|tl|tr|bl|br|s|e|ss|se|es|ee))?$/;
const BORDER_WIDTH_UTILITIES = /^(border(-[xytrblse])?|outline|ring|divide-[xy])$/;

/** Split `hover:md:bg-[#fff]/50` into utility `bg` and value `#fff`. Null for arbitrary properties and v4 var syntax. */
export function parseArbitraryClass(fullClass: string): { utility: string; value: string } | null {
  if (/-\(--[\w-]+\)/.test(fullClass)) return null; // Tailwind v4 w-(--x): already a token
  // Drop variant prefixes, including bracketed ones like [&_svg]: and data-[state=open]:
  const tail = fullClass.replace(/^(?:(?:[^[\]:]|\[[^\]]*\])*:)*/, "");
  if (tail.startsWith("[")) return null; // [prop:value] arbitrary property or [--x:y] variable definition
  const m = /^-?([a-z][\w-]*?)-\[(.+)\](?:\/[\w.[\]]+)?$/.exec(tail);
  if (!m) return null;
  return { utility: m[1]!, value: m[2]!.replace(/_/g, " ").trim() };
}

/**
 * Is this Tailwind arbitrary class a hardcoded design value (colour, spacing,
 * font size, radius, shadow, type scale, border width) rather than layout,
 * mechanics, or an existing token?
 */
export function isTailwindDesignValue(fullClass: string): boolean {
  const parsed = parseArbitraryClass(fullClass);
  if (!parsed) return false;
  const { utility, value } = parsed;
  const v = value.replace(/^(color|length|size|number|percentage):/, "");
  // Colour functions legitimately contain % (hsl(0 0% 100%)); judge them first.
  if (COLOR_LITERAL.test(v) && !/var\(|theme\(/.test(v)) {
    return COLOR_UTILITIES.test(utility);
  }
  if (NOT_A_LITERAL.test(v)) return false;

  if (utility === "text") return isNonTrivialLength(v);
  if (utility === "shadow" || utility === "drop-shadow") return /\d(px|rem|em)/.test(v);
  if (COLOR_UTILITIES.test(utility) && COLOR_LITERAL.test(v)) return true;
  if (BORDER_WIDTH_UTILITIES.test(utility)) return LENGTH_LITERAL.test(v) && !/^(0|1)(px)?$/.test(v) && v !== "0.5px";
  if (SPACING_UTILITIES.test(utility)) return isNonTrivialLength(v);
  if (RADIUS_UTILITIES.test(utility)) return isNonTrivialLength(v) && !/^(9999|999)px$/.test(v);
  if (utility === "leading" || utility === "tracking") return /^-?(\d+\.?\d*|\.\d+)(px|rem|em)?$/.test(v);
  if (utility === "font") return /^[1-9]\d{2}$/.test(v);
  return false;
}

function isNonTrivialLength(v: string): boolean {
  return LENGTH_LITERAL.test(v) && !/^-?0(\.0+)?(px|rem|em)$/.test(v) && !/^-?(0?\.5|1)px$/.test(v);
}

// ---------------------------------------------------------------------------
// Declarations (component styles, inline styles, CSS)
// ---------------------------------------------------------------------------

/** Layout geometry: sizes and positions are one-off by nature, not token drift. */
const LAYOUT_PROPERTIES = new Set([
  "width", "height", "min-width", "min-height", "max-width", "max-height", "inline-size", "block-size",
  "top", "left", "right", "bottom", "inset", "flex-basis", "translate", "transform",
  "grid-template-columns", "grid-template-rows", "aspect-ratio",
]);

function kebab(property: string): string {
  return property.trim().replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Is `property: value` a hardcoded design decision (colour, spacing, type,
 * radius, shadow) rather than layout geometry, a keyword, maths, or artwork?
 */
export function isDesignDeclaration(property: string, value: string): boolean {
  const prop = kebab(property);
  const v = String(value).trim();
  if (isSvgPaintProperty(prop)) return false;
  if (LAYOUT_PROPERTIES.has(prop)) return false;
  if (COLOR_LITERAL.test(v)) return true;
  if (NOT_A_LITERAL.test(v)) return false;
  if (/^-?(0|0?\.5|1)(px)?$/.test(v)) return false; // resets and hairlines
  return true;
}
