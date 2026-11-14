import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { formatVerificationNotice, verifySource } from "./source-verification.js";

const dir = join(__dirname, "__fixtures__/equivalence/variants");
const read = (f: string) => readFileSync(join(dir, f), "utf8");
const byPrefix = (p: string) => readdirSync(dir).filter((f) => f.startsWith(p));

describe("verifySource", () => {
  it("marks a CSS module import as partial", () => {
    const v = verifySource(read(byPrefix("e06")[0]!));
    expect(v.status).toBe("partial");
    expect(v.unverified[0]).toMatchObject({ kind: "style-module-import", line: 2 });
  });

  it("marks a relative token import as partial", () => {
    const v = verifySource(read(byPrefix("e02")[0]!));
    expect(v.status).toBe("partial");
    expect(v.unverified[0]!.kind).toBe("token-import");
  });

  it("marks a runtime-built CSS variable name as partial", () => {
    const v = verifySource(read(byPrefix("e08")[0]!));
    expect(v.status).toBe("partial");
    expect(v.unverified[0]!.kind).toBe("dynamic-css-variable");
  });

  it("treats self-contained equivalents as complete", () => {
    for (const p of ["e01", "e03", "e05", "e07", "e09", "e10"]) {
      expect(verifySource(read(byPrefix(p)[0]!)).status, p).toBe("complete");
    }
  });

  it("does not hide drift controls as unverified", () => {
    for (const f of byPrefix("d")) expect(verifySource(read(f)).status, f).toBe("complete");
  });

  it("does not flag providers, hooks, contexts, or type-only imports", () => {
    const src = [
      "import { ThemeProvider } from './theme';",
      "import { useTheme } from '../theme/hooks';",
      "import { ThemeContext } from './theme-context';",
      "import type { Theme } from './theme';",
      "import { type Tokens } from './tokens';",
    ].join("\n");
    expect(verifySource(src).status).toBe("complete");
  });

  it("flags value-object imports, including aliases and default imports", () => {
    expect(verifySource("import { tokens as t } from './tokens';\nconst c = t.colors.primary;").status).toBe("partial");
    expect(verifySource("import theme from '../theme';\nconst c = theme.x;").status).toBe("partial");
    expect(verifySource("import { designTokens } from './design-system';\nconst c = designTokens.x;").status).toBe("partial");
  });

  it("stays silent when an import is unused, side-effect only, or not a value", () => {
    expect(verifySource("import './globals.css';").status).toBe("complete");
    expect(verifySource("import styles from './a.module.css';\nexport const A = 1;").status).toBe("complete");
    expect(verifySource("import { tokens } from './tokens';\nexport type T = typeof tokens;").status).toBe("complete");
    expect(verifySource("import { colors } from './utils';\nconst x = colors.a;").status).toBe("complete");
  });

  it("does not match a name that only appears as a property of something else", () => {
    expect(verifySource("import { tokens } from './tokens';\nconst a = other.tokens.x;").status).toBe("complete");
  });

  it("ignores non-UI and test files that build CSS strings as data", () => {
    const gen = "const ref = `var(--radius-${suffix})`;";
    expect(verifySource(gen, "src/lib/suggestion-builder.ts").status).toBe("complete");
    expect(verifySource(gen, "src/lib/review.test.tsx").status).toBe("complete");
    expect(verifySource(gen, "src/components/Button.tsx").status).toBe("partial");
  });

  it("formats a notice only when partial", () => {
    expect(formatVerificationNotice({ status: "complete", unverified: [] })).toEqual([]);
    const notice = formatVerificationNotice(verifySource(read(byPrefix("e06")[0]!)));
    expect(notice[0]).toBe("~ Partial: 1 style source could not be verified");
  });
});
