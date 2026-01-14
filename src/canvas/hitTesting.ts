import type { ConstructionRuntime, ObjectId, Point } from '../core/runtimeTypes';
import type { LineHit } from '../core/hitTypes';

export type HitTestDeps = {
  runtime: ConstructionRuntime;
  showHidden: boolean;
  currentHitRadius: () => number;
  canvas: HTMLCanvasElement | null;
  dpr: number;
  zoomFactor: number;
  getPointById: (id: ObjectId, runtime: ConstructionRuntime) => Point | null;
  pointToSegmentDistance: (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => number;
};

// Used by point tools to find nearest point within the current hit radius.
export function findPoint(p: { x: number; y: number }, deps: HitTestDeps): ObjectId | null {
  const { runtime, showHidden, currentHitRadius } = deps;
  const tol = currentHitRadius();
  const points = Object.values(runtime.points);
  for (let i = points.length - 1; i >= 0; i--) {
    const pt = points[i];
    if (pt.style.hidden && !showHidden) continue;
    const dx = pt.x - p.x;
    const dy = pt.y - p.y;
    if (Math.hypot(dx, dy) <= tol) return pt.id;
  }
  return null;
}

// Used by point tools with a custom radius.
export function findPointWithRadius(p: { x: number; y: number }, radius: number, deps: HitTestDeps): ObjectId | null {
  const { runtime, showHidden } = deps;
  const points = Object.values(runtime.points);
  for (let i = points.length - 1; i >= 0; i--) {
    const pt = points[i];
    if (pt.style.hidden && !showHidden) continue;
    if (Math.hypot(pt.x - p.x, pt.y - p.y) <= radius) return pt.id;
  }
  return null;
}

// Used by line tools to find lines that include a point index.
export function findLinesContainingPoint(pointId: ObjectId, deps: HitTestDeps): ObjectId[] {
  const { runtime } = deps;
  if (!pointId) return [];
  const res: ObjectId[] = [];
  for (const line of Object.values(runtime.lines)) {
    if (line.points.includes(pointId)) res.push(line.id);
  }
  return res;
}

// Used by line tools to find all hits on segments/rays.
export function findLineHits(p: { x: number; y: number }, deps: HitTestDeps): LineHit[] {
  const { runtime, showHidden, currentHitRadius, canvas, dpr, zoomFactor, getPointById, pointToSegmentDistance } = deps;
  const hits: LineHit[] = [];
  const tol = currentHitRadius();
  const lines = Object.values(runtime.lines);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.hidden && !showHidden) continue;
    if (line.points.length >= 2) {
      for (let s = 0; s < line.points.length - 1; s++) {
        const a = getPointById(line.points[s], runtime);
        const b = getPointById(line.points[s + 1], runtime);
        const style = line.segmentStyles?.[s] ?? line.style;
        if (!a || !b) continue;
        if (style.hidden && !showHidden) continue;
        if (pointToSegmentDistance(p, a, b) <= tol) {
          hits.push({ lineId: line.id, part: 'segment', seg: s });
          break;
        }
      }
      const a = getPointById(line.points[0], runtime);
      const b = getPointById(line.points[line.points.length - 1], runtime);
      if (a && b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const dir = { x: dx / len, y: dy / len };
        const extend = (canvas ? canvas.width + canvas.height : 2000) / (dpr * zoomFactor);
        if (line.leftRay && !(line.leftRay.hidden && !showHidden)) {
          const rayEnd = { x: a.x - dir.x * extend, y: a.y - dir.y * extend };
          if (pointToSegmentDistance(p, a, rayEnd) <= tol) hits.push({ lineId: line.id, part: 'rayLeft' });
        }
        if (line.rightRay && !(line.rightRay.hidden && !showHidden)) {
          const rayEnd = { x: b.x + dir.x * extend, y: b.y + dir.y * extend };
          if (pointToSegmentDistance(p, b, rayEnd) <= tol) hits.push({ lineId: line.id, part: 'rayRight' });
        }
      }
    }
  }
  return hits;
}

// Used by line tools to return the closest hit.
export function findLine(p: { x: number; y: number }, deps: HitTestDeps): LineHit | null {
  const hits = findLineHits(p, deps);
  return hits.length ? hits[0] : null;
}

// Used by line tools to pick the closest segment on a line.
export function findLineHitForPos(lineId: ObjectId, pos: { x: number; y: number }, deps: HitTestDeps): LineHit | null {
  const { runtime, getPointById, pointToSegmentDistance } = deps;
  const line = runtime.lines[String(lineId)];
  if (!line || line.points.length < 2) return null;
  let best: { seg: number; dist: number } | null = null;
  for (let s = 0; s < line.points.length - 1; s++) {
    const a = getPointById(line.points[s], runtime);
    const b = getPointById(line.points[s + 1], runtime);
    if (!a || !b) continue;
    const d = pointToSegmentDistance(pos, a, b);
    if (best === null || d < best.dist) best = { seg: s, dist: d };
  }
  if (!best) return null;
  return { lineId: line.id, part: 'segment', seg: best.seg };
}
