/**
 * buoy drift - Act on design drift
 *
 * Groups all drift-related actions: scanning, checking, fixing, ignoring.
 */

import { Command } from "commander";
import { createScanCommand } from "./scan.js";
import { createCheckCommand } from "./check.js";
import { createFixCommand } from "./fix.js";
import { createIgnoreCommand } from "./ignore.js";

export function createDriftCommand(): Command {
  const cmd = new Command("drift")
    .description("Scan, check, fix, and ignore design drift");

  cmd.addCommand(createScanCommand());
  cmd.addCommand(createCheckCommand());
  cmd.addCommand(createFixCommand());
  cmd.addCommand(createIgnoreCommand());

  return cmd;
}
