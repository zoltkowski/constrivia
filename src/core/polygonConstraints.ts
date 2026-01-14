import type { ConstructionRuntime, ObjectId, Point } from './runtimeTypes';

const getPointById = (runtime: ConstructionRuntime, id: ObjectId): Point | null => {
  return runtime.points[String(id)] ?? null;
};

export function canDragPolygonVertices(runtime: ConstructionRuntime, vertexIds: ObjectId[]): boolean {
  if (!vertexIds.length) return false;
  return vertexIds.every((id) => {
    const pt = getPointById(runtime, id);
    if (!pt) return false;
    if (pt.construction_kind && pt.construction_kind !== 'free') return false;
    if (pt.parent_refs && pt.parent_refs.length > 0) return false;
    return true;
  });
}
