// apps/cli/src/services/drift-analysis.ts
/**
 * DriftAnalysisService - Consolidated drift detection workflow
 *
 * Handles the common pattern of:
 * 1. Scanning components via ScanOrchestrator
 * 2. Running SemanticDiffEngine analysis
 * 3. Applying ignore rules from config
 * 4. Filtering against baseline
 */

import type { DriftSignal, Severity, Component } from "@buoy-design/core";
import type { BuoyConfig } from "../config/schema.js";
import { ScanOrchestrator } from "../scan/orchestrator.js";
import { getSeverityWeight } from "@buoy-design/core";
import { TailwindScanner, ScanCache, extractStaticClassStrings } from "@buoy-design/scanners";
import {
  detectRepeatedPatterns,
  checkVariantConsistency,
  checkExampleCompliance,
  detectTokenUtilities,
  checkTokenUtilityUsage,
  type ClassOccurrence,
} from "@buoy-design/core";
import { glob } from "glob";
import { readFile } from "fs/promises";
import { resolve } from "path";

export interface DriftAnalysisOptions {
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
  /** Include baselined drifts (default: false) */
  includeBaseline?: boolean;
  /** Filter by minimum severity */
  minSeverity?: Severity;
  /** Filter by drift type */
  filterType?: string;
  /** Scan cache for incremental scanning */
  cache?: ScanCache;
  /** Enable variant consistency checking (Phase 4.1) */
  checkVariants?: boolean;
  /** Enable token utility detection (Phase 4.2) */
  checkTokenUtilities?: boolean;
  /** Enable example compliance checking (Phase 4.3) */
  checkExamples?: boolean;
}

export interface DriftAnalysisResult {
  /** All drifts after filtering */
  drifts: DriftSignal[];
  /** Components that were scanned */
  components: Component[];
  /** Number of drifts filtered out by baseline */
  baselinedCount: number;
  /** Summary counts by severity */
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
}

/**
 * Severity order for filtering and sorting (0 = lowest, 2 = highest)
 * Use getSeverityWeight from @buoy-design/core for consistent ordering
 */
const SEVERITY_ORDER: Record<Severity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

/**
 * Calculate summary counts for drift signals
 */
export function calculateDriftSummary(drifts: DriftSignal[]): {
  total: number;
  critical: number;
  warning: number;
  info: number;
} {
  return {
    total: drifts.length,
    critical: drifts.filter((d) => d.severity === "critical").length,
    warning: drifts.filter((d) => d.severity === "warning").length,
    info: drifts.filter((d) => d.severity === "info").length,
  };
}

/**
 * Determine if drifts exceed a severity threshold
 */
export function hasDriftsAboveThreshold(
  drifts: DriftSignal[],
  failOn: Severity | "none",
): boolean {
  if (failOn === "none") return false;
  const threshold = SEVERITY_ORDER[failOn] ?? SEVERITY_ORDER.critical;
  return drifts.some((d) => SEVERITY_ORDER[d.severity] >= threshold);
}

/**
 * Sort drifts by severity (critical first)
 */
export function sortDriftsBySeverity(drifts: DriftSignal[]): DriftSignal[] {
  return [...drifts].sort(
    (a, b) => getSeverityWeight(b.severity) - getSeverityWeight(a.severity),
  );
}

/**
 * Apply ignore rules from config to filter out matching drifts
 */
export function applyIgnoreRules(
  drifts: DriftSignal[],
  ignoreRules: BuoyConfig["drift"]["ignore"],
  onWarning?: (message: string) => void,
): DriftSignal[] {
  let filtered = drifts;

  for (const rule of ignoreRules) {
    filtered = filtered.filter((d) => {
      if (d.type !== rule.type) return true;
      if (!rule.pattern) return false;

      try {
        const regex = new RegExp(rule.pattern);
        return !regex.test(d.source.entityName);
      } catch {
        onWarning?.(
          `Invalid regex pattern "${rule.pattern}" in ignore rule, skipping`,
        );
        return true;
      }
    });
  }

  return filtered;
}

/**
 * Apply severity filter to drifts
 */
export function filterBySeverity(
  drifts: DriftSignal[],
  minSeverity: Severity,
): DriftSignal[] {
  const minLevel = SEVERITY_ORDER[minSeverity] ?? 0;
  return drifts.filter((d) => SEVERITY_ORDER[d.severity] >= minLevel);
}

