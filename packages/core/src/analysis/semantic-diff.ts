import type {
  Component,
  DesignToken,
  DriftSignal,
  Severity,
  DriftSource,
} from '../models/index.js';
import {
  createDriftId,
  normalizeComponentName,
  normalizeTokenName,
  tokensMatch,
} from '../models/index.js';

export interface ComponentMatch {
  source: Component;
  target: Component;
  confidence: number;
  matchType: 'exact' | 'similar' | 'partial';
  differences: ComponentDifference[];
}

export interface ComponentDifference {
  field: string;
  sourceValue: unknown;
  targetValue: unknown;
  severity: Severity;
}

export interface SemanticDiffResult {
  matches: ComponentMatch[];
  orphanedSource: Component[];
  orphanedTarget: Component[];
  drifts: DriftSignal[];
}

export interface TokenDiffResult {
  matches: { source: DesignToken; target: DesignToken }[];
  orphanedSource: DesignToken[];
  orphanedTarget: DesignToken[];
  drifts: DriftSignal[];
}

export interface DiffOptions {
  minMatchConfidence?: number;
}

export interface AnalysisOptions {
  checkDeprecated?: boolean;
  checkNaming?: boolean;
  checkDocumentation?: boolean;
  checkAccessibility?: boolean;
  deprecatedPatterns?: string[];
  namingConventions?: {
    components?: RegExp;
    tokens?: RegExp;
  };
}

interface NamingPatternAnalysis {
  patterns: {
    PascalCase: number;
    camelCase: number;
    'kebab-case': number;
    snake_case: number;
    other: number;
  };
  dominant: 'PascalCase' | 'camelCase' | 'kebab-case' | 'snake_case' | 'other' | null;
  total: number;
}

interface PropTypeUsage {
  types: Map<string, { count: number; examples: string[] }>;
  total: number;
}

// Framework info for sprawl detection
export interface FrameworkInfo {
  name: string;
  version: string;
}

export class SemanticDiffEngine {
  /**
   * Check for framework sprawl - multiple UI frameworks in one codebase
   */
  checkFrameworkSprawl(frameworks: FrameworkInfo[]): DriftSignal | null {
    // Only count UI/component frameworks, not backend frameworks
    const uiFrameworkNames = [
      'react', 'vue', 'svelte', 'angular', 'solid', 'preact', 'lit', 'stencil',
      'nextjs', 'nuxt', 'astro', 'remix', 'sveltekit', 'gatsby', 'react-native', 'expo', 'flutter'
    ];

    const uiFrameworks = frameworks.filter(f => uiFrameworkNames.includes(f.name));

    if (uiFrameworks.length <= 1) {
      return null; // No sprawl
    }

    const frameworkNames = uiFrameworks.map(f => f.name);
    const primaryFramework = uiFrameworks[0]!;

    return {
      id: createDriftId('framework-sprawl', 'project', frameworkNames.join('-')),
      type: 'framework-sprawl',
      severity: 'warning',
      source: {
        entityType: 'component',
        entityId: 'project',
        entityName: 'Project Architecture',
        location: 'package.json',
      },
      message: `Framework sprawl detected: ${uiFrameworks.length} UI frameworks in use (${frameworkNames.join(', ')})`,
      details: {
        expected: `Single framework (${primaryFramework.name})`,
        actual: `${uiFrameworks.length} frameworks`,
        frameworks: uiFrameworks.map(f => ({ name: f.name, version: f.version })),
        suggestions: [
          'Consider consolidating to a single UI framework',
          'Document intentional multi-framework usage if required',
          'Create migration plan if frameworks are being deprecated',
        ],
      },
      detectedAt: new Date(),
    };
  }

