/**
 * Pure type re-exports for Worker-compatible environments.
 * Import from '@buoy-design/core/types' to avoid pulling in
 * Node.js dependencies (fs, glob, simple-git).
 */

// Drift types
export type {
  DriftSignal,
  DriftType,
  Severity,
  DriftSource,
  DriftDetails,
  DriftResolution,
  DriftResolutionType,
  GitContext,
} from './models/drift.js';

export {
  DriftTypeSchema,
  SeveritySchema,
  DriftSignalSchema,
  DriftSourceSchema,
  DriftDetailsSchema,
  DRIFT_TYPE_LABELS,
  DRIFT_TYPE_DESCRIPTIONS,
  SEVERITY_LABELS,
  getSeverityWeight,
  getDefaultSeverity,
} from './models/drift.js';

// Token types
export type {
  DesignToken,
  TokenCategory,
  TokenValue,
  ColorValue,
  SpacingValue,
  TypographyValue,
  ShadowValue,
  BorderValue,
  RawValue,
  TokenSource,
  TokenMetadata,
} from './models/token.js';

// Component types
export type {
  Component,
  PropDefinition,
  VariantDefinition,
  AccessibilityInfo,
  HardcodedValue,
  ComponentSource,
} from './models/component.js';
