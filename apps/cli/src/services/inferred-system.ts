/**
 * Infer a design system from the values a codebase already uses.
 *
 * For repos with no tokens, this is the system they actually have: the most
 * used colors and spacing, with near-duplicate shades grouped together.
 * `buoy dock tokens` writes it out; `buoy scan` and the MCP server show it.
 */
import { relative } from "path";
import { readFile } from "fs/promises";
import { glob } from "glob";
import {
  extractStyles,
  extractCssFileStyles,
  type TemplateType,
} from "@buoy-design/scanners";
import {
  parseCssValues,
  generateTokens,
  type ExtractedValue,
  type GeneratedToken,
  type TokenGenerationResult,
} from "@buoy-design/core";
import type { BuoyConfig } from "../config/schema.js";

export type SourceFile = { path: string; type: TemplateType | "css" };

export async function findStyleSources(cwd: string, config: BuoyConfig): Promise<SourceFile[]> {
  const filesToScan: SourceFile[] = [];
  const sources = config.sources || {};

  const componentSources = [
    { key: "react", patterns: sources.react?.include || ["src/**/*.tsx", "src/**/*.jsx"] },
    { key: "vue", patterns: sources.vue?.include || ["src/**/*.vue"] },
    { key: "svelte", patterns: sources.svelte?.include || ["src/**/*.svelte"] },
  ];

  for (const { key, patterns } of componentSources) {
    if (sources[key as keyof typeof sources]?.enabled !== false) {
      for (const pattern of patterns) {
        const files = (await glob(pattern, {
          cwd,
          ignore: ["**/node_modules/**", "**/dist/**", "**/*.test.*", "**/*.stories.*"],
          absolute: true,
        })).sort();
        for (const file of files) filesToScan.push({ path: file, type: key as TemplateType });
      }
    }
  }

  if (sources.templates?.enabled) {
    for (const pattern of sources.templates.include || []) {
      const files = (await glob(pattern, { cwd, ignore: sources.templates.exclude || [], absolute: true })).sort();
      for (const file of files) filesToScan.push({ path: file, type: sources.templates.type as TemplateType });
    }
  }

  const cssIgnore = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/*.min.css"];
  for (const pattern of ["**/*.css", "**/*.scss"]) {
    const files = (await glob(pattern, { cwd, ignore: cssIgnore, absolute: true })).sort();
    for (const file of files) filesToScan.push({ path: file, type: "css" });
  }

  return filesToScan;
}

export async function extractValues(cwd: string, files: SourceFile[]): Promise<ExtractedValue[]> {
  const allValues: ExtractedValue[] = [];
  for (const { path: filePath, type } of files) {
    try {
      const content = await readFile(filePath, "utf-8");
      const styles = type === "css" ? extractCssFileStyles(content) : extractStyles(content, type);
      for (const style of styles) {
        const { values } = parseCssValues(style.css);
        for (const v of values) {
          v.file = relative(cwd, filePath);
          if (style.line) v.line = style.line;
        }
        allValues.push(...values);
      }
    } catch {
      // Skip files that can't be read
    }
  }
  return allValues;
}

export interface InferredSystem {
  filesScanned: number;
  valuesFound: number;
  result: TokenGenerationResult;
  /** Tokens worth adopting (used often enough), most used first. */
  tokens: GeneratedToken[];
  /** Color tokens that absorbed more than one distinct literal. */
  nearDuplicates: { token: GeneratedToken; variants: string[] }[];
  /** Distinct literal colors in the codebase vs. inferred palette size. */
  distinctColors: number;
}

export async function inferDesignSystem(
  cwd: string,
  config: BuoyConfig,
  options: { prefix?: string } = {},
): Promise<InferredSystem | null> {
  const files = await findStyleSources(cwd, config);
  if (files.length === 0) return null;
  const values = await extractValues(cwd, files);
  if (values.length === 0) return null;

  const result = generateTokens(values, { prefix: options.prefix || "" });
  const tokens = result.tokens
    .filter((t) => !t.isOrphan)
    .sort((a, b) => b.occurrences - a.occurrences);
  const nearDuplicates = tokens
    .map((t) => ({ token: t, variants: [...new Set(t.sources.map(normalizeLiteral))] }))
    .filter(({ token, variants }) => token.category === "color" && variants.length > 1);
  const distinctColors = new Set(
    values.filter((v) => v.category === "color").map((v) => normalizeLiteral(v.value)),
  ).size;

  return { filesScanned: files.length, valuesFound: values.length, result, tokens, nearDuplicates, distinctColors };
}

