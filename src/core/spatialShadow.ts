import type { ConstructionRuntime } from './runtimeTypes';
import type { Vec3 } from './spatialTypes';
import { polyhedronBase } from './polyhedronGeometry';
import { spatialPosition, transform3 } from './spatialGeometry';
import { spatialSolidPointIds } from './spatialSolidSelection';
import { add3, sub3, scale3, dot3, cross3, norm3 } from './spatialMath';

function baseGeometry(runtime: ConstructionRuntime, solidId: string) {
  const solid=runtime.solids?.[solidId];
  const base=solid && polyhedronBase(solid,id=>spatialPosition(runtime,id));
  return solid && base ? {solid,base} : null;
}
/** Tilt is a geometric property, independent of the current view and tilt lock. */
export function spatialSolidIsTilted(runtime: ConstructionRuntime, solidId: string): boolean {
  const geometry=baseGeometry(runtime,solidId);
  if(!geometry)return false;
  const {solid,base}=geometry,offset=solid.polyhedron!.offset;
  const lateral=sub3(offset,scale3(base.normal,dot3(offset,base.normal)));
  return norm3(lateral)>Math.max(1,Math.abs(solid.polyhedron!.height))*1e-7;
}
export function spatialShadowOpacity(runtime: ConstructionRuntime, solidId: string): number {
  const solid=runtime.solids?.[solidId],base=runtime.polygons[solid?.faces?.[0]??''];
  const opacity=solid?.shadowOpacity??(base?.fillOpacity??.12)*.65;
  return Math.min(1,Math.max(0,opacity));
}
/** Convex hull of the base and orthogonal feet of the displayed solid vertices. */
export function spatialSolidShadow(runtime: ConstructionRuntime, solidId: string) {
  const geometry=baseGeometry(runtime,solidId);
  if(!geometry || !spatialSolidIsTilted(runtime,solidId))return null;
  const {solid,base}=geometry,group=runtime.spatialGroups?.[solid.groupId];
  if(!group)return null;
  const u=scale3(sub3(base.points[1],base.points[0]),1/norm3(sub3(base.points[1],base.points[0]))),v=cross3(base.normal,u);
  const vertices=spatialSolidPointIds(runtime,solidId).map(id=>spatialPosition(runtime,id));
  if(vertices.some(p=>!p))return null;
  const projected=[...base.points,...vertices as Vec3[]].map(p=>{
    const relative=sub3(p,base.points[0]);
    return {x:dot3(relative,u),y:dot3(relative,v)};
  }).sort((a,b)=>a.x-b.x||a.y-b.y);
  const extent=Math.max(1,...projected.map(p=>Math.hypot(p.x,p.y))),eps=extent*extent*1e-10;
  const points=projected.filter((p,i)=>!i||Math.hypot(p.x-projected[i-1].x,p.y-projected[i-1].y)>extent*1e-10);
  const turn=(a:{x:number;y:number},b:{x:number;y:number},c:{x:number;y:number})=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const half=(ps:typeof points)=>{const hull:typeof points=[];for(const p of ps){while(hull.length>1&&turn(hull[hull.length-2],hull[hull.length-1],p)<=eps)hull.pop();hull.push(p);}return hull;};
  const lower=half(points),upper=half([...points].reverse());
  const hull=[...lower.slice(0,-1),...upper.slice(0,-1)];
  if(hull.length<3)return null;
  const world=hull.map(p=>add3(base.points[0],add3(scale3(u,p.x),scale3(v,p.y))));
  const screen=world.map(p=>{const q=transform3(group.orientation,sub3(p,group.pivot));return{x:group.anchor.x+q.x,y:group.anchor.y+q.y};});
  const polygon=runtime.polygons[solid.faces?.[0]??''];
  return {points:world,screen,color:polygon?.fill??runtime.lines[solid.edges[0]]?.style.color??'#15a3ff',opacity:spatialShadowOpacity(runtime,solidId)};
}
