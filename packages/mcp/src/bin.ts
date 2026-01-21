#!/usr/bin/env node
/**
 * Buoy MCP Server CLI
 *
 * Usage:
 *   buoy-mcp serve           # Start MCP server (default)
 *   buoy-mcp serve --cwd .   # Specify working directory
 */

import { startServer } from './server.js';

const args = process.argv.slice(2);
const command = args[0] || 'serve';

if (command === 'serve' || command === undefined) {
  // Parse --cwd option
  const cwdIndex = args.indexOf('--cwd');
  const cwd = cwdIndex !== -1 && args[cwdIndex + 1]
    ? args[cwdIndex + 1]
    : process.cwd();

  startServer(cwd).catch((error) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });
} else if (command === '--help' || command === '-h') {
  console.log(`
Buoy MCP Server

Usage:
  buoy-mcp [serve]           Start the MCP server
  buoy-mcp serve --cwd <dir> Start with specific working directory
  buoy-mcp --help            Show this help message

The MCP server provides design system context to AI agents:
  - Resources: tokens, components, patterns, anti-patterns
  - Tools: find_component, validate_code, resolve_token, suggest_fix

Claude Code integration:
  Add to .claude/settings.json:
  {
    "mcpServers": {
      "buoy": {
        "command": "npx",
        "args": ["@ahoybuoy/mcp", "serve"]
      }
    }
  }
`);
  process.exit(0);
} else {
  console.error(`Unknown command: ${command}`);
  console.error('Run "buoy-mcp --help" for usage information');
  process.exit(1);
}
