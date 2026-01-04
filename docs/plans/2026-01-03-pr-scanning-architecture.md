# PR Scanning Architecture Design

> **Status**: Approved
> **Date**: January 3, 2026
> **Author**: Dylan Tarre + Claude

---

## Overview

This document defines the architecture for Buoy's PR-based design drift detection - the core feature that makes Buoy work like Coderabbit/Greptile but for design systems. When a PR is opened, Buoy automatically scans for design drift and posts a comment showing only NEW issues introduced by that PR.

## High-Level Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   GitHub    │───▶│  API Worker │───▶│    Queue    │───▶│   Queue     │
│  Webhook    │    │  (receive)  │    │ (buoy-scan) │    │  Consumer   │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                │
                   ┌─────────────┐    ┌─────────────┐           │
                   │   GitHub    │◀───│  Post/Edit  │◀──────────┘
                   │  PR Comment │    │   Comment   │
                   └─────────────┘    └─────────────┘
```

1. **PR opened/updated** → GitHub sends webhook to `/webhooks/github`
2. **API Worker** validates signature, enqueues job with PR metadata
3. **Queue** buffers jobs, handles retries
4. **Queue Consumer** (same worker, isolated invocation) processes job:
   - Fetches PR files via GitHub API
   - Compares against auto-baseline
   - Runs drift scanners on changed files
   - Posts/edits PR comment with results

## Architecture Decisions

### Single Worker with Queue Consumer

Cloudflare Workers queue consumers run in isolated invocations from HTTP handlers - they don't share CPU time or affect each other's latency. This gives us operational simplicity while the platform handles isolation.

```typescript
// wrangler.toml
[[queues.producers]]
binding = "SCAN_QUEUE"
queue = "buoy-scan"

[[queues.consumers]]
queue = "buoy-scan"
max_batch_size = 1
max_retries = 3
dead_letter_queue = "buoy-scan-dlq"
```

### PR Comments Over Check Runs

Check Runs are buried in the GitHub UI. PR comments are immediately visible, like Coderabbit does. We edit the existing comment on subsequent pushes to avoid spam.

---

## Queue Message Schema

```typescript
interface ScanJobMessage {
  type: 'pr_scan' | 'baseline_scan';
  id: string;                      // Job ID for tracking
  installationId: number;          // GitHub App installation (fetch fresh token at execution)
  repository: {
    owner: string;
    repo: string;
    fullName: string;              // "owner/repo"
    defaultBranch: string;         // "main" or "master"
  };
  pullRequest?: {                  // Only for pr_scan
    number: number;
    headSha: string;
    baseSha: string;
    headRef: string;
    baseRef: string;
  };
  project: {
    id: string;
    accountId: string;
  };
  enqueuedAt: string;
}
```

**Important:** Do NOT store GitHub tokens in the queue message. Tokens expire after 1 hour. Fetch a fresh installation token when the job executes.

---

## Fix 1: Auto-Baseline (Zero Config)

Users should not have to run any commands. Baseline is created and maintained automatically.

### Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  GitHub App Installed                                           │
│  ───────────────────                                            │
│  1. Webhook: installation.created                               │
│  2. For each repo granted, enqueue baseline_scan job            │
│  3. Scan default branch, store drift signatures as baseline     │
│  4. User did nothing - baseline exists                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  PR Opened                                                      │
│  ─────────                                                      │
│  1. Scan PR changed files                                       │
│  2. Generate drift signals                                      │
│  3. Filter out signals that exist in baseline                   │
│  4. Post comment showing only NEW drift                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  PR Merged to Default Branch                                    │
│  ───────────────────────────                                    │
│  1. Webhook: push to main/master                                │
│  2. Enqueue baseline_scan job                                   │
│  3. Re-scan, update baseline                                    │
│  4. Baseline stays current                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Schema

```typescript
// D1 Platform Database
projectBaselines: {
  id: text().primaryKey(),
  projectId: text().notNull().references(() => projects.id),
  repoFullName: text().notNull(),
  baselineSha: text().notNull(),           // Git commit SHA
  driftSignatures: text().notNull(),       // JSON: string[] of signal hashes
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
}
```

### Drift Signature

Each drift signal gets a stable hash for comparison:

```typescript
function signalHash(signal: DriftSignal): string {
  // Hash the stable parts (not line number - that changes)
  const parts = [
    signal.type,           // "hardcoded-color"
    signal.file,           // "src/Button.tsx"
    signal.value,          // "#3b82f6"
    signal.componentName,  // "Button"
  ].join('|');

  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts))
    .then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))).slice(0, 16));
}
```

---

## Fix 2: Token Encryption

GitHub installation tokens stored encrypted in D1.

### Implementation

```typescript
// apps/api/src/lib/crypto.ts

