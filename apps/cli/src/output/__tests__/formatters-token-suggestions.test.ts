import { describe, it, expect } from 'vitest';
import { formatDriftTree } from '../formatters.js';
import type { DriftSignal } from '@buoy-design/core';

function makeDrift(overrides: Partial<DriftSignal> & { location?: string } = {}): DriftSignal {
  const { location = 'src/Button.tsx:15', ...rest } = overrides;
  return {
    id: `test-${Math.random().toString(36).slice(2)}`,
    type: 'hardcoded-value',
    severity: 'warning',
    message: 'Hardcoded color #3b82f6 found',
    source: {
      entityType: 'component',
      entityId: 'comp-Button',
      entityName: 'Button',
      location,
    },
    details: {},
    detectedAt: new Date(),
    ...rest,
  };
}

describe('formatDriftTree token suggestions', () => {
  it('should show actual token name when tokenSuggestions exists', () => {
    const drifts: DriftSignal[] = [
      makeDrift({
        details: {
          tokenSuggestions: ['#3b82f6 → --color-primary (92% match)'],
        },
      }),
    ];

    const output = formatDriftTree(drifts);
    expect(output).toContain('--color-primary');
    expect(output).toContain('92%');
    expect(output).not.toContain('use var(--color-*)');
  });

  it('should fall back to generic text when no tokenSuggestions', () => {
    const drifts: DriftSignal[] = [
      makeDrift({ details: {} }),
    ];

    const output = formatDriftTree(drifts);
    expect(output).toContain('use var(--color-*)');
  });
});

describe('formatDriftTree prioritization', () => {
  it('should show file with most issues first within a category', () => {
    const drifts = [
      makeDrift({ location: 'src/Card.tsx:5', message: 'Hardcoded color #aaa found' }),
      makeDrift({ location: 'src/Button.tsx:10', message: 'Hardcoded color #aaa found' }),
      makeDrift({ location: 'src/Button.tsx:20', message: 'Hardcoded color #aaa found' }),
      makeDrift({ location: 'src/Button.tsx:30', message: 'Hardcoded color #aaa found' }),
    ];
    const output = formatDriftTree(drifts);
    const buttonIdx = output.indexOf('Button.tsx');
    const cardIdx = output.indexOf('Card.tsx');
    expect(buttonIdx).toBeLessThan(cardIdx);
  });
});
