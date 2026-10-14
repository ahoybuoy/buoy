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

/** `MP.neutral400`, `theme.colors['gray-500']`, `tokens?.space` */
const REFERENCE = /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[[^\]]+\])*$/;
/** `'var(--color-text)'`, `var(--space-2)`. A literal fallback (`var(--x, #fff)`) still counts as a value. */
const CSS_VAR = /^(['"`]?)var\(--[\w-]+\)\1$/;
const LITERALS = new Set(['true', 'false', 'null', 'undefined']);

/** Split on top-level separators, ignoring ones inside quotes, parens or brackets. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth--;
    } else if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * True when every property in the style only references the design system:
 * `style={{ color: MP.navy500, borderColor: AUDIT.border }}` or
 * `style="color: var(--text)"`. That is token use, not drift.
 */
export function onlyReferencesTokens(styleContent: string, isJSX: boolean): boolean {
  const declarations = splitTopLevel(styleContent, isJSX ? ',' : ';');
  if (declarations.length === 0) return false;
  return declarations.every((declaration) => {
    const colon = declaration.indexOf(':');
    if (colon === -1) return false;
    const value = declaration.slice(colon + 1).trim();
    if (CSS_VAR.test(value)) return true;
    return isJSX && REFERENCE.test(value) && !LITERALS.has(value);
  });
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
        if (onlyReferencesTokens(styleContent, pattern === JSX_STYLE_PATTERN)) continue;
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
