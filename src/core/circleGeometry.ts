import type { ObjectId } from './runtimeTypes';

export type CircleKind = 'center-radius' | 'three-point' | 'compass';
export type CircleDefinition = {
  center: ObjectId;
  radius_point?: ObjectId;
  circle_kind?: CircleKind;
  defining_points?: [ObjectId, ObjectId, ObjectId];
};
type Position = { x: number; y: number };
type PointGeometry = { points: Record<ObjectId, Position> };
const finite = (p?: Position): p is Position => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

/** Resolve radius independently of styles and cached validity, including recovery. */
export function resolveCircleGeometry(geometry: PointGeometry, circle: CircleDefinition) {
  const center = geometry.points[circle.center];
  if (!finite(center)) return null;
  let vector: Position;
  if (circle.circle_kind === 'compass') {
    const defs = circle.defining_points;
    if (!defs || defs.length !== 3 || defs[0] !== circle.center) return null;
    const a = geometry.points[defs[1]], b = geometry.points[defs[2]];
    if (!finite(a) || !finite(b)) return null;
    vector = { x: b.x - a.x, y: b.y - a.y };
  } else {
    const id = circle.radius_point ?? circle.defining_points?.[0];
    const point = id ? geometry.points[id] : undefined;
    if (!finite(point)) return null;
    vector = { x: point.x - center.x, y: point.y - center.y };
  }
  const radius = Math.hypot(vector.x, vector.y);
  return Number.isFinite(radius) && radius > 1e-6 ? { center, radius, vector } : null;
}

export function circleInputPointIds(circle: CircleDefinition): ObjectId[] {
  if (circle.circle_kind === 'three-point') return circle.defining_points?.slice() ?? [];
  if (circle.circle_kind === 'compass') return Array.from(new Set([circle.center, ...(circle.defining_points ?? [])]));
  const radius = circle.radius_point ?? circle.defining_points?.[0];
  return radius ? [circle.center, radius] : [circle.center];
}

/** A compass circle uses its source length directly; no hidden radius point. */
export function compassCircleDefinition(geometry: PointGeometry, source: [ObjectId, ObjectId], center: ObjectId) {
  const definition = {
    center,
    circle_kind: 'compass' as const,
    defining_points: [center, ...source] as [ObjectId, ObjectId, ObjectId],
    defining_parents: Array.from(new Set([center, ...source]))
  };
  return resolveCircleGeometry(geometry, definition) ? definition : null;
}
