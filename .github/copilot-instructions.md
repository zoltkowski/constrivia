# Copilot instructions for Constrivia

This repo is a small TypeScript PWA (canvas-based geometry editor) with a tiny Cloudflare worker API. Below are concise, actionable notes that help an AI coding agent be productive immediately.

Repository layout (key files)
- `src/main.ts`: runtime glue and higher-level application logic; currently being incrementally refactored — many top-level variables are mirrored into new state modules.
- `src/engine.ts`: pure geometric helpers (distance, intersections, projections). Prefer adding algorithmic helpers here for reuse.
- `src/model.ts`, `src/types.ts`: authoritative model shape and TypeScript types used across app and tests.
- `src/files.ts`: cloud/IO UI helpers (cloud save/load). Look here for client ↔ server wire format.
- `src/canvas/renderer.ts` and `src/canvas/events.ts`: centralized canvas drawing helpers and event handling; most canvas-drawing code was moved into `renderer.ts`.
- `src/debugPanel.ts`: debug panel DOM and events (moved out of `main.ts`).
- `src/ui/uiRefs.ts`, `src/ui/initUi.ts`: centralized UI DOM refs and `initUi()` initializer — use these when adding UI wiring.
- `src/state/*`: new incremental state modules (e.g. `selectionState.ts`, `interactionState.ts`, `viewState.ts`) used to migrate grouped top-level `let` variables safely.
- `functions/api/json/[key].ts`: minimal Cloudflare worker endpoints that PUT/GET/DELETE binary values into Cloudflare KV.
- `public/content/index.json`: generated manifest of content files (created by `scripts/generate-content-index.mjs`).

Big picture and design intent
- Client-first single-page PWA: most construction logic still lives in the client (`src/main.ts`) but pure numeric geometry belongs in `src/engine.ts` for testability.
- Recent refactor approach: extract pure canvas rendering to `src/canvas/renderer.ts`, move DOM/event logic (debug panel) to `src/debugPanel.ts`, centralize DOM refs in `src/ui/*`, and group related top-level variables into `src/state/*`. Changes are done incrementally with small patches and frequent test runs to avoid breakage.

Developer workflows (commands)
- Install and dev: standard Node + npm. Use `npm run dev` to start Vite (the `predev` script regenerates `public/content/index.json`).
```bash
npm install
npm run dev
```
- Build/preview: `npm run build` and `npm run preview` (both run the content-index generator first).
- Tests: `npm test` runs `vitest`. In refactors, also run `npx tsc --noEmit` frequently to catch typing issues.
```bash
npx tsc --noEmit
npx vitest run
```
- Cloudflare: `wrangler` is a devDependency. Use `wrangler publish` / `wrangler dev` configured by `wrangler.toml` to deploy or run the worker. The runtime expects the KV binding and environment variables described above.

Project-specific conventions and patterns
- Keep pure numeric geometry and deterministic algorithms in `src/engine.ts` (easy to unit-test). Side-effecting model updates and UI glue belong in `src/main.ts` and the canvas renderer.
- When adding a new geometry helper, export it from `src/engine.ts` and prefer small, pure functions that accept arrays/objects rather than reaching into the global model.
- ID handling: use `nextId()` and existing counters in the model (see `createEmptyModel()` and `nextId` in `src/main.ts`) to avoid desyncs between `indexById` and arrays.
- Segment keys: use `segmentKeyForPoints(a,b)` shape `<id>-<id>` sorted lexicographically.

Refactor guidance
- Incremental migration pattern used in recent changes:
  - Create a `src/state/<group>State.ts` module and export a central object (e.g. `selectionState`, `interactionState`, `viewState`).
  - Mirror existing legacy `let` variables in `src/main.ts` to reference the same mutable objects (or keep shallow mirrors) so the runtime remains compatible.
  - Update call-sites to read/write the centralized state gradually, run `npx tsc --noEmit` and `npx vitest run` after small batches.
- When extracting canvas code, pass only the necessary dependencies (transform functions, theme constants, zoom/pan values) into renderer functions to keep them testable/pure.
- When adding UI wiring, use `initUi()` and `uiRefs` rather than querying the DOM repeatedly.

Tests and fast feedback
- Unit-test math and model transformations in `src/engine.ts` and `src/model.ts` via `vitest`.
- After any change that touches `src/main.ts`, run both the type-check and tests:
```bash
npx tsc --noEmit
npx vitest run
```

If anything above is unclear or you'd like more specifics (examples of common refactors, test templates, or a CI job to run `generate-content-index`), tell me which area to expand. I can iterate on this file.
# Copilot instructions for Constrivia

