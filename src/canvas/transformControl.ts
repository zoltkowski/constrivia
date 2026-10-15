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
/** A shaded cube face and a curved in-plane arrow distinguish the three rotations. */
export function drawPlaneRotationIcon(ctx:CanvasRenderingContext2D,size:number,color:string,axis:0|1|2) {
  ctx.save();
  const s=size*TRANSFORM_ICON_SCALE/16;
  const project=(p:number[])=>({x:(p[0]-p[1])*6*s,y:((p[0]+p[1])*3.4-p[2]*7)*s});
  const vertices=Array.from({length:8},(_,i)=>project([((i&1)?1:0)-.5,((i&2)?1:0)-.5,((i&4)?1:0)-.5]));
  ctx.strokeStyle=color;ctx.lineWidth=1;ctx.lineJoin='round';ctx.lineCap='round';ctx.globalAlpha*=.45;
  ctx.beginPath();for(let i=0;i<8;i++)for(let a=0;a<3;a++)if(!(i&(1<<a))){const p=vertices[i],q=vertices[i|(1<<a)];ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);}ctx.stroke();
  ctx.restore();ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.5;ctx.lineJoin='round';ctx.lineCap='round';
  const others=[0,1,2].filter(a=>a!==axis),fixed=axis===1?-.5:.5;
  const plane=(u:number,v:number)=>{const p=[0,0,0];p[axis]=fixed;p[others[0]]=u;p[others[1]]=v;return project(p);};
  const corners=[plane(-.5,-.5),plane(.5,-.5),plane(.5,.5),plane(-.5,.5)];
  ctx.beginPath();corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.save();ctx.globalAlpha*=.24;ctx.fill();ctx.restore();ctx.stroke();
  const curve=Array.from({length:22},(_,i)=>{const angle=-.25*Math.PI+i/21*1.6*Math.PI;return plane(Math.cos(angle)*.32,Math.sin(angle)*.32);});
  ctx.beginPath();curve.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
  const tip=curve[curve.length-1],prev=curve[curve.length-2],dx=tip.x-prev.x,dy=tip.y-prev.y,n=Math.hypot(dx,dy)||1;
  const ux=dx/n,uy=dy/n;ctx.beginPath();ctx.moveTo(tip.x-ux*3-uy*2,tip.y-uy*3+ux*2);ctx.lineTo(tip.x,tip.y);ctx.lineTo(tip.x-ux*3+uy*2,tip.y-uy*3-ux*2);ctx.stroke();ctx.restore();
}
