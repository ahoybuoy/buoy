export interface FigmaFile {
  name: string;
  document: FigmaDocument;
  components: Record<string, FigmaComponentMeta>;
  styles: Record<string, FigmaStyleMeta>;
}

export interface FigmaDocument {
  id: string;
  name: string;
  type: string;
  children: FigmaNode[];
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  componentId?: string;
  componentPropertyDefinitions?: Record<string, FigmaPropertyDefinition>;
}

export interface FigmaPropertyDefinition {
  type: string;
  defaultValue: unknown;
  variantOptions?: string[];
}

export interface FigmaComponentMeta {
  key: string;
  name: string;
  description: string;
  documentationLinks: string[];
}

export interface FigmaStyleMeta {
  key: string;
  name: string;
  styleType: string;
  description: string;
}

export interface FigmaVariablesResponse {
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
}

export interface FigmaVariable {
  id: string;
  name: string;
  key: string;
  resolvedType: string;
  valuesByMode: Record<string, FigmaVariableValue>;
}

export interface FigmaVariableCollection {
  id: string;
  name: string;
  modes: { modeId: string; name: string }[];
  defaultModeId: string;
}

export type FigmaVariableValue =
  | { type: 'COLOR'; value: { r: number; g: number; b: number; a: number } }
  | { type: 'FLOAT'; value: number }
  | { type: 'STRING'; value: string }
  | { type: 'BOOLEAN'; value: boolean };

export class FigmaClient {
  private accessToken: string;
  private baseUrl = 'https://api.figma.com/v1';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        'X-Figma-Token': this.accessToken,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Figma API error: ${response.status} ${response.statusText} - ${text}`);
    }

    return response.json() as Promise<T>;
  }

  async getFile(fileKey: string): Promise<FigmaFile> {
    return this.fetch<FigmaFile>(`/files/${fileKey}`);
  }

  async getFileComponents(fileKey: string): Promise<{ meta: { components: FigmaComponentMeta[] } }> {
    return this.fetch(`/files/${fileKey}/components`);
  }

  async getFileStyles(fileKey: string): Promise<{ meta: { styles: FigmaStyleMeta[] } }> {
    return this.fetch(`/files/${fileKey}/styles`);
  }

  async getLocalVariables(fileKey: string): Promise<FigmaVariablesResponse> {
    return this.fetch(`/files/${fileKey}/variables/local`);
  }

  getFigmaUrl(fileKey: string, nodeId?: string): string {
    const base = `https://www.figma.com/file/${fileKey}`;
    if (nodeId) {
      return `${base}?node-id=${encodeURIComponent(nodeId)}`;
    }
    return base;
  }
}
