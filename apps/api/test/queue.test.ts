/**
 * Tests for Queue Consumer Handler
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { handleQueue, type ScanJobMessage } from '../src/queue.js';
import type { Env } from '../src/env.js';
import type { MessageBatch } from '@cloudflare/workers-types';

// Mock all external modules
vi.mock('../src/lib/github-files.js', () => ({
  getChangedFiles: vi.fn(),
  getFileContent: vi.fn(),
  filterScannableFiles: vi.fn(),
  checkRateLimit: vi.fn(),
  RateLimitError: class RateLimitError extends Error {
    resetAt: Date;
    constructor(resetAt: Date) {
      super(`Rate limited until ${resetAt.toISOString()}`);
      this.resetAt = resetAt;
    }
  },
}));

vi.mock('../src/lib/scanner.js', () => ({
  scanFileContent: vi.fn(),
  getSignalSignature: vi.fn(),
  filterAgainstBaseline: vi.fn(),
}));

vi.mock('../src/lib/pr-comment.js', () => ({
  formatCommentWithMarker: vi.fn(),
}));

vi.mock('../src/lib/github-comments.js', () => ({
  postOrUpdateComment: vi.fn(),
}));

vi.mock('../src/lib/github-blame.js', () => ({
  enrichSignalsWithAuthors: vi.fn(),
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test-nanoid-123'),
}));

describe('handleQueue', () => {
  let mockEnv: Env;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Spy on console
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock environment
    mockEnv = {
      GITHUB_APP_ID: 'test-app-id',
      GITHUB_APP_PRIVATE_KEY: `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890
-----END RSA PRIVATE KEY-----`,
      PLATFORM_DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({ success: true }),
            first: vi.fn().mockResolvedValue(null),
            all: vi.fn().mockResolvedValue({ results: [] }),
          }),
        }),
      } as any,
      SCAN_QUEUE: {
        send: vi.fn().mockResolvedValue(undefined),
      } as any,
    } as Env;

    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => {
          if (key === 'X-RateLimit-Remaining') return '5000';
          if (key === 'X-RateLimit-Reset') return '1735992000';
          return null;
        },
      },
      json: async () => ({ token: 'test-token' }),
      text: async () => 'OK',
    }) as any;

    // Mock Web Crypto API for JWT generation
    vi.stubGlobal('crypto', {
      subtle: {
        importKey: vi.fn().mockResolvedValue({}),
        sign: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
        digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      },
      getRandomValues: vi.fn((arr) => arr),
    });

    // Mock atob/btoa
    vi.stubGlobal('atob', vi.fn((str) => str));
    vi.stubGlobal('btoa', vi.fn((str) => str));
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('message routing', () => {
    it('routes pr_scan messages to processPRScan', async () => {
      const message: ScanJobMessage = {
        type: 'pr_scan',
        id: 'job_123',
        installationId: 12345,
        repository: {
          owner: 'test-owner',
          repo: 'test-repo',
          fullName: 'test-owner/test-repo',
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
        enqueuedAt: '2026-01-04T00:00:00Z',
      };

      const mockMessage = {
        body: message,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = {
        messages: [mockMessage],
      } as unknown as MessageBatch<ScanJobMessage>;

      // Mock account plan check
      (mockEnv.PLATFORM_DB.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn()
            .mockResolvedValueOnce({ plan: 'pro', payment_status: 'active' }) // Account check
            .mockResolvedValueOnce(null), // Claim check
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      });

      // Mock modules
      const { checkRateLimit, getChangedFiles, filterScannableFiles, getFileContent } = await import('../src/lib/github-files.js');
      const { scanFileContent, filterAgainstBaseline, getSignalSignature } = await import('../src/lib/scanner.js');
      const { formatCommentWithMarker } = await import('../src/lib/pr-comment.js');
      const { postOrUpdateComment } = await import('../src/lib/github-comments.js');
      const { enrichSignalsWithAuthors } = await import('../src/lib/github-blame.js');

      (checkRateLimit as any).mockResolvedValue({ remaining: 5000, resetAt: new Date() });
      (getChangedFiles as any).mockResolvedValue({
        files: [{ sha: 'file123', filename: 'Button.tsx', status: 'modified', additions: 10, deletions: 5, changes: 15 }],
        rateLimit: { remaining: 5000, resetAt: new Date() },
      });
      (filterScannableFiles as any).mockReturnValue([{ sha: 'file123', filename: 'Button.tsx' }]);
      (getFileContent as any).mockResolvedValue({ content: 'const color = "#fff"', rateLimit: { remaining: 5000, resetAt: new Date() } });
      (scanFileContent as any).mockReturnValue([]);
      (filterAgainstBaseline as any).mockResolvedValue([]);
      (enrichSignalsWithAuthors as any).mockResolvedValue([]);
      (formatCommentWithMarker as any).mockReturnValue('# Buoy Report');
      (postOrUpdateComment as any).mockResolvedValue({ commentId: 789, rateLimit: { remaining: 5000, resetAt: new Date() } });

      await handleQueue(batch, mockEnv);

      expect(mockMessage.ack).toHaveBeenCalled();
      expect(mockMessage.retry).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('Processing pr_scan job: job_123');
    });

    it('routes baseline_scan messages to processBaselineScan', async () => {
      const message: ScanJobMessage = {
        type: 'baseline_scan',
        id: 'job_456',
        installationId: 12345,
        repository: {
          owner: 'test-owner',
          repo: 'test-repo',
          fullName: 'test-owner/test-repo',
          defaultBranch: 'main',
        },
        project: {
          id: 'proj_123',
          accountId: 'acc_123',
        },
        enqueuedAt: '2026-01-04T00:00:00Z',
      };

      const mockMessage = {
        body: message,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = {
        messages: [mockMessage],
      } as unknown as MessageBatch<ScanJobMessage>;

      // Mock account plan check
      (mockEnv.PLATFORM_DB.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ plan: 'pro', payment_status: 'active' }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      });

      // Mock GitHub API responses
      (global.fetch as any).mockImplementation(async (url: string) => {
        if (url.includes('/git/trees/')) {
          return {
            ok: true,
            json: async () => ({
              tree: [
                { path: 'src/Button.tsx', sha: 'file123', type: 'blob', size: 1000 },
              ],
            }),
          };
        }
        if (url.includes('/git/refs/heads/')) {
          return {
            ok: true,
            json: async () => ({ object: { sha: 'baseline-sha-123' } }),
          };
        }
        return {
          ok: true,
          json: async () => ({ token: 'test-token' }),
        };
      });

      const { getFileContent } = await import('../src/lib/github-files.js');
      const { scanFileContent, getSignalSignature } = await import('../src/lib/scanner.js');

      (getFileContent as any).mockResolvedValue({ content: 'const color = "#fff"', rateLimit: { remaining: 5000, resetAt: new Date() } });
      (scanFileContent as any).mockReturnValue([]);
      (getSignalSignature as any).mockResolvedValue('sig123');

      await handleQueue(batch, mockEnv);

      expect(mockMessage.ack).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('Processing baseline_scan job: job_456');
    });

    it('retries on error', async () => {
      const message: ScanJobMessage = {
        type: 'pr_scan',
        id: 'job_error',
        installationId: 12345,
        repository: {
          owner: 'test-owner',
          repo: 'test-repo',
          fullName: 'test-owner/test-repo',
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
        enqueuedAt: '2026-01-04T00:00:00Z',
      };

      const mockMessage = {
        body: message,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = {
        messages: [mockMessage],
      } as unknown as MessageBatch<ScanJobMessage>;

      // Make DB throw error
      (mockEnv.PLATFORM_DB.prepare as any).mockImplementation(() => {
        throw new Error('Database error');
      });

      await handleQueue(batch, mockEnv);

      expect(mockMessage.retry).toHaveBeenCalled();
      expect(mockMessage.ack).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to process job:', expect.any(Error));
    });

    it('processes multiple messages in batch', async () => {
      const messages = [
        {
          body: {
            type: 'pr_scan' as const,
            id: 'job_1',
            installationId: 12345,
            repository: { owner: 'owner1', repo: 'repo1', fullName: 'owner1/repo1', defaultBranch: 'main' },
            pullRequest: { number: 1, headSha: 'abc', baseSha: 'def', headRef: 'feature', baseRef: 'main' },
            project: { id: 'proj_1', accountId: 'acc_1' },
            enqueuedAt: '2026-01-04T00:00:00Z',
          },
          ack: vi.fn(),
          retry: vi.fn(),
        },
        {
          body: {
            type: 'baseline_scan' as const,
            id: 'job_2',
            installationId: 12345,
            repository: { owner: 'owner2', repo: 'repo2', fullName: 'owner2/repo2', defaultBranch: 'main' },
            project: { id: 'proj_2', accountId: 'acc_2' },
            enqueuedAt: '2026-01-04T00:00:00Z',
          },
          ack: vi.fn(),
          retry: vi.fn(),
        },
      ];

      const batch = { messages } as unknown as MessageBatch<ScanJobMessage>;

      // Mock successful processing
      (mockEnv.PLATFORM_DB.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ plan: 'pro', payment_status: 'active' }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      });

      const { checkRateLimit, getChangedFiles, filterScannableFiles, getFileContent } = await import('../src/lib/github-files.js');
      const { scanFileContent, filterAgainstBaseline, getSignalSignature } = await import('../src/lib/scanner.js');
      const { formatCommentWithMarker } = await import('../src/lib/pr-comment.js');
      const { postOrUpdateComment } = await import('../src/lib/github-comments.js');
      const { enrichSignalsWithAuthors } = await import('../src/lib/github-blame.js');

      (checkRateLimit as any).mockResolvedValue({ remaining: 5000, resetAt: new Date() });
      (getChangedFiles as any).mockResolvedValue({ files: [], rateLimit: { remaining: 5000, resetAt: new Date() } });
      (filterScannableFiles as any).mockReturnValue([]);
      (getFileContent as any).mockResolvedValue({ content: '', rateLimit: { remaining: 5000, resetAt: new Date() } });
      (scanFileContent as any).mockReturnValue([]);
      (filterAgainstBaseline as any).mockResolvedValue([]);
      (enrichSignalsWithAuthors as any).mockResolvedValue([]);
      (formatCommentWithMarker as any).mockReturnValue('# Buoy Report');
      (postOrUpdateComment as any).mockResolvedValue({ commentId: 789, rateLimit: { remaining: 5000, resetAt: new Date() } });
      (getSignalSignature as any).mockResolvedValue('sig123');

      (global.fetch as any).mockImplementation(async (url: string) => {
        if (url.includes('/git/trees/')) {
          return { ok: true, json: async () => ({ tree: [] }) };
        }
        if (url.includes('/git/refs/heads/')) {
          return { ok: true, json: async () => ({ object: { sha: 'baseline-sha' } }) };
        }
        return { ok: true, json: async () => ({ token: 'test-token' }) };
      });

      await handleQueue(batch, mockEnv);

      expect(messages[0].ack).toHaveBeenCalled();
      expect(messages[1].ack).toHaveBeenCalled();
    });
  });

  describe('account plan checks', () => {
    it('skips scan for free tier accounts', async () => {
      const message: ScanJobMessage = {
        type: 'pr_scan',
        id: 'job_free',
        installationId: 12345,
        repository: {
          owner: 'test-owner',
          repo: 'test-repo',
          fullName: 'test-owner/test-repo',
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
          accountId: 'acc_free',
        },
        enqueuedAt: '2026-01-04T00:00:00Z',
      };

      const mockMessage = {
        body: message,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = { messages: [mockMessage] } as unknown as MessageBatch<ScanJobMessage>;

      // Mock free tier account
      (mockEnv.PLATFORM_DB.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ plan: 'free', payment_status: 'active' }),
        }),
      });

      await handleQueue(batch, mockEnv);

      expect(mockMessage.ack).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping scan'));
    });

    it('skips scan for suspended accounts', async () => {
      const message: ScanJobMessage = {
        type: 'pr_scan',
        id: 'job_suspended',
        installationId: 12345,
        repository: {
          owner: 'test-owner',
          repo: 'test-repo',
          fullName: 'test-owner/test-repo',
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
          accountId: 'acc_suspended',
        },
        enqueuedAt: '2026-01-04T00:00:00Z',
      };

      const mockMessage = {
        body: message,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = { messages: [mockMessage] } as unknown as MessageBatch<ScanJobMessage>;

      // Mock suspended account
      (mockEnv.PLATFORM_DB.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ plan: 'pro', payment_status: 'suspended' }),
        }),
      });

      await handleQueue(batch, mockEnv);

      expect(mockMessage.ack).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping scan'));
    });
  });

  describe('job claiming and idempotency', () => {
    it('claims new job successfully', async () => {
      const message: ScanJobMessage = {
        type: 'pr_scan',
        id: 'job_new',
        installationId: 12345,
        repository: {
          owner: 'test-owner',
          repo: 'test-repo',
          fullName: 'test-owner/test-repo',
          defaultBranch: 'main',
        },
        pullRequest: {
          number: 1,
          headSha: 'new-sha-123',
          baseSha: 'def456',
          headRef: 'feature',
          baseRef: 'main',
        },
        project: {
          id: 'proj_123',
          accountId: 'acc_123',
        },
        enqueuedAt: '2026-01-04T00:00:00Z',
      };

      const mockMessage = {
        body: message,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = { messages: [mockMessage] } as unknown as MessageBatch<ScanJobMessage>;

      let callCount = 0;
      (mockEnv.PLATFORM_DB.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(async () => {
            callCount++;
            // First call: account check (pro)
            if (callCount === 1) return { plan: 'pro', payment_status: 'active' };
            // Second call: existing comment check (none)
            if (callCount === 2) return null;
            // Third call: baseline check
            if (callCount === 3) return null;
            return null;
          }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      });

      const { checkRateLimit, getChangedFiles, filterScannableFiles } = await import('../src/lib/github-files.js');
      const { filterAgainstBaseline } = await import('../src/lib/scanner.js');
      const { formatCommentWithMarker } = await import('../src/lib/pr-comment.js');
      const { postOrUpdateComment } = await import('../src/lib/github-comments.js');
      const { enrichSignalsWithAuthors } = await import('../src/lib/github-blame.js');

      (checkRateLimit as any).mockResolvedValue({ remaining: 5000, resetAt: new Date() });
      (getChangedFiles as any).mockResolvedValue({ files: [], rateLimit: { remaining: 5000, resetAt: new Date() } });
      (filterScannableFiles as any).mockReturnValue([]);
      (filterAgainstBaseline as any).mockResolvedValue([]);
      (enrichSignalsWithAuthors as any).mockResolvedValue([]);
      (formatCommentWithMarker as any).mockReturnValue('# Buoy Report');
      (postOrUpdateComment as any).mockResolvedValue({ commentId: 789, rateLimit: { remaining: 5000, resetAt: new Date() } });

      await handleQueue(batch, mockEnv);

      expect(mockMessage.ack).toHaveBeenCalled();
    });

    it('skips already claimed job', async () => {
      const message: ScanJobMessage = {
        type: 'pr_scan',
        id: 'job_duplicate',
        installationId: 12345,
        repository: {
          owner: 'test-owner',
          repo: 'test-repo',
          fullName: 'test-owner/test-repo',
          defaultBranch: 'main',
        },
        pullRequest: {
          number: 1,
          headSha: 'duplicate-sha',
          baseSha: 'def456',
          headRef: 'feature',
          baseRef: 'main',
        },
        project: {
          id: 'proj_123',
          accountId: 'acc_123',
        },
        enqueuedAt: '2026-01-04T00:00:00Z',
      };

      const mockMessage = {
        body: message,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = { messages: [mockMessage] } as unknown as MessageBatch<ScanJobMessage>;

      // Mock account check, then throw unique constraint error
      let firstCall = true;
      (mockEnv.PLATFORM_DB.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ plan: 'pro', payment_status: 'active' }),
          run: vi.fn().mockImplementation(async () => {
            if (firstCall) {
              firstCall = false;
              const error = new Error('UNIQUE constraint failed');
              throw error;
            }
            return { success: true };
          }),
        }),
      });

      await handleQueue(batch, mockEnv);

      expect(mockMessage.ack).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Job already claimed'));
    });
  });

  describe('rate limiting', () => {
    it('defers scan when rate limit low', async () => {
      const message: ScanJobMessage = {
        type: 'pr_scan',
        id: 'job_rate_limit',
        installationId: 12345,
        repository: {
          owner: 'test-owner',
          repo: 'test-repo',
          fullName: 'test-owner/test-repo',
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
        enqueuedAt: '2026-01-04T00:00:00Z',
      };

      const mockMessage = {
        body: message,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = { messages: [mockMessage] } as unknown as MessageBatch<ScanJobMessage>;

      (mockEnv.PLATFORM_DB.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn()
            .mockResolvedValueOnce({ plan: 'pro', payment_status: 'active' })
            .mockResolvedValueOnce(null),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      });

      const { checkRateLimit } = await import('../src/lib/github-files.js');
      const { formatCommentWithMarker } = await import('../src/lib/pr-comment.js');
      const { postOrUpdateComment } = await import('../src/lib/github-comments.js');

      const resetAt = new Date(Date.now() + 3600000); // 1 hour from now
      (checkRateLimit as any).mockResolvedValue({ remaining: 50, resetAt });
      (formatCommentWithMarker as any).mockReturnValue('# Deferred');
      (postOrUpdateComment as any).mockResolvedValue({ commentId: 789, rateLimit: { remaining: 50, resetAt } });

      await handleQueue(batch, mockEnv);

      expect(mockEnv.SCAN_QUEUE.send).toHaveBeenCalledWith(
        message,
        expect.objectContaining({ delaySeconds: expect.any(Number) })
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Deferred scan'));
    });

    it('scans limited files when rate limit medium', async () => {
      const message: ScanJobMessage = {
        type: 'pr_scan',
        id: 'job_medium_limit',
        installationId: 12345,
        repository: {
          owner: 'test-owner',
          repo: 'test-repo',
          fullName: 'test-owner/test-repo',
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
        enqueuedAt: '2026-01-04T00:00:00Z',
      };

      const mockMessage = {
        body: message,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = { messages: [mockMessage] } as unknown as MessageBatch<ScanJobMessage>;

      (mockEnv.PLATFORM_DB.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn()
            .mockResolvedValueOnce({ plan: 'pro', payment_status: 'active' })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      });

      const { checkRateLimit, getChangedFiles, filterScannableFiles, getFileContent } = await import('../src/lib/github-files.js');
      const { scanFileContent, filterAgainstBaseline } = await import('../src/lib/scanner.js');
      const { formatCommentWithMarker } = await import('../src/lib/pr-comment.js');
      const { postOrUpdateComment } = await import('../src/lib/github-comments.js');
      const { enrichSignalsWithAuthors } = await import('../src/lib/github-blame.js');

      // Medium rate limit (300 remaining)
      (checkRateLimit as any).mockResolvedValue({ remaining: 300, resetAt: new Date() });

      // Return 50 files, but should only scan 20 due to rate limit
      const files = Array.from({ length: 50 }, (_, i) => ({
        sha: `file${i}`,
        filename: `File${i}.tsx`,
        status: 'modified' as const,
        additions: 10,
        deletions: 5,
        changes: 15,
      }));

      (getChangedFiles as any).mockResolvedValue({ files, rateLimit: { remaining: 300, resetAt: new Date() } });
      (filterScannableFiles as any).mockReturnValue(files);
      (getFileContent as any).mockResolvedValue({ content: '', rateLimit: { remaining: 300, resetAt: new Date() } });
      (scanFileContent as any).mockReturnValue([]);
      (filterAgainstBaseline as any).mockResolvedValue([]);
      (enrichSignalsWithAuthors as any).mockResolvedValue([]);
      (formatCommentWithMarker as any).mockReturnValue('# Buoy Report');
      (postOrUpdateComment as any).mockResolvedValue({ commentId: 789, rateLimit: { remaining: 300, resetAt: new Date() } });

      await handleQueue(batch, mockEnv);

      // Should have called getFileContent max 20 times (rate limit degradation)
      expect((getFileContent as any).mock.calls.length).toBeLessThanOrEqual(20);
      expect(mockMessage.ack).toHaveBeenCalled();
    });
  });

  describe('baseline management', () => {
    it('filters signals against baseline', async () => {
      const message: ScanJobMessage = {
        type: 'pr_scan',
        id: 'job_with_baseline',
        installationId: 12345,
        repository: {
          owner: 'test-owner',
          repo: 'test-repo',
          fullName: 'test-owner/test-repo',
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
        enqueuedAt: '2026-01-04T00:00:00Z',
      };

      const mockMessage = {
        body: message,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = { messages: [mockMessage] } as unknown as MessageBatch<ScanJobMessage>;

      const baselineSignatures = JSON.stringify(['sig1', 'sig2', 'sig3']);

      (mockEnv.PLATFORM_DB.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn()
            .mockResolvedValueOnce({ plan: 'pro', payment_status: 'active' })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ drift_signatures: baselineSignatures }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      });

      const { checkRateLimit, getChangedFiles, filterScannableFiles } = await import('../src/lib/github-files.js');
      const { filterAgainstBaseline } = await import('../src/lib/scanner.js');
      const { formatCommentWithMarker } = await import('../src/lib/pr-comment.js');
      const { postOrUpdateComment } = await import('../src/lib/github-comments.js');
      const { enrichSignalsWithAuthors } = await import('../src/lib/github-blame.js');

      (checkRateLimit as any).mockResolvedValue({ remaining: 5000, resetAt: new Date() });
      (getChangedFiles as any).mockResolvedValue({ files: [], rateLimit: { remaining: 5000, resetAt: new Date() } });
      (filterScannableFiles as any).mockReturnValue([]);
      (filterAgainstBaseline as any).mockResolvedValue([]);
      (enrichSignalsWithAuthors as any).mockResolvedValue([]);
      (formatCommentWithMarker as any).mockReturnValue('# Buoy Report');
      (postOrUpdateComment as any).mockResolvedValue({ commentId: 789, rateLimit: { remaining: 5000, resetAt: new Date() } });

      await handleQueue(batch, mockEnv);

      expect(filterAgainstBaseline).toHaveBeenCalledWith(
        expect.anything(),
        ['sig1', 'sig2', 'sig3']
      );
      expect(mockMessage.ack).toHaveBeenCalled();
    });

    it('creates baseline for new repository', async () => {
      const message: ScanJobMessage = {
        type: 'baseline_scan',
        id: 'job_baseline_new',
        installationId: 12345,
        repository: {
          owner: 'test-owner',
          repo: 'new-repo',
          fullName: 'test-owner/new-repo',
          defaultBranch: 'main',
        },
        project: {
          id: 'proj_new',
          accountId: 'acc_123',
        },
        enqueuedAt: '2026-01-04T00:00:00Z',
      };

      const mockMessage = {
        body: message,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = { messages: [mockMessage] } as unknown as MessageBatch<ScanJobMessage>;

      const mockRun = vi.fn().mockResolvedValue({ success: true });
      (mockEnv.PLATFORM_DB.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ plan: 'pro', payment_status: 'active' }),
          run: mockRun,
        }),
      });

      (global.fetch as any).mockImplementation(async (url: string) => {
        if (url.includes('/git/trees/')) {
          return {
            ok: true,
            json: async () => ({
              tree: [
                { path: 'src/Button.tsx', sha: 'file123', type: 'blob', size: 1000 },
              ],
            }),
          };
        }
        if (url.includes('/git/refs/heads/')) {
          return {
            ok: true,
            json: async () => ({ object: { sha: 'baseline-sha-456' } }),
          };
        }
        return {
          ok: true,
          json: async () => ({ token: 'test-token' }),
        };
      });

      const { getFileContent } = await import('../src/lib/github-files.js');
      const { scanFileContent, getSignalSignature } = await import('../src/lib/scanner.js');

      (getFileContent as any).mockResolvedValue({ content: 'const color = "#fff"', rateLimit: { remaining: 5000, resetAt: new Date() } });
      (scanFileContent as any).mockReturnValue([
        { type: 'hardcoded-color', file: 'src/Button.tsx', line: 1, value: '#fff', message: 'Color', severity: 'warning' },
      ]);
      (getSignalSignature as any).mockResolvedValue('baseline-sig-123');

      await handleQueue(batch, mockEnv);

      // Should insert baseline with signatures
      expect(mockRun).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Baseline created'));
      expect(mockMessage.ack).toHaveBeenCalled();
    });
  });
});
