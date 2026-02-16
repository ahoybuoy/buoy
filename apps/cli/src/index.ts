import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import {
  createShowCommand,
  createDriftCommand,
  createDockCommand,
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
  View               show (components, tokens, drift, health, history, config, skills, agents, context, hooks, commands, graph, plugins, all)
  Drift Actions      drift (scan, check, fix, ignore)
  Setup              dock (config, skills, agents, context, hooks, commands, plugins, tokens, graph)
  Cloud              ahoy (login, logout, status, github, gitlab, billing, plans)

Quick Start:
  $ buoy show all           # everything an AI agent needs
  $ buoy show drift         # design system violations
  $ buoy dock               # set up config, skills, agents, hooks
`,
    );

  // === View (read-only) ===
  program.addCommand(createShowCommand());

  // === Drift Actions ===
  program.addCommand(createDriftCommand());

  // === Setup ===
  program.addCommand(createDockCommand());

  // === Cloud ===
  program.addCommand(createAhoyCommand());

  return program;
}

// Re-export config utilities for user config files
export { defineConfig } from "./config/schema.js";
export type { BuoyConfig } from "./config/schema.js";
