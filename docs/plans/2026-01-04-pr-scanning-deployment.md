# PR Scanning Integration - Deployment & Testing Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy and test the complete GitHub PR scanning integration

**Architecture:** Cloudflare Workers + D1 Database + Queue + GitHub App webhooks. When PRs are opened/updated, GitHub sends webhooks → API enqueues scan jobs → Queue consumer processes scans → Posts PR comments with drift signals.

**Tech Stack:** Hono, Cloudflare Workers, D1 (SQLite), Cloudflare Queues, GitHub GraphQL/REST APIs

---

## Current State

✅ **Implemented & Tested (144 tests passing):**
- Queue processor (`queue.ts`) - handles PR and baseline scans
- Scanner module - detects hardcoded colors, Tailwind arbitrary values, inline styles
- PR comment formatting - groups by author, shows diff from previous push
- GitHub API integration - files, comments, blame attribution
- Crypto utilities - encryption and signal hashing
- Webhook handlers - pull_request, push, installation events
- Database schema - `scan_claims` and `project_baselines` tables

🔲 **Remaining:**
- Database migrations (ensure tables exist)
- Secrets configuration
- Cloudflare Queue creation
- Local testing
- End-to-end testing
- Staging deployment
- Production deployment

---

## Task 1: Verify Database Schema

**Files:**
- Read: `apps/api/src/db/schema/platform.ts` (already has tables)
- Modify: `apps/api/drizzle/migrations/` (if migration needed)

**Step 1: Check if migration exists**

```bash
cd apps/api
ls -la drizzle/migrations/
```

Expected: Should see a migration file with `scan_claims` and `project_baselines` tables

**Step 2: If migration missing, generate it**

```bash
pnpm drizzle-kit generate:sqlite --schema=src/db/schema/platform.ts
```

Expected: Creates new migration file

**Step 3: Apply migrations to local D1**

```bash
wrangler d1 execute buoy_platform --local --file=drizzle/migrations/<latest>.sql
```

Expected: Tables created in local D1

**Step 4: Verify tables exist**

```bash
wrangler d1 execute buoy_platform --local --command="SELECT name FROM sqlite_master WHERE type='table'"
```

Expected: Should see `scan_claims` and `project_baselines` in output

**Step 5: Apply migrations to remote D1 (staging)**

```bash
wrangler d1 execute buoy_platform --remote --file=drizzle/migrations/<latest>.sql
```

**Step 6: Commit migration (if created)**

```bash
git add drizzle/migrations/
git commit -m "chore(api): add scan_claims and project_baselines migrations"
```

---

## Task 2: Create Cloudflare Queue

**Files:**
- Read: `apps/api/wrangler.toml:43-51` (queue config already exists)

**Step 1: Create the scan queue**

```bash
cd apps/api
wrangler queues create buoy-scan
```

Expected: Queue created successfully

**Step 2: Create dead letter queue**

```bash
wrangler queues create buoy-scan-dlq
```

Expected: DLQ created

**Step 3: Verify queues exist**

```bash
wrangler queues list
```

Expected: Shows `buoy-scan` and `buoy-scan-dlq`

**Step 4: Test queue locally**

```bash
wrangler dev
```

Expected: Worker starts with queue consumer attached

---

## Task 3: Configure Secrets

**Files:**
- Read: `apps/api/src/env.ts:24-34` (required secrets list)
- Create: `apps/api/.dev.vars` (local development)

**Step 1: Create .dev.vars for local development**

Create `apps/api/.dev.vars`:

```bash
# GitHub App
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Session encryption
SESSION_SECRET=your_random_32_char_string
ENCRYPTION_KEY=your_random_32_char_encryption_key
```

**Step 2: Set secrets for staging**

```bash
cd apps/api

# GitHub App secrets
echo "your_client_id" | wrangler secret put GITHUB_CLIENT_ID --env staging
echo "your_client_secret" | wrangler secret put GITHUB_CLIENT_SECRET --env staging
echo "your_webhook_secret" | wrangler secret put GITHUB_WEBHOOK_SECRET --env staging
echo "your_app_id" | wrangler secret put GITHUB_APP_ID --env staging
cat github_app_private_key.pem | wrangler secret put GITHUB_APP_PRIVATE_KEY --env staging

# Stripe secrets
echo "sk_test_xxx" | wrangler secret put STRIPE_SECRET_KEY --env staging
echo "whsec_xxx" | wrangler secret put STRIPE_WEBHOOK_SECRET --env staging

# Encryption secrets
echo "$(openssl rand -base64 32)" | wrangler secret put SESSION_SECRET --env staging
echo "$(openssl rand -base64 32)" | wrangler secret put ENCRYPTION_KEY --env staging
```

