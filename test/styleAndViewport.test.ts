import { describe, expect, it } from 'vitest';
import { pointInputPatch, strokeInputPatch } from '../src/ui/styleInputPatch';
import { fitBoundsInViewport } from '../src/ui/fitViewport';

describe('editing one style attribute', () => {
  it('preserves independent thickness, dashes, visibility and ticks on different parts', () => {
    const parts = [{ color: '#f00', width: 2, type: 'dashed' as const, hidden: true, tick: 1 }, { color: '#0f0', width: 8, type: 'solid' as const, tick: 2 }];
    const patch = strokeInputPatch('color', { color: '#00f', width: 2, type: 'dashed' });
    expect(parts.map(part => ({ ...part, ...patch }))).toEqual(parts.map(part => ({ ...part, color: '#00f' })));
    expect(strokeInputPatch('width', { color: '#00f', width: 5, type: 'solid' })).toEqual({ width: 5 });
    expect(strokeInputPatch('type', { color: '#00f', width: 5, type: 'dotted' })).toEqual({ type: 'dotted' });
    expect(pointInputPatch('color', { color: '#00f', width: 5 })).toEqual({ color: '#00f' });
    expect(pointInputPatch('width', { color: '#00f', width: 5 })).toEqual({ size: 5 });
    expect(pointInputPatch('type', { color: '#00f', width: 5 })).toEqual({});
  });
});

describe('fitting the available viewport', () => {
  it.each([{ left: 0, top: 70, right: 390, bottom: 680 }, { left: 0, top: 58, right: 844, bottom: 270 }])('keeps geometry and reserved handles clear of toolbars: %j', viewport => {
    const bounds = { left: -44, top: -44, right: 144, bottom: 544 };
    const fit = fitBoundsInViewport(bounds, viewport, 0.2, 4)!;
    expect(bounds.left * fit.zoom + fit.pan.x).toBeGreaterThan(viewport.left);
    expect(bounds.top * fit.zoom + fit.pan.y).toBeGreaterThan(viewport.top);
    expect(bounds.right * fit.zoom + fit.pan.x).toBeLessThan(viewport.right);
    expect(bounds.bottom * fit.zoom + fit.pan.y).toBeLessThan(viewport.bottom);
  });
});
