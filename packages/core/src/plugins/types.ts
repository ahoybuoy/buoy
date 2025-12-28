import type { Component, DesignToken } from '../models/index.js';

export interface PluginMetadata {
  name: string;
  version: string;
  description?: string;
  detects?: string[]; // Framework identifiers this plugin handles: ['react', 'next']
}

export interface ScanContext {
  projectRoot: string;
  config: Record<string, unknown>;
  include?: string[];
  exclude?: string[];
}

export interface ScanResult {
  components: Component[];
  tokens: DesignToken[];
  errors: Array<{ file?: string; message: string; code?: string }>;
  stats: { filesScanned: number; itemsFound: number; duration: number };
}

export interface ReportContext {
  ci: boolean;
  format: 'json' | 'table' | 'markdown';
  github?: {
    token: string;
    repo: string;
    pr: number;
  };
}

export interface DriftResult {
  signals: Array<{
    type: string;
    severity: 'critical' | 'warning' | 'info';
    message: string;
    component?: string;
    file?: string;
    line?: number;
    suggestion?: string;
  }>;
  summary: { total: number; critical: number; warning: number; info: number };
}

export interface BuoyPlugin {
  metadata: PluginMetadata;

  // Optional: Scanner capability
  scan?(context: ScanContext): Promise<ScanResult>;

  // Optional: Reporter capability (for CI integrations)
  report?(results: DriftResult, context: ReportContext): Promise<void>;
}

export type PluginFactory = () => BuoyPlugin | Promise<BuoyPlugin>;