Expected: All secrets set successfully

**Step 3: Verify secrets**

```bash
wrangler secret list --env staging
```

Expected: Shows all 8 secrets

---

## Task 4: Local Integration Test

**Files:**
- Test: `apps/api/src/index.ts` (webhook endpoint)
- Test: `apps/api/src/queue.ts` (queue processor)

**Step 1: Start local worker**

```bash
cd apps/api
pnpm dev
```

Expected: Worker running on http://localhost:8787

**Step 2: Test webhook signature verification**

Create `test-webhook.js`:

```javascript
const crypto = require('crypto');
const fetch = require('node-fetch');

const payload = JSON.stringify({
  action: 'ping',
  hook_id: 12345
});

const secret = 'your_webhook_secret';
const signature = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

fetch('http://localhost:8787/webhooks/github', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-GitHub-Event': 'ping',
    'X-GitHub-Delivery': 'test-123',
    'X-Hub-Signature-256': signature,
  },
  body: payload,
}).then(res => res.json()).then(console.log);
```

Run:

```bash
node test-webhook.js
```

Expected: `{ message: 'pong', hook_id: 12345 }`

**Step 3: Test PR webhook (simulated)**

Create `test-pr-webhook.js`:

```javascript
const crypto = require('crypto');
const fetch = require('node-fetch');

const payload = JSON.stringify({
  action: 'opened',
  number: 1,
  pull_request: {
    id: 123,
    number: 1,
    title: 'Test PR',
    head: { ref: 'feature', sha: 'abc123' },
    base: { ref: 'main', sha: 'def456' },
    user: { login: 'testuser' }
  },
  repository: {
    id: 456,
    name: 'test-repo',
    full_name: 'testuser/test-repo',
    default_branch: 'main'
  },
  installation: { id: 12345678 }
});

const secret = process.env.GITHUB_WEBHOOK_SECRET;
const signature = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

fetch('http://localhost:8787/webhooks/github', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-GitHub-Event': 'pull_request',
    'X-GitHub-Delivery': 'test-pr-123',
    'X-Hub-Signature-256': signature,
  },
  body: payload,
}).then(res => res.json()).then(console.log);
```

Run:

```bash
GITHUB_WEBHOOK_SECRET=your_secret node test-pr-webhook.js
```

Expected: `{ received: true, event: 'pull_request', deliveryId: 'test-pr-123' }`

**Step 4: Verify job was enqueued**

Check worker logs for:

```
Enqueued PR scan for testuser/test-repo#1
```

**Step 5: Commit test scripts**

```bash
git add apps/api/test-webhook.js apps/api/test-pr-webhook.js
git commit -m "test(api): add local webhook test scripts"
```

---

## Task 5: Unit Test Queue Processor

**Files:**
- Create: `apps/api/test/queue.test.ts`

**Step 1: Write queue processor test**

