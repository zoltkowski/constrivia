import { addLineFromPoints, addPoint, nextId } from './engineActions';
import type { ConstructionRuntime, PointStyle, PolygonRuntime, StrokeStyle } from './runtimeTypes';
import type { SpatialPointDefinition, SpatialSectionDefinition, Vec3 } from './spatialTypes';
import { addSpatialEdgePoint, spatialPosition, syncSpatialGeometry } from './spatialGeometry';
import { add3, cross3, dot3, norm3, scale3, sub3 } from './spatialMath';

type Plane = { origin: Vec3; normal: Vec3; groupId: string };
type SectionPlane = SpatialSectionDefinition['plane'];
type SectionPolygon = PolygonRuntime;

const length3 = norm3;
const mul3 = scale3;
const unit3 = (a: Vec3): Vec3 | null => { const n = length3(a); return n > 1e-12 && Number.isFinite(n) ? scale3(a, 1 / n) : null; };
const sectionOf = (p: SectionPolygon | undefined) => p?.spatialSection;
const edgeKey = (a: string, b: string) => [a, b].sort().join('|');
const tolerance = (scale: number) => Math.max(1, scale) * 1e-9;
const updating = new WeakSet<object>();

type ResolveSpatial = (id: string) => Vec3 | null;
function polygonPlane(runtime: ConstructionRuntime, polygonId: string, resolve: ResolveSpatial = (id) => spatialPosition(runtime, id)): Plane | null {
  const polygon = runtime.polygons[polygonId];
  const groupId = polygon?.spatialGroupId;
  if (!polygon || !groupId || polygon.points.length < 3 || polygon.points.some(id => runtime.points[id]?.spatial?.groupId !== groupId)) return null;
  const points = polygon.points.map(resolve);
  if (points.some(p => !p)) return null;
  const p = points as Vec3[], origin = p[0];
  const extent = Math.max(1, ...p.map(q => length3(sub3(q, origin))));
  let normal: Vec3 | null = null;
  for (let i = 1; i < p.length - 1 && !normal; i++) {
    const n = cross3(sub3(p[i], origin), sub3(p[i + 1], origin));
    if (length3(n) > extent * extent * 1e-10) normal = unit3(n);
  }
  if (!normal || p.some(q => Math.abs(dot3(sub3(q, origin), normal!)) > extent * 1e-8)) return null;
  return { origin, normal, groupId };
}

