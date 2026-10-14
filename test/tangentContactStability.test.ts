import { describe, expect, it } from 'vitest';
import { lineCircleIntersections, projectPointOnLine } from '../src/core/engine';
import { loadClassicalFixture, loadPersistedFixture } from './helpers/classicalFixtures';
import { recomputeAll } from '../src/core/engineCompute';

describe('stable incircle contacts represented as line-circle intersections', () => {
  it.each([0.1, 1, 10])('keeps all three contacts available while deforming the triangle (scale %s)', scale => {
    const { engine } = loadClassicalFixture('incircle');
    for (const p of Object.values(engine.points)) { p.x *= scale; p.y *= scale; }
    recomputeAll(engine);
    const circle = engine.circles.c1;
    for (const lineId of ['ln1', 'ln2', 'ln3']) {
      const line = engine.lines[lineId], a = engine.points[line.defining_points[0]], b = engine.points[line.defining_points[1]];
      const foot = projectPointOnLine(engine.points[circle.center], a, b);
      const id = 'contact-' + lineId;
      engine.points[id] = { id, ...foot, construction_kind: 'intersection', parent_refs: [{ kind: 'line', id: lineId }, { kind: 'circle', id: circle.id }] };
      line.points.push(id); circle.points.push(id);
    }
    for (let step = 0; step < 80; step++) {
      engine.points.pt1.x = (300 + 70 * Math.sin(step * 0.31)) * scale;
      engine.points.pt1.y = (520 + 60 * Math.cos(step * 0.23)) * scale;
      engine.points.pt2.x = (700 + 90 * Math.cos(step * 0.17)) * scale;
      engine.points.pt3.y = (260 + 70 * Math.sin(step * 0.19)) * scale;
      expect(recomputeAll(engine).converged).toBe(true);
      for (const lineId of ['ln1', 'ln2', 'ln3']) {
        const line = engine.lines[lineId], point = engine.points['contact-' + lineId];
        expect(point.geometryValid, `step ${step}, ${lineId}`).toBe(true);
        const foot = projectPointOnLine(engine.points[circle.center], engine.points[line.defining_points[0]], engine.points[line.defining_points[1]]);
        expect(Math.hypot(point.x - foot.x, point.y - foot.y)).toBeLessThan(1e-6 * Math.max(1, scale));
      }
    }
    const { engine: restored } = loadPersistedFixture(JSON.parse(JSON.stringify({ model: {
      points: Object.values(engine.points), lines: Object.values(engine.lines), circles: Object.values(engine.circles)
    } })));
    recomputeAll(restored);
    for (const lineId of ['ln1', 'ln2', 'ln3']) expect(restored.points['contact-' + lineId].geometryValid).toBe(true);
  });
  it('keeps exact tangency independent of line length and endpoint direction', () => {
    for (const length of [0.01, 10, 10000]) for (const direction of [-1, 1]) {
      const hits = lineCircleIntersections({ x: 100000 - length * direction, y: 200100 }, { x: 100000 + length * direction, y: 200100 }, { x: 100000, y: 200000 }, 100, false);
      expect(hits).toHaveLength(1); expect(hits[0].x).toBeCloseTo(100000); expect(hits[0].y).toBeCloseTo(200100);
    }
  });
  it('still distinguishes true misses, secants and a degenerate line', () => {
    expect(lineCircleIntersections({ x: -20, y: 10.001 }, { x: 20, y: 10.001 }, { x: 0, y: 0 }, 10, false)).toEqual([]);
    expect(lineCircleIntersections({ x: -20, y: 9.99 }, { x: 20, y: 9.99 }, { x: 0, y: 0 }, 10, false)).toHaveLength(2);
    expect(lineCircleIntersections({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, 10, false)).toEqual([]);
  });
});