export async function encrypt(plaintext: string, key: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyBytes = new TextEncoder().encode(key).slice(0, 32);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, 'AES-GCM', false, ['encrypt']
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    new TextEncoder().encode(plaintext)
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encrypted: string, key: string): Promise<string> {
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const keyBytes = new TextEncoder().encode(key).slice(0, 32);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, 'AES-GCM', false, ['decrypt']
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}
```

### Setup

```bash
# Generate and store encryption key
openssl rand -hex 32 | wrangler secret put ENCRYPTION_KEY
```

### Usage

```typescript
// Storing
const encryptedToken = await encrypt(accessToken, c.env.ENCRYPTION_KEY);
await db.update(githubInstallations)
  .set({ accessToken: encryptedToken })
  .where(eq(id, installationId));

// Reading
const row = await db.query.githubInstallations.findFirst({ where: ... });
const accessToken = await decrypt(row.accessToken, c.env.ENCRYPTION_KEY);
```

---

## Fix 3: Queue Idempotency

Prevent duplicate comments from webhook retries or race conditions.

### Schema

```typescript
// D1 Platform Database
scanClaims: {
  id: text().primaryKey(),
  repoFullName: text().notNull(),
  prNumber: integer().notNull(),
  commitSha: text().notNull(),
  status: text().default('processing'),   // processing | complete | failed
  commentId: integer(),                    // GitHub comment ID for edits
  claimedAt: timestamp().notNull(),
  completedAt: timestamp(),
}

