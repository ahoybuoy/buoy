import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadHistory, saveHistory, getLastScore } from '../scan-history.js';

describe('scan-history', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'buoy-history-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const makeEntry = (score: number | null, driftCount = 5) => ({
    timestamp: new Date().toISOString(),
    score,
    tier: score !== null && score >= 80 ? 'healthy' : 'needs-work',
    driftCount,
    componentCount: 10,
  });

  it('should return empty array when no history exists', () => {
    expect(loadHistory(tmpDir)).toEqual([]);
  });

  it('should save and load a history entry', () => {
    const entry = makeEntry(75);
    saveHistory(tmpDir, entry);
    const history = loadHistory(tmpDir);
    expect(history).toHaveLength(1);
    expect(history[0]!.score).toBe(75);
  });

  it('should append entries', () => {
    saveHistory(tmpDir, makeEntry(70));
    saveHistory(tmpDir, makeEntry(75));
    saveHistory(tmpDir, makeEntry(80));
    expect(loadHistory(tmpDir)).toHaveLength(3);
  });

  it('should cap at MAX_ENTRIES (50)', () => {
    for (let i = 0; i < 55; i++) {
      saveHistory(tmpDir, makeEntry(50 + i));
    }
    const history = loadHistory(tmpDir);
    expect(history).toHaveLength(50);
    // First entry should be the 6th one saved (index 5)
    expect(history[0]!.score).toBe(55);
  });

  it('getLastScore returns null with fewer than 2 entries', () => {
    expect(getLastScore(tmpDir)).toBeNull();
    saveHistory(tmpDir, makeEntry(70));
    expect(getLastScore(tmpDir)).toBeNull();
  });

  it('getLastScore returns the second-to-last score', () => {
    saveHistory(tmpDir, makeEntry(70));
    saveHistory(tmpDir, makeEntry(80));
    expect(getLastScore(tmpDir)).toBe(70);
  });

  it('getLastScore returns the previous score after 3 entries', () => {
    saveHistory(tmpDir, makeEntry(60));
    saveHistory(tmpDir, makeEntry(70));
    saveHistory(tmpDir, makeEntry(80));
    expect(getLastScore(tmpDir)).toBe(70);
  });
});
