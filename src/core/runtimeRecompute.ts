import type { ConstructionRuntime, ObjectId } from './runtimeTypes';
import { toEngineState, applyEngineState } from './engineAdapter';
import { recomputeAll } from './engineCompute';
import { syncSpatialGeometry } from './spatialGeometry';

export type RecomputeRuntimeOptions = {
  movedPointIds?: Iterable<ObjectId>;
  maxPasses?: number;
};

export function recomputeAllRuntime(runtime: ConstructionRuntime, options: RecomputeRuntimeOptions = {}) {
  syncSpatialGeometry(runtime);
  const engine = toEngineState(runtime);
  const movedPointIds = options.movedPointIds
    ? new Set(Array.from(options.movedPointIds, (id) => String(id)))
    : undefined;
  recomputeAll(engine, { movedPointIds, maxPasses: options.maxPasses });
  applyEngineState(runtime, engine, { points: true, lines: true, circles: true });
  syncSpatialGeometry(runtime);
}
