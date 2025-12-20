import { describe, it, expect } from 'vitest';
import { arrayToMap, mapToArray } from '../src/maps';

describe('maps utilities', () => {
  it('converts array to map and back preserving order', () => {
    const arr = [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 }
    ];
    const m = arrayToMap(arr, (x) => x.id);
    expect(m.size).toBe(2);
    const out = mapToArray(m);
    expect(out).toEqual(arr);
  });
});