/**
 * Apply type filter to drifts
 */
export function filterByType(
  drifts: DriftSignal[],
  type: string,
): DriftSignal[] {
  return drifts.filter((d) => d.type === type);
}

/**
 * Apply per-type severity overrides from config
 */
export function applySeverityOverrides(
  drifts: DriftSignal[],
  overrides: BuoyConfig["drift"]["severity"],
): DriftSignal[] {
  if (!overrides || Object.keys(overrides).length === 0) return drifts;
  return drifts.map((d) => {
    const override = overrides[d.type];
    return override ? { ...d, severity: override } : d;
  });
}

// Entry point file patterns - these components are rendered by the framework
// router, not imported by other components, so they should never be flagged as unused
const ENTRY_POINT_PATTERNS = [
  /\/pages?\//,           // Next.js pages/ or page.tsx
  /\/app\/.*page\./,      // Next.js App Router page.tsx
  /\/app\/.*layout\./,    // Next.js App Router layout.tsx
  /\/app\/.*loading\./,   // Next.js App Router loading.tsx
  /\/app\/.*error\./,     // Next.js App Router error.tsx
  /\/app\/.*not-found\./,  // Next.js App Router not-found.tsx
  /\/routes?\//,          // Remix/SvelteKit routes
  /\/\+page\./,           // SvelteKit +page.svelte
  /\/\+layout\./,         // SvelteKit +layout.svelte
];

function isEntryPointComponent(component: Component): boolean {
  const source = component.source;
  // Only file-based sources (react, vue, svelte) have a path field
  if (source.type === 'figma' || source.type === 'storybook') return false;
  const location = source.path || '';
  return ENTRY_POINT_PATTERNS.some(pattern => pattern.test(location));
}

/**
 * DriftAnalysisService - Main entry point for drift detection
 */
export class DriftAnalysisService {
  constructor(private config: BuoyConfig) {}

