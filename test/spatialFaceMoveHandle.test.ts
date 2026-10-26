import {describe,it,expect} from 'vitest';
import {makeEmptyRuntime} from '../src/core/runtimeTypes';
import {createCuboid,createPrismOrPyramid,spatialPosition,syncSpatialGeometry} from '../src/core/spatialGeometry';
import {setSpatialSolidShapeLocked,setSpatialSolidHeightLocked,setSpatialSolidTiltLocked,deformSpatialFace} from '../src/core/spatialSolidEditing';
import {spatialFaceMoveHandle} from '../src/core/spatialFaceMoveHandle';
import {dot3,norm3,sub3} from '../src/core/spatialMath';
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function setup(kind:'prism'|'pyramid'|'cuboid'='prism'){
 const r=makeEmptyRuntime(),id=kind==='cuboid'?createCuboid(r,{x:300,y:300},100):createPrismOrPyramid(r,kind,{x:300,y:300},100,4)!;
 setSpatialSolidShapeLocked(r,id,false);return {r,id,s:r.solids![id]};
}
const available=(r:ReturnType<typeof makeEmptyRuntime>,id:string)=>r.solids![id].faces!.map(face=>spatialFaceMoveHandle(r,id,face,26)).filter(h=>h!==null);
describe('normal movement handle for selected solid sides',()=>{
 it.each(['prism','pyramid','cuboid'] as const)('offers a directional handle for editable %s side faces',kind=>{
  const {r,id}=setup(kind),hs=available(r,id);expect(hs.length).toBeGreaterThan(0);
  for(const h of hs){expect(h.axis).not.toBe(2);expect(Math.hypot(h.projectedDirection.x,h.projectedDirection.y)).toBeCloseTo(1);expect((h.x-h.source.x)*h.projectedDirection.y-(h.y-h.source.y)*h.projectedDirection.x).toBeCloseTo(0);}
 });
 it('follows the existing deformation and keeps base-edge length, height and tilt fixed',()=>{
  const {r,id,s}=setup(),h=available(r,id)[0]!,initial=clone(r),d=s.polyhedron!,members=d.faceVertices[h.faceIndex!].filter(id=>d.basePoints.includes(id));
  const before=members.map(id=>spatialPosition(r,id)!),height=d.height,offset={...d.offset};
  expect(deformSpatialFace(r,id,h.faceIndex,h.axis,h.side,{x:h.projectedDirection.x*15,y:h.projectedDirection.y*15},initial)).toBe(true);
  const after=members.map(id=>spatialPosition(r,id)!);expect(norm3(sub3(after[1],after[0]))).toBeCloseTo(norm3(sub3(before[1],before[0])));
  expect(dot3(sub3(after[0],before[0]),sub3(before[1],before[0]))).toBeCloseTo(0);
  expect(s.polyhedron!.height).toBe(height);expect(s.polyhedron!.offset).toEqual(offset);
 });
 it('tracks the shape lock independently of tilt and height locks',()=>{
  const {r,id}=setup();setSpatialSolidHeightLocked(r,id,true);setSpatialSolidTiltLocked(r,id,true);expect(available(r,id).length).toBeGreaterThan(0);
  setSpatialSolidShapeLocked(r,id,true);expect(available(r,id)).toEqual([]);
  setSpatialSolidShapeLocked(r,id,false);expect(available(r,id).length).toBeGreaterThan(0);
 });
 it('does not offer a handle for hidden, invalid, missing or non-side faces',()=>{
  const {r,id,s}=setup(),h=available(r,id)[0]!,face=s.faces![h.faceIndex!];
  expect(spatialFaceMoveHandle(r,id,null,26)).toBeNull();expect(spatialFaceMoveHandle(r,id,s.faces![0],26)).toBeNull();expect(spatialFaceMoveHandle(r,id,s.faces![1],26)).toBeNull();
  r.polygons[face].geometryValid=false;expect(spatialFaceMoveHandle(r,id,face,26)).toBeNull();r.polygons[face].geometryValid=true;
  r.polygons[face].hidden=true;expect(spatialFaceMoveHandle(r,id,face,26)).toBeNull();expect(spatialFaceMoveHandle(r,id,face,26,true)).not.toBeNull();
 });
 it('respects dependent base vertices and camera-facing movement directions',()=>{
  const {r,id,s}=setup();r.points[s.polyhedron!.basePoints[0]].spatial!.binding={kind:'vertex',solidId:id,vertex:0};expect(available(r,id)).toEqual([]);
  const other=setup();other.r.spatialGroups![other.s.groupId].orientation=[0,1,0,0,0,1,1,0,0];syncSpatialGeometry(other.r);
  expect(available(other.r,other.id)).toEqual([]);
 });
});
