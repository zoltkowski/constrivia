import type { Model as ModelClass } from '../model';
import type { Point, Line } from '../types';
import type { Circle } from '../types';
import type { ConstructionRuntime, PointRuntime, LineRuntime } from './runtimeTypes';
import { mapToArray, ObjectId } from '../maps';

// Engine is the place for geometric computations.
// Start with a minimal skeleton and export small pure helpers which
// later will replace computations scattered across `main.ts`.

export type EngineModel = ModelClass;

export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function centroid(points: Point[]): { x: number; y: number } | null {
  if (!points || points.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalize(v: { x: number; y: number }) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

export function normalizeAngle(a: number) {
  const two = Math.PI * 2;
  const res = (a % two + two) % two;
  return res;
}

export function axisSnapWeight(closeness: number) {
  const t = clamp(closeness, 0, 1);
  return t * t * (3 - 2 * t);
}

export function projectPointOnLine(source: { x: number; y: number }, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denom = dx * dx + dy * dy || 1;
  const t = ((source.x - a.x) * dx + (source.y - a.y) * dy) / denom;
  return { x: a.x + dx * t, y: a.y + dy * t };
}

export function projectPointOnSegment(source: { x: number; y: number }, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denom = dx * dx + dy * dy || 1;
  let t = ((source.x - a.x) * dx + (source.y - a.y) * dy) / denom;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

export function intersectLines(a: Point, b: Point, c: Point, d: Point): { x: number; y: number } | null {
  const A1 = b.y - a.y;
  const B1 = a.x - b.x;
  const C1 = A1 * a.x + B1 * a.y;

  const A2 = d.y - c.y;
  const B2 = c.x - d.x;
  const C2 = A2 * c.x + B2 * c.y;

  const det = A1 * B2 - A2 * B1;
  if (Math.abs(det) < 1e-9) return null;
  const x = (B2 * C1 - B1 * C2) / det;
  const y = (A1 * C2 - A2 * C1) / det;
  return { x, y };
}

export function lineCircleIntersections(
  a: { x: number; y: number },
  b: { x: number; y: number },
  center: { x: number; y: number },
  radius: number,
  clampToSegment = true
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - center.x;
  const fy = a.y - center.y;
  const aCoeff = dx * dx + dy * dy;
  const bCoeff = 2 * (fx * dx + fy * dy);
  const cCoeff = fx * fx + fy * fy - radius * radius;
  const disc = bCoeff * bCoeff - 4 * aCoeff * cCoeff;
  if (disc < 0) return [] as { x: number; y: number }[];
  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-bCoeff - sqrtDisc) / (2 * aCoeff);
  const t2 = (-bCoeff + sqrtDisc) / (2 * aCoeff);
  const res: { x: number; y: number }[] = [];
  [t1, t2].forEach((t) => {
    if (!Number.isFinite(t)) return;
    if (clampToSegment && (t < 0 || t > 1)) return;
    res.push({ x: a.x + dx * t, y: a.y + dy * t });
  });
  return res;
}
  export function circleCircleIntersections(c1: { x: number; y: number }, r1: number, c2: { x: number; y: number }, r2: number) {
  const d = Math.hypot(c2.x - c1.x, c2.y - c1.y);
  if (d === 0 || d > r1 + r2 || d < Math.abs(r1 - r2)) return [] as { x: number; y: number }[];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(r1 * r1 - a * a, 0));
  const xm = c1.x + (a * (c2.x - c1.x)) / d;
  const ym = c1.y + (a * (c2.y - c1.y)) / d;
  const rx = -(c2.y - c1.y) * (h / d);
  const ry = (c2.x - c1.x) * (h / d);
  return [
    { x: xm + rx, y: ym + ry },
    { x: xm - rx, y: ym - ry }
  ];
}

// --- Runtime-aware wrappers ---
function runtimePoint(rt: ConstructionRuntime, id: string) {
  const p = rt.points[id];
  if (!p) return null;
  return { id: p.id, x: p.x, y: p.y } as Point;
}

export function projectPointOnLineRuntime(source: { x: number; y: number }, aId: string, bId: string, rt: ConstructionRuntime) {
  const a = runtimePoint(rt, aId);
  const b = runtimePoint(rt, bId);
  if (!a || !b) return source;
  return projectPointOnLine(source, a as Point, b as Point);
}

export function projectPointOnSegmentRuntime(source: { x: number; y: number }, aId: string, bId: string, rt: ConstructionRuntime) {
  const a = runtimePoint(rt, aId);
  const b = runtimePoint(rt, bId);
  if (!a || !b) return source;
  return projectPointOnSegment(source, a as Point, b as Point);
}

export function lineCircleIntersectionsRuntime(aId: string, bId: string, centerId: string, radius: number, rt: ConstructionRuntime, clampToSegment = true) {
  const a = runtimePoint(rt, aId);
  const b = runtimePoint(rt, bId);
  const center = runtimePoint(rt, centerId);
  if (!a || !b || !center) return [] as { x: number; y: number }[];
  return lineCircleIntersections(a as Point, b as Point, center as { x: number; y: number }, radius, clampToSegment);
}

export function circleCircleIntersectionsRuntime(c1Id: string, r1: number, c2Id: string, r2: number, rt: ConstructionRuntime) {
  const c1 = runtimePoint(rt, c1Id);
  const c2 = runtimePoint(rt, c2Id);
  if (!c1 || !c2) return [] as { x: number; y: number }[];
  return circleCircleIntersections({ x: c1.x, y: c1.y }, r1, { x: c2.x, y: c2.y }, r2);
}

// --- Additional runtime helpers ---
export function segmentKeyForPointsRuntime(aId: string, bId: string) {
  return aId < bId ? `${aId}-${bId}` : `${bId}-${aId}`;
}

// Adapter: create a segment key from two point ids (model/runtime agnostic)
export function segmentKeyForIds(aId: string, bId: string): string {
  return aId < bId ? `${aId}-${bId}` : `${bId}-${aId}`;
}

export function findLineIdForSegmentRuntime(aId: string, bId: string, rt: ConstructionRuntime): string | null {
  for (const l of Object.values(rt.lines)) {
    const pts = l.pointIds || [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if ((a === aId && b === bId) || (a === bId && b === aId)) return l.id;
    }
  }
  return null;
}

// Adapter that works on the legacy Model (arrays + indexById) and returns a line index
// Adapter that works on legacy array-based model data (points[], lines[])
export function findLineIndexForSegmentFromArrays(points: Point[], lines: Line[], aId: string, bId: string): number | null {
  const aIdx = points.findIndex((p) => !!p && p.id === aId);
  const bIdx = points.findIndex((p) => !!p && p.id === bId);
  if (aIdx < 0 || bIdx < 0) return null;
  return findLineIndexForSegmentPure(points, lines, aIdx, bIdx);
}

// Adapter: get polygon vertex ids from a legacy array-based model polygon entry
export function polygonVertexIdsFromArrays(polygons: { points: number[] }[], points: Point[], polygonIdx: number): string[] | null {
  const poly = polygons[polygonIdx];
  if (!poly) return null;
  return poly.points.map((ptIdx) => points[ptIdx]?.id).filter((id): id is string => !!id);
}

export function reorderLinePointIdsRuntime(lineId: string, rt: ConstructionRuntime): string[] | null {
  const line = rt.lines[lineId];
  if (!line || !line.pointIds || line.pointIds.length === 0) return null;
  const def0 = line.definingPoints?.[0] ?? line.pointIds[0];
  const def1 = line.definingPoints?.[1] ?? line.pointIds[line.pointIds.length - 1];
  const a = runtimePoint(rt, def0);
  const b = runtimePoint(rt, def1);
  if (!a || !b) return line.pointIds.slice();
  const dir = normalize({ x: b.x - a.x, y: b.y - a.y });
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const unique = Array.from(new Set(line.pointIds));
  unique.sort((p1, p2) => {
    const pt1 = runtimePoint(rt, p1);
    const pt2 = runtimePoint(rt, p2);
    if (!pt1 || !pt2) return 0;
    const t1 = ((pt1.x - a.x) * dir.x + (pt1.y - a.y) * dir.y) / len;
    const t2 = ((pt2.x - a.x) * dir.x + (pt2.y - a.y) * dir.y) / len;
    return t1 - t2;
  });
  return unique;
}

export function polygonVerticesFromPolyRuntime(poly: any, rt: ConstructionRuntime): string[] {
  if (!poly) return [];
  if (poly.vertices && Array.isArray(poly.vertices) && poly.vertices.length) return Array.from(new Set(poly.vertices as string[]));
  const pts = new Set<string>();
  (poly.edgeLines || []).forEach((li: string) => {
    const line = rt.lines[li];
    if (!line) return;
    (line.pointIds || []).forEach((p) => pts.add(p));
  });
  return Array.from(pts);
}

export function polygonVerticesOrderedFromPolyRuntime(poly: any, rt: ConstructionRuntime): string[] {
  if (!poly) return [];
  if (poly.vertices && Array.isArray(poly.vertices) && poly.vertices.length) return Array.from(new Set(poly.vertices as string[]));
  const lineArr = poly.edgeLines ?? [];
  const verts: string[] = [];
  for (const li of lineArr) {
    const line = rt.lines[li];
    if (!line || !line.pointIds || line.pointIds.length < 2) continue;
    const s = line.pointIds[0];
    const e = line.pointIds[line.pointIds.length - 1];
    if (verts.length === 0) {
      verts.push(s, e);
    } else {
      const last = verts[verts.length - 1];
      if (s === last) verts.push(e);
      else if (e === last) verts.push(s);
      else {
        const first = verts[0];
        if (e === first) verts.unshift(s);
        else if (s === first) verts.unshift(e);
      }
    }
  }
  const ordered: string[] = [];
  for (let i = 0; i < verts.length; i++) if (i === 0 || verts[i] !== verts[i - 1]) ordered.push(verts[i]);
  return ordered;
}

export function lineExtentRuntime(lineId: string, rt: ConstructionRuntime) {
  const line = rt.lines[lineId];
  if (!line) return null;
  if ((line.pointIds || []).length < 2) return null;
  const aId = line.pointIds[0];
  const bId = line.pointIds[line.pointIds.length - 1];
  const a = runtimePoint(rt, aId);
  const b = runtimePoint(rt, bId);
  if (!a || !b) return null;
  const dirVec = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(dirVec.x, dirVec.y) || 1;
  const dir = { x: dirVec.x / len, y: dirVec.y / len };
  const base = a;
  const projections: { id: string; proj: number }[] = [];
  (line.pointIds || []).forEach((pid) => {
    if (!projections.some((p) => p.id === pid)) {
      const p = runtimePoint(rt, pid);
      if (p) projections.push({ id: pid, proj: (p.x - base.x) * dir.x + (p.y - base.y) * dir.y });
    }
  });
  if (!projections.length) return null;
  const sorted = projections.sort((p1, p2) => p1.proj - p2.proj);
  const startProj = sorted[0];
  const endProj = sorted[sorted.length - 1];
  const centerProj = (startProj.proj + endProj.proj) / 2;
  const center = { x: base.x + dir.x * centerProj, y: base.y + dir.y * centerProj };
  const startPoint = runtimePoint(rt, startProj.id);
  const endPoint = runtimePoint(rt, endProj.id);
  const half = Math.abs(endProj.proj - centerProj);
  return { center, centerProj, dir, startPoint, endPoint, order: sorted, half };
}



export function reflectPointAcrossLinePointPair(source: { x: number; y: number }, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) return null;
  const t = ((source.x - a.x) * dx + (source.y - a.y) * dy) / lenSq;
  const proj = { x: a.x + dx * t, y: a.y + dy * t };
  return { x: 2 * proj.x - source.x, y: 2 * proj.y - source.y };
}

