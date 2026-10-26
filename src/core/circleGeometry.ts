import type { ObjectId } from './runtimeTypes';

export type CircleKind = 'center-radius' | 'three-point' | 'compass';
export type CompassLineSource = { lineId: ObjectId; a: ObjectId; b: ObjectId };
export type CompassDistanceSource =
  | { kind: 'point-line'; pointId: ObjectId; line: CompassLineSource }
  | { kind: 'parallel-lines'; lines: [CompassLineSource, CompassLineSource] };
export type CircleDefinition = {
  center: ObjectId;
  radius_point?: ObjectId;
  circle_kind?: CircleKind;
  defining_points?: [ObjectId, ObjectId, ObjectId];
  compassSource?: CompassDistanceSource;
};
type Position = { x: number; y: number };
type PointGeometry = { points: Record<ObjectId, Position>; lines?: Record<ObjectId, unknown> };
const finite = (p?: Position): p is Position => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

export function compassSourceLines(source: CompassDistanceSource): CompassLineSource[] {
  return source.kind === 'point-line' ? [source.line] : source.lines;
}
export function compassSourcePoints(source: CompassDistanceSource): ObjectId[] {
  return Array.from(new Set([
    ...(source.kind === 'point-line' ? [source.pointId] : []),
    ...compassSourceLines(source).flatMap(line => [line.a, line.b])
  ]));
}

/** Perpendicular distance to the supporting line, including outside a selected side. */
export function compassDistanceGeometry(geometry: PointGeometry, source: CompassDistanceSource): Position | null {
  const lines = compassSourceLines(source).map(line => {
    const a = geometry.points[line.a], b = geometry.points[line.b];
    if (!geometry.lines?.[line.lineId] || !finite(a) || !finite(b)) return null;
    const length = Math.hypot(b.x-a.x, b.y-a.y);
    return length > 1e-6 ? { a, x: (b.x-a.x)/length, y: (b.y-a.y)/length } : null;
  });
  const first = lines[0];
  if (!first) return null;
  let point: Position | undefined;
  if (source.kind === 'point-line') point = geometry.points[source.pointId];
  else {
    const second = lines[1];
    if (!second || Math.abs(first.x*second.y-first.y*second.x) > 1e-7) return null;
    point = second.a;
  }
  if (!finite(point)) return null;
  const distance = (point.x-first.a.x)*-first.y+(point.y-first.a.y)*first.x;
  return Math.abs(distance) > 1e-6 ? { x: -first.y*distance, y: first.x*distance } : null;
}

/** Resolve radius independently of styles and cached validity, including recovery. */
export function resolveCircleGeometry(geometry: PointGeometry, circle: CircleDefinition) {
  const center = geometry.points[circle.center];
  if (!finite(center)) return null;
  let vector: Position;
  if (circle.circle_kind === 'compass') {
    if (circle.compassSource) {
      const distance = compassDistanceGeometry(geometry, circle.compassSource);
      return distance ? { center, radius: Math.hypot(distance.x, distance.y), vector: distance } : null;
    }
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
  if (circle.circle_kind === 'compass' && circle.compassSource) return Array.from(new Set([circle.center, ...compassSourcePoints(circle.compassSource)]));
  if (circle.circle_kind === 'three-point') return circle.defining_points?.slice() ?? [];
  if (circle.circle_kind === 'compass') return Array.from(new Set([circle.center, ...(circle.defining_points ?? [])]));
  const radius = circle.radius_point ?? circle.defining_points?.[0];
  return radius ? [circle.center, radius] : [circle.center];
}

export function compassDistanceCircleDefinition(geometry: PointGeometry, source: CompassDistanceSource, center: ObjectId) {
  const inputs = compassSourcePoints(source);
  const definition = {
    center, circle_kind: 'compass' as const, compassSource: structuredClone(source),
    defining_points: [center, inputs[0], inputs[1]] as [ObjectId, ObjectId, ObjectId],
    defining_parents: Array.from(new Set([center, ...inputs]))
  };
  return resolveCircleGeometry(geometry, definition) ? definition : null;
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
