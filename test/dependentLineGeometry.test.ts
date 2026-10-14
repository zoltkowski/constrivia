import { describe, expect, it } from 'vitest';
import { dependentLineSeed, referenceLineGeometry, perpendicularBisectorSeed } from '../src/core/dependentLineGeometry';
import { tangentConstructionGeometry } from '../src/core/tangentGeometry';
import { loadPersistedFixture } from './helpers/classicalFixtures';
import { recomputeAll } from '../src/core/engineCompute';
import { remapCopiedLine } from '../src/core/copyMetadata';

describe('dependent lines with direct point references', () => {
  const bisector = () => loadPersistedFixture({ model: {
    points: [ { id: 'A', x: 0, y: 0 }, { id: 'B', x: 100, y: 0 },
      { id: 'M', x: 50, y: 0, construction_kind: 'midpoint', midpointMeta: { parents: ['A', 'B'] } }, { id: 'H', x: 50, y: 1 } ],
    lines: [{ id: 's', points: ['M', 'H'], defining_points: ['M', 'H'], construction_kind: 'perpendicular',
      perpendicular: { throughPoint: 'M', helperPoint: 'H', referencePoints: ['A', 'B'], helperDistance: 1, helperOrientation: 1 } }]
  } });
  it('recomputes a perpendicular bisector without any hidden support line', () => {
    const { engine } = bisector(); engine.points.B = { ...engine.points.B, x: 80, y: 60 };
    expect(recomputeAll(engine).converged).toBe(true);
    expect(engine.points.M.x).toBeCloseTo(40); expect(engine.points.M.y).toBeCloseTo(30);
    const h = engine.points.H, m = engine.points.M;
    expect((h.x - m.x) * 80 + (h.y - m.y) * 60).toBeCloseTo(0);
    expect(Object.keys(engine.lines)).toEqual(['s']); expect(engine.lines.s.geometryValid).toBe(true);
  });
  it('loses and recovers the bisector when its source points coincide', () => {
    const { engine } = bisector(); engine.points.B.x = 0; recomputeAll(engine);
    expect(engine.lines.s.geometryValid).toBe(false);
    engine.points.B.y = 100; recomputeAll(engine);
    expect(engine.lines.s.geometryValid).toBe(true);
    expect(engine.points.M.y).toBeCloseTo(50); expect(engine.points.H.y).toBeCloseTo(50);
  });
  it('propagates removal and invalidity of the direct defining inputs', () => {
    const { engine } = bisector(); delete engine.points.A; recomputeAll(engine);
    expect(engine.lines.s.geometryValid).toBe(false); expect(engine.points.M.geometryValid).toBe(false);
  });
  it('keeps the direction endpoint of a parallel through a 90-degree turn and round-trip', () => {
    const { runtime, engine } = loadPersistedFixture({ model: {
      points: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 100, y: 0 }, { id: 'P', x: 50, y: 60 }, { id: 'H', x: 50.001, y: 60 }],
      lines: [{ id: 'base', points: ['A', 'B'] }, { id: 'par', points: ['P', 'H'], construction_kind: 'parallel', parallel: { throughPoint: 'P', referenceLine: 'base', helperPoint: 'H' } }]
    } });
    recomputeAll(engine); const expectedLength = engine.lines.par.parallel!.helperDistance!;
    engine.points.B.x = 0; engine.points.B.y = 100; expect(recomputeAll(engine).converged).toBe(true);
    expect(engine.lines.par.geometryValid).toBe(true);
    expect(engine.points.H.x).toBeCloseTo(50); expect(engine.points.H.y - engine.points.P.y).toBeCloseTo(expectedLength);
    for (let i = 0; i < 4; i++) recomputeAll(engine);
    expect(engine.lines.par.parallel!.helperDistance).toBeCloseTo(expectedLength);
    expect(runtime.lines.base.points).toEqual(['A', 'B']);
  });
  it('copies direct point dependencies and preserves the construction after reload', () => {
    const { runtime } = bisector();
    const copy = remapCopiedLine(runtime.lines.s, { points: new Map([['A', 'A2'], ['B', 'B2'], ['M', 'M2'], ['H', 'H2']]), lines: new Map(), circles: new Map() });
    expect(copy.perpendicular?.referencePoints).toEqual(['A2', 'B2']);
    const { engine } = loadPersistedFixture(JSON.parse(JSON.stringify({ model: { points: Object.values(runtime.points), lines: Object.values(runtime.lines) } })));
    recomputeAll(engine); expect(engine.lines.s.geometryValid).toBe(true);
  });
  it('creates projection feet or internal direction endpoints from stable references', () => {
    const { runtime } = bisector();
    const seed = dependentLineSeed(runtime, 'M', { referencePoints: ['A', 'B'] }, true)!;
    expect(seed.helperHidden).toBe(true); expect(seed.helperPos).toEqual({ x: 50, y: 1 });
    runtime.points.M.y = 20;
    const projection = dependentLineSeed(runtime, 'M', { referencePoints: ['A', 'B'] }, true)!;
    expect(projection.helperHidden).toBe(false); expect(projection.helperPos).toEqual({ x: 50, y: 0 });
    expect(referenceLineGeometry(runtime, { referencePoints: ['A', 'B'] })?.length).toBe(100);
  });
  it('rejects a collapsed bisector base before any midpoint or helper is created', () => {
    const { runtime } = bisector(); runtime.points.B.x = 0;
    expect(perpendicularBisectorSeed(runtime, 'A', 'B')).toBeNull();
    expect(Object.keys(runtime.points)).toHaveLength(4);
  });
  it('plans two true tangent contacts, a single on-circle direction or no interior tangent', () => {
    const center = { x: 0, y: 0 }, source = { x: 200, y: 0 };
    const plan = tangentConstructionGeometry(center, 100, source)!;
    expect(plan.kind).toBe('external');
    if (plan.kind !== 'external') throw new Error('Expected external tangents');
    expect(plan.contacts).toHaveLength(2);
    for (const contact of plan.contacts) {
      expect(Math.hypot(contact.x, contact.y)).toBeCloseTo(100);
      expect((source.x - contact.x) * contact.x + (source.y - contact.y) * contact.y).toBeCloseTo(0);
    }
    expect(tangentConstructionGeometry(center, 100, { x: 100, y: 0 })?.kind).toBe('contact');
    expect(tangentConstructionGeometry(center, 100, { x: 50, y: 0 })?.kind).toBe('inside');
    expect(tangentConstructionGeometry(center, 0, source)).toBeNull();
  });
});
