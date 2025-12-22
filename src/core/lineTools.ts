import type { Line, Model, ObjectId, ParallelLineMeta, PerpendicularLineMeta, StrokeStyle } from './runtimeTypes';
import { addLineFromPoints } from './engineActions';

export type ParallelLine = Line & { construction_kind: 'parallel'; parallel: ParallelLineMeta };
export type PerpendicularLine = Line & { construction_kind: 'perpendicular'; perpendicular: PerpendicularLineMeta };

// Used by line tools to find an existing line between two point ids.
export function findLineIdForSegment(model: Model, aId: ObjectId, bId: ObjectId): ObjectId | null {
  const a = String(aId);
  const b = String(bId);
  for (const line of model.lines) {
    const pts = (line.points || []).map((pid) => String(pid));
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      if ((p1 === a && p2 === b) || (p1 === b && p2 === a)) return line.id;
    }
  }
  return null;
}

// Used by line tools to reuse or create segments between point ids.
export function getOrCreateLineBetweenPoints(model: Model, aId: ObjectId, bId: ObjectId, style: StrokeStyle): ObjectId {
  const existing = findLineIdForSegment(model, aId, bId);
  if (existing) return existing;
  return addLineFromPoints(model, aId, bId, style);
}

// Used by line tools to check whether a line is parallel.
export const isParallelLine = (line: Line | null | undefined): line is ParallelLine =>
  !!line && line.construction_kind === 'parallel' && !!line.parallel;

// Used by line tools to check whether a line is perpendicular.
export const isPerpendicularLine = (line: Line | null | undefined): line is PerpendicularLine =>
  !!line && line.construction_kind === 'perpendicular' && !!line.perpendicular;

// Used by line tools to decide if a line is draggable in UI.
export const isLineDraggable = (line: Line | null | undefined): boolean =>
  !line ||
  ((line.construction_kind !== 'parallel' && line.construction_kind !== 'perpendicular') && !(line as any)?.bisector);

// Used by line tools to test if a point index belongs to a line.
export function pointInLine(id: ObjectId, line: Line): boolean {
  return line.points.includes(id);
}

// Used by line tools for hit-testing against segments.
export function pointToSegmentDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const l2 = Math.max(1, (b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
  const proj = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}

// Used by line tools to measure the length between defining endpoints.
export function lineLength(model: Model, lineId: ObjectId): number | null {
  const lineIdx = model.indexById?.line?.[String(lineId)] ?? -1;
  const line = lineIdx >= 0 ? model.lines[lineIdx] : model.lines.find((l) => l?.id === lineId);
  if (!line || line.points.length < 2) return null;
  const aIdx = model.indexById?.point?.[String(line.points[0])] ?? -1;
  const bIdx = model.indexById?.point?.[String(line.points[line.points.length - 1])] ?? -1;
  if (aIdx < 0 || bIdx < 0) return null;
  const a = model.points[aIdx];
  const b = model.points[bIdx];
  if (!a || !b) return null;
  return Math.hypot(b.x - a.x, b.y - a.y);
}