Create `apps/api/test/queue.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleQueue, type ScanJobMessage } from '../src/queue.js';
import type { Env } from '../src/env.js';

describe('handleQueue', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('processes PR scan messages', async () => {
    const message: ScanJobMessage = {
      type: 'pr_scan',
      id: 'job_123',
      installationId: 12345,
      repository: {
        owner: 'testuser',
        repo: 'test-repo',
        fullName: 'testuser/test-repo',
        defaultBranch: 'main',
      },
      pullRequest: {
        number: 1,
        headSha: 'abc123',
        baseSha: 'def456',
        headRef: 'feature',
        baseRef: 'main',
      },
      project: {
        id: 'proj_123',
        accountId: 'acc_123',
      },
      enqueuedAt: new Date().toISOString(),
    };

    const batch = {
      messages: [
        {
          body: message,
          ack: vi.fn(),
          retry: vi.fn(),
        },
      ],
    };

    const env = {
      GITHUB_APP_ID: 'test',
      GITHUB_APP_PRIVATE_KEY: 'test-key',
      PLATFORM_DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            run: vi.fn(),
            first: vi.fn().mockResolvedValue({ plan: 'pro', payment_status: 'active' }),
          }),
        }),
      },
      SCAN_QUEUE: {
        send: vi.fn(),
      },
    } as unknown as Env;

    // Mock fetch for GitHub API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([
        ['X-RateLimit-Remaining', '5000'],
        ['X-RateLimit-Reset', '1735992000'],
      ]),
      json: async () => ({ files: [], token: 'test-token' }),
    }) as any;

    await handleQueue(batch as any, env);

    expect(batch.messages[0].ack).toHaveBeenCalled();
  });

  it('retries on failure', async () => {
    const message: ScanJobMessage = {
      type: 'pr_scan',
      id: 'job_123',
      installationId: 12345,
      repository: {
        owner: 'testuser',
        repo: 'test-repo',
        fullName: 'testuser/test-repo',
        defaultBranch: 'main',
      },
      pullRequest: {
        number: 1,
        headSha: 'abc123',
        baseSha: 'def456',
        headRef: 'feature',
        baseRef: 'main',
      },
      project: {
        id: 'proj_123',
        accountId: 'acc_123',
      },
      enqueuedAt: new Date().toISOString(),
    };

    const batch = {
      messages: [
        {
          body: message,
          ack: vi.fn(),
          retry: vi.fn(),
        },
      ],
    };

    const env = {
      PLATFORM_DB: {
        prepare: vi.fn().mockImplementation(() => {
          throw new Error('Database error');
        }),
      },
    } as unknown as Env;

    await handleQueue(batch as any, env);

    expect(batch.messages[0].retry).toHaveBeenCalled();
  });
});
```

**Step 2: Run queue tests**

```bash
npm test -- queue.test.ts
```

Expected: All tests pass

**Step 3: Commit queue tests**

```bash
git add apps/api/test/queue.test.ts
git commit -m "test(api): add queue processor tests"
```

---

## Task 6: End-to-End Testing with GitHub

**Prerequisites:**
- GitHub App must be installed on a test repository
- Test repository must have a project configured in Buoy
- Webhook URL must be publicly accessible (use ngrok for local testing)

**Step 1: Set up ngrok for local testing**

```bash
ngrok http 8787
```

Expected: Provides public URL like `https://abc123.ngrok.io`

**Step 2: Update GitHub App webhook URL**

1. Go to GitHub App settings
2. Set webhook URL to `https://abc123.ngrok.io/webhooks/github`
3. Save changes

**Step 3: Create test PR**

1. Create a test branch with hardcoded colors
2. Open a PR

**Step 4: Verify webhook received**

Check worker logs:

```
GitHub webhook received: pull_request (delivery-id-xxx)
Enqueued PR scan for owner/repo#123
Processing pr_scan job: job_xxx
Scanning PR owner/repo#123 at sha123
Scan complete: 5 signals, comment 456789
```

**Step 5: Verify PR comment posted**

1. Check PR on GitHub
2. Should see Buoy comment with drift report
3. Comment should show detected issues grouped by author

**Step 6: Update PR with fixes**

1. Fix some drift issues
2. Push to PR branch
3. Verify comment updates with "fixed since last push" section

**Step 7: Document test results**

Create `apps/api/docs/e2e-test-results.md`:

```markdown
# End-to-End Test Results

**Date:** 2026-01-04
**Environment:** Local (ngrok)
**Test Repository:** owner/test-repo

## Test 1: PR Opened Event
- ✅ Webhook received and validated
- ✅ Job enqueued
- ✅ Files fetched from GitHub
- ✅ Drift signals detected
- ✅ PR comment posted

## Test 2: PR Synchronized Event
- ✅ Webhook received
- ✅ Job claimed (idempotency)
- ✅ New scan performed
- ✅ Comment updated (not duplicated)
- ✅ "Fixed since last push" section shown

## Test 3: Baseline Scan
- ✅ Push to main branch detected
- ✅ Baseline scan enqueued
- ✅ Signatures stored in database
- ✅ Next PR only shows new drift
```

Commit:

```bash
git add apps/api/docs/e2e-test-results.md
git commit -m "docs(api): add e2e test results"
```

---

## Task 7: Deploy to Staging

**Files:**
- Modify: `apps/api/wrangler.toml:92-97` (staging config)