export function lineLength(lines: Line[], lineIdx: number, points: Point[]): number | null {
  const line = lines[lineIdx];
  if (!line || line.points.length < 2) return null;
  const a = points[line.points[0]];
  const b = points[line.points[line.points.length - 1]];
  if (!a || !b) return null;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function primaryLineDirection(line: Line, points: Point[]): { dir: { x: number; y: number }; length: number } | null {
  if (!line || line.points.length < 2) return null;
  const a = points[line.defining_points?.[0] ?? line.points[0]];
  const b = points[line.defining_points?.[1] ?? line.points[line.points.length - 1]];
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-9) return null;
  return { dir: { x: dx / len, y: dy / len }, length: len };
}

// Apply fractions along a line: returns positions map and touched list (pure)
export function applyLineFractionsEngine(
  points: Point[],
  lines: Line[],
  lineIdx: number,
  fractions: number[]
): { positions: Map<number, { x: number; y: number }>; touched: number[] } | null {
  const line = lines[lineIdx];
  if (!line || line.points.length < 2) return null;
  const def0 = line.defining_points?.[0] ?? line.points[0];
  const def1 = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  const origin = points[def0];
  const end = points[def1];
  if (!origin || !end) return null;
  const dir = normalize({ x: end.x - origin.x, y: end.y - origin.y });
  const len = Math.hypot(end.x - origin.x, end.y - origin.y);
  if (len === 0) return null;

  let usedFractions = fractions;
  if (usedFractions.length !== line.points.length) {
    const oldOrigin = points[def0];
    const oldEnd = points[def1];
    if (!oldOrigin || !oldEnd) return null;
    const oldDir = normalize({ x: oldEnd.x - oldOrigin.x, y: oldEnd.y - oldOrigin.y });
    const oldLen = Math.hypot(oldEnd.x - oldOrigin.x, oldEnd.y - oldOrigin.y);
    if (oldLen === 0) return null;
    usedFractions = line.points.map((idx) => {
      const p = points[idx];
      if (!p) return 0;
      const t = ((p.x - oldOrigin.x) * oldDir.x + (p.y - oldOrigin.y) * oldDir.y) / oldLen;
      return t;
    });
  }

  const positions = new Map<number, { x: number; y: number }>();
  const touched: number[] = [];
  usedFractions.forEach((t, idx) => {
    const pIdx = line.points[idx];
    if (idx === 0 || idx === line.points.length - 1) return;
    if (line.defining_points.includes(pIdx)) return;
    const pos = { x: origin.x + dir.x * t * len, y: origin.y + dir.y * t * len };
    const current = points[pIdx];
    if (!current) return;
    if (Math.abs(current.x - pos.x) > 1e-9 || Math.abs(current.y - pos.y) > 1e-9) {
      positions.set(pIdx, pos);
      touched.push(pIdx);
    }
  });
  return { positions, touched };
}

