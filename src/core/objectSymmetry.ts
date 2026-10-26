import { addPoint, nextId } from './engineActions';
import { circleInputPointIds, compassSourceLines,resolveCircleGeometry } from './circleGeometry';
import { invertPosition } from './inversionGeometry';
import { createInversionObjects,syncInversionObjects,validateInversionMetadata } from './inversionObjects';
import { hasIndependentLineDirection, lineSubdivisionPointIds } from './lineSubdivision';
import { polygonLines } from './polygonTools';
import { groupCollections, groupForObject, type GroupSelection } from './objectGroups';
import { remapCopiedLine, remapCopiedCircle, remapCopiedAngle, remapCopiedPolygon, type CopyIdMaps } from './copyMetadata';
import type { ConstructionRuntime, ObjectSymmetry, SymmetricMeta, SymmetryCollection, Label } from './runtimeTypes';

export type SymmetryInput = { collection: SymmetryCollection | 'groups' | 'solids'; id: string };
const clone = <T>(value:T):T => value === undefined ? value : JSON.parse(JSON.stringify(value));
const kinds = {points:'point',lines:'line',circles:'circle',angles:'angle',polygons:'polygon'} as const;
export const emptySymmetrySelection = ():GroupSelection => Object.fromEntries(groupCollections.map(key=>[key,new Set<string>()])) as GroupSelection;

export function validateObjectSymmetries(runtime:ConstructionRuntime) {
  validateInversionMetadata(runtime);
  for(const key of groupCollections)for(const object of Object.values(runtime[key])){
    const meta=object.symmetry;if(meta===undefined)continue;
    if(!meta||!meta.source||!groupCollections.includes(meta.source.collection)||typeof meta.source.id!=='string'||
      !meta.mirror||!['point','line','circle'].includes(meta.mirror.kind)||typeof meta.mirror.id!=='string'||typeof meta.batch!=='string'||
      (meta.linePoints!==undefined&&(!Array.isArray(meta.linePoints)||meta.linePoints.some((id:unknown)=>typeof id!=='string'))))throw new Error('Invalid symmetry definition');
  }
}

/** The mirror's supporting line is used even when only a segment or ray is drawn. */
export function symmetryPosition(runtime:Pick<ConstructionRuntime,'points'|'lines'>&Partial<Pick<ConstructionRuntime,'circles'>>,mirror:SymmetricMeta['mirror'],p:{x:number;y:number}) {
  if(mirror.kind==='circle'){
    const circle=runtime.circles?.[mirror.id],g=circle&&runtime.circles&&resolveCircleGeometry(runtime,circle);
    return g?invertPosition(p,g):null;
  }
  if(mirror.kind==='point'){
    const o=runtime.points[mirror.id];
    return o&&o.geometryValid!==false ? {x:2*o.x-p.x,y:2*o.y-p.y} : null;
  }
  const line=runtime.lines[mirror.id],ids=line?.defining_points??[line?.points[0],line?.points[line.points.length-1]];
  const a=runtime.points[ids[0]],b=runtime.points[ids[1]];
  if(!line||line.geometryValid===false||!a||!b)return null;
  const dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy;
  if(n<1e-12)return null;
  const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/n;
  return {x:2*(a.x+t*dx)-p.x,y:2*(a.y+t*dy)-p.y};
}

function imageLabel(runtime:ConstructionRuntime,label:Label|undefined,meta:ObjectSymmetry):Label|undefined {
  if(!label)return undefined;
  const result=clone(label);
  result.text=label.text+'′';
  if(label.offset){
    const a=symmetryPosition(runtime,meta.mirror,{x:0,y:0}),b=symmetryPosition(runtime,meta.mirror,label.offset);
    if(a&&b)result.offset={x:b.x-a.x,y:b.y-a.y};
  }
  return result;
}

function mapsFor(runtime:ConstructionRuntime,batch:string):CopyIdMaps {
  const maps:any={};
  for(const key of groupCollections)maps[key]=new Map(Object.values(runtime[key]).filter(object=>object.symmetry?.batch===batch&&object.symmetry.source.collection===key).map(object=>[object.symmetry!.source.id,object.id]));
  return maps;
}

function reflectedPoint(runtime:ConstructionRuntime,id:string,mirror:SymmetricMeta['mirror'],batch:string,helper=false) {
  const source=runtime.points[id];
  if(!source)return null;
  const existing=Object.values(runtime.points).find(p=>p.symmetry?.batch===batch&&p.symmetry.source.id===id);
  if(existing)return existing.id;
  const position=symmetryPosition(runtime,mirror,source);
  if(!position)return null;
  const output=addPoint(runtime,{
    ...position,style:clone(source.style),construction_kind:'symmetric',
    symmetricMeta:{source:id,mirror:clone(mirror)},
    symmetry:{source:{collection:'points',id},mirror:clone(mirror),batch,helper}
  });
  if(helper)runtime.points[output].style.hidden=true;
  return output;
}

