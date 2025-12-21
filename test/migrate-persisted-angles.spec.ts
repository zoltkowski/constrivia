import { expect, test } from 'vitest';
import { migratePersistedAngles } from '../src/core/migratePersistedAngles';

test('migrate persisted angles assigns point1/vertex/point2 ids from numeric refs', () => {
  const model: any = {
    points: [ { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 } ],
    lines: [ { points: [0,1] }, { points: [1,2] } ],
    angles: [ { vertex: 0, leg1: { line: 0, otherPoint: 1 }, leg2: { line: 1, otherPoint: 2 } } ]
  };
  const migrated: any = migratePersistedAngles({ ...model });
  expect(Array.isArray(migrated.angles)).toBe(true);
  const ang: any = migrated.angles[0];
  expect(ang.point1).toBe('pt1');
  expect(ang.vertex).toBe('pt0');
  expect(ang.point2).toBe('pt2');
});
