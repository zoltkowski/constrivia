import { recomputeLinePointsWithReferences } from './lineProjection';

type LineConstraintDeps = {
  model: any;
  getPointByRef: (ref: any, model: any) => any | null;
  resolvePointIndexOrId: (ref: any, model: any) => { index?: number; id?: string };
  enforceIntersections: (lineIdx: number) => void;
  updateMidpointsForPoint: (idx: number) => void;
  updateCirclesForPoint: (idx: number) => void;
};

// Used by line constraint helpers to normalize direction vectors.
function normalizeVec(v: { x: number; y: number }) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

// Used by drag context capture to store line-relative point positions.
export function calculateLineFractions(lineIdx: number, deps: LineConstraintDeps): number[] {
  const { model, getPointByRef } = deps;
  const line = model.lines[lineIdx];
  if (!line || line.points.length < 2) return [];
  const def0 = line.defining_points?.[0] ?? line.points[0];
  const def1 = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  const origin = getPointByRef(def0, model);
  const end = getPointByRef(def1, model);
  if (!origin || !end) return [];
  const dir = normalizeVec({ x: end.x - origin.x, y: end.y - origin.y });
  const len = Math.hypot(end.x - origin.x, end.y - origin.y);
  if (len === 0) return [];
  return line.points.map((idx: number) => {
    const p = getPointByRef(idx, model);
    if (!p) return 0;
    return ((p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y) / len;
  });
}

// Used by polygon/line dragging to restore on-line point positions after moves.
export function applyFractionsToLine(lineIdx: number, fractions: number[], deps: LineConstraintDeps) {
  const { model, getPointByRef, resolvePointIndexOrId, enforceIntersections, updateMidpointsForPoint, updateCirclesForPoint } = deps;
  const line = model.lines[lineIdx];
  if (!line || line.points.length < 2) return;
  const def0 = line.defining_points?.[0] ?? line.points[0];
  const def1 = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  const origin = getPointByRef(def0, model);
  const end = getPointByRef(def1, model);
  if (!origin || !end) return;
  const dir = normalizeVec({ x: end.x - origin.x, y: end.y - origin.y });
  const len = Math.hypot(end.x - origin.x, end.y - origin.y);
  if (len === 0) return;

  const changed = new Set<number>();
  fractions.forEach((t, idx) => {
    if (idx >= line.points.length) return;
    const pIdx = line.points[idx];

    // Don't reposition defining_points - they define the line!
    if (line.defining_points?.includes(pIdx)) return;

    const pos = { x: origin.x + dir.x * t * len, y: origin.y + dir.y * t * len };
    const rp = resolvePointIndexOrId(pIdx, model);
    if (typeof rp.index === 'number') {
      model.points[rp.index] = { ...model.points[rp.index], ...pos };
      changed.add(rp.index);
    }
    changed.add(pIdx);
  });
  enforceIntersections(lineIdx);
  changed.forEach((idx) => {
    updateMidpointsForPoint(idx);
    updateCirclesForPoint(idx);
  });
}

// Used when line endpoints move to keep dependent on-line points aligned.
export function applyLineFractions(lineIdx: number, deps: LineConstraintDeps) {
  const { model, getPointByRef, resolvePointIndexOrId, enforceIntersections, updateMidpointsForPoint, updateCirclesForPoint } = deps;
  const line = model.lines[lineIdx];
  if (!line) return null;
  const pointById = new Map<string, any>();
  model.points.forEach((p: any) => {
    if (!p) return;
    pointById.set(String(p.id), { id: p.id, x: p.x, y: p.y, parent_refs: p.parent_refs ?? [] });
  });
  const idFromRef = (ref: any): string | undefined => {
    const resolved = resolvePointIndexOrId(ref, model);
    if (resolved.id !== undefined && resolved.id !== null) return String(resolved.id);
    if (typeof resolved.index === 'number') {
      const p = model.points[resolved.index];
      if (p) return String(p.id);
    }
    if (typeof ref === 'string') return ref;
    if (typeof ref === 'number') {
      const p = model.points[ref];
      return p ? String(p.id) : String(ref);
    }
    return undefined;
  };
  const pointIds = line.points.map((pid: number) => idFromRef(pid)).filter((id: string | undefined): id is string => !!id);
  const definingPoints = (line.defining_points ?? []).map((pid: number) => idFromRef(pid)).filter((id: string | undefined): id is string => !!id);
  const updates = recomputeLinePointsWithReferences(
    pointById,
    { pointIds, definingPoints },
    (_id, p) => (p?.parent_refs ?? []).some((ref: any) => ref.kind === 'line' && ref.id === line.id)
  );
  if (updates && updates.length) {
    const changed = new Set<number>();
    updates.forEach(({ id, pos }) => {
      const idx = model.indexById?.point?.[id];
      if (typeof idx !== 'number') return;
      const cur = model.points[idx];
      if (!cur) return;
      model.points[idx] = { ...cur, ...pos };
      changed.add(idx);
    });
    enforceIntersections(lineIdx);
    changed.forEach((idx) => {
      updateMidpointsForPoint(idx);
      updateCirclesForPoint(idx);
    });
  }

  const a = getPointByRef(line.points[0], model);
  const b = getPointByRef(line.points[line.points.length - 1 ? line.points.length - 1 : 0], model);
  if (!a || !b) return null;
  const dirVec = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(dirVec.x, dirVec.y) || 1;
  const dir = { x: dirVec.x / len, y: dirVec.y / len };
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const half = Math.hypot(b.x - center.x, b.y - center.y);
  return { center, dir, startPoint: a, endPoint: b, order: [], half };
}
