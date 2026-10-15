/** All canvas transform affordances use the same size in CSS pixels. */
export const TRANSFORM_CONTROL_RADIUS=12;
export const TRANSFORM_ROTATE_SIZE=14;
export const TRANSFORM_SCALE_SIZE=16;
export const TRANSFORM_ICON_SCALE=1.6;
type IconPainter=(ctx:CanvasRenderingContext2D,size:number,color:string)=>void;
export function paintTransformControl(ctx:CanvasRenderingContext2D,kind:'rotate'|'scale',color:string,icon:IconPainter) {
  ctx.save();
  ctx.globalAlpha*=.33;ctx.fillStyle=color;
  ctx.beginPath();ctx.arc(0,0,TRANSFORM_CONTROL_RADIUS,0,Math.PI*2);ctx.fill();ctx.restore();
  icon(ctx,kind==='scale'?TRANSFORM_SCALE_SIZE:TRANSFORM_ROTATE_SIZE,color);
}
/** A colored plane and its curved arrow distinguish the three local rotations. */
export function drawPlaneRotationIcon(ctx:CanvasRenderingContext2D,size:number,color:string,axis:0|1|2) {
  ctx.save();
  const s=size*TRANSFORM_ICON_SCALE/16;
  const project=(p:number[])=>({x:(p[0]-p[1])*8*s,y:((p[0]+p[1])*4.6-p[2]*9.6)*s});
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.5;ctx.lineJoin='round';ctx.lineCap='round';
  const others=[0,1,2].filter(a=>a!==axis),fixed=0;
  const plane=(u:number,v:number)=>{const p=[0,0,0];p[axis]=fixed;p[others[0]]=u;p[others[1]]=v;return project(p);};
  const corners=[plane(-.5,-.5),plane(.5,-.5),plane(.5,.5),plane(-.5,.5)];
  ctx.beginPath();corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.save();ctx.globalAlpha*=.24;ctx.fill();ctx.restore();ctx.stroke();
  const curve=Array.from({length:22},(_,i)=>{const angle=-.25*Math.PI+i/21*1.6*Math.PI;return plane(Math.cos(angle)*.32,Math.sin(angle)*.32);});
  ctx.beginPath();curve.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
  const tip=curve[curve.length-1],prev=curve[curve.length-2],dx=tip.x-prev.x,dy=tip.y-prev.y,n=Math.hypot(dx,dy)||1;
  const ux=dx/n,uy=dy/n;ctx.beginPath();ctx.moveTo(tip.x-ux*3-uy*2,tip.y-uy*3+ux*2);ctx.lineTo(tip.x,tip.y);ctx.lineTo(tip.x-ux*3+uy*2,tip.y-uy*3-ux*2);ctx.stroke();ctx.restore();
}

/** A fixed isometric triad groups all local rotation planes in one small panel. */
export function drawRotationPlanes(ctx:CanvasRenderingContext2D,radius:number,colors:readonly string[]) {
  const axes=[{x:Math.sqrt(3)/2,y:.5},{x:-Math.sqrt(3)/2,y:.5},{x:0,y:-1}];
  ctx.save();ctx.lineWidth=1.1;ctx.lineJoin='round';
  for(const axis of [2,0,1]){
    const [a,b]=axes.filter((_,i)=>i!==axis);
    ctx.strokeStyle=colors[axis];ctx.fillStyle=colors[axis];
    ctx.beginPath();
    for(let n=0;n<=64;n++){
      const angle=n/64*Math.PI*2,x=radius*(a.x*Math.cos(angle)+b.x*Math.sin(angle)),y=radius*(a.y*Math.cos(angle)+b.y*Math.sin(angle));
      if(n)ctx.lineTo(x,y);else ctx.moveTo(x,y);
    }
    ctx.closePath();ctx.save();ctx.globalAlpha*=.07;ctx.fill();ctx.restore();
    ctx.save();ctx.globalAlpha*=.65;ctx.stroke();ctx.restore();
  }
  ctx.restore();
}
