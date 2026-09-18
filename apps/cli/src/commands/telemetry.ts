/**
 * buoy ahoy telemetry [on|off|status]
 *
 * Shows and controls opt-in anonymous usage telemetry, including the exact
 * payload shape so people can see what would be sent.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { buildPayload, getTelemetryState, isTelemetryEnabled, setTelemetryEnabled, telemetryBlockedByEnvironment } from '../telemetry/index.js';
import { getApiEndpoint } from '../cloud/config.js';
import { info, keyValue, newline, success } from '../output/reporters.js';

export function createTelemetryCommand(): Command {
  const cmd = new Command('telemetry');

  cmd
    .description('Show or change anonymous usage telemetry (off by default)')
    .argument('[action]', 'on, off, or status', 'status')
    .option('--json', 'Output as JSON')
    .action((action: string, options: { json?: boolean }) => {
      if (action === 'on' || action === 'off') {
        setTelemetryEnabled(action === 'on');
      } else if (action !== 'status') {
        console.error(`Unknown action "${action}". Use on, off, or status.`);
        process.exit(1);
      }

      const state = getTelemetryState();
      const blocked = telemetryBlockedByEnvironment();
      const effective = isTelemetryEnabled();
      const example = buildPayload('cli_drift_found', { total: 4, critical: 1, warning: 3, info: 0, files: 2 });

      if (options.json) {
        console.log(JSON.stringify({ enabled: state.enabled === true, effective, blockedByEnvironment: blocked, endpoint: `${getApiEndpoint()}/analytics/events/anonymous`, examplePayload: example }, null, 2));
        return;
      }

      if (action === 'on') success('Telemetry turned on');
      if (action === 'off') success('Telemetry turned off');
      newline();
      keyValue('Setting', state.enabled === true ? 'on' : state.askedAt ? 'off' : 'off (not asked yet)');
      if (blocked) keyValue('Environment', chalk.yellow('blocked by BUOY_TELEMETRY=0, DO_NOT_TRACK=1, or CI'));
      keyValue('Effective', effective ? chalk.green('sending') : chalk.dim('not sending'));
      keyValue('Endpoint', `${getApiEndpoint()}/analytics/events/anonymous`);
      newline();
      info('Events: cli_first_run, cli_drift_found, cli_check_clean, cli_hint_shown, cli_login_started');
      info('Payload is only counts, the CLI version, and the OS. Example:');
      console.log(chalk.dim(JSON.stringify(example ?? { note: 'anonymous id is created when you opt in' }, null, 2)));
    });

  return cmd;
}
