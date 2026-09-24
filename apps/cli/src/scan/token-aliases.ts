/**
 * CSS variable aliases for tokens.json paths (see TokenConfigSchema.cssVariables).
 * Style Dictionary / Tokens Studio repos emit their JSON tokens as custom
 * properties at build or run time; the scanner only sees the JSON.
 */
import type { DesignToken } from "@buoy-design/core";

export interface CssVariableConvention {
  prefix: string;
  separator: string;
}

export function cssVariableFor(name: string, convention: CssVariableConvention): string | null {
  if (name.startsWith("--") || name.startsWith("$")) return null;
  const path = name.split(".").map((p) => p.trim()).filter(Boolean).join(convention.separator);
  if (!path) return null;
  const prefix = convention.prefix.replace(/^-+|-+$/g, "");
  return prefix ? `--${prefix}-${path}` : `--${path}`;
}

export function withCssVariableAliases(tokens: DesignToken[], convention?: CssVariableConvention): DesignToken[] {
  if (!convention) return tokens;
  const known = new Set(tokens.map((t) => t.name.toLowerCase()));
  const aliases: DesignToken[] = [];
  for (const token of tokens) {
    const name = cssVariableFor(token.name, convention);
    if (!name || known.has(name.toLowerCase())) continue;
    known.add(name.toLowerCase());
    aliases.push({ ...token, id: `${token.id}:css-var`, name, aliases: [...(token.aliases ?? []), token.name] });
  }
  return aliases.length ? [...tokens, ...aliases] : tokens;
}
