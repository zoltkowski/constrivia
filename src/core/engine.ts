import type { ConstructionRuntime, ObjectId, PointRuntime, LineRuntime, CircleRuntime, Model } from './runtimeTypes';

// Engine is the place for geometric computations.
// Start with a minimal skeleton and export small pure helpers which
// later will replace computations scattered across `main.ts`.

type Point = PointRuntime;
type Line = LineRuntime;
type Circle = CircleRuntime;

export type EngineModel = ConstructionRuntime;

// Used by array-backed helpers to resolve points by id.
function pointById(points: Point[], id: ObjectId | undefined | null): Point | null {
  if (id === undefined || id === null) return null;
  return points.find((p) => p?.id === id) ?? null;
}

// Used by array-backed helpers to resolve lines by id.
function lineById(lines: Line[], id: ObjectId | undefined | null): Line | null {
  if (id === undefined || id === null) return null;
  return lines.find((l) => l?.id === id) ?? null;
}

// Used by array-backed helpers to resolve point indices by id.
function pointIndexById(points: Point[], id: ObjectId | undefined | null): number {
  if (id === undefined || id === null) return -1;
  return points.findIndex((p) => p?.id === id);
}

// Used by main UI flow.
export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// Used by main UI flow.
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

// Used by main UI flow.
export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

// Used by normalization helpers.
function normalize(v: { x: number; y: number }) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

// Used by angle tools.
export function normalizeAngle(a: number) {
  const two = Math.PI * 2;
  const res = (a % two + two) % two;
  return res;
}

// Used by main UI flow.
export function axisSnapWeight(closeness: number) {
  const t = clamp(closeness, 0, 1);
  return t * t * (3 - 2 * t);
}

// Used by line tools.
export function projectPointOnLine(source: { x: number; y: number }, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denom = dx * dx + dy * dy || 1;
  const t = ((source.x - a.x) * dx + (source.y - a.y) * dy) / denom;
  return { x: a.x + dx * t, y: a.y + dy * t };
}

// Used by point tools to constrain on-line points to their parent line.
export function constrainPointToParentLine(
  model: Model,
  pointId: ObjectId,
  desired: { x: number; y: number }
): { x: number; y: number } | null {
  if (!pointId) return null;
  const pointIdx = model.indexById?.point?.[String(pointId)];
  const point = typeof pointIdx === 'number' ? model.points[pointIdx] : pointById(model.points, pointId);
  if (!point) return null;
  const parentLine = point.parent_refs?.find((pr) => pr.kind === 'line' && pr.id);
  if (!parentLine?.id) return null;
  const lineIdx = model.indexById?.line?.[String(parentLine.id)];
  const line = typeof lineIdx === 'number' ? model.lines[lineIdx] : model.lines.find((l) => l?.id === parentLine.id);
  if (!line || line.points.length < 2) return null;
  const aId = line.defining_points?.[0] ?? line.points[0];
  const bId = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  const a = pointById(model.points, aId);
  const b = pointById(model.points, bId);
  if (!a || !b) return null;
  return projectPointOnLine(desired, a, b);
}

