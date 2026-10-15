import { describe, expect, it } from 'vitest';
import { createCuboid, createPrismOrPyramid, rotateSpatialGroupAxis, spatialHandles, syncSpatialGeometry } from '../src/core/spatialGeometry';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import type { Mat3 } from '../src/core/spatialTypes';
import { transform3 } from '../src/core/spatialGeometry';

describe('3D spatial controls', () => {
  it.each(['cuboid','prism','pyramid'] as const)('groups rotation planes outside a %s and keeps them fixed through a full rotation', kind => {
    const runtime=makeEmptyRuntime(),id=kind==='cuboid'?createCuboid(runtime,{x:120,y:100},36):createPrismOrPyramid(runtime,kind,{x:120,y:100},36,5)!;
    const group=runtime.spatialGroups![runtime.solids![id].groupId],initial=[...group.orientation] as Mat3;
    const handles=spatialHandles(runtime,id,26),planes=handles.filter(h=>h.kind==='rotateAxis');
    expect(handles.map(h=>h.kind)).toEqual(['rotate','rotateAxis','rotateAxis','rotateAxis','scale']);
    expect(planes.map(h=>h.axis)).toEqual([0,1,2]);
    expect(planes.every(h=>h.planeCenter===planes[0].planeCenter)).toBe(true);
    for(const axis of [0,1,2] as const)for(let step=0;step<=24;step++){
      rotateSpatialGroupAxis(runtime,group.id,initial,axis,step*Math.PI/12);
      const rotated=spatialHandles(runtime,id,26);
      expect(rotated.filter(h=>h.kind==='rotateAxis')).toEqual(planes);
      for(const h of planes)for(const pid of runtime.solids![id].vertices){
        const p=runtime.points[pid];expect(Math.hypot(h.x-p.x,h.y-p.y)).toBeGreaterThan(26);
      }
      for(let i=0;i<rotated.length;i++)for(let j=i+1;j<rotated.length;j++)expect(Math.hypot(rotated[i].x-rotated[j].x,rotated[i].y-rotated[j].y)).toBeGreaterThanOrEqual(26*1.8-1e-8);
    }
  });

  it.each(['cuboid','prism','pyramid'] as const)('keeps every rotation handle fixed when changing %s height and encloses yellow in the triangle',kind=>{
    const runtime=makeEmptyRuntime(),id=kind==='cuboid'?createCuboid(runtime,{x:195,y:400},110):createPrismOrPyramid(runtime,kind,{x:195,y:400},110,4)!;
    const solid=runtime.solids![id],rotations=()=>spatialHandles(runtime,id,26).filter(h=>h.kind==='rotate'||h.kind==='rotateAxis'),before=rotations();
    for(const height of [20,80,210,430]){
      if(solid.polyhedron)solid.polyhedron.height=height;else solid.size.z=height;
      syncSpatialGeometry(runtime);expect(rotations()).toEqual(before);
    }
    const yellow=before[0],[a,b,c]=before.slice(1);
    const cross=(p:typeof a,q:typeof a)=>(q.x-p.x)*(yellow.y-p.y)-(q.y-p.y)*(yellow.x-p.x);
    expect([cross(a,b),cross(b,c),cross(c,a)].every(n=>n<0)||[cross(a,b),cross(b,c),cross(c,a)].every(n=>n>0)).toBe(true);
    for(const axis of before.slice(1))expect(Math.hypot(axis.x-yellow.x,axis.y-yellow.y)).toBeGreaterThanOrEqual(26*1.8);
  });

  it('moves the panel with the group and keeps its screen spacing at each zoom',()=>{
    const runtime=makeEmptyRuntime(),id=createCuboid(runtime,{x:120,y:100},36),group=runtime.spatialGroups![runtime.solids![id].groupId];
    const before=spatialHandles(runtime,id,26).filter(h=>h.kind==='rotateAxis');
    group.anchor.x+=75;group.anchor.y-=40;
    const moved=spatialHandles(runtime,id,26).filter(h=>h.kind==='rotateAxis');
    moved.forEach((h,i)=>{expect(h.x-before[i].x).toBeCloseTo(75);expect(h.y-before[i].y).toBeCloseTo(-40);});
    for(const zoom of [.25,.5,1,2,4]){
      const planes=spatialHandles(runtime,id,26/zoom).filter(h=>h.kind==='rotateAxis');
      planes.forEach((h,i)=>{
        expect((h.x-h.planeCenter!.x)*zoom).toBeCloseTo(before[i].x-before[i].planeCenter!.x);
        expect((h.y-h.planeCenter!.y)*zoom).toBeCloseTo(before[i].y-before[i].planeCenter!.y);
      });
    }
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
