import { describe, it, expect } from 'vitest';
import { createSignalAggregator } from './aggregator.js';
import { createSignalEmitter } from './emitter.js';
import type { RawSignal, SignalType } from './types.js';

describe('SignalAggregator', () => {
  const makeSignal = (id: string, type: SignalType, value: string): RawSignal => ({
    id,
    type,
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
