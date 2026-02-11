import { describe, it, expect } from 'vitest';
import {
  extractFontSizeSignals,
  extractFontFamilySignals,
  extractFontWeightSignals,
  extractLineHeightSignals,
  extractLetterSpacingSignals,
} from './typography.js';
import type { SignalContext } from '../types.js';

describe('typography signal extractors', () => {
  const defaultContext: SignalContext = {
    fileType: 'tsx',
    framework: 'react',
    scope: 'inline',
    isTokenized: false,
  };

  describe('extractFontSizeSignals', () => {
    it('extracts px font sizes', () => {
      const signals = extractFontSizeSignals('16px', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('font-size');
      expect(signals[0].metadata.numericValue).toBe(16);
      expect(signals[0].metadata.unit).toBe('px');
    });

    it('extracts rem font sizes', () => {
      const signals = extractFontSizeSignals('1.25rem', 'test.tsx', 1, defaultContext);
      expect(signals[0].metadata.numericValue).toBe(1.25);
      expect(signals[0].metadata.unit).toBe('rem');
    });

    it('skips CSS variables', () => {
      const signals = extractFontSizeSignals('var(--font-size-lg)', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(0);
    });
  });

  describe('extractFontFamilySignals', () => {
    it('extracts font family', () => {
      const signals = extractFontFamilySignals('"Inter", sans-serif', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('font-family');
      expect(signals[0].metadata.families).toContain('Inter');
      expect(signals[0].metadata.fallback).toBe('sans-serif');
    });

    it('extracts single font', () => {
      const signals = extractFontFamilySignals('Arial', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].metadata.families).toContain('Arial');
    });

    it('skips inherit', () => {
      const signals = extractFontFamilySignals('inherit', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(0);
    });

    it('skips CSS variables', () => {
      const signals = extractFontFamilySignals('var(--font-sans)', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(0);
    });
  });

  describe('extractFontWeightSignals', () => {
    it('extracts numeric weight', () => {
      const signals = extractFontWeightSignals('600', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('font-weight');
      expect(signals[0].metadata.numericValue).toBe(600);
    });

    it('extracts named weight', () => {
      const signals = extractFontWeightSignals('bold', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].metadata.numericValue).toBe(700);
      expect(signals[0].metadata.namedValue).toBe('bold');
    });

    it('handles semibold/medium variants', () => {
      const semi = extractFontWeightSignals('semibold', 'test.tsx', 1, defaultContext);
      expect(semi[0].metadata.numericValue).toBe(600);

      const medium = extractFontWeightSignals('medium', 'test.tsx', 1, defaultContext);
      expect(medium[0].metadata.numericValue).toBe(500);
    });

    it('skips inherit', () => {
      const signals = extractFontWeightSignals('inherit', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(0);
    });
  });

  describe('extractLineHeightSignals', () => {
    it('extracts unitless line-height', () => {
      const signals = extractLineHeightSignals('1.5', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('line-height');
      expect(signals[0].metadata.numericValue).toBe(1.5);
      expect(signals[0].metadata.unitless).toBe(true);
    });

    it('extracts px line-height', () => {
      const signals = extractLineHeightSignals('24px', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].metadata.numericValue).toBe(24);
      expect(signals[0].metadata.unit).toBe('px');
      expect(signals[0].metadata.unitless).toBe(false);
    });

    it('extracts rem line-height', () => {
      const signals = extractLineHeightSignals('1.5rem', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].metadata.unit).toBe('rem');
    });

    it('extracts percentage line-height', () => {
      const signals = extractLineHeightSignals('150%', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].metadata.unit).toBe('%');
    });

    it('skips normal', () => {
      expect(extractLineHeightSignals('normal', 'test.tsx', 1, defaultContext)).toHaveLength(0);
    });

    it('skips inherit', () => {
      expect(extractLineHeightSignals('inherit', 'test.tsx', 1, defaultContext)).toHaveLength(0);
    });

    it('skips token references', () => {
      expect(extractLineHeightSignals('var(--line-height-base)', 'test.tsx', 1, defaultContext)).toHaveLength(0);
    });

    it('skips 0 and 1', () => {
      expect(extractLineHeightSignals('0', 'test.tsx', 1, defaultContext)).toHaveLength(0);
      expect(extractLineHeightSignals('1', 'test.tsx', 1, defaultContext)).toHaveLength(0);
    });
  });

  describe('extractLetterSpacingSignals', () => {
    it('extracts em letter-spacing', () => {
      const signals = extractLetterSpacingSignals('0.05em', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('letter-spacing');
      expect(signals[0].metadata.numericValue).toBe(0.05);
      expect(signals[0].metadata.unit).toBe('em');
    });

    it('extracts px letter-spacing', () => {
      const signals = extractLetterSpacingSignals('1px', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].metadata.unit).toBe('px');
    });

    it('extracts negative letter-spacing', () => {
      const signals = extractLetterSpacingSignals('-0.02em', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].metadata.numericValue).toBe(-0.02);
    });

    it('skips normal', () => {
      expect(extractLetterSpacingSignals('normal', 'test.tsx', 1, defaultContext)).toHaveLength(0);
    });

    it('skips token references', () => {
      expect(extractLetterSpacingSignals('var(--letter-spacing-tight)', 'test.tsx', 1, defaultContext)).toHaveLength(0);
    });
  });
});
