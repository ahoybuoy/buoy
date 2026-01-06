# The Reality Mirror: Design Truth Revealed

> **Date:** 2026-01-05
> **Status:** Vision Document
> **Parent:** [Master Vision](./2026-01-05-master-vision.md)

---

## Overview

Designers are building in the dark. They create beautiful mockups, hand them off, and have no idea what actually shipped. The Reality Mirror changes everything—it shows designers the truth.

**Core Insight:** You can't fix what you can't see. Designers need visibility into implementation reality.

---

## The Problem

1. Designers work in Figma, create mockups, hand off... and hope
2. No feedback loop exists between shipped code and design source
3. "Did my design ship correctly?" has no automated answer
4. Drift accumulates invisibly until someone notices months later
5. Designers feel disconnected from the impact of their work

---

## The Solution

### The Daily View Dashboard

When a designer opens Buoy each morning:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   Good morning, Sarah.                                                      │
│                                                                             │
│   Your designs reached 47,000 users yesterday.                              │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │   DESIGN HEALTH                                                     │   │
│   │   ████████████████████████████████░░░░░░░░░░  78%                   │   │
│   │   +2% from last week                                               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   3 things to celebrate    │    2 things to investigate                     │
│   ─────────────────────────┼───────────────────────────────────────────     │
│   ✓ Card v2 hit 50% usage  │    ? Checkout flow drifting                    │
│   ✓ Button 100% compliant  │    ? New hardcoded colors in Settings          │
│   ✓ Typography clean       │                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key insight:** Lead with celebration. The first thing designers see should make them feel their work matters.

---

## Core Features

### 1. Component Adoption Stories

Each component gets its own story:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│   BUTTON                                                                    │
│   Designed: Jan 15, 2025 | First shipped: Jan 18, 2025                     │
│                                                                             │
│   ADOPTION JOURNEY                                                          │
│   Jan ▁▂▃▄▅▆▇█████████████  89%                                             │
│   Feb ███████████████████   94%                                             │
│   Mar ████████████████████  98%                                             │
│                                                                             │
│   472 instances across 34 screens                                           │
│                                                                             │
│   FIDELITY BREAKDOWN                                                        │
│   Perfect match      ████████████████████░░░░  423 (89%)                    │
│   Minor variations   ███░░░░░░░░░░░░░░░░░░░░   38 (8%)                     │
│   Major drift        █░░░░░░░░░░░░░░░░░░░░░░   11 (3%)                     │
│                                                                             │
│   VARIANTS USED                                                             │
│   Primary   ████████████████  312                                           │
│   Secondary ████████░░░░░░░░  156                                           │
│   Danger    (unused) ← Consider removing?                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. The Success/Failure Map

Visual map of codebase showing design health:

```
   src/
   ├── pages/
   │   ├── 🟢 home/           94%  ████████████████████░░
   │   ├── 🟢 dashboard/      87%  █████████████████░░░░░
   │   ├── 🟡 settings/       62%  ████████████░░░░░░░░░░
   │   ├── 🔴 checkout/       34%  ██████░░░░░░░░░░░░░░░░  ← HELP!
   │   └── 🟢 profile/        91%  ██████████████████░░░░
```

Click to drill down. See exactly which components drifted and how.

### 3. Side-by-Side Truth

The heart of Reality Mirror: **What you designed** vs **What shipped**

```
┌─────────────────────────────┐       ┌─────────────────────────┐
│   WHAT YOU DESIGNED         │       │   WHAT SHIPPED          │
│   (Figma)                   │       │   (Production)          │
│                             │       │                         │
│   bg: #3B82F6               │       │   bg: #0066CC  ← DIFF   │
│   padding: 16px 24px        │       │   padding: 12px 20px ←  │
│   radius: 8px               │       │   radius: 4px  ← DIFF   │
│   font: Inter 16px          │       │   font: Inter 16px ✓    │
└─────────────────────────────┘       └─────────────────────────┘

DRIFT ANALYSIS
3 differences found:

1. Background color: #3B82F6 → #0066CC
   Visual impact: HIGH (contrast change)
   Likely cause: Legacy CSS override in checkout.css:142
   [View code] [Create fix PR]
```

### 4. Visual Diff Overlay

For visual thinkers—slider between design and code:

```
              ◄━━━━━━━━━━━━━●━━━━━━━━━━━━━►
              Design                Code

Red areas show where code diverges from design.
```

### 5. Rendered Component Gallery

Auto-render components from actual code:

```
COMPONENT GALLERY: What Actually Shipped

┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│ Button  │  │  Card   │  │  Modal  │  │  Input  │
│   ✓     │  │   ⚠️    │  │   ✓     │  │   ❌    │
└─────────┘  └─────────┘  └─────────┘  └─────────┘

✓ Matches design    ⚠️ Minor drift    ❌ Significant drift
```

---

## Emotional Safety

The Reality Mirror could become a weapon. We must prevent this.

### Language Matters

