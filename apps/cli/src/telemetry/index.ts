/**
 * Anonymous, opt-in usage telemetry.
 *
 * Off by default. The CLI asks once, in an interactive terminal, after the
 * first drift result. The answer and a random anonymous id live in
 * ~/.buoy/config.json. Nothing is ever sent when:
 *   - the user answered no, or has not been asked yet
 *   - BUOY_TELEMETRY=0, DO_NOT_TRACK=1, or CI is set
 *   - output is JSON or quiet, or stdout is not a TTY
 *
 * What is sent is an allowlisted event name plus non-negative integer counts
 * (drift totals, file counts), the CLI version, and the OS platform. No file
 * paths, repository names, tokens, or account details. `buoy ahoy telemetry`
 * prints the exact payload shape and toggles the setting.
 */

import { randomBytes } from 'crypto';
import { createInterface } from 'readline';
import chalk from 'chalk';
import { readCloudConfig, updateCloudConfig, getApiEndpoint } from '../cloud/config.js';
import pkg from '../../package.json' with { type: 'json' };

export type TelemetryEvent =
  | 'cli_first_run'
  | 'cli_drift_found'
  | 'cli_check_clean'
  | 'cli_hint_shown'
  | 'cli_login_started';

export interface TelemetryState {
  enabled?: boolean;
  anonymousId?: string;
  askedAt?: string;
  firstRunSentAt?: string;
}

export interface TelemetryEnvironment {
  isTTY: boolean;
  env: NodeJS.ProcessEnv;
  jsonOrQuiet: boolean;
}

function defaultEnvironment(): TelemetryEnvironment {
  return { isTTY: Boolean(process.stdout.isTTY && process.stdin.isTTY), env: process.env, jsonOrQuiet: false };
}

/** Environment says never, regardless of the stored answer. */
export function telemetryBlockedByEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BUOY_TELEMETRY === '0' || env.DO_NOT_TRACK === '1' || Boolean(env.CI);
}

export function getTelemetryState(): TelemetryState {
  return readCloudConfig().telemetry || {};
}

export function setTelemetryEnabled(enabled: boolean): TelemetryState {
  const current = getTelemetryState();
  const next: TelemetryState = {
    ...current,
    enabled,
    anonymousId: current.anonymousId || randomBytes(16).toString('hex'),
    askedAt: current.askedAt || new Date().toISOString(),
  };
  updateCloudConfig({ telemetry: next });
  return next;
}

export function isTelemetryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (telemetryBlockedByEnvironment(env)) return false;
  return getTelemetryState().enabled === true;
}

/** True when we may ask the consent question right now. */
export function shouldAskForConsent(environment: TelemetryEnvironment = defaultEnvironment()): boolean {
  if (!environment.isTTY || environment.jsonOrQuiet) return false;
  if (telemetryBlockedByEnvironment(environment.env)) return false;
  return !getTelemetryState().askedAt;
}

/**
 * Ask once. Default is No: an empty answer opts out.
 */
export async function askForConsent(environment: TelemetryEnvironment = defaultEnvironment()): Promise<boolean> {
  if (!shouldAskForConsent(environment)) return isTelemetryEnabled(environment.env);

  console.log('');
  console.log(chalk.bold('Help improve Buoy?'));
  console.log(chalk.dim('Send anonymous usage pings: which commands run and how much drift they find.'));
  console.log(chalk.dim('Never file paths, repo names, or account details. Off by default.'));
  console.log(chalk.dim('Change any time with `buoy ahoy telemetry on|off`, or set BUOY_TELEMETRY=0.'));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question('Send anonymous usage pings? [y/N] ', (a) => { rl.close(); resolve(a.trim()); }));
  const enabled = /^y(es)?$/i.test(answer);
  setTelemetryEnabled(enabled);
  console.log(chalk.dim(enabled ? 'Thanks. Telemetry is on.' : 'Telemetry stays off.'));
  console.log('');
  return enabled;
}

export interface TelemetryPayload {
  event: TelemetryEvent;
  anonymousId: string;
  cliVersion: string;
  platform: string;
  properties: Record<string, number>;
}

export function buildPayload(event: TelemetryEvent, properties: Record<string, number> = {}): TelemetryPayload | null {
  const state = getTelemetryState();
  if (!state.anonymousId) return null;
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) clean[k] = Math.round(v);
  }
  return { event, anonymousId: state.anonymousId, cliVersion: pkg.version, platform: process.platform, properties: clean };
}

/**
 * Fire-and-forget. Never throws, never blocks exit for more than ~1.5s.
 */
export async function sendTelemetry(event: TelemetryEvent, properties: Record<string, number> = {}, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!isTelemetryEnabled(env)) return;
  const payload = buildPayload(event, properties);
  if (!payload) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    await fetch(`${getApiEndpoint()}/analytics/events/anonymous`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).catch(() => undefined);
    clearTimeout(timer);
  } catch {
    // Telemetry must never affect the command.
  }
}

/** Send cli_first_run once per install, after consent. */
export async function sendFirstRunOnce(): Promise<void> {
  const state = getTelemetryState();
  if (!isTelemetryEnabled() || state.firstRunSentAt) return;
  await sendTelemetry('cli_first_run');
  updateCloudConfig({ telemetry: { ...state, firstRunSentAt: new Date().toISOString() } });
}
