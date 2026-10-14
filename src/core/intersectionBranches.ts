import type { Coordinates } from './engine';

type IntersectionPoint = Coordinates & { id: string };

/** Assign both solutions together so coincident branches can separate again. */
export function assignIntersectionBranches(
  points: readonly IntersectionPoint[],
  solutions: readonly Coordinates[]
): { id: string; position: Coordinates | null }[] {
  const ordered = points.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (!solutions.length) return ordered.map(p => ({ id: p.id, position: null }));
  if (solutions.length === 1 || (solutions.length > 1 && Math.hypot(solutions[0].x - solutions[1].x, solutions[0].y - solutions[1].y) < 1e-6)) {
    return ordered.map(p => ({ id: p.id, position: solutions[0] }));
  }
  const distance = (a: Coordinates, b: Coordinates) => Math.hypot(a.x - b.x, a.y - b.y);
  if (ordered.length === 1) {
    const [point] = ordered;
    return [{ id: point.id, position: distance(point, solutions[0]) <= distance(point, solutions[1]) ? solutions[0] : solutions[1] }];
  }
  const [a, b] = ordered;
  const keepOrder = distance(a, solutions[0]) + distance(b, solutions[1]) <= distance(a, solutions[1]) + distance(b, solutions[0]);
  return ordered.map((p, i) => ({ id: p.id, position: i < 2 ? solutions[keepOrder ? i : 1 - i] : null }));
}
