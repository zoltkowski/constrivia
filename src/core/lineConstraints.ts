import type { Model, ObjectId, Point } from './runtimeTypes';
import { recomputeLinePointsWithReferences } from './lineProjection';

type LineConstraintDeps = {
  model: Model;
  getPointById: (id: ObjectId, model: Model) => Point | null;
  enforceIntersections: (lineIdx: number) => void;
  updateMidpointsForPoint: (id: ObjectId) => void;
  updateCirclesForPoint: (id: ObjectId) => void;
};

// Used by line constraint helpers to normalize direction vectors.
function normalizeVec(v: { x: number; y: number }) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

// Used by drag context capture to store line-relative point positions.
export function calculateLineFractions(lineIdx: number, deps: LineConstraintDeps): number[] {
  const { model, getPointById } = deps;
  const line = model.lines[lineIdx];
  if (!line || line.points.length < 2) return [];
  const def0 = line.defining_points?.[0] ?? line.points[0];
  const def1 = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  const origin = getPointById(def0, model);
  const end = getPointById(def1, model);
  if (!origin || !end) return [];
  const dir = normalizeVec({ x: end.x - origin.x, y: end.y - origin.y });
  const len = Math.hypot(end.x - origin.x, end.y - origin.y);
  if (len === 0) return [];
  return line.points.map((pid) => {
    const p = getPointById(pid, model);
    if (!p) return 0;
    return ((p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y) / len;
  });
}

// Used by polygon/line dragging to restore on-line point positions after moves.
export function applyFractionsToLine(lineIdx: number, fractions: number[], deps: LineConstraintDeps) {
  const { model, getPointById, enforceIntersections, updateMidpointsForPoint, updateCirclesForPoint } = deps;
  const line = model.lines[lineIdx];
  if (!line || line.points.length < 2) return;
  const def0 = line.defining_points?.[0] ?? line.points[0];
  const def1 = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  const origin = getPointById(def0, model);
  const end = getPointById(def1, model);
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
    const idxById = model.indexById?.point?.[String(pId)];
    if (typeof idxById === 'number') {
      model.points[idxById] = { ...model.points[idxById], ...pos };
      changed.add(pId);
    }
  });
  enforceIntersections(lineIdx);
  changed.forEach((id) => {
    updateMidpointsForPoint(id);
    updateCirclesForPoint(id);
  });
}

// Used when line endpoints move to keep dependent on-line points aligned.
export function applyLineFractions(lineIdx: number, deps: LineConstraintDeps) {
  const { model, getPointById, enforceIntersections, updateMidpointsForPoint, updateCirclesForPoint } = deps;
  const line = model.lines[lineIdx];
  if (!line) return null;
  const pointById = new Map<string, Point>();
  model.points.forEach((p) => {
    if (!p || !p.id) return;
    pointById.set(String(p.id), p);
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
      const idxById = model.indexById?.point?.[id];
      if (typeof idxById !== 'number') return;
      const cur = model.points[idxById];
      if (!cur) return;
      model.points[idxById] = { ...cur, ...pos };
      changed.add(id);
    });
    enforceIntersections(lineIdx);
    changed.forEach((id) => {
      updateMidpointsForPoint(id);
      updateCirclesForPoint(id);
    });
  }

  const a = getPointById(line.points[0], model);
  const b = getPointById(line.points[line.points.length - 1 ? line.points.length - 1 : 0], model);
  if (!a || !b) return null;
  const dirVec = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(dirVec.x, dirVec.y) || 1;
  const dir = { x: dirVec.x / len, y: dirVec.y / len };
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const half = Math.hypot(b.x - center.x, b.y - center.y);
  return { center, dir, startPoint: a, endPoint: b, order: [], half };
}
