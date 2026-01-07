/**
 * buoy components - Component discovery and inspection
 *
 * Commands for finding and exploring components in the codebase.
 */

import { Command } from 'commander';
import { createComponentsQueryCommand } from './components-query.js';

export function createComponentsCommand(): Command {
  const cmd = new Command('components')
    .description('Discover and inspect components');

  cmd.addCommand(createComponentsQueryCommand());

  return cmd;
}
