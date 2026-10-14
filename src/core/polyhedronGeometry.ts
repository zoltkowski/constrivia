import { addLineFromPoints, addPoint, nextId } from './engineActions';
import type { ConstructionRuntime } from './runtimeTypes';
import type { Cuboid, Mat3, SpatialFace, Vec3 } from './spatialTypes';
import { spatialPosition, syncSpatialGeometry, transform3 } from './spatialGeometry';
import { add3, convexPolygon3, dot3, mean3, norm3, polygonNormal3, scale3, sub3 } from './spatialMath';
import {clippedSpatialFace,consumeSpatialBase} from './spatialSolidEditing';
const identity:Mat3=[1,0,0,0,1,0,0,0,1];
const initialView:Mat3=[Math.SQRT1_2,-Math.SQRT1_2,0,Math.SQRT1_2/2,Math.SQRT1_2/2,-Math.sqrt(3)/2,Math.sqrt(3/8),Math.sqrt(3/8),.5];
const freshId=(records:Record<string,unknown>,prefix:string)=>{let n=1;while(records[`${prefix}${n}`])n++;return `${prefix}${n}`;};
export function polyhedronBase(solid:Cuboid,resolve:(id:string)=>Vec3|null):{points:Vec3[];normal:Vec3;center:Vec3}|null {
    const definition=solid.polyhedron;if(!definition)return null;
    const points=definition.basePoints.map(resolve);if(points.some(p=>!p))return null;
    const ps=points as Vec3[],normal=polygonNormal3(ps);
    if(!normal||!convexPolygon3(ps))return null;
    const sign=definition.normalSign??(dot3(normal,definition.normal)<0?-1:1);
    return {points:ps,normal:scale3(normal,sign),center:mean3(ps)};
}
export function polyhedronVertex(solid:Cuboid,vertex:number,resolve:(id:string)=>Vec3|null):Vec3|null {
    const d=solid.polyhedron,base=polyhedronBase(solid,resolve);
    if(!d||!base||vertex<d.basePoints.length||vertex>=solid.vertices.length)return null;
    const offset=sub3(d.offset,scale3(base.normal,dot3(d.offset,base.normal)));
    const extrusion=add3(scale3(base.normal,d.height),d.rightLocked?{x:0,y:0,z:0}:offset);
    return add3(d.kind==='pyramid'?base.center:base.points[vertex-d.basePoints.length],extrusion);
}
/** Creates regular solids, copies a 2D base, or reuses a coplanar 3D base with its dependencies. */
export function createPrismOrPyramid(runtime:ConstructionRuntime,kind:'prism'|'pyramid',anchor:{x:number;y:number},size:number,sides:number,basePolygonId?:string):string|null {
    if(!['prism','pyramid'].includes(kind)||!Number.isFinite(size)||size<=0||!Number.isInteger(sides)||sides<3||sides>100||!Number.isFinite(anchor.x)||!Number.isFinite(anchor.y))return null;
    const source=basePolygonId?runtime.polygons[basePolygonId]:null;
    if(basePolygonId&&!source)return null;
    let groupId=source?.spatialGroupId;
    let positions:Vec3[];
    if(source){
        if(source.geometryValid===false||source.points.length<3||source.points.length>100)return null;
        if(groupId){
            if(source.points.some(id=>runtime.points[id]?.spatial?.groupId!==groupId))return null;
            const ps=source.points.map(id=>spatialPosition(runtime,id));if(ps.some(p=>!p))return null;positions=ps as Vec3[];
        }else{
            if(source.points.some(id=>!runtime.points[id]||runtime.points[id].spatial||runtime.points[id].geometryValid===false))return null;
            const center=mean3(source.points.map(id=>({...runtime.points[id],z:0})));
            positions=source.points.map(id=>({x:runtime.points[id].x-center.x,y:runtime.points[id].y-center.y,z:0}));
        }
    }else positions=Array.from({length:sides},(_,i)=>({x:Math.cos(2*Math.PI*i/sides)*size*.65,y:Math.sin(2*Math.PI*i/sides)*size*.65,z:0}));
    if(!convexPolygon3(positions))return null;
    const windingNormal=polygonNormal3(positions)!;
    let normal=windingNormal;
    if(groupId&&source?.solidFace){
        const parent=runtime.solids?.[source.solidFace.solidId];
        const points=parent?.vertices.map(id=>spatialPosition(runtime,id)).filter((p):p is Vec3=>!!p);
        if(points?.length&&dot3(normal,sub3(mean3(positions),mean3(points)))<0)normal=scale3(normal,-1);
    }else if(!groupId&&normal.z<0)normal=scale3(normal,-1);
    runtime.solids??={};runtime.spatialGroups??={};
    if(!groupId){
        const sourceCenter=source?mean3(source.points.map(id=>({...runtime.points[id],z:0}))):null;
        const placement=sourceCenter?{x:sourceCenter.x,y:sourceCenter.y}:{...anchor};
        groupId=freshId(runtime.spatialGroups,'space');runtime.spatialGroups[groupId]={id:groupId,anchor:placement,pivot:{x:0,y:0,z:size*.35},orientation:[...initialView]};
    }
    const basePoints=source?.spatialGroupId?[...source.points]:positions.map((position,index)=>{
        const original=source?runtime.points[source.points[index]]:null;
        const id=addPoint(runtime,{x:0,y:0,style:original?{...original.style,hidden:false}:{},construction_kind:'free'});
        if(original?.label){const {seq,...label}=original.label;runtime.points[id].label={...label,offset:label.offset?{...label.offset}:undefined};}
        runtime.points[id].spatial={groupId:groupId!,binding:{kind:'position',position:{...position}}};return id;
    });
    const solidId=freshId(runtime.solids,'solid');
    const solid:Cuboid=runtime.solids[solidId]={id:solidId,groupId,origin:{x:0,y:0,z:0},basis:[...identity],size:{x:size,y:size,z:size},vertices:[...basePoints],edges:[],faces:[],polyhedron:{kind,basePoints,normal,normalSign:dot3(normal,windingNormal)<0?-1:1,height:size,offset:{x:0,y:0,z:0},rightLocked:true,faceVertices:[]}};
    const n=basePoints.length,upper=kind==='prism'?n:1;
    for(let i=0;i<upper;i++){
        const id=addPoint(runtime,{x:0,y:0,style:{},construction_kind:'free'});
        runtime.points[id].spatial={groupId,binding:{kind:'vertex',solidId,vertex:n+i}};solid.vertices.push(id);
    }
    const faceVertices=solid.polyhedron!.faceVertices;
    faceVertices.push([...basePoints]);
    if(kind==='prism')faceVertices.push(solid.vertices.slice(n));
    for(let i=0;i<n;i++){
        const j=(i+1)%n;
        faceVertices.push(kind==='prism'?[basePoints[i],basePoints[j],solid.vertices[n+j],solid.vertices[n+i]]:[basePoints[i],basePoints[j],solid.vertices[n]]);
    }
    const edge=(a:string,b:string)=>{
        let line=Object.values(runtime.lines).find(l=>l.defining_points.includes(a)&&l.defining_points.includes(b));
        if(!line){line=runtime.lines[addLineFromPoints(runtime,a,b,{width:2})];delete line.leftRay;delete line.rightRay;}
        if(!solid.edges.includes(line.id))solid.edges.push(line.id);
    };
    for(const ps of faceVertices)for(let i=0;i<ps.length;i++)edge(ps[i],ps[(i+1)%ps.length]);
    for(let index=0;index<faceVertices.length;index++){
        const id=nextId('polygon',runtime),base=index===0,top=kind==='prism'&&index===1;
        runtime.polygons[id]={id,points:[...faceVertices[index]],spatialGroupId:groupId,solidFace:{solidId,axis:base||top?2:0,side:top?1:0,index},fill:source?.fill??'#15a3ff',fillOpacity:source?.fillOpacity??.12};solid.faces!.push(id);
    }
    if(basePolygonId)consumeSpatialBase(runtime,basePolygonId);
    syncSpatialGeometry(runtime);return solidId;
}
export function polyhedronFaces(runtime:ConstructionRuntime,solid:Cuboid):SpatialFace[] {
    const group=runtime.spatialGroups?.[solid.groupId],d=solid.polyhedron;
    if(!group||!d)return [];
    const vertices=solid.vertices.map(id=>spatialPosition(runtime,id));if(vertices.some(p=>!p))return [];
    const center=mean3(vertices as Vec3[]);
    return d.faceVertices.flatMap((ids,index)=>{
        const visibleIds=clippedSpatialFace(runtime,solid,ids);if(visibleIds.length<3)return [];
        const ps=visibleIds.map(id=>spatialPosition(runtime,id));if(ps.some(p=>!p))return [];
        const points=ps as Vec3[],normal=polygonNormal3(points);if(!normal)return [];
        const faceCenter=mean3(points),outward=dot3(normal,sub3(faceCenter,center))<0?scale3(normal,-1):normal;
        const projected=points.map(p=>transform3(group.orientation,sub3(p,group.pivot)));
        const c=mean3(projected),top=d.kind==='prism'&&index===1;
        return [{solidId:solid.id,polygonId:solid.faces?.[index],faceIndex:index,axis:(index===0||top?2:0) as 0|2,side:(top?1:0) as 0|1,points:projected.map(p=>({x:group.anchor.x+p.x,y:group.anchor.y+p.y})),center:{x:group.anchor.x+c.x,y:group.anchor.y+c.y},depth:c.z,visible:transform3(group.orientation,outward).z>1e-7}];
    });
}
/** Screen drag is constrained to the height axis when locked, and camera plane when unlocked. */
export function resizePolyhedron(runtime:ConstructionRuntime,solidId:string,delta:{x:number;y:number},initialHeight:number,initialOffset:Vec3):void {
    const solid=runtime.solids?.[solidId],d=solid?.polyhedron,g=solid&&runtime.spatialGroups?.[solid.groupId];
    const base=solid&&polyhedronBase(solid,id=>spatialPosition(runtime,id));
    if(!solid||!d||!g||!base)return;
    if(d.rightLocked){
        const screen=transform3(g.orientation,base.normal),n=screen.x**2+screen.y**2;
        if(n<1e-8)return;
        d.height=Math.max(10,initialHeight+(delta.x*screen.x+delta.y*screen.y)/Math.max(.04,n));
    }else{
        const m=g.orientation,world={x:m[0]*delta.x+m[3]*delta.y,y:m[1]*delta.x+m[4]*delta.y,z:m[2]*delta.x+m[5]*delta.y};
        const heightChange=dot3(world,base.normal);
        d.height=Math.max(10,initialHeight+heightChange);
        d.offset=add3(initialOffset,sub3(world,scale3(base.normal,heightChange)));
    }
    syncSpatialGeometry(runtime);
}
export function setSpatialSolidRightLocked(runtime:ConstructionRuntime,solidId:string,locked:boolean):void {
    const d=runtime.solids?.[solidId]?.polyhedron;if(!d)return;
    d.rightLocked=locked;if(locked)d.offset={x:0,y:0,z:0};syncSpatialGeometry(runtime);
}
