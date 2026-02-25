# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.27] - 2026-02-25

### Fixed
- Tailwind token usage matching now correctly treats Tailwind-scanned token names (`tw-*`, `*-dark`) as equivalent to semantic utility usages (e.g., `bg-surface`), fixing widespread unused-token false positives
- Next.js App Router route components (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `template.tsx`) are properly exempted from unused-component drift when framework-consumed by the router
- Tailwind v4 CSS variable `--text` is categorized as a color token (not typography), preventing color tokens from polluting `typography.md`

## [0.3.26] - 2026-02-25

### Fixed
- Tailwind semantic utility usage now counts as token usage in unused-token checks (e.g., `bg-surface`, `text-foreground`), reducing false positives in Tailwind-heavy projects
- `buoy dock hooks` now finds `.git` / hook config files by walking up to the monorepo root, so hook installation works from package subdirectories
- `buoy dock` config generation now maps Next.js to `sources.nextjs` (not `react`) and generates `app/`, `src/`, and `components/` include patterns
- Monorepo pattern expansion preserves workspace `app/` and `components/` directories instead of incorrectly forcing them under `src/`
- Framework detection now scans all workspace packages instead of stopping after the first 20, improving monorepo auto-detection reliability
- `buoy dock skills/context/agents` scans from the resolved config/workspace root, preventing empty component inventories when run from monorepo subdirectories
- Skill export now renders raw spacing/typography token values (e.g., `clamp(...)`, raw font stacks) instead of blank table cells

## [0.3.20] - 2026-02-15

### Breaking Changes
- **`buoy drift baseline` renamed to `buoy drift ignore`** — clearer intent, matches `.gitignore` convention
  - `baseline create` → `ignore all`
  - `baseline update` → `ignore add`
  - `baseline show` → `ignore show`
  - `baseline clear` → `ignore clear`
  - `.buoy/baseline.json` → `.buoy/ignore.json`
  - `--include-baseline` flag → `--include-ignored`

### Fixed
- Fix generator: radius drift now matches `border` category tokens (was incorrectly matching `spacing`)
- Fix generator: font-size drift matches `typography` tokens only (no longer falls through to `spacing`)
- Fix confidence: raw token values (e.g., `1rem`) now parsed and matched to px drift signals
- Token suggestions now appear in `buoy show drift` output (previously only in `buoy drift fix`)

## [0.3.18] - 2026-02-15

### Fixed
- Token categorization — spacing tokens with `space` prefix (not just `spacing`) now categorized correctly
- Token categorization — z-index tokens (`--z-modal`, `--zindex-*`) get proper `zIndex` category instead of `other`
- Token categorization — DTCG `dimension` type and typography sub-types (`lineHeight`, `letterSpacing`) mapped correctly
- rem ↔ px conversion in suggestion builder — tokens stored as raw values (e.g., `1rem`) now match drift signals in px (e.g., `16px`)
- Typography values no longer matched to spacing tokens — `14px` font-size won't suggest `--spacing-3-5`

### Added
- `zIndex` added to `TokenCategorySchema` as a first-class token category

## [0.3.17] - 2026-02-15

### Added
- Token suggestions surfaced in CLI drift output — shows actual matched token name and confidence (e.g., `--color-primary (92%)`) instead of generic `use var(--color-*)`
- `tokenSuggestions` field included in JSON drift output for AI agent consumption
- Prioritized drift output — files with most issues shown first, "Fix X first" hint for files with 3+ issues
- Config presets (`strict`, `relaxed`, `default`) — one-line config for common drift policies
- `failOn` and `exclude` fields added to drift config schema
- Local scan history with health score trends — shows delta (`▲ +5`, `▼ -3`) from last scan

## [0.3.16] - 2026-02-15

### Fixed
- Vendored shadcn file detection now matches filename + any UI-related directory (not just `components/ui/`)
- Score 100 now reachable — density < 0.1 treated as 0 for clean repos
- Tailwind config token extraction rewritten with brace-matching (regex failed on nested configs)
- Score gaps reduced — continuous raw scoring for valueDiscipline/consistency, finer critical steps
- Scanner timeout increased 60s → 90s, file cap lowered 5000 → 3000 with depth-first sorting
- Unused component false positives reduced — added Lit `customElements.define`, Nuxt auto-imports, Astro entry points
- Added `createTheme()`/`extendTheme()` token extraction for MUI and Mantine

### Removed
- Removed `@buoy-design/agents` package (deprecated on npm)
- Removed `@buoy-design/db` package (deprecated on npm)
- Removed `@buoy-design/mcp` package (deprecated on npm)
- Removed `ahoybuoy` wrapper package (deprecated on npm)
- Removed `@buoy-design/figma-widget` package (was never published)

