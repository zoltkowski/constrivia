import { addPoint, addLineFromPoints, nextId } from './engineActions';
import type { ConstructionRuntime, AngleRuntime, StrokeStyle, AngleStyle } from './runtimeTypes';
import type { Vec3, SpatialPointDefinition } from './spatialTypes';
import { spatialPosition, transform3, syncSpatialGeometry } from './spatialGeometry';
export const subtract3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const plus = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const times = (a: Vec3, t: number): Vec3 => ({ x: a.x * t, y: a.y * t, z: a.z * t });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const normalized = (a: Vec3) => times(a, 1 / norm(a));
export function spatialDirectionEndpoint(binding: Extract<SpatialPointDefinition['binding'], {
    kind: 'direction';
}>, resolve: (id: string) => Vec3 | null): Vec3 | null {
    const p = resolve(binding.through), a = resolve(binding.reference[0]), b = resolve(binding.reference[1]);
    if (!p || !a || !b)
        return null;
    const reference = subtract3(b, a);
    let direction = reference;
    if (binding.perpendicular) {
        const guide = binding.planeGuide;
        if (!guide)
            return null;
        const q = resolve(Array.isArray(guide) ? guide[0] : guide), r = Array.isArray(guide) ? resolve(guide[1]) : null;
        if (!q || (Array.isArray(guide) && !r))
            return null;
        let plane = r ? subtract3(r, q) : subtract3(q, p);
        if (r && norm(cross(reference, plane)) < 1e-8)
            plane = subtract3(q, p);
        direction = cross(cross(reference, plane), reference);
    }
    if (norm(direction) < 1e-8 || norm(reference) < 1e-8)
        return null;
    return plus(p, times(normalized(direction), norm(reference)));
}
export function spatialPolygonStatus(runtime: ConstructionRuntime, ids: string[]): 'valid' | 'incomplete' | 'noncoplanar' | 'invalid' {
    if (ids.length < 3)
        return 'incomplete';
    const group = runtime.points[ids[0]]?.spatial?.groupId;
    if (!group || new Set(ids).size !== ids.length || ids.some(id => runtime.points[id]?.spatial?.groupId !== group))
        return 'invalid';
    const points = ids.map(id => spatialPosition(runtime, id));
    if (points.some(p => !p))
        return 'invalid';
    const p = points as Vec3[], extent = Math.max(1, ...p.map(q => norm(subtract3(q, p[0]))));
    let normal: Vec3 | null = null;
    for (let i = 1; i < p.length - 1 && !normal; i++) {
        const n = cross(subtract3(p[i], p[0]), subtract3(p[i + 1], p[0]));
        if (norm(n) > extent * extent * 1e-9)
            normal = normalized(n);
    }
    if (!normal)
        return 'invalid';
    return p.every(q => Math.abs(dot(subtract3(q, p[0]), normal!)) <= extent * 1e-8) ? 'valid' : 'noncoplanar';
}
export function createSpatialPolygon(runtime: ConstructionRuntime, ids: string[], fill?: string, stroke: StrokeStyle = {}): string | null {
    if (spatialPolygonStatus(runtime, ids) !== 'valid')
        return null;
    const id = nextId('polygon', runtime);
    runtime.polygons[id] = { id, points: [...ids], spatialGroupId: runtime.points[ids[0]].spatial!.groupId, fill, fillOpacity: .2, geometryValid: true };
    for (let i = 0; i < ids.length; i++) {
        const a = ids[i], b = ids[(i + 1) % ids.length];
        if (!Object.values(runtime.lines).some(l => l.geometryValid!==false && l.points.includes(a) && l.points.includes(b))) {
            const line = runtime.lines[addLineFromPoints(runtime, a, b, stroke)];
            delete line.leftRay;
            delete line.rightRay;
        }
    }
    return id;
}
export function createSpatialDependentLine(runtime: ConstructionRuntime, kind: 'parallel' | 'perpendicular', through: string, reference: [
    string,
    string
], planeGuide?: string | [
    string,
    string
], style: StrokeStyle = {}): string | null {
    const groupId = runtime.points[through]?.spatial?.groupId;
    const dependencies = [through, ...reference, ...(Array.isArray(planeGuide) ? planeGuide : planeGuide ? [planeGuide] : [])];
    if (!groupId || dependencies.some(id => runtime.points[id]?.spatial?.groupId !== groupId))
        return null;
    const binding = { kind: 'direction' as const, through, reference, perpendicular: kind === 'perpendicular', planeGuide };
    if (!spatialDirectionEndpoint(binding, id => spatialPosition(runtime, id)))
        return null;
    const helper = addPoint(runtime, { x: 0, y: 0, style: {}, construction_kind: 'free' });
    runtime.points[helper].spatial = { groupId, binding };
    runtime.points[helper].parent_refs = dependencies.map(id => ({ kind: 'point', id }));
    const id = addLineFromPoints(runtime, through, helper, style);
    runtime.points[helper].auxiliaryFor = id;
    runtime.lines[id].defining_parents = dependencies;
    runtime.lines[id].leftRay = { ...style };
    runtime.lines[id].rightRay = { ...style };
    syncSpatialGeometry(runtime);
    return id;
}
export function createSpatialAngle(runtime: ConstructionRuntime, points: [
    string,
    string,
    string
], style: AngleStyle = {}): string | null {
    const [p1, vertex, p2] = points, groupId = runtime.points[vertex]?.spatial?.groupId;
    if (!groupId || points.some(id => runtime.points[id]?.spatial?.groupId !== groupId))
        return null;
    const angle: AngleRuntime = { id: '', vertex, point1: p1, point2: p2, style, spatial: { groupId, arms: [[vertex, p1], [vertex, p2]] }, defining_parents: [...points] };
    if (spatialAngleDegrees(runtime, angle) === null)
        return null;
    angle.id = nextId('angle', runtime);
    angle.geometryValid = true;
    runtime.angles[angle.id] = angle;
    return angle.id;
}
export function createSpatialLineAngle(runtime: ConstructionRuntime, first: [
    string,
    string
], second: [
    string,
    string
], style: AngleStyle = {}): string | null {
    const shared = first.find(id => second.includes(id));
    if (shared)
        return createSpatialAngle(runtime, [first.find(id => id !== shared)!, shared, second.find(id => id !== shared)!], style);
    const groupId = runtime.points[first[0]]?.spatial?.groupId;
    if (!groupId || [...first, ...second].some(id => runtime.points[id]?.spatial?.groupId !== groupId))
        return null;
    const angle: AngleRuntime = { id: '', vertex: first[0], style, spatial: { groupId, arms: [first, second], acute: true }, defining_parents: [...first, ...second] };
    if (spatialAngleDegrees(runtime, angle) === null)
        return null;
    angle.id = nextId('angle', runtime);
    angle.geometryValid = true;
    runtime.angles[angle.id] = angle;
    return angle.id;
}
function angleVectors(runtime: ConstructionRuntime, angle: AngleRuntime) {
    const d = angle.spatial;
    if (!d)
        return null;
    const ids = [angle.vertex, ...d.arms.flat()];
    if (ids.some(id => runtime.points[id]?.spatial?.groupId !== d.groupId))
        return null;
    const points = d.arms.map(arm => arm.map(id => spatialPosition(runtime, id)));
    if (points.flat().some(p => !p))
        return null;
    const u = subtract3(points[0][1]!, points[0][0]!), v = subtract3(points[1][1]!, points[1][0]!);
    if (norm(u) < 1e-8 || norm(v) < 1e-8)
        return null;
    const a = normalized(u), b = normalized(v);
    return { a, b: d.acute && dot(a, b) < 0 ? times(b, -1) : b, length: Math.min(norm(u), norm(v)) };
}
export function spatialAngleDegrees(runtime: ConstructionRuntime, angle: AngleRuntime): number | null {
    const vectors = angleVectors(runtime, angle);
    if (!vectors)
        return null;
    const degrees = Math.acos(Math.max(-1, Math.min(1, dot(vectors.a, vectors.b)))) * 180 / Math.PI;
    return angle.style.exterior ? 360 - degrees : degrees;
}
export function spatialAngleDrawing(runtime: ConstructionRuntime, angle: AngleRuntime, defaultRadius: number) {
    const vectors = angleVectors(runtime, angle), d = angle.spatial;
    if (!vectors || !d)
        return null;
    const vertex = spatialPosition(runtime, angle.vertex), group = runtime.spatialGroups?.[d.groupId];
    if (!vertex || !group)
        return null;
    const project = (v: Vec3) => { const p = transform3(group.orientation, subtract3(v, group.pivot)); return { x: group.anchor.x + p.x, y: group.anchor.y + p.y }; };
    const cosine = Math.max(-1, Math.min(1, dot(vectors.a, vectors.b))), minor = Math.acos(cosine);
    let tangent = subtract3(vectors.b, times(vectors.a, cosine));
    if (norm(tangent) < 1e-8) {
        const axis = Math.abs(vectors.a.x) < .8 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
        tangent = cross(vectors.a, axis);
    }
    tangent = normalized(tangent);
    const span = angle.style.exterior ? 2 * Math.PI - minor : minor, sign = angle.style.exterior ? -1 : 1;
    const radius = Math.max(3, Math.min(vectors.length * .4, defaultRadius + (angle.style.arcRadiusOffset ?? 0)));
    const arc = (r: number) => Array.from({ length: 49 }, (_, i) => { const t = sign * span * i / 48; return project(plus(vertex, plus(times(vectors.a, r * Math.cos(t)), times(tangent, r * Math.sin(t))))); });
    const v = project(vertex), p1 = project(plus(vertex, times(vectors.a, vectors.length))), p2 = project(plus(vertex, times(vectors.b, vectors.length)));
    const mark = [v, project(plus(vertex, times(vectors.a, radius * .65))), project(plus(vertex, times(plus(vectors.a, vectors.b), radius * .65))), project(plus(vertex, times(vectors.b, radius * .65)))];
    return { v, p1, p2, start: Math.atan2(p1.y - v.y, p1.x - v.x), end: Math.atan2(p2.y - v.y, p2.x - v.x), span, clockwise: false, radius, minRadius: 3, maxRadius: vectors.length * .4, style: angle.style, spatialArc: arc(radius), spatialArcs: Array.from({ length: Math.min(3, Math.max(1, angle.style.arcCount ?? 1)) }, (_, i) => arc(Math.max(2, radius - i * 6))), spatialRightMark: mark, spatialLabelAnchor: arc(radius + 15)[24] };
}
export function syncSpatialConstructions(runtime: ConstructionRuntime) {
    for (const polygon of Object.values(runtime.polygons))
        if (polygon.spatialGroupId)
            polygon.geometryValid = spatialPolygonStatus(runtime, polygon.points) === 'valid';
    for (const angle of Object.values(runtime.angles))
        if (angle.spatial)
            angle.geometryValid = spatialAngleDegrees(runtime, angle) !== null;
}
