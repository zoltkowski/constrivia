import { describe, it, expect } from 'vitest';
import { modelToRuntime, runtimeToModel } from '../src/core/runtimeAdapter';
import type { Point, Line } from '../src/types';

describe('runtimeAdapter', () => {
  it('converts model -> runtime -> model (basic)', () => {
    const p0: Point = {
      id: 'pt0',
      object_type: 'point',
      x: 10,
      y: 20,
      style: { color: '#000', size: 3 },
      construction_kind: 'free',
      parent_refs: [],
      defining_parents: [],
      recompute() {},
      on_parent_deleted() {}
    };
    const p1: Point = {
      id: 'pt1',
      object_type: 'point',
      x: 30,
      y: 40,
      style: { color: '#000', size: 3 },
      construction_kind: 'free',
      parent_refs: [],
      defining_parents: [],
      recompute() {},
      on_parent_deleted() {}
    };
    const l0: Line = {
      id: 'ln0',
      object_type: 'line',
      points: [0, 1],
      defining_points: [0, 1],
      segmentStyles: [],
      segmentKeys: [],
      leftRay: { color: '#000', width: 1, type: 'solid', hidden: true },
      rightRay: { color: '#000', width: 1, type: 'solid', hidden: true },
      style: { color: '#000', width: 1, type: 'solid' },
      construction_kind: 'free',
      defining_parents: [],
      recompute() {},
      on_parent_deleted() {}
    };

    const model: any = {
      points: [p0, p1],
      lines: [l0],
      circles: [],
      angles: [],
      polygons: [],
      inkStrokes: [],
      labels: [],
      idCounters: { point: 1, line: 1, circle: 0, angle: 0, polygon: 0 },
      indexById: { point: { pt0: 0, pt1: 1 }, line: { ln0: 0 }, circle: {}, angle: {}, polygon: {} }
    };

    const rt = modelToRuntime(model);
    expect(Object.keys(rt.points)).toHaveLength(2);
    expect(rt.lines['ln0']).toBeDefined();
    expect(rt.lines['ln0'].pointIds).toContain('pt0');

    const model2 = runtimeToModel(rt as any);
    expect(model2.points.length).toBe(2);
    expect(model2.lines.length).toBe(1);
    expect(model2.points[0].id).toBe('pt0');
    expect(model2.points[0].x).toBeCloseTo(10);
    expect(model2.lines[0].points[0]).toBe(0);
  });
});
