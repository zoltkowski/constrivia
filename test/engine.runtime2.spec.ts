import { describe, it, expect } from 'vitest';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { segmentKeyForPointsRuntime, findLineIdForSegmentRuntime, reorderLinePointIdsRuntime } from '../src/core/engine';

describe('engine runtime helpers', () => {
  it('segment key produces sorted key', () => {
    expect(segmentKeyForPointsRuntime('ptA', 'ptB')).toBe('ptA-ptB');
    expect(segmentKeyForPointsRuntime('ptZ', 'ptA')).toBe('ptA-ptZ');
  });

  it('finds line id for segment and reorders points', () => {
    const rt = makeEmptyRuntime();
    rt.points['ptA'] = { id: 'ptA', x: 0, y: 0, constructionKind: 'free', parents: [] } as any;
    rt.points['ptB'] = { id: 'ptB', x: 10, y: 0, constructionKind: 'free', parents: [] } as any;
    rt.points['ptC'] = { id: 'ptC', x: 5, y: 0, constructionKind: 'free', parents: [] } as any;
    rt.lines['ln0'] = { id: 'ln0', definingPoints: ['ptA', 'ptB'], pointIds: ['ptB', 'ptC', 'ptA'] } as any;

    const found = findLineIdForSegmentRuntime('ptA', 'ptC', rt);
    expect(found).toBe('ln0');

    const ordered = reorderLinePointIdsRuntime('ln0', rt);
    expect(ordered).toEqual(['ptA', 'ptC', 'ptB']);
  });
});
