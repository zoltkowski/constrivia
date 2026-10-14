import { describe, expect, it } from 'vitest';
import { findLineHitForPos, findLineHits, findLinesContainingPoint, findPoint } from '../src/canvas/hitTesting';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import type { HitTestDeps } from '../src/canvas/hitTesting';
import { polygonAtPoint, polygonForLine, polygonForPoint, polygonLines, polygonVertices } from '../src/core/polygonTools';
import { circleArcs, findArcAt } from '../src/core/arcTools';
import { linePresentationPoints } from '../src/canvas/linePresentation';

function makeDeps(): HitTestDeps {
  const runtime = makeEmptyRuntime();
  runtime.points = {
    a: { id: 'a', x: 0, y: 0, style: {} },
    helper: { id: 'helper', x: 5, y: 0, style: { hidden: true } },
    b: { id: 'b', x: 10, y: 0, style: {} },
    c: { id: 'c', x: 15, y: 0, style: {} },
    invalid: { id: 'invalid', x: 20, y: 0, style: {}, geometryValid: false }
  };
  runtime.lines = {
    visible: { id: 'visible', points: ['a', 'helper', 'b'], defining_points: ['a', 'b'], style: {}, hidden: true },
    invalid: { id: 'invalid', points: ['b', 'invalid'], defining_points: ['b', 'invalid'], style: {}, geometryValid: false }
  };
  return {
    runtime,
    showHidden: true,
    currentHitRadius: () => 1,
    canvas: null,
    dpr: 1,
    zoomFactor: 1,
    getPointById: (id, currentRuntime) => currentRuntime.points[String(id)] ?? null,
    pointToSegmentDistance: (p, a, b) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }
  };
}

describe('geometry validity hit testing', () => {
  it('keeps internal direction endpoints out of point selection while their line remains selectable', () => {
    const deps = makeDeps();
    deps.runtime.points.helper.auxiliaryFor = 'visible';
    expect(findPoint({ x: 5, y: 0 }, deps)).toBeNull();
    expect(findLineHits({ x: 5, y: 0 }, deps).length).toBeGreaterThan(0);
  });
  it('excludes invalid points and objects even when hidden objects are shown', () => {
    const deps = makeDeps();
    expect(findPoint({ x: 20, y: 0 }, deps)).toBeNull();
    expect(findLineHits({ x: 20, y: 0 }, deps)).toEqual([]);
    expect(findLinesContainingPoint('invalid', deps)).toEqual(['invalid']);
  });

  it('keeps manually hidden valid points and lines available with showHidden', () => {
    const deps = makeDeps();
    expect(deps.runtime.lines.visible.geometryValid).toBeUndefined();
    expect(findPoint({ x: 5, y: 0 }, deps)).toBe('helper');
    expect(findLineHits({ x: 2, y: 0 }, deps)).toEqual([{ lineId: 'visible', part: 'segment', seg: 0 }]);
  });

  it('projects unavailable subdivisions and preserves original segment indices', () => {
    const deps = makeDeps();
    deps.runtime.points.invalid.x = 5;
    deps.runtime.points.invalid.y = 4;
    deps.runtime.lines.visible.points = ['a', 'invalid', 'b', 'c'];
    expect(findLineHits({ x: 2, y: 0 }, deps)).toEqual([{ lineId: 'visible', part: 'segment', seg: 0 }]);
    expect(findLineHits({ x: 12, y: 0 }, deps)).toEqual([{ lineId: 'visible', part: 'segment', seg: 2 }]);
    expect(findLineHitForPos('visible', { x: 2, y: 0 }, deps)).toEqual({ lineId: 'visible', part: 'segment', seg: 0 });
    expect(findLineHitForPos('visible', { x: 12, y: 0 }, deps)).toEqual({ lineId: 'visible', part: 'segment', seg: 2 });
    expect(deps.runtime.points.invalid).toMatchObject({ x: 5, y: 4, geometryValid: false });
  });
});

