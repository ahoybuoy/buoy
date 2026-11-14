/**
 * Line-level drift check for a handful of files.
 *
 * The repo-wide DriftAnalysisService reasons about components; it does not
 * look at literal values inside plain CSS, and it reports a component's line,
 * not the value's. Agents need "line 12: #fff -> var(--color-white)", so this
 * runs the same value-level extractors the PR reviewer uses, per file, and
 * looks each value up in the repo's tokens.
 */
import { minimatch } from "minimatch";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import type { DesignToken } from "@buoy-design/core";
import {
  extractBorderWidthSignals,
  extractColorSignals,
  extractDurationSignals,
  extractEasingSignals,
  extractFontFamilySignals,
  extractFontSizeSignals,
  extractFontWeightSignals,
  extractLetterSpacingSignals,
  extractLineHeightSignals,
  extractOpacitySignals,
  extractRadiusSignals,
  extractShadowSignals,
  extractSpacingSignals,
  extractTransitionShorthandSignals,
  extractZIndexSignals,
  collectArbitraryClasses,
  collectJsxDeclaredValues,
  type RawSignal,
  type SignalContext,
} from "@buoy-design/scanners";
import {
  classifyFileContext,
  isDesignDeclaration,
  isSvgPaintProperty,
  isTailwindDesignValue,
  lineIntent,
  parseArbitraryClass,
  tokenSizeFamily,
  type IntentEvidence,
} from "@buoy-design/core";
import { findTokensByValue } from "./project.js";

type Extractor =
  | "color" | "spacing" | "fontSize" | "fontFamily" | "fontWeight" | "lineHeight" | "letterSpacing"
  | "radius" | "shadow" | "zIndex" | "opacity" | "duration" | "easing" | "borderWidth" | "transitionShorthand"
  | "colorShorthand";

