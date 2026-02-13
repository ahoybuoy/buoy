// packages/agents/src/acceptance.ts
// Predicts likelihood of PR acceptance

import Anthropic from '@anthropic-ai/sdk';
import type {
  AcceptanceInput,
  AcceptanceResult,
  AcceptanceLikelihood,
  AgentResult,
  ContributionProcess,
} from './types.js';

const MODEL = 'claude-sonnet-4-20250514';

export class AcceptanceAgent {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Predict likelihood of PR acceptance for a repo
   */
  async predict(input: AcceptanceInput): Promise<AgentResult<AcceptanceResult>> {
    try {
      const prompt = this.buildPrompt(input);
      const hasContributingMd = Boolean(input.contributingMd);

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      const responseText = textContent?.type === 'text' ? textContent.text : '';

      const parsed = this.parseResponse(responseText, hasContributingMd);

      return {
        success: true,
        data: parsed,
        confidence: parsed.score / 100,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        confidence: 0,
      };
    }
  }

  /**
   * Build the prediction prompt
   */
  private buildPrompt(input: AcceptanceInput): string {
    const prStats = this.calculatePRStats(input.recentPRs);

    return `You are predicting whether a design system consistency PR will be accepted.

## Repository
${input.repo.owner}/${input.repo.name}
${input.repo.description ? `Description: ${input.repo.description}` : ''}

## Maintainer Activity
- Commits last month: ${input.maintainerActivity.commitsLastMonth}
- PRs reviewed last month: ${input.maintainerActivity.prsReviewedLastMonth}
- Avg review time: ${input.maintainerActivity.avgReviewTimeHours} hours

## PR Statistics
- Total PRs analyzed: ${input.recentPRs.length}
- Merge rate: ${prStats.mergeRate}%
- Avg days open: ${prStats.avgDaysOpen}
- External contributor merge rate: ${prStats.externalMergeRate}%

${input.contributingMd ? `## CONTRIBUTING.md\n${input.contributingMd.slice(0, 2000)}` : '## No CONTRIBUTING.md found'}

${input.issueLabels?.length ? `## Issue Labels Used\n${input.issueLabels.join(', ')}` : ''}

## Your Task

Predict likelihood of accepting a PR that:
- Fixes design system drift (hardcoded colors → tokens)
- Is a small, focused change (1-5 files)
- Has clear explanation of why the change matters
- Comes from an external contributor

**IMPORTANT**: Also extract the contribution process preference from CONTRIBUTING.md.
Look for phrases like:
- "open an issue first" / "please file an issue"
- "submit a PR directly" / "PRs welcome"
- "for small fixes, PRs are fine"
- "discuss in an issue before implementing"
- "RFC required for major changes"

Respond with JSON:
{
  "likelihood": "high" | "medium" | "low",
  "score": 0-100,
  "reasoning": "2-3 sentences explaining your prediction",
  "suggestedApproach": "How to frame the PR for best reception",
  "redFlags": ["List of concerns"],
  "greenFlags": ["List of positive signals"],
  "contributionProcess": {
    "issueRequired": true | false | "features-only" | "major-only",
    "directPRsAllowed": "all" | "small-fixes" | "none",
    "discussionFirst": true | false,
    "preferredFlow": "issue-then-pr" | "pr-directly" | "discussion-first" | "depends-on-scope",
    "evidence": "Direct quote from CONTRIBUTING.md (or 'No CONTRIBUTING.md found')",
    "confidence": 0-100
  }
}`;
  }

  /**
   * Calculate PR statistics
   */
  private calculatePRStats(prs: AcceptanceInput['recentPRs']): {
    mergeRate: number;
    avgDaysOpen: number;
    externalMergeRate: number;
  } {
    if (prs.length === 0) {
      return { mergeRate: 0, avgDaysOpen: 0, externalMergeRate: 0 };
    }

    const merged = prs.filter((pr) => pr.merged);
    const mergeRate = Math.round((merged.length / prs.length) * 100);
    const avgDaysOpen = Math.round(
      prs.reduce((sum, pr) => sum + pr.daysOpen, 0) / prs.length
    );

    // Assume external if author is not in first 3 commits (rough heuristic)
    // In real implementation, you'd check against maintainer list
    const externalPRs = prs.filter((pr) => pr.reviewComments > 0);
    const externalMerged = externalPRs.filter((pr) => pr.merged);
    const externalMergeRate =
      externalPRs.length > 0
        ? Math.round((externalMerged.length / externalPRs.length) * 100)
        : mergeRate;

    return { mergeRate, avgDaysOpen, externalMergeRate };
  }

  /**
   * Parse Claude's response
   */
  private parseResponse(response: string, hasContributingMd: boolean): AcceptanceResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const result: AcceptanceResult = {
          likelihood: this.validateLikelihood(parsed.likelihood),
          score: Math.min(100, Math.max(0, Number(parsed.score) || 50)),
          reasoning: String(parsed.reasoning ?? ''),
          suggestedApproach: String(parsed.suggestedApproach ?? ''),
          redFlags: Array.isArray(parsed.redFlags)
            ? parsed.redFlags.map(String)
            : [],
          greenFlags: Array.isArray(parsed.greenFlags)
            ? parsed.greenFlags.map(String)
            : [],
        };

        // Parse contribution process if present
        if (parsed.contributionProcess) {
          result.contributionProcess = this.parseContributionProcess(
            parsed.contributionProcess,
            hasContributingMd
          );
        }

        return result;
      }
    } catch {
      // Fall through
    }

    return {
      likelihood: 'medium',
      score: 50,
      reasoning: 'Unable to analyze - defaulting to medium likelihood',
      suggestedApproach: 'Follow standard contribution guidelines',
      redFlags: [],
      greenFlags: [],
    };
  }

  /**
   * Parse and validate contribution process from response
   */
  private parseContributionProcess(
    raw: unknown,
    hasContributingMd: boolean
  ): ContributionProcess {
    const obj = raw as Record<string, unknown>;

    // Validate issueRequired
    let issueRequired: ContributionProcess['issueRequired'] = false;
    if (obj.issueRequired === true || obj.issueRequired === false) {
      issueRequired = obj.issueRequired;
    } else if (obj.issueRequired === 'features-only' || obj.issueRequired === 'major-only') {
      issueRequired = obj.issueRequired;
    }

    // Validate directPRsAllowed
    let directPRsAllowed: ContributionProcess['directPRsAllowed'] = 'all';
    if (obj.directPRsAllowed === 'all' || obj.directPRsAllowed === 'small-fixes' || obj.directPRsAllowed === 'none') {
      directPRsAllowed = obj.directPRsAllowed;
    }

    // Validate preferredFlow
    let preferredFlow: ContributionProcess['preferredFlow'] = 'depends-on-scope';
    const validFlows = ['issue-then-pr', 'pr-directly', 'discussion-first', 'depends-on-scope'];
    if (validFlows.includes(obj.preferredFlow as string)) {
      preferredFlow = obj.preferredFlow as ContributionProcess['preferredFlow'];
    }

    return {
      issueRequired,
      directPRsAllowed,
      discussionFirst: Boolean(obj.discussionFirst),
      preferredFlow,
      evidence: hasContributingMd
        ? String(obj.evidence ?? 'Could not extract specific guidance')
        : 'No CONTRIBUTING.md found',
      confidence: Math.min(100, Math.max(0, Number(obj.confidence) || (hasContributingMd ? 70 : 30))),
    };
  }

  /**
   * Validate likelihood value
   */
  private validateLikelihood(value: unknown): AcceptanceLikelihood {
    const valid: AcceptanceLikelihood[] = ['high', 'medium', 'low'];
    return valid.includes(value as AcceptanceLikelihood)
      ? (value as AcceptanceLikelihood)
      : 'medium';
  }
}
