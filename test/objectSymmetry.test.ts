import {describe,it,expect} from 'vitest';
import {makeEmptyRuntime} from '../src/core/runtimeTypes';
import {addPoint} from '../src/core/engineActions';
import {createObjectSymmetry,syncObjectSymmetries,symmetryPosition} from '../src/core/objectSymmetry';
import {recomputeAllRuntime} from '../src/core/runtimeRecompute';
import {toEngineState,applyEngineState} from '../src/core/engineAdapter';
import {movePointAndRecompute,transformPointsAndRecompute} from '../src/core/engineCompute';
import {createConstructionClipboard,pasteConstructionClipboard} from '../src/core/constructionClipboard';
import {linePresentationPoints} from '../src/canvas/linePresentation';
import {createCuboid,rotateSpatialGroupAxis} from '../src/core/spatialGeometry';
import {resolveCircleGeometry} from '../src/core/circleGeometry';

function setup(){
  const r=makeEmptyRuntime();
  for(const [id,x,y] of [['o',0,0],['u',0,-20],['v',0,20],['a',30,10],['b',70,10],['c',40,50]] as const)addPoint(r,{id,x,y,style:{size:4,color:'#123456'}});
  const line=(id:string,a:string,b:string,style={width:2,color:'#f00'})=>{r.lines[id]={id,points:[a,b],defining_points:[a,b],style,leftRay:{hidden:true},rightRay:{hidden:true}};};
  line('axis','u','v');line('ab','a','b',{width:3,color:'#f00'});line('bc','b','c');line('ca','c','a');
  r.polygons.tri={id:'tri',points:['a','b','c'],fill:'#0f0',fillOpacity:.3};
  r.circles.circle={id:'circle',center:'a',radius_point:'b',circle_kind:'center-radius',points:[],style:{color:'#00f'}} as any;
  r.labels.note={id:'note',text:'Tekst',pos:{x:50,y:60}};
  r.inkStrokes.ink={id:'ink',points:[{x:20,y:5,pressure:.5,time:1},{x:40,y:25,pressure:.6,time:2}],color:'#f0f',baseWidth:3};
  return r;
}
const imagePoint=(r:ReturnType<typeof setup>,source:string)=>Object.values(r.points).find(p=>p.symmetricMeta?.source===source)!;

