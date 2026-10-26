import { describe, expect, it } from 'vitest';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { orderAnimationPoints, pointAnimationPath } from '../src/core/pointAnimation';

const fixture = () => {
  const runtime = makeEmptyRuntime();
  for (const [id, x, y] of [['a', 0, 100], ['b', 100, 100], ['p', 50, 100], ['s', 200, 100], ['t', 220, 100], ['q', 50, 120], ['r', 50, 140]] as const)
    runtime.points[id] = { id, x, y, style: {} };
  runtime.lines.l = { id: 'l', points: ['a', 'p', 'b'], defining_points: ['a', 'b'], style: {}, leftRay: { hidden: true }, rightRay: { hidden: true } };
  Object.assign(runtime.points.p, { construction_kind: 'on_object', parent_refs: [{ kind: 'line', id: 'l' }] });
  for (const [id, center, point] of [['c1', 'p', 'q'], ['c2', 'q', 'r']] as const) {
    runtime.circles[id] = { id, center, circle_kind: 'compass', defining_points: [center, 's', 't'], points: [point], style: {} };
    Object.assign(runtime.points[point], { construction_kind: 'on_object', parent_refs: [{ kind: 'circle', id }] });
  }
  return runtime;
};

describe('point animation paths and dependencies', () => {
  it('accepts finite segments and circles but excludes rays, free points and owned helpers', () => {
    const runtime = fixture();
    expect(pointAnimationPath(runtime, 'p')?.kind).toBe('segment');
    expect(pointAnimationPath(runtime, 'q')?.kind).toBe('circle');
    expect(pointAnimationPath(runtime, 'a')).toBeNull();
    runtime.lines.l.leftRay!.hidden = false;
    expect(pointAnimationPath(runtime, 'p')).toBeNull();
    runtime.lines.l.leftRay!.hidden = true;
    runtime.points.p.auxiliaryFor = 'l';
    expect(pointAnimationPath(runtime, 'p')).toBeNull();
  });
  it('fixes the positive endpoint order at the start of a run', () => {
    const runtime = fixture();runtime.points.a.x = 0;runtime.points.a.y = 100;runtime.points.b.x = 0;runtime.points.b.y = 0;
    const path = pointAnimationPath(runtime, 'p');
    expect(path?.kind).toBe('segment');if (path?.kind !== 'segment') return;
    expect(path.endpoints).toEqual(['a', 'b']);
    runtime.points.a.x = 10;runtime.points.b.x = -10;
    expect(pointAnimationPath(runtime, 'p', path.endpoints)).toMatchObject({ endpoints: ['a', 'b'] });
    expect(pointAnimationPath(runtime, 'p')).toMatchObject({ endpoints: ['b', 'a'] });
  });
  it('orders a chain of moving circle centers regardless of configuration order', () => {
    expect(orderAnimationPoints(fixture(), ['r', 'q', 'p'])).toEqual(['p', 'q', 'r']);
  });
  it('updates a moving segment after its animated endpoint even when the endpoint is on a circle', () => {
    const runtime = fixture();runtime.lines.l.defining_points = ['q', 'b'];
    expect(orderAnimationPoints(runtime, ['p', 'q'])).toBeNull();
    runtime.circles.c1.center = 's';runtime.circles.c1.defining_points = ['s', 's', 't'];
    expect(orderAnimationPoints(runtime, ['p', 'q'])).toEqual(['q', 'p']);
  });
  it('does not mistake other subdivision points for defining inputs', () => {
    const runtime = fixture();
    Object.assign(runtime.points.r, { construction_kind: 'on_object', parent_refs: [{ kind: 'line', id: 'l' }] });
    runtime.lines.l.points.push('r');
    expect(orderAnimationPoints(runtime, ['r', 'p'])).toEqual(['r', 'p']);
  });
});
