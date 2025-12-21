import { expect, test } from 'vitest';
import { persistedToRuntime, runtimeToPersisted } from '../src/core/convert';

test('polygon with vertices (ids) persisted->runtime->persisted roundtrip', () => {
  const doc: any = {
    model: {
      points: [
        { id: 'pt0', x: 0, y: 0 },
        { id: 'pt1', x: 10, y: 0 },
        { id: 'pt2', x: 10, y: 10 },
        { id: 'pt3', x: 0, y: 10 }
      ],
      lines: [
        { id: 'ln0', points: [0, 1], defining_points: [0, 1] },
        { id: 'ln1', points: [1, 2], defining_points: [1, 2] },
        { id: 'ln2', points: [2, 3], defining_points: [2, 3] },
        { id: 'ln3', points: [3, 0], defining_points: [3, 0] }
      ],
      polygons: [
        { id: 'poly0', vertices: ['pt0', 'pt1', 'pt2', 'pt3'] }
      ]
    }
  };

  const rt = persistedToRuntime(doc as any);
  const poly = rt.polygons['poly0'];
  expect(poly).toBeDefined();
  // vertices may be present on runtime polygon as ids or edgeLines computed
  expect(Array.isArray(poly.vertices) || Array.isArray(poly.edgeLines)).toBe(true);

  const persisted = runtimeToPersisted(rt as any);
  expect(Array.isArray((persisted.model as any).polygons)).toBe(true);
  const outPoly = (persisted.model as any).polygons[0];
  expect(outPoly).toBeDefined();
  expect(Array.isArray(outPoly.lines) || Array.isArray(outPoly.vertices)).toBe(true);
});
