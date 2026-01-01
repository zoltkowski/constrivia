import type { Circle, CircleThroughPoints, ConstructionRuntime, ObjectId, Point, StrokeStyle } from './runtimeTypes';
import {
  circleDefiningPointIdsRuntime,
  circleHasDefiningPointRuntime,
  circlePerimeterPointIdsRuntime,
  circleRadiusRuntime,
  circleRadiusVectorRuntime
} from './engine';

// Used by circle tools to detect three-point circles.
export const isCircleThroughPoints = (circle: Circle): circle is CircleThroughPoints =>
  (circle as any).circle_kind === 'three-point';

// Used by circle tools to resolve point ids into runtime points.
const getPointById = (runtime: ConstructionRuntime, id: ObjectId | undefined | null): Point | null => {
  if (!id) return null;
  return runtime.points[String(id)] ?? null;
};

// Used by circle tools to resolve defining points to indices.
export const circleDefiningPoints = (runtime: ConstructionRuntime, circle: Circle): ObjectId[] => {
  try {
    const ids = circleDefiningPointIdsRuntime(String(circle.id), runtime);
    return ids.filter((id): id is ObjectId => typeof id === 'string');
  } catch {}
  if (isCircleThroughPoints(circle)) {
    return (circle.defining_points ?? []).slice();
  }
  return [];
};

// Used by circle tools to resolve perimeter points to indices.
export const circlePerimeterPoints = (runtime: ConstructionRuntime, circle: Circle): ObjectId[] => {
  try {
    const ids = circlePerimeterPointIdsRuntime(String(circle.id), runtime);
    return ids.filter((id): id is ObjectId => typeof id === 'string');
  } catch {}
  const result: ObjectId[] = [];
  const seen = new Set<string>();
  const pushUnique = (id: ObjectId | undefined | null) => {
    if (!id) return;
    if (id === circle.center) return;
    const key = String(id);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(id);
    }
  };
  pushUnique(circle.radius_point);
  circle.points.forEach((id) => pushUnique(id));
  circleDefiningPoints(runtime, circle).forEach((id) => pushUnique(id));
  return result;
};

// Used by circle tools to compute the current radius.
export const circleRadius = (runtime: ConstructionRuntime, circle: Circle): number => {
  try {
    const r = circleRadiusRuntime(String(circle.id), runtime);
    if (Number.isFinite(r)) return r;
  } catch {}
  const center = getPointById(runtime, circle.center);
  const radiusPt = getPointById(runtime, circle.radius_point);
  if (!center || !radiusPt) return 0;
  return Math.hypot(radiusPt.x - center.x, radiusPt.y - center.y);
};

// Used by circle tools to compute radius vector from center to radius point.
export const circleRadiusVector = (runtime: ConstructionRuntime, circle: Circle): { x: number; y: number } | null => {
  try {
    const v = circleRadiusVectorRuntime(String(circle.id), runtime);
    if (v) return v;
  } catch {}
  const center = getPointById(runtime, circle.center);
  const radiusPt = getPointById(runtime, circle.radius_point);
  if (!center || !radiusPt) return null;
  return { x: radiusPt.x - center.x, y: radiusPt.y - center.y };
};

// Used by circle tools to check if a point is a defining point.
export const circleHasDefiningPoint = (runtime: ConstructionRuntime, circle: Circle, pointId: ObjectId): boolean => {
  try {
    if (pointId) return circleHasDefiningPointRuntime(String(circle.id), String(pointId), runtime);
  } catch {}
  if (!isCircleThroughPoints(circle)) return false;
  return (circle.defining_points ?? []).some((id) => id === pointId);
};

// Used by circle tools to find circles that contain a constrained point.
export const circlesContainingPoint = (runtime: ConstructionRuntime, id: ObjectId): ObjectId[] => {
  const res = new Set<ObjectId>();
  Object.values(runtime.circles).forEach((c) => {
    const hasPoint = (c.points ?? []).some((pid) => pid === id);
    if (hasPoint && !circleHasDefiningPoint(runtime, c, id)) res.add(c.id);
  });
  return Array.from(res);
};

// Used by circle tools to find circles referencing a point as center/radius.
export const circlesReferencingPoint = (runtime: ConstructionRuntime, id: ObjectId): ObjectId[] => {
  const res = new Set<ObjectId>();
  Object.values(runtime.circles).forEach((c) => {
    if (c.center === id) res.add(c.id);
    if (c.radius_point === id) res.add(c.id);
    if (isCircleThroughPoints(c)) {
      const hasDef = (c.defining_points ?? []).some((pid) => pid === id);
      if (hasDef) res.add(c.id);
    }
  });
  return Array.from(res);
};

// Used by circle tools to find circles that use a point as center.
export const circlesWithCenter = (runtime: ConstructionRuntime, id: ObjectId): ObjectId[] => {
  const res = new Set<ObjectId>();
  Object.values(runtime.circles).forEach((c) => {
    if (c.center === id) res.add(c.id);
  });
  return Array.from(res);
};

// Used by circle tools to compute a circumcenter for three points.
export function circleFromThree(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-6) return null;
  const ux =
    ((a.x * a.x + a.y * a.y) * (b.y - c.y) + (b.x * b.x + b.y * b.y) * (c.y - a.y) + (c.x * c.x + c.y * c.y) * (a.y - b.y)) /
    d;
  const uy =
    ((a.x * a.x + a.y * a.y) * (c.x - b.x) + (b.x * b.x + b.y * b.y) * (a.x - c.x) + (c.x * c.x + c.y * c.y) * (b.x - a.x)) /
    d;
  return { x: ux, y: uy };
}
