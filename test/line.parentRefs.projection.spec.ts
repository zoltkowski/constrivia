import { describe, it, expect } from 'vitest';
import { recomputeLinePointsWithReferences } from '../src/core/lineProjection';
import type { Point, StrokeStyle } from '../src/types';

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
    const points: Point[] = [
      makePoint('A', 0, 0),
      makePoint('B', 10, 0),
      makePoint('P', 15, 0, {
        construction_kind: 'on_object',
        parent_refs: [{ kind: 'line', id: lineId }]
      } as any)
    ];
    const line = { id: lineId, points: [0, 1], defining_points: [0, 1] };

    // Move the line up by 10 in-place (simulate drag of defining points)
    points[0] = { ...points[0], y: 10 };
    points[1] = { ...points[1], y: 10 };

    const updates = recomputeLinePointsWithReferences(points, line, (idx, p) =>
      (p?.parent_refs ?? []).some((ref: any) => ref.kind === 'line' && ref.id === lineId)
    );
    expect(updates).not.toBeNull();
    updates!.forEach(({ idx, pos }) => {
      points[idx] = { ...points[idx], ...pos };
    });

    expect(points[2].y).toBeCloseTo(10);
    expect(points[2].x).toBeCloseTo(15);
  });
});
