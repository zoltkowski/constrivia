import {describe,it,expect} from 'vitest';
import {makeEmptyRuntime} from '../src/core/runtimeTypes';
import {createCuboid,createPrismOrPyramid,addSpatialEdgePoint,spatialFacePolygon,validateSpatialModel} from '../src/core/spatialGeometry';
import {createSpatialThreePointSection} from '../src/core/spatialPlaneTools';
import {createSpatialAngle} from '../src/core/spatialConstructionTools';
import {deleteSpatialSolid} from '../src/core/spatialDeletion';
import {recomputeAllRuntime} from '../src/core/runtimeRecompute';
import {createConstructionClipboard,pasteConstructionClipboard} from '../src/core/constructionClipboard';

describe('whole solid deletion',()=>{
  for(const parentKind of ['cube','prism'] as const)for(const childKind of ['prism','pyramid'] as const)it(`restores the top of a ${parentKind} after removing its upper ${childKind}`,()=>{
    const r=makeEmptyRuntime(),parentId=parentKind==='cube'?createCuboid(r,{x:0,y:0},80):createPrismOrPyramid(r,'prism',{x:0,y:0},80,4)!;
    const parent=r.solids![parentId],faceId=parent.faces![parentKind==='cube'?5:1],before=JSON.parse(JSON.stringify(r.polygons[faceId]));
    const child=createPrismOrPyramid(r,childKind,{x:0,y:0},40,4,faceId)!;
    expect(r.polygons[faceId].hidden).toBe(true);
    const restored=JSON.parse(JSON.stringify(r));deleteSpatialSolid(restored,child);recomputeAllRuntime(restored);
    expect(restored.solids[child]).toBeUndefined();expect(restored.solids[parentId]).toBeDefined();
    expect(restored.polygons[faceId].hidden).toBe(before.hidden);
    expect(restored.polygons[faceId].points).toEqual(before.points);
    expect(restored.polygons[faceId].fill).toBe(before.fill);
    expect(parent.vertices.every(id=>!!restored.points[id])).toBe(true);
    expect(parent.edges.every(id=>!!restored.lines[id])).toBe(true);
    expect(()=>validateSpatialModel(restored)).not.toThrow();
  });
  it('restores a shared face only after its last consuming solid is removed',()=>{
    const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'prism',{x:0,y:0},80,4)!,face=r.solids![id].faces![1];
    const first=createPrismOrPyramid(r,'prism',{x:0,y:0},40,4,face)!;
    const second=createPrismOrPyramid(r,'pyramid',{x:0,y:0},40,4,face)!;
    deleteSpatialSolid(r,first);expect(r.polygons[face].hidden).toBe(true);
    deleteSpatialSolid(r,second);expect(r.polygons[face].hidden).not.toBe(true);
  });
  it('preserves a face that the user had hidden before constructing the child',()=>{
    const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'prism',{x:0,y:0},80,4)!,face=r.solids![id].faces![1];
    r.polygons[face].hidden=true;
    const child=createPrismOrPyramid(r,'pyramid',{x:0,y:0},40,4,face)!;
    deleteSpatialSolid(r,child);expect(r.polygons[face].hidden).toBe(true);
  });
  it('restores a copied parent face independently of the original stack',()=>{
    const r=makeEmptyRuntime(),parent=createPrismOrPyramid(r,'prism',{x:0,y:0},80,4)!,face=r.solids![parent].faces![1];
    const child=createPrismOrPyramid(r,'pyramid',{x:0,y:0},40,4,face)!;
    const maps=pasteConstructionClipboard(r,createConstructionClipboard(r,{solids:[parent]}))!;
    expect(maps).toBeTruthy();
    deleteSpatialSolid(r,maps.solids.get(child)!);recomputeAllRuntime(r);
    expect(r.polygons[maps.polygons.get(face)!].hidden).not.toBe(true);
    expect(r.polygons[face].hidden).toBe(true);expect(r.solids![child]).toBeDefined();
  });
  it('repairs missing parent faces in drawings saved before consumed-base metadata',()=>{
    const r=makeEmptyRuntime(),parent=createPrismOrPyramid(r,'prism',{x:0,y:0},80,4)!,face=r.solids![parent].faces![1];
    const child=createPrismOrPyramid(r,'pyramid',{x:0,y:0},40,4,face)!;
    delete r.solids![child].consumedBase;
    deleteSpatialSolid(r,child);expect(r.polygons[face].hidden).not.toBe(true);
  });
  for(const kind of ['cube','prism','pyramid'] as const)it(`removes the whole ${kind} with its constructions, retaining an independent solid`,()=>{
    const runtime=makeEmptyRuntime();
    const id=kind==='cube'?createCuboid(runtime,{x:300,y:300},80):createPrismOrPyramid(runtime,kind,{x:300,y:300},80,4)!;
    const solid=runtime.solids![id],base=runtime.polygons[spatialFacePolygon(runtime,id,2,0)!];
    const section=createSpatialThreePointSection(runtime,base.points.slice(0,3) as [string,string,string])!;
    const line=runtime.lines[solid.edges[0]],point=addSpatialEdgePoint(runtime,...line.defining_points,.5,line.id)!;
    const angle=createSpatialAngle(runtime,solid.vertices.slice(0,3) as [string,string,string],{})!;
    const other=createCuboid(runtime,{x:700,y:300},60),otherBefore=JSON.stringify(runtime.solids![other]);
    expect(deleteSpatialSolid(runtime,id)).toBe(true);
    expect(runtime.solids![id]).toBeUndefined();expect(runtime.points[point]).toBeUndefined();
    expect(runtime.polygons[section]).toBeUndefined();expect(runtime.angles[angle]).toBeUndefined();
    expect(runtime.spatialGroups![solid.groupId]).toBeUndefined();
    expect(JSON.stringify(runtime.solids![other])).toBe(otherBefore);
    const restored=JSON.parse(JSON.stringify(runtime));validateSpatialModel(restored);recomputeAllRuntime(restored);
    expect(Object.values(restored.points).every((p:any)=>p.geometryValid!==false)).toBe(true);
  });
  it('deletes an attached child without deleting its parent or the shared vertex',()=>{
    const runtime=makeEmptyRuntime(),parentId=createCuboid(runtime,{x:300,y:300},80),parent=runtime.solids![parentId];
    const shared=parent.vertices[7],childId=createCuboid(runtime,{x:300,y:300},40,shared);
    deleteSpatialSolid(runtime,childId);recomputeAllRuntime(runtime);
    expect(runtime.solids![childId]).toBeUndefined();expect(runtime.solids![parentId]).toBeDefined();expect(runtime.points[shared]).toBeDefined();
    expect(parent.vertices.every(id=>runtime.points[id]?.geometryValid!==false)).toBe(true);
  });
  it('removes an attached child when its required parent vertex is deleted',()=>{
    const runtime=makeEmptyRuntime(),parentId=createCuboid(runtime,{x:300,y:300},80),shared=runtime.solids![parentId].vertices[7];
    const childId=createCuboid(runtime,{x:300,y:300},40,shared);
    deleteSpatialSolid(runtime,parentId);
    expect(runtime.solids![parentId]).toBeUndefined();expect(runtime.solids![childId]).toBeUndefined();
    expect(Object.keys(runtime.points)).toHaveLength(0);expect(Object.keys(runtime.spatialGroups!)).toHaveLength(0);
  });
  it('keeps an independently defined shared base when removing just one of its solids',()=>{
    const runtime=makeEmptyRuntime(),parent=createPrismOrPyramid(runtime,'prism',{x:300,y:300},80,4)!;
    const baseId=runtime.solids![parent].faces![0],base=[...runtime.polygons[baseId].points];
    const other=createPrismOrPyramid(runtime,'pyramid',{x:300,y:300},80,4,baseId)!;
    deleteSpatialSolid(runtime,parent);validateSpatialModel(runtime);recomputeAllRuntime(runtime);
    expect(runtime.solids![parent]).toBeUndefined();expect(runtime.solids![other]).toBeDefined();
    expect(base.every(id=>runtime.points[id]?.geometryValid!==false)).toBe(true);
  });
});