type PolygonIntersectionBinding = Extract<SpatialPointDefinition['binding'], { kind: 'polygonIntersection' }>;
function polygonIntersection(runtime: ConstructionRuntime, polygonIds: [string, string], resolve: ResolveSpatial = id => spatialPosition(runtime, id)): [Vec3, Vec3][] | null {
  const [firstId, secondId] = polygonIds, first = polygonPlane(runtime, firstId, resolve), second = polygonPlane(runtime, secondId, resolve);
  if (!first || !second || first.groupId !== second.groupId) return null;
  const directionRaw = cross3(first.normal, second.normal), directionLength = length3(directionRaw);
  if (directionLength < 1e-9) return null;
  const direction = mul3(directionRaw, 1 / directionLength);
  const d1 = dot3(first.normal, first.origin), d2 = dot3(second.normal, second.origin);
  const denominator = dot3(directionRaw, directionRaw);
  const origin = mul3(add3(mul3(cross3(second.normal, directionRaw), d1), mul3(cross3(directionRaw, first.normal), d2)), 1 / denominator);
  const ranges = (polygonId: string, plane: Plane): [number, number][] | null => {
    const polygon = runtime.polygons[polygonId];
    if (!polygon || polygon.points.length < 3) return null;
    const axis = Math.abs(plane.normal.x) < .8 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const u = unit3(cross3(plane.normal, axis));
    if (!u) return null;
    const v = cross3(plane.normal, u);
    const xy = (p: Vec3) => { const q = sub3(p, origin); return { x: dot3(q, u), y: dot3(q, v) }; };
    const line = { x: dot3(direction, u), y: dot3(direction, v) };
    const vertices = polygon.points.map(id => resolve(id)).filter((p): p is Vec3 => !!p).map(xy);
    if (vertices.length !== polygon.points.length) return null;
    const cross2 = (a: {x:number;y:number}, b: {x:number;y:number}) => a.x*b.y-a.y*b.x;
    const hits: number[] = [];
    for (let i=0;i<vertices.length;i++) {
      const a=vertices[i], b=vertices[(i+1)%vertices.length], edge={x:b.x-a.x,y:b.y-a.y}, offset={x:a.x,y:a.y};
      const den=cross2(line,edge);
      if (Math.abs(den)<1e-10) {
        if(Math.abs(cross2(offset,line))<1e-8){const n=line.x*line.x+line.y*line.y;hits.push((offset.x*line.x+offset.y*line.y)/n,((b.x)*line.x+(b.y)*line.y)/n);}
        continue;
      }
      const t=cross2(offset,edge)/den, s=cross2(offset,line)/den;
      if (s>=-1e-9&&s<=1+1e-9) hits.push(t);
    }
    hits.sort((a,b)=>a-b);
    const unique=hits.filter((t,i)=>i===0||Math.abs(t-hits[i-1])>1e-8);
    const inside=(t:number) => {
      const p={x:line.x*t,y:line.y*t}; let result=false;
      for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
        const a=vertices[i],b=vertices[j];
        const edge={x:b.x-a.x,y:b.y-a.y}, offset={x:p.x-a.x,y:p.y-a.y};
        const edgeLength=Math.hypot(edge.x,edge.y);
        if(edgeLength>0&&Math.abs(cross2(edge,offset))<=1e-8*edgeLength&&offset.x*edge.x+offset.y*edge.y>=-1e-8&&offset.x*edge.x+offset.y*edge.y<=edgeLength*edgeLength+1e-8)return true;
        if(((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x))result=!result;
      }
      return result;
    };
    const intervals:[number,number][]=[];
    for(let i=0;i+1<unique.length;i++){
      const low=unique[i],high=unique[i+1];
      if(high-low>1e-8&&inside((low+high)/2))intervals.push([low,high]);
    }
    return intervals;
  };
  const a=ranges(firstId,first), b=ranges(secondId,second);
  if(!a||!b)return null;
  const result:[Vec3,Vec3][]=[];
  for(const x of a)for(const y of b){const low=Math.max(x[0],y[0]),high=Math.min(x[1],y[1]);if(high-low>1e-8)result.push([add3(origin,mul3(direction,low)),add3(origin,mul3(direction,high))]);}
  return result.sort((x,y)=>dot3(sub3(x[0],origin),direction)-dot3(sub3(y[0],origin),direction));
}

export function resolveSpatialPolygonIntersection(binding: PolygonIntersectionBinding, resolve: ResolveSpatial, runtime: ConstructionRuntime): Vec3 | null {
  return polygonIntersection(runtime,binding.polygons,resolve)?.[binding.segment]?.[binding.endpoint]??null;
}

/** Creates a finite segment where two spatial polygon interiors meet. */
export function createSpatialPlaneIntersection(runtime: ConstructionRuntime, polygon1: string, polygon2: string, styles: StrokeStyle = {}, pointStyle: PointStyle = { color: styles.color ?? '#15a3ff', size: 0 }): string[] {
  const first=runtime.polygons[polygon1], second=runtime.polygons[polygon2];
  const segments=polygonIntersection(runtime,[polygon1,polygon2]);
  if(!first?.spatialGroupId||first.spatialGroupId!==second?.spatialGroupId||!segments?.length)return [];
  const groupId=first.spatialGroupId, ids:string[]=[];
  for(let segment=0;segment<segments.length;segment++){
    const pointIds=[0,1].map(endpoint=>{
      const id=addPoint(runtime,{x:0,y:0,style:{...pointStyle},construction_kind:'free'});
      runtime.points[id].spatial={groupId,binding:{kind:'polygonIntersection',polygons:[polygon1,polygon2],segment,endpoint:endpoint as 0|1}};
      return id;
    }) as [string,string];
    const lineId=addLineFromPoints(runtime,pointIds[0],pointIds[1],styles), line=runtime.lines[lineId];
    delete line.leftRay; delete line.rightRay;
    line.defining_parents=[polygon1,polygon2];
    ids.push(lineId);
  }
  syncSpatialGeometry(runtime);
  return ids;
}

