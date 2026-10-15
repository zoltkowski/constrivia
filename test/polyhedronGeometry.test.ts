import { describe, expect, it } from 'vitest';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { addPoint } from '../src/core/engineActions';
import { createCuboid, createPrismOrPyramid, resizePolyhedron, rotateSpatialGroup, setSpatialSolidRightLocked, spatialDistance, spatialFaces, spatialPosition, syncSpatialGeometry, validateSpatialModel } from '../src/core/spatialGeometry';
import { add3, dot3, norm3, scale3, sub3, mean3, polygonNormal3 } from '../src/core/spatialMath';
import { recomputeAllRuntime } from '../src/core/runtimeRecompute';
describe('polygon based spatial solids',()=>{
    it('keeps a child on the same oriented side of a face while its parent slants through large angles',()=>{
        const r=makeEmptyRuntime(),parentId=createPrismOrPyramid(r,'prism',{x:0,y:0},40,4)!,parent=r.solids![parentId];
        setSpatialSolidRightLocked(r,parentId,false);parent.polyhedron!.offset={x:180,y:180,z:0};syncSpatialGeometry(r);
        const faceId=parent.faces![2],childId=createPrismOrPyramid(r,'pyramid',{x:0,y:0},25,3,faceId)!,child=r.solids![childId];
        const orientation=()=>{
            const points=child.polyhedron!.basePoints.map(id=>spatialPosition(r,id)!),n=polygonNormal3(points)!;
            return dot3(sub3(spatialPosition(r,child.vertices[child.vertices.length-1])!,mean3(points)),n);
        };
        const sign=Math.sign(orientation());parent.polyhedron!.offset={x:-180,y:-180,z:0};syncSpatialGeometry(r);
        expect(orientation()).toBeCloseTo(sign*25,7);
    });
    it.each([3,4,5,12])('creates a regular %i-sided prism with stable faces and invariant edges',sides=>{
        const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'prism',{x:100,y:100},60,sides)!;
        const s=r.solids![id];expect(s.vertices).toHaveLength(2*sides);expect(s.edges).toHaveLength(3*sides);expect(s.faces).toHaveLength(sides+2);
        expect(s.vertices.every(id=>!r.points[id].label)).toBe(true);
        if(sides===4){
            const base=s.polyhedron!.basePoints.map(id=>spatialPosition(r,id)!);
            expect(base.map(p=>[p.x,p.y,p.z])).toEqual([[-30,-30,0],[30,-30,0],[30,30,0],[-30,30,0]]);
            expect(spatialDistance(r,...s.polyhedron!.basePoints.slice(0,2) as [string,string])).toBeCloseTo(60);
            expect(s.polyhedron!.height).toBe(60);
            expect(spatialFaces(r,id).filter(face=>face.visible)).toHaveLength(3);
        }
        const distances=s.edges.map(id=>spatialDistance(r,...r.lines[id].defining_points));const faces=[...s.faces!];
        rotateSpatialGroup(r,s.groupId,[...r.spatialGroups![s.groupId].orientation],83,-39);
        s.edges.forEach((id,i)=>expect(spatialDistance(r,...r.lines[id].defining_points)).toBeCloseTo(distances[i]!,7));
        expect(s.faces).toEqual(faces);expect(spatialFaces(r,id)).toHaveLength(sides+2);expect(()=>validateSpatialModel(r)).not.toThrow();
    });
    it.each([3,5,8])('creates a regular %i-sided pyramid and keeps its apex over the center',n=>{
        const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'pyramid',{x:0,y:0},40,n)!;const s=r.solids![id];
        expect(s.vertices).toHaveLength(n+1);expect(s.edges).toHaveLength(2*n);expect(s.faces).toHaveLength(n+1);
        const apex=spatialPosition(r,s.vertices[n])!;expect(apex.x).toBeCloseTo(0);expect(apex.y).toBeCloseTo(0);expect(apex.z).toBeCloseTo(40);
        expect(()=>validateSpatialModel(r)).not.toThrow();
    });
    it('copies a 2D irregular convex base without changing its dependencies or coordinates',()=>{
        const r=makeEmptyRuntime();const ids=[[20,30],[110,30],[130,90],[0,90]].map(([x,y])=>addPoint(r,{x,y,style:{},construction_kind:'free'}));
        r.polygons.base={id:'base',points:ids,fill:'#aa00bb',fillOpacity:.3};const before=JSON.stringify(ids.map(id=>({...r.points[id],style:undefined})));
        const id=createPrismOrPyramid(r,'prism',{x:240,y:200},50,3,'base')!;
        expect(JSON.stringify(ids.map(id=>({...r.points[id],style:undefined})))).toBe(before);expect(r.polygons.base.hidden).toBe(true);expect(r.solids![id].polyhedron!.basePoints).not.toEqual(ids);
        expect(spatialDistance(r,...r.solids![id].polyhedron!.basePoints.slice(0,2) as [string,string])).toBeCloseTo(90);
        expect(r.polygons[r.solids![id].faces![0]].fill).toBe('#aa00bb');
    });
    it('reuses a spatial face and follows its deformation without rotating an independent group',()=>{
        const r=makeEmptyRuntime(),cubeId=createCuboid(r,{x:0,y:0},40),cube=r.solids![cubeId];
        const face=cube.faces![5],id=createPrismOrPyramid(r,'pyramid',{x:0,y:0},30,3,face)!;const s=r.solids![id];
        expect(s.groupId).toBe(cube.groupId);expect(s.polyhedron!.basePoints).toEqual(r.polygons[face].points);
        const before=spatialPosition(r,s.vertices[4])!;cube.size.z+=15;syncSpatialGeometry(r);
        expect(spatialPosition(r,s.vertices[4])!.z-before.z).toBeCloseTo(15);
        const otherId=createPrismOrPyramid(r,'prism',{x:300,y:0},30,3)!;const other=r.solids![otherId],orientation=[...r.spatialGroups![other.groupId].orientation];
        rotateSpatialGroup(r,s.groupId,[...r.spatialGroups![s.groupId].orientation],45,20);expect(r.spatialGroups![other.groupId].orientation).toEqual(orientation);
    });
    it('resizes along the normal when locked while preserving existing tilt',()=>{
        const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'prism',{x:0,y:0},50,5)!;const s=r.solids![id],d=s.polyhedron!;
        resizePolyhedron(r,id,{x:20,y:-20},d.height,{...d.offset});expect(d.offset).toEqual({x:0,y:0,z:0});expect(d.height).not.toBe(50);
        setSpatialSolidRightLocked(r,id,false);resizePolyhedron(r,id,{x:32,y:18},d.height,{...d.offset});expect(norm3(d.offset)).toBeGreaterThan(1);
        const displacements=d.basePoints.map((id,i)=>sub3(spatialPosition(r,s.vertices[i+5])!,spatialPosition(r,id)!));
        displacements.forEach(v=>expect(norm3(sub3(v,displacements[0]))).toBeLessThan(1e-7));expect(dot3(d.offset,d.normal)).toBeCloseTo(0);
        const height=d.height,offset={...d.offset},before=displacements.map(v=>({...v}));
        setSpatialSolidRightLocked(r,id,true);expect(d.height).toBe(height);expect(d.offset).toEqual(offset);
        const lockedDisplacements=d.basePoints.map((id,i)=>sub3(spatialPosition(r,s.vertices[i+5])!,spatialPosition(r,id)!));
        lockedDisplacements.forEach((v,i)=>expect(v).toEqual(before[i]));
        resizePolyhedron(r,id,{x:12,y:-9},height,{...offset});
        expect(d.offset).toEqual(offset);expect(d.height).not.toBe(height);
        const resized=d.basePoints.map((id,i)=>sub3(spatialPosition(r,s.vertices[i+5])!,spatialPosition(r,id)!));
        resized.forEach(v=>expect(norm3(sub3(v,add3(scale3(d.normal,d.height),offset)))).toBeLessThan(1e-7));
    });
    it('retains a deleted face and invalidates malformed persisted metadata',()=>{
        const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'prism',{x:0,y:0},50,5)!;const s=r.solids![id],face=s.faces![2];delete r.polygons[face];
        const restored=JSON.parse(JSON.stringify(r));recomputeAllRuntime(restored);expect(restored.polygons[face]).toBeUndefined();expect(()=>validateSpatialModel(restored)).not.toThrow();
        restored.solids[id].polyhedron.height=NaN;expect(()=>validateSpatialModel(restored)).toThrow();
    });
    it('rejects nonconvex, self crossing and degenerate bases without allocating objects',()=>{
        for(const ps of [[[0,0],[50,0],[15,15],[0,50]],[[0,0],[50,50],[0,50],[50,0]],[[0,0],[50,0],[100,0]]]){
            const r=makeEmptyRuntime(),points=ps.map(([x,y])=>addPoint(r,{x,y,style:{},construction_kind:'free'}));r.polygons.base={id:'base',points};const before=JSON.stringify(r);
            expect(createPrismOrPyramid(r,'prism',{x:0,y:0},50,3,'base')).toBeNull();expect(JSON.stringify(r)).toBe(before);
        }
    });
});
