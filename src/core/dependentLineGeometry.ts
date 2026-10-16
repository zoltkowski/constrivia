import type { ObjectId } from './runtimeTypes';

type Position = { x: number; y: number };
type Geometry = { points: Record<ObjectId, Position>; lines: Record<ObjectId, { points: ObjectId[]; defining_points?: [ObjectId, ObjectId] }> };
export type DirectionReference = { referenceLine?: ObjectId; referencePoints?: [ObjectId, ObjectId] };

/** Resolve construction inputs independently of visible parts and subdivision order. */
export function referenceLineGeometry(geometry: Geometry, reference: DirectionReference) {
  const line = reference.referenceLine ? geometry.lines[reference.referenceLine] : null;
  const ids = reference.referencePoints ?? (line && (line.defining_points ?? [line.points[0], line.points[line.points.length - 1]]));
  if (!ids) return null;
  const a = geometry.points[ids[0]], b = geometry.points[ids[1]];
  if (!a || !b) return null;
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 1e-6) return null;
  return { a, b, length, dir: { x: dx / length, y: dy / length } };
}

export function referenceDependencies(reference: DirectionReference): { kind: 'line' | 'point'; id: ObjectId }[] {
  return reference.referencePoints ? reference.referencePoints.map(id => ({ kind: 'point', id }))
    : reference.referenceLine ? [{ kind: 'line', id: reference.referenceLine }] : [];
}

export function perpendicularBisectorSeed(geometry: Geometry, aId: ObjectId, bId: ObjectId) {
  const base = referenceLineGeometry(geometry, { referencePoints: [aId, bId] });
  if (!base) return null;
  const midpoint = { x: (base.a.x + base.b.x) / 2, y: (base.a.y + base.b.y) / 2 };
  const normal = { x: -base.dir.y, y: base.dir.x };
  // Internal direction helpers are separate from user subdivision points.
  // Keep their separation stable when the source segment changes length.
  const helperDistance = Math.max(base.length / 2, 1);
  return {
    midpoint,
    helperDistance,
    negativeEndpoint: { x: midpoint.x - normal.x * helperDistance, y: midpoint.y - normal.y * helperDistance },
    positiveEndpoint: { x: midpoint.x + normal.x * helperDistance, y: midpoint.y + normal.y * helperDistance }
  };
}

/** Creation geometry shared by UI constructors; it does not create document objects. */
export function dependentLineSeed(geometry: Geometry, anchorId: ObjectId, reference: DirectionReference, perpendicular: boolean) {
  const anchor = geometry.points[anchorId], base = referenceLineGeometry(geometry, reference);
  if (!anchor || !base) return null;
  const normal = { x: -base.dir.y, y: base.dir.x };
  const signedDistance = (anchor.x - base.a.x) * normal.x + (anchor.y - base.a.y) * normal.y;
  const projection = perpendicular && Math.abs(signedDistance) >= 1e-3;
  const distance = projection ? Math.abs(signedDistance) : 1;
  const orientation: 1 | -1 = projection && signedDistance > 0 ? -1 : 1;
  const direction = perpendicular ? { x: normal.x * orientation, y: normal.y * orientation } : base.dir;
  return { helperPos: { x: anchor.x + direction.x * distance, y: anchor.y + direction.y * distance },
    helperMode: projection ? 'projection' as const : 'normal' as const, helperHidden: !projection,
    helperDistance: distance, helperOrientation: orientation, forceRaysVisible: !projection };
}
