/**
 * buoy plans - Show available plans and features
 *
 * Displays the plans and prices shown on buoy.design/pricing.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  isLoggedIn,
  getBillingStatus,
} from '../cloud/index.js';
import {
  header,
  newline,
} from '../output/reporters.js';

const OPEN_SOURCE_FEATURES = [
  'CLI, MCP server and GitHub Action (MIT)',
  'All drift detection commands',
  'Blocks in your own CI with --fail-on / fail-on-drift',
  'AI guardrails (skills, hooks, context)',
  'Local scan history',
];

const TEAM_FEATURES = [
  'GitHub App PR reviews with inline fixes',
  'Unlimited repos, contributors, agents and runs',
  'Remembered declines and cloud history',
  'Free for life for the first 100 installs',
  'Public repos are always free',
];

const DESIGN_SYSTEM_FEATURES = [
  'Everything in Team',
  'Org-wide drift record across repos and teams',
  'Calibration in year one',
];

const PRICING_URL = 'https://buoy.design/pricing';

export function createPlansCommand(): Command {
  return new Command('plans')
    .description('Compare available plans and pricing')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (options.json) {
        console.log(JSON.stringify({
          plans: [
            { id: 'open-source', name: 'Open source', price: '$0', period: 'forever', features: OPEN_SOURCE_FEATURES },
            { id: 'team', name: 'Team', price: '$49', period: '/month per design system', features: TEAM_FEATURES },
            { id: 'design-system', name: 'Design System', price: '$5,000', period: '/year per design system', features: DESIGN_SYSTEM_FEATURES },
          ],
          url: PRICING_URL,
        }, null, 2));
        return;
      }

      // Check current plan
      let currentPlan = 'free';
      let trialDays = 0;

      if (isLoggedIn()) {
        try {
          const result = await getBillingStatus();
          if (result.ok && result.data) {
            currentPlan = result.data.plan.id;
            if (result.data.trial?.active) {
              trialDays = result.data.trial.daysRemaining;
            }
          }
        } catch {
          // Ignore - assume free
        }
      }

      // Header
      console.log('');
      header('Buoy Plans');
      newline();

      const current = (id: string) => (currentPlan === id ? chalk.green(' ← current') : '');
      const list = (features: string[]) => {
        for (const feature of features) console.log(`  ${chalk.green('✓')} ${feature}`);
        newline();
      };

      console.log(chalk.bold('Open source') + chalk.dim(' $0 forever') + current('free'));
      list(OPEN_SOURCE_FEATURES);

      const teamLabel = currentPlan === 'team'
        ? chalk.green(' ← current')
        : trialDays > 0
          ? chalk.yellow(` ← trial (${trialDays} days left)`)
          : '';
      console.log(chalk.cyan.bold('Team') + chalk.dim(' $49/month per design system, no seats') + teamLabel);
      list(TEAM_FEATURES);

      console.log(chalk.magenta.bold('Design System') + chalk.dim(' $5,000/year per design system') + current('enterprise'));
      list(DESIGN_SYSTEM_FEATURES);

      console.log(chalk.dim('─'.repeat(50)));
      console.log(chalk.dim('   ') + 'Details and the free-for-life spots left: ' + chalk.cyan(PRICING_URL));
    });
}
