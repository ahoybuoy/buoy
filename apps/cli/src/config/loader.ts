import { existsSync } from 'fs';
import { resolve, basename } from 'path';
import { pathToFileURL } from 'url';
import { BuoyConfig, BuoyConfigSchema } from './schema.js';

const CONFIG_FILES = [
  'buoy.config.mjs',
  'buoy.config.js',
  'buoy.config.ts',  // Requires tsx or similar runtime
  '.buoyrc.json',
  '.buoyrc',
];

export interface LoadConfigResult {
  config: BuoyConfig;
  configPath: string | null;
}

export async function loadConfig(cwd: string = process.cwd()): Promise<LoadConfigResult> {
  // Find config file
  let configPath: string | null = null;

  for (const filename of CONFIG_FILES) {
    const fullPath = resolve(cwd, filename);
    if (existsSync(fullPath)) {
      configPath = fullPath;
      break;
    }
  }

  if (!configPath) {
    // Return default config if no file found
    return {
      config: BuoyConfigSchema.parse({
        project: { name: basename(cwd) },
      }),
      configPath: null,
    };
  }

  // Load config based on extension
  const ext = configPath.split('.').pop();

  try {
    if (ext === 'json' || configPath.endsWith('.buoyrc')) {
      const { readFileSync } = await import('fs');
      const content = readFileSync(configPath, 'utf-8');
      const raw = JSON.parse(content);
      return {
        config: BuoyConfigSchema.parse(raw),
        configPath,
      };
    }

    // For JS/TS files, we need to import them
    // Note: TypeScript files need tsx or similar runtime
    const fileUrl = pathToFileURL(configPath).href;
    const mod = await import(fileUrl);
    const raw = mod.default || mod;

    return {
      config: BuoyConfigSchema.parse(raw),
      configPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load config from ${configPath}: ${message}`);
  }
}

export function getConfigPath(cwd: string = process.cwd()): string | null {
  for (const filename of CONFIG_FILES) {
    const fullPath = resolve(cwd, filename);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}
