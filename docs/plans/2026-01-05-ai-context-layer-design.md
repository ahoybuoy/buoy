# The AI Context Layer: Making Buoy Essential to AI Coding

> **Date:** 2026-01-05
> **Status:** Vision Document
> **Parent:** [Master Vision](./2026-01-05-master-vision.md)

---

## Executive Vision

Today's AI coding tools are flying blind. They generate beautiful code that completely ignores your design system. Buoy catches this drift *after* the fact.

**What if we could prevent it entirely?**

The AI Context Layer transforms Buoy from a drift detector into a drift **preventer**—an MCP server that gives Claude, Copilot, and every AI coding tool complete awareness of your design system *during* code generation.

---

## The Problem

AI coding tools are generating code at 10x speed—and 10x drift:
- **4x more code cloning** with AI assistance
- **+322% privilege-escalation paths** in AI-generated code
- **60% of teams** have no process for reviewing AI code quality

The fundamental issue: **AI doesn't know your design system exists.** It generates what looks good, not what fits your system.

---

## The Solution: MCP Server

Buoy becomes an MCP (Model Context Protocol) server that AI tools can query for design system awareness.

### What AI Receives

#### 1. Token Values with Intent

Not just values—meaning:

```json
{
  "token": "color-primary",
  "value": "#2563EB",
  "intent": {
    "hierarchy": "primary-action",
    "emotion": ["trust", "confidence"],
    "constraint": "one-per-screen"
  },
  "usage": "Primary CTAs, submit buttons",
  "avoid": "Decorative elements, backgrounds"
}
```

#### 2. Component Inventory with Guidance

What exists and when to use it:

```json
{
  "component": "Button",
  "import": "@acme/ui/Button",
  "variants": {
    "primary": {
      "usage": "Main CTA, one per section",
      "limit": "Avoid multiple in same view"
    },
    "secondary": {
      "usage": "Supporting actions",
      "pairing": "Often with primary button"
    },
    "ghost": {
      "usage": "Tertiary actions, toolbars",
      "context": "Works well in dense UIs"
    }
  },
  "props": {
    "size": {
      "sm": "Dense UIs, tables",
      "md": "Standard forms",
      "lg": "Hero sections"
    }
  }
}
```

#### 3. Anti-Patterns

What NOT to do:

```json
{
  "antiPattern": "div-button",
  "detect": "<div onClick=",
  "problem": "Not keyboard accessible, no button semantics",
  "fix": "Use <Button> or <button>",
  "severity": "high"
}
```

#### 4. Design Philosophy

The WHY behind the system:

```json
{
  "principles": [
    {
      "name": "Clarity over cleverness",
      "meaning": "Prefer explicit patterns over abstractions",
      "example": "Use <Stack gap=\"4\"> not custom margins"
    },
    {
      "name": "Accessibility first",
      "meaning": "Every component works with keyboard and screen readers",
      "implication": "Never use div for interactive elements"
    }
  ]
}
```

---

## MCP Server Architecture

### Resources (Static Context)

```typescript
// Component catalog
server.resource(
  'components://inventory',
  'Complete component inventory',
  async () => designSystem.getComponentInventory()
);

// Individual component
server.resourceTemplate(
  'components://{name}',
  'Component documentation',
  async ({ name }) => designSystem.getComponent(name)
);

// All tokens
server.resource(
  'tokens://all',
  'Design tokens with semantic meaning',
  async () => designSystem.getTokens()
);

// Anti-patterns
server.resource(
  'antipatterns://all',
  'Known anti-patterns to avoid',
  async () => designSystem.getAntiPatterns()
);
```

### Tools (Active Queries)

```typescript
// Find best component for use case
server.tool(
  'find_component',
  'Find the best component for a use case',
  { useCase: 'string', context: 'string' },
  async ({ useCase, context }) => findBestComponent(useCase, context)
);

// Validate code
server.tool(
  'validate_code',
  'Check if code follows design system',
  { code: 'string', language: 'string' },
  async ({ code, language }) => validateCode(code, language)
);

// Resolve hardcoded value
server.tool(
  'resolve_token',
  'Find token for hardcoded value',
  { value: 'string', type: 'string' },
  async ({ value, type }) => resolveToToken(value, type)
);
```

### Prompts (Reusable Context)

```typescript
// Component generation prompt
server.prompt(
  'generate_component',
  'System prompt for design-system-compliant components',
  async () => ({
    messages: [{
      role: 'system',
      content: buildComponentGenerationPrompt()
    }]
  })
);
```

---

## The Dream Interaction

### Scenario: Building a Settings Page

```
Developer: I need to build a settings page with sections for
           profile, notifications, and security. Each section
           should be collapsible.

AI (with Buoy context):

Let me build this using your design system patterns:
- PageLayout with Sidebar (your standard dashboard pattern)
- Accordion for collapsible sections
- FormSection within each accordion item
- Your standard form components

**Design System Decisions:**

1. **Accordion vs Cards** - I considered collapsible Cards, but
   Accordion has built-in keyboard navigation (arrow keys).

2. **Button placement** - Save at section level, not page level,
   per your "immediate feedback" principle.

**Token Usage:**
- Background: surface-secondary (standard for settings)
- Section spacing: space-8 between sections
- Dividers: border-subtle

Want me to explain any choices or adjust the approach?
```

### Scenario: AI Catches Itself

```
Developer: Add a delete account button that's red and scary looking

AI (with Buoy context):

For destructive actions, your design system uses:
- Button variant="danger" (not custom red styling)
- Confirmation pattern with Modal
- Specific copy: "Delete" not "Remove"

Instead of "red and scary," your system achieves warning through:
- The danger variant (your error-red token)
- Trash or Warning icon prefix
- Typed confirmation for irreversible actions

<Button variant="danger" leftIcon={<Trash />}>
  Delete Account
</Button>

This matches "Delete Project" flow for consistency.
```

