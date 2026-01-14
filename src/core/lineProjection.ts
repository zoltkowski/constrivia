import type { LineRuntime, PointRuntime, ObjectId } from './runtimeTypes';

type PointMapLike = Record<string, PointRuntime> | Map<string, PointRuntime>;

type Predicate = (id: ObjectId, p: PointRuntime | undefined) => boolean;

// Used by point tools.
function getPoint(points: PointMapLike, id: ObjectId): PointRuntime | undefined {
  if (id === undefined || id === null) return undefined;
  const key = String(id);
  return points instanceof Map ? points.get(key) : points[key];
}

// Used by point tools.
function forEachPoint(points: PointMapLike, cb: (id: ObjectId, p: PointRuntime) => void) {
  if (points instanceof Map) {
    points.forEach((p, id) => cb(id, p));
    return;
  }
  Object.keys(points).forEach((id) => {
    const p = points[id];
    if (p) cb(id, p);
  });
}

// Used by line tools.
export function recomputeLinePointsWithReferences(
  points: PointMapLike,
  line: Pick<LineRuntime, 'points' | 'defining_points'>,
  includeExtra?: Predicate
): Array<{ id: string; pos: { x: number; y: number } }> | null {
  if (!line || !Array.isArray(line.points) || line.points.length < 2) return null;
  const defA = line.defining_points?.[0];
  const defB = line.defining_points?.[1];
  const firstId = line.points.find((id) => !!getPoint(points, id as ObjectId));
  const lastId = [...line.points].reverse().find((id) => !!getPoint(points, id as ObjectId));
  const a = (defA ? getPoint(points, defA as ObjectId) : null) ?? (firstId ? getPoint(points, firstId as ObjectId) : null);
  const b = (defB ? getPoint(points, defB as ObjectId) : null) ?? (lastId ? getPoint(points, lastId as ObjectId) : null);
  if (!a || !b) return null;
  const dirVec = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(dirVec.x, dirVec.y) || 1;
  const dir = { x: dirVec.x / len, y: dirVec.y / len };
  const base = a;

  const projections: { id: string; proj: number }[] = [];
  const addId = (id: ObjectId) => {
    if (id === undefined || id === null) return;
    const key = String(id);
    if (projections.some((p) => p.id === key)) return;
    const p = getPoint(points, id);
    if (!p) return;
    projections.push({ id: key, proj: (p.x - base.x) * dir.x + (p.y - base.y) * dir.y });
  };

  line.points.forEach((pid) => addId(pid as ObjectId));
  if (includeExtra) {
    forEachPoint(points, (id, p) => {
      if (includeExtra(id, p)) addId(id);
    });
  }
  if (!projections.length) return null;

  const skip = new Set(line.defining_points ?? []);
  return projections
    .filter((p) => !skip.has(p.id))
    .map(({ id, proj }) => ({
      id,
      pos: { x: base.x + dir.x * proj, y: base.y + dir.y * proj }
    }));
}
