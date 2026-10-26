import type { BoundMeasurement, ConstructionRuntime, LabelRuntime } from './runtimeTypes';
import { editLabelTextStyles } from '../ui/labelTextStyles';

type Position = {x:number;y:number};
export type MeasurementGeometryOptions = {
  distance?: (a:string,b:string)=>number|null;
  angleValue?: (id:string)=>number|null;
  angleAnchor?: (id:string)=>Position|null;
};
export function measurementSourceExists(runtime:ConstructionRuntime,source:BoundMeasurement) {
  return source.kind==='angle' ? !!runtime.angles[source.angleId]
    : !!runtime.lines[source.lineId] && source.points.every(id=>!!runtime.points[id]);
}
export function boundMeasurementGeometry(runtime:ConstructionRuntime,source:BoundMeasurement,options:MeasurementGeometryOptions={}) {
  if(source.kind==='segment'){
    const line=runtime.lines[source.lineId],a=runtime.points[source.points[0]],b=runtime.points[source.points[1]];
    if(!line||!a||!b||line.geometryValid===false||a.geometryValid===false||b.geometryValid===false)return null;
    const value=options.distance?.(a.id,b.id)??Math.hypot(b.x-a.x,b.y-a.y);
    return Number.isFinite(value)?{value,anchor:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}}:null;
  }
  const angle=runtime.angles[source.angleId];
  if(!angle||angle.geometryValid===false)return null;
  const vertex=runtime.points[angle.vertex],value=options.angleValue?.(angle.id),anchor=options.angleAnchor ? options.angleAnchor(angle.id) : vertex;
  return vertex&&vertex.geometryValid!==false&&value!=null&&Number.isFinite(value)&&anchor ? {value,anchor:{x:anchor.x,y:anchor.y}}:null;
}
export function setMeasurementLabelPosition(runtime:ConstructionRuntime,label:LabelRuntime,pos:Position,options:MeasurementGeometryOptions={}) {
  label.pos={...pos};
  const source=label.measurement,geometry=source&&boundMeasurementGeometry(runtime,source,options);
  if(source&&geometry)source.offset={x:pos.x-geometry.anchor.x,y:pos.y-geometry.anchor.y};
}
export function syncBoundMeasurements(runtime:ConstructionRuntime,options:MeasurementGeometryOptions&{lengthPrecision:number;anglePrecision:number}) {
  for(const label of Object.values(runtime.labels)){
    const source=label.measurement;
    if(!source)continue;
    if(!measurementSourceExists(runtime,source)){delete runtime.labels[label.id];continue;}
    const geometry=boundMeasurementGeometry(runtime,source,options);
    const text=geometry ? source.kind==='angle' ? `${geometry.value.toFixed(options.anglePrecision)}°`
      : Number.isFinite(source.scale)&&source.scale>0 ? (geometry.value/source.scale).toFixed(options.lengthPrecision):'' : '';
    if(text!==label.text){
      if(text&&label.text&&label.textStyles)label.textStyles=editLabelTextStyles(label.text,text,label.textStyles);
      label.text=text;
    }
    if(geometry)label.pos={x:geometry.anchor.x+source.offset.x,y:geometry.anchor.y+source.offset.y};
  }
}