This repo is a small TypeScript PWA (canvas-based geometry editor) with a tiny Cloudflare worker API. Below are concise, actionable notes that help an AI coding agent be productive immediately.

Repository layout (key files)
- `src/main.ts`: core application state, model creation, id-prefix conventions and many UI-driven geometric operations.
- `src/engine.ts`: pure geometric helpers (distance, intersections, projections). Prefer adding algorithmic helpers here for reuse.
- `src/model.ts`, `src/types.ts`: authoritative model shape and TypeScript types used across app and tests.
- `src/files.ts`: cloud/IO UI helpers (cloud save/load). Look here for client ↔ server wire format.
- `src/canvas/renderer.ts` and `src/canvas/events.ts`: rendering + input handling for canvas; change here for visuals/interaction.
- `functions/api/json/[key].ts`: minimal Cloudflare worker endpoints that PUT/GET/DELETE binary values into Cloudflare KV.
- `public/content/index.json`: generated manifest of content files (created by `scripts/generate-content-index.mjs`).

Big picture and design intent
- Client-first single-page PWA: most logic (construction and recomputation) lives in the client (`src/main.ts`) with a lean geometry engine in `src/engine.ts` for testable math.
- Model IDs use stable prefixes (see `ID_PREFIX` in `src/main.ts`): `pt*`, `ln*`, `c*`, `ang*`, `poly*`. Respect these when constructing or deserializing objects.
- Content files (exercise/problem files) live under `public/content` and are indexed into `public/content/index.json` by `scripts/generate-content-index.mjs`. The index script runs automatically on `dev`, `build`, and `preview` via `pre*` npm hooks.
- Server integration: `functions/api/json/[key].ts` proxies Cloudflare KV via REST calls using environment variables (CF_ACCOUNT_ID, CF_KV_NAMESPACE_ID, CF_API_TOKEN). `wrangler.toml` binds a KV namespace named `JSON_STORE`.

Developer workflows (commands)
- Install and dev: standard Node + npm. Use `npm run dev` to start Vite (the `predev` script will regenerate `public/content/index.json`).
  ```bash
  npm install
  npm run dev
  ```
- Build/preview: `npm run build` and `npm run preview` (both run the content-index generator first).
- Tests: `npm test` runs `vitest`. Tests use `jsdom` where needed.
  ```bash
  npx vitest run
  ```
- Cloudflare: `wrangler` is a devDependency. Use `wrangler publish` / `wrangler dev` configured by `wrangler.toml` to deploy or run the worker. The runtime expects the KV binding and environment variables described above.

Project-specific conventions and patterns
- Keep pure numeric geometry and deterministic algorithms in `src/engine.ts` (easy to unit-test and reason about). Side-effecting model updates and UI glue belong in `src/main.ts` and the canvas renderer.
- When adding a new geometry helper, export it from `src/engine.ts` and prefer small, pure functions that accept arrays/objects rather than reaching into the global model.
- ID handling: use `nextId()` and existing counters in the model (see `createEmptyModel()` and `nextId` in `src/main.ts`) to avoid desyncs between `indexById` and arrays.
- Segment keys: the code uses stable segment keys (`segmentKeyForPoints`) to locate lines/segments; follow the same key shape (`<id>-<id>` sorted lexicographically).

Integration points and environment
- Cloudflare KV usage: `functions/api/json/[key].ts` expects `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`, and `CF_API_TOKEN`. The worker does REST calls to Cloudflare KV — treat the worker as a thin proxy rather than an authoritative KV client.
- Content generation: `scripts/generate-content-index.mjs` must run whenever files in `public/content` change. It's automatically invoked by npm prehooks, but CI or local edits that add content may need the script run manually.

Tests and fast feedback
- Unit-test math and model transformations in `src/engine.ts` and `src/model.ts` via `vitest`. Example: `test/engine.spec.ts` demonstrates roundtrip conversion for model data.

Small examples (copyable)
- Start dev server (with content index generation):
  ```bash
  npm run dev
  ```
- Run tests:
  ```bash
  npx vitest run
  ```
- Deploy worker (example; requires env vars):
  ```bash
  npx wrangler publish
  ```

When editing code, prioritize these places
- Algorithmic changes: `src/engine.ts`.
- Model shape, serialization or id logic: `src/model.ts`, `src/main.ts`.
- Canvas visuals and input: `src/canvas/renderer.ts`, `src/canvas/events.ts`.
- Content list / indexing: `scripts/generate-content-index.mjs` and `public/content`.
- Cloud functions: `functions/api/json/[key].ts` and `wrangler.toml`.

If anything above is unclear or you'd like more specifics (examples of common refactors, test templates, or a CI job to run `generate-content-index`), tell me which area to expand. I can iterate on this file. 
