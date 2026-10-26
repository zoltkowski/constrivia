import { describe, expect, it } from 'vitest';
import { readAnimationSettings } from '../src/persisted/animationSettings';
import { packMultipageDocument, readMultipageDocument } from '../src/persisted/multipageDocument';

describe('saved animation settings', () => {
  const ids = new Set(['a', 'b']);
  it('restores speeds, both directions and loop without accepting trace data', () => {
    const motions = [{ pointId: 'a', speed: 0.5, direction: -1 }, { pointId: 'b', speed: 0, direction: 1 }];
    expect(readAnimationSettings({ loop: true, motions, traces: [1, 2] }, ids)).toEqual({ loop: true, motions });
  });
  it('keeps legacy documents optional and supports an enabled mode without motions', () => {
    for (const raw of [undefined, null, 5, {}, { motions: null }]) expect(readAnimationSettings(raw, ids)).toBeNull();
    expect(readAnimationSettings({ motions: [] }, ids)).toEqual({ loop: false, motions: [] });
    expect(readAnimationSettings({ enabled: false, loop: true, motions: [{ pointId: 'a', speed: 1, direction: -1 }] }, ids))
      .toEqual({ enabled: false, loop: true, motions: [{ pointId: 'a', speed: 1, direction: -1 }] });
  });
  it('ignores invalid speeds, directions and references to missing points', () => {
    const motions = [null, { pointId: 'missing', speed: 1, direction: 1 },
      ...[-1, NaN, Infinity, '2'].map(speed => ({ pointId: 'a', speed, direction: 1 })),
      { pointId: 'a', speed: 2, direction: 0 }, { pointId: 'b', speed: 3, direction: -1 }];
    expect(readAnimationSettings({ loop: 'true', motions }, ids)).toEqual({ loop: false, motions: [{ pointId: 'b', speed: 3, direction: -1 }] });
  });
  it('retains independent animation settings on each saved page', () => {
    const animation = { loop: true, motions: [{ pointId: 'a', speed: 2, direction: -1 as const }] };
    const packed = packMultipageDocument([{ model: {}, animation }, { model: {} }], 0);
    const pages = readMultipageDocument(JSON.parse(JSON.stringify(packed)))!.pages;
    expect(pages[0].animation).toEqual(animation);
    expect(pages[1].animation).toBeUndefined();
  });
  it('keeps plain and differently animated pages independent of the active page', () => {
    const first = { loop: true, motions: [{ pointId: 'a', speed: 60, direction: 1 as const }] };
    const second = { loop: false, motions: [{ pointId: 'a', speed: 30, direction: -1 as const }] };
    const pages = [{ model: {} }, { model: {}, animation: first }, { model: {}, animation: second }];
    for (let activePage = 0; activePage < pages.length; activePage++) {
      const packed = JSON.parse(JSON.stringify(packMultipageDocument(pages, activePage)));
      expect(packed.animation).toEqual(pages[activePage].animation);
      expect(readMultipageDocument(packed)).toEqual({ pages, index: activePage });
      expect(packed.pages[0].animation).toBeUndefined();
    }
  });
});
