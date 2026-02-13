/**
 * CI configuration generator for the wizard.
 */

import chalk from 'chalk';
import { sectionHeader, info, bulletList } from './menu.js';

interface CISetupResult {
  provider: 'cloud' | 'manual';
  created: boolean;
}

/**
 * Run the CI setup wizard.
 */
export async function setupCI(_cwd: string): Promise<CISetupResult> {
  sectionHeader('Set up CI Integration');

  info('Buoy Cloud provides a PR bot that comments on design drift.');
  console.log('');

  console.log(chalk.cyan.bold('  Recommended: Buoy Cloud PR Bot'));
  console.log('');
  bulletList([
    'Automatic PR comments with drift summary',
    'No workflow files needed',
    'Works with GitHub and GitLab',
  ]);
  console.log('');
  console.log(`  Run: ${chalk.cyan('buoy ahoy github')} to set up the GitHub bot`);
  console.log(`  Run: ${chalk.cyan('buoy ahoy gitlab')} to set up the GitLab bot`);
  console.log('');

  console.log(chalk.dim('─'.repeat(40)));
  console.log('');

  console.log(chalk.bold('  Alternative: Local CI Check'));
  console.log('');
  info('Add this to your CI pipeline for basic drift checking:');
  console.log('');
  console.log(chalk.cyan('    npx ahoybuoy drift check'));
  console.log('');

  info('Options:');
  bulletList([
    `${chalk.dim('--fail-on critical')}   Exit 1 on critical issues`,
    `${chalk.dim('--fail-on warning')}    Exit 1 on warnings too`,
  ]);

  return { provider: 'cloud', created: false };
}
