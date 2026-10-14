import { describe, expect, it } from 'vitest';
import { addSpatialEdgePoint, createCuboid, createPrismOrPyramid, resizePolyhedron, rotateSpatialGroup, spatialDistance, spatialFacePolygon, spatialPosition, syncSpatialGeometry } from '../src/core/spatialGeometry';
import { createSpatialHeight, createSpatialParallelSection, createSpatialThreePointSection, removeSpatialSection, updateSpatialSections } from '../src/core/spatialPlaneTools';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import type { Mat3 } from '../src/core/spatialTypes';
import {linePresentationPoints} from '../src/canvas/linePresentation';
import {recomputeAllRuntime} from '../src/core/runtimeRecompute';
import {validateSpatialModel} from '../src/core/spatialGeometry';

const cube = () => {
  const runtime = makeEmptyRuntime();
  const solidId = createCuboid(runtime, { x: 40, y: 30 }, 40);
  return { runtime, solidId, solid: runtime.solids![solidId] };
};
const samePoint = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6); expect(a.y).toBeCloseTo(b.y, 6); expect(a.z).toBeCloseTo(b.z, 6);
};

describe('spatial plane constructions', () => {
  it('keeps an erased section boundary erased without breaking later recomputation or reload',()=>{
    const {runtime,solidId,solid}=cube(),sectionId=createSpatialThreePointSection(runtime,[solid.vertices[0],solid.vertices[1],solid.vertices[2]])!;
    const section=runtime.polygons[sectionId],removed=Object.values(section.spatialSection!.edgeLines!)[0];
    delete runtime.lines[removed];expect(()=>recomputeAllRuntime(runtime)).not.toThrow();expect(runtime.lines[removed]).toBeUndefined();
    const restored=JSON.parse(JSON.stringify(runtime));expect(()=>validateSpatialModel(restored)).not.toThrow();recomputeAllRuntime(restored);expect(restored.lines[removed]).toBeUndefined();
  });
  it('keeps hidden split intervals on a rotated source edge while its section is absent and after recovery',()=>{
    const {runtime,solidId,solid}=cube(),edge=runtime.lines[solid.edges.find(id=>{
      const [a,b]=runtime.lines[id].defining_points.map(id=>spatialPosition(runtime,id)!);return Math.abs(a.z-b.z)>1;
    })!];
    const source=addSpatialEdgePoint(runtime,...edge.defining_points,.3,edge.id)!;
    const sectionId=createSpatialParallelSection(runtime,spatialFacePolygon(runtime,solidId,2,0)!,source)!;
    const other=solid.edges.map(id=>runtime.lines[id]).find(l=>l.id!==edge.id&&l.points.some(id=>runtime.points[id].spatial?.binding.kind==='sectionEdge'))!;
    const mark=other.points.find(id=>runtime.points[id].spatial?.binding.kind==='sectionEdge')!;
    other.segmentStyles=[{color:'#abcdef',hidden:true},{color:'#fedcba',type:'dashed'}];
    const styles=JSON.stringify(other.segmentStyles),order=[...other.points],binding=runtime.points[source].spatial!.binding;
    runtime.points[source].spatial!.binding={kind:'position',position:{x:0,y:0,z:1000}};
    recomputeAllRuntime(runtime);rotateSpatialGroup(runtime,solid.groupId,[...runtime.spatialGroups![solid.groupId].orientation],57,-82);
    const display=linePresentationPoints(other,runtime)!,a=runtime.points[other.defining_points[0]],b=runtime.points[other.defining_points[1]],p=display.find(p=>p.id===mark)!;
    expect(p.x).toBeCloseTo(a.x+(b.x-a.x)*.3,6);expect(p.y).toBeCloseTo(a.y+(b.y-a.y)*.3,6);
    expect(JSON.stringify(other.segmentStyles)).toBe(styles);expect(other.points).toEqual(order);
    const restored=JSON.parse(JSON.stringify(runtime));expect(()=>validateSpatialModel(restored)).not.toThrow();
    restored.points[source].spatial.binding=binding;recomputeAllRuntime(restored);
    expect(restored.polygons[sectionId].geometryValid).toBe(true);expect(restored.lines[other.id].segmentStyles).toEqual(other.segmentStyles);expect(restored.lines[other.id].points).toEqual(order);
  });
  it('removes a section without dangling point definitions that prevent saving',()=>{
    const {runtime,solidId,solid}=cube(),edge=runtime.lines[solid.edges.find(id=>{
      const [a,b]=runtime.lines[id].defining_points.map(id=>spatialPosition(runtime,id)!);return Math.abs(a.z-b.z)>1;
    })!];
    const source=addSpatialEdgePoint(runtime,...edge.defining_points,.4,edge.id)!;
    const sectionId=createSpatialParallelSection(runtime,spatialFacePolygon(runtime,solidId,2,0)!,source)!;
    const points=[...runtime.polygons[sectionId].points];
    removeSpatialSection(runtime,sectionId);
    expect(runtime.polygons[sectionId]).toBeUndefined();expect(points.every(id=>spatialPosition(runtime,id)!==null)).toBe(true);
    expect(points.every(id=>runtime.points[id].spatial?.binding.kind!=='sectionEdge')).toBe(true);
    const restored=JSON.parse(JSON.stringify(runtime));syncSpatialGeometry(restored);
    expect(Object.values(restored.points).every((p:any)=>!p.spatial||p.geometryValid!==false)).toBe(true);
  });
  it('cuts a cube with a plane parallel to a face and retains edge-point identities after rotation', () => {
    const { runtime, solidId, solid } = cube();
    const base = spatialFacePolygon(runtime, solidId, 2, 0)!;
    const vertical = solid.edges.map(id => runtime.lines[id]).find(line => {
      const [a, b] = line.defining_points.map(id => spatialPosition(runtime, id)!);
      return Math.abs(a.z - b.z) > 1;
    })!;
    vertical.segmentStyles = [{ color: '#663399', hidden: true, type: 'dotted' }];
    const source = addSpatialEdgePoint(runtime, ...vertical.defining_points, .5, vertical.id)!;
    const sectionId = createSpatialParallelSection(runtime, base, source, '#ff0000', { color: '#123456', width: 2 });
    expect(sectionId).not.toBeNull();
    const section = runtime.polygons[sectionId!] as any;
    expect(section.geometryValid).toBe(true);
    expect(section.points).toHaveLength(4);
    expect(vertical.segmentStyles?.every(style => style.hidden && style.color === '#663399')).toBe(true);
    const boundary = runtime.lines[section.spatialSection.edgeLines[Object.keys(section.spatialSection.edgeLines)[0]]];
    const boundaryPoint = addSpatialEdgePoint(runtime, ...boundary.defining_points, .37, boundary.id)!;
    const boundaryPointsBefore = [...boundary.points];
    const ids = [...section.points];
    const original = section.points.map((id: string) => spatialPosition(runtime, id)!);
    const initial = [...runtime.spatialGroups![solid.groupId].orientation] as Mat3;
    rotateSpatialGroup(runtime, solid.groupId, initial, 31, -47);
    expect(section.points).toEqual(ids);
    expect(boundary.points).toEqual(boundaryPointsBefore);
    section.points.forEach((id: string, i: number) => samePoint(spatialPosition(runtime, id)!, original[i]));
    (runtime.points[source].spatial!.binding as any).t = .72;
    syncSpatialGeometry(runtime);
    expect(section.points).toEqual(ids);
    const through = spatialPosition(runtime, source)!;
    const basePoints = runtime.polygons[base].points.map(id => spatialPosition(runtime, id)!);
    const u = { x: basePoints[1].x - basePoints[0].x, y: basePoints[1].y - basePoints[0].y, z: basePoints[1].z - basePoints[0].z };
    const v = { x: basePoints[2].x - basePoints[0].x, y: basePoints[2].y - basePoints[0].y, z: basePoints[2].z - basePoints[0].z };
    const normal = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
    const offset = through.x * normal.x + through.y * normal.y + through.z * normal.z;
    section.points.forEach((id: string) => {
      const p = spatialPosition(runtime, id)!;
      expect(p.x * normal.x + p.y * normal.y + p.z * normal.z).toBeCloseTo(offset, 6);
    });
  });

  it('builds a section from three noncollinear points in the same spatial group', () => {
    const { runtime, solidId, solid } = cube();
    const base = runtime.polygons[spatialFacePolygon(runtime, solidId, 2, 0)!];
    const sectionId = createSpatialThreePointSection(runtime, [base.points[0], base.points[1], base.points[2]]);
    expect(sectionId).not.toBeNull();
    expect(runtime.polygons[sectionId!].geometryValid).toBe(true);
    expect(runtime.polygons[sectionId!].points).toHaveLength(4);
    expect(runtime.polygons[sectionId!].spatialGroupId).toBe(solid.groupId);
  });

  it('rejects unrelated groups and degenerate planes without changing IDs or objects', () => {
    const { runtime, solidId, solid } = cube();
    const baseId = spatialFacePolygon(runtime, solidId, 2, 0)!;
    const before = JSON.stringify(runtime.idCounters);
    const ids = Object.keys(runtime.points).length;
    expect(createSpatialThreePointSection(runtime, [solid.vertices[0], solid.vertices[1], solid.vertices[0]])).toBeNull();
    expect(createSpatialParallelSection(runtime, baseId, 'missing')).toBeNull();
    expect(JSON.stringify(runtime.idCounters)).toBe(before);
    expect(Object.keys(runtime.points)).toHaveLength(ids);
    expect(Object.keys(runtime.polygons)).toHaveLength(6);
  });

  it('projects a point to the true plane and constructs a height even when the foot is outside the face footprint', () => {
    const { runtime, solidId, solid } = cube();
    const faceId = spatialFacePolygon(runtime, solidId, 2, 0)!;
    const face = runtime.polygons[faceId];
    const excludedCorner = face.points[3];
    const excludedVertex = runtime.points[excludedCorner].spatial!.binding as { vertex: number };
    const top = solid.vertices.find(id => (runtime.points[id].spatial!.binding as { vertex: number }).vertex === (excludedVertex.vertex | 4))!;
    // Use three corners so the projected foot at the fourth corner is outside this polygon.
    runtime.polygons.triangle = { id: 'triangle', points: face.points.slice(0, 3), spatialGroupId: solid.groupId };
    const lineId = createSpatialHeight(runtime, top, 'triangle', { color: '#808080', type: 'dashed' });
    expect(lineId).not.toBeNull();
    const [a, footId] = runtime.lines[lineId!].defining_points;
    expect(a).toBe(top);
    const point = spatialPosition(runtime, top)!, foot = spatialPosition(runtime, footId)!;
    expect(foot.z).toBeCloseTo(spatialPosition(runtime, runtime.polygons['triangle'].points[0])!.z, 6);
    expect(spatialDistance(runtime, top, footId)).toBeCloseTo(40, 6);
    expect(runtime.lines[lineId!].geometryValid).toBe(true);
    // Its projection remains perpendicular even when it lies beyond the triangle's footprint.
    expect(Math.hypot(point.x - foot.x, point.y - foot.y, point.z - foot.z)).toBeCloseTo(40, 6);
  });

  it('retains a section polygon and its edge-point IDs through loss and recovery', () => {
    const { runtime, solidId, solid } = cube();
    const baseId = spatialFacePolygon(runtime, solidId, 2, 0)!;
    const sourceEdge = solid.edges.map(id => runtime.lines[id]).find(line => {
      const [a, b] = line.defining_points.map(id => spatialPosition(runtime, id)!);
      return Math.abs(a.z - b.z) > 1;
    })!;
    const source = addSpatialEdgePoint(runtime, ...sourceEdge.defining_points, .4, sourceEdge.id)!;
    const sectionId = createSpatialParallelSection(runtime, baseId, source)!;
    const section = runtime.polygons[sectionId!] as any;
    const points = { ...section.spatialSection.edgePoints };
    const binding = runtime.points[source].spatial!.binding as any;
    runtime.points[source].spatial!.binding = { kind: 'position', position: { x: 0, y: 0, z: 1000 } };
    syncSpatialGeometry(runtime);
    expect(section.geometryValid).toBe(false);
    expect(Object.values(section.spatialSection.edgeLines).every((id: any) => runtime.lines[id].geometryValid === false)).toBe(true);
    runtime.points[source].spatial!.binding = binding;
    syncSpatialGeometry(runtime);
    expect(section.geometryValid).toBe(true);
    expect(section.spatialSection.edgePoints).toEqual(points);
    syncSpatialGeometry(runtime);
    expect(section.points).toHaveLength(4);
  });

  it('deduplicates a section vertex at an edge endpoint and restores the same edge point afterward', () => {
    const { runtime, solidId, solid } = cube();
    const baseId = spatialFacePolygon(runtime, solidId, 2, 0)!;
    const edge = solid.edges.map(id => runtime.lines[id]).find(line => {
      const [a, b] = line.defining_points.map(id => spatialPosition(runtime, id)!);
      return Math.abs(a.z - b.z) > 1;
    })!;
    const source = addSpatialEdgePoint(runtime, ...edge.defining_points, .4, edge.id)!;
    const sectionId = createSpatialParallelSection(runtime, baseId, source)!;
    const section = runtime.polygons[sectionId!] as any;
    const ids = [...section.points];
    (runtime.points[source].spatial!.binding as any).t = 0;
    syncSpatialGeometry(runtime);
    expect(section.geometryValid).toBe(true);
    expect(section.points).toHaveLength(4);
    expect(new Set(section.points).size).toBe(4);
    (runtime.points[source].spatial!.binding as any).t = .4;
    syncSpatialGeometry(runtime);
    expect(section.points).toEqual(ids);
  });

  it('targets the linked solid named by its face when the same group has another intersected solid', () => {
    const runtime = makeEmptyRuntime();
    const firstId = createCuboid(runtime, { x: 20, y: 20 }, 30), first = runtime.solids![firstId];
    const secondId = createCuboid(runtime, { x: 20, y: 20 }, 24, first.vertices[7]), second = runtime.solids![secondId];
    const baseId = spatialFacePolygon(runtime, secondId, 2, 0)!;
    const edge = second.edges.map(id => runtime.lines[id]).find(line => {
      const [a, b] = line.defining_points.map(id => spatialPosition(runtime, id)!);
      return Math.abs(a.z - b.z) > 1;
    })!;
    const through = addSpatialEdgePoint(runtime, ...edge.defining_points, .5, edge.id)!;
    const sectionId = createSpatialParallelSection(runtime, baseId, through);
    expect(sectionId).not.toBeNull();
    expect((runtime.polygons[sectionId!] as any).spatialSection.solidId).toBe(secondId);
    expect(first.groupId).toBe(second.groupId);
  });

  it('keeps a section planar while a pyramid height shrinks', () => {
    const runtime = makeEmptyRuntime(), solidId = createPrismOrPyramid(runtime, 'pyramid', { x: 80, y: 60 }, 48, 5)!;
    const solid = runtime.solids![solidId], baseId = solid.faces![0], base = runtime.polygons[baseId];
    const apex = solid.vertices[solid.polyhedron!.basePoints.length];
    const edgeId = solid.edges.find(id => runtime.lines[id].defining_points.includes(apex))!;
    const edge = runtime.lines[edgeId], through = addSpatialEdgePoint(runtime, ...edge.defining_points, .45, edgeId)!;
    const sectionId = createSpatialParallelSection(runtime, baseId, through);
    expect(sectionId).not.toBeNull();
    const section = runtime.polygons[sectionId!] as any;
    const initialHeight = solid.polyhedron!.height;
    resizePolyhedron(runtime, solidId, { x: 0, y: 20 }, initialHeight, { ...solid.polyhedron!.offset });
    expect(solid.polyhedron!.height).toBeLessThan(initialHeight);
    expect(section.geometryValid).toBe(true);
    const throughPosition = spatialPosition(runtime, through)!;
    const basePoints = base.points.map(id => spatialPosition(runtime, id)!);
    const normal = {
      x: (basePoints[1].y - basePoints[0].y) * (basePoints[2].z - basePoints[0].z) - (basePoints[1].z - basePoints[0].z) * (basePoints[2].y - basePoints[0].y),
      y: (basePoints[1].z - basePoints[0].z) * (basePoints[2].x - basePoints[0].x) - (basePoints[1].x - basePoints[0].x) * (basePoints[2].z - basePoints[0].z),
      z: (basePoints[1].x - basePoints[0].x) * (basePoints[2].y - basePoints[0].y) - (basePoints[1].y - basePoints[0].y) * (basePoints[2].x - basePoints[0].x),
    };
    const norm = Math.hypot(normal.x, normal.y, normal.z);
    section.points.forEach((id: string) => {
      const p = spatialPosition(runtime, id)!;
      const distance = ((p.x - throughPosition.x) * normal.x + (p.y - throughPosition.y) * normal.y + (p.z - throughPosition.z) * normal.z) / norm;
      expect(distance).toBeCloseTo(0, 6);
    });
  });
});
