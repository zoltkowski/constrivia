Migration status — runtime / persisted split

Summary
- Goal: migrate from index-based persisted model to id-based runtime model and centralize pure geometry in `src/core/engine.ts`.
- Approach: incremental migration (keep persisted format backward-compatible; add runtime metadata and ById adapters; migrate call-sites in small batches).

What’s done (high level)
- Split types:
  - `src/types.ts` (canonical app types) — used by runtime code.
  - `src/core/runtimeTypes.ts` (id-based runtime schema) — `makeEmptyRuntime()` added.
  - `src/persisted/persistedTypes.ts` (persisted JSON shapes) — centralized persisted declarations.
- Conversion layer: `src/core/convert.ts` (persisted ↔ runtime), handles legacy fields and maps them to runtime meta.
- Engine: `src/core/engine.ts` created and populated with many pure helpers and ById adapters.
- Runtime metadata: added optional `midpointMeta`, `bisectMeta`, `symmetricMeta` to runtime points.
- `src/main.ts` refactor:
  - Removed many duplicate persisted-type declarations and now imports canonical persisted types.
  - Added accessors `getMidpointMeta`, `getBisectMeta`, `getSymmetricMeta` and widened guards to accept legacy or runtime meta.
  - Converted several recompute/update functions to use runtime meta (midpoint, bisect point, symmetric point, cloning logic).
  - Migrated `measurementReferenceSegment` in-memory representation from `{lineIdx,segIdx}` → `{lineId,segIdx}` and made serialization backward-compatible.
- Tests & checks: ran `npx tsc --noEmit` and `npx vitest run` — all current tests pass (6/6) and type-checks succeed.

Files edited (non-exhaustive)
- src/main.ts — many incremental changes: removed duplicated persisted types, migrated call-sites to runtime meta, updated measurement reference handling.
- src/core/runtimeTypes.ts — added bisect/symmetric metadata.
- src/core/convert.ts — mapping persisted->runtime and runtime->persisted for midpoint/bisect/symmetric.
- src/core/engine.ts — new pure helpers and ById adapters.
- src/persisted/persistedTypes.ts — canonical persisted types (already existed; verified).

Current status (work-in-progress)
- Core pure helpers live in `src/core/engine.ts` and are used by `src/main.ts` in several places.
- Many call-sites for angles/polygons/segments remain to be migrated to id-based runtime (some still use numeric indices / legacy fields).
- Persisted format is intentionally left backward-compatible (converters handle legacy forms). Final persisted format changes deferred.

Risks / Notes
- Remaining legacy fields (e.g., `leg1/leg2`, `defining_points`, numeric indices) still exist in parts of `src/main.ts` and can be migrated incrementally.
- Removing legacy fields too early will break many call-sites; incremental approach reduces risk.

How to verify locally
- Type-check: `npx tsc --noEmit`
- Run tests: `npx vitest run`
- Manual quick-run: `npm run dev` (dev server rebuilds content index via predev hook)

Next steps (priority order)
1. Migrate angle helpers and call-sites to use runtime `point1/point2` + engine adapters (high impact on recompute flows).
2. Migrate polygon helpers to operate on `PolygonRuntime.vertices` or `Model` point ids (next-highest impact).
3. Replace remaining index-based helper usages with id-based adapters in `src/main.ts` (search for `.defining_points`, `.points` arrays used with numeric indices).
4. Add unit tests for persisted→runtime→persisted roundtrip specifically covering `midpoint`, `bisect`, and `symmetric` metadata.
5. When all call-sites migrated and tests pass, update `src/core/convert.ts` to simplify persisted format and remove legacy mapping.

Practical next task I can do tomorrow (pick one):
- Continue migrating angle helpers (I will: update helpers, adapt callers, run `tsc`+`vitest`).
- OR add focused roundtrip tests for midpoint/bisect/symmetric and measurement reference parsing.

Notes for picking up work
- Start by running type-checks and tests to ensure baseline passes.
  - `npx tsc --noEmit`
  - `npx vitest run`
- Search for legacy patterns to migrate:
  - `defining_points`, `leg1`, `leg2`, usages of numeric point indices in angle/polygon logic.
  - Use repo grep: `rg "defining_points|leg1|leg2|\.points\b" src/main.ts`
- When making changes: prefer small patches, run `npx tsc --noEmit` and `npx vitest run` after each logical batch.

If you want, tomorrow I will proceed with migrating angle helpers (recommended).

-- MIGRATION_STATUS.md (auto-generated)
