import { describe, expect, it } from 'vitest';
import type { EngineState } from '../src/core/engineModel';
import { movePointAndRecompute, movePointsByDeltaAndRecompute, recomputeAll } from '../src/core/engineCompute';

const fixture = (kind: 'compass' | 'center-radius' = 'compass'): EngineState => ({
  points: {
    c: { id: 'c', x: 100, y: 100 }, r: { id: 'r', x: 150, y: 100 },
    s: { id: 's', x: 300, y: 300 }, t: { id: 't', x: 350, y: 300 },
    p: { id: 'p', x: 130, y: 140, construction_kind: 'on_object', parent_refs: [{ kind: 'circle', id: 'o' }] }
  },
  circles: { o: { id: 'o', center: 'c', radius_point: kind === 'center-radius' ? 'r' : undefined,
    circle_kind: kind, defining_points: kind === 'compass' ? ['c', 's', 't'] : ['c', 'r', 'r'], points: ['p'] } },
  lines: {}, angles: {}, polygons: {}
});

const expectOffset = (state: EngineState, x = 30, y = 40) => {
  expect(state.points.p.x - state.points.c.x).toBeCloseTo(x, 7);
  expect(state.points.p.y - state.points.c.y).toBeCloseTo(y, 7);
};

describe('points attached to a moving circle', () => {
  it('translates a compass perimeter point with its center', () => {
    const state = fixture();
    movePointAndRecompute(state, 'c', { x: 170, y: 125 });
    expectOffset(state);
    recomputeAll(state);
    expectOffset(state);
  });

  it.each([['c', 'r'], ['r', 'c']])('keeps its angle when center/radius drivers move in order %s, %s', (first, second) => {
    const state = fixture('center-radius');
    for (let frame = 0; frame < 120; frame++) {
      for (const id of [first, second]) {
        const point = state.points[id];
        movePointAndRecompute(state, id, { x: point.x + 1, y: point.y });
      }
      expectOffset(state);
    }
  });

  it('allows dragging the attached point to a new angle', () => {
    const state = fixture();
    movePointAndRecompute(state, 'p', { x: 0, y: 100 });
    expectOffset(state, -50, 0);
    movePointAndRecompute(state, 'c', { x: 120, y: 130 });
    expectOffset(state, -50, 0);
  });

  it('scales the offset without changing angle when the radius changes', () => {
    const state = fixture('center-radius');
    movePointAndRecompute(state, 'r', { x: 200, y: 100 });
    expectOffset(state, 60, 80);
  });

  it('follows a center computed from other moving points', () => {
    const state = fixture();
    state.points.a = { id: 'a', x: 80, y: 100 };
    state.points.b = { id: 'b', x: 120, y: 100 };
    Object.assign(state.points.c, { construction_kind: 'midpoint', midpointMeta: { parents: ['a', 'b'] } });
    movePointsByDeltaAndRecompute(state, new Map(['a', 'b'].map(id => [id, { ...state.points[id] }])), { x: 40, y: 20 });
    expectOffset(state);
  });

  it('preserves angle on a translated three-point circle', () => {
    const state = fixture();
    state.points.a = { id: 'a', x: 150, y: 100 };
    state.points.b = { id: 'b', x: 100, y: 150 };
    state.points.d = { id: 'd', x: 50, y: 100 };
    Object.assign(state.circles.o, { circle_kind: 'three-point', defining_points: ['a', 'b', 'd'] });
    movePointsByDeltaAndRecompute(state, new Map(['a', 'b', 'd'].map(id => [id, { ...state.points[id] }])), { x: 40, y: 20 });
    expectOffset(state);
  });

  it('keeps intersections governed by both parents', () => {
    const state = fixture();
    state.points.a = { id: 'a', x: 130, y: 0 };
    state.points.b = { id: 'b', x: 130, y: 200 };
    state.lines.l = { id: 'l', points: ['a', 'p', 'b'], defining_points: ['a', 'b'] };
    Object.assign(state.points.p, { construction_kind: 'intersection', parent_refs: [{ kind: 'circle', id: 'o' }, { kind: 'line', id: 'l' }] });
    movePointAndRecompute(state, 'c', { x: 120, y: 100 });
    expect(state.points.p.x).toBeCloseTo(130);
    expect(state.points.p.y).toBeCloseTo(100 + Math.sqrt(2400));
  });

  it('initializes a three-point circle around its computed center rather than a stale helper', () => {
    const state = fixture();
    state.points.a = { id: 'a', x: 150, y: 100 };
    state.points.b = { id: 'b', x: 100, y: 150 };
    state.points.d = { id: 'd', x: 50, y: 100 };
    Object.assign(state.circles.o, { circle_kind: 'three-point', defining_points: ['a', 'b', 'd'] });
    Object.assign(state.points.c, { x: 0, y: 0 });
    recomputeAll(state);
    expect(state.points.c.x).toBeCloseTo(100);
    expect(state.points.c.y).toBeCloseTo(100);
    expectOffset(state);
  });
});
