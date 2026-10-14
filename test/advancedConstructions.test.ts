import { describe, expect, it } from 'vitest';
import eulerDocument from './fixtures/advanced/euler-ninepoint.json';
import simsonDocument from './fixtures/advanced/simson.json';
import secantsDocument from './fixtures/advanced/power-secants.json';
import { loadPersistedFixture } from './helpers/classicalFixtures';
import { applyEngineState, toEngineState } from '../src/core/engineAdapter';
import { movePointAndRecompute, recomputeAll, transformPointsAndRecompute } from '../src/core/engineCompute';
import type { EngineState } from '../src/core/engineModel';
import type { PersistedDocument } from '../src/persisted/persistedTypes';

const fixtures = { euler: eulerDocument, simson: simsonDocument, secants: secantsDocument };
type Kind = keyof typeof fixtures;
const kinds = Object.keys(fixtures) as Kind[];
type Position = { x: number; y: number };
const distance = (a: Position, b: Position) => Math.hypot(b.x - a.x, b.y - a.y);
const lineDistance = (a: Position, b: Position, p: Position) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / distance(a, b);

function verify(kind: Kind, engine: EngineState) {
  for (const objects of [engine.points, engine.lines, engine.circles, engine.polygons]) {
    for (const object of Object.values(objects)) expect(object.geometryValid, `${kind}: ${object.id}`).not.toBe(false);
  }
  for (const p of Object.values(engine.points)) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  const named = (text: string) => {
    const source = fixtures[kind].model.points.find(p => p.label?.text === text);
    if (!source) throw new Error(`Missing ${text} in ${kind}`);
    return engine.points[source.id];
  };
  const circle = Object.values(engine.circles)[0];
  const center = engine.points[circle.center];
  const radius = distance(center, engine.points[circle.radius_point!]);
  expect(radius).toBeGreaterThan(1e-6);
  if (kind === 'euler') {
    const a = named('A'), b = named('B'), c = named('C');
    const o = named('O'), g = named('G'), h = named('H');
    expect(g.x).toBeCloseTo((a.x + b.x + c.x) / 3, 6);
    expect(g.y).toBeCloseTo((a.y + b.y + c.y) / 3, 6);
    expect(distance(o, a)).toBeCloseTo(distance(o, b), 6);
    expect(distance(o, a)).toBeCloseTo(distance(o, c), 6);
    expect(lineDistance(o, g, h)).toBeLessThan(1e-6);
    expect(center.x).toBeCloseTo((o.x + h.x) / 2, 6);
    expect(center.y).toBeCloseTo((o.y + h.y) / 2, 6);
    expect(radius).toBeCloseTo(distance(o, a) / 2, 6);
    for (const id of ['pt4', 'pt5', 'pt6', 'pt16', 'pt17', 'pt19']) {
      expect(distance(center, engine.points[id]), `nine-point circle through ${id}`).toBeCloseTo(radius, 6);
    }
  } else if (kind === 'simson') {
    const a = named('A'), b = named('B'), c = named('C'), p = named('P');
    const x = named('X'), y = named('Y'), z = named('Z');
    expect(distance(center, p)).toBeCloseTo(radius, 6);
    for (const [foot, u, v] of [[x, a, b], [y, b, c], [z, c, a]]) {
      expect(lineDistance(u, v, foot)).toBeLessThan(1e-6);
      const dot = (foot.x - p.x) * (v.x - u.x) + (foot.y - p.y) * (v.y - u.y);
      expect(Math.abs(dot) / distance(u, v)).toBeLessThan(1e-6);
    }
    expect(distance(x, y)).toBeGreaterThan(1e-6);
    expect(lineDistance(x, y, z)).toBeLessThan(1e-6);
  } else {
    const p = named('P');
    const products = Object.values(engine.lines).map(line => {
      const roots = Object.values(engine.points).filter(point => point.construction_kind === 'intersection' &&
        point.parent_refs?.some(parent => parent.kind === 'line' && parent.id === line.id));
      expect(roots).toHaveLength(2);
      const [a, b] = roots;
      expect(distance(a, b)).toBeGreaterThan(1e-6);
      for (const root of roots) {
        expect(distance(center, root)).toBeCloseTo(radius, 6);
        expect(lineDistance(p, engine.points[line.defining_points![1]], root)).toBeLessThan(1e-6);
      }
      return distance(p, a) * distance(p, b);
    });
    expect(products).toHaveLength(2);
    const expected = distance(p, center) ** 2 - radius ** 2;
    expect(expected).toBeGreaterThan(0);
    for (const product of products) expect(product / expected).toBeCloseTo(1, 8);
  }
}

describe('advanced educational construction fixtures', () => {
  it.each(kinds)('%s survives independent input movement and runtime roundtrip', kind => {
    const { runtime, engine } = loadPersistedFixture(fixtures[kind] as unknown as PersistedDocument);
    recomputeAll(engine);
    verify(kind, engine);
    const targets = kind === 'secants'
      ? [{ x: 350, y: 340 }, { x: 180, y: 450 }, { x: 250, y: 450 }, { x: 220, y: 460 }]
      : kind === 'simson' ? [{ x: 430, y: 240 }, { x: 450, y: 280 }, { x: 350, y: 340 }, { x: 430, y: 260 }]
      : [{ x: 350, y: 340 }, { x: 180, y: 450 }, { x: 430, y: 570 }, { x: 430, y: 260 }];
    for (const target of targets) {
      movePointAndRecompute(engine, 'pt3', target);
      verify(kind, engine);
      applyEngineState(runtime, engine, { points: true, lines: true, circles: true });
      verify(kind, toEngineState(runtime));
    }
  });

  it('hides the Simson dependencies when the secant misses the circumcircle and restores them when it intersects again', () => {
    const { engine } = loadPersistedFixture(simsonDocument as unknown as PersistedDocument);
    recomputeAll(engine);
    movePointAndRecompute(engine, 'pt3', { x: 180, y: 450 });
    expect(engine.circles.c1.geometryValid).toBe(true);
    for (const id of ['pt7', 'pt8', 'pt12', 'pt13', 'pt14']) expect(engine.points[id].geometryValid, id).toBe(false);
    const simsonLine = Object.values(engine.lines).find(line => line.defining_points.includes('pt12') && line.defining_points.includes('pt13'))!;
    expect(simsonLine.geometryValid).toBe(false);
    movePointAndRecompute(engine, 'pt3', { x: 430, y: 260 });
    verify('simson', engine);
  });

  it.each(kinds)('%s survives moving all free inputs through a similarity', kind => {
    const { engine } = loadPersistedFixture(fixtures[kind] as unknown as PersistedDocument);
    recomputeAll(engine);
    const center = { x: 400, y: 350 };
    const independent = Object.values(engine.points).filter(point => !point.construction_kind || point.construction_kind === 'free');
    transformPointsAndRecompute(engine, {
      center, scale: 1.3, rotation: 0.37,
      vectors: independent.map(point => ({ id: point.id, vx: point.x - center.x, vy: point.y - center.y }))
    });
    verify(kind, engine);
  });
});
