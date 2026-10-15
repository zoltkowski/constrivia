import { describe, expect, it } from 'vitest';
import { perpendicularBisectorSeed } from '../src/core/dependentLineGeometry';
import { recomputeAll } from '../src/core/engineCompute';
import { collectConstructionCopyInputs } from '../src/core/constructionCopyInputs';
import { remapCopiedLine } from '../src/core/copyMetadata';
import { loadPersistedFixture } from './helpers/classicalFixtures';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { createDirectPerpendicularBisector } from '../src/core/directPerpendicularBisector';

const persistedDirectBisector = () => loadPersistedFixture({ model: {
  points: [
    { id: 'A', x: 0, y: 0 }, { id: 'B', x: 100, y: 0 },
    { id: 'N', x: 50, y: -50, style: { hidden: true } }, { id: 'P', x: 50, y: 50, style: { hidden: true } }
  ],
  lines: [{ id: 'bisector', points: ['N', 'P'], defining_points: ['N', 'P'], construction_kind: 'perpendicular',
    perpendicular: { directBisector: true, throughPoint: 'N', helperPoint: 'P', referencePoints: ['A', 'B'], helperDistance: 50 } }]
} });

describe('direct perpendicular bisector seed', () => {
  it('places two defining endpoints symmetrically around the midpoint on the normal', () => {
    const seed = perpendicularBisectorSeed({
      points: { A: { x: 0, y: 0 }, B: { x: 100, y: 0 } },
      lines: {}
    }, 'A', 'B');

    expect(seed).not.toBeNull();
    expect(seed!.midpoint).toEqual({ x: 50, y: 0 });
    expect(seed!.helperDistance).toBe(50);
    expect(seed!.negativeEndpoint).toEqual({ x: 50, y: -50 });
    expect(seed!.positiveEndpoint).toEqual({ x: 50, y: 50 });
  });

  it('rejects missing or coincident source points', () => {
    expect(perpendicularBisectorSeed({ points: {}, lines: {} }, 'A', 'B')).toBeNull();
    expect(perpendicularBisectorSeed({
      points: { A: { x: 2, y: 3 }, B: { x: 2, y: 3 } }, lines: {}
    }, 'A', 'B')).toBeNull();
  });

  it('creates two hidden auxiliary endpoints and a full perpendicular line without a midpoint', () => {
    const runtime = makeEmptyRuntime();
    runtime.points.A = { id: 'A', x: 0, y: 0, style: {} };
    runtime.points.B = { id: 'B', x: 100, y: 0, style: {} };
    const lineId = createDirectPerpendicularBisector(runtime, 'A', 'B', { color: '#123456' }, { color: '#abcdef', size: 6 });

    expect(lineId).not.toBeNull();
    expect(Object.values(runtime.points)).toHaveLength(4);
    const line = runtime.lines[lineId!]!;
    const [negativeId, positiveId] = line.defining_points;
    expect(runtime.points[negativeId].style).toMatchObject({ hidden: true, color: '#abcdef', size: 6 });
    expect(runtime.points[positiveId].style).toMatchObject({ hidden: true, color: '#abcdef', size: 6 });
    expect(runtime.points[negativeId].auxiliaryFor).toBe(lineId);
    expect(runtime.points[positiveId].auxiliaryFor).toBe(lineId);
    expect(runtime.points[negativeId].perpendicular_helper_for).toBe(lineId);
    expect(runtime.points[positiveId].perpendicular_helper_for).toBe(lineId);
    expect(line.construction_kind).toBe('perpendicular');
    expect(line.perpendicular).toMatchObject({ directBisector: true, referencePoints: ['A', 'B'], helperDistance: 50 });
    expect(line.leftRay?.hidden).toBe(false);
    expect(line.rightRay?.hidden).toBe(false);
    expect(Object.values(runtime.points).some(point => point.construction_kind === 'midpoint')).toBe(false);
  });

  it('recomputes symmetrically around the moving midpoint without creating a midpoint object', () => {
    const { runtime, engine } = persistedDirectBisector();
    expect(Object.keys(runtime.points).sort()).toEqual(['A', 'B', 'N', 'P']);
    expect(recomputeAll(engine).converged).toBe(true);

    engine.points.B = { ...engine.points.B, x: 80, y: 60 };
    expect(recomputeAll(engine).converged).toBe(true);
    expect(engine.lines.bisector.geometryValid).toBe(true);
    const n = engine.points.N, p = engine.points.P;
    expect((n.x + p.x) / 2).toBeCloseTo(40);
    expect((n.y + p.y) / 2).toBeCloseTo(30);
    expect((p.x - n.x) * 80 + (p.y - n.y) * 60).toBeCloseTo(0);
    expect(Math.hypot(p.x - n.x, p.y - n.y)).toBeCloseTo(100);
    expect(Object.keys(engine.points)).not.toContain('M');
  });

  it('marks a collapsed source invalid and recovers when it separates again', () => {
    const { engine } = persistedDirectBisector();
    engine.points.B = { ...engine.points.B, x: 0, y: 0 };
    recomputeAll(engine);
    expect(engine.lines.bisector.geometryValid).toBe(false);
    engine.points.B = { ...engine.points.B, x: 0, y: 100 };
    expect(recomputeAll(engine).converged).toBe(true);
    expect(engine.lines.bisector.geometryValid).toBe(true);
    expect((engine.points.N.x + engine.points.P.x) / 2).toBeCloseTo(0);
    expect((engine.points.N.y + engine.points.P.y) / 2).toBeCloseTo(50);
  });

  it('copies direct source dependencies and preserves the construction after reload', () => {
    const { runtime } = persistedDirectBisector();
    const closure = collectConstructionCopyInputs(runtime, [{ kind: 'line', id: 'bisector' }]);
    expect([...closure.points].sort()).toEqual(['A', 'B', 'N', 'P']);
    const copy = remapCopiedLine(runtime.lines.bisector, {
      points: new Map([['A', 'A2'], ['B', 'B2'], ['N', 'N2'], ['P', 'P2']]),
      lines: new Map(), circles: new Map()
    });
    expect(copy.perpendicular?.directBisector).toBe(true);
    expect(copy.perpendicular?.referencePoints).toEqual(['A2', 'B2']);
    expect(copy.perpendicular?.throughPoint).toBe('N2');
    expect(copy.perpendicular?.helperPoint).toBe('P2');

    const roundTrip = loadPersistedFixture(JSON.parse(JSON.stringify({ model: {
      points: Object.values(runtime.points), lines: Object.values(runtime.lines)
    } })));
    expect(recomputeAll(roundTrip.engine).converged).toBe(true);
    expect(roundTrip.engine.lines.bisector.geometryValid).toBe(true);
  });
});
