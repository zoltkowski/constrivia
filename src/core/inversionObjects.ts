import { addPoint,nextId } from './engineActions';
import { resolveCircleGeometry,resolveInversionCurve,inversionHelperPosition } from './circleGeometry';
import { invertPosition,type Position,type InversionCurve,type InversionHelper } from './inversionGeometry';
import { groupCollections,type GroupSelection } from './objectGroups';
import { lineSubdivisionPointIds,hasIndependentLineDirection } from './lineSubdivision';
import { circlePerimeterPointIdsRuntime } from './engine';
import { resolveAngleDefinition } from './angleDefinition';
import type { ConstructionRuntime,ObjectSymmetry,SymmetryCollection,StrokeStyle,InkPoint } from './runtimeTypes';

const clone=<T>(v:T):T=>v===undefined?v:JSON.parse(JSON.stringify(v));
const noStyle:StrokeStyle={hidden:true};
const geometry=(r:ConstructionRuntime,id:string)=>r.circles[id]?.geometryValid!==false&&r.circles[id]?resolveCircleGeometry(r,r.circles[id]):null;
const member=(r:ConstructionRuntime,batch:string,collection:SymmetryCollection,id:string)=>Object.values(r[collection]).find(p=>p.symmetry?.batch===batch&&p.symmetry.source.collection===collection&&p.symmetry.source.id===id);

export function validateInversionMetadata(r:ConstructionRuntime){
  const isometry=(value:any)=>value&&['point','line'].includes(value.kind)&&typeof value.id==='string';
  const definition=(value:any,region=false)=>value&&value.source&&
    (region?['polygons','circles']:['lines','circles','polygons']).includes(value.source.collection)&&typeof value.source.id==='string'&&typeof value.mirror==='string'&&
    (value.isometry===undefined||isometry(value.isometry))&&
    (value.source.edge===undefined||Array.isArray(value.source.edge)&&value.source.edge.length===2&&value.source.edge.every((id:unknown)=>typeof id==='string'));
  for(const key of groupCollections)for(const object of Object.values(r[key]) as any[]){
    if(object.inversion!==undefined&&!definition(object.inversion))throw new Error('Invalid inversion definition');
    if(object.inversionRegion!==undefined&&!definition(object.inversionRegion,true))throw new Error('Invalid inversion region');
    const h=object.inversionHelper;
    if(h!==undefined&&(!h||('curve' in h?!definition(h.curve)||!['center','radius','lineA','lineB','infinity'].includes(h.role):typeof h.angle!=='string'||typeof h.mirror!=='string'||![1,2].includes(h.arm))))throw new Error('Invalid inversion helper');
  }
}

function imagePoint(r:ConstructionRuntime,source:string,mirror:string,batch:string,hidden=false){
  const old=member(r,batch,'points',source);if(old)return old.id;
  const p=r.points[source],circle=geometry(r,mirror);if(!p||!circle)return null;
  const position=invertPosition(p,circle);
  return addPoint(r,{...(position??{x:0,y:0}),style:{...clone(p.style),...(hidden?{hidden:true}:{})},
    construction_kind:'symmetric',symmetricMeta:{source,mirror:{kind:'circle',id:mirror}},geometryValid:!!position,
    symmetry:{source:{collection:'points',id:source},mirror:{kind:'circle',id:mirror},batch,helper:hidden}});
}

function auxPoint(r:ConstructionRuntime,batch:string,mirror:string,source:ObjectSymmetry['source'],helper:InversionHelper,owner:string){
  const position=inversionHelperPosition(r,helper);
  return addPoint(r,{x:position?.x??0,y:position?.y??0,style:{hidden:true},auxiliaryFor:owner,inversionHelper:helper,
    symmetry:{source,mirror:{kind:'circle',id:mirror},batch,helper:true},geometryValid:!!position});
}

