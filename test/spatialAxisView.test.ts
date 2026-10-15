import {describe,it,expect} from 'vitest';
import {makeEmptyRuntime} from '../src/core/runtimeTypes';
import {alignSpatialSolidAxisView} from '../src/core/spatialView';
import {createCuboid,createPrismOrPyramid,rotateSpatialGroup,rotateSpatialGroupAxis,spatialPosition,syncSpatialGeometry} from '../src/core/spatialGeometry';
import type {Mat3} from '../src/core/spatialTypes';

function setup(kind:'prism'|'pyramid'|'cuboid'='prism'){
 const r=makeEmptyRuntime(),id=kind==='cuboid'?createCuboid(r,{x:200,y:250},100):createPrismOrPyramid(r,kind,{x:200,y:250},100,kind==='pyramid'?5:4)!;
 return {r,id,solid:r.solids![id],group:r.spatialGroups![r.solids![id].groupId]};
}
const column=(m:Mat3,axis:number)=>[m[axis],m[axis+3],m[axis+6]];
const immutable=(r:ReturnType<typeof makeEmptyRuntime>,id:string)=>JSON.stringify({solid:r.solids![id],coords:r.solids![id].vertices.map(id=>spatialPosition(r,id)),lines:r.lines,polygons:r.polygons},(k,v)=>['spatialHiddenEdge','solidBackFace'].includes(k)?undefined:v);

describe('Partial axis view alignment',()=>{
 it.each([0,1] as const)('aligns only local axis %i, with the shortest upright rotation',axis=>{
  const {r,id,group}=setup(),initial=[...group.orientation] as Mat3,unchanged=column(initial,axis);
  const component=axis===0?initial[4]:-initial[3],angle=Math.atan2(component,-initial[5]);
  expect(Math.abs(angle)).toBeLessThan(Math.PI/2);
  expect(alignSpatialSolidAxisView(r,id,axis)).toBe(true);
  const actual=[...group.orientation];
  expect(column(group.orientation,axis)).toEqual(unchanged);
  expect(group.orientation[axis===0?4:3]).toBeCloseTo(0,12);
  expect(group.orientation[5]).toBeLessThan(0);
  // One partial alignment retains depth; it does not impose a complete side view.
  expect(Math.abs(group.orientation[8])).toBeGreaterThan(.1);
  rotateSpatialGroupAxis(r,group.id,initial,axis,angle);
  expect(group.orientation).toEqual(actual);
  expect(alignSpatialSolidAxisView(r,id,axis)).toBe(false);
 });
 for(const kind of ['prism','pyramid','cuboid'] as const)for(const order of [[0,1],[1,0]] as const){
  it(kind+' reaches a base-down side view in order '+order.join(','),()=>{
   const {r,id,solid,group}=setup(kind);
   const original=immutable(r,id),placement=structuredClone({anchor:group.anchor,pivot:group.pivot});
   alignSpatialSolidAxisView(r,id,order[0]);const first=column(group.orientation,order[1]);
   alignSpatialSolidAxisView(r,id,order[1]);
   expect(column(group.orientation,order[1])).toEqual(first);
   expect(group.orientation[2]).toBeCloseTo(0,12);expect(group.orientation[5]).toBeCloseTo(-1,12);expect(group.orientation[8]).toBeCloseTo(0,12);
   const base=(solid.polyhedron?.basePoints??solid.vertices.slice(0,4)).map(id=>r.points[id]);
   expect(Math.max(...base.map(p=>p.y))-Math.min(...base.map(p=>p.y))).toBeLessThan(1e-8);
   expect(r.points[solid.vertices[solid.vertices.length-1]].y).toBeLessThan(base[0].y);
   expect(immutable(r,id)).toBe(original);expect({anchor:group.anchor,pivot:group.pivot}).toEqual(placement);
   expect(alignSpatialSolidAxisView(r,id,0)).toBe(false);expect(alignSpatialSolidAxisView(r,id,1)).toBe(false);
  });
 }
 it('preserves dimensions, true inclination, other groups and arbitrary previous view rotations',()=>{
  const {r,id,solid,group}=setup();solid.polyhedron!.rightLocked=false;solid.polyhedron!.offset={x:25,y:-30,z:0};syncSpatialGeometry(r);
  const second=createCuboid(r,{x:600,y:250},80),independent=structuredClone(r.spatialGroups![r.solids![second].groupId]);
  const original=immutable(r,id),initial=[...group.orientation] as Mat3;
  for(const dx of [-220,-80,0,65,210])for(const dy of [-180,-30,90,240]){
   rotateSpatialGroup(r,group.id,initial,dx,dy);
   for(const axis of [0,1] as const){const fixed=column(group.orientation,axis);alignSpatialSolidAxisView(r,id,axis);expect(column(group.orientation,axis)).toEqual(fixed);}
   expect(group.orientation[5]).toBeCloseTo(-1,10);expect(group.orientation[8]).toBeCloseTo(0,10);
   expect(immutable(r,id)).toBe(original);expect(r.spatialGroups![r.solids![second].groupId]).toEqual(independent);
  }
 });
 it('handles exactly edge-on and singular views without numerical jumps',()=>{
  const {r,id,group}=setup();
  group.orientation=[0,-1,0,1,0,0,0,0,1];
  expect(alignSpatialSolidAxisView(r,id,0)).toBe(false);expect(alignSpatialSolidAxisView(r,id,1)).toBe(true);
  expect(group.orientation[5]).toBeCloseTo(-1,12);expect(group.orientation.every(Number.isFinite)).toBe(true);
  expect(alignSpatialSolidAxisView(r,'missing',0)).toBe(false);
 });
});
