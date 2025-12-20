import type { Model as ModelClass } from './model';
import type { Point, Line } from './types';
import type { Circle } from './types';
import { mapToArray, ObjectId } from './maps';

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

export function projectPointOnLine(source: { x: number; y: number }, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denom = dx * dx + dy * dy || 1;
  const t = ((source.x - a.x) * dx + (source.y - a.y) * dy) / denom;
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

// Line type imported above from ./types

export function findLinesContainingPoint(points: Point[], lines: Line[], idx: number): number[] {
  const res: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].points.includes(idx)) res.push(i);
  }
  return res;
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
  const baseIdx = helpers.lineIndexById((line as any).parallel.referenceLine);
  if (throughIdx === null || helperIdx === null || baseIdx === null) return null;
  const anchor = points[throughIdx];
  const helper = points[helperIdx];
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

export function recomputeParallelLineEngineById(
  pointsMap: Map<string, Point>,
  linesMap: Map<string, Line>,
  lineId: string,
  helpers: Omit<RecomputeParallelHelpers, 'pointIndexById' | 'lineIndexById'> & {
    pointIndexById?: (id: string) => number | null;
    lineIndexById?: (id: string) => number | null;
  }
): ParallelRecomputeResult | null {
  const { pointsArr, linesArr, lineIndexById, pointIndexById } = mapsToArrays(pointsMap, linesMap);
  const lidx = lineIndexById.get(lineId);
  if (lidx === undefined) return null;
  const adaptedHelpers: RecomputeParallelHelpers = {
    pointIndexById: (id: string) => {
      const v = pointIndexById.get(id);
      return v === undefined ? null : v;
    },
    lineIndexById: (id: string) => {
      const v = lineIndexById.get(id);
      return v === undefined ? null : v;
    },
    primaryLineDirection: (line: Line) => primaryLineDirection(line, pointsArr)!,
    constrainToCircles: (idx: number, target: { x: number; y: number }) => {
      const pid = pointsArr[idx]?.id;
      if (!pid) return target;
      if (helpers && (helpers as any).constrainToCirclesById) {
        return (helpers as any).constrainToCirclesById(pid, target);
      }
      return target;
    },
    lineLength: (li: number) => lineLength(linesArr, li, pointsArr)
  };
  const res = recomputeParallelLineEngine(pointsArr, linesArr, lidx, adaptedHelpers);
  if (!res) return null;
  const positions = new Map<string, { x: number; y: number }>();
  res.positions.forEach((pos, idx) => {
    const pid = pointsArr[idx]?.id;
    if (pid) positions.set(pid, pos);
  });
  const touched = (res.touched || []).map((i) => pointsArr[i]?.id).filter((v): v is string => !!v);
  let ensureDefining = res.ensureDefining as any;
  if (ensureDefining && ensureDefining.defining_points) {
    ensureDefining = { ...ensureDefining, defining_points: ensureDefining.defining_points.map((i: number) => pointsArr[i]?.id) };
  }
  return { positions, ensureDefining, touched } as any;
}

export function recomputeMidpointEngineById(
  pointsMap: Map<string, Point>,
  linesMap: Map<string, Line>,
  circlesMap: Map<string, Circle> | undefined,
  pointId: string
): PointPositionUpdate | null {
  const { pointsArr, linesArr, circlesArr, pointIndexById } = mapsToArrays(pointsMap, linesMap, circlesMap);
  const idx = pointIndexById.get(pointId);
  if (idx === undefined) return null;
  return recomputeMidpointEngine(pointsArr, linesArr, circlesArr, idx, {
    pointIndexById: (id: string) => {
      const v = pointIndexById.get(id);
      return v === undefined ? null : v;
    },
    lineIndexById: (id: string) => {
      const v = (linesArr as any).findIndex((l: any) => l.id === id);
      return v === -1 ? null : v;
    }
  });
}