  /**
   * Run full drift analysis pipeline
   */
  async analyze(
    options: DriftAnalysisOptions = {},
  ): Promise<DriftAnalysisResult> {
    const {
      onProgress,
      includeBaseline,
      minSeverity,
      filterType,
      cache,
      checkVariants,
      checkTokenUtilities,
      checkExamples,
    } = options;

    // Step 1: Scan components
    onProgress?.("Scanning components...");
    const orchestrator = new ScanOrchestrator(this.config, process.cwd(), {
      cache,
    });
    const { components } = await orchestrator.scanComponents({
      onProgress,
    });

    // Step 2: Run semantic diff analysis
    onProgress?.("Analyzing drift...");
    const { SemanticDiffEngine } = await import("@buoy-design/core/analysis");
    const engine = new SemanticDiffEngine();
    const diffResult = engine.analyzeComponents(components, {
      checkDeprecated: true,
      checkNaming: true,
      checkDocumentation: true,
      checkAccessibility: true,
    });

    let drifts: DriftSignal[] = applySeverityOverrides(
      diffResult.drifts,
      this.config.drift.severity,
    );

    // Step 2.1: Check framework sprawl
    onProgress?.("Checking for framework sprawl...");
    const { ProjectDetector } = await import("../detect/project-detector.js");
    const detector = new ProjectDetector(process.cwd());
    const projectInfo = await detector.detect();
    if (projectInfo.frameworks.length > 0) {
      const sprawlDrift = engine.checkFrameworkSprawl(
        projectInfo.frameworks.map((f) => ({ name: f.name, version: f.version })),
      );
      if (sprawlDrift) {
        drifts.push(
          ...applySeverityOverrides([sprawlDrift], this.config.drift.severity),
        );
        onProgress?.(`Framework sprawl detected: ${projectInfo.frameworks.map((f) => f.name).join(", ")}`);
      }
    }

    // Step 2.2: Scan for unused components and tokens
    onProgress?.("Scanning for unused components and tokens...");
    const { collectUsages } = await import("@buoy-design/core");
    const { tokens: scannedTokens } = await orchestrator.scanTokens({ onProgress });

    const componentNames = components.map((c) => c.name);
    const tokenNames = scannedTokens.map((t) => t.name);

    const usageResult = await collectUsages({
      projectRoot: process.cwd(),
      knownComponents: componentNames,
      knownTokens: tokenNames,
    });

    // Build usage count maps
    const componentUsageMap = new Map<string, number>();
    for (const cu of usageResult.componentUsages) {
      componentUsageMap.set(
        cu.componentName,
        (componentUsageMap.get(cu.componentName) || 0) + 1,
      );
    }

    const tokenUsageMap = new Map<string, number>();
    for (const tu of usageResult.tokenUsages) {
      tokenUsageMap.set(
        tu.tokenName,
        (tokenUsageMap.get(tu.tokenName) || 0) + 1,
      );
    }

    // Fix 2: Count barrel file re-exports as usage
    // Components re-exported from barrel files (index.ts) are part of the public API
    await this.scanBarrelReExports(componentUsageMap);

    // Fix 3: Count dynamic imports as usage
    // React.lazy(() => import('./Component')) and next/dynamic patterns
    await this.scanDynamicImports(componentUsageMap);

    // Fix 1: Exempt entry point components (pages, routes, layouts)
    // These are rendered by the framework router, not imported by other components
    const nonEntryPointComponents = components.filter(c => !isEntryPointComponent(c));

    // Check for unused components (excluding entry points)
    const unusedComponentDrifts = engine.checkUnusedComponents(nonEntryPointComponents, componentUsageMap);
    if (unusedComponentDrifts.length > 0) {
      drifts.push(
        ...applySeverityOverrides(unusedComponentDrifts, this.config.drift.severity),
      );
      onProgress?.(`Found ${unusedComponentDrifts.length} unused components`);
    }

    // Check for unused tokens
    const unusedTokenDrifts = engine.checkUnusedTokens(scannedTokens, tokenUsageMap);
    if (unusedTokenDrifts.length > 0) {
      drifts.push(
        ...applySeverityOverrides(unusedTokenDrifts, this.config.drift.severity),
      );
      onProgress?.(`Found ${unusedTokenDrifts.length} unused tokens`);
    }

    // Step 2.3: Cross-source comparison (orphaned-component, orphaned-token, value-divergence)
    const { classifyComponents, classifyTokens } = await import("./source-classifier.js");
    const canonicalPatterns = this.config.sources.tokens?.canonical ?? [];
    const classifiedComponents = classifyComponents(components);
    const classifiedTokens = classifyTokens(scannedTokens, canonicalPatterns);

    if (classifiedComponents.canonical.length > 0 && classifiedComponents.code.length > 0) {
      onProgress?.(`Comparing ${classifiedComponents.code.length} code components against ${classifiedComponents.canonical.length} design components...`);
      const componentDiff = engine.compareComponents(
        classifiedComponents.code,
        classifiedComponents.canonical,
      );
      if (componentDiff.drifts.length > 0) {
        drifts.push(
          ...applySeverityOverrides(componentDiff.drifts, this.config.drift.severity),
        );
        onProgress?.(`Found ${componentDiff.drifts.length} cross-source component issues`);
      }
    }

    if (classifiedTokens.canonical.length > 0 && classifiedTokens.code.length > 0) {
      onProgress?.(`Comparing ${classifiedTokens.code.length} code tokens against ${classifiedTokens.canonical.length} design tokens...`);
      const tokenDiff = engine.compareTokens(
        classifiedTokens.code,
        classifiedTokens.canonical,
      );
      if (tokenDiff.drifts.length > 0) {
        drifts.push(
          ...applySeverityOverrides(tokenDiff.drifts, this.config.drift.severity),
        );
        onProgress?.(`Found ${tokenDiff.drifts.length} cross-source token issues`);
      }
    }

    // Step 2.5: Run Tailwind arbitrary value detection if tailwind is configured
    if (this.config.sources.tailwind?.enabled) {
      onProgress?.("Scanning for Tailwind arbitrary values...");
      const tailwindScanner = new TailwindScanner({
        projectRoot: process.cwd(),
        include: this.config.sources.tailwind.files,
        exclude: this.config.sources.tailwind.exclude,
        detectArbitraryValues: true,
      });

      const tailwindResult = await tailwindScanner.scan();
      if (tailwindResult.drifts.length > 0) {
        drifts = [
          ...drifts,
          ...applySeverityOverrides(
            tailwindResult.drifts,
            this.config.drift.severity,
          ),
        ];
        onProgress?.(
          `Found ${tailwindResult.drifts.length} Tailwind arbitrary value issues`,
        );
      }
    }

    // Step 2.6: Repeated pattern detection (always-on, opt-out via config)
    const repeatedPatternConfig = (this.config.drift?.types?.["repeated-pattern"] ?? {}) as {
      enabled?: boolean;
      minOccurrences?: number;
      matching?: "exact" | "tight" | "loose";
    };
    if (repeatedPatternConfig.enabled !== false) {
      onProgress?.("Detecting repeated patterns...");
      const patternDrifts = await this.detectRepeatedPatterns(repeatedPatternConfig);
      drifts.push(...patternDrifts);
      if (patternDrifts.length > 0) {
        onProgress?.(
          `Found ${patternDrifts.length} repeated pattern issues`,
        );
      }
    }

    // Step 2.7: Phase 4.1 - Cross-Variant Consistency Checking
    const variantCheckEnabled = checkVariants ?? this.config.drift?.types?.["value-divergence"]?.checkVariants;
    if (variantCheckEnabled) {
      onProgress?.("Checking variant consistency...");
      const variantDrifts = checkVariantConsistency(components);
      if (variantDrifts.length > 0) {
        drifts.push(
          ...applySeverityOverrides(variantDrifts, this.config.drift.severity),
        );
        onProgress?.(`Found ${variantDrifts.length} variant inconsistencies`);
      }
    }

    // Step 2.8: Phase 4.2 - Token Utility Function Detection
    const tokenUtilityCheckEnabled = checkTokenUtilities ?? this.config.drift?.types?.["hardcoded-value"]?.checkUtilities;
    if (tokenUtilityCheckEnabled) {
      onProgress?.("Detecting token utility functions...");
      const utilityAnalysis = detectTokenUtilities(components);
      if (utilityAnalysis.availableUtilities.length > 0) {
        onProgress?.(
          `Found ${utilityAnalysis.availableUtilities.length} token utilities: ${utilityAnalysis.availableUtilities.map((u) => u.name).join(", ")}`,
        );
        const utilityDrifts = checkTokenUtilityUsage(components, utilityAnalysis);
        if (utilityDrifts.length > 0) {
          drifts.push(
            ...applySeverityOverrides(utilityDrifts, this.config.drift.severity),
          );
          onProgress?.(`Found ${utilityDrifts.length} hardcoded values that could use utilities`);
        }
      }
    }

    // Step 2.9: Phase 4.3 - Example Code vs Production Code Analysis
    const exampleCheckEnabled = checkExamples ?? this.config.drift?.types?.["missing-documentation"]?.checkExamples;
    if (exampleCheckEnabled) {
      onProgress?.("Analyzing example code compliance...");
      const exampleDrifts = checkExampleCompliance(components);
      if (exampleDrifts.length > 0) {
        drifts.push(
          ...applySeverityOverrides(exampleDrifts, this.config.drift.severity),
        );
        onProgress?.(`Found ${exampleDrifts.length} example/documentation issues`);
      }
    }

    // Step 3: Apply severity filter (before other filters for efficiency)
    if (minSeverity) {
      drifts = filterBySeverity(drifts, minSeverity);
    }

    // Step 4: Apply type filter
    if (filterType) {
      drifts = filterByType(drifts, filterType);
    }

    // Step 5: Apply ignore rules from config
    drifts = applyIgnoreRules(drifts, this.config.drift.ignore, (msg) => {
      onProgress?.(`Warning: ${msg}`);
    });

    // Step 6: Apply baseline filtering
    let baselinedCount = 0;
    if (!includeBaseline) {
      const { loadBaseline, filterBaseline } =
        await import("../commands/baseline.js");
      const baseline = await loadBaseline();
      const filtered = filterBaseline(drifts, baseline);
      drifts = filtered.newDrifts;
      baselinedCount = filtered.baselinedCount;

      if (baselinedCount > 0) {
        onProgress?.(`Filtered out ${baselinedCount} baselined drift signals.`);
      }
    }

    return {
      drifts,
      components,
      baselinedCount,
      summary: calculateDriftSummary(drifts),
    };
  }

