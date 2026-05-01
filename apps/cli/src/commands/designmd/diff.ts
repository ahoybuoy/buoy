import { readFileSync } from "node:fs";
import { parseDesignMd } from "@buoy-design/core";

export interface DiffCliOptions {
  before: string;
  after: string;
}

export interface TokenDiff {
  added: string[];
  removed: string[];
  modified: string[];
}

export interface DiffCliResult {
  exitCode: 0 | 1;
  json: {
    tokens: {
      colors: TokenDiff;
      typography: TokenDiff;
      spacing: TokenDiff;
      rounded: TokenDiff;
      components: TokenDiff;
    };
    regression: boolean;
    summary: {
      before: { errors: number; warnings: number };
      after: { errors: number; warnings: number };
    };
  };
}

function diffSet<T>(
  before: Record<string, T> | undefined,
  after: Record<string, T> | undefined,
): TokenDiff {
  const a = before ?? {};
  const b = after ?? {};
  const added = Object.keys(b).filter((k) => !(k in a));
  const removed = Object.keys(a).filter((k) => !(k in b));
  const modified = Object.keys(b).filter(
    (k) => k in a && JSON.stringify(a[k]) !== JSON.stringify(b[k]),
  );
  return { added, removed, modified };
}

export function diffDesignMd(opts: DiffCliOptions): DiffCliResult {
  const before = parseDesignMd(readFileSync(opts.before, "utf8"));
  const after = parseDesignMd(readFileSync(opts.after, "utf8"));

  const tokens = {
    colors: diffSet(before.designSystem.colors, after.designSystem.colors),
    typography: diffSet(before.designSystem.typography, after.designSystem.typography),
    spacing: diffSet(before.designSystem.spacing, after.designSystem.spacing),
    rounded: diffSet(before.designSystem.rounded, after.designSystem.rounded),
    components: diffSet(before.designSystem.components, after.designSystem.components),
  };

  const regression =
    after.summary.errors > before.summary.errors ||
    after.summary.warnings > before.summary.warnings;

  return {
    exitCode: regression ? 1 : 0,
    json: {
      tokens,
      regression,
      summary: {
        before: { errors: before.summary.errors, warnings: before.summary.warnings },
        after: { errors: after.summary.errors, warnings: after.summary.warnings },
      },
    },
  };
}
