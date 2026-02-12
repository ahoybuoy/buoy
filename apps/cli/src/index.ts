import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import {
  createShowCommand,
  createDriftCommand,
  createBuildCommand,
  createDockCommand,
  createBeginCommand,
  createAhoyCommand,
} from "./commands/index.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("buoy")
    .description("Catch design drift before it ships")
    .version(pkg.version)
    .configureHelp({
      sortSubcommands: false,
      subcommandTerm: (cmd) => cmd.name(),
    })
    .addHelpText(
      "after",
      `
Command Groups:
  Setup              begin, dock (config, skills, agents, context, hooks, commands, plugins)
  Design System      show (components, tokens, drift, health, history, all)
  Drift Actions      drift (scan, check, fix, baseline)
  Build Artifacts    build (tokens [compare, import], graph [learn, query, export, stats])
  Cloud              ahoy (login, logout, status, github, gitlab, billing, plans)

Quick Start:
  $ buoy                    # auto-launches wizard if no config
  $ buoy show all           # everything an AI agent needs
  $ buoy show drift         # design system violations
  $ buoy dock               # set up config, skills, agents, hooks
`,
    );

  // === For AI Agents (primary interface) ===
  program.addCommand(createShowCommand());

  // === Drift Actions ===
  program.addCommand(createDriftCommand());

  // === Build Artifacts ===
  program.addCommand(createBuildCommand());

  // === Getting Started & Configuration ===
  program.addCommand(createBeginCommand());
  program.addCommand(createDockCommand());

  // === Cloud ===
  program.addCommand(createAhoyCommand());

  return program;
}

// Re-export config utilities for user config files
export { defineConfig } from "./config/schema.js";
export type { BuoyConfig } from "./config/schema.js";
