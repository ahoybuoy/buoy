import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Projects table
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  repoUrl: text('repo_url'),
  figmaFileKeys: text('figma_file_keys'), // JSON array
  storybookUrl: text('storybook_url'),
  config: text('config'), // JSON
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Scans table
export const scans = sqliteTable('scans', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  status: text('status').notNull().default('pending'), // pending, running, completed, failed
  sources: text('sources').notNull(), // JSON array
  stats: text('stats'), // JSON
  errors: text('errors'), // JSON array
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Components table
export const components = sqliteTable('components', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  scanId: text('scan_id')
    .notNull()
    .references(() => scans.id),
  externalId: text('external_id').notNull(),
  name: text('name').notNull(),
  source: text('source').notNull(), // 'react' | 'figma' | 'storybook'
  sourceLocation: text('source_location').notNull(), // JSON
  props: text('props'), // JSON array
  variants: text('variants'), // JSON array
  tokenRefs: text('token_refs'), // JSON array
  dependencies: text('dependencies'), // JSON array
  metadata: text('metadata'), // JSON
  scannedAt: integer('scanned_at', { mode: 'timestamp' }).notNull(),
});

// Tokens table
export const tokens = sqliteTable('tokens', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  scanId: text('scan_id')
    .notNull()
    .references(() => scans.id),
  externalId: text('external_id').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  value: text('value').notNull(), // JSON
  source: text('source').notNull(), // JSON
  aliases: text('aliases'), // JSON array
  usedBy: text('usedby'), // JSON array
  metadata: text('metadata'), // JSON
  scannedAt: integer('scanned_at', { mode: 'timestamp' }).notNull(),
});

// Drift signals table
export const driftSignals = sqliteTable('drift_signals', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  scanId: text('scan_id').references(() => scans.id),
  type: text('type').notNull(),
  severity: text('severity').notNull(),
  source: text('source').notNull(), // JSON
  target: text('target'), // JSON
  message: text('message').notNull(),
  details: text('details'), // JSON
  claudeAnalysis: text('claude_analysis'),
  resolved: integer('resolved', { mode: 'boolean' }).default(false),
  resolution: text('resolution'), // JSON
  detectedAt: integer('detected_at', { mode: 'timestamp' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
});

// Intents table
export const intents = sqliteTable('intents', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  entityType: text('entity_type').notNull(), // 'component' | 'token' | 'pattern'
  entityId: text('entity_id').notNull(),
  entityName: text('entity_name').notNull(),
  decision: text('decision').notNull(), // JSON
  context: text('context'), // JSON
  status: text('status').notNull().default('active'),
  createdBy: text('created_by'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
});

// Snapshots table for historical tracking
export const snapshots = sqliteTable('snapshots', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  scanId: text('scan_id')
    .notNull()
    .references(() => scans.id),
  summary: text('summary').notNull(), // JSON
  componentCount: integer('component_count').notNull(),
  tokenCount: integer('token_count').notNull(),
  driftCount: integer('drift_count').notNull(),
  coverageScore: integer('coverage_score'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Type exports for use with Drizzle
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Scan = typeof scans.$inferSelect;
export type NewScan = typeof scans.$inferInsert;
export type DbComponent = typeof components.$inferSelect;
export type NewDbComponent = typeof components.$inferInsert;
export type DbToken = typeof tokens.$inferSelect;
export type NewDbToken = typeof tokens.$inferInsert;
export type DbDriftSignal = typeof driftSignals.$inferSelect;
export type NewDbDriftSignal = typeof driftSignals.$inferInsert;
export type DbIntent = typeof intents.$inferSelect;
export type NewDbIntent = typeof intents.$inferInsert;
export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;
