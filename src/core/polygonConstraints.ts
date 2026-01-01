import type { Model, ObjectId, Point } from './runtimeTypes';

const getPointById = (model: Model, id: ObjectId): Point | null => {
  const idx = model.indexById?.point?.[String(id)];
  if (typeof idx === 'number') return model.points[idx] ?? null;
  return model.points.find((p) => p?.id === id) ?? null;
};

export function canDragPolygonVertices(model: Model, vertexIds: ObjectId[]): boolean {
  if (!vertexIds.length) return false;
  return vertexIds.every((id) => {
    const pt = getPointById(model, id);
    if (!pt) return false;
    if (pt.construction_kind && pt.construction_kind !== 'free') return false;
    if (pt.parent_refs && pt.parent_refs.length > 0) return false;
    return true;
  });
}
