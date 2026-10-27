import type { ConstructionRuntime, ObjectId } from './runtimeTypes';
import { circleInputPointIds, compassSourceLines, resolveCircleGeometry } from './circleGeometry';

type Position = { x: number; y: number };
/** Convert the user's length units per second to unzoomed geometry coordinates. */
export function animationWorldSpeed(speed: number, measurementScale: number | null, visibleWorldWidth: number): number {
  const scale = measurementScale !== null && Number.isFinite(measurementScale) && measurementScale > 0 ? measurementScale : visibleWorldWidth / 3;
  return speed * scale;
}
type InputRef = { kind: 'point' | 'line' | 'circle' | 'angle' | 'polygon'; id: ObjectId };
export type AnimationPath =
  | { kind: 'segment'; endpoints: [ObjectId, ObjectId]; a: Position; b: Position; length: number }
  | { kind: 'circle'; center: Position; radius: number };

/** A run keeps its initial endpoint order even if its supporting segment moves. */
export function pointAnimationPath(runtime: ConstructionRuntime, id: ObjectId, endpoints?: [ObjectId, ObjectId]): AnimationPath | null {
  const point = runtime.points[id];
  if (!point || point.geometryValid === false || point.construction_kind !== 'on_object' || point.spatial ||
    point.symmetry || point.inversionHelper || point.auxiliaryFor || point.perpendicular_helper_for || point.parallel_helper_for ||
    point.parent_refs?.length !== 1 || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const parent = point.parent_refs[0];
  if (parent.kind === 'line') {
    const line = runtime.lines[parent.id];
    if (!line || line.geometryValid === false || !line.leftRay?.hidden || !line.rightRay?.hidden) return null;
    let [first, second] = endpoints ?? line.defining_points;
    let a = runtime.points[first], b = runtime.points[second];
    if (!a || !b || first === id || second === id) return null;
    if (!endpoints && (Math.abs(b.x - a.x) < 1e-9 ? b.y > a.y : b.x < a.x)) {
      [first, second] = [second, first]; [a, b] = [b, a];
    }
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return Number.isFinite(length) && length > 1e-8 ? { kind: 'segment', endpoints: [first, second], a, b, length } : null;
  }
  if (parent.kind === 'circle') {
    const circle = runtime.circles[parent.id];
    if (!circle || circle.geometryValid === false || circleInputPointIds(circle).includes(id)) return null;
    const geometry = resolveCircleGeometry(runtime, circle);
    return geometry ? { kind: 'circle', center: geometry.center, radius: geometry.radius } : null;
  }
  return null;
}

/** Follow defining inputs only: subdivision points do not define their path. */
export function orderAnimationPoints(runtime: ConstructionRuntime, ids: ObjectId[]): ObjectId[] | null {
  const controls = new Set(ids), dependencies = new Map<ObjectId, Set<ObjectId>>();
  const collections = { point: 'points', line: 'lines', circle: 'circles', angle: 'angles', polygon: 'polygons' } as const;
  for (const id of ids) {
    const inputs = new Set<ObjectId>(), seen = new Set<string>();
    const visit = (ref: InputRef) => {
      const key = `${ref.kind}:${ref.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (ref.kind === 'point' && controls.has(ref.id)) { inputs.add(ref.id); return; }
      const collection = collections[ref.kind];
      const object: any = collection && runtime[collection][ref.id];
      if (!object) return;
      const point = (pointId?: string) => { if (pointId) visit({ kind: 'point', id: pointId }); };
      const line = (lineId?: string) => { if (lineId) visit({ kind: 'line', id: lineId }); };
      const anyRef = (input: string) => {
        for (const [kind, name] of Object.entries(collections)) if (runtime[name][input]) visit({ kind, id: input } as InputRef);
      };
      if (object.symmetry) {
        const source = object.symmetry.source;
        const kind = Object.keys(collections).find(kind => collections[kind as keyof typeof collections] === source.collection);
        if (kind) visit({ kind, id: source.id } as InputRef);
        visit(object.symmetry.mirror);
      }
      const inversion = object.inversion ?? object.inversionHelper?.curve ?? object.inversionRegion;
      if (inversion) {
        visit({ kind: inversion.source.collection === 'lines' ? 'line' : inversion.source.collection === 'circles' ? 'circle' : 'polygon', id: inversion.source.id });
        if (inversion.isometry) visit(inversion.isometry); else visit({ kind: 'circle', id: inversion.mirror });
      }
      if (ref.kind === 'point') {
        object.parent_refs?.forEach(visit);
        object.midpointMeta?.parents.forEach(point);
        if (object.symmetricMeta) { point(object.symmetricMeta.source); visit(object.symmetricMeta.mirror); }
        object.commonTangent?.circles.forEach((id: string) => visit({ kind: 'circle', id }));
        const bisect = object.bisectMeta;
        if (bisect) {
          point(bisect.vertex);
          if (bisect.arms) bisect.arms.forEach((arm: any) => arm.kind === 'point' ? point(arm.pointId) : line(arm.lineId));
          else for (const segment of [bisect.seg1, bisect.seg2]) { point(segment?.a); point(segment?.b); line(segment?.lineId); }
        }
        if (object.inversionHelper?.angle) { visit({ kind: 'angle', id: object.inversionHelper.angle }); visit({ kind: 'circle', id: object.inversionHelper.mirror }); }
        const slot = object.boundaryIntersectionSlot;
        const boundary = object.boundaryIntersectionSet ?? (slot && runtime.points[slot.setId]?.boundaryIntersectionSet);
        boundary?.parents.forEach(visit);
      } else if (ref.kind === 'line') {
        object.defining_points?.forEach(point);
        const meta = object.parallel ?? object.perpendicular;
        if (meta) { point(meta.throughPoint); line(meta.referenceLine); meta.referencePoints?.forEach(point); }
        if (object.bisector) { point(object.bisector.vertex); point(object.bisector.bisectPoint); }
      } else if (ref.kind === 'circle') {
        circleInputPointIds(object).forEach(point);
        if (object.compassSource) compassSourceLines(object.compassSource).forEach(source => line(source.lineId));
      } else if (ref.kind === 'angle') {
        point(object.vertex); point(object.point1); point(object.point2); line(object.arm1LineId); line(object.arm2LineId);
        for (const arm of [object.arm1, object.arm2]) if (arm) arm.kind === 'point' ? point(arm.pointId) : line(arm.lineId);
      } else if (ref.kind === 'polygon') {
        object.points?.forEach(point);
      }
      object.defining_parents?.forEach(anyRef);
    };
    runtime.points[id]?.parent_refs?.forEach(visit);
    dependencies.set(id, inputs);
  }
  const ordered: ObjectId[] = [], visiting = new Set<ObjectId>(), done = new Set<ObjectId>();
  const add = (id: ObjectId): boolean => {
    if (done.has(id)) return true;
    if (visiting.has(id)) return false;
    visiting.add(id);
    for (const input of dependencies.get(id) ?? []) if (!add(input)) return false;
    visiting.delete(id); done.add(id); ordered.push(id); return true;
  };
  return ids.every(add) ? ordered : null;
}
