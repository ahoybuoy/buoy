/**
 * Deliberate deviations.
 *
 * A literal value is only worth flagging when it is an accident: a value that
 * should have been a token and nobody meant otherwise. Code often says when
 * it is not. In Formbricks, PostHog and n8n (2026-09) flagged values sat
 * under comments like "Slight adjustment to align with text", "Inline
 * font-size because the wrapper breaks the button > svg size rule" and
 * "Switch to var(--radius--sm) once that legacy override is removed". Those
 * are decisions or known debt, not drift. Buoy notes them, with the reason,
 * and leaves them out of findings and the score.
 *
 * Evidence comes from three places: a comment on or just above the line, the
 * shape of the value (a 2-3px optical nudge), and the commit that introduced
 * the line (callers with git history pass its message to commitIntent).
 */

export type IntentKind =
  /** A comment explains why the value is what it is. */
  | "explained"
  /** A comment says the team already plans to change it (TODO, legacy, once ...). */
  | "known-debt"
  /** A 2-3px nudge or a calc() off by 1px: an optical fix, not a design value. */
  | "optical-nudge"
  /** The commit that introduced the line says it was deliberate. */
  | "history"
  /** A buoy-ignore / buoy-disable comment. */
  | "allowlisted";

export interface IntentEvidence {
  kind: IntentKind;
  /** Short human reason, e.g. the comment or commit text. */
  reason: string;
}

/** A value Buoy left out because the code says it is deliberate. */
export interface NotedValue {
  file: string;
  line: number;
  value: string;
  kind: IntentKind;
  reason: string;
}

const ALLOWLIST = /\bbuoy-(ignore|disable)\b/i;

// Plans to change it: the team knows, a finding adds nothing.
const KNOWN_DEBT = /\b(todo|fixme|xxx|legacy|temporary|temporarily|until\b|once\b[^.]{0,60}\b(removed|migrated|lands?|ships?|merged|available|fixed|done)|switch to\b|migrate to\b|deprecated)\b/i;

// Reasons: why the value is what it is.
const EXPLAINED = new RegExp(
  [
    "\\bworkaround\\b", "\\bhack(y)?\\b", "\\bintentional(ly)?\\b", "\\bdeliberate(ly)?\\b", "\\bon purpose\\b",
    "\\boptical(ly)?\\b", "\\bvisual(ly)? (align|balance|center|centre)", "(?<!(left|right|top|bottom|center|centre|start|end)[- ])\\balign(s|ed|ing|ment)?\\b", "\\bnudge",
    "\\bpixel[- ]?perfect\\b", "\\boffset (to|for|by)\\b", "\\bcompensat",
    "\\bmatch(es|ing)? (the )?(design|figma|mocks?|mockup|spec|brand|native|os|system|platform|browser|screenshot)",
    "\\bper (the )?(design|figma|brand|spec)\\b", "\\bdesign(er)?s? (asked|wants?|requested|decision)",
    "\\bbrand (colou?rs?|guidelines?|requirements?)\\b",
    "\\bbecause\\b", "\\bdue to\\b", "\\bneeded (for|to|so|because)\\b", "\\brequired (by|for)\\b", "\\bmust (be|stay|match)\\b",
    "\\b(safari|firefox|chrome|chromium|webkit|ios|android|edge|ie ?1[01]|ie\\d)\\b",
    "\\bbrowser (bug|quirk|default)", "\\boverrides? (the )?\\S+ (default|style)", "\\bthird[- ]party\\b",
    "\\bkeep in sync\\b", "\\bpreserv(e|es|ed|ing) (the |existing |original |current |old )?(\\w+ )?(css|styles?|styling|look|spacing|colou?rs?|padding|margins?|layout|design|appearance|brand\\w*|sizes?|radius|shadows?)\\b", "\\bdo(n'?t| not) change\\b",
  ].join("|"),
  "i",
);

