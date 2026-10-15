import type { Vec3 } from './spatialTypes';
export const add3 = (a: Vec3, b: Vec3): Vec3 => ({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
export const sub3 = (a: Vec3, b: Vec3): Vec3 => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
export const scale3 = (v:Vec3,t:number):Vec3 => ({x:v.x*t,y:v.y*t,z:v.z*t});
export const dot3 = (a:Vec3,b:Vec3):number => a.x*b.x+a.y*b.y+a.z*b.z;
export const cross3 = (a:Vec3,b:Vec3):Vec3 => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
export const norm3 = (v:Vec3):number => Math.hypot(v.x,v.y,v.z);
export const unit3 = (v:Vec3):Vec3 => scale3(v,1/norm3(v));
export const mean3 = (p:Vec3[]):Vec3 => scale3(p.reduce(add3,{x:0,y:0,z:0}),1/p.length);
/** Stable normal for a nondegenerate planar ordered polygon. */
export function polygonNormal3(points:Vec3[]):Vec3|null {
    if(points.length<3)return null;
    const extent=Math.max(1,...points.map(p=>norm3(sub3(p,points[0]))));
    let normal={x:0,y:0,z:0};
    for(let i=1;i<points.length-1;i++)normal=add3(normal,cross3(sub3(points[i],points[0]),sub3(points[i+1],points[0])));
    if(norm3(normal)<extent*extent*1e-9)return null;
    const n=unit3(normal);
    return points.every(p=>Math.abs(dot3(sub3(p,points[0]),n))<=extent*1e-8)?n:null;
}
/** Strict convexity also excludes repeated points, crossed boundaries and zero edges. */
export function convexPolygon3(points:Vec3[]):boolean {
    const n=polygonNormal3(points);if(!n)return false;
    const extent=Math.max(1,...points.map(p=>norm3(sub3(p,points[0])))),eps=extent*extent*1e-9;
    return points.every((a,i)=>{
        const b=points[(i+1)%points.length],edge=sub3(b,a);
        if(norm3(edge)<extent*1e-9)return false;
        return points.every((p,j)=>j===i||j===(i+1)%points.length||dot3(cross3(edge,sub3(p,a)),n)>eps);
    });
}
