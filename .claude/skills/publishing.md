---
name: publishing
description: Use when publishing Buoy packages to npm, bumping versions, or debugging workspace:* dependency leaks. Covers the full publish-and-verify cycle.
---

# Publishing Workflow

This skill prevents `workspace:*` references from leaking to npm. There have been 3 incidents (v0.3.2, v0.3.24, v0.3.34) where unresolved workspace refs shipped. Follow this process exactly.

## Critical Rule

**MUST use `pnpm publish` (not `npm publish`).** Only pnpm resolves `workspace:*` to real version numbers at publish time. Using npm publishes the raw `workspace:*` strings.

## Publish Order

Packages MUST be published in dependency order. Publishing out of order means downstream packages reference versions that don't exist yet.

| # | Package | Location | Internal Deps |
|---|---------|----------|---------------|
| 1 | `@buoy-design/core` | `packages/core/` | None |
| 2 | `@buoy-design/scanners` | `packages/scanners/` | core |
| 3 | `@buoy-design/cli` | `apps/cli/` | core, scanners |
| 4 | `ahoybuoy` | `packages/ahoybuoy/` | cli (wrapper) |
| 5 | `buoy-design` | `packages/buoy-design/` | cli (alias) |

## Publish Command

For each package, in order:

```bash
pnpm --filter @buoy-design/core publish --access public --no-git-checks
pnpm --filter @buoy-design/scanners publish --access public --no-git-checks
pnpm --filter @buoy-design/cli publish --access public --no-git-checks
pnpm --filter ahoybuoy publish --access public --no-git-checks
pnpm --filter buoy-design publish --access public --no-git-checks
```

## Verification (REQUIRED)

After ALL packages are published, verify that no `workspace:*` leaked:

```bash
npm view @buoy-design/core@X.Y.Z dependencies
npm view @buoy-design/scanners@X.Y.Z dependencies
npm view @buoy-design/cli@X.Y.Z dependencies
npm view ahoybuoy@X.Y.Z dependencies
npm view buoy-design@X.Y.Z dependencies
```

Every dependency value must be a real semver range (e.g., `^0.3.38`), never `workspace:*`.

## Version Sync Rules

| Rule | Packages | Enforcement |
|------|----------|-------------|
| MUST match | `@buoy-design/cli`, `ahoybuoy`, `buoy-design` | Hard requirement |
| SHOULD match | `@buoy-design/core`, `@buoy-design/scanners` | Match when both changed |

## GitHub Release

After publishing and verifying:

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes "Release notes here"
```

This triggers `.github/workflows/publish.yml`.

## Post-Publish Smoke Test

```bash
cd /tmp && rm -rf buoy-publish-test && mkdir buoy-publish-test && cd buoy-publish-test
npx ahoybuoy@X.Y.Z --version
```

## Quick Reference

```
Pre-publish:   pnpm build && pnpm test && pnpm typecheck
Publish:       pnpm --filter <pkg> publish --access public --no-git-checks
Verify:        npm view <pkg>@X.Y.Z dependencies
Release:       gh release create vX.Y.Z
Smoke test:    npx ahoybuoy@X.Y.Z --version
```

## Common Mistakes

| Mistake | Consequence | Prevention |
|---------|-------------|------------|
| Using `npm publish` instead of `pnpm publish` | `workspace:*` ships to npm | Always use `pnpm --filter <pkg> publish` |
| Publishing out of order | Downstream packages reference non-existent versions | Follow the numbered order above |
| Skipping verification step | Leaked `workspace:*` not caught until users install | Always run `npm view` after publish |
| Publishing only cli, forgetting wrappers | `ahoybuoy` / `buoy-design` stuck on old version | Publish all 5 packages every time |
| Version mismatch between cli and wrappers | Users get wrong version via `npx ahoybuoy` | Keep cli, ahoybuoy, buoy-design in sync |
| Running `pnpm publish` from package dir instead of using `--filter` | May not resolve workspace refs correctly | Always use `pnpm --filter <pkg> publish` from repo root |

## Past Incidents

- **v0.3.2**: Published with `npm publish` instead of `pnpm publish`. Workspace refs unresolved.
- **v0.3.24**: Version bump commit used `npm publish` to push packages. Workspace refs unresolved.
- **v0.3.34**: Core and cli published correctly, but wrapper packages (`ahoybuoy`, `buoy-design`) published with `npm publish`. Workspace refs leaked in wrappers only.