**Step 1: Verify staging configuration**

Check `wrangler.toml` has staging environment configured:

```toml
[env.staging]
name = "buoy-api-staging"

[env.staging.vars]
ENVIRONMENT = "staging"
CORS_ORIGIN = "https://staging.buoy.design"
```

**Step 2: Deploy to staging**

```bash
cd apps/api
pnpm build
wrangler deploy --env staging
```

Expected: Deployed successfully to Cloudflare Workers

**Step 3: Update GitHub App webhook URL**

Update webhook URL to staging: `https://staging-api.buoy.design/webhooks/github`

**Step 4: Test staging deployment**

1. Create test PR on staging-connected repository
2. Verify webhook received
3. Verify scan completes
4. Verify comment posted

**Step 5: Monitor staging logs**

```bash
wrangler tail --env staging
```

Expected: See scan processing logs

**Step 6: Commit deployment notes**

```bash
git commit -m "deploy(api): staging deployment complete"
```

---

## Task 8: Deploy to Production

**Files:**
- Modify: `apps/api/wrangler.toml:67-89` (production config)

**Step 1: Set production secrets**

```bash
cd apps/api

# GitHub App secrets (production app)
echo "prod_client_id" | wrangler secret put GITHUB_CLIENT_ID --env production
echo "prod_client_secret" | wrangler secret put GITHUB_CLIENT_SECRET --env production
echo "prod_webhook_secret" | wrangler secret put GITHUB_WEBHOOK_SECRET --env production
echo "prod_app_id" | wrangler secret put GITHUB_APP_ID --env production
cat github_app_prod_private_key.pem | wrangler secret put GITHUB_APP_PRIVATE_KEY --env production

# Stripe secrets (production)
echo "sk_live_xxx" | wrangler secret put STRIPE_SECRET_KEY --env production
echo "whsec_xxx" | wrangler secret put STRIPE_WEBHOOK_SECRET --env production

# Encryption secrets (production - IMPORTANT: save these!)
echo "$(openssl rand -base64 32)" | wrangler secret put SESSION_SECRET --env production
echo "$(openssl rand -base64 32)" | wrangler secret put ENCRYPTION_KEY --env production
```

**Step 2: Apply production database migrations**

```bash
wrangler d1 execute buoy_platform --remote --file=drizzle/migrations/<latest>.sql --env production
```

**Step 3: Deploy to production**

```bash
pnpm build
wrangler deploy --env production
```

Expected: Deployed to `api.buoy.design`

**Step 4: Update GitHub App webhook URL**

Update production app webhook URL: `https://api.buoy.design/webhooks/github`

**Step 5: Smoke test production**

1. Create test PR on production repository
2. Verify scan completes
3. Verify comment posted
4. Verify no errors in logs

**Step 6: Monitor production**

```bash
wrangler tail --env production
```

**Step 7: Final commit**

```bash
git tag v1.0.0-pr-scanning
git push origin v1.0.0-pr-scanning
git commit -m "deploy(api): production deployment complete

✅ PR scanning fully operational
✅ 144 tests passing
✅ End-to-end tested
✅ Deployed to production

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Success Criteria

All tasks complete when:

- ✅ Database tables exist (`scan_claims`, `project_baselines`)
- ✅ Cloudflare Queue created and configured
- ✅ All secrets configured (staging + production)
- ✅ Local integration tests pass
- ✅ Queue processor tests pass
- ✅ End-to-end GitHub webhook test successful
- ✅ Staging deployment complete and tested
- ✅ Production deployment complete and tested
- ✅ PR scanning operational on real repositories
- ✅ Comments update correctly (not duplicate)
- ✅ Baseline system working (new PRs only show new drift)

## Monitoring & Observability

After deployment, monitor:

1. **Queue metrics**: Check Cloudflare dashboard for queue depth, processing time
2. **Error logs**: Monitor `wrangler tail` for any exceptions
3. **GitHub API rate limits**: Ensure not hitting limits
4. **Database performance**: Check D1 query performance
5. **PR comment quality**: Ensure comments are helpful and accurate

## Rollback Plan

If issues occur in production:

1. Disable GitHub App webhook (prevents new jobs)
2. Clear queue: Investigate stuck jobs
3. Revert to previous deployment: `wrangler rollback --env production`
4. Fix issues in staging first
5. Redeploy once verified
