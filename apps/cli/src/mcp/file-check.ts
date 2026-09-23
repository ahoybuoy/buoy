/**
 * Line-level drift check for a handful of files.
 *
 * The repo-wide DriftAnalysisService reasons about components; it does not
 * look at literal values inside plain CSS, and it reports a component's line,
 * not the value's. Agents need "line 12: #fff -> var(--color-white)", so this
 * runs the same value-level extractors the PR reviewer uses, per file, and
 * looks each value up in the repo's tokens.
 */
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
  type RawSignal,
  type SignalContext,
} from "@buoy-design/scanners";
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
const JSX_PROP = /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|(\d+\.?\d*)(?=[,}\s]))/g;

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
export function extractFileSignals(content: string, path: string): RawSignal[] {
  const isCss = /\.(css|scss)$/.test(path);
  const isJsx = /\.(tsx|jsx)$/.test(path);
  if (!isCss && !isJsx) return [];
  const ctx: SignalContext = {
    fileType: isCss ? "css" : "tsx",
    framework: isJsx ? "react" : "css",
    scope: "global",
    isTokenized: false,
  };
  const signals: RawSignal[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // A line can mix a token reference and a literal (`fg: 'var(--x)', bg: '#fff'`);
    // the extractors skip var()/$ references per value, so the line is examined.
    const pattern = isCss ? CSS_PROP : JSX_PROP;
    const table = isCss ? CSS_PROPERTY_EXTRACTORS : { ...JSX_STYLE_PROP_ALIASES, ...JSX_PROPERTY_EXTRACTORS };
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(line)) !== null) {
      const property = (m[1] ?? "").trim();
      const extractor = table[property];
      if (!extractor) continue;
      let value = isCss ? (m[2] ?? "").trim() : (m[2] ?? m[3] ?? m[4]);
      if (value === undefined || value === "") continue;
      // Bare numbers in JSX style objects are pixels.
      if (isJsx && m[4] !== undefined) value = `${value}px`;
      signals.push(...route(extractor, value, path, i + 1, property, ctx));
    }
  }
  return signals;
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
}

function tokenRef(token: { name: string }): string {
  return token.name.startsWith("--") ? `var(${token.name})` : token.name;
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
    const matches = findTokensByValue(tokens, current, category);
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
    issues.push(...issuesFromSignals(extractFileSignals(content, rel), tokens));
  }
  return issues;
}
