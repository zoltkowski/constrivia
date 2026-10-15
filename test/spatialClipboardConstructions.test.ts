import { describe, expect, it } from 'vitest';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { createConstructionClipboard, pasteConstructionClipboard, readConstructionClipboard } from '../src/core/constructionClipboard';
import { addSpatialEdgePoint, createCuboid, createPrismOrPyramid, spatialFacePolygon, spatialPosition, syncSpatialGeometry } from '../src/core/spatialGeometry';
import { createSpatialHeight, createSpatialParallelSection } from '../src/core/spatialPlaneTools';
import { truncatePyramidAtSection } from '../src/core/spatialSolidEditing';
import { recomputeAllRuntime } from '../src/core/runtimeRecompute';

describe('copied spatial constructions', () => {
  it('preserves erased solid edges, faces and section outlines without source references or resurrection',()=>{
    const runtime=makeEmptyRuntime(),solidId=createCuboid(runtime,{x:80,y:90},60),solid=runtime.solids![solidId];
    const baseId=spatialFacePolygon(runtime,solidId,2,0)!;
    const edge=solid.edges.map(id=>runtime.lines[id]).find(l=>{
      const [a,b]=l.defining_points.map(id=>spatialPosition(runtime,id)!);return Math.abs(a.z-b.z)>1;
    })!;
    const driver=addSpatialEdgePoint(runtime,...edge.defining_points,.5,edge.id)!;
    const sectionId=createSpatialParallelSection(runtime,baseId,driver)!;
    const removedOutline=Object.values(runtime.polygons[sectionId].spatialSection!.edgeLines!)[0];
    delete runtime.lines[removedOutline];
    const erasedEdge=solid.edges.find(id=>id!==edge.id)!,erasedFace=solid.faces!.find(id=>id!==baseId)!;
    delete runtime.lines[erasedEdge];delete runtime.polygons[erasedFace];
    syncSpatialGeometry(runtime);
    const snapshot=createConstructionClipboard(runtime,{solids:[solidId]});
    const maps=pasteConstructionClipboard(runtime,snapshot)!;
    expect(maps).not.toBeNull();
    const copy=runtime.solids![maps.solids.get(solidId)!],section=runtime.polygons[maps.polygons.get(sectionId)!];
    const outlineMarker=Object.values(section.spatialSection!.edgeLines!).find(id=>!runtime.lines[id])!;
    const edgeMarker=copy.edges.find(id=>!runtime.lines[id])!,faceMarker=copy.faces!.find(id=>!runtime.polygons[id])!;
    expect(outlineMarker).toBeTruthy();expect(outlineMarker).not.toBe(removedOutline);
    expect(edgeMarker).toBeTruthy();expect(edgeMarker).not.toBe(erasedEdge);
    expect(faceMarker).toBeTruthy();expect(faceMarker).not.toBe(erasedFace);
    const restored=JSON.parse(JSON.stringify(runtime));
    recomputeAllRuntime(restored);
    expect(restored.lines[outlineMarker]).toBeUndefined();expect(restored.lines[edgeMarker]).toBeUndefined();expect(restored.polygons[faceMarker]).toBeUndefined();
    expect(readConstructionClipboard(createConstructionClipboard(restored,{solids:[copy.id]}))).not.toBeNull();
  });
  for (const kind of ['cube', 'prism', 'pyramid'] as const) {
    it(`keeps a real ${kind} section and height independent through recompute and reload`, () => {
      const runtime = makeEmptyRuntime();
      const solidId = kind === 'cube' ? createCuboid(runtime, {x:200,y:300}, 80)
        : createPrismOrPyramid(runtime, kind, {x:200,y:300}, 80, 4)!;
      const solid = runtime.solids![solidId];
      const baseId = kind === 'cube' ? spatialFacePolygon(runtime, solidId, 2, 0)! : solid.faces![0];
      const edge = solid.edges.map(id=>runtime.lines[id]).find(line=>{
        const [a,b]=line.defining_points.map(id=>spatialPosition(runtime,id)!);
        return Math.abs(a.z-b.z)>1;
      })!;
      const driver=addSpatialEdgePoint(runtime,...edge.defining_points,.4,edge.id)!;
      const sectionId=createSpatialParallelSection(runtime,baseId,driver,'#cc6677')!;
      expect(sectionId).toBeTruthy();
      const section=runtime.polygons[sectionId];
      expect(section.geometryValid).toBe(true);
      const heightId=createSpatialHeight(runtime,solid.vertices[solid.vertices.length-1],baseId)!;
      expect(heightId).toBeTruthy();
      if(kind==='pyramid')expect(truncatePyramidAtSection(runtime,solidId,sectionId)).toBe(true);
      recomputeAllRuntime(runtime);
      const before=JSON.parse(JSON.stringify(runtime));
      const clipboard=createConstructionClipboard(runtime,{polygons:[sectionId]});
      const maps=pasteConstructionClipboard(runtime,clipboard)!;
      expect(maps).not.toBeNull();
      const copyId=maps.solids.get(solidId)!;
      const copiedSectionId=maps.polygons.get(sectionId)!;
      syncSpatialGeometry(runtime);
      expect(runtime.polygons[copiedSectionId].geometryValid).toBe(true);
      expect(runtime.polygons[copiedSectionId].points).toEqual(section.points.map(id=>maps.points.get(id)));
      expect(Object.values(runtime.polygons[copiedSectionId].spatialSection!.edgeLines!)).toEqual(Object.values(section.spatialSection!.edgeLines!).map(id=>maps.lines.get(id)));
      const copiedPointIds=new Set(maps.points.values());
      expect(runtime.lines[maps.lines.get(heightId)!].defining_points.every(id=>copiedPointIds.has(id))).toBe(true);
      const copyPoints=[...maps.points.values()].map(id=>({id,position:spatialPosition(runtime,id)}));
      (runtime.points[driver].spatial!.binding as {t:number}).t=.7;
      recomputeAllRuntime(runtime);
      for(const {id,position} of copyPoints)expect(spatialPosition(runtime,id)).toEqual(position);
      expect(runtime.polygons[copiedSectionId].spatialSection!.solidId).toBe(copyId);
      if(kind==='pyramid')expect(runtime.solids![copyId].cutSectionId).toBe(copiedSectionId);
      // Drop all original objects; the copied graph must still validate on its own.
      for(const key of ['points','lines','circles','angles','polygons','solids','spatialGroups'] as const){
        for(const id of Object.keys(before[key]??{}))delete runtime[key]![id];
      }
      const restored=JSON.parse(JSON.stringify(runtime));
      recomputeAllRuntime(restored);
      expect(restored.polygons[copiedSectionId].geometryValid).toBe(true);
      expect([...maps.points.values()].every(id=>restored.points[id].geometryValid!==false)).toBe(true);
      expect(readConstructionClipboard(createConstructionClipboard(restored,{solids:[copyId]}))).not.toBeNull();
    });
  }
});
