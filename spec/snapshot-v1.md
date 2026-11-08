# buoy-snapshot/v1

The document every Buoy visualizer reads: what a scan knows about a codebase's UI, as plain JSON.

```bash
npx @buoy-design/cli show snapshot -o snapshot.json
```

Within v1, fields are only added. Removing a field or changing what one means is `buoy-snapshot/v2`. Check `schema` before reading.

## Top level

| field | type | |
|---|---|---|
| `schema` | `"buoy-snapshot/v1"` | |
| `generatedAt` | ISO date | |
| `cliVersion` | string | the CLI that wrote it |
| `stats` | object | `tokens, components, pages, primitives, icons, composites, renders, uses, drift, tokensUnused, componentsUnused` |
| `tokens` | `SnapshotToken[]` | |
| `components` | `SnapshotComponent[]` | |
| `edges` | `SnapshotEdge[]` | |
| `drift` | `SnapshotDrift[]` | |

## tokens

| field | |
|---|---|
| `id` | `t:<name>`, normalized: `--primary` and `primary.DEFAULT` → `t:primary`, `neutral.150` → `t:neutral-150` |
| `name` | as written in the source |
| `category` | `color`, `spacing`, `typography`, `border`, `other`, … |
| `value` | display value: `#ededed`, `16px`, or raw HSL channels like `222.2 47.4% 11.2%` |
| `path` | file that defines it |
| `usedBy` | how many components' files reference it (Tailwind class or `var()`) |

## components

| field | |
|---|---|
| `id` | `c:<path>:<name>` |
| `name`, `path`, `line` | where it is defined |
| `kind` | `page` (route/page/layout files), `icon`, `primitive` (in a `ui/`, `primitives/` or design-system folder, or rendered by 5+ components), `composite` |
| `props`, `variants` | names, when the scanner can read them |
| `renders`, `renderedBy` | number of distinct components it renders / that render it |
| `drift` | findings located in it |

## edges

| field | |
|---|---|
| `type` | `renders`: `source` component renders `target` component. `uses`: `source` token is referenced in `target` component's file |
| `source`, `target` | ids |
| `weight` | for `uses`: references in that file |

A file that defines several components gives its token references to each of them.

## drift

| field | |
|---|---|
| `id`, `type`, `severity`, `message` | the finding, as `buoy drift check` reports it |
| `path`, `line` | where |
| `component` | id of the component whose definition owns the line, if any |
| `values` | hardcoded values named by the finding: `{ property?, value, line? }`, e.g. `{ "property": "backgroundColor", "value": "#f9f9f9", "line": 665 }` |
| `suggestions` | fix suggestions |
