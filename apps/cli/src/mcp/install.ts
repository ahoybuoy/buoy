/**
 * Write the client-side config that connects an agent to `buoy mcp serve`.
 * Every target is a JSON file in the project; existing entries are kept.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type McpClient = "claude" | "cursor" | "codex" | "windsurf";
export const MCP_CLIENTS: McpClient[] = ["claude", "cursor", "codex", "windsurf"];

const SERVER_ENTRY = { command: "npx", args: ["-y", "@buoy-design/cli", "mcp", "serve"] };

const HOOK_ENTRY = {
  matcher: "Edit|Write|MultiEdit",
  hooks: [{ type: "command", command: "npx -y @buoy-design/cli mcp hook", timeout: 120 }],
};

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    throw new Error(`${path} is not valid JSON; fix or remove it and retry`);
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

/** Merge Buoy into an `mcpServers` map without touching other servers. */
export function mergeMcpServers(existing: Record<string, unknown>): Record<string, unknown> {
  const servers = (existing.mcpServers && typeof existing.mcpServers === "object" ? existing.mcpServers : {}) as Record<string, unknown>;
  return { ...existing, mcpServers: { ...servers, buoy: SERVER_ENTRY } };
}

/** Add the PostToolUse hook to Claude Code settings unless it is already there. */
export function mergeClaudeHook(existing: Record<string, unknown>): Record<string, unknown> {
  const hooks = (existing.hooks && typeof existing.hooks === "object" ? existing.hooks : {}) as Record<string, unknown>;
  const post = Array.isArray(hooks.PostToolUse) ? (hooks.PostToolUse as Array<Record<string, unknown>>) : [];
  const present = post.some((entry) => JSON.stringify(entry).includes("mcp hook"));
  return {
    ...existing,
    hooks: { ...hooks, PostToolUse: present ? post : [...post, HOOK_ENTRY] },
  };
}

export interface InstallResult {
  client: McpClient;
  files: string[];
}

export function installClient(client: McpClient, cwd: string, options: { hook?: boolean } = {}): InstallResult {
  const files: string[] = [];
  const upsert = (relative: string, merge: (v: Record<string, unknown>) => Record<string, unknown>) => {
    const path = join(cwd, relative);
    writeJson(path, merge(readJson(path)));
    files.push(relative);
  };

  switch (client) {
    case "claude":
      upsert(".mcp.json", mergeMcpServers);
      if (options.hook !== false) upsert(".claude/settings.json", mergeClaudeHook);
      break;
    case "cursor":
      upsert(".cursor/mcp.json", mergeMcpServers);
      break;
    case "windsurf":
      upsert(".windsurf/mcp.json", mergeMcpServers);
      break;
    case "codex":
      upsert(".codex/mcp.json", mergeMcpServers);
      break;
  }
  return { client, files };
}
