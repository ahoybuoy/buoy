// packages/agents/src/utils/claude.ts
import Anthropic from '@anthropic-ai/sdk';
import type { AgentConfig } from '../types.js';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  content: string;
  tokensUsed: {
    input: number;
    output: number;
  };
  stopReason: string;
}

export class ClaudeClient {
  private client: Anthropic;
  private config: AgentConfig;

  constructor(config: Partial<AgentConfig> = {}) {
    const apiKey = config.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new Error(
        'Anthropic API key required. Set ANTHROPIC_API_KEY env var or pass apiKey in config.'
      );
    }

    this.client = new Anthropic({ apiKey });
    this.config = {
      model: config.model ?? 'claude-sonnet-4-20250514',
      maxTokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.3,
    };
  }

  async complete(
    systemPrompt: string,
    messages: ClaudeMessage[],
    options: Partial<AgentConfig> = {}
  ): Promise<ClaudeResponse> {
    const response = await this.client.messages.create({
      model: options.model ?? this.config.model,
      max_tokens: options.maxTokens ?? this.config.maxTokens,
      temperature: options.temperature ?? this.config.temperature,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const textContent = response.content.find((c) => c.type === 'text');
    const content = textContent?.type === 'text' ? textContent.text : '';

    return {
      content,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      stopReason: response.stop_reason ?? 'unknown',
    };
  }

  /**
   * Complete with structured JSON output
   */
  async completeJSON<T>(
    systemPrompt: string,
    messages: ClaudeMessage[],
    options: Partial<AgentConfig> = {}
  ): Promise<{ data: T; tokensUsed: ClaudeResponse['tokensUsed'] }> {
    const jsonSystemPrompt = `${systemPrompt}

IMPORTANT: Your response must be valid JSON only. No markdown code blocks, no explanation text before or after. Just the JSON object.`;

    const response = await this.complete(jsonSystemPrompt, messages, options);

    // Try to extract JSON from response
    let jsonStr = response.content.trim();

    // Handle markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match?.[1]) {
        jsonStr = match[1];
      }
    }

    try {
      const data = JSON.parse(jsonStr) as T;
      return { data, tokensUsed: response.tokensUsed };
    } catch {
      throw new Error(`Failed to parse Claude response as JSON: ${jsonStr.slice(0, 200)}...`);
    }
  }
}

/**
 * Create a prompt section with clear boundaries
 */
export function promptSection(name: string, content: string): string {
  return `<${name}>
${content}
</${name}>`;
}

/**
 * Format file contents for prompt
 */
export function formatFilesForPrompt(
  files: Array<{ path: string; content: string }>
): string {
  return files
    .map(
      (f) => `## ${f.path}

\`\`\`
${f.content}
\`\`\``
    )
    .join('\n\n');
}

/**
 * Truncate content to fit token limits (rough estimate: 4 chars per token)
 */
export function truncateForTokens(content: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (content.length <= maxChars) {
    return content;
  }
  return content.slice(0, maxChars) + '\n\n[... content truncated for token limits ...]';
}
