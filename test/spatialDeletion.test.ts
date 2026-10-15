import {describe,it,expect} from 'vitest';
import {makeEmptyRuntime} from '../src/core/runtimeTypes';
import {createCuboid,createPrismOrPyramid,addSpatialEdgePoint,spatialFacePolygon,validateSpatialModel} from '../src/core/spatialGeometry';
import {createSpatialThreePointSection} from '../src/core/spatialPlaneTools';
import {createSpatialAngle} from '../src/core/spatialConstructionTools';
import {deleteSpatialSolid} from '../src/core/spatialDeletion';
import {recomputeAllRuntime} from '../src/core/runtimeRecompute';

describe('whole solid deletion',()=>{
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