/** Images contain reflected inputs, not copies of their ancestors' constructions. */
export function createObjectSymmetry(runtime:ConstructionRuntime,input:SymmetryInput,mirror:SymmetricMeta['mirror']) {
  if(mirror.kind==='circle'?!runtime.circles[mirror.id]||!resolveCircleGeometry(runtime,runtime.circles[mirror.id]):!symmetryPosition(runtime,mirror,{x:0,y:0}))return null;
  const selected=emptySymmetrySelection(),seen=new Set<string>(),helpers=new Set<string>();
  const visit=(key:SymmetryCollection,id:string)=>{
    if(seen.has(key+':'+id)||!runtime[key][id])return;
    seen.add(key+':'+id);selected[key].add(id);
    const object:any=runtime[key][id];
    if(key==='lines'){
      [...object.points,...object.defining_points].forEach((point:string)=>visit('points',point));
    }else if(key==='circles'){
      [object.center,object.radius_point,...object.points].filter(Boolean).forEach((point:string)=>visit('points',point));
      // A transferred radius keeps its original length dependency through reflected helpers.
      circleInputPointIds(object).forEach(point=>{if(!selected.points.has(point))selected.points.add(point);});
      if(object.compassSource){
        const before=new Set(seen);compassSourceLines(object.compassSource).forEach(line=>visit('lines',line.lineId));
        for(const ref of seen)if(!before.has(ref))helpers.add(ref);
      }
    }else if(key==='polygons'){
      object.points.forEach((point:string)=>visit('points',point));
      polygonLines(runtime,id).forEach(line=>visit('lines',line));
    }else if(key==='angles'){
      visit('points',object.vertex);
      for(const arm of [object.arm1,object.arm2])if(arm)arm.kind==='point'?visit('points',arm.pointId):visit('lines',arm.lineId);
      for(const value of [object.point1,object.point2])if(value)runtime.points[value]?visit('points',value):visit('lines',value);
      for(const value of [object.arm1LineId,object.arm2LineId])if(value)visit('lines',value);
    }
  };
  const originalGroup=input.collection==='groups'?runtime.objectGroups?.[input.id]
    :input.collection!=='solids'?groupForObject(runtime,input.collection,input.id):null;
  if(originalGroup)for(const key of groupCollections)for(const id of originalGroup.members[key]??[])visit(key,id);
  else if(input.collection==='solids'){
    const solid=runtime.solids?.[input.id];if(!solid)return null;
    solid.vertices.forEach(id=>visit('points',id));solid.edges.forEach(id=>visit('lines',id));solid.faces?.forEach(id=>visit('polygons',id));
  }else if(input.collection!=='groups')visit(input.collection,input.id);
  if(!seen.size)return null;
  if(mirror.kind==='circle')return createInversionObjects(runtime,selected,mirror.id,helpers);
  const batch=nextId('point',runtime)+'-symmetry';
  const result=emptySymmetrySelection();
  for(const id of selected.points){
    const image=reflectedPoint(runtime,id,mirror,batch,!seen.has('points:'+id)||helpers.has('points:'+id));
    if(image)result.points.add(image);
  }
  const maps=mapsFor(runtime,batch) as CopyIdMaps&Record<SymmetryCollection,Map<string,string>>;
  for(const key of groupCollections.filter(key=>key!=='points'))for(const id of selected[key]){
    const output=key in kinds?nextId(kinds[key as keyof typeof kinds],runtime):batch+'-'+key+'-'+result[key].size;
    maps[key].set(id,output);
    const meta:ObjectSymmetry={source:{collection:key,id},mirror:clone(mirror),batch,helper:helpers.has(key+':'+id)};
    (runtime[key] as Record<string,any>)[output]={id:output,symmetry:meta};
    result[key].add(output);
  }
  syncObjectSymmetries(runtime);
  const count=groupCollections.reduce((n,key)=>n+result[key].size,0);
  if(count>1){
    runtime.objectGroups??={};let index=1;while(runtime.objectGroups['group'+index])index++;
    runtime.objectGroups['group'+index]={id:'group'+index,locked:true,members:Object.fromEntries(groupCollections.map(key=>[key,[...result[key]]]))};
  }
  return result;
}