## [0.3.15] - 2026-02-14

### Fixed
- Vendored shadcn files excluded from worstFile for all drift types (not just hardcoded-value)
- Token extraction from Tailwind `theme.extend` config objects
- Per-scanner 60s timeout to prevent CLI hangs on massive repos
- 5,000 file cap per scanner to prevent memory exhaustion
- tokenHealth scoring made continuous (was binary 0/5 for utility/library detection)
- Unused component false positives reduced — NgModule declarations, Storybook story imports, Angular template selectors
- Drift density penalty tightened: >200 drift capped at 69, >100 graduated 74-84, >50 + high density capped at 89

## [0.3.14] - 2026-02-14

### Fixed
- Reverted TailwindConfigParser in token scanner (caused hangs on large repos due to `glob('**/*.css')`)

## [0.3.12] - 2026-02-13

### Added
- Drift density caps — prevent high-drift repos from scoring "Great"
- Tailwind config token parsing for `theme.extend` colors and spacing

### Fixed
- Reduced false-positive drift signals in vendored/generated files

## [0.3.11] - 2026-02-13

### Added
- Tiered, framework-aware health suggestions with specific values and file paths
- Suggestions for all repos with drift signals, scaled by severity

### Fixed
- Design system library detection wired into health scoring
- Token name prefix normalization when checking usage
- Health score threshold recalibration for better tier distribution
- Monorepo detection in health scoring, Tailwind v4 and shadcn detection
- Recursive CSS file scanning for token definitions in monorepo sub-packages
- criticalIssues pillar expanded to include high-density hardcoded files
- Vendored shadcn drift separated from user code in health scoring
- Null score returned for repos with no UI surface (0 components, 0 tokens, 0 drift)
- CSS and generated files excluded from worst-file ranking
- Drift total consistency between health and drift commands
- Reduced false-positive unused components (entry points, barrel re-exports, dynamic imports)
- Scaled consistency/critical pillars for low-component repos, making Terrible tier reachable

## [0.3.9] - 2026-02-13

### Added
- **4-Pillar Health Score System** — Value Discipline (0-60), Token Health (0-20), Consistency (0-10), Critical Issues (0-10)

## [0.3.8] - 2026-02-12

### Fixed
- Missing-documentation signals gated on adoption rate to reduce noise

## [0.3.7] - 2026-02-12

### Fixed
- Resolved all 10 open GitHub issues

## [0.3.6] - 2026-02-12

### Changed
- `show` command now mirrors dock tools (tokens compare, tokens import, graph learn)
- Removed `begin` command (replaced by `buoy dock`)

## [0.3.5] - 2026-02-12

### Fixed
- Updated all command references to new CLI structure in hooks and docs

## [0.3.4] - 2026-02-12

### Changed
- **CLI consolidation** — reduced from 17 to 6 top-level commands (`show`, `drift`, `dock`, `ahoy`, `graph`, `compare`)

## [0.3.3] - 2026-02-12

### Fixed
- Workspace protocol leak in published packages

## [0.3.2] - 2026-02-12

### Added
- Cross-source comparison for orphaned and divergence detection
- Source classifier for code vs canonical token partitioning
- Canonical glob patterns in token source config
- Unused-component and unused-token detection via `collectUsages`
- Missing-documentation detection in `analyzeComponents`
- Framework-sprawl detection via ProjectDetector
- Accessibility-conflict and color-contrast drift detection
- Repeated-pattern detection promoted from experimental to always-on

### Fixed
- Wired up 6 missing commands (compare, graph, history)

## [0.3.0] - 2026-02-10

### Added
- **12 new drift signal types** — z-index, sizing-value, inline-style, arbitrary-value, radius, shadow, opacity, motion, border-width, line-height, letter-spacing, breakpoint
- Value-level and file-level extractors for all new signal types
- Types-only export path for Worker environments
- New drift types wired into CLI cloud client and signal mapper

## [0.2.26] - 2026-01-26

### Fixed
- Next.js scanner now auto-enables in zero-config mode
- Projects with `next` dependency automatically use dedicated Next.js scanner

## [0.2.25] - 2026-01-26

### Added
- **Next.js Scanner** - Dedicated support for Next.js projects
  - Server vs client component detection (`'use client'` directive)
  - App Router structure scanning (pages, layouts, loading, error)
  - Route group and dynamic segment detection
  - CSS module analysis for hardcoded values
  - `next/image` usage validation
