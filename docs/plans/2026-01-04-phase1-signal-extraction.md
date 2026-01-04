# Phase 1: Signal Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a signal extraction layer that transforms raw scanner outputs into normalized `RawSignal` objects with full context.

**Architecture:** Signals are atomic facts extracted from source code. Each scanner emits signals during its scan. A SignalAggregator collects and deduplicates signals from all sources. This layer sits between existing scanners and the new pattern mining engine.

**Tech Stack:** TypeScript, Zod (for schema validation), existing scanner infrastructure

---

## Task 1: Create Signal Type Definitions

**Files:**
- Create: `packages/scanners/src/signals/types.ts`
- Create: `packages/scanners/src/signals/index.ts`

**Step 1: Write the failing test**

Create: `packages/scanners/src/signals/types.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  RawSignalSchema,
  SignalType,
  SignalContext,
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
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @buoy-design/scanners test src/signals/types.test.ts`
Expected: FAIL with "Cannot find module './types.js'"

**Step 3: Write minimal implementation**

Create: `packages/scanners/src/signals/types.ts`

```typescript
import { z } from 'zod';

/**
 * Signal types representing atomic facts extracted from code
 */
export const SignalTypeSchema = z.enum([
  // Value-level signals
  'color-value',
  'spacing-value',
  'font-size',
  'font-family',
  'font-weight',
  'radius-value',
  'shadow-value',
  'breakpoint',
  // Token signals
  'token-definition',
  'token-usage',
  // Component signals
  'component-def',
  'component-usage',
  // Pattern signals
  'prop-pattern',
  'class-pattern',
]);

export type SignalType = z.infer<typeof SignalTypeSchema>;

/**
 * Source location for a signal
 */
export const SourceLocationSchema = z.object({
  path: z.string(),
  line: z.number(),
  column: z.number().optional(),
  snippet: z.string().optional(),
});

export type SourceLocation = z.infer<typeof SourceLocationSchema>;

/**
 * File type enum for context
 */
export const FileTypeSchema = z.enum([
  'tsx',
  'jsx',
  'ts',
  'js',
  'vue',
  'svelte',
  'css',
  'scss',
  'less',
  'json',
  'config',
  'html',
  'template',
]);

export type FileType = z.infer<typeof FileTypeSchema>;

/**
 * Framework enum for context
 */
export const FrameworkSchema = z.enum([
  'react',
  'vue',
  'svelte',
  'angular',
  'tailwind',
  'vanilla',
]).nullable();

export type Framework = z.infer<typeof FrameworkSchema>;

/**
 * Scope enum for context
 */
export const ScopeSchema = z.enum([
  'global',
  'component',
  'inline',
]);

export type Scope = z.infer<typeof ScopeSchema>;

/**
 * Context for a signal - helps determine how to score it later
 */
export const SignalContextSchema = z.object({
  fileType: FileTypeSchema,
  framework: FrameworkSchema,
  scope: ScopeSchema,
  isTokenized: z.boolean(),
});

export type SignalContext = z.infer<typeof SignalContextSchema>;

/**
 * Raw signal - an atomic fact extracted from source code
 */
export const RawSignalSchema = z.object({
  id: z.string(),
  type: SignalTypeSchema,
  value: z.unknown(),
  location: SourceLocationSchema,
  context: SignalContextSchema,
  metadata: z.record(z.unknown()),
});

export type RawSignal = z.infer<typeof RawSignalSchema>;

/**
 * Create a unique signal ID
 */
export function createSignalId(
  type: SignalType,
  path: string,
  line: number,
  value: unknown,
): string {
  const valueHash = typeof value === 'string'
    ? value.slice(0, 20)
    : String(value).slice(0, 20);
  return `${type}:${path}:${line}:${valueHash}`;
}
```

Create: `packages/scanners/src/signals/index.ts`

```typescript
export * from './types.js';
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @buoy-design/scanners test src/signals/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/scanners/src/signals/
git commit -m "feat(scanners): add signal type definitions

Introduce RawSignal schema and types for the pattern mining engine.
Signals are atomic facts extracted from source code with full context."
```

---

## Task 2: Create SignalEmitter Interface

**Files:**
- Create: `packages/scanners/src/signals/emitter.ts`
- Modify: `packages/scanners/src/signals/index.ts`

**Step 1: Write the failing test**

