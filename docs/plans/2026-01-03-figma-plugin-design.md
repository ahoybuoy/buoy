# Buoy Figma Plugin v1 Design

## Overview

A Figma plugin that displays a read-only report of design system drift issues detected by Buoy. Designers can see overall health, browse issues, and get actionable fix suggestions without leaving Figma.

## Goals

- Show designers the current state of design system compliance
- Make drift issues understandable to non-developers
- Provide actionable fix suggestions they can share with devs

## Non-Goals (v1)

- Per-component sync checking
- Filtering or search
- Write-back or fix automation
- Figma-to-code comparison

## Data Flow

```
┌─────────────┐      GET /api/report      ┌─────────────┐
│   Figma     │ ──────────────────────►   │   Buoy API  │
│   Plugin    │ ◄──────────────────────   │   Server    │
└─────────────┘      JSON response        └─────────────┘
```

Plugin fetches on open + manual refresh button.

## API Contract

**Endpoint:** `GET /api/report`

**Response:**
```typescript
interface ReportResponse {
  generatedAt: string;
  summary: {
    healthScore: number;        // 0-100
    totalIssues: number;
    bySeverity: {
      critical: number;
      warning: number;
      info: number;
    };
  };
  issues: DriftSignal[];        // From @buoy/core
}
```

## UI Design

### Plugin Size
- Width: 300px
- Height: 500px (resizable)

### Layout (top to bottom)

**Header (40px)**
- Buoy logo/name
- Refresh button

**Summary Section**
- Health score (large, centered, color-coded)
- Severity pills: 🔴 X Critical  ⚠️ Y Warning  ℹ️ Z Info
- "Last scanned: X ago" timestamp

**Issue List (scrollable)**
- Compact rows by default
- Click to expand inline

### Compact Issue Row
```
⚠️ Hardcoded #3B82F6 → blue-500
   src/Button.tsx:42
```

### Expanded Issue View
```
┌────────────────────────────────┐
│ Type: Hardcoded Value          │
│                                │
│ Found:    #3B82F6              │
│ Expected: var(--color-blue-500)│
│                                │
│ 📍 src/components/Button.tsx   │
│    Line 42, Column 12          │
│                                │
│ 💡 Suggested fix:              │
│ Replace #3B82F6 with           │
│ var(--color-blue-500)          │
│                                │
│ 👤 Last modified by:           │
│ alex@company.com (2 days ago)  │
│ PR #482: "Add hover states"    │
│                                │
│ ┌──────────┐                   │
│ │ 📋 Copy  │                   │
│ └──────────┘                   │
└────────────────────────────────┘
```

### Colors
- Critical: #DC2626 (red)
- Warning: #F59E0B (amber)
- Info: #3B82F6 (blue)
- Health score: gradient based on percentage

## File Structure

```
apps/figma-plugin/
├── manifest.json        # Figma plugin config
├── package.json
├── tsconfig.json
├── src/
│   ├── main.ts          # Plugin entry (Figma sandbox)
│   ├── ui.html          # UI entry point
│   ├── ui.tsx           # Preact UI root
│   ├── api.ts           # Fetch from Buoy API
│   ├── types.ts         # Re-export from @buoy/core
│   └── components/
│       ├── Header.tsx
│       ├── Summary.tsx
│       ├── IssueList.tsx
│       └── IssueRow.tsx
└── build.mjs            # esbuild script
```

## Tech Stack

- **UI Framework:** Preact (3kb, fast)
- **Bundler:** esbuild (fast, single-file output)
- **Types:** Import from @buoy/core

## Build Output

Figma requires:
- `code.js` — Runs in Figma's sandbox
- `ui.html` — Webview with embedded JS/CSS

esbuild bundles everything into these two files.

## Implementation Plan

1. Scaffold plugin package
2. Create manifest.json and basic entry points
3. Build API client with mock data
4. Build Summary component
5. Build IssueList with compact rows
6. Add expand/collapse for IssueRow
7. Add Copy button functionality
8. Connect to real API endpoint
9. Add refresh button
10. Test in Figma

## Future Enhancements (v2+)

- Filter by severity
- Filter by drift type
- Per-component checking (select in Figma, see issues for that component)
- Link to Figma component when issue relates to a specific one
- Slack integration to share issues