| DON'T Say | DO Say |
|-----------|--------|
| "Violations" | "Opportunities" |
| "Errors" | "Variations" |
| "Failed" | "Drifted" |
| "Who broke this?" | "When did this change?" |
| "Non-compliant" | "Custom implementation" |

### Attribution Without Blame

Instead of showing WHO made changes:

```
CHANGE HISTORY

This component evolved over time:

Jan 15 │ Design created in Figma
Jan 18 │ First implementation shipped
Feb 2  │ Padding adjusted (likely for mobile fit)
Feb 14 │ Color changed (possibly accessibility fix?)

→ These changes might have good reasons! Click to investigate.
```

### The "Maybe There's a Good Reason" Principle

For every drift, suggest possible legitimate causes:

```
DRIFT DETECTED: Button padding changed

Designed: 16px 24px
Shipped:  12px 20px

POSSIBLE REASONS:
• Mobile optimization (smaller buttons fit better)
• A/B test variant
• Accessibility requirement (larger tap targets?)
• Technical constraint (container size limit?)
• Design wasn't updated to reflect agreed change

→ Start a conversation about this: [Open thread]
```

---

## Making It Addictive (In a Good Way)

### The Emotions That Drive Habit

1. **Pride**: "Look how much of my work is being used correctly"
2. **Curiosity**: "What changed overnight?"
3. **Agency**: "I can actually DO something about this"
4. **Progress**: "We're getting better over time"
5. **Connection**: "I understand what the developers are dealing with"

### Daily Hooks

**Morning Summary Email (optional):**
```
Good morning, Sarah.

Your designs reached 52,000 users yesterday.

🎉 Card v2 adoption jumped from 12% to 18% (+50%!)
⚠️ Someone added a hardcoded color in Settings

[See the full picture →]
```

**The Streak:**
```
Design Health Streak: 14 days 🔥

Your team has maintained 80%+ health for two weeks straight.
```

**Weekly Wins:**
```
THIS WEEK'S WINS

✨ Button reached 100% compliance
✨ 3 drift issues fixed
✨ Modal v2 adopted in 5 new places

Share with your team? [Yes] [No]
```

---

## Technical Architecture

### Data Model Extensions

```typescript
interface DesignSource {
  type: 'figma' | 'sketch' | 'xd' | 'manual';
  fileId: string;
  nodeId: string;
  lastSynced: Date;
  thumbnail: string;
}

interface VisualSnapshot {
  componentId: string;
  variant: string;
  viewport: Viewport;
  screenshot: string;
  html: string;
  computedStyles: Record<string, string>;
  capturedAt: Date;
}

interface DriftComparison {
  designSource: DesignSource;
  codeSnapshot: VisualSnapshot;
  differences: VisualDiff[];
  similarity: number; // 0-100%
  computedAt: Date;
}

interface AdoptionMetrics {
  componentId: string;
  period: 'day' | 'week' | 'month';
  totalInstances: number;
  compliantInstances: number;
  adoptionRate: number;
  trend: 'rising' | 'stable' | 'falling';
  byLocation: Record<string, number>;
}
```

### CLI Commands

```bash
# Sync Figma designs
buoy figma sync --file <file-id>

# Generate visual snapshots
buoy render --component Button --all-variants

# Compare design to code
buoy mirror --component Button

# Show adoption metrics
buoy adoption --component Button --period month

# Generate dashboard
buoy dashboard --output html
buoy dashboard --serve --port 3000
```

---

## Implementation Phases

### Phase 1: Foundation (4-6 weeks)
- Figma OAuth integration
- Component node extraction
- Token extraction from Figma variables
- Thumbnail generation

### Phase 2: Visual Rendering (3-4 weeks)
- Puppeteer/Playwright setup
- Component isolation rendering
- Screenshot capture and storage
- Computed style extraction

### Phase 3: Comparison Engine (3-4 weeks)
- Visual diff algorithms (pixelmatch)
- Property-level comparison
- Similarity scoring
- Diff categorization

### Phase 4: Dashboard (4-6 weeks)
- Web dashboard (React/Next.js)
- Real-time data updates
- Interactive visualizations
- Adoption metrics

### Phase 5: Engagement (2-3 weeks)
- Daily digest emails
- Slack integration
- Streak tracking
- Weekly wins

---

## Success Metrics

- **Designer Daily Active Users**: Do designers check Buoy daily?
- **Time to Discovery**: How fast is drift discovered after shipping?
- **Resolution Rate**: What % of discovered drift gets fixed?
- **Adoption Visibility**: Do designers know their component adoption rates?
- **Emotional Response**: Survey—"I feel connected to what shipped"

---

## The Vision Realized

**Before Reality Mirror:**
- Designer creates, hands off, hopes
- Months later: "Why does the app look different from my mockups?"
- No data, no visibility, no agency

**After Reality Mirror:**
- Designer checks dashboard each morning
- Sees exactly what shipped, where, with what fidelity
- Catches drift in hours, not months
- Feels proud of measured impact

> "Buoy is for designers what source control is for developers."
>
> Developers can't imagine working without git—the ability to see history, compare versions, understand what changed.
>
> Designers have never had this. Until now.
