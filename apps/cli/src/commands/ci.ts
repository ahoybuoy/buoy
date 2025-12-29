// apps/cli/src/commands/ci.ts
import { Command } from 'commander';
import type { Severity } from '@buoy/core';

export interface CIOutput {
  version: string;
  timestamp: string;
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
  topIssues: Array<{
    type: string;
    severity: Severity;
    component: string;
    message: string;
    file?: string;
    line?: number;
    suggestion?: string;
  }>;
  exitCode: number;
}

export function createCICommand(): Command {
  const cmd = new Command('ci')
    .description('Run drift detection for CI environments')
    .option('--fail-on <severity>', 'Exit 1 if drift at this severity or higher: critical, warning, info, none', 'critical')
    .option('--format <format>', 'Output format: json, summary', 'json')
    .option('--quiet', 'Suppress non-essential output')
    .option('--top <n>', 'Number of top issues to include', '10')
    .action(async (_options) => {
      // Implementation in next task
      console.log('CI command placeholder');
    });

  return cmd;
}
