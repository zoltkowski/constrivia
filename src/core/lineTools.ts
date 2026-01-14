import type { ConstructionRuntime, Line, ObjectId, ParallelLineMeta, PerpendicularLineMeta, StrokeStyle } from './runtimeTypes';
import { addLineFromPoints } from './engineActions';

export type ParallelLine = Line & { construction_kind: 'parallel'; parallel: ParallelLineMeta };
export type PerpendicularLine = Line & { construction_kind: 'perpendicular'; perpendicular: PerpendicularLineMeta };

// Used by line tools to find an existing line between two point ids.
export function findLineIdForSegment(runtime: ConstructionRuntime, aId: ObjectId, bId: ObjectId): ObjectId | null {
  const a = String(aId);
  const b = String(bId);
  for (const line of Object.values(runtime.lines)) {
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
export function getOrCreateLineBetweenPoints(runtime: ConstructionRuntime, aId: ObjectId, bId: ObjectId, style: StrokeStyle): ObjectId {
  const existing = findLineIdForSegment(runtime, aId, bId);
  if (existing) return existing;
  return addLineFromPoints(runtime, aId, bId, style);
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

// Used by line tools to find all lines that include a point id.
export function linesContainingPoint(runtime: ConstructionRuntime, pointId: ObjectId): ObjectId[] {
  if (!pointId) return [];
  const res: ObjectId[] = [];
  for (const line of Object.values(runtime.lines)) {
    if (line.points.includes(pointId)) res.push(line.id);
  }
  return res;
}

// Used by line tools for hit-testing against segments.
export function pointToSegmentDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const l2 = Math.max(1, (b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
  const proj = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}

// Used by line tools to measure the length between defining endpoints.
export function lineLength(runtime: ConstructionRuntime, lineId: ObjectId): number | null {
  const line = runtime.lines[String(lineId)];
  if (!line || line.points.length < 2) return null;
  const a = runtime.points[String(line.points[0])];
  const b = runtime.points[String(line.points[line.points.length - 1])];
  if (!a || !b) return null;
  return Math.hypot(b.x - a.x, b.y - a.y);
}
