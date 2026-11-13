import { existsSync, readFileSync } from 'fs';
import { basename, dirname, resolve } from 'path';
import { pathToFileURL } from 'url';
import { parse as parseYaml, YAMLError } from 'yaml';
import { ZodError } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { BuoyConfig, BuoyConfigSchema, DriftConfigSchema, SourcesConfig } from './schema.js';
import { buildAutoConfig } from './auto-detect.js';

/**
 * Framework sources that can be auto-detected and merged.
 * These are the component scanning sources (not tokens/figma/storybook).
 */
const AUTO_DETECTABLE_SOURCES: (keyof SourcesConfig)[] = [
  'react', 'vue', 'svelte', 'angular', 'webcomponent', 'templates', 'tailwind', 'tokens'
];

/**
 * Merge auto-detected framework sources into user config.
 * This ensures that if a user provides a partial config (e.g., only tokens),
 * we still auto-detect and enable framework sources like React.
 *
 * User's explicit settings always take precedence:
 * - If user sets `react: { enabled: false }`, we respect that
 * - If user doesn't mention a source at all, we merge in auto-detected config
 */
async function mergeAutoDetectedSources(
  userConfig: BuoyConfig,
  cwd: string
): Promise<BuoyConfig> {
  // Run auto-detection to get framework sources
  const { config: autoConfig } = await buildAutoConfig(cwd);

  // Start with user config
  const mergedConfig: BuoyConfig = { ...userConfig };

  // Merge auto-detected sources that the user didn't explicitly configure
  for (const source of AUTO_DETECTABLE_SOURCES) {
    // If user didn't define this source at all, use auto-detected
    if (userConfig.sources[source] === undefined && autoConfig.sources[source]) {
      mergedConfig.sources = {
        ...mergedConfig.sources,
        [source]: autoConfig.sources[source],
      };
    }
  }

  return mergedConfig;
}

const CONFIG_FILES = [
  '.buoy.yaml',       // Primary - YAML
  '.buoy.yml',        // Alt YAML extension
  'buoy.config.mjs',  // Legacy ESM (still supported)
  'buoy.config.js',   // Legacy JS
  'buoy.config.ts',   // Requires tsx or similar runtime
  '.buoyrc.json',     // Legacy JSON
  '.buoyrc',          // Legacy JSON
];

/**
 * A config file found on disk but rejected (bad YAML/JSON, or a value the
 * schema refuses). `problem` is the one-line reason, without the file name.
 */
export class ConfigFileError extends Error {
  constructor(message: string, readonly configPath: string, readonly problem: string) {
    super(message);
    this.name = 'ConfigFileError';
  }
}

/**
 * `project` is optional in a config file: a .buoy.yaml that only sets
 * `drift.ignore` is a complete config. Default the name to the folder the
 * config lives in, the same name zero-config auto-detection uses.
 */
export function withDefaultProject(raw: unknown, configDir: string): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const config = raw as Record<string, unknown>;
  const name = basename(configDir);
  if (config.project === undefined || config.project === null) {
    return { ...config, project: { name } };
  }
  const project = config.project;
  if (typeof project === 'object' && !Array.isArray(project) && (project as Record<string, unknown>).name === undefined) {
    return { ...config, project: { ...project, name } };
  }
  return raw;
}

export interface LoadConfigResult {
  config: BuoyConfig;
  configPath: string | null;
  /** Keys in the config file that neither the CLI nor the GitHub App reads (they are ignored). */
  unknownKeys?: string[];
}

/**
 * Top-level keys the Buoy GitHub App reads from the same .buoy.yaml
 * (buoy-cloud src/lib/repo-settings.ts). They mean nothing to the CLI but are not mistakes.
 */
const GITHUB_APP_KEYS = new Set([
  'frameworks', 'tokens', 'sources', 'components', 'ignore', 'checks', 'severity', 'reviews',
  'thresholds', 'instructions', 'auto_baseline', 'labels', 'ignore_signals', 'drift', 'health',
]);

/**
 * Keys that nothing reads, so a typo or a copied example doesn't vanish without a word.
 * Covers the top level and the `drift` section (the place ignore rules go).
 */
export function unknownConfigKeys(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const top = raw as Record<string, unknown>;
  const known = new Set(Object.keys(BuoyConfigSchema.shape));
  const unknown = Object.keys(top).filter((key) => !known.has(key) && !GITHUB_APP_KEYS.has(key));
  const drift = top.drift;
  if (drift && typeof drift === 'object' && !Array.isArray(drift)) {
    const driftKnown = new Set(Object.keys(DriftConfigSchema.shape));
    for (const key of Object.keys(drift)) if (!driftKnown.has(key)) unknown.push(`drift.${key}`);
  }
  return unknown;
}

const warnedConfigPaths = new Set<string>();

