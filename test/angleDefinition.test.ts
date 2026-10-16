import { describe, expect, it } from 'vitest';
import { lineAngleArm, resolveAngleDefinition, lineAngleDefinition } from '../src/core/angleDefinition';
import { intersectLines } from '../src/core/engine';
import { bisectorPointPosition } from '../src/core/bisectorGeometry';
import { remapAngleArm, remapCopiedPointMetadata } from '../src/core/copyMetadata';
import type { AngleArm, PointRuntime } from '../src/core/runtimeTypes';
import { loadPersistedFixture } from './helpers/classicalFixtures';
import { recomputeAll } from '../src/core/engineCompute';

const geometry = () => ({
  points: { V: { id: 'V', x: 0, y: 0 }, A: { id: 'A', x: 100, y: 0 }, B: { id: 'B', x: 0, y: 100 }, C: { id: 'C', x: -20, y: 0 } },
  lines: { a: { id: 'a', points: ['V', 'A'], defining_points: ['V', 'A'] as [string, string] }, b: { id: 'b', points: ['V', 'B'], defining_points: ['V', 'B'] as [string, string] } }
});

describe('angles defined without materialized arms', () => {
  it('retains straight angles between adjacent parts of the same subdivided line', () => {
    const g = geometry(); g.lines.a.points = ['C', 'V', 'A'];
    const plan = lineAngleDefinition(g, 'a', { x: -10, y: 0 }, 'a', { x: 50, y: 0 }, intersectLines,
      { lineId: 'a', part: 'segment', seg: 0 }, { lineId: 'a', part: 'segment', seg: 1 })!;
    expect(plan.existingVertex).toBe('V');
    const angle = resolveAngleDefinition(g, { vertex: 'V', arm1: plan.arm1, arm2: plan.arm2 })!;
    expect(Math.abs(angle.ang2 - angle.ang1)).toBeCloseTo(Math.PI);
  });
  it('computes the same angle for three points without lines and for legacy arms', () => {
    const g = geometry();
    const explicit = resolveAngleDefinition({ ...g, lines: {} }, { vertex: 'V', point1: 'A', point2: 'B' });
    expect(explicit?.ang2).toBeCloseTo(Math.PI / 2);
    expect(resolveAngleDefinition(g, { vertex: 'V', arm1LineId: 'a', arm2LineId: 'b' })?.ang2).toBeCloseTo(Math.PI / 2);
  });
  it('resolves stored line arms with direction definitions and no subdivision points', () => {
    const g = geometry();
    g.lines.a.points = [];
    g.lines.b.points = [];
    const angle = resolveAngleDefinition(g, { vertex: 'V', arm1LineId: 'a', arm2LineId: 'b' });
    expect(angle?.ang1).toBeCloseTo(0);
    expect(angle?.ang2).toBeCloseTo(Math.PI / 2);
  });
  it('keeps a selected outward ray even if all stored line points are behind the vertex', () => {
    const g = geometry();
    g.lines.a = { ...g.lines.a, points: ['C', 'V'], defining_points: ['C', 'V'] };
    const arm1 = lineAngleArm(g, 'a', g.points.V, { x: 80, y: 0 })!;
    expect(resolveAngleDefinition(g, { vertex: 'V', arm1, arm2: { kind: 'point', pointId: 'B' } })?.ang1).toBeCloseTo(0);
    expect(lineAngleArm(g, 'a', g.points.V, { x: -80, y: 0 })).toEqual({ kind: 'line', lineId: 'a', direction: -1 });
  });
  it('keeps the directed ray through subdivision and rotation of its defining inputs', () => {
    const g = geometry();
    const arm1 = lineAngleArm(g, 'a', g.points.V, { x: -80, y: 0 })!;
    g.lines.a.points = ['C', 'V', 'A'];
    expect(resolveAngleDefinition(g, { vertex: 'V', arm1, arm2: { kind: 'point', pointId: 'B' } })?.ang1).toBeCloseTo(Math.PI);
    g.points.A = { id: 'A', x: 0, y: 100 };
    expect(resolveAngleDefinition(g, { vertex: 'V', arm1, arm2: { kind: 'point', pointId: 'C' } })?.ang1).toBeCloseTo(3 * Math.PI / 2);
  });
  it('hides a collapsed point arm and recovers it without changing the definition', () => {
    const { engine } = loadPersistedFixture({ model: { points: [{ id: 'V', x: 0, y: 0 }, { id: 'A', x: 50, y: 0 }, { id: 'B', x: 0, y: 50 }], angles: [{ id: 'ang', vertex: 'V', point1: 'A', point2: 'B' }] } });
    engine.points.A.x = 0; recomputeAll(engine);
    expect(engine.angles.ang.geometryValid).toBe(false);
    engine.points.A.x = 50; recomputeAll(engine);
    expect(engine.angles.ang.geometryValid).toBe(true);
  });
  it('constructs a bisector from point arms without support lines, including the exterior sector', () => {
    const g = geometry();
    const meta = { vertex: 'V', arms: [{ kind: 'point', pointId: 'A' }, { kind: 'point', pointId: 'B' }] as [AngleArm, AngleArm] };
    const inside = bisectorPointPosition({ ...g, lines: {} }, meta)!;
    expect(inside.x).toBeCloseTo(inside.y); expect(inside.x).toBeGreaterThan(0);
    const outside = bisectorPointPosition(g, { ...meta, exterior: true })!;
    expect(outside.x).toBeCloseTo(-inside.x); expect(outside.y).toBeCloseTo(-inside.y);
  });
  it('preserves arm sides while remapping copied dependencies', () => {
    const maps = { points: new Map([['V', 'V2'], ['A', 'A2']]), lines: new Map([['a', 'a2']]), circles: new Map<string, string>() };
    expect(remapAngleArm({ kind: 'line', lineId: 'a', direction: -1 }, maps)).toEqual({ kind: 'line', lineId: 'a2', direction: -1 });
    expect(remapAngleArm({ kind: 'point', pointId: 'A' }, maps)).toEqual({ kind: 'point', pointId: 'A2' });
  });
  it('recomputes a copied ray bisector from its own inputs after JSON reload', () => {
    const source: PointRuntime = { id: 'H', x: 1, y: 1, style: {}, construction_kind: 'bisect', bisectMeta: {
      vertex: 'V', arms: [{ kind: 'point', pointId: 'A' }, { kind: 'point', pointId: 'B' }]
    } };
    const maps = { points: new Map([['V', 'V2'], ['A', 'A2'], ['B', 'B2']]), lines: new Map<string, string>(), circles: new Map<string, string>() };
    const copy = { ...remapCopiedPointMetadata(source, maps), id: 'H2' };
    const { engine } = loadPersistedFixture(JSON.parse(JSON.stringify({ model: { points: [
      ...Object.values(geometry().points), { id: 'V2', x: 0, y: 0 }, { id: 'A2', x: 0, y: 100 }, { id: 'B2', x: -100, y: 0 }, source, copy
    ] } })));
    recomputeAll(engine);
    expect(engine.points.H.x).toBeGreaterThan(0); expect(engine.points.H.y).toBeGreaterThan(0);
    expect(engine.points.H2.x).toBeLessThan(0); expect(engine.points.H2.y).toBeGreaterThan(0);
    expect(engine.points.H2.geometryValid).toBe(true);
    engine.points.A2.x = -100; recomputeAll(engine);
    expect(engine.points.H2.x).toBeLessThan(-40); expect(engine.points.H.x).toBeCloseTo(48 / Math.sqrt(2));
  });
});
