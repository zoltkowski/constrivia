import type { ConstructionRuntime } from './runtimeTypes';
import { resolveCircleGeometry } from './circleGeometry';
import { invertPosition, invertGeneralizedCircle, isometryPosition, isometryGeneralizedCircle, type Position, type GeneralizedCircle, type InversionRegion } from './inversionGeometry';

type Boundary={geometry:GeneralizedCircle;contains:(p:Position)=>boolean};
function polygonContains(points:Position[],p:Position){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
export function inversionRegionContains(runtime:ConstructionRuntime,region:InversionRegion,p:Position,depth=0):boolean {
  if(depth>32)return false;
  const circle=runtime.circles[region.mirror],mirror=circle&&resolveCircleGeometry(runtime,circle),q=region.isometry?isometryPosition(runtime,region.isometry,p):mirror&&invertPosition(p,mirror);
  if(!q)return false;
  if(region.source.collection==='circles'){
    const source=runtime.circles[region.source.id],g=source&&resolveCircleGeometry(runtime,source);
    return !!g&&Math.hypot(q.x-g.center.x,q.y-g.center.y)<=g.radius;
  }
  const source=runtime.polygons[region.source.id];if(!source)return false;
  if(source.inversionRegion)return inversionRegionContains(runtime,source.inversionRegion,q,depth+1);
  const points=source.points.map(id=>runtime.points[id]);
  return points.length>=3&&points.every(Boolean)&&polygonContains(points,q);
}

export function inversionRegionBoundaries(runtime:ConstructionRuntime,region:InversionRegion,depth=0):Boundary[] {
  if(depth>32)return [];
  const c=runtime.circles[region.mirror],mirror=c&&resolveCircleGeometry(runtime,c);if(!mirror&&!region.isometry)return [];
  let original:Boundary[]=[];
  if(region.source.collection==='circles'){
    const source=runtime.circles[region.source.id],g=source&&resolveCircleGeometry(runtime,source);
    if(g)original=[{geometry:{kind:'circle',...g},contains:()=>true}];
  }else{
    const source=runtime.polygons[region.source.id];if(!source)return [];
    if(source.inversionRegion)original=inversionRegionBoundaries(runtime,source.inversionRegion,depth+1);
    else for(let i=0;i<source.points.length;i++){
      const a=runtime.points[source.points[i]],b=runtime.points[source.points[(i+1)%source.points.length]];
      if(!a||!b)continue;
      const dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy;if(n<1e-20)continue;
      original.push({geometry:{kind:'line',origin:a,direction:{x:dx,y:dy}},contains:p=>{
        const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/n;return t>=-1e-7&&t<=1+1e-7;
      }});
    }
  }
  return original.flatMap(boundary=>{
    const transform=(p:Position)=>region.isometry?isometryPosition(runtime,region.isometry,p):invertPosition(p,mirror!);
    const geometry=region.isometry?isometryGeneralizedCircle(boundary.geometry,transform):invertGeneralizedCircle(boundary.geometry,mirror!);if(!geometry)return [];
    return[{geometry,contains:(p:Position)=>{const q=transform(p);return !!q&&boundary.contains(q);}}];
  });
}
