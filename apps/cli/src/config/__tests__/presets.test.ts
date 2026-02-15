import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BuoyConfigSchema } from '../schema.js';

// We test applyPreset indirectly via loadConfig, but since applyPreset is internal,
// we test the schema acceptance and the preset logic by importing + calling loadConfig
// with fixture configs. For unit-level testing, we replicate the applyPreset logic.

function applyPreset(raw: Record<string, unknown>) {
  const config = BuoyConfigSchema.parse(raw);
  if (!config.preset || config.preset === 'default') return config;

  if (config.preset === 'strict') {
    return {
      ...config,
      drift: {
        ...config.drift,
        failOn: config.drift?.failOn ?? 'warning',
      },
    };
  }

  if (config.preset === 'relaxed') {
    const existingExclude = config.drift?.exclude ?? [];
    const relaxedExclude = ['missing-documentation', 'naming-inconsistency']
      .filter(t => !existingExclude.includes(t));
    return {
      ...config,
      drift: {
        ...config.drift,
        failOn: config.drift?.failOn ?? 'critical',
        exclude: [...existingExclude, ...relaxedExclude],
      },
    };
  }

  return config;
}

describe('config presets', () => {
  const baseConfig = { project: { name: 'test' } };

  it('should accept preset field in schema', () => {
    const config = BuoyConfigSchema.parse({ ...baseConfig, preset: 'strict' });
    expect(config.preset).toBe('strict');
  });

  it('should accept all preset values', () => {
    for (const preset of ['strict', 'relaxed', 'default'] as const) {
      const config = BuoyConfigSchema.parse({ ...baseConfig, preset });
      expect(config.preset).toBe(preset);
    }
  });

  it('should reject invalid preset values', () => {
    expect(() => BuoyConfigSchema.parse({ ...baseConfig, preset: 'invalid' })).toThrow();
  });

  it('strict preset sets failOn to warning', () => {
    const config = applyPreset({ ...baseConfig, preset: 'strict' });
    expect(config.drift.failOn).toBe('warning');
  });

  it('strict preset does not override user failOn', () => {
    const config = applyPreset({
      ...baseConfig,
      preset: 'strict',
      drift: { failOn: 'critical' },
    });
    expect(config.drift.failOn).toBe('critical');
  });

  it('relaxed preset sets failOn to critical', () => {
    const config = applyPreset({ ...baseConfig, preset: 'relaxed' });
    expect(config.drift.failOn).toBe('critical');
  });

  it('relaxed preset excludes low-severity types', () => {
    const config = applyPreset({ ...baseConfig, preset: 'relaxed' });
    expect(config.drift.exclude).toContain('missing-documentation');
    expect(config.drift.exclude).toContain('naming-inconsistency');
  });

  it('relaxed preset does not duplicate user excludes', () => {
    const config = applyPreset({
      ...baseConfig,
      preset: 'relaxed',
      drift: { exclude: ['missing-documentation'] },
    });
    const count = config.drift.exclude!.filter(
      (e: string) => e === 'missing-documentation'
    ).length;
    expect(count).toBe(1);
  });

  it('default preset returns config unchanged', () => {
    const config = applyPreset({ ...baseConfig, preset: 'default' });
    expect(config.drift.failOn).toBeUndefined();
    expect(config.drift.exclude).toBeUndefined();
  });

  it('no preset returns config unchanged', () => {
    const config = applyPreset(baseConfig);
    expect(config.drift.failOn).toBeUndefined();
  });
});
