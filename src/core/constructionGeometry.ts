export type Coordinates = { x: number; y: number };

export function hasDistinctPositions(a: Coordinates | null | undefined, b: Coordinates | null | undefined): boolean {
  return !!a && !!b && [a.x, a.y, b.x, b.y].every(Number.isFinite) && Math.hypot(b.x - a.x, b.y - a.y) > 1e-6;
}

/** Initial regular shape only; later edits may freely deform the polygon. */
export function regularPolygonFromBase(a: Coordinates, b: Coordinates, sides: number): Coordinates[] | null {
  if (!hasDistinctPositions(a, b) || !Number.isInteger(sides) || sides < 3) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const apothem = length / (2 * Math.tan(Math.PI / sides));
  const center = { x: (a.x + b.x) / 2 + dy / length * apothem, y: (a.y + b.y) / 2 - dx / length * apothem };
  const radius = length / (2 * Math.sin(Math.PI / sides));
  const start = Math.atan2(a.y - center.y, a.x - center.x);
  return Array.from({ length: sides }, (_, i) => i === 0 ? { ...a } : i === 1 ? { ...b } : {
    x: center.x + radius * Math.cos(start - i * 2 * Math.PI / sides),
    y: center.y + radius * Math.sin(start - i * 2 * Math.PI / sides)
  });
}

/** The same directed sector used by CanvasRenderingContext2D.arc. */
export function angleSectorDegrees(geometry: { start: number; end: number; clockwise: boolean }): number {
  const turn = 2 * Math.PI;
  const diff = geometry.clockwise ? geometry.start - geometry.end : geometry.end - geometry.start;
  return ((diff % turn + turn) % turn) * 180 / Math.PI;
}