export type RecomputePerpHelpers = {
  pointIndexById: (id: string) => number | null;
  lineIndexById: (id: string) => number | null;
  primaryLineDirection: (line: Line, pts: Point[]) => { dir: { x: number; y: number }; length: number } | null;
  constrainToCircles: (idx: number, target: { x: number; y: number }) => { x: number; y: number };
  lineLength: (lineIdx: number) => number | null;
  selectedPointIndex?: number | null;
  draggingSelection?: boolean;
};

export function recomputePerpendicularLineEngine(
  points: Point[],
  lines: Line[],
  lineIdx: number,
  helpers: RecomputePerpHelpers
): ParallelRecomputeResult | null {
  const line = lines[lineIdx];
  if (!line || !(line as any).perpendicular) return null;
  const throughIdx = helpers.pointIndexById((line as any).perpendicular.throughPoint);
  const helperIdx = helpers.pointIndexById((line as any).perpendicular.helperPoint);
  const baseIdx = helpers.lineIndexById((line as any).perpendicular.referenceLine);
  if (throughIdx === null || helperIdx === null || baseIdx === null) return null;
  const anchor = points[throughIdx];
  const helper = points[helperIdx];
  const baseLine = lines[baseIdx];
  if (!anchor || !helper || !baseLine) return null;
  const dirInfo = helpers.primaryLineDirection(baseLine, points);
  if (!dirInfo) return null;

  const baseNormal = { x: -dirInfo.dir.y, y: dirInfo.dir.x };
  const helperMode = (line as any).perpendicular.helperMode ?? 'normal';
  let computedHelperDistance = (line as any).perpendicular.helperDistance;
  const selectedPointIndex = helpers.selectedPointIndex ?? null;
  const draggingSelection = helpers.draggingSelection ?? false;

  // compute helper projection
  const helperVecRaw = { x: helper.x - anchor.x, y: helper.y - anchor.y };
  const baseProjection = helperVecRaw.x * baseNormal.x + helperVecRaw.y * baseNormal.y;
  let orientation: 1 | -1 = (line as any).perpendicular.helperOrientation ?? (baseProjection >= 0 ? 1 : -1);
  if (selectedPointIndex === helperIdx && draggingSelection) orientation = baseProjection >= 0 ? 1 : -1;
  if (helperMode === 'projection') orientation = baseProjection >= 0 ? 1 : -1;
  (line as any).perpendicular.helperOrientation = orientation;
  const direction = orientation === 1 ? baseNormal : { x: -baseNormal.x, y: -baseNormal.y };

  const distances = new Map<number, number>();
  line.points.forEach((idx) => {
    const pt = points[idx];
    if (!pt) return;
    const vec = { x: pt.x - anchor.x, y: pt.y - anchor.y };
    const dist = vec.x * direction.x + vec.y * direction.y;
    distances.set(idx, dist);
  });
  const helperProjection = helperVecRaw.x * direction.x + helperVecRaw.y * direction.y;
  let helperDistance = (line as any).perpendicular.helperDistance;
  if (helperMode === 'projection') {
    const inferred = Math.abs(helperProjection);
    helperDistance = inferred;
    (line as any).perpendicular.helperDistance = helperDistance;
  } else if (selectedPointIndex === helperIdx && draggingSelection) {
    let updatedDistance = Math.abs(helperProjection);
    if (!Number.isFinite(updatedDistance) || updatedDistance < 1e-3) {
      const fallback = Math.abs(helperProjection);
      if (Number.isFinite(fallback) && fallback > 1e-3) {
        updatedDistance = fallback;
      } else {
        const baseLen = helpers.lineLength(baseIdx) ?? dirInfo.length;
        updatedDistance = baseLen > 1e-3 ? baseLen : 120;
      }
    }
    helperDistance = updatedDistance;
    (line as any).perpendicular.helperDistance = helperDistance;
  } else if (helperDistance === undefined || helperDistance < 1e-3) {
    let inferred = Math.abs(helperProjection);
    if (!Number.isFinite(inferred) || inferred < 1e-3) {
      const baseLen = helpers.lineLength(baseIdx) ?? dirInfo.length;
      inferred = baseLen > 1e-3 ? baseLen : 120;
    }
    helperDistance = inferred;
    (line as any).perpendicular.helperDistance = helperDistance;
  }
  helperDistance = (line as any).perpendicular.helperDistance ?? helperDistance ?? 0;
  if (!Number.isFinite(helperDistance) || helperDistance < 1e-3) {
    const baseLen = helpers.lineLength(baseIdx) ?? dirInfo.length;
    helperDistance = baseLen > 1e-3 ? baseLen : 120;
  }
  (line as any).perpendicular.helperDistance = helperDistance;
  distances.set(helperIdx, helperDistance);

  const positions = new Map<number, { x: number; y: number }>();
  const touched: number[] = [];
  distances.forEach((dist, idx) => {
    if (idx === throughIdx) return;
    const target = { x: anchor.x + direction.x * dist, y: anchor.y + direction.y * dist };
    const current = points[idx];
    if (!current) return;
    const constrained = helpers.constrainToCircles(idx, target);
    if (Math.abs(current.x - constrained.x) > 1e-6 || Math.abs(current.y - constrained.y) > 1e-6) {
      positions.set(idx, constrained);
      touched.push(idx);
    }
  });

  const ensureDefining = { defining_points: [throughIdx, helperIdx] as [number, number], insertThrough: !line.points.includes(throughIdx), insertHelper: !line.points.includes(helperIdx) };
  return { positions, ensureDefining, touched };
}

