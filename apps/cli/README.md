# ahoybuoy

Catch design drift before it ships. Buoy scans your codebase to find where AI-generated code diverges from your design system.

## Quick Start

```bash
npx ahoybuoy show all
```

This scans your project without requiring configuration.

## What It Finds

- **Hardcoded colors** like `#3b82f6` instead of design tokens
- **Magic numbers** like `padding: 17px` instead of spacing variables
- **AI-generated code** that ignores your team's patterns

## Commands

| Command            | Purpose                                       |
| ------------------ | --------------------------------------------- |
| `buoy show all`    | Scan for components, tokens, and drift        |
| `buoy drift check` | Pre-commit drift validation                   |
| `buoy drift fix`   | Preview or apply drift fixes                  |
| `buoy rescue`      | Measure, repair, guard, and prove improvement |
| `buoy dock`        | Configure project (agents, hooks, etc.)       |
| `buoy ahoy`        | Cloud features (login, GitHub bot, billing)   |

## Fix Command

The `buoy drift fix` command suggests and applies fixes for design drift:

```bash
buoy drift fix                    # Preview fixable issues
buoy drift fix --dry-run          # Show detailed diffs
buoy drift fix --apply            # Apply high-confidence fixes
buoy drift fix --confidence=high  # Require high-confidence matches
```

## Rescue workflow

For an existing codebase, Rescue turns the commands into one reviewable journey:

```bash
buoy rescue plan
# Review .buoy/rescue/runs/<run-id>/report.html
buoy rescue apply --run <run-id> --approve
buoy rescue guard --run <run-id> --reason "Reviewed legacy baseline"
buoy rescue report --run <run-id>
```

Apply requires a clean Git worktree and creates a new `buoy/<run-id>` branch.
Buoy never commits, pushes, merges, or uploads source code. Ambiguous changes stay
review-required, and `buoy rescue rollback` restores local backups.

### Confidence Levels

| Level      | Score  | Description                          |
| ---------- | ------ | ------------------------------------ |
| **exact**  | 100%   | Value exactly matches a design token |
| **high**   | 95-99% | Very close match, safe to auto-apply |
| **medium** | 70-94% | Close match, review recommended      |
| **low**    | <70%   | Ambiguous, manual review required    |

## AI Integration

Buoy works great with AI coding tools:

```bash
# Set up AI agents with design system context
buoy dock agents

# Generate CLAUDE.md context
buoy dock context
```

## Zero Config

Buoy auto-detects your framework (React, Vue, Svelte, Angular, Astro) and scans standard paths. No configuration required to get started.

## Telemetry

Off by default. After your first drift result in an interactive terminal, Buoy asks once whether it may send anonymous usage pings. Say no and it never asks again.

If you opt in, it sends event names (`cli_first_run`, `cli_drift_found`, `cli_check_clean`, `cli_hint_shown`, `cli_login_started`) with counts, the CLI version, and your OS. Never file paths, repository names, code, or account details. A random id in `~/.buoy/config.json` groups pings from one install and is not tied to you.

```bash
buoy ahoy telemetry          # show the setting and the exact payload
buoy ahoy telemetry off      # or on
```

`BUOY_TELEMETRY=0`, `DO_NOT_TRACK=1`, or `CI` in the environment disables it regardless of the setting. JSON and quiet output never send.

## Links

- [Documentation](https://buoy.design/docs)
- [GitHub](https://github.com/ahoybuoy/buoy)
