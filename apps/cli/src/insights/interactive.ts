import { select } from '@inquirer/prompts';
import type { ProjectInsights } from './project-insights.js';

/**
 * Check if we're in an interactive TTY session.
 */
export function isTTY(): boolean {
  return process.stdout.isTTY === true && process.stdin.isTTY === true;
}

/**
 * Present interactive choices based on insights.
 * Returns the selected command to run, or null if skipped.
 */
export async function promptNextAction(insights: ProjectInsights): Promise<string | null> {
  if (!isTTY()) {
    return null;
  }

  const choices = insights.suggestions.slice(0, 4).map(s => ({
    name: `${s.command} - ${s.description}`,
    value: s.command,
  }));

  choices.push({
    name: 'Skip for now',
    value: '',
  });

  try {
    const answer = await select({
      message: 'Would you like to try one of these?',
      choices,
    });
    return answer || null;
  } catch {
    // User cancelled (Ctrl+C)
    return null;
  }
}
