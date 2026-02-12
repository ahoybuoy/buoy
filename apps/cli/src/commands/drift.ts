/**
 * buoy drift - Act on design drift
 *
 * Groups all drift-related actions: scanning, checking, fixing, baselining.
 */

import { Command } from "commander";
import { createScanCommand } from "./scan.js";
import { createCheckCommand } from "./check.js";
import { createFixCommand } from "./fix.js";
import { createBaselineCommand } from "./baseline.js";

export function createDriftCommand(): Command {
  const cmd = new Command("drift")
    .description("Scan, check, fix, and baseline design drift");

  cmd.addCommand(createScanCommand());
  cmd.addCommand(createCheckCommand());
  cmd.addCommand(createFixCommand());
  cmd.addCommand(createBaselineCommand());

  return cmd;
}
