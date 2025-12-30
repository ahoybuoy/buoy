# @buoy-design/agents SDK Conversion Plan

> **For Claude:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the `@buoy-design/agents` package from direct Anthropic API calls to Claude Agent SDK with shared agent definitions.

**Architecture:** Agent definitions live in `.claude/agents/*.md` (single source of truth). Buoy CLI invokes them via Agent SDK with `settingSources: ['project']`. Same agents work interactively in Claude Code.

---

## Task 1: Create Agent Definition Files

**Files:**
- Create: `.claude/agents/codebase-review.md`
- Create: `.claude/agents/history-review.md`
- Create: `.claude/agents/acceptance.md`

**Step 1: Create .claude/agents directory**

```bash
mkdir -p .claude/agents
```

**Step 2: Create codebase-review.md**

```markdown
---
name: codebase-review
description: Analyzes code for patterns, quality, and whether drift signals are intentional divergences. Use when reviewing components or investigating why code doesn't follow design system patterns.
tools: Read, Grep, Glob
model: sonnet
---

You analyze codebases for design system adherence and code quality.

## What You Look For

**Hardcoded values that should be tokens:**
- Colors: #hex, rgb(), hsl() instead of --color-* or theme.colors.*
- Spacing: px/rem literals instead of --spacing-* or spacing scale
- Typography: font-size/weight literals instead of --text-* or type scale
- Shadows, borders, radii: literals instead of design tokens

**Naming inconsistencies:**
- Component names that don't match design system (e.g., "BlueButton" vs "Button variant=primary")
- CSS class names that encode values ("mt-24" when spacing scale exists)
- Variable names that duplicate token intent ("primaryBlue" vs using token)

**Pattern violations:**
- Inline styles where styled-components/CSS modules expected
- Direct DOM manipulation where React patterns expected
- Prop drilling where context/composition expected

**Intentional divergences (not bugs):**
- One-off marketing components with brand-specific styling
- Third-party component wrappers with override requirements
- Accessibility overrides (focus rings, contrast)
- Animation/transition values not in token system

## How You Respond

For each file analyzed, provide:
1. Patterns found (name, occurrences, is it consistent across files?)
2. Quality assessment (score 0-100, specific strengths, specific concerns)
3. Findings list - each with:
   - type: hardcoded-value | naming-inconsistency | pattern-violation | intentional-divergence
   - severity: critical | warning | info
   - location: file:line
   - observation: what you found (quote the code)
   - recommendation: specific fix with code example
   - confidence: 0.0-1.0
```

**Step 3: Create history-review.md**

```markdown
---
name: history-review
description: Analyzes git history to understand why code evolved and whether files were intentionally left unchanged. Use when investigating why drift exists or understanding code ownership.
tools: Read, Grep, Glob, Bash
model: sonnet
---

You analyze git history to explain why code is in its current state.

## What You Investigate

**File evolution:**
- Run `git log --oneline -20 <file>` to see recent commits
- Run `git blame <file>` to see who wrote each line and when
- Identify major changes vs minor tweaks

**Why files weren't updated:**
- Check if related files were updated in same commits (`git show <hash> --stat`)
- Look for PRs that touched similar files but missed this one
- Identify if file predates a migration/refactor

**Ownership patterns:**
- Who maintains this file (most commits, recent commits)
- Is it actively maintained (commits in last 90 days) or dormant
- Bus factor (how many people have touched it)

**Related context:**
- Run `git log --grep="<keyword>"` to find related commits
- Look for commit messages mentioning migrations, refactors, design system

## How You Respond

For each file:
1. Evolution summary (one paragraph explaining the file's history)
2. Key events (date, what happened, commit hash, significance: major/minor)
3. Main contributors (names, how many commits each)
4. Change frequency: active (<30 days) | stable (30-90) | dormant (90-365) | abandoned (>365)
5. If drift exists, explain:
   - Why it wasn't updated (with evidence from git history)
   - Whether it should be updated now
   - Related PRs/commits that provide context
```

**Step 4: Create acceptance.md**

