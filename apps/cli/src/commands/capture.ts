/**
 * buoy capture / buoy see: the way into Buoy Cloud's visualizations.
 *
 * The CLI stays a deterministic scanner (`buoy show snapshot` is the data).
 * Seeing the whole app (component gallery, system map, colour quilt, …) and
 * rendering components from the running app live in Buoy Cloud; these
 * commands explain that and open the right page.
 */
import { Command } from "commander";
import open from "open";
import chalk from "chalk";
import { isLoggedIn } from "../cloud/config.js";
import { info, success } from "../output/reporters.js";

const VISUALIZE_URL = "https://app.buoy.design/visualize";
const INSTALL_URL = "https://buoy.design/install?src=cli";

function cloudPath(what: string, options: { open?: boolean }): void {
  if (isLoggedIn()) {
    success(`${what} live in Buoy Cloud: ${VISUALIZE_URL}`);
    if (options.open !== false) open(VISUALIZE_URL).catch(() => {});
    return;
  }
  info(`${what} live in Buoy Cloud, free for public repos and in your workspace for private ones.`);
  console.log(`  1. ${chalk.cyan("buoy ahoy login")}  connect this machine`);
  console.log(`  2. Install the GitHub App: ${INSTALL_URL}`);
  console.log(`  Public repo? See it now: ${chalk.cyan("https://buoy.design/scan")}`);
  console.log(`  The data behind them is local and free: ${chalk.cyan("buoy show snapshot")}`);
}

export function createSeeCommand(): Command {
  return new Command("see")
    .description("See your whole app: component gallery, system map, colour quilt and more (Buoy Cloud)")
    .option("--no-open", "Print the link instead of opening it")
    .action((options) => cloudPath("Visualizations", options));
}

export function createCaptureCommand(): Command {
  return new Command("capture")
    .description("Render every component from your running app for the component gallery (Buoy Cloud)")
    .option("--no-open", "Print the link instead of opening it")
    .action((options) => {
      cloudPath("Component renders", options);
      if (isLoggedIn()) info(`Upload renders from your running app with: ${chalk.cyan("npx @buoy-design/capture")}`);
    });
}
