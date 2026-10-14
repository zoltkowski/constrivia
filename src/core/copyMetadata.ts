import type { AngleArm, ConstructionParent, FreeLabel, LabelRuntime, LineRuntime, ObjectId, PointRuntime } from './runtimeTypes';

export interface CopyIdMaps {
  points: ReadonlyMap<ObjectId, ObjectId>;
  lines: ReadonlyMap<ObjectId, ObjectId>;
  circles: ReadonlyMap<ObjectId, ObjectId>;
}

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function remapAngleArm(arm: AngleArm, maps: CopyIdMaps): AngleArm {
  return arm.kind === 'point' ? { ...arm, pointId: maps.points.get(arm.pointId) ?? arm.pointId }
    : { ...arm, lineId: maps.lines.get(arm.lineId) ?? arm.lineId };
}

function remapAnyId(id: ObjectId, maps: CopyIdMaps): ObjectId {
  return maps.points.get(id) ?? maps.lines.get(id) ?? maps.circles.get(id) ?? id;
}

export function remapCopiedObjectIds(ids: ObjectId[], maps: CopyIdMaps): ObjectId[] {
  return ids.map((id) => remapAnyId(id, maps));
}

function remapParentRef(parent: ConstructionParent, maps: CopyIdMaps): ConstructionParent {
  const id = parent.kind === 'point'
    ? maps.points.get(parent.id)
    : parent.kind === 'line'
      ? maps.lines.get(parent.id)
      : maps.circles.get(parent.id);
  return { ...parent, id: id ?? parent.id };
}

/** Clone a copied point and remap its internal dependency references. */
export function remapCopiedPointMetadata<T extends PointRuntime>(
  source: T,
  maps: CopyIdMaps,
  createdGroups: ReadonlyMap<string, string> = new Map()
): T {
  const point = cloneJson(source);
  if (Array.isArray(point.parent_refs)) point.parent_refs = point.parent_refs.map((parent) => remapParentRef(parent, maps));
  if (Array.isArray(point.defining_parents)) point.defining_parents = point.defining_parents.map((id) => remapAnyId(id, maps));
  if (point.midpointMeta) {
    point.midpointMeta = {
      ...point.midpointMeta,
      parents: point.midpointMeta.parents.map((id) => maps.points.get(id) ?? id) as [ObjectId, ObjectId],
      parentLineId: point.midpointMeta.parentLineId == null
        ? point.midpointMeta.parentLineId
        : maps.lines.get(point.midpointMeta.parentLineId) ?? point.midpointMeta.parentLineId
    };
  }
  if (point.bisectMeta) {
    const meta = point.bisectMeta;
    const remapSegment = (ref: { lineId: ObjectId; a: ObjectId; b: ObjectId }) => ({
      ...ref, lineId: maps.lines.get(ref.lineId) ?? ref.lineId,
      a: maps.points.get(ref.a) ?? ref.a, b: maps.points.get(ref.b) ?? ref.b
    });
    point.bisectMeta = meta.arms ? {
      ...meta, vertex: maps.points.get(meta.vertex) ?? meta.vertex,
      arms: [remapAngleArm(meta.arms[0], maps), remapAngleArm(meta.arms[1], maps)]
    } : {
      ...meta, vertex: maps.points.get(meta.vertex) ?? meta.vertex,
      seg1: remapSegment(meta.seg1), seg2: remapSegment(meta.seg2)
    };
  }
  if (point.symmetricMeta) {
    point.symmetricMeta = {
      ...point.symmetricMeta,
      source: maps.points.get(point.symmetricMeta.source) ?? point.symmetricMeta.source,
      mirror: {
        ...point.symmetricMeta.mirror,
        id: point.symmetricMeta.mirror.kind === 'point'
          ? maps.points.get(point.symmetricMeta.mirror.id) ?? point.symmetricMeta.mirror.id
          : maps.lines.get(point.symmetricMeta.mirror.id) ?? point.symmetricMeta.mirror.id
      }
    };
  }
  if (point.parallel_helper_for) point.parallel_helper_for = maps.lines.get(point.parallel_helper_for) ?? point.parallel_helper_for;
  if (point.perpendicular_helper_for) point.perpendicular_helper_for = maps.lines.get(point.perpendicular_helper_for) ?? point.perpendicular_helper_for;
  if (point.auxiliaryFor) point.auxiliaryFor = maps.lines.get(point.auxiliaryFor) ?? point.auxiliaryFor;
  if (point.created_group) point.created_group = createdGroups.get(point.created_group) ?? point.created_group;
  return point;
}

/** Clone a copied line, remap line/point dependencies, and mark it as a full runtime line. */
export function remapCopiedLine<T extends LineRuntime>(source: T, maps: CopyIdMaps): T {
  const line = cloneJson(source);
  const pointId = (id: ObjectId): ObjectId => maps.points.get(id) ?? id;
  const lineId = (id: ObjectId): ObjectId => maps.lines.get(id) ?? id;
  line.object_type = 'line';
  line.points = line.points.map(pointId);
  line.defining_points = Array.isArray(line.defining_points) && line.defining_points.length === 2 &&
    line.defining_points.every(id => typeof id === 'string' && id.length > 0)
    ? line.defining_points.map(pointId) as [ObjectId, ObjectId]
    : [line.points[0] ?? '', line.points[line.points.length - 1] ?? ''];
  if (line.defining_parents) line.defining_parents = line.defining_parents.map((id) => remapAnyId(id, maps));
  if (line.parallel) {
    line.parallel = {
      ...line.parallel,
      referenceLine: lineId(line.parallel.referenceLine),
      throughPoint: pointId(line.parallel.throughPoint),
      helperPoint: pointId(line.parallel.helperPoint)
    };
  }
  if (line.perpendicular) {
    line.perpendicular = {
      ...line.perpendicular,
      referenceLine: line.perpendicular.referenceLine ? lineId(line.perpendicular.referenceLine) : undefined,
      referencePoints: line.perpendicular.referencePoints?.map(pointId) as [ObjectId, ObjectId] | undefined,
      throughPoint: pointId(line.perpendicular.throughPoint),
      helperPoint: pointId(line.perpendicular.helperPoint)
    };
  }
  if (line.bisector) {
    line.bisector = {
      ...line.bisector,
      vertex: pointId(line.bisector.vertex),
      bisectPoint: pointId(line.bisector.bisectPoint)
    };
  }
  return line;
}

export function createCopiedFreeLabel(label: LabelRuntime | FreeLabel, id: string, offset = 20): LabelRuntime {
  const copy = cloneJson(label) as LabelRuntime;
  copy.id = id;
  copy.pos = { x: (copy.pos?.x ?? 0) + offset, y: (copy.pos?.y ?? 0) + offset };
  return copy;
}
