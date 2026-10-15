import type { ConstructionRuntime, CopiedStyle, StrokeStyle } from './runtimeTypes';

export type SpatialSelectionParts = { vertices: boolean; edges: boolean };
/** Faces and boundary edges of the displayed solid include its active section cap. */
export function spatialSolidFaceIds(runtime:ConstructionRuntime,id:string):string[] {
  const solid=runtime.solids?.[id],cap=solid?.cutSectionId??solid?.hiddenApexSectionId;
  return [...new Set([...(solid?.faces??[]),...(cap?[cap]:[])])];
}
export function spatialSolidLineIds(runtime:ConstructionRuntime,id:string):string[] {
  const solid=runtime.solids?.[id],cap=solid?.cutSectionId??solid?.hiddenApexSectionId;
  const capEdges=cap?Object.values(runtime.polygons[cap]?.spatialSection?.edgeLines??{}):[];
  return [...new Set([...(solid?.edges??[]),...capEdges])];
}
/** Vertices of the displayed solid, including a cut section instead of a removed apex. */
export function spatialSolidPointIds(runtime: ConstructionRuntime, solidId: string): string[] {
  const solid=runtime.solids?.[solidId];if(!solid)return [];
  const points=[...new Set(spatialSolidFaceIds(runtime,solidId).flatMap(id=>runtime.polygons[id]?.points??[]))];
  return points.length?points:[...solid.vertices];
}
const selectedParts = (runtime:ConstructionRuntime,id:string,selection:SpatialSelectionParts) => {
  return {
    points: selection.vertices?spatialSolidPointIds(runtime,id).map(id=>runtime.points[id]).filter(Boolean):[],
    lines: selection.edges?spatialSolidLineIds(runtime,id).map(id=>runtime.lines[id]).filter(Boolean):[],
    faces: selection.edges?spatialSolidFaceIds(runtime,id).map(id=>runtime.polygons[id]).filter(Boolean):[]
  };
};
/** Mixed visibility hides every target; the next action reveals all targets together. */
export function toggleSpatialSolidVisibility(runtime:ConstructionRuntime,id:string,selection:SpatialSelectionParts):boolean {
  const {points,lines,faces}=selectedParts(runtime,id,selection);
  if(!points.length&&!lines.length&&!faces.length)return false;
  const hide=!(points.every(p=>p.style.hidden)&&lines.every(l=>l.hidden)&&faces.every(p=>p.hidden));
  for(const point of points)point.style={...point.style,hidden:hide};
  for(const line of lines)line.hidden=hide;
  for(const face of faces)face.hidden=hide;
  return true;
}
export function copySpatialSolidStyle(runtime:ConstructionRuntime,id:string,selection:SpatialSelectionParts):CopiedStyle|null {
  const {points,lines,faces}=selectedParts(runtime,id,selection);
  if(!selection.edges){const p=points[0];return p?{sourceType:'point',color:p.style.color,size:p.style.size}:null;}
  const line=lines[0],face=faces[0];if(!line)return null;
  const style=line.segmentStyles?.[0]??line.style;
  return {sourceType:'polygon',color:style.color,width:style.width,type:style.type??'solid',tick:style.tick,
    fill:face?.fill,fillOpacity:face?.fill===undefined?null:face.fillOpacity,
    ...(points[0]?{size:points[0].style.size}: {})};
}
/** Copy appearance only; hidden fragments and construction dependencies stay untouched. */
export function applySpatialSolidStyle(runtime:ConstructionRuntime,id:string,selection:SpatialSelectionParts,style:CopiedStyle):boolean {
  const {points,lines,faces}=selectedParts(runtime,id,selection);let changed=false;
  if(style.color!==undefined)for(const point of points){point.style={...point.style,color:style.color,...(style.size===undefined?{}:{size:style.size})};changed=true;}
  if(style.color!==undefined&&style.width!==undefined&&style.type!==undefined){
    const patch:Partial<StrokeStyle>={color:style.color,width:style.width,type:style.type,...(style.tick===undefined?{}:{tick:style.tick})};
    for(const line of lines){line.style={...line.style,...patch};line.segmentStyles=line.points.slice(1).map((_,i)=>({...line.segmentStyles?.[i]??line.style,...patch}));changed=true;}
  }
  if(Object.prototype.hasOwnProperty.call(style,'fillOpacity')||style.fill!==undefined)for(const face of faces){
    if(style.fillOpacity===null){delete face.fill;delete face.fillOpacity;}
    else{if(style.fill!==undefined)face.fill=style.fill;if(Object.prototype.hasOwnProperty.call(style,'fillOpacity')){if(style.fillOpacity===undefined)delete face.fillOpacity;else face.fillOpacity=style.fillOpacity;}}
    changed=true;
  }
  return changed;
}
