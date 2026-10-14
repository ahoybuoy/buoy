import { createDriftId, type Component, type DesignToken, type DriftSignal } from '@buoy-design/core';
import { minimatch } from 'minimatch';

const CODE_COMPONENT_SOURCES = new Set([
  'react',
  'vue',
  'svelte',
  'angular',
  'webcomponent',
  'templates',
]);

const CANONICAL_TOKEN_SOURCES = new Set(['figma']);

export interface ClassifiedComponents {
  code: Component[];
  canonical: Component[];
}

export interface ClassifiedTokens {
  code: DesignToken[];
  canonical: DesignToken[];
}

/**
 * Partition components into "code" (implementation) vs "canonical" (design source of truth).
 *
 * Code sources: react, vue, svelte, angular, webcomponent, templates
 * Canonical sources: figma, storybook (anything from a design tool)
 * Default: unknown source types are treated as code
 */
export function classifyComponents(components: Component[]): ClassifiedComponents {
  const code: Component[] = [];
  const canonical: Component[] = [];
  for (const comp of components) {
    if (CODE_COMPONENT_SOURCES.has(comp.source.type)) {
      code.push(comp);
    } else {
      canonical.push(comp);
    }
  }
  return { code, canonical };
}

/**
 * Partition tokens into "code" vs "canonical".
 *
 * Always canonical: figma source type
 * Canonical by config: any token whose file path matches a glob from canonicalPatterns
 * Everything else: code
 */
export function classifyTokens(
  tokens: DesignToken[],
  canonicalPatterns: string[],
): ClassifiedTokens {
  const code: DesignToken[] = [];
  const canonical: DesignToken[] = [];
  for (const token of tokens) {
    if (CANONICAL_TOKEN_SOURCES.has(token.source.type)) {
      canonical.push(token);
    } else if (isCanonicalTokenFile(getTokenPath(token), canonicalPatterns)) {
      canonical.push(token);
    } else {
      code.push(token);
    }
  }
  return { code, canonical };
}

/**
 * Check whether a file path matches any of the canonical glob patterns.
 * Returns false when there are no patterns.
 */
export function isCanonicalTokenFile(
  filePath: string,
  canonicalPatterns: string[],
): boolean {
  if (canonicalPatterns.length === 0) return false;
  return canonicalPatterns.some((pattern) => minimatch(filePath, pattern));
}

function getTokenPath(token: DesignToken): string {
  const source = token.source as Record<string, unknown>;
  return (source.path as string) || (source.fileKey as string) || '';
}

/**
 * Storybook is documentation, not a design source. Without Figma, a code
 * component with no story is not drift, and one warning per component buries
 * the real findings (thousands on code-first repos). Drop those signals and
 * return how many there were so the caller can summarise them in one line.
 */
export function dropStorylessComponents(
  drifts: DriftSignal[],
  orphanedCode: Component[],
  canonical: Component[],
  figmaConfigured = false,
): { drifts: DriftSignal[]; withoutStory: number } {
  // A configured Figma source counts even when its scan returned nothing.
  if (figmaConfigured || canonical.some((c) => c.source.type === 'figma')) return { drifts, withoutStory: 0 };
  const ids = new Set(orphanedCode.map((c) => createDriftId('orphaned-component', c.id)));
  const kept = drifts.filter((d) => !ids.has(d.id));
  return { drifts: kept, withoutStory: drifts.length - kept.length };
}
