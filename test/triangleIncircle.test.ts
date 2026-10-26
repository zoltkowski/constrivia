import {describe,it,expect} from 'vitest';
import {triangleIncircle} from '../src/core/triangleIncircle';
import {resolveCircleGeometry,circleInputPointIds} from '../src/core/circleGeometry';
import {circlePerimeterPointIdsRuntime} from '../src/core/engine';
import {makeEmptyRuntime} from '../src/core/runtimeTypes';
import {recomputeAllRuntime} from '../src/core/runtimeRecompute';
import {toEngineState,applyEngineState} from '../src/core/engineAdapter';
import {movePointAndRecompute} from '../src/core/engineCompute';
import {createConstructionClipboard,pasteConstructionClipboard} from '../src/core/constructionClipboard';
import {createObjectSymmetry} from '../src/core/objectSymmetry';
import {inferPersistedCircleKind,circleKindForPersistence} from '../src/persisted/circleDefinition';

const distanceToLine=(p:{x:number;y:number},a:{x:number;y:number},b:{x:number;y:number})=>Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))/Math.hypot(b.x-a.x,b.y-a.y);
function setup(){
  const r=makeEmptyRuntime();
  r.points={a:{id:'a',x:0,y:0,style:{}},b:{id:'b',x:3,y:0,style:{}},c:{id:'c',x:0,y:4,style:{}},i:{id:'i',x:999,y:999,style:{}}};
  r.lines.ab={id:'ab',points:['a','b'],defining_points:['a','b'],style:{},leftRay:{hidden:true},rightRay:{hidden:true}};
  r.circles.ic={id:'ic',center:'i',points:[],circle_kind:'incircle',defining_points:['a','b','c'],style:{}};
  recomputeAllRuntime(r);return r;
}
function expectTangent(r:ReturnType<typeof setup>,id='ic'){
  const circle=r.circles[id],g=resolveCircleGeometry(r,circle)!;
  expect(g).not.toBeNull();expect(circle.geometryValid).toBe(true);
  expect(r.points[circle.center].x).toBeCloseTo(g.center.x,9);expect(r.points[circle.center].y).toBeCloseTo(g.center.y,9);
  const points=circle.defining_points.map(id=>r.points[id]);
  for(let i=0;i<3;i++)expect(distanceToLine(g.center,points[i],points[(i+1)%3])).toBeCloseTo(g.radius,8);
}

describe('triangle incircles',()=>{
  it.each([1,1e-3,1e5])('finds the incenter and three equal distances at scale %s',scale=>{
    for(const clockwise of [false,true]){
      const a={x:1e7,y:-1e7},b={x:a.x+3*scale,y:a.y},c={x:a.x,y:a.y+4*scale};
      const g=clockwise?triangleIncircle(a,c,b)!:triangleIncircle(a,b,c)!;
      expect(g.radius).toBeCloseTo(scale,7);expect(g.center.x).toBeCloseTo(a.x+scale,7);expect(g.center.y).toBeCloseTo(a.y+scale,7);
      for(const [u,v] of [[a,b],[b,c],[c,a]])expect(distanceToLine(g.center,u,v)).toBeCloseTo(g.radius,7);
    }
  });
  it('rejects coincident, collinear and nonfinite vertices',()=>{
    for(const c of [{x:2,y:0},{x:0,y:0},{x:NaN,y:1}])expect(triangleIncircle({x:0,y:0},{x:1,y:0},c)).toBeNull();
  });
  it('updates from triangle vertices without projecting them onto the circle',()=>{
    const r=setup();expect(r.points.i).toMatchObject({x:1,y:1});expectTangent(r);
    const engine=toEngineState(r);movePointAndRecompute(engine,'c',{x:1,y:6});applyEngineState(r,engine,{points:true,circles:true});recomputeAllRuntime(r);
    expectTangent(r);expect(r.points.a).toMatchObject({x:0,y:0});expect(r.points.b).toMatchObject({x:3,y:0});expect(r.points.c).toMatchObject({x:1,y:6});
    expect(circlePerimeterPointIdsRuntime('ic',r)).toEqual([]);expect(circleInputPointIds(r.circles.ic)).toEqual(['a','b','c']);
  });
  it('hides the computed center at collinearity and recovers the full construction',()=>{
    const r=setup();r.points.c={...r.points.c,x:2,y:0};recomputeAllRuntime(r);
    expect(r.circles.ic.geometryValid).toBe(false);expect(r.points.i.geometryValid).toBe(false);
    r.points.c.y=-5;recomputeAllRuntime(r);expectTangent(r);expect(r.points.i.geometryValid).toBe(true);
  });
  it('requires the saved center and all three defining vertices',()=>{
    for(const id of ['i','a','b','c']){const r=setup();delete r.points[id];recomputeAllRuntime(r);expect(r.circles.ic.geometryValid).toBe(false);}
  });
  it('keeps a contact intersection stable while the triangle deforms',()=>{
    const r=setup();r.points.t={id:'t',x:1,y:0,style:{},construction_kind:'intersection',parent_refs:[{kind:'line',id:'ab'},{kind:'circle',id:'ic'}]};
    for(let step=0;step<15;step++){
      r.points.c.x=step*.2;r.points.c.y=4+step*.3;recomputeAllRuntime(r);expectTangent(r);
      expect(r.points.t.geometryValid).toBe(true);expect(r.points.t.y).toBeCloseTo(0,8);
      const geometry=resolveCircleGeometry(r,r.circles.ic)!;
      expect(Math.hypot(r.points.t.x-geometry.center.x,r.points.t.y-geometry.center.y)).toBeCloseTo(geometry.radius,8);
    }
  });
  it('preserves the kind through persistence, copying and reflection',()=>{
    const r=setup();expect(inferPersistedCircleKind(r.circles.ic)).toBe('incircle');expect(circleKindForPersistence('incircle')).toBe('incircle');
    const restored=JSON.parse(JSON.stringify(r));recomputeAllRuntime(restored);expectTangent(restored);
    const copy=makeEmptyRuntime(),maps=pasteConstructionClipboard(copy,createConstructionClipboard(r,{circles:['ic']}),20)!;
    recomputeAllRuntime(copy);expectTangent(copy,maps.circles.get('ic')!);
    const images=createObjectSymmetry(r,{collection:'circles',id:'ic'},{kind:'line',id:'ab'})!;recomputeAllRuntime(r);
    const id=[...images.circles][0];expectTangent(r,id);expect(r.points[r.circles[id].center].y).toBeCloseTo(-1,8);
  });
});
