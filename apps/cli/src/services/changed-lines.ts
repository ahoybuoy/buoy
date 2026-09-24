/**
 * Which lines a change touches, from git's unified diff. The pre-commit check
 * and the agent hook report only these: editing one line of an old file should
 * not surface every literal already in it.
 */
import { execFileSync } from "node:child_process";
import { isAbsolute, relative } from "node:path";

/** Lines added or modified per file (new-side line numbers), from `git diff -U0` output. */
export function addedLinesFromDiff(diff: string): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();
  let current: Set<number> | null = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).trim();
      if (path === "/dev/null") { current = null; continue; }
      const rel = path.replace(/^b\//, "");
      current = result.get(rel) ?? new Set<number>();
      result.set(rel, current);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && current) {
      const start = parseInt(hunk[1]!, 10);
      const count = hunk[2] === undefined ? 1 : parseInt(hunk[2], 10);
      for (let n = start; n < start + count; n++) current.add(n);
    }
  }
  return result;
}

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024, timeout: 15000 }).toString();
  } catch {
    return null;
  }
}

/** Lines staged for commit, per repo-relative path. Null when this is not a git repository. */
export function stagedChangedLines(projectRoot: string): Map<string, Set<number>> | null {
  const diff = git(projectRoot, ["diff", "--cached", "-U0", "--no-color", "--no-ext-diff", "--relative"]);
  return diff === null ? null : addedLinesFromDiff(diff);
}

/**
 * Lines of one file that differ from HEAD (staged or not). Null means "treat
 * every line as changed": a new or untracked file, or no git repository.
 */
export function fileChangedLines(projectRoot: string, file: string): Set<number> | null {
  const rel = isAbsolute(file) ? relative(projectRoot, file) : file;
  if (git(projectRoot, ["rev-parse", "--verify", "-q", "HEAD"]) === null) return null;
  if (git(projectRoot, ["ls-files", "--error-unmatch", "--", rel]) === null) return null; // untracked
  const diff = git(projectRoot, ["diff", "HEAD", "-U0", "--no-color", "--no-ext-diff", "--relative", "--", rel]);
  if (diff === null) return null;
  return addedLinesFromDiff(diff).get(rel) ?? new Set<number>();
}
