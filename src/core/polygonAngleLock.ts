type Point = { x: number; y: number };
const EPS = 1e-6;

// Keep the opposite vertex fixed. Each chain to it must absorb the same
// displacement with opposite sign, by changing lengths along its edge directions.
export function resizeWithFixedAngles(points: readonly Point[], vertex: number, target: Point): Point[] | null {
  const count = points.length;
  if (count < 4 || vertex < 0 || vertex >= count) return null;
  const ordered = points.map((_, i) => points[(vertex + i) % count]);
  const edges = ordered.map((a, i) => {
    const b = ordered[(i + 1) % count];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: (b.x - a.x) / length, y: (b.y - a.y) / length, length };
  });
  if (edges.some(edge => edge.length <= EPS)) return null;
  const middle = Math.floor(count / 2);
  const displacement = { x: target.x - ordered[0].x, y: target.y - ordered[0].y };

  function adjustLengths(start: number, end: number, sign: number): number[] | null {
    const chain = edges.slice(start, end);
    let xx = 0, xy = 0, yy = 0;
    for (const edge of chain) {
      xx += edge.x * edge.x;
      xy += edge.x * edge.y;
      yy += edge.y * edge.y;
    }
    const determinant = xx * yy - xy * xy;
    if (determinant <= EPS) return null;
    const x = sign * (yy * displacement.x - xy * displacement.y) / determinant;
    const y = sign * (xx * displacement.y - xy * displacement.x) / determinant;
    return chain.map(edge => edge.length + edge.x * x + edge.y * y);
  }

  const first = adjustLengths(0, middle, -1);
  const second = adjustLengths(middle, count, 1);
  if (!first || !second) return null;
  const lengths = [...first, ...second];
  if (lengths.some(length => !Number.isFinite(length) || length <= EPS)) return null;
  const result: Point[] = [];
  let position = target;
  for (let i = 0; i < count; i++) {
    if (i === middle) position = ordered[middle];
    result[(vertex + i) % count] = position;
    position = { x: position.x + edges[i].x * lengths[i], y: position.y + edges[i].y * lengths[i] };
  }
  return result;
}
