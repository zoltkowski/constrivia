import type { ConstructionRuntime } from './runtimeTypes';

/** Remove a solid and constructions that require it, retaining independent solids and shared bases. */
export function deleteSpatialSolid(runtime: ConstructionRuntime, solidId: string): boolean {
  if (!runtime.solids?.[solidId]) return false;
  const removed = { solids:new Set([solidId]), points:new Set<string>(), lines:new Set<string>(), circles:new Set<string>(), angles:new Set<string>(), polygons:new Set<string>() };
  const missing = (id: string | undefined) => !!id && Object.values(removed).some(ids=>ids.has(id));
  const some = (ids: string[] | undefined) => ids?.some(missing) ?? false;
  const count = () => Object.values(removed).reduce((total,ids)=>total+ids.size,0);
  let previous=-1;
  while(previous!==count()) {
    previous=count();
    for(const solid of Object.values(runtime.solids)) {
      if(removed.solids.has(solid.id)) {
        for(const id of solid.vertices) {
          const binding=runtime.points[id]?.spatial?.binding;
          const shared=Object.values(runtime.solids).some(other=>!removed.solids.has(other.id)&&other.vertices.includes(id));
          if(binding?.kind==='vertex'&&removed.solids.has(binding.solidId)||!shared&&binding?.kind==='position')removed.points.add(id);
        }
        for(const id of solid.edges)if(!Object.values(runtime.solids).some(other=>!removed.solids.has(other.id)&&other.edges.includes(id)))removed.lines.add(id);
        for(const id of solid.faces??[])if(runtime.polygons[id]?.solidFace?.solidId===solid.id)removed.polygons.add(id);
      } else if(missing(solid.originPointId)||some(solid.vertices)||some(solid.polyhedron?.basePoints))removed.solids.add(solid.id);
    }
    for(const point of Object.values(runtime.points)) {
      const binding=point.spatial?.binding;
      const spatialMissing=binding?.kind==='vertex'?removed.solids.has(binding.solidId)
        :binding?.kind==='edge'?some(binding.endpoints)
        :binding?.kind==='direction'?missing(binding.through)||some(binding.reference)||(Array.isArray(binding.planeGuide)?some(binding.planeGuide):missing(binding.planeGuide))
        :binding?.kind==='planeFoot'?missing(binding.source)||some(binding.planePoints)
        :binding?.kind==='sectionEdge'?missing(binding.sectionId)||some(binding.endpoints)
        :binding?.kind==='polygonIntersection'?some(binding.polygons):false;
      if(spatialMissing||point.parent_refs?.some(ref=>missing(ref.id))||some(point.defining_parents))removed.points.add(point.id);
    }
    for(const line of Object.values(runtime.lines))if(some(line.defining_points)||some(line.defining_parents))removed.lines.add(line.id);
    for(const circle of Object.values(runtime.circles))if(missing(circle.center)||missing(circle.radius_point)||some(circle.defining_points)||some(circle.defining_parents))removed.circles.add(circle.id);
    for(const angle of Object.values(runtime.angles)) {
      const arms=[angle.arm1,angle.arm2].filter(Boolean).map(arm=>arm!.kind==='point'?arm!.pointId:arm!.lineId);
      if(missing(angle.vertex)||missing(angle.point1)||missing(angle.point2)||some(arms)||some(angle.defining_parents)||some(angle.spatial?.arms.flat()))removed.angles.add(angle.id);
    }
    for(const polygon of Object.values(runtime.polygons)) {
      const section=polygon.spatialSection;
      const plane=section?.plane;
      if(missing(polygon.solidFace?.solidId)||missing(section?.solidId)||some(polygon.points)||some(polygon.defining_parents)||
        (!section?.fixedPlane&&(plane?.kind==='parallel'?(missing(plane.polygonId)||missing(plane.pointId)):some(plane?.points))))removed.polygons.add(polygon.id);
    }
  }
  for(const [kind,ids] of Object.entries(removed))for(const id of ids)delete runtime[kind as keyof typeof removed]![id];
  for(const line of Object.values(runtime.lines)) {
    const old=line.points;
    line.points=old.filter(id=>!removed.points.has(id));
    if(line.points.length!==old.length) {
      line.segmentStyles=line.points.slice(0,-1).map(id=>({...line.segmentStyles?.[old.indexOf(id)]??line.style}));
      line.segmentKeys=line.points.slice(0,-1).map((id,i)=>[id,line.points[i+1]].sort().join('-'));
    }
    if(line.spatialParameters)for(const id of removed.points)delete line.spatialParameters[id];
  }
  for(const circle of Object.values(runtime.circles))circle.points=circle.points.filter(id=>!removed.points.has(id));
  for(const id of Object.keys(runtime.spatialGroups??{}))if(!Object.values(runtime.solids).some(s=>s.groupId===id)&&!Object.values(runtime.points).some(p=>p.spatial?.groupId===id))delete runtime.spatialGroups![id];
  return true;
}
