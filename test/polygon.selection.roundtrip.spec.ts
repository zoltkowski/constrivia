import { expect, test } from 'vitest';
import { persistedToRuntime, runtimeToPersisted } from '../src/core/convert';

test('polygon selection persisted->runtime->persisted roundtrip (ids)', () => {
  const doc: any = {
    model: {
      points: [
        { id: 'pt0', x: 0, y: 0 },
        { id: 'pt1', x: 10, y: 0 },
        { id: 'pt2', x: 10, y: 10 }
      ],
      lines: [
        { id: 'ln0', points: ['pt0', 'pt1'], defining_points: ['pt0', 'pt1'] },
        { id: 'ln1', points: ['pt1', 'pt2'], defining_points: ['pt1', 'pt2'] },
        { id: 'ln2', points: ['pt2', 'pt0'], defining_points: ['pt2', 'pt0'] }
      ],
      polygons: [
        { id: 'poly0', lines: ['ln0', 'ln1', 'ln2'] }
      ]
    }
  };

  const rt = persistedToRuntime(doc as any);
  // runtime should contain polygon with edgeLines set
  const polyRt = (rt as any).polygons['poly0'];
  expect(polyRt).toBeDefined();
  expect(Array.isArray(polyRt.edgeLines)).toBe(true);
  expect(polyRt.edgeLines).toEqual(['ln0', 'ln1', 'ln2']);

  const persisted = runtimeToPersisted(rt as any);
  expect(Array.isArray((persisted.model as any).polygons)).toBe(true);
  const outPoly = (persisted.model as any).polygons[0];
  expect(outPoly).toBeDefined();
  // persisted output should map edge lines to numeric indices
  expect(Array.isArray(outPoly.lines)).toBe(true);
  expect(outPoly.lines).toEqual([0,1,2]);
});
