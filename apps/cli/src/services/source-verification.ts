/**
 * Detects parts of a single source file whose styling cannot be verified
 * from that file alone. "No findings" only means "clean" when nothing was
 * left unverified, so callers report this next to the drift result.
 *
 * Every rule here is deliberately conservative: it fires only when the file
 * visibly depends on something that was not checked (an imported binding that
 * the file actually uses, or a CSS variable name built at runtime). Anything
 * ambiguous stays silent, because a false notice costs more than a miss.
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

const IMPORT = /^\s*import\s+(?!type\b)([^'"]+?)\s+from\s+['"]([^'"]+)['"]/;
const STYLE_FILE = /\.(?:css|scss|sass|less|styl)$/;
const TOKEN_PATH = /(token|theme|design-system|designsystem)/i;
// Names that hold values. Providers, hooks, contexts and types (ThemeProvider,
// useTheme, ThemeContext) hold none, so they never match.
const VALUE_NAME = /^(tokens?|theme|designTokens?|colou?rs?|spacing|palette|radii|radius|typography)$|Tokens?$/;
const DYNAMIC_VAR = /var\(\s*--[\w-]*\$\{[^}]*\}[\w-]*/;

interface Binding {
  imported: string;
  local: string;
}

function bindings(clause: string): Binding[] {
  const out: Binding[] = [];
  const braces = /\{([^}]*)\}/.exec(clause);
  if (braces) {
    for (const part of braces[1]!.split(",")) {
      const t = part.trim();
      if (!t || t.startsWith("type ")) continue;
      const [imported, local] = t.split(/\s+as\s+/);
      out.push({ imported: imported!.trim(), local: (local ?? imported)!.trim() });
    }
  }
  const rest = clause
    .replace(/\{[^}]*\}/, "")
    .replace(/\*\s+as\s+/, "")
    .replace(/,/g, " ")
    .trim();
  for (const name of rest.split(/\s+/).filter(Boolean)) out.push({ imported: name, local: name });
  return out;
}

function usedAsObject(content: string, importLine: number, local: string): boolean {
  const escaped = local.replace(/[$]/g, "\\$");
  const use = new RegExp(`(?<![\\w$.])${escaped}\\s*(?:\\.|\\[|\\?\\.)`);
  return content
    .split(/\r?\n/)
    .some((text, i) => i + 1 !== importLine && use.test(text));
}

// Only files that can hold component styling. A .ts library that builds a
// "var(--x-${n})" string as data (a code generator, a test) is not styling.
const UI_FILE = /\.(?:tsx|jsx|vue|svelte|astro|html|mdx)$/i;
const TEST_FILE = /\.(?:test|spec|stories)\.[a-z]+$|__tests__/i;

export function verifySource(content: string, filename?: string): SourceVerification {
  if (filename && (!UI_FILE.test(filename) || TEST_FILE.test(filename))) {
    return { status: "complete", unverified: [] };
  }
  const unverified: UnverifiedSource[] = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((text, i) => {
    const line = i + 1;
    const snippet = text.trim().slice(0, 120);
    const imp = IMPORT.exec(text);

    if (imp) {
      const [, clause, spec] = imp as unknown as [string, string, string];
      const names = bindings(clause);

      if (STYLE_FILE.test(spec)) {
        if (names.some((b) => usedAsObject(content, line, b.local))) {
          unverified.push({
            kind: "style-module-import",
            line,
            snippet,
            reason: `Styles live in ${spec}, which was not checked`,
          });
        }
        return;
      }

      if (/^\.{1,2}\//.test(spec) && TOKEN_PATH.test(spec)) {
        const hit = names.some(
          (b) =>
            (VALUE_NAME.test(b.imported) || VALUE_NAME.test(b.local)) &&
            usedAsObject(content, line, b.local),
        );
        if (hit) {
          unverified.push({
            kind: "token-import",
            line,
            snippet,
            reason: `Values come from ${spec}, which was not checked`,
          });
        }
      }
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