- Enhanced React scanner with hook usage detection
- Enhanced Vue scanner with Nuxt project info support
- Enhanced Angular scanner with NgModule and Material override detection
- Enhanced Tailwind scanner capabilities
- Enhanced Figma component scanner
- Enhanced Storybook story extraction
- Automated npm publishing workflow
- Workflow enforcement hooks for Claude Code

## [0.2.23] - 2026-01-23

### Added
- `ahoybuoy` wrapper package for shorter CLI command (`npx ahoybuoy begin`)

### Changed
- New tagline: "Catch design drift before it ships"

### Fixed
- Begin command now uses correct package reference
- Fixed duplicate menu text in begin wizard

## [0.2.20] - 2026-01-20

### Added
- **Self-Validating Agents** - Turn Claude Code into a self-correcting agent with `buoy dock hooks --claude`
- **Compound Component Grouping** - Scanners detect patterns like `Tabs`, `TabsList`, `TabsTrigger`
- Laravel-style Vue paths auto-detection (`resources/js/`)
- `.js` file support for React component detection
- Nested frontend directory detection for full-stack apps

### Fixed
- ESM compatibility for validation hooks (Node.js pipe buffer fix)
- Vue lowercase filename detection (`rate.vue` → `Rate`)
- Config merging with auto-detected frameworks

## [0.2.19] - 2026-01-19

### Added
- Laravel-style Vue paths to auto-detection (`resources/js/`)

### Fixed
- Detect Vue components with lowercase filenames
- ESM compatibility for validation hooks

## [0.2.18] - 2026-01-18

### Added
- Self-Validating Claude Code hooks (`buoy dock hooks --claude`)
- PostToolUse hook for automatic drift feedback

## [0.2.17] - 2026-01-17

### Added
- Compound component detection for all frameworks (React, Vue, Svelte, Angular)
- Directory-based grouping for component families

## [0.2.16] - 2026-01-16

### Added
- Compound component detection for React
- Name prefix detection for component grouping

## [0.2.15] - 2026-01-15

### Changed
- Improved configuration system
- Better framework auto-detection

## [0.2.14] - 2026-01-14

### Fixed
- Various bug fixes and improvements

## [0.2.0] - 2026-01-10

### Added
- Initial public release
- React, Vue, Svelte, Angular component scanning
- Design token extraction (CSS, SCSS, Tailwind, JSON)
- Drift detection engine
- `buoy show` commands for AI agents
- `buoy begin` interactive wizard
- `buoy dock` project configuration
- `buoy check` pre-commit hook support
- `buoy baseline` for brownfield projects
- `buoy fix` automated fixes
- GitHub Actions integration
- Figma plugin support

[Unreleased]: https://github.com/ahoybuoy/buoy/compare/v0.3.18...HEAD
[0.3.18]: https://github.com/ahoybuoy/buoy/releases/tag/v0.3.18
[0.3.17]: https://github.com/ahoybuoy/buoy/releases/tag/v0.3.17
[0.3.16]: https://github.com/ahoybuoy/buoy/releases/tag/v0.3.16
[0.3.15]: https://github.com/ahoybuoy/buoy/releases/tag/v0.3.15
[0.3.14]: https://github.com/ahoybuoy/buoy/releases/tag/v0.3.14
[0.3.12]: https://github.com/ahoybuoy/buoy/releases/tag/v0.3.12
[0.3.11]: https://github.com/ahoybuoy/buoy/releases/tag/v0.3.11
[0.3.9]: https://github.com/ahoybuoy/buoy/releases/tag/v0.3.9
[0.3.8]: https://github.com/ahoybuoy/buoy/releases/tag/v0.3.8
[0.3.7]: https://github.com/ahoybuoy/buoy/releases/tag/v0.3.7
[0.3.6]: https://github.com/ahoybuoy/buoy/releases/tag/v0.3.6
[0.3.5]: https://github.com/ahoybuoy/buoy/releases/tag/v0.3.5
[0.3.4]: https://github.com/ahoybuoy/buoy/releases/tag/v0.3.4
[0.3.3]: https://github.com/ahoybuoy/buoy/releases/tag/v0.3.3
[0.3.2]: https://github.com/ahoybuoy/buoy/releases/tag/v0.3.2
[0.3.0]: https://github.com/ahoybuoy/buoy/releases/tag/v0.3.0
[0.2.26]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.26
[0.2.25]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.25
[0.2.23]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.23
[0.2.20]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.20
[0.2.19]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.19
[0.2.18]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.18
[0.2.17]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.17
[0.2.16]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.16
[0.2.15]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.15
[0.2.14]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.14
[0.2.0]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.0