export class Engine {
  model: EngineModel | null = null;

  constructor(model?: EngineModel) {
    if (model) this.model = model;
  }

  attachModel(model: EngineModel) {
    this.model = model;
  }

  // placeholder: compute something for a point id
  computePointPositionById(id: string): Point | null {
    if (!this.model) return null;
    const p = this.model.points.get(id);
    return p ?? null;
  }
}

// Line type imported above from ../types

export function findLinesContainingPoint(points: Point[], lines: Line[], idx: number): number[] {
  const res: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].points.includes(idx)) res.push(i);
  }
  return res;
}

// Return a sorted unique points array for a line based on defining points direction
export function reorderLinePointsPure(line: Line, points: Point[]): number[] | null {
  if (!line || !line.points || line.points.length === 0) return null;
  const aIdx = line.defining_points?.[0] ?? line.points[0];
  const bIdx = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  const a = points[aIdx];
  const b = points[bIdx];
  if (!a || !b) return null;
  const dir = normalize({ x: b.x - a.x, y: b.y - a.y });
  const unique = Array.from(new Set(line.points));
  unique.sort((p1, p2) => {
    const pt1 = points[p1];
    const pt2 = points[p2];
    if (!pt1 || !pt2) return 0;
    const t1 = (pt1.x - a.x) * dir.x + (pt1.y - a.y) * dir.y;
    const t2 = (pt2.x - a.x) * dir.x + (pt2.y - a.y) * dir.y;
    return t1 - t2;
  });
  return unique;
}

export function updateParallelLinesForLine(
  lines: Line[],
  lineIdx: number,
  recomputeParallelLine: (idx: number) => void
) {
  const line = lines[lineIdx];
  if (!line) return;
  const lineId = line.id;
  lines.forEach((other, idx) => {
    if (idx === lineIdx) return;
    // isParallelLine check is not available here; caller may validate or recomputeParallelLine can no-op
    if ((other as any).parallel && (other as any).parallel.referenceLine === lineId) {
      recomputeParallelLine(idx);
    }
  });
}