export function recomputeBisectPointEngineById(
  pointsMap: Map<string, Point>,
  linesMap: Map<string, Line>,
  circlesMap: Map<string, Circle> | undefined,
  pointId: string
): PointPositionUpdate | null {
  const { pointsArr, linesArr, circlesArr, pointIndexById } = mapsToArrays(pointsMap, linesMap, circlesMap);
  const idx = pointIndexById.get(pointId);
  if (idx === undefined) return null;
  return recomputeBisectPointEngine(pointsArr, linesArr, circlesArr, idx, {
    pointIndexById: (id: string) => {
      const v = pointIndexById.get(id);
      return v === undefined ? null : v;
    },
    lineIndexById: (id: string) => {
      const v = (linesArr as any).findIndex((l: any) => l.id === id);
      return v === -1 ? null : v;
    }
  });
}

export function recomputeSymmetricPointEngineById(
  pointsMap: Map<string, Point>,
  linesMap: Map<string, Line>,
  circlesMap: Map<string, Circle> | undefined,
  pointId: string
): PointPositionUpdate | null {
  const { pointsArr, linesArr, circlesArr, pointIndexById } = mapsToArrays(pointsMap, linesMap, circlesMap);
  const idx = pointIndexById.get(pointId);
  if (idx === undefined) return null;
  return recomputeSymmetricPointEngine(pointsArr, linesArr, circlesArr, idx, {
    pointIndexById: (id: string) => {
      const v = pointIndexById.get(id);
      return v === undefined ? null : v;
    },
    lineIndexById: (id: string) => {
      const v = (linesArr as any).findIndex((l: any) => l.id === id);
      return v === -1 ? null : v;
    }
  });
}

export function applyLineFractionsEngineById(
  pointsMap: Map<string, Point>,
  linesMap: Map<string, Line>,
  lineId: string,
  fractions: number[]
): { positions: Map<string, { x: number; y: number }>; touched: string[] } | null {
  const { pointsArr, linesArr, pointIndexById, lineIndexById } = mapsToArrays(pointsMap, linesMap);
  const lidx = lineIndexById.get(lineId);
  if (lidx === undefined) return null;
  const res = applyLineFractionsEngine(pointsArr, linesArr, lidx, fractions);
  if (!res) return null;
  const positions = new Map<string, { x: number; y: number }>();
  res.positions.forEach((pos, idx) => {
    const pid = pointsArr[idx]?.id;
    if (typeof pid === 'string') positions.set(pid, pos);
  });
  const touched = (res.touched || []).map((i) => pointsArr[i]?.id).filter((v): v is string => !!v);
  return { positions, touched };
}

export function recomputePerpendicularLineEngineById(
  pointsMap: Map<string, Point>,
  linesMap: Map<string, Line>,
  lineId: string,
  helpers: {
    constrainToCirclesById?: (pid: string, target: { x: number; y: number }) => { x: number; y: number };
    selectedPointId?: string | null;
    draggingSelection?: boolean;
  }
): ParallelRecomputeResult | null {
  const { pointsArr, linesArr, pointIndexById, lineIndexById } = mapsToArrays(pointsMap, linesMap);
  const lidx = lineIndexById.get(lineId);
  if (lidx === undefined) return null;
  const adaptedHelpers: RecomputePerpHelpers = {
    pointIndexById: (id: string) => {
      const v = pointIndexById.get(id);
      return v === undefined ? null : v;
    },
    lineIndexById: (id: string) => {
      const v = lineIndexById.get(id);
      return v === undefined ? null : v;
    },
    primaryLineDirection: (line: Line, pts: Point[]) => primaryLineDirection(line, pts),
    constrainToCircles: (idx: number, target: { x: number; y: number }) => {
      const pid = pointsArr[idx]?.id;
      if (!pid || !helpers.constrainToCirclesById) return target;
      return helpers.constrainToCirclesById(pid, target);
    },
    lineLength: (li: number) => lineLength(linesArr, li, pointsArr),
    selectedPointIndex: helpers.selectedPointId ? (pointIndexById.get(helpers.selectedPointId) ?? null) : null,
    draggingSelection: helpers.draggingSelection ?? false
  };
  const res = recomputePerpendicularLineEngine(pointsArr, linesArr, lidx, adaptedHelpers as any);
  if (!res) return null;
  // convert numeric-indexed positions to id-keyed
  const positions = new Map<string, { x: number; y: number }>();
  res.positions.forEach((pos, idx) => {
    const pid = pointsArr[idx]?.id;
    if (pid) positions.set(pid, pos);
  });
  const touched = (res.touched || []).map((i) => pointsArr[i]?.id).filter((v): v is string => !!v);
  let ensureDefining = res.ensureDefining as any;
  if (ensureDefining && ensureDefining.defining_points) {
    ensureDefining = { ...ensureDefining, defining_points: ensureDefining.defining_points.map((i: number) => pointsArr[i]?.id) };
  }
  return { positions, ensureDefining, touched } as any;
}

