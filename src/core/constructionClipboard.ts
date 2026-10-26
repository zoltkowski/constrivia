import { collectConstructionCopyInputs, type ConstructionCopyRoot } from './constructionCopyInputs';
import { nextId } from './engineActions';
import { makeEmptyRuntime, type ConstructionRuntime, type GeometryKind } from './runtimeTypes';
import { groupCollections, restoreObjectGroups } from './objectGroups';
import {
  createCopiedFreeLabel, remapCopiedPointMetadata, remapCopiedLine, remapCopiedCircle, remapCopiedSymmetry,
  remapCopiedAngle, remapCopiedPolygon, remapCopiedSolid, remapCopiedSpatialGroup, type CopyIdMaps
} from './copyMetadata';

const collections = ['points', 'lines', 'circles', 'angles', 'polygons', 'solids', 'spatialGroups', 'labels', 'inkStrokes'] as const;
const geometry = { points: 'point', lines: 'line', circles: 'circle', angles: 'angle', polygons: 'polygon', solids: 'solid', spatialGroups: 'spatialGroup' } as const;
export type ConstructionClipboard = {
  version: 2;
  objectGroups?: ConstructionRuntime['objectGroups'];
  points: ConstructionRuntime['points'][string][];
  lines: ConstructionRuntime['lines'][string][];
  circles: ConstructionRuntime['circles'][string][];
  angles: ConstructionRuntime['angles'][string][];
  polygons: ConstructionRuntime['polygons'][string][];
  solids: NonNullable<ConstructionRuntime['solids']>[string][];
  spatialGroups: NonNullable<ConstructionRuntime['spatialGroups']>[string][];
  labels: ConstructionRuntime['labels'][string][];
  inkStrokes: ConstructionRuntime['inkStrokes'][string][];
};
export type CopySelection = Partial<Record<typeof collections[number], Iterable<string>>>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const position2 = (value: {x?:number;y?:number} | null | undefined) => !!value && Number.isFinite(value.x) && Number.isFinite(value.y);
const labelRoots = (label: ConstructionRuntime['labels'][string]): ConstructionCopyRoot[] => {
  const source=label.measurement;
  return !source?[]:source.kind==='angle'?[{kind:'angle',id:source.angleId}]
    :[{kind:'line',id:source.lineId},...source.points.map(id=>({kind:'point' as const,id}))];
};

/** Build a self-contained snapshot, including the inputs needed to recompute its objects. */
export function createConstructionClipboard(runtime: ConstructionRuntime, selection: CopySelection): ConstructionClipboard {
  const roots: ConstructionCopyRoot[] = [];
  for (const [key, kind] of Object.entries(geometry)) {
    for (const id of selection[key as keyof CopySelection] ?? []) roots.push({ kind, id });
  }
  const labelIds=new Set(selection.labels??[]);
  for(const id of labelIds)roots.push({kind:'label',id});
  for(const id of selection.inkStrokes??[])roots.push({kind:'ink',id});
  for(const id of labelIds)if(runtime.labels[id])roots.push(...labelRoots(runtime.labels[id]));
  const inputs = collectConstructionCopyInputs(runtime, roots);
  for(const id of inputs.labels)labelIds.add(id);
  if (inputs.missing.size || inputs.missingReferences.size) throw new Error('Construction copy has missing inputs');
  for(const label of Object.values(runtime.labels)){
    const source=label.measurement;
    if(source&&(source.kind==='angle'?inputs.angles.has(source.angleId):inputs.lines.has(source.lineId)&&source.points.every(id=>inputs.points.has(id))))labelIds.add(label.id);
  }
  const stored = { version: 2 } as ConstructionClipboard;
  for (const key of collections) {
    const ids = key === 'labels' ? labelIds : inputs[key];
    (stored[key] as unknown[]) = [...ids].map(id => (runtime[key] as Record<string, unknown> | undefined)?.[id]).filter(Boolean).map(record=>clone(record));
  }
  const copied = Object.fromEntries(collections.map(key => [key, new Set(stored[key].map(record => record.id))]));
  stored.objectGroups = clone(Object.fromEntries(Object.values(runtime.objectGroups ?? {})
    .filter(group => groupCollections.every(key => (group.members[key] ?? []).every(id => copied[key].has(id))))
    .map(group => [group.id, group])));
  return stored;
}