function polygonPlanePoints(runtime: ConstructionRuntime, polygonId: string): [string, string, string] | null {
  const polygon = runtime.polygons[polygonId];
  if (!polygon) return null;
  for (let i = 0; i < polygon.points.length - 2; i++) for (let j = i + 1; j < polygon.points.length - 1; j++) for (let k = j + 1; k < polygon.points.length; k++) {
    const ids = [polygon.points[i], polygon.points[j], polygon.points[k]] as [string, string, string];
    const [a, b, c] = ids.map(id => spatialPosition(runtime, id));
    if (a && b && c && length3(cross3(sub3(b, a), sub3(c, a))) > 1e-10) return ids;
  }
  return null;
}

function planeFor(runtime: ConstructionRuntime, definition: SectionPlane, resolve: ResolveSpatial = (id) => spatialPosition(runtime, id)): Plane | null {
  if (definition.kind === 'parallel') {
    const base = polygonPlane(runtime, definition.polygonId, resolve), through = resolve(definition.pointId);
    const groupId = runtime.points[definition.pointId]?.spatial?.groupId;
    return base && through && groupId === base.groupId ? { origin: through, normal: base.normal, groupId } : null;
  }
  const [aId, bId, cId] = definition.points, groupId = runtime.points[aId]?.spatial?.groupId;
  if (!groupId || definition.points.some(id => runtime.points[id]?.spatial?.groupId !== groupId)) return null;
  const [a, b, c] = definition.points.map(resolve);
  if (!a || !b || !c) return null;
  const ab = sub3(b, a), ac = sub3(c, a), n = cross3(ab, ac);
  if (length3(n) <= Math.max(1, length3(ab), length3(ac)) ** 2 * 1e-10) return null;
  const normal = unit3(n);
  return normal ? { origin: a, normal, groupId } : null;
}

function edgeIntersections(runtime: ConstructionRuntime, solidId: string, plane: Plane) {
  const solid = runtime.solids?.[solidId];
  if (!solid || solid.groupId !== plane.groupId) return null;
  const vertices = new Map<string, Vec3>();
  for (const id of solid.vertices) {
    const p = spatialPosition(runtime, id);
    if (!p) return null;
    vertices.set(id, p);
  }
  const extent = Math.max(1, ...[...vertices.values()].map(p => length3(sub3(p, plane.origin))));
  const eps = tolerance(extent), hits = new Map<string, { key: string; lineId: string; a: string; b: string; t: number; position: Vec3 }>();
  for (const lineId of solid.edges) {
    const line = runtime.lines[lineId], [a, b] = line?.defining_points ?? [];
    const pa = vertices.get(a), pb = vertices.get(b);
    if (!line || !pa || !pb) continue;
    const da = dot3(sub3(pa, plane.origin), plane.normal), db = dot3(sub3(pb, plane.origin), plane.normal);
    if (Math.abs(da) <= eps) hits.set(`v:${a}`, { key: `v:${a}`, lineId, a, b, t: 0, position: pa });
    if (Math.abs(db) <= eps) hits.set(`v:${b}`, { key: `v:${b}`, lineId, a, b, t: 1, position: pb });
    if ((da < -eps && db > eps) || (da > eps && db < -eps)) {
      const t = da / (da - db), position = add3(pa, mul3(sub3(pb, pa), t));
      hits.set(`e:${edgeKey(a, b)}`, { key: `e:${edgeKey(a, b)}`, lineId, a, b, t, position });
    }
  }
  const values = [...hits.values()];
  if (values.length < 3) return { solid, vertices, hits: [] as typeof values, plane, eps };
  // Different edges meet at a vertex; the key map deduplicates those exact coincidences.
  const center = values.reduce((s, h) => add3(s, h.position), { x: 0, y: 0, z: 0 });
  center.x /= values.length; center.y /= values.length; center.z /= values.length;
  const axis = Math.abs(plane.normal.x) < .8 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const u = unit3(cross3(plane.normal, axis));
  if (!u) return null;
  const v = cross3(plane.normal, u);
  values.sort((a, b) => Math.atan2(dot3(sub3(a.position, center), v), dot3(sub3(a.position, center), u)) - Math.atan2(dot3(sub3(b.position, center), v), dot3(sub3(b.position, center), u)));
  return { solid, vertices, hits: values, plane, eps };
}

