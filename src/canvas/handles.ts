import type { Circle, Model, ObjectId, Point } from '../core/runtimeTypes';
import type { LineHit } from '../core/hitTypes';

export type HandleDeps = {
  model: Model;
  showHidden: boolean;
  lineExtent: (lineId: ObjectId) => { center: { x: number; y: number }; dir: { x: number; y: number }; endPointCoord: { x: number; y: number } } | null;
  circleRadius: (circle: Circle) => number;
};

export type LineAnchorDeps = {
  model: Model;
  canvas: HTMLCanvasElement | null;
  dpr: number;
};

// Used by handle helpers to resolve point ids into model points.
const getPointById = (model: Model, id: ObjectId | undefined | null): Point | null => {
  if (!id) return null;
  const idx = model.indexById?.point?.[String(id)];
  if (typeof idx === 'number') return model.points[idx] ?? null;
  return model.points.find((p) => p?.id === id) ?? null;
};

// Used by line tools to compute anchor segments for hit targets.
export function lineAnchorForHit(hit: LineHit, deps: LineAnchorDeps): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  const { model, canvas, dpr } = deps;
  const lineIdx = model.indexById?.line?.[String(hit.lineId)];
  const line = typeof lineIdx === 'number' ? model.lines[lineIdx] : null;
  if (!line) return null;
  if (hit.part === 'segment') {
    const a = getPointById(model, line.points[hit.seg]);
    const b = getPointById(model, line.points[hit.seg + 1]);
    if (!a || !b) return null;
    return { a, b };
  }
  const anchor = getPointById(model, hit.part === 'rayLeft' ? line.points[0] : line.points[line.points.length - 1]);
  const other = getPointById(
    model,
    hit.part === 'rayLeft'
      ? (line.points[1] ?? line.points[line.points.length - 1])
      : (line.points[line.points.length - 2] ?? line.points[0])
  );
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
export function getLineHandle(lineId: ObjectId, deps: HandleDeps) {
  const { model, showHidden, lineExtent } = deps;
  const lineIdx = model.indexById?.line?.[String(lineId)];
  const line = typeof lineIdx === 'number' ? model.lines[lineIdx] : null;
  if (!line) return null;
  if (line.hidden && !showHidden) return null;
  const raysHidden = (!line.leftRay || line.leftRay.hidden) && (!line.rightRay || line.rightRay.hidden);
  if (!raysHidden) return null;
  const extent = lineExtent(lineId);
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
export function getLineRotateHandle(lineId: ObjectId, deps: HandleDeps) {
  const { model, showHidden, lineExtent } = deps;
  const lineIdx = model.indexById?.line?.[String(lineId)];
  const line = typeof lineIdx === 'number' ? model.lines[lineIdx] : null;
  if (!line) return null;
  if (line.hidden && !showHidden) return null;
  const raysHidden = (!line.leftRay || line.leftRay.hidden) && (!line.rightRay || line.rightRay.hidden);
  if (!raysHidden) return null;
  const extent = lineExtent(lineId);
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
export function getCircleHandle(circleId: ObjectId, deps: HandleDeps) {
  const { model, showHidden, circleRadius } = deps;
  const circleIdx = model.indexById?.circle?.[String(circleId)];
  const circle = typeof circleIdx === 'number' ? model.circles[circleIdx] : null;
  if (!circle) return null;
  if (circle.hidden && !showHidden) return null;
  const center = getPointById(model, circle.center);
  if (!center) return null;
  const radius = circleRadius(circle);
  if (!(radius > 1e-3)) return null;
  // place scale handle to the right of circle, slightly offset outward
  const offset = 28;
  return { x: center.x + (radius + offset), y: center.y };
}

// Used by circle tools to position rotate handles.
export function getCircleRotateHandle(circleId: ObjectId, deps: HandleDeps) {
  const { model, showHidden, circleRadius } = deps;
  const circleIdx = model.indexById?.circle?.[String(circleId)];
  const circle = typeof circleIdx === 'number' ? model.circles[circleIdx] : null;
  if (!circle) return null;
  if (circle.hidden && !showHidden) return null;
  const center = getPointById(model, circle.center);
  if (!center) return null;
  const radius = circleRadius(circle);
  if (!(radius > 1e-3)) return null;
  // place rotate handle above the circle
  const perpDistance = radius + 44;
  return { x: center.x, y: center.y - perpDistance };
}
