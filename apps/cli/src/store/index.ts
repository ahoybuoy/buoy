/**
 * ScanStore factory and exports.
 *
 * Usage:
 *   import { createStore } from './store/index.js';
 *   const store = createStore(); // Auto-detects local or cloud
 */

export type {
  ScanStore,
  StoredProject,
  StoredScan,
  ScanResults,
  ScanDiff,
  ScanSnapshot,
  ProjectConfig,
  ScanStatus,
  ScanStats,
} from './types.js';

export { LocalScanStore, type LocalStoreConfig } from './local-store.js';
export { CloudScanStore, type CloudStoreConfig } from './cloud-store.js';

import { LocalScanStore, type LocalStoreConfig } from './local-store.js';
import { CloudScanStore, type CloudStoreConfig } from './cloud-store.js';
import type { ScanStore } from './types.js';
import { isLoggedIn, getApiToken } from '../cloud/index.js';

export interface StoreConfig {
  /**
   * Force local store even if cloud credentials exist.
   */
  forceLocal?: boolean;

  /**
   * Local store configuration (path, in-memory).
   */
  local?: LocalStoreConfig;

  /**
   * Cloud store configuration (API URL, key).
   * If not provided, will try to load from environment.
   */
  cloud?: CloudStoreConfig;
}

/**
 * Default Buoy Cloud API URL.
 */
const DEFAULT_API_URL = 'https://api.buoy.design';

/**
 * Create a ScanStore instance.
 *
 * Auto-detection logic:
 * 1. If forceLocal is true, use LocalScanStore
 * 2. If cloud config is provided, use CloudScanStore
 * 3. If user is logged in (has token), use CloudScanStore
 * 4. Otherwise, use LocalScanStore
 *
 * This allows seamless transition from local to cloud storage
 * when the user runs `buoy login`.
 */
export function createStore(config: StoreConfig = {}): ScanStore {
  // Force local if requested
  if (config.forceLocal) {
    return new LocalScanStore(config.local);
  }

  // Use cloud if explicitly configured
  if (config.cloud) {
    return new CloudScanStore(config.cloud);
  }

  // Check if user is logged in to Buoy Cloud
  if (isLoggedIn()) {
    const token = getApiToken();
    if (token) {
      const apiUrl = process.env.BUOY_API_URL || DEFAULT_API_URL;
      return new CloudScanStore({
        apiUrl,
        apiKey: token,
      });
    }
  }

  // Default to local store
  return new LocalScanStore(config.local);
}

/**
 * Create a local-only store.
 * Useful for testing or when you explicitly want local storage.
 */
export function createLocalStore(config?: LocalStoreConfig): LocalScanStore {
  return new LocalScanStore(config);
}

/**
 * Check if the store would use cloud storage.
 * Useful for showing UI hints about where data is stored.
 */
export function wouldUseCloud(config: StoreConfig = {}): boolean {
  if (config.forceLocal) return false;
  if (config.cloud) return true;
  return isLoggedIn();
}

/**
 * Get the project name from the current directory.
 * Uses package.json name or directory name as fallback.
 */
export function getProjectName(cwd: string = process.cwd()): string {
  try {
    const { readFileSync } = require('fs');
    const { join, basename } = require('path');

    const pkgPath = join(cwd, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    // Use package name, but strip scope if present
    if (pkg.name) {
      return pkg.name.replace(/^@[^/]+\//, '');
    }

    // Fallback to directory name
    return basename(cwd);
  } catch {
    // No package.json or invalid JSON - use directory name
    const { basename } = require('path');
    return basename(cwd);
  }
}
