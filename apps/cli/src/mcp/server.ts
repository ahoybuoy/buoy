/**
 * `buoy mcp serve`: a stdio MCP server that gives coding agents this repo's
 * design system and checks their UI against it, so off-system values are
 * caught while the agent writes instead of on the PR.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { DesignToken } from "@buoy-design/core";
import { generateContext } from "../services/context-generator.js";
import { ScanOrchestrator } from "../scan/orchestrator.js";
import {
  checkDrift,
  findTokensByValue,
  loadProject,
  scanTokens,
  summarizeToken,
  type ProjectContext,
} from "./project.js";
import { inferDesignSystem, normalizeLiteral, summarizeInferredSystem } from "../services/inferred-system.js";

const TOKEN_CACHE_MS = 30_000;

export interface BuoyMcpOptions {
  cwd: string;
  version: string;
}

export function createBuoyMcpServer(options: BuoyMcpOptions): McpServer {
  const server = new McpServer({ name: "buoy", version: options.version });

  let project: ProjectContext | null = null;
  let tokenCache: { at: number; tokens: DesignToken[] } | null = null;

  const getProject = async () => (project ??= await loadProject(options.cwd));
  const getTokens = async () => {
    if (tokenCache && Date.now() - tokenCache.at < TOKEN_CACHE_MS) return tokenCache.tokens;
    const tokens = await scanTokens(await getProject());
    tokenCache = { at: Date.now(), tokens };
    return tokens;
  };
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
        "Get this repository's design system: the colors, spacing, typography, radius, shadow and motion values it defines (CSS custom properties, Tailwind theme, tokens.json, Sass variables, DESIGN.md). Call this before writing any CSS, inline style or Tailwind class, so the UI you write uses the project's values instead of new ones. Repos with no tokens get the values their code already uses most. Filter by category (color, spacing, typography, shadow, border, sizing, motion, zIndex) or a name substring.",
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

export async function serveStdio(options: BuoyMcpOptions): Promise<void> {
  const server = createBuoyMcpServer(options);
  await server.connect(new StdioServerTransport());
}
