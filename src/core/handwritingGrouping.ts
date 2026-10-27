import { createObjectGroup, groupCollections, groupForObject, type GroupSelection } from './objectGroups';
import type { ConstructionRuntime, InkStrokeRuntime } from './runtimeTypes';

type Bounds = { left: number; right: number; top: number; bottom: number };
type RecentStroke = { id: string; finishedAt: number; groupId?: string };

function bounds(strokes: InkStrokeRuntime[], zoom: number): Bounds | null {
  const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const stroke of strokes) for (const p of stroke.points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    box.left = Math.min(box.left, p.x * zoom); box.right = Math.max(box.right, p.x * zoom);
    box.top = Math.min(box.top, p.y * zoom); box.bottom = Math.max(box.bottom, p.y * zoom);
  }
  return Number.isFinite(box.left) ? box : null;
}

/** Conservatively join consecutive strokes on the same line of handwriting. */
export function handwritingBoxesAdjacent(a: Bounds, b: Bounds) {
  const dx = Math.max(0, a.left - b.right, b.left - a.right);
  const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
  const height = Math.max(a.bottom - a.top, b.bottom - b.top, 8);
  const smallerHeight = Math.min(a.bottom - a.top, b.bottom - b.top);
  const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  // Letters need a shared writing line. Small marks can sit above/below it.
  if (smallerHeight > 8 && overlap < smallerHeight * .25) return false;
  const horizontal = Math.min(10, 3 + height * .35);
  const vertical = Math.min(8, Math.max(6, 3 + height * .3));
  return dx <= horizontal && dy <= vertical && (dx === 0 || dy === 0 || Math.hypot(dx, dy) <= Math.max(7, height * .45));
}

export class HandwritingGrouper {
  private recent: RecentStroke | null = null;
  reset() { this.recent = null; }

  finish(runtime: ConstructionRuntime, stroke: InkStrokeRuntime, zoom: number, now: number, startedAt = now) {
    const previous = this.recent;
    this.recent = { id: stroke.id, finishedAt: now };
    if (!previous || startedAt - previous.finishedAt > 6000 || startedAt < previous.finishedAt || now < startedAt || !(zoom > 0)) return;
    const old = runtime.inkStrokes[previous.id];
    if (!old || old.hidden || stroke.hidden || old.color !== stroke.color || old.opacity !== stroke.opacity || old.baseWidth !== stroke.baseWidth) return;
    const group = groupForObject(runtime, 'inkStrokes', previous.id);
    if (previous.groupId !== group?.id) return;
    if (group && (group.id !== previous.groupId || group.locked || groupCollections.some(key => key !== 'inkStrokes' && (group.members[key]?.length ?? 0) > 0))) return;
    const members = group ? (group.members.inkStrokes ?? []).map(id => runtime.inkStrokes[id]).filter(Boolean) : [old];
    const a = bounds(members, zoom), b = bounds([stroke], zoom);
    if (!a || !b || !handwritingBoxesAdjacent(a, b)) return;
    const selection = Object.fromEntries(groupCollections.map(key => [key, new Set<string>()])) as GroupSelection;
    selection.inkStrokes.add(old.id); selection.inkStrokes.add(stroke.id);
    const created = createObjectGroup(runtime, selection);
    if (created) this.recent.groupId = created.id;
  }
}
