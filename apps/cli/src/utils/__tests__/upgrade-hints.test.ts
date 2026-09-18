import { describe, it, expect, vi, beforeEach } from 'vitest';

const readCloudConfig = vi.fn();
const updateCloudConfig = vi.fn();
const isLoggedIn = vi.fn();

vi.mock('../../cloud/config.js', () => ({
  readCloudConfig: () => readCloudConfig(),
  updateCloudConfig: (u: unknown) => updateCloudConfig(u),
  isLoggedIn: () => isLoggedIn(),
}));

const { formatUpgradeHint, getUpgradeHint, shouldShowHint } = await import('../upgrade-hints.js');

const tty = { isTTY: true, ci: false, now: new Date('2026-09-18T12:00:00Z') };

describe('upgrade hints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readCloudConfig.mockReturnValue({});
    isLoggedIn.mockReturnValue(false);
  });

  it('never points a logged-out user at a command that requires login', () => {
    for (const ctx of ['after-drift-found', 'after-health-score', 'after-check-fail', 'after-scan', 'after-fix'] as const) {
      expect(getUpgradeHint(ctx)?.cta).toBe('buoy ahoy login');
    }
  });

  it('shows nothing once logged in', () => {
    isLoggedIn.mockReturnValue(true);
    expect(getUpgradeHint('after-check-fail')).toBeUndefined();
  });

  it('is suppressed in CI and non-TTY output', () => {
    expect(shouldShowHint({ ...tty, isTTY: false })).toBe(false);
    expect(shouldShowHint({ ...tty, ci: true })).toBe(false);
    expect(shouldShowHint(tty)).toBe(true);
  });

  it('respects the opt-out and the once-a-day cap', () => {
    readCloudConfig.mockReturnValue({ hints: { disabled: true } });
    expect(shouldShowHint(tty)).toBe(false);

    readCloudConfig.mockReturnValue({ hints: { lastShownAt: '2026-09-18T02:00:00Z' } });
    expect(shouldShowHint(tty)).toBe(false);

    readCloudConfig.mockReturnValue({ hints: { lastShownAt: '2026-09-16T02:00:00Z' } });
    expect(shouldShowHint(tty)).toBe(true);
  });

  it('records when a hint was shown', () => {
    const out = formatUpgradeHint('after-check-fail', tty);
    expect(out).toContain('buoy ahoy login');
    expect(updateCloudConfig).toHaveBeenCalledWith({ hints: { lastShownAt: '2026-09-18T12:00:00.000Z' } });
  });
});
