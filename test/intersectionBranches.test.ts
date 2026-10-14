import { describe, expect, it } from 'vitest';
import { recomputeAll } from '../src/core/engineCompute';
import type { EngineState } from '../src/core/engineModel';

describe('intersection branch recovery', () => {
  it.each([false, true])('separates line-circle branches after tangency (reverse parents: %s)', reversed => {
    const parents = [{ kind: 'line' as const, id: 'line' }, { kind: 'circle' as const, id: 'circle' }];
    const engine: EngineState = {
      points: {
        o: { id: 'o', x: 0, y: 0 }, r: { id: 'r', x: 10, y: 0 },
        a: { id: 'a', x: -20, y: 0 }, b: { id: 'b', x: 20, y: 0 },
        left: { id: 'left', x: -10, y: 0, construction_kind: 'intersection', parent_refs: parents },
        right: { id: 'right', x: 10, y: 0, construction_kind: 'intersection', parent_refs: reversed ? parents.slice().reverse() : parents }
      },
      lines: { line: { id: 'line', points: ['a', 'left', 'right', 'b'], defining_points: ['a', 'b'] } },
      circles: { circle: { id: 'circle', center: 'o', radius_point: 'r', points: ['left', 'right'], defining_points: ['o', 'r', 'r'], circle_kind: 'center-radius' } },
      polygons: {}, angles: {}
    };
    for (const height of [10, 0, 15, 0, -10, 0]) {
      engine.points.a.y = height; engine.points.b.y = height;
      expect(recomputeAll(engine).converged).toBe(true);
      if (height === 0) {
        expect([engine.points.left.x, engine.points.right.x].sort((a, b) => a - b)).toEqual([-10, 10]);
        expect(engine.points.left.y).toBeCloseTo(0);
        expect(engine.points.right.y).toBeCloseTo(0);
      }
    }
  });

  it('preserves two circle-circle branches after external tangency', () => {
    const parents = [{ kind: 'circle' as const, id: 'c1' }, { kind: 'circle' as const, id: 'c2' }];
    const engine: EngineState = { points: {
      o1: { id: 'o1', x: 0, y: 0 }, r1: { id: 'r1', x: 10, y: 0 },
      o2: { id: 'o2', x: 12, y: 0 }, r2: { id: 'r2', x: 22, y: 0 },
      p: { id: 'p', x: 6, y: 8, construction_kind: 'intersection', parent_refs: parents },
      q: { id: 'q', x: 6, y: -8, construction_kind: 'intersection', parent_refs: parents }
    }, lines: {}, polygons: {}, angles: {}, circles: {
      c1: { id: 'c1', center: 'o1', radius_point: 'r1', points: ['p', 'q'], defining_points: ['o1', 'r1', 'r1'], circle_kind: 'center-radius' },
      c2: { id: 'c2', center: 'o2', radius_point: 'r2', points: ['p', 'q'], defining_points: ['o2', 'r2', 'r2'], circle_kind: 'center-radius' }
    } };
    engine.points.o2.x = 20; engine.points.r2.x = 30;
    recomputeAll(engine);
    engine.points.o2.x = 12; engine.points.r2.x = 22;
    recomputeAll(engine);
    expect([engine.points.p.y, engine.points.q.y].sort((a,b) => a-b)).toEqual([-8,8]);
  });
});
