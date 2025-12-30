// packages/agents/src/utils/claude.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promptSection, formatFilesForPrompt, truncateForTokens } from './claude.js';

describe('claude utilities', () => {
  describe('promptSection', () => {
    it('wraps content in XML-style tags', () => {
      const result = promptSection('context', 'some content here');
      expect(result).toBe(`<context>
some content here
</context>`);
    });
  });

  describe('formatFilesForPrompt', () => {
    it('formats files with headers and code blocks', () => {
      const files = [
        { path: 'src/Button.tsx', content: 'export const Button = () => {}' },
        { path: 'src/Input.tsx', content: 'export const Input = () => {}' },
      ];
      const result = formatFilesForPrompt(files);

      expect(result).toContain('## src/Button.tsx');
      expect(result).toContain('## src/Input.tsx');
      expect(result).toContain('```');
      expect(result).toContain('export const Button');
    });
  });

  describe('truncateForTokens', () => {
    it('returns content unchanged if within limit', () => {
      const content = 'short content';
      expect(truncateForTokens(content, 1000)).toBe(content);
    });

    it('truncates content exceeding limit', () => {
      const content = 'a'.repeat(10000);
      const result = truncateForTokens(content, 100); // 100 tokens = ~400 chars
      expect(result.length).toBeLessThan(content.length);
      expect(result).toContain('[... content truncated for token limits ...]');
    });
  });
});
