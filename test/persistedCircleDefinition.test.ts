import { describe, expect, it } from 'vitest';
import { circleKindForPersistence, inferPersistedCircleKind } from '../src/persisted/circleDefinition';

describe('persisted circle definitions', () => {
  it('writes an explicit kind for both runtime circle forms', () => {
    expect(circleKindForPersistence('center-radius')).toBe('center-radius');
    expect(circleKindForPersistence('three-point')).toBe('three-point');
    expect(circleKindForPersistence()).toBe('center-radius');
  });

  it('preserves explicit kinds on import', () => {
    expect(inferPersistedCircleKind({
      circle_kind: 'center-radius', center: 'o', defining_points: ['o', 'r', 'r']
    })).toBe('center-radius');
    expect(inferPersistedCircleKind({
      circle_kind: 'three-point', center: 'o', defining_points: ['a', 'b', 'c']
    })).toBe('three-point');
  });

  it('recognizes legacy center-radius triples that include their own center', () => {
    expect(inferPersistedCircleKind({ center: 'o', defining_points: ['o', 'r', 'r'] }))
      .toBe('center-radius');
  });

  it('keeps legacy three-point circles whose defining points exclude the center', () => {
    expect(inferPersistedCircleKind({ center: 'o', defining_points: ['a', 'b', 'c'] }))
      .toBe('three-point');
  });

  it('leaves legacy documents without a usable defining triple unresolved', () => {
    expect(inferPersistedCircleKind({ center: 'o' })).toBeUndefined();
  });
});
