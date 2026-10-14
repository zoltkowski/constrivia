import { describe, expect, it } from 'vitest';
import { getCircleHandle, getCircleRotateHandle } from '../src/canvas/handles';
import { applyEngineState, toEngineState } from '../src/core/engineAdapter';
import { movePointAndRecompute, recomputeAll } from '../src/core/engineCompute';
import { circleInputPointIds, compassCircleDefinition, resolveCircleGeometry } from '../src/core/circleGeometry';
import type { EngineState } from '../src/core/engineModel';
import type { PersistedDocument } from '../src/persisted/persistedTypes';
import { inferPersistedCircleKind } from '../src/persisted/circleDefinition';
import { circlePerimeterPoints } from '../src/core/circleTools';
import { collectConstructionCopyInputs } from '../src/core/constructionCopyInputs';
import { loadPersistedFixture } from './helpers/classicalFixtures';

const fixture = (): { runtime: ReturnType<typeof loadPersistedFixture>['runtime']; engine: EngineState } => {
  const document = {
    model: {
      points: [
        { id: 'O', x: 0, y: 0 },
        { id: 'A', x: 10, y: 0 },
        { id: 'B', x: 10, y: 10 },
        { id: 'P', x: 0, y: 0, construction_kind: 'on_object', parent_refs: [{ kind: 'circle', id: 'c' }] }
      ],
      circles: [{
        id: 'c', center: 'O', circle_kind: 'compass', defining_points: ['O', 'A', 'B'],
        points: ['P'], style: {}
      }]
    }
  } as unknown as PersistedDocument;
  const loaded = loadPersistedFixture(document);
  loaded.runtime.points.P.style.hidden = true;
  return loaded;
};

