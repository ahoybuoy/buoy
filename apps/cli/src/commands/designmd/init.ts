import { stringify as stringifyYaml } from "yaml";
import type { DesignToken } from "@buoy-design/core";

export interface GenerateOptions {
  name: string;
  tokens: DesignToken[];
}

export function generateDesignMd(opts: GenerateOptions): string {
  const colors: Record<string, string> = {};
  const spacing: Record<string, string> = {};
  const rounded: Record<string, string> = {};

  for (const t of opts.tokens) {
    const raw = String((t as { value?: { raw?: unknown } }).value?.raw ?? "");
    if (raw === "") continue;
    const category = t.category as string;
    if (category === "color") colors[t.name] = raw;
    else if (category === "spacing") spacing[t.name] = raw;
    else if (category === "radius" || category === "rounded") {
      rounded[t.name] = raw;
    }
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
