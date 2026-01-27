/**
 * CSS-in-JS Style Extractor
 * Extracts styles from styled-components, Emotion, vanilla-extract, Stitches, and Linaria.
 */

import type { StyleMatch } from './html-style.js';

/**
 * Supported CSS-in-JS libraries
 */
export type CssInJsLibrary =
  | 'styled-components'
  | 'emotion'
  | 'vanilla-extract'
  | 'stitches'
  | 'linaria';

/**
 * Import patterns for each CSS-in-JS library
 */
const IMPORT_PATTERNS: Record<CssInJsLibrary, RegExp[]> = {
  'styled-components': [
    /import\s+.*?\bfrom\s+['"]styled-components['"]/,
    /require\s*\(\s*['"]styled-components['"]\s*\)/,
  ],
  'emotion': [
    /import\s+.*?\bfrom\s+['"]@emotion\/(styled|react|css)['"]/,
    /require\s*\(\s*['"]@emotion\//,
  ],
  'vanilla-extract': [
    /import\s+.*?\bfrom\s+['"]@vanilla-extract\/css['"]/,
  ],
  'stitches': [
    /import\s+.*?\bfrom\s+['"]@stitches\/(react|core)['"]/,
  ],
  'linaria': [
    /import\s+.*?\bfrom\s+['"]@linaria\/(react|core)['"]/,
    /import\s+.*?\bfrom\s+['"]linaria['"]/,
  ],
};

/**
 * Detect which CSS-in-JS library is used in the file
 * Returns the first detected library or null if none found
 */
export function detectCssInJsLibrary(content: string): CssInJsLibrary | null {
  for (const [library, patterns] of Object.entries(IMPORT_PATTERNS) as [CssInJsLibrary, RegExp[]][]) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        return library;
      }
    }
  }
  return null;
}

/**
 * Extract CSS-in-JS styles from file content
 * Handles both template literal and object style patterns
 */
export function extractCssInJsStyles(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];

  // Extract template literal styles (styled-components, Emotion, Linaria)
  matches.push(...extractTemplateLiteralStyles(content));

  // Extract object styles (vanilla-extract, Stitches, Emotion object syntax)
  matches.push(...extractObjectStyles(content));

  return matches;
}

/**
 * Extract styles from tagged template literals
 * Handles: styled.div`...`, styled(Component)`...`, css`...`, keyframes`...`
 */
function extractTemplateLiteralStyles(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];

  // Patterns for tagged template literals
  // styled.element`...` or styled.element.attrs(...)`...`
  const styledElementRegex = /styled\.(\w+)(?:\.attrs\([^)]*\))?\s*`([^`]*)`/gs;

  // styled(Component)`...` or styled(Component).attrs(...)`...`
  const styledComponentRegex = /styled\(\s*\w+\s*\)(?:\.attrs\([^)]*\))?\s*`([^`]*)`/gs;

  // css`...` helper (negative lookbehind to avoid matching .css or other identifiers)
  const cssHelperRegex = /(?<![.\w])css\s*`([^`]*)`/gs;

  // keyframes`...`
  const keyframesRegex = /keyframes\s*`([^`]*)`/gs;

  // Process each pattern type
  const processMatches = (regex: RegExp, fileContent: string) => {
    let match;
    regex.lastIndex = 0; // Reset regex state
    while ((match = regex.exec(fileContent)) !== null) {
      // Get the CSS content (last capture group)
      const cssContent = match[match.length - 1];
      if (!cssContent) continue;

      // Clean up interpolations: replace ${...} with placeholder
      const cleanedCss = cleanInterpolations(cssContent);

      // Calculate line number
      const beforeMatch = fileContent.slice(0, match.index);
      const lineNum = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      matches.push({
        css: cleanedCss,
        line: lineNum,
        column,
        context: 'css-in-js',
      });
    }
  };

  processMatches(styledElementRegex, content);
  processMatches(styledComponentRegex, content);
  processMatches(cssHelperRegex, content);
  processMatches(keyframesRegex, content);

  return matches;
}

/**
 * Clean interpolations from template literals
 * Replaces ${...} with (dynamic) placeholder
 */
function cleanInterpolations(css: string): string {
  // Replace ${...} expressions with placeholder
  // Handle nested braces in expressions
  let result = '';
  let i = 0;

  while (i < css.length) {
    if (css[i] === '$' && css[i + 1] === '{') {
      // Find matching closing brace
      let depth = 1;
      let j = i + 2;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      result += '(dynamic)';
      i = j;
    } else {
      result += css[i];
      i++;
    }
  }

  return result;
}

/**
 * Extract styles from object syntax
 * Handles: style({...}), styleVariants({...}), styled('div', {...}), css({...})
 */
function extractObjectStyles(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];

  // Patterns for object-style CSS-in-JS
  const patterns = [
    // vanilla-extract: style({...})
    /(?<![.\w])style\s*\(\s*\{/g,
    // vanilla-extract: styleVariants({...})
    /styleVariants\s*\(\s*\{/g,
    // Stitches: styled('element', {...}) or styled("element", {...})
    /styled\s*\(\s*['"`]\w+['"`]\s*,\s*\{/g,
    // Emotion object: css({...})
    /(?<![.\w])css\s*\(\s*\{/g,
  ];

  for (const pattern of patterns) {
    let match;
    pattern.lastIndex = 0; // Reset regex state
    while ((match = pattern.exec(content)) !== null) {
      // Find the start of the object (the { after the pattern)
      const objectStart = match.index + match[0].length - 1;

      // Extract balanced braces content
      const objectContent = extractBalancedBraces(content.slice(objectStart));
      if (!objectContent) continue;

      // Convert object to CSS-like text
      const css = objectToCss(objectContent);
      if (!css) continue;

      // Calculate line number
      const beforeMatch = content.slice(0, match.index);
      const lineNum = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      matches.push({
        css,
        line: lineNum,
        column,
        context: 'css-in-js',
      });
    }
  }

  return matches;
}

/**
 * Extract content within balanced braces
 */
function extractBalancedBraces(content: string): string | null {
  if (content[0] !== '{') return null;

  let depth = 0;
  let i = 0;
  let inString: string | null = null;
  let inTemplateLiteral = false;

  while (i < content.length) {
    const char = content[i]!;
    const prevChar = i > 0 ? content[i - 1] : '';

    // Handle escapes
    if (prevChar === '\\' && (inString || inTemplateLiteral)) {
      i++;
      continue;
    }

    // Handle template literals
    if (char === '`' && !inString) {
      inTemplateLiteral = !inTemplateLiteral;
      i++;
      continue;
    }

    if (inTemplateLiteral) {
      i++;
      continue;
    }

    // Handle strings
    if ((char === '"' || char === "'") && !inTemplateLiteral) {
      if (inString === char) {
        inString = null;
      } else if (!inString) {
        inString = char;
      }
      i++;
      continue;
    }

    if (inString) {
      i++;
      continue;
    }

    // Count braces
    if (char === '{') depth++;
    else if (char === '}') depth--;

    if (depth === 0) {
      return content.slice(1, i); // Return content without outer braces
    }

    i++;
  }

  return null;
}

/**
 * Convert JavaScript object notation to CSS-like text
 * Simplified version - extracts property: value pairs
 */
function objectToCss(objectContent: string): string {
  const cssProps: string[] = [];

  // Simple regex to find property: value pairs
  // Handles: padding: '24px', color: '#fff', margin: 8
  const propRegex = /(\w+)\s*:\s*(['"`]?)([^,}\n]+)\2/g;

  let match;
  while ((match = propRegex.exec(objectContent)) !== null) {
    let prop = match[1]!;
    let value = match[3]!.trim();

    // Skip spread operators and complex expressions
    if (prop === 'rest' || value.startsWith('...') || (value.includes('(') && !isCssFunction(value))) {
      continue;
    }

    // Convert camelCase to kebab-case
    prop = camelToKebab(prop);

    // Remove quotes from value
    value = value.replace(/^['"`]|['"`]$/g, '');

    // Add px to numeric values for spacing properties
    if (/^-?\d+(\.\d+)?$/.test(value) && shouldAddPxUnit(prop)) {
      value = `${value}px`;
    }

    cssProps.push(`${prop}: ${value}`);
  }

  return cssProps.join('; ');
}

/**
 * Check if a value is a CSS function
 */
function isCssFunction(value: string): boolean {
  const cssFunctions = /^(calc|var|rgb|rgba|hsl|hsla|url|linear-gradient|radial-gradient|min|max|clamp)\s*\(/i;
  return cssFunctions.test(value.trim());
}

/**
 * Convert camelCase to kebab-case
 */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

/**
 * Check if a property should have px units added
 */
function shouldAddPxUnit(prop: string): boolean {
  const unitlessProps = [
    'opacity', 'z-index', 'flex', 'flex-grow', 'flex-shrink',
    'order', 'font-weight', 'line-height', 'orphans', 'widows',
    'column-count', 'tab-size', 'scale', 'aspect-ratio',
  ];
  return !unitlessProps.includes(prop);
}
