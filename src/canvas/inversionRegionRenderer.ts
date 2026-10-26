import type { ConstructionRuntime, PolygonRuntime } from '../core/runtimeTypes';
import { inversionRegionContains,inversionRegionBoundaries } from '../core/inversionRegion';

/** Scan exact curved boundaries per screen row, including unbounded image regions. */
export function renderInversionRegionFill(ctx:CanvasRenderingContext2D,runtime:ConstructionRuntime,polygon:PolygonRuntime,dpr:number,showHidden:boolean) {
  const region=polygon.inversionRegion;if(!region||!polygon.fill)return;
  const t=ctx.getTransform(),width=ctx.canvas.width,height=ctx.canvas.height;
  if(!(t.a>0&&t.d>0))return;
  const boundaries=inversionRegionBoundaries(runtime,region),step=Math.max(1,dpr);
  const left=-t.e/t.a,right=(width-t.e)/t.a;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=polygon.fill;
  ctx.globalAlpha=(polygon.fillOpacity??1)*((polygon.hidden&&showHidden)?0.4:1);
  for(let row=0;row<height;row+=step){
    const y=(row+step/2-t.f)/t.d,xs=[left,right];
    for(const boundary of boundaries){
      const g=boundary.geometry,candidates:number[]=[];
      if(g.kind==='circle'){
        const n=g.radius*g.radius-(y-g.center.y)**2;
        if(n>=0){const d=Math.sqrt(n);candidates.push(g.center.x-d,g.center.x+d);}
      }else if(Math.abs(g.direction.y)>1e-12)candidates.push(g.origin.x+(y-g.origin.y)*g.direction.x/g.direction.y);
      for(const x of candidates)if(Number.isFinite(x)&&x>left&&x<right&&boundary.contains({x,y}))xs.push(x);
    }
    xs.sort((a,b)=>a-b);
    for(let i=1;i<xs.length;i++){
      const a=xs[i-1],b=xs[i];if(b-a<1e-12)continue;
      if(inversionRegionContains(runtime,region,{x:(a+b)/2,y}))ctx.fillRect(a*t.a+t.e,row,(b-a)*t.a,step);
    }
  }
  ctx.restore();
}
