import { stringify as stringifyYaml } from "yaml";
import { TokenScanner } from "@buoy-design/scanners";
import type { DesignToken } from "@buoy-design/core";

export interface GenerateOptions {
  name: string;
  tokens: DesignToken[];
}

type DesignMdEntry = {
  kind: "color" | "spacing" | "rounded";
  name: string;
  value: string;
};

/**
 * Map a DesignToken's discriminated `value` union to a DESIGN.md primitive
 * entry, or return null when the token doesn't fit one of the v1 buckets
 * (typography, shadow, sizing, motion, zIndex, other, plain border).
 */
function tokenToDesignMdEntry(token: DesignToken): DesignMdEntry | null {
  const value = token.value;

  switch (value.type) {
    case "color":
      if (token.category === "color") {
        return { kind: "color", name: token.name, value: value.hex };
      }
      return null;

    case "spacing":
      if (token.category === "spacing") {
        return {
          kind: "spacing",
          name: token.name,
          value: `${value.value}${value.unit}`,
        };
      }
      return null;

    case "border":
      // Border itself isn't a DESIGN.md primitive, but its radius is.
      if (typeof value.radius === "number") {
        return { kind: "rounded", name: token.name, value: `${value.radius}px` };
      }
      return null;

    case "raw":
      // For raw tokens we trust the category to route them.
      if (token.category === "color") {
        return { kind: "color", name: token.name, value: value.value };
      }
      if (token.category === "spacing") {
        return { kind: "spacing", name: token.name, value: value.value };
      }
      return null;

    case "typography":
    case "shadow":
    default:
      return null;
  }
}

export function generateDesignMd(opts: GenerateOptions): string {
  const colors: Record<string, string> = {};
  const spacing: Record<string, string> = {};
  const rounded: Record<string, string> = {};

  for (const token of opts.tokens) {
    const entry = tokenToDesignMdEntry(token);
    if (!entry) continue;

    if (entry.kind === "color") colors[entry.name] = entry.value;
    else if (entry.kind === "spacing") spacing[entry.name] = entry.value;
    else if (entry.kind === "rounded") rounded[entry.name] = entry.value;
  }

  const frontMatter: Record<string, unknown> = {
    version: "alpha",
    name: opts.name,
  };
  if (Object.keys(colors).length > 0) frontMatter.colors = colors;
  if (Object.keys(spacing).length > 0) frontMatter.spacing = spacing;
  if (Object.keys(rounded).length > 0) frontMatter.rounded = rounded;

  const yaml = stringifyYaml(frontMatter);
  return `---\n${yaml}---\n\n## Overview\n\n_Describe the design language here. Replace this with your team's voice and intent._\n`;
}

/**
 * Run token discovery against a project root and produce a DESIGN.md string.
 *
 * Wires `buoy designmd init` to the real scanner pipeline used by `compare`,
 * so the same CSS / SCSS / JSON sources feed both commands.
 */
export async function discoverAndGenerate(opts: {
  cwd: string;
  name: string;
}): Promise<string> {
  const scanner = new TokenScanner({
    projectRoot: opts.cwd,
    include: ["**/*.css", "**/*.scss", "**/*.json"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/*.min.css"],
  });
  const scanResult = await scanner.scan();
  return generateDesignMd({ name: opts.name, tokens: scanResult.items });
}
