import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { glob } from 'glob';

export interface DetectedFramework {
  name: string;
  plugin: string;  // Suggested plugin name
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const FRAMEWORK_PATTERNS: Array<{
  name: string;
  plugin: string;
  packages?: string[];
  files?: string[];
}> = [
  // React ecosystem
  { name: 'react', plugin: 'react', packages: ['react', 'react-dom'] },
  { name: 'next', plugin: 'react', packages: ['next'] },
  { name: 'remix', plugin: 'react', packages: ['@remix-run/react'] },
  { name: 'gatsby', plugin: 'react', packages: ['gatsby'] },

  // Vue ecosystem
  { name: 'vue', plugin: 'vue', packages: ['vue'] },
  { name: 'nuxt', plugin: 'vue', packages: ['nuxt', 'nuxt3'] },

  // Svelte ecosystem
  { name: 'svelte', plugin: 'svelte', packages: ['svelte'] },
  { name: 'sveltekit', plugin: 'svelte', packages: ['@sveltejs/kit'] },

  // Angular
  { name: 'angular', plugin: 'angular', packages: ['@angular/core'] },

  // Web Components
  { name: 'lit', plugin: 'webcomponents', packages: ['lit', 'lit-element'] },
  { name: 'stencil', plugin: 'webcomponents', packages: ['@stencil/core'] },

  // CSS/Tokens
  { name: 'tailwind', plugin: 'tailwind', packages: ['tailwindcss'], files: ['tailwind.config.*'] },
  { name: 'css-variables', plugin: 'css', files: ['**/*.css'] },

  // Design tools
  { name: 'figma', plugin: 'figma', files: ['.figmarc', 'figma.config.*'] },
  { name: 'storybook', plugin: 'storybook', packages: ['@storybook/react', '@storybook/vue3', '@storybook/svelte'], files: ['.storybook/**'] },
];

export async function detectFrameworks(projectRoot: string): Promise<DetectedFramework[]> {
  const detected: DetectedFramework[] = [];

  // Read package.json
  const pkgPath = resolve(projectRoot, 'package.json');
  let pkgJson: PackageJson = {};

  if (existsSync(pkgPath)) {
    try {
      pkgJson = JSON.parse(await readFile(pkgPath, 'utf-8'));
    } catch {
      // Invalid JSON, continue with empty dependencies
    }
  }

  const allDeps = {
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies,
  };
  const depNames = Object.keys(allDeps);

  for (const pattern of FRAMEWORK_PATTERNS) {
    // Check package.json dependencies
    if (pattern.packages) {
      const matchedPkg = pattern.packages.find((pkg) => depNames.includes(pkg));
      if (matchedPkg) {
        detected.push({
          name: pattern.name,
          plugin: pattern.plugin,
          confidence: 'high',
          evidence: `Found "${matchedPkg}" in package.json`,
        });
        continue;
      }
    }

    // Check for config files
    if (pattern.files) {
      for (const filePattern of pattern.files) {
        const matches = await glob(filePattern, { cwd: projectRoot, nodir: true });
        if (matches.length > 0) {
          detected.push({
            name: pattern.name,
            plugin: pattern.plugin,
            confidence: pattern.packages ? 'medium' : 'high',
            evidence: `Found ${matches[0]}`,
          });
          break;
        }
      }
    }
  }

  // Deduplicate by plugin name, keeping highest confidence
  const byPlugin = new Map<string, DetectedFramework>();
  for (const d of detected) {
    const existing = byPlugin.get(d.plugin);
    if (!existing || confidenceRank(d.confidence) > confidenceRank(existing.confidence)) {
      byPlugin.set(d.plugin, d);
    }
  }

  return Array.from(byPlugin.values());
}

function confidenceRank(c: 'high' | 'medium' | 'low'): number {
  return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}

export function detectPackageManager(projectRoot: string = process.cwd()): 'pnpm' | 'yarn' | 'npm' {
  if (existsSync(resolve(projectRoot, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (existsSync(resolve(projectRoot, 'yarn.lock'))) {
    return 'yarn';
  }
  return 'npm';
}

export function getPluginInstallCommand(plugins: string[], projectRoot: string = process.cwd()): string {
  const fullNames = plugins.map((p) => `@buoy/plugin-${p}`);
  const pm = detectPackageManager(projectRoot);

  switch (pm) {
    case 'pnpm':
      return `pnpm add -D ${fullNames.join(' ')}`;
    case 'yarn':
      return `yarn add -D ${fullNames.join(' ')}`;
    default:
      return `npm install --save-dev ${fullNames.join(' ')}`;
  }
}
