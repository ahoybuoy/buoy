/**
 * Library components a repo copied in: shadcn/ui puts its components in the
 * folder its components.json names (default components/ui). Their literals
 * are the library's design, not drift the team introduced, so findings there
 * are set aside as noted values instead of reported.
 *
 * Evidence is required: a components.json, and a file under its ui folder
 * whose name is a shadcn/ui component. A team's own components/forms/input.tsx
 * is never set aside.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { glob } from "glob";
import type { DriftSignal, NotedValue } from "@buoy-design/core";

/** shadcn/ui registry component names. */
export const SHADCN_COMPONENTS = new Set([
  "accordion", "alert", "alert-dialog", "aspect-ratio", "avatar", "badge", "breadcrumb", "button",
  "button-group", "calendar", "card", "carousel", "chart", "checkbox", "collapsible", "combobox",
  "command", "context-menu", "dialog", "drawer", "dropdown-menu", "empty", "field", "form",
  "hover-card", "input", "input-group", "input-otp", "item", "kbd", "label", "menubar",
  "navigation-menu", "pagination", "popover", "progress", "radio-group", "resizable", "scroll-area",
  "select", "separator", "sheet", "sidebar", "skeleton", "slider", "sonner", "spinner", "switch",
  "table", "tabs", "textarea", "toast", "toaster", "toggle", "toggle-group", "tooltip", "use-toast",
]);

/** The ui folders (relative to the repo root, trailing slash) named by every components.json. */
export async function shadcnUiDirs(projectRoot: string): Promise<string[]> {
  const configs = (await glob("**/components.json", {
    cwd: projectRoot,
    nodir: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/build/**"],
    maxDepth: 4,
  })).sort();
  const dirs = new Set<string>();
  for (const config of configs) {
    let json: { $schema?: string; aliases?: { ui?: string; components?: string } };
    try {
      json = JSON.parse(await readFile(join(projectRoot, config), "utf-8"));
    } catch {
      continue;
    }
    const isShadcn = /shadcn/.test(json.$schema ?? "") || (json.aliases && "components" in json.aliases);
    if (!isShadcn) continue;
    const base = dirname(config) === "." ? "" : `${dirname(config)}/`;
    const alias = json.aliases?.ui ?? `${json.aliases?.components ?? "@/components"}/ui`;
    // "@/components/ui" -> components/ui (and src/components/ui for src-based apps).
    const rel = alias.replace(/^[@~]\//, "").replace(/^\.\//, "").replace(/\/$/, "");
    if (rel.startsWith("@")) continue; // a workspace package alias (@acme/ui): its own repo folder
    dirs.add(`${base}${rel}/`);
    dirs.add(`${base}src/${rel}/`);
  }
  return [...dirs];
}

export function isVendoredFile(file: string, uiDirs: readonly string[]): boolean {
  const path = file.replace(/^\.\//, "");
  const dir = uiDirs.find((d) => path.startsWith(d));
  if (!dir) return false;
  const rest = path.slice(dir.length);
  if (rest.includes("/")) return false;
  return SHADCN_COMPONENTS.has(rest.replace(/\.(tsx|jsx|ts|js|vue|svelte)$/, ""));
}

/**
 * Move hardcoded-value findings in vendored library files out of the drift
 * list and into noted values, so they don't count as the team's drift.
 */
export function setAsideVendored(
  drifts: DriftSignal[],
  uiDirs: readonly string[],
): { drifts: DriftSignal[]; noted: NotedValue[] } {
  if (uiDirs.length === 0) return { drifts, noted: [] };
  const kept: DriftSignal[] = [];
  const noted: NotedValue[] = [];
  for (const drift of drifts) {
    const [file, line] = (drift.source.location ?? "").split(":");
    if (drift.type !== "hardcoded-value" || !file || !isVendoredFile(file, uiDirs)) {
      kept.push(drift);
      continue;
    }
    const values = (drift.details?.affectedFiles ?? []).map((a) => a.replace(/\s*\(line \d+\)$/, "").replace(/^[\w -]+:\s+/, ""));
    noted.push({
      file,
      line: Number(line) || 1,
      value: values.join(", ") || drift.message,
      kind: "vendored",
      reason: "shadcn/ui component (components.json)",
    });
  }
  return { drifts: kept, noted };
}
