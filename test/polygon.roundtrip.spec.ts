import { expect, test } from 'vitest';
import { persistedToRuntime, runtimeToPersisted } from '../src/core/convert';

test('polygon persisted->runtime->persisted roundtrip', () => {
  const doc: any = {
    model: {
      points: [
        { id: 'pt0', x: 0, y: 0 },
        { id: 'pt1', x: 10, y: 0 },
        { id: 'pt2', x: 10, y: 10 }
      ],
      lines: [
        { id: 'ln0', points: [0, 1], defining_points: [0, 1] },
        { id: 'ln1', points: [1, 2], defining_points: [1, 2] },
        { id: 'ln2', points: [2, 0], defining_points: [2, 0] }
      ],
      polygons: [
        { id: 'poly0', lines: [0, 1, 2] }
      ]
    }
  };

  const rt = persistedToRuntime(doc as any);
  const poly = rt.polygons['poly0'];
  expect(poly).toBeDefined();
  expect(Array.isArray(poly.edgeLines)).toBe(true);
  expect(poly.edgeLines).toContain('ln0');

  const persisted = runtimeToPersisted(rt as any);
  expect(Array.isArray((persisted.model as any).polygons)).toBe(true);
  const outPoly = (persisted.model as any).polygons[0];
  expect(outPoly).toBeDefined();
  expect(Array.isArray(outPoly.lines)).toBe(true);
});
