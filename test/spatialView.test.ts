import { describe, expect, it } from 'vitest';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { alignSpatialSolidCanonicalView } from '../src/core/spatialView';
import { defaultSpatialOrientation } from '../src/core/spatialOrientation';
import { createCuboid, rotateSpatialGroup, spatialPosition, syncSpatialGeometry, transform3 } from '../src/core/spatialGeometry';
import { createPrismOrPyramid, polyhedronBase, resizePolyhedron } from '../src/core/polyhedronGeometry';
import { cross3, dot3, sub3, unit3 } from '../src/core/spatialMath';

const positions = (r: ReturnType<typeof makeEmptyRuntime>, ids: string[]) => ids.map(id => spatialPosition(r, id));

describe('Canonical three-quarter view', () => {
  for (const kind of ['prism', 'pyramid', 'cuboid'] as const) {
    it(`restores a readable upright view of a ${kind}, preserving its geometry`, () => {
      const r = makeEmptyRuntime();
      const id = kind === 'cuboid' ? createCuboid(r, {x:200,y:200}, 100)
        : createPrismOrPyramid(r, kind, {x:200,y:200}, 100, kind === 'prism' ? 4 : 5)!;
      const solid = r.solids![id], group = r.spatialGroups![solid.groupId];
      if (solid.polyhedron) { solid.polyhedron.offset={x:30,y:-20,z:0}; solid.polyhedron.rightLocked=false; }
      syncSpatialGeometry(r);
      const original = structuredClone(solid), coords = positions(r, solid.vertices);
      const placement = {anchor:{...group.anchor},pivot:{...group.pivot}};
      rotateSpatialGroup(r,solid.groupId,[...group.orientation],45,30);
      expect(alignSpatialSolidCanonicalView(r, id)).toBe(true);
      const normal = solid.polyhedron ? polyhedronBase(solid, id=>spatialPosition(r,id))!.normal : {x:0,y:0,z:1};
      const n = transform3(group.orientation, normal);
      expect(n.x).toBeCloseTo(0, 10); expect(n.y).toBeCloseTo(-Math.sqrt(3)/2, 10); expect(n.z).toBeCloseTo(.5, 10);
      const baseIds = solid.polyhedron?.basePoints ?? solid.vertices.slice(0,4);
      const baseScreen = baseIds.map(id=>r.points[id]);
      expect(Math.max(...baseScreen.map(p=>p.y))-Math.min(...baseScreen.map(p=>p.y))).toBeGreaterThan(10);
      expect(solid).toEqual(original); expect(positions(r, solid.vertices)).toEqual(coords);
      expect({anchor:group.anchor,pivot:group.pivot}).toEqual(placement);
      expect(alignSpatialSolidCanonicalView(r, id)).toBe(false);
      if(kind !== 'pyramid') expect(group.orientation).toEqual(defaultSpatialOrientation());
    });
  }

  it('orients a solid on a vertical shared base and rotates only its connected group', () => {
    const r=makeEmptyRuntime(),parentId=createCuboid(r,{x:200,y:200},100),parent=r.solids![parentId];
    const face=parent.faces!.find(id=>r.polygons[id].solidFace?.axis===1)!;
    const childId=createPrismOrPyramid(r,'prism',{x:0,y:0},60,4,face)!,child=r.solids![childId];
    const independentId=createCuboid(r,{x:600,y:200},80),independent=r.solids![independentId];
    const stable=structuredClone(r.spatialGroups![independent.groupId]),coords=positions(r,[...parent.vertices,...child.vertices]);
    expect(alignSpatialSolidCanonicalView(r,childId)).toBe(true);
    const n=transform3(r.spatialGroups![child.groupId].orientation,polyhedronBase(child,id=>spatialPosition(r,id))!.normal);
    expect(n.x).toBeCloseTo(0,10);expect(n.y).toBeCloseTo(-Math.sqrt(3)/2,10);expect(n.z).toBeCloseTo(.5,10);
    expect(positions(r,[...parent.vertices,...child.vertices])).toEqual(coords);
    expect(r.spatialGroups![independent.groupId]).toEqual(stable);
  });

  it('shares the creation view without sharing a mutable orientation array', () => {
    const r=makeEmptyRuntime(),a=createCuboid(r,{x:100,y:200},80),b=createPrismOrPyramid(r,'prism',{x:400,y:200},80,4)!;
    const first=r.spatialGroups![r.solids![a].groupId].orientation,second=r.spatialGroups![r.solids![b].groupId].orientation;
    expect(first).toEqual(defaultSpatialOrientation());expect(second).toEqual(first);expect(second).not.toBe(first);
    first[0]=0;expect(second).toEqual(defaultSpatialOrientation());
    expect(alignSpatialSolidCanonicalView(r,'missing')).toBe(false);
    delete r.points[r.solids![b].vertices[0]];
    expect(alignSpatialSolidCanonicalView(r,b)).toBe(false);
  });
});
