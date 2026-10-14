import { addPoint, addLineFromPoints,nextId } from './engineActions';
import type { ConstructionRuntime } from './runtimeTypes';
import type { Vec3, Mat3, SpatialFace, SpatialHandle } from './spatialTypes';
import {spatialDirectionEndpoint,syncSpatialConstructions} from './spatialConstructionTools';
const axes = ['x', 'y', 'z'] as const;
const identity: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const transform3 = (m: Mat3, v: Vec3): Vec3 => ({ x: m[0] * v.x + m[1] * v.y + m[2] * v.z, y: m[3] * v.x + m[4] * v.y + m[5] * v.z, z: m[6] * v.x + m[7] * v.y + m[8] * v.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, t: number): Vec3 => ({ x: a.x * t, y: a.y * t, z: a.z * t });
const unit = (axis: number): Vec3 => ({ x: axis === 0 ? 1 : 0, y: axis === 1 ? 1 : 0, z: axis === 2 ? 1 : 0 });
export function spatialProjectedParameter(p: {
    x: number;
    y: number;
}, a: {
    x: number;
    y: number;
}, b: {
    x: number;
    y: number;
},unbounded=false): number {
    const dx = b.x - a.x, dy = b.y - a.y, n = dx * dx + dy * dy;
    const t=n<1e-9?.5:((p.x-a.x)*dx+(p.y-a.y)*dy)/n;
    return unbounded?t:Math.max(0,Math.min(1,t));
}
export function spatialParameterOnLine(runtime:ConstructionRuntime,lineId:string,p:{x:number;y:number}):number {
    const line=runtime.lines[lineId],[a,b]=line.defining_points.map(id=>runtime.points[id]);
    let t=spatialProjectedParameter(p,a,b,true);
    if(!line.leftRay||line.leftRay.hidden)t=Math.max(0,t);
    if(!line.rightRay||line.rightRay.hidden)t=Math.min(1,t);
    return t;
}
export function spatialDepthAt(runtime: ConstructionRuntime, lineId: string, p: {
    x: number;
    y: number;
}): number {
    const line = runtime.lines[lineId], [a, b] = line.defining_points.map(id => runtime.points[id]);
    const t = spatialProjectedParameter(p, a, b);
    return (a.spatialDepth ?? 0) * (1 - t) + (b.spatialDepth ?? 0) * t;
}
const multiply = (a: Mat3, b: Mat3): Mat3 => Array.from({ length: 9 }, (_, i) => [0, 1, 2].reduce((s, k) => s + a[Math.floor(i / 3) * 3 + k] * b[k * 3 + i % 3], 0)) as Mat3;
function id(records: Record<string, unknown>, prefix: string) { let n = 1; while (records[`${prefix}${n}`])
    n++; return `${prefix}${n}`; }
/** Resolves true coordinates without using the drawing's projected intersections. */
export function spatialPosition(runtime: ConstructionRuntime, pointId: string, visiting = new Set<string>()): Vec3 | null {
    const p = runtime.points[pointId], definition = p?.spatial;
    if (!definition || !runtime.spatialGroups?.[definition.groupId] || visiting.has(pointId))
        return null;
    visiting.add(pointId);
    let result: Vec3 | null = null;
    const binding = definition.binding;
    if (!binding) {
        visiting.delete(pointId);
        return null;
    }
    if (binding.kind === 'vertex') {
        const solid = runtime.solids?.[binding.solidId];
        if (solid && solid.groupId === definition.groupId) {
            const origin = solid.originPointId ? spatialPosition(runtime, solid.originPointId, visiting) : solid.origin;
            if (origin)
                result = add(origin, transform3(solid.basis, { x: (binding.vertex & 1) ? solid.size.x : 0, y: (binding.vertex & 2) ? solid.size.y : 0, z: (binding.vertex & 4) ? solid.size.z : 0 }));
        }
    }
    else if (binding.kind === 'edge') {
        const [a, b] = binding.endpoints;
        if (runtime.points[a]?.spatial?.groupId === definition.groupId && runtime.points[b]?.spatial?.groupId === definition.groupId) {
            const pa = spatialPosition(runtime, a, visiting), pb = spatialPosition(runtime, b, visiting);
            if (pa && pb && Number.isFinite(binding.t))
                result = add(pa, scale(sub(pb, pa), binding.unbounded?binding.t:Math.max(0,Math.min(1,binding.t))));
        }
    }
    else if(binding.kind==='direction') {
        result=spatialDirectionEndpoint(binding,id=>runtime.points[id]?.spatial?.groupId===definition.groupId?spatialPosition(runtime,id,visiting):null);
    }
    visiting.delete(pointId);
    return result && Object.values(result).every(Number.isFinite) ? result : null;
}
function project(runtime: ConstructionRuntime, groupId: string, p: Vec3) {
    const g = runtime.spatialGroups![groupId], v = transform3(g.orientation, sub(p, g.pivot));
    return { x: g.anchor.x + v.x, y: g.anchor.y + v.y, z: v.z };
}
export function spatialLineGroup(runtime: ConstructionRuntime, lineId: string): string | null {
    const line = runtime.lines[lineId];
    if (!line)
        return null;
    const [a, b] = line.defining_points, ga = runtime.points[a]?.spatial?.groupId;
    return ga && ga === runtime.points[b]?.spatial?.groupId ? ga : null;
}
export function spatialDistance(runtime: ConstructionRuntime, a: string, b: string): number | null {
    if (!runtime.points[a]?.spatial || runtime.points[a].spatial!.groupId !== runtime.points[b]?.spatial?.groupId)
        return null;
    const pa = spatialPosition(runtime, a), pb = spatialPosition(runtime, b);
    return pa && pb ? Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z) : null;
}
export function syncSpatialGeometry(runtime: ConstructionRuntime) {
    ensureSpatialFaces(runtime);
    for (const p of Object.values(runtime.points))
        if (p.spatial) {
            const v = spatialPosition(runtime, p.id);
            p.geometryValid = !!v;
            if (v) {
                const screen = project(runtime, p.spatial.groupId, v);
                p.x = screen.x;
                p.y = screen.y;
                p.spatialPosition = v;
                p.spatialDepth = screen.z;
            }
            else {
                delete p.spatialPosition;
                delete p.spatialDepth;
            }
        }
    for (const line of Object.values(runtime.lines))
        if (spatialLineGroup(runtime, line.id)) {
            const length = spatialDistance(runtime, ...line.defining_points);
            line.geometryValid = length !== null && length > 1e-8;
            line.spatialHiddenEdge = false;
            const a = runtime.points[line.defining_points[0]]?.spatialPosition, b = runtime.points[line.defining_points[1]]?.spatialPosition;
            if (a && b) {
                const v = sub(b, a), position = (id: string) => { const p = runtime.points[id]?.spatialPosition; return p ? (p.x - a.x) * v.x + (p.y - a.y) * v.y + (p.z - a.z) * v.z : 0; };
                const ordered = [...line.points].sort((u, v) => position(u) - position(v));
                if (ordered.some((id, i) => id !== line.points[i])) {
                    const styles = new Map(line.points.slice(0, -1).map((id, i) => [[id, line.points[i + 1]].sort().join('-'), line.segmentStyles?.[i] ?? line.style]));
                    line.points = ordered;
                    line.segmentKeys = ordered.slice(0, -1).map((id, i) => [id, ordered[i + 1]].sort().join('-'));
                    line.segmentStyles = line.segmentKeys.map(key => ({ ...styles.get(key) ?? line.style }));
                }
            }
        }
    for (const solid of Object.values(runtime.solids ?? {})) {
        const faces = spatialFaces(runtime, solid.id);
        for(const polygon of Object.values(runtime.polygons))if(polygon.solidFace?.solidId===solid.id){const face=faces.find(f=>f.axis===polygon.solidFace!.axis&&f.side===polygon.solidFace!.side);polygon.solidBackFace=!face?.visible;}
        for (const lineId of solid.edges) {
            const line = runtime.lines[lineId];
            if (!line)
                continue;
            const indices = line.defining_points.map(p => solid.vertices.indexOf(p));
            line.spatialHiddenEdge = !faces.some(f => f.visible && indices.every(i => i >= 0 && ((i >> f.axis) & 1) === f.side));
        }
    }
    syncSpatialConstructions(runtime);
}
export function ensureSpatialFaces(runtime:ConstructionRuntime) {
    for(const solid of Object.values(runtime.solids??{})){
        if(solid.vertices.length!==8||solid.faces)continue;
        solid.faces=[];
        for(let axis=0;axis<3;axis++)for(let side=0;side<2;side++){
            const existing=Object.values(runtime.polygons).find(p=>p.solidFace?.solidId===solid.id&&p.solidFace.axis===axis&&p.solidFace.side===side);
            if(existing){solid.faces.push(existing.id);continue;}
            const others=[0,1,2].filter(i=>i!==axis),base=side<<axis;
            const points=[base,base|(1<<others[0]),base|(1<<others[0])|(1<<others[1]),base|(1<<others[1])].map(i=>solid.vertices[i]);
            const id=nextId('polygon',runtime);
            runtime.polygons[id]={id,points,spatialGroupId:solid.groupId,solidFace:{solidId:solid.id,axis:axis as 0|1|2,side:side as 0|1},fill:solid.edges.length?runtime.lines[solid.edges[0]]?.style.color??'#15a3ff':'#15a3ff',fillOpacity:.12};
            solid.faces.push(id);
        }
    }
}
export function spatialFacePolygon(runtime:ConstructionRuntime,solidId:string,axis:0|1|2,side:0|1):string|null {
    return Object.values(runtime.polygons).find(p=>p.solidFace?.solidId===solidId&&p.solidFace.axis===axis&&p.solidFace.side===side)?.id??null;
}
export function createCuboid(runtime: ConstructionRuntime, anchor: {
    x: number;
    y: number;
}, size: number, attachPointId?: string): string {
    runtime.solids ??= {};
    runtime.spatialGroups ??= {};
    const source = attachPointId ? runtime.points[attachPointId] : null;
    let groupId = source?.spatial?.groupId;
    let basis = [...identity] as Mat3;
    if (!groupId) {
        groupId = id(runtime.spatialGroups, 'space');
        const c = Math.SQRT1_2, s = .5, t = Math.sqrt(3) / 2;
        runtime.spatialGroups[groupId] = { id: groupId, anchor: { ...anchor }, pivot: { x: 0, y: 0, z: 0 }, orientation: [c, -c, 0, s * c, s * c, -t, t * c, t * c, s] };
    }
    else if (source?.spatial?.binding.kind === 'vertex') {
        const binding = source.spatial.binding, parent = runtime.solids[binding.solidId];
        if (parent)
            basis = parent.basis.map((v, i) => v * (((binding.vertex >> (i % 3)) & 1) ? 1 : -1)) as Mat3;
    }
    const solidId = id(runtime.solids, 'solid');
    const solid = runtime.solids[solidId] = { id: solidId, groupId, origin: source ? { x: 0, y: 0, z: 0 } : { x: -size / 2, y: -size / 2, z: -size / 2 }, originPointId: source ? attachPointId : undefined, basis, size: { x: size, y: size, z: size }, vertices: [] as string[], edges: [] as string[] };
    for (let vertex = 0; vertex < 8; vertex++) {
        if (vertex === 0 && source) {
            solid.vertices.push(source.id);
            continue;
        }
        const pointId = addPoint(runtime, { x: anchor.x, y: anchor.y, style: {}, construction_kind: 'free' });
        runtime.points[pointId].spatial = { groupId, binding: { kind: 'vertex', solidId, vertex } };
        solid.vertices.push(pointId);
    }
    syncSpatialGeometry(runtime);
    for (let vertex = 0; vertex < 8; vertex++)
        for (let axis = 0; axis < 3; axis++)
            if (!(vertex & (1 << axis))) {
                const lineId = addLineFromPoints(runtime, solid.vertices[vertex], solid.vertices[vertex | (1 << axis)], { width: 2 });
                const line = runtime.lines[lineId];
                delete line.leftRay;
                delete line.rightRay;
                solid.edges.push(lineId);
            }
    syncSpatialGeometry(runtime);
    return solidId;
}
export function addSpatialEdgePoint(runtime: ConstructionRuntime, a: string, b: string, t: number, lineId?: string): string | null {
    if(!Number.isFinite(t)||(lineId&&!runtime.lines[lineId]))return null;
    const groupId = runtime.points[a]?.spatial?.groupId;
    if (!groupId || groupId !== runtime.points[b]?.spatial?.groupId || a === b)
        return null;
    const pointId = addPoint(runtime, { x: 0, y: 0, style: {}, construction_kind: 'free' });
    const unbounded=lineId?!!(runtime.lines[lineId].leftRay&&!runtime.lines[lineId].leftRay?.hidden || runtime.lines[lineId].rightRay&&!runtime.lines[lineId].rightRay?.hidden):false;
    runtime.points[pointId].spatial = { groupId, binding: { kind: 'edge', endpoints: [a, b], t: unbounded?t:Math.max(0,Math.min(1,t)),unbounded:unbounded||undefined } };
    const line = lineId ? runtime.lines[lineId] : undefined;
    const oldPoints = line ? [...line.points] : [];
    const oldStyles = line ? oldPoints.slice(0, -1).map((_, i) => ({ ...line.segmentStyles?.[i] ?? line.style })) : [];
    if (line) {
        line.points.push(pointId);
    }
    syncSpatialGeometry(runtime);
    if (lineId) {
        const l = runtime.lines[lineId], pa = spatialPosition(runtime, l.defining_points[0])!, pb = spatialPosition(runtime, l.defining_points[1])!, v = sub(pb, pa);
        const position = (id: string) => { const p = spatialPosition(runtime, id); return p ? (p.x - pa.x) * v.x + (p.y - pa.y) * v.y + (p.z - pa.z) * v.z : 0; };
        l.points.sort((u, v) => position(u) - position(v));
        l.segmentStyles = l.points.slice(0, -1).map((id, i) => {
            const middle = (position(id) + position(l.points[i + 1])) / 2;
            const oldIndex = oldPoints.slice(0, -1).findIndex((id, j) => middle >= Math.min(position(id), position(oldPoints[j + 1])) - 1e-8 && middle <= Math.max(position(id), position(oldPoints[j + 1])) + 1e-8);
            return { ...oldStyles[oldIndex] ?? l.style };
        });
        l.segmentKeys = l.points.slice(0, -1).map((id, i) => [id, l.points[i + 1]].sort().join('-'));
    }
    return pointId;
}
export function spatialFaces(runtime: ConstructionRuntime, solidId: string): SpatialFace[] {
    const solid = runtime.solids?.[solidId], g = solid && runtime.spatialGroups?.[solid.groupId];
    if (!solid || !g)
        return [];
    const result: SpatialFace[] = [];
    for (let axis = 0; axis < 3; axis++)
        for (let side = 0; side < 2; side++) {
            const other = [0, 1, 2].filter(a => a !== axis), base = side << axis;
            const vertices = [base, base | (1 << other[0]), base | (1 << other[0]) | (1 << other[1]), base | (1 << other[1])];
            const ps = vertices.map(i => spatialPosition(runtime, solid.vertices[i]));
            if (ps.some(p => !p))
                continue;
            const points = ps.map(p => project(runtime, solid.groupId, p!));
            const n = transform3(g.orientation, transform3(solid.basis, scale(unit(axis), side ? 1 : -1)));
            result.push({ solidId, axis: axis as 0 | 1 | 2, side: side as 0 | 1, points, center: { x: points.reduce((s, p) => s + p.x, 0) / 4, y: points.reduce((s, p) => s + p.y, 0) / 4 }, depth: points.reduce((s, p) => s + p.z, 0) / 4, visible: n.z > 1e-8 });
        }
    return result;
}
export function spatialHandles(runtime: ConstructionRuntime, solidId: string, offset: number): SpatialHandle[] {
    const solid = runtime.solids?.[solidId];
    if (!solid)
        return [];
    const points = solid.vertices.map(id => runtime.points[id]).filter(p => p && p.geometryValid !== false);
    if (!points.length)
        return [];
    const xs = points.map(p => p.x), ys = points.map(p => p.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    return [
        { kind: 'rotate', solidId, groupId: solid.groupId, x: cx, y: Math.min(...ys) - offset }
    ];
}
export function rotateSpatialGroup(runtime: ConstructionRuntime, groupId: string, initial: Mat3, dx: number, dy: number) {
    const x = dy * .012, y = dx * .012, cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y);
    runtime.spatialGroups![groupId].orientation = multiply([1, 0, 0, 0, cx, -sx, 0, sx, cx], multiply([cy, 0, sy, 0, 1, 0, -sy, 0, cy], initial));
    syncSpatialGeometry(runtime);
}
export function resizeSpatialSolid(runtime: ConstructionRuntime, solidId: string, axis: 0 | 1 | 2, side: 0 | 1, delta: {
    x: number;
    y: number;
}, initialSize: Vec3, initialOrigin: Vec3) {
    const solid = runtime.solids![solidId], g = runtime.spatialGroups![solid.groupId], direction = transform3(solid.basis, unit(axis)), screen = transform3(g.orientation, direction);
    const norm = screen.x ** 2 + screen.y ** 2;
    if (norm < 1e-8 || (solid.originPointId && !side))
        return;
    // Limit sensitivity when a face normal points almost straight at the camera.
    const key = axes[axis], change = (delta.x * screen.x + delta.y * screen.y) / Math.max(.04,norm) * (side ? 1 : -1);
    solid.size = { ...initialSize, [key]: Math.max(10, initialSize[key] + change) };
    solid.origin = side ? { ...initialOrigin } : add(initialOrigin, scale(direction, initialSize[key] - solid.size[key]));
    syncSpatialGeometry(runtime);
}
export function hitSpatialFace(runtime: ConstructionRuntime, p: {
    x: number;
    y: number;
},includeHidden=false): SpatialFace | null {
    const faces = Object.values(runtime.solids ?? {}).filter(s => !s.hidden).flatMap(s => spatialFaces(runtime, s.id)).filter(f => {const id=spatialFacePolygon(runtime,f.solidId,f.axis,f.side),p=id?runtime.polygons[id]:null;return f.visible&&p&&(!p.hidden||includeHidden);}).sort((a, b) => b.depth - a.depth);
    return faces.find(f => { let inside = false; for (let i = 0, j = f.points.length - 1; i < f.points.length; j = i++) {
        const a = f.points[i], b = f.points[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)
            inside = !inside;
    } return inside; }) ?? null;
}
/** Reject malformed extension data before it becomes the active document. */
export function validateSpatialModel(runtime: ConstructionRuntime): void {
    const finiteVec = (v: any) => v && ['x', 'y', 'z'].every(k => Number.isFinite(v[k]));
    const matrix = (m: any) => Array.isArray(m) && m.length === 9 && m.every(Number.isFinite) && [0, 1, 2].every(i => [0, 1, 2].every(j => Math.abs([0, 1, 2].reduce((s, k) => s + m[k * 3 + i] * m[k * 3 + j], 0) - (i === j ? 1 : 0)) < 1e-6));
    const fail = () => { throw new Error('Invalid experimental 3D construction data'); };
    for (const [id, g] of Object.entries(runtime.spatialGroups ?? {}))
        if (!g || g.id !== id || !Number.isFinite(g.anchor?.x) || !Number.isFinite(g.anchor?.y) || !finiteVec(g.pivot) || !matrix(g.orientation))
            fail();
    for (const [id, s] of Object.entries(runtime.solids ?? {}))
        if (!s || s.id !== id || !runtime.spatialGroups?.[s.groupId] || !finiteVec(s.origin) || !finiteVec(s.size) || Object.values(s.size).some(n => n <= 0) || !matrix(s.basis) || !Array.isArray(s.vertices) || s.vertices.length !== 8 || !Array.isArray(s.edges) || s.vertices.some(id => typeof id !== 'string') || s.edges.some(id => typeof id !== 'string'))
            fail();
    for (const p of Object.values(runtime.points))
        if (p.spatial) {
            const d = p.spatial, b = d.binding;
            if (!runtime.spatialGroups?.[d.groupId] || !b)
                fail();
            if (b.kind === 'vertex') {
                if (!runtime.solids?.[b.solidId] || !Number.isInteger(b.vertex) || b.vertex < 0 || b.vertex > 7)
                    fail();
            }
            else if (b.kind === 'edge') {
                if (!Array.isArray(b.endpoints) || b.endpoints.length !== 2 || b.endpoints.some(id => typeof id !== 'string') || !Number.isFinite(b.t) || (!b.unbounded&&(b.t < 0 || b.t > 1)))
                    fail();
            }
            else if(b.kind==='direction') {
                if(typeof b.through!=='string'||!Array.isArray(b.reference)||b.reference.length!==2||b.reference.some(id=>typeof id!=='string')||(b.perpendicular&&!b.planeGuide)||(b.planeGuide!==undefined&&typeof b.planeGuide!=='string'&&(!Array.isArray(b.planeGuide)||b.planeGuide.length!==2||b.planeGuide.some(id=>typeof id!=='string'))))fail();
            }
            else fail();
        }
    for(const a of Object.values(runtime.angles))if(a.spatial){const d=a.spatial;if(!runtime.spatialGroups?.[d.groupId]||!Array.isArray(d.arms)||d.arms.length!==2||d.arms.some(arm=>!Array.isArray(arm)||arm.length!==2||arm.some(id=>typeof id!=='string')))fail();}
    for(const p of Object.values(runtime.polygons))if(p.spatialGroupId&&!runtime.spatialGroups?.[p.spatialGroupId])fail();
    for(const p of Object.values(runtime.polygons))if(p.solidFace){const f=p.solidFace,s=runtime.solids?.[f.solidId];if(!s||![0,1,2].includes(f.axis)||![0,1].includes(f.side)||p.spatialGroupId!==s.groupId)fail();}
}
