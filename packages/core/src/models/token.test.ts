// packages/core/src/models/token.test.ts
import { describe, it, expect } from 'vitest';
import {
  createTokenId,
  normalizeTokenName,
  tokensMatch,
  type TokenSource,
  type ColorValue,
  type SpacingValue,
  type TypographyValue,
  type ShadowValue,
  type BorderValue,
  type RawValue,
} from './token.js';

describe('token model helpers', () => {
  describe('createTokenId', () => {
    it('creates id for CSS token', () => {
      const source: TokenSource = { type: 'css', path: 'variables.css' };
      const id = createTokenId(source, '--primary-color');
      expect(id).toBe('css:variables.css:--primary-color');
    });

    it('creates id for JSON token', () => {
      const source: TokenSource = { type: 'json', path: 'tokens.json', key: 'colors' };
      const id = createTokenId(source, 'primary');
      expect(id).toBe('json:tokens.json:primary');
    });

    it('creates id for SCSS token', () => {
      const source: TokenSource = { type: 'scss', path: '_variables.scss', variableName: '$primary' };
      const id = createTokenId(source, '$primary');
      expect(id).toBe('scss:_variables.scss:$primary');
    });

    it('creates id for Figma token with variableId', () => {
      const source: TokenSource = { type: 'figma', fileKey: 'abc123', variableId: 'var-456' };
      const id = createTokenId(source, 'Primary/500');
      expect(id).toBe('figma:abc123:var-456');
    });

    it('creates id for Figma token without variableId (uses name)', () => {
      const source: TokenSource = { type: 'figma', fileKey: 'abc123' };
      const id = createTokenId(source, 'Primary/500');
      expect(id).toBe('figma:abc123:Primary/500');
    });
  });

  describe('normalizeTokenName', () => {
    it('lowercases names', () => {
      expect(normalizeTokenName('PrimaryColor')).toBe('primarycolor');
    });

    it('removes hyphens', () => {
      expect(normalizeTokenName('--primary-color')).toBe('primarycolor');
    });

    it('removes underscores', () => {
      expect(normalizeTokenName('primary_color')).toBe('primarycolor');
    });

    it('removes spaces', () => {
      expect(normalizeTokenName('primary color')).toBe('primarycolor');
    });

    it('removes dots', () => {
      expect(normalizeTokenName('color.primary.500')).toBe('colorprimary500');
    });

    it('normalizes complex names consistently', () => {
      // These should all normalize to the same value
      expect(normalizeTokenName('--spacing-lg')).toBe('spacinglg');
      expect(normalizeTokenName('spacing_lg')).toBe('spacinglg');
      expect(normalizeTokenName('spacing.lg')).toBe('spacinglg');
      expect(normalizeTokenName('SPACING-LG')).toBe('spacinglg');
    });
  });

  describe('tokensMatch', () => {
    describe('color tokens', () => {
      it('matches identical colors', () => {
        const a: ColorValue = { type: 'color', hex: '#ffffff' };
        const b: ColorValue = { type: 'color', hex: '#ffffff' };
        expect(tokensMatch(a, b)).toBe(true);
      });

      it('matches equivalent hex colors (case insensitive)', () => {
        const a: ColorValue = { type: 'color', hex: '#FFFFFF' };
        const b: ColorValue = { type: 'color', hex: '#ffffff' };
        expect(tokensMatch(a, b)).toBe(true);
      });

      it('detects different colors', () => {
        const a: ColorValue = { type: 'color', hex: '#ffffff' };
        const b: ColorValue = { type: 'color', hex: '#000000' };
        expect(tokensMatch(a, b)).toBe(false);
      });
    });

    describe('spacing tokens', () => {
      it('matches identical spacing', () => {
        const a: SpacingValue = { type: 'spacing', value: 16, unit: 'px' };
        const b: SpacingValue = { type: 'spacing', value: 16, unit: 'px' };
        expect(tokensMatch(a, b)).toBe(true);
      });

      it('detects different spacing values', () => {
        const a: SpacingValue = { type: 'spacing', value: 16, unit: 'px' };
        const b: SpacingValue = { type: 'spacing', value: 24, unit: 'px' };
        expect(tokensMatch(a, b)).toBe(false);
      });

      it('detects different spacing units', () => {
        const a: SpacingValue = { type: 'spacing', value: 16, unit: 'px' };
        const b: SpacingValue = { type: 'spacing', value: 16, unit: 'rem' };
        expect(tokensMatch(a, b)).toBe(false);
      });
    });

    describe('typography tokens', () => {
      it('matches identical typography', () => {
        const a: TypographyValue = { type: 'typography', fontFamily: 'Inter', fontSize: 16, fontWeight: 400 };
        const b: TypographyValue = { type: 'typography', fontFamily: 'Inter', fontSize: 16, fontWeight: 400 };
        expect(tokensMatch(a, b)).toBe(true);
      });

      it('detects different font family', () => {
        const a: TypographyValue = { type: 'typography', fontFamily: 'Inter', fontSize: 16, fontWeight: 400 };
        const b: TypographyValue = { type: 'typography', fontFamily: 'Roboto', fontSize: 16, fontWeight: 400 };
        expect(tokensMatch(a, b)).toBe(false);
      });

      it('detects different font size', () => {
        const a: TypographyValue = { type: 'typography', fontFamily: 'Inter', fontSize: 16, fontWeight: 400 };
        const b: TypographyValue = { type: 'typography', fontFamily: 'Inter', fontSize: 18, fontWeight: 400 };
        expect(tokensMatch(a, b)).toBe(false);
      });

      it('detects different font weight', () => {
        const a: TypographyValue = { type: 'typography', fontFamily: 'Inter', fontSize: 16, fontWeight: 400 };
        const b: TypographyValue = { type: 'typography', fontFamily: 'Inter', fontSize: 16, fontWeight: 700 };
        expect(tokensMatch(a, b)).toBe(false);
      });
    });

    describe('shadow tokens', () => {
      it('matches identical shadows', () => {
        const a: ShadowValue = { type: 'shadow', x: 0, y: 4, blur: 8, spread: 0, color: '#000000' };
        const b: ShadowValue = { type: 'shadow', x: 0, y: 4, blur: 8, spread: 0, color: '#000000' };
        expect(tokensMatch(a, b)).toBe(true);
      });

      it('matches shadows with case-insensitive colors', () => {
        const a: ShadowValue = { type: 'shadow', x: 0, y: 4, blur: 8, spread: 0, color: '#AABBCC' };
        const b: ShadowValue = { type: 'shadow', x: 0, y: 4, blur: 8, spread: 0, color: '#aabbcc' };
        expect(tokensMatch(a, b)).toBe(true);
      });

      it('detects different shadow properties', () => {
        const a: ShadowValue = { type: 'shadow', x: 0, y: 4, blur: 8, spread: 0, color: '#000000' };
        const b: ShadowValue = { type: 'shadow', x: 0, y: 8, blur: 8, spread: 0, color: '#000000' };
        expect(tokensMatch(a, b)).toBe(false);
      });
    });

    describe('border tokens', () => {
      it('matches identical borders', () => {
        const a: BorderValue = { type: 'border', width: 1, style: 'solid', color: '#000000' };
        const b: BorderValue = { type: 'border', width: 1, style: 'solid', color: '#000000' };
        expect(tokensMatch(a, b)).toBe(true);
      });

      it('matches borders with case-insensitive colors', () => {
        const a: BorderValue = { type: 'border', width: 1, style: 'solid', color: '#AABBCC' };
        const b: BorderValue = { type: 'border', width: 1, style: 'solid', color: '#aabbcc' };
        expect(tokensMatch(a, b)).toBe(true);
      });

      it('detects different border style', () => {
        const a: BorderValue = { type: 'border', width: 1, style: 'solid', color: '#000000' };
        const b: BorderValue = { type: 'border', width: 1, style: 'dashed', color: '#000000' };
        expect(tokensMatch(a, b)).toBe(false);
      });
    });

    describe('raw tokens', () => {
      it('matches identical raw values', () => {
        const a: RawValue = { type: 'raw', value: '10px 20px' };
        const b: RawValue = { type: 'raw', value: '10px 20px' };
        expect(tokensMatch(a, b)).toBe(true);
      });

      it('detects different raw values', () => {
        const a: RawValue = { type: 'raw', value: '10px 20px' };
        const b: RawValue = { type: 'raw', value: '10px 30px' };
        expect(tokensMatch(a, b)).toBe(false);
      });
    });

    describe('cross-type matching', () => {
      it('returns false for different token types', () => {
        const color: ColorValue = { type: 'color', hex: '#ffffff' };
        const spacing: SpacingValue = { type: 'spacing', value: 16, unit: 'px' };
        expect(tokensMatch(color, spacing)).toBe(false);
      });
    });
  });
});