/** Older incomplete buffers are discarded instead of reconnecting to the current drawing. */
export function readConstructionClipboard(value: unknown): ConstructionClipboard | null {
  try {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    if (raw.version !== undefined && raw.version !== 2) return null;
    const snapshot = { version: 2 } as ConstructionClipboard;
    const runtime = makeEmptyRuntime();
    for (const key of collections) {
      const records = raw[key] ?? [];
      if (!Array.isArray(records)) return null;
      const seen = new Set<string>();
      for (const record of records) {
        if (!record || typeof record.id !== 'string' || !record.id || seen.has(record.id)) return null;
        if (key === 'points' && (!position2(record) || !record.style)) return null;
        if (key === 'labels' && (!position2(record.pos) || typeof record.text !== 'string')) return null;
        if (key === 'inkStrokes' && (!Array.isArray(record.points) || !record.points.every(position2))) return null;
        seen.add(record.id);
      }
      (snapshot[key] as unknown[]) = clone(records);
      (runtime[key] as Record<string, unknown>) = Object.fromEntries(records.map(record => [record.id, record]));
    }
    if (!collections.some(key => snapshot[key].length)) return null;
    const roots:ConstructionCopyRoot[] = Object.entries(geometry).flatMap(([key, kind]) => snapshot[key as keyof typeof geometry].map(record => ({ kind, id: record.id })));
    for(const label of snapshot.labels)roots.push({kind:'label',id:label.id},...labelRoots(label));
    for(const stroke of snapshot.inkStrokes)roots.push({kind:'ink',id:stroke.id});
    const inputs=collectConstructionCopyInputs(runtime, roots);
    if (inputs.missing.size || inputs.missingReferences.size) return null;
    restoreObjectGroups(runtime, raw.objectGroups);
    snapshot.objectGroups = runtime.objectGroups;
    return snapshot;
  } catch { return null; }
}