export function enforceIntersectionsEngineById(
  pointsMap: Map<string, Point>,
  linesMap: Map<string, Line>,
  lineId: string
): Map<string, { x: number; y: number }> {
  const { pointsArr, linesArr, pointIndexById, lineIndexById } = mapsToArrays(pointsMap, linesMap);
  const lidx = lineIndexById.get(lineId);
  if (lidx === undefined) return new Map();
  const updates = enforceIntersectionsEngine(pointsArr, linesArr, lidx, (idx: number) => findLinesContainingPoint(pointsArr, linesArr, idx), intersectLines);
  const out = new Map<string, { x: number; y: number }>();
  updates.forEach((pos, idx) => {
    const pid = pointsArr[idx]?.id;
    if (pid) out.set(pid, pos);
  });
  return out;
}

export type RecomputeSimpleHelpers = {
  pointIndexById: (id: string) => number | null;
  lineIndexById: (id: string) => number | null;
};

export function recomputeMidpointEngine(
  points: Point[],
  lines: Line[],
  circles: any[],
  pointIdx: number,
  helpers: RecomputeSimpleHelpers
): PointPositionUpdate | null {
  const point = points[pointIdx];
  if (!point || !point.midpoint) return null;
  const [parentAId, parentBId] = point.midpoint.parents || [];
  const paIdx = helpers.pointIndexById(parentAId);
  const pbIdx = helpers.pointIndexById(parentBId);
  if (paIdx === null || pbIdx === null) return null;
  const pa = points[paIdx];
  const pb = points[pbIdx];
  if (!pa || !pb) return null;
  const target = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
  return { x: target.x, y: target.y };
}

