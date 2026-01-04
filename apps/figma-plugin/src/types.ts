// Types for the Figma plugin
// These mirror the Buoy core types but are self-contained for the plugin

export type Severity = 'critical' | 'warning' | 'info';

export type IssueOwner = 'designer' | 'developer' | 'agent';

export type DriftType =
  | 'deprecated-pattern'
  | 'accessibility-conflict'
  | 'semantic-mismatch'
  | 'orphaned-component'
  | 'orphaned-token'
  | 'value-divergence'
  | 'naming-inconsistency'
  | 'missing-documentation'
  | 'hardcoded-value'
  | 'framework-sprawl';

export interface DriftSource {
  entityType: 'component' | 'token';
  entityId: string;
  entityName: string;
  location: string;
}

export interface GitContext {
  blame?: {
    author: string;
    email?: string;
    date: string;
    commitHash: string;
    commitMessage: string;
  };
  previousValue?: string;
  pullRequest?: {
    number: number;
    title: string;
    url?: string;
  };
}

export interface DriftDetails {
  expected?: unknown;
  actual?: unknown;
  diff?: string;
  affectedFiles?: string[];
  suggestions?: string[];
  tokenSuggestions?: string[];
  gitContext?: GitContext;
}

export interface DriftSignal {
  id: string;
  type: DriftType;
  severity: Severity;
  owner: IssueOwner;
  source: DriftSource;
  target?: DriftSource;
  message: string;
  details: DriftDetails;
  detectedAt: string;
  actionRequired: string;  // Clear action to fix this issue
}

export interface ReportSummary {
  coveragePercent: number;
  totalIssues: number;
  bySeverity: {
    critical: number;
    warning: number;
    info: number;
  };
  byOwner: {
    designer: number;
    developer: number;
    agent: number;
  };
}

export interface ReportResponse {
  generatedAt: string;
  summary: ReportSummary;
  issues: DriftSignal[];
}

// Human-readable labels
export const DRIFT_TYPE_LABELS: Record<DriftType, string> = {
  'deprecated-pattern': 'Deprecated Pattern',
  'accessibility-conflict': 'Accessibility Conflict',
  'semantic-mismatch': 'Semantic Mismatch',
  'orphaned-component': 'Orphaned Component',
  'orphaned-token': 'Orphaned Token',
  'value-divergence': 'Value Divergence',
  'naming-inconsistency': 'Naming Inconsistency',
  'missing-documentation': 'Missing Documentation',
  'hardcoded-value': 'Hardcoded Value',
  'framework-sprawl': 'Framework Sprawl',
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#DC2626',
  warning: '#F59E0B',
  info: '#3B82F6',
};

export const OWNER_LABELS: Record<IssueOwner, { icon: string; label: string }> = {
  designer: { icon: '👤', label: 'Designer needs to fix' },
  developer: { icon: '💻', label: 'Developer needs to fix' },
  agent: { icon: '🤖', label: 'Agent mistake' },
};
