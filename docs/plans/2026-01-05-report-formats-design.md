# Buoy Report Formats: At-a-Glance Design System Health

> **Date:** 2026-01-05
> **Status:** Design Document
> **Parent:** [Master Vision](./2026-01-05-master-vision.md)

---

## Overview

Four distinct 1-page report formats, each tailored to a specific audience and use case. All reports share a design philosophy: **show the most important information first, make actions obvious, and tell a story rather than dump data.**

---

## Report 1: Developer Daily Brief

**Audience:** Individual developers
**Timing:** Pre-commit, pre-PR, on-demand
**Purpose:** "Am I about to introduce drift?"

### Design Principles
- **Immediate actionability** - Show what's wrong and how to fix it
- **Contextual** - Only show issues relevant to *their* changes
- **Non-judgmental** - Help, don't scold
- **Quick exit** - One command to fix, one to ignore

### Layout

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  BUOY DEVELOPER BRIEF                                    main ← feature/xyz  │
│  Your changes vs. design system                          Generated: 2m ago   │
╰──────────────────────────────────────────────────────────────────────────────╯

┌─ YOUR CHANGES ───────────────────────────────────────────────────────────────┐
│                                                                              │
│  Files touched: 4        Components modified: 2        New patterns: 1      │
│                                                                              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                               │
│  │ Button.tsx │ │ Card.tsx   │ │ Modal.tsx  │  ✓ No issues                  │
│  │ ✓ Clean    │ │ ⚠ 2 warns  │ │ ✓ Clean    │                               │
│  └────────────┘ └────────────┘ └────────────┘                               │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ ACTION NEEDED ──────────────────────────────────────────────────────────────┐
│                                                                              │
│  ⚠  Card.tsx:47  Hardcoded color #3B82F6                                    │
│     └─ Use: bg-primary or var(--color-primary)                              │
│     └─ Why: This blue is 1 shade off brand. Theme changes won't apply.      │
│                                                                              │
│  ⚠  Card.tsx:52  Non-standard spacing (14px)                                │
│     └─ Use: spacing-md (16px) or spacing-sm (12px)                          │
│     └─ Why: 14px breaks the 4px rhythm. Closest: 12px or 16px.              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  buoy fix --interactive    ←  Fix these now with guided prompts        │ │
│  │  buoy ignore Card.tsx:47   ←  Mark as intentional (adds @buoy-ignore)  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ COMPONENTS YOU'RE USING ────────────────────────────────────────────────────┐
│                                                                              │
│  Button ●●●●● 98% healthy   Card ●●●○○ 67% healthy   Modal ●●●●○ 84%       │
│  └─ 847 uses, 12 with drift  └─ 234 uses, 78 drift   └─ 156 uses, 25 drift │
│                                                                              │
│  💡 Card has known issues. Consider using CardV2 (beta) for new features.   │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ QUICK STATS ────────────────────────────────────────────────────────────────┐
│  Your drift rate: 3.2%  │  Team avg: 4.1%  │  Trend: ↓ improving           │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key Elements

| Section | Purpose |
|---------|---------|
| Header | Context: which branch, how fresh the data |
| Your Changes | Summary of scope - files, components, patterns |
| Action Needed | The critical section - what to fix and how |
| Components You're Using | Awareness of component health |
| Quick Stats | Motivation - personal performance vs team |

### CLI Command

```bash
buoy brief                    # Before commit
buoy brief --pr               # Before PR (more comprehensive)
buoy brief --json             # For tooling integration
```

---

## Report 2: Design System Team Dashboard

**Audience:** Design system maintainers, design ops
**Timing:** Weekly, sprint boundaries
**Purpose:** System-wide health, adoption trends, emerging patterns

### Design Principles
- **Trends over snapshots** - Show direction, not just current state
- **Identify hotspots** - Where is drift concentrated?
- **Pattern democracy** - Surface organic patterns for consideration
- **Actionable insights** - Every metric suggests a response

### Layout

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  DESIGN SYSTEM HEALTH REPORT                           Week of Jan 6, 2026   │
│  @acme/design-system v4.2.1                            vs. last week: +2.3%  │
╰──────────────────────────────────────────────────────────────────────────────╯

