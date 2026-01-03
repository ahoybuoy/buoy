/**
 * Import Collector
 *
 * Extracts ES module import relationships between files.
 * Creates a dependency graph for impact analysis.
 */

import { readFile } from 'fs/promises';
import { glob } from 'glob';
import { join, dirname, resolve, relative } from 'path';
import { existsSync } from 'fs';

// ============================================================================
// Types
// ============================================================================

export type ImportType = 'default' | 'named' | 'namespace' | 'side-effect' | 'dynamic';

export interface FileImport {
  sourceFile: string;
  targetFile: string;
  importType: ImportType;
  importedNames: string[];
  rawSpecifier: string; // Original import path
  isExternal: boolean; // npm package vs local file
  lineNumber: number;
}

export interface ImportCollectorOptions {
  projectRoot: string;
  include?: string[];
  exclude?: string[];
  /** Resolve paths to actual files (slower but more accurate) */
  resolvePaths?: boolean;
  /** Include node_modules imports */
  includeExternal?: boolean;
}

export interface ImportCollectorResult {
  imports: FileImport[];
  externalDependencies: Set<string>;
  stats: {
    filesScanned: number;
    importsFound: number;
    externalPackages: number;
  };
}

// ============================================================================
// Patterns
// ============================================================================

// ES import patterns
const IMPORT_PATTERNS = {
  // import defaultExport from 'module'
  default: /import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s+['"]([^'"]+)['"]/g,

  // import { named1, named2 } from 'module'
  named: /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g,

  // import * as namespace from 'module'
  namespace: /import\s*\*\s*as\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s+['"]([^'"]+)['"]/g,

  // import 'module' (side effect)
  sideEffect: /import\s+['"]([^'"]+)['"]/g,

  // import defaultExport, { named } from 'module'
  mixed: /import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g,

  // const x = await import('module') or import('module')
  dynamic: /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,

  // require('module') - CommonJS
  require: /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
};

// Re-export patterns
const REEXPORT_PATTERNS = {
  // export { named } from 'module'
  named: /export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g,

  // export * from 'module'
  all: /export\s*\*\s*from\s*['"]([^'"]+)['"]/g,

  // export { default } from 'module'
  default: /export\s*\{\s*default\s*(?:as\s+[a-zA-Z_$][a-zA-Z0-9_$]*)?\s*\}\s*from\s*['"]([^'"]+)['"]/g,
};

// ============================================================================
// Collector
// ============================================================================

/**
 * Collect import relationships from the codebase
 */