describe('line presentation points', () => {
  it('projects invalid subdivision points without mutating runtime data and interpolates when coordinates are missing', () => {
    const deps = makeDeps();
    const line = deps.runtime.lines.visible;
    line.points = ['a', 'invalid', 'b'];
    line.defining_points = ['a', 'b'];
    const rawPoint = deps.runtime.points.invalid;
    rawPoint.x = Number.NaN;
    rawPoint.y = Number.POSITIVE_INFINITY;
    const style = rawPoint.style;
    const display = linePresentationPoints(line, deps.runtime);

    expect(display).toHaveLength(3);
    expect(display?.[1]).toMatchObject({ id: 'invalid', x: 5, y: 0, geometryValid: true });
    expect(display?.[1].style).toBe(style);
    expect(rawPoint.geometryValid).toBe(false);
    expect(rawPoint.x).toBeNaN();
    expect(rawPoint.y).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns null when a defining endpoint is unavailable', () => {
    const deps = makeDeps();
    const line = deps.runtime.lines.visible;
    line.points = ['a', 'invalid'];
    line.defining_points = ['a', 'invalid'];
    expect(linePresentationPoints(line, deps.runtime)).toBeNull();
  });

  it('keeps the original point count when an unavailable subdivision has no runtime coordinates', () => {
    const deps = makeDeps();
    const line = deps.runtime.lines.visible;
    line.points = ['a', 'missing', 'b'];
    line.defining_points = ['a', 'b'];
    const display = linePresentationPoints(line, deps.runtime);
    expect(display).toHaveLength(3);
    expect(display?.[1]).toMatchObject({ id: 'missing', x: 5, y: 0, geometryValid: true });
  });
});

describe('invalid polygon structure remains indexed', () => {
  it('retains polygon vertices and line membership for structural operations', () => {
    const runtime = makeEmptyRuntime();
    runtime.points = {
      a: { id: 'a', x: 0, y: 0, style: {} },
      b: { id: 'b', x: 10, y: 0, style: {}, geometryValid: false },
      c: { id: 'c', x: 5, y: 8, style: {} }
    };
    runtime.lines = {
      edge: { id: 'edge', points: ['a', 'b'], defining_points: ['a', 'b'], style: {}, geometryValid: false }
    };
    runtime.polygons = {
      polygon: { id: 'polygon', points: ['a', 'b', 'c'], geometryValid: false }
    };

    expect(polygonVertices(runtime, 'polygon')).toEqual(['a', 'b', 'c']);
    expect(polygonForLine(runtime, 'edge')).toBe('polygon');
    expect(polygonForPoint(runtime, 'b')).toBe('polygon');
    expect(polygonLines(runtime, 'polygon')).toContain('edge');
    expect(polygonAtPoint(runtime, { x: 5, y: 2 }, { includeHidden: true })).toBeNull();
  });
});

describe('valid circle arcs retain unavailable perimeter partitions', () => {
  it('keeps arc keys and styles when perimeter helper points are unavailable', () => {
    const runtime = makeEmptyRuntime();
    runtime.points = {
      center: { id: 'center', x: 0, y: 0, style: {} },
      radius: { id: 'radius', x: 10, y: 0, style: {} },
      p1: { id: 'p1', x: 0, y: 10, style: {}, geometryValid: false },
      p2: { id: 'p2', x: 0, y: -10, style: {}, geometryValid: false }
    };
    runtime.circles = {
      circle: {
        id: 'circle', center: 'center', radius_point: 'radius', points: ['p1', 'p2'],
        defining_points: ['center', 'radius', 'radius'], style: {}, geometryValid: true,
        arcStyles: { 'circle:p1:p2': { color: '#123456', hidden: true } }
      }
    };

    const arcs = circleArcs('circle', { runtime, showHidden: true });
    const partition = arcs.find((arc) => arc.key === 'circle:p1:p2');
    expect(arcs).toHaveLength(3);
    expect(partition?.style.color).toBe('#123456');
    expect(partition?.style.hidden).toBe(true);
  });

  it('does not hit an invalid circle when showHidden is enabled', () => {
    const runtime = makeEmptyRuntime();
    runtime.points = {
      center: { id: 'center', x: 0, y: 0, style: {} },
      radius: { id: 'radius', x: 10, y: 0, style: {} },
      perimeter: { id: 'perimeter', x: 0, y: 10, style: {} }
    };
    runtime.circles = {
      circle: {
        id: 'circle', center: 'center', radius_point: 'radius', points: ['perimeter'],
        defining_points: ['center', 'radius', 'radius'], style: {}, geometryValid: false, hidden: true
      }
    };
    expect(findArcAt({ x: 0, y: 10 }, { runtime, showHidden: true }, 1)).toBeNull();
  });
});
