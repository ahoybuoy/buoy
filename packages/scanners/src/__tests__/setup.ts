import { vi, beforeEach } from 'vitest';

// Mock fs/promises for scanner tests
vi.mock('fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Mock fs (sync) for scanner tests
vi.mock('fs', async () => {
  const memfs = await import('memfs');
  return memfs.fs;
});

// Mock glob to work with memfs
vi.mock('glob', async () => {
  return {
    glob: async (
      pattern: string,
      options: { cwd?: string; ignore?: string[]; absolute?: boolean }
    ): Promise<string[]> => {
      const { vol } = await import('memfs');
      const allFiles = Object.keys(vol.toJSON());
      const cwd = options?.cwd || '/';

      // Expand brace patterns like {tsx,jsx,ts,js} into multiple patterns
      const expandBraces = (p: string): string[] => {
        const braceMatch = p.match(/\{([^}]+)\}/);
        if (!braceMatch) return [p];

        const alternatives = braceMatch[1]!.split(',');
        const before = p.slice(0, braceMatch.index);
        const after = p.slice(braceMatch.index! + braceMatch[0].length);

        const expanded: string[] = [];
        for (const alt of alternatives) {
          expanded.push(...expandBraces(before + alt + after));
        }
        return expanded;
      };

      // Convert glob pattern to regex
      const escapeRegex = (str: string) =>
        str.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

      const patternToRegex = (p: string) => {
        let regex = '';
        let i = 0;
        while (i < p.length) {
          if (p[i] === '*' && p[i + 1] === '*') {
            // ** matches any path segment(s)
            if (p[i + 2] === '/') {
              regex += '(?:[^/]+/)*';
              i += 3;
            } else {
              regex += '.*';
              i += 2;
            }
          } else if (p[i] === '*') {
            // * matches anything except /
            regex += '[^/]*';
            i++;
          } else if (p[i] === '?') {
            regex += '[^/]';
            i++;
          } else {
            regex += escapeRegex(p[i]!);
            i++;
          }
        }
        return new RegExp(`^${regex}$`);
      };

      // Expand braces and create regexes for all patterns
      const patterns = expandBraces(pattern);
      const matchPatterns = patterns.map(p => patternToRegex(p));

      return allFiles.filter((file) => {
        // Check if file is under cwd
        if (!file.startsWith(cwd)) return false;

        // Get relative path for matching
        let relativePath = file.slice(cwd.length);
        if (relativePath.startsWith('/')) {
          relativePath = relativePath.slice(1);
        }

        // Check against ignore patterns
        if (options?.ignore) {
          for (const ignorePattern of options.ignore) {
            const expandedIgnores = expandBraces(ignorePattern);
            for (const ignoreP of expandedIgnores) {
              const ignoreRegex = patternToRegex(ignoreP);
              if (ignoreRegex.test(relativePath)) return false;
            }
          }
        }

        // Match against any of the expanded patterns
        if (!matchPatterns.some(regex => regex.test(relativePath))) return false;

        return true;
      }).map((file) => (options?.absolute ? file : file.slice(cwd.length + 1)));
    },
  };
});

// Reset filesystem between tests
beforeEach(async () => {
  const { vol } = await import('memfs');
  vol.reset();
});