┌─ SYSTEM HEALTH ──────────────────────────────────────────────────────────────┐
│                                                                              │
│     TOKEN COVERAGE          COMPONENT ADOPTION         PATTERN CONSISTENCY   │
│     ████████████░░ 84%      ██████████████░░ 91%       ██████████░░░░ 72%   │
│          ↑ 2%                    ↓ 1%                       ↑ 4%            │
│                                                                              │
│     Components: 47           Total instances: 12,847    Active repos: 8     │
│     Tokens: 186              Drift signals: 1,203       Contributors: 34    │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ DRIFT DISTRIBUTION ─────────────────────────────────────────────────────────┐
│                                                                              │
│  By Type                              By Team                                │
│  ─────────────────────                ─────────────────────                  │
│  Hardcoded colors   ████████ 342      Checkout team  ████████ 412           │
│  Non-token spacing  ██████ 267        Dashboard      ██████ 301             │
│  Custom variants    ████ 198          Mobile app     ████ 234               │
│  Deprecated usage   ███ 156           Auth flows     ███ 156                │
│  Accessibility      ██ 89             Settings       ██ 100                 │
│                                                                              │
│  🔥 Hotspot: Checkout team introduced 127 new drift signals this week       │
│     └─ Root cause: New contractor unfamiliar with tokens. Onboarding gap.   │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ COMPONENT HEALTH ───────────────────────────────────────────────────────────┐
│                                                                              │
│  ✓ HEALTHY (>90%)        ⚠ ATTENTION (<70%)         ✗ CRITICAL (<50%)       │
│  ───────────────         ─────────────────          ────────────────        │
│  Button      98%         Card          67%          DataTable    42%        │
│  Input       96%         Dropdown      64%          Tooltip      38%        │
│  Badge       94%         Tabs          61%                                  │
│  Avatar      92%         Modal         58%                                  │
│                                                                              │
│  📈 Biggest improvement: Modal 58% → 67% (after migration guide published)  │
│  📉 Needs attention: DataTable dropping 3% weekly (deprecated patterns)     │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ EMERGING PATTERNS ──────────────────────────────────────────────────────────┐
│                                                                              │
│  🆕 Skeleton Loading    23 instances across 4 repos    Status: CANDIDATE    │
│     First seen: Jan 2   Authors: @alex, @jordan       → Consider formalizing│
│                                                                              │
│  🆕 Floating Action     12 instances in mobile app    Status: OBSERVING     │
│     First seen: Jan 5   Authors: @casey               → Monitor adoption    │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ ACTIONS ────────────────────────────────────────────────────────────────────┐
│  1. Onboarding gap → Schedule token training for new Checkout contractors   │
│  2. DataTable debt → Create migration path to DataGridV2                    │
│  3. Skeleton pattern → RFC for standardization by Jan 15                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| Token Coverage | % of values using design tokens | >85% |
| Component Adoption | % of UI using system components | >90% |
| Pattern Consistency | % of components matching documented patterns | >80% |
| Drift Velocity | New drift signals per week | Decreasing |

### CLI Command

```bash
buoy dashboard                # Current week
buoy dashboard --week 2024-W02
buoy dashboard --compare 2024-W01
buoy dashboard --email team@acme.com  # Send as digest
```

---

## Report 3: Executive Summary

**Audience:** Engineering leadership, design leadership, product leadership
**Timing:** Monthly, quarterly
**Purpose:** ROI of design system investment, strategic health, risk areas

### Design Principles
- **Business language** - Time saved, money saved, risk reduced
- **Trajectory over details** - Where are we heading?
- **Clear asks** - What decisions are needed?
- **Comparable** - Quarter over quarter, team over team

### Layout

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  DESIGN SYSTEM EXECUTIVE SUMMARY                              Q4 2025        │
│  Design-Development Alignment Report                                         │
╰──────────────────────────────────────────────────────────────────────────────╯

