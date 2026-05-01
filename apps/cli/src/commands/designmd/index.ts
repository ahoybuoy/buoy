import { Command } from "commander";
import { lintDesignMd } from "./lint.js";

export function createDesignMdCommand(): Command {
  const cmd = new Command("designmd")
    .description("Author and validate DESIGN.md files")
    .configureHelp({ sortSubcommands: false });

  cmd
    .command("lint <file>")
    .description("Validate a DESIGN.md file (use '-' for stdin)")
    .action((file: string) => {
      const { exitCode, json } = lintDesignMd({ file });
      process.stdout.write(JSON.stringify(json, null, 2) + "\n");
      process.exit(exitCode);
    });

  return cmd;
}
