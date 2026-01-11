/**
 * Cloud Sync Utilities
 *
 * Handles uploading scans to Buoy Cloud with offline support.
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { isLoggedIn } from './config.js';
import {
  uploadScan,
  reportScan,
  type UploadScanRequest,
  type ScanComponent,
  type ScanToken,
  type ScanDriftSignal,
  type ScanReportRequest,
  type DiscoveredToken,
  type DiscoveredComponent,
  type IntentSource,
  type DriftSignalReport,
  type TokenCategory,
  type ConfidenceLevel,
  type DriftType,
} from './client.js';
import {
  queueScan,
  getPendingScans,
  removeFromQueue,
  updateQueuedScan,
  getQueueCount,
} from './queue.js';

export interface SyncResult {
  success: boolean;
  scanId?: string;
  queued?: boolean;
  error?: string;
}

/**
 * Get git metadata for current commit
 */
export function getGitMetadata(cwd: string): {
  commitSha?: string;
  branch?: string;
  author?: string;
} {
  try {
    const commitSha = execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8' }).trim();
    const author = execSync('git log -1 --format="%an <%ae>"', { cwd, encoding: 'utf-8' }).trim();
    return { commitSha, branch, author };
  } catch {
    return {};
  }
}

/**
 * Convert CLI scan results to API format
 */
export function formatScanForUpload(
  components: Array<{
    name: string;
    path: string;
    framework?: string;
    props?: Array<{ name: string; type?: string; required?: boolean; defaultValue?: unknown }>;
    imports?: string[];
    loc?: number;
  }>,
  tokens: Array<{
    name: string;
    value: string;
    type: string;
    path?: string;
    source?: string;
  }>,
  drift: Array<{
    type: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    file?: string;
    line?: number;
    component?: string;
    token?: string;
    suggestion?: string;
  }>,
  gitMetadata?: { commitSha?: string; branch?: string; author?: string }
): UploadScanRequest {
  return {
    commitSha: gitMetadata?.commitSha,
    branch: gitMetadata?.branch,
    author: gitMetadata?.author,
    timestamp: new Date().toISOString(),
    components: components as ScanComponent[],
    tokens: tokens as ScanToken[],
    drift: drift as ScanDriftSignal[],
  };
}

// ============================================================================
// Scan Report API (v1 - Design Intent Discovery)
// ============================================================================

export interface ScanReportInput {
  repo: string;
  commitSha: string;
  branch?: string;
  prNumber?: number;
  scanDuration: number;
  isFirstScan?: boolean;

  // Design tokens discovered from various sources
  tokens: Array<{
    name: string;
    value: string;
    category?: string;
    confidence?: string;
    source: string;
    usageCount?: number;
  }>;

  // Components discovered from scanners
  components: Array<{
    name: string;
    path: string;
    props?: string[];
    variants?: string[];
    confidence?: string;
    source: string;
  }>;

  // Intent sources (config files, etc.)
  sources: Array<{
    type: string;
    file: string;
    description: string;
  }>;

  // Drift signals from analysis
  driftSignals: Array<{
    type: string;
    severity: 'error' | 'warning' | 'info';
    file: string;
    line: number;
    column?: number;
    value: string;
    message: string;
    suggestion?: {
      token: string;
      value: string;
      confidence: number;
      replacement: string;
    };
    author?: string;
    introducedIn?: string;
  }>;

  // Maturity assessment
  maturityScore: number;
}

/**
 * Map token type to category
 */
function inferTokenCategory(type: string): TokenCategory {
  const typeMap: Record<string, TokenCategory> = {
    color: 'color',
    colours: 'color',
    spacing: 'spacing',
    space: 'spacing',
    gap: 'spacing',
    padding: 'spacing',
    margin: 'spacing',
    typography: 'typography',
    font: 'typography',
    fontSize: 'typography',
    fontWeight: 'typography',
    lineHeight: 'typography',
    radius: 'radius',
    borderRadius: 'radius',
    shadow: 'shadow',
    boxShadow: 'shadow',
  };
  return typeMap[type.toLowerCase()] || 'other';
}

/**
 * Map source type to confidence level
 */
function inferConfidence(source: string): ConfidenceLevel {
  const lower = source.toLowerCase();
  if (lower.includes('tailwind') || lower.includes('tokens.json') || lower.includes('w3c')) {
    return 'certain';
  }
  if (lower.includes('storybook') || lower.includes('css-vars')) {
    return 'high';
  }
  if (lower.includes('css') || lower.includes('scss')) {
    return 'medium';
  }
  return 'low';
}

/**
 * Map drift type string to API drift type
 */
function mapDriftType(type: string): DriftType {
  const typeMap: Record<string, DriftType> = {
    'hardcoded-color': 'hardcoded-color',
    'hardcoded-spacing': 'hardcoded-spacing',
    'hardcoded-typography': 'hardcoded-typography',
    'arbitrary-tailwind': 'arbitrary-tailwind',
    'inline-style': 'inline-style',
    'missing-component': 'missing-component',
    'deprecated-token': 'deprecated-token',
    accessibility: 'accessibility',
    // Common aliases
    color: 'hardcoded-color',
    spacing: 'hardcoded-spacing',
    typography: 'hardcoded-typography',
  };
  return typeMap[type] || 'hardcoded-color';
}

/**
 * Generate stable ID for a drift signal
 */
