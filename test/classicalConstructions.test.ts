import { describe, expect, it } from 'vitest';
import { applyEngineState, toEngineState } from '../src/core/engineAdapter';
import { movePointAndRecompute, movePointsByDeltaAndRecompute, transformPointsAndRecompute } from '../src/core/engineCompute';
import type { EnginePoint, EngineState } from '../src/core/engineModel';
import { loadClassicalFixture, type ClassicalFixtureName } from './helpers/classicalFixtures';

const triangleKinds: ClassicalFixtureName[] = ['centroid', 'orthocenter', 'circumcircle', 'incircle'];
const allKinds: ClassicalFixtureName[] = [...triangleKinds, 'tangents'];
const triangleIds = ['pt1', 'pt2', 'pt3'];

function point(engine: EngineState, id: string): EnginePoint {
  const value = engine.points[id];
  if (!value) throw new Error(`Fixture is missing point ${id}`);
  return value;
}

function distance(a: EnginePoint, b: EnginePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizedDot(ax: number, ay: number, bx: number, by: number): number {
  const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
  return denominator === 0 ? Infinity : Math.abs(ax * bx + ay * by) / denominator;
}

function normalizedCross(ax: number, ay: number, bx: number, by: number): number {
  const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
  return denominator === 0 ? Infinity : Math.abs(ax * by - ay * bx) / denominator;
}

function expectClassicalInvariant(engine: EngineState, kind: ClassicalFixtureName): void {
  for (const [id, value] of Object.entries(engine.points)) {
    expect(value.geometryValid, `point ${id} should remain geometrically valid`).not.toBe(false);
  }
  for (const [id, value] of Object.entries(engine.lines)) {
    expect(value.geometryValid, `line ${id} should remain geometrically valid`).not.toBe(false);
  }
  for (const [id, value] of Object.entries(engine.circles)) {
    expect(value.geometryValid, `circle ${id} should remain geometrically valid`).not.toBe(false);
  }

  const a = point(engine, 'pt1');
  const b = point(engine, 'pt2');
  if (kind === 'centroid') {
    const c = point(engine, 'pt3'), g = point(engine, 'pt7');
    expect(g.x).toBeCloseTo((a.x + b.x + c.x) / 3, 6);
    expect(g.y).toBeCloseTo((a.y + b.y + c.y) / 3, 6);
    for (const [midId, pId, qId] of [['pt4', 'pt1', 'pt2'], ['pt5', 'pt2', 'pt3'], ['pt6', 'pt3', 'pt1']]) {
      const midpoint = point(engine, midId), p = point(engine, pId), q = point(engine, qId);
      expect(midpoint.x).toBeCloseTo((p.x + q.x) / 2, 6);
      expect(midpoint.y).toBeCloseTo((p.y + q.y) / 2, 6);
    }
    for (const [vertexId, midId] of [['pt1', 'pt5'], ['pt2', 'pt6'], ['pt3', 'pt4']]) {
      const vertex = point(engine, vertexId), midpoint = point(engine, midId);
      expect(normalizedCross(g.x - vertex.x, g.y - vertex.y, midpoint.x - vertex.x, midpoint.y - vertex.y)).toBeLessThan(1e-8);
    }
    return;
  }

  if (kind === 'orthocenter') {
    const c = point(engine, 'pt3'), h = point(engine, 'pt6');
    expect(normalizedDot(h.x - a.x, h.y - a.y, b.x - c.x, b.y - c.y)).toBeLessThan(1e-8);
    expect(normalizedDot(h.x - b.x, h.y - b.y, c.x - a.x, c.y - a.y)).toBeLessThan(1e-8);
    expect(normalizedDot(h.x - c.x, h.y - c.y, a.x - b.x, a.y - b.y)).toBeLessThan(1e-8);
    return;
  }

  if (kind === 'circumcircle') {
    const center = point(engine, engine.circles.c1.center);
    const radius = distance(center, a);
    expect(distance(center, b)).toBeCloseTo(radius, 6);
    expect(distance(center, point(engine, 'pt3'))).toBeCloseTo(radius, 6);
    return;
  }

  if (kind === 'incircle') {
    const center = point(engine, 'pt6'), contact = point(engine, 'pt7');
    const radius = distance(center, contact);
    for (const [startId, endId] of [['pt1', 'pt2'], ['pt2', 'pt3'], ['pt3', 'pt1']]) {
      const start = point(engine, startId), end = point(engine, endId);
      const sideDistance = Math.abs((end.x - start.x) * (center.y - start.y) - (end.y - start.y) * (center.x - start.x)) / distance(start, end);
      expect(sideDistance).toBeCloseTo(radius, 5);
    }
    return;
  }

  const center = point(engine, engine.circles.c1.center);
  const radius = distance(center, point(engine, engine.circles.c1.radius_point!));
  for (const contactId of ['pt5', 'pt6']) {
    const contact = point(engine, contactId), external = point(engine, 'pt3');
    expect(distance(center, contact)).toBeCloseTo(radius, 6);
    expect(normalizedDot(contact.x - center.x, contact.y - center.y, external.x - contact.x, external.y - contact.y)).toBeLessThan(1e-8);
    const tangentLine = Object.values(engine.lines).find(line => line.perpendicular?.throughPoint === contactId);
    expect(tangentLine, `missing tangent line through ${contactId}`).toBeDefined();
    const helper = point(engine, tangentLine!.perpendicular!.helperPoint);
    const tangentX = helper.x - contact.x, tangentY = helper.y - contact.y;
    expect(normalizedDot(contact.x - center.x, contact.y - center.y, tangentX, tangentY)).toBeLessThan(1e-8);
    expect(normalizedCross(external.x - contact.x, external.y - contact.y, tangentX, tangentY)).toBeLessThan(1e-8);
  }
}

function applyTriangleTransform(engine: EngineState, transform: { scale?: number; rotation?: number }): void {
  const center = { x: 500, y: 430 };
  transformPointsAndRecompute(engine, {
    ...transform,
    center,
    vectors: triangleIds.map(id => ({ id, vx: point(engine, id).x - center.x, vy: point(engine, id).y - center.y }))
  });
}

describe('educational classical construction regression fixtures', () => {
  it('loads an independent deep copy of each construction fixture', () => {
    const first = loadClassicalFixture('centroid');
    const firstParent = first.runtime.points.pt4.midpointMeta!.parents[0];
    first.runtime.points.pt4.midpointMeta!.parents[0] = 'changed';
    const second = loadClassicalFixture('centroid');
    expect(second.runtime.points.pt4.midpointMeta!.parents[0]).toBe(firstParent);
  });

  it.each(triangleKinds)('%s survives repeated movement of triangle vertex C', kind => {
    const { engine } = loadClassicalFixture(kind);
    for (const target of [{ x: 350, y: 340 }, { x: 180, y: 450 }, { x: 430, y: 570 }, { x: 430, y: 260 }]) {
      movePointAndRecompute(engine, 'pt3', target);
      expectClassicalInvariant(engine, kind);
    }
  });

  it.each(triangleKinds)('%s survives triangle translation, scale, and rotation', kind => {
    const { engine } = loadClassicalFixture(kind);
    const originals = new Map(triangleIds.map(id => [id, { ...point(engine, id) }]));
    movePointsByDeltaAndRecompute(engine, originals, { x: 65, y: -30 });
    expectClassicalInvariant(engine, kind);
    applyTriangleTransform(engine, { scale: 1.15 });
    expectClassicalInvariant(engine, kind);
    applyTriangleTransform(engine, { rotation: Math.PI / 9 });
    expectClassicalInvariant(engine, kind);
  });

  it('keeps both tangents valid after repeated external-point movement', () => {
    const { engine } = loadClassicalFixture('tangents');
    for (const target of [{ x: 740, y: 300 }, { x: 740, y: 450 }, { x: 650, y: 500 }, { x: 650, y: 350 }]) {
      movePointAndRecompute(engine, 'pt3', target);
      expectClassicalInvariant(engine, 'tangents');
    }
  });

  it.each(allKinds)('%s survives a whole-construction similarity and runtime adapter roundtrip', kind => {
    const { runtime, engine } = loadClassicalFixture(kind);
    const allPointIds = Object.keys(engine.points);
    const center = { x: 490, y: 410 };
    transformPointsAndRecompute(engine, {
      scale: 0.9,
      rotation: Math.PI / 7,
      center,
      vectors: allPointIds.map(id => ({ id, vx: point(engine, id).x - center.x, vy: point(engine, id).y - center.y }))
    });
    expectClassicalInvariant(engine, kind);
    applyEngineState(runtime, engine, { points: true, lines: true, circles: true });
    expectClassicalInvariant(toEngineState(runtime), kind);
  });
});