// UNIQUE constraint
CREATE UNIQUE INDEX idx_scan_claims_unique
ON scan_claims(repo_full_name, pr_number, commit_sha);
```

### Queue Consumer Logic

```typescript
async function processJob(message: ScanJobMessage) {
  const claimId = nanoid();

  // 1. Try to claim (atomic via UNIQUE constraint)
  try {
    await db.insert(scanClaims).values({
      id: claimId,
      repoFullName: message.repository.fullName,
      prNumber: message.pullRequest.number,
      commitSha: message.pullRequest.headSha,
      claimedAt: new Date(),
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Check if stale claim (crashed worker)
      const existing = await db.query.scanClaims.findFirst({
        where: and(
          eq(scanClaims.repoFullName, message.repository.fullName),
          eq(scanClaims.prNumber, message.pullRequest.number),
          eq(scanClaims.commitSha, message.pullRequest.headSha),
        ),
      });

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (existing?.status === 'processing' && existing.claimedAt < fiveMinutesAgo) {
        // Stale claim - allow re-processing
        await db.delete(scanClaims).where(eq(scanClaims.id, existing.id));
        // Retry the insert...
      } else {
        console.log('Already claimed, skipping');
        return;
      }
    }
    throw err;
  }

  // 2. Find existing comment for this PR (for edits)
  const existingComment = await db.query.scanClaims.findFirst({
    where: and(
      eq(scanClaims.repoFullName, message.repository.fullName),
      eq(scanClaims.prNumber, message.pullRequest.number),
      isNotNull(scanClaims.commentId),
    ),
    orderBy: desc(scanClaims.claimedAt),
  });

  try {
    // 3. Do the scan
    const results = await scanPR(message);

    // 4. Post or update comment
    const commentId = existingComment?.commentId
      ? await updateComment(existingComment.commentId, results)
      : await postComment(message, results);

    // 5. Mark complete
    await db.update(scanClaims)
      .set({ status: 'complete', commentId, completedAt: new Date() })
      .where(eq(scanClaims.id, claimId));

  } catch (err) {
    await db.update(scanClaims)
      .set({ status: 'failed', completedAt: new Date() })
      .where(eq(scanClaims.id, claimId));
    throw err;
  }
}
```

---

## Fix 4: Memory Streaming

128MB memory limit is the real constraint. Process files sequentially using /tmp.

### Implementation

```typescript
async function scanPR(job: ScanJobMessage): Promise<ScanResult> {
  const token = await getFreshInstallationToken(job.installationId);
  const signals: DriftSignal[] = [];

  // 1. Get changed files metadata
  const changedFiles = await getChangedFiles(
    job.repository.owner,
    job.repository.repo,
    job.pullRequest.number,
    token
  );

  // 2. Filter to scannable files
  const scannable = changedFiles.filter(f =>
    isScannable(f.filename) &&
    f.status !== 'removed' &&
    (f.size ?? 0) < 100_000
  );

  // 3. Process one file at a time
  for (const file of scannable) {
    const tmpPath = `/tmp/${file.filename.replace(/\//g, '_')}`;

    try {
      // Fetch content
      const content = await fetchFileContent(
        job.repository.owner,
        job.repository.repo,
        file.sha,
        token
      );

      // Write to /tmp
      await Bun.write(tmpPath, content);

      // Scan with existing scanner
      const fileSignals = await scanFile(tmpPath, file.filename);
      signals.push(...fileSignals);

    } catch (err) {
      console.warn(`Failed to scan ${file.filename}:`, err);
    } finally {
      // Always cleanup
      try { await unlink(tmpPath); } catch {}
    }
  }

  return { signals };
}

function isScannable(filename: string): boolean {
  const scannable = ['tsx', 'jsx', 'vue', 'svelte', 'astro'];
  const ext = filename.split('.').pop()?.toLowerCase();
  return scannable.includes(ext || '');
}
```

---

## Fix 5: Rate Limit Degradation

Never fail silently. Always post something.

### Rate Limit Tracking

```typescript
interface RateLimitState {
  remaining: number;
  resetAt: Date;
}

async function fetchGitHub(url: string, token: string): Promise<{ data: any; rateLimit: RateLimitState }> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  const rateLimit: RateLimitState = {
    remaining: parseInt(res.headers.get('X-RateLimit-Remaining') || '5000'),
    resetAt: new Date(parseInt(res.headers.get('X-RateLimit-Reset') || '0') * 1000),
  };

  if (res.status === 403 && rateLimit.remaining === 0) {
    throw new RateLimitError(rateLimit.resetAt);
  }

  if (!res.ok) {
    throw new GitHubAPIError(res.status, await res.text());
  }

  return { data: await res.json(), rateLimit };
}
```

### Degradation Tiers

| Remaining | Behavior |
|-----------|----------|
| > 500 | Normal - scan all files |
| 100-500 | Reduced - scan max 20 files, note in comment |
| < 100 | Deferred - post "will scan later" comment, requeue |
| 0 | Skip - respect Retry-After, job goes to DLQ after 3 retries |

### Implementation

```typescript
async function scanPR(job: ScanJobMessage): Promise<ScanResult> {
  const token = await getFreshInstallationToken(job.installationId);

  // Check rate limit before starting
  const { rateLimit } = await fetchGitHub(
    'https://api.github.com/rate_limit',
    token
  );

  if (rateLimit.remaining < 100) {
    // Post deferred comment
    await postComment(job, {
      type: 'deferred',
      resetAt: rateLimit.resetAt,
    });

    // Requeue for after reset
    const delaySeconds = Math.max(0, (rateLimit.resetAt.getTime() - Date.now()) / 1000);
    await env.SCAN_QUEUE.send(job, { delaySeconds });

    return { deferred: true };
  }

  const changedFiles = await getChangedFiles(...);

  // Limit files if quota is tight
  const maxFiles = rateLimit.remaining > 500 ? Infinity : 20;
  const filesToScan = changedFiles.slice(0, maxFiles);
  const truncated = changedFiles.length > filesToScan.length;

  const signals = await scanFiles(filesToScan, token);

  return {
    signals,
    truncated,
    scannedCount: filesToScan.length,
    totalCount: changedFiles.length,
  };
}
```

---

## PR Comment Format

```markdown
## :ring_buoy: Buoy Design Drift Report

**2 new issues** in this PR

### Errors (1)

| File | Line | Issue |
|------|------|-------|
| [`src/Button.tsx`](link) | 24 | Hardcoded color `#3b82f6` - use `--color-primary` |

### Warnings (1)

