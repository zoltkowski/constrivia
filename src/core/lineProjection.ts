import type { Point } from '../types';

type LineLike = {
  id?: string;
  points: number[];
  defining_points: number[];
};

type Predicate = (idx: number, p: Point | undefined) => boolean;

export function recomputeLinePointsWithReferences(
  points: Point[],
  line: LineLike,
  includeExtra?: Predicate
): Array<{ idx: number; pos: { x: number; y: number } }> | null {
  if (!line || !Array.isArray(line.points) || line.points.length < 2) return null;
  const firstIdx = line.points.find((idx) => !!points[idx]);
  const lastIdx = [...line.points].reverse().find((idx) => !!points[idx]);
  if (firstIdx === undefined || lastIdx === undefined) return null;
  const a = points[firstIdx];
  const b = points[lastIdx];
  if (!a || !b) return null;
  const dirVec = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(dirVec.x, dirVec.y) || 1;
  const dir = { x: dirVec.x / len, y: dirVec.y / len };
  const base = a;

  const projections: { idx: number; proj: number }[] = [];
  const addIdx = (idx: number) => {
    if (projections.some((p) => p.idx === idx)) return;
    const p = points[idx];
    if (!p) return;
    projections.push({ idx, proj: (p.x - base.x) * dir.x + (p.y - base.y) * dir.y });
  };

  line.points.forEach(addIdx);
  if (includeExtra) {
    points.forEach((p, idx) => {
      if (!p) return;
      if (includeExtra(idx, p)) addIdx(idx);
    });
  }
  if (!projections.length) return null;

  const skip = new Set(line.defining_points || []);
  return projections
    .filter((p) => !skip.has(p.idx))
    .map(({ idx, proj }) => ({
      idx,
      pos: { x: base.x + dir.x * proj, y: base.y + dir.y * proj }
    }));
}
