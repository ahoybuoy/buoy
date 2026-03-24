---
name: false-positive-triage
description: Use when investigating a suspected false positive in drift detection, reducing false positive rates, or adding a new usage detection pattern to the drift analysis pipeline.
---

# False Positive Triage

## Drift Types Prone to False Positives

| Drift Type | Root Cause | Mitigations |
|---|---|---|
| `unused-component` | Framework conventions hide real usage | 13 usage scanners + entry point exemption |
| `unused-token` | Framework-internal tokens pollute results | `isFrameworkInternalToken()` filter |
| `semantic-mismatch` | Prop type aliases treated as different | Prop type normalization in prop-analyzer |

## Common False Positive Categories

| Category | Example | Fix Location | Fix # |
|---|---|---|---|
| Entry point components | `page.tsx`, `layout.tsx`, `+page.svelte` | `isEntryPointComponent()` in drift-analysis.ts | 1 |
| Barrel re-exports | `export { Button } from './Button'` in `index.ts` | `scanBarrelReExports()` | 2 |
| Dynamic imports | `React.lazy()`, `next/dynamic` | `scanDynamicImports()` | 3 |
| Vue/Svelte template refs | `<MyComponent />` in `.vue`/`.svelte` templates | `scanTemplateComponentUsage()` | 4 |
| Vue auto-registration | `app.component()` patterns | `scanAutoRegistration()` | 5 |
| Angular NgModule | `declarations: [MyComponent]` | `scanNgModuleDeclarations()` | 6 |
| Storybook stories | Story files importing components | `scanStoryFileUsages()` | 7 |
| Web Components / Lit | `customElements.define()` | `scanWebComponentRegistrations()` | 8 |
| Nuxt auto-imports | Components in `components/` directory | `scanNuxtAutoImports()` | 9 |
| Test file imports | Components imported in `.test.`/`.spec.` files | `scanTestFileUsages()` | 10 |
| HOC/wrapper patterns | `forwardRef()`, `memo()`, `styled()`, `withXxx()` | `scanHOCWrapperUsages()` | 11 |
| Package exports | Components listed in `package.json` exports | `scanPackageExports()` | 12 |
| Component-as-value | `transition={DialogTransition}`, object properties | `scanComponentAsValueUsages()` | 13 |
| Framework-internal tokens | `--tw-*`, `--radix-*`, `--chakra-*` | `isFrameworkInternalToken()` | N/A |
| Tailwind config aliases | Token aliases in `tailwind.config.*` | `applyTailwindConfigAliasUsages()` | N/A |
| React type equivalents | `ReactElement`, `JSX.Element` treated as `ReactNode` | `packages/core/src/analysis/analyzers/prop-analyzer.ts` | N/A |

## Key Files

| File | Role |
|---|---|
| `apps/cli/src/services/drift-analysis.ts` | Main orchestrator. Contains all 13 usage scanners, `isEntryPointComponent()`, `isFrameworkInternalToken()` |
| `packages/core/src/analysis/semantic-diff.ts` | Engine. `checkUnusedComponents()`, `checkUnusedTokens()` |
| `packages/core/src/analysis/analyzers/prop-analyzer.ts` | Prop type normalization for semantic-mismatch |
| `packages/core/src/models/drift.ts` | Drift type definitions (`DriftTypeSchema`) |
| `packages/core/src/graph/collectors/usages.ts` | Base usage collection (imports, token refs) |

## Fix Procedure

### Step 1: Identify the false positive category

Determine source: user report, buoy-lab testing, or `buoy show drift --json` output on a known-good repo.

Classify why it is a false positive:
- Framework convention (router renders it, auto-import, NgModule, etc.)
- Code pattern (barrel export, dynamic import, HOC wrapper, component-as-value)
- Internal token (framework CSS custom property prefixes)
- Type alias (equivalent types treated as mismatches)

### Step 2: Add detection logic

For **unused-component** false positives, add a new scanner method to `DriftAnalysisService` in `apps/cli/src/services/drift-analysis.ts`:

```typescript
// Fix N: Description of what this catches
await this.scanNewPattern(componentUsageMap);
```

Place the call in the usage detection block (after Fix 13, before the entry point filter at line ~646). The method should:
1. Glob for relevant files
2. Read file contents
3. Match component names against a pattern
4. Increment `componentUsageMap` for matched components

For **unused-token** false positives, add prefix patterns to the `FRAMEWORK_TOKEN_PREFIXES` array or extend `isFrameworkInternalToken()`.

For **semantic-mismatch** false positives, update type normalization in `packages/core/src/analysis/analyzers/prop-analyzer.ts`.

### Step 3: Add tests

Add test cases to the appropriate test file:

- Usage scanner tests: `apps/cli/src/services/drift-analysis.test.ts`
- Engine-level tests: `packages/core/src/analysis/semantic-diff.test.ts`

Each test should verify:
- The false positive no longer appears for the specific pattern
- Legitimate drift signals are still detected (no regression)

### Step 4: Build and run tests

```bash
pnpm build
pnpm test
```

### Step 5: Validate against real repos

Spot-check 3-5 repos in buoy-lab to confirm reduction:

```bash
cd /Users/dylantarre/dev/buoy-lab/<repo>
node /Users/dylantarre/dev/buoy/apps/cli/dist/bin.js show drift --json | jq '.drifts | length'
```

Compare before/after counts. Record the reduction.

### Step 6: Commit with metrics

Include FP reduction metrics in the commit message:

```
fix: reduce unused-component false positives for <pattern>

<repo-name> N1->N2 drift (X% FP reduction)
<repo-name> N1->N2 drift (X% FP reduction)
```

## Validation Benchmarks

| Repo | Before | After | Reduction |
|---|---|---|---|
| react-bootstrap | 10 drift | 3 drift | 70% |
| react-router | 11 drift | 6 drift | 45% |

When adding new fixes, update this table with measured results.
