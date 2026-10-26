import { circleCircleIntersections } from './engine';
import { resolveCircleGeometry, type CircleDefinition } from './circleGeometry';
import type { ObjectId } from './runtimeTypes';

type Position = { x: number; y: number };
export type CommonTangentContact = { circles: [ObjectId, ObjectId]; branch: 1 | -1; contact: 0 | 1 };
type CircleGeometry = { points: Record<ObjectId, Position>; circles: Record<ObjectId, CircleDefinition>; lines?: Record<ObjectId, unknown> };

/** External common tangents. Branches stay tied to the ordered centers during edits. */
export function commonCircleTangentGeometry(geometry: CircleGeometry, circles: [ObjectId,ObjectId]) {
  if (circles[0] === circles[1]) return [];
  const first = geometry.circles[circles[0]], second = geometry.circles[circles[1]];
  const a = first && resolveCircleGeometry(geometry, first), b = second && resolveCircleGeometry(geometry, second);
  if (!a || !b) return [];
  const dx=b.center.x-a.center.x, dy=b.center.y-a.center.y, distance=Math.hypot(dx,dy);
  if (distance <= 1e-6 || Math.abs(a.radius-b.radius) > distance + 1e-6) return [];
  const ratio=Math.max(-1,Math.min(1,(a.radius-b.radius)/distance));
  const height=Math.sqrt(Math.max(0,1-ratio*ratio));
  const branches: (1|-1)[] = height <= 1e-8 ? [1] : [1,-1];
  return branches.map(branch=>{
    const normal={x:dx/distance*ratio-branch*dy/distance*height,y:dy/distance*ratio+branch*dx/distance*height};
    return {branch,normal,first:{x:a.center.x+a.radius*normal.x,y:a.center.y+a.radius*normal.y},
      second:{x:b.center.x+b.radius*normal.x,y:b.center.y+b.radius*normal.y}, helperDistance:Math.max(distance,a.radius,b.radius,1)};
  });
}

export function commonTangentContactPosition(geometry: CircleGeometry, meta: CommonTangentContact): Position | null {
  const tangent=commonCircleTangentGeometry(geometry,meta.circles).find(tangent=>tangent.branch===meta.branch);
  return tangent ? (meta.contact === 0 ? tangent.first : tangent.second) : null;
}

/** Geometric plan only; creation and visibility of document objects belong to UI. */
export function tangentConstructionGeometry(center: Position, radius: number, point: Position) {
  if (![center.x, center.y, point.x, point.y, radius].every(Number.isFinite) || radius <= 1e-6) return null;
  const distance = Math.hypot(point.x - center.x, point.y - center.y);
  if (distance < radius - 1e-2) return { kind: 'inside' as const };
  if (Math.abs(distance - radius) < 1e-2) return { kind: 'contact' as const };
  const midpoint = { x: (point.x + center.x) / 2, y: (point.y + center.y) / 2 };
  const auxiliaryRadius = distance / 2;
  return { kind: 'external' as const, midpoint, auxiliaryRadius,
    contacts: circleCircleIntersections(midpoint, auxiliaryRadius, center, radius) };
}
