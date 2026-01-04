import { describe, it, expect } from 'vitest';
import { extractColorSignals } from './color.js';
import type { SignalContext } from '../types.js';

describe('extractColorSignals', () => {
  const defaultContext: SignalContext = {
    fileType: 'tsx',
    framework: 'react',
    scope: 'inline',
    isTokenized: false,
  };

  it('extracts hex colors', () => {
    const signals = extractColorSignals(
      '#3B82F6',
      'src/Button.tsx',
      42,
      'color',
      defaultContext,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('color-value');
    expect(signals[0].value).toBe('#3B82F6');
    expect(signals[0].metadata.format).toBe('hex');
  });

  it('extracts 3-digit hex colors', () => {
    const signals = extractColorSignals(
      '#fff',
      'src/Button.tsx',
      10,
      'backgroundColor',
      defaultContext,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].value).toBe('#fff');
    expect(signals[0].metadata.format).toBe('hex');
  });

  it('extracts rgb colors', () => {
    const signals = extractColorSignals(
      'rgb(59, 130, 246)',
      'src/Button.tsx',
      15,
      'color',
      defaultContext,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].value).toBe('rgb(59, 130, 246)');
    expect(signals[0].metadata.format).toBe('rgb');
  });

  it('extracts rgba colors', () => {
    const signals = extractColorSignals(
      'rgba(59, 130, 246, 0.5)',
      'src/Button.tsx',
      20,
      'backgroundColor',
      defaultContext,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.format).toBe('rgba');
    expect(signals[0].metadata.hasAlpha).toBe(true);
  });

  it('extracts hsl colors', () => {
    const signals = extractColorSignals(
      'hsl(217, 91%, 60%)',
      'src/Button.tsx',
      25,
      'color',
      defaultContext,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.format).toBe('hsl');
  });

  it('skips CSS variables', () => {
    const signals = extractColorSignals(
      'var(--primary)',
      'src/Button.tsx',
      30,
      'color',
      defaultContext,
    );

    expect(signals).toHaveLength(0);
  });

  it('skips token references', () => {
    const signals = extractColorSignals(
      'theme.colors.primary',
      'src/Button.tsx',
      35,
      'color',
      defaultContext,
    );

    expect(signals).toHaveLength(0);
  });

  it('skips inherit/transparent/currentColor', () => {
    expect(extractColorSignals('inherit', 'test.tsx', 1, 'color', defaultContext)).toHaveLength(0);
    expect(extractColorSignals('transparent', 'test.tsx', 1, 'color', defaultContext)).toHaveLength(0);
    expect(extractColorSignals('currentColor', 'test.tsx', 1, 'color', defaultContext)).toHaveLength(0);
  });

  it('includes property name in metadata', () => {
    const signals = extractColorSignals(
      '#fff',
      'src/Button.tsx',
      42,
      'backgroundColor',
      defaultContext,
    );

    expect(signals[0].metadata.property).toBe('backgroundColor');
  });
});
