import type { Model, ObjectId, Point, Circle } from './runtimeTypes';
import { constrainPointToParentLine } from './engine';
import { circlesContainingPoint, circleRadius } from './circleTools';

type PointPos = { x: number; y: number };

const getPointById = (model: Model, id: ObjectId): Point | null => {
  const idx = model.indexById?.point?.[String(id)];
  if (typeof idx === 'number') return model.points[idx] ?? null;
  return model.points.find((p) => p?.id === id) ?? null;
};

const getCircleById = (model: Model, id: ObjectId): Circle | null => {
  const idx = model.indexById?.circle?.[String(id)];
  if (typeof idx === 'number') return model.circles[idx] ?? null;
  return model.circles.find((c) => c?.id === id) ?? null;
};

const constrainPointToParentCircle = (model: Model, pointId: ObjectId, desired: PointPos): PointPos | null => {
  const circleIds = circlesContainingPoint(model, null, pointId);
  if (!circleIds.length) return null;
  const circle = getCircleById(model, circleIds[0]);
  if (!circle) return null;
  const center = getPointById(model, circle.center);
  const current = getPointById(model, pointId);
  if (!center || !current) return null;
  const radius = circleRadius(model, null, circle);
  if (!(radius > 0)) return null;

  let dir = { x: desired.x - center.x, y: desired.y - center.y };
  let len = Math.hypot(dir.x, dir.y);
  if (len < 1e-6) {
    dir = { x: current.x - center.x, y: current.y - center.y };
    len = Math.hypot(dir.x, dir.y) || 1;
  }
  const norm = { x: dir.x / len, y: dir.y / len };
  return { x: center.x + norm.x * radius, y: center.y + norm.y * radius };
};

export function translatePointsWithConstraints(
  model: Model,
  originals: Map<ObjectId, PointPos>,
  delta: PointPos,
  options: { constrainToLine?: boolean; constrainToCircle?: boolean } = {}
): Set<ObjectId> {
  const moved = new Set<ObjectId>();
  const constrainToLine = options.constrainToLine !== false;
  const constrainToCircle = options.constrainToCircle !== false;

  originals.forEach((orig, pointId) => {
    const idx = model.indexById?.point?.[String(pointId)];
    if (typeof idx !== 'number') return;
    const cur = model.points[idx];
    if (!cur) return;
    let next = { x: orig.x + delta.x, y: orig.y + delta.y };
    if (constrainToLine) {
      const lineConstrained = constrainPointToParentLine(model, pointId, next);
      if (lineConstrained) next = lineConstrained;
    }
    if (constrainToCircle) {
      const circleConstrained = constrainPointToParentCircle(model, pointId, next);
      if (circleConstrained) next = circleConstrained;
    }
    model.points[idx] = { ...cur, ...next };
    moved.add(pointId);
  });

  return moved;
}