// Used by point tools.
export function projectPointOnSegment(source: { x: number; y: number }, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denom = dx * dx + dy * dy || 1;
  let t = ((source.x - a.x) * dx + (source.y - a.y) * dy) / denom;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

// Used by line tools.
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

// Used by circle tools.
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
function runtimePoint(rt: ConstructionRuntime, id: ObjectId | undefined) {
  if (id === undefined || id === null) return null;
  const key = String(id);
  const p = rt.points[key];
  if (!p) return null;
  return { id: p.id, x: p.x, y: p.y } as Point;
}

// Used by line tools.
export function projectPointOnLineRuntime(source: { x: number; y: number }, aId: ObjectId, bId: ObjectId, rt: ConstructionRuntime) {
  const a = runtimePoint(rt, aId);
  const b = runtimePoint(rt, bId);
  if (!a || !b) return source;
  return projectPointOnLine(source, a as Point, b as Point);
}

// Used by point tools.
export function projectPointOnSegmentRuntime(source: { x: number; y: number }, aId: ObjectId, bId: ObjectId, rt: ConstructionRuntime) {
  const a = runtimePoint(rt, aId);
  const b = runtimePoint(rt, bId);
  if (!a || !b) return source;
  return projectPointOnSegment(source, a as Point, b as Point);
}

// Used by circle tools.
export function lineCircleIntersectionsRuntime(aId: ObjectId, bId: ObjectId, centerId: ObjectId, radius: number, rt: ConstructionRuntime, clampToSegment = true) {
  const a = runtimePoint(rt, aId);
  const b = runtimePoint(rt, bId);
  const center = runtimePoint(rt, centerId);
  if (!a || !b || !center) return [] as { x: number; y: number }[];
  return lineCircleIntersections(a as Point, b as Point, center as { x: number; y: number }, radius, clampToSegment);
}

// Used by circle tools.
export function circleCircleIntersectionsRuntime(c1Id: ObjectId, r1: number, c2Id: ObjectId, r2: number, rt: ConstructionRuntime) {
  const c1 = runtimePoint(rt, c1Id);
  const c2 = runtimePoint(rt, c2Id);
  if (!c1 || !c2) return [] as { x: number; y: number }[];
  return circleCircleIntersections({ x: c1.x, y: c1.y }, r1, { x: c2.x, y: c2.y }, r2);
}

// --- Additional runtime helpers ---
export function segmentKeyForPointsRuntime(aId: ObjectId, bId: ObjectId) {
  const a = String(aId);
  const b = String(bId);
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// Adapter: create a segment key from two point ids (model/runtime agnostic)
export function segmentKeyForIds(aId: ObjectId, bId: ObjectId): string {
  const a = String(aId);
  const b = String(bId);
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// Used by line tools.
export function findLineIdForSegmentRuntime(aId: ObjectId, bId: ObjectId, rt: ConstructionRuntime): string | null {
  const a = String(aId);
  const b = String(bId);
  for (const l of Object.values(rt.lines)) {
    const pts = (l.points || []).map((pid) => String(pid));
    for (let i = 0; i < pts.length - 1; i++) {
      const pa = pts[i];
      const pb = pts[i + 1];
      if ((pa === a && pb === b) || (pa === b && pb === a)) return String(l.id);
    }
  }
  return null;
}

// Adapter that works on the legacy Model (arrays + indexById) and returns a line index
// Adapter that works on legacy array-based model data (points[], lines[])
export function findLineIndexForSegmentFromArrays(points: Point[], lines: Line[], aId: ObjectId, bId: ObjectId): number | null {
  if (!aId || !bId) return null;
  return findLineIndexForSegmentPure(points, lines, aId, bId);
}

// Used by line tools.
export function reorderLinePointIdsRuntime(lineId: ObjectId, rt: ConstructionRuntime): string[] | null {
  const line = rt.lines[lineId];
  const pointIds = (line?.points || []).map((pid) => String(pid));
  if (!line || pointIds.length === 0) return null;
  const def0 = line.defining_points?.[0] ?? pointIds[0];
  const def1 = line.defining_points?.[1] ?? pointIds[pointIds.length - 1];
  const a = runtimePoint(rt, def0);
  const b = runtimePoint(rt, def1);
  if (!a || !b) return pointIds.slice();
  const dir = normalize({ x: b.x - a.x, y: b.y - a.y });
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const unique = Array.from(new Set(pointIds));
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

// Used by polygon tools.
export function polygonVerticesFromPolyRuntime(poly: any, rt: ConstructionRuntime): string[] {
  if (!poly) return [];
  if (Array.isArray(poly.points) && poly.points.length) return Array.from(new Set(poly.points as string[]));
  return [];
}

// Used by polygon tools.
export function polygonVerticesOrderedFromPolyRuntime(poly: any, rt: ConstructionRuntime): string[] {
  if (!poly) return [];
  if (!Array.isArray(poly.points) || !poly.points.length) return [];
  const ordered: string[] = [];
  for (const pid of poly.points) {
    if (ordered[ordered.length - 1] !== pid && !ordered.includes(pid)) ordered.push(pid);
  }
  return ordered;
}

// Used by line tools.
export function lineExtentRuntime(lineId: string, rt: ConstructionRuntime) {
  const line = rt.lines[lineId];
  if (!line) return null;
  const pointIds = (line.points || []).map((pid) => String(pid));
  if (pointIds.length < 2) return null;
  const aId = pointIds[0];
  const bId = pointIds[pointIds.length - 1];
  const a = runtimePoint(rt, aId);
  const b = runtimePoint(rt, bId);
  if (!a || !b) return null;
  const dirVec = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(dirVec.x, dirVec.y) || 1;
  const dir = { x: dirVec.x / len, y: dirVec.y / len };
  const base = a;
  const projections: { id: string; proj: number }[] = [];
  pointIds.forEach((pid) => {
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

// Runtime-based circle helpers
export function circleRadiusRuntime(circleId: string, rt: ConstructionRuntime): number {
  const circle = rt.circles[circleId];
  if (!circle) return 0;
  const center = rt.points[String(circle.center)];
  const radiusKey = circle.radius_point === undefined || circle.radius_point === null ? null : String(circle.radius_point);
  const radiusPt = radiusKey ? rt.points[radiusKey] : undefined;
  if (!center || !radiusPt) return 0;
  return Math.hypot(radiusPt.x - center.x, radiusPt.y - center.y);
}

// Used by circle tools.
export function circleRadiusVectorRuntime(circleId: string, rt: ConstructionRuntime): { x: number; y: number } | null {
  const circle = rt.circles[circleId];
  if (!circle) return null;
  const center = rt.points[String(circle.center)];
  const radiusKey = circle.radius_point === undefined || circle.radius_point === null ? null : String(circle.radius_point);
  const radiusPt = radiusKey ? rt.points[radiusKey] : undefined;
  if (!center || !radiusPt) return null;
  return { x: radiusPt.x - center.x, y: radiusPt.y - center.y };
}

// Used by circle tools.
export function circleDefiningPointIdsRuntime(circleId: string, rt: ConstructionRuntime): ObjectId[] {
  const circle = rt.circles[circleId];
  if (!circle || !circle.defining_points) return [];
  return circle.defining_points.slice();
}

// Used by circle tools.
export function circlePerimeterPointIdsRuntime(circleId: string, rt: ConstructionRuntime): ObjectId[] {
  const circle = rt.circles[circleId];
  if (!circle) return [];
  const result: ObjectId[] = [];
  const seen = new Set<string>();
  const pushUnique = (id: ObjectId | undefined | null) => {
    if (id === undefined || id === null) return;
    const key = String(id);
    if (key === String(circle.center)) return;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(id);
    }
  };
  pushUnique(circle.radius_point);
  (circle.points || []).forEach(pushUnique);
  circleDefiningPointIdsRuntime(circleId, rt).forEach(pushUnique);
  return result;
}

// Used by circle tools.
export function circleHasDefiningPointRuntime(circleId: string, pointId: ObjectId, rt: ConstructionRuntime): boolean {
  const circle = rt.circles[circleId];
  if (!circle || !circle.defining_points) return false;
  return circle.defining_points.some((pid) => String(pid) === String(pointId));
}

// Adapter: line extent using model indices but runtime positions when available
export function lineExtentForModel(lineIdx: number, model: Model, rt?: ConstructionRuntime | null) {
  const line = model.lines[lineIdx];
  if (!line || line.points.length < 2) return null;
  const toPoint = (id: ObjectId) => {
    const idx = model.indexById?.point?.[String(id)];
    const p = typeof idx === 'number' ? model.points[idx] : pointById(model.points, id);
    if (!p) return null;
    if (rt && p.id && rt.points[p.id]) {
      const rp = rt.points[p.id];
      return { ...p, x: rp.x, y: rp.y };
    }
    return p;
  };
  const a = toPoint(line.points[0]);
  const b = toPoint(line.points[line.points.length - 1]);
  if (!a || !b) return null;
  const dirVec = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(dirVec.x, dirVec.y) || 1;
  const dir = { x: dirVec.x / len, y: dirVec.y / len };
  const base = a;
  const projections: { id: ObjectId; proj: number }[] = [];
  line.points.forEach((id) => {
    if (!projections.some((p) => p.id === id)) {
      const p = toPoint(id);
      if (p) projections.push({ id, proj: (p.x - base.x) * dir.x + (p.y - base.y) * dir.y });
    }
  });
  if (!projections.length) return null;
  const sorted = projections.sort((p1, p2) => p1.proj - p2.proj);
  const startProj = sorted[0];
  const endProj = sorted[sorted.length - 1];
  const centerProj = (startProj.proj + endProj.proj) / 2;
  const center = { x: base.x + dir.x * centerProj, y: base.y + dir.y * centerProj };
  const startPoint = toPoint(startProj.id);
  const endPoint = toPoint(endProj.id);
  const half = Math.abs(endProj.proj - centerProj);
  const endPointIdx = model.indexById?.point?.[String(endProj.id)];
  return {
    center,
    centerProj,
    dir,
    startPoint,
    endPoint,
    order: sorted,
    half,
    endPointIdx: typeof endPointIdx === 'number' ? endPointIdx : -1,
    endPointCoord: endPoint ?? { x: base.x + dir.x * endProj.proj, y: base.y + dir.y * endProj.proj }
  };
}



// Used by line tools.
export function reflectPointAcrossLinePointPair(source: { x: number; y: number }, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) return null;
  const t = ((source.x - a.x) * dx + (source.y - a.y) * dy) / lenSq;
  const proj = { x: a.x + dx * t, y: a.y + dy * t };
  return { x: 2 * proj.x - source.x, y: 2 * proj.y - source.y };
}

// Used by line tools.
export function lineLength(lines: Line[], lineIdx: number, points: Point[]): number | null {
  const line = lines[lineIdx];
  if (!line || line.points.length < 2) return null;
  const a = pointById(points, line.points[0]);
  const b = pointById(points, line.points[line.points.length - 1]);
  if (!a || !b) return null;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// Used by line tools.
export function primaryLineDirection(line: Line, points: Point[]): { dir: { x: number; y: number }; length: number } | null {
  if (!line || line.points.length < 2) return null;
  const a = pointById(points, line.defining_points?.[0] ?? line.points[0]);
  const b = pointById(points, line.defining_points?.[1] ?? line.points[line.points.length - 1]);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-9) return null;
  return { dir: { x: dx / len, y: dy / len }, length: len };
}

// Return a sorted unique points array for a line based on defining points direction
export function reorderLinePointsPure(line: Line, points: Point[]): ObjectId[] | null {
  if (!line || !line.points || line.points.length === 0) return null;
  const aId = line.defining_points?.[0] ?? line.points[0];
  const bId = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  const a = pointById(points, aId);
  const b = pointById(points, bId);
  if (!a || !b) return null;
  const dir = normalize({ x: b.x - a.x, y: b.y - a.y });
  const unique = Array.from(new Set(line.points));
  unique.sort((p1, p2) => {
    const pt1 = pointById(points, p1);
    const pt2 = pointById(points, p2);
    if (!pt1 || !pt2) return 0;
    const t1 = (pt1.x - a.x) * dir.x + (pt1.y - a.y) * dir.y;
    const t2 = (pt2.x - a.x) * dir.x + (pt2.y - a.y) * dir.y;
    return t1 - t2;
  });
  return unique;
}

// --- Polygon / Angle pure helpers ---
export function polygonVerticesFromPoly(poly: any, _points: Point[], _lines: Line[]): ObjectId[] {
  if (!poly) return [];
  if (Array.isArray(poly.points) && poly.points.length) return Array.from(new Set(poly.points as ObjectId[]));
  return [];
}

// Used by polygon tools.
export function polygonVerticesOrderedFromPoly(poly: any, _points: Point[], _lines: Line[]): ObjectId[] {
  if (!poly) return [];
  if (!Array.isArray(poly.points) || !poly.points.length) return [];
  const ordered: ObjectId[] = [];
  for (const pid of poly.points as ObjectId[]) {
    if (ordered[ordered.length - 1] !== pid && !ordered.includes(pid)) ordered.push(pid);
  }
  return ordered;
}

// Used by hit-testing and selection.
export function findSegmentIndexPure(line: Line, p1: ObjectId, p2: ObjectId, points: Point[]): number {
  if (!line || !line.points || line.points.length < 2) return 0;
  for (let i = 0; i < line.points.length - 1; i++) {
    const a = line.points[i];
    const b = line.points[i + 1];
    if ((a === p1 && b === p2) || (a === p2 && b === p1)) return i;
  }
  const p2Pos = pointById(points, p2);
  if (!p2Pos) return 0;
  let bestSeg = 0;
  let bestDist = Infinity;
  for (let i = 0; i < line.points.length - 1; i++) {
    const a = line.points[i];
    const b = line.points[i + 1];
    if (a === p1 || b === p1) {
      const other = a === p1 ? b : a;
      const otherPos = pointById(points, other);
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

// Used by UI state helpers.
export function getVertexOnLegPure(leg: any, vertex: ObjectId, points: Point[], lines: Line[]): ObjectId {
  if (!leg) return '';
  if (leg.otherPoint !== undefined && leg.otherPoint !== null) return leg.otherPoint;
  const lineId = leg.line ?? leg;
  const line = lineById(lines, lineId);
  if (!line || !line.points || line.points.length === 0) return '';
  const vPos = pointById(points, vertex);
  if (!vPos) return line.points[0] ?? '';
  let best = '';
  let bestDist = Infinity;
  for (const pId of line.points) {
    if (pId === vertex) continue;
    const p = pointById(points, pId);
    if (!p) continue;
    const d = Math.hypot(p.x - vPos.x, p.y - vPos.y);
    if (d < bestDist) {
      bestDist = d;
      best = pId;
    }
  }
  return best || (line.points[0] ?? '');
}

// Used by angle tools.
export function angleBaseGeometryPure(angle: any, points: Point[], lines: Line[]) {
  const line1Id = angle?.arm1LineId;
  const line2Id = angle?.arm2LineId;
  if (!line1Id || !line2Id) return null;
  const l1 = lineById(lines, line1Id);
  const l2 = lineById(lines, line2Id);
  if (!l1 || !l2) return null;
  const v = pointById(points, angle.vertex);
  if (!v) return null;
  const p1Id = angle?.point1 ?? getVertexOnLegPure({ line: line1Id }, angle.vertex, points, lines);
  const p2Id = angle?.point2 ?? getVertexOnLegPure({ line: line2Id }, angle.vertex, points, lines);
  const p1 = p1Id ? pointById(points, p1Id) : null;
  const p2 = p2Id ? pointById(points, p2Id) : null;
  if (!p1 || !p2) return null;
  const ang1 = normalizeAngle(Math.atan2(p1.y - v.y, p1.x - v.x));
  const ang2 = normalizeAngle(Math.atan2(p2.y - v.y, p2.x - v.x));
  return { v, p1, p2, ang1, ang2 };
}

// --- Runtime variants for angle and leg helpers ---
export function getVertexOnLegRuntime(leg: any, vertexId: ObjectId, rt: ConstructionRuntime): ObjectId {
  if (!leg) return '';
  if (leg.otherPoint !== undefined && leg.otherPoint !== null) return leg.otherPoint;
  const lineId = leg.line ?? undefined;
  if (!lineId) return '';
  const line = rt.lines[String(lineId)];
  if (!line || !line.points || line.points.length === 0) return '';
  const vPos = runtimePoint(rt, vertexId);
  if (!vPos) return line.points[0] ?? '';
  let best = '';
  let bestDist = Infinity;
  for (const pId of line.points) {
    if (String(pId) === String(vertexId)) continue;
    const p = runtimePoint(rt, pId);
    if (!p) continue;
    const d = Math.hypot(p.x - vPos.x, p.y - vPos.y);
    if (d < bestDist) {
      bestDist = d;
      best = String(pId);
    }
  }
  return best || (line.points[0] ?? '');
}

// Used by angle tools.
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
  const l1id = angle?.arm1LineId ?? angle?.leg1?.line;
  const l2id = angle?.arm2LineId ?? angle?.leg2?.line;
  if (l1id === undefined || l1id === null || l2id === undefined || l2id === null) return null;
  const l1 = rt.lines[String(l1id)];
  const l2 = rt.lines[String(l2id)];
  if (!l1 || !l2) return null;
  const p1Id = angle?.leg1?.otherPoint ?? angle?.point1 ?? getVertexOnLegRuntime({ line: l1id }, vId, rt);
  const p2Id = angle?.leg2?.otherPoint ?? angle?.point2 ?? getVertexOnLegRuntime({ line: l2id }, vId, rt);
  const p1 = p1Id !== undefined && p1Id !== null ? runtimePoint(rt, p1Id) : null;
  const p2 = p2Id !== undefined && p2Id !== null ? runtimePoint(rt, p2Id) : null;
  if (!p1 || !p2) return null;
  const ang1 = normalizeAngle(Math.atan2(p1.y - v.y, p1.x - v.x));
  const ang2 = normalizeAngle(Math.atan2(p2.y - v.y, p2.x - v.x));
  return { v, p1, p2, ang1, ang2 };
}

// Used by point tools.
export function segmentKeyForPointsPure(_points: Point[], aId: ObjectId, bId: ObjectId): string {
  return segmentKeyForIds(aId, bId);
}

// Used by line tools.
export function findLineIndexForSegmentPure(points: Point[], lines: Line[], aId: ObjectId, bId: ObjectId): number | null {
  const key = segmentKeyForPointsPure(points, aId, bId);
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
  intersectLines: (a: Point, b: Point, c: Point, d: Point) => { x: number; y: number } | null;
  lineCircleIntersections: (a: Point, b: Point, center: Point, radius: number, both: boolean) => { x: number; y: number }[];
  projectPointOnLine: (source: { x: number; y: number }, a: Point, b: Point) => { x: number; y: number };
  circleRadius?: (circle: Circle, rt: ConstructionRuntime) => number;
};

// Used by point tools with runtime ids.
export function recomputeIntersectionPointEngineById(
  rt: ConstructionRuntime,
  pointId: ObjectId,
  helpers: RecomputeIntersectionHelpers
): PointPositionUpdate | null {
  const point = rt.points[String(pointId)];
  if (!point || !point.parent_refs || point.parent_refs.length < 2) return null;
  const [pa, pb] = point.parent_refs.slice(0, 2);
  const getLine = (id: ObjectId) => rt.lines[String(id)];
  const getCircle = (id: ObjectId) => rt.circles[String(id)];
  const getPoint = (id: ObjectId) => rt.points[String(id)];
  const radiusFor = (circle: Circle) =>
    helpers.circleRadius ? helpers.circleRadius(circle, rt) : circleRadiusRuntime(String(circle.id), rt);

  // line-line
  if (pa.kind === 'line' && pb.kind === 'line') {
    const lineA = getLine(pa.id);
    const lineB = getLine(pb.id);
    if (!lineA || !lineB || lineA.points.length < 2 || lineB.points.length < 2) return null;
    const a1 = getPoint(lineA.points[0]);
    const a2 = getPoint(lineA.points[lineA.points.length - 1]);
    const b1 = getPoint(lineB.points[0]);
    const b2 = getPoint(lineB.points[lineB.points.length - 1]);
    if (!a1 || !a2 || !b1 || !b2) return null;
    const inter = helpers.intersectLines(a1, a2, b1, b2);
    if (inter) return { x: inter.x, y: inter.y, hidden: false };
    return null;
  }

  // line-circle
  if ((pa.kind === 'line' && pb.kind === 'circle') || (pa.kind === 'circle' && pb.kind === 'line')) {
    const lineRef = pa.kind === 'line' ? pa : pb;
    const circRef = pa.kind === 'circle' ? pa : pb;
    const line = getLine(lineRef.id);
    const circle = getCircle(circRef.id);
    if (!line || !circle || line.points.length < 2) return null;
    const a = getPoint(line.points[0]);
    const b = getPoint(line.points[line.points.length - 1]);
    const center = getPoint(circle.center);
    const radius = radiusFor(circle);
    if (!a || !b || !center || radius <= 0) return null;
    const pts = helpers.lineCircleIntersections(a, b, center, radius, false);
    if (!pts.length) {
      const fallback = helpers.projectPointOnLine({ x: point.x, y: point.y }, a, b);
      return { x: fallback.x, y: fallback.y, hidden: true };
    }
    pts.sort((p1, p2) => Math.hypot(p1.x - point.x, p1.y - point.y) - Math.hypot(p2.x - point.x, p2.y - point.y));
    const best = pts[0];
    return { x: best.x, y: best.y, hidden: false };
  }

  // circle-circle
  if (pa.kind === 'circle' && pb.kind === 'circle') {
    const circleA = getCircle(pa.id);
    const circleB = getCircle(pb.id);
    if (!circleA || !circleB) return null;
    const centerA = getPoint(circleA.center);
    const centerB = getPoint(circleB.center);
    const ra = radiusFor(circleA);
    const rb = radiusFor(circleB);
    if (!centerA || !centerB) return null;
    const dx = centerB.x - centerA.x;
    const dy = centerB.y - centerA.y;
    const d = Math.hypot(dx, dy);
    if (d <= 1e-9) return null;
    if (d > ra + rb || d < Math.abs(ra - rb)) return null;
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
