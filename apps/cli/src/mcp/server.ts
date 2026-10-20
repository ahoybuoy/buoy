/**
 * `buoy mcp serve`: a stdio MCP server that gives coding agents this repo's
 * design system and checks their UI against it, so off-system values are
 * caught while the agent writes instead of on the PR.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Component, DesignToken } from "@buoy-design/core";
import { generateContext } from "../services/context-generator.js";
import { ScanOrchestrator } from "../scan/orchestrator.js";
import {
  checkDrift,
  findTokensByValue,
  loadProject,
  summarizeToken,
  type ProjectContext,
} from "./project.js";
import { buildFileContext, type SourceFile } from "./file-context.js";
import { inferDesignSystem, normalizeLiteral, summarizeInferredSystem } from "../services/inferred-system.js";

const TOKEN_CACHE_MS = 30_000;
/** Without a filter, list_design_tokens returns a summary plus this many per category, not the whole system. */
const SLIM_PER_CATEGORY = 6;
const SOURCE_FILE = /\.(tsx|jsx|ts|js|vue|svelte|astro|css|scss|html)$/;
const MAX_NEIGHBORS = 20;
const MAX_NEIGHBOR_BYTES = 200_000;

export interface BuoyMcpOptions {
  cwd: string;
  version: string;
}

