/**
 * Git History Collector
 *
 * Extracts commit history, authors, and file changes from git.
 * Populates commits and developers tables.
 */

import { simpleGit, type SimpleGit, type LogResult, type DefaultLogFields } from 'simple-git';
import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface CollectedCommit {
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  timestamp: Date;
  parentSha: string | null;
  filesChanged: FileChange[];
}

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions?: number;
  deletions?: number;
  oldPath?: string; // For renames
}

export interface CollectedDeveloper {
  id: string;
  name: string;
  email: string;
  commitCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface GitCollectorOptions {
  /** Only collect commits after this date */
  since?: Date;
  /** Only collect commits before this date */
  until?: Date;
  /** Only collect commits touching these file patterns */
  paths?: string[];
  /** Maximum number of commits to collect */
  maxCount?: number;
  /** Include file change stats (slower but more data) */
  includeStats?: boolean;
}

export interface GitCollectorResult {
  commits: CollectedCommit[];
  developers: CollectedDeveloper[];
  stats: {
    totalCommits: number;
    totalDevelopers: number;
    dateRange: { start: Date; end: Date } | null;
  };
}

// ============================================================================
// Collector
// ============================================================================

/**
 * Collect git history from a repository
 */
export async function collectGitHistory(
  projectRoot: string,
  options: GitCollectorOptions = {}
): Promise<GitCollectorResult> {
  const git: SimpleGit = simpleGit(projectRoot);

  // Build log options
  const logOptions: Record<string, string | number | boolean | undefined> = {
    '--date': 'iso-strict',
  };

  if (options.since) {
    logOptions['--since'] = options.since.toISOString();
  }
  if (options.until) {
    logOptions['--until'] = options.until.toISOString();
  }
  if (options.maxCount) {
    logOptions['--max-count'] = options.maxCount;
  }

  // Get commit log
  let log: LogResult<DefaultLogFields>;
  if (options.paths && options.paths.length > 0) {
    log = await git.log({ ...logOptions, file: options.paths.join(' ') });
  } else {
    log = await git.log(logOptions);
  }

  const commits: CollectedCommit[] = [];
  const developerMap = new Map<string, CollectedDeveloper>();

  for (const entry of log.all) {
    // Parse commit
    const commit: CollectedCommit = {
      sha: entry.hash,
      message: entry.message,
      author: entry.author_name,
      authorEmail: entry.author_email,
      timestamp: new Date(entry.date),
      parentSha: entry.refs ? null : null, // Will be populated if needed
      filesChanged: [],
    };

    // Get file changes if requested
    if (options.includeStats) {
      try {
        const diff = await git.diffSummary([`${entry.hash}^`, entry.hash]);
        commit.filesChanged = diff.files.map((f) => {
          // Handle different file types
          const isBinary = 'binary' in f && f.binary;
          const insertions = 'insertions' in f ? f.insertions : 0;
          const deletions = 'deletions' in f ? f.deletions : 0;

          return {
            path: f.file,
            status: isBinary
              ? 'modified' as const
              : insertions > 0 && deletions === 0
                ? 'added' as const
                : deletions > 0 && insertions === 0
                  ? 'deleted' as const
                  : 'modified' as const,
            additions: insertions,
            deletions: deletions,
          };
        });
      } catch {
        // First commit has no parent, skip diff
      }
    }

    commits.push(commit);

    // Track developer
    const devKey = entry.author_email.toLowerCase();
    const existing = developerMap.get(devKey);

    if (existing) {
      existing.commitCount++;
      if (commit.timestamp < existing.firstSeenAt) {
        existing.firstSeenAt = commit.timestamp;
      }
      if (commit.timestamp > existing.lastSeenAt) {
        existing.lastSeenAt = commit.timestamp;
      }
    } else {
      developerMap.set(devKey, {
        id: generateDeveloperId(entry.author_email),
        name: entry.author_name,
        email: entry.author_email,
        commitCount: 1,
        firstSeenAt: commit.timestamp,
        lastSeenAt: commit.timestamp,
      });
    }
  }

  const developers = Array.from(developerMap.values());

  // Calculate date range
  let dateRange: { start: Date; end: Date } | null = null;
  if (commits.length > 0) {
    const timestamps = commits.map((c) => c.timestamp.getTime());
    dateRange = {
      start: new Date(Math.min(...timestamps)),
      end: new Date(Math.max(...timestamps)),
    };
  }

  return {
    commits,
    developers,
    stats: {
      totalCommits: commits.length,
      totalDevelopers: developers.length,
      dateRange,
    },
  };
}

/**
 * Collect commits that touched design-related files
 */
export async function collectDesignSystemHistory(
  projectRoot: string,
  options: Omit<GitCollectorOptions, 'paths'> = {}
): Promise<GitCollectorResult> {
  // Patterns for design-system related files
  const designPatterns = [
    '*.tokens.json',
    'tokens.json',
    '**/tokens/**',
    '**/theme/**',
    '**/design-system/**',
    '*.css',
    '*.scss',
    '*.sass',
    '*.less',
    'tailwind.config.*',
    '**/components/**/*.tsx',
    '**/components/**/*.vue',
    '**/components/**/*.svelte',
  ];

  return collectGitHistory(projectRoot, {
    ...options,
    paths: designPatterns,
    includeStats: true,
  });
}

/**
 * Get file history (who changed this file)
 */
export async function getFileHistory(
  projectRoot: string,
  filePath: string,
  options: { maxCount?: number } = {}
): Promise<CollectedCommit[]> {
  const result = await collectGitHistory(projectRoot, {
    paths: [filePath],
    maxCount: options.maxCount ?? 50,
    includeStats: false,
  });

  return result.commits;
}

/**
 * Get blame information for a file
 */
export async function getFileBlame(
  projectRoot: string,
  filePath: string
): Promise<Map<number, { author: string; email: string; sha: string; date: Date }>> {
  const git: SimpleGit = simpleGit(projectRoot);
  const blameMap = new Map<number, { author: string; email: string; sha: string; date: Date }>();

  try {
    const blame = await git.raw(['blame', '--line-porcelain', filePath]);
    const lines = blame.split('\n');

    let currentSha = '';
    let currentAuthor = '';
    let currentEmail = '';
    let currentDate = new Date();
    let lineNumber = 0;

    for (const line of lines) {
      if (line.match(/^[0-9a-f]{40}/)) {
        currentSha = line.slice(0, 40);
        // Parse line number from "sha origLine finalLine numLines"
        const parts = line.split(' ');
        if (parts[2]) {
          lineNumber = parseInt(parts[2], 10);
        }
      } else if (line.startsWith('author ')) {
        currentAuthor = line.slice(7);
      } else if (line.startsWith('author-mail ')) {
        currentEmail = line.slice(12).replace(/[<>]/g, '');
      } else if (line.startsWith('author-time ')) {
        currentDate = new Date(parseInt(line.slice(12), 10) * 1000);
      } else if (line.startsWith('\t')) {
        // This is the actual line content, save the blame info
        blameMap.set(lineNumber, {
          author: currentAuthor,
          email: currentEmail,
          sha: currentSha,
          date: currentDate,
        });
      }
    }
  } catch {
    // File might not exist or not be tracked
  }

  return blameMap;
}

/**
 * Check if a path is inside a git repository
 */
export async function isGitRepository(path: string): Promise<boolean> {
  const git: SimpleGit = simpleGit(path);
  try {
    await git.revparse(['--git-dir']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(projectRoot: string): Promise<string | null> {
  const git: SimpleGit = simpleGit(projectRoot);
  try {
    const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
    return branch.trim();
  } catch {
    return null;
  }
}

/**
 * Get the remote URL
 */
export async function getRemoteUrl(projectRoot: string): Promise<string | null> {
  const git: SimpleGit = simpleGit(projectRoot);
  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === 'origin');
    return origin?.refs.fetch ?? null;
  } catch {
    return null;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function generateDeveloperId(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
}
