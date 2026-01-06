# The Unified Mental Model: A Shared Language for Design and Development

> **Date:** 2026-01-05
> **Status:** Vision Document
> **Parent:** [Master Vision](./2026-01-05-master-vision.md)

---

## The Core Insight

Designers and developers are not describing different things—they're describing the **same reality through different lenses**. A button isn't two things (a Figma rectangle and a React component). It's one thing perceived through two cognitive frameworks that evolved separately.

The tragedy of modern tooling is that we've built elaborate bridges between these worlds (design tokens, Figma-to-code plugins, component libraries) without realizing we should be questioning the chasm itself.

---

## Part 1: The Vocabulary Translation

### Mapping the Rosetta Stone

| Design Concept | Developer Concept | **Unified Concept** |
|----------------|-------------------|---------------------|
| Visual hierarchy | Component nesting/z-index | **Attention Flow** |
| Rhythm | Spacing scale | **Cadence** |
| Emphasis | Variant priority | **Weight** |
| White space | Padding/margin | **Breath** |
| Color palette | Theme tokens | **Mood** |
| Typography scale | Font size tokens | **Voice** |
| Grid | Layout components | **Structure** |
| States (hover, active) | Event handlers | **Response** |
| Brand consistency | Design system adherence | **Identity** |
| User journey | Router/navigation | **Path** |
| Affordance | Interactive props | **Invitation** |
| Balance | Flex/alignment | **Equilibrium** |

The unified concepts are **neither design nor code vocabulary**—they're a third language that both can adopt.

---

## Part 2: The Unified Component Model

What if a component definition looked like this?

```yaml
# button.unified.yaml

identity: Button
intent: "Enable user to take a decisive action"

anatomy:
  container:
    role: boundary
    breath: [spacing.md, spacing.lg]  # Designers see "breathing room", devs see padding

  label:
    role: voice
    weight: emphasis.primary  # Designers see "emphasis", devs see font-weight

  icon:
    role: invitation  # Affordance signal
    position: leading | trailing

attention-flow:
  default:
    weight: 3  # On a 1-5 scale of visual prominence
  primary:
    weight: 5
  ghost:
    weight: 1

response:
  hover:
    mood: mood.interactive
    transition: cadence.quick  # 150ms
  press:
    transform: scale(0.98)
  focus:
    outline: identity.focus-ring

constraints:
  - "Primary buttons: maximum 1 per view"
  - "Never stack more than 2 buttons horizontally"
  - "Icon-only requires aria-label"
```

This single file generates:
- **For designers**: A Figma component with variants and documentation
- **For developers**: TypeScript types and React component skeleton
- **For both**: Shared understanding of *why* the component exists

---

## Part 3: Dual-Perspective Visualization

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         UNIFIED COMPONENT VIEW                          │
├─────────────────────────────────┬───────────────────────────────────────┤
│      DESIGNER PERSPECTIVE       │       DEVELOPER PERSPECTIVE           │
├─────────────────────────────────┼───────────────────────────────────────┤
│                                 │                                       │
│  ┌─────────────────────────┐    │  interface ButtonProps {              │
│  │                         │    │    variant: 'primary' | 'secondary'   │
│  │   ▣ Button              │    │    size: 'sm' | 'md' | 'lg'           │
│  │     └─ Icon (optional)  │    │    icon?: IconName                    │
│  │     └─ Label            │    │    children: ReactNode                │
│  │                         │    │  }                                    │
│  └─────────────────────────┘    │                                       │
│                                 │                                       │
│  ATTENTION: ●●●●○ (weight: 4)   │  z-index: 10                          │
│  BREATH: 16px / 24px            │  padding: 1rem 1.5rem                 │
│  MOOD: Brand Blue → Hover Blue  │  bg: var(--color-primary)             │
│  CADENCE: Quick (150ms)         │  transition: 150ms ease-out           │
│                                 │                                       │
├─────────────────────────────────┴───────────────────────────────────────┤
│                          SHARED TRUTH                                   │
│  Intent: "Enable user to take decisive action"                          │
│  Constraints: Max 1 primary per view | No horizontal stacks > 2         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 4: Teaching Cross-Disciplinary Thinking

### For Designers → Component Thinking

**"Composition Rules"**
- "This Card component contains Header, Body, and Footer. The Header always comes first."
- Designers already think this way about layout—we just formalize it.

**"State Awareness"**
- "What does this button look like when loading? When disabled? When the action succeeded?"
- Designers often design happy paths. States force systematic thinking.

**"Prop-Based Variants"**
- Instead of: "Primary Button", "Secondary Button", "Ghost Button"
- Think: "Button with variant=primary|secondary|ghost"
- Same component, different configurations. Not three separate things.

### For Developers → Systems Thinking