function generateSignalId(signal: { type: string; file: string; line: number; value: string }): string {
  const content = `${signal.type}|${signal.file}|${signal.line}|${signal.value}`;
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Format scan data for the v1 scan report API
 */
export function formatScanReport(input: ScanReportInput): ScanReportRequest {
  // Convert tokens to API format
  const tokens: DiscoveredToken[] = input.tokens.map((t) => ({
    name: t.name,
    value: t.value,
    category: (t.category as TokenCategory) || inferTokenCategory(t.name),
    confidence: (t.confidence as ConfidenceLevel) || inferConfidence(t.source),
    source: t.source,
    usageCount: t.usageCount,
  }));

  // Convert components to API format
  const components: DiscoveredComponent[] = input.components.map((c) => ({
    name: c.name,
    path: c.path,
    props: c.props || [],
    variants: c.variants || [],
    confidence: (c.confidence as 'certain' | 'high' | 'medium') || 'medium',
    source: c.source,
  }));

  // Convert sources to API format
  const sources: IntentSource[] = input.sources.map((s) => ({
    type: inferConfidence(s.type),
    file: s.file,
    description: s.description,
  }));

  // Convert drift signals to API format
  const signals: DriftSignalReport[] = input.driftSignals.map((d) => ({
    id: generateSignalId(d),
    type: mapDriftType(d.type),
    severity: d.severity,
    file: d.file,
    line: d.line,
    column: d.column,
    value: d.value,
    message: d.message,
    suggestion: d.suggestion,
    author: d.author,
    introducedIn: d.introducedIn,
  }));

  // Calculate drift summary
  const bySeverity = { error: 0, warning: 0, info: 0 };
  const byType: Record<string, number> = {};
  const byFileMap: Record<string, number> = {};

  for (const signal of signals) {
    bySeverity[signal.severity]++;
    byType[signal.type] = (byType[signal.type] || 0) + 1;
    byFileMap[signal.file] = (byFileMap[signal.file] || 0) + 1;
  }

  const byFile = Object.entries(byFileMap)
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count);

  return {
    repo: input.repo,
    commitSha: input.commitSha,
    branch: input.branch,
    prNumber: input.prNumber,
    scanDuration: input.scanDuration,
    isFirstScan: input.isFirstScan,
    designIntent: {
      tokens,
      components,
      sources,
      maturityScore: input.maturityScore,
    },
    drift: {
      signals,
      summary: {
        total: signals.length,
        bySeverity,
        byType,
        byFile,
      },
    },
  };
}

export interface ScanReportResult {
  success: boolean;
  scanId?: string;
  prComment?: {
    shouldComment: boolean;
    commentType: 'drift-report' | 'first-scan-report';
    body: string;
  };
  analysis?: {
    intentChanged: boolean;
    newTokensDiscovered: number;
    driftDelta: number;
  };
  error?: string;
}

/**
 * Report scan results to the v1 API
 */
export async function submitScanReport(
  input: ScanReportInput
): Promise<ScanReportResult> {
  if (!isLoggedIn()) {
    return { success: false, error: 'Not logged in' };
  }

  try {
    const request = formatScanReport(input);
    const result = await reportScan(request);

    if (result.ok && result.data) {
      return {
        success: true,
        scanId: result.data.id,
        prComment: result.data.prComment,
        analysis: result.data.analysis,
      };
    }

    return {
      success: false,
      error: result.error || 'Unknown error',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Upload scan results to Buoy Cloud
 * Returns immediately if not logged in or no cloud project linked.
 */
export async function syncScan(
  projectRoot: string,
  cloudProjectId: string,
  scanData: UploadScanRequest
): Promise<SyncResult> {
  // Check if logged in
  if (!isLoggedIn()) {
    return { success: false, error: 'Not logged in' };
  }

  try {
    const result = await uploadScan(cloudProjectId, scanData);

    if (result.ok && result.data) {
      return {
        success: true,
        scanId: result.data.id,
      };
    }

    // Upload failed - queue for retry
    queueScan(projectRoot, cloudProjectId, scanData, result.error);
    return {
      success: false,
      queued: true,
      error: result.error,
    };
  } catch (error) {
    // Network or other error - queue for retry
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    queueScan(projectRoot, cloudProjectId, scanData, errorMessage);
    return {
      success: false,
      queued: true,
      error: errorMessage,
    };
  }
}

/**
 * Retry uploading queued scans
 */
export async function syncQueue(
  projectRoot: string
): Promise<{ synced: number; failed: number; remaining: number }> {
  const pending = getPendingScans(projectRoot);
  let synced = 0;
  let failed = 0;

  for (const scan of pending) {
    try {
      const result = await uploadScan(scan.projectId, scan.data);

      if (result.ok) {
        removeFromQueue(projectRoot, scan.id);
        synced++;
      } else {
        updateQueuedScan(projectRoot, scan.id, {
          attempts: scan.attempts + 1,
          lastAttempt: new Date().toISOString(),
          error: result.error,
        });
        failed++;
      }
    } catch (error) {
      updateQueuedScan(projectRoot, scan.id, {
        attempts: scan.attempts + 1,
        lastAttempt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      failed++;
    }
  }

  const remaining = getQueueCount(projectRoot);
  return { synced, failed, remaining };
}

/**
 * Check if there are queued scans
 */
export function hasQueuedScans(projectRoot: string): boolean {
  return getQueueCount(projectRoot) > 0;
}

export { getQueueCount };
