import type { RawSignal, FileType } from '../types.js';
import { createSignalId } from '../types.js';
import { classifyFileContext, isTailwindDesignValue, lineIntent, type NotedValue } from '@buoy-design/core';

const ARBITRARY_VALUE_PATTERN = /(?<![\w-])([\w-]+)-\[([^\]]+)\]/g;

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
  /** Called for each value the code marks as deliberate (a comment or a 2-3px nudge). */
  onNoted?: (noted: NotedValue) => void,
): RawSignal[] {
  const signals: RawSignal[] = [];
  // Icons, email templates, OG images and tests hold literals on purpose.
  if (classifyFileContext(path, content)) return signals;
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
      // Only literal design values; layout maths, mechanics and keywords are fine.
      if (!isTailwindDesignValue(fullMatch)) continue;
      const intent = lineIntent(lines, i, { fullClass: fullMatch });
      if (intent) {
        onNoted?.({ file: path, line: i + 1, value: fullMatch, kind: intent.kind, reason: intent.reason });
        continue;
      }

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
