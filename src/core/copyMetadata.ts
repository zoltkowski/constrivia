import type { AngleArm, AngleRuntime, CircleRuntime, ConstructionParent, FreeLabel, LabelRuntime, LineRuntime, ObjectId, PointRuntime, PolygonRuntime } from './runtimeTypes';
import type { Cuboid, SpatialGroup } from './spatialTypes';

export interface CopyIdMaps {
  points: ReadonlyMap<ObjectId, ObjectId>;
  lines: ReadonlyMap<ObjectId, ObjectId>;
  circles: ReadonlyMap<ObjectId, ObjectId>;
  angles?: ReadonlyMap<ObjectId, ObjectId>;
  polygons?: ReadonlyMap<ObjectId, ObjectId>;
  solids?: ReadonlyMap<ObjectId, ObjectId>;
  groups?: ReadonlyMap<ObjectId, ObjectId>;
}

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function remapAngleArm(arm: AngleArm, maps: CopyIdMaps): AngleArm {
  return arm.kind === 'point' ? { ...arm, pointId: maps.points.get(arm.pointId) ?? arm.pointId }
    : { ...arm, lineId: maps.lines.get(arm.lineId) ?? arm.lineId };
}

function remapAnyId(id: ObjectId, maps: CopyIdMaps): ObjectId {
  return maps.points.get(id) ?? maps.lines.get(id) ?? maps.circles.get(id) ?? maps.angles?.get(id) ?? maps.polygons?.get(id) ?? maps.solids?.get(id) ?? id;
}
const mapped = (map: ReadonlyMap<ObjectId, ObjectId> | undefined, id: ObjectId): ObjectId => map?.get(id) ?? id;
const pointId = (maps: CopyIdMaps, id: ObjectId) => mapped(maps.points, id);
const lineId = (maps: CopyIdMaps, id: ObjectId) => mapped(maps.lines, id);
const polygonId = (maps: CopyIdMaps, id: ObjectId) => mapped(maps.polygons, id);
const solidId = (maps: CopyIdMaps, id: ObjectId) => mapped(maps.solids, id);
const groupId = (maps: CopyIdMaps, id: ObjectId) => mapped(maps.groups, id);
const pair = (ids: [ObjectId, ObjectId], map: (id: ObjectId) => ObjectId): [ObjectId, ObjectId] => ids.map(map) as [ObjectId, ObjectId];

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
  if(point.commonTangent) point.commonTangent.circles=point.commonTangent.circles.map(id=>mapped(maps.circles,id)) as [ObjectId,ObjectId];
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
  if (point.boundaryIntersectionSet) {
    point.boundaryIntersectionSet = {
      parents: point.boundaryIntersectionSet.parents.map(parent => ({kind:parent.kind,id:parent.kind==='line'?lineId(maps,parent.id):polygonId(maps,parent.id)})) as typeof point.boundaryIntersectionSet.parents,
      outputs: point.boundaryIntersectionSet.outputs.flatMap(id=>maps.points.has(id)?[pointId(maps,id)]:[])
    };
  }
  if (point.boundaryIntersectionSlot) point.boundaryIntersectionSlot.setId = maps.points.get(point.boundaryIntersectionSlot.setId)
    ?? point.boundaryIntersectionSet?.outputs[0] ?? pointId(maps,point.boundaryIntersectionSlot.setId);
  if (point.boundaryIntersectionSlot?.topologyLines) point.boundaryIntersectionSlot.topologyLines=point.boundaryIntersectionSlot.topologyLines.map(id=>lineId(maps,id));
  if (point.spatial) {
    const s = point.spatial, b = s.binding;
    s.groupId = groupId(maps, s.groupId);
    if (b.kind === 'planeFoot') { b.source = pointId(maps, b.source); b.planePoints = b.planePoints.map(id => pointId(maps,id)) as typeof b.planePoints; }
    else if (b.kind === 'sectionEdge') { b.sectionId = polygonId(maps,b.sectionId); b.endpoints = pair(b.endpoints,id=>pointId(maps,id)); }
    else if (b.kind === 'polygonIntersection') b.polygons = pair(b.polygons,id=>polygonId(maps,id));
    else if (b.kind === 'vertex') b.solidId = solidId(maps,b.solidId);
    else if (b.kind === 'edge') b.endpoints = pair(b.endpoints,id=>pointId(maps,id));
    else if (b.kind === 'direction') {
      b.through=pointId(maps,b.through); b.reference=pair(b.reference,id=>pointId(maps,id));
      if (Array.isArray(b.planeGuide)) b.planeGuide=pair(b.planeGuide,id=>pointId(maps,id));
      else if (b.planeGuide) b.planeGuide=pointId(maps,b.planeGuide);
    }
  }
  return point;
}

