import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "../config/loader.js";
import { ScanOrchestrator } from "../scan/orchestrator.js";
import {
  buildSystemMap,
  findChangeImpact,
  type SystemEntity,
} from "../services/system-map.js";
import {
  error,
  header,
  info,
  keyValue,
  setJsonMode,
  warning,
} from "../output/reporters.js";

function printEntity(entity: SystemEntity): void {
  console.log(
    `  ${chalk.bold(entity.name)} ${chalk.dim(`(${entity.kind}, ${entity.classification})`)}`,
  );
  keyValue("Path", entity.path ?? "unresolved", 2);
  keyValue("Observed usages", String(entity.usageCount), 2);
  keyValue("Consumer files", String(entity.consumers.length), 2);
  keyValue("Change risk", entity.risk, 2);
  if (entity.owner) keyValue("Owner", entity.owner, 2);
}

async function currentSystemMap() {
  const { config, configPath } = await loadConfig(process.cwd());
  const orchestrator = new ScanOrchestrator(config, process.cwd());
  // The system map is intentionally code-first. Design-tool sources can add
  // context in a future adapter without becoming a prerequisite or authority.
  const codeSources = orchestrator
    .getEnabledSources()
    .filter((source) => source !== "figma" && source !== "storybook");
  const scan = await orchestrator.scan({ sources: codeSources });
  return {
    map: await buildSystemMap({
      projectRoot: process.cwd(),
      config: config.system,
      components: scan.components,
      tokens: scan.tokens,
    }),
    configPath,
  };
}

export function createSystemCommand(): Command {
  const command = new Command("system").description(
    "Observe the code-first design system and its change impact",
  );

  command
    .command("map")
    .description("Map canonical and unmanaged components and tokens")
    .option("--json", "Output JSON")
    .option("--limit <number>", "Maximum entities per group", "10")
    .action(async (options) => {
      if (options.json) setJsonMode(true);
      try {
        const { map, configPath } = await currentSystemMap();
        if (options.json) {
          console.log(JSON.stringify(map, null, 2));
          return;
        }
        header("Design System Map");
        if (!map.canonicalConfigured) {
          warning(
            "No canonical system paths are configured; all discovered entities are currently unmanaged.",
          );
          info(
            "Add system.components and system.tokens to .buoy.yaml to declare the code you own.",
          );
        } else {
          info(`Canonical system declared in ${configPath ?? ".buoy.yaml"}`);
        }
        keyValue(
          "Canonical components",
          String(map.summary.canonicalComponents),
        );
        keyValue("Canonical tokens", String(map.summary.canonicalTokens));
        keyValue(
          "Unmanaged components",
          String(map.summary.unmanagedComponents),
        );
        keyValue("Unmanaged tokens", String(map.summary.unmanagedTokens));
        keyValue("Observed usages", String(map.summary.observedUsages));

        const limit = Math.max(1, Number.parseInt(options.limit, 10) || 10);
        const unmanaged = [...map.components, ...map.tokens]
          .filter((entity) => entity.classification === "unmanaged")
          .slice(0, limit);
        if (unmanaged.length > 0) {
          header("Unmanaged surface area");
          unmanaged.forEach(printEntity);
        }
      } catch (cause) {
        error(
          `System map failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
        process.exitCode = 1;
      }
    });

  command
    .command("impact")
    .description(
      "Show the observed blast radius of a component or token change",
    )
    .argument("<name>", "Component or token name")
    .option("--kind <kind>", "Limit to component or token")
    .option("--json", "Output JSON")
    .action(async (name, options) => {
      if (options.json) setJsonMode(true);
      if (
        options.kind &&
        options.kind !== "component" &&
        options.kind !== "token"
      ) {
        throw new Error("--kind must be component or token");
      }
      try {
        const { map } = await currentSystemMap();
        const impact = findChangeImpact(map, name, options.kind);
        if (!impact) {
          throw new Error(
            `No component or token named "${name}" was found in the current scan.`,
          );
        }
        if (options.json) {
          console.log(JSON.stringify(impact, null, 2));
          return;
        }
        header("Change Impact");
        printEntity(impact.entity);
        console.log(
          `\n  ${chalk.cyan("Recommendation:")} ${impact.recommendation}`,
        );
        if (impact.entity.consumers.length > 0) {
          console.log(`\n  ${chalk.bold("Top consumer files")}`);
          impact.entity.consumers.slice(0, 10).forEach((consumer) => {
            console.log(
              `  • ${consumer.file} ${chalk.dim(`(${consumer.usages} usage${consumer.usages === 1 ? "" : "s"}${consumer.owner ? ` · ${consumer.owner}` : ""})`)}`,
            );
          });
        }
      } catch (cause) {
        error(
          `Change impact failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
        process.exitCode = 1;
      }
    });

  return command;
}
