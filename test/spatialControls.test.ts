import { describe, expect, it } from 'vitest';
import { createCuboid, rotateSpatialGroupAxis, spatialHandles } from '../src/core/spatialGeometry';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import type { Mat3 } from '../src/core/spatialTypes';
import { transform3 } from '../src/core/spatialGeometry';

describe('3D spatial controls', () => {
  it('places free rotation, labeled axis rotations, and scale controls in a spaced row above the solid', () => {
    const runtime = makeEmptyRuntime(), id = createCuboid(runtime, { x: 120, y: 100 }, 36);
    const handles = spatialHandles(runtime, id, 26);
    expect(handles.map(h => h.kind)).toEqual(['rotate', 'rotateAxis', 'rotateAxis', 'rotateAxis', 'scale']);
    expect(handles.slice(1, 4).map(h => h.axis)).toEqual([0, 1, 2]);
    const top = Math.min(...runtime.solids![id].vertices.map(pointId => runtime.points[pointId].y));
    expect(handles.slice(0, 4).every(handle => Math.abs(handle.y - (top - 26 * 1.8)) < 1e-8)).toBe(true);
    for (let i = 1; i < 4; i++) expect(handles[i].x - handles[i - 1].x).toBeCloseTo(26 * 1.8);
    expect(handles[4].x).toBeCloseTo(Math.max(...runtime.solids![id].vertices.map(pointId => runtime.points[pointId].x)) + 26 * 1.8);
    expect(handles[4].y).toBeCloseTo(Math.max(...runtime.solids![id].vertices.map(pointId => runtime.points[pointId].y)) + 26 * 1.8);
  });

  it('rotates each local axis absolutely and keeps other groups fixed and orthonormal', () => {
    const runtime = makeEmptyRuntime(), firstId = createCuboid(runtime, { x: 20, y: 30 }, 24), secondId = createCuboid(runtime, { x: 230, y: 40 }, 20);
    const first = runtime.solids![firstId], second = runtime.solids![secondId];
    const initial = [...runtime.spatialGroups![first.groupId].orientation] as Mat3;
    const secondInitial = [...runtime.spatialGroups![second.groupId].orientation] as Mat3;
    const originalSecondPositions = second.vertices.map(id => ({ x: runtime.points[id].x, y: runtime.points[id].y }));
    const angle = Math.PI / 3;
    for (const axis of [0, 1, 2] as const) {
      rotateSpatialGroupAxis(runtime, first.groupId, initial, axis, angle);
      const actual = runtime.spatialGroups![first.groupId].orientation;
      const basis = axis === 0 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
      const c = Math.cos(angle), s = Math.sin(angle);
      const rotated = axis === 0 ? { x: 0, y: c, z: s } : axis === 1 ? { x: c, y: 0, z: -s } : { x: c, y: s, z: 0 };
      const expected = transform3(initial, rotated);
      const transformedBasis = transform3(actual, basis);
      expect(transformedBasis.x).toBeCloseTo(expected.x, 8);
      expect(transformedBasis.y).toBeCloseTo(expected.y, 8);
      expect(transformedBasis.z).toBeCloseTo(expected.z, 8);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const dot = actual[i] * actual[j] + actual[3 + i] * actual[3 + j] + actual[6 + i] * actual[6 + j];
        expect(dot).toBeCloseTo(i === j ? 1 : 0, 8);
      }
    }
    expect(runtime.spatialGroups![second.groupId].orientation).toEqual(secondInitial);
    expect(second.vertices.map(id => ({ x: runtime.points[id].x, y: runtime.points[id].y }))).toEqual(originalSecondPositions);
  });
});
