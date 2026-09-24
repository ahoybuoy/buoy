/**
 * buoy mcp - Connect coding agents to this repo's design system.
 *
 *   buoy mcp serve            stdio MCP server (tokens, drift checks, context)
 *   buoy mcp install [client] write .mcp.json / .cursor/mcp.json and the Claude Code hook
 *   buoy mcp hook             Claude Code PostToolUse hook: check the edited file
 */
import { Command } from "commander";
import pkg from "../../package.json" with { type: "json" };
import { installClient, MCP_CLIENTS, type McpClient } from "../mcp/install.js";
import { filePathFromHookPayload, runHook } from "../mcp/hook.js";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export function createMcpCommand(): Command {
  const cmd = new Command("mcp").description("Connect coding agents (Claude Code, Cursor, Codex) to your design system");

  cmd
    .command("serve")
    .description("Run the MCP server over stdio (agents start this for you)")
    .action(async () => {
      const { serveStdio } = await import("../mcp/server.js");
      await serveStdio({ cwd: process.cwd(), version: pkg.version });
    });

  cmd
    .command("install [client]")
    .description(`Write agent config for ${MCP_CLIENTS.join(", ")} or "all" (default: claude)`)
    .option("--no-hook", "Skip the Claude Code PostToolUse drift hook")
    .action((client: string | undefined, options: { hook: boolean }) => {
      const wanted = client === "all" ? MCP_CLIENTS : [(client ?? "claude") as McpClient];
      for (const c of wanted) {
        if (!MCP_CLIENTS.includes(c)) {
          console.error(`Unknown client "${c}". Choose one of: ${MCP_CLIENTS.join(", ")}, all`);
          process.exit(1);
        }
      }
      for (const c of wanted) {
        try {
          const result = installClient(c, process.cwd(), { hook: options.hook });
          console.log(`${c}: wrote ${result.files.join(", ")}`);
        } catch (error) {
          // e.g. an existing config that is not valid JSON: never overwrite it.
          console.error(`${c}: ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        }
      }
      console.log("");
      console.log("Agents in this repo can now call list_design_tokens, find_token_for_value, check_design_drift and design_system_context.");
      if (wanted.includes("claude") && options.hook !== false) {
        console.log("Claude Code will also get drift feedback after every Edit/Write of a style file.");
      }
      console.log("");
      console.log("Catch what agents and people miss on every pull request, free:");
      console.log("  https://github.com/marketplace/buoy-design  (install the GitHub App; no Buoy account needed)");
    });

  cmd
    .command("hook")
    .description("PostToolUse hook: reads the Claude Code payload on stdin and reports drift in the edited file")
    .option("--file <path>", "Check this file instead of reading stdin")
    .action(async (options: { file?: string }) => {
      const file = options.file ?? filePathFromHookPayload(await readStdin());
      try {
        const result = await runHook(process.cwd(), file);
        if (result.message) console.error(result.message);
        process.exit(result.exitCode);
      } catch (error) {
        // A broken hook must never block the agent.
        console.error(`Buoy hook skipped: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(0);
      }
    });

  return cmd;
}
