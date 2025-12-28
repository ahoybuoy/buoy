import { Command } from 'commander';
import { writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { success, error, info, warning } from '../output/reporters.js';
import { ProjectDetector, type DetectedProject } from '../detect/index.js';

function generateConfig(project: DetectedProject): string {
  const lines: string[] = [];

  lines.push(`/** @type {import('@buoy/cli').BuoyConfig} */`);
  lines.push(`export default {`);
  lines.push(`  project: {`);
  lines.push(`    name: '${project.name}',`);
  lines.push(`  },`);
  lines.push(`  sources: {`);

  // Determine the correct source key based on framework
  const getSourceKey = (frameworkName: string): string | null => {
    // React-based frameworks
    if (['react', 'nextjs', 'remix', 'gatsby', 'react-native', 'expo', 'preact', 'solid'].includes(frameworkName)) {
      return 'react';
    }
    // Vue-based frameworks
    if (['vue', 'nuxt'].includes(frameworkName)) {
      return 'vue';
    }
    // Svelte-based frameworks
    if (['svelte', 'sveltekit'].includes(frameworkName)) {
      return 'svelte';
    }
    // Angular
    if (frameworkName === 'angular') {
      return 'angular';
    }
    // Web Components
    if (['lit', 'stencil'].includes(frameworkName)) {
      return 'webcomponent';
    }
    // Astro is special - can use multiple frameworks
    if (frameworkName === 'astro') {
      return 'react'; // Default to React for Astro
    }
    return null;
  };

  // File extensions by framework
  const getExtensions = (sourceKey: string, typescript: boolean): string[] => {
    switch (sourceKey) {
      case 'vue':
        return ['vue'];
      case 'svelte':
        return ['svelte'];
      case 'angular':
        return ['component.ts'];
      case 'webcomponent':
        return ['ts'];
      default: // react
        return typescript ? ['tsx', 'jsx'] : ['jsx', 'tsx'];
    }
  };

  // JS Framework config (React, Vue, Svelte, Angular, Web Components)
  // Handle multiple frameworks - generate config for each UI framework
  const addedSourceKeys = new Set<string>();

  for (const framework of project.frameworks) {
    const sourceKey = getSourceKey(framework.name);

    if (sourceKey && !addedSourceKeys.has(sourceKey)) {
      addedSourceKeys.add(sourceKey);
      const extensions = getExtensions(sourceKey, framework.typescript);
      const jsComponents = project.components.filter(c =>
        c.type === 'jsx' || c.type === 'vue' || c.type === 'svelte' || !c.type
      );

      let includePatterns: string[];
      if (jsComponents.length > 0) {
        includePatterns = jsComponents.flatMap(c =>
          extensions.map(ext => `${c.path}/**/*.${ext}`)
        );
      } else {
        includePatterns = extensions.map(ext => `src/**/*.${ext}`);
      }

      lines.push(`    ${sourceKey}: {`);
      lines.push(`      enabled: true,`);
      lines.push(`      include: [${includePatterns.map((p) => `'${p}'`).join(', ')}],`);
      lines.push(`      exclude: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*'],`);
      if (project.designSystem) {
        lines.push(`      designSystemPackage: '${project.designSystem.package}',`);
      }
      if (sourceKey === 'webcomponent') {
        const wcFramework = framework.name === 'lit' ? 'lit' : 'stencil';
        lines.push(`      framework: '${wcFramework}',`);
      }
      lines.push(`    },`);
    }
  }

  // Server-side / template-based framework config
  const serverFrameworks = [
    'php', 'laravel', 'symfony',
    'rails',
    'django', 'flask', 'fastapi',
    'express', 'nestjs',
    'spring', 'aspnet',
    'go',
    'hugo', 'jekyll', 'eleventy',
  ];

  // Map framework to template type
  const getTemplateType = (frameworkName: string, componentType?: string): string => {
    if (componentType === 'blade') return 'blade';
    if (componentType === 'erb') return 'erb';
    if (componentType === 'twig') return 'twig';
    if (componentType === 'njk') return 'njk';

    // Framework-based defaults
    if (frameworkName === 'laravel') return 'blade';
    if (frameworkName === 'rails') return 'erb';
    if (frameworkName === 'symfony') return 'twig';
    if (frameworkName === 'eleventy') return 'njk';
    return 'html';
  };

  // Check if any framework is a server-side framework
  const serverFramework = project.frameworks.find(f => serverFrameworks.includes(f.name));
  if (serverFramework) {
    const templateComponents = project.components.filter(c =>
      c.type === 'php' || c.type === 'blade' || c.type === 'erb' ||
      c.type === 'twig' || c.type === 'html' || c.type === 'njk'
    );
    if (templateComponents.length > 0) {
      // Use the first component's type to determine template type
      const templateType = getTemplateType(
        serverFramework.name,
        templateComponents[0]?.type
      );

      lines.push(`    templates: {`);
      lines.push(`      enabled: true,`);
      lines.push(`      type: '${templateType}',`);
      lines.push(`      include: [`);
      for (const comp of templateComponents) {
        lines.push(`        '${comp.pattern}',`);
      }
      lines.push(`      ],`);
      lines.push(`    },`);
    }
  }

  // Storybook config
  if (project.storybook) {
    lines.push(`    storybook: {`);
    lines.push(`      enabled: true,`);
    lines.push(`    },`);
  }

  // Token files config
  const tokenFiles = project.tokens.filter((t) => t.type !== 'tailwind');
  const hasTailwind = project.tokens.some((t) => t.type === 'tailwind');

  if (tokenFiles.length > 0 || hasTailwind) {
    lines.push(`    tokens: {`);
    lines.push(`      enabled: true,`);
    if (tokenFiles.length > 0) {
      lines.push(`      files: [`);
      for (const token of tokenFiles) {
        lines.push(`        '${token.path}',`);
      }
      lines.push(`      ],`);
    }
    lines.push(`    },`);
  }

  // Figma placeholder (always disabled by default)
  lines.push(`    figma: {`);
  lines.push(`      enabled: false,`);
  lines.push(`      // accessToken: process.env.FIGMA_ACCESS_TOKEN,`);
  lines.push(`      // fileKeys: [],`);
  lines.push(`    },`);

  lines.push(`  },`);
  lines.push(`  output: {`);
  lines.push(`    format: 'table',`);
  lines.push(`    colors: true,`);
  lines.push(`  },`);
  lines.push(`};`);
  lines.push(``);

  return lines.join('\n');
}

function printDetectionResults(project: DetectedProject): void {
  console.log('');
  console.log(chalk.bold('  Detected:'));

  const frameworkNames: Record<string, string> = {
    // JS frameworks
    'react': 'React',
    'vue': 'Vue',
    'svelte': 'Svelte',
    'angular': 'Angular',
    'solid': 'Solid',
    'preact': 'Preact',
    // Meta-frameworks
    'nextjs': 'Next.js',
    'nuxt': 'Nuxt',
    'astro': 'Astro',
    'remix': 'Remix',
    'sveltekit': 'SvelteKit',
    'gatsby': 'Gatsby',
    // Mobile
    'react-native': 'React Native',
    'flutter': 'Flutter',
    'expo': 'Expo',
    // Web Components
    'lit': 'Lit',
    'stencil': 'Stencil',
    // Server-side
    'php': 'PHP',
    'laravel': 'Laravel',
    'symfony': 'Symfony',
    'rails': 'Ruby on Rails',
    'django': 'Django',
    'flask': 'Flask',
    'fastapi': 'FastAPI',
    'express': 'Express',
    'nestjs': 'NestJS',
    'spring': 'Spring Boot',
    'aspnet': 'ASP.NET',
    'go': 'Go',
    // Static site generators
    'hugo': 'Hugo',
    'jekyll': 'Jekyll',
    'eleventy': 'Eleventy',
  };

  // Frameworks - show all detected
  if (project.frameworks.length > 0) {
    // Show warning if multiple UI frameworks detected (framework sprawl)
    const uiFrameworks = ['react', 'vue', 'svelte', 'angular', 'solid', 'preact', 'lit', 'stencil',
      'nextjs', 'nuxt', 'astro', 'remix', 'sveltekit', 'gatsby', 'react-native', 'expo', 'flutter'];
    const uiCount = project.frameworks.filter(f => uiFrameworks.includes(f.name)).length;

    if (uiCount > 1) {
      console.log(chalk.yellow('    ⚠ ') + chalk.yellow.bold('Multiple UI frameworks detected (framework sprawl)'));
    }

    for (const framework of project.frameworks) {
      const ts = framework.typescript ? ' + TypeScript' : '';
      const frameworkName = frameworkNames[framework.name] || capitalize(framework.name);
      const meta = framework.meta ? chalk.dim(` (${framework.meta})`) : '';
      const version = framework.version !== 'unknown' ? ` ${framework.version}` : '';
      console.log(
        chalk.green('    ✓ ') +
          chalk.bold(frameworkName) +
          ts +
          meta +
          chalk.dim(version)
      );
    }
  }

  // Components
  if (project.components.length > 0) {
    for (const comp of project.components) {
      const typeLabels: Record<string, string> = {
        'jsx': 'component files',
        'vue': 'Vue components',
        'svelte': 'Svelte components',
        'php': 'PHP templates',
        'blade': 'Blade templates',
        'erb': 'ERB templates',
        'twig': 'Twig templates',
        'html': 'HTML templates',
        'njk': 'Nunjucks templates',
      };
      const typeLabel = comp.type ? (typeLabels[comp.type] || 'template files') : 'component files';
      console.log(
        chalk.green('    ✓ ') +
          `${comp.fileCount} ${typeLabel} in ` +
          chalk.cyan(comp.path)
      );
    }
  }

  // Tokens
  if (project.tokens.length > 0) {
    for (const token of project.tokens) {
      const icon = token.type === 'tailwind' ? '    ✓ ' : '    ✓ ';
      console.log(chalk.green(icon) + `${token.name}: ` + chalk.cyan(token.path));
    }
  }

  // Storybook
  if (project.storybook) {
    const version = project.storybook.version ? ` (${project.storybook.version})` : '';
    console.log(chalk.green('    ✓ ') + `Storybook` + chalk.dim(version));
  }

  // Design system
  if (project.designSystem) {
    console.log(
      chalk.green('    ✓ ') +
        `Design system: ` +
        chalk.cyan(project.designSystem.package)
    );
  }

  // Monorepo
  if (project.monorepo) {
    console.log(
      chalk.green('    ✓ ') +
        capitalize(project.monorepo.type) +
        ` monorepo (${project.monorepo.packages.length} packages)`
    );
  }

  // Nothing found
  if (
    project.frameworks.length === 0 &&
    project.components.length === 0 &&
    project.tokens.length === 0 &&
    !project.storybook
  ) {
    console.log(chalk.yellow('    ⚠ ') + 'No sources auto-detected');
    console.log(chalk.dim('      You can manually configure sources in buoy.config.mjs'));
  }

  console.log('');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function createInitCommand(): Command {
  const cmd = new Command('init')
    .description('Initialize Buoy configuration in the current project')
    .option('-f, --force', 'Overwrite existing configuration')
    .option('-n, --name <name>', 'Project name')
    .option('--skip-detect', 'Skip auto-detection and create minimal config')
    .action(async (options) => {
      const cwd = process.cwd();
      const configPath = resolve(cwd, 'buoy.config.mjs');

      // Check if config already exists
      if (existsSync(configPath) && !options.force) {
        warning(`Configuration already exists at ${configPath}`);
        info('Use --force to overwrite');
        return;
      }

      let project: DetectedProject;

      if (options.skipDetect) {
        // Minimal detection - just get the project name
        const detector = new ProjectDetector(cwd);
        project = {
          name: options.name || (await detector.detect()).name,
          root: cwd,
          frameworks: [],
          primaryFramework: null,
          components: [],
          tokens: [],
          storybook: null,
          designSystem: null,
          monorepo: null,
        };
      } else {
        // Run auto-detection
        const spinner = ora('Scanning project...').start();

        try {
          const detector = new ProjectDetector(cwd);
          project = await detector.detect();

          if (options.name) {
            project.name = options.name;
          }

          spinner.stop();
          printDetectionResults(project);
        } catch (err) {
          spinner.fail('Detection failed');
          const message = err instanceof Error ? err.message : String(err);
          error(message);
          process.exit(1);
        }
      }

      // Generate and write config
      const content = generateConfig(project);

      try {
        writeFileSync(configPath, content, 'utf-8');
        success(`Created buoy.config.mjs`);
        console.log('');
        info('Next steps:');
        info('  1. Run ' + chalk.cyan('buoy scan') + ' to scan your codebase');
        info('  2. Run ' + chalk.cyan('buoy drift check') + ' to detect drift');

        if (!project.storybook) {
          console.log('');
          info(chalk.dim('Optional: Connect Figma by adding your API key to the config'));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error(`Failed to create configuration: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}
