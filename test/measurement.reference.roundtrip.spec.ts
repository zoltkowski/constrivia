import { expect, test } from 'vitest';
import { persistedToRuntime, runtimeToPersisted } from '../src/core/convert';

test('measurement reference persisted->runtime->persisted roundtrip', () => {
  const doc: any = {
    model: {
      points: [
        { id: 'pt0', x: 0, y: 0 },
        { id: 'pt1', x: 10, y: 0 }
      ],
      lines: [ { id: 'ln0', points: [0,1], defining_points: [0,1] } ]
    },
    measurementReferenceSegment: '0:0',
    measurementReferenceValue: 5
  };

  const rt = persistedToRuntime(doc as any);
  expect((rt as any).measurementReference).toBeDefined();
  const mr = (rt as any).measurementReference as { lineId: string; segIdx: number };
  expect(mr.lineId).toBe('ln0');
  expect(mr.segIdx).toBe(0);
  expect((rt as any).measurementReferenceValue).toBe(5);

  const persisted = runtimeToPersisted(rt as any);
  expect((persisted as any).measurementReferenceSegment).toBe('0:0');
  expect((persisted as any).measurementReferenceValue).toBe(5);
});