/** Clone a copied line, remap line/point dependencies, and mark it as a full runtime line. */
export function remapCopiedLine<T extends LineRuntime>(source: T, maps: CopyIdMaps): T {
  const line = cloneJson(source);
  const remapPointId = (id: ObjectId): ObjectId => pointId(maps,id);
  const remapLineId = (id: ObjectId): ObjectId => lineId(maps,id);
  line.object_type = 'line';
  line.points = line.points.map(remapPointId);
  line.defining_points = Array.isArray(line.defining_points) && line.defining_points.length === 2 &&
    line.defining_points.every(id => typeof id === 'string' && id.length > 0)
    ? line.defining_points.map(remapPointId) as [ObjectId, ObjectId]
    : [line.points[0] ?? '', line.points[line.points.length - 1] ?? ''];
  if (line.defining_parents) line.defining_parents = line.defining_parents.map((id) => remapAnyId(id, maps));
  if (line.parallel) {
    line.parallel = {
      ...line.parallel,
      referenceLine: remapLineId(line.parallel.referenceLine),
      throughPoint: remapPointId(line.parallel.throughPoint),
      helperPoint: remapPointId(line.parallel.helperPoint)
    };
  }
  if (line.perpendicular) {
    line.perpendicular = {
      ...line.perpendicular,
      referenceLine: line.perpendicular.referenceLine ? remapLineId(line.perpendicular.referenceLine) : undefined,
      referencePoints: line.perpendicular.referencePoints?.map(remapPointId) as [ObjectId, ObjectId] | undefined,
      throughPoint: remapPointId(line.perpendicular.throughPoint),
      helperPoint: remapPointId(line.perpendicular.helperPoint)
    };
  }
  if (line.bisector) {
    line.bisector = {
      ...line.bisector,
      vertex: remapPointId(line.bisector.vertex),
      bisectPoint: remapPointId(line.bisector.bisectPoint)
    };
  }
  if (line.spatialParameters) line.spatialParameters = Object.fromEntries(Object.entries(line.spatialParameters)
    .filter(([id]) => maps.points.has(id)).map(([id,t])=>[remapPointId(id),t]));
  if (line.segmentKeys) line.segmentKeys = line.points.slice(0,-1).map((id,i)=>[id,line.points[i+1]].sort().join('-'));
  return line;
}

