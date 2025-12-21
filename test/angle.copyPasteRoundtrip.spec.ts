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
  // Persisted output should use id-based angle fields (`arm*LineId`/`point*`)
  expect(outAng.arm1LineId).toBe('ln0');
  expect(outAng.arm2LineId).toBe('ln1');
  expect(outAng.point1).toBe('pt1');
  expect(outAng.point2).toBe('pt2');
});