**"Visual Weight Budget"**
- "Your page has a total attention budget. Primary actions consume more. You've overspent."
- Developers understand resource budgets. Visual weight is the same concept.

**"Rhythm Debugging"**
- "These three cards have spacing: 16px, 24px, 16px. The middle one breaks rhythm."
- Developers hunt for inconsistency in code. This is visual inconsistency.

**"Emotional API"**
- "Your error state uses `color-danger` but `shadow-soft`. Danger + soft = mixed signal."
- Components have an emotional API. Props should be emotionally coherent.

---

## Part 5: The Shared Language That Doesn't Exist Yet

### Intent-First Naming

Instead of:
- Designer: "H1 Heading"
- Developer: `<h1>` or `Typography variant="h1"`

Use:
- **"PageTitle"** — The intent is clear. Implementation is secondary.

Instead of:
- Designer: "16px spacing"
- Developer: `gap-4` or `spacing.md`

Use:
- **"Breath.comfortable"** — Describes the feeling, not the measurement.

### The Anatomy Protocol

Every component has:

1. **Identity** — What is this thing? (Button, Card, Modal)
2. **Intent** — Why does it exist? ("Enable decisive action")
3. **Anatomy** — What parts does it have? (container, label, icon)
4. **Response** — How does it react? (hover, focus, press, loading)
5. **Paths** — Where does it appear? (checkout, onboarding, settings)
6. **Constraints** — What rules govern it? (max 1 primary per view)

This protocol works for both Figma components and React components because it describes **the concept**, not the implementation.

---

## Part 6: How Buoy Shows Both Perspectives

### Unified Drift Signals

```typescript
// Current drift signal
{
  type: 'hardcoded-value',
  message: 'Found hardcoded color #3B82F6',
  location: { file: 'Button.tsx', line: 42 }
}

// Unified drift signal
{
  type: 'mood-drift',
  designerMessage: 'This button uses a custom blue instead of your brand blue. It will feel inconsistent to users.',
  developerMessage: 'Hardcoded color #3B82F6 should use theme token `color.primary`',
  unifiedMessage: 'The Button mood deviates from identity.primary',
  severity: 'warning',

  // Both perspectives see what matters to them
  visualImpact: 'Users will perceive this as a different action type',
  codeImpact: 'Theme changes won\'t affect this button'
}
```

### The Buoy Translator

```bash
buoy explain Button --for designer
```
```
# Button

## Intent
Enable users to take decisive actions.

## Visual Hierarchy
- Primary variant demands attention (weight 5/5)
- Secondary is supportive (weight 3/5)
- Ghost recedes into background (weight 1/5)

## Rhythm
- Comfortable internal breathing (16px horizontal, 12px vertical)
- Sits on the 8px grid

## Constraints
- Only one Primary button per view
- Never more than 2 buttons side-by-side
```

```bash
buoy explain Button --for developer
```
```
# Button Component

## Props Interface
- `variant`: 'primary' | 'secondary' | 'ghost'
- `size`: 'sm' | 'md' | 'lg'
- `icon?`: IconName
- `loading?`: boolean

## Styling Tokens
- Background: `--color-primary` (primary), `--color-secondary` (secondary)
- Padding: `spacing.md` horizontal, `spacing.sm` vertical
- Transition: `150ms ease-out`

## Accessibility
- Requires visible focus ring
- Icon-only variant needs `aria-label`
```

Same source. Different outputs. Unified understanding.

---

## The Ultimate Vision

**One Year From Now:**

A designer opens Figma and sees their Button component. They notice a badge: "3 code instances diverging from this design." They click it and see exactly which properties have drifted, in language they understand: "The rhythm feels tighter than intended. The mood on hover is different."

A developer opens VS Code and sees the same Button component. They notice the same badge: "Design drift detected." They click it and see: "`padding: 12px` should be `spacing.md (16px)`. `hover:bg-blue-600` should be `theme.primary.hover`."

Both are looking at **the same truth** through their native lens.

**Two Years From Now:**

New hires don't learn "design" and "development" as separate disciplines. They learn "product craft" through the unified vocabulary. They speak of "breath" and "mood" and "attention flow" as naturally as they speak of "components" and "tokens."

The war between design and development ends—not because one side won, but because we realized we were always on the same side, just speaking different dialects of the same language.

---

## Success Metrics

- **Vocabulary Adoption**: Are teams using unified concepts in conversations?
- **Cross-Discipline Understanding**: Can designers read component specs? Can developers explain visual hierarchy?
- **Communication Efficiency**: Time spent on design-dev miscommunication
- **Onboarding Speed**: How fast do new team members become effective?
- **Drift Reduction**: Does shared vocabulary reduce implementation drift?

---

*The unified mental model isn't just a feature—it's a philosophy. It's the belief that clarity emerges when we stop treating design and development as foreign countries and start treating them as neighboring dialects of the same native tongue.*
