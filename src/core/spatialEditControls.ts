import type { ConstructionRuntime } from './runtimeTypes';
import type { Vec3 } from './spatialTypes';
import { polyhedronBase } from './polyhedronGeometry';
import { spatialHandles, spatialPosition, syncSpatialGeometry, transform3 } from './spatialGeometry';
import { add3, cross3, dot3, mean3, norm3, scale3, sub3 } from './spatialMath';

export type SpatialEditHandle = {
  kind: 'tilt' | 'height'; solidId: string; groupId: string;
  x: number; y: number; source: { x: number; y: number };
  direction: Vec3; projectedDirection: { x: number; y: number };
  edgeIndex?: number; disabled: boolean;
};
export type SpatialEditSelection = { polygonId?: string | null; pointId?: string | null };

/** Contextual component controls; directions are in the group's construction coordinates. */
export function spatialEditHandles(runtime: ConstructionRuntime, solidId: string, selection: SpatialEditSelection, offset: number): SpatialEditHandle[] {
  const solid=runtime.solids?.[solidId],group=solid&&runtime.spatialGroups?.[solid.groupId];
  if(!solid||!group||!Number.isFinite(offset)||offset<=0)return [];
  const d=solid.polyhedron,polygon=runtime.polygons[selection.polygonId??''];
  const selectedTop=polygon?.solidFace?.solidId===solidId&&(d
    ? d.kind==='prism'&&polygon.solidFace.index===1
    : polygon.solidFace.axis===2&&polygon.solidFace.side===1);
  const selectedApex=d?.kind==='pyramid'&&selection.pointId===solid.vertices[d.basePoints.length];
  if(!selectedTop&&!selectedApex)return [];
  const base=d?polyhedronBase(solid,id=>spatialPosition(runtime,id)):null;
  const normal=base?.normal??(d?null:{x:solid.basis[2],y:solid.basis[5],z:solid.basis[8]});
  if(!normal)return [];
  const ids=selectedTop?polygon.points:[selection.pointId!];
  const positions=ids.map(id=>spatialPosition(runtime,id));
  if(!positions.length||(selectedTop&&positions.length<3)||positions.some(p=>!p))return [];
  const points=ids.map(id=>runtime.points[id]),center=mean3(points.map(p=>({x:p.x,y:p.y,z:0})));
  const occupied=spatialHandles(runtime,solidId,offset),spacing=offset*1.8;
  const handles:SpatialEditHandle[]=[];
  const place=(source:{x:number;y:number},out:{x:number;y:number},reach=0)=>{
    const length=Math.hypot(out.x,out.y)||1,ux=out.x/length,uy=out.y/length;
    for(let ring=0;ring<24;ring++)for(const slot of [0,1,-1,2,-2]){
      const radial=reach+offset*(1.3+ring*.7),along=slot*spacing*.85;
      const p={x:source.x+ux*radial-uy*along,y:source.y+uy*radial+ux*along};
      if(occupied.every(h=>Math.hypot(p.x-h.x,p.y-h.y)>=spacing)){occupied.push({...p,kind:'move',solidId,groupId:solid.groupId});return p;}
    }
    return {x:source.x+ux*(reach+offset*20),y:source.y+uy*(reach+offset*20)};
  };
  const make=(kind:'tilt'|'height',direction:Vec3,source:{x:number;y:number},out:{x:number;y:number},reach=0,edgeIndex?:number)=>{
    const projected=transform3(group.orientation,direction),disabled=projected.x**2+projected.y**2<.04;
    const projectedDirection=disabled?out:{x:projected.x,y:projected.y};
    handles.push({kind,solidId,groupId:solid.groupId,...place(source,out,reach),source,direction,projectedDirection,edgeIndex,disabled});
  };
  if(!solid.heightLocked){
    const n=transform3(group.orientation,normal),length=Math.hypot(n.x,n.y);
    const out=length>=.2?{x:n.x/length,y:n.y/length}:{x:0,y:-1};
    const reach=Math.max(0,...points.map(p=>(p.x-center.x)*out.x+(p.y-center.y)*out.y));
    make('height',normal,center,out,reach);
  }
  if(selectedTop&&d&&!d.rightLocked&&positions.length>=3){
    const ps=positions as Vec3[],localCenter=mean3(ps);
    for(let i=0;i<ps.length;i++){
      const j=(i+1)%ps.length,edge=sub3(ps[j],ps[i]),length=norm3(edge);if(length<1e-9)continue;
      let direction=scale3(cross3(edge,normal),1/length);
      if(dot3(direction,sub3(scale3(add3(ps[i],ps[j]),.5),localCenter))<0)direction=scale3(direction,-1);
      const a=points[i],b=points[j],source={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      let out={x:-(b.y-a.y),y:b.x-a.x};
      if(Math.hypot(out.x,out.y)<1e-8)out={x:source.x-center.x,y:source.y-center.y};
      if(Math.hypot(out.x,out.y)<1e-8)out={x:i%2?1:-1,y:0};
      if(out.x*(source.x-center.x)+out.y*(source.y-center.y)<0)out={x:-out.x,y:-out.y};
      make('tilt',direction,source,out,0,i);
    }
  }
  return handles;
}

/** One handle changes one scalar, always measured from the gesture's initial state. */
export function dragSpatialEditHandle(runtime: ConstructionRuntime, handle: SpatialEditHandle, delta: {x:number;y:number}, initial: ConstructionRuntime): boolean {
  const solid=runtime.solids?.[handle.solidId],start=initial.solids?.[handle.solidId],group=initial.spatialGroups?.[handle.groupId];
  if(!solid||!start||!group||handle.disabled||!Number.isFinite(delta.x)||!Number.isFinite(delta.y))return false;
  const screen=transform3(group.orientation,handle.direction),n=screen.x**2+screen.y**2;
  if(n<.04)return false;
  const amount=(delta.x*screen.x+delta.y*screen.y)/n,d=solid.polyhedron,original=start.polyhedron;
  if(handle.kind==='height'){
    if(solid.heightLocked)return false;
    const height=Math.max(10,(original?.height??start.size.z)+amount),before=d?.height??solid.size.z;
    if(Math.abs(before-height)<1e-9)return false;
    if(d)d.height=height;else solid.size={...start.size,z:height};
  }else{
    if(!d||!original||d.kind!=='prism'||d.rightLocked)return false;
    const offset=add3(original.offset,scale3(handle.direction,amount));
    if(norm3(sub3(d.offset,offset))<1e-9)return false;
    d.offset=offset;d.height=original.height;
  }
  syncSpatialGeometry(runtime);return true;
}
