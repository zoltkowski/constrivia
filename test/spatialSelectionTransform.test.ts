import { describe, expect, it } from 'vitest';
import { addSpatialEdgePoint, createCuboid } from '../src/core/spatialGeometry';
import { createPrismOrPyramid } from '../src/core/polyhedronGeometry';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { captureSpatialSelection, transformSpatialSelection } from '../src/core/spatialSelectionTransform';

describe('spatial selection transforms', () => {
  it('transforms selected cube, prism, pyramid, and edge point from a stable baseline', () => {
    const runtime = makeEmptyRuntime();
    const cubeId = createCuboid(runtime, { x: 30, y: 40 }, 20);
    const cube = runtime.solids![cubeId], edgePoint = addSpatialEdgePoint(runtime, cube.vertices[0], cube.vertices[1], .35)!;
    const prismId = createPrismOrPyramid(runtime, 'prism', { x: 180, y: 40 }, 16, 4)!;
    const pyramidId = createPrismOrPyramid(runtime, 'pyramid', { x: 330, y: 40 }, 14, 5)!;
    const selectedPoint = [cube.vertices[0], runtime.solids![prismId].vertices[0], edgePoint];
    const snapshot = captureSpatialSelection(runtime, selectedPoint);
    const prismBaseId = runtime.solids![prismId].polyhedron!.basePoints[0];
    const initialPrismPosition = structuredClone(runtime.points[prismBaseId].spatial!.binding);
    const untouchedGroup = structuredClone(runtime.spatialGroups![runtime.solids![pyramidId].groupId]);
    const initialAnchor = structuredClone(runtime.spatialGroups![cube.groupId].anchor);
    const initialPosition = structuredClone(runtime.points[edgePoint].spatial!.binding);
    const expectedAnchor = { x: 100 - (initialAnchor.y - 100) * 2 - 7, y: 100 + (initialAnchor.x - 100) * 2 + 11 };

    transformSpatialSelection(runtime, snapshot, { center: { x: 100, y: 100 }, scale: 2, rotation: Math.PI / 2, delta: { x: -7, y: 11 } });
    expect(runtime.spatialGroups![cube.groupId].anchor.x).toBeCloseTo(expectedAnchor.x);
    expect(runtime.spatialGroups![cube.groupId].anchor.y).toBeCloseTo(expectedAnchor.y);
    expect(runtime.spatialGroups![cube.groupId].pivot.z).toBeCloseTo(snapshot.groups[cube.groupId].pivot.z * 2);
    expect(runtime.solids![cubeId].size.x).toBeCloseTo(snapshot.solids[cubeId].size.x * 2);
    expect(runtime.solids![prismId].polyhedron!.height).toBeCloseTo(snapshot.solids[prismId].polyhedron!.height * 2);
    expect(runtime.solids![pyramidId].groupId).toBe(untouchedGroup.id);
    expect(runtime.spatialGroups![untouchedGroup.id]).toEqual(untouchedGroup);
    expect(runtime.points[edgePoint].spatial!.binding).toEqual(initialPosition);
    expect(runtime.points[prismBaseId].spatial!.binding).toEqual({ kind: 'position', position: {
      x: initialPrismPosition.kind === 'position' ? initialPrismPosition.position.x * 2 : 0,
      y: initialPrismPosition.kind === 'position' ? initialPrismPosition.position.y * 2 : 0,
      z: initialPrismPosition.kind === 'position' ? initialPrismPosition.position.z * 2 : 0
    }});
    expect(snapshot.groups[cube.groupId].anchor).toEqual(initialAnchor);
    expect(snapshot.solids[cubeId].size.x).toBe(20);

    // A different intermediate pointer update must not compound the final result.
    transformSpatialSelection(runtime, snapshot, { center: { x: 0, y: 0 }, scale: .5, rotation: -.3, delta: { x: 900, y: -10 } });
    transformSpatialSelection(runtime, snapshot, { center: { x: 100, y: 100 }, scale: 2, rotation: Math.PI / 2, delta: { x: -7, y: 11 } });
    expect(runtime.spatialGroups![cube.groupId].anchor).toEqual(expect.objectContaining({ x: expect.closeTo(expectedAnchor.x), y: expect.closeTo(expectedAnchor.y) }));
    expect(runtime.points[prismBaseId].spatial!.binding).toEqual({ kind: 'position', position: {
      x: initialPrismPosition.kind === 'position' ? initialPrismPosition.position.x * 2 : 0,
      y: initialPrismPosition.kind === 'position' ? initialPrismPosition.position.y * 2 : 0,
      z: initialPrismPosition.kind === 'position' ? initialPrismPosition.position.z * 2 : 0
    }});
  });
});
