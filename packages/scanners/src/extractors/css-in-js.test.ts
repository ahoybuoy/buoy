/**
 * Tests for CSS-in-JS Style Extractor
 * Covers styled-components, Emotion, vanilla-extract, Stitches, and Linaria patterns
 */

import { describe, it, expect } from 'vitest';
import { detectCssInJsLibrary, extractCssInJsStyles } from './css-in-js.js';

describe('detectCssInJsLibrary', () => {
  it('detects styled-components', () => {
    const content = `import styled from 'styled-components';`;
    expect(detectCssInJsLibrary(content)).toBe('styled-components');
  });

  it('detects styled-components with named imports', () => {
    const content = `import { css, keyframes } from 'styled-components';`;
    expect(detectCssInJsLibrary(content)).toBe('styled-components');
  });

  it('detects emotion styled', () => {
    const content = `import styled from '@emotion/styled';`;
    expect(detectCssInJsLibrary(content)).toBe('emotion');
  });

  it('detects emotion react', () => {
    const content = `import { css } from '@emotion/react';`;
    expect(detectCssInJsLibrary(content)).toBe('emotion');
  });

  it('detects vanilla-extract', () => {
    const content = `import { style, styleVariants } from '@vanilla-extract/css';`;
    expect(detectCssInJsLibrary(content)).toBe('vanilla-extract');
  });

  it('detects stitches', () => {
    const content = `import { styled, css } from '@stitches/react';`;
    expect(detectCssInJsLibrary(content)).toBe('stitches');
  });

  it('detects linaria', () => {
    const content = `import { styled } from '@linaria/react';`;
    expect(detectCssInJsLibrary(content)).toBe('linaria');
  });

  it('returns null for no CSS-in-JS', () => {
    const content = `import React from 'react';
import { Button } from './Button';`;
    expect(detectCssInJsLibrary(content)).toBeNull();
  });
});

