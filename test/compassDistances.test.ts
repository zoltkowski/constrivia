import { describe, expect, it } from 'vitest';
import { compassDistanceCircleDefinition, compassDistanceGeometry, circleInputPointIds, resolveCircleGeometry, type CompassDistanceSource } from '../src/core/circleGeometry';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { toEngineState, applyEngineState } from '../src/core/engineAdapter';
import { recomputeAll, movePointAndRecompute } from '../src/core/engineCompute';
import { createConstructionClipboard, pasteConstructionClipboard } from '../src/core/constructionClipboard';

function fixture(kind: CompassDistanceSource['kind'] = 'point-line') {
  const r=makeEmptyRuntime();
  for (const [id,x,y] of [['A',0,0],['B',10,0],['P',30,6],['C',2,6],['D',12,6],['O',50,30]] as const)
    r.points[id]={id,x,y,style:{}};
  r.lines.l1={id:'l1',points:['A','B'],defining_points:['A','B'],style:{}};
  r.lines.l2={id:'l2',points:['C','D'],defining_points:['C','D'],style:{}};
  const source: CompassDistanceSource = kind==='point-line'
    ? {kind,pointId:'P',line:{lineId:'l1',a:'A',b:'B'}}
    : {kind,lines:[{lineId:'l1',a:'A',b:'B'},{lineId:'l2',a:'D',b:'C'}]};
  r.circles.c={...compassDistanceCircleDefinition(r,source,'O')!,id:'c',points:[],style:{}};
  return {r,source};
}

describe('compass distance sources', () => {
  it.each(['point-line','parallel-lines'] as const)('transfers %s without extra geometry',kind=>{
    const {r,source}=fixture(kind);
    expect(resolveCircleGeometry(r,r.circles.c)?.radius).toBe(6);
    expect(compassDistanceGeometry(r,source)).toEqual({x:-0,y:6});
    expect(Object.keys(r.points)).toHaveLength(6);
    expect(Object.keys(r.lines)).toHaveLength(2);
    expect(r.circles.c.radius_point).toBeUndefined();
    expect(circleInputPointIds(r.circles.c).sort()).toEqual((kind==='point-line'?['O','P','A','B']:['O','A','B','C','D']).sort());
  });
  it('measures the supporting line even beyond the endpoints and after rotation',()=>{
    const {r,source}=fixture();
    expect(Math.hypot(compassDistanceGeometry(r,source)!.x,compassDistanceGeometry(r,source)!.y)).toBe(6);
    for(const p of Object.values(r.points)){const x=p.x;p.x=-p.y;p.y=x;}
    expect(resolveCircleGeometry(r,r.circles.c)?.radius).toBe(6);
  });
  it('tracks point movement and zero-distance loss/recovery, including dependent circle points',()=>{
    const {r}=fixture();
    r.points.Q={id:'Q',x:56,y:30,style:{},construction_kind:'on_object',parent_refs:[{kind:'circle',id:'c'}]};
    r.circles.c.points=['Q'];
    const engine=toEngineState(r);
    movePointAndRecompute(engine,'P',{x:30,y:9});
    expect(resolveCircleGeometry(engine,engine.circles.c)?.radius).toBe(9);
    expect(Math.hypot(engine.points.Q.x-50,engine.points.Q.y-30)).toBeCloseTo(9);
    movePointAndRecompute(engine,'P',{x:30,y:0});
    expect(engine.circles.c.geometryValid).toBe(false);
    expect(engine.points.Q.geometryValid).toBe(false);
    movePointAndRecompute(engine,'P',{x:30,y:-7});
    expect(engine.circles.c.geometryValid).toBe(true);
    expect(engine.points.Q.geometryValid).toBe(true);
    expect(resolveCircleGeometry(engine,engine.circles.c)?.radius).toBe(7);
  });
  it('rejects nonparallel, coincident and collapsed source lines and recovers when parallelism returns',()=>{
    const {r,source}=fixture('parallel-lines');
    const engine=toEngineState(r);
    movePointAndRecompute(engine,'D',{x:12,y:7});
    expect(engine.circles.c.geometryValid).toBe(false);
    expect(resolveCircleGeometry(engine,engine.circles.c)).toBeNull();
    movePointAndRecompute(engine,'D',{x:12,y:6});
    expect(engine.circles.c.geometryValid).toBe(true);
    engine.points.C.y=engine.points.D.y=0;recomputeAll(engine);
    expect(engine.circles.c.geometryValid).toBe(false);
    r.points.B={...r.points.A,id:'B'};
    expect(compassDistanceCircleDefinition(r,source,'O')).toBeNull();
  });
  it.each(['point-line','parallel-lines'] as const)('preserves %s through adapters and independent dependency-complete copies',kind=>{
    const {r}=fixture(kind);
    const engine=toEngineState(r);recomputeAll(engine);
    applyEngineState(r,engine,{circles:true});
    expect(r.circles.c.compassSource).toEqual(engine.circles.c.compassSource);
    const clipboard=createConstructionClipboard(r,{circles:['c']});
    const destination=makeEmptyRuntime(),maps=pasteConstructionClipboard(destination,clipboard)!;
    const copy=destination.circles[maps.circles.get('c')!];
    expect(resolveCircleGeometry(destination,copy)?.radius).toBe(6);
    expect(copy.compassSource).not.toEqual(r.circles.c.compassSource);
    expect(Object.keys(destination.lines)).toHaveLength(kind==='point-line'?1:2);
    const copiedEngine=toEngineState(destination);recomputeAll(copiedEngine);
    expect(copiedEngine.circles[copy.id].geometryValid).toBe(true);
    r.points.P.y=100;r.points.D.y=100;
    expect(resolveCircleGeometry(destination,copy)?.radius).toBe(6);
    delete copiedEngine.lines[Object.keys(copiedEngine.lines)[0]];recomputeAll(copiedEngine);
    expect(copiedEngine.circles[copy.id].geometryValid).toBe(false);
  });
});