```markdown
---
name: acceptance
description: Predicts PR acceptance likelihood and suggests optimal submission approach. Use before submitting fixes to external repos or when planning contributions.
tools: Read, Grep, Glob, Bash
model: sonnet
---

You analyze repositories to predict whether a proposed change will be accepted as a PR.

## What You Investigate

**Contribution requirements:**
- Read CONTRIBUTING.md, .github/PULL_REQUEST_TEMPLATE.md
- Check for required CI checks, test coverage thresholds
- Look for code style requirements (linting, formatting)

**Maintainer patterns (use `gh` CLI):**
- Run `gh pr list --state merged --limit 20` to see what gets merged
- Run `gh pr list --state closed --limit 10` to see what gets rejected
- Check response times, review patterns, active maintainers

**What gets accepted:**
- Small, focused PRs vs large refactors
- Preferred commit message style (conventional commits? imperative?)
- Required labels, linked issues
- Test requirements (unit tests? integration tests?)

**What gets rejected:**
- PRs without tests
- PRs without issue discussion first
- Style violations
- Scope creep (too many changes)

## How You Respond

1. Likelihood: high | medium | low | unlikely (with score 0-100)
2. Factors affecting acceptance:
   - factor, impact (positive/negative), weight, evidence from repo
3. Suggested approach:
   - PR title (matching repo's style)
   - PR body (using their template if exists)
   - Commit message (matching their convention)
   - Labels to apply
4. Risks and mitigations:
   - What could cause rejection, how to avoid it
5. Timing:
   - Maintainer activity patterns (when are they most responsive)
```

**Step 5: Commit**

```bash
git add .claude/agents/
git commit -m "feat(agents): add Claude Code agent definitions"
```

---

## Task 2: Update Package Dependencies

**Files:**
- Update: `packages/agents/package.json`

**Step 1: Replace Anthropic SDK with Agent SDK**

Change dependencies from:
```json
"dependencies": {
  "@anthropic-ai/sdk": "^0.32.1",
  "simple-git": "^3.27.0",
  "zod": "^3.24.1"
}
```

To:
```json
"dependencies": {
  "@anthropic-ai/claude-agent-sdk": "^0.1.0",
  "zod": "^3.24.1"
}
```

Remove `simple-git` - the history-review agent uses Bash git commands instead.

**Step 2: Run pnpm install**

```bash
pnpm install
```

**Step 3: Commit**

```bash
git add packages/agents/package.json pnpm-lock.yaml
git commit -m "feat(agents): switch to Claude Agent SDK"
```

---

## Task 3: Simplify Types

**Files:**
- Update: `packages/agents/src/types.ts`
- Delete: `packages/agents/src/types.test.ts` (most validation now done by agents)

**Step 1: Keep only result types needed for parsing agent output**

Keep:
- `RepoMetadata` - still useful for context
- `FileContent` - still useful for context
- `Finding`, `FindingSeverity` - for parsing agent findings
- `CodePattern` - for parsing codebase-review output
- Agent result types (simplified)

Remove:
- `CommitInfo`, `BlameLine`, `PullRequestInfo` - agents handle git directly
- `AgentContext`, `HistoryContext`, `AcceptanceContext` - SDK handles context
- `Agent` interface - SDK provides this
- `AgentConfig`, `DEFAULT_AGENT_CONFIG` - SDK handles config

**Step 2: Commit**

```bash
git add packages/agents/src/types.ts
git rm packages/agents/src/types.test.ts
git commit -m "refactor(agents): simplify types for SDK approach"
```

---

## Task 4: Create SDK Wrapper Functions

**Files:**
- Rewrite: `packages/agents/src/index.ts`
- Delete: `packages/agents/src/agents/` (entire directory)
- Delete: `packages/agents/src/utils/` (entire directory)

**Step 1: Write new index.ts with SDK wrapper functions**

