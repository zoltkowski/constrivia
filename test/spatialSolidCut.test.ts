import {describe,it,expect} from 'vitest';
import {makeEmptyRuntime} from '../src/core/runtimeTypes';
import {createPrismOrPyramid,createCuboid,addSpatialEdgePoint,spatialPosition,syncSpatialGeometry,validateSpatialModel} from '../src/core/spatialGeometry';
import {createSpatialParallelSection,createSpatialThreePointSection,preserveSpatialCutPlanes} from '../src/core/spatialPlaneTools';
import {spatialVertexCut,truncateSpatialSolidAtSection,spatialCutFaces} from '../src/core/spatialSolidEditing';
import {addPoint} from '../src/core/engineActions';
import {recomputeAllRuntime} from '../src/core/runtimeRecompute';
import {createConstructionClipboard,pasteConstructionClipboard} from '../src/core/constructionClipboard';
import {captureSpatialSelection,transformSpatialSelection} from '../src/core/spatialSelectionTransform';
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
 it.each(['prism','pyramid','cube'] as const)('cuts the new cap of a %s again, with persistence',kind=>{
  const {r,id,s,base,top,sides}=fixture(kind),line=r.lines[sides[0]];
  const firstDriver=addSpatialEdgePoint(r,...line.defining_points,.5,line.id)!;
  const first=createSpatialParallelSection(r,s.faces![kind==='cube'?4:0],firstDriver)!;
  expect(truncateSpatialSolidAtSection(r,id,first,top[0])).toBe(true);
  const capVertex=r.polygons[first].points[0];
  const a=spatialPosition(r,line.defining_points[0])!,b=spatialPosition(r,line.defining_points[1])!;
  const low=a.z<b.z?.2:.8;
  const secondDriver=addSpatialEdgePoint(r,...line.defining_points,low,line.id)!;
  const second=createSpatialParallelSection(r,first,secondDriver)!;
  expect(second).toBeTruthy();
  expect(r.polygons[second].spatialSection!.priorCuts).toEqual([first]);
  expect(spatialVertexCut(r,capVertex)?.sectionId).toBe(second);
  expect(truncateSpatialSolidAtSection(r,id,second,capVertex)).toBe(true);
  expect(s.cutSectionIds).toEqual([first,second]);
  expect(r.polygons[first].points).toHaveLength(0);
  expect(r.polygons[second].points.length).toBe(base.length);
  const restored=JSON.parse(JSON.stringify(r));recomputeAllRuntime(restored);recomputeAllRuntime(restored);
  expect(()=>validateSpatialModel(restored)).not.toThrow();
  expect(restored.polygons[first].points).toHaveLength(0);
  expect(restored.polygons[second].points).toHaveLength(base.length);
  expect(base.every(p=>!restored.points[p].style.hidden)).toBe(true);
  const maps=pasteConstructionClipboard(restored,createConstructionClipboard(restored,{solids:[id]}))!;
  expect(maps).toBeTruthy();recomputeAllRuntime(restored);
  const copied=restored.solids![maps.solids.get(id)!];
  expect(copied.cutSectionIds).toEqual([maps.polygons.get(first),maps.polygons.get(second)]);
  expect(restored.polygons[copied.cutSectionId!].points.length).toBe(base.length);
  expect(restored.polygons[copied.cutSectionId!].spatialSection!.priorCuts).toEqual([maps.polygons.get(first)]);
 });
 it('keeps both upper faces when a second oblique cut crosses the previous cap',()=>{
  const {r,id,s,base,top,sides}=fixture('prism');
  const at=(index:number,t:number)=>{const line=sides.map(id=>r.lines[id]).find(line=>line.defining_points.includes(base[index])&&line.defining_points.includes(top[index]))!;return addSpatialEdgePoint(r,...line.defining_points,line.defining_points[0]===base[index]?t:1-t,line.id)!;};
  const first=createSpatialParallelSection(r,s.faces![0],at(0,.65))!;
  expect(truncateSpatialSolidAtSection(r,id,first,top[0])).toBe(true);
  const capEdge=Object.values(r.polygons[first].spatialSection!.edgeLines!).map(id=>r.lines[id]).find(line=>line.defining_points.every(id=>Math.abs(spatialPosition(r,id)!.y+30)<1e-7))!;
  const pa=spatialPosition(r,capEdge.defining_points[0])!,pb=spatialPosition(r,capEdge.defining_points[1])!;
  const onCap=addSpatialEdgePoint(r,...capEdge.defining_points,(15-pa.x)/(pb.x-pa.x),capEdge.id)!;
  const second=createSpatialThreePointSection(r,[at(0,.3),at(3,.3),onCap])!;
  expect(second).toBeTruthy();
  const vertex=r.polygons[first].points.find(p=>spatialPosition(r,p)!.x<0)!;
  expect(spatialVertexCut(r,vertex)?.sectionId).toBe(second);
  expect(truncateSpatialSolidAtSection(r,id,second,vertex)).toBe(true);
  expect(r.polygons[first].points.length).toBeGreaterThanOrEqual(3);
  expect(r.polygons[second].points.length).toBeGreaterThanOrEqual(3);
  for(const p of spatialCutFaces(r,s).flatMap(face=>face.points).map(id=>spatialPosition(r,id)!)){
   expect(p.z).toBeLessThanOrEqual(39+1e-6);
   expect(p.z).toBeLessThanOrEqual(32+(14/30)*p.x+1e-6);
  }
 });
 it('retains the committed cut after its independent plane guide is deleted',()=>{
  const {r,id,s,top}=fixture('prism');
  const guide=addPoint(r,{x:0,y:0,style:{},construction_kind:'free'});
  r.points[guide].spatial={groupId:s.groupId,binding:{kind:'position',position:{x:200,y:100,z:30}}};
  const section=createSpatialParallelSection(r,s.faces![0],guide)!;
  expect(truncateSpatialSolidAtSection(r,id,section,top[0])).toBe(true);
  const before=spatialCutFaces(r,s);
  preserveSpatialCutPlanes(r,new Set([guide]));delete r.points[guide];syncSpatialGeometry(r);
  expect(r.polygons[section].spatialSection!.fixedPlane).toBeTruthy();
  expect(r.polygons[section].geometryValid).toBe(true);
  expect(spatialCutFaces(r,s)).toEqual(before);
  expect(()=>validateSpatialModel(r)).not.toThrow();
  const height=r.polygons[section].points.map(p=>spatialPosition(r,p)!.z);
  transformSpatialSelection(r,captureSpatialSelection(r,s.vertices),{scale:2});
  expect(r.polygons[section].points.map(p=>spatialPosition(r,p)!.z)).toEqual(height.map(z=>z*2));
  const maps=pasteConstructionClipboard(r,createConstructionClipboard(r,{solids:[id]}))!;
  expect(maps).toBeTruthy();recomputeAllRuntime(r);
  expect(r.polygons[maps.polygons.get(section)!].geometryValid).toBe(true);
  expect(r.polygons[maps.polygons.get(section)!].points.length).toBe(4);
 });
 it.each(['prism','pyramid','cube'] as const)('can cut a %s three times and rejects planes outside the remaining body',kind=>{
  const {r,id,s,base}=fixture(kind);
  const baseZ=spatialPosition(r,base[0])!.z;
  let reference=s.faces![kind==='cube'?4:0];
  for(const ratio of [.75,.5,.25]){
   const guide=addPoint(r,{x:0,y:0,style:{},construction_kind:'free'});
   r.points[guide].spatial={groupId:s.groupId,binding:{kind:'position',position:{x:200,y:100,z:baseZ+60*ratio}}};
   const section=createSpatialParallelSection(r,reference,guide)!;expect(section).toBeTruthy();
   const vertex=spatialCutFaces(r,s).flatMap(face=>face.points).find(p=>spatialVertexCut(r,p)?.sectionId===section)!;
   expect(vertex).toBeTruthy();expect(truncateSpatialSolidAtSection(r,id,section,vertex)).toBe(true);
   recomputeAllRuntime(r);reference=section;
  }
  expect(s.cutSectionIds).toHaveLength(3);
  const guide=addPoint(r,{x:0,y:0,style:{},construction_kind:'free'});
  r.points[guide].spatial={groupId:s.groupId,binding:{kind:'position',position:{x:200,y:100,z:baseZ+55}}};
  expect(createSpatialParallelSection(r,reference,guide)).toBeNull();
 });
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
