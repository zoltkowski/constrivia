import { describe, expect, it } from 'vitest';
import { applyEngineState, toEngineState } from '../src/core/engineAdapter';
import { movePointAndRecompute, recomputeAll } from '../src/core/engineCompute';
import type { EngineState } from '../src/core/engineModel';
import { loadClassicalFixture } from './helpers/classicalFixtures';

describe('geometric existence versus manual visibility', () => {
  it('keeps manually hidden intersections hidden through disappearance and recovery', () => {
    const { runtime } = loadClassicalFixture('tangents');
    runtime.points.pt5.style.hidden = true;
    for (const target of [{ x: 740, y: 300 }, { x: 410, y: 350 }, { x: 740, y: 450 }]) {
      const engine = toEngineState(runtime);
      movePointAndRecompute(engine, 'pt3', target);
      applyEngineState(runtime, engine, { points: true });
      expect(runtime.points.pt5.style.hidden).toBe(true);
      expect(runtime.points.pt6.style.hidden ?? false).toBe(false);
      const exists = target.x > 450;
      for (const id of ['pt5', 'pt6']) expect(runtime.points[id].geometryValid).toBe(exists);
      for (const id of ['ln2', 'ln4']) expect(runtime.lines[id].geometryValid).toBe(exists);
    }
  });

  it('does not invalidate geometry because its construction helpers were hidden', () => {
    const { runtime, engine } = loadClassicalFixture('incircle');
    runtime.points.pt4.style.hidden = true;
    runtime.points.pt5.style.hidden = true;
    movePointAndRecompute(engine, 'pt3', { x: 350, y: 340 });
    applyEngineState(runtime, engine, { points: true, lines: true, circles: true });
    expect(runtime.points.pt4.style.hidden).toBe(true);
    expect(runtime.lines.ln4.geometryValid).toBe(true);
    expect(runtime.lines.ln5.geometryValid).toBe(true);
    expect(runtime.circles.c1.geometryValid).toBe(true);
    expect(runtime.points.pt7.geometryValid).toBe(true);
  });

  it('propagates missing line intersections to dependent geometry and recovers it', () => {
    const engine: EngineState = { points: {
      a: { id: 'a', x: 0, y: 0 }, b: { id: 'b', x: 10, y: 0 },
      c: { id: 'c', x: 5, y: -5 }, d: { id: 'd', x: 5, y: 5 },
      i: { id: 'i', x: 5, y: 0, construction_kind: 'intersection', parent_refs: [{ kind: 'line', id: 'l1' }, { kind: 'line', id: 'l2' }] },
      m: { id: 'm', x: 7.5, y: 0, construction_kind: 'midpoint', midpointMeta: { parents: ['i', 'b'] } }
    }, lines: {
      l1: { id: 'l1', points: ['a', 'i', 'b'], defining_points: ['a', 'b'] },
      l2: { id: 'l2', points: ['c', 'i', 'd'], defining_points: ['c', 'd'] },
      dependent: { id: 'dependent', points: ['m', 'd'], defining_points: ['m', 'd'] }
    }, circles: {
      dependent: { id: 'dependent', center: 'm', radius_point: 'd', points: [], defining_points: ['m', 'd', 'd'], circle_kind: 'center-radius' }
    }, polygons: { dependent: { id: 'dependent', points: ['a', 'm', 'd'] } }, angles: {
      dependent: { id: 'dependent', vertex: 'm', point1: 'a', point2: 'd' }
    } };
    recomputeAll(engine);
    engine.points.d.x = 15; engine.points.d.y = -5;
    recomputeAll(engine);
    expect(engine.points.i.geometryValid).toBe(false);
    expect(engine.points.m.geometryValid).toBe(false);
    for (const kind of ['lines', 'circles', 'polygons', 'angles'] as const) expect(engine[kind].dependent.geometryValid).toBe(false);
    expect(engine.lines.l1.geometryValid).toBe(true);
    expect(engine.lines.l2.geometryValid).toBe(true);
    engine.points.d.x = 5; engine.points.d.y = 5;
    recomputeAll(engine);
    for (const point of Object.values(engine.points)) expect(point.geometryValid).toBe(true);
    for (const kind of ['lines', 'circles', 'polygons', 'angles'] as const) expect(engine[kind].dependent.geometryValid).toBe(true);
  });

  it('invalidates a circumcircle and its computed center at collinearity, then recovers', () => {
    const { engine } = loadClassicalFixture('circumcircle');
    movePointAndRecompute(engine, 'pt3', { x: 500, y: 520 });
    expect(engine.circles.c1.geometryValid).toBe(false);
    expect(engine.points.pt4.geometryValid).toBe(false);
    expect(engine.points.pt1.geometryValid).toBe(true);
    expect(engine.lines.ln1.geometryValid).toBe(true);
    movePointAndRecompute(engine, 'pt3', { x: 430, y: 260 });
    expect(engine.circles.c1.geometryValid).toBe(true);
    expect(engine.points.pt4.geometryValid).toBe(true);
    expect(Object.values(engine.points).every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});
