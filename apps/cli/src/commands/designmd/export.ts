import { readFileSync } from "node:fs";
import { parseDesignMd, type DesignMdSystem } from "@buoy-design/core";

export type ExportFormat = "tailwind" | "dtcg";

export interface ExportCliOptions {
  file: string;
  format: ExportFormat;
}

export interface ExportCliResult {
  exitCode: 0 | 1;
  stdout: string;
}

function toTailwind(ds: DesignMdSystem): unknown {
  return {
    theme: {
      colors: ds.colors ?? {},
      spacing: ds.spacing ?? {},
      borderRadius: ds.rounded ?? {},
      fontFamily: Object.fromEntries(
        Object.entries(ds.typography ?? {}).map(([k, v]) => [
          k,
          [(v as { fontFamily?: string }).fontFamily ?? "sans-serif"],
        ]),
      ),
    },
  };
}

function toDtcg(ds: DesignMdSystem): unknown {
  const out: Record<string, Record<string, { $value: unknown; $type: string }>> = {};
  if (ds.colors) {
    out.color = Object.fromEntries(
      Object.entries(ds.colors).map(([k, v]) => [k, { $value: v, $type: "color" }]),
    );
  }
  if (ds.spacing) {
    out.dimension = Object.fromEntries(
      Object.entries(ds.spacing).map(([k, v]) => [k, { $value: v, $type: "dimension" }]),
    );
  }
  return out;
}

export function exportDesignMd(opts: ExportCliOptions): ExportCliResult {
  const source = readFileSync(opts.file, "utf8");
  const result = parseDesignMd(source);
  if (result.summary.errors > 0) {
    return { exitCode: 1, stdout: JSON.stringify(result, null, 2) };
  }
  const out =
    opts.format === "tailwind"
      ? toTailwind(result.designSystem)
      : toDtcg(result.designSystem);
  return { exitCode: 0, stdout: JSON.stringify(out, null, 2) };
}
