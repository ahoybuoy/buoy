/**
 * Vocabulary-first phrasing for design-drift fixes.
 *
 * Agents apply feedback more reliably when the message names the design
 * decision (harmonize, scale, token, variation) and annotates both the
 * current value and the token to use, e.g. `17px → spacing.4`.
 */

export interface VocabularyFix {
  /** Signal or token category, e.g. "spacing", "color", "hardcoded-radius". */
  kind: string;
  /** The literal currently in the source. */
  current: string;
  /** The token to use, when one holds this exact value. */
  token?: string;
}

const KIND_ALIASES: Record<string, string> = {
  "color-value": "color",
  "hardcoded-color": "color",
  "hardcoded-value": "color",
  "spacing-value": "spacing",
  "hardcoded-spacing": "spacing",
  size: "spacing",
  "font-size": "type",
  "hardcoded-font-size": "type",
  typography: "type",
  "font-family": "font-family",
  "font-weight": "font-weight",
  "line-height": "line-height",
  "letter-spacing": "letter-spacing",
  "radius-value": "radius",
  "hardcoded-radius": "radius",
  "shadow-value": "shadow",
  "hardcoded-shadow": "shadow",
  "border-width": "border",
  "hardcoded-border-width": "border",
  border: "border",
  "motion-duration": "motion",
  "motion-easing": "motion",
  "z-index": "zIndex",
  "opacity-value": "opacity",
};

const PHRASE: Record<string, { withToken: string; withoutToken: string }> = {
  color: {
    withToken: "Harmonize this color to the token",
    withoutToken: "This color is off-token",
  },
  spacing: {
    withToken: "Harmonize this spacing to the scale",
    withoutToken: "This spacing is off-token",
  },
  type: {
    withToken: "Harmonize this type size to the scale",
    withoutToken: "This type size is off-token",
  },
  "font-family": {
    withToken: "Harmonize this typeface to the token",
    withoutToken: "This typeface is off-token",
  },
  "font-weight": {
    withToken: "Harmonize this type weight to the scale",
    withoutToken: "This type weight is off-token",
  },
  "line-height": {
    withToken: "Harmonize this line height to the scale",
    withoutToken: "This line height is off-token",
  },
  "letter-spacing": {
    withToken: "Harmonize this letter spacing to the scale",
    withoutToken: "This letter spacing is off-token",
  },
  radius: {
    withToken: "Harmonize this radius to the scale",
    withoutToken: "This radius is off-token",
  },
  shadow: {
    withToken: "Harmonize this shadow to the token",
    withoutToken: "This shadow is off-token",
  },
  border: {
    withToken: "Harmonize this border width to the scale",
    withoutToken: "This border width is off-token",
  },
  motion: {
    withToken: "Harmonize this motion to the token",
    withoutToken: "This motion is off-token",
  },
  zIndex: {
    withToken: "Harmonize this z-index to the token",
    withoutToken: "This z-index is off-token",
  },
  opacity: {
    withToken: "Harmonize this opacity to the token",
    withoutToken: "This opacity is off-token",
  },
};

/** Normalize a signal type, token category, or fix type to a vocabulary kind. */
export function vocabularyKind(raw: string): string {
  const trimmed = raw.trim();
  if (KIND_ALIASES[trimmed]) return KIND_ALIASES[trimmed];
  const stripped = trimmed.replace(/^hardcoded-/, "").replace(/-value$/, "");
  return KIND_ALIASES[stripped] ?? stripped;
}

/**
 * `17px → spacing.4` — the annotated substitution agents should apply.
 * Kept as a plain string so MCP `current` / `suggested` fields stay authoritative.
 */
export function formatVocabularyAnnotation(
  current: string,
  token: string,
): string {
  return `${current} → ${token}`;
}

/**
 * Phrase a single fix in design language, annotating both values when a token
 * is known. Example: `Harmonize this spacing to the scale: 17px → spacing.4`.
 */
export function formatVocabularyFix(fix: VocabularyFix): string {
  const kind = vocabularyKind(fix.kind);
  const phrase = PHRASE[kind] ?? {
    withToken: `Harmonize this ${kind} to the token`,
    withoutToken: `This ${kind} is off-token`,
  };
  if (fix.token) {
    return `${phrase.withToken}: ${formatVocabularyAnnotation(fix.current, fix.token)}`;
  }
  return `${phrase.withoutToken}: ${fix.current} (no exact match in the system)`;
}

