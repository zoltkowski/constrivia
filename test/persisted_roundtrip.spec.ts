import { expect, test } from 'vitest';
import { persistedToRuntime, runtimeToPersisted } from '../src/core/convert';

test('midpoint persisted->runtime->persisted roundtrip', () => {
  const doc: any = {
    model: {
      points: [
        { id: 'pt0', x: 0, y: 0 },
        { id: 'pt1', x: 10, y: 0 },
        { id: 'pt2', x: 5, y: 0, midpoint: { parents: [0, 1] } }
      ],
      lines: []
    }
  };
  const rt = persistedToRuntime(doc as any);
  expect(rt.points['pt2'].midpointMeta).toBeDefined();
  expect(rt.points['pt2'].midpointMeta?.parents).toEqual(['pt0', 'pt1']);
  const persisted = runtimeToPersisted(rt as any);
  expect((persisted.model as any).points[2].midpoint).toBeDefined();
  const parents = (persisted.model as any).points[2].midpoint.parents;
  expect(Array.isArray(parents)).toBe(true);
});

test('bisect persisted->runtime->persisted roundtrip', () => {
  const doc: any = {
    model: {
      points: [
        { id: 'pt0', x: 0, y: 0 },
        { id: 'pt1', x: 10, y: 0 },
        { id: 'pt2', x: 5, y: 5 }
      ],
      lines: [
        { id: 'ln0', points: [0, 1], defining_points: [0, 1] }
      ],
      // bisect point uses legacy seg object
      points_additional: [],
      // We'll place bisect metadata on pt2
      // but persistedToRuntime expects it under p.bisect
    }
  };
  // attach bisect metadata to pt2
  (doc.model.points[2] as any).bisect = { vertex: 2, seg1: { line: 0, seg: 0 }, seg2: { a: 0, b: 1 }, epsilon: 0.1 };

  const rt = persistedToRuntime(doc as any);
  expect(rt.points['pt2'].bisectMeta).toBeDefined();
  const bm = rt.points['pt2'].bisectMeta;
  expect(bm?.seg1?.a).toBe('pt0');
  expect(bm?.seg2?.a).toBe('pt0');

  const persisted = runtimeToPersisted(rt as any);
  const outPoint = (persisted.model as any).points.find((p: any) => p && p.bisect);
  expect(outPoint).toBeDefined();
  expect(outPoint.bisect).toBeDefined();
});

test('symmetric persisted->runtime->persisted roundtrip', () => {
  const doc: any = {
    model: {
      points: [
        { id: 'pt0', x: 0, y: 0 },
        { id: 'pt1', x: 10, y: 0 }
      ],
      lines: [ { id: 'ln0', points: [0,1], defining_points: [0,1] } ]
    }
  };
  // create a persisted symmetric entry on pt1 mirroring to line index 0
  (doc.model.points[1] as any).symmetric = { source: 0, mirror: { kind: 'line', id: 0 } };

  const rt = persistedToRuntime(doc as any);
  expect(rt.points['pt1'].symmetricMeta).toBeDefined();
  expect(rt.points['pt1'].symmetricMeta?.mirror?.id).toBe('ln0');

  const persisted = runtimeToPersisted(rt as any);
  const outPt = (persisted.model as any).points.find((p: any) => p && p.symmetric);
  expect(outPt).toBeDefined();
  expect(outPt.symmetric).toBeDefined();
});
