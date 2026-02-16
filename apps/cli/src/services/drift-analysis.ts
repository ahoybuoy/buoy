// apps/cli/src/services/drift-analysis.ts
/**
 * DriftAnalysisService - Consolidated drift detection workflow
 *
 * Handles the common pattern of:
 * 1. Scanning components via ScanOrchestrator
 * 2. Running SemanticDiffEngine analysis
 * 3. Applying ignore rules from config
 * 4. Filtering against ignore list
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
import { minimatch } from "minimatch";
import { readFile } from "fs/promises";
import { resolve } from "path";

export interface DriftAnalysisOptions {
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
  /** Include ignored drifts (default: false) */
  includeIgnored?: boolean;
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
  /** Number of drifts filtered out by ignore list */
  ignoredCount: number;
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
 * Shared filter fields used by ignore, promote, and enforce rules.
 * All fields optional — multiple = AND logic.
 */
export interface DriftRuleFilter {
  type?: string;
  severity?: string;
  file?: string;
  component?: string;
  token?: string;
  value?: string;
}

/**
 * Apply ignore rules from config to filter out matching drifts.
 * Each rule can filter by type, file (glob), component (regex),
 * token (regex), and/or value (regex). Multiple fields = AND.
 * Multiple rules = OR (any rule can ignore a drift).
 */
export function applyIgnoreRules(
  drifts: DriftSignal[],
  ignoreRules: BuoyConfig["drift"]["ignore"],
  onWarning?: (message: string) => void,
): DriftSignal[] {
  if (ignoreRules.length === 0) return drifts;

  return drifts.filter((d) => {
    // Keep drift if NO rule matches it (rules are OR'd)
    for (const rule of ignoreRules) {
      if (ruleMatches(d, rule, onWarning)) return false;
    }
    return true;
  });
}

/**
 * Apply promote rules — elevate severity of matching drifts.
 * Each rule specifies filter dimensions + `to` (target severity).
 * Multiple rules = OR (first match wins).
 */
export function applyPromoteRules(
  drifts: DriftSignal[],
  rules: Array<DriftRuleFilter & { to: Severity; reason: string }>,
  onWarning?: (message: string) => void,
): DriftSignal[] {
  if (rules.length === 0) return drifts;

  return drifts.map((d) => {
    for (const rule of rules) {
      if (ruleMatches(d, rule, onWarning)) {
        return { ...d, severity: rule.to };
      }
    }
    return d;
  });
}

/**
 * Apply enforce rules — always set matching drifts to critical.
 * Delegates to applyPromoteRules with `to: 'critical'`.
 */
export function applyEnforceRules(
  drifts: DriftSignal[],
  rules: Array<DriftRuleFilter & { reason: string }>,
  onWarning?: (message: string) => void,
): DriftSignal[] {
  if (rules.length === 0) return drifts;

  const promoteRules = rules.map((rule) => ({ ...rule, to: "critical" as Severity }));
  return applyPromoteRules(drifts, promoteRules, onWarning);
}