/** Keep appearance and non-engine objects dependent too, including newly subdivided inputs. */
export function syncObjectSymmetries(runtime:ConstructionRuntime):boolean {
  let changed=false,removed=true;
  while(removed){
    removed=false;
    for(const key of groupCollections)for(const object of Object.values(runtime[key])){
      const meta:ObjectSymmetry|undefined=object.symmetry;if(!meta)continue;
      if(!runtime[meta.source.collection][meta.source.id]||!runtime[meta.mirror.kind==='point'?'points':meta.mirror.kind==='line'?'lines':'circles'][meta.mirror.id]){
        delete runtime[key][object.id];removed=true;changed=true;
      }
    }
  }
  const batches=new Map<string,CopyIdMaps>();
  for(const key of groupCollections)for(const image of Object.values(runtime[key]) as any[]){
    const meta:ObjectSymmetry|undefined=image.symmetry;if(!meta)continue;
    if(meta.mirror.kind==='circle')continue;
    const source:any=runtime[meta.source.collection][meta.source.id];
    const point=(id:string,helper=false)=>{
      const before=Object.keys(runtime.points).length;
      const output=reflectedPoint(runtime,id,meta.mirror,meta.batch,helper);
      if(Object.keys(runtime.points).length!==before){changed=true;batches.delete(meta.batch);}
      return output;
    };
    if(key==='points'){
      const p=symmetryPosition(runtime,meta.mirror,source);
      if(p){if(Math.hypot(image.x-p.x,image.y-p.y)>1e-8)changed=true;Object.assign(image,p);}
      image.style=clone(source.style);if(meta.helper)image.style.hidden=true;
      image.label=imageLabel(runtime,source.label,meta);
      image.hidden=source.hidden;image.geometryValid=!!p&&source.geometryValid!==false;
      image.spatialHiddenPoint=source.spatialHiddenPoint;
      continue;
    }
    if(key==='lines')for(const id of [...source.points,...source.defining_points])point(id);
    if(key==='circles')for(const id of [source.center,...source.points,...circleInputPointIds(source)])point(id);
    if(key==='polygons')for(const id of source.points)point(id);
    let maps=batches.get(meta.batch);if(!maps){maps=mapsFor(runtime,meta.batch);batches.set(meta.batch,maps);}
    let copy:any;
    if(key==='lines'){
      copy=remapCopiedLine(source,maps);copy.id=image.id;
      if(source.inversion)copy.inversion={source:{collection:'lines',id:source.id},mirror:'',isometry:meta.mirror};
      delete copy.parallel;delete copy.perpendicular;delete copy.bisector;delete copy.spatialParameters;
      meta.linePoints=hasIndependentLineDirection(source)?lineSubdivisionPointIds(source).map(id=>maps!.points.get(id)!):undefined;
    }else if(key==='circles'){
      copy=remapCopiedCircle({...source,defining_points:source.defining_points??[source.radius_point??source.center,source.center,source.radius_point??source.center]},maps);
      if(source.inversion)copy.inversion={source:{collection:'circles',id:source.id},mirror:'',isometry:meta.mirror};
      if(meta.mirror.kind==='line'&&copy.arcStyles&&!Array.isArray(copy.arcStyles))copy.arcStyles=Object.fromEntries(Object.entries(copy.arcStyles).map(([key,style])=>{const [c,a,b]=key.split(':');return[`${c}:${b}:${a}`,style];}));
    }else if(key==='angles'){
      copy=remapCopiedAngle(source,maps);delete copy.spatial;
      if(meta.mirror.kind==='line'){
        [copy.point1,copy.point2]=[copy.point2,copy.point1];[copy.arm1,copy.arm2]=[copy.arm2,copy.arm1];[copy.arm1LineId,copy.arm2LineId]=[copy.arm2LineId,copy.arm1LineId];
      }
    }else if(key==='polygons'){
      copy=remapCopiedPolygon(source,maps);copy.locked=false;delete copy.lockRef;delete copy.solidFace;delete copy.spatialSection;delete copy.spatialGroupId;
      if(source.inversionRegion)copy.inversionRegion={source:{collection:'polygons',id:source.id},mirror:'',isometry:meta.mirror};
    }else if(key==='labels'){
      const p=symmetryPosition(runtime,meta.mirror,source.pos);
      copy={...clone(source),pos:p??image.pos,hidden:!p||source.hidden};delete copy.measurement;
    }else{
      copy=clone(source);copy.points=source.points.map((p:any)=>({...p,...symmetryPosition(runtime,meta.mirror,p)}));
    }
    if(!copy)continue;
    if(meta.helper)copy.hidden=true;
    delete copy.defining_parents;copy.construction_kind='free';copy.label=imageLabel(runtime,source.label,meta);
    const valid=source.geometryValid!==false&&!!symmetryPosition(runtime,meta.mirror,{x:0,y:0});
    if(!valid&&(key==='labels'||key==='inkStrokes'))copy.hidden=true;
    Object.assign(image,copy,{id:image.id,symmetry:meta,geometryValid:valid});
  }
  return syncInversionObjects(runtime)||changed;
}