describe('compass circle geometry', () => {
  it('copies the complete inputs when the transferred length uses a dependent midpoint', () => {
    const {runtime}=fixture();
    runtime.points.M={id:'M',x:10,y:5,style:{},construction_kind:'midpoint',parent_refs:[],midpointMeta:{parents:['A','B'],parentLineId:'base'}};
    runtime.lines.base={id:'base',points:['A','M','B'],defining_points:['A','B'],style:{}};
    runtime.circles.c.defining_points=['O','A','M'];
    const copied=collectConstructionCopyInputs(runtime,[{kind:'circle',id:'c'}]);
    expect([...copied.points].sort()).toEqual(['A','B','M','O','P']);
    expect([...copied.lines]).toEqual(['base']);
    expect([...copied.circles]).toEqual(['c']);
  });

  it('keeps an equilateral triangle constructed from two compass circles while the base moves', () => {
    const {engine}=loadPersistedFixture({model:{points:[
      {id:'A',x:0,y:0},{id:'B',x:10,y:0},
      {id:'C',x:5,y:Math.sqrt(75),construction_kind:'intersection',parent_refs:[{kind:'circle',id:'c1'},{kind:'circle',id:'c2'}]}
    ],circles:[
      {id:'c1',center:'A',circle_kind:'compass',defining_points:['A','A','B']},
      {id:'c2',center:'B',circle_kind:'compass',defining_points:['B','A','B']}
    ]}} as unknown as PersistedDocument);
    for(let i=0;i<40;i++){
      movePointAndRecompute(engine,'B',{x:10*Math.cos(i*.15),y:10*Math.sin(i*.15)+i*.2});
      const {A,B,C}=engine.points,r=Math.hypot(B.x-A.x,B.y-A.y);
      expect(C.geometryValid).toBe(true);
      expect(Math.hypot(C.x-A.x,C.y-A.y)).toBeCloseTo(r,6);
      expect(Math.hypot(C.x-B.x,C.y-B.y)).toBeCloseTo(r,6);
    }
  });
  it('uses the source length independently of the center, including a source point as center', () => {
    const points = { O: { x: 2, y: 3 }, A: { x: 0, y: 0 }, B: { x: 3, y: 4 } };
    const fromOtherCenter = compassCircleDefinition({ points }, ['A', 'B'], 'O');
    expect(fromOtherCenter).toMatchObject({ circle_kind: 'compass', center: 'O', defining_points: ['O', 'A', 'B'] });
    expect(resolveCircleGeometry({ points }, fromOtherCenter!)?.radius).toBe(5);

    const centeredOnSource = compassCircleDefinition({ points }, ['A', 'B'], 'A');
    expect(centeredOnSource).toMatchObject({ center: 'A', defining_points: ['A', 'A', 'B'] });
    expect(resolveCircleGeometry({ points }, centeredOnSource!)?.radius).toBe(5);
    expect(circleInputPointIds(centeredOnSource!)).toEqual(['A', 'B']);
  });

  it('tracks source movement, rotation, and length changes, including dependent on-object points', () => {
    const { engine } = fixture();
    recomputeAll(engine);
    expect(resolveCircleGeometry(engine, engine.circles.c)?.radius).toBe(10);
    expect(engine.points.P.geometryValid).toBe(true);
    expect(Math.hypot(engine.points.P.x, engine.points.P.y)).toBeCloseTo(10);

    movePointAndRecompute(engine, 'A', { x: 20, y: 10 });
    expect(resolveCircleGeometry(engine, engine.circles.c)?.radius).toBe(10);
    movePointAndRecompute(engine, 'B', { x: 20, y: 30 });
    expect(resolveCircleGeometry(engine, engine.circles.c)?.radius).toBe(20);
    expect(Math.hypot(engine.points.P.x, engine.points.P.y)).toBeCloseTo(20);
  });

  it('invalidates collapse and dependent points, then recovers their identity and hidden style', () => {
    const { runtime, engine } = fixture();
    recomputeAll(engine);
    movePointAndRecompute(engine, 'B', { x: 10, y: 0 });
    expect(engine.circles.c.geometryValid).toBe(false);
    expect(engine.points.P.geometryValid).toBe(false);
    applyEngineState(runtime, engine, { points: true, circles: true });
    expect(runtime.points.P.style.hidden).toBe(true);

    movePointAndRecompute(engine, 'B', { x: 10, y: 10 });
    expect(engine.circles.c.geometryValid).toBe(true);
    expect(engine.points.P.geometryValid).toBe(true);
    applyEngineState(runtime, engine, { points: true, circles: true });
    expect(runtime.points.P.id).toBe('P');
    expect(runtime.points.P.style.hidden).toBe(true);
  });

  it('propagates missing and invalid source parents to circle and dependent points', () => {
    const { engine } = fixture();
    delete engine.points.B;
    recomputeAll(engine);
    expect(engine.circles.c.geometryValid).toBe(false);
    expect(engine.points.P.geometryValid).toBe(false);

    engine.points.B = { id: 'B', x: 10, y: 10, construction_kind: 'on_object', parent_refs: [{ kind: 'line', id: 'missing' }] };
    recomputeAll(engine);
    expect(engine.circles.c.geometryValid).toBe(false);
    expect(engine.points.P.geometryValid).toBe(false);

    engine.points.B.parent_refs = [];
    engine.points.B.construction_kind = 'free';
    recomputeAll(engine);
    expect(engine.circles.c.geometryValid).toBe(true);
    expect(engine.points.P.geometryValid).toBe(true);
  });

  it('round-trips the compass definition through runtime and persisted fixture data', () => {
    const { runtime, engine } = fixture();
    const circle = engine.circles.c;
    expect(circle.circle_kind).toBe('compass');
    expect(circle.defining_points).toEqual(['O', 'A', 'B']);
    expect(circle.points).toEqual(['P']);
    expect(circle.points).not.toContain('A');
    expect(circle.points).not.toContain('B');
    expect(circlePerimeterPoints(runtime, runtime.circles.c)).toEqual(['P']);

    const roundTrippedRuntime = structuredClone(runtime);
    const roundTrippedEngine = toEngineState(roundTrippedRuntime);
    expect(roundTrippedEngine.circles.c).toMatchObject({
      circle_kind: 'compass', defining_points: ['O', 'A', 'B'], points: ['P']
    });
    expect(inferPersistedCircleKind({
      circle_kind: 'compass', center: 'O', defining_points: ['O', 'A', 'B']
    })).toBe('compass');
  });

  it('has no scale or rotate handle', () => {
    const { runtime, engine } = fixture();
    expect(engine.circles.c.radius_point).toBeUndefined();
    const handleDeps = {
      runtime, showHidden: false,
      lineExtent: () => null,
      circleRadius: () => 10
    };
    expect(getCircleHandle('c', handleDeps)).toBeNull();
    expect(getCircleRotateHandle('c', handleDeps)).toBeNull();
  });
});
