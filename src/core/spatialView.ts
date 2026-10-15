import type { ConstructionRuntime } from './runtimeTypes';
import type { Mat3, Vec3, SpatialGroup } from './spatialTypes';
import { polyhedronBase } from './polyhedronGeometry';
import { spatialPosition, syncSpatialGeometry } from './spatialGeometry';
import { defaultSpatialOrientation } from './spatialOrientation';
import { cross3, dot3, norm3, polygonNormal3, scale3, sub3 } from './spatialMath';

function solidBaseFrame(runtime: ConstructionRuntime, solidId: string): {
  group: SpatialGroup; u: Vec3; v: Vec3; normal: Vec3;
} | null {
  const solid = runtime.solids?.[solidId];
  const group = solid && runtime.spatialGroups?.[solid.groupId];
  if (!solid || !group) return null;
  let points: Vec3[], normal: Vec3;
  if (solid.polyhedron) {
    const base = polyhedronBase(solid, id => spatialPosition(runtime, id));
    if (!base) return null;
    ({ points, normal } = base);
  } else {
    const base = [0, 1, 3, 2].map(i => spatialPosition(runtime, solid.vertices[i]));
    if (base.some(p => !p)) return null;
    points = base as Vec3[];
    const n = polygonNormal3(points);
    const upper = spatialPosition(runtime, solid.vertices[4]);
    if (!n || !upper) return null;
    normal = dot3(n, sub3(upper, points[0])) < 0 ? scale3(n, -1) : n;
  }
  const edge = sub3(points[1], points[0]);
  const tangent = sub3(edge, scale3(normal, dot3(edge, normal)));
  const length = norm3(tangent);
  if (length < 1e-9) return null;
  const u = scale3(tangent, 1 / length);
  return { group, u, v: cross3(normal, u), normal };
}

function applySpatialView(runtime: ConstructionRuntime, group: SpatialGroup, orientation: Mat3): boolean {
  if (orientation.every((value, i) => Math.abs(value - group.orientation[i]) < 1e-10)) return false;
  group.orientation = orientation;
  syncSpatialGeometry(runtime);
  return true;
}

/** A readable three-quarter view relative to this solid's actual base. */
export function alignSpatialSolidCanonicalView(runtime: ConstructionRuntime, solidId: string): boolean {
  const frame = solidBaseFrame(runtime, solidId);
  if (!frame) return false;
  const { group, u, v, normal } = frame;
  const basis: Mat3 = [u.x, u.y, u.z, v.x, v.y, v.z, normal.x, normal.y, normal.z];
  const view = defaultSpatialOrientation();
  const orientation = view.map((_, i) => [0, 1, 2].reduce((sum, k) =>
    sum + view[Math.floor(i/3)*3+k]*basis[k*3+i%3], 0)) as Mat3;
  return applySpatialView(runtime, group, orientation);
}
