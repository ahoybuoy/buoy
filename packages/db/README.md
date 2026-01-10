# @buoy-design/db

SQLite persistence layer for Buoy using Drizzle ORM.

## Installation

```bash
npm install @buoy-design/db
```

## Usage

```typescript
import { createDatabase } from '@buoy-design/db';

const db = createDatabase('./buoy.db');
await db.saveComponents(components);
await db.saveDriftSignals(drifts);
```

## Links

- [Buoy CLI](https://www.npmjs.com/package/@buoy-design/cli)
- [Documentation](https://buoy.design/docs)
