/**
 * Detects parts of a single source file whose styling cannot be verified
 * from that file alone. "No findings" only means "clean" when nothing was
 * left unverified, so callers report this next to the drift result.
 */

export type UnverifiedKind =
  | "style-module-import"
  | "token-import"
  | "dynamic-css-variable";

export interface UnverifiedSource {
  kind: UnverifiedKind;
  line: number;
  snippet: string;
  reason: string;
}

export interface SourceVerification {
  status: "complete" | "partial";
  unverified: UnverifiedSource[];
}

const STYLE_IMPORT = /^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+\.(?:css|scss|sass|less|styl))['"]/;
const RELATIVE_IMPORT = /^\s*import\s+[^'"]*?\s+from\s+['"](\.{1,2}\/[^'"]*)['"]/;
const TOKEN_PATH = /(token|theme|design-system|designsystem)/i;
const DYNAMIC_VAR = /var\(\s*--[\w-]*\$\{[^}]*\}[\w-]*/;

export function verifySource(content: string): SourceVerification {
  const unverified: UnverifiedSource[] = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((text, i) => {
    const line = i + 1;
    const snippet = text.trim().slice(0, 120);

    const style = STYLE_IMPORT.exec(text);
    if (style) {
      unverified.push({
        kind: "style-module-import",
        line,
        snippet,
        reason: `Styles live in ${style[1]}, which was not checked`,
      });
      return;
    }

    const rel = RELATIVE_IMPORT.exec(text);
    if (rel && TOKEN_PATH.test(rel[1]!)) {
      unverified.push({
        kind: "token-import",
        line,
        snippet,
        reason: `Values come from ${rel[1]}, which was not checked`,
      });
      return;
    }

    if (DYNAMIC_VAR.test(text)) {
      unverified.push({
        kind: "dynamic-css-variable",
        line,
        snippet,
        reason: "CSS variable name is built at runtime, so it cannot be matched to a token",
      });
    }
  });

  return { status: unverified.length === 0 ? "complete" : "partial", unverified };
}

export function formatVerificationNotice(v: SourceVerification): string[] {
  if (v.status === "complete") return [];
  const n = v.unverified.length;
  const out = [`~ Partial: ${n} style source${n === 1 ? "" : "s"} could not be verified`];
  for (const u of v.unverified.slice(0, 5)) out.push(`  line ${u.line}: ${u.reason}`);
  if (n > 5) out.push(`  ...and ${n - 5} more`);
  return out;
}
