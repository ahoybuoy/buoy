# Buoy

[![GitHub App](https://img.shields.io/badge/GitHub%20App-Marketplace-blue?logo=github)](https://github.com/marketplace/buoy-design)

**Catch design drift before it ships.**

AI coding tools are fast—but they don't know your design system. They'll write `#3b82f6` when you have `--color-primary`. They'll use `padding: 17px` when your spacing scale is multiples of 4.

Buoy watches for these issues and helps you fix them.

```
src/components/Button.tsx:24
  hardcoded-value: #3b82f6 → var(--color-primary) (92% match)
```

## Code-first System Observability

Your shipped code is the design-system source of truth. Declare the packages you
own, then use Buoy to map adoption, unmanaged UI surface area, and the blast
radius of a component or token change. Figma and other design tools can remain
optional inputs; they are not required for the system map.

```yaml
# .buoy.yaml
project:
  name: acme

system:
  components:
    - packages/ui/src/**
  tokens:
    - packages/tokens/src/**
  owners:
    - name: Checkout
      paths:
        - apps/checkout/**
```

```bash
buoy system map                 # Canonical system vs unmanaged surface area
buoy system impact Button       # Consumers and migration risk for a change
buoy system impact color-primary --kind token
```

This is the foundation for cloud adoption trends, deprecation planning, and
AI-assisted iteration reporting: every result is derived from code and can be
attributed to a repository path and owner.

## Quick Start

```bash
# See your design system immediately (zero config)
npx ahoybuoy show all

# Add project configuration and local integrations when ready
npx ahoybuoy dock
```

No config needed. Buoy auto-detects your framework and starts working immediately.

## What It Catches

| Issue                       | Example                                              |
| --------------------------- | ---------------------------------------------------- |
| **Hardcoded colors**        | `#ff0000` instead of `var(--color-primary)`          |
| **Arbitrary spacing**       | `padding: 17px` instead of design scale              |
| **Tailwind escape hatches** | `p-[13px]` instead of `p-4`                          |
| **Naming inconsistencies**  | `ButtonNew`, `ButtonV2`, `ButtonOld`                 |
| **Unused components**       | Defined but never imported or rendered               |
| **Semantic mismatches**     | Same prop typed `string` in one, `number` in another |
| **Repeated patterns**       | Same Tailwind classes copy-pasted 5+ times           |
| **Framework sprawl**        | React + Vue + jQuery in same codebase                |
| **Detached components**     | Instances without main component                     |

## Commands

```
buoy
├── show                    # Read design system info (for AI agents)
│   ├── components          # Components in codebase
│   ├── tokens              # Design tokens found
│   ├── drift               # Design system violations
│   ├── health              # Health score
│   ├── history             # Scan history
│   ├── config              # Current .buoy.yaml configuration
│   ├── skills              # AI agent skill files
│   ├── agents              # Configured AI agents
│   ├── context             # Design system context in CLAUDE.md
│   ├── hooks               # Configured hooks
│   ├── commands            # Installed slash commands
│   ├── graph               # Knowledge graph stats
│   ├── plugins             # Available scanners
│   └── all                 # Everything combined
├── drift                   # Drift detection and fixing
│   ├── scan                # Scan codebase for components/tokens
│   ├── check               # Pre-commit drift check
│   ├── fix                 # Suggest/apply fixes
│   └── ignore              # Ignore existing drift
│       ├── all             # Ignore all current drift (requires --reason)
│       ├── show            # View ignored drift signals
│       ├── add             # Add new drift to ignore list (requires --reason)
│       └── clear           # Remove ignore list
├── rescue                  # Complete measure → repair → guard → prove journey
│   ├── plan                # Build a local baseline and repair plan
│   ├── apply               # Apply reviewed safe fixes on a new branch
│   ├── verify              # Run detected typecheck/test scripts
│   ├── guard               # Record reviewed legacy drift with reasons
│   ├── report              # Generate JSON, Markdown, and HTML evidence
│   └── rollback            # Restore local pre-Rescue backups
├── dock                    # Dock tools into your project
│   ├── config              # Create .buoy.yaml
│   ├── skills              # Create AI agent skills
│   ├── agents              # Set up AI agents
│   ├── context             # Generate CLAUDE.md context
│   ├── hooks               # Set up hooks (--claude for self-validating AI)
│   ├── commands            # Install Claude slash commands
│   ├── plugins             # Show available scanners
│   ├── tokens              # Generate/export design tokens
│   │   ├── compare         # Compare token sources
│   │   └── import          # Import tokens from Figma/CSS
│   └── graph               # Build design system knowledge graph
│       └── learn           # Learn patterns from codebase
└── ahoy                    # Cloud features
    ├── login               # Authenticate
    ├── logout              # Sign out
    ├── status              # Account + bot + sync status
    ├── github              # Set up GitHub PR bot
    ├── gitlab              # Set up GitLab PR bot (soon)
    ├── billing             # Manage subscription
    └── plans               # Compare pricing
```

## For AI Agents

Coding agents hardcode values because they never read your token file. Give them Buoy as an MCP server:

```bash
npx @buoy-design/cli mcp install claude   # or cursor, codex, windsurf, all
```

Claude Code (and any MCP client) gets four tools: `list_design_tokens`, `find_token_for_value`
(`#1a73e8` → `--color-primary`), `check_design_drift` (line-level, with the token to use instead)
and `design_system_context`. Claude Code also gets a `PostToolUse` hook that checks every style
file it edits and hands the fixes back before it moves on. See [docs/integrations/mcp](https://buoy.design/docs/integrations/mcp).

In Claude Code, the plugin bundles all of it: `/plugin marketplace add ahoybuoy/buoy`, then `/plugin install buoy@buoy`.

To review every pull request as well, install the free [GitHub App](https://github.com/marketplace/buoy-design); no Buoy account is needed.

The `show` command outputs JSON for AI agents to consume:

```bash
# Get everything an AI agent needs
buoy show all --json

# Just drift signals
buoy show drift --json

# Components inventory
buoy show components --json
```

Example output:

```json
{
  "components": [...],
  "tokens": [...],
  "drift": {
    "signals": [...],
    "summary": { "total": 12, "critical": 2, "warning": 7, "info": 3 }
  },
  "health": { "score": 78 }
}
```

## Getting Started

### Complete a Rescue journey

```bash
buoy rescue plan
# Review .buoy/rescue/runs/<run-id>/report.html
buoy rescue apply --run <run-id> --approve
buoy rescue guard --run <run-id> --reason "Reviewed legacy baseline" --actor "Design systems team"
buoy rescue report --run <run-id>
```

Rescue keeps ambiguous findings review-only, runs detected project checks after
applying high-confidence changes, and retains local backups for rollback. It does
not commit, push, open a pull request, or upload source code. See
[docs/rescue.md](docs/rescue.md) for the complete workflow.

### Configure Your Project

```bash
buoy dock
```

Smart walkthrough that sets up:

1. `.buoy.yaml` — Project configuration
2. AI agent skills — For Claude Code, Copilot, etc.
3. CLAUDE.md context — Design system documentation
4. Git hooks — Pre-commit drift checking

### Configure severities per drift type

```yaml
# .buoy.yaml
project:
  name: my-app

drift:
  severity:
    hardcoded-value: critical
    naming-inconsistency: warning

  # Ignore specific drift (filter by type, file, component, token, value, severity)
  ignore:
    - type: hardcoded-value
      file: "src/legacy/**"
    - severity: info

  # Promote matching drift to a higher severity
  promote:
    - type: hardcoded-value
      file: "src/components/**"
      to: critical
      reason: "Design system components must use tokens"

  # Enforce — always treat matching drift as critical
  enforce:
    - type: naming-inconsistency
      component: "^Button"
      reason: "Button naming is standardized"

health:
  # CI gate — exit code 1 if health score falls below threshold
  failBelow: 70
```

## Drift Detection

### Quick Check

```bash
buoy drift check
```

Fast pre-commit hook friendly. Exits with error code if drift found.

### Detailed Analysis

```bash
buoy show drift
```

```json
{
  "drifts": [
    {
      "type": "hardcoded-value",
      "severity": "warning",
      "file": "src/components/Button.tsx",
      "line": 24,
      "message": "#3b82f6 should use var(--color-primary)",
      "suggestion": "var(--color-primary)"
    }
  ]
}
```

### Fix Issues

```bash
buoy drift fix                    # Interactive fix suggestions
buoy drift fix --dry-run          # Preview changes
buoy drift fix --apply            # Apply reviewed high-confidence fixes
```

### Ignore Existing Drift

For brownfield projects, ignore existing issues and only flag new ones:

```bash
buoy drift ignore all -r "Legacy code before design system"     # Ignore all current drift with reason
buoy drift ignore add -r "Third-party components"               # Add new drift to ignore list
buoy drift ignore show                                          # View ignored drift with reasons
buoy drift check                                                # Only fails on new drift
```

A reason is required when ignoring drift to maintain accountability.

## CI Integration

### GitHub Actions

```yaml
name: Design System Check
on: [pull_request]

jobs:
  buoy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npx ahoybuoy drift check
```

### Design health badge

Repos scanned by Buoy Cloud get a live score badge for the README:

```markdown
[![design health](https://api.buoy.design/badges/OWNER/REPO.svg)](https://buoy.design)
```

Green at 80+, yellow at 60+, red below. It updates within five minutes of each scan.

### PR Comments with Buoy Cloud

```bash
# Set up GitHub PR bot
buoy ahoy login
buoy ahoy github
```

The GitHub bot automatically comments on PRs with drift analysis.

## AI Guardrails

Keep AI coding assistants (Copilot, Claude, Cursor) aligned with your design system:

```bash
# Set up AI agents with design system context
buoy dock agents
```

Creates:

- **AI Skills** — Design system knowledge for Claude Code
- **Claude Hooks** — Auto-inject context at session start
- **CLAUDE.md** — Project-specific AI instructions

### Self-Validating Agents (Claude Code)

Turn Claude Code into a self-correcting agent. When Claude writes a component, Buoy checks it and feeds corrections back automatically:

```bash
buoy mcp install claude     # MCP server + line-level hook (recommended)
buoy dock hooks --claude    # hook only, component-level
```

This installs a PostToolUse hook that:

1. Claude writes/edits a component file
2. Hook runs `buoy drift check` on the modified file
3. If drift detected, feedback returns to Claude
4. Claude self-corrects without prompting

Example feedback Claude receives:

```
⚠️ Design drift detected in Button.tsx:

• hardcoded-value: Component "Button" has 3 hardcoded colors: #3b82f6, #ffffff, #1e40af

Run `buoy show drift` for full details.
```

Works with React, Vue, Svelte, and Angular components. Skips test files and configs.

## Configuration

Works without config, but you can save settings:

```bash
buoy dock config
```

Creates `.buoy.yaml`:

```yaml
project:
  name: my-app

sources:
  react:
    enabled: true
    include:
      - src/**/*.tsx
    exclude:
      - "**/*.test.*"
  tokens:
    enabled: true
    files:
      - design-tokens.css
```

## Buoy Cloud

Ship your drift detection to the cloud:

```bash
buoy ahoy login             # Authenticate
buoy ahoy status            # View account, bot, sync status
buoy ahoy github            # Set up GitHub PR bot
buoy ahoy billing           # Manage subscription
```

Features:

- **PR Bot** — Automatic comments on pull requests
- **Dashboard** — View drift trends over time
- **Team sync** — Share results across team members

## Supported Frameworks

**Components:** React, Vue, Svelte, Angular, Lit, Stencil, Alpine, HTMX

**Templates:** Blade, ERB, Twig, Razor, Jinja, Handlebars, EJS, Pug

**Tokens:** CSS variables, SCSS, Tailwind config, JSON, Style Dictionary

**Design Tools:** Figma (plugin + API integration)

## Philosophy

**Inform by default, block by choice.**

Buoy shows you what's happening without getting in your way. Teams adopt enforcement when they're ready:

```bash
buoy show drift             # Just show me
buoy drift check            # Pre-commit check (fails on critical)
buoy drift check --fail-on warning    # Fail on warning or above
buoy drift check --fail-on none       # Never fail (report only)
buoy drift check --staged             # Only check staged files
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run CLI locally
node apps/cli/dist/bin.js show all
```

## Packages

| Package                 | Description                              |
| ----------------------- | ---------------------------------------- |
| `@buoy-design/cli`      | Command-line interface                   |
| `@buoy-design/core`     | Domain models and drift detection engine |
| `@buoy-design/scanners` | Framework-specific code scanners         |
| `ahoybuoy`              | CLI wrapper (`npx ahoybuoy`)             |
| `buoy-design`           | CLI wrapper (`npx buoy-design`)          |

## License

MIT
