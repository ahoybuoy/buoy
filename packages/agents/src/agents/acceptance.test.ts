// packages/agents/src/agents/acceptance.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcceptanceAgent } from './acceptance.js';
import type { AcceptanceContext } from '../types.js';

vi.mock('../utils/claude.js', async () => {
  const actual = await vi.importActual('../utils/claude.js');
  return {
    ...actual,
    ClaudeClient: vi.fn().mockImplementation(() => ({
      completeJSON: vi.fn().mockResolvedValue({
        data: {
          summary: 'High likelihood of acceptance based on similar merged PRs',
          prediction: {
            likelihood: 'high',
            score: 85,
            factors: [
              {
                factor: 'Active maintainer',
                impact: 'positive',
                weight: 0.4,
                evidence: 'Merged 15 PRs in last month',
              },
            ],
            suggestedApproach: {
              prTitle: 'fix: migrate Button to design tokens',
              prBody: '## Summary\nMigrates hardcoded colors to design tokens',
              commitMessage: 'fix(Button): use design tokens',
              labels: ['design-system'],
            },
            risks: [
              {
                risk: 'Change conflicts with ongoing refactor',
                mitigation: 'Check open PRs first',
              },
            ],
            timing: {
              bestTimeToSubmit: 'Weekday mornings',
              maintainerActivity: 'Most active Tue-Thu',
            },
          },
          similarAcceptedPRs: [
            {
              pr: {
                number: 305,
                title: 'fix: migrate Input to tokens',
                author: 'alice',
                state: 'merged',
                mergedAt: '2024-07-01T00:00:00Z',
                url: 'https://github.com/org/repo/pull/305',
                labels: ['design-system'],
              },
              similarity: 'Same type of token migration',
            },
          ],
          maintainerPreferences: [
            {
              preference: 'Small, focused PRs',
              evidence: 'Rejected large PRs asking to split',
            },
          ],
          findings: [],
        },
        tokensUsed: { input: 200, output: 400 },
      }),
    })),
  };
});

describe('AcceptanceAgent', () => {
  let agent: AcceptanceAgent;
  let context: AcceptanceContext;

  beforeEach(() => {
    agent = new AcceptanceAgent();
    context = {
      repo: {
        url: 'https://github.com/test/repo',
        name: 'repo',
        owner: 'test',
        defaultBranch: 'main',
        localPath: '/tmp/repo',
        stars: 500,
      },
      files: [
        {
          path: 'Button.tsx',
          content: 'export const Button = () => {}',
          lineCount: 1,
        },
      ],
      contributingGuide: '# Contributing\n\nPlease submit small PRs.',
    };
  });

  it('has correct metadata', () => {
    expect(agent.id).toBe('acceptance');
    expect(agent.name).toBe('Acceptance Prediction Agent');
  });

  it('executes and returns structured result', async () => {
    const result = await agent.execute(context);

    expect(result.agentId).toBe('acceptance');
    expect(result.prediction.likelihood).toBe('high');
    expect(result.prediction.score).toBe(85);
    expect(result.prediction.factors).toHaveLength(1);
    expect(result.prediction.suggestedApproach.prTitle).toContain('design tokens');
    expect(result.prediction.risks).toHaveLength(1);
    expect(result.similarAcceptedPRs).toHaveLength(1);
    expect(result.maintainerPreferences).toHaveLength(1);
  });
});
