#!/usr/bin/env node

import { createCli } from './index.js';
import { existsSync } from 'fs';
import { join } from 'path';

const cli = createCli();

// Check if user provided any arguments beyond node and script path
const hasArgs = process.argv.length > 2;

if (!hasArgs) {
  // No arguments - check if config exists
  const configExists =
    existsSync(join(process.cwd(), ".buoy.yaml")) ||
    existsSync(join(process.cwd(), ".buoy.yml")) ||
    existsSync(join(process.cwd(), "buoy.config.mjs")) ||
    existsSync(join(process.cwd(), "buoy.config.js"));

  if (!configExists) {
    // No config - start setup when someone can answer its prompts,
    // otherwise show help (piped, CI, an agent's shell)
    if (process.stdin.isTTY && process.stdout.isTTY) {
      console.log("\n🛟 No config found. Starting setup (buoy dock)...\n");
      cli.parse(["node", "buoy", "dock"]);
    } else {
      console.log("\n🛟 No config found. Run `buoy dock` to set up, or `buoy show all` to look without one.\n");
      cli.parse(["node", "buoy", "--help"]);
    }
  } else {
    // Config exists - show help
    cli.parse();
  }
} else {
  cli.parse();
}
