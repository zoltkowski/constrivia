import type { ConstructionRuntime, ObjectId } from './runtimeTypes';
import { toEngineState, applyEngineState } from './engineAdapter';
import { recomputeAll } from './engineCompute';
import { syncSpatialGeometry } from './spatialGeometry';
import { syncBoundaryIntersectionSlots, syncBoundaryIntersectionTopology } from './boundaryIntersections';
import { syncObjectSymmetries } from './objectSymmetry';

export type RecomputeRuntimeOptions = {
  movedPointIds?: Iterable<ObjectId>;
  maxPasses?: number;
};

export function recomputeAllRuntime(runtime: ConstructionRuntime, options: RecomputeRuntimeOptions = {}) {
  syncSpatialGeometry(runtime);
  syncObjectSymmetries(runtime);
  syncBoundaryIntersectionSlots(runtime);
  const engine = toEngineState(runtime);
  const movedPointIds = options.movedPointIds
    ? new Set(Array.from(options.movedPointIds, (id) => String(id)))
    : undefined;
  recomputeAll(engine, { movedPointIds, maxPasses: options.maxPasses });
  applyEngineState(runtime, engine, { points: true, lines: true, circles: true });
  // Dependent lines and locked polygons may move only during the solve. Recheck
  // after applying those coordinates and solve once more if new output slots appeared.
  if (syncBoundaryIntersectionSlots(runtime)) {
    const expandedEngine = toEngineState(runtime);
    recomputeAll(expandedEngine, { movedPointIds, maxPasses: options.maxPasses });
    applyEngineState(runtime, expandedEngine, { points: true, lines: true, circles: true });
  }
  syncSpatialGeometry(runtime);
  syncBoundaryIntersectionTopology(runtime);
  syncObjectSymmetries(runtime);
}
