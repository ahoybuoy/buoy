import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let config: Record<string, unknown> = {};
vi.mock('../../cloud/config.js', () => ({
  readCloudConfig: () => config,
  updateCloudConfig: (u: Record<string, unknown>) => { config = { ...config, ...u }; return config; },
  getApiEndpoint: () => 'https://api.example.test',
}));

const {
  buildPayload, isTelemetryEnabled, sendTelemetry, setTelemetryEnabled, shouldAskForConsent, telemetryBlockedByEnvironment,
} = await import('../index.js');

describe('telemetry consent', () => {
  beforeEach(() => { config = {}; vi.restoreAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('is off until the user opts in', () => {
    expect(isTelemetryEnabled({})).toBe(false);
    expect(shouldAskForConsent({ isTTY: true, env: {}, jsonOrQuiet: false })).toBe(true);
  });

  it('never asks in CI, non-TTY, JSON/quiet, or with opt-out env vars', () => {
    expect(shouldAskForConsent({ isTTY: false, env: {}, jsonOrQuiet: false })).toBe(false);
    expect(shouldAskForConsent({ isTTY: true, env: {}, jsonOrQuiet: true })).toBe(false);
    expect(shouldAskForConsent({ isTTY: true, env: { CI: 'true' }, jsonOrQuiet: false })).toBe(false);
    expect(shouldAskForConsent({ isTTY: true, env: { DO_NOT_TRACK: '1' }, jsonOrQuiet: false })).toBe(false);
    expect(telemetryBlockedByEnvironment({ BUOY_TELEMETRY: '0' })).toBe(true);
  });

  it('asks only once', () => {
    setTelemetryEnabled(false);
    expect(shouldAskForConsent({ isTTY: true, env: {}, jsonOrQuiet: false })).toBe(false);
    expect(isTelemetryEnabled({})).toBe(false);
  });

  it('environment opt-out wins over a stored yes', () => {
    setTelemetryEnabled(true);
    expect(isTelemetryEnabled({})).toBe(true);
    expect(isTelemetryEnabled({ BUOY_TELEMETRY: '0' })).toBe(false);
  });

  it('payload contains only counts, version, platform, and the anonymous id', () => {
    setTelemetryEnabled(true);
    const p = buildPayload('cli_drift_found', { total: 3, files: 2, bogus: -1, nan: Number.NaN });
    expect(p).not.toBeNull();
    expect(p!.anonymousId).toMatch(/^[a-f0-9]{32}$/);
    expect(p!.properties).toEqual({ total: 3, files: 2 });
    expect(Object.keys(p!)).toEqual(['event', 'anonymousId', 'cliVersion', 'platform', 'properties']);
  });

  it('sends nothing when disabled and posts to the anonymous endpoint when enabled', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await sendTelemetry('cli_first_run', {}, {});
    expect(fetchMock).not.toHaveBeenCalled();

    setTelemetryEnabled(true);
    await sendTelemetry('cli_first_run', {}, {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/analytics/events/anonymous');
    expect(JSON.parse(String(init.body)).event).toBe('cli_first_run');
  });

  it('swallows network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    setTelemetryEnabled(true);
    await expect(sendTelemetry('cli_first_run', {}, {})).resolves.toBeUndefined();
  });
});