export function remapCopiedCircle<T extends CircleRuntime>(source:T,maps:CopyIdMaps):T {
  const c=cloneJson(source); c.id=mapped(maps.circles,c.id); c.center=pointId(maps,c.center);
  if(c.radius_point)c.radius_point=pointId(maps,c.radius_point);
  if (c.compassSource) {
    const remapLine = (line: import('./circleGeometry').CompassLineSource) => ({ lineId: lineId(maps,line.lineId), a: pointId(maps,line.a), b: pointId(maps,line.b) });
    c.compassSource = c.compassSource.kind === 'point-line'
      ? { kind: 'point-line', pointId: pointId(maps,c.compassSource.pointId), line: remapLine(c.compassSource.line) }
      : { kind: 'parallel-lines', lines: c.compassSource.lines.map(remapLine) as [import('./circleGeometry').CompassLineSource,import('./circleGeometry').CompassLineSource] };
  }
  c.points=c.points.map(id=>pointId(maps,id)); c.defining_points=pair([c.defining_points[0],c.defining_points[1]],id=>pointId(maps,id)).concat([pointId(maps,c.defining_points[2])]) as [ObjectId,ObjectId,ObjectId];
  if(c.defining_parents)c.defining_parents=c.defining_parents.map(id=>remapAnyId(id,maps));
  if(c.arcStyles&&!Array.isArray(c.arcStyles)){const styles:Record<string,typeof c.style>={}; for(const [key,style] of Object.entries(c.arcStyles)){const [circle,a,b]=key.split(':'); styles[`${mapped(maps.circles,circle)}:${pointId(maps,a)}:${pointId(maps,b)}`]={...style};} c.arcStyles=styles;}
  else if(c.arcStyles)c.arcStyles=c.arcStyles.map(style=>({...style}));
  return c;
}
export function remapCopiedAngle<T extends AngleRuntime>(source:T,maps:CopyIdMaps):T {
  const a=cloneJson(source); a.id=mapped(maps.angles,a.id); a.vertex=pointId(maps,a.vertex);
  if(a.point1)a.point1=pointId(maps,a.point1); if(a.point2)a.point2=pointId(maps,a.point2);
  if(a.arm1LineId)a.arm1LineId=lineId(maps,a.arm1LineId); if(a.arm2LineId)a.arm2LineId=lineId(maps,a.arm2LineId);
  if(a.arm1)a.arm1=remapAngleArm(a.arm1,maps); if(a.arm2)a.arm2=remapAngleArm(a.arm2,maps);
  if(a.defining_parents)a.defining_parents=a.defining_parents.map(id=>remapAnyId(id,maps));
  if(a.spatial){a.spatial.groupId=groupId(maps,a.spatial.groupId); a.spatial.arms=a.spatial.arms.map(arm=>pair(arm,id=>pointId(maps,id))) as typeof a.spatial.arms;}
  return a;
}
export function remapCopiedPolygon<T extends PolygonRuntime>(source:T,maps:CopyIdMaps):T {
  const p=cloneJson(source); p.id=mapped(maps.polygons,p.id); p.points=p.points.map(id=>pointId(maps,id));
  if(p.defining_parents)p.defining_parents=p.defining_parents.map(id=>remapAnyId(id,maps));
  if(p.spatialGroupId)p.spatialGroupId=groupId(maps,p.spatialGroupId);
  if(p.solidFace)p.solidFace={...p.solidFace,solidId:solidId(maps,p.solidFace.solidId)};
  if(p.spatialSection){const s=p.spatialSection;s.solidId=solidId(maps,s.solidId);if(s.plane.kind==='parallel'){s.plane.polygonId=polygonId(maps,s.plane.polygonId);s.plane.pointId=pointId(maps,s.plane.pointId);}else s.plane.points= s.plane.points.map(id=>pointId(maps,id)) as typeof s.plane.points;
    if(s.priorCuts)s.priorCuts=s.priorCuts.map(id=>polygonId(maps,id));if(s.sourcePoints)s.sourcePoints=s.sourcePoints.map(id=>pointId(maps,id));
    s.edgePoints=Object.fromEntries(Object.entries(s.edgePoints).filter(([,id])=>maps.points.has(id)).map(([k,id])=>[remapEdgeKey(k,maps),pointId(maps,id)])); if(s.edgeLines)s.edgeLines=Object.fromEntries(Object.entries(s.edgeLines).map(([k,id])=>[remapEdgeKey(k,maps),lineId(maps,id)]));}
  if(p.lockRef){p.lockRef.base=pair(p.lockRef.base,id=>pointId(maps,id));p.lockRef.coords=p.lockRef.coords.map(c=>({...c,id:pointId(maps,c.id)}));}
  return p;
}
function remapEdgeKey(key:string,maps:CopyIdMaps){const prefix=key.startsWith('e:')?'e:':'';const body=prefix?key.slice(2):key;return prefix+body.split('|').map(id=>pointId(maps,id)).sort().join('|');}
export function remapCopiedSolid<T extends Cuboid>(source:T,maps:CopyIdMaps):T {
  const s=cloneJson(source);s.id=solidId(maps,s.id);s.groupId=groupId(maps,s.groupId);s.vertices=s.vertices.map(id=>pointId(maps,id));s.edges=s.edges.map(id=>lineId(maps,id));
  if(s.faces)s.faces=s.faces.map(id=>polygonId(maps,id));if(s.originPointId)s.originPointId=pointId(maps,s.originPointId);
  if(s.cutSectionId)s.cutSectionId=polygonId(maps,s.cutSectionId);if(s.hiddenApexSectionId)s.hiddenApexSectionId=polygonId(maps,s.hiddenApexSectionId);
  if(s.cutSectionIds)s.cutSectionIds=s.cutSectionIds.map(id=>polygonId(maps,id));
  if(s.consumedBase)s.consumedBase.polygonId=polygonId(maps,s.consumedBase.polygonId);
  if(s.polyhedron){s.polyhedron.basePoints=s.polyhedron.basePoints.map(id=>pointId(maps,id));s.polyhedron.faceVertices=s.polyhedron.faceVertices.map(face=>face.map(id=>pointId(maps,id)));}
  return s;
}
export function remapCopiedSpatialGroup<T extends SpatialGroup>(source:T,maps:CopyIdMaps):T {const g=cloneJson(source);g.id=groupId(maps,g.id);return g;}

export function createCopiedFreeLabel(label: LabelRuntime | FreeLabel, id: string, offset = 20, maps?: CopyIdMaps): LabelRuntime {
  const copy = cloneJson(label) as LabelRuntime;
  copy.id = id;
  if(copy.measurement&&maps){
    const source=copy.measurement;
    if(source.kind==='segment'){
      source.lineId=lineId(maps,source.lineId);
      source.points=source.points.map(id=>pointId(maps,id)) as [ObjectId,ObjectId];
    }else source.angleId=mapped(maps.angles,source.angleId);
  }
  copy.pos = { x: (copy.pos?.x ?? 0) + offset, y: (copy.pos?.y ?? 0) + offset };
  return copy;
}
