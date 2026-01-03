/**
 * Server-Sent Events Routes
 *
 * GET /projects/:id/events - SSE stream for real-time project updates
 *
 * Events include:
 * - scan.completed: New scan uploaded
 * - drift.changed: Drift count changed
 * - member.joined: New member added
 * - member.left: Member removed
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Env, Variables } from '../env.js';

const events = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============================================================================
// Types
// ============================================================================

interface ProjectEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * SSE stream for project events
 *
 * Client usage:
 * const eventSource = new EventSource('/projects/prj_xxx/events');
 * eventSource.onmessage = (e) => console.log(JSON.parse(e.data));
 * eventSource.addEventListener('scan.completed', (e) => { ... });
 */
events.get('/:projectId/events', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const projectId = c.req.param('projectId');

  // Verify project belongs to account
  const project = await c.env.PLATFORM_DB.prepare(`
    SELECT id, name FROM projects WHERE id = ? AND account_id = ?
  `).bind(projectId, session.accountId).first();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Stream SSE events
  return streamSSE(c, async (stream) => {
    // Send initial connection event
    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({
        projectId,
        projectName: project.name,
        connectedAt: new Date().toISOString(),
      }),
    });

    // Store connection in KV for event broadcasting
    const connectionId = `conn_${session.userId}_${Date.now()}`;
    const connectionKey = `events:${projectId}:${connectionId}`;

    await c.env.SESSIONS.put(
      connectionKey,
      JSON.stringify({
        userId: session.userId,
        connectedAt: new Date().toISOString(),
      }),
      { expirationTtl: 3600 } // 1 hour max connection
    );

    // Poll for events (in production, use Durable Objects or Queues)
    let lastEventTime = new Date().toISOString();
    let isAborted = false;

    // Handle client disconnect
    stream.onAbort(() => {
      isAborted = true;
    });

    // Heartbeat and event polling loop
    while (!isAborted) {
      try {
        // Check for new events
        const eventData = await getNewEvents(
          c.env.PLATFORM_DB,
          projectId,
          session.accountId,
          lastEventTime
        );

        for (const event of eventData.events) {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event.data),
          });
          lastEventTime = event.timestamp;
        }

        // Send heartbeat every 30 seconds
        await stream.writeSSE({
          event: 'heartbeat',
          data: JSON.stringify({ timestamp: new Date().toISOString() }),
        });

        // Wait before next poll
        await stream.sleep(5000); // 5 second poll interval
      } catch (error) {
        if (!isAborted) {
          console.error('SSE error:', error);
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ message: 'Connection error' }),
          });
        }
        break;
      }
    }

    // Cleanup connection
    await c.env.SESSIONS.delete(connectionKey);
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

async function getNewEvents(
  db: D1Database,
  projectId: string,
  accountId: string,
  since: string
): Promise<{ events: ProjectEvent[] }> {
  const events: ProjectEvent[] = [];

  // Check for new scans
  const newScans = await db.prepare(`
    SELECT id, commit_sha, branch, drift_count, created_at
    FROM scans
    WHERE project_id = ? AND account_id = ? AND created_at > ?
    ORDER BY created_at ASC
    LIMIT 10
  `).bind(projectId, accountId, since).all();

  for (const scan of newScans.results || []) {
    events.push({
      type: 'scan.completed',
      data: {
        scanId: scan.id,
        commitSha: scan.commit_sha,
        branch: scan.branch,
        driftCount: scan.drift_count,
      },
      timestamp: scan.created_at as string,
    });
  }

  // Check for drift changes (compare latest two scans)
  if (newScans.results && newScans.results.length > 0) {
    const latestScan = newScans.results[newScans.results.length - 1];
    const previousScan = await db.prepare(`
      SELECT drift_count
      FROM scans
      WHERE project_id = ? AND account_id = ? AND id != ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(projectId, accountId, latestScan.id).first();

    if (previousScan) {
      const driftDelta = (latestScan.drift_count as number) - (previousScan.drift_count as number);
      if (driftDelta !== 0) {
        events.push({
          type: 'drift.changed',
          data: {
            scanId: latestScan.id,
            previousCount: previousScan.drift_count,
            currentCount: latestScan.drift_count,
            delta: driftDelta,
            trend: driftDelta > 0 ? 'increasing' : 'decreasing',
          },
          timestamp: latestScan.created_at as string,
        });
      }
    }
  }

  return { events };
}

// ============================================================================
// Event Publishing Utilities
// ============================================================================

/**
 * Publish an event to all connected clients
 * Call this from other routes when events occur
 */
export async function publishEvent(
  kv: KVNamespace,
  projectId: string,
  event: ProjectEvent
): Promise<void> {
  // Store event for polling (expires after 1 minute)
  const eventKey = `event:${projectId}:${Date.now()}`;
  await kv.put(eventKey, JSON.stringify(event), { expirationTtl: 60 });
}

/**
 * Create event for scan completion
 */
export function createScanCompletedEvent(
  scanId: string,
  commitSha: string | null,
  branch: string | null,
  driftCount: number
): ProjectEvent {
  return {
    type: 'scan.completed',
    data: { scanId, commitSha, branch, driftCount },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create event for member joining
 */
export function createMemberJoinedEvent(
  userId: string,
  name: string,
  email: string,
  role: string
): ProjectEvent {
  return {
    type: 'member.joined',
    data: { userId, name, email, role },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create event for member leaving
 */
export function createMemberLeftEvent(
  userId: string,
  name: string
): ProjectEvent {
  return {
    type: 'member.left',
    data: { userId, name },
    timestamp: new Date().toISOString(),
  };
}

export { events };
