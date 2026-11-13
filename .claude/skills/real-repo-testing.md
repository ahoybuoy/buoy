---
name: real-repo-testing
description: Use when testing buoy changes against real-world repos, validating drift detection accuracy, comparing before/after results, or preparing a release that needs real-repo validation.
---

# Real-Repo Testing

This skill defines how to test buoy against real-world repos using buoy-lab.

## Testing Tiers

| Tier | When | Speed | Command |
|------|------|-------|---------|
| Unit tests | Every change | ~30s | `pnpm test` (2512+ vitest tests) |
| Manual spot-check | Specific fix validation | ~2 min | Build + run on 3-5 relevant repos |
| Batch testing | Pre-release validation | ~10 min | `buoy-test run batch --top N` |
| Autonomous loop | Background improvement | Long-running | `pnpm improve` or `pnpm daemon` in buoy-lab |

## Tier 1: Unit Tests

```bash
pnpm test
```

Covers scanner logic, drift detection, and token extraction. Run on every change.

## Tier 2: Manual Spot-Check

### Step 1: Save Baseline

Pick 3-5 repos relevant to the change. Run from each repo directory:

```bash
cd /Users/dylantarre/dev/buoy-lab/repos/<owner>/<name>
node /Users/dylantarre/dev/buoy/apps/cli/dist/bin.js show drift --json > /tmp/before.json
```

### Step 2: Apply Fix and Rebuild

```bash
cd /Users/dylantarre/dev/buoy
pnpm build
```

### Step 3: Run After and Compare

```bash
cd /Users/dylantarre/dev/buoy-lab/repos/<owner>/<name>
node /Users/dylantarre/dev/buoy/apps/cli/dist/bin.js show drift --json > /tmp/after.json
diff /tmp/before.json /tmp/after.json
```

### Step 4: Spot-Check Health Score

```bash
node /Users/dylantarre/dev/buoy/apps/cli/dist/bin.js show health --json
```

### Key Repos by Framework

| Framework | Repos |
|-----------|-------|
| React | `adobe/react-spectrum`, `chakra-ui/chakra-ui`, `shadcn-ui/ui` |
| Vue | `vuetifyjs/vuetify` |
| Tailwind | `tailwindlabs/*` repos |
| Tokens | `mantinedev/mantine`, `radix-ui/primitives` |
| Svelte | Check buoy-lab registry |

All repos live under `/Users/dylantarre/dev/buoy-lab/repos/<owner>/<name>`.

## Tier 3: Batch Testing

Run from buoy-lab:

```bash
cd /Users/dylantarre/dev/buoy-lab
buoy-test run batch --top N
buoy-test aggregate
buoy-test assess batch
```

Check results against ground truth. Use before releases to catch regressions.

## Tier 4: Autonomous Improvement Loop

Run from buoy-lab (background, long-running):

```bash
cd /Users/dylantarre/dev/buoy-lab
pnpm improve   # or pnpm daemon
```

Analyzes detection gaps, proposes fixes, and tracks regression automatically.

## Local Test Fixture

For quick sanity checks without buoy-lab:

```bash
cd /Users/dylantarre/dev/buoy
node apps/cli/dist/bin.js show all
```

Uses `test-fixture/` directory which contains `.buoy.yaml`, sample components, and design tokens.

## Rules

1. **Always rebuild before testing**: `pnpm build` in the buoy repo after any code change.
2. **Always save a baseline before comparing**: Redirect `show drift --json` to a file before applying fixes.
3. **Document results in commit messages**: Include before/after drift counts when relevant.
4. **Match repos to the change**: Test tailwind fixes on tailwind repos, React fixes on React repos.
5. **Never use `pnpm --prefix`** to set cwd for buoy CLI -- it sets cwd to the prefix path, not the target repo. Always `cd` into the repo first.
