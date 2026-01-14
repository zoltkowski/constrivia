import type { ConstructionRuntime, ObjectId, PolygonLockRef, PolygonRuntime } from './runtimeTypes';

const EPS = 1e-6;

const getPoint = (runtime: ConstructionRuntime, id: ObjectId) => runtime.points[String(id)] ?? null;

export function buildPolygonLockRef(
  runtime: ConstructionRuntime,
  poly: PolygonRuntime,
  baseOverride?: [ObjectId, ObjectId]
): PolygonLockRef | null {
  const points = Array.isArray(poly.points) ? poly.points.map((id) => String(id)) : [];
  if (points.length < 2) return null;
  let baseIds: [ObjectId, ObjectId] = [points[0], points[1]];
  if (baseOverride) {
    const aId = String(baseOverride[0]);
    const bId = String(baseOverride[1]);
    if (points.includes(aId) && points.includes(bId) && aId !== bId) {
      baseIds = [aId, bId];
    }
  }
  const aId = baseIds[0];
  const bId = baseIds[1];
  const a = getPoint(runtime, aId);
  const b = getPoint(runtime, bId);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len <= EPS) return null;
  const axis = { x: dx / len, y: dy / len };
  const left = { x: -axis.y, y: axis.x };
  const coords: Array<{ id: ObjectId; u: number; v: number }> = [];
  points.forEach((pid) => {
    const p = getPoint(runtime, pid);
    if (!p) return;
    const vx = p.x - a.x;
    const vy = p.y - a.y;
    const u = (vx * axis.x + vy * axis.y) / len;
    const v = (vx * left.x + vy * left.y) / len;
    coords.push({ id: String(pid), u, v });
  });
  if (coords.length < 2) return null;
  return { base: [String(aId), String(bId)], coords };
}

export function ensurePolygonLockRef(
  runtime: ConstructionRuntime,
  poly: PolygonRuntime
): PolygonLockRef | null {
  if (!poly.locked) return null;
  if (poly.lockRef) return poly.lockRef;
  const ref = buildPolygonLockRef(runtime, poly);
  if (ref) poly.lockRef = ref;
  return ref;
}
