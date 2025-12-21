# Changelog

## 2025-12-21 — Runtime migration progress

- Migration: Converted persisted↔runtime adapters to support mixed numeric/index and string/id references for points, lines, angles, polygons.
- Tests: Added focused persisted↔runtime roundtrip tests (midpoint, bisect, symmetric, measurement reference, polygon roundtrips).
- Handlers: Extracted canvas event wiring and pointer handlers into `src/canvas/events.ts` and `src/canvas/handlers.ts`.
- Cleanup: Removed legacy shim `src/core/runtimeAdapter.ts` and consolidated canonical `modelToRuntime` in `src/core/modelToRuntime.ts`.
- Types: Extended runtime types with measurement reference fields; updated conversion logic in `src/core/convert.ts`.
- Verification: Ran `npx tsc --noEmit`, `npx vitest run`, and `npm run build`; all checks passed.

Next steps:
- Finish final cleanup: update docs, tidy remaining legacy call-sites, and complete dev-time QA.
- Remove any remaining adapter/compat code once call-sites are fully migrated.

