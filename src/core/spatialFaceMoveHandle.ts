import type { ConstructionRuntime } from './runtimeTypes';
import { polyhedronBase } from './polyhedronGeometry';
import { spatialFaces, spatialHandles, spatialPosition, transform3 } from './spatialGeometry';
import { spatialEditHandles } from './spatialEditControls';
import { cross3, sub3 } from './spatialMath';

/** A side-face control uses exactly the direction accepted by the existing face drag. */
export function spatialFaceMoveHandle(runtime:ConstructionRuntime,solidId:string,polygonId:string|null|undefined,offset:number,showHidden=false) {
  const solid=runtime.solids?.[solidId],group=solid&&runtime.spatialGroups?.[solid.groupId],polygon=runtime.polygons[polygonId??''];
  if(!solid||!group||solid.hidden||solid.shapeLocked!==false||!polygon||polygon.geometryValid===false||(polygon.hidden&&!showHidden)||polygon.solidFace?.solidId!==solidId||!(offset>0))return null;
  const ref=polygon.solidFace;
  // Top faces already have separate height and tilt controls; the bottom moves the solid.
  if(ref.axis===2)return null;
  const face=spatialFaces(runtime,solidId).find(f=>f.visible&&(f.polygonId===polygonId||(!f.polygonId&&f.axis===ref.axis&&f.side===ref.side)));
  if(!face||face.points.length<3)return null;
  let direction;
  if(solid.polyhedron){
    const d=solid.polyhedron,ids=d.faceVertices[ref.index??-1],base=polyhedronBase(solid,id=>spatialPosition(runtime,id));
    if(!ids||!base||d.basePoints.some(id=>runtime.points[id]?.spatial?.binding.kind!=='position'))return null;
    const members=ids.filter(id=>d.basePoints.includes(id));if(members.length!==2)return null;
    direction=cross3(sub3(base.points[d.basePoints.indexOf(members[1])],base.points[d.basePoints.indexOf(members[0])]),base.normal);
  }else{
    if(solid.originPointId&&!ref.side)return null;
    direction=transform3(solid.basis,{x:ref.axis===0?1:0,y:ref.axis===1?1:0,z:0});
  }
  const projected=transform3(group.orientation,direction),length=Math.hypot(projected.x,projected.y);
  if(length<1e-4)return null;
  const projectedDirection={x:projected.x/length,y:projected.y/length},source=face.center;
  const vertices=solid.vertices.map(id=>runtime.points[id]).filter(Boolean),center={x:vertices.reduce((s,p)=>s+p.x,0)/vertices.length,y:vertices.reduce((s,p)=>s+p.y,0)/vertices.length};
  const sign=projectedDirection.x*(source.x-center.x)+projectedDirection.y*(source.y-center.y)<0?-1:1;
  const ux=projectedDirection.x*sign,uy=projectedDirection.y*sign,reach=Math.max(0,...face.points.map(p=>(p.x-source.x)*ux+(p.y-source.y)*uy));
  const occupied=[...spatialHandles(runtime,solidId,offset),...spatialEditHandles(runtime,solidId,{polygonId},offset)],spacing=offset*1.8;
  for(let ring=0;ring<24;ring++){
    const distance=reach+offset*(1.3+ring*.7),p={x:source.x+ux*distance,y:source.y+uy*distance};
    if(occupied.every(h=>Math.hypot(p.x-h.x,p.y-h.y)>=spacing))return {
      ...p,kind:solid.polyhedron?'faceDeform' as const:'resize' as const,solidId,groupId:solid.groupId,
      faceIndex:ref.index,axis:ref.axis,side:ref.side,source,projectedDirection
    };
  }
  return null;
}
