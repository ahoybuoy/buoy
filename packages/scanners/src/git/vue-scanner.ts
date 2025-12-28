import { Scanner, ScanResult, ScannerConfig, ScanError, ScanStats } from '../base/scanner.js';
import type { Component, PropDefinition } from '@buoy/core';
import { createComponentId } from '@buoy/core';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { relative, basename } from 'path';

export interface VueScannerConfig extends ScannerConfig {
  designSystemPackage?: string;
}

interface VueSource {
  type: 'vue';
  path: string;
  exportName: string;
  line: number;
}

export class VueComponentScanner extends Scanner<Component, VueScannerConfig> {
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
    return 'vue';
  }

  private async findComponentFiles(): Promise<string[]> {
    const patterns = this.config.include || ['**/*.vue'];
    const ignore = this.config.exclude || [
      '**/node_modules/**',
      '**/*.test.*',
      '**/*.spec.*',
      '**/*.stories.*',
      '**/dist/**',
      '**/build/**',
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

    // Extract component name from filename (e.g., MyButton.vue -> MyButton)
    const name = basename(filePath, '.vue');

    // Only process PascalCase component names
    if (!/^[A-Z]/.test(name)) return null;

    // Extract script content
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    const scriptSetupMatch = content.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/);

    const scriptContent = scriptSetupMatch?.[1] || scriptMatch?.[1] || '';

    const props = this.extractProps(scriptContent, !!scriptSetupMatch);
    const dependencies = this.extractDependencies(content);

    const source: VueSource = {
      type: 'vue',
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

  private extractProps(scriptContent: string, isSetup: boolean): PropDefinition[] {
    const props: PropDefinition[] = [];

    if (isSetup) {
      // Vue 3 <script setup> with defineProps
      // defineProps<{ title: string, count?: number }>()
      const typePropsMatch = scriptContent.match(/defineProps<\{([^}]+)\}>/);
      if (typePropsMatch && typePropsMatch[1]) {
        const propsStr = typePropsMatch[1];
        const propLines = propsStr.split(/[,\n]/).filter(l => l.trim());

        for (const line of propLines) {
          const match = line.trim().match(/^(\w+)(\?)?:\s*(.+)$/);
          if (match && match[1] && match[3]) {
            props.push({
              name: match[1],
              type: match[3].trim(),
              required: !match[2],
            });
          }
        }
      }

      // defineProps({ title: String, count: { type: Number, required: false } })
      const objPropsMatch = scriptContent.match(/defineProps\(\{([^)]+)\}\)/s);
      if (objPropsMatch && objPropsMatch[1] && props.length === 0) {
        this.parseObjectProps(objPropsMatch[1], props);
      }

      // defineProps(['title', 'count'])
      const arrayPropsMatch = scriptContent.match(/defineProps\(\[([^\]]+)\]\)/);
      if (arrayPropsMatch && arrayPropsMatch[1] && props.length === 0) {
        const propNames = arrayPropsMatch[1].match(/['"](\w+)['"]/g);
        if (propNames) {
          for (const p of propNames) {
            props.push({
              name: p.replace(/['"]/g, ''),
              type: 'unknown',
              required: false,
            });
          }
        }
      }
    } else {
      // Options API: props: { ... } or props: [...]
      const propsObjMatch = scriptContent.match(/props:\s*\{([^}]+)\}/s);
      if (propsObjMatch && propsObjMatch[1]) {
        this.parseObjectProps(propsObjMatch[1], props);
      }

      const propsArrayMatch = scriptContent.match(/props:\s*\[([^\]]+)\]/);
      if (propsArrayMatch && propsArrayMatch[1] && props.length === 0) {
        const propNames = propsArrayMatch[1].match(/['"](\w+)['"]/g);
        if (propNames) {
          for (const p of propNames) {
            props.push({
              name: p.replace(/['"]/g, ''),
              type: 'unknown',
              required: false,
            });
          }
        }
      }
    }

    return props;
  }

  private parseObjectProps(propsStr: string, props: PropDefinition[]): void {
    // Match: propName: Type or propName: { type: Type, required: true }
    const simpleMatch = propsStr.matchAll(/(\w+):\s*(String|Number|Boolean|Array|Object|Function)/g);
    for (const m of simpleMatch) {
      if (m[1] && m[2]) {
        props.push({
          name: m[1],
          type: m[2].toLowerCase(),
          required: false,
        });
      }
    }

    // Match complex props: propName: { type: Type, required: true/false }
    const complexMatch = propsStr.matchAll(/(\w+):\s*\{[^}]*type:\s*(\w+)[^}]*\}/g);
    for (const m of complexMatch) {
      if (m[1] && m[2]) {
        const isRequired = propsStr.includes(`${m[1]}:`) &&
          propsStr.substring(propsStr.indexOf(`${m[1]}:`)).match(/required:\s*true/);

        // Avoid duplicates
        if (!props.some(p => p.name === m[1])) {
          props.push({
            name: m[1],
            type: m[2].toLowerCase(),
            required: !!isRequired,
          });
        }
      }
    }
  }

  private extractDependencies(content: string): string[] {
    const deps: Set<string> = new Set();

    // Find component usage in template: <ComponentName or <component-name
    const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
    if (templateMatch && templateMatch[1]) {
      const template = templateMatch[1];

      // PascalCase components
      const pascalMatches = template.matchAll(/<([A-Z][a-zA-Z0-9]+)/g);
      for (const m of pascalMatches) {
        if (m[1]) deps.add(m[1]);
      }

      // kebab-case components (convert to PascalCase)
      const kebabMatches = template.matchAll(/<([a-z]+-[a-z0-9-]+)/g);
      for (const m of kebabMatches) {
        if (m[1]) {
          const pascal = m[1].split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
          deps.add(pascal);
        }
      }
    }

    return Array.from(deps);
  }

  private hasDeprecatedComment(content: string): boolean {
    return content.includes('@deprecated') || content.includes('* @deprecated');
  }
}
