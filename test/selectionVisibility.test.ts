import { describe, expect, it, vi } from 'vitest';
import { renderMultiselectOverlays } from '../src/canvas/renderer';

function makeHarness(showHidden: boolean) {
  const ctx = {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    translate: vi.fn(), scale: vi.fn(), arc: vi.fn()
  } as unknown as CanvasRenderingContext2D;
  const runtime = {
    points: {
      a: { id: 'a', x: 0, y: 0 }, b: { id: 'b', x: 10, y: 0 },
      c: { id: 'c', x: 0, y: 10 }, d: { id: 'd', x: 10, y: 10 }, e: { id: 'e', x: 20, y: 10 }
    },
    lines: {
      hiddenLine: { id: 'hiddenLine', points: ['a', 'b'], defining_points: ['a', 'b'], style: {}, hidden: true },
      segmented: {
        id: 'segmented', points: ['c', 'd', 'e'], defining_points: ['c', 'e'], style: {},
        segmentStyles: [{ hidden: true }, {}]
      }
    }, circles: {}, angles: {}, polygons: {}, labels: {}, inkStrokes: {}, idCounters: {}
  };

  renderMultiselectOverlays(ctx, runtime, {
    THEME: { defaultStroke: '#000', lineWidth: 1, highlight: '#f00', selectionPointRadius: 4, pointSize: 4 },
    showHidden,
    multiSelectedPoints: new Set(),
    multiSelectedLines: new Set(['hiddenLine', 'segmented']),
    multiSelectedCircles: new Set(),
    multiSelectedAngles: new Set(),
    multiSelectedInkStrokes: new Set(),
    zoomFactor: 1,
    renderWidth: (width) => width,
    applySelectionStyle: vi.fn()
  });
  return vi.mocked(ctx.lineTo);
}

describe('multiselect line visibility', () => {
  it('omits hidden lines and segments unless showHidden is enabled', () => {
    const visible = makeHarness(false);
    expect(visible.mock.calls).toEqual([[20, 10]]);
    expect(makeHarness(true)).toHaveBeenCalledTimes(3);
  });
});
