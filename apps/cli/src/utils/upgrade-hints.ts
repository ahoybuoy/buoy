// apps/cli/src/utils/upgrade-hints.ts
import chalk from 'chalk';
import { isLoggedIn, readCloudConfig, updateCloudConfig } from '../cloud/config.js';

export type HintContext =
  | 'after-drift-found'
  | 'after-health-score'
  | 'after-check-fail'
  | 'after-scan'
  | 'after-fix';

interface UpgradeHint {
  condition: () => boolean;
  message: string;
  cta: string;
}

/** Show at most one hint per day per machine. */
const HINT_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Every hint targets logged-out users, so every CTA must be reachable while
// logged out. `buoy ahoy github` requires login and used to be the CTA here,
// which sent people straight into a "Not logged in" error.
const HINTS: Record<HintContext, UpgradeHint[]> = {
  'after-drift-found': [
    {
      condition: () => !isLoggedIn(),
      message: 'Get this review on your team\'s PRs before drift ships',
      cta: 'buoy ahoy login',
    },
  ],
  'after-health-score': [
    {
      condition: () => !isLoggedIn(),
      message: 'Track health score trends over time',
      cta: 'buoy ahoy login',
    },
  ],
  'after-check-fail': [
    {
      condition: () => !isLoggedIn(),
      message: 'Catch this on every PR, for the whole team',
      cta: 'buoy ahoy login',
    },
  ],
  'after-scan': [
    {
      condition: () => !isLoggedIn(),
      message: 'Share scan results with your team',
      cta: 'buoy ahoy login',
    },
  ],
  'after-fix': [
    {
      condition: () => !isLoggedIn(),
      message: 'Auto-fix suggestions in PRs',
      cta: 'buoy ahoy login',
    },
  ],
};

export interface HintEnvironment {
  isTTY: boolean;
  ci: boolean;
  now: Date;
}

function defaultEnvironment(): HintEnvironment {
  return {
    isTTY: Boolean(process.stdout.isTTY),
    ci: Boolean(process.env.CI) || Boolean(process.env.GITHUB_ACTIONS) || process.env.BUOY_HINTS === '0',
    now: new Date(),
  };
}

/**
 * Decide whether a hint may be shown right now. Pure apart from reading the
 * config file, so it can be tested with an explicit environment.
 */
export function shouldShowHint(env: HintEnvironment = defaultEnvironment()): boolean {
  if (!env.isTTY || env.ci) return false;
  const config = readCloudConfig();
  if (config.hints?.disabled) return false;
  const last = config.hints?.lastShownAt ? Date.parse(config.hints.lastShownAt) : NaN;
  if (!Number.isNaN(last) && env.now.getTime() - last < HINT_INTERVAL_MS) return false;
  return true;
}

/**
 * Get a random applicable hint for the given context
 * Returns undefined if no hints apply or user is already on paid plan
 */
export function getUpgradeHint(context: HintContext): { message: string; cta: string } | undefined {
  const contextHints = HINTS[context];
  if (!contextHints) return undefined;

  const applicable = contextHints.filter(h => h.condition());
  if (applicable.length === 0) return undefined;

  // Return random applicable hint
  const hint = applicable[Math.floor(Math.random() * applicable.length)];
  if (!hint) return undefined;
  return { message: hint.message, cta: hint.cta };
}

/**
 * Format an upgrade hint for CLI output, honouring the once-a-day cap and
 * the user's opt-out. Records the time it was shown.
 */
export function formatUpgradeHint(context: HintContext, env?: HintEnvironment): string | undefined {
  if (!shouldShowHint(env)) return undefined;
  const hintData = getUpgradeHint(context);
  if (!hintData) return undefined;

  const now = (env ?? defaultEnvironment()).now;
  try {
    const config = readCloudConfig();
    updateCloudConfig({ hints: { ...config.hints, lastShownAt: now.toISOString() } });
  } catch {
    // Config write failures must never break command output.
  }

  return chalk.dim(`Tip: ${hintData.message} → ${chalk.cyan(hintData.cta)}  (BUOY_HINTS=0 to silence)`);
}
