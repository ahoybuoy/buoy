/**
 * Dashboard Types
 */

export type DashboardStyle = 'ring' | 'bar' | 'cards';

export interface HealthData {
  percentage: number;
  componentsAligned: number;
  componentsTotal: number;
  alertCount: number;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
  };
  lastSyncAt: string;
}

export interface InboxItem {
  id: string;
  type: 'new-component' | 'undefined-token' | 'guardrail-catch' | 'large-deviation';
  title: string;
  description: string;
  createdAt: string;
  metadata: {
    filePath?: string;
    prNumber?: number;
    author?: string;
    similarity?: number;
    existingMatch?: string;
    tokenValue?: string;
    closestToken?: string;
    resolved?: boolean;
  };
}

export interface GuardrailRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: 'color' | 'spacing' | 'typography' | 'component' | 'other';
}

export interface GuardrailConfig {
  rules: GuardrailRule[];
  sensitivity: 'relaxed' | 'balanced' | 'strict';
}

export interface ActivityItem {
  id: string;
  type: 'component-added' | 'token-approved' | 'guardrail-caught' | 'marked-one-off';
  description: string;
  createdAt: string;
  success: boolean;
}

export interface DashboardData {
  health: HealthData;
  inbox: InboxItem[];
  guardrails: GuardrailConfig;
  activity: ActivityItem[];
}

// Design Intent types
export interface TokenDefinition {
  name: string;
  category: 'color' | 'spacing' | 'typography' | 'other';
  value: string;
  source?: string;
}

export interface ComponentDefinition {
  name: string;
  description?: string;
  figmaNodeId?: string;
}

export interface BaselineException {
  id: string;
  type: string;
  itemId: string;
  reason: string;
  createdAt: string;
}

export interface TrackingCategories {
  colors: boolean;
  typography: boolean;
  spacing: boolean;
  components: boolean;
}

export interface DesignIntent {
  id: string;
  source: 'figma' | 'manual' | 'code';
  tokens: TokenDefinition[];
  components: ComponentDefinition[];
  baselineExceptions: BaselineException[];
  trackingCategories: TrackingCategories;
  createdAt: string;
  updatedAt: string;
}

export type OnboardingStep =
  | 'no-design-intent'      // No design intent configured
  | 'design-intent-only'    // Has design intent but no repo connected
  | 'awaiting-scan'         // Repo connected but no scans yet
  | 'ready';                // Has scans, show normal dashboard

export interface OnboardingStatus {
  step: OnboardingStep;
  hasDesignIntent: boolean;
  hasConnectedRepo: boolean;
  hasScans: boolean;
  designIntent?: DesignIntent;
}
