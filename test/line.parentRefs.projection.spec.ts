import { describe, it, expect } from 'vitest';
import { recomputeLinePointsWithReferences } from '../src/core/lineProjection';
import type { Point, StrokeStyle } from '../src/core/runtimeTypes';

const style: StrokeStyle = { color: '#000', width: 1, type: 'solid' };

function makePoint(id: string, x: number, y: number, opts?: Partial<Point>): Point {
  return {
    id,
    object_type: 'point',
    x,
    y,
    style,
    label: undefined,
    construction_kind: 'free',
    parent_refs: [],
    defining_parents: [],
    recompute: () => {},
    on_parent_deleted: () => {},
    ...opts
  } as Point;
}

describe('recomputeLinePointsWithReferences', () => {
  it('moves points that reference a line when the line is translated', () => {
    const lineId = 'l1';
    const points: Record<string, Point> = {
      A: makePoint('A', 0, 0),
      B: makePoint('B', 10, 0),
      P: makePoint('P', 15, 0, {
        construction_kind: 'on_object',
        parent_refs: [{ kind: 'line', id: lineId }]
      } as any)
    };
    const line = { id: lineId, pointIds: ['A', 'B'], definingPoints: ['A', 'B'] };

    // Move the line up by 10 in-place (simulate drag of defining points)
    points.A = { ...points.A, y: 10 };
    points.B = { ...points.B, y: 10 };

    const updates = recomputeLinePointsWithReferences(points, line, (_id, p) =>
      (p?.parent_refs ?? []).some((ref: any) => ref.kind === 'line' && ref.id === lineId)
    );
    expect(updates).not.toBeNull();
    updates!.forEach(({ id, pos }) => {
      const key = id as keyof typeof points;
      points[key] = { ...points[key], ...pos };
    });

    expect(points.P.y).toBeCloseTo(10);
    expect(points.P.x).toBeCloseTo(15);
  });
});