export function createInversionObjects(r:ConstructionRuntime,selected:GroupSelection,mirror:string,helpers:Set<string>):GroupSelection|null {
  if(!geometry(r,mirror))return null;
  const batch=nextId('point',r)+'-inversion';
  const result=Object.fromEntries(groupCollections.map(key=>[key,new Set<string>()])) as GroupSelection;
  for(const id of selected.points){const p=imagePoint(r,id,mirror,batch,helpers.has('points:'+id));if(p)result.points.add(p);}
  const meta=(collection:SymmetryCollection,id:string):ObjectSymmetry=>({source:{collection,id},mirror:{kind:'circle',id:mirror},batch,helper:helpers.has(collection+':'+id)});
  for(const collection of ['lines','circles'] as const)for(const id of selected[collection]){
    const definition:InversionCurve={source:{collection,id},mirror};
    const lineId=nextId('line',r),circleId=nextId('circle',r),symmetry=meta(collection,id);
    const center=auxPoint(r,batch,mirror,symmetry.source,{curve:definition,role:'center'},circleId);
    const a=auxPoint(r,batch,mirror,symmetry.source,{curve:definition,role:'lineA'},lineId);
    const b=auxPoint(r,batch,mirror,symmetry.source,{curve:definition,role:'lineB'},lineId);
    const infinity=auxPoint(r,batch,mirror,symmetry.source,{curve:definition,role:'infinity'},circleId);
    for(const p of [center,a,b,infinity])result.points.add(p);
    r.lines[lineId]={id:lineId,points:[a,b],defining_points:[a,b],style:{},inversion:definition,symmetry:clone(symmetry)};
    r.circles[circleId]={id:circleId,center,points:[],defining_points:[center,center,center],circle_kind:'center-radius',style:{},inversion:definition,symmetry:clone(symmetry)};
    result.lines.add(lineId);result.circles.add(circleId);
    if(collection==='circles'){
      const regionId=nextId('polygon',r);r.polygons[regionId]={id:regionId,points:[],inversionRegion:{source:{collection,id},mirror},symmetry:clone(symmetry)};result.polygons.add(regionId);
    }
  }
  for(const id of selected.polygons){
    const polygonId=nextId('polygon',r),source=r.polygons[id];
    r.polygons[polygonId]={id:polygonId,points:source.points.map(p=>imagePoint(r,p,mirror,batch)!),
      inversionRegion:{source:{collection:'polygons',id},mirror},symmetry:meta('polygons',id)};result.polygons.add(polygonId);
  }
  for(const id of selected.angles){
    const angleId=nextId('angle',r),source=r.angles[id],symmetry=meta('angles',id);
    const a=auxPoint(r,batch,mirror,symmetry.source,{angle:id,mirror,arm:1},angleId);
    const b=auxPoint(r,batch,mirror,symmetry.source,{angle:id,mirror,arm:2},angleId);
    result.points.add(a);result.points.add(b);
    r.angles[angleId]={id:angleId,vertex:imagePoint(r,source.vertex,mirror,batch)!,point1:b,point2:a,style:clone(source.style),symmetry};result.angles.add(angleId);
  }
  for(const key of ['labels','inkStrokes'] as const)for(const id of selected[key]){
    const output=batch+'-'+key+'-'+result[key].size;(r[key] as any)[output]={...clone(r[key][id]),id:output,symmetry:meta(key,id)};result[key].add(output);
  }
  syncInversionObjects(r);
  // Helpers generated for boundaries also belong to the same read-only group.
  for(const p of Object.values(r.points))if(p.symmetry?.batch===batch)result.points.add(p.id);
  if(groupCollections.reduce((n,key)=>n+result[key].size,0)>1){
    r.objectGroups??={};let n=1;while(r.objectGroups['group'+n])n++;
    r.objectGroups['group'+n]={id:'group'+n,locked:true,members:Object.fromEntries(groupCollections.map(key=>[key,[...result[key]]]))};
  }
  return result;
}

function sourceStyle(r:ConstructionRuntime,definition:InversionCurve,p:Position):StrokeStyle {
  const mirror=geometry(r,definition.mirror),q=mirror&&invertPosition(p,mirror);if(!q)return noStyle;
  const source:any=r[definition.source.collection][definition.source.id];if(!source)return noStyle;
  if(source.hidden)return noStyle;
  if(definition.source.collection==='circles'){
    const g=resolveCircleGeometry(r,source);if(!g)return noStyle;
    const ids=circlePerimeterPointIdsRuntime(source.id,r).filter(id=>r.points[id]).sort((a,b)=>Math.atan2(r.points[a].y-g.center.y,r.points[a].x-g.center.x)-Math.atan2(r.points[b].y-g.center.y,r.points[b].x-g.center.x));
    if(ids.length<2)return source.style;
    const angle=Math.atan2(q.y-g.center.y,q.x-g.center.x),tau=2*Math.PI;
    for(let i=0;i<ids.length;i++){
      const a=ids[i],b=ids[(i+1)%ids.length],start=Math.atan2(r.points[a].y-g.center.y,r.points[a].x-g.center.x),end=Math.atan2(r.points[b].y-g.center.y,r.points[b].x-g.center.x);
      if((angle-start+tau)%tau<=(end-start+tau)%tau+1e-9){
        const style=Array.isArray(source.arcStyles)?source.arcStyles[i]:source.arcStyles?.[`${source.id}:${a}:${b}`];
        return{...source.style,...style,hidden:source.style.hidden||style?.hidden};
      }
    }
    return source.style;
  }
  const points=(hasIndependentLineDirection(source)?lineSubdivisionPointIds(source):source.points).map((id:string)=>r.points[id]).filter(Boolean);
  const [a,b]=source.defining_points.map((id:string)=>r.points[id]);if(!a||!b)return noStyle;
  const dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy;
  const t=(p:Position)=>((p.x-a.x)*dx+(p.y-a.y)*dy)/n,value=t(q);
  if(!points.length)return source.style;
  if(value<t(points[0])-1e-9)return source.leftRay??noStyle;
  if(value>t(points[points.length-1])+1e-9)return source.rightRay??noStyle;
  for(let i=1;i<points.length;i++)if(value<=t(points[i])+1e-9)return source.segmentStyles?.[i-1]??source.style;
  return source.style;
}

