import { expect, test } from 'vitest';
import { modelToRuntime } from '../src/core/modelToRuntime';

test('modelToRuntime handles mixed id/number angle leg.line references', () => {
  const model: any = {
    points: [ { id: 'p1', x:0, y:0 }, { id: 'p2', x:1, y:0 } ],
    lines: [ { id: 'ln1' }, { id: 'ln2' } ],
    circles: [],
    angles: [
      {
        id: 'a1',
        vertex: 0,
        leg1: { line: 'ln1', otherPoint: 0 },
        leg2: { line: 1, otherPoint: 1 }
      }
    ],
    polygons: [],
    inkStrokes: [],
    labels: [],
    idCounters: {}
  };

  const rt: any = modelToRuntime(model as any);
  const ang = rt.angles['a1'];
  expect(ang).toBeDefined();
  // leg1 was provided as a string id -> modelToRuntime does not set arm1LineId (numeric case only)
  expect(ang.arm1LineId).toBeUndefined();
  // leg2 was provided as numeric index -> runtime should map it to the corresponding line id
  expect(ang.arm2LineId).toBe('ln2');
});