/** Plain-object view for JSON output and the MCP server. */
export function summarizeInferredSystem(system: InferredSystem, limit = 40) {
  const byCategory: Record<string, number> = {};
  for (const t of system.tokens) byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
  return {
    inferred: true as const,
    filesScanned: system.filesScanned,
    valuesFound: system.valuesFound,
    distinctColors: system.distinctColors,
    byCategory,
    tokens: system.tokens.slice(0, limit).map((t) => ({
      name: `--${t.name}`,
      category: t.category,
      value: t.value,
      uses: t.occurrences,
      // Only colors: spacing/type clustering is too coarse to tell an agent "use X instead".
      ...(t.category === "color" && new Set(t.sources.map(normalizeLiteral)).size > 1
        ? { replaces: [...new Set(t.sources.map(normalizeLiteral))] }
        : {}),
    })),
    nearDuplicates: system.nearDuplicates.map(({ token, variants }) => ({
      use: token.value,
      insteadOf: variants.filter((v) => v !== normalizeLiteral(token.value)),
    })),
  };
}

/** Terminal block for `buoy scan` when the repo has no tokens. */
export function formatInferredSystem(system: InferredSystem, chalk: typeof import("chalk").default): string {
  const lines: string[] = [];
  const colors = system.tokens.filter((t) => t.category === "color");
  const spacing = system.tokens.filter((t) => t.category === "spacing");
  const radius = system.tokens.filter((t) => t.category === "radius");
  const fontSizes = system.tokens.filter((t) => t.category === "font-size");

  lines.push(chalk.bold("No design tokens yet. Here is the system your code already uses:"));
  lines.push(chalk.dim(`  ${system.valuesFound} hardcoded values across ${system.filesScanned} ${system.filesScanned === 1 ? "file" : "files"}`));
  lines.push("");

  if (colors.length > 0) {
    lines.push(`  ${chalk.bold("Colors")} ${chalk.dim(`${system.distinctColors} distinct values → ${colors.length} colors`)}`);
    for (const t of colors.slice(0, 8)) {
      lines.push(`    ${chalk.hex(safeHex(t.value))("■")} ${t.value.padEnd(10)} ${chalk.dim(`${t.occurrences} uses`)}`);
    }
    if (colors.length > 8) lines.push(chalk.dim(`    …and ${colors.length - 8} more`));
    lines.push("");
  }
  const scale = (label: string, list: GeneratedToken[]) => {
    if (list.length === 0) return;
    const values = [...list].sort((a, b) => parseFloat(a.value) - parseFloat(b.value)).map((t) => t.value);
    lines.push(`  ${chalk.bold(label)} ${values.join("  ")}`);
  };
  scale("Spacing", spacing);
  scale("Radius ", radius);
  scale("Type   ", fontSizes);
  if (spacing.length + radius.length + fontSizes.length > 0) lines.push("");

  if (system.nearDuplicates.length > 0) {
    lines.push(chalk.yellow(`  ${system.nearDuplicates.length} near-duplicate colors to merge:`));
    for (const { token, variants } of system.nearDuplicates.slice(0, 5)) {
      const others = variants.filter((v) => v !== normalizeLiteral(token.value));
      lines.push(`    ${others.join(", ")} ${chalk.dim("→")} ${token.value}`);
    }
    if (system.nearDuplicates.length > 5) lines.push(chalk.dim(`    …and ${system.nearDuplicates.length - 5} more`));
    lines.push("");
  }

  lines.push(`  ${chalk.cyan("buoy dock tokens")} ${chalk.dim("writes these as a tokens file; your agents and reviews will use it.")}`);
  return lines.join("\n");
}

function safeHex(value: string): string {
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value.slice(0, 7) : "#888888";
}

/** `#FFF` and `#ffffff` are the same literal. */
export function normalizeLiteral(value: string): string {
  const v = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : v;
}
