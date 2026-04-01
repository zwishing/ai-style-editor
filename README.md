# ai-style-editor

A `pnpm workspace` project for editing MapLibre styles with AI tools.

## Packages

- Web app (root): `ai-style-editor`
- Tool package: `@ai-style-editor/maplibre-style-tools`

## Structure

```txt
.
├─ package.json
├─ pnpm-workspace.yaml
├─ src/
└─ packages/
   └─ maplibre-style-tools/
      ├─ package.json
      └─ src/index.ts
```

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
```

## Tool usage

```ts
import { createMapLibreStyleTools } from '@ai-style-editor/maplibre-style-tools';

const tools = createMapLibreStyleTools({ getMap });
```
