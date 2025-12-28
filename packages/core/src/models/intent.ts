import { z } from 'zod';

// Intent decision types
export const IntentDecisionTypeSchema = z.enum([
  'deprecation',
  'exception',
  'migration',
  'documentation',
  'standard',
]);

// Intent status
export const IntentStatusSchema = z.enum(['active', 'archived', 'expired']);

// Intent decision
export const IntentDecisionSchema = z.object({
  type: IntentDecisionTypeSchema,
  status: IntentStatusSchema,
  title: z.string(),
  description: z.string(),
  rationale: z.string(),
  alternatives: z.array(z.string()).optional(),
  migrationPath: z.string().optional(),
});

// Intent attachment
export const IntentAttachmentTypeSchema = z.enum(['link', 'document', 'figma', 'slack', 'github']);

export const IntentAttachmentSchema = z.object({
  type: IntentAttachmentTypeSchema,
  url: z.string(),
  title: z.string(),
});

// Intent context
export const IntentContextSchema = z.object({
  relatedDriftId: z.string().optional(),
  relatedComponents: z.array(z.string()).optional(),
  relatedTokens: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  attachments: z.array(IntentAttachmentSchema).optional(),
});

// Main Intent schema
export const IntentSchema = z.object({
  id: z.string(),
  entityType: z.enum(['component', 'token', 'pattern']),
  entityId: z.string(),
  entityName: z.string(),
  decision: IntentDecisionSchema,
  context: IntentContextSchema,
  createdAt: z.date(),
  createdBy: z.string().optional(),
  updatedAt: z.date().optional(),
  expiresAt: z.date().optional(),
});

// Types
export type IntentDecisionType = z.infer<typeof IntentDecisionTypeSchema>;
export type IntentStatus = z.infer<typeof IntentStatusSchema>;
export type IntentDecision = z.infer<typeof IntentDecisionSchema>;
export type IntentAttachmentType = z.infer<typeof IntentAttachmentTypeSchema>;
export type IntentAttachment = z.infer<typeof IntentAttachmentSchema>;
export type IntentContext = z.infer<typeof IntentContextSchema>;
export type Intent = z.infer<typeof IntentSchema>;

// Helper to create intent ID
export function createIntentId(
  entityType: Intent['entityType'],
  entityId: string,
  decisionType: IntentDecisionType
): string {
  return `intent:${entityType}:${entityId}:${decisionType}:${Date.now()}`;
}

// Helper to check if intent is expired
export function isIntentExpired(intent: Intent): boolean {
  if (!intent.expiresAt) return false;
  return new Date() > intent.expiresAt;
}

// Helper to check if intent applies to a drift
export function intentApplies(intent: Intent, driftId: string): boolean {
  if (intent.decision.status !== 'active') return false;
  if (isIntentExpired(intent)) return false;
  if (intent.context.relatedDriftId === driftId) return true;
  return false;
}

// Human-readable decision type labels
export const DECISION_TYPE_LABELS: Record<IntentDecisionType, string> = {
  deprecation: 'Deprecation',
  exception: 'Exception',
  migration: 'Migration',
  documentation: 'Documentation',
  standard: 'Standard',
};

// Human-readable status labels
export const STATUS_LABELS: Record<IntentStatus, string> = {
  active: 'Active',
  archived: 'Archived',
  expired: 'Expired',
};