function labelImage(source:any,mirror:any){
  if(!source.label)return undefined;
  const label=clone(source.label);label.text+='′';
  if(label.offset&&Number.isFinite(source.x+source.y)){
    const a=invertPosition(source,mirror),b=invertPosition({x:source.x+label.offset.x,y:source.y+label.offset.y},mirror);
    if(a&&b)label.offset={x:b.x-a.x,y:b.y-a.y};
  }
  return label;
}

function inverseInk(points:InkPoint[],mirror:NonNullable<ReturnType<typeof geometry>>):InkPoint[]{
  const output:InkPoint[]=[];
  const sample=(a:InkPoint,b:InkPoint,t:number):InkPoint=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,pressure:a.pressure+(b.pressure-a.pressure)*t,time:a.time+(b.time-a.time)*t});
  const push=(p:InkPoint,start=false)=>{const q=invertPosition(p,mirror);if(q&&Math.abs(q.x)+Math.abs(q.y)<1e10)output.push({...p,...q,...(start?{breakBefore:true}:{})});};
  const subdivide=(a:InkPoint,b:InkPoint,depth=0)=>{
    const p=invertPosition(a,mirror),q=invertPosition(b,mirror),m=sample(a,b,.5),v=invertPosition(m,mirror);
    if(!p||!q||!v)return;
    const dx=q.x-p.x,dy=q.y-p.y,n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((v.x-p.x)*dx+(v.y-p.y)*dy)/n)):0;
    const error=Math.hypot(v.x-p.x-t*dx,v.y-p.y-t*dy);
    if(depth<16&&error>.15+Math.sqrt(n)*1e-5){subdivide(a,m,depth+1);subdivide(m,b,depth+1);}else push(b);
  };
  if(points.length===1){push(points[0]);return output;}
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];if(b.breakBefore){push(b,true);continue;}
    const dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy,t=n?((mirror.center.x-a.x)*dx+(mirror.center.y-a.y)*dy)/n:-1;
    const onPole=t>=0&&t<=1&&Math.hypot(a.x+t*dx-mirror.center.x,a.y+t*dy-mirror.center.y)<1e-8;
    if(onPole){
      const gap=Math.max(1e-8,mirror.radius*mirror.radius/(1e7*Math.max(1,Math.sqrt(n))));
      if(t>gap){push(a,output.length===0);subdivide(a,sample(a,b,t-gap));}
      if(t<1-gap){const next=sample(a,b,t+gap);push(next,true);subdivide(next,b);}
    }else{if(!output.length)push(a);subdivide(a,b);}
  }
  return output;
}

