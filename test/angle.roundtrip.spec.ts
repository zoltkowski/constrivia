import { expect, test } from 'vitest';
import { persistedToRuntime, runtimeToPersisted } from '../src/core/convert';

test('persisted->runtime handles mixed numeric/string leg refs for angles', () => {
  const doc: any = {
    model: {
      points: [
        { id: 'pt0', x: 0, y: 0 },
        { id: 'pt1', x: 10, y: 0 },
        { id: 'pt2', x: 10, y: 10 }
      ],
      lines: [
        { id: 'ln0', points: [0, 1], defining_points: [0, 1] },
        { id: 'ln1', points: [1, 2], defining_points: [1, 2] }
      ],
      angles: [
        // leg1 uses string id, leg2 uses numeric index referring to lines array
        { id: 'ang0', vertex: 0, leg1: { line: 'ln0', seg: 0 }, leg2: { line: 1, seg: 0 } }
      ]
    }
  };

  const rt = persistedToRuntime(doc as any);
  const ang = rt.angles['ang0'];
  expect(ang).toBeDefined();
  expect(ang.arm1LineId).toBe('ln0');
  expect(ang.arm2LineId).toBe('ln1');
  expect(ang.vertex).toBe('pt0');
  // Roundtrip back to persisted should produce a model with an angles entry
  const persisted = runtimeToPersisted(rt as any);
  expect(Array.isArray((persisted.model as any).angles)).toBe(true);
  const outAng = (persisted.model as any).angles[0];
  // leg1/leg2 should be numeric indices in persisted form (legacy), but resolve to defined lines
  expect(outAng.leg1).toBeDefined();
  expect(outAng.leg2).toBeDefined();
});