function validSectionGeometry(runtime: ConstructionRuntime, plane: Plane, solidIds: string[]) {
  for (const solidId of solidIds) {
    const result = edgeIntersections(runtime, solidId, plane);
    if (!result || result.hits.length < 3) continue;
    const positions = result.hits.map(h => h.position), extent = Math.max(1, ...positions.map(p => length3(sub3(p, positions[0]))));
    const areaVector = positions.reduce((sum, p, i) => add3(sum, cross3(sub3(p, positions[0]), sub3(positions[(i + 1) % positions.length], positions[0]))), { x: 0, y: 0, z: 0 });
    if (length3(areaVector) > extent * extent * 1e-8) return result;
  }
  return null;
}

function sortedUniqueHits<T extends { position: Vec3 }>(hits: T[], eps: number) {
  const out: T[] = [];
  for (const hit of hits) if (!out.some(other => length3(sub3(hit.position, other.position)) <= eps)) out.push(hit);
  return out;
}

function existingPointAtHit(runtime: ConstructionRuntime, hit: { position: Vec3; lineId: string }, eps: number): string | null {
  const line = runtime.lines[hit.lineId];
  if (!line) return null;
  return line.points.find(id => {
    if (line.defining_points.includes(id)) return false;
    if (runtime.points[id]?.spatial?.binding.kind !== 'edge') return false;
    const p = spatialPosition(runtime, id);
    return p && length3(sub3(p, hit.position)) <= eps;
  }) ?? null;
}

function isPlaneInputPoint(runtime: ConstructionRuntime, definition: SectionPlane, pointId: string, hit: { position: Vec3 }, eps: number) {
  const inputIds = definition.kind === 'parallel' ? [definition.pointId] : definition.points;
  if (!inputIds.includes(pointId)) return false;
  const p = spatialPosition(runtime, pointId);
  return !!p && length3(sub3(p, hit.position)) <= eps;
}

function prepareSection(runtime: ConstructionRuntime, definition: SectionPlane) {
  const plane = planeFor(runtime, definition);
  if (!plane) return null;
  const preferred = preferredSolidIds(runtime, definition);
  const ids = [...preferred, ...Object.values(runtime.solids ?? {}).filter(s => s.groupId === plane.groupId && !s.hidden && !preferred.includes(s.id)).map(s => s.id)];
  return validSectionGeometry(runtime, plane, ids);
}

function preferredSolidIds(runtime: ConstructionRuntime, definition: SectionPlane): string[] {
  const ids: string[] = [];
  if (definition.kind === 'parallel') {
    const polygon = runtime.polygons[definition.polygonId];
    if (polygon?.solidFace?.solidId) ids.push(polygon.solidFace.solidId);
    ids.push(...solidIdsForPoint(runtime, definition.pointId));
  } else {
    const owning=Object.values(runtime.solids??{}).filter(s=>definition.points.every(id=>{
      if(s.vertices.includes(id))return true;
      const b=runtime.points[id]?.spatial?.binding;
      return (b?.kind==='edge'||b?.kind==='sectionEdge')&&b.endpoints.every(id=>s.vertices.includes(id));
    })).map(s=>s.id);
    ids.push(...owning);
    for (const pointId of definition.points) ids.push(...solidIdsForPoint(runtime, pointId));
  }
  return [...new Set(ids)];
}

