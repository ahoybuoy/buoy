/**
 * CloudScanStore - API-based implementation of ScanStore.
 * Connects to Buoy Cloud for persistence.
 *
 * This is a stub that will be implemented when Buoy Cloud API is ready.
 */

import type { Component, DesignToken, DriftSignal } from '@buoy-design/core';
import type {
  ScanStore,
  StoredProject,
  StoredScan,
  ScanResults,
  ScanDiff,
  ScanSnapshot,
  ProjectConfig,
} from './types.js';

export interface CloudStoreConfig {
  apiUrl: string;
  apiKey: string;
  projectId?: string;
}

export class CloudScanStore implements ScanStore {
  private apiUrl: string;
  private apiKey: string;

  constructor(config: CloudStoreConfig) {
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cloud API error: ${response.status} ${error}`);
    }

    return response.json() as Promise<T>;
  }

  async getOrCreateProject(name: string, config?: ProjectConfig): Promise<StoredProject> {
    return this.fetch<StoredProject>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, ...config }),
    });
  }

  async getProject(projectId: string): Promise<StoredProject | null> {
    try {
      return await this.fetch<StoredProject>(`/projects/${projectId}`);
    } catch {
      return null;
    }
  }

  async startScan(projectId: string, sources: string[]): Promise<StoredScan> {
    return this.fetch<StoredScan>(`/projects/${projectId}/scans`, {
      method: 'POST',
      body: JSON.stringify({ sources }),
    });
  }

  async completeScan(scanId: string, results: ScanResults): Promise<void> {
    await this.fetch(`/scans/${scanId}/complete`, {
      method: 'POST',
      body: JSON.stringify(results),
    });
  }

  async failScan(scanId: string, error: string): Promise<void> {
    await this.fetch(`/scans/${scanId}/fail`, {
      method: 'POST',
      body: JSON.stringify({ error }),
    });
  }

  async getLatestScan(projectId: string): Promise<StoredScan | null> {
    try {
      return await this.fetch<StoredScan>(`/projects/${projectId}/scans/latest`);
    } catch {
      return null;
    }
  }

  async getScans(projectId: string, limit = 10): Promise<StoredScan[]> {
    return this.fetch<StoredScan[]>(`/projects/${projectId}/scans?limit=${limit}`);
  }

  async getScan(scanId: string): Promise<StoredScan | null> {
    try {
      return await this.fetch<StoredScan>(`/scans/${scanId}`);
    } catch {
      return null;
    }
  }

  async getComponents(scanId: string): Promise<Component[]> {
    return this.fetch<Component[]>(`/scans/${scanId}/components`);
  }

  async getTokens(scanId: string): Promise<DesignToken[]> {
    return this.fetch<DesignToken[]>(`/scans/${scanId}/tokens`);
  }

  async getDriftSignals(scanId: string): Promise<DriftSignal[]> {
    return this.fetch<DriftSignal[]>(`/scans/${scanId}/drifts`);
  }

  async getSnapshots(projectId: string, limit = 10): Promise<ScanSnapshot[]> {
    return this.fetch<ScanSnapshot[]>(`/projects/${projectId}/snapshots?limit=${limit}`);
  }

  async compareScan(currentScanId: string, previousScanId: string): Promise<ScanDiff> {
    return this.fetch<ScanDiff>(
      `/scans/${currentScanId}/compare?previous=${previousScanId}`
    );
  }

  close(): void {
    // No-op for HTTP client
  }
}
