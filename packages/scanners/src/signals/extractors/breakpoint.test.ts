import { describe, it, expect } from 'vitest';
import { extractBreakpointSignals } from './breakpoint.js';

describe('extractBreakpointSignals', () => {
  it('extracts @media min-width', () => {
    const content = `.container {\n  padding: 16px;\n}\n@media (min-width: 768px) {\n  .container { padding: 32px; }\n}`;
    const signals = extractBreakpointSignals(content, 'styles.css');
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('breakpoint');
    expect(signals[0].value).toBe('768px');
    expect(signals[0].metadata.query).toBe('min-width');
    expect(signals[0].location.line).toBe(4);
  });

  it('extracts @media max-width', () => {
    const content = '@media (max-width: 640px) { .hide { display: none; } }';
    const signals = extractBreakpointSignals(content, 'responsive.css');
    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.query).toBe('max-width');
  });

  it('extracts multiple breakpoints', () => {
    const content = `@media (min-width: 640px) { .sm { display: block; } }\n@media (min-width: 768px) { .md { display: block; } }\n@media (min-width: 1024px) { .lg { display: block; } }`;
    const signals = extractBreakpointSignals(content, 'grid.css');
    expect(signals).toHaveLength(3);
  });

  it('extracts rem breakpoints', () => {
    const content = '@media (min-width: 48rem) { .md { display: block; } }';
    const signals = extractBreakpointSignals(content, 'layout.css');
    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.unit).toBe('rem');
  });

  it('skips token-based breakpoints', () => {
    const content = '@media (min-width: var(--breakpoint-md)) { .md {} }';
    const signals = extractBreakpointSignals(content, 'layout.css');
    expect(signals).toHaveLength(0);
  });
});
