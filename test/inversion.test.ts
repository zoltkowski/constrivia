import {describe,it,expect} from 'vitest';
import {makeEmptyRuntime} from '../src/core/runtimeTypes';
import {invertPosition,invertGeneralizedCircle} from '../src/core/inversionGeometry';
import {createObjectSymmetry,syncObjectSymmetries} from '../src/core/objectSymmetry';
import {resolveCircleGeometry,resolveInversionCurve} from '../src/core/circleGeometry';
import {recomputeAllRuntime} from '../src/core/runtimeRecompute';
import {createConstructionClipboard,pasteConstructionClipboard} from '../src/core/constructionClipboard';
import {inversionRegionContains,inversionRegionBoundaries} from '../src/core/inversionRegion';
import {resolveAngleDefinition} from '../src/core/angleDefinition';
import {toEngineState,applyEngineState} from '../src/core/engineAdapter';
import {movePointAndRecompute} from '../src/core/engineCompute';

function setup(){
  const r=makeEmptyRuntime();r.points={O:{id:'O',x:0,y:0,style:{}},R:{id:'R',x:10,y:0,style:{}},A:{id:'A',x:20,y:10,style:{}},B:{id:'B',x:20,y:30,style:{}},C:{id:'C',x:35,y:5,style:{}}};
  r.circles.m={id:'m',center:'O',radius_point:'R',points:[],defining_points:['O','R','R'],circle_kind:'center-radius',style:{color:'#aaa'}};
  r.lines.l={id:'l',points:['A','B'],defining_points:['A','B'],style:{color:'#f00',width:2},leftRay:{hidden:true},rightRay:{hidden:true}};
  recomputeAllRuntime(r);return r;
}
const mirror={kind:'circle' as const,id:'m'};
const outputPoint=(r:ReturnType<typeof setup>,id:string)=>Object.values(r.points).find(p=>p.symmetricMeta?.source===id)!;
const close=(p:{x:number;y:number},q:{x:number;y:number})=>{expect(p.x).toBeCloseTo(q.x,7);expect(p.y).toBeCloseTo(q.y,7);};

