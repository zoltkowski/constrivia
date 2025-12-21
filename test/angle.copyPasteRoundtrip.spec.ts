import { expect, test } from 'vitest';
import { runtimeToPersisted } from '../src/core/convert';

test('runtime->persisted converts armLineId and point ids into numeric leg refs', () => {
  const runtime: any = {
    points: {
      pt0: { id: 'pt0', x: 0, y: 0 },
      pt1: { id: 'pt1', x: 10, y: 0 },
      pt2: { id: 'pt2', x: 10, y: 10 }
    },
    lines: {
      ln0: { id: 'ln0', pointIds: ['pt0', 'pt1'], definingPoints: ['pt0', 'pt1'] },
      ln1: { id: 'ln1', pointIds: ['pt1', 'pt2'], definingPoints: ['pt1', 'pt2'] }
    },
    circles: {},
    angles: {
      ang0: { id: 'ang0', vertex: 'pt0', point1: 'pt1', point2: 'pt2', arm1LineId: 'ln0', arm2LineId: 'ln1' }
    },
    polygons: {},
    labels: {},
    inkStrokes: {},
    idCounters: { point: 0, line: 0, circle: 0, angle: 0, polygon: 0 }
  };

  const persisted = runtimeToPersisted(runtime as any);
  expect(Array.isArray((persisted.model as any).angles)).toBe(true);
  const outAng = (persisted.model as any).angles[0];
  expect(outAng).toBeDefined();
  // leg1/leg2 should be numeric indices referring to lines array
  expect(typeof outAng.leg1.line).toBe('number');
  expect(typeof outAng.leg2.line).toBe('number');
  // otherPoint should be numeric indices referring to points
  expect(typeof outAng.leg1.otherPoint).toBe('number');
  expect(typeof outAng.leg2.otherPoint).toBe('number');
  // Verify mapping corresponds to the original ids (line indices 0 and 1)
  expect(outAng.leg1.line).toBe(0);
  expect(outAng.leg2.line).toBe(1);
});