  /**
   * Compare components from different sources (e.g., React vs Figma)
   */
  compareComponents(
    sourceComponents: Component[],
    targetComponents: Component[],
    options: DiffOptions = {}
  ): SemanticDiffResult {
    const matches: ComponentMatch[] = [];
    const matchedSourceIds = new Set<string>();
    const matchedTargetIds = new Set<string>();

    // Phase 1: Exact name matches
    for (const source of sourceComponents) {
      const sourceName = normalizeComponentName(source.name);
      const exactMatch = targetComponents.find(
        t => normalizeComponentName(t.name) === sourceName
      );

      if (exactMatch) {
        matches.push(this.createMatch(source, exactMatch, 'exact'));
        matchedSourceIds.add(source.id);
        matchedTargetIds.add(exactMatch.id);
      }
    }

    // Phase 2: Fuzzy matching for remaining
    const unmatchedSource = sourceComponents.filter(c => !matchedSourceIds.has(c.id));
    const unmatchedTarget = targetComponents.filter(c => !matchedTargetIds.has(c.id));

    for (const source of unmatchedSource) {
      const bestMatch = this.findBestMatch(source, unmatchedTarget);
      const minConfidence = options.minMatchConfidence || 0.7;

      if (bestMatch && bestMatch.confidence >= minConfidence) {
        matches.push(bestMatch);
        matchedSourceIds.add(source.id);
        matchedTargetIds.add(bestMatch.target.id);
      }
    }

    // Phase 3: Generate drift signals
    const drifts = this.generateComponentDrifts(
      matches,
      sourceComponents.filter(c => !matchedSourceIds.has(c.id)),
      targetComponents.filter(c => !matchedTargetIds.has(c.id))
    );

    return {
      matches,
      orphanedSource: sourceComponents.filter(c => !matchedSourceIds.has(c.id)),
      orphanedTarget: targetComponents.filter(c => !matchedTargetIds.has(c.id)),
      drifts,
    };
  }

  /**
   * Compare tokens between sources
   */
  compareTokens(
    sourceTokens: DesignToken[],
    targetTokens: DesignToken[]
  ): TokenDiffResult {
    const matches: { source: DesignToken; target: DesignToken }[] = [];
    const drifts: DriftSignal[] = [];
    const matchedSourceIds = new Set<string>();
    const matchedTargetIds = new Set<string>();

    for (const source of sourceTokens) {
      const sourceName = normalizeTokenName(source.name);
      const target = targetTokens.find(
        t => normalizeTokenName(t.name) === sourceName
      );

      if (!target) continue;

      matchedSourceIds.add(source.id);
      matchedTargetIds.add(target.id);
      matches.push({ source, target });

      // Check for value divergence
      if (!tokensMatch(source.value, target.value)) {
        drifts.push({
          id: createDriftId('value-divergence', source.id, target.id),
          type: 'value-divergence',
          severity: 'warning',
          source: this.tokenToDriftSource(source),
          target: this.tokenToDriftSource(target),
          message: `Token "${source.name}" has different values between sources`,
          details: {
            expected: source.value,
            actual: target.value,
            suggestions: ['Align token values between design and code'],
          },
          detectedAt: new Date(),
        });
      }
    }

    // Orphaned tokens
    const orphanedSource = sourceTokens.filter(t => !matchedSourceIds.has(t.id));
    const orphanedTarget = targetTokens.filter(t => !matchedTargetIds.has(t.id));

    for (const token of orphanedSource) {
      drifts.push({
        id: createDriftId('orphaned-token', token.id),
        type: 'orphaned-token',
        severity: 'info',
        source: this.tokenToDriftSource(token),
        message: `Token "${token.name}" exists in ${token.source.type} but not in design`,
        details: {
          suggestions: ['Add token to design system or remove if unused'],
        },
        detectedAt: new Date(),
      });
    }

    for (const token of orphanedTarget) {
      drifts.push({
        id: createDriftId('orphaned-token', token.id),
        type: 'orphaned-token',
        severity: 'info',
        source: this.tokenToDriftSource(token),
        message: `Token "${token.name}" exists in design but not implemented`,
        details: {
          suggestions: ['Implement token in code or mark as planned'],
        },
        detectedAt: new Date(),
      });
    }

    return { matches, orphanedSource, orphanedTarget, drifts };
  }

