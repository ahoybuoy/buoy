/**
 * `buoy mcp serve`: a stdio MCP server that gives coding agents this repo's
 * design tokens and drift checks, so hardcoded values are caught while the
 * agent writes instead of on the PR.
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
  const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

  server.registerTool(
    "list_design_tokens",
    {
      title: "List design tokens",
      description:
        "The design tokens defined in this repository (CSS custom properties, Tailwind theme, tokens.json, SCSS variables). Call this before writing any CSS, inline style or Tailwind class so you use an existing token instead of a literal value. Filter by category (color, spacing, typography, shadow, border, sizing, motion, zIndex) or a name substring.",
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
        ...(tokens.length === 0 ? { note: "No tokens found. Run `buoy dock tokens` to extract a token set from the values this codebase already uses." } : {}),
      });
    },
  );

  server.registerTool(
    "find_token_for_value",
    {
      title: "Find the token for a literal value",
      description:
        "Given a literal CSS value you are about to write (for example '#1a73e8', '16px', '0.5rem'), return the design tokens in this repository that have exactly that value. Use the token instead of the literal. An empty result means there is no token for it; prefer the nearest token from list_design_tokens over inventing a new value.",
      inputSchema: {
        value: z.string().describe("The literal value, e.g. '#ffffff' or '8px'"),
        category: z.string().optional().describe("Restrict to a category such as color or spacing"),
      },
    },
    async ({ value, category }) => {
      const matches = findTokensByValue(await getTokens(), value, category);
      return json({ value, matches, suggestion: matches[0] ? `Use ${matches[0].name} instead of ${value}` : null });
    },
  );

  server.registerTool(
    "check_design_drift",
    {
      title: "Check files for design drift",
      description:
        "Run Buoy's drift analysis and return hardcoded values, unknown tokens and inconsistent components, each with the token to use instead when one exists. Pass the files you just edited to check only those; omit files for the whole repository. Run this after editing styles and fix every issue that has a suggestion.",
      inputSchema: {
        files: z.array(z.string()).optional().describe("Repository-relative or absolute paths to limit the check to"),
      },
    },
    async ({ files }) => {
      const result = await checkDrift(await getProject(), files, files?.length ? await getTokens() : undefined);
      return json({
        ...result,
        instructions: result.issues.length === 0
          ? "No design drift in the checked files."
          : "Replace each `current` value with `suggested` (or one of `tokenSuggestions`), then run check_design_drift again.",
      });
    },
  );

  server.registerTool(
    "design_system_context",
    {
      title: "Design system overview",
      description:
        "A Markdown summary of this repository's design system: token categories with example names, the component library, and the anti-patterns Buoy flags. Read it once at the start of a task that touches UI.",
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

  return server;
}

export async function serveStdio(options: BuoyMcpOptions): Promise<void> {
  const server = createBuoyMcpServer(options);
  await server.connect(new StdioServerTransport());
}