/**
 * Markdown form for PR comments: wrap the current value and token in backticks.
 */
export function formatVocabularyFixMarkdown(fix: VocabularyFix): string {
  if (fix.token) {
    const kind = vocabularyKind(fix.kind);
    const phrase = PHRASE[kind] ?? {
      withToken: `Harmonize this ${kind} to the token`,
      withoutToken: "",
    };
    return `${phrase.withToken}: \`${fix.current}\` → \`${fix.token}\``;
  }
  return formatVocabularyFix(fix);
}

/**
 * Parse a stored `value → token` annotation (optionally with trailing
 * confidence text) back into a vocabulary sentence.
 */

/**
 * Split a stored `value → token` annotation (optionally with trailing
 * confidence text) into current value and token. Tokens may include
 * parentheses, e.g. `var(--color-primary)`.
 */
export function parseVocabularyAnnotation(
  annotation: string,
): { current: string; token: string } | null {
  const arrow = annotation.indexOf("→");
  if (arrow === -1) return null;
  const current = annotation.slice(0, arrow).trim();
  let token = annotation.slice(arrow + 1).trim();
  token = token.replace(/\s+\([^)]*\)\s*$/, "").trim();
  if (!current || !token) return null;
  return { current, token };
}

export function formatVocabularyFixFromAnnotation(
  annotation: string,
  kind = "color",
): string {
  const parsed = parseVocabularyAnnotation(annotation);
  if (!parsed) return annotation;
  return formatVocabularyFix({
    kind,
    current: parsed.current,
    token: parsed.token,
  });
}

/**
 * Opening line for a list of exact substitutions, e.g. in scan suggestions.
 */
export function formatVocabularyFixIntro(kind: string, count: number): string {
  const k = vocabularyKind(kind);
  const noun =
    k === "color"
      ? "color"
      : k === "spacing"
        ? "spacing"
        : k === "type"
          ? "type size"
          : k === "radius"
            ? "radius"
            : k;
  const target =
    k === "color" ||
    k === "shadow" ||
    k === "motion" ||
    k === "zIndex" ||
    k === "opacity"
      ? "token"
      : "scale";
  if (count === 1) return `Harmonize this ${noun} to the ${target}`;
  const plural =
    noun === "spacing"
      ? "spacing values"
      : noun === "type size"
        ? "type sizes"
        : `${noun}s`;
  return `Harmonize these ${plural} to the ${target === "scale" ? "scale" : "tokens"}`;
}

/**
 * When the drift type is the generic `hardcoded-value`, infer color vs spacing
 * (and friends) from the message or the literal so PR/CLI copy stays accurate.
 *
 * Quoted component names are stripped first so names like `RadiusCard` or
 * `PaddingCard` cannot shadow the real category clause ("hardcoded color").
 */
export function inferVocabularyKind(input: {
  type?: string;
  message?: string;
  current?: string;
}): string {
  const type = input.type ?? "";
  if (type && type !== "hardcoded-value" && type !== "hardcoded-color") {
    return vocabularyKind(type);
  }
  // semantic-diff messages look like: Component "RadiusCard" has 1 hardcoded color: #fff
  const message = (input.message ?? "").replace(/Component\s+"[^"]+"/gi, "");
  if (/hardcoded color|\bcolors?\b|#(?:[0-9a-f]{3,8})\b|(?:rgba?|hsla?)\(/i.test(message))
    return "color";
  if (/size value|font size|type size|\bspacing\b|\bpadding\b|\bmargin\b/i.test(message))
    return "spacing";
  if (/\bradius\b/i.test(message)) return "radius";
  if (/\bshadow\b/i.test(message)) return "shadow";
  if (/typeface|font-family|font family/i.test(message)) return "font-family";
  const current = input.current ?? "";
  if (current.startsWith("#") || /^(?:rgba?|hsla?)\(/i.test(current))
    return "color";
  if (/(?:px|rem|em|%)$/.test(current)) return "spacing";
  return type ? vocabularyKind(type) : "color";
}
