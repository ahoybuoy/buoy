/**
 * buoy build - Construct artifacts from your codebase
 *
 * Groups token generation/management and knowledge graph operations.
 */

import { Command } from "commander";
import { createTokensCommand } from "./tokens.js";
import { createCompareCommand } from "./compare.js";
import { createImportCommand } from "./import.js";
import { createGraphCommand } from "./graph.js";
import { createLearnCommand } from "./learn.js";

export function createBuildCommand(): Command {
  const cmd = new Command("build")
    .description("Build tokens and knowledge graph from your codebase");

  // tokens (with compare and import as subcommands)
  const tokensCmd = createTokensCommand();
  tokensCmd.addCommand(createCompareCommand());
  tokensCmd.addCommand(createImportCommand());
  cmd.addCommand(tokensCmd);

  // graph (with learn as subcommand)
  const graphCmd = createGraphCommand();
  graphCmd.addCommand(createLearnCommand());
  cmd.addCommand(graphCmd);

  return cmd;
}