// Tool directives are not explanations, even when they sit on the line.
const TOOL_DIRECTIVE = /^\s*(eslint|@ts-|prettier|stylelint|istanbul|c8|biome|webpackChunk|@vite|#region|#endregion)/i;

/** The comment text on one line, or null. Ignores URLs and selectors like `*::-webkit-...`. */
export function commentText(line: string): string | null {
  const parts: string[] = [];
  const block = line.match(/\/\*+(.*?)(\*\/|$)/);
  if (block?.[1]?.trim()) parts.push(block[1].trim());
  const html = line.match(/<!--(.*?)(-->|$)/);
  if (html?.[1]?.trim()) parts.push(html[1].trim());
  // `//` not preceded by `:` (a URL scheme) or another `/`.
  const slash = line.match(/(?:^|[^:/])\/\/(?!\/)(.*)$/);
  if (slash?.[1]?.trim()) parts.push(slash[1].trim());
  // JSDoc / block continuation: ` * text`. `*::-webkit` and `* {` are selectors.
  const star = line.match(/^\s*\*\s+([A-Za-z].*)$/);
  if (star?.[1] && !line.includes("{")) parts.push(star[1].trim().replace(/\*\/\s*$/, ""));
  const text = parts.filter((p) => !TOOL_DIRECTIVE.test(p)).join(" ").trim();
  return text || null;
}

function shorten(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Classify comment text as an explanation, known debt or an allowlist marker. */
export function classifyIntentText(text: string): IntentEvidence | null {
  if (ALLOWLIST.test(text)) return { kind: "allowlisted", reason: shorten(text) };
  if (KNOWN_DEBT.test(text)) return { kind: "known-debt", reason: shorten(text) };
  if (EXPLAINED.test(text)) return { kind: "explained", reason: shorten(text) };
  return null;
}

const COMMENT_ONLY = /^\s*(\/\/|\/\*|\*|\{\s*\/\*|<!--)/;

/**
 * Intent from a comment on the flagged line, or from comment-only lines
 * directly above it. Walking up may pass one block opener (a selector or
 * `style={{`), so a comment above a CSS rule covers its declarations. Any
 * other code line or a blank line ends the search: a trailing comment on the
 * previous declaration explains that declaration, not this one.
 * `lineIndex` is 0-based.
 */
export function commentIntent(lines: readonly string[], lineIndex: number, lookBack = 4): IntentEvidence | null {
  const texts: string[] = [];
  const own = commentText(lines[lineIndex] ?? "");
  if (own) texts.push(own);
  let passedOpener = false;
  for (let i = lineIndex - 1; i >= 0 && i >= lineIndex - lookBack; i--) {
    const line = lines[i] ?? "";
    if (line.trim() === "") break;
    if (COMMENT_ONLY.test(line)) {
      const text = commentText(line);
      if (text) texts.unshift(text);
      continue;
    }
    if (!passedOpener && /[{(]\s*$/.test(line.trim()) && !commentText(line)) {
      passedOpener = true;
      continue;
    }
    break;
  }
  return texts.length ? classifyIntentText(texts.join(" ")) : null;
}

const NUDGE_PROPERTY = /^(margin|padding|inset|top|right|bottom|left|translate|transform)(-|$)|^(margin|padding)(Top|Right|Bottom|Left|Block|Inline)|^(marginX|marginY|paddingX|paddingY)$/i;
const NUDGE_VALUE = /^-?(2|3)px$|^-?0?\.125rem$|^-?0?\.1875rem$/;
const CALC_ONE_PX = /^calc\(.*[+-]\s*1px\s*\)$/i;

/** A 2-3px spacing tweak or a calc() off by 1px: an optical adjustment, not a scale value. */
export function valueIntent(property: string, value: string): IntentEvidence | null {
  const v = String(value).replace(/\s*!important\s*$/i, "").trim();
  if (!NUDGE_PROPERTY.test(property.trim())) return null;
  if (NUDGE_VALUE.test(v)) return { kind: "optical-nudge", reason: `${property}: ${v} is a 2-3px optical adjustment` };
  if (CALC_ONE_PX.test(v)) return { kind: "optical-nudge", reason: `${property}: ${v} offsets by a pixel` };
  return null;
}

const TAILWIND_NUDGE = /^-?(m|mx|my|mt|mr|mb|ml|ms|me|p|px|py|pt|pr|pb|pl|ps|pe|top|right|bottom|left|inset|inset-x|inset-y|start|end|translate-x|translate-y)-\[(-?(?:2|3)px|-?0?\.125rem|-?0?\.1875rem)\]$/;

/** Tailwind form of valueIntent: `mt-[3px]`, `-translate-y-[2px]`, `hover:px-[2px]`. */
export function tailwindValueIntent(fullClass: string): IntentEvidence | null {
  const core = fullClass.split(":").pop()!.replace(/^!/, "");
  return TAILWIND_NUDGE.test(core) ? { kind: "optical-nudge", reason: `${core} is a 2-3px optical adjustment` } : null;
}

// Commit subjects are terse; only clear statements of intent count.
const COMMIT_INTENT = /\b(workaround|hack|preserv(e|es|ed|ing) (the |existing |original |current |old )?(\w+ )?(css|styles?|styling|look|spacing|colou?rs?|padding|margins?|layout|design|appearance|brand\w*|sizes?|radius|shadows?)|intentional(ly)?|deliberate(ly)?|optical(ly)?|pixel[- ]?(perfect|push|nudge)|nudge|align(s|ed|ing|ment)?|misalign(ed|ment)?|off[- ]by[- ]one|match(es|ing)? (the )?(design|figma|mocks?|spec|brand)|per (design|figma|brand|spec)|(safari|firefox|webkit|ios|android|ie ?1[01]) (bug|fix|quirk|workaround)|browser (bug|quirk))\b/i;

/** Intent from the message of the commit that introduced the line. */
export function commitIntent(message: string): IntentEvidence | null {
  const subject = message.split("\n")[0] ?? "";
  if (/^(merge|revert|bump|chore\(deps\)|build\(deps\))\b/i.test(subject.trim())) return null;
  return COMMIT_INTENT.test(message) ? { kind: "history", reason: `commit: ${shorten(subject, 100)}` } : null;
}

/** Comment evidence first (most specific), then the value's shape. */
export function lineIntent(
  lines: readonly string[],
  lineIndex: number,
  candidate: { property?: string; value?: string; fullClass?: string },
): IntentEvidence | null {
  return commentIntent(lines, lineIndex)
    ?? (candidate.fullClass ? tailwindValueIntent(candidate.fullClass) : null)
    ?? (candidate.property && candidate.value !== undefined ? valueIntent(candidate.property, candidate.value) : null);
}
