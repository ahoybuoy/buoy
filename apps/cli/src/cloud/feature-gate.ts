/**
 * Feature gating for paid/trial features
 *
 * Checks plan status and shows helpful messages when features
 * are restricted, instead of silently failing.
 */

import chalk from 'chalk';
import { isLoggedIn } from './config.js';
import { getBillingStatus, type BillingStatus } from './client.js';
import { error, info, warning, newline } from '../output/reporters.js';

export type PaidFeature =
  | 'github-pr-comments'
  | 'slack-alerts'
  | 'cloud-history'
  | 'figma-monitor'
  | 'unlimited-repos';

const FEATURE_NAMES: Record<PaidFeature, string> = {
  'github-pr-comments': 'GitHub PR Comments',
  'slack-alerts': 'Slack & Teams Alerts',
  'cloud-history': 'Cloud History & Trends',
  'figma-monitor': 'Figma Monitor Plugin',
  'unlimited-repos': 'Unlimited Repos',
};

export interface FeatureCheckResult {
  allowed: boolean;
  reason?: 'not-logged-in' | 'free-plan' | 'trial-expired' | 'payment-issue';
  trialDaysRemaining?: number;
  billing?: BillingStatus;
}

/**
 * Check if a paid feature is available for the current user
 */
export async function checkFeatureAccess(
  _feature: PaidFeature
): Promise<FeatureCheckResult> {
  // Not logged in - can't use cloud features
  if (!isLoggedIn()) {
    return { allowed: false, reason: 'not-logged-in' };
  }

  try {
    const result = await getBillingStatus();

    if (!result.ok || !result.data) {
      // API error - allow feature (fail open for better UX)
      return { allowed: true };
    }

    const billing = result.data;

    // Check for payment issues first
    if (billing.paymentAlert) {
      // Still allow during grace period, but will show warning
      return {
        allowed: true,
        reason: 'payment-issue',
        billing,
      };
    }

    // Team and Enterprise plans have full access
    if (billing.plan.id === 'team' || billing.plan.id === 'enterprise') {
      return { allowed: true, billing };
    }

    // Active trial has access
    if (billing.trial?.active) {
      return {
        allowed: true,
        trialDaysRemaining: billing.trial.daysRemaining,
        billing,
      };
    }

    // Free plan - no access to paid features
    return { allowed: false, reason: 'free-plan', billing };
  } catch {
    // Network error - fail open
    return { allowed: true };
  }
}

/**
 * Check feature access and show appropriate message if blocked
 * Returns true if feature is allowed, false if blocked
 */
export async function requireFeature(
  feature: PaidFeature,
  options?: { silent?: boolean }
): Promise<boolean> {
  const result = await checkFeatureAccess(feature);

  if (result.allowed) {
    // Show trial warning if applicable
    if (result.trialDaysRemaining !== undefined && !options?.silent) {
      warning(`Trial: ${result.trialDaysRemaining} days remaining`);
      info(`Run ${chalk.cyan('buoy billing upgrade')} to keep ${FEATURE_NAMES[feature]}`);
      newline();
    }

    // Show payment warning if applicable
    if (result.reason === 'payment-issue' && !options?.silent) {
      warning('Payment issue detected');
      info(`Run ${chalk.cyan('buoy billing portal')} to update payment method`);
      newline();
    }

    return true;
  }

  // Feature blocked - show helpful message
  if (!options?.silent) {
    showFeatureBlockedMessage(feature, result.reason!);
  }

  return false;
}

/**
 * Show a helpful message when a feature is blocked
 */
function showFeatureBlockedMessage(
  feature: PaidFeature,
  reason: 'not-logged-in' | 'free-plan' | 'trial-expired' | 'payment-issue'
): void {
  const featureName = FEATURE_NAMES[feature];

  switch (reason) {
    case 'not-logged-in':
      error(`${featureName} requires a Buoy account`);
      newline();
      info('Get started:');
      info(`  ${chalk.cyan('buoy login --signup')}  Create an account`);
      info(`  ${chalk.cyan('buoy login')}           Sign in`);
      break;

    case 'free-plan':
      error(`${featureName} is a Team plan feature`);
      newline();
      info('Upgrade to unlock:');
      info(`  ${chalk.cyan('buoy billing upgrade')}  Start free trial`);
      info(`  ${chalk.cyan('buoy plans')}            Compare plans`);
      newline();
      info(chalk.dim('The CLI remains free forever with full drift detection.'));
      break;

    case 'trial-expired':
      error(`Your trial has ended`);
      newline();
      info(`${featureName} requires an active subscription.`);
      info(`  ${chalk.cyan('buoy billing upgrade')}  Subscribe to Team`);
      info(`  ${chalk.cyan('buoy plans')}            Compare plans`);
      break;

    case 'payment-issue':
      error('Payment required');
      newline();
      info('Your subscription has a payment issue.');
      info(`  ${chalk.cyan('buoy billing portal')}   Update payment method`);
      break;
  }
}

/**
 * Decorator-style function to wrap a command action with feature gating
 */
export function withFeatureGate<T extends (...args: unknown[]) => Promise<void>>(
  feature: PaidFeature,
  action: T
): T {
  return (async (...args: unknown[]) => {
    const allowed = await requireFeature(feature);
    if (!allowed) {
      process.exit(1);
    }
    return action(...args);
  }) as T;
}
