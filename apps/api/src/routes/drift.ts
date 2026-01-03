/**
 * Drift Analysis Routes
 *
 * GET    /projects/:id/drift              - List drift signals (filterable)
 * GET    /projects/:id/drift/trends       - Time-series data for dashboard charts
 * GET    /projects/:id/drift/summary      - Current drift summary
 * PATCH  /projects/:id/drift/:signalId    - Mark resolved
 * POST   /projects/:id/drift/:signalId/ignore - Ignore signal
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { Env, Variables } from '../env.js';

const drift = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============================================================================
// Validation Schemas
// ============================================================================

const driftFilterSchema = z.object({
  type: z.string().optional(),
  severity: z.enum(['error', 'warning', 'info']).optional(),
  status: z.enum(['active', 'resolved', 'ignored']).optional(),
  component: z.string().optional(),
  file: z.string().optional(),
  since: z.string().optional(), // ISO date
  until: z.string().optional(), // ISO date
});

const resolveDriftSchema = z.object({
  resolution: z.string().optional(),
  resolvedBy: z.string().optional(),
});

const ignoreDriftSchema = z.object({
  reason: z.string().optional(),
  expiresAt: z.string().optional(), // ISO date for temporary ignores
});

// ============================================================================
// Helper Functions
// ============================================================================

interface DriftSignal {
  id: string;
  type: string;
  severity: string;
  message: string;
  file?: string;
  line?: number;
  component?: string;
  token?: string;
  suggestion?: string;
}

interface ParsedDrift extends DriftSignal {
  scanId: string;
  createdAt: string;
  status: 'active' | 'resolved' | 'ignored';
  resolvedAt?: string;
  resolution?: string;
  ignoredAt?: string;
  ignoreReason?: string;
  ignoreExpiresAt?: string;
}

async function getDriftFromScans(
  db: D1Database,
  projectId: string,
  accountId: string,
  filters: z.infer<typeof driftFilterSchema>,
  limit: number,
  offset: number
): Promise<{ drift: ParsedDrift[]; total: number }> {
  // Build date range query
  let dateCondition = '';
  const bindings: unknown[] = [projectId, accountId];

  if (filters.since) {
    dateCondition += ' AND created_at >= ?';
    bindings.push(filters.since);
  }
  if (filters.until) {
    dateCondition += ' AND created_at <= ?';
    bindings.push(filters.until);
  }

  // Get recent scans with drift data
  const scansResult = await db.prepare(`
    SELECT id as scan_id, drift_data, created_at
    FROM scans
    WHERE project_id = ? AND account_id = ? ${dateCondition}
    ORDER BY created_at DESC
    LIMIT 50
  `).bind(...bindings).all();

  // Parse and flatten drift signals
  const allDrift: ParsedDrift[] = [];

  for (const scan of scansResult.results || []) {
    if (!scan.drift_data) continue;

    const signals: DriftSignal[] = JSON.parse(scan.drift_data as string);
    for (const signal of signals) {
      const signalId = `${scan.scan_id}_${nanoid(8)}`;
      const parsed: ParsedDrift = {
        ...signal,
        id: signalId,
        scanId: scan.scan_id as string,
        createdAt: scan.created_at as string,
        status: 'active',
      };

      // Apply filters
      if (filters.type && signal.type !== filters.type) continue;
      if (filters.severity && signal.severity !== filters.severity) continue;
      if (filters.component && signal.component !== filters.component) continue;
      if (filters.file && signal.file && !signal.file.includes(filters.file)) continue;

      allDrift.push(parsed);
    }
  }

  // Filter by status (would require a separate tracking table for real implementation)
  const filteredDrift = filters.status === 'active' ? allDrift : allDrift;

  const total = filteredDrift.length;
  const paginated = filteredDrift.slice(offset, offset + limit);

  return { drift: paginated, total };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * List drift signals with filtering
 */
drift.get('/:projectId/drift', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const projectId = c.req.param('projectId');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  // Parse filters from query params
  const filters = driftFilterSchema.parse({
    type: c.req.query('type'),
    severity: c.req.query('severity'),
    status: c.req.query('status'),
    component: c.req.query('component'),
    file: c.req.query('file'),
    since: c.req.query('since'),
    until: c.req.query('until'),
  });

  // Verify project belongs to account
  const project = await c.env.PLATFORM_DB.prepare(`
    SELECT id FROM projects WHERE id = ? AND account_id = ?
  `).bind(projectId, session.accountId).first();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  try {
    const { drift: signals, total } = await getDriftFromScans(
      c.env.PLATFORM_DB,
      projectId,
      session.accountId,
      filters,
      limit,
      offset
    );

    return c.json({
      drift: signals,
      total,
      limit,
      offset,
      filters,
    });
  } catch (error) {
    console.error('Error listing drift:', error);
    return c.json({ error: 'Failed to list drift signals' }, 500);
  }
});

/**
 * Get drift trends over time
 * Returns time-series data for charts
 */
