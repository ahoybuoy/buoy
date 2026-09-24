/**
 * Decides, per flagged value, whether the code says it is deliberate, and
 * keeps the list of what it set aside so output can show it (never silently).
 *
 * Order: a comment on or above the line, the value's shape (2-3px nudges),
 * then the commit that introduced the line. History costs a `git blame` per
 * line, so it runs only in a full (non-shallow) clone and within a time budget.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { commitIntent, lineIntent, type IntentEvidence, type NotedValue } from "@buoy-design/core";

export interface IntentCandidate {
  property?: string;
  value: string;
  /** Tailwind class, e.g. `mt-[3px]`. */
  fullClass?: string;
}

export interface IntentJudgeOptions {
  /**
   * Only these lines are in scope (repo-relative path -> 1-based lines), e.g.
   * the staged hunks for a pre-commit check. Values elsewhere are skipped
   * silently: they are not deliberate, just not part of this change.
   */
  scope?: Map<string, Set<number>>;
  /** Look up the commit that introduced each flagged line (default true). */
  history?: boolean;
  /** Stop history lookups after this many milliseconds in total (default 5000). */
  historyBudgetMs?: number;
}

export class IntentJudge {
  readonly noted: NotedValue[] = [];
  private readonly seen = new Set<string>();
  private readonly files = new Map<string, string[] | null>();
  private readonly commits = new Map<string, string | null>();
  private historySpentMs = 0;
  private historyEnabled: boolean;
  private readonly historyBudgetMs: number;

  private readonly scope?: Map<string, Set<number>>;

  constructor(private readonly projectRoot: string, options: IntentJudgeOptions = {}) {
    this.scope = options.scope;
    this.historyBudgetMs = options.historyBudgetMs ?? 5000;
    this.historyEnabled = options.history !== false && process.env.BUOY_HISTORY !== "0" && this.hasFullHistory();
  }

  /** True when the value should not become a finding: out of scope, or deliberate (recorded in `noted`). */
  skip(file: string, line: number, candidate: IntentCandidate, lines?: readonly string[]): boolean {
    if (this.scope && !this.scope.get(this.relativePath(file))?.has(line)) return true;
    return this.judge(file, line, candidate, lines) !== null;
  }

  /** Evidence that the value at `file:line` (1-based) is deliberate, or null. Records hits in `noted`. */
  judge(file: string, line: number, candidate: IntentCandidate, lines?: readonly string[]): IntentEvidence | null {
    const rel = this.relativePath(file);
    const source = lines ?? this.readLines(rel);
    if (!source || line < 1) return null;
    const evidence = lineIntent(source, line - 1, candidate) ?? this.historyIntent(rel, line);
    if (evidence) {
      const value = candidate.fullClass ?? candidate.value;
      // Several scanners can read the same file; list each value once.
      const key = `${rel}:${line}:${value}`;
      if (!this.seen.has(key)) {
        this.seen.add(key);
        this.noted.push({ file: rel, line, value, kind: evidence.kind, reason: evidence.reason });
      }
    }
    return evidence;
  }

  private relativePath(file: string): string {
    return isAbsolute(file) ? relative(this.projectRoot, file) : file;
  }

  private readLines(rel: string): string[] | null {
    if (!this.files.has(rel)) {
      try {
        this.files.set(rel, readFileSync(resolve(this.projectRoot, rel), "utf8").split("\n"));
      } catch {
        this.files.set(rel, null);
      }
    }
    return this.files.get(rel) ?? null;
  }

  private hasFullHistory(): boolean {
    try {
      const shallow = execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
        cwd: this.projectRoot, stdio: ["ignore", "pipe", "ignore"], timeout: 3000,
      }).toString().trim();
      return shallow === "false";
    } catch {
      return false; // not a git repository
    }
  }

  private historyIntent(rel: string, line: number): IntentEvidence | null {
    if (!this.historyEnabled) return null;
    if (this.historySpentMs >= this.historyBudgetMs) return null;
    const key = `${rel}:${line}`;
    if (!this.commits.has(key)) {
      const started = Date.now();
      let message: string | null = null;
      try {
        const out = execFileSync("git", ["blame", "--porcelain", "-L", `${line},${line}`, "--", rel], {
          cwd: this.projectRoot, stdio: ["ignore", "pipe", "ignore"], timeout: 2000, maxBuffer: 1024 * 1024,
        }).toString();
        const sha = out.split("\n")[0]?.split(" ")[0];
        // Uncommitted lines blame to 0000000; there is no message to read.
        if (sha && !/^0+$/.test(sha)) {
          message = execFileSync("git", ["log", "-1", "--format=%B", sha], {
            cwd: this.projectRoot, stdio: ["ignore", "pipe", "ignore"], timeout: 2000,
          }).toString();
        }
      } catch {
        message = null;
      }
      this.historySpentMs += Date.now() - started;
      this.commits.set(key, message);
    }
    const message = this.commits.get(key);
    return message ? commitIntent(message) : null;
  }
}

/** Counts by kind plus the first few examples, for JSON and reports. */
export function summarizeNoted(noted: readonly NotedValue[], sampleSize = 50): {
  count: number;
  byKind: Partial<Record<NotedValue["kind"], number>>;
  items: NotedValue[];
} {
  const byKind: Partial<Record<NotedValue["kind"], number>> = {};
  for (const n of noted) byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
  return { count: noted.length, byKind, items: noted.slice(0, sampleSize) };
}

const KIND_LABEL: Record<NotedValue["kind"], string> = {
  explained: "explained in a comment",
  "known-debt": "marked as known debt",
  "optical-nudge": "2-3px optical nudges",
  history: "deliberate per commit history",
  allowlisted: "buoy-ignore",
};

/** One line for text output: how many values were set aside and why. */
export function formatNotedLine(noted: readonly NotedValue[]): string {
  const { count, byKind } = summarizeNoted(noted, 0);
  const why = Object.entries(byKind)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${n} ${KIND_LABEL[kind as NotedValue["kind"]]}`)
    .join(", ");
  return `  ${count} value${count === 1 ? " looks" : "s look"} deliberate and ${count === 1 ? "was" : "were"} not counted (${why}). --json lists them.`;
}
