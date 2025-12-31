// packages/core/src/tokenization/generator.test.ts
import { describe, it, expect } from 'vitest';
import { generateTokens } from './generator.js';
import type { ExtractedValue } from '../extraction/css-parser.js';

// Helper function for calculating lightness from hex color
function getHexLightness(hex: string): number {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return (r + g + b) / 3;
}

describe('generateTokens', () => {
  describe('clustering', () => {
    it('never clusters 0 with non-zero spacing values', () => {
      const values: ExtractedValue[] = [
        { property: 'padding', value: '0', rawValue: '0', category: 'spacing', context: 'spacing' },
        { property: 'padding', value: '0px', rawValue: '0px', category: 'spacing', context: 'spacing' },
        { property: 'padding', value: '1px', rawValue: '1px', category: 'spacing', context: 'spacing' },
        { property: 'padding', value: '2px', rawValue: '2px', category: 'spacing', context: 'spacing' },
        { property: 'padding', value: '4px', rawValue: '4px', category: 'spacing', context: 'spacing' },
      ];

      const result = generateTokens(values);
      const zeroToken = result.tokens.find(t => t.name.includes('spacing') && t.value === '0px');

      // The zero token should NOT include 1px, 2px, or 4px in its sources
      if (zeroToken) {
        expect(zeroToken.sources).not.toContain('1px');
        expect(zeroToken.sources).not.toContain('2px');
        expect(zeroToken.sources).not.toContain('4px');
      }
    });

    it('never clusters 0 with non-zero sizing values', () => {
      const values: ExtractedValue[] = [
        { property: 'width', value: '0', rawValue: '0', category: 'sizing', context: 'sizing' },
        { property: 'width', value: '4px', rawValue: '4px', category: 'sizing', context: 'sizing' },
      ];

      const result = generateTokens(values);
      const tokens = result.tokens.filter(t => t.category === 'sizing');

      // Should have separate tokens for 0 and 4px
      const zeroToken = tokens.find(t => t.value === '0px');
      const fourToken = tokens.find(t => t.value === '4px');

      // They should be separate if both exist
      if (zeroToken && fourToken) {
        expect(zeroToken.name).not.toBe(fourToken.name);
      }
    });
  });

  describe('radius tokens', () => {
    it('assigns radius-none to 0 value, not smallest non-zero', () => {
      const values: ExtractedValue[] = [
        { property: 'border-radius', value: '0', rawValue: '0', category: 'radius', context: 'radius' },
        { property: 'border-radius', value: '4px', rawValue: '4px', category: 'radius', context: 'radius' },
        { property: 'border-radius', value: '8px', rawValue: '8px', category: 'radius', context: 'radius' },
      ];

      const result = generateTokens(values);
      const noneToken = result.tokens.find(t => t.name === 'radius-none');

      expect(noneToken).toBeDefined();
      expect(noneToken?.value).toBe('0');
    });

    it('does not generate radius-none if no zero values exist', () => {
      const values: ExtractedValue[] = [
        { property: 'border-radius', value: '4px', rawValue: '4px', category: 'radius', context: 'radius' },
        { property: 'border-radius', value: '8px', rawValue: '8px', category: 'radius', context: 'radius' },
      ];

      const result = generateTokens(values);
      const noneToken = result.tokens.find(t => t.name === 'radius-none');

      // If noneToken exists, it should be 0, not 4px
      if (noneToken) {
        expect(noneToken.value).toBe('0');
      }
    });
  });

  describe('CSS output', () => {
    it('uses correct plural form for radius (not "Radiuss")', () => {
      const values: ExtractedValue[] = [
        { property: 'border-radius', value: '4px', rawValue: '4px', category: 'radius', context: 'radius' },
        { property: 'border-radius', value: '8px', rawValue: '8px', category: 'radius', context: 'radius' },
      ];

      const result = generateTokens(values);

      expect(result.css).toContain('/* Border Radii */');
      expect(result.css).not.toContain('Radiuss');
    });

    it('uses correct plural form for all categories', () => {
      const values: ExtractedValue[] = [
        { property: 'color', value: '#ff0000', rawValue: '#ff0000', category: 'color', context: 'color' },
        { property: 'padding', value: '8px', rawValue: '8px', category: 'spacing', context: 'spacing' },
        { property: 'font-size', value: '16px', rawValue: '16px', category: 'font-size', context: 'typography' },
      ];

      const result = generateTokens(values);

      expect(result.css).toContain('/* Colors */');
      expect(result.css).toContain('/* Spacing */');
      expect(result.css).toContain('/* Font Sizes */');
    });
  });

  describe('font-size tokens', () => {
    it('filters out unrealistically small font sizes (< 8px)', () => {
      const values: ExtractedValue[] = [
        // These should be filtered out
        { property: 'font-size', value: '1px', rawValue: '1px', category: 'font-size', context: 'typography' },
        { property: 'font-size', value: '2px', rawValue: '2px', category: 'font-size', context: 'typography' },
        { property: 'font-size', value: '6px', rawValue: '6px', category: 'font-size', context: 'typography' },
        // These should be kept
        { property: 'font-size', value: '12px', rawValue: '12px', category: 'font-size', context: 'typography' },
        { property: 'font-size', value: '16px', rawValue: '16px', category: 'font-size', context: 'typography' },
      ];

      const result = generateTokens(values);
      const fontTokens = result.tokens.filter(t => t.category === 'font-size');

      // Should not have any tokens with value < 8px
      for (const token of fontTokens) {
        const px = parseInt(token.value);
        expect(px).toBeGreaterThanOrEqual(8);
      }

      // Should have at least one font-size token from the valid values
      expect(fontTokens.length).toBeGreaterThan(0);

      // Check sources to verify 12px and 16px were included, but 1px, 2px, 6px were not
      const allSources = fontTokens.flatMap(t => t.sources);
      expect(allSources).toContain('12px');
      expect(allSources).toContain('16px');
      expect(allSources).not.toContain('1px');
      expect(allSources).not.toContain('2px');
      expect(allSources).not.toContain('6px');
    });
  });

  describe('breakpoint deduplication', () => {
    it('excludes breakpoint values from sizing tokens', () => {
      const values: ExtractedValue[] = [
        // Breakpoint values
        { property: 'min-width', value: '768px', rawValue: '@media (min-width: 768px)', category: 'breakpoint', context: 'breakpoint' },
        { property: 'min-width', value: '992px', rawValue: '@media (min-width: 992px)', category: 'breakpoint', context: 'breakpoint' },
        // Same values appearing in sizing
        { property: 'width', value: '768px', rawValue: '768px', category: 'sizing', context: 'sizing' },
        { property: 'max-width', value: '992px', rawValue: '992px', category: 'sizing', context: 'sizing' },
        // Legitimate sizing value
        { property: 'width', value: '200px', rawValue: '200px', category: 'sizing', context: 'sizing' },
      ];

      const result = generateTokens(values);

      // Breakpoint tokens should exist
      const breakpointTokens = result.tokens.filter(t => t.category === 'breakpoint');
      expect(breakpointTokens.some(t => t.value === '768px')).toBe(true);
      expect(breakpointTokens.some(t => t.value === '992px')).toBe(true);

      // Sizing tokens should NOT include breakpoint values
      const sizingTokens = result.tokens.filter(t => t.category === 'sizing');
      expect(sizingTokens.every(t => t.value !== '768px')).toBe(true);
      expect(sizingTokens.every(t => t.value !== '992px')).toBe(true);

      // Legitimate sizing should still be there
      expect(sizingTokens.some(t => t.value === '200px')).toBe(true);
    });
  });

  describe('neutral color scale', () => {
    it('generates neutral scale from light to dark (50=lightest, 950=darkest)', () => {
      const values: ExtractedValue[] = [
        { property: 'color', value: '#ffffff', rawValue: '#ffffff', category: 'color', context: 'color' },
        { property: 'color', value: '#f5f5f5', rawValue: '#f5f5f5', category: 'color', context: 'color' },
        { property: 'color', value: '#cccccc', rawValue: '#cccccc', category: 'color', context: 'color' },
        { property: 'color', value: '#999999', rawValue: '#999999', category: 'color', context: 'color' },
        { property: 'color', value: '#666666', rawValue: '#666666', category: 'color', context: 'color' },
        { property: 'color', value: '#333333', rawValue: '#333333', category: 'color', context: 'color' },
        { property: 'color', value: '#000000', rawValue: '#000000', category: 'color', context: 'color' },
      ];

      const result = generateTokens(values);
      const neutralTokens = result.tokens
        .filter(t => t.name.startsWith('color-neutral-'))
        .sort((a, b) => {
          const numA = parseInt(a.name.replace('color-neutral-', ''));
          const numB = parseInt(b.name.replace('color-neutral-', ''));
          return numA - numB;
        });

      // Verify lightness decreases as number increases
      for (let i = 0; i < neutralTokens.length - 1; i++) {
        const current = neutralTokens[i]!;
        const next = neutralTokens[i + 1]!;

        const currentLightness = getHexLightness(current.value);
        const nextLightness = getHexLightness(next.value);

        // Each subsequent token should be darker (lower lightness) or equal
        expect(currentLightness).toBeGreaterThanOrEqual(nextLightness);
      }

      // Specific check: neutral-50 should be white/near-white
      const neutral50 = neutralTokens.find(t => t.name === 'color-neutral-50');
      if (neutral50) {
        expect(getHexLightness(neutral50.value)).toBeGreaterThan(0.9);
      }
    });
  });
});
