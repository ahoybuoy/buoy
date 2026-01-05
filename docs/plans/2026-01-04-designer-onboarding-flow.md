# Designer Onboarding Flow

## Overview

A discovery-first onboarding experience for designers who find Buoy through the Figma plugin. The flow provides immediate value (understanding your Figma file) while guiding toward full visibility (connecting code).

## Core Value Proposition

- **Anchor** what exists (in Figma and code)
- **Visibility** into what you have
- **Protection** from drift

## Two Entry Paths (Same Destination)

**Path A: Design-first**
Figma/tokens exist → Import into Buoy → Scan reveals gaps in code

**Path B: Code-first**
Design system lives in code → Buoy discovers it → Designer refines → Can export to Figma

Both paths converge on the dashboard with full visibility.

---

## The Designer Journey (Figma-first)

### Step 1: Figma Plugin Discovery

Designer installs the Buoy Figma plugin. First run analyzes their current file:

```
Scanning your file...

Found:
- 34 colors (8 look like duplicates)
- 16 text styles
- 28 components
- No spacing tokens defined

Your design system health: 72%

[Clean up in Figma] [Continue anyway]
```

This is immediately useful - they learn something about their file. The "health score" gamifies improvement.

### Step 2: Optional Cleanup

If they tap "Clean up", the plugin helps:
- Merge duplicate colors
- Suggest naming conventions
- Define spacing scale from what's used
- Group related components

Each action improves their score. They're investing in their system.

### Step 3: Baseline & Intentional Exceptions

When showing issues, give them control:

```
8 duplicate colors found

- #3B82F6 and #3A81F5 → [Merge] [Keep both - intentional]
- #EF4444 appears in 3 unnamed styles → [Name it] [Ignore - one-off]

Tip: Intentional variations are fine! Mark them as "one-off"
so Buoy knows not to flag them later.
```

Everything marked as "intentional" becomes part of their baseline.

### Step 4: Category Opt-in (with gentle guidance)

```
What should Buoy track?

✓ Colors — 12 defined
✓ Typography — 8 text styles
○ Spacing — None defined yet
✓ Components — 28 found

💡 Spacing tokens help developers match your layouts exactly. [Learn why →]
```

They can skip categories, but we explain the value.

### Step 5: The Handoff Prompt

Once they're happy (or skip cleanup):

```
Your design intent is ready. To see how your codebase compares,
invite a developer to connect your repo.

[Copy invite link] [I'll do this later]
```

---

## Pro Tips (Configurable Education)

### Setting

```
Learning mode

○ Pro Tips ON — Show helpful explanations as you go
● Pro Tips OFF — Just the essentials

You can change this anytime in settings
```

### Smart Defaults

- First-time users → ON
- Users who skip/dismiss 3+ tips → Prompt to turn OFF
- Invited by teammate (existing account) → OFF

### Example Tips (when ON)

- "A **design token** is a named value that travels from Figma to code. When you call this blue `--color-primary`, developers use the same name."
- "This is your **source of truth**. When code drifts from it, Buoy will let you know."
- "You just baselined 3 items. Now Buoy won't flag these again."

---

## Developer Handoff Flow

### The Invite (Designer's View)

Designer clicks "Invite developer to connect repo":

```
Invite a developer

They'll connect your GitHub repo so Buoy can scan your codebase.

[Copy link] or [Enter email]

This takes about 2 minutes for them
```

### Developer Landing Page

Developer clicks the invite link:

```
Alex needs your help connecting their design system

You'll install the Buoy GitHub App on your repo. This lets Buoy:
- Scan for components and tokens
- Comment on PRs when code drifts from the design system
- Run checks in CI (optional)

Time: ~2 minutes

[Connect with GitHub]
```

No account creation friction. OAuth with GitHub, pick the repo, done.

### The Connection Flow

1. Dev clicks "Connect with GitHub"
2. GitHub OAuth → select org/repo
3. Buoy installs GitHub App
4. First scan runs automatically
5. Success screen:

```
Connected!

Scanning acme/marketing-site...

Found: 52 components, 34 tokens, 3 drift signals

Alex will see this in their dashboard now.

[View dashboard] [Close]
```

### Designer Gets Notified

Back in Figma or email:

```
🎉 Your repo is connected!

Jamie connected acme/marketing-site. Your dashboard is ready.

[See your design system →]
```

### The "Aha" Moment

Designer opens dashboard for the first time with data:

```
Your Design System

94% aligned

52 components in code — 28 match your Figma
34 tokens in code — 12 are undefined in your system

3 items need your attention ← (the inbox)
```

The scaffolding they set up is now compared against reality.

---

## Data Model

### New Tables/Fields

**user_preferences**
| Column | Type | Description |
|--------|------|-------------|
| user_id | FK | Reference to user |
| pro_tips_enabled | boolean | Show education tips |
| tips_dismissed_count | integer | Track for auto-disable |

**design_intent**
| Column | Type | Description |
|--------|------|-------------|
| id | text | Primary key |
| account_id | FK | Reference to account |
| source | enum | 'figma', 'manual', 'code_discovery' |
| tokens | json | Expected tokens |
| components | json | Expected components |
| baseline_exceptions | json | Intentionally ignored items |
| tracking_categories | json | Which categories to track |
| created_at | timestamp | |
| updated_at | timestamp | |

**developer_invites**
| Column | Type | Description |
|--------|------|-------------|
| id | text | Primary key |
| account_id | FK | Reference to account |
| invited_by | FK | User who created invite |
| token | text | Unique invite token |
| status | enum | 'pending', 'accepted', 'expired' |
| accepted_by | FK | User who accepted |
| repo_connected | text | Repo that was connected |
| created_at | timestamp | |
| expires_at | timestamp | |

---

## Implementation Phases

### Phase 1: Figma Plugin MVP
- File analysis (colors, typography, components)
- Health score calculation
- Basic cleanup suggestions
- Export design intent to Buoy API

### Phase 2: Dashboard Empty States
- Design intent display (before code connected)
- Developer invite flow
- Invite landing page for developers

### Phase 3: Connection & First Scan
- GitHub App OAuth for invited developers
- Auto-run first scan on connection
- Notification to designer
- Dashboard "lights up" with comparison data

### Phase 4: Baseline & Exceptions
- Mark items as intentional/one-off
- Category opt-out
- Baseline storage and drift filtering

### Phase 5: Pro Tips System
- Tip content and placement
- Preference storage
- Smart default logic
- Dismiss tracking

---

## Success Metrics

- **Plugin install → invite sent**: % of designers who complete Figma setup
- **Invite → connection**: % of developer invites that result in repo connection
- **Time to first insight**: Minutes from plugin install to seeing code comparison
- **Baseline usage**: % of users who mark intentional exceptions
- **Pro tips engagement**: View/dismiss rate, correlation with retention
