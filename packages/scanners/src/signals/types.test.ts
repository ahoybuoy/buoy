import { describe, it, expect } from 'vitest';
import {
  RawSignalSchema,
  type RawSignal,
} from './types.js';

describe('RawSignal schema', () => {
  it('validates a color-value signal', () => {
    const signal: RawSignal = {
      id: 'color-1',
      type: 'color-value',
      value: '#3B82F6',
      location: {
        path: 'src/Button.tsx',
        line: 42,
      },
      context: {
        fileType: 'tsx',
        framework: 'react',
        scope: 'inline',
        isTokenized: false,
      },
      metadata: {},
    };

    const result = RawSignalSchema.safeParse(signal);
    expect(result.success).toBe(true);
  });

  it('validates a token-definition signal', () => {
    const signal: RawSignal = {
      id: 'token-1',
      type: 'token-definition',
      value: '--primary: #3B82F6',
      location: {
        path: 'src/tokens.css',
        line: 5,
      },
      context: {
        fileType: 'css',
        framework: null,
        scope: 'global',
        isTokenized: true,
      },
      metadata: {
        tokenName: '--primary',
        tokenValue: '#3B82F6',
      },
    };

    const result = RawSignalSchema.safeParse(signal);
    expect(result.success).toBe(true);
  });

  it('validates a component-def signal', () => {
    const signal: RawSignal = {
      id: 'comp-1',
      type: 'component-def',
      value: 'Button',
      location: {
        path: 'src/Button.tsx',
        line: 10,
        column: 1,
      },
      context: {
        fileType: 'tsx',
        framework: 'react',
        scope: 'global',
        isTokenized: false,
      },
      metadata: {
        exportName: 'Button',
        hasProps: true,
      },
    };

    const result = RawSignalSchema.safeParse(signal);
    expect(result.success).toBe(true);
  });

  it('rejects invalid signal type', () => {
    const signal = {
      id: 'bad-1',
      type: 'invalid-type',
      value: 'test',
      location: { path: 'test.ts', line: 1 },
      context: {
        fileType: 'tsx',
        framework: null,
        scope: 'global',
        isTokenized: false,
      },
      metadata: {},
    };

    const result = RawSignalSchema.safeParse(signal);
    expect(result.success).toBe(false);
  });
});