export function syncInversionObjects(r:ConstructionRuntime):boolean {
  let changed=false;
  for(const p of Object.values(r.points))if(p.inversionHelper){
    const position=inversionHelperPosition(r,p.inversionHelper);
    if(position){if(Math.hypot(p.x-position.x,p.y-position.y)>1e-8)changed=true;p.x=position.x;p.y=position.y;}
    const meta=p.symmetry,source:any=meta&&r[meta.source.collection][meta.source.id];
    p.geometryValid=!!position&&source?.geometryValid!==false&&!!meta&&!!geometry(r,meta.mirror.id);
  }
  for(const key of groupCollections)for(const image of Object.values(r[key]) as any[]){
    const meta:ObjectSymmetry|undefined=image.symmetry;if(meta?.mirror.kind!=='circle'||image.inversionHelper)continue;
    const source:any=r[meta.source.collection][meta.source.id],mirror=geometry(r,meta.mirror.id);
    if(!source||!mirror){image.geometryValid=false;if(key==='labels'||key==='inkStrokes')image.hidden=true;continue;}
    if(key==='points'){
      const p=invertPosition(source,mirror);if(p){if(Math.hypot(image.x-p.x,image.y-p.y)>1e-8)changed=true;Object.assign(image,p);}
      image.geometryValid=!!p&&source.geometryValid!==false;image.style=clone(source.style);if(meta.helper||source.auxiliaryFor)image.style.hidden=true;
      image.label=labelImage(source,mirror);image.hidden=source.hidden;image.spatialHiddenPoint=source.spatialHiddenPoint;continue;
    }
    if(image.inversion){
      const g=resolveInversionCurve(r,image.inversion);image.geometryValid=!!g&&g.kind===(key==='lines'?'line':'circle')&&source.geometryValid!==false;
      image.hidden=source.hidden||meta.helper;image.style=clone(source.style);delete image.fill;delete image.fillOpacity;
      if(!image.geometryValid||!g)continue;
      const boundary=(meta.source.collection==='circles'?circlePerimeterPointIdsRuntime(source.id,r):[...source.points,...source.defining_points]) as string[];
      const ids:string[]=[];
      for(const id of boundary){
        const p=r.points[id],q=p&&invertPosition(p,mirror);if(!q)continue;
        const before=Object.keys(r.points).length,output=imagePoint(r,id,meta.mirror.id,meta.batch,!!p.auxiliaryFor);
        if(Object.keys(r.points).length!==before)changed=true;
        if(output&&!ids.some(old=>Math.hypot(r.points[old].x-q.x,r.points[old].y-q.y)<1e-7))ids.push(output);
      }
      if(g.kind==='circle'){
        const infinity=Object.values(r.points).find(p=>p.symmetry?.batch===meta.batch&&p.auxiliaryFor===image.id&&p.inversionHelper&&'curve' in p.inversionHelper&&p.inversionHelper.role==='infinity');
        if(meta.source.collection==='lines'&&infinity&&!ids.some(id=>Math.hypot(r.points[id].x-infinity.x,r.points[id].y-infinity.y)<1e-7))ids.push(infinity.id);
        image.points=ids;image.radius_point=undefined;image.arcStyles={};
        const sorted=ids.slice().sort((a,b)=>Math.atan2(r.points[a].y-g.center.y,r.points[a].x-g.center.x)-Math.atan2(r.points[b].y-g.center.y,r.points[b].x-g.center.x));
        if(sorted.length<2)image.style={...sourceStyle(r,image.inversion,{x:g.center.x+g.radius*Math.cos(.37),y:g.center.y+g.radius*Math.sin(.37)})};
        else for(let i=0;i<sorted.length;i++){
          const a=sorted[i],b=sorted[(i+1)%sorted.length],start=Math.atan2(r.points[a].y-g.center.y,r.points[a].x-g.center.x),end=Math.atan2(r.points[b].y-g.center.y,r.points[b].x-g.center.x);
          const angle=start+((end-start+2*Math.PI)%(2*Math.PI))/2;
          image.arcStyles[`${image.id}:${a}:${b}`]=clone(sourceStyle(r,image.inversion,{x:g.center.x+g.radius*Math.cos(angle),y:g.center.y+g.radius*Math.sin(angle)}));
        }
      }else{
        for(const id of image.defining_points)if(!ids.includes(id))ids.push(id);
        const t=(id:string)=>(r.points[id].x-g.origin.x)*g.direction.x+(r.points[id].y-g.origin.y)*g.direction.y;
        ids.sort((a,b)=>t(a)-t(b));image.points=ids;image.segmentStyles=[];
        for(let i=1;i<ids.length;i++)image.segmentStyles.push(clone(sourceStyle(r,image.inversion,{x:(r.points[ids[i-1]].x+r.points[ids[i]].x)/2,y:(r.points[ids[i-1]].y+r.points[ids[i]].y)/2})));
        const span=Math.max(1,mirror.radius,...ids.map(id=>Math.abs(t(id))))*4;
        const first=r.points[ids[0]],last=r.points[ids[ids.length-1]];
        image.leftRay=clone(sourceStyle(r,image.inversion,{x:first.x-g.direction.x*span,y:first.y-g.direction.y*span}));
        image.rightRay=clone(sourceStyle(r,image.inversion,{x:last.x+g.direction.x*span,y:last.y+g.direction.y*span}));
        image.segmentKeys=ids.slice(1).map((id,i)=>[ids[i],id].sort().join('-'));
      }
    }else if(key==='polygons'){
      image.fill=source.fill;image.fillOpacity=source.fillOpacity;image.hidden=source.hidden||!source.fill||!(source.fillOpacity??1);
      image.geometryValid=source.geometryValid!==false;
    }else if(key==='angles'){
      image.style=clone(source.style);image.hidden=source.hidden;image.label=labelImage(source,mirror);
    }else if(key==='labels'){
      const p=invertPosition(source.pos,mirror);image.pos=p??image.pos;image.text=source.text;image.textStyles=clone(source.textStyles);image.fontSize=source.fontSize;image.color=source.color;image.hidden=source.hidden||!p;delete image.measurement;
    }else if(key==='inkStrokes'){
      image.points=inverseInk(source.points,mirror);image.color=source.color;image.baseWidth=source.baseWidth;image.opacity=source.opacity;image.hidden=source.hidden||!image.points.length;
    }
  }
  return changed;
}
