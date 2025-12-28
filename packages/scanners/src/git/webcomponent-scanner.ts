import { Scanner, ScanResult, ScannerConfig, ScanError, ScanStats } from '../base/scanner.js';
import type { Component, PropDefinition } from '@buoy/core';
import { createComponentId } from '@buoy/core';
import * as ts from 'typescript';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { relative } from 'path';

export interface WebComponentScannerConfig extends ScannerConfig {
  framework?: 'lit' | 'stencil' | 'auto';
}

interface WebComponentSource {
  type: 'lit' | 'stencil';
  path: string;
  exportName: string;
  tagName: string;
  line: number;
}

export class WebComponentScanner extends Scanner<Component, WebComponentScannerConfig> {
  async scan(): Promise<ScanResult<Component>> {
    const startTime = Date.now();
    const files = await this.findComponentFiles();
    const components: Component[] = [];
    const errors: ScanError[] = [];

    for (const file of files) {
      try {
        const parsed = await this.parseFile(file);
        components.push(...parsed);
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
    return this.config.framework || 'webcomponent';
  }

  private async findComponentFiles(): Promise<string[]> {
    const patterns = this.config.include || ['**/*.ts', '**/*.tsx'];
    const ignore = this.config.exclude || [
      '**/node_modules/**',
      '**/*.spec.ts',
      '**/*.test.ts',
      '**/*.d.ts',
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

  private async parseFile(filePath: string): Promise<Component[]> {
    const content = readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const components: Component[] = [];
    const relativePath = relative(this.config.projectRoot, filePath);

    // Detect framework from imports
    const isLit = content.includes('lit') || content.includes('LitElement');
    const isStencil = content.includes('@stencil/core');

    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        if (isLit) {
          const comp = this.extractLitComponent(node, sourceFile, relativePath);
          if (comp) components.push(comp);
        } else if (isStencil) {
          const comp = this.extractStencilComponent(node, sourceFile, relativePath);
          if (comp) components.push(comp);
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return components;
  }

  private extractLitComponent(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: string
  ): Component | null {
    if (!node.name) return null;

    // Check if extends LitElement
    const extendsLit = node.heritageClauses?.some(clause => {
      return clause.types.some(type => {
        const text = type.expression.getText(sourceFile);
        return text === 'LitElement' || text.endsWith('Element');
      });
    });

    if (!extendsLit) return null;

    const name = node.name.getText(sourceFile);
    const tagName = this.extractLitTagName(node, sourceFile) || this.toKebabCase(name);
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    const source: WebComponentSource = {
      type: 'lit',
      path: relativePath,
      exportName: name,
      tagName,
      line,
    };

    const props = this.extractLitProperties(node, sourceFile);

    return {
      id: createComponentId(source as any, name),
      name,
      source: source as any,
      props,
      variants: [],
      tokens: [],
      dependencies: [],
      metadata: {
        deprecated: this.hasDeprecatedTag(node),
        tags: [],
      },
      scannedAt: new Date(),
    };
  }

  private extractLitTagName(node: ts.ClassDeclaration, _sourceFile: ts.SourceFile): string | null {
    const decorators = ts.getDecorators(node);
    if (!decorators) return null;

    for (const decorator of decorators) {
      if (ts.isCallExpression(decorator.expression)) {
        const expr = decorator.expression.expression;
        if (ts.isIdentifier(expr) && expr.text === 'customElement') {
          const arg = decorator.expression.arguments[0];
          if (arg && ts.isStringLiteral(arg)) {
            return arg.text;
          }
        }
      }
    }

    return null;
  }

  private extractLitProperties(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): PropDefinition[] {
    const props: PropDefinition[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      const hasProperty = decorators.some(d => {
        if (ts.isCallExpression(d.expression)) {
          const expr = d.expression.expression;
          return ts.isIdentifier(expr) && (expr.text === 'property' || expr.text === 'state');
        }
        if (ts.isIdentifier(d.expression)) {
          return d.expression.text === 'property' || d.expression.text === 'state';
        }
        return false;
      });

      if (hasProperty) {
        const propName = member.name.getText(sourceFile);
        const propType = member.type ? member.type.getText(sourceFile) : 'unknown';

        props.push({
          name: propName,
          type: propType,
          required: !member.initializer && !member.questionToken,
          defaultValue: member.initializer?.getText(sourceFile),
        });
      }
    }

    return props;
  }

  private extractStencilComponent(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: string
  ): Component | null {
    if (!node.name) return null;

    // Check for @Component decorator
    const componentDecorator = this.findStencilComponentDecorator(node);
    if (!componentDecorator) return null;

    const name = node.name.getText(sourceFile);
    const tagName = this.extractStencilTagName(componentDecorator, sourceFile) || this.toKebabCase(name);
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    const source: WebComponentSource = {
      type: 'stencil',
      path: relativePath,
      exportName: name,
      tagName,
      line,
    };

    const props = this.extractStencilProps(node, sourceFile);
    const events = this.extractStencilEvents(node, sourceFile);

    return {
      id: createComponentId(source as any, name),
      name,
      source: source as any,
      props: [...props, ...events],
      variants: [],
      tokens: [],
      dependencies: [],
      metadata: {
        deprecated: this.hasDeprecatedTag(node),
        tags: [],
      },
      scannedAt: new Date(),
    };
  }

  private findStencilComponentDecorator(node: ts.ClassDeclaration): ts.Decorator | undefined {
    const decorators = ts.getDecorators(node);
    if (!decorators) return undefined;

    return decorators.find(d => {
      if (ts.isCallExpression(d.expression)) {
        const expr = d.expression.expression;
        return ts.isIdentifier(expr) && expr.text === 'Component';
      }
      return false;
    });
  }

  private extractStencilTagName(decorator: ts.Decorator, _sourceFile: ts.SourceFile): string | null {
    if (!ts.isCallExpression(decorator.expression)) return null;

    const args = decorator.expression.arguments;
    if (args.length === 0) return null;

    const config = args[0];
    if (!config || !ts.isObjectLiteralExpression(config)) return null;

    for (const prop of config.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        if (prop.name.text === 'tag' && ts.isStringLiteral(prop.initializer)) {
          return prop.initializer.text;
        }
      }
    }

    return null;
  }

  private extractStencilProps(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): PropDefinition[] {
    const props: PropDefinition[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      const hasProp = decorators.some(d => {
        if (ts.isCallExpression(d.expression)) {
          const expr = d.expression.expression;
          return ts.isIdentifier(expr) && expr.text === 'Prop';
        }
        if (ts.isIdentifier(d.expression)) {
          return d.expression.text === 'Prop';
        }
        return false;
      });

      if (hasProp) {
        const propName = member.name.getText(sourceFile);
        const propType = member.type ? member.type.getText(sourceFile) : 'unknown';

        props.push({
          name: propName,
          type: propType,
          required: !member.initializer && !member.questionToken,
          defaultValue: member.initializer?.getText(sourceFile),
        });
      }
    }

    return props;
  }

  private extractStencilEvents(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): PropDefinition[] {
    const events: PropDefinition[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      const hasEvent = decorators.some(d => {
        if (ts.isCallExpression(d.expression)) {
          const expr = d.expression.expression;
          return ts.isIdentifier(expr) && expr.text === 'Event';
        }
        if (ts.isIdentifier(d.expression)) {
          return d.expression.text === 'Event';
        }
        return false;
      });

      if (hasEvent) {
        const propName = member.name.getText(sourceFile);

        events.push({
          name: propName,
          type: 'EventEmitter',
          required: false,
          description: 'Stencil event',
        });
      }
    }

    return events;
  }

  private hasDeprecatedTag(node: ts.ClassDeclaration): boolean {
    const jsDocs = ts.getJSDocTags(node);
    return jsDocs.some(tag => tag.tagName.text === 'deprecated');
  }

  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      .toLowerCase();
  }
}
