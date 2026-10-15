import { describe, expect, it } from 'vitest';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { createCuboid, spatialDistance, spatialPosition,resizeSpatialSolid,rotateSpatialGroup,syncSpatialGeometry,addSpatialEdgePoint,validateSpatialModel } from '../src/core/spatialGeometry';
import type {Mat3} from '../src/core/spatialTypes';
import {
  createSpatialAngle,
  createSpatialDependentLine,
  createSpatialLineAngle,
  createSpatialPolygon,
  spatialAngleDegrees,
  spatialDirectionEndpoint,
  spatialPolygonStatus,
} from '../src/core/spatialConstructionTools';

describe('spatial construction tools', () => {
  const cube = () => {
    const runtime = makeEmptyRuntime();
    const solidId = createCuboid(runtime, { x: 100, y: 100 }, 40);
    return { runtime, solid: runtime.solids![solidId] };
  };
  it('reuses a subdivided edge instead of adding an overlapping polygon boundary',()=>{
    const {runtime,solid}=cube(),v=solid.vertices;
    const edge=runtime.lines[solid.edges[0]],p=addSpatialEdgePoint(runtime,...edge.defining_points,.5,edge.id)!;
    const before=Object.keys(runtime.lines).length;
    expect(createSpatialPolygon(runtime,[v[0],p,v[2]])).not.toBeNull();
    expect(Object.keys(runtime.lines)).toHaveLength(before+1);
  });
  it('measures the true diagonal angle after deformation independently of presentation rotation',()=>{
    const {runtime,solid}=cube(),v=solid.vertices;
    const id=createSpatialAngle(runtime,[v[1],v[0],v[7]])!;
    resizeSpatialSolid(runtime,solid.id,0,1,{x:30,y:0},{...solid.size},{...solid.origin});
    const expected=Math.acos(solid.size.x/Math.hypot(solid.size.x,solid.size.y,solid.size.z))*180/Math.PI;
    expect(spatialAngleDegrees(runtime,runtime.angles[id])).toBeCloseTo(expected,8);
    const orientation=[...runtime.spatialGroups![solid.groupId].orientation] as Mat3;
    rotateSpatialGroup(runtime,solid.groupId,orientation,140,-55);
    expect(spatialAngleDegrees(runtime,runtime.angles[id])).toBeCloseTo(expected,8);
    expect(()=>validateSpatialModel(runtime)).not.toThrow();
  });
  it('loses and recovers a perpendicular, dependent angle and polygon when its plane guide degenerates',()=>{
    const {runtime,solid}=cube(),v=solid.vertices;
    const guide=addSpatialEdgePoint(runtime,v[0],v[2],.5)!;
    const id=createSpatialDependentLine(runtime,'perpendicular',v[0],[v[0],v[1]],guide)!;
    const helper=runtime.lines[id].defining_points[1];
    const angle=createSpatialAngle(runtime,[v[1],v[0],helper])!;
    const polygon=createSpatialPolygon(runtime,[v[0],v[1],helper])!;
    const binding=runtime.points[guide].spatial!.binding as {t:number};
    binding.t=0;syncSpatialGeometry(runtime);
    expect(runtime.lines[id].geometryValid).toBe(false);
    expect(runtime.angles[angle].geometryValid).toBe(false);
    expect(runtime.polygons[polygon].geometryValid).toBe(false);
    binding.t=.5;syncSpatialGeometry(runtime);
    expect(runtime.lines[id].geometryValid).toBe(true);
    expect(runtime.angles[angle].geometryValid).toBe(true);
    expect(runtime.polygons[polygon].geometryValid).toBe(true);
    expect(spatialAngleDegrees(runtime,runtime.angles[angle])).toBeCloseTo(90,8);
  });
  it('keeps a point on an extended spatial line beyond its computational endpoint',()=>{
    const {runtime,solid}=cube(),v=solid.vertices;
    const id=createSpatialDependentLine(runtime,'parallel',v[4],[v[0],v[1]])!;
    const line=runtime.lines[id],p=addSpatialEdgePoint(runtime,...line.defining_points,2.5,id)!;
    expect(spatialDistance(runtime,v[4],p)).toBeCloseTo(100,8);
    resizeSpatialSolid(runtime,solid.id,0,1,{x:30,y:0},{...solid.size},{...solid.origin});
    expect(spatialDistance(runtime,v[4],p)).toBeCloseTo(solid.size.x*2.5,8);
    expect(()=>validateSpatialModel(runtime)).not.toThrow();
  });

  it('accepts a coplanar face polygon, creates its boundary, and rejects noncoplanar or repeated vertices', () => {
    const { runtime, solid } = cube();
    const face = [solid.vertices[0], solid.vertices[1], solid.vertices[3], solid.vertices[2]];
    expect(spatialPolygonStatus(runtime, face)).toBe('valid');
    expect(spatialPolygonStatus(runtime, [solid.vertices[0], solid.vertices[1], solid.vertices[3], solid.vertices[4]])).toBe('noncoplanar');
    expect(spatialPolygonStatus(runtime, [face[0], face[1], face[1]])).toBe('invalid');

    const polygonId = createSpatialPolygon(runtime, face, '#4488cc');
    expect(polygonId).toBeTruthy();
    expect(runtime.polygons[polygonId!]).toMatchObject({ points: face, spatialGroupId: solid.groupId, fill: '#4488cc', geometryValid: true });
    expect(createSpatialPolygon(runtime, [solid.vertices[0], solid.vertices[1], solid.vertices[3], solid.vertices[4]])).toBeNull();
  });

  it('computes a 3D angle from point arms and from two edges', () => {
    const { runtime, solid } = cube();
    const pointAngleId = createSpatialAngle(runtime, [solid.vertices[1], solid.vertices[0], solid.vertices[2]]);
    expect(pointAngleId).toBeTruthy();
    expect(spatialAngleDegrees(runtime, runtime.angles[pointAngleId!])).toBeCloseTo(90, 6);

    const lineAngleId = createSpatialLineAngle(runtime,
      [solid.vertices[0], solid.vertices[1]], [solid.vertices[0], solid.vertices[2]]);
    expect(lineAngleId).toBeTruthy();
    expect(spatialAngleDegrees(runtime, runtime.angles[lineAngleId!])).toBeCloseTo(90, 6);

    const parallelAngleId = createSpatialLineAngle(runtime,
      [solid.vertices[0], solid.vertices[1]], [solid.vertices[2], solid.vertices[3]]);
    expect(parallelAngleId).toBeTruthy();
    expect(spatialAngleDegrees(runtime, runtime.angles[parallelAngleId!])).toBeCloseTo(0, 6);
  });

  it('creates parallel directions from point and edge references', () => {
    const { runtime, solid } = cube();
    const pointLineId = createSpatialDependentLine(runtime, 'parallel', solid.vertices[4],
      [solid.vertices[0], solid.vertices[1]]);
    expect(pointLineId).toBeTruthy();
    const line = runtime.lines[pointLineId!];
    expect(line.defining_points[0]).toBe(solid.vertices[4]);
    expect(line.defining_parents).toEqual([solid.vertices[4], solid.vertices[0], solid.vertices[1]]);
    const endpoint = spatialPosition(runtime, line.defining_points[1])!;
    const through = spatialPosition(runtime, solid.vertices[4])!;
    const referenceStart = spatialPosition(runtime, solid.vertices[0])!;
    const referenceEnd = spatialPosition(runtime, solid.vertices[1])!;
    const actualDirection = { x: endpoint.x - through.x, y: endpoint.y - through.y, z: endpoint.z - through.z };
    const referenceDirection = { x: referenceEnd.x - referenceStart.x, y: referenceEnd.y - referenceStart.y, z: referenceEnd.z - referenceStart.z };
    expect(actualDirection.x * referenceDirection.x + actualDirection.y * referenceDirection.y + actualDirection.z * referenceDirection.z).toBeCloseTo(1600, 6);
    expect(spatialDistance(runtime, line.defining_points[0], line.defining_points[1])).toBeCloseTo(40, 6);

    const edgeReferenceLineId = createSpatialDependentLine(runtime, 'parallel', solid.vertices[5],
      [solid.vertices[2], solid.vertices[3]]);
    expect(edgeReferenceLineId).toBeTruthy();
    expect(runtime.lines[edgeReferenceLineId!].geometryValid).toBe(true);
  });

  it('requires an explicit plane guide for perpendicular directions and computes perpendiculars from points or edges', () => {
    const { runtime, solid } = cube();
    expect(createSpatialDependentLine(runtime, 'perpendicular', solid.vertices[4],
      [solid.vertices[0], solid.vertices[1]])).toBeNull();

    const pointGuide = createSpatialDependentLine(runtime, 'perpendicular', solid.vertices[4],
      [solid.vertices[0], solid.vertices[1]], solid.vertices[2]);
    expect(pointGuide).toBeTruthy();
    const edgeGuide = createSpatialDependentLine(runtime, 'perpendicular', solid.vertices[4],
      [solid.vertices[0], solid.vertices[1]], [solid.vertices[0], solid.vertices[2]]);
    expect(edgeGuide).toBeTruthy();

    const definition = runtime.points[runtime.lines[pointGuide!].defining_points[1]].spatial!.binding;
    expect(definition).toMatchObject({ kind: 'direction', perpendicular: true, planeGuide: solid.vertices[2] });
    const endpoint = spatialDirectionEndpoint(definition as Extract<typeof definition, { kind: 'direction' }>,
      id => spatialPosition(runtime, id));
    expect(endpoint).not.toBeNull();
    const through = spatialPosition(runtime, solid.vertices[4])!;
    const start = spatialPosition(runtime, solid.vertices[0])!;
    const end = spatialPosition(runtime, solid.vertices[1])!;
    const direction = { x: endpoint!.x - through.x, y: endpoint!.y - through.y, z: endpoint!.z - through.z };
    expect(direction.x * (end.x - start.x) + direction.y * (end.y - start.y) + direction.z * (end.z - start.z)).toBeCloseTo(0, 6);
  });
});
