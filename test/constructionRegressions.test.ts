import incircleDocument from './fixtures/classical/incircle.json';
import { describe, expect, it } from 'vitest';
import { toEngineState } from '../src/core/engineAdapter';
import { movePointAndRecompute, movePointsByDeltaAndRecompute, recomputeAll, transformPointsAndRecompute } from '../src/core/engineCompute';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import type { EnginePoint, EngineState } from '../src/core/engineModel';
import { resolveBisectSegment } from '../src/core/bisectorGeometry';

// The UI-created incircle includes a projection foot inserted into AB and two
// bisectors that still refer to the original endpoints of that side.
function incircle(): EngineState {
  const { model } = incircleDocument;
  const runtime = makeEmptyRuntime();
  for (const kind of ['points', 'lines', 'circles', 'polygons', 'angles'] as const) {
    Object.assign(runtime, { [kind]: Object.fromEntries(((model as Record<string, { id: string }[]>)[kind] || []).map(object => [object.id, object])) });
  }
  return toEngineState(runtime);
}

function distance(a: EnginePoint, b: EnginePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function expectIncircle(engine: EngineState) {
  const center = engine.points.pt6, contact = engine.points.pt7;
  const radius = distance(center, contact);
  for (const [aId, bId] of [['pt1', 'pt2'], ['pt2', 'pt3'], ['pt3', 'pt1']]) {
    const a = engine.points[aId], b = engine.points[bId];
    const toSide = Math.abs((b.x - a.x) * (center.y - a.y) - (b.y - a.y) * (center.x - a.x)) / distance(a, b);
    expect(toSide).toBeCloseTo(radius, 5);
  }
  const before = structuredClone(engine);
  recomputeAll(engine);
  for (const p of Object.values(engine.points)) {
    expect(distance(p, before.points[p.id])).toBeLessThan(1e-6);
  }
}

describe('classical construction regressions', () => {
  it.each([{ x: 350, y: 340 }, { x: 180, y: 450 }, { x: 430, y: 570 }])(
    'keeps the incircle tangent to every side after moving C to $x,$y', target => {
      const engine = incircle();
      movePointAndRecompute(engine, 'pt3', target);
      expectIncircle(engine);
    }
  );

  it('settles the incircle after translating only the triangle', () => {
    const engine = incircle();
    const originals = new Map(['pt1', 'pt2', 'pt3'].map(id => [id, { ...engine.points[id] }]));
    movePointsByDeltaAndRecompute(engine, originals, { x: 65, y: -30 });
    expectIncircle(engine);
  });

  it.each([{ scale: 1.2 }, { rotation: Math.PI / 9 }])('settles the incircle after a triangle transform: %j', transform => {
    const engine = incircle();
    const center = { x: 500, y: 390 };
    transformPointsAndRecompute(engine, {
      ...transform,
      center,
      vectors: ['pt1', 'pt2', 'pt3'].map(id => ({ id, vx: engine.points[id].x - center.x, vy: engine.points[id].y - center.y }))
    });
    expectIncircle(engine);
  });

  it('propagates a long derived-point chain independently of insertion order', () => {
    const engine: EngineState = { points: { a: { id: 'a', x: 0, y: 0 }, b: { id: 'b', x: 10, y: 20 } }, lines: {}, circles: {}, angles: {}, polygons: {} };
    for (let index = 20; index >= 1; index--) {
      const id = `m${index}`;
      engine.points[id] = { id, x: 0, y: 0, construction_kind: 'midpoint', midpointMeta: { parents: [index === 1 ? 'a' : `m${index - 1}`, 'b'] } };
    }
    expect(recomputeAll(engine).converged).toBe(true);
    expect(engine.points.m20.x).toBeCloseTo(10 * (1 - 2 ** -20), 6);
    expect(engine.points.m20.y).toBeCloseTo(20 * (1 - 2 ** -20), 6);
    movePointAndRecompute(engine, 'b', { x: 30, y: -40 });
    expect(engine.points.m20.x).toBeCloseTo(30 * (1 - 2 ** -20), 6);
    expect(engine.points.m20.y).toBeCloseTo(-40 * (1 - 2 ** -20), 6);
  });

  it('accepts subdivision but rejects a genuinely removed bisector side', () => {
    const engine = incircle(), meta = engine.points.pt4.bisectMeta!;
    if (meta.arms) throw new Error('This legacy fixture must retain its segment definition');
    expect(resolveBisectSegment(engine, meta.seg1, meta.vertex)).not.toBeNull();
    delete engine.lines[meta.seg1.lineId];
    expect(resolveBisectSegment(engine, meta.seg1, meta.vertex)).toBeNull();
  });

  it('reports exhaustion for inconsistent cyclic constructions instead of looping forever', () => {
    const engine: EngineState = { points: {
      o: { id: 'o', x: 0, y: 0 },
      p: { id: 'p', x: 10, y: 0 },
      a: { id: 'a', x: 1, y: 0, construction_kind: 'symmetric', symmetricMeta: { source: 'b', mirror: { kind: 'point', id: 'o' } } },
      b: { id: 'b', x: 2, y: 0, construction_kind: 'symmetric', symmetricMeta: { source: 'a', mirror: { kind: 'point', id: 'p' } } }
    }, lines: {}, circles: {}, angles: {}, polygons: {} };
    expect(recomputeAll(engine)).toEqual({ converged: false, passes: 5 });
    expect(Object.values(engine.points).every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});