/** One stderr line per config file per process; stdout stays clean for --json. */
function warnUnknownKeys(configPath: string, keys: string[]): void {
  if (keys.length === 0 || warnedConfigPaths.has(configPath)) return;
  warnedConfigPaths.add(configPath);
  const list = keys.map((key) => `\`${key}\``).join(', ');
  process.stderr.write(`Buoy: ignoring unknown key${keys.length > 1 ? 's' : ''} ${list} in ${configPath}\n`);
}

function findConfigPathUpwards(cwd: string): string | null {
  let current = resolve(cwd);

  while (true) {
    for (const filename of CONFIG_FILES) {
      const fullPath = resolve(current, filename);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Apply preset defaults to config. User-specified values take precedence.
 */
function applyPreset(config: BuoyConfig): BuoyConfig {
  if (!config.preset || config.preset === 'default') return config;

  if (config.preset === 'strict') {
    return {
      ...config,
      drift: {
        ...config.drift,
        failOn: config.drift?.failOn ?? 'warning',
      },
    };
  }

  if (config.preset === 'relaxed') {
    const existingExclude = config.drift?.exclude ?? [];
    const relaxedExclude = ['missing-documentation', 'naming-inconsistency']
      .filter(t => !existingExclude.includes(t));
    return {
      ...config,
      drift: {
        ...config.drift,
        failOn: config.drift?.failOn ?? 'critical',
        exclude: [...existingExclude, ...relaxedExclude],
      },
    };
  }

  return config;
}

export async function loadConfig(cwd: string = process.cwd()): Promise<LoadConfigResult> {
  // Find config file (walk up so monorepo package dirs can use root config)
  let configPath: string | null = findConfigPathUpwards(cwd);

  if (!configPath) {
    // No config file - use zero-config auto-detection
    const { config } = await buildAutoConfig(cwd);
    return {
      config,
      configPath: null,
    };
  }

  // Load config based on extension
  const ext = configPath.split('.').pop();
  const configDir = dirname(configPath);

  try {
    let userConfig: BuoyConfig;
    let raw: unknown;

    // YAML config files (.buoy.yaml, .buoy.yml)
    if (ext === 'yaml' || ext === 'yml') {
      const content = readFileSync(configPath, 'utf-8');
      raw = parseYaml(content);
      userConfig = BuoyConfigSchema.parse(withDefaultProject(raw, configDir));
    }
    // JSON config files (.buoyrc.json, .buoyrc)
    else if (ext === 'json' || configPath.endsWith('.buoyrc')) {
      const content = readFileSync(configPath, 'utf-8');
      raw = JSON.parse(content);
      userConfig = BuoyConfigSchema.parse(withDefaultProject(raw, configDir));
    }
    // For JS/TS files, we need to import them
    // Note: TypeScript files need tsx or similar runtime
    else {
      const fileUrl = pathToFileURL(configPath).href;
      const mod = await import(fileUrl);
      raw = mod.default || mod;
      userConfig = BuoyConfigSchema.parse(withDefaultProject(raw, configDir));
    }

    // Apply preset defaults (user-specified values take precedence)
    userConfig = applyPreset(userConfig);

    // Merge auto-detected framework sources with user config
    // This ensures partial configs still get framework detection
    const mergedConfig = await mergeAutoDetectedSources(userConfig, configDir);

    const unknownKeys = unknownConfigKeys(raw);
    warnUnknownKeys(configPath, unknownKeys);

    return {
      config: mergedConfig,
      configPath,
      unknownKeys,
    };
  } catch (error) {
    // Provide helpful error messages for different error types
    if (error instanceof ZodError) {
      const validationError = fromZodError(error as any, {
        prefix: 'Configuration error',
        prefixSeparator: ': ',
      });
      const problem = fromZodError(error as any, { prefix: null }).message;
      throw new ConfigFileError(
        `Invalid config in ${configPath}:\n\n${validationError.message}\n\nRun 'buoy dock' to generate a valid configuration.`,
        configPath,
        problem,
      );
    }

    if (error instanceof SyntaxError) {
      throw new ConfigFileError(
        `Invalid JSON in ${configPath}: ${error.message}\n\nCheck for missing commas, trailing commas, or unquoted keys.`,
        configPath,
        error.message,
      );
    }

    if (error instanceof YAMLError) {
      const problem = error.message.split('\n')[0] ?? error.message;
      throw new ConfigFileError(`Invalid YAML in ${configPath}: ${error.message}`, configPath, problem);
    }

    // Handle import errors (for JS/TS config files)
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      throw new Error(
        `Failed to load config from ${configPath}: Module not found.\n\nIf using TypeScript, ensure tsx or ts-node is installed.`,
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load config from ${configPath}: ${message}`);
  }
}

export function getConfigPath(cwd: string = process.cwd()): string | null {
  return findConfigPathUpwards(cwd);
}
