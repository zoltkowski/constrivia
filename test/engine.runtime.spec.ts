import { describe, it, expect } from 'vitest';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { projectPointOnLineRuntime } from '../src/core/engine';

describe('engine runtime wrappers', () => {
  it('projects point onto line using runtime', () => {
    const rt = makeEmptyRuntime();
    rt.points['ptA'] = { id: 'ptA', x: 0, y: 0, constructionKind: 'free', parents: [] } as any;
    rt.points['ptB'] = { id: 'ptB', x: 10, y: 0, constructionKind: 'free', parents: [] } as any;

    const src = { x: 4, y: 5 };
    const proj = projectPointOnLineRuntime(src, 'ptA', 'ptB', rt);
    expect(proj.x).toBeCloseTo(4);
    expect(proj.y).toBeCloseTo(0);
  });
});