  /**
   * Analyze a single set of components for internal drift
   */
  analyzeComponents(components: Component[], options: AnalysisOptions = {}): { drifts: DriftSignal[] } {
    const drifts: DriftSignal[] = [];

    // First pass: collect patterns across all components
    const namingPatterns = this.detectNamingPatterns(components);
    const propTypeMap = this.buildPropTypeMap(components);
    const propNamingMap = this.buildPropNamingMap(components);

    for (const component of components) {
      // Check for deprecation
      if (options.checkDeprecated && component.metadata.deprecated) {
        drifts.push({
          id: createDriftId('deprecated-pattern', component.id),
          type: 'deprecated-pattern',
          severity: 'warning',
          source: this.componentToDriftSource(component),
          message: `Component "${component.name}" is marked as deprecated`,
          details: {
            suggestions: [
              component.metadata.deprecationReason || 'Migrate to recommended alternative',
            ],
          },
          detectedAt: new Date(),
        });
      }

      // Check naming consistency (against project's own patterns, not arbitrary rules)
      if (options.checkNaming) {
        const namingIssue = this.checkNamingConsistency(component.name, namingPatterns);
        if (namingIssue) {
          drifts.push({
            id: createDriftId('naming-inconsistency', component.id),
            type: 'naming-inconsistency',
            severity: 'info',
            source: this.componentToDriftSource(component),
            message: namingIssue.message,
            details: {
              suggestions: [namingIssue.suggestion],
            },
            detectedAt: new Date(),
          });
        }
      }

      // Check for prop type inconsistencies across components
      for (const prop of component.props) {
        const typeConflict = this.checkPropTypeConsistency(prop, propTypeMap);
        if (typeConflict) {
          drifts.push({
            id: createDriftId('semantic-mismatch', component.id, prop.name),
            type: 'semantic-mismatch',
            severity: 'warning',
            source: this.componentToDriftSource(component),
            message: `Prop "${prop.name}" in "${component.name}" uses type "${prop.type}" but other components use "${typeConflict.dominantType}"`,
            details: {
              expected: typeConflict.dominantType,
              actual: prop.type,
              usedIn: typeConflict.examples,
              suggestions: ['Standardize prop types across components for consistency'],
            },
            detectedAt: new Date(),
          });
        }
      }

      // Check for inconsistent prop naming patterns (onClick vs handleClick)
      const propNamingIssues = this.checkPropNamingConsistency(component, propNamingMap);
      for (const issue of propNamingIssues) {
        drifts.push({
          id: createDriftId('naming-inconsistency', component.id, issue.propName),
          type: 'naming-inconsistency',
          severity: 'info',
          source: this.componentToDriftSource(component),
          message: issue.message,
          details: {
            suggestions: [issue.suggestion],
          },
          detectedAt: new Date(),
        });
      }

      // Check for accessibility issues
      if (options.checkAccessibility) {
        const a11yIssues = this.checkAccessibility(component);
        for (const issue of a11yIssues) {
          drifts.push({
            id: createDriftId('accessibility-conflict', component.id),
            type: 'accessibility-conflict',
            severity: 'critical',
            source: this.componentToDriftSource(component),
            message: `Component "${component.name}" has accessibility issues: ${issue}`,
            details: {
              suggestions: ['Fix accessibility issue to ensure inclusive design'],
            },
            detectedAt: new Date(),
          });
        }
      }

      // Check for hardcoded values that should be tokens
      if (component.metadata.hardcodedValues && component.metadata.hardcodedValues.length > 0) {
        const hardcoded = component.metadata.hardcodedValues;
        const colorCount = hardcoded.filter(h => h.type === 'color').length;
        const spacingCount = hardcoded.filter(h => h.type === 'spacing' || h.type === 'fontSize').length;

        // Group by type for cleaner messaging
        if (colorCount > 0) {
          const colorValues = hardcoded.filter(h => h.type === 'color');
          drifts.push({
            id: createDriftId('hardcoded-value', component.id, 'color'),
            type: 'hardcoded-value',
            severity: 'warning',
            source: this.componentToDriftSource(component),
            message: `Component "${component.name}" has ${colorCount} hardcoded color${colorCount > 1 ? 's' : ''}: ${colorValues.map(h => h.value).join(', ')}`,
            details: {
              suggestions: ['Replace hardcoded colors with design tokens (e.g., var(--primary) or theme.colors.primary)'],
              affectedFiles: colorValues.map(h => `${h.property}: ${h.value} (${h.location})`),
            },
            detectedAt: new Date(),
          });
        }

        if (spacingCount > 0) {
          const spacingValues = hardcoded.filter(h => h.type === 'spacing' || h.type === 'fontSize');
          drifts.push({
            id: createDriftId('hardcoded-value', component.id, 'spacing'),
            type: 'hardcoded-value',
            severity: 'info',
            source: this.componentToDriftSource(component),
            message: `Component "${component.name}" has ${spacingCount} hardcoded size value${spacingCount > 1 ? 's' : ''}: ${spacingValues.map(h => h.value).join(', ')}`,
            details: {
              suggestions: ['Consider using spacing tokens for consistency'],
              affectedFiles: spacingValues.map(h => `${h.property}: ${h.value} (${h.location})`),
            },
            detectedAt: new Date(),
          });
        }
      }
    }

    // Cross-component checks

    // Check for potential duplicate components
    const duplicates = this.detectPotentialDuplicates(components);
    for (const dup of duplicates) {
      drifts.push({
        id: createDriftId('naming-inconsistency', dup.components[0]!.id, 'duplicate'),
        type: 'naming-inconsistency',
        severity: 'warning',
        source: this.componentToDriftSource(dup.components[0]!),
        message: `Potential duplicate components: ${dup.components.map(c => c.name).join(', ')}`,
        details: {
          suggestions: ['Consider consolidating these components or clarifying their distinct purposes'],
          relatedComponents: dup.components.map(c => c.name),
        },
        detectedAt: new Date(),
      });
    }

    return { drifts };
  }

