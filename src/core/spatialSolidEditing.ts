import { canDeformSpatialBaseVertex } from './spatialPointMobility';
import type { ConstructionRuntime } from './runtimeTypes';
import type { Cuboid, Vec3 } from './spatialTypes';
import { spatialPosition, syncSpatialGeometry, transform3,addSpatialEdgePoint } from './spatialGeometry';
import { polyhedronBase, resizePolyhedron } from './polyhedronGeometry';
import { add3, sub3, scale3, dot3, norm3, mean3, convexPolygon3,cross3,polygonNormal3 } from './spatialMath';

/** Retain the source definitions for existing dependants, consume their presentation. */
export function consumeSpatialBase(runtime:ConstructionRuntime,polygonId:string):void {
    const polygon=runtime.polygons[polygonId];if(!polygon)return;
    polygon.hidden=true;
    if(polygon.spatialGroupId)return;
    const edges=Object.values(runtime.lines).filter(l=>polygon.points.some((a,i)=>{
        const b=polygon.points[(i+1)%polygon.points.length];
        return l.defining_points.length===2&&l.defining_points.includes(a)&&l.defining_points.includes(b);
    }));
    for(const line of edges){
        if(!Object.values(runtime.polygons).some(p=>p.id!==polygonId&&!p.hidden&&line.defining_points.every(id=>p.points.includes(id))))line.hidden=true;
    }
    for(const id of polygon.points){
        const used=Object.values(runtime.lines).some(l=>!l.hidden&&l.points.includes(id))
            ||Object.values(runtime.polygons).some(p=>p.id!==polygonId&&!p.hidden&&p.points.includes(id))
            ||Object.values(runtime.circles).some(c=>!c.hidden&&(c.center===id||c.radius_point===id||c.points?.includes(id)))
            ||Object.values(runtime.angles).some(a=>!a.hidden&&[a.vertex,a.point1,a.point2].includes(id));
        if(!used)runtime.points[id].style={...runtime.points[id].style,hidden:true};
    }
}
function makeEditable(runtime:ConstructionRuntime,solid:Cuboid):void {
    if(solid.polyhedron)return;
    if(solid.originPointId)return;
    const legacy=[...solid.vertices],order=[0,1,3,2,4,5,7,6],ids=order.map(i=>solid.vertices[i]),positions=ids.map(id=>spatialPosition(runtime,id));
    if(positions.some(p=>!p))return;
    const base=positions.slice(0,4) as Vec3[],extrusion=sub3(positions[4]!,base[0]),height=norm3(extrusion);
    if(height<1e-8)return;
    solid.vertices=ids;
    for(let i=0;i<4;i++)runtime.points[ids[i]].spatial!.binding={kind:'position',position:{...base[i]}};
    for(let i=4;i<8;i++)runtime.points[ids[i]].spatial!.binding={kind:'vertex',solidId:solid.id,vertex:i};
    solid.polyhedron={kind:'prism',basePoints:ids.slice(0,4),normal:scale3(extrusion,1/height),normalSign:1,height,offset:{x:0,y:0,z:0},rightLocked:true,faceVertices:[]};
    // Keep the original face ids and their corner order, including user styles.
    const originalFaces=new Map((solid.faces??[]).map((id,i)=>{const axis=Math.floor(i/2),side=i%2,others=[0,1,2].filter(a=>a!==axis),base=side<<axis;return[id,runtime.polygons[id]?.points??[base,base|(1<<others[0]),base|(1<<others[0])|(1<<others[1]),base|(1<<others[1])].map(index=>legacy[index])];}));
    const baseIds=ids.slice(0,4),score=(id:string)=>{const ps=originalFaces.get(id)??[];return ps.every(id=>baseIds.includes(id))?0:ps.every(id=>!baseIds.includes(id))?1:2;};
    solid.faces=[...(solid.faces??[])].sort((a,b)=>score(a)-score(b));
    solid.polyhedron.faceVertices=solid.faces.map(id=>[...originalFaces.get(id)!]);
    for(let i=0;i<solid.faces.length;i++){const p=runtime.polygons[solid.faces[i]];if(p?.solidFace)p.solidFace={...p.solidFace,index:i,axis:i<2?2:0,side:i===1?1:0};}
}
export function setSpatialSolidShapeLocked(runtime:ConstructionRuntime,id:string,locked:boolean):void {
    const solid=runtime.solids?.[id];if(!solid)return;
    if(!locked)makeEditable(runtime,solid);
    solid.shapeLocked=locked;syncSpatialGeometry(runtime);
}
export function setSpatialSolidTiltLocked(runtime:ConstructionRuntime,id:string,locked:boolean):void {
    const solid=runtime.solids?.[id];if(!solid)return;
    makeEditable(runtime,solid);if(!solid.polyhedron)return;
    solid.polyhedron.rightLocked=locked;syncSpatialGeometry(runtime);
}
export function setSpatialSolidHeightLocked(runtime:ConstructionRuntime,id:string,locked:boolean):void {
    const solid=runtime.solids?.[id];if(solid)solid.heightLocked=locked;
}
function updateBase(runtime:ConstructionRuntime,solid:Cuboid,positions:Vec3[]):boolean {
    const d=solid.polyhedron!;
    if(!convexPolygon3(positions)||d.basePoints.some(id=>runtime.points[id]?.spatial?.binding.kind!=='position'))return false;
    positions.forEach((position,i)=>{runtime.points[d.basePoints[i]].spatial!.binding={kind:'position',position};});return true;
}
export function deformSpatialVertex(runtime:ConstructionRuntime,solidId:string,pointId:string,delta:{x:number;y:number},initial:ConstructionRuntime):boolean {
    const solid=runtime.solids?.[solidId],start=initial.solids?.[solidId];if(!solid||!start||!canDeformSpatialBaseVertex(runtime,solidId,pointId))return false;
    const d=solid.polyhedron;if(!d||!d.basePoints.includes(pointId))return false;
    const base=polyhedronBase(start,id=>spatialPosition(initial,id));if(!base)return false;
    const u=scale3(sub3(base.points[1],base.points[0]),1/norm3(sub3(base.points[1],base.points[0]))),v=cross3(base.normal,u),orientation=runtime.spatialGroups![solid.groupId].orientation;
    const su=transform3(orientation,u),sv=transform3(orientation,v),det=su.x*sv.y-su.y*sv.x;
    if(Math.abs(det)<1e-5)return false;
    const tangent=add3(scale3(u,(delta.x*sv.y-delta.y*sv.x)/det),scale3(v,(su.x*delta.y-su.y*delta.x)/det));
    const ps=base.points.map((p,i)=>d.basePoints[i]===pointId?add3(p,tangent):p);
    if(!updateBase(runtime,solid,ps))return false;syncSpatialGeometry(runtime);return true;
}
export function deformSpatialFace(runtime:ConstructionRuntime,solidId:string,faceIndex:number|undefined,axis:0|1|2,side:0|1,delta:{x:number;y:number},initial:ConstructionRuntime):boolean {
    const solid=runtime.solids?.[solidId],start=initial.solids?.[solidId],d=solid?.polyhedron;if(!solid||!start||!d||!start.polyhedron)return false;
    const ps=faceIndex===undefined?null:d.faceVertices[faceIndex],base=polyhedronBase(start,id=>spatialPosition(initial,id));if(!ps||!base)return false;
    const top=d.kind==='prism'&&ps.every(id=>!d.basePoints.includes(id));
    if(top){
        const before=JSON.stringify([d.height,d.offset]);
        resizePolyhedron(runtime,solidId,delta,start.polyhedron.height,{...start.polyhedron.offset});
        return JSON.stringify([d.height,d.offset])!==before;
    }
    // The lower base anchors the solid; only the top face changes its height.
    if(ps.every(id=>d.basePoints.includes(id)))return false;
    if(solid.shapeLocked!==false)return false;
    const members=ps.filter(id=>d.basePoints.includes(id));if(members.length!==2)return false;
    const a=base.points[d.basePoints.indexOf(members[0])],b=base.points[d.basePoints.indexOf(members[1])];
    const edge=sub3(b,a),direction={x:edge.y*base.normal.z-edge.z*base.normal.y,y:edge.z*base.normal.x-edge.x*base.normal.z,z:edge.x*base.normal.y-edge.y*base.normal.x};
    const screen=transform3(runtime.spatialGroups![solid.groupId].orientation,direction),n=screen.x**2+screen.y**2;if(n<1e-8)return false;
    const shift=scale3(direction,(delta.x*screen.x+delta.y*screen.y)/Math.max(1e-8,n));
    if(!updateBase(runtime,solid,base.points.map((p,i)=>members.includes(d.basePoints[i])?add3(p,shift):p)))return false;
    syncSpatialGeometry(runtime);return true;
}
export function pyramidCutSection(runtime:ConstructionRuntime,solid:Cuboid):string|null {
    if(solid.polyhedron?.kind!=='pyramid')return null;
    const base=polyhedronBase(solid,id=>spatialPosition(runtime,id));if(!base)return null;
    const candidates=Object.values(runtime.polygons).filter(p=>p.spatialSection?.solidId===solid.id&&p.geometryValid!==false&&p.points.length>=3).map(p=>{
        const ps=p.points.map(id=>spatialPosition(runtime,id));if(ps.some(p=>!p))return null;
        const hs=ps.map(p=>dot3(sub3(p!,base.center),base.normal)),h=hs.reduce((s,n)=>s+n,0)/hs.length;
        return h>1e-6&&h<solid.polyhedron!.height-1e-6&&hs.every(v=>Math.abs(v-h)<1e-6*Math.max(1,solid.polyhedron!.height))?{id:p.id,height:h}:null;
    }).filter((p):p is {id:string;height:number}=>!!p).sort((a,b)=>b.height-a.height);
    return candidates[0]?.id??null;
}
/** Orient a valid cutting plane away from the intact lower base. */
const cutBaseIds=(solid:Cuboid)=>solid.polyhedron?.basePoints??[0,1,3,2].map(i=>solid.vertices[i]);
export const solidCutIds=(solid:Cuboid):string[]=>solid.cutSectionIds??(solid.cutSectionId?[solid.cutSectionId]:[]);
const sectionSourcePoints=(runtime:ConstructionRuntime,id:string)=>runtime.polygons[id]?.spatialSection?.sourcePoints??runtime.polygons[id]?.points??[];
function solidCutPlane(runtime:ConstructionRuntime,solid:Cuboid,sectionId:string) {
    const section=runtime.polygons[sectionId],baseIds=cutBaseIds(solid);
    const source=sectionSourcePoints(runtime,sectionId);
    if(section?.spatialSection?.solidId!==solid.id||(section.spatialSection.sourceValid??(section.geometryValid!==false))===false||source.length<3)return null;
    const positions=source.map(id=>spatialPosition(runtime,id));if(positions.some(p=>!p))return null;
    const normal=polygonNormal3(positions as Vec3[]);if(!normal)return null;
    const base=baseIds.map(id=>spatialPosition(runtime,id));if(base.some(p=>!p))return null;
    const origin=positions[0]!,center=mean3(base as Vec3[]);
    const outward=dot3(sub3(center,origin),normal)>0?scale3(normal,-1):normal;
    const distance=(id:string)=>{const p=spatialPosition(runtime,id);return p?dot3(sub3(p,origin),outward):Infinity;};
    // A cut may not touch or remove any part of the original base.
    if(!baseIds.every(id=>distance(id)<-1e-7))return null;
    return {origin,normal:outward,distance};
}
export function spatialVertexCut(runtime:ConstructionRuntime,pointId:string):{solidId:string;sectionId:string}|null {
    for(const solid of Object.values(runtime.solids??{})){
        const baseIds=cutBaseIds(solid);
        if(!spatialCutFaces(runtime,solid).some(face=>face.points.includes(pointId))||baseIds.includes(pointId))continue;
        const ps=baseIds.map(id=>spatialPosition(runtime,id));if(ps.some(p=>!p))continue;
        const baseNormal=polygonNormal3(ps as Vec3[]);if(!baseNormal)continue;
        const top=spatialPosition(runtime,solid.vertices.find(id=>!baseIds.includes(id))!);if(!top)continue;
        const normal=dot3(sub3(top,ps[0]!),baseNormal)>0?baseNormal:scale3(baseNormal,-1);
        const sections=Object.values(runtime.polygons).filter(p=>p.spatialSection?.solidId===solid.id&&!solidCutIds(solid).includes(p.id))
            .map(section=>({section,plane:solidCutPlane(runtime,solid,section.id)}))
            .filter(candidate=>candidate.plane&&candidate.plane.distance(pointId)>1e-7)
            .sort((a,b)=>dot3(sub3(b.plane!.origin,a.plane!.origin),normal));
        if(sections[0])return {solidId:solid.id,sectionId:sections[0].section.id};
    }
    return null;
}
function clipFaceAtSection(runtime:ConstructionRuntime,solid:Cuboid,ids:string[],sectionId:string):string[] {
    const section=runtime.polygons[sectionId],cut=solidCutPlane(runtime,solid,sectionId);
    if(!section||!cut)return ids.every(id=>cutBaseIds(solid).includes(id))?ids:[];
    const source=sectionSourcePoints(runtime,sectionId);
    const result:string[]=[];
    for(let i=0;i<ids.length;i++){
        const a=ids[i],b=ids[(i+1)%ids.length],ha=cut.distance(a),hb=cut.distance(b),insideA=ha<=1e-7,insideB=hb<=1e-7;
        if(insideA)result.push(a);
        if(insideA!==insideB){
            const pa=spatialPosition(runtime,a)!,pb=spatialPosition(runtime,b)!,p=add3(pa,scale3(sub3(pb,pa),ha/(ha-hb)));
            const vertex=source.find(id=>{const q=spatialPosition(runtime,id);return q&&norm3(sub3(q,p))<1e-6;});if(vertex)result.push(vertex);
        }
    }
    return [...new Set(result)];
}
/** The current closed boundary, rather than the original primitive behind it. */
export function spatialCutFaces(runtime:ConstructionRuntime,solid:Cuboid,cuts=solidCutIds(solid)):{polygonId:string;points:string[]}[] {
    let faces=(solid.faces??[]).map((polygonId,index)=>{
        if(solid.polyhedron)return {polygonId,points:[...solid.polyhedron.faceVertices[index]]};
        const axis=Math.floor(index/2),side=index%2,other=[0,1,2].filter(a=>a!==axis),base=side<<axis;
        return {polygonId,points:[base,base|(1<<other[0]),base|(1<<other[0])|(1<<other[1]),base|(1<<other[1])].map(i=>solid.vertices[i])};
    });
    for(const id of cuts){
        faces=faces.map(face=>({...face,points:clipFaceAtSection(runtime,solid,face.points,id)})).filter(face=>face.points.length>=3);
        faces.push({polygonId:id,points:[...sectionSourcePoints(runtime,id)]});
    }
    return faces;
}
/** Keep source vertices for dependencies while displaying all successive cuts. */
export function clippedSpatialFace(runtime:ConstructionRuntime,solid:Cuboid,ids:string[]):string[] {
    const d=solid.polyhedron,baseIds=cutBaseIds(solid);
    const apex=d?.kind==='pyramid'?runtime.points[solid.vertices[d.basePoints.length]]:null;
    // Hiding every vertex is a visibility action, not a request to cut off the apex.
    // An already established cut remains active when its remaining vertices are hidden.
    if(d?.kind==='pyramid'&&apex?.style.hidden){
        if(solid.hiddenApexSectionId||d.basePoints.some(id=>!runtime.points[id]?.style.hidden)){
            const candidate=pyramidCutSection(runtime,solid);if(candidate)solid.hiddenApexSectionId=candidate;
        }
    }else delete solid.hiddenApexSectionId;
    const cuts=solidCutIds(solid);
    if(!cuts.length&&d?.kind==='pyramid'&&apex?.style.hidden&&solid.hiddenApexSectionId)cuts.push(solid.hiddenApexSectionId);
    return cuts.reduce((points,id)=>clipFaceAtSection(runtime,solid,points,id),ids);
}
export function truncatePyramidAtSection(runtime:ConstructionRuntime,solidId:string,sectionId?:string):boolean {
    const solid=runtime.solids?.[solidId];if(solid?.polyhedron?.kind!=='pyramid')return false;
    const pointId=solid.vertices[solid.polyhedron.basePoints.length];
    const id=sectionId??pyramidCutSection(runtime,solid);
    return !!id&&truncateSpatialSolidAtSection(runtime,solidId,id,pointId);
}
export function truncateSpatialSolidAtSection(runtime:ConstructionRuntime,solidId:string,id:string,pointId:string):boolean {
    const solid=runtime.solids?.[solidId];if(!solid||solidCutIds(solid).includes(id)||!spatialCutFaces(runtime,solid).some(face=>face.points.includes(pointId))||cutBaseIds(solid).includes(pointId))return false;
    const cut=solidCutPlane(runtime,solid,id);if(!cut||cut.distance(pointId)<=1e-7)return false;
    const section=runtime.polygons[id];
    const before=spatialCutFaces(runtime,solid),prior=[...solidCutIds(solid)];
    section.spatialSection!.priorCuts=prior;
    syncSpatialGeometry(runtime);
    solid.cutSectionIds=[...prior,id];
    solid.cutSectionId=id;
    section.hidden=false;
    const removed=[...new Set(before.flatMap(face=>face.points))].filter(id=>cut.distance(id)>1e-7);
    for(const vertex of removed){const p=runtime.points[vertex];p.style={...p.style,hidden:true};}
    const related=Object.values(runtime.lines).filter(l=>l.defining_points.some(id=>removed.includes(id))&&(!l.leftRay||l.leftRay.hidden)&&(!l.rightRay||l.rightRay.hidden)&&!Object.values(runtime.solids??{}).some(other=>other.id!==solid.id&&other.edges.includes(l.id)));
    const capEdges=prior.flatMap(id=>Object.values(runtime.polygons[id]?.spatialSection?.edgeLines??{}));
    for(const lineId of new Set([...solid.edges,...capEdges,...related.map(l=>l.id)])){const line=runtime.lines[lineId];if(!line)continue;
        const [a,b]=line.defining_points.map(id=>spatialPosition(runtime,id));
        if(a&&b){const da=cut.distance(line.defining_points[0]),db=cut.distance(line.defining_points[1]);
            if(da*db<0&&!line.points.some(id=>Math.abs(cut.distance(id))<1e-7)){
                const point=addSpatialEdgePoint(runtime,...line.defining_points,da/(da-db),lineId);
                if(point)runtime.points[point].spatial!.binding={kind:'sectionEdge',sectionId:id,endpoints:[...line.defining_points]};
            }
        }
        line.segmentStyles=line.points.slice(0,-1).map((pointId,i)=>{
            const a=spatialPosition(runtime,pointId),b=spatialPosition(runtime,line.points[i+1]),style={...line.segmentStyles?.[i]??line.style};
            if(a&&b&&dot3(sub3(mean3([a,b]),cut.origin),cut.normal)>1e-7)style.hidden=true;return style;
        });
        for(const id of line.points)if(cut.distance(id)>1e-7){const p=runtime.points[id];p.style={...p.style,hidden:true};}
    }
    syncSpatialGeometry(runtime);return true;
}