export function updatePerpendicularLinesForPoint(
  points: Point[],
  lines: Line[],
  pointIdx: number,
  recomputePerpendicularLine: (idx: number) => void
) {
  const point = points[pointIdx];
  if (!point) return;
  const pid = point.id;
  lines.forEach((line, li) => {
    if (!line || !(line as any).perpendicular) return;
    if ((line as any).perpendicular.throughPoint === pid || (line as any).perpendicular.helperPoint === pid) {
      recomputePerpendicularLine(li);
    }
  });
}

export function updatePerpendicularLinesForLine(
  lines: Line[],
  lineIdx: number,
  recomputePerpendicularLine: (idx: number) => void
) {
  const line = lines[lineIdx];
  if (!line) return;
  const lineId = line.id;
  lines.forEach((other, idx) => {
    if (idx === lineIdx) return;
    if ((other as any).perpendicular && (other as any).perpendicular.referenceLine === lineId) {
      recomputePerpendicularLine(idx);
    }
  });
}

export function updateIntersectionsForLine(
  points: Point[],
  lines: Line[],
  lineIdx: number,
  recomputeIntersectionPoint: (pi: number) => void,
  updateSymmetricPointsForLine: (li: number) => void
) {
  const line = lines[lineIdx];
  if (!line) return;
  const lineId = line.id;
  points.forEach((pt, pi) => {
    if (!pt) return;
    if (pt.parent_refs.some((pr: any) => pr.kind === 'line' && pr.id === lineId)) {
      if (pt.construction_kind === 'intersection') {
        recomputeIntersectionPoint(pi);
      }
      // Don't constrain on_object points — caller handles applyLineFractions behaviour
    }
  });
  updateSymmetricPointsForLine(lineIdx);
}

// Enforce intersections for a line: compute updated positions for points that lie
// on both this line and others (intersections). Returns a Map of pointIdx->pos.
export function enforceIntersectionsEngine(
  points: Point[],
  lines: Line[],
  lineIdx: number,
  findLinesContainingPoint: (idx: number) => number[],
  intersectLines: (a1: Point, a2: Point, b1: Point, b2: Point) => { x: number; y: number } | null
): Map<number, { x: number; y: number }> {
  const res = new Map<number, { x: number; y: number }>();
  const line = lines[lineIdx];
  if (!line || line.points.length < 2) return res;
  const a = points[line.points[0]];
  const b = points[line.points[line.points.length - 1]];
  if (!a || !b) return res;
  line.points.forEach((pIdx) => {
    const otherLines = findLinesContainingPoint(pIdx).filter((li) => li !== lineIdx);
    if (!otherLines.length) return;
    otherLines.forEach((li) => {
      const other = lines[li];
      if (!other || other.points.length < 2) return;
      const oa = points[other.points[0]];
      const ob = points[other.points[other.points.length - 1]];
      if (!oa || !ob) return;
      const inter = intersectLines(a as Point, b as Point, oa as Point, ob as Point);
      if (inter) {
        res.set(pIdx, inter);
      }
    });
  });
  return res;
}

// --- Polygon / Angle pure helpers ---
export function polygonVerticesFromPoly(poly: any, points: Point[], lines: Line[]): number[] {
  if (!poly) return [];
  if (poly.vertices && Array.isArray(poly.vertices) && poly.vertices.length) return Array.from(new Set(poly.vertices as number[]));
  const pts = new Set<number>();
  (poly.lines || []).forEach((li: number) => {
    const line = lines[li];
    if (!line) return;
    (line.points || []).forEach((p) => pts.add(p));
  });
  return Array.from(pts);
}

export function polygonVerticesOrderedFromPoly(poly: any, points: Point[], lines: Line[]): number[] {
  if (!poly) return [];
  if (poly.vertices && Array.isArray(poly.vertices) && poly.vertices.length) return Array.from(new Set(poly.vertices as number[]));
  const lineArr = (poly.lines) ?? [];
  const verts: number[] = [];
  for (const li of lineArr) {
    const line = lines[li];
    if (!line || !line.points || line.points.length < 2) continue;
    const s = line.points[0];
    const e = line.points[line.points.length - 1];
    if (verts.length === 0) {
      verts.push(s, e);
    } else {
      const last = verts[verts.length - 1];
      if (s === last) verts.push(e);
      else if (e === last) verts.push(s);
      else {
        const first = verts[0];
        if (e === first) verts.unshift(s);
        else if (s === first) verts.unshift(e);
      }
    }
  }
  const ordered: number[] = [];
  for (let i = 0; i < verts.length; i++) if (i === 0 || verts[i] !== verts[i - 1]) ordered.push(verts[i]);
  return ordered;
}

export function findSegmentIndexPure(line: Line, p1: number, p2: number, points: Point[]): number {
  if (!line || !line.points || line.points.length < 2) return 0;
  for (let i = 0; i < line.points.length - 1; i++) {
    const a = line.points[i];
    const b = line.points[i + 1];
    if ((a === p1 && b === p2) || (a === p2 && b === p1)) return i;
  }
  const p2Pos = points[p2];
  if (!p2Pos) return 0;
  let bestSeg = 0;
  let bestDist = Infinity;
  for (let i = 0; i < line.points.length - 1; i++) {
    const a = line.points[i];
    const b = line.points[i + 1];
    if (a === p1 || b === p1) {
      const other = a === p1 ? b : a;
      const otherPos = points[other];
      if (!otherPos) continue;
      const dist = Math.hypot(otherPos.x - p2Pos.x, otherPos.y - p2Pos.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestSeg = i;
      }
    }
  }
  return bestSeg;
}

