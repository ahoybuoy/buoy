import { describe, it, expect } from 'vitest';
import type { Component, DesignToken, ColorValue } from '@buoy-design/core';
import {
  classifyComponents,
  classifyTokens,
  isCanonicalTokenFile,
} from '../source-classifier.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockComponent(
  name: string,
  sourceType: string,
  extra: Record<string, unknown> = {},
): Component {
  const baseSource: Record<string, unknown> = { type: sourceType, ...extra };

  // Provide required fields for each discriminated union variant
  switch (sourceType) {
    case 'react':
    case 'vue':
    case 'svelte':
      baseSource.path = baseSource.path ?? `src/components/${name}.tsx`;
      baseSource.exportName = baseSource.exportName ?? name;
      break;
    case 'figma':
      baseSource.fileKey = baseSource.fileKey ?? 'figma-file-key';
      baseSource.nodeId = baseSource.nodeId ?? 'node-1';
      break;
    case 'storybook':
      baseSource.storyId = baseSource.storyId ?? `story-${name}`;
      baseSource.kind = baseSource.kind ?? name;
      break;
  }

  return {
    id: `component:${name}`,
    name,
    source: baseSource,
    props: [],
    variants: [],
    tokens: [],
    dependencies: [],
    metadata: {},
    scannedAt: new Date(),
  } as unknown as Component;
}

function createMockToken(
  name: string,
  sourceType: string,
  extra: Record<string, unknown> = {},
): DesignToken {
  const baseSource: Record<string, unknown> = { type: sourceType, ...extra };

  switch (sourceType) {
    case 'css':
      baseSource.path = baseSource.path ?? 'tokens.css';
      break;
    case 'json':
      baseSource.path = baseSource.path ?? 'tokens.json';
      break;
    case 'scss':
      baseSource.path = baseSource.path ?? 'tokens.scss';
      baseSource.variableName = baseSource.variableName ?? name;
      break;
    case 'figma':
      baseSource.fileKey = baseSource.fileKey ?? 'figma-file-key';
      break;
    case 'typescript':
      baseSource.path = baseSource.path ?? 'tokens.ts';
      baseSource.typeName = baseSource.typeName ?? 'Tokens';
      break;
  }

  const value: ColorValue = { type: 'color', hex: '#000000' };

  return {
    id: `token:${name}`,
    name,
    category: 'color',
    value,
    source: baseSource,
    aliases: [],
    usedBy: [],
    metadata: {},
    scannedAt: new Date(),
  } as unknown as DesignToken;
}

// ---------------------------------------------------------------------------
// classifyComponents
// ---------------------------------------------------------------------------

