type Coordinates = { x: number; y: number };

/** Solve in a unit line frame, avoiding cancellation in the quadratic discriminant. */
export function stableLineCircleIntersections(a: Coordinates, b: Coordinates, center: Coordinates, radius: number, clampToSegment = true): Coordinates[] {
  if (![a.x, a.y, b.x, b.y, center.x, center.y, radius].every(Number.isFinite) || radius <= 0) return [];
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length === 0) return [];
  const ux = dx / length, uy = dy / length;
  const cx = center.x - a.x, cy = center.y - a.y;
  const along = cx * ux + cy * uy;
  const distance = Math.abs(cx * uy - cy * ux);
  // The circle may itself come from a long construction graph. Tolerate only
  // numerical-scale residuals, including precision lost to a translated origin.
  const coordinateScale = Math.max(1, Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y), Math.abs(center.x), Math.abs(center.y), length);
  const tolerance = 1e-10 * Math.max(1, radius) + 64 * Number.EPSILON * coordinateScale;
  if (distance > radius + tolerance) return [];
  const tangent = Math.abs(distance - radius) <= tolerance;
  const offset = tangent ? 0 : Math.sqrt((radius - distance) * (radius + distance));
  const parameters = tangent ? [along] : [along - offset, along + offset];
  return parameters.filter(t => !clampToSegment || (t >= -tolerance && t <= length + tolerance)).map(t => {
    const distanceAlong = clampToSegment ? Math.max(0, Math.min(length, t)) : t;
    return { x: a.x + ux * distanceAlong, y: a.y + uy * distanceAlong };
  });
}