function ruleMatches(
  d: DriftSignal,
  rule: DriftRuleFilter,
  onWarning?: (message: string) => void,
): boolean {
  const { type, severity, file, component, token, value } = rule;

  // Rule with no filter dimensions does nothing
  if (!type && !severity && !file && !component && !token && !value) return false;

  // All specified dimensions must match (AND logic)
  if (type && d.type !== type) return false;
  if (severity && d.severity !== severity) return false;

  if (file) {
    // Strip line numbers from location (e.g., "Button.tsx:42" → "Button.tsx")
    const loc = d.source.location.replace(/:\d+$/, "");
    if (!minimatch(loc, file)) return false;
  }

  if (component) {
    if (d.source.entityType !== "component") return false;
    try {
      if (!new RegExp(component).test(d.source.entityName)) return false;
    } catch {
      onWarning?.(`Invalid regex "${component}" in ignore rule component field, skipping`);
      return false;
    }
  }

  if (token) {
    if (d.source.entityType !== "token") return false;
    try {
      if (!new RegExp(token).test(d.source.entityName)) return false;
    } catch {
      onWarning?.(`Invalid regex "${token}" in ignore rule token field, skipping`);
      return false;
    }
  }

  if (value) {
    const actual = d.details.actual != null ? String(d.details.actual) : "";
    try {
      if (!new RegExp(value).test(actual)) return false;
    } catch {
      onWarning?.(`Invalid regex "${value}" in ignore rule value field, skipping`);
      return false;
    }
  }

  return true;
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
  /\/app\/.*template\./,  // Next.js App Router template.tsx
  /\/routes?\//,          // Remix/SvelteKit routes
  /\/\+page\./,           // SvelteKit +page.svelte
  /\/\+layout\./,         // SvelteKit +layout.svelte
  /\/\+error\./,          // SvelteKit +error.svelte
  /\/\+server\./,         // SvelteKit +server.ts
  /\/views?\//,           // Vue views directory
  /\/screens?\//,         // React Native screens
  /\.astro$/,             // Astro page/layout components are auto-routed
  /\/(app|main|index)\.(tsx|jsx)$/,  // App root / main entry / index component files
  /\/_app\./,             // Next.js custom App
  /\/_document\./,        // Next.js custom Document
  /\/root\./,             // Remix root
  /\/entry\./,            // Entry files
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
      includeIgnored,
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

    // Step 2: Scan tokens (before analysis, so suggestions can be generated)
    onProgress?.("Scanning tokens...");
    const { tokens: scannedTokens } = await orchestrator.scanTokens({ onProgress });

    // Step 2.1: Run semantic diff analysis
    onProgress?.("Analyzing drift...");
    const { SemanticDiffEngine } = await import("@buoy-design/core/analysis");
    const engine = new SemanticDiffEngine();
    const diffResult = engine.analyzeComponents(components, {
      checkDeprecated: true,
      checkNaming: true,
      checkDocumentation: true,
      checkAccessibility: true,
      availableTokens: scannedTokens,
    });

    let drifts: DriftSignal[] = applySeverityOverrides(
      diffResult.drifts,
      this.config.drift.severity,
    );

    // Step 2.2: Check framework sprawl
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

    // Step 2.3: Scan for unused components and tokens
    onProgress?.("Scanning for unused components and tokens...");
    const { collectUsages } = await import("@buoy-design/core");

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

    // Fix 4: Count Vue/Svelte template component references as usage
    // <MyComponent /> in .vue and .svelte template blocks
    await this.scanTemplateComponentUsage(componentUsageMap, componentNames);

    // Fix 5: Count Vue auto-registration patterns as usage
    // app.component('MyComponent', ...) and Vue.component('MyComponent', ...)
    await this.scanAutoRegistration(componentUsageMap);

    // Fix 6: Count Angular NgModule declarations as usage
    // @NgModule({ declarations: [ButtonComponent, ...] })
    await this.scanNgModuleDeclarations(componentUsageMap);

    // Fix 7: Count Storybook story file imports as usage
    // Button.stories.tsx importing { Button } means Button is documented/tested
    await this.scanStoryFileUsages(componentUsageMap);

    // Fix 8: Count Lit/Web Component registrations as usage
    await this.scanWebComponentRegistrations(componentUsageMap);

    // Fix 9: Treat Nuxt components/ dir as auto-imported
    const componentNameSet = new Set(componentNames);
    await this.scanNuxtAutoImports(componentUsageMap, componentNameSet);

    // Fix 10: Count test file imports as usage
    // Components imported in .test.tsx/.spec.tsx are actively maintained
    await this.scanTestFileUsages(componentUsageMap);

    // Fix 11: Count HOC/wrapper patterns as usage
    // forwardRef(Component), memo(Component), styled(Component), withXxx(Component)
    await this.scanHOCWrapperUsages(componentUsageMap);

    // Fix 12: Component library detection — if package.json exports components,
    // all exported components are the product's public API
    await this.scanPackageExports(componentUsageMap);

    // Fix 13: Detect components passed as values (props, object properties, arguments)
    // e.g. transition={DialogTransition} or { toolbarAccount: AccountPopover }
    await this.scanComponentAsValueUsages(componentUsageMap, componentNames);

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

    // Step 2.4: Cross-source comparison (orphaned-component, orphaned-token, value-divergence)
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

    // Step 2.5: Run Tailwind arbitrary value detection
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

    // Step 5: Apply promote rules from config
    if (this.config.drift.promote && this.config.drift.promote.length > 0) {
      drifts = applyPromoteRules(drifts, this.config.drift.promote, (msg) => {
        onProgress?.(`Warning: ${msg}`);
      });
    }

    // Step 6: Apply enforce rules from config
    if (this.config.drift.enforce && this.config.drift.enforce.length > 0) {
      drifts = applyEnforceRules(drifts, this.config.drift.enforce, (msg) => {
        onProgress?.(`Warning: ${msg}`);
      });
    }

    // Step 7: Apply ignore rules from config
    drifts = applyIgnoreRules(drifts, this.config.drift.ignore, (msg) => {
      onProgress?.(`Warning: ${msg}`);
    });

    // Step 8: Apply ignore list filtering
    let ignoredCount = 0;
    if (!includeIgnored) {
      const { loadIgnoreList, filterIgnored } =
        await import("../commands/ignore.js");
      const ignoreList = await loadIgnoreList();
      const filtered = filterIgnored(drifts, ignoreList);
      drifts = filtered.newDrifts;
      ignoredCount = filtered.ignoredCount;

      if (ignoredCount > 0) {
        onProgress?.(`Filtered out ${ignoredCount} ignored drift signals.`);
      }
    }

    return {
      drifts,
      components,
      ignoredCount,
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

    for (const barrelFile of barrelFiles.slice(0, 200)) {
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

        // Check for default re-exports: export { default as Button } from './Button'
        const defaultReExportPattern = /export\s*\{\s*default\s+as\s+([A-Z][a-zA-Z0-9]*)\s*\}\s*from/g;
        while ((match = defaultReExportPattern.exec(content)) !== null) {
          const name = match[1]!;
          componentUsageMap.set(name, (componentUsageMap.get(name) || 0) + 1);
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
   * Scan Vue, Svelte, and Angular template blocks for component usage.
   * Vue SFCs reference components in <template> blocks as <MyComponent />,
   * Angular templates use <app-my-component> selectors,
   * which aren't detected by JS import scanning.
   */
  private async scanTemplateComponentUsage(
    componentUsageMap: Map<string, number>,
    knownComponents: string[],
  ): Promise<void> {
    if (knownComponents.length === 0) return;
    const cwd = process.cwd();
    const templateFiles = await glob('**/*.{vue,svelte,html}', {
      cwd,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
      nodir: true,
      maxDepth: 8,
    });

    const knownSet = new Set(knownComponents);
    // Build a kebab-case lookup for Vue/Angular (MyComponent -> my-component)
    const kebabMap = new Map<string, string>();
    for (const name of knownComponents) {
      const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      kebabMap.set(kebab, name);
      // Angular selectors often use app- prefix: ButtonComponent -> app-button
      const angularSelector = `app-${kebab.replace(/-component$/, '')}`;
      kebabMap.set(angularSelector, name);
    }

    for (const file of templateFiles.slice(0, 300)) {
      try {
        const content = await readFile(resolve(cwd, file), 'utf-8');

        // Match PascalCase component tags: <MyComponent or <MyComponent>
        const pascalPattern = /<([A-Z][a-zA-Z0-9]*)\s*/g;
        let match: RegExpExecArray | null;
        while ((match = pascalPattern.exec(content)) !== null) {
          const name = match[1]!;
          if (knownSet.has(name)) {
            componentUsageMap.set(name, (componentUsageMap.get(name) || 0) + 1);
          }
        }

        // Match kebab-case component tags in Vue: <my-component or <my-component>
        const kebabPattern = /<([a-z][a-z0-9]*(?:-[a-z0-9]+)+)[\s>/]/g;
        while ((match = kebabPattern.exec(content)) !== null) {
          const kebab = match[1]!;
          const pascal = kebabMap.get(kebab);
          if (pascal) {
            componentUsageMap.set(pascal, (componentUsageMap.get(pascal) || 0) + 1);
          }
        }
      } catch {
        // ignore unreadable files
      }
    }
  }

  /**
   * Scan for Vue auto-registration patterns.
   * Detects app.component('Name', ...) and Vue.component('Name', ...) calls.
   */
  private async scanAutoRegistration(componentUsageMap: Map<string, number>): Promise<void> {
    const cwd = process.cwd();
    const sourceFiles = await glob('**/*.{ts,js,tsx,jsx}', {
      cwd,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
      nodir: true,
      maxDepth: 4,
    });

    for (const file of sourceFiles.slice(0, 100)) {
      try {
        const content = await readFile(resolve(cwd, file), 'utf-8');
        if (!content.includes('.component(')) continue;

        // Match: app.component('Name', ...) or Vue.component('Name', ...)
        const pattern = /\.component\(\s*['"]([A-Z][a-zA-Z0-9]*)['"]/g;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content)) !== null) {
          const name = match[1]!;
          componentUsageMap.set(name, (componentUsageMap.get(name) || 0) + 1);
        }
      } catch {
        // ignore unreadable files
      }
    }
  }

  /**
   * Scan Angular NgModule files for declared components.
   * Components in declarations: [...] are registered and should count as used.
   */
  private async scanNgModuleDeclarations(componentUsageMap: Map<string, number>): Promise<void> {
    const cwd = process.cwd();
    const moduleFiles = await glob('**/*.module.ts', {
      cwd,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      nodir: true,
      maxDepth: 8,
    });

    for (const file of moduleFiles.slice(0, 50)) {
      try {
        const content = await readFile(resolve(cwd, file), 'utf-8');
        if (!content.includes('declarations')) continue;

        // Match declarations: [Component1, Component2, ...]
        const declMatch = content.match(/declarations\s*:\s*\[([\s\S]*?)\]/);
        if (declMatch) {
          const names = declMatch[1]!.match(/\b([A-Z][a-zA-Z]+(?:Component|Directive|Pipe))\b/g);
          if (names) {
            for (const name of names) {
              componentUsageMap.set(name, (componentUsageMap.get(name) || 0) + 1);
            }
          }
        }

        // Also match imports: [...] and exports: [...] arrays
        for (const key of ['imports', 'exports']) {
          const match = content.match(new RegExp(`${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`));
          if (match) {
            const names = match[1]!.match(/\b([A-Z][a-zA-Z]+(?:Component|Module))\b/g);
            if (names) {
              for (const name of names) {
                componentUsageMap.set(name, (componentUsageMap.get(name) || 0) + 1);
              }
            }
          }
        }
      } catch {
        // ignore unreadable files
      }
    }
  }

  /**
   * Scan Storybook story files for component imports.
   * A component referenced in a .stories file is documented/tested and should count as used.
   */
  private async scanStoryFileUsages(componentUsageMap: Map<string, number>): Promise<void> {
    const cwd = process.cwd();
    const storyFiles = await glob('**/*.stories.{ts,tsx,js,jsx}', {
      cwd,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      nodir: true,
      maxDepth: 8,
    });

    for (const file of storyFiles.slice(0, 200)) {
      try {
        const content = await readFile(resolve(cwd, file), 'utf-8');

        // Match named imports: import { Button, Card } from '...'
        const importPattern = /import\s*\{\s*([^}]+)\s*\}\s*from/g;
        let match: RegExpExecArray | null;
        while ((match = importPattern.exec(content)) !== null) {
          const names = match[1]!.split(',').map(n => {
            const parts = n.trim().split(/\s+as\s+/);
            return (parts[0] || '').trim();
          }).filter(n => n && /^[A-Z]/.test(n));

          for (const name of names) {
            componentUsageMap.set(name, (componentUsageMap.get(name) || 0) + 1);
          }
        }

        // Match default imports: import Button from '...'
        const defaultImportPattern = /import\s+([A-Z][a-zA-Z0-9]*)\s+from/g;
        while ((match = defaultImportPattern.exec(content)) !== null) {
          const name = match[1]!;
          componentUsageMap.set(name, (componentUsageMap.get(name) || 0) + 1);
        }

        // Match CSF3 component meta: component: Button or component: () => Button
        const metaPattern = /component\s*:\s*([A-Z][a-zA-Z0-9]*)/g;
        while ((match = metaPattern.exec(content)) !== null) {
          const name = match[1]!;
          componentUsageMap.set(name, (componentUsageMap.get(name) || 0) + 1);
        }
      } catch {
        // ignore unreadable files
      }
    }
  }

  /**
   * Scan for Lit and Web Component registration patterns.
   * customElements.define('my-button', MyButton) and @customElement('my-button')
   * mean the component is registered and used by the browser.
   */
  private async scanWebComponentRegistrations(componentUsageMap: Map<string, number>): Promise<void> {
    const cwd = process.cwd();
    const files = await glob('**/*.{ts,js}', {
      cwd,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.d.ts', '**/*.spec.*', '**/*.test.*'],
      nodir: true,
      maxDepth: 8,
    });

    for (const file of files.slice(0, 500)) {
      try {
        const content = await readFile(resolve(cwd, file), 'utf-8');

        // Match customElements.define('tag-name', ClassName)
        const definePattern = /customElements\.define\s*\(\s*['"][^'"]+['"]\s*,\s*([A-Z][a-zA-Z0-9]*)/g;
        let match: RegExpExecArray | null;
        while ((match = definePattern.exec(content)) !== null) {
          componentUsageMap.set(match[1]!, (componentUsageMap.get(match[1]!) || 0) + 1);
        }

        // Match @customElement('tag-name') decorator
        const decoratorPattern = /@customElement\s*\(\s*['"][^'"]+['"]\s*\)/g;
        if (decoratorPattern.test(content)) {
          // The class following this decorator is registered
          const classPattern = /class\s+([A-Z][a-zA-Z0-9]*)\s+extends/g;
          while ((match = classPattern.exec(content)) !== null) {
            componentUsageMap.set(match[1]!, (componentUsageMap.get(match[1]!) || 0) + 1);
          }
        }
      } catch {
        // ignore unreadable files
      }
    }
  }

  /**
   * In Nuxt 3, components in the components/ directory are auto-imported globally.
   * If we detect Nuxt (nuxt.config.ts exists), mark all components in components/ as used.
   */
  private async scanNuxtAutoImports(componentUsageMap: Map<string, number>, componentNames: Set<string>): Promise<void> {
    const cwd = process.cwd();
    // Check for Nuxt config
    const nuxtConfigs = await glob('nuxt.config.{ts,js,mjs}', { cwd, nodir: true });
    if (nuxtConfigs.length === 0) return;

    // In Nuxt, all components in components/ are auto-imported
    for (const name of componentNames) {
      // Mark as used (they're available globally via auto-import)
      componentUsageMap.set(name, (componentUsageMap.get(name) || 0) + 1);
    }
  }

  /**
   * Scan test files for component imports.
   * Components imported in .test.tsx/.spec.tsx are actively maintained/tested.
   */
  private async scanTestFileUsages(componentUsageMap: Map<string, number>): Promise<void> {
    const cwd = process.cwd();
    const testFiles = await glob('**/*.{test,spec}.{ts,tsx,js,jsx}', {
      cwd,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      nodir: true,
      maxDepth: 8,
    });

    for (const file of testFiles.slice(0, 300)) {
      try {
        const content = await readFile(resolve(cwd, file), 'utf-8');

        // Match named imports: import { Button, Card } from '...'
        const importPattern = /import\s*\{\s*([^}]+)\s*\}\s*from/g;
        let match: RegExpExecArray | null;
        while ((match = importPattern.exec(content)) !== null) {
          const names = match[1]!.split(',').map(n => {
            const parts = n.trim().split(/\s+as\s+/);
            return (parts[0] || '').trim();
          }).filter(n => n && /^[A-Z]/.test(n));

          for (const name of names) {
            componentUsageMap.set(name, (componentUsageMap.get(name) || 0) + 1);
          }
        }

        // Match default imports: import Button from '...'
        const defaultImportPattern = /import\s+([A-Z][a-zA-Z0-9]*)\s+from/g;
        while ((match = defaultImportPattern.exec(content)) !== null) {
          const name = match[1]!;
          componentUsageMap.set(name, (componentUsageMap.get(name) || 0) + 1);
        }
      } catch {
        // ignore unreadable files
      }
    }
  }

  /**
   * Scan for HOC and wrapper patterns that count as component usage.
   * Detects forwardRef(Component), memo(Component), styled(Component),
   * withXxx(Component), Object.assign(Component, { ... }), and
   * compound component patterns like Component.Sub = SubComponent.
   */
  private async scanHOCWrapperUsages(componentUsageMap: Map<string, number>): Promise<void> {
    const cwd = process.cwd();
    const sourceFiles = await glob('**/*.{ts,tsx,js,jsx}', {
      cwd,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/*.d.ts'],
      nodir: true,
      maxDepth: 8,
    });

    for (const file of sourceFiles.slice(0, 500)) {
      try {
        const content = await readFile(resolve(cwd, file), 'utf-8');

        // forwardRef(Component) / React.forwardRef(Component)
        const forwardRefPattern = /(?:React\.)?forwardRef\s*[(<]\s*(?:function\s+)?([A-Z][a-zA-Z0-9]*)/g;
        let match: RegExpExecArray | null;
        while ((match = forwardRefPattern.exec(content)) !== null) {
          componentUsageMap.set(match[1]!, (componentUsageMap.get(match[1]!) || 0) + 1);
        }

        // Also: const X = forwardRef(...) — the wrapped result is the component
        const forwardRefAssignPattern = /const\s+([A-Z][a-zA-Z0-9]*)\s*=\s*(?:React\.)?forwardRef/g;
        while ((match = forwardRefAssignPattern.exec(content)) !== null) {
          componentUsageMap.set(match[1]!, (componentUsageMap.get(match[1]!) || 0) + 1);
        }

        // memo(Component) / React.memo(Component)
        const memoPattern = /(?:React\.)?memo\(\s*([A-Z][a-zA-Z0-9]*)\s*[,)]/g;
        while ((match = memoPattern.exec(content)) !== null) {
          componentUsageMap.set(match[1]!, (componentUsageMap.get(match[1]!) || 0) + 1);
        }

        // styled(Component) / styled.div / emotion patterns
        const styledPattern = /styled\(\s*([A-Z][a-zA-Z0-9]*)\s*\)/g;
        while ((match = styledPattern.exec(content)) !== null) {
          componentUsageMap.set(match[1]!, (componentUsageMap.get(match[1]!) || 0) + 1);
        }

        // withXxx(Component) — HOC patterns
        const hocPattern = /with[A-Z][a-zA-Z]*\(\s*([A-Z][a-zA-Z0-9]*)\s*[,)]/g;
        while ((match = hocPattern.exec(content)) !== null) {
          componentUsageMap.set(match[1]!, (componentUsageMap.get(match[1]!) || 0) + 1);
        }

        // Object.assign(Component, { Sub1, Sub2 }) — compound component pattern
        const assignPattern = /Object\.assign\(\s*([A-Z][a-zA-Z0-9]*)\s*,\s*\{([^}]+)\}/g;
        while ((match = assignPattern.exec(content)) !== null) {
          // The base component is used
          componentUsageMap.set(match[1]!, (componentUsageMap.get(match[1]!) || 0) + 1);
          // Each assigned sub-component is used
          const subs = match[2]!.match(/\b([A-Z][a-zA-Z0-9]*)\b/g);
          if (subs) {
            for (const sub of subs) {
              componentUsageMap.set(sub, (componentUsageMap.get(sub) || 0) + 1);
            }
          }
        }

        // Component.Sub = SubComponent — compound component property assignment
        const compoundPattern = /([A-Z][a-zA-Z0-9]*)\.([A-Z][a-zA-Z0-9]*)\s*=\s*([A-Z][a-zA-Z0-9]*)/g;
        while ((match = compoundPattern.exec(content)) !== null) {
          // Both the parent and the assigned component are used
          componentUsageMap.set(match[1]!, (componentUsageMap.get(match[1]!) || 0) + 1);
          componentUsageMap.set(match[3]!, (componentUsageMap.get(match[3]!) || 0) + 1);
        }

        // React.createElement(Component, ...) — non-JSX rendering
        const createElementPattern = /React\.createElement\(\s*([A-Z][a-zA-Z0-9]*)/g;
        while ((match = createElementPattern.exec(content)) !== null) {
          componentUsageMap.set(match[1]!, (componentUsageMap.get(match[1]!) || 0) + 1);
        }
      } catch {
        // ignore unreadable files
      }
    }
  }

  /**
   * Detect component libraries and mark all exported components as used.
   * If package.json has a "main" or "exports" field pointing to a barrel file,
   * all components re-exported from that barrel are the product's public API.
   */
  private async scanPackageExports(componentUsageMap: Map<string, number>): Promise<void> {
    const cwd = process.cwd();
    try {
      const pkgContent = await readFile(resolve(cwd, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgContent);

      // Detect if this is a component library by checking for:
      // - exports field with ./ entries
      // - main/module pointing to index file
      // - "react" or "vue" in peerDependencies (library pattern)
      const hasPeerReact = pkg.peerDependencies?.react || pkg.peerDependencies?.vue;
      const hasExports = pkg.exports && typeof pkg.exports === 'object';
      const mainEntry = pkg.main || pkg.module || '';
      const isLibraryPattern = hasPeerReact && (hasExports || mainEntry);

      if (!isLibraryPattern) return;

      // Scan the root barrel file(s) for exports — these are the public API
      const rootBarrels = await glob('src/index.{ts,tsx,js,jsx}', { cwd, nodir: true });

      for (const barrel of rootBarrels) {
        try {
          const content = await readFile(resolve(cwd, barrel), 'utf-8');

          // Named exports: export { Button, Card } from '...'
          const namedPattern = /export\s*\{\s*([^}]+)\s*\}\s*from/g;
          let match: RegExpExecArray | null;
          while ((match = namedPattern.exec(content)) !== null) {
            const names = match[1]!.split(',').map(n => {
              const parts = n.trim().split(/\s+as\s+/);
              return (parts[1] || parts[0] || '').trim();
            }).filter(n => n && /^[A-Z]/.test(n));

            for (const name of names) {
              componentUsageMap.set(name, (componentUsageMap.get(name) || 0) + 1);
            }
          }

          // Default re-exports: export { default as Button } from '...'
          const defaultPattern = /export\s*\{\s*default\s+as\s+([A-Z][a-zA-Z0-9]*)\s*\}\s*from/g;
          while ((match = defaultPattern.exec(content)) !== null) {
            componentUsageMap.set(match[1]!, (componentUsageMap.get(match[1]!) || 0) + 1);
          }

          // Wildcard re-exports: export * from './Button'
          const wildcardPattern = /export\s*\*\s*from\s*['"]\.\/([^'"]+)['"]/g;
          while ((match = wildcardPattern.exec(content)) !== null) {
            const moduleName = match[1]!;
            const segments = moduleName.split('/');
            const last = segments[segments.length - 1] || '';
            if (/^[A-Z]/.test(last)) {
              componentUsageMap.set(last, (componentUsageMap.get(last) || 0) + 1);
            }
          }

          // Direct exports: export const Button = ... or export function Button
          const directExportPattern = /export\s+(?:const|function|class)\s+([A-Z][a-zA-Z0-9]*)/g;
          while ((match = directExportPattern.exec(content)) !== null) {
            componentUsageMap.set(match[1]!, (componentUsageMap.get(match[1]!) || 0) + 1);
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // No package.json or not parseable — not a library
    }
  }

  /**
   * Scan for components passed as values — JSX prop values, object property values,
   * and array elements. Catches patterns like:
   *   transition={DialogTransition}
   *   { toolbarAccount: AccountPopover }
   *   [DialogTransition, BackdropTransition]
   */
  private async scanComponentAsValueUsages(
    componentUsageMap: Map<string, number>,
    knownComponents: string[],
  ): Promise<void> {
    if (knownComponents.length === 0) return;
    const cwd = process.cwd();
    const sourceFiles = await glob('**/*.{tsx,jsx,ts,js}', {
      cwd,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/*.d.ts'],
      nodir: true,
      maxDepth: 8,
    });

    // Build a Set for O(1) lookup
    const knownSet = new Set(knownComponents);

    for (const file of sourceFiles.slice(0, 500)) {
      try {
        const content = await readFile(resolve(cwd, file), 'utf-8');

        // Match component names used as values in these contexts:
        // 1. JSX prop value:  ={ComponentName}  or ={ComponentName}
        // 2. Object property: : ComponentName, or : ComponentName}
        // 3. Ternary with component: ? ComponentName : or : ComponentName}
        // 4. Array element: [ComponentName, or , ComponentName]
        //
        // We look for PascalCase identifiers preceded by value-assignment contexts
        const valuePattern = /(?:[=:?]\s*|,\s*|\[\s*)([A-Z][a-zA-Z0-9]*)\b/g;
        let match: RegExpExecArray | null;
        while ((match = valuePattern.exec(content)) !== null) {
          const name = match[1]!;
          if (knownSet.has(name)) {
            componentUsageMap.set(name, (componentUsageMap.get(name) || 0) + 1);
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
