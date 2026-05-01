import { readFileSync } from "node:fs";
import { parseDesignMd, type DesignMdResult } from "@buoy-design/core";

export interface LintCliOptions {
  file: string;
}

export interface LintCliResult {
  exitCode: 0 | 1;
  json: DesignMdResult;
}

export function lintDesignMd(opts: LintCliOptions): LintCliResult {
  const source =
    opts.file === "-"
      ? readFileSync(0, "utf8") // stdin
      : readFileSync(opts.file, "utf8");
  const result = parseDesignMd(source);
  return {
    exitCode: result.summary.errors > 0 ? 1 : 0,
    json: result,
  };
}