function solidIdsForPoint(runtime: ConstructionRuntime, pointId: string): string[] {
  const binding = runtime.points[pointId]?.spatial?.binding;
  if (binding?.kind === 'vertex') return [binding.solidId];
  if (binding?.kind !== 'edge') return [];
  const wanted = binding.endpoints;
  return Object.values(runtime.solids ?? {}).filter(s => s.edges.some(lineId => {
    const endpoints = runtime.lines[lineId]?.defining_points;
    return !!endpoints && edgeKey(...endpoints) === edgeKey(...wanted);
  })).map(s => s.id);
}

function sectionOnSolid(runtime: ConstructionRuntime, definition: SectionPlane, solidId: string) {
  const plane = planeFor(runtime, definition);
  if (!plane) return null;
  const result = edgeIntersections(runtime, solidId, plane);
  if (!result || result.hits.length < 3) return null;
  const positions = result.hits.map(h => h.position), extent = Math.max(1, ...positions.map(p => length3(sub3(p, positions[0]))));
  const areaVector = positions.reduce((sum, p, i) => add3(sum, cross3(sub3(p, positions[0]), sub3(positions[(i + 1) % positions.length], positions[0]))), { x: 0, y: 0, z: 0 });
  return length3(areaVector) > extent * extent * 1e-8 ? result : null;
}

function allocateSection(runtime: ConstructionRuntime, definition: SectionPlane, result: NonNullable<ReturnType<typeof prepareSection>>, fill?: string, stroke: StrokeStyle = {}) {
  const polygonId = nextId('polygon', runtime), edgePoints: Record<string, string> = {};
  const polygon: SectionPolygon = { id: polygonId, points: [], spatialGroupId: result.solid.groupId, fill:fill??stroke.color??'#15a3ff', fillOpacity: .2, geometryValid: true, spatialSection: { solidId: result.solid.id, plane: definition, edgePoints, edgeLines: {} } };
  runtime.polygons[polygonId] = polygon;
  updateOneSection(runtime, polygon, stroke);
  syncSpatialGeometry(runtime);
  return polygonId;
}

function updateOneSection(runtime: ConstructionRuntime, polygon: SectionPolygon, stroke: StrokeStyle = {}) {
  if (updating.has(runtime)) return;
  updating.add(runtime);
  try { updateOneSectionBody(runtime, polygon, stroke); }
  finally { updating.delete(runtime); }
}

