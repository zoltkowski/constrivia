import type { BisectMeta, BisectSegmentRef, ObjectId } from './runtimeTypes';
import { angleArmPoint } from './angleDefinition';

type Point = { id: ObjectId; x: number; y: number };
type Geometry = {
  points: Record<ObjectId, Point>;
  lines: Record<ObjectId, { id: ObjectId; points: ObjectId[] }>;
};

/** A reference denotes the original side, even when new points subdivide it. */
export function resolveBisectSegment(geometry: Geometry, ref: BisectSegmentRef, vertexId: ObjectId) {
  const line = geometry.lines[ref.lineId];
  if (!line || !line.points.includes(ref.a) || !line.points.includes(ref.b)) return null;
  if (ref.a !== vertexId && ref.b !== vertexId) return null;
  const otherId = ref.a === vertexId ? ref.b : ref.a;
  const vertex = geometry.points[vertexId], other = geometry.points[otherId];
  if (!vertex || !other) return null;
  const length = Math.hypot(other.x - vertex.x, other.y - vertex.y);
  if (!Number.isFinite(length) || length < 1e-6) return null;
  return { lineId: line.id, otherId, length };
}

/** Shared by construction creation, recomputation and orphan validation. */
export function bisectorPointPosition(geometry: Geometry, meta: BisectMeta): { x: number; y: number } | null {
  const vertex = geometry.points[meta.vertex];
  if (vertex && meta.arms) {
    const a = angleArmPoint(geometry, vertex, meta.arms[0]), b = angleArmPoint(geometry, vertex, meta.arms[1]);
    if (!a || !b) return null;
    const la = Math.hypot(a.x - vertex.x, a.y - vertex.y), lb = Math.hypot(b.x - vertex.x, b.y - vertex.y);
    if (la <= 1e-6 || lb <= 1e-6) return null;
    const u = { x: (a.x - vertex.x) / la, y: (a.y - vertex.y) / la };
    const v = { x: (b.x - vertex.x) / lb, y: (b.y - vertex.y) / lb };
    let dx = u.x + v.x, dy = u.y + v.y;
    if (Math.hypot(dx, dy) <= 1e-6) { dx = -u.y; dy = u.x; }
    const scale = (meta.exterior ? -1 : 1) * (meta.epsilon ?? 48) / Math.hypot(dx, dy);
    return { x: vertex.x + dx * scale, y: vertex.y + dy * scale };
  }
  if (!meta.seg1 || !meta.seg2) return null;
  const first = resolveBisectSegment(geometry, meta.seg1, meta.vertex);
  const second = resolveBisectSegment(geometry, meta.seg2, meta.vertex);
  if (!vertex || !first || !second) return null;
  const a = geometry.points[first.otherId], b = geometry.points[second.otherId];
  const epsilon = meta.epsilon ?? 48;
  const step = Math.max(1e-6, Math.min(epsilon, first.length, second.length));
  const u = { x: (a.x - vertex.x) / first.length, y: (a.y - vertex.y) / first.length };
  const v = { x: (b.x - vertex.x) / second.length, y: (b.y - vertex.y) / second.length };
  const target = { x: vertex.x + (u.x + v.x) * step / 2, y: vertex.y + (u.y + v.y) * step / 2 };
  // Retain the existing fallback near coincident/opposite arms.
  if (Math.hypot((v.x - u.x) * step, (v.y - u.y) * step) < 1e-3 || Math.hypot(target.x - vertex.x, target.y - vertex.y) < 1e-3) {
    const offset = Math.max(2, Math.min(6, (epsilon || 6) * 0.12));
    target.x -= u.y * offset;
    target.y += u.x * offset;
  }
  return target;
}
