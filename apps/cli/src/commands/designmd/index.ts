import { Command } from "commander";
import { lintDesignMd } from "./lint.js";
import { diffDesignMd } from "./diff.js";

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

  cmd
    .command("diff <before> <after>")
    .description("Compare two DESIGN.md files for token regressions")
    .action((before: string, after: string) => {
      const { exitCode, json } = diffDesignMd({ before, after });
      process.stdout.write(JSON.stringify(json, null, 2) + "\n");
      process.exit(exitCode);
    });

  return cmd;
}