Create: `packages/scanners/src/signals/emitter.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { SignalEmitter, createSignalEmitter } from './emitter.js';
import type { RawSignal } from './types.js';

describe('SignalEmitter', () => {
  it('emits and collects signals', () => {
    const emitter = createSignalEmitter();

    emitter.emit({
      id: 'test-1',
      type: 'color-value',
      value: '#fff',
      location: { path: 'test.tsx', line: 1 },
      context: {
        fileType: 'tsx',
        framework: 'react',
        scope: 'inline',
        isTokenized: false,
      },
      metadata: {},
    });

    emitter.emit({
      id: 'test-2',
      type: 'spacing-value',
      value: '8px',
      location: { path: 'test.tsx', line: 2 },
      context: {
        fileType: 'tsx',
        framework: 'react',
        scope: 'inline',
        isTokenized: false,
      },
      metadata: {},
    });

    const signals = emitter.getSignals();
    expect(signals).toHaveLength(2);
    expect(signals[0].type).toBe('color-value');
    expect(signals[1].type).toBe('spacing-value');
  });

  it('clears signals', () => {
    const emitter = createSignalEmitter();

    emitter.emit({
      id: 'test-1',
      type: 'color-value',
      value: '#fff',
      location: { path: 'test.tsx', line: 1 },
      context: {
        fileType: 'tsx',
        framework: 'react',
        scope: 'inline',
        isTokenized: false,
      },
      metadata: {},
    });

    expect(emitter.getSignals()).toHaveLength(1);
    emitter.clear();
    expect(emitter.getSignals()).toHaveLength(0);
  });

  it('deduplicates by ID', () => {
    const emitter = createSignalEmitter();

    const signal: RawSignal = {
      id: 'same-id',
      type: 'color-value',
      value: '#fff',
      location: { path: 'test.tsx', line: 1 },
      context: {
        fileType: 'tsx',
        framework: 'react',
        scope: 'inline',
        isTokenized: false,
      },
      metadata: {},
    };

    emitter.emit(signal);
    emitter.emit(signal);
    emitter.emit(signal);

    expect(emitter.getSignals()).toHaveLength(1);
  });

  it('filters signals by type', () => {
    const emitter = createSignalEmitter();

    emitter.emit({
      id: 'color-1',
      type: 'color-value',
      value: '#fff',
      location: { path: 'test.tsx', line: 1 },
      context: { fileType: 'tsx', framework: 'react', scope: 'inline', isTokenized: false },
      metadata: {},
    });

    emitter.emit({
      id: 'spacing-1',
      type: 'spacing-value',
      value: '8px',
      location: { path: 'test.tsx', line: 2 },
      context: { fileType: 'tsx', framework: 'react', scope: 'inline', isTokenized: false },
      metadata: {},
    });

    emitter.emit({
      id: 'color-2',
      type: 'color-value',
      value: '#000',
      location: { path: 'test.tsx', line: 3 },
      context: { fileType: 'tsx', framework: 'react', scope: 'inline', isTokenized: false },
      metadata: {},
    });

    const colorSignals = emitter.getSignalsByType('color-value');
    expect(colorSignals).toHaveLength(2);
    expect(colorSignals.every(s => s.type === 'color-value')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @buoy-design/scanners test src/signals/emitter.test.ts`
Expected: FAIL with "Cannot find module './emitter.js'"

**Step 3: Write minimal implementation**

Create: `packages/scanners/src/signals/emitter.ts`

```typescript
import type { RawSignal, SignalType } from './types.js';

/**
 * Interface for emitting and collecting signals during scanning
 */
export interface SignalEmitter {
  /** Emit a signal (deduplicates by ID) */
  emit(signal: RawSignal): void;

  /** Get all collected signals */
  getSignals(): RawSignal[];

  /** Get signals filtered by type */
  getSignalsByType(type: SignalType): RawSignal[];

  /** Clear all collected signals */
  clear(): void;

  /** Get count of signals by type */
  getCounts(): Record<SignalType, number>;
}

/**
 * Create a new signal emitter
 */
export function createSignalEmitter(): SignalEmitter {
  const signals = new Map<string, RawSignal>();

  return {
    emit(signal: RawSignal): void {
      // Deduplicate by ID
      if (!signals.has(signal.id)) {
        signals.set(signal.id, signal);
      }
    },

    getSignals(): RawSignal[] {
      return Array.from(signals.values());
    },

    getSignalsByType(type: SignalType): RawSignal[] {
      return Array.from(signals.values()).filter(s => s.type === type);
    },

    clear(): void {
      signals.clear();
    },

    getCounts(): Record<SignalType, number> {
      const counts: Partial<Record<SignalType, number>> = {};
      for (const signal of signals.values()) {
        counts[signal.type] = (counts[signal.type] || 0) + 1;
      }
      return counts as Record<SignalType, number>;
    },
  };
}
```

