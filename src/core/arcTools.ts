import type { Circle, Model, StrokeStyle } from './runtimeTypes';
import { getPointByRef } from './refactorHelpers';
import { circlePerimeterPoints, circleRadius } from './circleTools';

export type DerivedArc = {
  circle: number;
  start: number;
  end: number;
  clockwise: boolean;
  center: { x: number; y: number };
  radius: number;
  style: StrokeStyle;
  hidden?: boolean;
  startIdx: number;
  endIdx: number;
  key: string;
};

export type ArcToolsDeps = {
  model: Model;
  runtime: any;
  showHidden: boolean;
};

// Used by arc helpers to normalize angles into [0, 2π).
export function normalizeAngle(a: number) {
  let ang = a;
  while (ang < 0) ang += Math.PI * 2;
  while (ang >= Math.PI * 2) ang -= Math.PI * 2;
  return ang;
}

// Used by circle tools to build arc keys.
export function arcKey(circleIdx: number, startPointIdx: number, endPointIdx: number) {
  return `${circleIdx}:${startPointIdx}:${endPointIdx}`;
}

// Used by circle tools to map arc indices into keys.
export function arcKeyByIndex(circleIdx: number, arcIdx: number, deps: ArcToolsDeps) {
  const arcs = circleArcs(circleIdx, deps);
  const arc = arcs[arcIdx];
  if (!arc) return `${circleIdx}:${arcIdx}:0`;
  return arc.key;
}

// Used by circle tools to parse arc keys into circle + segment indices.
export function parseArcKey(key: string, deps: ArcToolsDeps): { circle: number; arcIdx: number; start?: number; end?: number } | null {
  const parts = key.split(':').map((v) => Number(v));
  if (parts.length < 3) return null;
  const [c, s, e] = parts;
  if (!Number.isFinite(c) || !Number.isFinite(s) || !Number.isFinite(e)) return null;
  const arcs = circleArcs(c, deps);
  const arcIdx = arcs.findIndex((a) => a.startIdx === s && a.endIdx === e);
  return { circle: c, arcIdx: arcIdx >= 0 ? arcIdx : -1, start: s, end: e };
}

// Used by circle tools to ensure per-arc style map is aligned to perimeter points.
export function ensureArcStyles(circleIdx: number, count: number, deps: ArcToolsDeps) {
  const circle = deps.model.circles[circleIdx];
  if (!circle) return;
  if (!circle.arcStyles || Array.isArray(circle.arcStyles) || Object.keys(circle.arcStyles).length !== count) {
    const map: Record<string, StrokeStyle> = {};
    const perim = circlePerimeterPoints(deps.model, deps.runtime, circle).slice(0, count);
    for (let i = 0; i < count; i++) {
      const a = perim[i];
      const b = perim[(i + 1) % perim.length];
      const key = arcKey(circleIdx, a, b);
      map[key] = { ...circle.style };
    }
    circle.arcStyles = map as any;
  }
}

// Used by circle tools to build derived arc list for a circle.
export function circleArcs(circleIdx: number, deps: ArcToolsDeps): DerivedArc[] {
  const circle = deps.model.circles[circleIdx];
  if (!circle) return [];
  const center = getPointByRef(circle.center, deps.model);
  if (!center) return [];
  const radius = circleRadius(deps.model, deps.runtime, circle);
  if (radius <= 1e-3) return [];
  const pts = circlePerimeterPoints(deps.model, deps.runtime, circle)
    .map((pi) => {
      const p = getPointByRef(pi, deps.model);
      if (!p) return null;
      const ang = Math.atan2(p.y - center.y, p.x - center.x);
      return { idx: pi, ang };
    })
    .filter((v): v is { idx: number; ang: number } => v !== null)
    .sort((a, b) => a.ang - b.ang);
  if (pts.length < 2) return [];
  ensureArcStyles(circleIdx, pts.length, deps);
  const arcs: DerivedArc[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const start = a.ang;
    const end = b.ang;
    const clockwise = false;
    const startIdx = a.idx;
    const endIdx = b.idx;
    const key = arcKey(circleIdx, startIdx, endIdx);
    const style: StrokeStyle = (circle.arcStyles && (circle.arcStyles as any)[key]) ?? circle.style;
    arcs.push({
      circle: circleIdx,
      start,
      end,
      clockwise,
      center,
      radius,
      style,
      hidden: style.hidden || circle.style.hidden,
      startIdx,
      endIdx,
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
  onlyCircle?: number
): { circle: number; arcIdx: number; key?: string } | null {
  for (let ci = deps.model.circles.length - 1; ci >= 0; ci--) {
    if (onlyCircle !== undefined && ci !== onlyCircle) continue;
    if (deps.model.circles[ci].hidden && !deps.showHidden) continue;
    const arcs = circleArcs(ci, deps);
    for (let ai = arcs.length - 1; ai >= 0; ai--) {
      const arc = arcs[ai];
      if (arc.hidden && !deps.showHidden) continue;
      const center = arc.center;
      const dist = Math.hypot(p.x - center.x, p.y - center.y);
      if (Math.abs(dist - arc.radius) > tolerance) continue;
      const ang = Math.atan2(p.y - center.y, p.x - center.x);
      if (angleOnArc(ang, arc.start, arc.end, arc.clockwise)) return { circle: ci, arcIdx: ai, key: arc.key };
    }
  }
  return null;
}
