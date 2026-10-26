import { describe, expect, it } from 'vitest';
import { compareFiles, fileTimestamp } from '../src/ui/fileSorting';

describe('file list sorting', () => {
  it('sorts names alphabetically using Polish letters and natural numbers', () => {
    const names = ['żaba.ctr', 'plik10.ctr', 'Zamek.ctr', 'ącki.ctr', 'plik2.ctr', 'Ala.ctr'];
    expect(names.sort((a, b) => compareFiles({ name: a }, { name: b }, 'name')))
      .toEqual(['Ala.ctr', 'ącki.ctr', 'plik2.ctr', 'plik10.ctr', 'Zamek.ctr', 'żaba.ctr']);
  });
  it('puts newer dates first, missing dates last, and breaks ties by name', () => {
    const files = [{ name: 'old' }, { name: 'z', modifiedAt: 200 }, { name: 'a', modifiedAt: 200 }, { name: 'older', modifiedAt: 100 }, { name: 'epoch', modifiedAt: 0 }];
    expect(files.sort((a, b) => compareFiles(a, b, 'date')).map(file => file.name)).toEqual(['a', 'z', 'older', 'epoch', 'old']);
  });
  it('ignores invalid timestamps instead of treating them as recent files', () => {
    for (const value of [undefined, null, '', '2026-10-27', Infinity, NaN, -1]) expect(fileTimestamp(value)).toBeUndefined();
    expect(fileTimestamp(0)).toBe(0);
    expect(compareFiles({ name: 'unknown', modifiedAt: Infinity }, { name: 'dated', modifiedAt: 1 }, 'date')).toBeGreaterThan(0);
  });
});
