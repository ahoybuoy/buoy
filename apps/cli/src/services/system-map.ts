import { minimatch } from "minimatch";
import type { Component, DesignToken } from "@buoy-design/core";
import {
  collectUsages,
  normalizeComponentName,
  normalizeTokenName,
} from "@buoy-design/core";
import type { SystemConfig } from "../config/schema.js";

export type SystemEntityKind = "component" | "token";
export type SystemEntityClassification = "canonical" | "unmanaged";

export interface SystemConsumer {
  file: string;
  owner?: string;
  usages: number;
}

export interface SystemEntity {
  id: string;
  kind: SystemEntityKind;
  name: string;
  path?: string;
  classification: SystemEntityClassification;
  owner?: string;
  usageCount: number;
  consumers: SystemConsumer[];
  risk: "low" | "medium" | "high";
  deprecated: boolean;
}

export interface SystemMap {
  generatedAt: string;
  canonicalConfigured: boolean;
  summary: {
    canonicalComponents: number;
    canonicalTokens: number;
    unmanagedComponents: number;
    unmanagedTokens: number;
    observedUsages: number;
  };
  components: SystemEntity[];
  tokens: SystemEntity[];
}

export interface ChangeImpact {
  entity: SystemEntity;
  recommendation: string;
}

function sourcePath(entity: Component | DesignToken): string | undefined {
  return "path" in entity.source ? entity.source.path : undefined;
}

function matches(path: string | undefined, patterns: string[]): boolean {
  return (
    !!path &&
    patterns.some((pattern) => minimatch(path, pattern, { dot: true }))
  );
}

function ownerFor(
  path: string | undefined,
  config: SystemConfig,
): string | undefined {
  if (!path) return undefined;
  return config.owners.find((owner) => matches(path, owner.paths))?.name;
}

function riskFor(
  usageCount: number,
  consumerCount: number,
): SystemEntity["risk"] {
  if (usageCount >= 25 || consumerCount >= 3) return "high";
  if (usageCount >= 5 || consumerCount >= 2) return "medium";
  return "low";
}

function groupConsumers(
  usages: Array<{ filePath: string }>,
  config: SystemConfig,
): SystemConsumer[] {
  const counts = new Map<string, number>();
  for (const usage of usages) {
    counts.set(usage.filePath, (counts.get(usage.filePath) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([file, count]) => ({
      file,
      usages: count,
      owner: ownerFor(file, config),
    }))
    .sort((a, b) => b.usages - a.usages || a.file.localeCompare(b.file));
}

/**
 * Build a code-first map of the current design-system surface. It deliberately
 * does not need a design-tool integration: canonical intent is declared in
 * config and actual usage is observed from code.
 */
export async function buildSystemMap(input: {
  projectRoot: string;
  config: SystemConfig;
  components: Component[];
  tokens: DesignToken[];
}): Promise<SystemMap> {
  const { projectRoot, config, components, tokens } = input;
  const usages = await collectUsages({
    projectRoot,
    knownComponents: components.map((component) => component.name),
    knownTokens: tokens.map((token) => token.name),
  });

  const componentUsageByName = new Map<string, typeof usages.componentUsages>();
  for (const usage of usages.componentUsages) {
    const key = normalizeComponentName(usage.componentName);
    componentUsageByName.set(key, [
      ...(componentUsageByName.get(key) ?? []),
      usage,
    ]);
  }
  const tokenUsageByName = new Map<string, typeof usages.tokenUsages>();
  for (const usage of usages.tokenUsages) {
    const key = normalizeTokenName(usage.tokenName);
    tokenUsageByName.set(key, [...(tokenUsageByName.get(key) ?? []), usage]);
  }

  const mapComponent = (component: Component): SystemEntity => {
    const path = sourcePath(component);
    const consumers = groupConsumers(
      componentUsageByName.get(normalizeComponentName(component.name)) ?? [],
      config,
    );
    const usageCount = consumers.reduce(
      (total, consumer) => total + consumer.usages,
      0,
    );
    return {
      id: component.id,
      kind: "component",
      name: component.name,
      path,
      classification: matches(path, config.components)
        ? "canonical"
        : "unmanaged",
      owner: ownerFor(path, config),
      usageCount,
      consumers,
      risk: riskFor(usageCount, consumers.length),
      deprecated: component.metadata.deprecated === true,
    };
  };

  const mapToken = (token: DesignToken): SystemEntity => {
    const path = sourcePath(token);
    const consumers = groupConsumers(
      tokenUsageByName.get(normalizeTokenName(token.name)) ?? [],
      config,
    );
    const usageCount = consumers.reduce(
      (total, consumer) => total + consumer.usages,
      0,
    );
    return {
      id: token.id,
      kind: "token",
      name: token.name,
      path,
      classification: matches(path, config.tokens) ? "canonical" : "unmanaged",
      owner: ownerFor(path, config),
      usageCount,
      consumers,
      risk: riskFor(usageCount, consumers.length),
      deprecated: token.metadata.deprecated === true,
    };
  };

  const systemComponents = components
    .map(mapComponent)
    .sort(
      (a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name),
    );
  const systemTokens = tokens
    .map(mapToken)
    .sort(
      (a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name),
    );
  const allEntities = [...systemComponents, ...systemTokens];

  return {
    generatedAt: new Date().toISOString(),
    canonicalConfigured:
      config.components.length > 0 || config.tokens.length > 0,
    summary: {
      canonicalComponents: systemComponents.filter(
        (entity) => entity.classification === "canonical",
      ).length,
      canonicalTokens: systemTokens.filter(
        (entity) => entity.classification === "canonical",
      ).length,
      unmanagedComponents: systemComponents.filter(
        (entity) => entity.classification === "unmanaged",
      ).length,
      unmanagedTokens: systemTokens.filter(
        (entity) => entity.classification === "unmanaged",
      ).length,
      observedUsages: allEntities.reduce(
        (total, entity) => total + entity.usageCount,
        0,
      ),
    },
    components: systemComponents,
    tokens: systemTokens,
  };
}

export function findChangeImpact(
  map: SystemMap,
  name: string,
  kind?: SystemEntityKind,
): ChangeImpact | undefined {
  const normalized =
    kind === "token" ? normalizeTokenName(name) : normalizeComponentName(name);
  const candidates = [...map.components, ...map.tokens].filter(
    (entity) => !kind || entity.kind === kind,
  );
  const entity = candidates.find((candidate) => {
    const candidateName =
      candidate.kind === "token"
        ? normalizeTokenName(candidate.name)
        : normalizeComponentName(candidate.name);
    return candidateName === normalized;
  });
  if (!entity) return undefined;

  const recommendation =
    entity.usageCount === 0
      ? `No observed consumers. Confirm dynamic or external usage before removing ${entity.name}.`
      : entity.risk === "high"
        ? `Plan a staged migration: ${entity.name} has ${entity.usageCount} observed usages across ${entity.consumers.length} consumer file(s).`
        : `Review the ${entity.consumers.length} observed consumer file(s) before changing ${entity.name}.`;

  return { entity, recommendation };
}
