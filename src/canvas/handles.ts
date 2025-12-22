import type { Circle, Model } from '../core/runtimeTypes';
import type { LineHit } from '../core/hitTypes';

export type HandleDeps = {
  model: Model;
  showHidden: boolean;
  lineExtent: (lineIdx: number) => { center: { x: number; y: number }; dir: { x: number; y: number }; endPointCoord: { x: number; y: number } } | null;
  circleRadius: (circle: Circle) => number;
};

export type LineAnchorDeps = {
  model: Model;
  canvas: HTMLCanvasElement | null;
  dpr: number;
};

// Used by handle helpers to normalize point id/index references.
const resolvePointIndex = (model: Model, ref: unknown): number | null => {
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'string') {
    const idx = model.indexById?.point?.[String(ref)];
    return typeof idx === 'number' ? idx : null;
  }
  return null;
};

// Used by line tools to compute anchor segments for hit targets.
export function lineAnchorForHit(hit: LineHit, deps: LineAnchorDeps): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  const { model, canvas, dpr } = deps;
  const line = model.lines[hit.line];
  if (!line) return null;
  if (hit.part === 'segment') {
    const aIdx = resolvePointIndex(model, line.points[hit.seg]);
    const bIdx = resolvePointIndex(model, line.points[hit.seg + 1]);
    const a = typeof aIdx === 'number' ? model.points[aIdx] : null;
    const b = typeof bIdx === 'number' ? model.points[bIdx] : null;
    if (!a || !b) return null;
    return { a, b };
  }
  const firstIdx = resolvePointIndex(model, line.points[0]);
  const lastIdx = resolvePointIndex(model, line.points[line.points.length - 1]);
  const anchorIdx = hit.part === 'rayLeft' ? firstIdx : lastIdx;
  const otherIdx = hit.part === 'rayLeft'
    ? resolvePointIndex(model, line.points[1] ?? line.points[line.points.length - 1])
    : resolvePointIndex(model, line.points[line.points.length - 2] ?? line.points[0]);
  const anchor = typeof anchorIdx === 'number' ? model.points[anchorIdx] : null;
  const other = typeof otherIdx === 'number' ? model.points[otherIdx] : null;
  if (!anchor || !other) return null;
  const extent = (canvas ? canvas.width + canvas.height : 2000) / dpr;
  const dirRaw = { x: anchor.x - other.x, y: anchor.y - other.y };
  const len = Math.hypot(dirRaw.x, dirRaw.y) || 1;
  const dir = { x: dirRaw.x / len, y: dirRaw.y / len };
  return {
    a: anchor,
    b: {
      x: anchor.x + dir.x * extent,
      y: anchor.y + dir.y * extent
    }
  };
}

// Used by line tools to position scale handles.
export function getLineHandle(lineIdx: number, deps: HandleDeps) {
  const { model, showHidden, lineExtent } = deps;
  const line = model.lines[lineIdx];
  if (!line) return null;
  if (line.hidden && !showHidden) return null;
  const raysHidden = (!line.leftRay || line.leftRay.hidden) && (!line.rightRay || line.rightRay.hidden);
  if (!raysHidden) return null;
  const extent = lineExtent(lineIdx);
  if (!extent) return null;
  const end = extent.endPointCoord;
  // offset handle further along the line direction and slightly perpendicular to avoid overlap
  const offset = 40;
  const vec = { x: end.x - extent.center.x, y: end.y - extent.center.y };
  const len = Math.hypot(vec.x, vec.y) || 1;
  const dir = { x: vec.x / len, y: vec.y / len };
  const perp = { x: -dir.y, y: dir.x };
  const perpOffset = 12;
  return {
    x: end.x + dir.x * offset + perp.x * perpOffset,
    y: end.y + dir.y * offset + perp.y * perpOffset
  };
}

// Used by line tools to position rotate handles.
export function getLineRotateHandle(lineIdx: number, deps: HandleDeps) {
  const { model, showHidden, lineExtent } = deps;
  const line = model.lines[lineIdx];
  if (!line) return null;
  if (line.hidden && !showHidden) return null;
  const raysHidden = (!line.leftRay || line.leftRay.hidden) && (!line.rightRay || line.rightRay.hidden);
  if (!raysHidden) return null;
  const extent = lineExtent(lineIdx);
  if (!extent) return null;
  // Place rotate handle above the center, offset perpendicular to line direction
  const center = extent.center;
  const dir = extent.dir;
  const perp = { x: -dir.y, y: dir.x };
  const offsetAlong = 0; // no further along the line
  const perpDistance = 44; // px in world units approx (visual distance)
  return {
    x: center.x + dir.x * offsetAlong + perp.x * perpDistance,
    y: center.y + dir.y * offsetAlong + perp.y * perpDistance
  };
}

// Used by circle tools to position scale handles.
export function getCircleHandle(circleIdx: number, deps: HandleDeps) {
  const { model, showHidden, circleRadius } = deps;
  const circle = model.circles[circleIdx];
  if (!circle) return null;
  if (circle.hidden && !showHidden) return null;
  const centerIdx = resolvePointIndex(model, circle.center);
  const center = typeof centerIdx === 'number' ? model.points[centerIdx] : null;
  if (!center) return null;
  const radius = circleRadius(circle);
  if (!(radius > 1e-3)) return null;
  // place scale handle to the right of circle, slightly offset outward
  const offset = 28;
  return { x: center.x + (radius + offset), y: center.y };
}

// Used by circle tools to position rotate handles.
export function getCircleRotateHandle(circleIdx: number, deps: HandleDeps) {
  const { model, showHidden, circleRadius } = deps;
  const circle = model.circles[circleIdx];
  if (!circle) return null;
  if (circle.hidden && !showHidden) return null;
  const centerIdx = resolvePointIndex(model, circle.center);
  const center = typeof centerIdx === 'number' ? model.points[centerIdx] : null;
  if (!center) return null;
  const radius = circleRadius(circle);
  if (!(radius > 1e-3)) return null;
  // place rotate handle above the circle
  const perpDistance = radius + 44;
  return { x: center.x, y: center.y - perpDistance };
}
