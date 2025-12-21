import { describe, it, expect } from 'vitest';
import { applyLineFractionsEngine, recomputePerpendicularLineEngine, updatePerpendicularLinesForPoint as engineUpdatePerpendicularLinesForPoint, updatePerpendicularLinesForLine as engineUpdatePerpendicularLinesForLine } from '../src/core/engine';

function idMap(ids: string[]) {
  return (id: string) => {
    const idx = ids.indexOf(id);
    return idx === -1 ? null : idx;
  };
}

describe('engine extras', () => {
  it('applyLineFractionsEngine moves interior points according to fractions', () => {
    const points: any[] = [
      { x: 0, y: 0, id: 'p0', style: { color: '#000', size: 4, hidden: false }, construction_kind: 'free' },
      { x: 50, y: 0, id: 'p1', style: { color: '#000', size: 4, hidden: false }, construction_kind: 'free' },
      { x: 100, y: 0, id: 'p2', style: { color: '#000', size: 4, hidden: false }, construction_kind: 'free' }
    ];
    const line: any = {
      object_type: 'line',
      id: 'L',
      points: [0, 1, 2],
      defining_points: [0, 2],
      style: { color: '#000', width: 1 },
      segmentStyles: [],
      segmentKeys: [],
      leftRay: { color: '#000', width: 1, hidden: false },
      rightRay: { color: '#000', width: 1, hidden: false },
      hidden: false,
      construction_kind: 'free',
      defining_parents: [],
      recompute: () => {},
      on_parent_deleted: () => {}
    };
    const lines = [line];
    // Move middle point to 25% along the segment
    const fractions = [0, 0.25, 1];
    const res = applyLineFractionsEngine(points, lines, 0, fractions);
    expect(res).not.toBeNull();
    if (!res) return;
    const moved = res.positions.get(1);
    expect(moved).toBeDefined();
    expect(moved!.x).toBeCloseTo(25, 6);
    expect(moved!.y).toBeCloseTo(0, 6);
    expect(res.touched).toContain(1);
  });

  it('recomputePerpendicularLineEngine returns ensureDefining and positions for helper', () => {
    const points: any[] = [
      { x: 0, y: 0, id: 'a', style: { color: '#000', size: 4, hidden: false }, construction_kind: 'free' },
      { x: 0, y: 50, id: 'h', style: { color: '#000', size: 4, hidden: false }, construction_kind: 'free' },
      { x: -10, y: 0, id: 'b1', style: { color: '#000', size: 4, hidden: false }, construction_kind: 'free' },
      { x: 10, y: 0, id: 'b2', style: { color: '#000', size: 4, hidden: false }, construction_kind: 'free' }
    ];
    const baseLine: any = {
      object_type: 'line',
      id: 'L',
      points: [2, 3],
      defining_points: [2, 3],
      style: { color: '#000', width: 1 },
      segmentStyles: [],
      segmentKeys: [],
      leftRay: { color: '#000', width: 1, hidden: false },
      rightRay: { color: '#000', width: 1, hidden: false },
      hidden: false,
      construction_kind: 'free',
      defining_parents: [],
      recompute: () => {},
      on_parent_deleted: () => {}
    };
    const perpLine: any = {
      object_type: 'line',
      id: 'P',
      points: [0], // only through point present initially
      defining_points: [0,1],
      style: { color: '#000', width: 1, dashed: false },
      segmentStyles: [],
      segmentKeys: [],
      leftRay: { color: '#000', width: 1, hidden: false },
      rightRay: { color: '#000', width: 1, hidden: false },
      hidden: false,
      construction_kind: 'perpendicular',
      defining_parents: [],
      perpendicular: {
        throughPoint: 'a',
        helperPoint: 'h',
        referenceLine: 'L'
      } as any,
      recompute: () => {},
      on_parent_deleted: () => {}
    };
    const lines = [baseLine, perpLine];

    const ids = points.map((p) => p.id || '');
    const helpers = {
      pointIndexById: idMap(ids),
      lineIndexById: (id: string) => {
        if (id === 'L') return 0;
        if (id === 'P') return 1;
        return null;
      },
      primaryLineDirection: (line: any) => {
        // simple implementation: direction from first to last point
        const a = points[line.points[0]];
        const b = points[line.points[line.points.length - 1]];
        if (!a || !b) return null;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        return { dir: { x: dx / len, y: dy / len }, length: len };
      },
      constrainToCircles: (_idx: number, target: { x: number; y: number }) => target,
      lineLength: (lineIdx: number) => {
        const ln = lines[lineIdx];
        if (!ln) return null;
        const a = points[ln.points[0]];
        const b = points[ln.points[ln.points.length - 1]];
        if (!a || !b) return null;
        return Math.hypot(b.x - a.x, b.y - a.y);
      }
    } as any;

    const res = recomputePerpendicularLineEngine(points, lines, 1, helpers);
    expect(res).not.toBeNull();
    if (!res) return;
    expect(res.ensureDefining).toBeDefined();
    expect(res.ensureDefining!.defining_points).toEqual([0, 1]);
    expect(res.ensureDefining!.insertHelper).toBe(true);
  });

  it('engineUpdatePerpendicularLinesForPoint triggers recompute for matching lines', () => {
    const points: any[] = [{ id: 'p0' }, { id: 'p1' }];
    const lines: any[] = [
      { id: 'L1', perpendicular: { throughPoint: 'p0', helperPoint: 'x' }, points: [0, 0] },
      { id: 'L2', perpendicular: { throughPoint: 'p1', helperPoint: 'y' }, points: [0, 0] },
      { id: 'L3', perpendicular: { throughPoint: 'p0', helperPoint: 'p1' }, points: [0, 0] }
    ];
    const calls: number[] = [];
    engineUpdatePerpendicularLinesForPoint(points, lines, 0, (li: any) => calls.push(li));
    expect(calls.sort()).toEqual([0, 2]);
  });

  it('engineUpdatePerpendicularLinesForLine triggers recompute for referencing lines', () => {
    const lines: any[] = [
      { id: 'Base', perpendicular: undefined, points: [0, 1] },
      { id: 'Ref1', perpendicular: { referenceLine: 'Base' }, points: [0, 1] },
      { id: 'Ref2', perpendicular: { referenceLine: 'Base' }, points: [0, 1] },
      { id: 'Other', perpendicular: { referenceLine: 'X' }, points: [0, 1] }
    ];
    const calls: number[] = [];
    engineUpdatePerpendicularLinesForLine(lines, 0, (li: any) => calls.push(li));
    expect(calls.sort()).toEqual([1, 2]);
  });
});