const COLOR_PART = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|oklch\(|oklab\(|color\()/i;

/** Split a shorthand value on spaces, keeping function calls like rgb(...) intact. */
export function splitCssValue(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === " " && depth === 0) {
      if (current) parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

// Same routing as the cloud scanner container (containers/scanner/src/index.js).
const CSS_PROPERTY_EXTRACTORS: Record<string, Extractor> = {
  color: "color", "background-color": "color", "border-color": "color", "outline-color": "color",
  "text-decoration-color": "color", fill: "color", stroke: "color", "caret-color": "color", "accent-color": "color",
  padding: "spacing", "padding-top": "spacing", "padding-right": "spacing", "padding-bottom": "spacing", "padding-left": "spacing",
  "padding-inline": "spacing", "padding-block": "spacing",
  margin: "spacing", "margin-top": "spacing", "margin-right": "spacing", "margin-bottom": "spacing", "margin-left": "spacing",
  "margin-inline": "spacing", "margin-block": "spacing",
  gap: "spacing", "row-gap": "spacing", "column-gap": "spacing",
  top: "spacing", right: "spacing", bottom: "spacing", left: "spacing", inset: "spacing",
  "font-size": "fontSize", "font-family": "fontFamily", "font-weight": "fontWeight",
  "line-height": "lineHeight", "letter-spacing": "letterSpacing",
  "border-radius": "radius", "border-top-left-radius": "radius", "border-top-right-radius": "radius",
  "border-bottom-left-radius": "radius", "border-bottom-right-radius": "radius",
  "box-shadow": "shadow", "text-shadow": "shadow",
  "z-index": "zIndex", opacity: "opacity",
  "transition-duration": "duration", "animation-duration": "duration",
  "transition-timing-function": "easing", "animation-timing-function": "easing",
  transition: "transitionShorthand",
  "border-width": "borderWidth", "border-top-width": "borderWidth", "border-right-width": "borderWidth",
  "border-bottom-width": "borderWidth", "border-left-width": "borderWidth",
  background: "colorShorthand", border: "colorShorthand", "border-top": "colorShorthand",
  "border-right": "colorShorthand", "border-bottom": "colorShorthand", "border-left": "colorShorthand", outline: "colorShorthand",
};

// Style-prop shorthands from Mantine and Chakra (bg="#fff", p={8}); theme
// objects use the same keys. Same list as the cloud scanner container.
const JSX_STYLE_PROP_ALIASES: Record<string, Extractor> = {
  bg: "color", c: "color", bd: "colorShorthand",
  p: "spacing", px: "spacing", py: "spacing", pt: "spacing", pr: "spacing", pb: "spacing", pl: "spacing",
  m: "spacing", mx: "spacing", my: "spacing", mt: "spacing", mr: "spacing", mb: "spacing", ml: "spacing",
  gap: "spacing", rowGap: "spacing", columnGap: "spacing",
  fz: "fontSize", fw: "fontWeight", lh: "lineHeight", ff: "fontFamily", lts: "letterSpacing",
  radius: "radius", rounded: "radius", shadow: "shadow", opacity: "opacity",
};

const JSX_PROPERTY_EXTRACTORS: Record<string, Extractor> = Object.fromEntries(
  Object.entries(CSS_PROPERTY_EXTRACTORS).map(([prop, extractor]) => [
    prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
    extractor,
  ]),
);

// Signal type -> token category to search for a replacement.
const SIGNAL_CATEGORY: Record<string, DesignToken["category"] | undefined> = {
  "color-value": "color",
  "spacing-value": "spacing",
  "radius-value": "border",
  "shadow-value": "shadow",
  "border-width": "border",
  "font-size": "typography",
  "font-family": "typography",
  "font-weight": "typography",
  "line-height": "typography",
  "letter-spacing": "typography",
  "z-index": "zIndex",
  "motion-duration": "motion",
  "motion-easing": "motion",
  "opacity-value": undefined,
};

const CSS_PROP = /([a-z-]+)\s*:\s*([^;{}]+)/g;

// How a bare JSX number reads depends on the property and the library. Same
// rule as the cloud scanner container (jsxNumberValue there):
// - unitless properties (lineHeight: 1.5, fontWeight: 600, opacity, zIndex) are plain numbers;
// - MUI sx spacing/radius and style-prop systems (MUI, Chakra, Theme UI,
//   styled-system) read numbers as theme steps: sx={{ p: 3 }} is theme.spacing(3),
//   <Box gap={4}> the 4th space step. maus-inc/mausVoice#325 was flagged as 3px;
// - Mantine and plain style={{ padding: 13 }} are px.
const UNITLESS_EXTRACTORS = new Set<Extractor>(["opacity", "fontWeight", "lineHeight", "zIndex"]);
const THEME_SCALE_SHORTHANDS = new Set(["p", "px", "py", "pt", "pr", "pb", "pl", "m", "mx", "my", "mt", "mr", "mb", "ml"]);
const SX_THEME_PROPS = new Set([...THEME_SCALE_SHORTHANDS, "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "paddingX", "paddingY",
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft", "marginX", "marginY", "gap", "rowGap", "columnGap", "borderRadius"]);
// Style-prop attributes take theme steps only for spacing and radius; MUI reads
// fontSize={19} and letterSpacing={4} as px (CodeRabbit on ahoybuoy/buoy#44).
const STYLE_PROP_THEME_PROPS = new Set([...SX_THEME_PROPS, "rounded", "radius"]);
const MANTINE_IMPORT = /from\s+['"]@mantine\//;
const STYLE_PROP_SYSTEM_IMPORT = /from\s+['"](@mui\/|@chakra-ui\/|theme-ui|@theme-ui\/|styled-system|rebass|@xstyled\/)/;

/** The value a bare JSX number stands for, or null when it is a theme step. */
export function jsxNumberValue(
  property: string, value: string, extractor: Extractor,
  where: { attribute?: boolean; inSx?: boolean; mantine: boolean; styleProps: boolean },
): string | null {
  if (UNITLESS_EXTRACTORS.has(extractor)) return value;
  if (where.mantine) return `${value}px`;
  if (where.inSx && SX_THEME_PROPS.has(property)) return null;
  if (where.attribute && where.styleProps && STYLE_PROP_THEME_PROPS.has(property)) return null;
  if (!where.attribute && THEME_SCALE_SHORTHANDS.has(property)) return null;
  return `${value}px`;
}

const COLOR_VALUE = /^(#[0-9a-f]{3,8}|(rgba?|hsla?|oklch|oklab|lab|lch|hwb)\([^)]*\))$/i;

/** Which extractor and CSS property a Tailwind arbitrary class stands for. Null when it is not a design value. */
export function arbitraryClassRoute(fullClass: string): { extractor: Extractor; property: string; value: string } | null {
  if (!isTailwindDesignValue(fullClass)) return null;
  const parsed = parseArbitraryClass(fullClass);
  if (!parsed) return null;
  const { utility } = parsed;
  const value = parsed.value.replace(/^(color|length|size|number|percentage):/, "");
  if (COLOR_VALUE.test(value)) {
    // fill-[...] and stroke-[...] paint SVG artwork, same rule as fill/stroke declarations.
    if (utility === "fill" || utility === "stroke") return null;
    const property = utility === "bg" ? "background-color" : utility === "text" ? "color" : `${utility}-color`;
    return { extractor: "color", property, value };
  }
  if (utility === "text") return { extractor: "fontSize", property: "font-size", value };
  if (utility === "shadow" || utility === "drop-shadow") return { extractor: "shadow", property: "box-shadow", value };
  if (/^rounded/.test(utility)) return { extractor: "radius", property: "border-radius", value };
  if (/^(border|outline|ring|divide)(-|$)/.test(utility) && !/offset/.test(utility)) return { extractor: "borderWidth", property: "border-width", value };
  if (utility === "leading") return { extractor: "lineHeight", property: "line-height", value };
  if (utility === "tracking") return { extractor: "letterSpacing", property: "letter-spacing", value };
  if (utility === "font") return { extractor: "fontWeight", property: "font-weight", value };
  const property = /^(scroll-)?p/.test(utility) ? "padding" : /^(scroll-)?m/.test(utility) ? "margin" : "gap";
  return { extractor: "spacing", property, value };
}

function route(extractor: Extractor, value: string, path: string, line: number, property: string, ctx: SignalContext): RawSignal[] {
  switch (extractor) {
    case "color": return extractColorSignals(value, path, line, property, ctx);
    case "spacing": return extractSpacingSignals(value, path, line, property, ctx);
    case "fontSize": return extractFontSizeSignals(value, path, line, ctx);
    case "fontFamily": return extractFontFamilySignals(value, path, line, ctx);
    case "fontWeight": return extractFontWeightSignals(value, path, line, ctx);
    case "lineHeight": return extractLineHeightSignals(value, path, line, ctx);
    case "letterSpacing": return extractLetterSpacingSignals(value, path, line, ctx);
    case "radius": return extractRadiusSignals(value, path, line, property, ctx);
    case "shadow": return extractShadowSignals(value, path, line, property, ctx);
    case "zIndex": return extractZIndexSignals(value, path, line, ctx);
    case "opacity": return extractOpacitySignals(value, path, line, ctx);
    case "duration": return extractDurationSignals(value, path, line, property, ctx);
    case "easing": return extractEasingSignals(value, path, line, property, ctx);
    case "borderWidth": return extractBorderWidthSignals(value, path, line, property, ctx);
    case "transitionShorthand": return extractTransitionShorthandSignals(value, path, line, ctx);
    case "colorShorthand":
      // background / border shorthands: only the colour part is a token candidate.
      return splitCssValue(value)
        .filter((part) => COLOR_PART.test(part))
        .flatMap((part) => extractColorSignals(part, path, line, `${property}-color`, ctx));
  }
}

/** Value-level signals for one file's content. Pure; `path` is only used for locations. */
/** Sets aside a value the code marks as deliberate. `line` is 1-based. */
export type LineJudge = (line: number, property: string, value: string, lines: readonly string[]) => IntentEvidence | null;

const defaultLineJudge: LineJudge = (line, property, value, lines) => lineIntent(lines, line - 1, { property, value });

export function extractFileSignals(content: string, path: string, judge: LineJudge = defaultLineJudge): RawSignal[] {
  const isCss = /\.(css|scss)$/.test(path);
  const isJsx = /\.(tsx|jsx)$/.test(path);
  if (!isCss && !isJsx) return [];
  // Icons, email templates, OG images and tests hold literals on purpose.
  if (classifyFileContext(path, content)) return [];
  const ctx: SignalContext = {
    fileType: isCss ? "css" : "tsx",
    framework: isJsx ? "react" : "css",
    scope: "global",
    isTokenized: false,
  };
  const lines = content.split("\n");
  if (isJsx) return extractJsxSignals(content, path, lines, ctx, judge);
  const signals: RawSignal[] = [];
  // Tailwind v4 `@utility` and `@theme` blocks are where a repo defines its
  // design values; their declarations are the system, not drift from it.
  let depth = 0;
  let definitionDepth: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const opensDefinition = definitionDepth === null && /@(utility|theme)\b/.test(line);
    if (opensDefinition) definitionDepth = depth;
    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    if (definitionDepth !== null) {
      if (depth <= definitionDepth && !opensDefinition) definitionDepth = null;
      else if (depth <= definitionDepth && opensDefinition && line.includes("}")) definitionDepth = null;
      continue;
    }
    CSS_PROP.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CSS_PROP.exec(line)) !== null) {
      const property = (m[1] ?? "").trim();
      // Own keys only: `constructor: ...` must not reach Object.prototype.
      const extractor = Object.hasOwn(CSS_PROPERTY_EXTRACTORS, property) ? CSS_PROPERTY_EXTRACTORS[property] : undefined;
      if (!extractor) continue;
      // fill/stroke/stop-color are SVG artwork, not themed UI colour.
      if (isSvgPaintProperty(property)) continue;
      const value = (m[2] ?? "").replace(/\s*!important\s*$/i, "").trim();
      if (value === "") continue;
      // Layout geometry (width, top, ...), keywords, maths and hairlines are not drift.
      if (!isDesignDeclaration(property, value)) continue;
      // A comment, a 2-3px nudge or the line's history says it is deliberate.
      if (judge(i + 1, property, value, lines)) continue;
      signals.push(...route(extractor, value, path, i + 1, property, ctx));
    }
  }
  return signals;
}

/**
 * JSX/TSX goes through the AST, so a literal is found wherever an expression
 * puts it: style objects, theme objects, style props, ternary and &&/||
 * branches, template literals, and class strings in className or cn()/clsx().
 * Token references (`var(--x)`, `theme.colors.red`) are not literals, and the
 * extractors skip var() per value.
 */
function extractJsxSignals(content: string, path: string, lines: readonly string[], ctx: SignalContext, judge: LineJudge): RawSignal[] {
  const table = { ...JSX_STYLE_PROP_ALIASES, ...JSX_PROPERTY_EXTRACTORS };
  const numberContext = { mantine: MANTINE_IMPORT.test(content), styleProps: STYLE_PROP_SYSTEM_IMPORT.test(content) };
  const signals: RawSignal[] = [];
  for (const found of collectJsxDeclaredValues(content, path)) {
    // Own keys only: `constructor: ...` or `toString: ...` must not reach Object.prototype.
    const extractor = Object.hasOwn(table, found.property) ? table[found.property] : undefined;
    if (!extractor) continue;
    if (isSvgPaintProperty(found.property)) continue;
    const value = found.numeric ? jsxNumberValue(found.property, found.value, extractor, { ...found, ...numberContext }) : found.value;
    if (value === null || value === "") continue;
    if (!isDesignDeclaration(found.property, value)) continue;
    if (judge(found.line, found.property, value, lines)) continue;
    signals.push(...route(extractor, value, path, found.line, found.property, ctx));
  }
  for (const found of collectArbitraryClasses(content, path)) {
    const routed = arbitraryClassRoute(found.fullClass);
    if (!routed) continue;
    if (lineIntent(lines, found.line - 1, { fullClass: found.fullClass })) continue;
    signals.push(...route(routed.extractor, routed.value, path, found.line, routed.property, ctx));
  }
  return signals.sort((a, b) => a.location.line - b.location.line);
}

export interface FileIssue {
  file: string;
  line: number;
  type: string;
  severity: "warning" | "info";
  message: string;
  current: string;
  suggested?: string;
  tokenSuggestions?: string[];
  /** The exact line rewrite, when the swap is unambiguous; agents apply it as-is. */
  edit?: LineEdit;
}

export interface LineEdit {
  line: number;
  before: string;
  after: string;
}

/**
 * Rewrite one line to use the suggested token, or null when that is not safe:
 * the literal must appear exactly once on the line, and a Sass variable only
 * goes into a Sass file. JSX bare numbers (`padding: 16`) are skipped because
 * the reported value (`16px`) is not what the source says.
 */
export function lineEdit(issue: FileIssue, lineText: string | undefined): LineEdit | null {
  const token = issue.suggested;
  if (!token || lineText === undefined) return null;
  const isSass = /\.(scss|sass)$/.test(issue.file);
  if (token.startsWith("$") && !isSass) return null;
  if (!token.startsWith("var(") && !token.startsWith("$")) return null;
  const occurrences = lineText.split(issue.current).length - 1;
  if (occurrences !== 1) return null;
  return { line: issue.line, before: lineText, after: lineText.replace(issue.current, token) };
}

function tokenRef(token: { name: string }): string {
  return token.name.startsWith("--") ? `var(${token.name})` : token.name;
}

/**
 * Tokens that encode the same kind of decision as the signal. Radius and
 * border-width tokens share the "border" category, and a radius can sit in
 * "spacing" (shadcn's --radius), so an 8px padding must not get --radius and
 * a border-radius must not get a border-width token.
 */
function sameKindTokens(tokens: DesignToken[], signalType: string): DesignToken[] {
  if (signalType === "radius-value") return tokens.filter((t) => tokenSizeFamily(t) === "radius");
  if (signalType === "spacing-value" || signalType === "border-width") {
    return tokens.filter((t) => tokenSizeFamily(t) !== "radius");
  }
  return tokens;
}

/** Turn raw signals into issues, attaching the token that has the same value when one exists. */
export function issuesFromSignals(signals: RawSignal[], tokens: DesignToken[]): FileIssue[] {
  const seen = new Set<string>();
  const issues: FileIssue[] = [];
  for (const s of signals) {
    const current = String(s.value);
    const key = `${s.location.path}:${s.location.line}:${s.type}:${current}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const category = SIGNAL_CATEGORY[s.type];
    const matches = findTokensByValue(sameKindTokens(tokens, s.type), current, category);
    const first = matches[0];
    const label = s.type.replace(/-value$/, "").replace(/-/g, " ");
    issues.push({
      file: s.location.path,
      line: s.location.line,
      type: `hardcoded-${s.type.replace(/-value$/, "")}`,
      severity: first ? "warning" : "info",
      message: first
        ? `Hardcoded ${label} ${current} has a token: ${first.name}`
        : `Hardcoded ${label} ${current} (no matching token)`,
      current,
      ...(first ? { suggested: tokenRef(first), tokenSuggestions: matches.map(tokenRef) } : {}),
    });
  }
  return issues;
}

export async function checkFiles(files: string[], projectRoot: string, tokens: DesignToken[]): Promise<FileIssue[]> {
  const issues: FileIssue[] = [];
  for (const file of files) {
    const abs = isAbsolute(file) ? file : join(projectRoot, file);
    const rel = relative(projectRoot, abs) || file;
    let content: string;
    try {
      content = await readFile(abs, "utf8");
    } catch {
      continue; // deleted or unreadable: nothing to check
    }
    const lines = content.split("\n");
    for (const issue of issuesFromSignals(extractFileSignals(content, rel), tokens)) {
      const edit = lineEdit(issue, lines[issue.line - 1]);
      issues.push(edit ? { ...issue, edit } : issue);
    }
  }
  return issues;
}

/** One `drift.ignore` rule from .buoy.yaml (the fields line-level issues can match). */
export interface FileIgnoreRule {
  type?: string;
  severity?: string;
  file?: string;
  component?: string;
  token?: string;
  value?: string;
}

/**
 * Drop issues a team told Buoy to leave alone in `.buoy.yaml` (`drift.ignore`),
 * with the same meaning the full scan gives those rules: every field a rule
 * sets must match, `file` is a glob, `value` a regex on the value. Rules about
 * a component or token never match a literal on a line, and a rule with no
 * fields matches nothing. `type: hardcoded-value` covers every hardcoded-* issue.
 */
export function applyFileIgnoreRules(issues: FileIssue[], rules: readonly FileIgnoreRule[] | undefined): FileIssue[] {
  if (!rules?.length) return issues;
  const matches = (issue: FileIssue, rule: FileIgnoreRule): boolean => {
    if (!rule.type && !rule.severity && !rule.file && !rule.component && !rule.token && !rule.value) return false;
    if (rule.component || rule.token) return false;
    if (rule.type && rule.type !== issue.type && !(rule.type === "hardcoded-value" && issue.type.startsWith("hardcoded-"))) return false;
    if (rule.severity && rule.severity !== issue.severity) return false;
    if (rule.file && !(minimatch(issue.file, rule.file, { dot: true }) || issue.file === rule.file)) return false;
    if (rule.value) {
      try { if (!new RegExp(rule.value).test(issue.current)) return false; }
      catch { return false; }
    }
    return true;
  };
  return issues.filter((issue) => !rules.some((rule) => matches(issue, rule)));
}