### Scenario: Learning from Corrections

```
Developer: No, use our DangerZone pattern instead

AI: Let me find that pattern in your codebase...

Found DangerZone in @acme/ui. Used in:
- AccountSettings (delete account)
- ProjectSettings (delete project)

Pattern observed:
- Red left border (border-l-4 border-error)
- Warning icon + bold title
- Explanatory text with consequences
- Single destructive button

<DangerZone
  title="Delete Account"
  description="This will permanently delete your account..."
>
  <Button variant="danger">Delete Account</Button>
</DangerZone>

Should I update my knowledge to suggest DangerZone for
future destructive actions?
```

---

## Real-Time Feedback

### Streaming Validation

As AI generates code, Buoy validates in real-time:

```typescript
class StreamingValidator {
  onToken(token: string): Feedback | null {
    buffer += token;

    for (const pattern of antiPatterns) {
      if (pattern.partialMatch(buffer)) {
        return {
          type: 'warning',
          message: `This looks like: ${pattern.name}`,
          suggestion: pattern.alternative
        };
      }
    }
  }
}
```

### Inline Suggestions

When AI writes `style={{ color: '#2563eb' }}`:

```json
{
  "type": "suggestion",
  "original": "style={{ color: '#2563eb' }}",
  "suggested": "className='text-primary'",
  "reason": "Using text-primary ensures theme updates apply"
}
```

---

## Handling Ambiguity

### Multi-Option Response

When asked "I need a way to select from many options":

```json
{
  "confidence": 0.6,
  "options": [
    {
      "component": "Select",
      "bestFor": "5-15 options, standard forms",
      "confidence": 0.35
    },
    {
      "component": "Combobox",
      "bestFor": "10+ options, searchable",
      "confidence": 0.35
    },
    {
      "component": "RadioGroup",
      "bestFor": "2-5 options, all visible",
      "confidence": 0.3
    }
  ],
  "clarifyingQuestions": [
    "How many options typically?",
    "Need search/filter?",
    "Should all be visible at once?"
  ]
}
```

---

## Design System Personality

The AI can adopt your system's voice:

### Healthcare System
```
"I want to approach this carefully. Our design philosophy
prioritizes calm in stressful moments. Strong alarming visuals
can increase patient anxiety..."
```

### Gaming Platform
```
"HELL YEAH let's make some noise! 🔥 Here's what we've got:
- Shake animation (wrong answer game show vibe)
- Red pulse glow (dramatic but not obnoxious)
- Sound effects (glitch, bonk, sad trombone)"
```

### Financial Institution
```
"This requires careful consideration. Our design standards
prioritize trust and stability. Before modifying, I need:
1. What type of error?
2. Is there regulatory language required?"
```

---

## CLI Integration

```bash
# Start MCP server
buoy mcp serve

# With config
buoy mcp serve --config ./buoy.config.mjs

# Export context snapshot
buoy mcp export --output ./design-system-context.json

# Test tools interactively
buoy mcp test find_component --useCase "user avatar with status"
```

---

## Claude Code Integration

```json
// .claude/settings.json
{
  "mcpServers": {
    "buoy": {
      "command": "npx",
      "args": ["@buoy-design/mcp", "serve"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

---

## Package Structure

```
packages/mcp/
├── src/
│   ├── server.ts              # MCP server entry
│   ├── resources/
│   │   ├── components.ts      # Component inventory
│   │   ├── tokens.ts          # Token catalog
│   │   ├── patterns.ts        # Pattern library
│   │   └── philosophy.ts      # Design principles
│   ├── tools/
│   │   ├── find-component.ts  # Component recommendation
│   │   ├── validate-code.ts   # Code validation
│   │   ├── resolve-token.ts   # Token resolution
│   │   └── realtime.ts        # Streaming validation
│   ├── prompts/
│   │   ├── generation.ts      # Component generation
│   │   └── review.ts          # Code review
│   └── context/
│       ├── loader.ts          # Load design system
│       └── personality.ts     # Voice engine
```

---

## The Business Case

### Why This Makes Buoy Essential

1. **Prevention > Detection** - Catching drift after costs 10x more to fix
2. **Network Effects** - Every AI tool becomes a distribution channel
3. **Stickiness** - More context = more value, increasing switching cost
4. **Expansion Revenue** - Free basic, Pro for real-time, Enterprise for multi-system

### Competitive Moat

- **First-mover in AI context** - No one else building this bridge
- **Accumulated wisdom** - Every correction teaches Buoy more
- **Developer trust** - Buoy becomes "source of truth" for design decisions

---

## Implementation Phases

### Phase 1: Foundation (4-6 weeks)
- MCP server with basic resources
- `find_component` and `validate_code` tools
- Claude Code integration

### Phase 2: Intelligence (6-8 weeks)
- Real-time streaming validation
- Pattern learning from codebase
- Confidence scoring for ambiguity

### Phase 3: Personality (4-6 weeks)
- Design system voice inference
- Explainable decisions
- Teaching mode for developers

### Phase 4: Ecosystem (ongoing)
- Copilot integration
- Cursor integration
- VS Code extension

---

## Success Metrics

- **AI Query Volume**: How often AI tools query Buoy context
- **Drift Prevention Rate**: % of potential drift prevented at generation
- **Code Acceptance**: % of Buoy-aware AI code accepted without modification
- **Developer Satisfaction**: Survey—"AI understands my design system"

---

*This isn't just a feature. It's a new category: AI-Native Design System Enforcement. The team that builds this first will own the future of AI-assisted design system development.*