export function getVertexOnLegPure(leg: any, vertex: number, points: Point[], lines: Line[]): number {
  if (!leg) return -1;
  if (typeof leg.otherPoint === 'number') return leg.otherPoint;
  const lineIdx = typeof leg.line === 'number' ? leg.line : undefined;
  if (lineIdx === undefined || lineIdx < 0) return -1;
  const line = lines[lineIdx];
  if (!line || !line.points || line.points.length === 0) return -1;
  const vPos = points[vertex];
  if (!vPos) return line.points[0] ?? -1;
  let best = -1;
  let bestDist = Infinity;
  for (const pIdx of line.points) {
    if (pIdx === vertex) continue;
    const p = points[pIdx];
    if (!p) continue;
    const d = Math.hypot(p.x - vPos.x, p.y - vPos.y);
    if (d < bestDist) {
      bestDist = d;
      best = pIdx;
    }
  }
  return best === -1 ? (line.points[0] ?? -1) : best;
}

export function angleBaseGeometryPure(angle: any, points: Point[], lines: Line[]) {
  const l1idx = angle?.leg1?.line ?? angle?.arm1LineId;
  const l2idx = angle?.leg2?.line ?? angle?.arm2LineId;
  if (typeof l1idx !== 'number' || typeof l2idx !== 'number') return null;
  const l1 = lines[l1idx];
  const l2 = lines[l2idx];
  if (!l1 || !l2) return null;
  const v = points[angle.vertex];
  if (!v) return null;
  const p1idx = angle?.leg1?.otherPoint ?? angle?.point1 ?? getVertexOnLegPure({ line: l1idx }, angle.vertex, points, lines);
  const p2idx = angle?.leg2?.otherPoint ?? angle?.point2 ?? getVertexOnLegPure({ line: l2idx }, angle.vertex, points, lines);
  const p1 = typeof p1idx === 'number' ? points[p1idx] : null;
  const p2 = typeof p2idx === 'number' ? points[p2idx] : null;
  if (!p1 || !p2) return null;
  const ang1 = normalizeAngle(Math.atan2(p1.y - v.y, p1.x - v.x));
  const ang2 = normalizeAngle(Math.atan2(p2.y - v.y, p2.x - v.x));
  return { v, p1, p2, ang1, ang2 };
}

// --- Runtime variants for angle and leg helpers ---
export function getVertexOnLegRuntime(leg: any, vertexId: string, rt: ConstructionRuntime): string {
  if (!leg) return '';
  if (typeof leg.otherPoint === 'string') return leg.otherPoint;
  const lineId = typeof leg.line === 'string' ? leg.line : leg.line ?? undefined;
  if (!lineId) return '';
  const line = rt.lines[lineId];
  if (!line || !line.pointIds || line.pointIds.length === 0) return '';
  const vPos = runtimePoint(rt, vertexId);
  if (!vPos) return line.pointIds[0] ?? '';
  let best = '';
  let bestDist = Infinity;
  for (const pId of line.pointIds) {
    if (pId === vertexId) continue;
    const p = runtimePoint(rt, pId);
    if (!p) continue;
    const d = Math.hypot(p.x - vPos.x, p.y - vPos.y);
    if (d < bestDist) {
      bestDist = d;
      best = pId;
    }
  }
  return best || (line.pointIds[0] ?? '');
}

export function angleBaseGeometryRuntime(angle: any, rt: ConstructionRuntime) {
  // Prefer explicit point-based definition if present (runtime ids)
  const vId = angle.vertex;
  const v = runtimePoint(rt, vId);
  if (!v) return null;
  if (angle?.point1 && angle?.point2) {
    const p1 = runtimePoint(rt, angle.point1);
    const p2 = runtimePoint(rt, angle.point2);
    if (!p1 || !p2) return null;
    const ang1 = normalizeAngle(Math.atan2(p1.y - v.y, p1.x - v.x));
    const ang2 = normalizeAngle(Math.atan2(p2.y - v.y, p2.x - v.x));
    return { v, p1, p2, ang1, ang2 };
  }
  const l1id = angle?.leg1?.line ?? angle?.arm1LineId;
  const l2id = angle?.leg2?.line ?? angle?.arm2LineId;
  if (typeof l1id !== 'string' || typeof l2id !== 'string') return null;
  const l1 = rt.lines[l1id];
  const l2 = rt.lines[l2id];
  if (!l1 || !l2) return null;
  const p1Id = angle?.leg1?.otherPoint ?? angle?.point1 ?? getVertexOnLegRuntime({ line: l1id }, vId, rt);
  const p2Id = angle?.leg2?.otherPoint ?? angle?.point2 ?? getVertexOnLegRuntime({ line: l2id }, vId, rt);
  const p1 = typeof p1Id === 'string' ? runtimePoint(rt, p1Id) : null;
  const p2 = typeof p2Id === 'string' ? runtimePoint(rt, p2Id) : null;
  if (!p1 || !p2) return null;
  const ang1 = normalizeAngle(Math.atan2(p1.y - v.y, p1.x - v.x));
  const ang2 = normalizeAngle(Math.atan2(p2.y - v.y, p2.x - v.x));
  return { v, p1, p2, ang1, ang2 };
}

export function segmentKeyForPointsPure(points: Point[], aIdx: number, bIdx: number): string {
  const pa = points[aIdx];
  const pb = points[bIdx];
  const aid = pa?.id ?? `p${aIdx}`;
  const bid = pb?.id ?? `p${bIdx}`;
  return aid < bid ? `${aid}-${bid}` : `${bid}-${aid}`;
}

