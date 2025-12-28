import { Scanner, ScanResult, ScannerConfig, ScanError, ScanStats } from '../base/scanner.js';
import type { Component, PropDefinition, VariantDefinition, FigmaSource } from '@buoy/core';
import { createComponentId } from '@buoy/core';
import { FigmaClient, FigmaNode } from './client.js';

export interface FigmaScannerConfig extends ScannerConfig {
  accessToken: string;
  fileKeys: string[];
  componentPageName?: string;
}

export class FigmaComponentScanner extends Scanner<Component, FigmaScannerConfig> {
  private client: FigmaClient;

  constructor(config: FigmaScannerConfig) {
    super(config);
    this.client = new FigmaClient(config.accessToken);
  }

  async scan(): Promise<ScanResult<Component>> {
    const startTime = Date.now();
    const components: Component[] = [];
    const errors: ScanError[] = [];
    let filesScanned = 0;

    for (const fileKey of this.config.fileKeys) {
      try {
        const file = await this.client.getFile(fileKey);
        const fileComponents = this.extractComponents(file.document, fileKey);
        components.push(...fileComponents);
        filesScanned++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          file: fileKey,
          message,
          code: 'FIGMA_API_ERROR',
        });
      }
    }

    const stats: ScanStats = {
      filesScanned,
      itemsFound: components.length,
      duration: Date.now() - startTime,
    };

    return { items: components, errors, stats };
  }

  getSourceType(): string {
    return 'figma';
  }

  private extractComponents(document: { children: FigmaNode[] }, fileKey: string): Component[] {
    const components: Component[] = [];
    const pageName = this.config.componentPageName?.toLowerCase() || 'components';

    // Find the components page
    const componentPage = document.children.find(
      page => page.name.toLowerCase() === pageName
    );

    if (!componentPage || !componentPage.children) {
      // Search all pages if no specific component page found
      for (const page of document.children) {
        if (page.children) {
          this.findComponentsRecursive(page.children, fileKey, components);
        }
      }
    } else {
      this.findComponentsRecursive(componentPage.children, fileKey, components);
    }

    return components;
  }

  private findComponentsRecursive(
    nodes: FigmaNode[],
    fileKey: string,
    components: Component[]
  ): void {
    for (const node of nodes) {
      // COMPONENT_SET is a group of variants
      if (node.type === 'COMPONENT_SET') {
        const component = this.nodeToComponent(node, fileKey, true);
        components.push(component);
      }
      // COMPONENT is a single component
      else if (node.type === 'COMPONENT') {
        const component = this.nodeToComponent(node, fileKey, false);
        components.push(component);
      }

      // Recurse into children
      if (node.children) {
        this.findComponentsRecursive(node.children, fileKey, components);
      }
    }
  }

  private nodeToComponent(node: FigmaNode, fileKey: string, isComponentSet: boolean): Component {
    const source: FigmaSource = {
      type: 'figma',
      fileKey,
      nodeId: node.id,
      url: this.client.getFigmaUrl(fileKey, node.id),
    };

    const props = this.extractProps(node);
    const variants = this.extractVariants(node);

    return {
      id: createComponentId(source, node.name),
      name: this.cleanComponentName(node.name),
      source,
      props,
      variants,
      tokens: [],
      dependencies: [],
      metadata: {
        tags: isComponentSet ? ['component-set'] : [],
      },
      scannedAt: new Date(),
    };
  }

  private cleanComponentName(name: string): string {
    // Remove any variant suffixes like "Button, State=Hover, Size=Large"
    const baseName = name.split(',')[0] ?? name;
    // Remove any slash prefixes like "Components / Button"
    const parts = baseName.trim().split('/');
    return (parts[parts.length - 1] ?? baseName).trim();
  }

  private extractProps(node: FigmaNode): PropDefinition[] {
    const props: PropDefinition[] = [];

    if (node.componentPropertyDefinitions) {
      for (const [key, def] of Object.entries(node.componentPropertyDefinitions)) {
        props.push({
          name: key,
          type: this.mapFigmaType(def.type),
          required: true,
          defaultValue: def.defaultValue,
        });
      }
    }

    return props;
  }

  private extractVariants(node: FigmaNode): VariantDefinition[] {
    const variants: VariantDefinition[] = [];

    if (node.componentPropertyDefinitions) {
      // Find properties that are VARIANT type
      for (const [key, def] of Object.entries(node.componentPropertyDefinitions)) {
        if (def.type === 'VARIANT' && def.variantOptions) {
          for (const option of def.variantOptions) {
            variants.push({
              name: `${key}=${option}`,
              props: { [key]: option },
            });
          }
        }
      }
    }

    // Also extract variants from component set children
    if (node.type === 'COMPONENT_SET' && node.children) {
      for (const child of node.children) {
        if (child.type === 'COMPONENT') {
          // Parse variant props from name like "State=Hover, Size=Large"
          const variantProps = this.parseVariantName(child.name);
          if (Object.keys(variantProps).length > 0) {
            variants.push({
              name: child.name,
              props: variantProps,
            });
          }
        }
      }
    }

    return variants;
  }

  private parseVariantName(name: string): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    const parts = name.split(',');

    for (const part of parts) {
      const [key, value] = part.split('=').map(s => s.trim());
      if (key && value) {
        props[key] = value;
      }
    }

    return props;
  }

  private mapFigmaType(figmaType: string): string {
    const typeMap: Record<string, string> = {
      TEXT: 'string',
      BOOLEAN: 'boolean',
      VARIANT: 'enum',
      INSTANCE_SWAP: 'ReactNode',
    };
    return typeMap[figmaType] || figmaType.toLowerCase();
  }
}
