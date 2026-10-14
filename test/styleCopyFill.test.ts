import { describe, expect, it } from 'vitest';
import { createStyleSelectionHandlers } from '../src/ui/styleSelection';

function makeHandlers(objects: { polygons: Record<string, any>; circles?: Record<string, any> }) {
  let selectedId: string | null = null;
  let selectedKind: 'polygon' | 'circle' = 'polygon';
  const deps = {
    getSelection: () => ({
      selectedPointId: null,
      selectedLineId: null,
      selectedCircleId: selectedKind === 'circle' ? selectedId : null,
      selectedAngleId: null,
      selectedPolygonId: selectedKind === 'polygon' ? selectedId : null,
      selectedLabel: null,
      selectedInkStrokeId: null,
      selectedSegments: new Set<string>(),
      selectedArcSegments: new Set<string>(),
      multiSelectedLabels: new Set<string>()
    }),
    getPointById: () => null,
    getLineById: () => null,
    getPolygonById: (id: string) => objects.polygons[id] ?? null,
    polygonLines: () => [],
    polygonEdgeSegmentKeys: () => new Set<string>(),
    getCircleById: (id: string) => objects.circles?.[id] ?? null,
    getAngleById: () => null,
    getLabelById: () => null,
    getInkStrokeById: () => null,
    parseSegmentKey: () => null,
    parseArcKey: () => null,
    arcKey: () => '',
    circleArcs: () => [],
    ensureSegmentStylesForLine: () => {},
    ensureArcStyles: () => {},
    normalizeLabelFontDelta: (value?: number) => value ?? 0,
    draw: () => {},
    pushHistory: () => {}
  } as any;
  const handlers = createStyleSelectionHandlers(deps);
  return {
    ...handlers,
    select(kind: 'polygon' | 'circle', id: string) {
      selectedKind = kind;
      selectedId = id;
    }
  };
}

describe('copying polygon fill styles', () => {
  it('preserves a filled source with default opacity and resets a target custom opacity', () => {
    const polygons = {
      source: { id: 'source', fill: '#d6e4ff' },
      target: { id: 'target', fill: '#ff0000', fillOpacity: 0.35 }
    };
    const handlers = makeHandlers({ polygons });

    handlers.select('polygon', 'source');
    const style = handlers.copyStyleFromSelection()!;
    handlers.select('polygon', 'target');
    handlers.applyStyleToSelection(style);

    expect(polygons.target.fill).toBe('#d6e4ff');
    expect(Object.prototype.hasOwnProperty.call(polygons.target, 'fillOpacity')).toBe(false);
  });

  it('clears a target fill when the source is explicitly unfilled', () => {
    const polygons = {
      source: { id: 'source' },
      target: { id: 'target', fill: '#ff0000', fillOpacity: 0.35 }
    };
    const handlers = makeHandlers({ polygons });

    handlers.select('polygon', 'source');
    const style = handlers.copyStyleFromSelection()!;
    handlers.select('polygon', 'target');
    handlers.applyStyleToSelection(style);

    expect(Object.prototype.hasOwnProperty.call(polygons.target, 'fill')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(polygons.target, 'fillOpacity')).toBe(false);
  });

  it('leaves circle fill settings untouched when applying copied circle stroke styles', () => {
    const circles = {
      source: { id: 'source', style: { color: '#000', width: 2, type: 'solid' } },
      target: { id: 'target', style: { color: '#f00', width: 4, type: 'dashed' }, fill: '#00ff00', fillOpacity: 0.4 }
    };
    const handlers = makeHandlers({ polygons: {}, circles });

    handlers.select('circle', 'source');
    const style = handlers.copyStyleFromSelection()!;
    handlers.select('circle', 'target');
    handlers.applyStyleToSelection(style);

    expect(circles.target.fill).toBe('#00ff00');
    expect(circles.target.fillOpacity).toBe(0.4);
  });
});