┌─ THE HEADLINE ───────────────────────────────────────────────────────────────┐
│                                                                              │
│     ████████████████████████░░░░░░░  78% ALIGNED                            │
│                                                                              │
│     "78% of shipped code matches design intent. Up from 61% in Q3."         │
│                                                                              │
│     ┌──────────────────┬──────────────────┬──────────────────┐              │
│     │   Q2: 54%        │   Q3: 61%        │   Q4: 78%        │              │
│     │   ░░░░░░░░░░░    │   ████░░░░░░░    │   ████████░░░    │              │
│     └──────────────────┴──────────────────┴──────────────────┘              │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ BUSINESS IMPACT ────────────────────────────────────────────────────────────┐
│                                                                              │
│     DESIGN REVIEW TIME          DEV REWORK REDUCTION       BRAND CONSISTENCY │
│     ↓ 45%                       ↓ 62%                      ↑ 31%            │
│     12 hrs → 6.5 hrs/sprint     8.2 → 3.1 days/month       NPS: 72 → 94     │
│                                                                              │
│     Estimated Q4 savings: $127,000 in reduced rework and review cycles      │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ ADOPTION TRAJECTORY ────────────────────────────────────────────────────────┐
│                                                                              │
│  100% ┤                                                          ┌───────   │
│       │                                                    ┌─────┘           │
│   75% ┤                                             ┌──────┘      ← Current  │
│       │                                      ┌──────┘                        │
│   50% ┤                              ┌───────┘                               │
│       │                       ┌──────┘                                       │
│   25% ┤               ┌───────┘                                              │
│       │        ┌──────┘                                                      │
│    0% ┼────────┴─────────────────────────────────────────────────────────    │
│       Q1      Q2      Q3      Q4      Q1      Q2   (projected)               │
│       2025    2025    2025    2025    2026    2026                           │
│                                                                              │
│  At current velocity: 95% alignment achievable by Q2 2026                    │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ RISK AREAS ─────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ⚠ AI-GENERATED CODE                                                        │
│    47% of new PRs contain AI-assisted code. 23% of those introduce drift.   │
│    Recommendation: Deploy AI Context Layer (MCP server) in Q1 2026.         │
│                                                                              │
│  ⚠ MOBILE APP                                                               │
│    52% alignment (vs 84% web). Different team, different patterns.          │
│    Recommendation: Unified token system in mobile SDK by Q1 2026.           │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ KEY DECISIONS NEEDED ───────────────────────────────────────────────────────┐
│                                                                              │
│  1. Invest $45K in AI Context Layer to catch drift at generation time?      │
│  2. Fund mobile SDK unification project (est. 3 eng-months)?                │
│  3. Mandate Buoy CI checks as PR blockers for all repos?                    │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ TEAMS LEADING ──────────────┬─ TEAMS NEEDING SUPPORT ──────────────────────┐
│  🏆 Auth team: 94% aligned   │  🔧 Checkout: 58% (new contractors)          │
│  🏆 Settings: 91% aligned    │  🔧 Mobile: 52% (SDK gap)                    │
│  🏆 Dashboard: 89% aligned   │  🔧 Marketing: 48% (external agency)         │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

### Key Metrics for Leadership

| Metric | Why It Matters |
|--------|----------------|
| Alignment % | Single number for "design-dev harmony" |
| $ Saved | ROI of design system investment |
| Trend Line | Are we improving or degrading? |
| Risk Areas | Where to invest next |
| Decision Points | Clear asks for leadership action |

### CLI Command

```bash
buoy executive --quarter Q4-2025
buoy executive --pdf                    # Generate PDF for board deck
buoy executive --compare Q3-2025        # Quarter-over-quarter
```

---

## Report 4: Designer Reality Mirror

**Audience:** Product designers
**Timing:** On-demand, design review, post-launch
**Purpose:** Show what actually shipped vs. what was designed

### Design Principles
- **Visual comparison** - Side-by-side, not just metrics
- **Impact language** - How does this affect users?
- **Conversation starter** - Enable dialogue, not blame
- **Learning opportunity** - Understand why changes happened

### Layout

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  REALITY MIRROR                                          Checkout Flow v2.3  │
│  What you designed vs. what shipped                      Last sync: 2hr ago  │
╰──────────────────────────────────────────────────────────────────────────────╯

