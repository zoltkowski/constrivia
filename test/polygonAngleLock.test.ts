import { describe, expect, it } from 'vitest';
import { movePointAndRecompute } from '../src/core/engineCompute';
import { toEngineState } from '../src/core/engineAdapter';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';

function polygon(vertices: [number, number][]) {
  const runtime = makeEmptyRuntime();
  const ids = vertices.map(([x, y], i) => {
    const id = String(i);
    runtime.points[id] = { id, x, y, style: {}, construction_kind: 'free' };
    return id;
  });
  runtime.polygons.p = { id: 'p', points: ids, anglesLocked: true };
  return toEngineState(runtime);
}

describe('polygon angle lock', () => {
  it('stretches a square into a rectangle without moving the opposite corner', () => {
    const engine = polygon([[0, 0], [10, 0], [10, 10], [0, 10]]);
    movePointAndRecompute(engine, '0', { x: -5, y: 2 });
    expect(Object.values(engine.points).map(({ x, y }) => [x, y]))
      .toEqual([[-5, 2], [10, 2], [10, 10], [-5, 10]]);
  });

  it('preserves the edge directions of a pentagon and rejects collapsed sides', () => {
    const vertices: [number, number][] = [[0, 0], [10, 0], [13, 7], [6, 13], [-3, 7]];
    const engine = polygon(vertices);
    movePointAndRecompute(engine, '0', { x: -1, y: -2 });
    expect(engine.points['0']).toMatchObject({ x: -1, y: -2 });
    for (let i = 0; i < vertices.length; i++) {
      const next = (i + 1) % vertices.length;
      const a = engine.points[String(i)], b = engine.points[String(next)];
      const dx = vertices[next][0] - vertices[i][0], dy = vertices[next][1] - vertices[i][1];
      expect(dx * (b.y - a.y) - dy * (b.x - a.x)).toBeCloseTo(0);
      expect(dx * (b.x - a.x) + dy * (b.y - a.y)).toBeGreaterThan(0);
    }
    const square = polygon([[0, 0], [10, 0], [10, 10], [0, 10]]);
    movePointAndRecompute(square, '0', { x: 10, y: 2 });
    expect(square.points['0']).toMatchObject({ x: 0, y: 0 });
  });
});
