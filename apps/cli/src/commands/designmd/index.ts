import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { lintDesignMd } from "./lint.js";
import { diffDesignMd } from "./diff.js";
import { exportDesignMd } from "./export.js";
import { generateDesignMd } from "./init.js";

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

  cmd
    .command("export <file>")
    .description("Export DESIGN.md tokens to tailwind or dtcg format")
    .requiredOption("--format <format>", "tailwind | dtcg")
    .action((file: string, opts: { format: string }) => {
      if (opts.format !== "tailwind" && opts.format !== "dtcg") {
        process.stderr.write(`Unknown format: ${opts.format}\n`);
        process.exit(1);
      }
      const { exitCode, stdout } = exportDesignMd({ file, format: opts.format });
      process.stdout.write(stdout + "\n");
      process.exit(exitCode);
    });

  cmd
    .command("init")
    .description("Generate a DESIGN.md from discovered tokens")
    .option("-o, --output <path>", "Write to file (default: stdout)")
    .option("--name <name>", "Design system name", "Untitled")
    .action((opts: { output?: string; name: string }) => {
      // Token discovery wired in Task 8 — emit empty skeleton for now.
      const md = generateDesignMd({ name: opts.name, tokens: [] });
      if (opts.output) writeFileSync(opts.output, md);
      else process.stdout.write(md);
    });

  return cmd;
}
