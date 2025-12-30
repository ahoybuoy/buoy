// packages/agents/src/agents/acceptance.ts
import { BaseAgent, type BaseAgentOptions } from './base.js';
import {
  type AcceptanceContext,
  type AcceptanceResult,
  type AcceptancePrediction,
} from '../types.js';
import { promptSection, truncateForTokens } from '../utils/claude.js';

const SYSTEM_PROMPT = `You are an expert at understanding open source contribution patterns and predicting PR acceptance.

Your task is to analyze a repository's contribution culture to predict:
1. Whether a proposed change would be accepted
2. How to frame the PR for maximum acceptance
3. What risks might cause rejection
4. When and how to submit

You will receive:
- CONTRIBUTING.md and other contribution guidelines
- Recent merged and rejected PRs
- Information about maintainers and their preferences
- The proposed change

Respond with a JSON object (no markdown, just JSON) matching this structure:
{
  "summary": "1-2 sentence summary of acceptance likelihood",
  "prediction": {
    "likelihood": "high|medium|low|unlikely",
    "score": 75,
    "factors": [
      {
        "factor": "Active maintainer",
        "impact": "positive|negative|neutral",
        "weight": 0.3,
        "evidence": "Merged 12 PRs in last month"
      }
    ],
    "suggestedApproach": {
      "prTitle": "fix: migrate Button to design tokens",
      "prBody": "## Summary\\n...",
      "commitMessage": "fix(Button): use design tokens instead of hardcoded colors",
      "labels": ["design-system", "good-first-issue"]
    },
    "risks": [
      {
        "risk": "Maintainer prefers bundled changes",
        "mitigation": "Group with other token migrations"
      }
    ],
    "timing": {
      "bestTimeToSubmit": "Weekday mornings UTC",
      "maintainerActivity": "Most active Tue-Thu"
    }
  },
  "similarAcceptedPRs": [
    {
      "pr": {
        "number": 305,
        "title": "fix: migrate Input to tokens",
        "author": "contributor",
        "state": "merged",
        "mergedAt": "2024-07-01T00:00:00Z",
        "url": "..."
      },
      "similarity": "Same type of token migration change"
    }
  ],
  "maintainerPreferences": [
    {
      "preference": "Prefers small, focused PRs",
      "evidence": "Rejected PR #290 asking to split into smaller PRs"
    }
  ],
  "findings": [
    {
      "type": "contribution-pattern|maintainer-preference|risk",
      "severity": "info|warning|positive",
      "observation": "What you found",
      "recommendation": "How to use this insight",
      "evidence": ["PR numbers", "quotes"],
      "confidence": 0.85
    }
  ]
}`;

export class AcceptanceAgent extends BaseAgent<AcceptanceContext, AcceptanceResult> {
  readonly id = 'acceptance';
  readonly name = 'Acceptance Prediction Agent';
  readonly description =
    'Predicts PR acceptance likelihood and suggests optimal submission approach';

  constructor(options: BaseAgentOptions = {}) {
    super(options);
  }

  async execute(context: AcceptanceContext): Promise<AcceptanceResult> {
    const startTime = Date.now();
    const validation = this.validateContext(context);
    if (!validation.valid) {
      throw new Error(`Invalid context: ${validation.errors.join(', ')}`);
    }

    const userPrompt = this.buildPrompt(context);
    const response = await this.client.completeJSON<RawAcceptanceResponse>(
      SYSTEM_PROMPT,
      [{ role: 'user', content: userPrompt }]
    );

    const { data } = response;
    const findings = this.parseFindings(data.findings ?? []);

    const baseResult = this.buildResult(
      data.summary ?? 'Acceptance analysis complete',
      findings,
      JSON.stringify(data, null, 2),
      startTime,
      response.tokensUsed
    );

    return {
      ...baseResult,
      prediction: this.parsePrediction(data.prediction),
      similarAcceptedPRs: (data.similarAcceptedPRs ?? []).map((s) => ({
        pr: this.parsePR(s.pr),
        similarity: String(s.similarity ?? ''),
      })),
      maintainerPreferences: (data.maintainerPreferences ?? []).map((p) => ({
        preference: String(p.preference ?? ''),
        evidence: String(p.evidence ?? ''),
      })),
    };
  }

  private buildPrompt(context: AcceptanceContext): string {
    const sections: string[] = [];

    // Repository context
    sections.push(
      promptSection(
        'repository',
        `Name: ${context.repo.name}
Owner: ${context.repo.owner}
URL: ${context.repo.url}
Stars: ${context.repo.stars ?? 'Unknown'}`
      )
    );

    // Contributing guide
    if (context.contributingGuide) {
      sections.push(
        promptSection(
          'contributing_guide',
          truncateForTokens(context.contributingGuide, 2000)
        )
      );
    }

    // PR template
    if (context.prTemplate) {
      sections.push(
        promptSection('pr_template', truncateForTokens(context.prTemplate, 500))
      );
    }

    // Recent merged PRs
    if (context.recentMergedPRs && context.recentMergedPRs.length > 0) {
      const prsText = context.recentMergedPRs
        .slice(0, 10)
        .map(
          (pr) =>
            `#${pr.number} | ${pr.author} | ${pr.title}
  Merged: ${pr.mergedAt?.toISOString().split('T')[0] ?? 'N/A'}
  Labels: ${pr.labels.join(', ') || 'none'}`
        )
        .join('\n\n');
      sections.push(promptSection('recent_merged_prs', prsText));
    }

    // Recent rejected PRs
    if (context.recentRejectedPRs && context.recentRejectedPRs.length > 0) {
      const prsText = context.recentRejectedPRs
        .slice(0, 5)
        .map(
          (pr) =>
            `#${pr.number} | ${pr.author} | ${pr.title}
  Labels: ${pr.labels.join(', ') || 'none'}
  Comments: ${pr.commentsCount ?? 'Unknown'}`
        )
        .join('\n\n');
      sections.push(promptSection('recent_rejected_prs', prsText));
    }

    // Maintainers
    if (context.maintainers && context.maintainers.length > 0) {
      sections.push(
        promptSection('maintainers', context.maintainers.join(', '))
      );
    }

    // Proposed change (from drift signals or files)
    if (context.signals && context.signals.length > 0) {
      const changesText = context.signals
        .map(
          (s) =>
            `- ${s.type}: ${s.message}
  Location: ${s.source.location}
  Severity: ${s.severity}`
        )
        .join('\n\n');
      sections.push(promptSection('proposed_changes', changesText));
    }

    // Files being modified
    const filesText = context.files
      .map((f) => `- ${f.path} (${f.lineCount} lines)`)
      .join('\n');
    sections.push(promptSection('files_to_modify', filesText));

    // Question
    if (context.question) {
      sections.push(promptSection('question', context.question));
    } else {
      sections.push(
        promptSection(
          'question',
          'Analyze this repository\'s contribution patterns and predict whether the proposed changes would be accepted as a PR. Provide specific recommendations for submission.'
        )
      );
    }

    return sections.join('\n\n');
  }

