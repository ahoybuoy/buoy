import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface HistoryEntry {
  timestamp: string;
  score: number | null;
  tier: string;
  driftCount: number;
  componentCount: number;
}

const MAX_ENTRIES = 50;
const HISTORY_FILE = 'history.json';

export function loadHistory(cwd: string): HistoryEntry[] {
  const path = join(cwd, '.buoy', HISTORY_FILE);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return [];
  }
}

export function saveHistory(cwd: string, entry: HistoryEntry): void {
  const dir = join(cwd, '.buoy');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const history = loadHistory(cwd);
  history.push(entry);
  if (history.length > MAX_ENTRIES) history.splice(0, history.length - MAX_ENTRIES);
  writeFileSync(join(dir, HISTORY_FILE), JSON.stringify(history, null, 2));
}

export function getLastScore(cwd: string): number | null {
  const history = loadHistory(cwd);
  if (history.length < 2) return null;
  return history[history.length - 2]!.score;
}