/** Allocate every ID before remapping; commit the complete copy only after validation. */
export function pasteConstructionClipboard(runtime: ConstructionRuntime, value: unknown, offset = 20) {
  const stored = readConstructionClipboard(value);
  if (!stored) return null;
  const maps = Object.fromEntries(collections.map(key => [key, new Map<string, string>()])) as Record<typeof collections[number], Map<string, string>>;
  const idCounters = { ...runtime.idCounters };
  const allocator = { ...runtime, idCounters };
  const reserved = new Set<string>();
  for (const key of collections) {
    for (const record of stored[key]) {
      let id: string;
      if (key in geometry && key !== 'solids' && key !== 'spatialGroups') {
        do { id = nextId(geometry[key as keyof typeof geometry] as GeometryKind, allocator); } while (runtime[key]?.[id] || reserved.has(id));
      } else {
        const prefix = key === 'solids' ? 'solid-copy-' : key === 'spatialGroups' ? 'space-copy-' : `${key}-copy-`;
        let n = 1;
        do { id = `${prefix}${n++}`; } while (runtime[key]?.[id] || reserved.has(id));
      }
      maps[key].set(record.id, id); reserved.add(id);
    }
  }
  // Erased outlines are remembered as absent IDs so recomputation will not recreate them.
  // Give these markers new, non-allocatable IDs without selecting phantom objects on paste.
  const lineReferences=new Map(maps.lines),polygonReferences=new Map(maps.polygons);
  const markerPrefix=[...maps.spatialGroups.values()][0]??[...maps.points.values()][0]??'copy';
  const retainErasure=(references:Map<string,string>,id:string,kind:'line'|'polygon')=>{
    if(!references.has(id))references.set(id,`erased-${kind}-${markerPrefix}-${references.size}`);
  };
  const pointReferences=new Map(maps.points);
  for(const point of stored.points)for(const id of point.boundaryIntersectionSet?.outputs??[])if(!pointReferences.has(id)){
    let index=pointReferences.size,marker=`erased-point-${markerPrefix}-${index}`;
    while(runtime.points?.[marker]||reserved.has(marker))marker=`erased-point-${markerPrefix}-${++index}`;
    pointReferences.set(id,marker);reserved.add(marker);
  }
  for(const solid of stored.solids){
    solid.edges.forEach(id=>retainErasure(lineReferences,id,'line'));
    solid.faces?.forEach(id=>retainErasure(polygonReferences,id,'polygon'));
  }
  for(const polygon of stored.polygons)for(const id of Object.values(polygon.spatialSection?.edgeLines??{}))retainErasure(lineReferences,id,'line');
  const copyMaps: CopyIdMaps = { ...maps, points:pointReferences,lines:lineReferences,polygons:polygonReferences,groups: maps.spatialGroups };
  const batches = new Map<string, string>();
  for (const point of stored.points) if (point.created_group && !batches.has(point.created_group)) batches.set(point.created_group, `copy-${maps.points.get(point.id)}`);
  const prepared = { version: 2 } as ConstructionClipboard;
  prepared.points = stored.points.map(source => {
    const point = remapCopiedPointMetadata(source, copyMaps, batches);
    point.id = maps.points.get(source.id)!;
    point.object_type = 'point';
    // Spatial x/y are projections; the group's anchor supplies their offset.
    if (!point.spatial) { point.x += offset; point.y += offset; }
    return point;
  });
  const storedPointIds=new Set(stored.points.map(point=>point.id));
  prepared.lines = stored.lines.map(source => {
    const line=remapCopiedLine(source,copyMaps),liveIndices=source.points.map((id,index)=>storedPointIds.has(id)?index:-1).filter(index=>index>=0);
    if(liveIndices.length!==source.points.length){
      line.points=liveIndices.map(index=>copyMaps.points.get(source.points[index])??source.points[index]);
      line.segmentStyles=line.points.slice(0,-1).map((_,index)=>({...source.segmentStyles?.[liveIndices[index]]??source.style}));
      line.segmentKeys=line.points.slice(0,-1).map((id,index)=>[id,line.points[index+1]].sort().join('-'));
    }
    line.id=maps.lines.get(source.id)!;
    return line;
  });
  prepared.circles = stored.circles.map(source => ({ ...remapCopiedCircle(source, copyMaps), id: maps.circles.get(source.id)! }));
  prepared.angles = stored.angles.map(source => ({ ...remapCopiedAngle(source, copyMaps), id: maps.angles.get(source.id)! }));
  prepared.polygons = stored.polygons.map(source => ({ ...remapCopiedPolygon(source, copyMaps), id: maps.polygons.get(source.id)! }));
  prepared.solids = stored.solids.map(source => ({ ...remapCopiedSolid(source, copyMaps), id: maps.solids.get(source.id)! }));
  prepared.spatialGroups = stored.spatialGroups.map(source => {
    const group = remapCopiedSpatialGroup(source, copyMaps);
    group.id = maps.spatialGroups.get(source.id)!;
    group.anchor.x += offset; group.anchor.y += offset;
    return group;
  });
  prepared.labels = stored.labels.map(source => createCopiedFreeLabel(source, maps.labels.get(source.id)!, offset, copyMaps));
  prepared.inkStrokes = stored.inkStrokes.map(source => ({ ...clone(source), symmetry:source.symmetry?remapCopiedSymmetry(source.symmetry,copyMaps):undefined,id: maps.inkStrokes.get(source.id)!, points: source.points.map(point => ({ ...point, x: point.x + offset, y: point.y + offset })) }));
  // Recheck the remapped graph in isolation before changing the destination drawing.
  if (!readConstructionClipboard(prepared)) return null;
  for (const key of collections) {
    runtime[key] ??= {};
    Object.assign(runtime[key]!, Object.fromEntries(prepared[key].map(record => [record.id, record])));
  }
  runtime.idCounters = idCounters;
  runtime.objectGroups ??= {};
  for (const source of Object.values(stored.objectGroups ?? {})) {
    let n = 1;
    while (runtime.objectGroups[`group${n}`]) n++;
    const group = { ...clone(source), id: `group${n}` };
    for (const key of groupCollections) group.members[key] = (source.members[key] ?? []).map(id => maps[key].get(id)!).filter(Boolean);
    runtime.objectGroups[group.id] = group;
  }
  return maps;
}
