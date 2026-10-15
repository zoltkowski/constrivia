import type {ConstructionRuntime} from './runtimeTypes';

/** Only independent base positions can deform a solid's unlocked footprint. */
export function canDeformSpatialBaseVertex(runtime:ConstructionRuntime,solidId:string,pointId:string):boolean {
  const solid=runtime.solids?.[solidId],base=solid?.polyhedron?.basePoints;
  return !!solid&&solid.shapeLocked===false&&!!base?.includes(pointId)
    &&base.every(id=>runtime.points[id]?.spatial?.binding.kind==='position');
}

/** A derived upper vertex stays fixed even when base-shape editing is unlocked. */
export function isFixedSpatialVertex(runtime:ConstructionRuntime,pointId:string):boolean {
  const point=runtime.points[pointId];if(!point?.spatial)return false;
  const binding=point.spatial.binding;
  const solid=binding.kind==='vertex'?runtime.solids?.[binding.solidId]
    :Object.values(runtime.solids??{}).find(s=>s.groupId===point.spatial!.groupId&&s.vertices.includes(pointId));
  return !!solid&&!canDeformSpatialBaseVertex(runtime,solid.id,pointId);
}
