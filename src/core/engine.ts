import { stableLineCircleIntersections } from './intersectionGeometry';
import { resolveCircleGeometry, circleInputPointIds } from './circleGeometry';
import { resolveAngleDefinition } from './angleDefinition';
import type { ConstructionRuntime, ObjectId, PointRuntime, LineRuntime, CircleRuntime } from './runtimeTypes';

// Engine is the place for geometric computations.
// Start with a minimal skeleton and export small pure helpers which
// later will replace computations scattered across `main.ts`.

type Point = PointRuntime;
type Line = LineRuntime;
type Circle = CircleRuntime;
export type Coordinates = { x: number; y: number };

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


// Used by main UI flow.
export function distance(a: Coordinates, b: Coordinates): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// Used by main UI flow.
export function centroid(points: Coordinates[]): Coordinates | null {
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
export function projectPointOnLine(source: Coordinates, a: Coordinates, b: Coordinates) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denom = dx * dx + dy * dy || 1;
  const t = ((source.x - a.x) * dx + (source.y - a.y) * dy) / denom;
  return { x: a.x + dx * t, y: a.y + dy * t };
}


// Used by point tools.
export function projectPointOnSegment(source: Coordinates, a: Coordinates, b: Coordinates) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denom = dx * dx + dy * dy || 1;
  let t = ((source.x - a.x) * dx + (source.y - a.y) * dy) / denom;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

// Used by line tools.
export function intersectLines(a: Coordinates, b: Coordinates, c: Coordinates, d: Coordinates): Coordinates | null {
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
  return stableLineCircleIntersections(a, b, center, radius, clampToSegment);
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

// Used by point tools to constrain on-line points in runtime maps.
export function constrainPointToParentLineRuntime(
  rt: ConstructionRuntime,
  pointId: ObjectId,
  desired: { x: number; y: number }
): { x: number; y: number } | null {
  if (!pointId) return null;
  const point = rt.points[String(pointId)];
  if (!point) return null;
  const parentLine = point.parent_refs?.find((pr) => pr.kind === 'line' && pr.id);
  if (!parentLine?.id) return null;
  const line = rt.lines[String(parentLine.id)];
  if (!line) return null;
  const aId = line.defining_points?.[0] ?? line.points[0];
  const bId = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  const a = runtimePoint(rt, aId);
  const b = runtimePoint(rt, bId);
  if (!a || !b) return null;
  return projectPointOnLine(desired, a as Point, b as Point);
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
  const extentIds = line.points?.length ? line.points : line.perpendicular?.directBisector ? line.defining_points : [];
  const pointIds = extentIds.map((pid) => String(pid));
  if (!pointIds.length) return null;
  const aId = pointIds[0];
  const bId = pointIds[pointIds.length - 1];
  const a = runtimePoint(rt, aId);
  const b = runtimePoint(rt, bId);
  if (!a || !b) return null;
  const definingA = runtimePoint(rt, line.defining_points[0]) ?? a;
  const definingB = runtimePoint(rt, line.defining_points[1]) ?? b;
  const dirVec = { x: definingB.x - definingA.x, y: definingB.y - definingA.y };
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
  return circle ? resolveCircleGeometry(rt, circle)?.radius ?? 0 : 0;
}

// Used by circle tools.
export function circleRadiusVectorRuntime(circleId: string, rt: ConstructionRuntime): { x: number; y: number } | null {
  const circle = rt.circles[circleId];
  if (!circle) return null;
  return resolveCircleGeometry(rt, circle)?.vector ?? null;
}

// Used by circle tools.
export function circleDefiningPointIdsRuntime(circleId: string, rt: ConstructionRuntime): ObjectId[] {
  const circle = rt.circles[circleId];
  if (!circle || !circle.defining_points || circle.circle_kind==='incircle' || circle.inversion) return [];
  if (circle.circle_kind === 'compass') return circleInputPointIds(circle);
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
  if (circle.circle_kind !== 'compass') circleDefiningPointIdsRuntime(circleId, rt).forEach(pushUnique);
  return result;
}

// Used by circle tools.
export function circleHasDefiningPointRuntime(circleId: string, pointId: ObjectId, rt: ConstructionRuntime): boolean {
  const circle = rt.circles[circleId];
  if (!circle || !circle.defining_points) return false;
  return (circle.circle_kind === 'compass' ? circleInputPointIds(circle) : circle.defining_points).some((pid) => String(pid) === String(pointId));
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
export function primaryLineDirection(line: Line, points: Point[]): { dir: { x: number; y: number }; length: number } | null {
  if (!line) return null;
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
  return resolveAngleDefinition({ points: Object.fromEntries(points.map(p => [p.id, p])), lines: Object.fromEntries(lines.map(l => [l.id, l])) }, angle);
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
  return resolveAngleDefinition(rt, {
    ...angle,
    arm1LineId: angle.arm1LineId ?? angle.leg1?.line,
    arm2LineId: angle.arm2LineId ?? angle.leg2?.line,
    point1: angle.point1 ?? angle.leg1?.otherPoint,
    point2: angle.point2 ?? angle.leg2?.otherPoint
  });
}

// Used by point tools.
export function segmentKeyForPointsPure(_points: Point[], aId: ObjectId, bId: ObjectId): string {
  return segmentKeyForIds(aId, bId);
}
