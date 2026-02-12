import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import {
  createDockCommand,
  createPluginsCommand,
  createCheckCommand,
  createBaselineCommand,
  createBeginCommand,
  createFixCommand,
  createShowCommand,
  createDriftCommand,
  createTokensCommand,
  createComponentsCommand,
  createScanCommand,
  createCommandsCommand,
  createCompareCommand,
  createImportCommand,
  createAuditCommand,
  createGraphCommand,
  createHistoryCommand,
  createLearnCommand,
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
  Setup              begin, dock (config, skills, agents, context, hooks), commands
  Drift Detection    drift, check, fix, baseline
  Design Tokens      tokens, compare, import
  Analysis           show, audit, graph, history, learn
  Plugins            plugins
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
  program.addCommand(createDriftCommand());
  program.addCommand(createTokensCommand());
  program.addCommand(createComponentsCommand());
  program.addCommand(createScanCommand());

  // === Getting Started ===
  const beginCommand = createBeginCommand();
  program.addCommand(beginCommand);
  program.addCommand(createDockCommand());
  program.addCommand(createCommandsCommand());

  // === CI/Hooks ===
  program.addCommand(createCheckCommand());
  program.addCommand(createBaselineCommand());

  // === Fixing ===
  program.addCommand(createFixCommand());

  // === Design Tokens ===
  program.addCommand(createCompareCommand());
  program.addCommand(createImportCommand());

  // === Analysis & Reporting ===
  program.addCommand(createAuditCommand());
  program.addCommand(createGraphCommand());
  program.addCommand(createHistoryCommand());
  program.addCommand(createLearnCommand());

  // === Plugins ===
  program.addCommand(createPluginsCommand());

  // === Ahoy (Cloud) ===
  program.addCommand(createAhoyCommand());

  return program;
}

// Re-export config utilities for user config files
export { defineConfig } from "./config/schema.js";
export type { BuoyConfig } from "./config/schema.js";
