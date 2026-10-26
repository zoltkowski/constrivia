export type Position={x:number;y:number};
export type CircleGeometry={center:Position;radius:number;vector?:Position};
export type GeneralizedCircle={kind:'circle';center:Position;radius:number}|{kind:'line';origin:Position;direction:Position};
export type PlaneSymmetry={kind:'point'|'line';id:string};
export type InversionCurve={mirror:string;isometry?:PlaneSymmetry;source:{collection:'lines'|'circles'|'polygons';id:string;edge?:[string,string]}};
export type InversionHelper={curve:InversionCurve;role:'center'|'radius'|'lineA'|'lineB'|'infinity'}|
  {angle:string;mirror:string;arm:1|2};
export type InversionRegion={mirror:string;isometry?:PlaneSymmetry;source:{collection:'polygons'|'circles';id:string}};

export function isometryPosition(geometry:{points:Record<string,Position>;lines?:Record<string,any>},mirror:PlaneSymmetry,p:Position):Position|null {
  if(mirror.kind==='point'){const o=geometry.points[mirror.id];return o?{x:2*o.x-p.x,y:2*o.y-p.y}:null;}
  const line=geometry.lines?.[mirror.id];if(!line)return null;
  const ids=line.defining_points??[line.points[0],line.points[line.points.length-1]],a=geometry.points[ids[0]],b=geometry.points[ids[1]];
  if(!a||!b)return null;
  const dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy;if(n<1e-20)return null;
  const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/n;return{x:2*(a.x+t*dx)-p.x,y:2*(a.y+t*dy)-p.y};
}
export function isometryGeneralizedCircle(source:GeneralizedCircle,transform:(p:Position)=>Position|null):GeneralizedCircle|null {
  if(source.kind==='circle'){const center=transform(source.center);return center?{kind:'circle',center,radius:source.radius}:null;}
  const origin=transform(source.origin),end=transform({x:source.origin.x+source.direction.x,y:source.origin.y+source.direction.y});
  return origin&&end?{kind:'line',origin,direction:{x:end.x-origin.x,y:end.y-origin.y}}:null;
}

export function invertPosition(p:Position,circle:CircleGeometry):Position|null {
  const dx=p.x-circle.center.x,dy=p.y-circle.center.y,n=dx*dx+dy*dy;
  if(!(n>1e-20)||!(circle.radius>0))return null;
  const factor=circle.radius*circle.radius/n;
  const result={x:circle.center.x+factor*dx,y:circle.center.y+factor*dy};
  return Number.isFinite(result.x)&&Number.isFinite(result.y)?result:null;
}

/** Exact image of a supporting line or circle, including transitions through infinity. */
export function invertGeneralizedCircle(source:GeneralizedCircle,mirror:CircleGeometry):GeneralizedCircle|null {
  const o=mirror.center,k=mirror.radius*mirror.radius;
  if(source.kind==='line'){
    const n=Math.hypot(source.direction.x,source.direction.y);if(!(n>1e-12))return null;
    const normal={x:-source.direction.y/n,y:source.direction.x/n};
    const h=(source.origin.x-o.x)*normal.x+(source.origin.y-o.y)*normal.y;
    if(Math.abs(h)<1e-9)return{kind:'line',origin:{...o},direction:{x:source.direction.x/n,y:source.direction.y/n}};
    const distance=k/(2*h);
    return{kind:'circle',center:{x:o.x+normal.x*distance,y:o.y+normal.y*distance},radius:Math.abs(distance)};
  }
  const dx=source.center.x-o.x,dy=source.center.y-o.y,n=dx*dx+dy*dy,den=n-source.radius*source.radius;
  if(Math.abs(den)<=1e-12*Math.max(1,n,source.radius*source.radius)){
    const d=Math.sqrt(n);if(!(d>1e-12))return null;
    const factor=k/(2*n);
    return{kind:'line',origin:{x:o.x+dx*factor,y:o.y+dy*factor},direction:{x:-dy/d,y:dx/d}};
  }
  const factor=k/den;
  return{kind:'circle',center:{x:o.x+dx*factor,y:o.y+dy*factor},radius:Math.abs(factor)*source.radius};
}

export function inversionTangent(p:Position,v:Position,mirror:CircleGeometry):Position|null {
  const dx=p.x-mirror.center.x,dy=p.y-mirror.center.y,n=dx*dx+dy*dy;
  if(!(n>1e-20))return null;
  const dot=(v.x*dx+v.y*dy)/n,factor=mirror.radius*mirror.radius/n;
  return{x:factor*(v.x-2*dx*dot),y:factor*(v.y-2*dy*dot)};
}
