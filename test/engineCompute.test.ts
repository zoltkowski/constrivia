import { describe, expect, it } from 'vitest';
import type { EngineState } from '../src/core/engineModel';
import { movePointAndRecompute, movePointsByDeltaAndRecompute, transformPointsAndRecompute } from '../src/core/engineCompute';

describe('engineCompute', () => {
  it('recomputes line-line intersection after moving a defining point', () => {
    const state: EngineState = {
      points: {
        p1: { id: 'p1', x: 0, y: 0 },
        p2: { id: 'p2', x: 10, y: 0 },
        p3: { id: 'p3', x: 0, y: 10 },
        p4: { id: 'p4', x: 10, y: 10 },
        i1: {
          id: 'i1',
          x: 0,
          y: 0,
          construction_kind: 'intersection',
          parent_refs: [
            { kind: 'line', id: 'l1' },
            { kind: 'line', id: 'l2' }
          ]
        }
      },
      lines: {
        l1: {
          id: 'l1',
          points: ['p1', 'p2'],
          defining_points: ['p1', 'p2'],
          construction_kind: 'free'
        },
        l2: {
          id: 'l2',
          points: ['p3', 'p4'],
          defining_points: ['p3', 'p4'],
          construction_kind: 'free'
        }
      },
      circles: {},
      angles: {},
      polygons: {}
    };

    movePointAndRecompute(state, 'p2', { x: 10, y: 10 });

    expect(state.points.i1.x).toBeCloseTo(10);
    expect(state.points.i1.y).toBeCloseTo(10);
  });

  it('updates midpoint coordinates when a parent point moves', () => {
    const state: EngineState = {
      points: {
        a: { id: 'a', x: 0, y: 0 },
        b: { id: 'b', x: 2, y: 0 },
        m: {
          id: 'm',
          x: 1,
          y: 0,
          construction_kind: 'midpoint',
          midpointMeta: { parents: ['a', 'b'] }
        }
      },
      lines: {},
      circles: {},
      angles: {},
      polygons: {}
    };

    movePointAndRecompute(state, 'a', { x: 2, y: 0 });

    expect(state.points.m.x).toBeCloseTo(2);
    expect(state.points.m.y).toBeCloseTo(0);
  });

  it('moves on-line points when defining points move along the line', () => {
    const state: EngineState = {
      points: {
        a: { id: 'a', x: 0, y: 0 },
        b: { id: 'b', x: 10, y: 0 },
        c: {
          id: 'c',
          x: 5,
          y: 0,
          construction_kind: 'on_object',
          parent_refs: [{ kind: 'line', id: 'l1' }]
        }
      },
      lines: {
        l1: {
          id: 'l1',
          points: ['a', 'c', 'b'],
          defining_points: ['a', 'b'],
          construction_kind: 'free'
        }
      },
      circles: {},
      angles: {},
      polygons: {}
    };

    const originals = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 10, y: 0 }]
    ]);

    movePointsByDeltaAndRecompute(state, originals, { x: 5, y: 0 });

    expect(state.points.c.x).toBeCloseTo(10);
    expect(state.points.c.y).toBeCloseTo(0);
  });

  it('preserves line fractions when scaling defining points around center', () => {
    const state: EngineState = {
      points: {
        a: { id: 'a', x: -5, y: 0 },
        b: { id: 'b', x: 5, y: 0 },
        c: {
          id: 'c',
          x: 0,
          y: 0,
          construction_kind: 'on_object',
          parent_refs: [{ kind: 'line', id: 'l1' }]
        }
      },
      lines: {
        l1: {
          id: 'l1',
          points: ['a', 'c', 'b'],
          defining_points: ['a', 'b'],
          construction_kind: 'free'
        }
      },
      circles: {},
      angles: {},
      polygons: {}
    };

    transformPointsAndRecompute(state, {
      center: { x: 0, y: 0 },
      vectors: [
        { id: 'a', vx: -5, vy: 0 },
        { id: 'b', vx: 5, vy: 0 }
      ],
      scale: 2
    });

    expect(state.points.a.x).toBeCloseTo(-10);
    expect(state.points.b.x).toBeCloseTo(10);
    expect(state.points.c.x).toBeCloseTo(0);
    expect(state.points.c.y).toBeCloseTo(0);
  });
});
