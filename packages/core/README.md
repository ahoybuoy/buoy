# @buoy-design/core

Core domain models and drift detection engine for Buoy.

## Installation

```bash
npm install @buoy-design/core
```

## Usage

```typescript
import { SemanticDiffEngine } from '@buoy-design/core/analysis';
import type { Component, DriftSignal } from '@buoy-design/core';

const engine = new SemanticDiffEngine();
const result = engine.analyzeComponents(components, {
  checkDeprecated: true,
  checkNaming: true,
});

console.log(result.drifts); // DriftSignal[]
```

## Models

- **Component** - UI components from any framework
- **DesignToken** - Color, spacing, typography values
- **DriftSignal** - Detected inconsistencies

## Links

- [Buoy CLI](https://www.npmjs.com/package/@buoy-design/cli)
- [Documentation](https://buoy.design/docs)
