import type { DashboardData, HealthData, InboxItem, GuardrailConfig, ActivityItem, DesignIntent, OnboardingStatus } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export const api = {
  getDashboard: () => fetchApi<DashboardData>('/dashboard'),

  getHealth: () => fetchApi<HealthData>('/dashboard/health'),

  getInbox: () => fetchApi<InboxItem[]>('/dashboard/inbox'),

  getGuardrails: () => fetchApi<GuardrailConfig>('/dashboard/guardrails'),

  getActivity: () => fetchApi<ActivityItem[]>('/dashboard/activity'),

  performInboxAction: (itemId: string, action: string) =>
    fetchApi<{ success: boolean }>(`/dashboard/inbox/${itemId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

  updateGuardrails: (config: Partial<GuardrailConfig>) =>
    fetchApi<GuardrailConfig>('/dashboard/guardrails', {
      method: 'PATCH',
      body: JSON.stringify(config),
    }),

  // Design Intent APIs
  getDesignIntent: () => fetchApi<DesignIntent>('/design-intent'),

  getOnboardingStatus: async (): Promise<OnboardingStatus> => {
    // Fetch design intent and dashboard to determine onboarding step
    const [designIntent, dashboard] = await Promise.all([
      fetchApi<DesignIntent>('/design-intent').catch(() => null),
      fetchApi<DashboardData>('/dashboard').catch(() => null),
    ]);

    const hasDesignIntent = !!(designIntent?.tokens?.length || designIntent?.components?.length);
    const hasScans = !!(dashboard?.health?.componentsTotal && dashboard.health.componentsTotal > 0);
    // For now, we consider repo connected if we have any scans
    const hasConnectedRepo = hasScans;

    let step: OnboardingStatus['step'];
    if (!hasDesignIntent) {
      step = 'no-design-intent';
    } else if (!hasConnectedRepo) {
      step = 'design-intent-only';
    } else if (!hasScans) {
      step = 'awaiting-scan';
    } else {
      step = 'ready';
    }

    return {
      step,
      hasDesignIntent,
      hasConnectedRepo,
      hasScans,
      designIntent: designIntent || undefined,
    };
  },
};
