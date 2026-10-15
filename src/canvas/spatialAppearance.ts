export type SpatialAppearance = {
  spatialBackIntensity?: number;
  spatialBackEdgeStyle?: 'solid'|'dashed'|'dotted';
  spatialBackHidden?: boolean;
};
export function normalizeSpatialAppearance(value:SpatialAppearance={}):Required<SpatialAppearance> {
  return {
    spatialBackIntensity:typeof value.spatialBackIntensity==='number'&&Number.isFinite(value.spatialBackIntensity)?Math.max(0,Math.min(1,value.spatialBackIntensity)):.15,
    spatialBackEdgeStyle:['solid','dashed','dotted'].includes(value.spatialBackEdgeStyle??'')?value.spatialBackEdgeStyle!:'dashed',
    spatialBackHidden:value.spatialBackHidden===true
  };
}
/** View preferences never alter construction visibility or user stroke styles. */
export function spatialIntensity(object:{spatialHiddenEdge?:boolean;spatialHiddenPoint?:boolean},appearance:SpatialAppearance={}):number {
  if(!object.spatialHiddenEdge&&!object.spatialHiddenPoint)return 1;
  const settings=normalizeSpatialAppearance(appearance);
  return settings.spatialBackHidden?0:settings.spatialBackIntensity;
}
export function spatialLineType<T extends string>(object:{spatialHiddenEdge?:boolean},original:T,appearance:SpatialAppearance={}):T|'solid'|'dashed'|'dotted' {
  return object.spatialHiddenEdge?normalizeSpatialAppearance(appearance).spatialBackEdgeStyle:original;
}
