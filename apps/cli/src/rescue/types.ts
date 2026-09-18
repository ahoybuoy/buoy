import type { Fix } from "@buoy-design/core";

export type RescueStatus =
  | "planned"
  | "applied"
  | "verified"
  | "guarded"
  | "verification_failed"
  | "rolled_back";

export interface RescueSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
}

export interface RescueFinding {
  id: string;
  fingerprint: string;
  type: string;
  severity: "critical" | "warning" | "info";
  file: string;
  line?: number;
  entity: string;
  message: string;
  classification: "safe-fix" | "review-required" | "accepted-legacy";
}

export interface RescueBackup {
  file: string;
  backupPath: string;
  beforeHash: string;
  afterHash?: string;
}

export interface RescueVerificationCommand {
  label: string;
  command: string;
  args: string[];
  exitCode: number | null;
  passed: boolean;
  output: string;
}

export interface RescueVerification {
  completedAt: string;
  passed: boolean;
  skipped: boolean;
  commands: RescueVerificationCommand[];
}

export interface RescueManifest {
  version: 1;
  id: string;
  projectRoot: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  status: RescueStatus;
  source: {
    branch: string | null;
    head: string | null;
  };
  rescueBranch?: string;
  before: {
    summary: RescueSummary;
    componentCount: number;
    tokenCount: number;
  };
  after?: {
    summary: RescueSummary;
    componentCount: number;
    tokenCount: number;
  };
  findings: RescueFinding[];
  safeFixes: Fix[];
  appliedFixIds: string[];
  backups: RescueBackup[];
  verification?: RescueVerification;
  baseline?: {
    reason: string;
    actor?: string;
    count: number;
    path: string;
    createdAt: string;
  };
}