  private parsePrediction(prediction: unknown): AcceptancePrediction {
    const defaults: AcceptancePrediction = {
      likelihood: 'medium',
      score: 50,
      factors: [],
      suggestedApproach: {
        prTitle: '',
        prBody: '',
        commitMessage: '',
        labels: [],
      },
      risks: [],
      timing: {
        maintainerActivity: 'Unknown',
      },
    };

    if (typeof prediction !== 'object' || prediction === null) {
      return defaults;
    }

    const p = prediction as Record<string, unknown>;

    return {
      likelihood: this.parseLikelihood(p['likelihood']),
      score: typeof p['score'] === 'number' ? p['score'] : 50,
      factors: Array.isArray(p['factors'])
        ? p['factors']
            .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
            .map((f) => ({
              factor: String(f['factor'] ?? ''),
              impact: this.parseImpact(f['impact']),
              weight: typeof f['weight'] === 'number' ? f['weight'] : 0.5,
              evidence: String(f['evidence'] ?? ''),
            }))
        : [],
      suggestedApproach: this.parseSuggestedApproach(p['suggestedApproach']),
      risks: Array.isArray(p['risks'])
        ? p['risks']
            .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
            .map((r) => ({
              risk: String(r['risk'] ?? ''),
              mitigation: String(r['mitigation'] ?? ''),
            }))
        : [],
      timing: {
        bestTimeToSubmit:
          typeof (p['timing'] as Record<string, unknown>)?.['bestTimeToSubmit'] === 'string'
            ? String((p['timing'] as Record<string, unknown>)['bestTimeToSubmit'])
            : undefined,
        maintainerActivity: String(
          (p['timing'] as Record<string, unknown>)?.['maintainerActivity'] ?? 'Unknown'
        ),
      },
    };
  }

  private parseLikelihood(value: unknown): AcceptancePrediction['likelihood'] {
    if (value === 'high' || value === 'medium' || value === 'low' || value === 'unlikely') {
      return value;
    }
    return 'medium';
  }

  private parseImpact(value: unknown): 'positive' | 'negative' | 'neutral' {
    if (value === 'positive' || value === 'negative' || value === 'neutral') {
      return value;
    }
    return 'neutral';
  }

  private parseSuggestedApproach(approach: unknown): AcceptancePrediction['suggestedApproach'] {
    const defaults = { prTitle: '', prBody: '', commitMessage: '', labels: [] };

    if (typeof approach !== 'object' || approach === null) {
      return defaults;
    }

    const a = approach as Record<string, unknown>;
    return {
      prTitle: String(a['prTitle'] ?? ''),
      prBody: String(a['prBody'] ?? ''),
      commitMessage: String(a['commitMessage'] ?? ''),
      labels: Array.isArray(a['labels']) ? a['labels'].map(String) : [],
    };
  }

  private parsePR(pr: unknown): AcceptanceResult['similarAcceptedPRs'][0]['pr'] {
    if (typeof pr !== 'object' || pr === null) {
      return {
        number: 0,
        title: '',
        author: '',
        state: 'closed',
        createdAt: new Date(),
        url: '',
        labels: [],
      };
    }

    const p = pr as Record<string, unknown>;
    return {
      number: typeof p['number'] === 'number' ? p['number'] : 0,
      title: String(p['title'] ?? ''),
      author: String(p['author'] ?? ''),
      state: this.parsePRState(p['state']),
      createdAt: new Date(String(p['createdAt'] ?? '')),
      mergedAt: p['mergedAt'] ? new Date(String(p['mergedAt'])) : undefined,
      url: String(p['url'] ?? ''),
      body: p['body'] ? String(p['body']) : undefined,
      labels: Array.isArray(p['labels']) ? p['labels'].map(String) : [],
    };
  }

  private parsePRState(value: unknown): 'open' | 'closed' | 'merged' {
    if (value === 'open' || value === 'closed' || value === 'merged') {
      return value;
    }
    return 'closed';
  }
}

interface RawAcceptanceResponse {
  summary?: string;
  prediction?: unknown;
  similarAcceptedPRs?: Array<{
    pr?: unknown;
    similarity?: string;
  }>;
  maintainerPreferences?: Array<{
    preference?: string;
    evidence?: string;
  }>;
  findings?: unknown[];
}
