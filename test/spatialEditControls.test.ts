import { describe, expect, it } from 'vitest';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { spatialEditHandles, dragSpatialEditHandle } from '../src/core/spatialEditControls';
import { createCuboid, createPrismOrPyramid, spatialHandles, spatialPosition, syncSpatialGeometry } from '../src/core/spatialGeometry';
import { setSpatialSolidHeightLocked, setSpatialSolidTiltLocked } from '../src/core/spatialSolidEditing';
import { polyhedronBase } from '../src/core/polyhedronGeometry';
import { add3, dot3, mean3, norm3, scale3, sub3 } from '../src/core/spatialMath';
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const setup=(sides=4)=>{const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'prism',{x:300,y:300},80,sides)!;setSpatialSolidTiltLocked(r,id,false);return{r,id,s:r.solids![id]};};
const deltaFor=(h:ReturnType<typeof spatialEditHandles>[number],amount:number,across=0)=>({x:h.projectedDirection.x*amount-h.projectedDirection.y*across,y:h.projectedDirection.y*amount+h.projectedDirection.x*across});

describe('Directional solid editing controls',()=>{
 for(const sides of [3,4,7])it(`${sides} top sides each get a true perpendicular tilt direction and distinct hit area`,()=>{
  const {r,id,s}=setup(sides),top=s.faces![1],points=r.polygons[top].points.map(id=>spatialPosition(r,id)!),center=mean3(points),base=polyhedronBase(s,id=>spatialPosition(r,id))!;
  for(const offset of [13,26,52]){
   const before=JSON.stringify(r),handles=spatialEditHandles(r,id,{polygonId:top},offset),tilts=handles.filter(h=>h.kind==='tilt');
   expect(tilts).toHaveLength(sides);expect(handles.filter(h=>h.kind==='height')).toHaveLength(1);expect(JSON.stringify(r)).toBe(before);
   for(const h of tilts){const i=h.edgeIndex!,j=(i+1)%sides;expect(norm3(h.direction)).toBeCloseTo(1);expect(dot3(h.direction,base.normal)).toBeCloseTo(0);expect(dot3(h.direction,sub3(points[j],points[i]))).toBeCloseTo(0);expect(dot3(h.direction,sub3(scale3(add3(points[i],points[j]),.5),center))).toBeGreaterThan(0);expect(h.disabled).toBe(false);}
   const all=[...spatialHandles(r,id,offset),...handles];
   for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)expect(Math.hypot(all[i].x-all[j].x,all[i].y-all[j].y)).toBeGreaterThanOrEqual(offset*1.8-1e-7);
  }
 });
 for(const heightLocked of [false,true])it(`tilt arrows keep height fixed with height lock ${heightLocked} and ignore crosswise drag`,()=>{
  const {r,id,s}=setup();s.polyhedron!.offset={x:12,y:-9,z:0};setSpatialSolidHeightLocked(r,id,heightLocked);syncSpatialGeometry(r);
  const initial=clone(r),h=spatialEditHandles(r,id,{polygonId:s.faces![1]},26).find(h=>h.kind==='tilt')!,height=s.polyhedron!.height,base=s.polyhedron!.basePoints.map(id=>spatialPosition(r,id));
  expect(dragSpatialEditHandle(r,h,deltaFor(h,35,60),initial)).toBe(true);
  const shift=sub3(s.polyhedron!.offset,initial.solids![id].polyhedron!.offset);
  expect(norm3(sub3(shift,scale3(h.direction,35)))).toBeLessThan(1e-8);expect(s.polyhedron!.height).toBe(height);expect(s.polyhedron!.basePoints.map(id=>spatialPosition(r,id))).toEqual(base);
 });
 it('uses a fixed starting state for repeated updates and supports returning to the start',()=>{
  const {r,id,s}=setup(),initial=clone(r),h=spatialEditHandles(r,id,{polygonId:s.faces![1]},26).find(h=>h.kind==='tilt')!;
  dragSpatialEditHandle(r,h,deltaFor(h,20),initial);dragSpatialEditHandle(r,h,deltaFor(h,40),initial);
  expect(norm3(sub3(s.polyhedron!.offset,scale3(h.direction,40)))).toBeLessThan(1e-8);
  expect(dragSpatialEditHandle(r,h,{x:0,y:0},initial)).toBe(true);expect(norm3(s.polyhedron!.offset)).toBeLessThan(1e-8);expect(dragSpatialEditHandle(r,h,{x:0,y:0},initial)).toBe(false);
 });
 it('height arrow changes only height and respects its own lock and minimum',()=>{
  const {r,id,s}=setup();s.polyhedron!.offset={x:20,y:14,z:0};syncSpatialGeometry(r);
  const initial=clone(r),offset={...s.polyhedron!.offset},h=spatialEditHandles(r,id,{polygonId:s.faces![1]},26).find(h=>h.kind==='height')!;
  expect(dragSpatialEditHandle(r,h,deltaFor(h,25,70),initial)).toBe(true);expect(s.polyhedron!.height).toBeCloseTo(105);expect(s.polyhedron!.offset).toEqual(offset);
  dragSpatialEditHandle(r,h,deltaFor(h,-1000),initial);expect(s.polyhedron!.height).toBe(10);
  setSpatialSolidHeightLocked(r,id,true);const before=JSON.stringify(r);expect(dragSpatialEditHandle(r,h,deltaFor(h,40),initial)).toBe(false);expect(JSON.stringify(r)).toBe(before);
 });
 it('shows and enforces the two locks independently',()=>{
  const {r,id,s}=setup(),selection={polygonId:s.faces![1]},initial=clone(r),tilt=spatialEditHandles(r,id,selection,26).find(h=>h.kind==='tilt')!;
  setSpatialSolidTiltLocked(r,id,true);expect(spatialEditHandles(r,id,selection,26).map(h=>h.kind)).toEqual(['height']);expect(dragSpatialEditHandle(r,tilt,deltaFor(tilt,30),initial)).toBe(false);
  setSpatialSolidHeightLocked(r,id,true);expect(spatialEditHandles(r,id,selection,26)).toEqual([]);
  setSpatialSolidTiltLocked(r,id,false);expect(spatialEditHandles(r,id,selection,26).every(h=>h.kind==='tilt')).toBe(true);
 });
 it('does not expose edit arrows for whole-solid, lower-base, side, or ordinary-point selections',()=>{
  const {r,id,s}=setup();for(const selection of [{},{polygonId:s.faces![0]},{polygonId:s.faces![2]},{pointId:s.vertices[0]}])expect(spatialEditHandles(r,id,selection,26)).toEqual([]);
 });
 it('supports a height arrow at the pyramid apex without tilt arrows',()=>{
  const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'pyramid',{x:0,y:0},80,4)!,s=r.solids![id],apex=s.vertices[4];
  const hs=spatialEditHandles(r,id,{pointId:apex},26);expect(hs.map(h=>h.kind)).toEqual(['height']);const initial=clone(r);dragSpatialEditHandle(r,hs[0],deltaFor(hs[0],15),initial);expect(s.polyhedron!.height).toBeCloseTo(95);expect(s.polyhedron!.offset).toEqual(initial.solids![id].polyhedron!.offset);
  setSpatialSolidHeightLocked(r,id,true);expect(spatialEditHandles(r,id,{pointId:apex},26)).toEqual([]);
 });
 it('supports existing cuboid height without converting its definition',()=>{
  const r=makeEmptyRuntime(),id=createCuboid(r,{x:0,y:0},80),s=r.solids![id],top=s.faces!.find(id=>r.polygons[id].solidFace?.axis===2&&r.polygons[id].solidFace?.side===1)!;
  const h=spatialEditHandles(r,id,{polygonId:top},26)[0],initial=clone(r);expect(h.kind).toBe('height');dragSpatialEditHandle(r,h,deltaFor(h,20),initial);expect(s.size.z).toBeCloseTo(100);expect(s.origin).toEqual(initial.solids![id].origin);expect(s.polyhedron).toBeUndefined();
 });
 it('uses an arbitrary actual base plane and does not move independent groups',()=>{
  const {r,id:parentId,s:parent}=setup(),side=parent.faces![2],id=createPrismOrPyramid(r,'prism',{x:0,y:0},50,4,side)!,s=r.solids![id];setSpatialSolidTiltLocked(r,id,false);
  const otherId=createCuboid(r,{x:600,y:0},40),other=r.solids![otherId],before=other.vertices.map(id=>clone(r.points[id])),initial=clone(r);
  const h=spatialEditHandles(r,id,{polygonId:s.faces![1]},26).find(h=>h.kind==='tilt'&&!h.disabled)!;expect(h).toBeTruthy();dragSpatialEditHandle(r,h,deltaFor(h,15),initial);
  const base=polyhedronBase(s,id=>spatialPosition(r,id))!;expect(dot3(s.polyhedron!.offset,base.normal)).toBeCloseTo(0);expect(s.polyhedron!.height).toBe(50);expect(other.vertices.map(id=>clone(r.points[id]))).toEqual(before);expect(r.solids![parentId].polyhedron!.height).toBe(80);
 });
 it('does not render controls for an unavailable or empty top face',()=>{
  const {r,id,s}=setup(),top=s.faces![1];r.polygons[top].points=[];expect(spatialEditHandles(r,id,{polygonId:top},26)).toEqual([]);
  expect(spatialEditHandles(r,'missing',{polygonId:top},26)).toEqual([]);
 });
 it('dims a camera-facing movement axis and refuses an unstable drag',()=>{
  const {r,id,s}=setup(),g=r.spatialGroups![s.groupId];g.orientation=[1,0,0,0,1,0,0,0,1];syncSpatialGeometry(r);
  const h=spatialEditHandles(r,id,{polygonId:s.faces![1]},26).find(h=>h.kind==='height')!;expect(h.disabled).toBe(true);const before=JSON.stringify(r);expect(dragSpatialEditHandle(r,h,{x:20,y:30},clone(r))).toBe(false);expect(JSON.stringify(r)).toBe(before);
 });
});