  /**
   * Detect the dominant naming patterns in the codebase
   */
  private detectNamingPatterns(components: Component[]): NamingPatternAnalysis {
    const patterns = {
      PascalCase: 0,
      camelCase: 0,
      'kebab-case': 0,
      snake_case: 0,
      other: 0,
    };

    for (const comp of components) {
      const pattern = this.identifyNamingPattern(comp.name);
      patterns[pattern]++;
    }

    // Find dominant pattern (must be > 60% to be considered dominant)
    const total = components.length;
    let dominant: keyof typeof patterns | null = null;
    let dominantCount = 0;

    for (const [pattern, count] of Object.entries(patterns)) {
      if (count > dominantCount && count / total > 0.6) {
        dominant = pattern as keyof typeof patterns;
        dominantCount = count;
      }
    }

    return { patterns, dominant, total };
  }

  private identifyNamingPattern(name: string): 'PascalCase' | 'camelCase' | 'kebab-case' | 'snake_case' | 'other' {
    if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return 'PascalCase';
    if (/^[a-z][a-zA-Z0-9]*$/.test(name)) return 'camelCase';
    if (/^[a-z][a-z0-9-]*$/.test(name)) return 'kebab-case';
    if (/^[a-z][a-z0-9_]*$/.test(name)) return 'snake_case';
    return 'other';
  }

  private checkNamingConsistency(
    name: string,
    patterns: NamingPatternAnalysis
  ): { message: string; suggestion: string } | null {
    if (!patterns.dominant) return null; // No clear pattern, don't flag

    const thisPattern = this.identifyNamingPattern(name);
    if (thisPattern === patterns.dominant) return null;

    // Only flag if this is a clear outlier
    const outlierThreshold = Math.max(3, patterns.total * 0.1); // At least 3 or 10% use dominant
    if (patterns.patterns[patterns.dominant]! < outlierThreshold) return null;

    return {
      message: `Component "${name}" uses ${thisPattern} but ${Math.round((patterns.patterns[patterns.dominant]! / patterns.total) * 100)}% of components use ${patterns.dominant}`,
      suggestion: `Consider renaming to match project convention (${patterns.dominant})`,
    };
  }

  /**
   * Build a map of prop names to their types across all components
   */
  private buildPropTypeMap(components: Component[]): Map<string, PropTypeUsage> {
    const map = new Map<string, PropTypeUsage>();

    for (const comp of components) {
      for (const prop of comp.props) {
        const normalizedName = prop.name.toLowerCase();
        if (!map.has(normalizedName)) {
          map.set(normalizedName, { types: new Map(), total: 0 });
        }
        const usage = map.get(normalizedName)!;
        const typeCount = usage.types.get(prop.type) || { count: 0, examples: [] };
        typeCount.count++;
        if (typeCount.examples.length < 3) {
          typeCount.examples.push(comp.name);
        }
        usage.types.set(prop.type, typeCount);
        usage.total++;
      }
    }

    return map;
  }

