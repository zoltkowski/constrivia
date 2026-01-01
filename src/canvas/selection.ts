// Used by polygon selection to test if a point is inside a polygon.
function pointInPolygon(point: { x: number; y: number }, vertices: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;
    const intersect = (yi > point.y) !== (yj > point.y)
      && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Used by canvas pointer handlers to select a polygon by fill hit-testing.
export function findPolygonAt(
  p: { x: number; y: number },
  runtime: any,
  showHidden: boolean,
  polygonVerticesOrdered: (polyId: string) => string[]
): string | null {
  const polygons = Object.values(runtime.polygons ?? {});
  for (let i = polygons.length - 1; i >= 0; i--) {
    const poly = polygons[i];
    if (!poly) continue;
    if (poly.hidden && !showHidden) continue;
    const polyId = String(poly.id);
    const verts = polygonVerticesOrdered(polyId);
    if (verts.length < 3) continue;
    const points = verts
      .map((id) => {
        return runtime.points?.[String(id)] ?? null;
      })
      .filter((pt: any) => !!pt);
    if (points.length < 3) continue;
    if (pointInPolygon(p, points)) return polyId;
  }
  return null;
}
