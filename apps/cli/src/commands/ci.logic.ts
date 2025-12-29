// apps/cli/src/commands/ci.logic.ts
import type { DriftSignal, Severity } from '@buoy-design/core';

export interface CIResult {
  version: string;
  timestamp: string;
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
  topIssues: DriftSignal[];
  exitCode: number;
}

export function buildCIResult(
  drifts: DriftSignal[],
  failOn: Severity | 'none'
): CIResult {
  const summary = {
    total: drifts.length,
    critical: drifts.filter(d => d.severity === 'critical').length,
    warning: drifts.filter(d => d.severity === 'warning').length,
    info: drifts.filter(d => d.severity === 'info').length,
  };

  const exitCode = calculateExitCode(summary, failOn);

  return {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    summary,
    topIssues: drifts.slice(0, 10),
    exitCode,
  };
}

export function calculateExitCode(
  summary: { critical: number; warning: number; info: number },
  failOn: Severity | 'none'
): number {
  if (failOn === 'none') return 0;
  if (failOn === 'critical' && summary.critical > 0) return 1;
  if (failOn === 'warning' && (summary.critical > 0 || summary.warning > 0)) return 1;
  if (failOn === 'info' && (summary.critical > 0 || summary.warning > 0 || summary.info > 0)) return 1;
  return 0;
}