  private checkPropTypeConsistency(
    prop: { name: string; type: string },
    propTypeMap: Map<string, PropTypeUsage>
  ): { dominantType: string; examples: string[] } | null {
    const usage = propTypeMap.get(prop.name.toLowerCase());
    if (!usage || usage.total < 3) return null; // Not enough data

    // Find dominant type
    let dominantType = '';
    let dominantCount = 0;
    for (const [type, data] of usage.types) {
      if (data.count > dominantCount) {
        dominantType = type;
        dominantCount = data.count;
      }
    }

    // Only flag if this prop's type differs and dominant is > 70%
    if (prop.type === dominantType) return null;
    if (dominantCount / usage.total < 0.7) return null;

    const examples = usage.types.get(dominantType)?.examples || [];
    return { dominantType, examples };
  }

  /**
   * Build a map of semantic prop purposes to their naming patterns
   */
  private buildPropNamingMap(components: Component[]): Map<string, string[]> {
    const map = new Map<string, string[]>();

    // Group props by semantic purpose
    const clickHandlers: string[] = [];
    const changeHandlers: string[] = [];

    for (const comp of components) {
      for (const prop of comp.props) {
        const lower = prop.name.toLowerCase();
        if (lower.includes('click') || lower.includes('press')) {
          clickHandlers.push(prop.name);
        }
        if (lower.includes('change')) {
          changeHandlers.push(prop.name);
        }
      }
    }

    map.set('click', clickHandlers);
    map.set('change', changeHandlers);

    return map;
  }

  private checkPropNamingConsistency(
    component: Component,
    propNamingMap: Map<string, string[]>
  ): Array<{ propName: string; message: string; suggestion: string }> {
    const issues: Array<{ propName: string; message: string; suggestion: string }> = [];

    for (const prop of component.props) {
      const lower = prop.name.toLowerCase();

      // Check click handler naming
      if (lower.includes('click') || lower.includes('press')) {
        const allClickHandlers = propNamingMap.get('click') || [];
        if (allClickHandlers.length >= 5) {
          const dominant = this.findDominantPropPattern(allClickHandlers);
          if (dominant && !prop.name.startsWith(dominant.prefix)) {
            const dominantPct = Math.round((dominant.count / allClickHandlers.length) * 100);
            if (dominantPct >= 70) {
              issues.push({
                propName: prop.name,
                message: `"${prop.name}" in "${component.name}" - ${dominantPct}% of click handlers use "${dominant.prefix}..." pattern`,
                suggestion: `Consider using "${dominant.prefix}${prop.name.replace(/^(on|handle)/i, '')}" for consistency`,
              });
            }
          }
        }
      }
    }

    return issues;
  }

  private findDominantPropPattern(propNames: string[]): { prefix: string; count: number } | null {
    const prefixes: Record<string, number> = {};

    for (const name of propNames) {
      if (name.startsWith('on')) prefixes['on'] = (prefixes['on'] || 0) + 1;
      else if (name.startsWith('handle')) prefixes['handle'] = (prefixes['handle'] || 0) + 1;
    }

    let dominant: { prefix: string; count: number } | null = null;
    for (const [prefix, count] of Object.entries(prefixes)) {
      if (!dominant || count > dominant.count) {
        dominant = { prefix, count };
      }
    }

    return dominant;
  }

  /**
   * Detect potential duplicate components based on similar names
   */
  private detectPotentialDuplicates(components: Component[]): Array<{ components: Component[] }> {
    const duplicates: Array<{ components: Component[] }> = [];
    const processed = new Set<string>();

    for (const comp of components) {
      if (processed.has(comp.id)) continue;

      // Find components with similar base names
      const baseName = comp.name
        .replace(/(New|Old|V\d+|Legacy|Updated|Deprecated)$/i, '')
        .replace(/\d+$/, '')
        .toLowerCase();

      const similar = components.filter(c => {
        if (c.id === comp.id) return false;
        const otherBase = c.name
          .replace(/(New|Old|V\d+|Legacy|Updated|Deprecated)$/i, '')
          .replace(/\d+$/, '')
          .toLowerCase();
        return baseName === otherBase && baseName.length >= 3;
      });

      if (similar.length > 0) {
        const group = [comp, ...similar];
        group.forEach(c => processed.add(c.id));
        duplicates.push({ components: group });
      }
    }

    return duplicates;
  }

