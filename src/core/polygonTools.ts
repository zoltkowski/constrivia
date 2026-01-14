import type { ConstructionRuntime, ObjectId, Point, Polygon } from './runtimeTypes';
import type { LineHit } from './hitTypes';
import { polygonVerticesFromPolyRuntime, polygonVerticesOrderedFromPolyRuntime } from './engine';
import { findLineIdForSegment } from './lineTools';
import { segmentKey } from './segmentKeys';

// Used by polygon tools.
export function polygonCentroid(runtime: ConstructionRuntime, polyId: ObjectId): { x: number; y: number } | null {
  const verts = polygonVertices(runtime, polyId);
  if (!verts.length) return null;
  const sum = verts.reduce(
    (acc, vi) => {
      const p = runtime.points[String(vi)];
      return p ? { x: acc.x + p.x, y: acc.y + p.y } : acc;
    },
    { x: 0, y: 0 }
  );
  return { x: sum.x / verts.length, y: sum.y / verts.length };
}

// Used by polygon tools.
export function polygonForLine(runtime: ConstructionRuntime, lineId: ObjectId): string | null {
  if (!lineId) return null;
  for (const poly of Object.values(runtime.polygons)) {
    if (poly && polygonHasLine(runtime, poly.id, lineId)) return String(poly.id);
  }
  return null;
}

// Used by polygon tools to resolve a polygon by one of its vertex points.
export function polygonForPoint(runtime: ConstructionRuntime, pointId: ObjectId): string | null {
  if (!pointId) return null;
  const key = String(pointId);
  for (const poly of Object.values(runtime.polygons)) {
    if (poly && polygonHasPoint(key, poly)) return String(poly.id);
  }
  return null;
}