export function recomputeBisectPointEngine(
  points: Point[],
  lines: Line[],
  circles: any[],
  pointIdx: number,
  helpers: RecomputeSimpleHelpers
): PointPositionUpdate | null {
  const point = points[pointIdx];
  if (!point || !point.bisect) return null;
  const vertexIdx = helpers.pointIndexById(point.bisect.vertex);
  if (vertexIdx === null) return null;
  const vertex = points[vertexIdx];
  if (!vertex) return null;

  const resolveBisectSegment = (ref: any, vertexIdxLocal: number) => {
    const lineIdx = helpers.lineIndexById(ref.lineId);
    if (lineIdx === null) return null;
    const line = lines[lineIdx];
    if (!line) return null;
    const aIdx = helpers.pointIndexById(ref.a);
    const bIdx = helpers.pointIndexById(ref.b);
    if (aIdx === null || bIdx === null) return null;
    if (!line.points.includes(aIdx) || !line.points.includes(bIdx)) return null;
    let adjacent = false;
    for (let i = 0; i < line.points.length - 1; i++) {
      const p = line.points[i];
      const n = line.points[i + 1];
      if ((p === aIdx && n === bIdx) || (p === bIdx && n === aIdx)) {
        adjacent = true;
        break;
      }
    }
    if (!adjacent) return null;
    if (aIdx !== vertexIdxLocal && bIdx !== vertexIdxLocal) return null;
    const otherIdx = aIdx === vertexIdxLocal ? bIdx : bIdx === vertexIdxLocal ? aIdx : null;
    if (otherIdx === null) return null;
    const other = points[otherIdx];
    if (!other) return null;
    const length = Math.hypot(other.x - vertex.x, other.y - vertex.y);
    if (!Number.isFinite(length) || length < 1e-6) return null;
    return { lineIdx, otherIdx, length };
  };

  const seg1 = resolveBisectSegment(point.bisect.seg1, vertexIdx);
  const seg2 = resolveBisectSegment(point.bisect.seg2, vertexIdx);
  if (!seg1 || !seg2) return null;
  const other1 = points[seg1.otherIdx];
  const other2 = points[seg2.otherIdx];
  if (!other1 || !other2) return null;
  const epsilon = point.bisect.epsilon ?? 60;
  const dist = Math.max(1e-6, Math.min(epsilon, seg1.length, seg2.length));
  const dir1 = normalize({ x: other1.x - vertex.x, y: other1.y - vertex.y });
  const dir2 = normalize({ x: other2.x - vertex.x, y: other2.y - vertex.y });
  const p1 = { x: vertex.x + dir1.x * dist, y: vertex.y + dir1.y * dist };
  const p2 = { x: vertex.x + dir2.x * dist, y: vertex.y + dir2.y * dist };
  let target = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const sep = Math.hypot(dx, dy);
  const distToVertex = Math.hypot(target.x - vertex.x, target.y - vertex.y);
  if (sep < 1e-3 || distToVertex < 1e-3) {
    let perp = { x: -dir1.y, y: dir1.x };
    const plen = Math.hypot(perp.x, perp.y) || 1;
    perp.x /= plen;
    perp.y /= plen;
    const offset = Math.max(2, Math.min(6, (epsilon || 6) * 0.12));
    target = { x: target.x + perp.x * offset, y: target.y + perp.y * offset };
  }
  return { x: target.x, y: target.y };
}

function normalize(v: { x: number; y: number }) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

export function recomputeSymmetricPointEngine(
  points: Point[],
  lines: Line[],
  circles: any[],
  pointIdx: number,
  helpers: RecomputeSimpleHelpers
): PointPositionUpdate | null {
  const point = points[pointIdx];
  if (!point || !point.symmetric) return null;
  const sourceIdx = helpers.pointIndexById(point.symmetric.source);
  if (sourceIdx === null) return null;
  const source = points[sourceIdx];
  if (!source) return null;
  let target: { x: number; y: number } | null = null;
  if (point.symmetric.mirror.kind === 'point') {
    const mirrorIdx = helpers.pointIndexById(point.symmetric.mirror.id);
    if (mirrorIdx === null) return null;
    const mirror = points[mirrorIdx];
    if (!mirror) return null;
    target = { x: mirror.x * 2 - source.x, y: mirror.y * 2 - source.y };
  } else {
    const lineIdx = helpers.lineIndexById(point.symmetric.mirror.id);
    if (lineIdx === null) return null;
    const line = lines[lineIdx];
    if (!line || line.points.length < 2) return null;
    const a = points[line.points[0]];
    const b = points[line.points[line.points.length - 1]];
    if (!a || !b) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= 1e-9) return null;
    const t = ((source.x - a.x) * dx + (source.y - a.y) * dy) / lenSq;
    const proj = { x: a.x + dx * t, y: a.y + dy * t };
    target = { x: 2 * proj.x - source.x, y: 2 * proj.y - source.y };
  }
  if (!target) return null;
  return { x: target.x, y: target.y };
}
