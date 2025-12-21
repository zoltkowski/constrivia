# Legacy TODOs (auto-generated)

This file lists locations in the codebase mentioning legacy compatibility or legacy formats to be reviewed and progressively migrated to runtime-id-first patterns.

- src/main.ts: lines around legacy measurement reference parsing and legacy object form handling (convert to canonical `persistedToRuntime` processing).
- src/main.ts: legacy polygon vertex building (`vertsLegacy`) — replace with `polygonVerticesFromPolyRuntime` usage.
- src/main.ts: angle legacy `leg1/leg2` handling — ensure all angle call-sites use `arm1LineId`/`arm2LineId` when available.
- src/main.ts: several `legacy numeric-line case` fallbacks — replace with engine adapter helpers accepting ids.
- src/core/engine.ts: adapters for legacy array-based models should be deprecated once all `src/main.ts` call-sites migrate.
- src/core/convert.ts: contains mapping for bisect/symmetric — keep but write tests proving removal safe before deleting.
- src/canvas/renderer.ts: legacy single-snap handling — migrate to unified snap API.

Migration plan:
1. Replace `vertsLegacy` with `polygonVerticesOrderedFromPolyRuntime` where polygon runtime is available.
2. Consolidate angle leg handling: central helper that accepts either legacy leg or runtime arm id and returns consistent arm ids.
3. Remove legacy array-based engine adapters after call-site sweep.
4. Add tests covering each migrated spot.

