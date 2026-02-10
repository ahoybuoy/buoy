import type { RawSignal } from '../types.js';
import { createSignalId } from '../types.js';

const MEDIA_QUERY_PATTERN = /@media\s*\([^)]*\b(min-width|max-width|min-height|max-height)\s*:\s*(\d+\.?\d*)(px|rem|em)\s*\)/g;

/**
 * File-level extractor: scans raw file content for @media query breakpoints
 */
export function extractBreakpointSignals(
  content: string,
  path: string,
): RawSignal[] {
  const signals: RawSignal[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    MEDIA_QUERY_PATTERN.lastIndex = 0;

    let match;
    while ((match = MEDIA_QUERY_PATTERN.exec(line)) !== null) {
      const [, query, numStr, unit] = match;
      const value = `${numStr}${unit}`;

      if (line.includes('var(--')) continue;

      signals.push({
        id: createSignalId('breakpoint', path, i + 1, value),
        type: 'breakpoint',
        value,
        location: { path, line: i + 1 },
        context: {
          fileType: path.endsWith('.scss') ? 'scss' : path.endsWith('.less') ? 'less' : 'css',
          framework: 'css',
          scope: 'global',
          isTokenized: false,
        },
        metadata: {
          query: query!,
          numericValue: parseFloat(numStr!),
          unit: unit!,
        },
      });
    }
  }

  return signals;
}
