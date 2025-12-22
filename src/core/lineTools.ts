import type { Line, Model, ParallelLineMeta, PerpendicularLineMeta, StrokeStyle } from './runtimeTypes';
import { getPointByRef, resolveLineIndexOrId } from './refactorHelpers';
import { findLineIndexForSegmentFromArrays, findLineIndexForSegmentPure } from './engine';
import { addLineFromPoints } from './engineActions';

export type ParallelLine = Line & { construction_kind: 'parallel'; parallel: ParallelLineMeta };
export type PerpendicularLine = Line & { construction_kind: 'perpendicular'; perpendicular: PerpendicularLineMeta };

// Used by line tools to find an existing line between two points.
export function findLineIndexForSegment(model: Model, aIdx: number, bIdx: number): number | null {
  try {
    const aId = getPointByRef(aIdx, model)?.id;
    const bId = getPointByRef(bIdx, model)?.id;
    if (aId && bId) {
      const byIdIdx = findLineIndexForSegmentFromArrays(model.points as any, model.lines as any, aId, bId);
      if (byIdIdx !== null) return byIdIdx;
    }
  } catch {}
  return findLineIndexForSegmentPure(model.points as any, model.lines as any, aIdx, bIdx);
}

// Used by line tools to normalize line references to numeric indices.
export function resolveLineRefIndex(model: Model, ref: number | string | undefined): number | undefined {
  const res = resolveLineIndexOrId(ref, model as any);
  return typeof res.index === 'number' ? res.index ?? undefined : undefined;
}

// Used by line tools to reuse or create segments between point indices.
export function getOrCreateLineBetweenPoints(model: Model, aIdx: number, bIdx: number, style: StrokeStyle): number {
  const existing = findLineIndexForSegment(model, aIdx, bIdx);
  if (existing !== null) return existing;
  return addLineFromPoints(model, aIdx, bIdx, style);
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
export function pointInLine(idx: number, line: Line): boolean {
  return line.points.includes(idx);
}

// Used by line tools for hit-testing against segments.
export function pointToSegmentDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const l2 = Math.max(1, (b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
  const proj = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}

// Used by line tools to measure the length between defining endpoints.
export function lineLength(model: Model, idx: number): number | null {
  const line = model.lines[idx];
  if (!line || line.points.length < 2) return null;
  const resolveIdx = (ref: any) =>
    typeof ref === 'number' ? ref : (model.indexById?.point?.[String(ref)] ?? -1);
  const aIdx = resolveIdx(line.points[0]);
  const bIdx = resolveIdx(line.points[line.points.length - 1]);
  if (aIdx < 0 || bIdx < 0) return null;
  const a = model.points[aIdx];
  const b = model.points[bIdx];
  if (!a || !b) return null;
  return Math.hypot(b.x - a.x, b.y - a.y);
}
