import type { ConstructionRuntime, ObjectId, Point, Circle } from './runtimeTypes';
import { constrainPointToParentLineRuntime } from './engine';
import { circlesContainingPoint, circleRadius } from './circleTools';

type PointPos = { x: number; y: number };

const getPointById = (runtime: ConstructionRuntime, id: ObjectId): Point | null => {
  return runtime.points[String(id)] ?? null;
};

const getCircleById = (runtime: ConstructionRuntime, id: ObjectId): Circle | null => {
  return runtime.circles[String(id)] ?? null;
};

const constrainPointToParentCircle = (runtime: ConstructionRuntime, pointId: ObjectId, desired: PointPos): PointPos | null => {
  const circleIds = circlesContainingPoint(runtime, pointId);
  if (!circleIds.length) return null;
  const circle = getCircleById(runtime, circleIds[0]);
  if (!circle) return null;
  const center = getPointById(runtime, circle.center);
  const current = getPointById(runtime, pointId);
  if (!center || !current) return null;
  const radius = circleRadius(runtime, circle);
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
  runtime: ConstructionRuntime,
  originals: Map<ObjectId, PointPos>,
  delta: PointPos,
  options: { constrainToLine?: boolean; constrainToCircle?: boolean } = {}
): Set<ObjectId> {
  const moved = new Set<ObjectId>();
  const constrainToLine = options.constrainToLine !== false;
  const constrainToCircle = options.constrainToCircle !== false;

  originals.forEach((orig, pointId) => {
    const cur = runtime.points[String(pointId)];
    if (!cur) return;
    let next = { x: orig.x + delta.x, y: orig.y + delta.y };
    if (constrainToLine) {
      const lineConstrained = constrainPointToParentLineRuntime(runtime, pointId, next);
      if (lineConstrained) next = lineConstrained;
    }
    if (constrainToCircle) {
      const circleConstrained = constrainPointToParentCircle(runtime, pointId, next);
      if (circleConstrained) next = circleConstrained;
    }
    runtime.points[String(pointId)] = { ...cur, ...next };
    moved.add(pointId);
  });

  return moved;
}
