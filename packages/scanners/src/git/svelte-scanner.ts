import { Scanner, ScanResult, ScannerConfig, ScanError, ScanStats } from '../base/scanner.js';
import type { Component, PropDefinition } from '@buoy/core';
import { createComponentId } from '@buoy/core';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { relative, basename } from 'path';

export interface SvelteScannerConfig extends ScannerConfig {
  designSystemPackage?: string;
}

interface SvelteSource {
  type: 'svelte';
  path: string;
  exportName: string;
  line: number;
}

export class SvelteComponentScanner extends Scanner<Component, SvelteScannerConfig> {
  async scan(): Promise<ScanResult<Component>> {
    const startTime = Date.now();
    const files = await this.findComponentFiles();
    const components: Component[] = [];
    const errors: ScanError[] = [];

    for (const file of files) {
      try {
        const parsed = await this.parseFile(file);
        if (parsed) components.push(parsed);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          file,
          message,
          code: 'PARSE_ERROR',
        });
      }
    }

    const stats: ScanStats = {
      filesScanned: files.length,
      itemsFound: components.length,
      duration: Date.now() - startTime,
    };

    return { items: components, errors, stats };
  }

  getSourceType(): string {
    return 'svelte';
  }

  private async findComponentFiles(): Promise<string[]> {
    const patterns = this.config.include || ['**/*.svelte'];
    const ignore = this.config.exclude || [
      '**/node_modules/**',
      '**/*.test.*',
      '**/*.spec.*',
      '**/*.stories.*',
      '**/dist/**',
      '**/build/**',
      '**/.svelte-kit/**',
    ];

    const allFiles: string[] = [];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.config.projectRoot,
        ignore,
        absolute: true,
      });
      allFiles.push(...matches);
    }

    return [...new Set(allFiles)];
  }

  private async parseFile(filePath: string): Promise<Component | null> {
    const content = readFileSync(filePath, 'utf-8');
    const relativePath = relative(this.config.projectRoot, filePath);

    // Extract component name from filename (e.g., MyButton.svelte -> MyButton)
    const name = basename(filePath, '.svelte');

    // Only process PascalCase component names
    if (!/^[A-Z]/.test(name)) return null;

    // Extract script content
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    const scriptContent = scriptMatch?.[1] || '';

    const props = this.extractProps(scriptContent);
    const dependencies = this.extractDependencies(content);

    const source: SvelteSource = {
      type: 'svelte',
      path: relativePath,
      exportName: name,
      line: 1,
    };

    return {
      id: createComponentId(source as any, name),
      name,
      source: source as any,
      props,
      variants: [],
      tokens: [],
      dependencies,
      metadata: {
        deprecated: this.hasDeprecatedComment(content),
        tags: [],
      },
      scannedAt: new Date(),
    };
  }

  private extractProps(scriptContent: string): PropDefinition[] {
    const props: PropDefinition[] = [];

    // Svelte 4 and earlier: export let propName = defaultValue;
    // Match: export let propName; or export let propName = value; or export let propName: Type;
    const exportLetMatches = scriptContent.matchAll(
      /export\s+let\s+(\w+)(?:\s*:\s*([^=;]+))?(?:\s*=\s*([^;]+))?;/g
    );

    for (const match of exportLetMatches) {
      const propName = match[1];
      if (!propName) continue;

      const propType = match[2]?.trim() || 'unknown';
      const defaultValue = match[3]?.trim();

      props.push({
        name: propName,
        type: propType,
        required: !defaultValue,
        defaultValue,
      });
    }

    // Svelte 5 runes: let { propName = default } = $props();
    const propsRuneMatch = scriptContent.match(/let\s*\{([^}]+)\}\s*=\s*\$props\(\)/);
    if (propsRuneMatch && propsRuneMatch[1]) {
      const propsStr = propsRuneMatch[1];
      // Match: propName or propName = default or propName: Type
      const propMatches = propsStr.matchAll(/(\w+)(?:\s*:\s*([^,=]+))?(?:\s*=\s*([^,}]+))?/g);

      for (const m of propMatches) {
        const propName = m[1]?.trim();
        if (!propName) continue;

        props.push({
          name: propName,
          type: m[2]?.trim() || 'unknown',
          required: !m[3],
          defaultValue: m[3]?.trim(),
        });
      }
    }

    return props;
  }

  private extractDependencies(content: string): string[] {
    const deps: Set<string> = new Set();

    // Find component imports
    const importMatches = content.matchAll(/import\s+(\w+)\s+from\s+['"]\.[^'"]+\.svelte['"]/g);
    for (const m of importMatches) {
      if (m[1] && /^[A-Z]/.test(m[1])) {
        deps.add(m[1]);
      }
    }

    // Find component usage in template: <ComponentName
    const componentUsage = content.matchAll(/<([A-Z][a-zA-Z0-9]+)/g);
    for (const m of componentUsage) {
      if (m[1]) deps.add(m[1]);
    }

    return Array.from(deps);
  }

  private hasDeprecatedComment(content: string): boolean {
    return content.includes('@deprecated') || content.includes('* @deprecated');
  }
}
