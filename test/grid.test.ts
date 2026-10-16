import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GRID, GRID_SPACING, normalizeGridSettings, renderGrid, snapToGrid } from '../src/canvas/grid';

describe('graph paper', () => {
  it('snaps to the same world lattice across positive and negative coordinates, only while visible', () => {
    expect(snapToGrid({ x: 71, y: -49 }, DEFAULT_GRID)).toEqual({ x: 72, y: -48 });
    expect(snapToGrid({ x: 71, y: -49 }, { ...DEFAULT_GRID, visible: false })).toEqual({ x: 71, y: -49 });
    expect(snapToGrid({ x: 71, y: -49 }, { ...DEFAULT_GRID, dotsOnly: true })).toEqual({ x: 72, y: -48 });
  });

  it('loads old or malformed preferences safely and bounds imported sizes', () => {
    expect(normalizeGridSettings(null)).toEqual(DEFAULT_GRID);
    expect(normalizeGridSettings({ visible: false })).toEqual({ ...DEFAULT_GRID, visible: false });
    expect(normalizeGridSettings({ color: 'red', opacity: Infinity, width: -1, dotsOnly: 'yes' }))
      .toEqual({ ...DEFAULT_GRID, width: 0.25 });
    expect(normalizeGridSettings({ opacity: 4, width: 9 })).toMatchObject({ opacity: 1, width: 3 });
  });

  function context(zoom: number, dpr = 1, pan = { x: 13, y: -7 }) {
    return {
      canvas: { width: 240 * dpr, height: 120 * dpr },
      getTransform: () => ({ inverse: () => ({ transformPoint: (p: { x: number; y: number }) => ({
        x: (p.x / dpr - pan.x) / zoom, y: (p.y / dpr - pan.y) / zoom
      }) }) }),
      save: vi.fn(), restore: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
      lineWidth: 0, globalAlpha: 1, strokeStyle: '', fillStyle: ''
    };
  }

  it.each([1, 2])('keeps rendering and snapping aligned through pan, zoom and DPR %s', dpr => {
    for (const zoom of [0.2, 1, 4]) {
      const ctx = context(zoom, dpr);
      renderGrid(ctx as unknown as CanvasRenderingContext2D, { grid: DEFAULT_GRID, zoomFactor: zoom });
      const verticals = ctx.lineTo.mock.calls.filter(([x, y], i) => ctx.moveTo.mock.calls[i][0] === x).map(([x]) => x);
      expect(verticals[1] - verticals[0]).toBe(GRID_SPACING);
      expect(ctx.lineWidth * zoom).toBeCloseTo(DEFAULT_GRID.width);
      for (const [x, y] of ctx.moveTo.mock.calls) {
        expect(Math.abs(x % GRID_SPACING) < 1e-6 || Math.abs(y % GRID_SPACING) < 1e-6).toBe(true);
      }
    }
  });

  it('draws only intersection dots in dot mode and skips all drawing when hidden', () => {
    const ctx = context(1);
    renderGrid(ctx as unknown as CanvasRenderingContext2D, { grid: { ...DEFAULT_GRID, visible: false }, zoomFactor: 1 });
    expect(ctx.beginPath).not.toHaveBeenCalled();
    renderGrid(ctx as unknown as CanvasRenderingContext2D, { grid: { ...DEFAULT_GRID, dotsOnly: true }, zoomFactor: 1 });
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ctx.lineTo).not.toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
    for (const [x, y] of ctx.arc.mock.calls) expect(snapToGrid({ x, y }, DEFAULT_GRID)).toEqual({ x, y });
  });
});
