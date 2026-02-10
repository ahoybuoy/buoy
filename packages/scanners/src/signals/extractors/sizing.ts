import type { RawSignal, FileType } from '../types.js';
import { createSignalId } from '../types.js';

const CSS_SIZING_PATTERN = /\b(width|height|min-width|min-height|max-width|max-height)\s*:\s*(\d+\.?\d*)(px|rem|em|vw|vh|vmin|vmax|ch)\b/g;

const JSX_SIZING_PATTERN = /\b(width|height|minWidth|minHeight|maxWidth|maxHeight)\s*:\s*['"](\d+\.?\d*)(px|rem|em|vw|vh|vmin|vmax|ch)['"]/g;

function getFileType(path: string): FileType {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.jsx')) return 'jsx';
  if (path.endsWith('.scss')) return 'scss';
  if (path.endsWith('.less')) return 'less';
  if (path.endsWith('.css')) return 'css';
  return 'ts';
}

/**
 * File-level extractor: scans raw file content for hardcoded sizing dimensions
 */
export function extractSizingSignals(
  content: string,
  path: string,
): RawSignal[] {
  const signals: RawSignal[] = [];
  const lines = content.split('\n');
  const fileType = getFileType(path);
  const isJSX = fileType === 'tsx' || fileType === 'jsx';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('var(--') || line.includes('theme.') || line.includes('tokens.') || line.includes('$')) continue;

    const patterns = isJSX ? [CSS_SIZING_PATTERN, JSX_SIZING_PATTERN] : [CSS_SIZING_PATTERN];

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const [, property, numStr, unit] = match;
        const value = `${numStr}${unit}`;

        signals.push({
          id: createSignalId('sizing-value', path, i + 1, `${property}:${value}`),
          type: 'sizing-value',
          value,
          location: { path, line: i + 1 },
          context: {
            fileType,
            framework: isJSX ? 'react' : 'css',
            scope: 'inline',
            isTokenized: false,
          },
          metadata: {
            property: property!,
            numericValue: parseFloat(numStr!),
            unit: unit!,
          },
        });
      }
    }
  }

  return signals;
}
