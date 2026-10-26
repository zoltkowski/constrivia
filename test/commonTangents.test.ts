import { describe, expect, it } from 'vitest';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { createCommonCircleTangents } from '../src/core/commonTangents';
import { commonCircleTangentGeometry } from '../src/core/tangentGeometry';
import { toEngineState, applyEngineState } from '../src/core/engineAdapter';
import { movePointAndRecompute, recomputeAll } from '../src/core/engineCompute';
import { createConstructionClipboard, pasteConstructionClipboard } from '../src/core/constructionClipboard';
import { resolveCircleGeometry } from '../src/core/circleGeometry';
import type { EngineState } from '../src/core/engineModel';

function fixture(r1=3,r2=5,distance=10) {
  const runtime=makeEmptyRuntime();
  for(const [id,x,y] of [['A',0,0],['AR',0,r1],['B',distance,0],['BR',distance,r2]] as const)
    runtime.points[id]={id,x,y,style:{}};
  runtime.circles.first={id:'first',center:'A',radius_point:'AR',defining_points:['A','A','AR'],points:['AR'],circle_kind:'center-radius',style:{}};
  runtime.circles.second={id:'second',center:'B',radius_point:'BR',defining_points:['B','B','BR'],points:['BR'],circle_kind:'center-radius',style:{}};
  return runtime;
}
function assertTangents(engine:EngineState,ids:string[],circles:[string,string]=['first','second']) {
  for(const id of ids){
    const line=engine.lines[id];
    if(line.geometryValid===false)continue;
    const [a,b]=line.defining_points.map(id=>engine.points[id]),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    for(const circleId of circles){
      const geometry=resolveCircleGeometry(engine,engine.circles[circleId])!;
      const distance=Math.abs((geometry.center.x-a.x)*dy-(geometry.center.y-a.y)*dx)/length;
      expect(distance).toBeCloseTo(geometry.radius,5);
    }
    for(const point of Object.values(engine.points).filter(p=>p.commonTangent)){
      const meta=point.commonTangent!,circle=engine.circles[meta.circles[meta.contact]],geometry=resolveCircleGeometry(engine,circle)!;
      if(point.geometryValid!==false)expect(Math.hypot(point.x-geometry.center.x,point.y-geometry.center.y)).toBeCloseTo(geometry.radius,5);
    }
  }
}
describe('external common tangents',()=>{
  it.each([[3,5,10],[3,3,10],[3,5,4],[3,5,8]])('creates two common tangents for radii %s/%s and separation %s',(r1,r2,distance)=>{
    const r=fixture(r1,r2,distance),lines=createCommonCircleTangents(r,['first','second'],{},{});
    expect(lines).toHaveLength(2);
    expect(Object.keys(r.circles)).toHaveLength(2);
    expect(Object.values(r.points).filter(p=>p.commonTangent)).toHaveLength(4);
    expect(Object.values(r.points).filter(p=>p.auxiliaryFor)).toHaveLength(2);
    const engine=toEngineState(r);expect(recomputeAll(engine).converged).toBe(true);
    expect(lines.every(id=>engine.lines[id].geometryValid)).toBe(true);
    assertTangents(engine,lines);
  });
  it('keeps both tangents correct through source movement and changing radii',()=>{
    const r=fixture(),lines=createCommonCircleTangents(r,['first','second'],{},{}),engine=toEngineState(r);
    for(let i=0;i<50;i++){
      movePointAndRecompute(engine,'B',{x:10+Math.cos(i*.3)*2,y:Math.sin(i*.3)*2});
      movePointAndRecompute(engine,'BR',{x:engine.points.B.x,y:engine.points.B.y+3+i*.01});
      expect(lines.every(id=>engine.lines[id].geometryValid)).toBe(true);
      assertTangents(engine,lines);
    }
  });
  it('loses and recovers branches with containment and the single internally tangent case',()=>{
    const r=fixture(),lines=createCommonCircleTangents(r,['first','second'],{},{}),engine=toEngineState(r);
    movePointAndRecompute(engine,'B',{x:1,y:0});movePointAndRecompute(engine,'BR',{x:1,y:5});
    expect(lines.every(id=>engine.lines[id].geometryValid===false)).toBe(true);
    movePointAndRecompute(engine,'B',{x:2,y:0});movePointAndRecompute(engine,'BR',{x:2,y:5});
    expect(lines.filter(id=>engine.lines[id].geometryValid)).toHaveLength(1);
    assertTangents(engine,lines);
    movePointAndRecompute(engine,'B',{x:10,y:0});movePointAndRecompute(engine,'BR',{x:10,y:5});
    expect(lines.every(id=>engine.lines[id].geometryValid)).toBe(true);
    assertTangents(engine,lines);
  });
  it('rejects identical, concentric and contained circles without changing the document',()=>{
    for(const r of [fixture(3,5,1),fixture(3,3,0),fixture(3,5,0)]){
      const before=JSON.stringify(r);
      expect(createCommonCircleTangents(r,['first','second'],{},{})).toEqual([]);
      expect(JSON.stringify(r)).toBe(before);
      expect(commonCircleTangentGeometry(r,['first','first'])).toEqual([]);
    }
  });
  it('copies a tangent with both circles and retains independent contact definitions',()=>{
    const r=fixture(),lines=createCommonCircleTangents(r,['first','second'],{},{});
    const buffer=createConstructionClipboard(r,{lines:[lines[0]]}),destination=makeEmptyRuntime();
    const maps=pasteConstructionClipboard(destination,buffer)!,copiedLines=[maps.lines.get(lines[0])!];
    const circles:[string,string]=[maps.circles.get('first')!,maps.circles.get('second')!];
    const engine=toEngineState(destination);recomputeAll(engine);assertTangents(engine,copiedLines,circles);
    expect(Object.values(destination.points).filter(p=>p.commonTangent).every(p=>p.commonTangent!.circles.every(id=>circles.includes(id)))).toBe(true);
    const originalEngine=toEngineState(r);movePointAndRecompute(originalEngine,'BR',{x:10,y:7});
    applyEngineState(r,originalEngine,{points:true,lines:true,circles:true});
    assertTangents(engine,copiedLines,circles);
    delete engine.circles[circles[1]];recomputeAll(engine);
    expect(engine.lines[copiedLines[0]].geometryValid).toBe(false);
  });
});
