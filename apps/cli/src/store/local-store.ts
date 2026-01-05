/**
 * LocalScanStore - SQLite-based implementation of ScanStore.
 * Uses the @buoy-design/db package for persistence.
 */

import {
  setupDb,
  type BuoyDb,
  projects,
  scans,
  components,
  tokens,
  driftSignals,
  snapshots,
} from '@buoy-design/db';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { Component, DesignToken, DriftSignal } from '@buoy-design/core';
import type {
  ScanStore,
  StoredProject,
  StoredScan,
  ScanResults,
  ScanDiff,
  ScanSnapshot,
  ProjectConfig,
  ScanStats,
} from './types.js';

export interface LocalStoreConfig {
  dbPath?: string;
  inMemory?: boolean;
}

export class LocalScanStore implements ScanStore {
  private db: BuoyDb;
  private closeDb: () => void;

  constructor(config: LocalStoreConfig = {}) {
    const { db, close } = setupDb({
      path: config.dbPath,
      inMemory: config.inMemory,
    });
    this.db = db;
    this.closeDb = close;
  }

  async getOrCreateProject(name: string, config?: ProjectConfig): Promise<StoredProject> {
    // Try to find existing project
    const existing = await this.db
      .select()
      .from(projects)
      .where(eq(projects.name, name))
      .limit(1);

    if (existing.length > 0 && existing[0]) {
      const p = existing[0];
      return {
        id: p.id,
        name: p.name,
        repoUrl: p.repoUrl ?? undefined,
        figmaFileKeys: p.figmaFileKeys ? JSON.parse(p.figmaFileKeys) : undefined,
        storybookUrl: p.storybookUrl ?? undefined,
        config: p.config ? JSON.parse(p.config) : undefined,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    }

    // Create new project
    const now = new Date();
    const id = `proj_${randomUUID().slice(0, 8)}`;

    await this.db.insert(projects).values({
      id,
      name,
      repoUrl: config?.repoUrl,
      figmaFileKeys: config?.figmaFileKeys ? JSON.stringify(config.figmaFileKeys) : null,
      storybookUrl: config?.storybookUrl,
      config: config?.config ? JSON.stringify(config.config) : null,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      name,
      repoUrl: config?.repoUrl,
      figmaFileKeys: config?.figmaFileKeys,
      storybookUrl: config?.storybookUrl,
      config: config?.config,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getProject(projectId: string): Promise<StoredProject | null> {
    const result = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (result.length === 0 || !result[0]) return null;

    const p = result[0];
    return {
      id: p.id,
      name: p.name,
      repoUrl: p.repoUrl ?? undefined,
      figmaFileKeys: p.figmaFileKeys ? JSON.parse(p.figmaFileKeys) : undefined,
      storybookUrl: p.storybookUrl ?? undefined,
      config: p.config ? JSON.parse(p.config) : undefined,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  async startScan(projectId: string, sources: string[]): Promise<StoredScan> {
    const now = new Date();
    const id = `scan_${randomUUID().slice(0, 8)}`;

    await this.db.insert(scans).values({
      id,
      projectId,
      status: 'running',
      sources: JSON.stringify(sources),
      startedAt: now,
      createdAt: now,
    });

    return {
      id,
      projectId,
      status: 'running',
      sources,
      startedAt: now,
      createdAt: now,
    };
  }

  async completeScan(scanId: string, results: ScanResults): Promise<void> {
    const now = new Date();

    // Get the scan to get projectId
    const scanResult = await this.db
      .select()
      .from(scans)
      .where(eq(scans.id, scanId))
      .limit(1);

    if (scanResult.length === 0 || !scanResult[0]) {
      throw new Error(`Scan not found: ${scanId}`);
    }

    const scan = scanResult[0];
    const projectId = scan.projectId;

    // Calculate stats
    const stats: ScanStats = {
      componentCount: results.components.length,
      tokenCount: results.tokens.length,
      driftCount: results.drifts.length,
      duration: scan.startedAt ? now.getTime() - scan.startedAt.getTime() : undefined,
    };

    // Update scan status
    await this.db
      .update(scans)
      .set({
        status: 'completed',
        stats: JSON.stringify(stats),
        errors: results.errors ? JSON.stringify(results.errors) : null,
        completedAt: now,
      })
      .where(eq(scans.id, scanId));

    // Store components
    for (const component of results.components) {
      await this.db.insert(components).values({
        id: `comp_${randomUUID().slice(0, 8)}`,
        projectId,
        scanId,
        externalId: component.id,
        name: component.name,
        source: component.source.type,
        sourceLocation: JSON.stringify(component.source),
        props: JSON.stringify(component.props),
        variants: JSON.stringify(component.variants),
        tokenRefs: component.tokens ? JSON.stringify(component.tokens) : null,
        dependencies: component.dependencies ? JSON.stringify(component.dependencies) : null,
        metadata: component.metadata ? JSON.stringify(component.metadata) : null,
        scannedAt: now,
      });
    }

    // Store tokens
    for (const token of results.tokens) {
      await this.db.insert(tokens).values({
        id: `tok_${randomUUID().slice(0, 8)}`,
        projectId,
        scanId,
        externalId: token.id,
        name: token.name,
        category: token.category,
        value: JSON.stringify(token.value),
        source: JSON.stringify(token.source),
        aliases: token.aliases ? JSON.stringify(token.aliases) : null,
        usedBy: token.usedBy ? JSON.stringify(token.usedBy) : null,
        metadata: token.metadata ? JSON.stringify(token.metadata) : null,
        scannedAt: now,
      });
    }

    // Store drift signals
    for (const drift of results.drifts) {
      await this.db.insert(driftSignals).values({
        id: `drift_${randomUUID().slice(0, 8)}`,
        projectId,
        scanId,
        type: drift.type,
        severity: drift.severity,
        source: JSON.stringify(drift.source),
        target: drift.target ? JSON.stringify(drift.target) : null,
        message: drift.message,
        details: JSON.stringify(drift.details),
        detectedAt: drift.detectedAt,
      });
    }

    // Create snapshot
    const driftsBySeverity = {
      critical: results.drifts.filter(d => d.severity === 'critical').length,
      warning: results.drifts.filter(d => d.severity === 'warning').length,
      info: results.drifts.filter(d => d.severity === 'info').length,
    };

    const frameworks = [...new Set(results.components.map(c => c.source.type))];

    await this.db.insert(snapshots).values({
      id: `snap_${randomUUID().slice(0, 8)}`,
      projectId,
      scanId,
      componentCount: results.components.length,
      tokenCount: results.tokens.length,
      driftCount: results.drifts.length,
      summary: JSON.stringify({
        ...driftsBySeverity,
        frameworks,
      }),
      createdAt: now,
    });
  }

  async failScan(scanId: string, error: string): Promise<void> {
    await this.db
      .update(scans)
      .set({
        status: 'failed',
        errors: JSON.stringify([error]),
        completedAt: new Date(),
      })
      .where(eq(scans.id, scanId));
  }

  async getLatestScan(projectId: string): Promise<StoredScan | null> {
    const result = await this.db
      .select()
      .from(scans)
      .where(eq(scans.projectId, projectId))
      .orderBy(desc(scans.createdAt))
      .limit(1);

    if (result.length === 0 || !result[0]) return null;

    return this.mapScan(result[0]);
  }

  async getScans(projectId: string, limit = 10): Promise<StoredScan[]> {
    const result = await this.db
      .select()
      .from(scans)
      .where(eq(scans.projectId, projectId))
      .orderBy(desc(scans.createdAt))
      .limit(limit);

    return result.map(this.mapScan);
  }

  async getScan(scanId: string): Promise<StoredScan | null> {
    const result = await this.db
      .select()
      .from(scans)
      .where(eq(scans.id, scanId))
      .limit(1);

    if (result.length === 0 || !result[0]) return null;

    return this.mapScan(result[0]);
  }

  async getComponents(scanId: string): Promise<Component[]> {
    const result = await this.db
      .select()
      .from(components)
      .where(eq(components.scanId, scanId));

    return result.map((c: typeof components.$inferSelect) => ({
      id: c.externalId,
      name: c.name,
      source: JSON.parse(c.sourceLocation),
      props: c.props ? JSON.parse(c.props) : [],
      variants: c.variants ? JSON.parse(c.variants) : [],
      tokens: c.tokenRefs ? JSON.parse(c.tokenRefs) : [],
      dependencies: c.dependencies ? JSON.parse(c.dependencies) : [],
      metadata: c.metadata ? JSON.parse(c.metadata) : {},
      scannedAt: c.scannedAt,
    }));
  }

  async getTokens(scanId: string): Promise<DesignToken[]> {
    const result = await this.db
      .select()
      .from(tokens)
      .where(eq(tokens.scanId, scanId));

    return result.map((t: typeof tokens.$inferSelect) => ({
      id: t.externalId,
      name: t.name,
      category: t.category as DesignToken['category'],
      value: JSON.parse(t.value),
      source: JSON.parse(t.source),
      aliases: t.aliases ? JSON.parse(t.aliases) : undefined,
      usedBy: t.usedBy ? JSON.parse(t.usedBy) : undefined,
      metadata: t.metadata ? JSON.parse(t.metadata) : undefined,
      scannedAt: t.scannedAt,
    }));
  }

  async getDriftSignals(scanId: string): Promise<DriftSignal[]> {
    const result = await this.db
      .select()
      .from(driftSignals)
      .where(eq(driftSignals.scanId, scanId));

    return result.map((d: typeof driftSignals.$inferSelect) => ({
      id: d.id,
      type: d.type as DriftSignal['type'],
      severity: d.severity as DriftSignal['severity'],
      source: JSON.parse(d.source),
      target: d.target ? JSON.parse(d.target) : undefined,
      message: d.message,
      details: d.details ? JSON.parse(d.details) : {},
      detectedAt: d.detectedAt,
      resolvedAt: d.resolvedAt ?? undefined,
      resolution: d.resolution ? JSON.parse(d.resolution) : undefined,
    }));
  }

  async getSnapshots(projectId: string, limit = 10): Promise<ScanSnapshot[]> {
    const result = await this.db
      .select()
      .from(snapshots)
      .where(eq(snapshots.projectId, projectId))
      .orderBy(desc(snapshots.createdAt))
      .limit(limit);

    return result.map((s: typeof snapshots.$inferSelect) => ({
      id: s.id,
      projectId: s.projectId,
      scanId: s.scanId,
      componentCount: s.componentCount,
      tokenCount: s.tokenCount,
      driftCount: s.driftCount,
      coverageScore: s.coverageScore ?? undefined,
      summary: JSON.parse(s.summary),
      createdAt: s.createdAt,
    }));
  }

  async compareScan(currentScanId: string, previousScanId: string): Promise<ScanDiff> {
    const [currentComponents, previousComponents] = await Promise.all([
      this.getComponents(currentScanId),
      this.getComponents(previousScanId),
    ]);

    const [currentTokens, previousTokens] = await Promise.all([
      this.getTokens(currentScanId),
      this.getTokens(previousScanId),
    ]);

    const [currentDrifts, previousDrifts] = await Promise.all([
      this.getDriftSignals(currentScanId),
      this.getDriftSignals(previousScanId),
    ]);

    // Build maps for comparison
    const prevCompMap = new Map(previousComponents.map(c => [c.id, c]));
    const currCompMap = new Map(currentComponents.map(c => [c.id, c]));
    const prevTokenMap = new Map(previousTokens.map(t => [t.id, t]));
    const currTokenMap = new Map(currentTokens.map(t => [t.id, t]));
    const prevDriftMap = new Map(previousDrifts.map(d => [d.id, d]));
    const currDriftMap = new Map(currentDrifts.map(d => [d.id, d]));

    const diff: ScanDiff = {
      added: {
        components: currentComponents.filter(c => !prevCompMap.has(c.id)),
        tokens: currentTokens.filter(t => !prevTokenMap.has(t.id)),
        drifts: currentDrifts.filter(d => !prevDriftMap.has(d.id)),
      },
      removed: {
        components: previousComponents.filter(c => !currCompMap.has(c.id)),
        tokens: previousTokens.filter(t => !currTokenMap.has(t.id)),
        drifts: previousDrifts.filter(d => !currDriftMap.has(d.id)),
      },
      modified: {
        components: [],
        tokens: [],
      },
    };

    // Find modified components
    for (const curr of currentComponents) {
      const prev = prevCompMap.get(curr.id);
      if (prev && JSON.stringify(prev) !== JSON.stringify(curr)) {
        diff.modified.components.push({ before: prev, after: curr });
      }
    }

    // Find modified tokens
    for (const curr of currentTokens) {
      const prev = prevTokenMap.get(curr.id);
      if (prev && JSON.stringify(prev) !== JSON.stringify(curr)) {
        diff.modified.tokens.push({ before: prev, after: curr });
      }
    }

    return diff;
  }

  close(): void {
    this.closeDb();
  }

  private mapScan(s: typeof scans.$inferSelect): StoredScan {
    return {
      id: s.id,
      projectId: s.projectId,
      status: s.status as StoredScan['status'],
      sources: JSON.parse(s.sources),
      stats: s.stats ? JSON.parse(s.stats) : undefined,
      errors: s.errors ? JSON.parse(s.errors) : undefined,
      startedAt: s.startedAt ?? undefined,
      completedAt: s.completedAt ?? undefined,
      createdAt: s.createdAt,
    };
  }
}
