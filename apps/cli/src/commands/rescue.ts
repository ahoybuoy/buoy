import { Command } from "commander";
import {
  error,
  header,
  info,
  keyValue,
  newline,
  setJsonMode,
  spinner,
  success,
  warning,
} from "../output/reporters.js";
import {
  applyRescuePlan,
  createRescuePlan,
  guardRescueRun,
  reportRescueRun,
  rollbackRescueRun,
  verifyRescueRun,
} from "../rescue/workflow.js";
import { rescueRunDir } from "../rescue/store.js";

function failure(cause: unknown): void {
  error(cause instanceof Error ? cause.message : String(cause));
  process.exitCode = 1;
}

export function createRescueCommand(): Command {
  const command = new Command("rescue").description(
    "Measure, repair, guard, and prove design-system health",
  );

  command
    .command("plan", { isDefault: true })
    .description("Create a read-only Rescue baseline and repair plan")
    .option("--json", "Output the plan as JSON")
    .action(async (options) => {
      if (options.json) setJsonMode(true);
      const spin = spinner("Building Rescue plan...");
      try {
        const manifest = await createRescuePlan(process.cwd(), (message) => {
          spin.text = message;
        });
        spin.stop();
        if (options.json) {
          console.log(JSON.stringify(manifest, null, 2));
          return;
        }
        header("Buoy Rescue plan");
        newline();
        keyValue("Run", manifest.id);
        keyValue("Findings", String(manifest.before.summary.total));
        keyValue("High-confidence fixes", String(manifest.safeFixes.length));
        keyValue(
          "Review required",
          String(
            manifest.findings.filter(
              (item) => item.classification === "review-required",
            ).length,
          ),
        );
        keyValue("Artifacts", rescueRunDir(manifest.projectRoot, manifest.id));
        newline();
        info(
          `Review report.html, then run \`buoy rescue apply --run ${manifest.id} --approve\`.`,
        );
      } catch (cause) {
        spin.stop();
        failure(cause);
      }
    });

  command
    .command("apply")
    .description("Apply approved high-confidence fixes on a new branch")
    .option("--run <id>", "Rescue run ID (defaults to latest)")
    .requiredOption(
      "--approve",
      "Confirm that the generated plan has been reviewed",
    )
    .option("--limit <count>", "Maximum fixes to apply", (value) =>
      Number.parseInt(value, 10),
    )
    .action(async (options) => {
      const spin = spinner("Applying approved Rescue fixes...");
      try {
        const manifest = await applyRescuePlan(
          process.cwd(),
          options.run,
          { limit: options.limit },
          (message) => {
            spin.text = message;
          },
        );
        spin.stop();
        success(
          `${manifest.appliedFixIds.length} high-confidence fix(es) applied on ${manifest.rescueBranch}.`,
        );
        if (manifest.verification?.skipped) {
          warning(
            "No test or typecheck scripts were detected. Manual verification is still required.",
          );
        } else {
          success("Project verification passed.");
        }
        info(
          `Review ${rescueRunDir(manifest.projectRoot, manifest.id)}/report.html before committing.`,
        );
      } catch (cause) {
        spin.stop();
        failure(cause);
      }
    });

  command
    .command("verify")
    .description("Run project checks and refresh the before/after report")
    .option("--run <id>", "Rescue run ID (defaults to latest)")
    .action(async (options) => {
      const spin = spinner("Verifying Rescue changes...");
      try {
        const manifest = await verifyRescueRun(
          process.cwd(),
          options.run,
          (message) => {
            spin.text = message;
          },
        );
        spin.stop();
        if (manifest.verification?.passed)
          success("Rescue verification passed.");
        else if (manifest.verification?.skipped)
          warning("No automated project checks were detected.");
        else
          failure(
            "Rescue verification failed. Review the report before proceeding.",
          );
      } catch (cause) {
        spin.stop();
        failure(cause);
      }
    });

  command
    .command("guard")
    .description(
      "Record reviewed legacy drift so checks focus on new violations",
    )
    .option("--run <id>", "Rescue run ID (defaults to latest)")
    .requiredOption(
      "--reason <reason>",
      "Why the remaining legacy drift is accepted",
    )
    .option("--actor <name>", "Person or team approving the baseline")
    .action(async (options) => {
      const spin = spinner("Recording reviewed legacy drift...");
      try {
        const manifest = await guardRescueRun(
          process.cwd(),
          options.run,
          options.reason,
          options.actor,
          (message) => {
            spin.text = message;
          },
        );
        spin.stop();
        success(
          `${manifest.baseline?.count || 0} legacy finding(s) recorded with stable fingerprints.`,
        );
        info("Future drift checks focus on newly introduced violations.");
      } catch (cause) {
        spin.stop();
        failure(cause);
      }
    });

  command
    .command("report")
    .description("Regenerate JSON, Markdown, and HTML Rescue reports")
    .option("--run <id>", "Rescue run ID (defaults to latest)")
    .action(async (options) => {
      try {
        const { paths } = await reportRescueRun(process.cwd(), options.run);
        success("Rescue reports generated.");
        keyValue("HTML", paths.html);
        keyValue("Markdown", paths.markdown);
        keyValue("JSON", paths.json);
      } catch (cause) {
        failure(cause);
      }
    });

  command
    .command("rollback")
    .description("Restore files saved before Rescue apply")
    .option("--run <id>", "Rescue run ID (defaults to latest)")
    .option("--force", "Overwrite files changed after Rescue apply")
    .action(async (options) => {
      try {
        const manifest = await rollbackRescueRun(
          process.cwd(),
          options.run,
          options.force,
        );
        success(
          `Restored ${manifest.backups.length} file(s) from local Rescue backups.`,
        );
        info(
          "The Rescue branch was retained for inspection and can be deleted manually.",
        );
      } catch (cause) {
        failure(cause);
      }
    });

  return command;
}
