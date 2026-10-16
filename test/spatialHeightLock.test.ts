import { describe, expect, it } from 'vitest';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { createCuboid, createPrismOrPyramid, resizePolyhedron, resizeSpatialSolid, spatialPosition, syncSpatialGeometry, validateSpatialModel } from '../src/core/spatialGeometry';
import { deformSpatialFace, deformSpatialVertex, setSpatialSolidHeightLocked, setSpatialSolidShapeLocked, setSpatialSolidTiltLocked } from '../src/core/spatialSolidEditing';
import { polyhedronBase } from '../src/core/polyhedronGeometry';
import { dot3, sub3 } from '../src/core/spatialMath';
import { captureSpatialSelection, transformSpatialSelection } from '../src/core/spatialSelectionTransform';
import { createConstructionClipboard, pasteConstructionClipboard } from '../src/core/constructionClipboard';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('Independent solid height lock', () => {
  for (const kind of ['prism', 'pyramid'] as const) for (const tiltLocked of [false, true]) for (const heightLocked of [false, true]) {
    it(`${kind}: height=${heightLocked}, tilt=${tiltLocked} constrains the same top drag independently`, () => {
      const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,kind,{x:100,y:200},80,5)!,s=r.solids![id],d=s.polyhedron!;
      d.offset={x:12,y:-9,z:0};setSpatialSolidTiltLocked(r,id,tiltLocked);setSpatialSolidHeightLocked(r,id,heightLocked);
      const height=d.height,offset={...d.offset},baseIds=[...d.basePoints],basePositions=baseIds.map(id=>spatialPosition(r,id));
      resizePolyhedron(r,id,{x:32,y:-38},height,offset);
      if(heightLocked)expect(d.height).toBe(height);else expect(Math.abs(d.height-height)).toBeGreaterThan(20);
      if(tiltLocked)expect(d.offset).toEqual(offset);else expect(Math.hypot(d.offset.x-offset.x,d.offset.y-offset.y)).toBeGreaterThan(10);
      expect(baseIds.map(id=>spatialPosition(r,id))).toEqual(basePositions);
      const base=polyhedronBase(s,id=>spatialPosition(r,id))!,top=spatialPosition(r,s.vertices[baseIds.length])!;
      expect(dot3(sub3(top,base.center),base.normal)).toBeCloseTo(d.height,8);
      expect(()=>validateSpatialModel(r)).not.toThrow();
    });
  }

  it('locks the current height without changing the existing tilt, shape, or positions', () => {
    const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'pyramid',{x:0,y:0},80,4)!,s=r.solids![id];
    setSpatialSolidTiltLocked(r,id,false);s.polyhedron!.offset={x:24,y:15,z:0};s.polyhedron!.height=123;syncSpatialGeometry(r);
    const before=clone(s),positions=s.vertices.map(id=>spatialPosition(r,id));
    setSpatialSolidHeightLocked(r,id,true);
    expect(s).toEqual({...before,heightLocked:true});expect(s.vertices.map(id=>spatialPosition(r,id))).toEqual(positions);
    setSpatialSolidHeightLocked(r,id,false);resizePolyhedron(r,id,{x:0,y:-20},123,{...s.polyhedron!.offset});
    expect(s.polyhedron!.height).toBeGreaterThan(123);
  });

  it('constrains top and bottom face edits while allowing unlocked base-shape editing', () => {
    const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'prism',{x:0,y:0},80,4)!,s=r.solids![id];
    setSpatialSolidHeightLocked(r,id,true);setSpatialSolidShapeLocked(r,id,false);
    let initial=clone(r),before=JSON.stringify(r);
    expect(deformSpatialFace(r,id,0,2,0,{x:20,y:30},initial)).toBe(false);
    expect(JSON.stringify(r)).toBe(before);
    expect(deformSpatialFace(r,id,1,2,1,{x:20,y:30},initial)).toBe(false);
    expect(JSON.stringify(r)).toBe(before);
    setSpatialSolidTiltLocked(r,id,false);initial=clone(r);
    expect(deformSpatialFace(r,id,1,2,1,{x:40,y:25},initial)).toBe(true);
    expect(s.polyhedron!.height).toBe(80);expect(Math.hypot(s.polyhedron!.offset.x,s.polyhedron!.offset.y)).toBeGreaterThan(10);
    initial=clone(r);
    expect(deformSpatialVertex(r,id,s.polyhedron!.basePoints[0],{x:5,y:3},initial)).toBe(true);
    expect(s.polyhedron!.height).toBe(80);
  });

  for (const kind of ['prism', 'pyramid'] as const) for (const heightLocked of [false, true]) for (const shapeLocked of [false, true]) {
    it(`${kind}: bottom drag cannot deform the base or change height with height lock=${heightLocked}, shape lock=${shapeLocked}`, () => {
      const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,kind,{x:0,y:0},80,4)!;
      setSpatialSolidHeightLocked(r,id,heightLocked);
      setSpatialSolidShapeLocked(r,id,shapeLocked);
      setSpatialSolidTiltLocked(r,id,false);
      r.solids![id].polyhedron!.offset={x:12,y:-9,z:0};syncSpatialGeometry(r);
      const before=JSON.stringify(r),initial=clone(r);
      expect(deformSpatialFace(r,id,0,2,0,{x:30,y:40},initial)).toBe(false);
      expect(JSON.stringify(r)).toBe(before);
      if(kind==='pyramid'){
        const d=r.solids![id].polyhedron!;
        resizePolyhedron(r,id,{x:0,y:-30},d.height,{...d.offset});
        if(heightLocked)expect(d.height).toBe(80);else expect(d.height).toBeGreaterThan(80);
      }else if(!heightLocked){
        expect(deformSpatialFace(r,id,1,2,1,{x:0,y:-30},initial)).toBe(true);
        expect(r.solids![id].polyhedron!.height).toBeGreaterThan(80);
      }
    });
  }

  it('also blocks top and bottom height resizing of cuboids before conversion', () => {
    const r=makeEmptyRuntime(),id=createCuboid(r,{x:0,y:0},80),s=r.solids![id],before=clone(s);
    setSpatialSolidHeightLocked(r,id,true);
    for(const side of [0,1] as const)resizeSpatialSolid(r,id,2,side,{x:20,y:-30},before.size,before.origin);
    expect(s.size).toEqual(before.size);expect(s.origin).toEqual(before.origin);expect(s.polyhedron).toBeUndefined();
    setSpatialSolidHeightLocked(r,id,false);
    const unlocked=JSON.stringify(s);
    resizeSpatialSolid(r,id,2,0,{x:20,y:-30},before.size,before.origin);
    expect(JSON.stringify(s)).toBe(unlocked);
    resizeSpatialSolid(r,id,2,1,{x:0,y:-30},before.size,before.origin);
    expect(s.size.z).toBeGreaterThan(80);
  });

  it('retains the lock through saved runtime data and independent copied solids', () => {
    const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'prism',{x:0,y:0},80,4)!;
    setSpatialSolidHeightLocked(r,id,true);setSpatialSolidTiltLocked(r,id,false);
    const restored=clone(r);expect(()=>validateSpatialModel(restored)).not.toThrow();expect(restored.solids![id].heightLocked).toBe(true);
    const maps=pasteConstructionClipboard(restored,createConstructionClipboard(restored,{solids:[id]}))!;
    const copy=restored.solids![maps.solids.get(id)!];expect(copy.heightLocked).toBe(true);expect(copy.groupId).not.toBe(restored.solids![id].groupId);
    setSpatialSolidHeightLocked(restored,copy.id,false);expect(restored.solids![id].heightLocked).toBe(true);
    const d=copy.polyhedron!;resizePolyhedron(restored,copy.id,{x:20,y:-30},d.height,{...d.offset});
    expect(d.height).not.toBe(80);expect(restored.solids![id].polyhedron!.height).toBe(80);
  });

  it('keeps whole-solid scaling proportional, like the shape lock', () => {
    const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'prism',{x:200,y:200},80,4)!,s=r.solids![id];
    setSpatialSolidHeightLocked(r,id,true);
    transformSpatialSelection(r,captureSpatialSelection(r,s.vertices),{center:{x:200,y:200},scale:2});
    expect(s.polyhedron!.height).toBe(160);expect(s.heightLocked).toBe(true);
    resizePolyhedron(r,id,{x:0,y:-30},160,{...s.polyhedron!.offset});expect(s.polyhedron!.height).toBe(160);
  });

  it('rejects invalid saved lock values and accepts absent or boolean state', () => {
    const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'pyramid',{x:0,y:0},80,3)!;
    expect(()=>validateSpatialModel(r)).not.toThrow();
    for(const value of [true,false]){r.solids![id].heightLocked=value;expect(()=>validateSpatialModel(r)).not.toThrow();}
    for(const value of [0,'true',null]){(r.solids![id] as any).heightLocked=value;expect(()=>validateSpatialModel(r)).toThrow();}
  });
});