// Used by polygon tools to test hit against polygon interior.
export function polygonContainsPoint(
  runtime: ConstructionRuntime,
  polyId: ObjectId,
  pos: { x: number; y: number }
): boolean {
  const verts = polygonVerticesOrdered(runtime, polyId)
    .map((id) => runtime.points[String(id)])
    .filter((p) => !!p) as Array<{ x: number; y: number }>;
  if (verts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x;
    const yi = verts[i].y;
    const xj = verts[j].x;
    const yj = verts[j].y;
    const intersect = (yi > pos.y) !== (yj > pos.y) &&
      pos.x < ((xj - xi) * (pos.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonAtPoint(
  runtime: ConstructionRuntime,
  pos: { x: number; y: number },
  opts: { includeHidden?: boolean } = {}
): string | null {
  const includeHidden = !!opts.includeHidden;
  for (const poly of Object.values(runtime.polygons)) {
    if (!poly) continue;
    if (poly.hidden && !includeHidden) continue;
    if (polygonContainsPoint(runtime, poly.id, pos)) return String(poly.id);
  }
  return null;
}

// Used by hit-testing and selection.
export function polygonForLineHit(runtime: ConstructionRuntime, hit: LineHit | null): string | null {
  if (!hit || hit.part !== 'segment') return null;
  const line = runtime.lines[String(hit.lineId)];
  if (!line) return null;
  const linePointIds = line.points.map((pid) => String(pid));
  for (const poly of Object.values(runtime.polygons)) {
    if (!poly || !Array.isArray(poly.points) || poly.points.length < 2) continue;
    const verts = poly.points.map((pid) => String(pid));
    for (let i = 0; i < verts.length; i++) {
      const v1 = verts[i];
      const v2 = verts[(i + 1) % verts.length];
      if (!v1 || !v2 || v1 === v2) continue;
      const idxA = linePointIds.indexOf(v1);
      const idxB = linePointIds.indexOf(v2);
      if (idxA === -1 || idxB === -1) continue;
      const minIdx = Math.min(idxA, idxB);
      const maxIdx = Math.max(idxA, idxB);
      if (hit.seg >= minIdx && hit.seg < maxIdx) return String(poly.id);
    }
  }
  return null;
}

// Used by polygon tools.
export function polygonHasPoint(pointId: string, poly: Polygon | undefined): boolean {
  if (!poly) return false;
  return Array.isArray(poly.points) && poly.points.includes(pointId);
}

// Used by polygon tools.
export function polygonVertices(runtime: ConstructionRuntime, polyId: ObjectId): string[] {
  const poly = runtime.polygons[String(polyId)];
  if (!poly) return [];
  const runtimeIds = polygonVerticesFromPolyRuntime(poly as any, runtime);
  if (runtimeIds.length) return runtimeIds.map((id) => String(id));
  return Array.isArray(poly.points) ? Array.from(new Set(poly.points.map((id) => String(id)))) : [];
}

// Used by polygon tools.
export function polygonVerticesOrdered(runtime: ConstructionRuntime, polyId: ObjectId): string[] {
  const poly = runtime.polygons[String(polyId)];
  if (!poly) return [];
  const orderedRuntime = polygonVerticesOrderedFromPolyRuntime(poly as any, runtime);
  const ordered = orderedRuntime.length ? orderedRuntime : (Array.isArray(poly.points) ? poly.points : []);
  if (!ordered || ordered.length === 0) return [];
  const pts = ordered
    .map((id) => ({ id: String(id), p: runtime.points[String(id)] }))
    .filter((v) => !!v.p) as { id: string; p: Point }[];
  if (!pts.length) return [];
  const centroid = { x: pts.reduce((s, v) => s + v.p.x, 0) / pts.length, y: pts.reduce((s, v) => s + v.p.y, 0) / pts.length };
  pts.sort((a, b) => Math.atan2(a.p.y - centroid.y, a.p.x - centroid.x) - Math.atan2(b.p.y - centroid.y, b.p.x - centroid.x));
  const startIdx = pts.reduce((best, cur, i) => {
    const bestPt = pts[best].p;
    const curPt = cur.p;
    if (curPt.y > bestPt.y + 1e-6) return i;
    if (Math.abs(curPt.y - bestPt.y) < 1e-6 && curPt.x < bestPt.x) return i;
    return best;
  }, 0);
  const out: string[] = [];
  for (let i = 0; i < pts.length; i++) out.push(pts[(startIdx - i + pts.length) % pts.length].id);
  return out;
}

// Used by polygon tools to map polygon edges to line segment keys.
export function polygonEdgeSegmentKeys(runtime: ConstructionRuntime, polyId: ObjectId): Set<string> {
  const keys = new Set<string>();
  const verts = polygonVertices(runtime, polyId).map((v) => String(v));
  if (verts.length < 2) return keys;
  for (let i = 0; i < verts.length; i++) {
    const v1 = verts[i];
    const v2 = verts[(i + 1) % verts.length];
    if (!v1 || !v2 || v1 === v2) continue;
    const lineId = findLineIdForSegment(runtime, v1, v2) ?? findLineIdContainingPoints(runtime, v1, v2);
    if (!lineId) continue;
    const line = runtime.lines[String(lineId)];
    if (!line || !Array.isArray(line.points) || line.points.length < 2) continue;
    const linePointIds = line.points.map((pid) => String(pid));
    const idxA = linePointIds.indexOf(v1);
    const idxB = linePointIds.indexOf(v2);
    if (idxA === -1 || idxB === -1) continue;
    const minIdx = Math.min(idxA, idxB);
    const maxIdx = Math.max(idxA, idxB);
    for (let s = minIdx; s < maxIdx; s++) keys.add(segmentKey(String(lineId), 'segment', s));
  }
  return keys;
}

// Used by polygon tools.
export function polygonLines(runtime: ConstructionRuntime, polyId: ObjectId): string[] {
  const poly = runtime.polygons[String(polyId)];
  if (!poly) return [];
  const verts = polygonVertices(runtime, polyId);
  if (verts && verts.length) {
    const out: string[] = [];
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      const li = findLineIdForSegment(runtime, a, b) ?? findLineIdContainingPoints(runtime, a, b);
      if (li) out.push(String(li));
    }
    return out;
  }
  return [];
}

// Used by polygon tools.
export function polygonHasLine(runtime: ConstructionRuntime, polyId: ObjectId, lineId: ObjectId): boolean {
  return polygonLines(runtime, polyId).includes(String(lineId));
}

const findLineIdContainingPoints = (runtime: ConstructionRuntime, aId: ObjectId, bId: ObjectId): string | null => {
  const a = String(aId);
  const b = String(bId);
  for (const line of Object.values(runtime.lines)) {
    const pts = line.points.map((pid) => String(pid));
    if (pts.includes(a) && pts.includes(b)) return String(line.id);
  }
  return null;
};