export function createBuoyMcpServer(options: BuoyMcpOptions): McpServer {
  const server = new McpServer({ name: "buoy", version: options.version });

  let project: ProjectContext | null = null;
  let scanCache: { at: number; tokens: DesignToken[]; components: Component[] } | null = null;

  const getProject = async () => (project ??= await loadProject(options.cwd));
  const getScan = async () => {
    if (scanCache && Date.now() - scanCache.at < TOKEN_CACHE_MS) return scanCache;
    const proj = await getProject();
    const result = await new ScanOrchestrator(proj.config, proj.projectRoot).scan();
    scanCache = { at: Date.now(), tokens: result.tokens, components: result.components };
    return scanCache;
  };
  const getTokens = async () => (await getScan()).tokens;
  let inferredCache: { at: number; system: ReturnType<typeof summarizeInferredSystem> | null } | null = null;
  // Repos with no tokens still have a de facto system: the values they use most.
  const getInferred = async () => {
    if (inferredCache && Date.now() - inferredCache.at < TOKEN_CACHE_MS) return inferredCache.system;
    const proj = await getProject();
    const system = await inferDesignSystem(proj.projectRoot, proj.config).catch(() => null);
    inferredCache = { at: Date.now(), system: system && system.tokens.length > 0 ? summarizeInferredSystem(system, 200) : null };
    return inferredCache.system;
  };
  const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

  server.registerTool(
    "list_design_tokens",
    {
      title: "List design tokens",
      description:
        "Get this repository's design system: the colors, spacing, typography, radius, shadow and motion values it defines (CSS custom properties, Tailwind theme, tokens.json, Sass variables, DESIGN.md). Without arguments it returns a short summary (counts plus a few tokens per category) to keep context small; pass a category or name substring for the full list. When you are about to edit a specific file, prefer context_for_file, which returns only what that file needs. Repos with no tokens get the values their code already uses most. Categories: color, spacing, typography, shadow, border, sizing, motion, zIndex.",
      inputSchema: {
        category: z.string().optional().describe("Only tokens in this category"),
        query: z.string().optional().describe("Case-insensitive substring of the token name"),
        limit: z.number().int().positive().max(500).optional().describe("Max tokens to return (default 200)"),
      },
    },
    async ({ category, query, limit }) => {
      const tokens = await getTokens();
      const q = query?.toLowerCase();
      const matched = tokens
        .filter((t) => !category || t.category === category)
        .filter((t) => !q || t.name.toLowerCase().includes(q));
      const byCategory: Record<string, number> = {};
      for (const t of tokens) byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
      if (!category && !q && !limit && tokens.length > 0) {
        const sample: Record<string, ReturnType<typeof summarizeToken>[]> = {};
        for (const t of tokens) {
          const list = (sample[t.category] ??= []);
          if (list.length < SLIM_PER_CATEGORY) list.push(summarizeToken(t));
        }
        return json({
          total: tokens.length,
          byCategory,
          sample,
          note: "Summary only. Pass category (or query) for the full list, or call context_for_file with the file you are editing to get just the tokens, scales and components it needs.",
        });
      }
      return json({
        total: tokens.length,
        byCategory,
        matched: matched.length,
        tokens: matched.slice(0, limit ?? 200).map(summarizeToken),
        ...(tokens.length === 0 ? await inferredFallback(category, q) : {}),
      });
    },
  );

  server.registerTool(
    "find_token_for_value",
    {
      title: "Find the token for a literal value",
      description:
        "Before you write a literal CSS value (for example '#1a73e8', '16px', '0.5rem'), find the design token in this repository that already holds it, and write the token instead. An empty result means no token has that value; pick the nearest one from list_design_tokens rather than inventing a new value.",
      inputSchema: {
        value: z.string().describe("The literal value, e.g. '#ffffff' or '8px'"),
        category: z.string().optional().describe("Restrict to a category such as color or spacing"),
      },
    },
    async ({ value, category }) => {
      const tokens = await getTokens();
      const matches = findTokensByValue(tokens, value, category);
      if (tokens.length === 0) {
        const inferred = await getInferred();
        const wanted = normalizeLiteral(value);
        const hit = inferred?.tokens.find((t) =>
          (!category || t.category === category) &&
          (normalizeLiteral(t.value) === wanted || t.replaces?.includes(wanted)));
        return json({
          value,
          matches: [],
          inferredMatch: hit ?? null,
          suggestion: hit
            ? `This repo has no tokens yet. Its most-used equivalent is ${hit.value} (${hit.uses} uses); write ${hit.value} so values stay consistent.`
            : null,
        });
      }
      return json({ value, matches, suggestion: matches[0] ? `Use ${matches[0].name} instead of ${value}` : null });
    },
  );

  server.registerTool(
    "context_for_file",
    {
      title: "Design context for the file you are editing",
      description:
        "Before you edit a UI file, get only the design context it needs: tokens the file already uses, tokens its neighbours use, the scale steps for the kinds of values it contains (colors, spacing, type, radius, shadow), components in the same folder or already imported that you should reuse, and the drift already in it. Much smaller than the full token list. Then write values from it and run check_ui_against_design_system on the file.",
      inputSchema: {
        file: z.string().describe("Repository-relative or absolute path of the file you are about to edit (it may not exist yet)"),
      },
    },
    async ({ file }) => {
      const proj = await getProject();
      const abs = isAbsolute(file) ? file : resolve(proj.projectRoot, file);
      const rel = relative(proj.projectRoot, abs);
      if (rel.startsWith("..") || isAbsolute(rel)) {
        return json({ error: `${file} is outside the repository (${proj.projectRoot}).` });
      }
      const content = await readFile(abs, "utf8").catch(() => "");
      const neighbors = await readNeighbors(proj.projectRoot, rel);
      const { tokens, components } = await getScan();
      const issues = content ? (await checkDrift(proj, [rel], tokens)).issues : [];
      const context = buildFileContext({ file: { path: rel, content }, neighbors, tokens, components, issues });
      // Compact JSON: this tool exists to keep context small.
      const body = tokens.length === 0 ? { ...context, ...(await inferredFallback()) } : context;
      return { content: [{ type: "text" as const, text: JSON.stringify(body) }] };
    },
  );

  server.registerTool(
    "check_ui_against_design_system",
    {
      title: "Check UI code against the design system",
      description:
        "After you edit UI code, check it against this repository's design system before you finish. Returns every hardcoded color, spacing, font, radius or shadow that should be a token, with the token to use. When an issue has an `edit`, replace line `edit.line` (currently `edit.before`) with `edit.after` exactly; it is a verified one-line swap. Pass the files you edited to check only those (fast); omit files to check the whole repository. Re-run until it reports no issues.",
      inputSchema: {
        files: z.array(z.string()).optional().describe("Repository-relative or absolute paths to limit the check to"),
      },
    },
    async ({ files }) => {
      const result = await checkDrift(await getProject(), files, files?.length ? await getTokens() : undefined);
      return json({
        ...result,
        instructions: result.issues.length === 0
          ? "The checked files match the design system."
          : "Apply each `edit` as given. For issues without one, replace `current` with `suggested` (or one of `tokenSuggestions`). Then run check_ui_against_design_system again.",
      });
    },
  );

  server.registerTool(
    "design_system_context",
    {
      title: "Design system overview",
      description:
        "Read this once at the start of any task that builds or changes UI. A Markdown summary of this repository's design system: token categories with example names, the existing components to reuse before creating new ones, and the patterns to avoid.",
      inputSchema: {
        detail: z.enum(["minimal", "standard", "comprehensive"]).optional().describe("How much to include (default standard)"),
      },
    },
    async ({ detail }) => {
      const proj = await getProject();
      const orchestrator = new ScanOrchestrator(proj.config, proj.projectRoot);
      const scan = await orchestrator.scan();
      const { SemanticDiffEngine } = await import("@buoy-design/core/analysis");
      const diff = new SemanticDiffEngine().analyzeComponents(scan.components, { availableTokens: scan.tokens });
      const result = generateContext(
        { tokens: scan.tokens, components: scan.components, drifts: diff.drifts, projectName: proj.projectRoot.split("/").pop() || "project" },
        { detailLevel: detail ?? "standard" },
      );
      return { content: [{ type: "text" as const, text: result.content }] };
    },
  );

  async function inferredFallback(category?: string, q?: string) {
    const inferred = await getInferred();
    if (!inferred) {
      return { note: "No tokens found and no repeated hardcoded values to infer from." };
    }
    return {
      note: "This repo has no design tokens yet. `inferred` is the system its code already uses (most-used values, near-duplicates merged). Reuse these exact values instead of inventing new ones, and prefer `use` over each `insteadOf` value. `buoy dock tokens` turns them into a tokens file.",
      inferred: {
        ...inferred,
        tokens: inferred.tokens
          .filter((t) => !category || t.category === category)
          .filter((t) => !q || t.name.toLowerCase().includes(q)),
      },
    };
  }

  return server;
}

/** Source files in the same folder and its parent, so "used nearby" reflects the area being edited. */
async function readNeighbors(root: string, rel: string): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  let bytes = 0;
  const dir = dirname(rel);
  for (const folder of dir === "." ? ["."] : [dir, dirname(dir)]) {
    const entries = await readdir(join(root, folder), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (out.length >= MAX_NEIGHBORS || bytes >= MAX_NEIGHBOR_BYTES) return out;
      const path = folder === "." ? entry.name : join(folder, entry.name);
      if (!entry.isFile() || path === rel || !SOURCE_FILE.test(entry.name)) continue;
      const content = await readFile(join(root, path), "utf8").catch(() => "");
      bytes += content.length;
      out.push({ path, content });
    }
  }
  return out;
}

export async function serveStdio(options: BuoyMcpOptions): Promise<void> {
  const server = createBuoyMcpServer(options);
  await server.connect(new StdioServerTransport());
}