```typescript
// packages/agents/src/index.ts
import { query } from '@anthropic-ai/claude-agent-sdk';

export interface AnalysisOptions {
  workingDirectory?: string;
  question?: string;
}

export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Analyze codebase for patterns, quality, and design system adherence
 */
export async function analyzeCodebase(
  files: string[],
  options: AnalysisOptions = {}
): Promise<AgentResult> {
  const fileList = files.join(', ');
  const prompt = options.question
    ? `Use the codebase-review agent to analyze these files: ${fileList}. Focus on: ${options.question}`
    : `Use the codebase-review agent to analyze these files: ${fileList}`;

  try {
    let output = '';
    for await (const message of query({
      prompt,
      options: {
        workingDirectory: options.workingDirectory,
        settingSources: ['project'],
        allowedTools: ['Read', 'Grep', 'Glob', 'Task'],
      }
    })) {
      if ('result' in message) {
        output = message.result;
      }
    }
    return { success: true, output };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Analyze git history to understand code evolution
 */
export async function analyzeHistory(
  files: string[],
  options: AnalysisOptions = {}
): Promise<AgentResult> {
  const fileList = files.join(', ');
  const prompt = options.question
    ? `Use the history-review agent to analyze the git history of: ${fileList}. Focus on: ${options.question}`
    : `Use the history-review agent to analyze the git history of: ${fileList}`;

  try {
    let output = '';
    for await (const message of query({
      prompt,
      options: {
        workingDirectory: options.workingDirectory,
        settingSources: ['project'],
        allowedTools: ['Read', 'Grep', 'Glob', 'Bash', 'Task'],
      }
    })) {
      if ('result' in message) {
        output = message.result;
      }
    }
    return { success: true, output };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Predict PR acceptance likelihood for a repository
 */
export async function predictAcceptance(
  repoPath: string,
  proposedChanges: string,
  options: AnalysisOptions = {}
): Promise<AgentResult> {
  const prompt = `Use the acceptance agent to analyze this repository and predict whether these changes would be accepted as a PR: ${proposedChanges}`;

  try {
    let output = '';
    for await (const message of query({
      prompt,
      options: {
        workingDirectory: repoPath,
        settingSources: ['project'],
        allowedTools: ['Read', 'Grep', 'Glob', 'Bash', 'Task'],
      }
    })) {
      if ('result' in message) {
        output = message.result;
      }
    }
    return { success: true, output };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Re-export types for consumers
export * from './types.js';
```

**Step 2: Delete old implementation files**

```bash
rm -rf packages/agents/src/agents/
rm -rf packages/agents/src/utils/
```

**Step 3: Commit**

```bash
git add packages/agents/src/
git commit -m "refactor(agents): replace direct API with SDK wrapper"
```

---

## Task 5: Update README and Build

**Files:**
- Update: `packages/agents/README.md`
- Update: `packages/agents/tsconfig.json` (if needed)

**Step 1: Update README with new usage**

```markdown
# @buoy-design/agents

AI agents for code analysis, powered by Claude Agent SDK.

## Prerequisites

- Claude Code installed
- `ANTHROPIC_API_KEY` environment variable set

## Installation

\`\`\`bash
pnpm add @buoy-design/agents
\`\`\`

## Usage

### Programmatic (via Buoy CLI)

\`\`\`typescript
import { analyzeCodebase, analyzeHistory, predictAcceptance } from '@buoy-design/agents';

// Analyze code patterns and quality
const result = await analyzeCodebase(['src/Button.tsx', 'src/Input.tsx']);
console.log(result.output);

// Understand git history
const history = await analyzeHistory(['src/Button.tsx'], {
  question: 'Why was this file not updated during the token migration?'
});

// Predict PR acceptance
const prediction = await predictAcceptance('/path/to/repo',
  'Migrate hardcoded colors to design tokens'
);
\`\`\`

### Interactive (via Claude Code)

\`\`\`
> Use the codebase-review agent to analyze src/components/

> Use the history-review agent to explain why Button.tsx still has hardcoded colors

> Use the acceptance agent to predict if my token migration PR will be accepted
\`\`\`

## Agents

| Agent | Purpose |
|-------|---------|
| `codebase-review` | Analyze code patterns, quality, design system adherence |
| `history-review` | Understand git history, explain why code wasn't updated |
| `acceptance` | Predict PR acceptance, suggest submission approach |

Agent definitions live in `.claude/agents/` and work in both modes.

## License

MIT
\`\`\`

**Step 2: Build and verify**

```bash
pnpm --filter @buoy-design/agents build
```

**Step 3: Commit**

```bash
git add packages/agents/
git commit -m "docs(agents): update README for SDK approach"
```

---

## Task 6: Test Integration

**Step 1: Manual test - interactive mode**

In Claude Code, run:
```
> Use the codebase-review agent to analyze packages/core/src/
```

Verify agent loads and executes.

**Step 2: Manual test - programmatic mode**

Create a test script:
```typescript
// test-agents.ts
import { analyzeCodebase } from '@buoy-design/agents';

const result = await analyzeCodebase(['packages/core/src/models/drift.ts']);
console.log(result);
```

Run: `npx tsx test-agents.ts`

**Step 3: Commit any fixes**

---

## Summary

After completing all tasks:

1. **Agent definitions** in `.claude/agents/` (single source of truth)
2. **SDK wrapper** in `packages/agents/` (~100 lines vs ~2,400)
3. **Works both ways**: interactive + programmatic
4. **No direct API calls**: Claude Code handles everything