export async function collectImports(
  options: ImportCollectorOptions
): Promise<ImportCollectorResult> {
  const {
    projectRoot,
    include = ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    exclude = ['**/node_modules/**', '**/dist/**', '**/build/**'],
    resolvePaths = true,
    includeExternal = false,
  } = options;

  const files = await glob(include, {
    cwd: projectRoot,
    ignore: exclude,
    absolute: false,
  });

  const imports: FileImport[] = [];
  const externalDependencies = new Set<string>();

  for (const file of files) {
    const fullPath = join(projectRoot, file);
    let content: string;

    try {
      content = await readFile(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const fileDir = dirname(fullPath);

    // Collect all import types
    collectImportPattern(
      content,
      lines,
      file,
      fileDir,
      projectRoot,
      IMPORT_PATTERNS.default,
      'default',
      imports,
      externalDependencies,
      resolvePaths,
      includeExternal,
      (match) => [match[1] ?? 'default'],
      (match) => match[2] ?? ''
    );

    collectImportPattern(
      content,
      lines,
      file,
      fileDir,
      projectRoot,
      IMPORT_PATTERNS.named,
      'named',
      imports,
      externalDependencies,
      resolvePaths,
      includeExternal,
      (match) => parseNamedImports(match[1] ?? ''),
      (match) => match[2] ?? ''
    );

    collectImportPattern(
      content,
      lines,
      file,
      fileDir,
      projectRoot,
      IMPORT_PATTERNS.namespace,
      'namespace',
      imports,
      externalDependencies,
      resolvePaths,
      includeExternal,
      (match) => [match[1] ?? '*'],
      (match) => match[2] ?? ''
    );

    collectImportPattern(
      content,
      lines,
      file,
      fileDir,
      projectRoot,
      IMPORT_PATTERNS.sideEffect,
      'side-effect',
      imports,
      externalDependencies,
      resolvePaths,
      includeExternal,
      () => [],
      (match) => match[1] ?? ''
    );

    collectImportPattern(
      content,
      lines,
      file,
      fileDir,
      projectRoot,
      IMPORT_PATTERNS.mixed,
      'named',
      imports,
      externalDependencies,
      resolvePaths,
      includeExternal,
      (match) => [match[1] ?? 'default', ...parseNamedImports(match[2] ?? '')],
      (match) => match[3] ?? ''
    );

    collectImportPattern(
      content,
      lines,
      file,
      fileDir,
      projectRoot,
      IMPORT_PATTERNS.dynamic,
      'dynamic',
      imports,
      externalDependencies,
      resolvePaths,
      includeExternal,
      () => ['*'],
      (match) => match[1] ?? ''
    );

    // Collect re-exports
    collectImportPattern(
      content,
      lines,
      file,
      fileDir,
      projectRoot,
      REEXPORT_PATTERNS.named,
      'named',
      imports,
      externalDependencies,
      resolvePaths,
      includeExternal,
      (match) => parseNamedImports(match[1] ?? ''),
      (match) => match[2] ?? ''
    );

    collectImportPattern(
      content,
      lines,
      file,
      fileDir,
      projectRoot,
      REEXPORT_PATTERNS.all,
      'namespace',
      imports,
      externalDependencies,
      resolvePaths,
      includeExternal,
      () => ['*'],
      (match) => match[1] ?? ''
    );
  }

  return {
    imports,
    externalDependencies,
    stats: {
      filesScanned: files.length,
      importsFound: imports.length,
      externalPackages: externalDependencies.size,
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function collectImportPattern(
  content: string,
  _lines: string[],
  sourceFile: string,
  fileDir: string,
  projectRoot: string,
  pattern: RegExp,
  importType: ImportType,
  imports: FileImport[],
  externalDependencies: Set<string>,
  resolvePaths: boolean,
  includeExternal: boolean,
  getNames: (match: RegExpExecArray) => string[],
  getSpecifier: (match: RegExpExecArray) => string
): void {
  // Reset pattern
  pattern.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const rawSpecifier = getSpecifier(match);
    if (!rawSpecifier) continue;

    const isExternal = !rawSpecifier.startsWith('.') && !rawSpecifier.startsWith('/');

    // Track external dependencies
    if (isExternal) {
      const packageName = getPackageName(rawSpecifier);
      externalDependencies.add(packageName);

      if (!includeExternal) continue;
    }

    // Resolve target file
    let targetFile = rawSpecifier;
    if (!isExternal && resolvePaths) {
      targetFile = resolveImportPath(rawSpecifier, fileDir, projectRoot);
    }

    // Get line number
    const lineNumber = getLineNumber(content, match.index);

    imports.push({
      sourceFile,
      targetFile,
      importType,
      importedNames: getNames(match),
      rawSpecifier,
      isExternal,
      lineNumber,
    });
  }
}

function parseNamedImports(namedString: string): string[] {
  return namedString
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      // Handle "original as alias"
      const parts = s.split(/\s+as\s+/);
      return parts[0]?.trim() ?? s;
    });
}

function getPackageName(specifier: string): string {
  // Handle scoped packages: @scope/package/path -> @scope/package
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    return parts.slice(0, 2).join('/');
  }
  // Regular packages: package/path -> package
  return specifier.split('/')[0] ?? specifier;
}

function resolveImportPath(
  specifier: string,
  fromDir: string,
  projectRoot: string
): string {
  // Resolve the path
  const absolutePath = resolve(fromDir, specifier);

  // Try common extensions
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js'];

  for (const ext of extensions) {
    const tryPath = absolutePath + ext;
    if (existsSync(tryPath)) {
      return relative(projectRoot, tryPath);
    }
  }

  // Return as-is if not found
  return relative(projectRoot, absolutePath);
}

function getLineNumber(content: string, index: number): number {
  const before = content.slice(0, index);
  return (before.match(/\n/g) ?? []).length + 1;
}

// ============================================================================
// Specialized Functions
// ============================================================================

/**
 * Get all files that import a specific file
 */
export async function findImportersOf(
  projectRoot: string,
  targetFile: string
): Promise<FileImport[]> {
  const result = await collectImports({ projectRoot });
  const normalizedTarget = targetFile.replace(/\.(ts|tsx|js|jsx)$/, '');

  return result.imports.filter((imp) => {
    const normalizedImport = imp.targetFile.replace(/\.(ts|tsx|js|jsx)$/, '');
    return (
      normalizedImport === normalizedTarget ||
      normalizedImport.endsWith('/' + normalizedTarget)
    );
  });
}

/**
 * Get all files imported by a specific file
 */
export async function findImportsOf(
  projectRoot: string,
  sourceFile: string
): Promise<FileImport[]> {
  const result = await collectImports({ projectRoot });
  return result.imports.filter((imp) => imp.sourceFile === sourceFile);
}

/**
 * Build a dependency graph from imports
 */
export async function buildDependencyGraph(
  projectRoot: string
): Promise<Map<string, Set<string>>> {
  const result = await collectImports({ projectRoot });
  const graph = new Map<string, Set<string>>();

  for (const imp of result.imports) {
    if (imp.isExternal) continue;

    if (!graph.has(imp.sourceFile)) {
      graph.set(imp.sourceFile, new Set());
    }
    graph.get(imp.sourceFile)?.add(imp.targetFile);
  }

  return graph;
}

/**
 * Find circular dependencies
 */
export async function findCircularDependencies(
  projectRoot: string
): Promise<string[][]> {
  const graph = await buildDependencyGraph(projectRoot);
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    if (stack.has(node)) {
      // Found a cycle
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart));
      return;
    }

    if (visited.has(node)) return;

    visited.add(node);
    stack.add(node);

    const deps = graph.get(node) ?? new Set();
    for (const dep of deps) {
      dfs(dep, [...path, node]);
    }

    stack.delete(node);
  }

  for (const node of graph.keys()) {
    dfs(node, []);
  }

  return cycles;
}