export function findLineIndexForSegmentPure(points: Point[], lines: Line[], aIdx: number, bIdx: number): number | null {
  const key = segmentKeyForPointsPure(points, aIdx, bIdx);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.segmentKeys?.includes(key)) return i;
    if (!line.segmentKeys) {
      for (let j = 0; j < (line.points?.length ?? 0) - 1; j++) {
        const segKey = segmentKeyForPointsPure(points, line.points[j], line.points[j + 1]);
        if (segKey === key) return i;
      }
    }
  }
  return null;
}


// Return type for point position update
export type PointPositionUpdate = { x: number; y: number; hidden?: boolean };

export type RecomputeIntersectionHelpers = {
  lineIndexById: (id: string) => number | null;
  circleIndexById: (id: string) => number | undefined;
  intersectLines: (a: Point, b: Point, c: Point, d: Point) => { x: number; y: number } | null;
  lineCircleIntersections: (a: Point, b: Point, center: Point, radius: number, both: boolean) => { x: number; y: number }[];
  projectPointOnLine: (source: { x: number; y: number }, a: Point, b: Point) => { x: number; y: number };
  circleRadius: (circle: any) => number;
};

export function recomputeIntersectionPointEngine(
  points: Point[],
  lines: Line[],
  circles: any[],
  pointIdx: number,
  helpers: RecomputeIntersectionHelpers
): PointPositionUpdate | null {
  const point = points[pointIdx];
  if (!point || !point.parent_refs || point.parent_refs.length < 2) return null;
  const [pa, pb] = point.parent_refs.slice(0, 2);
  const styleHidden = false;

  // line-line
  if (pa.kind === 'line' && pb.kind === 'line') {
    const lineAIdx = helpers.lineIndexById(pa.id);
    const lineBIdx = helpers.lineIndexById(pb.id);
    if (lineAIdx === null || lineBIdx === null) return null;
    const lineA = lines[lineAIdx];
    const lineB = lines[lineBIdx];
    if (!lineA || !lineB || lineA.points.length < 2 || lineB.points.length < 2) return null;
    const a1 = points[lineA.points[0]];
    const a2 = points[lineA.points[lineA.points.length - 1]];
    const b1 = points[lineB.points[0]];
    const b2 = points[lineB.points[lineB.points.length - 1]];
    if (!a1 || !a2 || !b1 || !b2) return null;
    const inter = helpers.intersectLines(a1, a2, b1, b2);
    if (inter) return { x: inter.x, y: inter.y, hidden: false };
    return null;
  }

  // line-circle
  if ((pa.kind === 'line' && pb.kind === 'circle') || (pa.kind === 'circle' && pb.kind === 'line')) {
    const lineRef = pa.kind === 'line' ? pa : pb;
    const circRef = pa.kind === 'circle' ? pa : pb;
    const lineIdx = helpers.lineIndexById(lineRef.id);
    const circleIdx = helpers.circleIndexById(circRef.id);
    if (lineIdx === null || circleIdx === undefined) return null;
    const line = lines[lineIdx];
    const circle = circles[circleIdx];
    if (!line || !circle || line.points.length < 2) return null;
    const a = points[line.points[0]];
    const b = points[line.points[line.points.length - 1]];
    const center = points[circle.center];
    const radius = helpers.circleRadius(circle);
    if (!a || !b || !center || radius <= 0) return null;
    const pts = helpers.lineCircleIntersections(a, b, center, radius, false);
    if (!pts.length) {
      const fallback = helpers.projectPointOnLine({ x: point.x, y: point.y }, a, b);
      return { x: fallback.x, y: fallback.y, hidden: true };
    }
    // choose closest to current point
    pts.sort((p1, p2) => Math.hypot(p1.x - point.x, p1.y - point.y) - Math.hypot(p2.x - point.x, p2.y - point.y));
    const best = pts[0];
    return { x: best.x, y: best.y, hidden: false };
  }

  // circle-circle
  if (pa.kind === 'circle' && pb.kind === 'circle') {
    const circleAIdx = helpers.circleIndexById(pa.id);
    const circleBIdx = helpers.circleIndexById(pb.id);
    if (circleAIdx === undefined || circleBIdx === undefined) return null;
    const circleA = circles[circleAIdx];
    const circleB = circles[circleBIdx];
    if (!circleA || !circleB) return null;
    const centerA = points[circleA.center];
    const centerB = points[circleB.center];
    const ra = helpers.circleRadius(circleA);
    const rb = helpers.circleRadius(circleB);
    if (!centerA || !centerB) return null;
    const dx = centerB.x - centerA.x;
    const dy = centerB.y - centerA.y;
    const d = Math.hypot(dx, dy);
    if (d <= 1e-9) return null;
    if (d > ra + rb || d < Math.abs(ra - rb)) {
      return null;
    }
    const a = (ra * ra - rb * rb + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, ra * ra - a * a));
    const xm = centerA.x + (a * dx) / d;
    const ym = centerA.y + (a * dy) / d;
    const rx = -dy * (h / d);
    const ry = dx * (h / d);
    const p1 = { x: xm + rx, y: ym + ry };
    const p2 = { x: xm - rx, y: ym - ry };
    const best = Math.hypot(p1.x - point.x, p1.y - point.y) <= Math.hypot(p2.x - point.x, p2.y - point.y) ? p1 : p2;
    return { x: best.x, y: best.y, hidden: false };
  }

  return null;
}

export type RecomputeParallelHelpers = {
  pointIndexById: (id: string) => number | null;
  lineIndexById: (id: string) => number | null;
  primaryLineDirection: (line: Line) => { dir: { x: number; y: number }; length: number } | null;
  constrainToCircles: (idx: number, target: { x: number; y: number }) => { x: number; y: number };
  lineLength: (lineIdx: number) => number | null;
};

