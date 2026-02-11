import { describe, it, expect } from 'vitest';
import {
  extractDurationSignals,
  extractEasingSignals,
  extractTransitionShorthandSignals,
} from './motion.js';
import type { SignalContext } from '../types.js';

describe('extractDurationSignals', () => {
  const ctx: SignalContext = {
    fileType: 'tsx',
    framework: 'react',
    scope: 'inline',
    isTokenized: false,
  };

  it('extracts seconds duration', () => {
    const signals = extractDurationSignals('0.3s', 'Button.tsx', 10, 'transitionDuration', ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('motion-duration');
    expect(signals[0].value).toBe('0.3s');
    expect(signals[0].metadata.milliseconds).toBe(300);
    expect(signals[0].metadata.unit).toBe('s');
  });

  it('extracts milliseconds duration', () => {
    const signals = extractDurationSignals('200ms', 'Button.tsx', 10, 'transitionDuration', ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.milliseconds).toBe(200);
    expect(signals[0].metadata.unit).toBe('ms');
  });

  it('skips 0s/0ms', () => {
    expect(extractDurationSignals('0s', 'A.tsx', 1, 'transitionDuration', ctx)).toHaveLength(0);
    expect(extractDurationSignals('0ms', 'A.tsx', 1, 'transitionDuration', ctx)).toHaveLength(0);
  });

  it('skips token references', () => {
    expect(extractDurationSignals('var(--duration-fast)', 'A.tsx', 1, 'transitionDuration', ctx)).toHaveLength(0);
  });

  it('skips special values', () => {
    expect(extractDurationSignals('inherit', 'A.tsx', 1, 'transitionDuration', ctx)).toHaveLength(0);
    expect(extractDurationSignals('none', 'A.tsx', 1, 'transitionDuration', ctx)).toHaveLength(0);
  });

  it('includes property in metadata', () => {
    const signals = extractDurationSignals('150ms', 'A.tsx', 1, 'animationDuration', ctx);
    expect(signals[0].metadata.property).toBe('animationDuration');
  });
});

describe('extractEasingSignals', () => {
  const ctx: SignalContext = {
    fileType: 'tsx',
    framework: 'react',
    scope: 'inline',
    isTokenized: false,
  };

  it('extracts named easing', () => {
    const signals = extractEasingSignals('ease-in-out', 'Button.tsx', 10, 'transitionTimingFunction', ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('motion-easing');
    expect(signals[0].value).toBe('ease-in-out');
    expect(signals[0].metadata.easingType).toBe('named');
  });

  it('extracts cubic-bezier', () => {
    const signals = extractEasingSignals('cubic-bezier(0.4, 0, 0.2, 1)', 'Button.tsx', 10, 'transitionTimingFunction', ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.easingType).toBe('cubic-bezier');
  });

  it('extracts steps', () => {
    const signals = extractEasingSignals('steps(4, end)', 'A.tsx', 1, 'animationTimingFunction', ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.easingType).toBe('steps');
  });

  it('extracts linear', () => {
    const signals = extractEasingSignals('linear', 'A.tsx', 1, 'transitionTimingFunction', ctx);
    expect(signals).toHaveLength(1);
  });

  it('skips token references', () => {
    expect(extractEasingSignals('var(--easing-default)', 'A.tsx', 1, 'transitionTimingFunction', ctx)).toHaveLength(0);
  });

  it('skips special values', () => {
    expect(extractEasingSignals('inherit', 'A.tsx', 1, 'transitionTimingFunction', ctx)).toHaveLength(0);
  });
});

describe('extractTransitionShorthandSignals', () => {
  const ctx: SignalContext = {
    fileType: 'tsx',
    framework: 'react',
    scope: 'inline',
    isTokenized: false,
  };

  it('extracts duration and easing from shorthand', () => {
    const signals = extractTransitionShorthandSignals('all 0.3s ease', 'Button.tsx', 10, ctx);
    expect(signals).toHaveLength(2);

    const duration = signals.find(s => s.type === 'motion-duration');
    const easing = signals.find(s => s.type === 'motion-easing');

    expect(duration).toBeDefined();
    expect(duration!.value).toBe('0.3s');
    expect(easing).toBeDefined();
    expect(easing!.value).toBe('ease');
  });

  it('extracts from multiple transitions', () => {
    const signals = extractTransitionShorthandSignals(
      'opacity 200ms ease-in, transform 300ms ease-out',
      'Button.tsx', 10, ctx,
    );
    const durations = signals.filter(s => s.type === 'motion-duration');
    const easings = signals.filter(s => s.type === 'motion-easing');
    expect(durations).toHaveLength(2);
    expect(easings).toHaveLength(2);
  });

  it('extracts cubic-bezier from shorthand', () => {
    const signals = extractTransitionShorthandSignals(
      'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      'Button.tsx', 10, ctx,
    );
    const easing = signals.find(s => s.type === 'motion-easing');
    expect(easing).toBeDefined();
    expect(easing!.metadata.easingType).toBe('cubic-bezier');
  });

  it('marks signals as fromShorthand', () => {
    const signals = extractTransitionShorthandSignals('all 0.3s ease', 'A.tsx', 1, ctx);
    signals.forEach(s => {
      expect(s.metadata.fromShorthand).toBe(true);
    });
  });

  it('skips token references', () => {
    expect(extractTransitionShorthandSignals('var(--transition-default)', 'A.tsx', 1, ctx)).toHaveLength(0);
  });

  it('skips none', () => {
    expect(extractTransitionShorthandSignals('none', 'A.tsx', 1, ctx)).toHaveLength(0);
  });
});