describe('circle inversion',()=>{
  it('preserves rays and the reciprocal distance law, fixes the mirror, and is involutive',()=>{
    const m={center:{x:12,y:-5},radius:7};
    for(const p of [{x:20,y:15},{x:12,y:-4},{x:100,y:-5},{x:19,y:-5}]){
      const q=invertPosition(p,m)!;
      expect(Math.hypot(p.x-m.center.x,p.y-m.center.y)*Math.hypot(q.x-m.center.x,q.y-m.center.y)).toBeCloseTo(49,8);
      expect((p.x-m.center.x)*(q.y-m.center.y)-(p.y-m.center.y)*(q.x-m.center.x)).toBeCloseTo(0,8);
      close(invertPosition(q,m)!,p);
    }
    expect(invertPosition(m.center,m)).toBeNull();
  });

  it('computes the exact supporting circle of an inverted line',()=>{
    const g=invertGeneralizedCircle({kind:'line',origin:{x:20,y:10},direction:{x:0,y:1}},{center:{x:0,y:0},radius:10});
    expect(g).toEqual({kind:'circle',center:{x:2.5,y:0},radius:2.5});
  });

  it('keeps point images dependent, read-only and recoverable at the inversion center',()=>{
    const r=setup(),ids=createObjectSymmetry(r,{collection:'points',id:'A'},mirror)!;recomputeAllRuntime(r);
    const id=[...ids.points][0];close(r.points[id],{x:4,y:2});
    const engine=toEngineState(r);movePointAndRecompute(engine,id,{x:900,y:900});applyEngineState(r,engine);close(r.points[id],{x:4,y:2});
    r.points.A.x=0;r.points.A.y=0;recomputeAllRuntime(r);expect(r.points[id].geometryValid).toBe(false);
    r.points.A.x=20;recomputeAllRuntime(r);expect(r.points[id].geometryValid).toBe(true);close(r.points[id],{x:5,y:0});
    r.points.R.x=20;recomputeAllRuntime(r);close(r.points[id],{x:20,y:0});
  });

  it('creates a circular arc for a segment and retains its complementary hidden arcs',()=>{
    const r=setup(),ids=createObjectSymmetry(r,{collection:'lines',id:'l'},mirror)!;recomputeAllRuntime(r);
    const circle=r.circles[[...ids.circles][0]],line=r.lines[[...ids.lines][0]],g=resolveCircleGeometry(r,circle)!;
    expect(circle.geometryValid).toBe(true);expect(line.geometryValid).toBe(false);close(g.center,{x:2.5,y:0});expect(g.radius).toBeCloseTo(2.5);
    close(outputPoint(r,'A'),{x:4,y:2});
    const styles=Object.values(circle.arcStyles!);expect(styles.some(s=>!s.hidden)).toBe(true);expect(styles.some(s=>s.hidden)).toBe(true);
    for(const [key,style] of Object.entries(circle.arcStyles!))if(!style.hidden){
      const [,a,b]=key.split(':'),pa=r.points[a],pb=r.points[b],start=Math.atan2(pa.y-g.center.y,pa.x-g.center.x),end=Math.atan2(pb.y-g.center.y,pb.x-g.center.x),angle=start+((end-start+Math.PI*2)%(Math.PI*2))/2;
      const q=invertPosition({x:g.center.x+g.radius*Math.cos(angle),y:g.center.y+g.radius*Math.sin(angle)},resolveCircleGeometry(r,r.circles.m)!)!;
      expect(q.x).toBeCloseTo(20,7);expect(q.y).toBeGreaterThanOrEqual(10-1e-6);expect(q.y).toBeLessThanOrEqual(30+1e-6);
    }
  });

  it('keeps the infinity helper separate from the original inversion center',()=>{
    const r=setup(),original=JSON.parse(JSON.stringify(r.points.O));
    const ids=createObjectSymmetry(r,{collection:'lines',id:'l'},mirror)!;recomputeAllRuntime(r);
    expect(r.points.O).toEqual(original);expect(ids.points.has('O')).toBe(false);
    expect(Object.entries(r.points).every(([id,p])=>id===p.id)).toBe(true);
    r.points.A.x=25;r.points.A.y=8;recomputeAllRuntime(r);
    close(outputPoint(r,'A'),invertPosition(r.points.A,resolveCircleGeometry(r,r.circles.m)!)!);
    expect(r.points.O).toEqual(original);
  });

  it('turns a segment through the center into two rays without connecting across infinity',()=>{
    const r=setup();r.points.A={...r.points.A,x:-20,y:0};r.points.B={...r.points.B,x:20,y:0};recomputeAllRuntime(r);
    const ids=createObjectSymmetry(r,{collection:'lines',id:'l'},mirror)!;recomputeAllRuntime(r);
    const line=r.lines[[...ids.lines][0]];expect(line.geometryValid).toBe(true);expect(r.circles[[...ids.circles][0]].geometryValid).toBe(false);
    expect(line.leftRay?.hidden).toBeFalsy();expect(line.rightRay?.hidden).toBeFalsy();
    const gap=line.points.findIndex((id,i)=>i<line.points.length-1&&r.points[id].x<0&&r.points[line.points[i+1]].x>0);
    expect(gap).toBeGreaterThanOrEqual(0);expect(line.segmentStyles![gap].hidden).toBe(true);
  });

  it('switches a circle through the center to a line and recovers its circular image',()=>{
    const r=setup();r.points.S={id:'S',x:5,y:0,style:{}};r.points.T={id:'T',x:10,y:0,style:{}};
    r.circles.s={id:'s',center:'S',radius_point:'T',points:[],defining_points:['S','T','T'],style:{},fill:'#0f0',fillOpacity:.2};recomputeAllRuntime(r);
    const ids=createObjectSymmetry(r,{collection:'circles',id:'s'},mirror)!;recomputeAllRuntime(r);
    const lineId=[...ids.lines][0],circleId=[...ids.circles][0],region=r.polygons[[...ids.polygons][0]].inversionRegion!;
    expect(r.lines[lineId].geometryValid).toBe(true);expect(r.circles[circleId].geometryValid).toBe(false);
    for(const id of r.lines[lineId].defining_points)expect(r.points[id].x).toBeCloseTo(10,7);
    expect(inversionRegionContains(r,region,{x:20,y:0})).toBe(true);expect(inversionRegionContains(r,region,{x:5,y:0})).toBe(false);
    r.points.S.x=6;r.points.T.x=11;recomputeAllRuntime(r);
    expect(r.lines[lineId].geometryValid).toBe(false);expect(r.circles[circleId].geometryValid).toBe(true);
    expect(resolveCircleGeometry(r,r.circles[circleId])!.radius).toBeCloseTo(500/11,7);
    r.points.S.x=5;r.points.T.x=10;recomputeAllRuntime(r);expect(r.lines[lineId].geometryValid).toBe(true);
  });

  it('keeps polygon interiors and exteriors correct instead of connecting inverted vertices by chords',()=>{
    const r=setup();r.polygons.p={id:'p',points:['A','B','C'],fill:'#00f',fillOpacity:.2};
    const ids=createObjectSymmetry(r,{collection:'polygons',id:'p'},mirror)!;recomputeAllRuntime(r);
    const region=r.polygons[[...ids.polygons][0]].inversionRegion!,m=resolveCircleGeometry(r,r.circles.m)!;
    expect(inversionRegionContains(r,region,invertPosition({x:25,y:15},m)!)).toBe(true);
    expect(inversionRegionContains(r,region,invertPosition({x:0,y:5},m)!)).toBe(false);
    expect(inversionRegionBoundaries(r,region).every(b=>b.geometry.kind==='circle')).toBe(true);
    r.points.A={...r.points.A,x:-20,y:-20};r.points.B={...r.points.B,x:20,y:-20};r.points.C={...r.points.C,x:0,y:20};recomputeAllRuntime(r);
    expect(inversionRegionContains(r,region,{x:10000,y:10000})).toBe(true);expect(inversionRegionContains(r,region,{x:.1,y:.1})).toBe(false);
  });

  it('transforms angles by their tangents, rather than chords to inverted arm points',()=>{
    const r=setup();r.angles.a={id:'a',vertex:'A',point1:'B',point2:'C',style:{}};
    const before=resolveAngleDefinition(r,r.angles.a)!;
    const ids=createObjectSymmetry(r,{collection:'angles',id:'a'},mirror)!;recomputeAllRuntime(r);
    const after=resolveAngleDefinition(r,r.angles[[...ids.angles][0]])!;
    const cosine=(g:typeof before)=>{const a={x:g.p1.x-g.v.x,y:g.p1.y-g.v.y},b={x:g.p2.x-g.v.x,y:g.p2.y-g.v.y};return(a.x*b.x+a.y*b.y)/Math.hypot(a.x,a.y)/Math.hypot(b.x,b.y);};
    expect(cosine(after)).toBeCloseTo(cosine(before),7);
  });

  it('copies complete inversion dependencies into an independent document',()=>{
    const r=setup(),ids=createObjectSymmetry(r,{collection:'lines',id:'l'},mirror)!;recomputeAllRuntime(r);
    const doc=createConstructionClipboard(r,ids),destination=makeEmptyRuntime(),maps=pasteConstructionClipboard(destination,doc,20)!;
    expect(maps).not.toBeNull();recomputeAllRuntime(destination);
    const circle=destination.circles[maps.circles.get([...ids.circles][0])!];expect(circle.geometryValid).toBe(true);
    expect(circle.inversion!.mirror).toBe(maps.circles.get('m'));expect(circle.inversion!.source.id).toBe(maps.lines.get('l'));
    const restored=JSON.parse(JSON.stringify(destination));recomputeAllRuntime(restored);expect(restored.circles[circle.id].geometryValid).toBe(true);
    destination.points[maps.points.get('A')!].x+=5;recomputeAllRuntime(destination);expect(destination.circles[circle.id].geometryValid).toBe(true);
  });

  it('inverts mixed groups including curved handwriting and text without a bridge across the pole',()=>{
    const r=setup();r.labels.text={id:'text',text:'Opis',pos:{x:20,y:0}};
    r.inkStrokes.ink={id:'ink',color:'#f00',baseWidth:2,points:[{x:-20,y:0,pressure:.5,time:0},{x:20,y:0,pressure:.5,time:1}]};
    r.objectGroups={g:{id:'g',members:{points:['A','B'],lines:['l'],labels:['text'],inkStrokes:['ink']}}};
    const ids=createObjectSymmetry(r,{collection:'lines',id:'l'},mirror)!;recomputeAllRuntime(r);
    close(r.labels[[...ids.labels][0]].pos,{x:5,y:0});const stroke=r.inkStrokes[[...ids.inkStrokes][0]];
    expect(stroke.points.some((p,i)=>i>0&&p.breakBefore)).toBe(true);expect(stroke.points.every(p=>Number.isFinite(p.x+p.y))).toBe(true);
    r.points.R.x=0;recomputeAllRuntime(r);expect(r.labels[[...ids.labels][0]].hidden).toBe(true);expect(r.inkStrokes[stroke.id].hidden).toBe(true);
    r.points.R.x=10;recomputeAllRuntime(r);expect(r.labels[[...ids.labels][0]].hidden).toBeFalsy();
  });

  it('removes images when their inversion circle is deleted',()=>{
    const r=setup();createObjectSymmetry(r,{collection:'lines',id:'l'},mirror);delete r.circles.m;syncObjectSymmetries(r);
    expect(Object.values(r.lines).some(l=>l.symmetry)).toBe(false);expect(Object.values(r.points).some(p=>p.symmetry)).toBe(false);
  });
  it('restores a segment after two inversions, including its finite visible interval',()=>{
    const r=setup(),first=createObjectSymmetry(r,{collection:'lines',id:'l'},mirror)!;recomputeAllRuntime(r);
    const second=createObjectSymmetry(r,{collection:'circles',id:[...first.circles][0]},mirror)!;recomputeAllRuntime(r);
    const lines=[...second.lines].map(id=>r.lines[id]).filter(l=>l.geometryValid!==false);
    expect(lines).toHaveLength(1);const line=lines[0];
    for(const id of line.defining_points)expect(r.points[id].x).toBeCloseTo(20,7);
    const shown=line.points.slice(1).flatMap((id,i)=>line.segmentStyles?.[i]?.hidden?[]:[(r.points[id].y+r.points[line.points[i]].y)/2]);
    expect(shown.every(y=>y>=10-1e-6&&y<=30+1e-6)).toBe(true);
  });
  it('reflects an inverted arc and its region without reverting to straight chords',()=>{
    const r=setup();r.points.U={id:'U',x:0,y:-10,style:{}};r.points.V={id:'V',x:0,y:10,style:{}};r.lines.axis={id:'axis',points:['U','V'],defining_points:['U','V'],style:{}};
    const first=createObjectSymmetry(r,{collection:'lines',id:'l'},mirror)!;recomputeAllRuntime(r);
    const second=createObjectSymmetry(r,{collection:'circles',id:[...first.circles][0]},{kind:'line',id:'axis'})!;recomputeAllRuntime(r);
    const circle=[...second.circles].map(id=>r.circles[id]).find(c=>c.geometryValid!==false)!;
    const g=resolveCircleGeometry(r,circle)!;close(g.center,{x:-2.5,y:0});expect(g.radius).toBeCloseTo(2.5,7);
  });
});