function updateOneSectionBody(runtime: ConstructionRuntime, polygon: SectionPolygon, stroke: StrokeStyle = {}) {
  const meta = polygon.spatialSection;
  if (!meta) return;
  const result = sectionOnSolid(runtime, meta.plane, meta.solidId);
  const liveHits = result ? sortedUniqueHits(result.hits, result.eps) : [];
  const active = new Map<string, string>();
  for (const hit of liveHits) {
    if (hit.key.startsWith('v:')) active.set(hit.key, hit.key.slice(2));
    else {
      let pointId = meta.edgePoints[hit.key];
      if (!pointId || !runtime.points[pointId]) {
        const inputPoint = existingPointAtHit(runtime, hit, result!.eps);
        pointId = inputPoint && isPlaneInputPoint(runtime, meta.plane, inputPoint, hit, result!.eps)
          ? inputPoint
          : addSpatialEdgePoint(runtime, hit.a, hit.b, hit.t, hit.lineId) ?? '';
        if (pointId) {
          const p = runtime.points[pointId];
          if (!isPlaneInputPoint(runtime, meta.plane, pointId, hit, result!.eps)) {
            p.spatial!.binding = { kind: 'sectionEdge', sectionId: polygon.id, endpoints: [hit.a, hit.b] };
            p.parent_refs = [{ kind: 'point', id: hit.a }, { kind: 'point', id: hit.b }];
            p.defining_parents = [hit.a, hit.b];
          }
          meta.edgePoints[hit.key] = pointId;
        }
      }
      if (pointId) active.set(hit.key, pointId);
    }
  }
  const entries = liveHits.map(hit => ({ hit, id: active.get(hit.key) })).filter((item): item is { hit: (typeof liveHits)[number]; id: string } => !!item.id);
  polygon.points = entries.map(item => item.id);
  polygon.geometryValid = entries.length >= 3 && !!result;
  for (const [key, pointId] of Object.entries(meta.edgePoints)) if (runtime.points[pointId]) runtime.points[pointId].geometryValid = active.has(key);
  const edgeLines = meta.edgeLines ?? (meta.edgeLines = {});
  const desired = new Set<string>();
  if (polygon.geometryValid) for (let i = 0; i < entries.length; i++) {
    const a = entries[i].id, b = entries[(i + 1) % entries.length].id, key = edgeKey(a, b);
    desired.add(key);
    let lineId = edgeLines[key];
    // A deliberately erased outline must not be recreated by recomputation.
    if(lineId&&!runtime.lines[lineId])continue;
    if (!lineId) {
      lineId = addLineFromPoints(runtime, a, b, stroke);
      edgeLines[key] = lineId;
      const line = runtime.lines[lineId];
      delete line.leftRay; delete line.rightRay;
      line.defining_parents = [a, b];
    }
    const line = runtime.lines[lineId];
    line.spatialSectionActive = true;
    if (line.points.length < 2) line.points = [a, b];
    if (!line.segmentStyles?.length) line.segmentStyles = [{ ...line.style }];
    if (!line.segmentKeys?.length) line.segmentKeys = [key];
  }
  for (const [key, lineId] of Object.entries(edgeLines)) if (runtime.lines[lineId]) runtime.lines[lineId].spatialSectionActive = desired.has(key);
}

export function createSpatialParallelSection(runtime: ConstructionRuntime, polygonId: string, pointId: string, fill?: string, stroke: StrokeStyle = {}): string | null {
  const base = polygonPlane(runtime, polygonId), groupId = runtime.points[pointId]?.spatial?.groupId, through = spatialPosition(runtime, pointId);
  if (!base || !through || groupId !== base.groupId) return null;
  const definition: SectionPlane = { kind: 'parallel', polygonId, pointId };
  const result = prepareSection(runtime, definition);
  return result ? allocateSection(runtime, definition, result, fill, stroke) : null;
}

export function createSpatialThreePointSection(runtime: ConstructionRuntime, pointIds: [string, string, string], fill?: string, stroke: StrokeStyle = {}): string | null {
  const definition: SectionPlane = { kind: 'points', points: [...pointIds] };
  const plane = planeFor(runtime, definition);
  if (!plane) return null;
  const result = prepareSection(runtime, definition);
  return result ? allocateSection(runtime, definition, result, fill, stroke) : null;
}

export function resolveSpatialPlanePoint(binding: SpatialPointDefinition['binding'], resolve: (id: string) => Vec3 | null, runtime: ConstructionRuntime): Vec3 | null {
  if (binding?.kind === 'planeFoot') {
    const source = resolve(binding.source), [aId, bId, cId] = binding.planePoints ?? [];
    const a = resolve(aId), b = resolve(bId), c = resolve(cId);
    if (!source || !a || !b || !c) return null;
    const normal = unit3(cross3(sub3(b, a), sub3(c, a)));
    return normal ? sub3(source, mul3(normal, dot3(sub3(source, a), normal))) : null;
  }
  if (binding?.kind === 'sectionEdge') {
    const polygon = runtime.polygons[binding.sectionId];
    const meta = sectionOf(polygon), plane = meta && planeFor(runtime, meta.plane, resolve);
    const a = resolve(binding.endpoints?.[0]), b = resolve(binding.endpoints?.[1]);
    if (!plane || !a || !b) return null;
    const direction = sub3(b, a), denominator = dot3(direction, plane.normal);
    if (Math.abs(denominator) < 1e-12) return null;
    const t = dot3(sub3(plane.origin, a), plane.normal) / denominator;
    if (t <= 1e-9 || t >= 1 - 1e-9 || !Number.isFinite(t)) return null;
    return add3(a, mul3(direction, Math.max(0, Math.min(1, t))));
  }
  return null;
}

