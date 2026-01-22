/**
 * ScanStore abstraction for persisting scan results.
 * Works with both local SQLite and cloud API.
 */

import type { Component, DesignToken, DriftSignal } from '@buoy-design/core';

// Project configuration stored with the project
export interface ProjectConfig {
  repoUrl?: string;
  figmaFileKeys?: string[];
  storybookUrl?: string;
  config?: Record<string, unknown>;
}

// Project as stored
export interface StoredProject {
  id: string;
  name: string;
  repoUrl?: string;
  figmaFileKeys?: string[];
  storybookUrl?: string;
  config?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Scan status
export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed';

// Scan stats
export interface ScanStats {
  componentCount: number;
  tokenCount: number;
  driftCount: number;
  duration?: number;
}

// Scan as stored
export interface StoredScan {
  id: string;
  projectId: string;
  status: ScanStatus;
  sources: string[];
  stats?: ScanStats;
  errors?: string[];
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

// Results to store after a scan completes
export interface ScanResults {
  components: Component[];
  tokens: DesignToken[];
  drifts: DriftSignal[];
  errors?: string[];
}

// Diff between two scans
export interface ScanDiff {
  added: {
    components: Component[];
    tokens: DesignToken[];
    drifts: DriftSignal[];
  };
  removed: {
    components: Component[];
    tokens: DesignToken[];
    drifts: DriftSignal[];
  };
  modified: {
    components: Array<{ before: Component; after: Component }>;
    tokens: Array<{ before: DesignToken; after: DesignToken }>;
  };
}

// Snapshot summary for quick stats
export interface ScanSnapshot {
  id: string;
  projectId: string;
  scanId: string;
  componentCount: number;
  tokenCount: number;
  driftCount: number;
  coverageScore?: number;
  summary: {
    critical: number;
    warning: number;
    info: number;
    frameworks: string[];
  };
  createdAt: Date;
}

/**
 * ScanStore interface - implemented by LocalScanStore (SQLite) and CloudScanStore (API).
 */
export interface ScanStore {
  /**
   * Get or create a project by name.
   * If the project exists, returns it. Otherwise creates it.
   */
  getOrCreateProject(name: string, config?: ProjectConfig): Promise<StoredProject>;

  /**
   * Get a project by ID.
   */
  getProject(projectId: string): Promise<StoredProject | null>;

  /**
   * Start a new scan for a project.
   * Creates a scan record in 'running' state.
   */
  startScan(projectId: string, sources: string[]): Promise<StoredScan>;

  /**
   * Mark a scan as completed and store results.
   */
  completeScan(scanId: string, results: ScanResults): Promise<void>;

  /**
   * Mark a scan as failed with an error message.
   */
  failScan(scanId: string, error: string): Promise<void>;

  /**
   * Get the latest completed scan for a project.
   */
  getLatestScan(projectId: string): Promise<StoredScan | null>;

  /**
   * Get scan history for a project.
   */
  getScans(projectId: string, limit?: number): Promise<StoredScan[]>;

  /**
   * Get a specific scan by ID.
   */
  getScan(scanId: string): Promise<StoredScan | null>;

  /**
   * Get components from a scan.
   */
  getComponents(scanId: string): Promise<Component[]>;

  /**
   * Get tokens from a scan.
   */
  getTokens(scanId: string): Promise<DesignToken[]>;

  /**
   * Get drift signals from a scan.
   */
  getDriftSignals(scanId: string): Promise<DriftSignal[]>;

  /**
   * Get snapshots for a project (historical stats).
   */
  getSnapshots(projectId: string, limit?: number): Promise<ScanSnapshot[]>;

  /**
   * Compare two scans and return the diff.
   */
  compareScan(currentScanId: string, previousScanId: string): Promise<ScanDiff>;

  /**
   * Close the store connection (for cleanup).
   */
  close(): void;
}
