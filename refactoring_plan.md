**Status Summary**
- **Done:** initial splits for runtime/persisted types, `src/core/engine.ts` with pure helpers, `src/core/modelToRuntime.ts` conversion layer, event wiring extraction (`src/canvas/events.ts`), `src/canvas/handlers.ts` with dblclick handler.
- **In Progress:** incremental migration in `src/main.ts` from index-based model to runtime (many call-sites migrated), debug panel adaptation, preserving object identity for styles/labels.
- **TODO:** finish extracting remaining canvas handlers (`pointermove`, `pointerup`), complete angle/polygon migration to runtime ids, add focused persisted↔runtime roundtrip tests, remove legacy adapter shim and tidy exports.

**High-level priorities (recommended order)**
1. Stabilize core infra: ensure `src/canvas/events.ts` is clean and imported everywhere (done), remove temporary modules (`events2.ts`) and ensure imports point to canonical files.
2. Migrate angle helpers and all call-sites to runtime id-based shapes (highest runtime impact; changes are contained to engine + `main.ts`).
3. Migrate polygon helpers to use runtime vertex ids (affects recompute & selection flows).
4. Extract remaining canvas handlers (pointermove, pointerup/release) into `src/canvas/handlers.ts` and wire via `initCanvasEvents(...).setPointerRelease()`.
5. Add/adjust unit tests for persisted↔runtime roundtrip cases (midpoint, bisect, symmetric) and measurement reference serialization.
6. Remove legacy `runtimeAdapter` / shim and update public export surface.
7. Final cleanup: update docs, run full `npm run dev`, make any small UI fixes, and commit changes.

**Detailed action plan (step-by-step)**

1) Stabilize event wiring and handlers
- Done: created `src/canvas/events.ts` with late-bind pointer release and `initCanvasEvents` API.
- Done: added `src/canvas/handlers.ts` with `makeCanvasHandlers` and moved dblclick logic into it.
- TODO: Extract `pointermove` and pointer-release (`pointerup`/`pointercancel`) behavior from `src/main.ts` into `handlers.ts` as small pure functions that accept a `context` object (see pattern used by the dblclick handler).
- Steps:
    - Identify `handleCanvasPointerMove` and `handlePointerRelease` blocks in `main.ts`.
    - Create corresponding functions in `handlers.ts`, keep them reference-free by passing `context` (canvas, world conversion, selection APIs).
    - Bind pointerdown in `initCanvasEvents` to `handleCanvasClick` (existing) and set pointer release via returned `setPointerRelease(handlers.pointerRelease)`.
    - Run `npx tsc --noEmit` and `npm test` after each small extraction.

2) Migrate angle helpers to runtime ids (high priority)
- In progress: some engine helpers moved to `src/core/engine.ts`.
- TODO: Update all call-sites in `src/main.ts` that compute or mutate angles to use runtime `pointId` references and engine adapters (e.g., `angleBaseGeometryRuntime`, `reorderLinePointIdsRuntime`).
- Steps:
    - Search for legacy patterns: `leg1`, `leg2`, `.points` used as numeric indices, `.defining_points`, and any direct array index arithmetic for angles.
    - Replace numeric-index-centric functions with engine-by-id adapters. Example pattern:
        - Before: read points by index from `model.points[n]` and pass indices into helpers.
        - After: obtain point ids from runtime or model, call `engine.angleBaseGeometryRuntime(pointIdA, pointIdB, runtime)` (or similar adapter).
    - Add unit tests that exercise angle recompute logic before and after migration.
    - Run `npx tsc --noEmit` and `npx vitest run` after each logical change.

-- Work started: initial code scan (Dec 20, 2025)
- Status: **In Progress** — I have begun the migration and located the following legacy usages to address first:
    - `src/types.ts`: legacy angle-related fields `defining_points`, `leg1`, `leg2`.
    - `src/persisted/persistedTypes.ts`: persisted definitions with `defining_points`, `leg1`, `leg2`.
    - `src/main.ts`: several call-sites still reference numeric point indices (examples: `const aId = model.points[aIdx]?.id`, `segmentKeyForPointsPure(model.points, aIdx, bIdx)`, `findLineIndexForSegmentPure(model.points, model.lines, aIdx, bIdx)`, `target.points.forEach((p, i) => registerIndex(...))`, `model.points.indexOf(point)`, `line.defining_points.includes(pointIdx)`).
    - `src/model.ts`: conversions that map arrays to maps; verify callers that assume numeric ordering.

- Immediate next code tasks (small, safe patches):
    1. Add adapter helpers in `src/core/engine.ts` that accept point ids (or points Map) instead of numeric indices for the most common operations: segment key, find line for segment, angle base geometry.
    2. Replace non-critical call-sites in `src/main.ts` to use the new adapter helpers, one at a time, running `npx tsc --noEmit` and `npx vitest run` after each change.
    3. Add unit tests for each adapter to prevent regressions.

Progress update (Dec 20, 2025):
- **Done (step 1):** added adapter helpers to `src/core/engine.ts`:
    - `segmentKeyForIds(aId, bId)`
    - `findLineIndexForSegmentFromArrays(points, lines, aId, bId)`
- **Next:** update a non-critical call-site in `src/main.ts` to use `findLineIndexForSegmentFromArrays` and run `npx tsc --noEmit` + `npx vitest run` to verify.
-- Progress (Dec 20, 2025):
- **Done (step 2):** updated `src/main.ts` `findLineIndexForSegment` to attempt an id-based lookup via `findLineIndexForSegmentFromArrays(...)` and fall back to the pure index-based function. Ran `npx tsc --noEmit` and `npx vitest run` — all green.
- **Next (still In Progress):** continue replacing remaining angle-related call-sites in `src/main.ts` (search for `leg1`, `leg2`, `defining_points`, and direct numeric index usage) with id-based adapters, one change at a time.

3) Migrate polygon helpers
- TODO: refactor polygon helpers to operate on `PolygonRuntime.vertices` (ids) or to use engine adapters that accept id lists.
- Steps:
    - Convert polygon centroid/vertex iteration to use id-based lookup functions in `core/engine.ts`.
    - Ensure renderer uses the runtime mapping when drawing polygons.
    - Add tests for polygon vertex reordering, centroid, and polygon dragging flows.

4) Styles separation
- In progress: ensure style read/write is performed only by UI and renderer; engine remains style-agnostic.
- TODO: centralize style access through `StyleMapper` (or `styleState`) and update call-sites to avoid leaking style objects into engine.
- Steps:
    - Audit code for places where `style` is read/written in engine or model mutation paths; move style mutations to UI-layer helpers in `main.ts`.
    - Ensure `Point.style` identity is preserved when converting to runtime (important for visual regressions).

5) Tests and verification
- TODO: add focused persisted→runtime→persisted roundtrip tests for `midpoint`, `bisect`, `symmetric`, and measurement references.
- Steps:
    - Add tests under `test/roundtrip.*.spec.ts` that serialize a persisted model with special metadata, convert to runtime, convert back, and assert equivalence (with allowances for legacy shims).
    - Make small helper factories in tests to create targeted persisted shapes.

6) Remove legacy shims and finalize exports
- TODO: when call-sites are migrated and tests pass, remove `src/core/runtimeAdapter.ts` shim and re-export the canonical modules from expected paths.




