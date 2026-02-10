import type { RawSignal, FileType } from '../types.js';
import { createSignalId } from '../types.js';

const JSX_STYLE_PATTERN = /style=\{\{([^}]+)\}\}/g;
const HTML_STYLE_PATTERN = /style="([^"]+)"/g;

function getFileType(path: string): FileType {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.jsx')) return 'jsx';
  if (path.endsWith('.vue')) return 'vue';
  if (path.endsWith('.svelte')) return 'svelte';
  if (path.endsWith('.html')) return 'html';
  return 'ts';
}

function countStyleProperties(styleContent: string, isJSX: boolean): number {
  if (isJSX) {
    return styleContent.split(',').filter(s => s.includes(':')).length;
  }
  return styleContent.split(';').filter(s => s.trim().includes(':')).length;
}

/**
 * File-level extractor: scans for inline style= attributes
 */
export function extractInlineStyleSignals(
  content: string,
  path: string,
): RawSignal[] {
  const signals: RawSignal[] = [];
  const lines = content.split('\n');
  const fileType = getFileType(path);
  const isJSX = fileType === 'tsx' || fileType === 'jsx';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const patterns = [JSX_STYLE_PATTERN, HTML_STYLE_PATTERN];

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const styleContent = match[1]!;
        const styleCount = countStyleProperties(styleContent, pattern === JSX_STYLE_PATTERN);

        signals.push({
          id: createSignalId('inline-style', path, i + 1, styleContent.slice(0, 40)),
          type: 'inline-style',
          value: styleContent.trim(),
          location: { path, line: i + 1 },
          context: {
            fileType,
            framework: isJSX ? 'react' : 'vanilla',
            scope: 'inline',
            isTokenized: false,
          },
          metadata: {
            styleCount,
          },
        });
      }
    }
  }

  return signals;
}
