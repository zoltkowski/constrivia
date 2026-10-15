import { describe, expect, it } from 'vitest';
import { createCuboid, rotateSpatialGroupAxis, spatialHandles } from '../src/core/spatialGeometry';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import type { Mat3 } from '../src/core/spatialTypes';
import { transform3 } from '../src/core/spatialGeometry';

describe('3D spatial controls', () => {
  it('associates each rotation plane with a matching face and keeps hit areas separate', () => {
    const runtime=makeEmptyRuntime(),id=createCuboid(runtime,{x:120,y:100},36);
    const handles=spatialHandles(runtime,id,26);
    expect(handles.map(h=>h.kind)).toEqual(['rotate','rotateAxis','rotateAxis','rotateAxis','scale']);
    expect(handles.slice(1,4).map(h=>h.axis)).toEqual([0,1,2]);
    for(const handle of handles.filter(h=>h.kind==='rotateAxis')){
      const face=runtime.polygons[handle.planeFaceId!];
      expect(face.solidFace?.axis).toBe(handle.axis);
      const ps=face.points.map(id=>runtime.points[id]);
      const c={x:ps.reduce((s,p)=>s+p.x,0)/ps.length,y:ps.reduce((s,p)=>s+p.y,0)/ps.length};
      expect(Math.hypot(handle.x-c.x,handle.y-c.y)).toBeGreaterThan(26);
    }
    for(let i=0;i<handles.length;i++)for(let j=i+1;j<handles.length;j++)expect(Math.hypot(handles[i].x-handles[j].x,handles[i].y-handles[j].y)).toBeGreaterThanOrEqual(26*1.8-1e-8);
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
