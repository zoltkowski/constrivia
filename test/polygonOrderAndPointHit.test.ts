import { describe, expect, it } from 'vitest';
import { findPoint, findPointWithRadius } from '../src/canvas/hitTesting';
import type { HitTestDeps } from '../src/canvas/hitTesting';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { polygonContainsPoint, polygonVerticesOrdered } from '../src/core/polygonTools';

function makeHitDeps(): HitTestDeps {
  return {
    runtime: makeEmptyRuntime(),
    showHidden: false,
    currentHitRadius: () => 16,
    canvas: null,
    dpr: 1,
    zoomFactor: 1,
    getPointById: (id, runtime) => runtime.points[String(id)] ?? null,
    pointToSegmentDistance: () => 0
  };
}

describe('ordered polygon boundary', () => {
  it('preserves a concave boundary for interior testing', () => {
    const runtime = makeEmptyRuntime();
    runtime.points = {
      a: { id: 'a', x: 60, y: 260, style: {} },
      b: { id: 'b', x: 300, y: 260, style: {} },
      c: { id: 'c', x: 120, y: 320, style: {} },
      d: { id: 'd', x: 300, y: 460, style: {} },
      e: { id: 'e', x: 60, y: 460, style: {} }
    };
    runtime.polygons = { polygon: { id: 'polygon', points: ['a', 'b', 'c', 'd', 'e'] } };

    expect(polygonVerticesOrdered(runtime, 'polygon')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(polygonContainsPoint(runtime, 'polygon', { x: 90, y: 350 })).toBe(true);
    expect(polygonContainsPoint(runtime, 'polygon', { x: 200, y: 330 })).toBe(false);

    // Moving a vertex must not change which vertices are adjacent in the boundary.
    runtime.points.c.x = 260;
    runtime.points.c.y = 250;
    expect(polygonVerticesOrdered(runtime, 'polygon')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('nearest point hit testing', () => {
  it('chooses the closest point inside the tolerance even when a later point is nearby', () => {
    const deps = makeHitDeps();
    deps.runtime.points = {
      older: { id: 'older', x: 100, y: 300, style: {} },
      newer: { id: 'newer', x: 112, y: 300, style: {} }
    };

    expect(findPoint({ x: 100, y: 300 }, deps)).toBe('older');
    expect(findPointWithRadius({ x: 100, y: 300 }, 16, deps)).toBe('older');
  });

  it('keeps the latest point when candidates are exactly tied', () => {
    const deps = makeHitDeps();
    deps.runtime.points = {
      first: { id: 'first', x: -4, y: 0, style: {} },
      latest: { id: 'latest', x: 4, y: 0, style: {} }
    };

    expect(findPoint({ x: 0, y: 0 }, deps)).toBe('latest');
    expect(findPointWithRadius({ x: 0, y: 0 }, 4, deps)).toBe('latest');
  });

  it('treats floating-point differences between coincident construction points as a tie',()=>{
    const deps=makeHitDeps();deps.runtime.points={older:{id:'older',x:276.40126405116524,y:567.1974718976695,style:{}},newer:{id:'newer',x:276.4012640511653,y:567.1974718976696,style:{}}};
    const click={x:276.40126405116524,y:567.1974718976695};expect(findPoint(click,deps)).toBe('newer');expect(findPointWithRadius(click,16,deps)).toBe('newer');
  });

  it('continues to respect hidden and unavailable points', () => {
    const deps = makeHitDeps();
    deps.runtime.points = {
      visible: { id: 'visible', x: 2, y: 0, style: {} },
      hidden: { id: 'hidden', x: 0, y: 0, style: { hidden: true } },
      invalid: { id: 'invalid', x: 1, y: 0, style: {}, geometryValid: false }
    };

    expect(findPoint({ x: 0, y: 0 }, deps)).toBe('visible');
    deps.showHidden = true;
    expect(findPoint({ x: 0, y: 0 }, deps)).toBe('hidden');
  });
});