export function updateSpatialSections(runtime: ConstructionRuntime): void {
  for (const polygon of Object.values(runtime.polygons) as SectionPolygon[]) if (polygon.spatialSection) updateOneSection(runtime, polygon);
}

/** Removing a section keeps its edge marks usable without dangling definitions. */
export function removeSpatialSection(runtime:ConstructionRuntime,polygonId:string):void {
  const polygon=runtime.polygons[polygonId],definition=polygon?.spatialSection;if(!definition)return;
  // A truncated solid still needs the cutting plane even when its cap is erased.
  if(Object.values(runtime.solids??{}).some(s=>s.cutSectionId===polygonId||s.hiddenApexSectionId===polygonId)){polygon.hidden=true;return;}
  for(const point of Object.values(runtime.points)){
    const binding=point.spatial?.binding;
    if(binding?.kind!=='sectionEdge'||binding.sectionId!==polygonId)continue;
    const [a,b]=binding.endpoints,pa=spatialPosition(runtime,a),pb=spatialPosition(runtime,b),p=spatialPosition(runtime,point.id);
    const source=Object.values(runtime.lines).find(l=>edgeKey(...l.defining_points)===edgeKey(a,b));
    let t=source?.spatialParameters?.[point.id]??.5;
    if(pa&&pb&&p){const v=sub3(pb,pa),n=dot3(v,v);if(n>1e-16)t=dot3(sub3(p,pa),v)/n;}
    point.spatial!.binding={kind:'edge',endpoints:[a,b],t:Math.max(0,Math.min(1,t))};
  }
  for(const lineId of Object.values(definition.edgeLines??{})){
    const line=runtime.lines[lineId];if(!line)continue;
    const used=Object.values(runtime.polygons).some(p=>p.id!==polygonId&&line.defining_points.every(id=>p.points.includes(id)))
      ||Object.values(runtime.angles).some(a=>a.arm1LineId===lineId||a.arm2LineId===lineId)
      ||Object.values(runtime.points).some(p=>p.parent_refs?.some(ref=>ref.kind==='line'&&ref.id===lineId));
    if(used)delete line.spatialSectionActive;else delete runtime.lines[lineId];
  }
  delete runtime.polygons[polygonId];
  syncSpatialGeometry(runtime);
}

export function createSpatialHeight(runtime: ConstructionRuntime, pointId: string, polygonId: string, stroke: StrokeStyle = {}): string | null {
  const point = spatialPosition(runtime, pointId), plane = polygonPlane(runtime, polygonId), groupId = runtime.points[pointId]?.spatial?.groupId;
  if (!point || !plane || plane.groupId !== groupId) return null;
  const foot = sub3(point, mul3(plane.normal, dot3(sub3(point, plane.origin), plane.normal)));
  if (length3(sub3(foot, point)) < 1e-9) return null;
  const planePoints = polygonPlanePoints(runtime, polygonId);
  if (!planePoints) return null;
  const helperId = addPoint(runtime, { x: 0, y: 0, style: { color: '#666666', size: 3 }, construction_kind: 'free' });
  const helper = runtime.points[helperId];
  helper.spatial = { groupId: plane.groupId, binding: { kind: 'planeFoot', source: pointId, planePoints } };
  helper.parent_refs = [{ kind: 'point', id: pointId }, ...runtime.polygons[polygonId].points.map(id => ({ kind: 'point' as const, id }))];
  helper.defining_parents = [pointId, ...runtime.polygons[polygonId].points];
  const lineStyle = { color: '#777777', width: 1.5, ...stroke };
  const lineId = addLineFromPoints(runtime, pointId, helperId, lineStyle);
  const line = runtime.lines[lineId];
  line.defining_parents = helper.defining_parents;
  line.leftRay = { ...lineStyle, hidden: true }; line.rightRay = { ...lineStyle, hidden: true };
  syncSpatialGeometry(runtime);
  return lineId;
}
