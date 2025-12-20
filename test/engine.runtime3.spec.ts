import { describe, it, expect } from 'vitest';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { angleBaseGeometryRuntime, getVertexOnLegRuntime } from '../src/core/engine';

describe('angle runtime helpers', () => {
  it('getVertexOnLegRuntime picks nearest point on line', () => {
    const rt = makeEmptyRuntime();
    rt.points['A'] = { id: 'A', x: 0, y: 0, constructionKind: 'free', parents: [] } as any;
    rt.points['B'] = { id: 'B', x: 10, y: 0, constructionKind: 'free', parents: [] } as any;
    rt.points['C'] = { id: 'C', x: 0, y: 10, constructionKind: 'free', parents: [] } as any;
    rt.lines['l0'] = { id: 'l0', definingPoints: ['A', 'B'], pointIds: ['A', 'B'] } as any;

    const other = getVertexOnLegRuntime({ line: 'l0' }, 'C', rt);
    expect(['A', 'B']).toContain(other);
  });

  it('angleBaseGeometryRuntime returns vectors and angles', () => {
    const rt = makeEmptyRuntime();
    rt.points['O'] = { id: 'O', x: 0, y: 0, constructionKind: 'free', parents: [] } as any;
    rt.points['X'] = { id: 'X', x: 10, y: 0, constructionKind: 'free', parents: [] } as any;
    rt.points['Y'] = { id: 'Y', x: 0, y: 10, constructionKind: 'free', parents: [] } as any;
    rt.lines['lx'] = { id: 'lx', definingPoints: ['O', 'X'], pointIds: ['O', 'X'] } as any;
    rt.lines['ly'] = { id: 'ly', definingPoints: ['O', 'Y'], pointIds: ['O', 'Y'] } as any;
    const angleObj: any = { vertex: 'O', arm1LineId: 'lx', arm2LineId: 'ly' };

    const res = angleBaseGeometryRuntime(angleObj, rt);
    expect(res).not.toBeNull();
    if (res) {
      expect(res.v.x).toBeCloseTo(0);
      expect(res.p1.x).toBeCloseTo(10);
      expect(res.p2.y).toBeCloseTo(10);
      // ang1 near 0, ang2 near pi/2
      expect(res.ang1).toBeCloseTo(0, 3);
      expect(res.ang2).toBeCloseTo(Math.PI / 2, 3);
    }
  });
});
