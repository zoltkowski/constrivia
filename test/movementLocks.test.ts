import { describe, expect, it } from 'vitest';
import { movePointAndRecompute, movePointsByDeltaAndRecompute, transformPointsAndRecompute } from '../src/core/engineCompute';
import { toEngineState } from '../src/core/engineAdapter';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';

function segment() {
  const runtime = makeEmptyRuntime();
  runtime.points.a = { id: 'a', x: 0, y: 0, style: {}, positionLocked: true };
  runtime.points.b = { id: 'b', x: 10, y: 0, style: {} };
  runtime.lines.ab = { id: 'ab', points: ['a', 'b'], defining_points: ['a', 'b'], style: {}, lengthLocked: true };
  return toEngineState(runtime);
}

describe('movement locks', () => {
  it('rejects translating a figure with a pinned vertex without deforming it', () => {
    const engine = segment();
    engine.lines.ab.lengthLocked = false;
    movePointsByDeltaAndRecompute(engine,
      new Map([['a', { x: 0, y: 0 }], ['b', { x: 10, y: 0 }]]), { x: 4, y: 3 });
    expect(engine.points.a).toMatchObject({ x: 0, y: 0 });
    expect(engine.points.b).toMatchObject({ x: 10, y: 0 });
  });
  it('pins one endpoint and projects the other onto the locked radius', () => {
    const engine = segment();
    movePointAndRecompute(engine, 'a', { x: 5, y: 5 });
    movePointAndRecompute(engine, 'b', { x: 0, y: 30 });
    expect(engine.points.a).toMatchObject({ x: 0, y: 0 });
    expect(engine.points.b).toMatchObject({ x: 0, y: 10 });
  });

  it('rejects group scaling that changes a locked length, but allows translation', () => {
    const engine = segment();
    engine.points.a.positionLocked = false;
    const originals = new Map([['a', { x: 0, y: 0 }], ['b', { x: 10, y: 0 }]]);
    expect(transformPointsAndRecompute(engine, {
      center: { x: 0, y: 0 }, vectors: [{ id: 'a', vx: 0, vy: 0 }, { id: 'b', vx: 10, vy: 0 }], scale: 2
    }).size).toBe(0);
    expect(engine.points.b.x).toBe(10);
    movePointsByDeltaAndRecompute(engine, originals, { x: 8, y: 2 });
    expect(engine.points.a).toMatchObject({ x: 8, y: 2 });
    expect(engine.points.b).toMatchObject({ x: 18, y: 2 });
  });
});
