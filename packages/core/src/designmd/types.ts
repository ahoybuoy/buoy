/**
 * Buoy-facing types that mirror @google/design.md/linter shapes.
 * Re-exported here so consumers don't import upstream directly.
 */

export interface DesignMdToken {
  [key: string]: unknown;
}

export interface DesignMdSystem {
  version?: string;
  name?: string;
  description?: string;
  colors?: Record<string, string>;
  typography?: Record<string, DesignMdToken>;
  rounded?: Record<string, string>;
  spacing?: Record<string, string | number>;
  components?: Record<string, Record<string, string>>;
}

export type DesignMdSeverity = "error" | "warning" | "info";

export interface DesignMdFinding {
  rule: string;
  severity: DesignMdSeverity;
  path: string;
  message: string;
}

export interface DesignMdSummary {
  errors: number;
  warnings: number;
  info: number;
}

export interface DesignMdResult {
  designSystem: DesignMdSystem;
  findings: DesignMdFinding[];
  summary: DesignMdSummary;
}