describe('dependent object symmetry',()=>{
  it.each(['line','point'] as const)('reflects a polygon, its boundary and styles through a %s',kind=>{
    const r=setup(),mirror={kind,id:kind==='line'?'axis':'o'};
    const result=createObjectSymmetry(r,{collection:'polygons',id:'tri'},mirror)!;
    recomputeAllRuntime(r);
    expect(result.points.size).toBe(3);expect(result.lines.size).toBe(3);expect(result.polygons.size).toBe(1);
    for(const source of ['a','b','c'])expect(imagePoint(r,source)).toMatchObject({x:-r.points[source].x,y:(kind==='line'?1:-1)*r.points[source].y,construction_kind:'symmetric'});
    const polygon=r.polygons[[...result.polygons][0]];
    expect(polygon.fill).toBe('#0f0');expect(polygon.locked).toBe(false);
    const engine=toEngineState(r);movePointAndRecompute(engine,'a',{x:45,y:20});applyEngineState(r,engine);recomputeAllRuntime(r);
    expect(imagePoint(r,'a').x).toBe(-45);
    r.lines.ab.style.color='#ffff00';syncObjectSymmetries(r);
    expect(Object.values(r.lines).find(l=>l.symmetry?.source.id==='ab')!.style.color).toBe('#ffff00');
  });

  it('reflects a mixed group as one dependent group, including handwriting and free text',()=>{
    const r=setup();r.objectGroups={g:{id:'g',members:{points:['a','b'],lines:['ab'],circles:['circle'],inkStrokes:['ink'],labels:['note']}}};
    const result=createObjectSymmetry(r,{collection:'circles',id:'circle'},{kind:'point',id:'o'})!;
    expect(result.inkStrokes.size).toBe(1);expect(result.labels.size).toBe(1);expect(result.circles.size).toBe(1);
    expect(Object.values(r.objectGroups).some(g=>g.locked&&g.members.circles?.includes([...result.circles][0]))).toBe(true);
    const ink=r.inkStrokes[[...result.inkStrokes][0]],label=r.labels[[...result.labels][0]];
    expect(ink.points[0]).toMatchObject({x:-20,y:-5,pressure:.5});expect(label.pos).toEqual({x:-50,y:-60});
    r.labels.note.pos={x:15,y:90};r.inkStrokes.ink.points[0].x=90;syncObjectSymmetries(r);
    expect(label.pos).toEqual({x:-15,y:-90});expect(ink.points[0].x).toBe(-90);
  });

  it('does not duplicate a constructed point’s ancestors and prevents direct transforms of images',()=>{
    const r=setup();r.points.a.construction_kind='midpoint';r.points.a.midpointMeta={parents:['b','c']};recomputeAllRuntime(r);
    const result=createObjectSymmetry(r,{collection:'points',id:'a'},{kind:'line',id:'axis'})!;
    expect(result.points.size).toBe(1);expect(result.lines.size).toBe(0);
    const p=imagePoint(r,'a'),before={x:p.x,y:p.y},engine=toEngineState(r);
    movePointAndRecompute(engine,p.id,{x:999,y:999});
    transformPointsAndRecompute(engine,{center:{x:0,y:0},vectors:[{id:p.id,vx:20,vy:30}],scale:3});
    expect(engine.points[p.id]).toMatchObject(before);
  });

  it('keeps circles dependent on their radius and recovers from a degenerate axis',()=>{
    const r=setup(),result=createObjectSymmetry(r,{collection:'circles',id:'circle'},{kind:'line',id:'axis'})!;
    const circle=r.circles[[...result.circles][0]];recomputeAllRuntime(r);
    expect(r.points[circle.center].x).toBe(-30);expect(r.points[circle.radius_point!].x).toBe(-70);
    r.points.u.x=r.points.v.x=10;recomputeAllRuntime(r);expect(r.points[circle.center].x).toBe(-10);
    r.points.v.y=r.points.u.y;recomputeAllRuntime(r);expect(r.circles[circle.id].geometryValid).toBe(false);
    r.points.v.y=20;recomputeAllRuntime(r);expect(r.circles[circle.id].geometryValid).toBe(true);
  });

  it('preserves independent line presentation without copying its construction ancestors',()=>{
    const r=setup();
    r.lines.ab.perpendicular={throughPoint:'a',helperPoint:'b',referencePoints:['u','v'],directBisector:true};
    const result=createObjectSymmetry(r,{collection:'lines',id:'ab'},{kind:'point',id:'o'})!;
    const line=r.lines[[...result.lines][0]];recomputeAllRuntime(r);
    expect(result.points.size).toBe(2);expect(result.lines.size).toBe(1);
    expect(line.symmetry?.linePoints).toEqual([]);expect(linePresentationPoints(line,r)).toHaveLength(1);
  });

  it('copies a self-contained reflected group with remapped sources and mirrors',()=>{
    const r=setup(),result=createObjectSymmetry(r,{collection:'polygons',id:'tri'},{kind:'line',id:'axis'})!;
    const clipboard=createConstructionClipboard(r,result),destination=makeEmptyRuntime();
    const maps=pasteConstructionClipboard(destination,clipboard,25)!;expect(maps).not.toBeNull();recomputeAllRuntime(destination);
    const image=destination.polygons[maps.polygons.get([...result.polygons][0])!];
    expect(image.symmetry?.source.id).toBe(maps.polygons.get('tri'));
    expect(image.symmetry?.mirror.id).toBe(maps.lines.get('axis'));
    const imageA=destination.points[maps.points.get(imagePoint(r,'a').id)!];
    expect(imageA.x).toBeCloseTo(-5);expect(imageA.y).toBeCloseTo(35);
    destination.points[maps.points.get('a')!].x=90;recomputeAllRuntime(destination);expect(imageA.x).toBeCloseTo(-40);
  });

  it('updates subdivisions and removes images whose source or mirror was deleted',()=>{
    const r=setup(),result=createObjectSymmetry(r,{collection:'lines',id:'ab'},{kind:'line',id:'axis'})!;
    addPoint(r,{id:'d',x:50,y:10});r.lines.ab.points.splice(1,0,'d');recomputeAllRuntime(r);
    const line=r.lines[[...result.lines][0]];expect(line.points).toContain(imagePoint(r,'d').id);
    delete r.lines.axis;syncObjectSymmetries(r);
    expect(r.lines[line.id]).toBeUndefined();expect(Object.values(r.points).some(p=>p.symmetry)).toBe(false);
  });

  it('reflects the projected geometry of a solid as the source view rotates',()=>{
    const r=setup(),id=createCuboid(r,{x:300,y:100},40),solid=r.solids![id];
    const result=createObjectSymmetry(r,{collection:'solids',id},{kind:'line',id:'axis'})!;
    expect(result.points.size).toBe(8);expect(result.lines.size).toBe(12);
    const group=r.spatialGroups![solid.groupId];rotateSpatialGroupAxis(r,group.id,[...group.orientation],0,.4);recomputeAllRuntime(r);
    for(const source of solid.vertices){const image=imagePoint(r,source),expected=symmetryPosition(r,{kind:'line',id:'axis'},r.points[source])!;expect(image.x).toBeCloseTo(expected.x);expect(image.y).toBeCloseTo(expected.y);expect(image.spatial).toBeUndefined();}
  });

  it('reflects transferred radii without exposing their helper inputs',()=>{
    const r=setup();
    r.circles.circle={id:'circle',center:'c',circle_kind:'compass',compassSource:{kind:'point-line',pointId:'b',line:{lineId:'axis',a:'u',b:'v'}},points:[],style:{}} as any;
    const result=createObjectSymmetry(r,{collection:'circles',id:'circle'},{kind:'point',id:'o'})!;
    recomputeAllRuntime(r);const circle=r.circles[[...result.circles][0]];
    expect(resolveCircleGeometry(r,circle)!.radius).toBeCloseTo(70);
    expect([...result.lines].every(id=>r.lines[id].hidden)).toBe(true);
    expect(imagePoint(r,'b').style.hidden).toBe(true);
    r.points.b.x=95;recomputeAllRuntime(r);expect(resolveCircleGeometry(r,r.circles[circle.id])!.radius).toBeCloseTo(95);
  });

  it.each(['point','line'] as const)('preserves the styled arc under %s symmetry',kind=>{
    const r=setup();r.points.c.x=30;r.points.c.y=50;
    r.circles.circle.points=['c'];r.circles.circle.arcStyles={'circle:b:c':{color:'#0f0'},'circle:c:b':{color:'#f00'}};
    const result=createObjectSymmetry(r,{collection:'circles',id:'circle'},{kind,id:kind==='point'?'o':'axis'})!;
    const c=r.circles[[...result.circles][0]],b=imagePoint(r,'b').id,p=imagePoint(r,'c').id;
    expect((c.arcStyles as any)[kind==='line'?`${c.id}:${p}:${b}`:`${c.id}:${b}:${p}`].color).toBe('#0f0');
  });
});