  private createMatch(
    source: Component,
    target: Component,
    matchType: 'exact' | 'similar' | 'partial'
  ): ComponentMatch {
    return {
      source,
      target,
      confidence: matchType === 'exact' ? 1 : 0,
      matchType,
      differences: this.findDifferences(source, target),
    };
  }

  private findBestMatch(source: Component, candidates: Component[]): ComponentMatch | null {
    let bestMatch: ComponentMatch | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = this.calculateSimilarity(source, candidate);
      if (score > bestScore) {
        bestScore = score;
        const matchType = score > 0.9 ? 'similar' : 'partial';
        bestMatch = {
          source,
          target: candidate,
          confidence: score,
          matchType,
          differences: this.findDifferences(source, candidate),
        };
      }
    }

    return bestMatch;
  }

  private calculateSimilarity(a: Component, b: Component): number {
    let score = 0;
    const weights = { name: 0.4, props: 0.3, variants: 0.2, dependencies: 0.1 };

    // Name similarity (Levenshtein-based)
    score += weights.name * this.stringSimilarity(a.name, b.name);

    // Props overlap
    const aProps = new Set(a.props.map(p => p.name.toLowerCase()));
    const bProps = new Set(b.props.map(p => p.name.toLowerCase()));
    const propsIntersection = [...aProps].filter(p => bProps.has(p)).length;
    const propsUnion = new Set([...aProps, ...bProps]).size;
    score += weights.props * (propsUnion > 0 ? propsIntersection / propsUnion : 0);

    // Variant overlap
    const aVariants = new Set(a.variants.map(v => v.name.toLowerCase()));
    const bVariants = new Set(b.variants.map(v => v.name.toLowerCase()));
    const variantsIntersection = [...aVariants].filter(v => bVariants.has(v)).length;
    const variantsUnion = new Set([...aVariants, ...bVariants]).size;
    score += weights.variants * (variantsUnion > 0 ? variantsIntersection / variantsUnion : 0);

    // Dependencies overlap
    const aDeps = new Set(a.dependencies.map(d => d.toLowerCase()));
    const bDeps = new Set(b.dependencies.map(d => d.toLowerCase()));
    const depsIntersection = [...aDeps].filter(d => bDeps.has(d)).length;
    const depsUnion = new Set([...aDeps, ...bDeps]).size;
    score += weights.dependencies * (depsUnion > 0 ? depsIntersection / depsUnion : 0);

    return score;
  }

  private stringSimilarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    const distance = this.levenshteinDistance(a.toLowerCase(), b.toLowerCase());
    return 1 - distance / maxLen;
  }

  private levenshteinDistance(a: string, b: string): number {
    // Create matrix with proper initialization
    const rows = b.length + 1;
    const cols = a.length + 1;
    const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

    // Initialize first column
    for (let i = 0; i <= b.length; i++) {
      matrix[i]![0] = i;
    }
    // Initialize first row
    for (let j = 0; j <= a.length; j++) {
      matrix[0]![j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1,
            matrix[i]![j - 1]! + 1,
            matrix[i - 1]![j]! + 1
          );
        }
      }
    }

    return matrix[b.length]![a.length]!;
  }

  private findDifferences(source: Component, target: Component): ComponentDifference[] {
    const differences: ComponentDifference[] = [];

    // Compare props
    const sourceProps = new Map(source.props.map(p => [p.name.toLowerCase(), p]));
    const targetProps = new Map(target.props.map(p => [p.name.toLowerCase(), p]));

    for (const [name, prop] of sourceProps) {
      const targetProp = targetProps.get(name);
      if (!targetProp) {
        differences.push({
          field: `props.${prop.name}`,
          sourceValue: prop,
          targetValue: undefined,
          severity: prop.required ? 'warning' : 'info',
        });
      } else if (prop.type !== targetProp.type) {
        differences.push({
          field: `props.${prop.name}.type`,
          sourceValue: prop.type,
          targetValue: targetProp.type,
          severity: 'warning',
        });
      }
    }

    for (const [name, prop] of targetProps) {
      if (!sourceProps.has(name)) {
        differences.push({
          field: `props.${prop.name}`,
          sourceValue: undefined,
          targetValue: prop,
          severity: 'info',
        });
      }
    }

    return differences;
  }

  private generateComponentDrifts(
    matches: ComponentMatch[],
    orphanedSource: Component[],
    orphanedTarget: Component[]
  ): DriftSignal[] {
    const drifts: DriftSignal[] = [];

    // Drifts from matches with significant differences
    for (const match of matches) {
      const significantDiffs = match.differences.filter(
        d => d.severity === 'warning' || d.severity === 'critical'
      );

      if (significantDiffs.length > 0) {
        drifts.push({
          id: createDriftId('semantic-mismatch', match.source.id, match.target.id),
          type: 'semantic-mismatch',
          severity: this.getHighestSeverity(match.differences),
          source: this.componentToDriftSource(match.source),
          target: this.componentToDriftSource(match.target),
          message: `Component "${match.source.name}" has ${significantDiffs.length} differences between sources`,
          details: {
            diff: JSON.stringify(match.differences, null, 2),
            suggestions: ['Review component definitions for consistency'],
          },
          detectedAt: new Date(),
        });
      }
    }

    // Orphaned source components
    for (const comp of orphanedSource) {
      drifts.push({
        id: createDriftId('orphaned-component', comp.id),
        type: 'orphaned-component',
        severity: 'warning',
        source: this.componentToDriftSource(comp),
        message: `Component "${comp.name}" exists in ${comp.source.type} but has no match in design`,
        details: {
          suggestions: ['Add component to Figma or document as intentional deviation'],
        },
        detectedAt: new Date(),
      });
    }

    // Orphaned target components
    for (const comp of orphanedTarget) {
      drifts.push({
        id: createDriftId('orphaned-component', comp.id),
        type: 'orphaned-component',
        severity: 'info',
        source: this.componentToDriftSource(comp),
        message: `Component "${comp.name}" exists in design but not implemented`,
        details: {
          suggestions: ['Implement component or mark as planned'],
        },
        detectedAt: new Date(),
      });
    }

    return drifts;
  }

  private componentToDriftSource(comp: Component): DriftSource {
    let location = '';
    if (comp.source.type === 'react') {
      location = `${comp.source.path}:${comp.source.line || 0}`;
    } else if (comp.source.type === 'figma') {
      location = comp.source.url || comp.source.nodeId;
    } else if (comp.source.type === 'storybook') {
      location = comp.source.url || comp.source.storyId;
    }

    return {
      entityType: 'component',
      entityId: comp.id,
      entityName: comp.name,
      location,
    };
  }

  private tokenToDriftSource(token: DesignToken): DriftSource {
    let location = '';
    if (token.source.type === 'json' || token.source.type === 'css' || token.source.type === 'scss') {
      location = token.source.path;
    } else if (token.source.type === 'figma') {
      location = token.source.fileKey;
    }

    return {
      entityType: 'token',
      entityId: token.id,
      entityName: token.name,
      location,
    };
  }

  private getHighestSeverity(differences: ComponentDifference[]): Severity {
    if (differences.some(d => d.severity === 'critical')) return 'critical';
    if (differences.some(d => d.severity === 'warning')) return 'warning';
    return 'info';
  }

  private checkAccessibility(component: Component): string[] {
    const issues: string[] = [];

    // Check if interactive components have required ARIA props
    const interactiveComponents = ['Button', 'Link', 'Input', 'Select', 'Checkbox', 'Radio'];
    const isInteractive = interactiveComponents.some(
      ic => component.name.toLowerCase().includes(ic.toLowerCase())
    );

    if (isInteractive) {
      const hasAriaLabel = component.props.some(
        p => p.name.toLowerCase().includes('arialabel') || p.name.toLowerCase().includes('aria-label')
      );
      const hasChildren = component.props.some(
        p => p.name.toLowerCase() === 'children'
      );

      if (!hasAriaLabel && !hasChildren && component.metadata.accessibility?.issues) {
        issues.push(...component.metadata.accessibility.issues);
      }
    }

    return issues;
  }
}