┌─ FIDELITY SCORE ─────────────────────────────────────────────────────────────┐
│                                                                              │
│     YOUR DESIGN              SHIPPED CODE              MATCH                 │
│     ┌─────────────┐          ┌─────────────┐          ┌───────────┐         │
│     │  ▓▓▓▓▓▓▓▓▓  │    →     │  ▓▓▓▓▓░░░░  │    =     │  84%      │         │
│     │  ▓▓▓▓▓▓▓▓▓  │          │  ▓▓▓▓▓▓▓░░  │          │  ████████░│         │
│     │  ▓▓▓▓▓▓▓▓▓  │          │  ▓▓▓▓▓▓▓▓░  │          └───────────┘         │
│     └─────────────┘          └─────────────┘                                 │
│                                                                              │
│     "84% of your design intent made it to production unchanged."            │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ WHAT CHANGED ───────────────────────────────────────────────────────────────┐
│                                                                              │
│  COLORS                                                                      │
│  ─────────────────────────────────────────────────────────                   │
│  Your CTA blue    →   Shipped as          Why it matters                    │
│  ┌───┐                ┌───┐                                                  │
│  │   │ #0066CC        │   │ #0065CB        1 shade darker. Less vibrant.    │
│  └───┘                └───┘                Hover states now feel flat.       │
│                                                                              │
│  SPACING                                                                     │
│  ─────────────────────────────────────────────────────────                   │
│  Card padding: 24px  →  Shipped: 20px     4px tighter. Feels cramped on     │
│                                           mobile. Breaks 8px rhythm.         │
│                                                                              │
│  TYPOGRAPHY                                                                  │
│  ─────────────────────────────────────────────────────────                   │
│  Price: Semibold 18  →  Shipped: Medium 16  Less prominent. Users may miss  │
│                                             pricing info. A/B test showed    │
│                                             12% lower add-to-cart when       │
│                                             price is understated.            │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ PATTERN DRIFT ──────────────────────────────────────────────────────────────┐
│                                                                              │
│  Component        Your Intent              Shipped                           │
│  ─────────────────────────────────────────────────────────────               │
│  Add to Cart      Primary Button, icon     Secondary Button, no icon        │
│                   left, full width         auto width                        │
│                                                                              │
│                   [🛒 Add to Cart    ]     [ Add to Cart ]                  │
│                                                                              │
│  User Impact: Less visual prominence. May reduce conversions.               │
│  Dev Note: "Button was too wide on desktop" - @jordan, Jan 3                │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ START A CONVERSATION ───────────────────────────────────────────────────────┐
│                                                                              │
│  These changes might be intentional improvements. Want to discuss?           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  💬 "Why was the CTA button changed?"  → Opens thread with @jordan     │ │
│  │  ✓  "Accept this as new baseline"      → Updates your Figma component  │ │
│  │  ↩  "Request revert to original"       → Creates GitHub issue          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key Elements

| Section | Purpose |
|---------|---------|
| Fidelity Score | Single number - how much made it through |
| What Changed | Specific differences with impact explanation |
| Pattern Drift | Component-level comparison |
| Start a Conversation | Actions that enable dialogue, not blame |

### CLI Command

```bash
buoy mirror --figma-file "Checkout v2.3"
buoy mirror --component Button
buoy mirror --since 2024-01-01
```

---

## Implementation Considerations

### Output Formats

Each report supports multiple output formats:

| Format | Use Case |
|--------|----------|
| Terminal (default) | Interactive use, CI logs |
| HTML | Email digests, browser viewing |
| PDF | Board decks, documentation |
| JSON | Tooling integration, dashboards |
| Markdown | GitHub comments, wikis |

### Data Requirements

| Report | Data Sources |
|--------|--------------|
| Developer Brief | Git diff, component registry, token database |
| Team Dashboard | Historical scan data, team attribution, pattern registry |
| Executive Summary | Aggregate metrics, trend calculations, cost modeling |
| Reality Mirror | Figma API, component mapping, implementation scan |

### Refresh Rates

| Report | Typical Refresh |
|--------|-----------------|
| Developer Brief | On-demand (pre-commit, pre-PR) |
| Team Dashboard | Daily aggregation, weekly summary |
| Executive Summary | Monthly roll-up, quarterly formal |
| Reality Mirror | On-demand, post-deploy |

---

## Success Metrics

- **Developer Brief**: Time from "run" to "fix" (target: <30 seconds)
- **Team Dashboard**: Correlation between visibility and drift reduction
- **Executive Summary**: Leadership engagement (are they reading it?)
- **Reality Mirror**: Designer satisfaction, design-dev conversation rate

---

*The goal of all reports: Make the invisible visible, and make the right action obvious.*