Update: `packages/scanners/src/signals/index.ts`

```typescript
export * from './types.js';
export * from './emitter.js';
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @buoy-design/scanners test src/signals/emitter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/scanners/src/signals/
git commit -m "feat(scanners): add SignalEmitter interface

Provides emit/collect/filter interface for signal extraction.
Deduplicates signals by ID automatically."
```

---

## Task 3: Create Signal Extractors for Color Values

**Files:**
- Create: `packages/scanners/src/signals/extractors/color.ts`
- Create: `packages/scanners/src/signals/extractors/index.ts`

**Step 1: Write the failing test**

Create: `packages/scanners/src/signals/extractors/color.test.ts`

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @buoy-design/scanners test src/signals/extractors/color.test.ts`
Expected: FAIL with "Cannot find module './color.js'"

**Step 3: Write minimal implementation**

Create: `packages/scanners/src/signals/extractors/color.ts`

```typescript
import type { RawSignal, SignalContext } from '../types.js';
import { createSignalId } from '../types.js';

// Color detection patterns
const HEX_PATTERN = /^#[0-9a-fA-F]{3,8}$/;
const RGB_PATTERN = /^rgb\s*\(/i;
const RGBA_PATTERN = /^rgba\s*\(/i;
const HSL_PATTERN = /^hsl\s*\(/i;
const HSLA_PATTERN = /^hsla\s*\(/i;
const OKLCH_PATTERN = /^oklch\s*\(/i;

// Values to skip
const SKIP_VALUES = new Set([
  'inherit',
  'transparent',
  'currentColor',
  'initial',
  'unset',
  'none',
]);

/**
 * Detect the format of a color value
 */
function detectColorFormat(value: string): string | null {
  if (HEX_PATTERN.test(value)) return 'hex';
  if (RGBA_PATTERN.test(value)) return 'rgba';
  if (RGB_PATTERN.test(value)) return 'rgb';
  if (HSLA_PATTERN.test(value)) return 'hsla';
  if (HSL_PATTERN.test(value)) return 'hsl';
  if (OKLCH_PATTERN.test(value)) return 'oklch';
  return null;
}

/**
 * Check if value is a token reference (should be skipped)
 */
function isTokenReference(value: string): boolean {
  return (
    value.includes('var(--') ||
    value.includes('theme.') ||
    value.includes('tokens.') ||
    value.includes('$') // SCSS variable
  );
}

/**
 * Extract color signals from a value
 */
export function extractColorSignals(
  value: string,
  path: string,
  line: number,
  property: string,
  context: SignalContext,
): RawSignal[] {
  // Skip token references
  if (isTokenReference(value)) {
    return [];
  }

  // Skip special values
  if (SKIP_VALUES.has(value)) {
    return [];
  }

  // Detect format
  const format = detectColorFormat(value);
  if (!format) {
    return [];
  }

  const signal: RawSignal = {
    id: createSignalId('color-value', path, line, value),
    type: 'color-value',
    value,
    location: {
      path,
      line,
    },
    context,
    metadata: {
      format,
      property,
      hasAlpha: format === 'rgba' || format === 'hsla',
    },
  };

  return [signal];
}
```

Create: `packages/scanners/src/signals/extractors/index.ts`

```typescript
export * from './color.js';
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @buoy-design/scanners test src/signals/extractors/color.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/scanners/src/signals/extractors/
git commit -m "feat(scanners): add color signal extractor

Detects hex, rgb, rgba, hsl, hsla, oklch color formats.
Skips CSS variables and token references."
```

---

## Task 4: Create Signal Extractors for Spacing Values

**Files:**
- Create: `packages/scanners/src/signals/extractors/spacing.ts`
- Modify: `packages/scanners/src/signals/extractors/index.ts`

**Step 1: Write the failing test**

Create: `packages/scanners/src/signals/extractors/spacing.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { extractSpacingSignals } from './spacing.js';
import type { SignalContext } from '../types.js';

describe('extractSpacingSignals', () => {
  const defaultContext: SignalContext = {
    fileType: 'tsx',
    framework: 'react',
    scope: 'inline',
    isTokenized: false,
  };

  it('extracts px values', () => {
    const signals = extractSpacingSignals(
      '16px',
      'src/Button.tsx',
      42,
      'padding',
      defaultContext,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('spacing-value');
    expect(signals[0].value).toBe('16px');
    expect(signals[0].metadata.numericValue).toBe(16);
    expect(signals[0].metadata.unit).toBe('px');
  });

  it('extracts rem values', () => {
    const signals = extractSpacingSignals(
      '1.5rem',
      'src/Button.tsx',
      10,
      'margin',
      defaultContext,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.numericValue).toBe(1.5);
    expect(signals[0].metadata.unit).toBe('rem');
  });

  it('extracts em values', () => {
    const signals = extractSpacingSignals(
      '0.5em',
      'src/Button.tsx',
      15,
      'gap',
      defaultContext,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.unit).toBe('em');
  });

  it('extracts percentage values', () => {
    const signals = extractSpacingSignals(
      '25%',
      'src/Button.tsx',
      20,
      'width',
      defaultContext,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.unit).toBe('%');
    expect(signals[0].metadata.numericValue).toBe(25);
  });

  it('extracts viewport units', () => {
    const signalsVh = extractSpacingSignals('100vh', 'test.tsx', 1, 'height', defaultContext);
    expect(signalsVh[0].metadata.unit).toBe('vh');

    const signalsVw = extractSpacingSignals('50vw', 'test.tsx', 1, 'width', defaultContext);
    expect(signalsVw[0].metadata.unit).toBe('vw');
  });

  it('skips zero without unit', () => {
    const signals = extractSpacingSignals(
      '0',
      'src/Button.tsx',
      25,
      'padding',
      defaultContext,
    );

    expect(signals).toHaveLength(0);
  });

  it('skips auto', () => {
    const signals = extractSpacingSignals(
      'auto',
      'src/Button.tsx',
      30,
      'margin',
      defaultContext,
    );

    expect(signals).toHaveLength(0);
  });

  it('skips CSS variables', () => {
    const signals = extractSpacingSignals(
      'var(--spacing-md)',
      'src/Button.tsx',
      35,
      'padding',
      defaultContext,
    );

    expect(signals).toHaveLength(0);
  });

  it('includes property name in metadata', () => {
    const signals = extractSpacingSignals(
      '8px',
      'src/Button.tsx',
      42,
      'marginTop',
      defaultContext,
    );

    expect(signals[0].metadata.property).toBe('marginTop');
  });

  it('detects spacing category from property', () => {
    const padding = extractSpacingSignals('8px', 'test.tsx', 1, 'padding', defaultContext);
    expect(padding[0].metadata.category).toBe('padding');

    const margin = extractSpacingSignals('8px', 'test.tsx', 1, 'marginLeft', defaultContext);
    expect(margin[0].metadata.category).toBe('margin');

    const gap = extractSpacingSignals('8px', 'test.tsx', 1, 'gap', defaultContext);
    expect(gap[0].metadata.category).toBe('gap');

    const size = extractSpacingSignals('100px', 'test.tsx', 1, 'width', defaultContext);
    expect(size[0].metadata.category).toBe('size');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @buoy-design/scanners test src/signals/extractors/spacing.test.ts`
Expected: FAIL with "Cannot find module './spacing.js'"

**Step 3: Write minimal implementation**

Create: `packages/scanners/src/signals/extractors/spacing.ts`

```typescript
import type { RawSignal, SignalContext } from '../types.js';
import { createSignalId } from '../types.js';

// Spacing value pattern: number + unit
const SPACING_PATTERN = /^(-?\d+\.?\d*)(px|rem|em|%|vh|vw|vmin|vmax|ch|ex)$/;

// Values to skip
const SKIP_VALUES = new Set([
  '0',
  'auto',
  'inherit',
  'initial',
  'unset',
  'none',
  'fit-content',
  'max-content',
  'min-content',
]);

// Property to category mapping
const PROPERTY_CATEGORIES: Record<string, string> = {
  padding: 'padding',
  paddingTop: 'padding',
  paddingRight: 'padding',
  paddingBottom: 'padding',
  paddingLeft: 'padding',
  paddingInline: 'padding',
  paddingBlock: 'padding',
  margin: 'margin',
  marginTop: 'margin',
  marginRight: 'margin',
  marginBottom: 'margin',
  marginLeft: 'margin',
  marginInline: 'margin',
  marginBlock: 'margin',
  gap: 'gap',
  rowGap: 'gap',
  columnGap: 'gap',
  width: 'size',
  height: 'size',
  minWidth: 'size',
  minHeight: 'size',
  maxWidth: 'size',
  maxHeight: 'size',
  top: 'position',
  right: 'position',
  bottom: 'position',
  left: 'position',
  inset: 'position',
};

/**
 * Check if value is a token reference (should be skipped)
 */
function isTokenReference(value: string): boolean {
  return (
    value.includes('var(--') ||
    value.includes('theme.') ||
    value.includes('tokens.') ||
    value.includes('$')
  );
}

/**
 * Extract spacing signals from a value
 */
export function extractSpacingSignals(
  value: string,
  path: string,
  line: number,
  property: string,
  context: SignalContext,
): RawSignal[] {
  // Skip token references
  if (isTokenReference(value)) {
    return [];
  }

  // Skip special values
  if (SKIP_VALUES.has(value)) {
    return [];
  }

  // Match spacing pattern
  const match = value.match(SPACING_PATTERN);
  if (!match) {
    return [];
  }

  const [, numStr, unit] = match;
  const numericValue = parseFloat(numStr);

  const signal: RawSignal = {
    id: createSignalId('spacing-value', path, line, value),
    type: 'spacing-value',
    value,
    location: {
      path,
      line,
    },
    context,
    metadata: {
      numericValue,
      unit,
      property,
      category: PROPERTY_CATEGORIES[property] || 'other',
    },
  };

  return [signal];
}
```

Update: `packages/scanners/src/signals/extractors/index.ts`

```typescript
export * from './color.js';
export * from './spacing.js';
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @buoy-design/scanners test src/signals/extractors/spacing.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/scanners/src/signals/extractors/
git commit -m "feat(scanners): add spacing signal extractor

Detects px, rem, em, %, vh, vw and other units.
Categorizes by property (padding, margin, gap, size, position)."
```

---

## Task 5: Create Signal Extractors for Typography

**Files:**
- Create: `packages/scanners/src/signals/extractors/typography.ts`
- Modify: `packages/scanners/src/signals/extractors/index.ts`

**Step 1: Write the failing test**

Create: `packages/scanners/src/signals/extractors/typography.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { extractFontSizeSignals, extractFontFamilySignals, extractFontWeightSignals } from './typography.js';
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
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @buoy-design/scanners test src/signals/extractors/typography.test.ts`
Expected: FAIL with "Cannot find module './typography.js'"

**Step 3: Write minimal implementation**

Create: `packages/scanners/src/signals/extractors/typography.ts`

```typescript
import type { RawSignal, SignalContext } from '../types.js';
import { createSignalId } from '../types.js';

// Font size pattern
const FONT_SIZE_PATTERN = /^(\d+\.?\d*)(px|rem|em|pt|%)$/;

// Named font weights to numeric
const NAMED_WEIGHTS: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  normal: 400,
  regular: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

// Generic font families (fallbacks)
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
]);

// Values to skip
const SKIP_VALUES = new Set(['inherit', 'initial', 'unset']);

/**
 * Check if value is a token reference
 */
function isTokenReference(value: string): boolean {
  return (
    value.includes('var(--') ||
    value.includes('theme.') ||
    value.includes('tokens.') ||
    value.includes('$')
  );
}

/**
 * Extract font-size signals
 */
export function extractFontSizeSignals(
  value: string,
  path: string,
  line: number,
  context: SignalContext,
): RawSignal[] {
  if (isTokenReference(value) || SKIP_VALUES.has(value)) {
    return [];
  }

  const match = value.match(FONT_SIZE_PATTERN);
  if (!match) {
    return [];
  }

  const [, numStr, unit] = match;

  return [{
    id: createSignalId('font-size', path, line, value),
    type: 'font-size',
    value,
    location: { path, line },
    context,
    metadata: {
      numericValue: parseFloat(numStr),
      unit,
    },
  }];
}

/**
 * Extract font-family signals
 */
export function extractFontFamilySignals(
  value: string,
  path: string,
  line: number,
  context: SignalContext,
): RawSignal[] {
  if (isTokenReference(value) || SKIP_VALUES.has(value)) {
    return [];
  }

  // Parse font family list
  const families: string[] = [];
  let fallback: string | undefined;

  // Split by comma, handling quotes
  const parts = value.split(',').map(s => s.trim());

  for (const part of parts) {
    // Remove quotes
    const cleaned = part.replace(/["']/g, '').trim();
    if (!cleaned) continue;

    if (GENERIC_FAMILIES.has(cleaned.toLowerCase())) {
      fallback = cleaned;
    } else {
      families.push(cleaned);
    }
  }

  if (families.length === 0 && !fallback) {
    return [];
  }

  return [{
    id: createSignalId('font-family', path, line, value),
    type: 'font-family',
    value,
    location: { path, line },
    context,
    metadata: {
      families,
      fallback,
    },
  }];
}

/**
 * Extract font-weight signals
 */
export function extractFontWeightSignals(
  value: string,
  path: string,
  line: number,
  context: SignalContext,
): RawSignal[] {
  if (isTokenReference(value) || SKIP_VALUES.has(value)) {
    return [];
  }

  let numericValue: number;
  let namedValue: string | undefined;

  // Check if it's a number
  const numMatch = value.match(/^\d+$/);
  if (numMatch) {
    numericValue = parseInt(value, 10);
  } else {
    // Check named weight
    const normalized = value.toLowerCase().replace(/[-_\s]/g, '');
    if (NAMED_WEIGHTS[normalized] !== undefined) {
      numericValue = NAMED_WEIGHTS[normalized];
      namedValue = value;
    } else {
      return [];
    }
  }

  return [{
    id: createSignalId('font-weight', path, line, value),
    type: 'font-weight',
    value,
    location: { path, line },
    context,
    metadata: {
      numericValue,
      namedValue,
    },
  }];
}
```

Update: `packages/scanners/src/signals/extractors/index.ts`

```typescript
export * from './color.js';
export * from './spacing.js';
export * from './typography.js';
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @buoy-design/scanners test src/signals/extractors/typography.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/scanners/src/signals/extractors/
git commit -m "feat(scanners): add typography signal extractors

Extracts font-size, font-family, and font-weight signals.
Normalizes named weights to numeric values."
```

---

## Task 6: Create SignalAggregator

**Files:**
- Create: `packages/scanners/src/signals/aggregator.ts`
- Modify: `packages/scanners/src/signals/index.ts`

**Step 1: Write the failing test**

Create: `packages/scanners/src/signals/aggregator.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { SignalAggregator, createSignalAggregator } from './aggregator.js';
import { createSignalEmitter } from './emitter.js';
import type { RawSignal } from './types.js';

describe('SignalAggregator', () => {
  const makeSignal = (id: string, type: string, value: string): RawSignal => ({
    id,
    type: type as any,
    value,
    location: { path: 'test.tsx', line: 1 },
    context: { fileType: 'tsx', framework: 'react', scope: 'inline', isTokenized: false },
    metadata: {},
  });

  it('aggregates signals from multiple emitters', () => {
    const aggregator = createSignalAggregator();

    const emitter1 = createSignalEmitter();
    emitter1.emit(makeSignal('1', 'color-value', '#fff'));
    emitter1.emit(makeSignal('2', 'color-value', '#000'));

    const emitter2 = createSignalEmitter();
    emitter2.emit(makeSignal('3', 'spacing-value', '8px'));
    emitter2.emit(makeSignal('4', 'spacing-value', '16px'));

    aggregator.addEmitter('react', emitter1);
    aggregator.addEmitter('tailwind', emitter2);

    const allSignals = aggregator.getAllSignals();
    expect(allSignals).toHaveLength(4);
  });

  it('deduplicates signals with same ID across emitters', () => {
    const aggregator = createSignalAggregator();

    const emitter1 = createSignalEmitter();
    emitter1.emit(makeSignal('same-id', 'color-value', '#fff'));

    const emitter2 = createSignalEmitter();
    emitter2.emit(makeSignal('same-id', 'color-value', '#fff'));

    aggregator.addEmitter('react', emitter1);
    aggregator.addEmitter('css', emitter2);

    const allSignals = aggregator.getAllSignals();
    expect(allSignals).toHaveLength(1);
  });

  it('gets signals by source', () => {
    const aggregator = createSignalAggregator();

    const emitter1 = createSignalEmitter();
    emitter1.emit(makeSignal('1', 'color-value', '#fff'));

    const emitter2 = createSignalEmitter();
    emitter2.emit(makeSignal('2', 'spacing-value', '8px'));

    aggregator.addEmitter('react', emitter1);
    aggregator.addEmitter('tailwind', emitter2);

    const reactSignals = aggregator.getSignalsBySource('react');
    expect(reactSignals).toHaveLength(1);
    expect(reactSignals[0].id).toBe('1');

    const tailwindSignals = aggregator.getSignalsBySource('tailwind');
    expect(tailwindSignals).toHaveLength(1);
    expect(tailwindSignals[0].id).toBe('2');
  });

  it('gets signals by type', () => {
    const aggregator = createSignalAggregator();

    const emitter = createSignalEmitter();
    emitter.emit(makeSignal('1', 'color-value', '#fff'));
    emitter.emit(makeSignal('2', 'color-value', '#000'));
    emitter.emit(makeSignal('3', 'spacing-value', '8px'));

    aggregator.addEmitter('react', emitter);

    const colorSignals = aggregator.getSignalsByType('color-value');
    expect(colorSignals).toHaveLength(2);
  });

  it('provides statistics', () => {
    const aggregator = createSignalAggregator();

    const emitter = createSignalEmitter();
    emitter.emit(makeSignal('1', 'color-value', '#fff'));
    emitter.emit(makeSignal('2', 'color-value', '#000'));
    emitter.emit(makeSignal('3', 'spacing-value', '8px'));

    aggregator.addEmitter('react', emitter);

    const stats = aggregator.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byType['color-value']).toBe(2);
    expect(stats.byType['spacing-value']).toBe(1);
    expect(stats.bySource['react']).toBe(3);
  });

  it('clears all signals', () => {
    const aggregator = createSignalAggregator();

    const emitter = createSignalEmitter();
    emitter.emit(makeSignal('1', 'color-value', '#fff'));

    aggregator.addEmitter('react', emitter);
    expect(aggregator.getAllSignals()).toHaveLength(1);

    aggregator.clear();
    expect(aggregator.getAllSignals()).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @buoy-design/scanners test src/signals/aggregator.test.ts`
Expected: FAIL with "Cannot find module './aggregator.js'"

**Step 3: Write minimal implementation**

Create: `packages/scanners/src/signals/aggregator.ts`

```typescript
import type { SignalEmitter } from './emitter.js';
import type { RawSignal, SignalType } from './types.js';

/**
 * Statistics about aggregated signals
 */
export interface SignalStats {
  total: number;
  byType: Partial<Record<SignalType, number>>;
  bySource: Record<string, number>;
}

/**
 * Aggregates signals from multiple emitters
 */
export interface SignalAggregator {
  /** Add an emitter with a source identifier */
  addEmitter(source: string, emitter: SignalEmitter): void;

  /** Get all signals (deduplicated by ID) */
  getAllSignals(): RawSignal[];

  /** Get signals from a specific source */
  getSignalsBySource(source: string): RawSignal[];

  /** Get signals of a specific type */
  getSignalsByType(type: SignalType): RawSignal[];

  /** Get aggregation statistics */
  getStats(): SignalStats;

  /** Clear all signals */
  clear(): void;
}

/**
 * Create a new signal aggregator
 */
export function createSignalAggregator(): SignalAggregator {
  const emitters = new Map<string, SignalEmitter>();

  return {
    addEmitter(source: string, emitter: SignalEmitter): void {
      emitters.set(source, emitter);
    },

    getAllSignals(): RawSignal[] {
      const seen = new Map<string, RawSignal>();

      for (const emitter of emitters.values()) {
        for (const signal of emitter.getSignals()) {
          if (!seen.has(signal.id)) {
            seen.set(signal.id, signal);
          }
        }
      }

      return Array.from(seen.values());
    },

    getSignalsBySource(source: string): RawSignal[] {
      const emitter = emitters.get(source);
      return emitter ? emitter.getSignals() : [];
    },

    getSignalsByType(type: SignalType): RawSignal[] {
      const results: RawSignal[] = [];
      const seen = new Set<string>();

      for (const emitter of emitters.values()) {
        for (const signal of emitter.getSignalsByType(type)) {
          if (!seen.has(signal.id)) {
            seen.add(signal.id);
            results.push(signal);
          }
        }
      }

      return results;
    },

    getStats(): SignalStats {
      const allSignals = this.getAllSignals();
      const byType: Partial<Record<SignalType, number>> = {};
      const bySource: Record<string, number> = {};

      // Count by type
      for (const signal of allSignals) {
        byType[signal.type] = (byType[signal.type] || 0) + 1;
      }

      // Count by source
      for (const [source, emitter] of emitters) {
        bySource[source] = emitter.getSignals().length;
      }

      return {
        total: allSignals.length,
        byType,
        bySource,
      };
    },

    clear(): void {
      for (const emitter of emitters.values()) {
        emitter.clear();
      }
      emitters.clear();
    },
  };
}
```

Update: `packages/scanners/src/signals/index.ts`

```typescript
export * from './types.js';
export * from './emitter.js';
export * from './aggregator.js';
export * from './extractors/index.js';
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @buoy-design/scanners test src/signals/aggregator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/scanners/src/signals/
git commit -m "feat(scanners): add SignalAggregator

Collects signals from multiple emitters.
Deduplicates by ID, provides filtering and stats."
```

---

## Task 7: Export Signals Module from Package

**Files:**
- Modify: `packages/scanners/src/index.ts`

**Step 1: Write the failing test**

Create: `packages/scanners/src/signals/integration.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  createSignalEmitter,
  createSignalAggregator,
  extractColorSignals,
  extractSpacingSignals,
  extractFontSizeSignals,
  type RawSignal,
  type SignalContext,
} from '../index.js';

describe('signals module integration', () => {
  it('exports all signal utilities', () => {
    expect(createSignalEmitter).toBeDefined();
    expect(createSignalAggregator).toBeDefined();
    expect(extractColorSignals).toBeDefined();
    expect(extractSpacingSignals).toBeDefined();
    expect(extractFontSizeSignals).toBeDefined();
  });

  it('works end-to-end', () => {
    const context: SignalContext = {
      fileType: 'tsx',
      framework: 'react',
      scope: 'inline',
      isTokenized: false,
    };

    const emitter = createSignalEmitter();

    // Extract signals
    const colorSignals = extractColorSignals('#3B82F6', 'Button.tsx', 10, 'color', context);
    const spacingSignals = extractSpacingSignals('16px', 'Button.tsx', 11, 'padding', context);

    // Emit them
    for (const signal of colorSignals) emitter.emit(signal);
    for (const signal of spacingSignals) emitter.emit(signal);

    // Aggregate
    const aggregator = createSignalAggregator();
    aggregator.addEmitter('react', emitter);

    // Verify
    const allSignals = aggregator.getAllSignals();
    expect(allSignals).toHaveLength(2);

    const stats = aggregator.getStats();
    expect(stats.total).toBe(2);
    expect(stats.byType['color-value']).toBe(1);
    expect(stats.byType['spacing-value']).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @buoy-design/scanners test src/signals/integration.test.ts`
Expected: FAIL with exports not found

**Step 3: Write minimal implementation**

Update: `packages/scanners/src/index.ts` - add at the end:

```typescript
// Signals (Pattern Mining Engine)
export {
  // Types
  type RawSignal,
  type SignalType,
  type SignalContext,
  type SourceLocation,
  type FileType,
  type Framework,
  type Scope,
  RawSignalSchema,
  SignalTypeSchema,
  createSignalId,
  // Emitter
  type SignalEmitter,
  createSignalEmitter,
  // Aggregator
  type SignalAggregator,
  type SignalStats,
  createSignalAggregator,
  // Extractors
  extractColorSignals,
  extractSpacingSignals,
  extractFontSizeSignals,
  extractFontFamilySignals,
  extractFontWeightSignals,
} from './signals/index.js';
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @buoy-design/scanners test src/signals/integration.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/scanners/src/index.ts
git commit -m "feat(scanners): export signals module

Makes signal extraction utilities available from package root."
```

---

## Task 8: Run Full Test Suite

**Step 1: Build the package**

Run: `pnpm --filter @buoy-design/scanners build`
Expected: Build succeeds

**Step 2: Run all tests**

Run: `pnpm --filter @buoy-design/scanners test`
Expected: All tests pass

**Step 3: Run type check**

Run: `pnpm --filter @buoy-design/scanners typecheck`
Expected: No type errors

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore(scanners): verify signal extraction module

All tests pass, types check, ready for Phase 2."
```

---

## Summary

Phase 1 creates the foundation for the Pattern Mining Engine:

| Component | Purpose |
|-----------|---------|
| `RawSignal` type | Normalized signal schema with context |
| `SignalEmitter` | Emit and collect signals per scanner |
| `SignalAggregator` | Combine signals from multiple sources |
| Color extractor | Detect hex, rgb, hsl colors |
| Spacing extractor | Detect px, rem, em values |
| Typography extractors | Detect font-size, font-family, font-weight |

**Next Phase:** Integrate signal emission into existing scanners (ReactScanner, TailwindScanner, CssScanner).

---

## Checklist

- [ ] Task 1: Signal type definitions
- [ ] Task 2: SignalEmitter interface
- [ ] Task 3: Color signal extractor
- [ ] Task 4: Spacing signal extractor
- [ ] Task 5: Typography signal extractors
- [ ] Task 6: SignalAggregator
- [ ] Task 7: Export from package
- [ ] Task 8: Full test suite verification
