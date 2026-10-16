import {describe,it,expect} from 'vitest';
import {makeEmptyRuntime} from '../src/core/runtimeTypes';
import {createPrismOrPyramid,createCuboid,addSpatialEdgePoint,spatialPosition,syncSpatialGeometry,validateSpatialModel} from '../src/core/spatialGeometry';
import {createSpatialParallelSection,createSpatialThreePointSection} from '../src/core/spatialPlaneTools';
import {spatialVertexCut,truncateSpatialSolidAtSection} from '../src/core/spatialSolidEditing';
import {spatialSolidPointIds} from '../src/core/spatialSolidSelection';

function fixture(kind:'prism'|'pyramid'|'cube'){
 const r=makeEmptyRuntime();
 const id=kind==='cube'?createCuboid(r,{x:0,y:0},60):createPrismOrPyramid(r,kind,{x:0,y:0},60,4)!;
 const s=r.solids![id],base=s.polyhedron?.basePoints??[0,1,3,2].map(i=>s.vertices[i]);
 const top=s.vertices.filter(id=>!base.includes(id));
 const sides=s.edges.filter(id=>r.lines[id].defining_points.some(p=>base.includes(p))&&r.lines[id].defining_points.some(p=>top.includes(p)));
 return {r,id,s,base,top,sides};
}
describe('safe upper-solid truncation',()=>{
 it.each(['prism','pyramid','cube'] as const)('only offers upper %s vertices when an actual section exists',kind=>{
  const {r,id,s,base,top,sides}=fixture(kind);
  expect(top.every(p=>spatialVertexCut(r,p)===null)).toBe(true);
  const line=r.lines[sides[0]],driver=addSpatialEdgePoint(r,...line.defining_points,.5,line.id)!;
  const section=createSpatialParallelSection(r,s.faces![0+(kind==='cube'?4:0)],driver)!;
  expect(section).toBeTruthy();
  expect(base.every(p=>spatialVertexCut(r,p)===null)).toBe(true);
  expect(top.every(p=>spatialVertexCut(r,p)?.sectionId===section)).toBe(true);
  const before=JSON.stringify(r);
  expect(truncateSpatialSolidAtSection(r,id,section,base[0])).toBe(false);
  expect(JSON.stringify(r)).toBe(before);
  const original=base.map(p=>spatialPosition(r,p));
  expect(truncateSpatialSolidAtSection(r,id,section,top[0])).toBe(true);
  expect(s.cutSectionId).toBe(section);
  expect(base.map(p=>spatialPosition(r,p))).toEqual(original);
  expect(base.every(p=>!r.points[p].style.hidden)).toBe(true);
  expect(top.every(p=>r.points[p].style.hidden)).toBe(true);
  expect(spatialSolidPointIds(r,id).some(p=>top.includes(p))).toBe(false);
  expect(r.polygons[section].points.every(p=>spatialSolidPointIds(r,id).includes(p))).toBe(true);
  expect(top.every(p=>!!spatialPosition(r,p))).toBe(true);
  expect(top.every(p=>spatialVertexCut(r,p)===null)).toBe(true);
  const restored=JSON.parse(JSON.stringify(r));syncSpatialGeometry(restored);
  expect(()=>validateSpatialModel(restored)).not.toThrow();
  expect(restored.solids[id].cutSectionId).toBe(section);
  expect(restored.polygons[section].geometryValid).not.toBe(false);
 });
 it.each(['prism','cube'] as const)('keeps a %s cut defined by the consumed top face after reload',kind=>{
  const {r,id,s,top,sides}=fixture(kind),line=r.lines[sides[0]];
  const driver=addSpatialEdgePoint(r,...line.defining_points,.5,line.id)!;
  const section=createSpatialParallelSection(r,s.faces![kind==='cube'?5:1],driver)!;
  expect(truncateSpatialSolidAtSection(r,id,section,top[0])).toBe(true);
  const restored=JSON.parse(JSON.stringify(r));syncSpatialGeometry(restored);syncSpatialGeometry(restored);
  expect(restored.polygons[section].geometryValid).not.toBe(false);
  expect(restored.polygons[section].points.length).toBe(4);
 });
 it.each(['prism','pyramid','cube'] as const)('caps an oblique %s section while preserving its base',kind=>{
  const {r,id,s,base,top,sides}=fixture(kind);
  const drivers=sides.slice(0,3).map((id,i)=>{const line=r.lines[id];return addSpatialEdgePoint(r,...line.defining_points,.35+i*.1,id)!;}) as [string,string,string];
  const section=createSpatialThreePointSection(r,drivers)!;expect(section).toBeTruthy();
  const plan=spatialVertexCut(r,top[0]);expect(plan?.sectionId).toBe(section);
  expect(truncateSpatialSolidAtSection(r,id,section,top[0])).toBe(true);
  expect(r.polygons[s.faces![kind==='cube'?4:0]].points).toEqual(base);
  expect(r.polygons[section].points.length).toBeGreaterThanOrEqual(3);
  expect(s.faces!.every(face=>!r.polygons[face].points.some(p=>top.includes(p)))).toBe(true);
 });
 it('rejects a plane touching or intersecting the lower base',()=>{
  const {r,id,base,top}=fixture('prism');
  const section=createSpatialThreePointSection(r,[base[0],base[1],top[2]])!;
  expect(section).toBeTruthy();
  expect(top.every(p=>spatialVertexCut(r,p)===null)).toBe(true);
  const before=JSON.stringify(r);
  expect(truncateSpatialSolidAtSection(r,id,section,top[0])).toBe(false);
  expect(JSON.stringify(r)).toBe(before);
 });
 it('only offers vertices above a sloping plane that crosses the original top',()=>{
  const {r,id,s,base,top}=fixture('prism');
  const onEdge=(a:string,b:string,t:number)=>{
   const edge=s.edges.map(id=>r.lines[id]).find(l=>l.defining_points.includes(a)&&l.defining_points.includes(b))!;
   return addSpatialEdgePoint(r,...edge.defining_points,edge.defining_points[0]===a?t:1-t,edge.id)!;
  };
  const section=createSpatialThreePointSection(r,[onEdge(base[0],top[0],.4),onEdge(base[3],top[3],.4),onEdge(top[0],top[1],.75)])!;
  expect(section).toBeTruthy();
  expect(spatialVertexCut(r,top[0])?.sectionId).toBe(section);
  expect(spatialVertexCut(r,top[1])).toBeNull();
  expect(truncateSpatialSolidAtSection(r,id,section,top[0])).toBe(true);
  expect(r.points[top[0]].style.hidden).toBe(true);
  expect(r.points[top[1]].style.hidden).not.toBe(true);
  expect(r.polygons[s.faces![1]].points).toContain(top[1]);
  expect(base.every(p=>!r.points[p].style.hidden)).toBe(true);
 });
});
