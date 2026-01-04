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
