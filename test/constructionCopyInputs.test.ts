import { describe, expect, it } from 'vitest';
import { collectConstructionCopyInputs } from '../src/core/constructionCopyInputs';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';

describe('construction copy input closure', () => {
  it('follows derived point, line, angle, polygon, and circle inputs without reverse-expanding 2D dependents', () => {
    const runtime = makeEmptyRuntime();
    runtime.points = {
      A: { id: 'A', x: 0, y: 0, style: {} }, B: { id: 'B', x: 4, y: 0, style: {} },
      M: { id: 'M', x: 2, y: 0, style: {}, construction_kind: 'midpoint', midpointMeta: { parents: ['A', 'B'], parentLineId: 'base' } },
      X: { id: 'X', x: 2, y: 2, style: {}, parent_refs: [{ kind: 'line', id: 'parallel' }] },
      unrelated: { id: 'unrelated', x: 10, y: 10, style: {}, parent_refs: [{ kind: 'point', id: 'M' }] }
    };
    runtime.lines = {
      base: { id: 'base', points: ['A', 'B'], defining_points: ['A', 'B'], style: {} },
      parallel: { id: 'parallel', points: ['M', 'X'], defining_points: ['M', 'X'], style: {}, parallel: { throughPoint: 'M', referenceLine: 'base', helperPoint: 'X' } },
      am: { id: 'am', points: ['A', 'M'], defining_points: ['A', 'M'], style: {} },
      mx: { id: 'mx', points: ['M', 'X'], defining_points: ['M', 'X'], style: {} },
      xa: { id: 'xa', points: ['X', 'A'], defining_points: ['X', 'A'], style: {} },
    };
    runtime.angles.a = { id: 'a', vertex: 'M', arm1: { kind: 'point', pointId: 'A' }, arm2: { kind: 'line', lineId: 'parallel', direction: 1 }, style: {} };
    runtime.polygons.poly = { id: 'poly', points: ['A', 'M', 'X'] };
    runtime.circles.c = { id: 'c', center: 'A', defining_points: ['A', 'M', 'X'], points: [], style: {} };

    const copied = collectConstructionCopyInputs(runtime, [
      { kind: 'angle', id: 'a' }, { kind: 'polygon', id: 'poly' }, { kind: 'circle', id: 'c' }
    ]);

    expect([...copied.points].sort()).toEqual(['A', 'B', 'M', 'X']);
    expect([...copied.lines].sort()).toEqual(['am', 'base', 'parallel', 'xa']);
    expect([...copied.angles]).toEqual(['a']);
    expect([...copied.polygons]).toEqual(['poly']);
    expect([...copied.circles]).toEqual(['c']);
    expect(copied.points.has('unrelated')).toBe(false);
  });

  it('copies a whole spatial group and linked solids, including their construction inputs', () => {
    const runtime = makeEmptyRuntime();
    runtime.spatialGroups = { g: { id: 'g', anchor: { x: 0, y: 0 }, pivot: { x: 0, y: 0, z: 0 }, orientation: [1,0,0,0,1,0,0,0,1] } };
    runtime.points = {
      A: { id: 'A', x: 0, y: 0, style: {}, spatial: { groupId: 'g', binding: { kind: 'position', position: { x: 0, y: 0, z: 0 } } } },
      V: { id: 'V', x: 1, y: 0, style: {}, spatial: { groupId: 'g', binding: { kind: 'vertex', solidId: 's', vertex: 0 } } },
      Guide: { id: 'Guide', x: 8, y: 8, style: {} },
      Q: { id: 'Q', x: 2, y: 0, style: {}, spatial: { groupId: 'g', binding: { kind: 'direction', through: 'A', reference: ['A', 'V'], perpendicular: true, planeGuide: 'Guide' } } },
      U: { id: 'U', x: 12, y: 12, style: {} }
    };
    runtime.lines.e = { id: 'e', points: ['A', 'V'], defining_points: ['A', 'V'], style: {} };
    runtime.polygons.face = { id: 'face', points: ['A', 'V'], spatialGroupId: 'g', solidFace: { solidId: 's', axis: 0, side: 0 } };
    runtime.angles.spatialAngle = { id: 'spatialAngle', vertex: 'A', style: {}, spatial: { groupId: 'g', arms: [['A', 'V'], ['V', 'A']] } };
    runtime.solids = { s: { id: 's', groupId: 'g', origin: { x: 0, y: 0, z: 0 }, basis: [1,0,0,0,1,0,0,0,1], size: { x: 1, y: 1, z: 1 }, vertices: ['V'], edges: ['e'], faces: ['face'] } };

    const copied = collectConstructionCopyInputs(runtime, [{ kind: 'point', id: 'A' }]);

    expect([...copied.spatialGroups]).toEqual(['g']);
    expect([...copied.solids]).toEqual(['s']);
    expect([...copied.points].sort()).toEqual(['A', 'Guide', 'Q', 'V']);
    expect([...copied.lines]).toEqual(['e']);
    expect([...copied.polygons]).toEqual(['face']);
    expect([...copied.angles]).toEqual(['spatialAngle']);
    expect(copied.points.has('U')).toBe(false);

    const fromSolid = collectConstructionCopyInputs(runtime, [{ kind: 'solid', id: 's' }]);
    expect([...fromSolid.points].sort()).toEqual(['A', 'Guide', 'Q', 'V']);
    expect([...fromSolid.polygons]).toEqual(['face']);
  });

  it('resolves line based angle parents by their actual runtime kind', () => {
    const runtime = makeEmptyRuntime();
    runtime.points = {
      A: { id: 'A', x: 0, y: 0, style: {} }, B: { id: 'B', x: 1, y: 0, style: {} },
      C: { id: 'C', x: 0, y: 1, style: {} }
    };
    runtime.lines = {
      first: { id: 'first', points: ['A', 'B'], defining_points: ['A', 'B'], style: {} },
      second: { id: 'second', points: ['A', 'C'], defining_points: ['A', 'C'], style: {} }
    };
    runtime.angles.a = { id: 'a', vertex: 'A', style: {}, defining_parents: ['first', 'second'] };
    const copied = collectConstructionCopyInputs(runtime, [{ kind: 'angle', id: 'a' }]);
    expect([...copied.lines].sort()).toEqual(['first', 'second']);
    expect(copied.missingReferences.size).toBe(0);
  });

  it('terminates safely for cyclic references', () => {
    const runtime = makeEmptyRuntime();
    runtime.points = {
      A: { id: 'A', x: 0, y: 0, style: {}, parent_refs: [{ kind: 'point', id: 'B' }] },
      B: { id: 'B', x: 1, y: 0, style: {}, parent_refs: [{ kind: 'point', id: 'A' }] }
    };
    expect([...collectConstructionCopyInputs(runtime, [{ kind: 'point', id: 'A' }]).points].sort()).toEqual(['A', 'B']);
  });

  it('reports unresolved graph references so clipboard callers can reject incomplete snapshots', () => {
    const runtime = makeEmptyRuntime();
    runtime.points.A = { id: 'A', x: 0, y: 0, style: {}, parent_refs: [{ kind: 'line', id: 'missing-line' }] };
    const copied = collectConstructionCopyInputs(runtime, [{ kind: 'point', id: 'A' }]);
    expect([...copied.missing]).toEqual([{ kind: 'line', id: 'missing-line' }]);
  });

  it('ignores erased spatial presentation references while keeping required geometry references strict', () => {
    const runtime = makeEmptyRuntime();
    runtime.spatialGroups = { g: { id: 'g', anchor: { x: 0, y: 0 }, pivot: { x: 0, y: 0, z: 0 }, orientation: [1,0,0,0,1,0,0,0,1] } };
    runtime.points = {
      A: { id: 'A', x: 0, y: 0, style: {} }, B: { id: 'B', x: 1, y: 0, style: {} }, V: { id: 'V', x: 0, y: 1, style: {} }
    };
    runtime.lines = {
      outline: { id: 'outline', points: ['A', 'B'], defining_points: ['A', 'B'], style: {}, spatialParameters: { 'erased-cache-point': 0.5 } }
    };
    runtime.polygons = {
      section: {
        id: 'section', points: ['A', 'B'], spatialSection: {
          solidId: 's', plane: { kind: 'points', points: ['A', 'B', 'V'] },
          edgePoints: { erased: 'erased-edge-point' }, edgeLines: { erased: 'erased-edge-line' }
        }
      }
    };
    runtime.solids = { s: {
      id: 's', groupId: 'g', origin: { x: 0, y: 0, z: 0 }, basis: [1,0,0,0,1,0,0,0,1], size: { x: 1, y: 1, z: 1 },
      vertices: ['V'], edges: ['erased-outline'], faces: ['erased-face']
    } };

    const copied = collectConstructionCopyInputs(runtime, [{ kind: 'solid', id: 's' }]);
    expect(copied.missing.size).toBe(0);
    expect(copied.missingReferences.size).toBe(0);
    expect(copied.lines.has('outline')).toBe(true);
  });
});
