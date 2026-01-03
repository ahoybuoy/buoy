/**
 * Graph Collectors
 *
 * Extract data from various sources to populate the knowledge graph.
 */

// Git history
export {
  collectGitHistory,
  collectDesignSystemHistory,
  getFileHistory,
  getFileBlame,
  isGitRepository,
  getCurrentBranch,
  getRemoteUrl,
  type CollectedCommit,
  type CollectedDeveloper,
  type FileChange,
  type GitCollectorOptions,
  type GitCollectorResult,
} from './git.js';

// Token and component usages
export {
  collectUsages,
  findHardcodedColors,
  findCSSVariableUsages,
  findTokenUsagesInFiles,
  findComponentUsagesInFiles,
  type TokenUsage,
  type ComponentUsage,
  type UsageType,
  type UsageCollectorOptions,
  type UsageCollectorResult,
} from './usages.js';

// Import relationships
export {
  collectImports,
  findImportersOf,
  findImportsOf,
  buildDependencyGraph,
  findCircularDependencies,
  type FileImport,
  type ImportType,
  type ImportCollectorOptions,
  type ImportCollectorResult,
} from './imports.js';