| File | Line | Issue |
|------|------|-------|
| [`src/Card.tsx`](link) | 12 | Arbitrary Tailwind `p-[13px]` - use `p-3` |

---

<details>
<summary>Baseline: 47 pre-existing issues</summary>

Run `buoy baseline reset` to re-scan and update the baseline.

</details>

---
*:robot: [Buoy](https://buoy.design) scans every PR for design drift. [Configure](https://app.buoy.design/settings)*
```

### Comment with Diff (on subsequent pushes)

```markdown
## :ring_buoy: Buoy Design Drift Report

**1 issue remaining** (1 fixed since last push)

| Status | File | Issue |
|--------|------|-------|
| :white_check_mark: Fixed | `src/Button.tsx:24` | Hardcoded color |
| :warning: Open | `src/Card.tsx:12` | Arbitrary Tailwind value |

---
*Last updated: 2 minutes ago*
```

---

## Pricing Integration

| Tier | How Scanning Works | Value Prop |
|------|-------------------|------------|
| **Free** | GitHub Action (user's compute, user configures YAML) | Try it, see it works |
| **Pro** ($299/mo) | GitHub App (our compute, one-click install) | + Dashboard, trends, Figma, team features |
| **Enterprise** | GitHub App + priority queue | + SLA, SSO, dedicated support |

### Enforcement

```typescript
async function processJob(job: ScanJobMessage) {
  const account = await getAccount(job.project.accountId);

  if (account.plan === 'free') {
    // Free tier shouldn't hit this path (they use GitHub Action)
    // But if somehow they do, post a gentle upgrade nudge once
    return { skipped: 'free_tier' };
  }

  if (account.paymentStatus === 'suspended') {
    return { skipped: 'account_suspended' };
  }

  // Pro/Enterprise: proceed with scan
  // ...
}
```

---

## Implementation Checklist

### Phase 1: Queue Infrastructure

- [ ] Uncomment queue bindings in `wrangler.toml`
- [ ] Create queue: `wrangler queues create buoy-scan`
- [ ] Create DLQ: `wrangler queues create buoy-scan-dlq`
- [ ] Add queue consumer export to worker

### Phase 2: Core Scanning

- [ ] Create `apps/api/src/lib/crypto.ts` (encrypt/decrypt)
- [ ] Set ENCRYPTION_KEY secret
- [ ] Update token storage to encrypt/decrypt
- [ ] Create `apps/api/src/lib/github-files.ts` (fetch PR files)
- [ ] Create `apps/api/src/lib/scanner.ts` (run scanners via /tmp)
- [ ] Create `apps/api/src/lib/pr-comment.ts` (format comment)
- [ ] Create `apps/api/src/queue.ts` (queue consumer)

### Phase 3: Baseline System

- [ ] Add `project_baselines` table to D1 schema
- [ ] Add `scan_claims` table to D1 schema
- [ ] Handle `installation.created` webhook → queue baseline scan
- [ ] Handle push to default branch → update baseline
- [ ] Filter PR signals against baseline

### Phase 4: Polish

- [ ] Rate limit tracking and degradation
- [ ] Comment diff display on subsequent pushes
- [ ] Dead letter queue monitoring
- [ ] Basic alerting (queue depth, errors)

---

## Open Questions (Resolved)

1. **Durable Objects for locking?** No - D1 UNIQUE constraint is sufficient. Add stale-claim handling for crashed workers.

2. **Separate scan worker?** No - single worker with queue consumer. Cloudflare isolates invocations.

3. **Job status tracking in D1?** Minimal - just `scan_claims` for idempotency + comment ID. PR comment is the user-visible status.

---

## Appendix: File Structure

```
apps/api/
├── src/
│   ├── index.ts              # HTTP routes + queue consumer export
│   ├── queue.ts              # Queue consumer handler
│   ├── routes/
│   │   └── github.ts         # Webhook handler (enqueues jobs)
│   └── lib/
│       ├── crypto.ts         # AES-256-GCM encrypt/decrypt
│       ├── github-files.ts   # Fetch PR files from GitHub API
│       ├── github-comments.ts # Post/edit PR comments
│       ├── scanner.ts        # Run drift scanners via /tmp
│       ├── pr-comment.ts     # Format comment markdown
│       └── baseline.ts       # Baseline comparison logic
└── wrangler.toml             # Queue bindings
```
