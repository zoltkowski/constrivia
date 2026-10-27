import { describe, expect, it } from 'vitest';
import { HandwritingGrouper, handwritingBoxesAdjacent } from '../src/core/handwritingGrouping';
import { groupForObject, createObjectGroup, groupCollections, type GroupSelection } from '../src/core/objectGroups';
import { makeEmptyRuntime, type InkStrokeRuntime } from '../src/core/runtimeTypes';

const stroke = (id: string, x: number, y: number, w = 4, h = 20): InkStrokeRuntime => ({
  id, color: '#123456', baseWidth: 2, points: [{ x, y, pressure: .5, time: 0 }, { x: x + w, y: y + h, pressure: .5, time: 1 }]
});

describe('automatic handwriting grouping', () => {
  it('groups nearby consecutive strokes, including a dot, and extends the same group', () => {
    const runtime = makeEmptyRuntime(), grouper = new HandwritingGrouper();
    const add = (s: InkStrokeRuntime, time: number) => { runtime.inkStrokes[s.id] = s; grouper.finish(runtime, s, 1, time); };
    add(stroke('a', 0, 10), 0); add(stroke('b', 8, 10), 200); add(stroke('dot', 10, 4, 1, 1), 400);
    expect(groupForObject(runtime, 'inkStrokes', 'a')?.members.inkStrokes?.slice().sort()).toEqual(['a', 'b', 'dot']);
  });
  it('keeps distant words, separate lines and diagonally separated strokes apart', () => {
    const a = {left:0, right:12, top:0, bottom:20};
    expect(handwritingBoxesAdjacent(a, {left:30, right:35, top:0, bottom:20})).toBe(false);
    expect(handwritingBoxesAdjacent(a, {left:0, right:12, top:35, bottom:55})).toBe(false);
    expect(handwritingBoxesAdjacent(a, {left:22, right:26, top:28, bottom:40})).toBe(false);
    expect(handwritingBoxesAdjacent(a, {left:0, right:12, top:25, bottom:45})).toBe(false);
    expect(handwritingBoxesAdjacent(a, {left:0, right:12, top:18, bottom:38})).toBe(false);
  });
  it('keeps dots and separate horizontal strokes of an equals sign together', () => {
    expect(handwritingBoxesAdjacent({left:0, right:20, top:0, bottom:0}, {left:0, right:20, top:6, bottom:6})).toBe(true);
    expect(handwritingBoxesAdjacent({left:0, right:4, top:10, bottom:30}, {left:1, right:2, top:4, bottom:5})).toBe(true);
  });
  it('uses screen-sized gaps consistently at different zoom levels', () => {
    for (const zoom of [.5, 1, 2]) {
      const runtime = makeEmptyRuntime(), grouper = new HandwritingGrouper();
      const a = stroke('a', 0, 0, 4 / zoom, 20 / zoom), b = stroke('b', 9 / zoom, 0, 4 / zoom, 20 / zoom);
      runtime.inkStrokes.a = a; runtime.inkStrokes.b = b;
      grouper.finish(runtime, a, zoom, 0); grouper.finish(runtime, b, zoom, 500);
      expect(groupForObject(runtime, 'inkStrokes', 'a')?.members.inkStrokes).toEqual(['a', 'b']);
    }
  });
  it('does not join a later, differently styled or explicitly grouped stroke', () => {
    for (const scenario of ['late', 'style', 'manual']) {
      const runtime = makeEmptyRuntime(), grouper = new HandwritingGrouper(), a = stroke('a', 0, 0), b = stroke('b', 5, 0);
      runtime.inkStrokes.a = a; runtime.inkStrokes.b = b; grouper.finish(runtime, a, 1, 0);
      if (scenario === 'style') b.color = '#abcdef';
      if (scenario === 'manual') {
        runtime.labels.label = { id: 'label', text: 'x', pos: { x: 0, y: 0 } };
        const selection = Object.fromEntries(groupCollections.map(key => [key, new Set<string>()])) as GroupSelection;
        selection.inkStrokes.add('a'); selection.labels.add('label'); createObjectGroup(runtime, selection);
      }
      grouper.finish(runtime, b, 1, scenario === 'late' ? 6001 : 100);
      expect(groupForObject(runtime, 'inkStrokes', 'b')).toBeUndefined();
    }
  });
  it('respects an explicit ungroup and never silently rejoins its members', () => {
    const runtime = makeEmptyRuntime(), grouper = new HandwritingGrouper();
    const a = stroke('a', 0, 0), b = stroke('b', 6, 0), c = stroke('c', 12, 0);
    for (const [s, time] of [[a, 0], [b, 100]] as const) { runtime.inkStrokes[s.id] = s; grouper.finish(runtime, s, 1, time); }
    delete runtime.objectGroups![groupForObject(runtime, 'inkStrokes', 'a')!.id];
    runtime.inkStrokes.c = c; grouper.finish(runtime, c, 1, 200);
    expect(Object.keys(runtime.objectGroups!)).toHaveLength(0);
  });
  it('measures the pause before a stroke rather than how long drawing it takes', () => {
    const runtime = makeEmptyRuntime(), grouper = new HandwritingGrouper();
    runtime.inkStrokes.a = stroke('a', 0, 0); runtime.inkStrokes.b = stroke('b', 6, 0);
    grouper.finish(runtime, runtime.inkStrokes.a, 1, 0);
    grouper.finish(runtime, runtime.inkStrokes.b, 1, 8000, 100);
    expect(groupForObject(runtime, 'inkStrokes', 'b')?.members.inkStrokes).toEqual(['a', 'b']);
  });
});
