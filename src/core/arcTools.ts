import type { Circle, ConstructionRuntime, Model, ObjectId, Point, StrokeStyle } from './runtimeTypes';
import { circlePerimeterPoints, circleRadius } from './circleTools';

export type DerivedArc = {
  circle: ObjectId;
  start: number;
  end: number;
  clockwise: boolean;
  center: { x: number; y: number };
  radius: number;
  style: StrokeStyle;
  hidden?: boolean;
  startId: ObjectId;
  endId: ObjectId;
  key: string;
};

export type ArcToolsDeps = {
  model: Model;
  runtime: ConstructionRuntime | null;
  showHidden: boolean;
};

// Used by arc helpers to resolve points by id.
const getPointById = (model: Model, id: ObjectId | undefined | null): Point | null => {
  if (!id) return null;
  const idx = model.indexById?.point?.[String(id)];
  if (typeof idx === 'number') return model.points[idx] ?? null;
  return model.points.find((p) => p?.id === id) ?? null;
};

// Used by arc helpers to normalize angles into [0, 2π).
export function normalizeAngle(a: number) {
  let ang = a;
  while (ang < 0) ang += Math.PI * 2;
  while (ang >= Math.PI * 2) ang -= Math.PI * 2;
  return ang;
}

// Used by circle tools to build arc keys.
export function arcKey(circleId: ObjectId, startPointId: ObjectId, endPointId: ObjectId) {
  return `${circleId}:${startPointId}:${endPointId}`;
}

// Used by circle tools to map arc indices into keys.
export function arcKeyByIndex(circleId: ObjectId, arcIdx: number, deps: ArcToolsDeps) {
  const arcs = circleArcs(circleId, deps);
  const arc = arcs[arcIdx];
  if (!arc) return `${circleId}:${arcIdx}:0`;
  return arc.key;
}

// Used by circle tools to parse arc keys into circle + segment indices.
export function parseArcKey(
  key: string,
  deps: ArcToolsDeps
): { circle: ObjectId; arcIdx: number; start?: ObjectId; end?: ObjectId } | null {
  const parts = key.split(':');
  if (parts.length < 3) return null;
  const [circle, start, end] = parts;
  if (!circle || !start || !end) return null;
  const arcs = circleArcs(circle, deps);
  const arcIdx = arcs.findIndex((a) => a.startId === start && a.endId === end);
  return { circle, arcIdx: arcIdx >= 0 ? arcIdx : -1, start, end };
}

// Used by circle tools to ensure per-arc style map is aligned to perimeter points.
export function ensureArcStyles(circleId: ObjectId, count: number, deps: ArcToolsDeps) {
  const circleIdx = deps.model.indexById?.circle?.[String(circleId)];
  const circle = typeof circleIdx === 'number' ? deps.model.circles[circleIdx] : null;
  if (!circle) return;
  if (!circle.arcStyles || Array.isArray(circle.arcStyles) || Object.keys(circle.arcStyles).length !== count) {
    const map: Record<string, StrokeStyle> = {};
    const perim = circlePerimeterPoints(deps.model, deps.runtime, circle).slice(0, count);
    for (let i = 0; i < count; i++) {
      const a = perim[i];
      const b = perim[(i + 1) % perim.length];
      const key = arcKey(circleId, a, b);
      map[key] = { ...circle.style };
    }
    circle.arcStyles = map as any;
  }
}

// Used by circle tools to build derived arc list for a circle.
export function circleArcs(circleId: ObjectId, deps: ArcToolsDeps): DerivedArc[] {
  const circleIdx = deps.model.indexById?.circle?.[String(circleId)];
  const circle = typeof circleIdx === 'number' ? deps.model.circles[circleIdx] : null;
  if (!circle) return [];
  const center = getPointById(deps.model, circle.center);
  if (!center) return [];
  const radius = circleRadius(deps.model, deps.runtime, circle);
  if (radius <= 1e-3) return [];
  const pts = circlePerimeterPoints(deps.model, deps.runtime, circle)
    .map((pid) => {
      const p = getPointById(deps.model, pid);
      if (!p) return null;
      const ang = Math.atan2(p.y - center.y, p.x - center.x);
      return { id: pid, ang };
    })
    .filter((v): v is { id: ObjectId; ang: number } => v !== null)
    .sort((a, b) => a.ang - b.ang);
  if (pts.length < 2) return [];
  ensureArcStyles(circleId, pts.length, deps);
  const arcs: DerivedArc[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const start = a.ang;
    const end = b.ang;
    const clockwise = false;
    const startId = a.id;
    const endId = b.id;
    const key = arcKey(circleId, startId, endId);
    const style: StrokeStyle = (circle.arcStyles && (circle.arcStyles as any)[key]) ?? circle.style;
    arcs.push({
      circle: circleId,
      start,
      end,
      clockwise,
      center,
      radius,
      style,
      hidden: style.hidden || circle.style.hidden,
      startId,
      endId,
      key
    });
  }
  return arcs;
}

// Used by angle tools to test if an angle lies on an arc.
export function angleOnArc(test: number, start: number, end: number, clockwise: boolean) {
  const t = normalizeAngle(test);
  const s = normalizeAngle(start);
  const e = normalizeAngle(end);
  if (!clockwise) {
    const span = (e - s + Math.PI * 2) % (Math.PI * 2);
    const pos = (t - s + Math.PI * 2) % (Math.PI * 2);
    return pos <= span + 1e-6;
  }
  const span = (s - e + Math.PI * 2) % (Math.PI * 2);
  const pos = (s - t + Math.PI * 2) % (Math.PI * 2);
  return pos <= span + 1e-6;
}

// Used by hit-testing and selection to find arcs under a point.
export function findArcAt(
  p: { x: number; y: number },
  deps: ArcToolsDeps,
  tolerance: number,
  onlyCircle?: ObjectId
): { circle: ObjectId; arcIdx: number; key?: string } | null {
  for (let ci = deps.model.circles.length - 1; ci >= 0; ci--) {
    const circle = deps.model.circles[ci];
    if (!circle) continue;
    if (onlyCircle !== undefined && circle.id !== onlyCircle) continue;
    if (circle.hidden && !deps.showHidden) continue;
    const arcs = circleArcs(circle.id, deps);
    for (let ai = arcs.length - 1; ai >= 0; ai--) {
      const arc = arcs[ai];
      if (arc.hidden && !deps.showHidden) continue;
      const center = arc.center;
      const dist = Math.hypot(p.x - center.x, p.y - center.y);
      if (Math.abs(dist - arc.radius) > tolerance) continue;
      const ang = Math.atan2(p.y - center.y, p.x - center.x);
      if (angleOnArc(ang, arc.start, arc.end, arc.clockwise)) return { circle: arc.circle, arcIdx: ai, key: arc.key };
    }
  }
  return null;
}
