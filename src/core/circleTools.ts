import type { Circle, CircleThroughPoints, Model, Point, StrokeStyle } from './runtimeTypes';
import {
  circleDefiningPointIdsRuntime,
  circleHasDefiningPointRuntime,
  circlePerimeterPointIdsRuntime,
  circleRadiusRuntime,
  circleRadiusVectorRuntime
} from './engine';
import { getPointByRef } from './refactorHelpers';

// Used by circle tools to detect three-point circles.
export const isCircleThroughPoints = (circle: Circle): circle is CircleThroughPoints =>
  (circle as any).circle_kind === 'three-point' || (circle as any).circleKind === 'three-point';

// Used by circle tools to normalize id/index point references.
const resolvePointIndex = (model: Model, ref: unknown): number | null => {
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'string') {
    const idx = model.indexById.point[String(ref)];
    return typeof idx === 'number' ? idx : null;
  }
  return null;
};

// Used by circle tools to resolve defining points to indices.
export const circleDefiningPoints = (model: Model, runtime: any, circle: Circle): number[] => {
  try {
    const ids = circleDefiningPointIdsRuntime(String(circle.id), runtime);
    return ids
      .map((id) => resolvePointIndex(model, id))
      .filter((idx): idx is number => typeof idx === 'number');
  } catch {}
  if (isCircleThroughPoints(circle)) {
    return (circle.defining_points ?? [])
      .map((ref) => resolvePointIndex(model, ref))
      .filter((idx): idx is number => typeof idx === 'number');
  }
  return [];
};

// Used by circle tools to resolve perimeter points to indices.
export const circlePerimeterPoints = (model: Model, runtime: any, circle: Circle): number[] => {
  try {
    const ids = circlePerimeterPointIdsRuntime(String(circle.id), runtime);
    return ids
      .map((id) => resolvePointIndex(model, id))
      .filter((idx): idx is number => typeof idx === 'number');
  } catch {}
  const result: number[] = [];
  const seen = new Set<number>();
  const pushUnique = (idx: number | null) => {
    if (typeof idx !== 'number') return;
    const centerIdx = resolvePointIndex(model, circle.center);
    if (typeof centerIdx === 'number' && idx === centerIdx) return;
    if (!seen.has(idx)) {
      seen.add(idx);
      result.push(idx);
    }
  };
  pushUnique(resolvePointIndex(model, circle.radius_point));
  circle.points.forEach((ref) => pushUnique(resolvePointIndex(model, ref)));
  circleDefiningPoints(model, runtime, circle).forEach((idx) => pushUnique(idx));
  return result;
};

// Used by circle tools to compute the current radius.
export const circleRadius = (model: Model, runtime: any, circle: Circle): number => {
  try {
    const r = circleRadiusRuntime(String(circle.id), runtime);
    if (Number.isFinite(r)) return r;
  } catch {}
  const center = getPointByRef(circle.center, model);
  const radiusPt = getPointByRef(circle.radius_point, model);
  if (!center || !radiusPt) return 0;
  return Math.hypot(radiusPt.x - center.x, radiusPt.y - center.y);
};

// Used by circle tools to compute radius vector from center to radius point.
export const circleRadiusVector = (model: Model, runtime: any, circle: Circle): { x: number; y: number } | null => {
  try {
    const v = circleRadiusVectorRuntime(String(circle.id), runtime);
    if (v) return v;
  } catch {}
  const center = getPointByRef(circle.center, model);
  const radiusPt = getPointByRef(circle.radius_point, model);
  if (!center || !radiusPt) return null;
  return { x: radiusPt.x - center.x, y: radiusPt.y - center.y };
};

// Used by circle tools to check if a point is a defining point.
export const circleHasDefiningPoint = (model: Model, runtime: any, circle: Circle, pointIdx: number): boolean => {
  try {
    const pid = model.points[pointIdx]?.id;
    if (pid) return circleHasDefiningPointRuntime(String(circle.id), String(pid), runtime);
  } catch {}
  if (!isCircleThroughPoints(circle)) return false;
  return (circle.defining_points ?? [])
    .map((ref) => resolvePointIndex(model, ref))
    .some((idx) => idx === pointIdx);
};

// Used by circle tools to find circles that contain a constrained point.
export const circlesContainingPoint = (model: Model, runtime: any, idx: number): number[] => {
  const res = new Set<number>();
  model.circles.forEach((c, ci) => {
    const hasPoint = (c.points ?? [])
      .map((ref) => resolvePointIndex(model, ref))
      .some((pIdx) => pIdx === idx);
    if (hasPoint && !circleHasDefiningPoint(model, runtime, c, idx)) res.add(ci);
  });
  return Array.from(res);
};

// Used by circle tools to find circles referencing a point as center/radius.
export const circlesReferencingPoint = (model: Model, idx: number): number[] => {
  const res = new Set<number>();
  model.circles.forEach((c, ci) => {
    const centerIdx = resolvePointIndex(model, c.center);
    const radiusIdx = resolvePointIndex(model, c.radius_point);
    if (centerIdx === idx) res.add(ci);
    if (radiusIdx === idx) res.add(ci);
    if (isCircleThroughPoints(c)) {
      const hasDef = (c.defining_points ?? [])
        .map((ref) => resolvePointIndex(model, ref))
        .some((pIdx) => pIdx === idx);
      if (hasDef) res.add(ci);
    }
  });
  return Array.from(res);
};

// Used by circle tools to find circles that use a point as center.
export const circlesWithCenter = (model: Model, idx: number): number[] => {
  const res = new Set<number>();
  model.circles.forEach((c, ci) => {
    const centerIdx = resolvePointIndex(model, c.center);
    if (centerIdx === idx) res.add(ci);
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
