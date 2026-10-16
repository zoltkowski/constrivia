import { describe, expect, it } from 'vitest';
import { applyEngineState, toEngineState } from '../src/core/engineAdapter';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { reconcileLineTopologyStyles } from '../src/ui/lineTopologyStyles';

function fixture() {
  const runtime = makeEmptyRuntime();
  runtime.points = {
    a: { id: 'a', x: 0, y: 0, style: {} }, h: { id: 'h', x: 5, y: 0, style: {} }, b: { id: 'b', x: 10, y: 0, style: {} }
  };
  runtime.lines.l = { id: 'l', points: ['a', 'h', 'b'], defining_points: ['a', 'b'], style: { color: '#15a3ff' }, segmentStyles: [{ color: '#ff0000' }, { color: '#00ff00' }], leftRay: { hidden: true }, rightRay: { hidden: true } };
  return runtime;
}

describe('visibility when subdivision points cross line endpoints', () => {
  it.each([{ x: 15, order: ['a', 'b', 'h'], outsideIndex: 1 }, { x: -5, order: ['h', 'a', 'b'], outsideIndex: 0 }])('inherits hidden half-line visibility at x=$x', ({x, order, outsideIndex}) => {
    const runtime = fixture(), engine = toEngineState(runtime);
    engine.points.h.x = x; engine.lines.l.points = order;
    applyEngineState(runtime, engine, { points: true, lines: true });
    expect(runtime.lines.l.segmentStyles![outsideIndex].hidden).toBe(true);
    expect(runtime.lines.l.leftRay!.hidden).toBe(true);
    expect(runtime.lines.l.rightRay!.hidden).toBe(true);
  });

  it('keeps an explicit subsequent show of the outer interval and restores inside visibility on return', () => {
    const runtime = fixture();
    let engine = toEngineState(runtime);
    engine.points.h.x = 15; engine.lines.l.points = ['a', 'b', 'h'];
    applyEngineState(runtime, engine, { points: true, lines: true });
    runtime.lines.l.segmentStyles![1].hidden = false;
    engine = toEngineState(runtime); engine.points.h.x = 20;
    applyEngineState(runtime, engine, { points: true, lines: true });
    expect(runtime.lines.l.segmentStyles![1].hidden).toBe(false);
    engine = toEngineState(runtime); engine.points.h.x = 5; engine.lines.l.points = ['a', 'h', 'b'];
    applyEngineState(runtime, engine, { points: true, lines: true });
    expect(runtime.lines.l.segmentStyles!.every(style => !style.hidden)).toBe(true);
  });

  it('does not inherit hidden ray styles when real intervals cross bisector direction helpers', () => {
    const runtime = fixture(), line = runtime.lines.l;
    line.perpendicular = { directBisector: true, throughPoint: 'a', helperPoint: 'b', referencePoints: ['s1', 's2'] };
    line.points = ['p', 'q'];
    line.segmentStyles = [{ color: '#ff0000', hidden: false }];
    const before = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, p: { x: 2, y: 0 }, q: { x: 4, y: 0 } };
    const after = { ...before, p: { x: 25, y: 0 }, q: { x: 15, y: 0 } };
    const result = reconcileLineTopologyStyles(line, ['q', 'p'], before, after);
    expect(result.segmentStyles).toEqual([{ color: '#ff0000', hidden: false }]);
    expect(line.rightRay?.hidden).toBe(true);
  });

  it('inherits the style of a visible ray without changing the source object', () => {
    const runtime = fixture(), line = runtime.lines.l;
    line.rightRay = { color: '#123456', hidden: false, type: 'dashed' };
    const before = structuredClone(line);
    const result = reconcileLineTopologyStyles(line, ['a', 'b', 'h'], runtime.points, { ...runtime.points, h: { x: 15, y: 0 } });
    expect(result.segmentStyles[1]).toEqual(line.rightRay);
    expect(line).toEqual(before);
  });
});