describe('extractCssInJsStyles', () => {
  describe('template literals (styled-components, Emotion, Linaria)', () => {
    it('extracts styled.element with hardcoded values', () => {
      const content = `
        const Button = styled.button\`
          color: #ff0000;
          padding: 16px;
          background-color: rgb(255, 255, 255);
        \`;
      `;
      const result = extractCssInJsStyles(content);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.css).toContain('color: #ff0000');
      expect(result[0]!.css).toContain('padding: 16px');
      expect(result[0]!.css).toContain('background-color: rgb(255, 255, 255)');
    });

    it('extracts styled(Component) pattern', () => {
      const content = `
        const StyledCard = styled(Card)\`
          background: #f5f5f5;
          margin: 24px;
        \`;
      `;
      const result = extractCssInJsStyles(content);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.css).toContain('background: #f5f5f5');
      expect(result[0]!.css).toContain('margin: 24px');
    });

    it('extracts styled.element.attrs() pattern', () => {
      const content = `
        const Input = styled.input.attrs({ type: 'text' })\`
          border: 1px solid #ccc;
          padding: 8px;
        \`;
      `;
      const result = extractCssInJsStyles(content);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.css).toContain('border: 1px solid #ccc');
      expect(result[0]!.css).toContain('padding: 8px');
    });

    it('extracts css helper', () => {
      const content = `
        const baseStyles = css\`
          margin: 8px;
          font-size: 14px;
        \`;
      `;
      const result = extractCssInJsStyles(content);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.css).toContain('margin: 8px');
      expect(result[0]!.css).toContain('font-size: 14px');
    });

    it('extracts keyframes', () => {
      const content = `
        const fadeIn = keyframes\`
          from { opacity: 0; }
          to { opacity: 1; }
        \`;
      `;
      const result = extractCssInJsStyles(content);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.css).toContain('opacity: 0');
      expect(result[0]!.css).toContain('opacity: 1');
    });

    it('replaces interpolations with placeholder', () => {
      const content = `
        const Button = styled.button\`
          color: \${props => props.theme.colors.primary};
          padding: 16px;
          background: \${({ variant }) => variant === 'primary' ? '#007bff' : '#6c757d'};
        \`;
      `;
      const result = extractCssInJsStyles(content);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.css).toContain('(dynamic)');
      expect(result[0]!.css).toContain('padding: 16px');
    });

    it('handles nested interpolations', () => {
      const content = `
        const Box = styled.div\`
          margin: \${({ spacing }) => spacing.md || '16px'};
          padding: 8px;
        \`;
      `;
      const result = extractCssInJsStyles(content);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.css).toContain('(dynamic)');
      expect(result[0]!.css).toContain('padding: 8px');
    });
  });

  describe('object styles (vanilla-extract, Stitches, Emotion)', () => {
    it('extracts vanilla-extract style()', () => {
      const content = `
        export const container = style({
          padding: '24px',
          backgroundColor: '#ffffff',
          borderRadius: '8px',
        });
      `;
      const result = extractCssInJsStyles(content);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.css).toContain('padding: 24px');
      expect(result[0]!.css).toContain('background-color: #ffffff');
      expect(result[0]!.css).toContain('border-radius: 8px');
    });

    it('extracts vanilla-extract styleVariants()', () => {
      // styleVariants with flat structure
      const content = `
        export const sizes = styleVariants({
          small: { padding: '8px', fontSize: '12px' },
          large: { padding: '16px', fontSize: '18px' },
        });
      `;
      const result = extractCssInJsStyles(content);
      // styleVariants has nested objects which the simple parser captures at top level
      // The important thing is we detect hardcoded values exist
      expect(result.length).toBeGreaterThan(0);
    });

    it('extracts stitches styled()', () => {
      const content = `
        const Button = styled('button', {
          padding: '12px',
          color: '#333',
          fontSize: 14,
        });
      `;
      const result = extractCssInJsStyles(content);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.css).toContain('padding: 12px');
      expect(result[0]!.css).toContain('color: #333');
      expect(result[0]!.css).toContain('font-size: 14px');
    });

    it('extracts emotion css() object syntax', () => {
      const content = `
        const styles = css({
          margin: 8,
          color: '#666',
          lineHeight: 1.5,
        });
      `;
      const result = extractCssInJsStyles(content);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.css).toContain('margin: 8px');
      expect(result[0]!.css).toContain('color: #666');
      expect(result[0]!.css).toContain('line-height: 1.5');
    });

    it('handles unitless properties correctly', () => {
      const content = `
        const styles = style({
          opacity: 0.5,
          zIndex: 100,
          flex: 1,
          fontWeight: 600,
        });
      `;
      const result = extractCssInJsStyles(content);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.css).toContain('opacity: 0.5');
      expect(result[0]!.css).toContain('z-index: 100');
      expect(result[0]!.css).toContain('flex: 1');
      expect(result[0]!.css).toContain('font-weight: 600');
      // These should NOT have px added
      expect(result[0]!.css).not.toContain('opacity: 0.5px');
      expect(result[0]!.css).not.toContain('z-index: 100px');
    });
  });

  describe('line and column tracking', () => {
    it('reports correct line numbers for template literals', () => {
      const content = `line1
line2
const Button = styled.button\`color: red;\`;`;
      const result = extractCssInJsStyles(content);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.line).toBe(3);
    });

    it('reports correct line numbers for object styles', () => {
      const content = `line1
line2
line3
const box = style({ padding: '8px' });`;
      const result = extractCssInJsStyles(content);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.line).toBe(4);
    });

    it('sets context to css-in-js', () => {
      const content = `const Button = styled.button\`color: red;\`;`;
      const result = extractCssInJsStyles(content);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.context).toBe('css-in-js');
    });
  });

  describe('multiple patterns in one file', () => {
    it('extracts both template literals and object styles', () => {
      const content = `
        import styled from 'styled-components';
        import { style } from '@vanilla-extract/css';

        const Button = styled.button\`
          color: #ff0000;
        \`;

        export const container = style({
          padding: '24px',
        });
      `;
      const result = extractCssInJsStyles(content);
      expect(result.length).toBe(2);
      expect(result.some(r => r.css.includes('color: #ff0000'))).toBe(true);
      expect(result.some(r => r.css.includes('padding: 24px'))).toBe(true);
    });
  });
});