describe('classifyComponents', () => {
  it('classifies react components as code', () => {
    const components = [createMockComponent('Button', 'react')];
    const result = classifyComponents(components);
    expect(result.code).toHaveLength(1);
    expect(result.canonical).toHaveLength(0);
    expect(result.code[0]!.name).toBe('Button');
  });

  it('classifies vue components as code', () => {
    const components = [createMockComponent('Card', 'vue')];
    const result = classifyComponents(components);
    expect(result.code).toHaveLength(1);
    expect(result.canonical).toHaveLength(0);
  });

  it('classifies svelte components as code', () => {
    const components = [createMockComponent('Alert', 'svelte')];
    const result = classifyComponents(components);
    expect(result.code).toHaveLength(1);
    expect(result.canonical).toHaveLength(0);
  });

  it('classifies figma components as canonical', () => {
    const components = [createMockComponent('Button', 'figma')];
    const result = classifyComponents(components);
    expect(result.code).toHaveLength(0);
    expect(result.canonical).toHaveLength(1);
    expect(result.canonical[0]!.name).toBe('Button');
  });

  it('classifies storybook components as canonical', () => {
    const components = [createMockComponent('Button', 'storybook')];
    const result = classifyComponents(components);
    expect(result.code).toHaveLength(0);
    expect(result.canonical).toHaveLength(1);
  });

  it('partitions a mixed list correctly', () => {
    const components = [
      createMockComponent('ReactBtn', 'react'),
      createMockComponent('FigmaBtn', 'figma'),
      createMockComponent('VueCard', 'vue'),
      createMockComponent('SbModal', 'storybook'),
      createMockComponent('SvelteNav', 'svelte'),
    ];
    const result = classifyComponents(components);
    expect(result.code).toHaveLength(3);
    expect(result.canonical).toHaveLength(2);
    expect(result.code.map((c) => c.name)).toEqual(['ReactBtn', 'VueCard', 'SvelteNav']);
    expect(result.canonical.map((c) => c.name)).toEqual(['FigmaBtn', 'SbModal']);
  });

  it('returns empty arrays when given no components', () => {
    const result = classifyComponents([]);
    expect(result.code).toHaveLength(0);
    expect(result.canonical).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// classifyTokens
// ---------------------------------------------------------------------------

describe('classifyTokens', () => {
  it('classifies figma tokens as canonical regardless of patterns', () => {
    const tokens = [createMockToken('--color-primary', 'figma')];
    const result = classifyTokens(tokens, []);
    expect(result.canonical).toHaveLength(1);
    expect(result.code).toHaveLength(0);
  });

  it('classifies css tokens as code when no canonical patterns match', () => {
    const tokens = [createMockToken('--color-primary', 'css')];
    const result = classifyTokens(tokens, []);
    expect(result.code).toHaveLength(1);
    expect(result.canonical).toHaveLength(0);
  });

  it('classifies json tokens matching a canonical pattern as canonical', () => {
    const tokens = [
      createMockToken('--color-primary', 'json', { path: 'design-system/tokens.json' }),
    ];
    const result = classifyTokens(tokens, ['design-system/**']);
    expect(result.canonical).toHaveLength(1);
    expect(result.code).toHaveLength(0);
  });

  it('classifies css tokens matching a canonical pattern as canonical', () => {
    const tokens = [
      createMockToken('--spacing-4', 'css', { path: 'src/design/tokens.css' }),
    ];
    const result = classifyTokens(tokens, ['src/design/**']);
    expect(result.canonical).toHaveLength(1);
    expect(result.code).toHaveLength(0);
  });

  it('classifies non-matching tokens as code even when patterns exist', () => {
    const tokens = [
      createMockToken('--color-primary', 'css', { path: 'src/components/Button.css' }),
    ];
    const result = classifyTokens(tokens, ['design-system/**']);
    expect(result.code).toHaveLength(1);
    expect(result.canonical).toHaveLength(0);
  });

  it('partitions a mixed token list correctly', () => {
    const tokens = [
      createMockToken('--color-figma', 'figma'),
      createMockToken('--color-css-code', 'css', { path: 'src/app.css' }),
      createMockToken('--color-css-canonical', 'css', { path: 'design/tokens.css' }),
      createMockToken('--spacing-json', 'json', { path: 'design/spacing.json' }),
    ];
    const result = classifyTokens(tokens, ['design/**']);
    expect(result.canonical).toHaveLength(3);
    expect(result.code).toHaveLength(1);
    expect(result.code[0]!.name).toBe('--color-css-code');
  });

  it('treats all tokens as code when canonical patterns are empty', () => {
    const tokens = [
      createMockToken('--color-primary', 'css'),
      createMockToken('--spacing-4', 'json'),
      createMockToken('--font-body', 'scss'),
    ];
    const result = classifyTokens(tokens, []);
    expect(result.code).toHaveLength(3);
    expect(result.canonical).toHaveLength(0);
  });

  it('returns empty arrays when given no tokens', () => {
    const result = classifyTokens([], ['design/**']);
    expect(result.code).toHaveLength(0);
    expect(result.canonical).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// isCanonicalTokenFile
// ---------------------------------------------------------------------------

describe('isCanonicalTokenFile', () => {
  it('returns true when path matches a glob pattern', () => {
    expect(isCanonicalTokenFile('design/tokens.css', ['design/**'])).toBe(true);
  });

  it('returns true when path matches any pattern in the list', () => {
    expect(
      isCanonicalTokenFile('theme/colors.json', ['design/**', 'theme/**']),
    ).toBe(true);
  });

  it('returns false when path does not match any pattern', () => {
    expect(isCanonicalTokenFile('src/app.css', ['design/**'])).toBe(false);
  });

  it('returns false when patterns array is empty', () => {
    expect(isCanonicalTokenFile('design/tokens.css', [])).toBe(false);
  });

  it('handles nested glob patterns', () => {
    expect(
      isCanonicalTokenFile('packages/tokens/src/colors.ts', ['**/tokens/**']),
    ).toBe(true);
  });

  it('handles specific file extension patterns', () => {
    expect(
      isCanonicalTokenFile('design/tokens.json', ['**/*.json']),
    ).toBe(true);
    expect(
      isCanonicalTokenFile('design/tokens.css', ['**/*.json']),
    ).toBe(false);
  });
});
