import {describe,it,expect} from 'vitest';
import {makeEmptyRuntime} from '../src/core/runtimeTypes';
import {addPoint,addLineFromPoints} from '../src/core/engineActions';
import {createPrismOrPyramid,createCuboid,spatialPosition,syncSpatialGeometry,validateSpatialModel,addSpatialEdgePoint,resizeSpatialSolid} from '../src/core/spatialGeometry';
import {createSpatialParallelSection,createSpatialHeight,removeSpatialSection} from '../src/core/spatialPlaneTools';
import {setSpatialSolidShapeLocked,setSpatialSolidTiltLocked,deformSpatialFace,deformSpatialVertex,truncatePyramidAtSection} from '../src/core/spatialSolidEditing';
import {norm3,sub3} from '../src/core/spatialMath';
describe('spatial solid editing and trimming',()=>{
 it('keeps a legacy cube base locked while allowing height edits',()=>{
  const r=makeEmptyRuntime(),id=createCuboid(r,{x:0,y:0},40),s=r.solids![id],size={...s.size},origin={...s.origin};
  resizeSpatialSolid(r,id,0,1,{x:30,y:10},size,origin);resizeSpatialSolid(r,id,1,0,{x:10,y:30},size,origin);
  expect(s.size).toEqual(size);expect(s.origin).toEqual(origin);
  resizeSpatialSolid(r,id,2,1,{x:0,y:20},size,origin);expect(s.size.z).not.toBe(size.z);expect(s.size.x).toBe(size.x);expect(s.size.y).toBe(size.y);
 });
 it('consumes a 2D base while keeping its mathematical definitions and independent references',()=>{
  const r=makeEmptyRuntime(),points=[[0,0],[50,0],[50,40],[0,40]].map(([x,y])=>addPoint(r,{x,y,style:{},construction_kind:'free'}));r.polygons.base={id:'base',points};
  r.points[points[0]].label={text:'A',offset:{x:5,y:-12},seq:{kind:'upper',idx:0}};
  const id=createPrismOrPyramid(r,'prism',{x:0,y:0},50,4,'base')!;expect(r.polygons.base.hidden).toBe(true);expect(points.every(id=>r.points[id].style.hidden)).toBe(true);expect(r.solids![id].vertices.every(id=>!r.points[id].style.hidden)).toBe(true);expect(()=>validateSpatialModel(r)).not.toThrow();
  const copied=r.points[r.solids![id].polyhedron!.basePoints[0]].label!;expect(copied.text).toBe('A');expect(copied.offset).toEqual({x:5,y:-12});expect(copied.seq).toBeUndefined();
 });
 it.each(['prism','pyramid'] as const)('deforms a %s side without making its base nonplanar or breaking derived points',kind=>{
  const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,kind,{x:0,y:0},60,4)!,s=r.solids![id];
  const initial=JSON.parse(JSON.stringify(r));expect(deformSpatialFace(r,id,kind==='prism'?2:1,0,0,{x:20,y:0},initial)).toBe(false);
  setSpatialSolidShapeLocked(r,id,false);const start=JSON.parse(JSON.stringify(r)),before=s.polyhedron!.basePoints.map(id=>spatialPosition(r,id)!);
  expect(deformSpatialFace(r,id,kind==='prism'?2:1,0,0,{x:20,y:7},start)).toBe(true);
  const after=s.polyhedron!.basePoints.map(id=>spatialPosition(r,id)!);expect(after.some((p,i)=>norm3(sub3(p,before[i]))>1)).toBe(true);expect(after.every(p=>Math.abs(p.z)<1e-7)).toBe(true);expect(()=>validateSpatialModel(r)).not.toThrow();
 });
 it('consumes only the polygon boundary while preserving an independent diagonal and its visible endpoints',()=>{
  const r=makeEmptyRuntime(),points=[[0,0],[50,0],[50,40],[0,40]].map(([x,y])=>addPoint(r,{x,y,style:{},construction_kind:'free'}));r.polygons.base={id:'base',points};
  const side=addLineFromPoints(r,points[0],points[1],{}),diagonal=addLineFromPoints(r,points[0],points[2],{});
  createPrismOrPyramid(r,'prism',{x:0,y:0},50,4,'base');
  expect(r.lines[side].hidden).toBe(true);expect(r.lines[diagonal].hidden).not.toBe(true);
  expect(r.points[points[0]].style.hidden).not.toBe(true);expect(r.points[points[2]].style.hidden).not.toBe(true);expect(r.points[points[1]].style.hidden).toBe(true);
 });
 it('keeps a vertex in the base plane and rejects a crossed or concave base atomically',()=>{
  const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'prism',{x:0,y:0},60,4)!,s=r.solids![id];setSpatialSolidShapeLocked(r,id,false);
  const snapshot=JSON.parse(JSON.stringify(r)),point=s.polyhedron!.basePoints[0];expect(deformSpatialVertex(r,id,point,{x:8,y:4},snapshot)).toBe(true);expect(spatialPosition(r,point)!.z).toBeCloseTo(0);
  const before=spatialPosition(snapshot,point)!,after=spatialPosition(r,point)!,m=r.spatialGroups![s.groupId].orientation,delta=sub3(after,before);
  expect(m[0]*delta.x+m[1]*delta.y+m[2]*delta.z).toBeCloseTo(8);expect(m[3]*delta.x+m[4]*delta.y+m[5]*delta.z).toBeCloseTo(4);
  const opposite=spatialPosition(snapshot,s.polyhedron!.basePoints[2])!,crossing=sub3(opposite,before),unchanged=JSON.stringify(r);
  expect(deformSpatialVertex(r,id,point,{x:1.3*(m[0]*crossing.x+m[1]*crossing.y+m[2]*crossing.z),y:1.3*(m[3]*crossing.x+m[4]*crossing.y+m[5]*crossing.z)},snapshot)).toBe(false);
  expect(JSON.stringify(r)).toBe(unchanged);
  setSpatialSolidShapeLocked(r,id,true);expect(deformSpatialVertex(r,id,point,{x:8,y:4},snapshot)).toBe(false);
 });
 it('converts a standalone cube to an editable prism without moving vertices or changing face ids',()=>{
  const r=makeEmptyRuntime(),id=createCuboid(r,{x:0,y:0},40),s=r.solids![id],before=Object.fromEntries(s.vertices.map(id=>[id,spatialPosition(r,id)])),faces=[...s.faces!];
  setSpatialSolidShapeLocked(r,id,false);expect(s.polyhedron?.kind).toBe('prism');for(const id of s.vertices)expect(spatialPosition(r,id)).toEqual(before[id]);expect([...s.faces!].sort()).toEqual(faces.sort());expect(()=>validateSpatialModel(r)).not.toThrow();
  setSpatialSolidTiltLocked(r,id,false);expect(s.polyhedron!.rightLocked).toBe(false);
 });
 it('locks further tilt without straightening the current slant',()=>{
  const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'prism',{x:0,y:0},60,5)!,s=r.solids![id],d=s.polyhedron!;
  d.offset={x:12,y:-9,z:3};syncSpatialGeometry(r);
  const offset={...d.offset},before=Object.fromEntries(s.vertices.map(vertex=>[vertex,spatialPosition(r,vertex)]));
  setSpatialSolidTiltLocked(r,id,true);
  expect(d.rightLocked).toBe(true);expect(d.offset).toEqual(offset);
  for(const vertex of s.vertices)expect(spatialPosition(r,vertex)).toEqual(before[vertex]);
 });
 it('trims pyramid fills at a parallel section when the apex is hidden and after trash, keeping dependencies',()=>{
  const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'pyramid',{x:0,y:0},60,4)!,s=r.solids![id],apex=s.vertices[4],lineId=s.edges.find(id=>r.lines[id].defining_points.includes(apex))!,line=r.lines[lineId];
  const driver=addSpatialEdgePoint(r,...line.defining_points,.5,lineId)!,section=createSpatialParallelSection(r,s.faces![0],driver)!;
  const height=createSpatialHeight(r,apex,s.faces![0])!;
  expect(s.faces!.slice(1).every(id=>r.polygons[id].points.length===3)).toBe(true);
  r.points[apex].style.hidden=true;syncSpatialGeometry(r);expect(s.faces!.slice(1).every(id=>r.polygons[id].points.length===4)).toBe(true);
  r.points[apex].style.hidden=false;syncSpatialGeometry(r);expect(s.faces!.slice(1).every(id=>r.polygons[id].points.length===3)).toBe(true);
  expect(truncatePyramidAtSection(r,id)).toBe(true);expect(s.cutSectionId).toBe(section);expect(spatialPosition(r,apex)).not.toBeNull();expect(s.faces!.slice(1).every(id=>r.polygons[id].points.length===4)).toBe(true);
  expect(line.segmentStyles!.some(style=>style.hidden)).toBe(true);const restored=JSON.parse(JSON.stringify(r));expect(()=>validateSpatialModel(restored)).not.toThrow();syncSpatialGeometry(restored);expect(restored.polygons[s.faces![1]].points).toHaveLength(4);
  expect(r.lines[height].points).toHaveLength(3);expect(r.lines[height].segmentStyles!.filter(style=>style.hidden)).toHaveLength(1);
  (r.points[driver].spatial!.binding as any).t=.65;syncSpatialGeometry(r);expect(r.polygons[section].geometryValid).toBe(true);expect(s.faces!.slice(1).every(id=>r.polygons[id].points.length===4)).toBe(true);
  (r.points[driver].spatial!.binding as any).t=1;syncSpatialGeometry(r);expect(s.faces!.slice(1).every(id=>r.polygons[id].points.length!==3)).toBe(true);
  (r.points[driver].spatial!.binding as any).t=.65;syncSpatialGeometry(r);expect(s.faces!.slice(1).every(id=>r.polygons[id].points.length===4)).toBe(true);
  removeSpatialSection(r,section);syncSpatialGeometry(r);expect(r.polygons[section].hidden).toBe(true);expect(s.faces!.slice(1).every(id=>r.polygons[id].points.length===4)).toBe(true);
 });
});