export type ParallelRecomputeResult = {
  positions: Map<number, { x: number; y: number }>;
  ensureDefining?: { defining_points: [number, number]; insertThrough?: boolean; insertHelper?: boolean } | null;
  touched: number[];
};

export function recomputeParallelLineEngine(
  points: Point[],
  lines: Line[],
  lineIdx: number,
  helpers: RecomputeParallelHelpers
): ParallelRecomputeResult | null {
  const line = lines[lineIdx];
  if (!line || !(line as any).parallel) return null;
  const throughIdx = helpers.pointIndexById((line as any).parallel.throughPoint);
  const helperIdx = helpers.pointIndexById((line as any).parallel.helperPoint);
  if (throughIdx === null || helperIdx === null) return null;
  const anchor = points[throughIdx];
  const helper = points[helperIdx];
  const baseIdx = helpers.lineIndexById((line as any).parallel.referenceLine);
  if (baseIdx === null) return null;
  const baseLine = lines[baseIdx];
  if (!anchor || !helper || !baseLine) return null;
  const dirInfo = helpers.primaryLineDirection(baseLine);
  if (!dirInfo) return null;
  const direction = dirInfo.dir;
  const distances = new Map<number, number>();
  line.points.forEach((idx) => {
    const pt = points[idx];
    if (!pt) return;
    const vec = { x: pt.x - anchor.x, y: pt.y - anchor.y };
    const dist = vec.x * direction.x + vec.y * direction.y;
    distances.set(idx, dist);
  });
  if (!distances.has(helperIdx)) {
    const vec = { x: helper.x - anchor.x, y: helper.y - anchor.y };
    distances.set(helperIdx, vec.x * direction.x + vec.y * direction.y);
  }
  const helperDist = distances.get(helperIdx) ?? 0;
  if (Math.abs(helperDist) < 1e-6) {
    const baseLen = helpers.lineLength(baseIdx) ?? dirInfo.length;
    const fallback = Math.max(baseLen, 120);
    distances.set(helperIdx, fallback);
  }
  const positions = new Map<number, { x: number; y: number }>();
  const touched: number[] = [];
  distances.forEach((dist, idx) => {
    if (idx === throughIdx) return;
    const target = { x: anchor.x + direction.x * dist, y: anchor.y + direction.y * dist };
    const current = points[idx];
    if (!current) return;
    const constrained = helpers.constrainToCircles(idx, target);
    if (Math.abs(current.x - constrained.x) > 1e-6 || Math.abs(current.y - constrained.y) > 1e-6) {
      positions.set(idx, constrained);
      touched.push(idx);
    }
  });
  const ensureDefining = { defining_points: [throughIdx, helperIdx] as [number, number], insertThrough: !line.points.includes(throughIdx), insertHelper: !line.points.includes(helperIdx) };
  return { positions, ensureDefining, touched };
}

// --- Map-based adapters (wrappers) ---

function mapsToArrays(
  pointsMap: Map<string, Point>,
  linesMap: Map<string, Line>,
  circlesMap?: Map<string, Circle>
) {
  const pointsArr = Array.from(pointsMap.values());
  const linesArr = Array.from(linesMap.values());
  const circlesArr = circlesMap ? Array.from(circlesMap.values()) : [];
  const pointIndexById = new Map<string, number>();
  const lineIndexById = new Map<string, number>();
  const circleIndexById = new Map<string, number>();
  pointsArr.forEach((p, i) => pointIndexById.set(p.id, i));
  linesArr.forEach((l, i) => lineIndexById.set(l.id, i));
  circlesArr.forEach((c: any, i) => circleIndexById.set(c.id, i));
  return { pointsArr, linesArr, circlesArr, pointIndexById, lineIndexById, circleIndexById };
}

export function findLinesContainingPointById(
  pointsMap: Map<string, Point>,
  linesMap: Map<string, Line>,
  pointId: string
): string[] {
  const { pointsArr, linesArr, pointIndexById } = mapsToArrays(pointsMap, linesMap);
  const idx = pointIndexById.get(pointId);
  if (idx === undefined) return [];
  const resIdx = findLinesContainingPoint(pointsArr, linesArr, idx);
  return resIdx.map((i) => linesArr[i].id);
}

export function recomputeIntersectionPointEngineById(
  pointsMap: Map<string, Point>,
  linesMap: Map<string, Line>,
  circlesMap: Map<string, Circle> | undefined,
  pointId: string,
  helpers: Omit<RecomputeIntersectionHelpers, 'lineIndexById' | 'circleIndexById'> & {
    lineIndexById?: (id: string) => number | null;
    circleIndexById?: (id: string) => number | undefined;
  }
): PointPositionUpdate | null {
  const { pointsArr, linesArr, circlesArr, pointIndexById, lineIndexById, circleIndexById } = mapsToArrays(
    pointsMap,
    linesMap,
    circlesMap
  );
  const idx = pointIndexById.get(pointId);
  if (idx === undefined) return null;
  const adaptedHelpers: RecomputeIntersectionHelpers = {
    lineIndexById: (id: string) => {
      const v = lineIndexById.get(id);
      return v === undefined ? null : v;
    },
    circleIndexById: (id: string) => circleIndexById.get(id),
    intersectLines: helpers.intersectLines,
    lineCircleIntersections: helpers.lineCircleIntersections,
    projectPointOnLine: helpers.projectPointOnLine,
    circleRadius: helpers.circleRadius
  };
  return recomputeIntersectionPointEngine(pointsArr, linesArr, circlesArr, idx, adaptedHelpers);
}
