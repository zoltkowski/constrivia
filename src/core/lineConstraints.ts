import type { ConstructionRuntime, ObjectId, Point } from './runtimeTypes';
import { recomputeLinePointsWithReferences } from './lineProjection';

export type LineConstraintDeps = {
  runtime: ConstructionRuntime;
  getPointById: (id: ObjectId, runtime: ConstructionRuntime) => Point | null;
  enforceIntersections: (lineId: ObjectId) => void;
  updateMidpointsForPoint: (id: ObjectId) => void;
  updateCirclesForPoint: (id: ObjectId) => void;
};

// Used by line constraint helpers to normalize direction vectors.
function normalizeVec(v: { x: number; y: number }) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

// Used by drag context capture to store line-relative point positions.
export function calculateLineFractions(lineRef: ObjectId | number, deps: LineConstraintDeps): number[] {
  const { runtime, getPointById } = deps;
  const line = (runtime.lines as any)[lineRef as any] ?? runtime.lines[String(lineRef)];
  if (!line || line.points.length < 2) return [];
  const def0 = line.defining_points?.[0] ?? line.points[0];
  const def1 = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  const origin = getPointById(def0, runtime);
  const end = getPointById(def1, runtime);
  if (!origin || !end) return [];
  const dir = normalizeVec({ x: end.x - origin.x, y: end.y - origin.y });
  const len = Math.hypot(end.x - origin.x, end.y - origin.y);
  if (len === 0) return [];
  return line.points.map((pid) => {
    const p = getPointById(pid, runtime);
    if (!p) return 0;
    return ((p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y) / len;
  });
}

// Used by polygon/line dragging to restore on-line point positions after moves.
export function applyFractionsToLine(lineRef: ObjectId | number, fractions: number[], deps: LineConstraintDeps) {
  const { runtime, getPointById, enforceIntersections, updateMidpointsForPoint, updateCirclesForPoint } = deps;
  const line = (runtime.lines as any)[lineRef as any] ?? runtime.lines[String(lineRef)];
  if (!line || line.points.length < 2) return;
  const def0 = line.defining_points?.[0] ?? line.points[0];
  const def1 = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  const origin = getPointById(def0, runtime);
  const end = getPointById(def1, runtime);
  if (!origin || !end) return;
  const dir = normalizeVec({ x: end.x - origin.x, y: end.y - origin.y });
  const len = Math.hypot(end.x - origin.x, end.y - origin.y);
  if (len === 0) return;

  const changed = new Set<ObjectId>();
  fractions.forEach((t, idx) => {
    if (idx >= line.points.length) return;
    const pId = line.points[idx];

    // Don't reposition defining_points - they define the line!
    if (line.defining_points?.includes(pId)) return;

    const pos = { x: origin.x + dir.x * t * len, y: origin.y + dir.y * t * len };
    const current = runtime.points[String(pId)];
    if (!current) return;
    runtime.points[String(pId)] = { ...current, ...pos };
    changed.add(pId);
  });
  enforceIntersections(line?.id ?? (lineRef as any));
  changed.forEach((id) => {
    updateMidpointsForPoint(id);
    updateCirclesForPoint(id);
  });
}

// Used when line endpoints move to keep dependent on-line points aligned.
export function applyLineFractions(lineRef: ObjectId | number, deps: LineConstraintDeps) {
  const { runtime, getPointById, enforceIntersections, updateMidpointsForPoint, updateCirclesForPoint } = deps;
  const line = (runtime.lines as any)[lineRef as any] ?? runtime.lines[String(lineRef)];
  if (!line) return null;
  const pointById = new Map<string, Point>();
  Object.values(runtime.points).forEach((p) => {
    if (p?.id) pointById.set(String(p.id), p);
  });
  const pointIds = line.points.slice();
  const definingPoints = line.defining_points ?? [line.points[0], line.points[line.points.length - 1]];
  const updates = recomputeLinePointsWithReferences(
    pointById,
    { points: pointIds, defining_points: definingPoints },
    (_id, p) => (p?.parent_refs ?? []).some((ref) => ref.kind === 'line' && ref.id === line.id)
  );
  if (updates && updates.length) {
    const changed = new Set<ObjectId>();
    updates.forEach(({ id, pos }) => {
      if (definingPoints.includes(id)) return;
      const cur = runtime.points[String(id)];
      if (!cur) return;
      runtime.points[String(id)] = { ...cur, ...pos };
      changed.add(id);
    });
    enforceIntersections(line?.id ?? (lineRef as any));
    changed.forEach((id) => {
      updateMidpointsForPoint(id);
      updateCirclesForPoint(id);
    });
  }

  const a = getPointById(line.points[0], runtime);
  const b = getPointById(line.points[line.points.length - 1 ? line.points.length - 1 : 0], runtime);
  if (!a || !b) return null;
  const dirVec = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(dirVec.x, dirVec.y) || 1;
  const dir = { x: dirVec.x / len, y: dirVec.y / len };
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const half = Math.hypot(b.x - center.x, b.y - center.y);
  return { center, dir, startPoint: a, endPoint: b, order: [], half };
}
