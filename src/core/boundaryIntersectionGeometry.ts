import type { EnginePolygon, EngineState } from './engineModel';
import type { BoundaryIntersectionParent, ObjectId } from './runtimeTypes';

export type BoundaryIntersectionCoordinates = { x: number; y: number };
type Vec = BoundaryIntersectionCoordinates;
const EPS = 1e-8;
const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
const subtract = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const finite = (p: Vec | undefined): p is Vec => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

function polygonVertices(engine: EngineState, polygon: EnginePolygon): Vec[] | null {
  if (polygon.points.length < 3) return null;
  const points = polygon.points.map(id => engine.points[id]);
  if (points.some(point => !point || !finite(point))) return null;
  const vertices = points.map(point => ({ x: point!.x, y: point!.y }));
  const last = vertices[vertices.length - 1];
  if (vertices.length > 3 && Math.hypot(vertices[0].x - last.x, vertices[0].y - last.y) <= EPS) vertices.pop();
  return vertices.length >= 3 ? vertices : null;
}

function pointOnSegment(point: Vec, a: Vec, b: Vec, tolerance: number): boolean {
  const ab = subtract(b, a), ap = subtract(point, a);
  const scale = Math.max(1, Math.hypot(ab.x, ab.y));
  if (Math.abs(cross(ab, ap)) > tolerance * scale) return false;
  const projection = ap.x * ab.x + ap.y * ab.y;
  return projection >= -tolerance * scale && projection <= ab.x * ab.x + ab.y * ab.y + tolerance * scale;
}

function segmentIntersections(a: Vec, b: Vec, c: Vec, d: Vec): Vec[] {
  const r = subtract(b, a), s = subtract(d, c), q = subtract(c, a);
  const rLength = Math.hypot(r.x, r.y), sLength = Math.hypot(s.x, s.y);
  const denominator = cross(r, s);
  const coordinateScale = Math.max(1, Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y), Math.abs(c.x), Math.abs(c.y), Math.abs(d.x), Math.abs(d.y));
  const distanceTolerance = Math.max(EPS * Math.max(1, sLength), Number.EPSILON * coordinateScale * 16);
  if (Math.abs(denominator) <= EPS * rLength * sLength) {
    if (Math.abs(cross(q, r)) > distanceTolerance * rLength) return [];
    return [a, b, c, d].filter((point, index, all) =>
      all.findIndex(other => Math.hypot(point.x - other.x, point.y - other.y) <= distanceTolerance) === index &&
      pointOnSegment(point, a, b, distanceTolerance) && pointOnSegment(point, c, d, distanceTolerance));
  }
  const t = cross(q, s) / denominator, u = cross(q, r) / denominator;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return [];
  const bounded = Math.max(0, Math.min(1, t));
  return [{ x: a.x + r.x * bounded, y: a.y + r.y * bounded }];
}

function lineSegmentIntersections(lineA: Vec, lineB: Vec, a: Vec, b: Vec): Vec[] {
  const r = subtract(lineB, lineA), s = subtract(b, a), q = subtract(a, lineA);
  const rLength = Math.hypot(r.x, r.y), sLength = Math.hypot(s.x, s.y);
  const denominator = cross(r, s);
  const coordinateScale = Math.max(1, Math.abs(lineA.x), Math.abs(lineA.y), Math.abs(lineB.x), Math.abs(lineB.y), Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y));
  const distanceTolerance = Math.max(EPS * Math.max(1, sLength), Number.EPSILON * coordinateScale * 16);
  if (Math.abs(denominator) <= EPS * rLength * sLength) {
    return Math.abs(cross(q, r)) <= distanceTolerance * rLength ? [a, b] : [];
  }
  const u = cross(q, r) / denominator;
  if (u < -EPS || u > 1 + EPS) return [];
  const bounded = Math.max(0, Math.min(1, u));
  return [{ x: a.x + s.x * bounded, y: a.y + s.y * bounded }];
}

function deduplicate(points: Vec[]): Vec[] {
  const sorted = points.filter(finite).sort((a, b) => a.x - b.x || a.y - b.y);
  const unique: Vec[] = [];
  for (const point of sorted) {
    const coordinateScale = Math.max(1, Math.abs(point.x), Math.abs(point.y));
    const tolerance = Math.max(EPS, Number.EPSILON * coordinateScale * 16);
    if (!unique.some(other => Math.hypot(point.x - other.x, point.y - other.y) <= tolerance)) unique.push(point);
  }
  return unique;
}

/** All unique finite boundary hits for a polygon and an infinite line, or two polygons. */
export function polygonBoundaryIntersections(
  engine: EngineState,
  parents: [BoundaryIntersectionParent, BoundaryIntersectionParent]
): Vec[] {
  const polygonRefs = parents.filter(parent => parent.kind === 'polygon');
  if (polygonRefs.length !== 1 && polygonRefs.length !== 2) return [];
  const polygons = polygonRefs.map(ref => engine.polygons[ref.id]);
  if (polygons.some(polygon => !polygon)) return [];
  const vertices = polygons.map(polygon => polygonVertices(engine, polygon!));
  if (vertices.some(points => !points)) return [];
  const result: Vec[] = [];
  if (polygonRefs.length === 1) {
    const lineRef = parents.find(parent => parent.kind === 'line')!;
    const line = engine.lines[lineRef.id];
    if (!line) return [];
    const a = engine.points[line.defining_points?.[0] ?? line.points[0]];
    const b = engine.points[line.defining_points?.[1] ?? line.points[line.points.length - 1]];
    if (!finite(a) || !finite(b) || Math.hypot(a.x - b.x, a.y - b.y) <= EPS) return [];
    const boundary = vertices[0]!;
    for (let i = 0; i < boundary.length; i++) result.push(...lineSegmentIntersections(a, b, boundary[i], boundary[(i + 1) % boundary.length]));
  } else {
    const first = vertices[0]!, second = vertices[1]!;
    for (let i = 0; i < first.length; i++) for (let j = 0; j < second.length; j++) {
      result.push(...segmentIntersections(first[i], first[(i + 1) % first.length], second[j], second[(j + 1) % second.length]));
    }
  }
  return deduplicate(result);
}

/** Match existing outputs to unique nearby hits so labels keep their branches while shapes move. */
export function assignBoundaryIntersectionBranches(
  points: readonly { id: ObjectId; x: number; y: number }[],
  solutions: readonly Vec[]
): { id: ObjectId; position: Vec | null }[] {
  const result = new Map<ObjectId, Vec>();
  const pairs = points.flatMap(point => solutions.map((solution, index) => ({
    id: point.id, index, distance: Math.hypot(point.x - solution.x, point.y - solution.y), solution
  }))).sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : a.index - b.index));
  const usedIds = new Set<ObjectId>(), usedSolutions = new Set<number>();
  for (const pair of pairs) {
    if (usedIds.has(pair.id) || usedSolutions.has(pair.index)) continue;
    result.set(pair.id, pair.solution);
    usedIds.add(pair.id);
    usedSolutions.add(pair.index);
  }
  return points.map(point => ({ id: point.id, position: result.get(point.id) ?? null }));
}