  /**
   * Scan barrel files (index.ts) for re-exports and count re-exported components as used.
   * Components re-exported from barrel files are part of the public API.
   */
  private async scanBarrelReExports(componentUsageMap: Map<string, number>): Promise<void> {
    const cwd = process.cwd();
    const barrelFiles = await glob('**/index.{ts,tsx,js,jsx}', {
      cwd,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
      nodir: true,
      maxDepth: 6,
    });

    for (const barrelFile of barrelFiles.slice(0, 50)) {
      try {
        const content = await readFile(resolve(cwd, barrelFile), 'utf-8');

        // Check for named re-exports: export { Button, Card } from './components'
        const namedPattern = /export\s*\{\s*([^}]+)\s*\}\s*from/g;
        let match: RegExpExecArray | null;
        while ((match = namedPattern.exec(content)) !== null) {
          const names = match[1]!.split(',').map(n => {
            // Handle "default as Name" and "Name as Alias"
            const parts = n.trim().split(/\s+as\s+/);
            return (parts[1] || parts[0] || '').trim();
          }).filter(n => n && /^[A-Z]/.test(n)); // Only PascalCase (component names)

          for (const name of names) {
            componentUsageMap.set(name, (componentUsageMap.get(name) || 0) + 1);
          }
        }

        // Check for wildcard re-exports: export * from './Button'
        // If the module name looks like a component name, count it
        const wildcardPattern = /export\s*\*\s*from\s*['"]\.\/([^'"]+)['"]/g;
        while ((match = wildcardPattern.exec(content)) !== null) {
          const moduleName = match[1]!;
          const segments = moduleName.split('/');
          const last = segments[segments.length - 1] || '';
          if (/^[A-Z]/.test(last)) {
            componentUsageMap.set(last, (componentUsageMap.get(last) || 0) + 1);
          }
        }
      } catch {
        // ignore unreadable files
      }
    }
  }

  /**
   * Scan source files for dynamic imports and count imported components as used.
   * Handles React.lazy(() => import('./Component')) and next/dynamic patterns.
   */
  private async scanDynamicImports(componentUsageMap: Map<string, number>): Promise<void> {
    const cwd = process.cwd();
    const sourceFiles = await glob('**/*.{tsx,jsx,ts,js}', {
      cwd,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/*.test.*', '**/*.spec.*'],
      nodir: true,
      maxDepth: 6,
    });

    for (const file of sourceFiles.slice(0, 200)) {
      try {
        const content = await readFile(resolve(cwd, file), 'utf-8');
        if (!content.includes('import(')) continue; // Quick check before regex

        const dynamicPattern = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
        let match: RegExpExecArray | null;
        while ((match = dynamicPattern.exec(content)) !== null) {
          const modulePath = match[1]!;
          const segments = modulePath.split('/');
          const last = (segments[segments.length - 1] || '').replace(/\.(tsx?|jsx?)$/, '');
          if (/^[A-Z]/.test(last)) {
            componentUsageMap.set(last, (componentUsageMap.get(last) || 0) + 1);
          }
        }
      } catch {
        // ignore unreadable files
      }
    }
  }

  /**
   * Detect repeated class patterns across source files
   */
  private async detectRepeatedPatterns(config: {
    minOccurrences?: number;
    matching?: "exact" | "tight" | "loose";
  }): Promise<DriftSignal[]> {
    const occurrences: ClassOccurrence[] = [];
    const cwd = process.cwd();

    // Find all source files
    const patterns = ["**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.svelte"];
    const ignore = ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/build/**"];

    const files = await glob(patterns, { cwd, ignore, absolute: true });

    for (const file of files) {
      try {
        const content = await readFile(file, "utf-8");
        const relativePath = file.replace(cwd + "/", "");

        // Extract static class strings using existing extractor
        const classStrings = extractStaticClassStrings(content);

        for (const cs of classStrings) {
          // Combine all classes into a single string
          const allClasses = cs.classes.join(" ");
          if (allClasses.trim()) {
            occurrences.push({
              classes: allClasses,
              file: relativePath,
              line: cs.line,
            });
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return detectRepeatedPatterns(occurrences, {
      minOccurrences: config.minOccurrences ?? 2,
      matching: config.matching ?? "exact",
    });
  }
}
