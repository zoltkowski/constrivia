import { describe, it, expect } from 'vitest';
import { Model } from '../src/model';
import type { Point } from '../src/types';

describe('model basic conversion', () => {
  it('fromArray/toArray roundtrip', () => {
    const p: Point = {
      id: 'pt0',
      object_type: 'point',
      x: 0,
      y: 0,
      style: { color: 'black', size: 3 },
      construction_kind: 'free',
      parent_refs: [],
      defining_parents: [],
      recompute() {},
      on_parent_deleted() {}
    };

    const m = Model.fromArray({ points: [p] });
    const arr = m.getPointsArray();
    expect(arr.length).toBe(1);
    expect(arr[0].id).toBe('pt0');
  });
});