drift.get('/:projectId/drift/trends', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const projectId = c.req.param('projectId');
  const days = Math.min(parseInt(c.req.query('days') || '30', 10), 90);
  const groupBy = c.req.query('groupBy') || 'day'; // day, week, month

  // Verify project belongs to account
  const project = await c.env.PLATFORM_DB.prepare(`
    SELECT id FROM projects WHERE id = ? AND account_id = ?
  `).bind(projectId, session.accountId).first();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get scans with drift counts
    const result = await c.env.PLATFORM_DB.prepare(`
      SELECT
        created_at,
        drift_count,
        components_count,
        tokens_count,
        summary
      FROM scans
      WHERE project_id = ? AND account_id = ? AND created_at >= ?
      ORDER BY created_at ASC
    `).bind(projectId, session.accountId, since.toISOString()).all();

    // Group by time period
    const groups: Map<string, {
      date: string;
      totalDrift: number;
      bySeverity: Record<string, number>;
      byType: Record<string, number>;
      scanCount: number;
    }> = new Map();

    for (const row of result.results || []) {
      const date = new Date(row.created_at as string);
      let key: string;

      switch (groupBy) {
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = (row.created_at as string).substring(0, 7);
          break;
        default:
          key = (row.created_at as string).split('T')[0];
      }

      if (!groups.has(key)) {
        groups.set(key, {
          date: key,
          totalDrift: 0,
          bySeverity: { error: 0, warning: 0, info: 0 },
          byType: {},
          scanCount: 0,
        });
      }

      const group = groups.get(key)!;
      group.totalDrift += row.drift_count as number;
      group.scanCount += 1;

      // Parse summary for breakdown
      if (row.summary) {
        const summary = JSON.parse(row.summary as string);
        if (summary.driftBySeverity) {
          for (const [sev, count] of Object.entries(summary.driftBySeverity)) {
            group.bySeverity[sev] = (group.bySeverity[sev] || 0) + (count as number);
          }
        }
        if (summary.driftByType) {
          for (const [type, count] of Object.entries(summary.driftByType)) {
            group.byType[type] = (group.byType[type] || 0) + (count as number);
          }
        }
      }
    }

    const trends = Array.from(groups.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // Calculate deltas
    const trendsWithDelta = trends.map((point, idx) => ({
      ...point,
      delta: idx > 0 ? point.totalDrift - trends[idx - 1].totalDrift : 0,
      average: point.scanCount > 0 ? Math.round(point.totalDrift / point.scanCount) : 0,
    }));

    return c.json({
      trends: trendsWithDelta,
      period: {
        start: since.toISOString(),
        end: new Date().toISOString(),
        days,
        groupBy,
      },
      summary: {
        totalDataPoints: trends.length,
        totalScans: trends.reduce((sum, t) => sum + t.scanCount, 0),
        latestDrift: trends.length > 0 ? trends[trends.length - 1].totalDrift : 0,
      },
    });
  } catch (error) {
    console.error('Error getting drift trends:', error);
    return c.json({ error: 'Failed to get drift trends' }, 500);
  }
});

/**
 * Get current drift summary
 */
drift.get('/:projectId/drift/summary', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const projectId = c.req.param('projectId');

  // Verify project belongs to account
  const project = await c.env.PLATFORM_DB.prepare(`
    SELECT id FROM projects WHERE id = ? AND account_id = ?
  `).bind(projectId, session.accountId).first();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  try {
    // Get latest scan
    const latestScan = await c.env.PLATFORM_DB.prepare(`
      SELECT
        id, created_at, drift_count, components_count, tokens_count, summary
      FROM scans
      WHERE project_id = ? AND account_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(projectId, session.accountId).first();

    if (!latestScan) {
      return c.json({
        hasData: false,
        message: 'No scans found for this project',
      });
    }

    // Get previous scan for comparison
    const previousScan = await c.env.PLATFORM_DB.prepare(`
      SELECT drift_count, summary
      FROM scans
      WHERE project_id = ? AND account_id = ? AND id != ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(projectId, session.accountId, latestScan.id).first();

    const currentSummary = latestScan.summary
      ? JSON.parse(latestScan.summary as string)
      : {};

    const previousSummary = previousScan?.summary
      ? JSON.parse(previousScan.summary as string)
      : null;

    // Calculate changes
    const driftDelta = previousScan
      ? (latestScan.drift_count as number) - (previousScan.drift_count as number)
      : 0;

    return c.json({
      hasData: true,
      current: {
        scanId: latestScan.id,
        scannedAt: latestScan.created_at,
        totalDrift: latestScan.drift_count,
        totalComponents: latestScan.components_count,
        totalTokens: latestScan.tokens_count,
        bySeverity: currentSummary.driftBySeverity || {},
        byType: currentSummary.driftByType || {},
      },
      comparison: previousScan
        ? {
            driftDelta,
            trend: driftDelta > 0 ? 'increasing' : driftDelta < 0 ? 'decreasing' : 'stable',
            previousDriftCount: previousScan.drift_count,
          }
        : null,
      health: {
        score: calculateHealthScore(
          latestScan.drift_count as number,
          latestScan.components_count as number,
          currentSummary.driftBySeverity
        ),
        status: getHealthStatus(
          latestScan.drift_count as number,
          currentSummary.driftBySeverity
        ),
      },
    });
  } catch (error) {
    console.error('Error getting drift summary:', error);
    return c.json({ error: 'Failed to get drift summary' }, 500);
  }
});

