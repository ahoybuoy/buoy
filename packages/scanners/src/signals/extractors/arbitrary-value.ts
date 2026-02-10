import type { RawSignal, FileType } from '../types.js';
import { createSignalId } from '../types.js';

const ARBITRARY_VALUE_PATTERN = /\b([\w-]+)-\[([^\]]+)\]/g;

function getFileType(path: string): FileType {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.jsx')) return 'jsx';
  if (path.endsWith('.vue')) return 'vue';
  if (path.endsWith('.svelte')) return 'svelte';
  if (path.endsWith('.html')) return 'html';
  return 'ts';
}

function isTokenReference(value: string): boolean {
  return value.includes('var(--') || value.includes('theme(');
}

/**
 * File-level extractor: scans for arbitrary value syntax like bg-[#fff], p-[13px]
 * Framework-agnostic -- works with Tailwind, UnoCSS, or any utility-first framework.
 */
export function extractArbitraryValueSignals(
  content: string,
  path: string,
): RawSignal[] {
  const signals: RawSignal[] = [];
  const lines = content.split('\n');
  const fileType = getFileType(path);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    ARBITRARY_VALUE_PATTERN.lastIndex = 0;

    let match;
    while ((match = ARBITRARY_VALUE_PATTERN.exec(line)) !== null) {
      const fullMatch = match[0];
      const utility = match[1]!;
      const rawValue = match[2]!;

      if (isTokenReference(rawValue)) continue;

      signals.push({
        id: createSignalId('arbitrary-value', path, i + 1, fullMatch),
        type: 'arbitrary-value',
        value: fullMatch,
        location: { path, line: i + 1 },
        context: {
          fileType,
          framework: 'tailwind',
          scope: 'inline',
          isTokenized: false,
        },
        metadata: {
          utility: utility!,
          rawValue: rawValue!,
        },
      });
    }
  }

  return signals;
}