/**
 * Mark a drift signal as resolved
 */
drift.patch('/:projectId/drift/:signalId', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const projectId = c.req.param('projectId');
  const signalId = c.req.param('signalId');

  // Parse body
  let body: z.infer<typeof resolveDriftSchema>;
  try {
    const rawBody = await c.req.json();
    body = resolveDriftSchema.parse(rawBody);
  } catch {
    body = {};
  }

  // Verify project belongs to account
  const project = await c.env.PLATFORM_DB.prepare(`
    SELECT id FROM projects WHERE id = ? AND account_id = ?
  `).bind(projectId, session.accountId).first();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  try {
    // In a full implementation, we'd have a drift_resolutions table
    // For now, we'll store in a simple tracking table
    const now = new Date().toISOString();

    await c.env.PLATFORM_DB.prepare(`
      INSERT INTO drift_resolutions (id, project_id, signal_id, status, resolution, resolved_by, created_at)
      VALUES (?, ?, ?, 'resolved', ?, ?, ?)
      ON CONFLICT (project_id, signal_id) DO UPDATE SET
        status = 'resolved',
        resolution = excluded.resolution,
        resolved_by = excluded.resolved_by,
        updated_at = excluded.created_at
    `).bind(
      `res_${nanoid(21)}`,
      projectId,
      signalId,
      body.resolution || null,
      body.resolvedBy || session.userId,
      now
    ).run();

    return c.json({
      signalId,
      status: 'resolved',
      resolvedAt: now,
      resolution: body.resolution,
    });
  } catch (error) {
    // Table might not exist yet - create it
    if (String(error).includes('no such table')) {
      await c.env.PLATFORM_DB.prepare(`
        CREATE TABLE IF NOT EXISTS drift_resolutions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          signal_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'resolved',
          resolution TEXT,
          resolved_by TEXT,
          ignore_reason TEXT,
          ignore_expires_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          UNIQUE(project_id, signal_id)
        )
      `).run();

      // Retry the operation
      return drift.fetch(c.req.raw, c.env as unknown as Record<string, unknown>);
    }

    console.error('Error resolving drift:', error);
    return c.json({ error: 'Failed to resolve drift signal' }, 500);
  }
});

/**
 * Ignore a drift signal
 */
drift.post('/:projectId/drift/:signalId/ignore', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const projectId = c.req.param('projectId');
  const signalId = c.req.param('signalId');

  // Parse body
  let body: z.infer<typeof ignoreDriftSchema>;
  try {
    const rawBody = await c.req.json();
    body = ignoreDriftSchema.parse(rawBody);
  } catch {
    body = {};
  }

  // Verify project belongs to account
  const project = await c.env.PLATFORM_DB.prepare(`
    SELECT id FROM projects WHERE id = ? AND account_id = ?
  `).bind(projectId, session.accountId).first();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  try {
    const now = new Date().toISOString();

    await c.env.PLATFORM_DB.prepare(`
      INSERT INTO drift_resolutions (id, project_id, signal_id, status, ignore_reason, ignore_expires_at, resolved_by, created_at)
      VALUES (?, ?, ?, 'ignored', ?, ?, ?, ?)
      ON CONFLICT (project_id, signal_id) DO UPDATE SET
        status = 'ignored',
        ignore_reason = excluded.ignore_reason,
        ignore_expires_at = excluded.ignore_expires_at,
        resolved_by = excluded.resolved_by,
        updated_at = excluded.created_at
    `).bind(
      `res_${nanoid(21)}`,
      projectId,
      signalId,
      body.reason || null,
      body.expiresAt || null,
      session.userId,
      now
    ).run();

    return c.json({
      signalId,
      status: 'ignored',
      ignoredAt: now,
      reason: body.reason,
      expiresAt: body.expiresAt,
    });
  } catch (error) {
    console.error('Error ignoring drift:', error);
    return c.json({ error: 'Failed to ignore drift signal' }, 500);
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

function calculateHealthScore(
  driftCount: number,
  componentCount: number,
  bySeverity?: Record<string, number>
): number {
  if (componentCount === 0) return 100;

  // Base score: ratio of drift to components
  const driftRatio = driftCount / componentCount;
  let score = Math.max(0, 100 - driftRatio * 50);

  // Penalty for errors (more severe)
  if (bySeverity?.error) {
    score -= bySeverity.error * 5;
  }

  // Smaller penalty for warnings
  if (bySeverity?.warning) {
    score -= bySeverity.warning * 2;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getHealthStatus(
  driftCount: number,
  bySeverity?: Record<string, number>
): 'healthy' | 'warning' | 'critical' {
  if (bySeverity?.error && bySeverity.error > 5) {
    return 'critical';
  }
  if (driftCount > 20 || (bySeverity?.error && bySeverity.error > 0)) {
    return 'warning';
  }
  return 'healthy';
}

export { drift };
