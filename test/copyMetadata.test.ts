import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/core/engineActions';
import { movePointAndRecompute } from '../src/core/engineCompute';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import {
  createCopiedFreeLabel,
  remapCopiedLine,
  remapCopiedPointMetadata,
  remapCopiedPolygon,
  remapCopiedSolid,
  remapCopiedSpatialGroup,
  type CopyIdMaps
} from '../src/core/copyMetadata';
import type { EngineState } from '../src/core/engineModel';
import type { LineRuntime, PointRuntime, PolygonRuntime } from '../src/core/runtimeTypes';

const maps: CopyIdMaps = {
  points: new Map([['a', 'a-copy'], ['b', 'b-copy'], ['m', 'm-copy'], ['i', 'i-copy']]),
  lines: new Map([['l1', 'l1-copy'], ['l2', 'l2-copy']]),
  circles: new Map([['c1', 'c1-copy']])
};

describe('copy metadata remapping', () => {
  it('keeps a copied midpoint linked to copied parents only', () => {
    const source: PointRuntime = {
      id: 'm', x: 5, y: 0, style: {}, construction_kind: 'midpoint',
      midpointMeta: { parents: ['a', 'b'], parentLineId: 'l1' }
    };
    const copied = remapCopiedPointMetadata(source, maps);
    expect(copied.midpointMeta).toEqual({ parents: ['a-copy', 'b-copy'], parentLineId: 'l1-copy' });

    const engine: EngineState = {
      points: {
        a: { id: 'a', x: 0, y: 0 }, b: { id: 'b', x: 10, y: 0 }, m: { id: 'm', x: 5, y: 0, construction_kind: 'midpoint', midpointMeta: { parents: ['a', 'b'] } },
        'a-copy': { id: 'a-copy', x: 20, y: 20 }, 'b-copy': { id: 'b-copy', x: 30, y: 20 },
        'm-copy': { id: 'm-copy', x: 25, y: 20, construction_kind: 'midpoint', midpointMeta: copied.midpointMeta }
      },
      lines: {}, circles: {}, angles: {}, polygons: {}
    };
    movePointAndRecompute(engine, 'a', { x: -10, y: 0 });
    expect(engine.points['m-copy'].x).toBeCloseTo(25);
    movePointAndRecompute(engine, 'a-copy', { x: 10, y: 20 });
    expect(engine.points['m-copy'].x).toBeCloseTo(20);
  });

  it('remaps kind-aware parents and nested bisect, symmetric, and helper metadata', () => {
    const source = {
      id: 'i', x: 1, y: 2, style: {}, construction_kind: 'intersection',
      parent_refs: [{ kind: 'line' as const, id: 'l1' }, { kind: 'circle' as const, id: 'c1' }],
      defining_parents: ['l1', 'c1'],
      bisectMeta: {
        vertex: 'a', seg1: { lineId: 'l1', a: 'a', b: 'b' },
        seg2: { lineId: 'l2', a: 'b', b: 'a' }
      },
      symmetricMeta: { source: 'a', mirror: { kind: 'line' as const, id: 'l2' } },
      parallel_helper_for: 'l1', perpendicular_helper_for: 'l2', created_group: 'group-original'
    } as PointRuntime;
    const groupMap = new Map([['group-original', 'group-copy']]);
    const copied = remapCopiedPointMetadata(source, maps, groupMap);
    expect(copied.parent_refs).toEqual([{ kind: 'line', id: 'l1-copy' }, { kind: 'circle', id: 'c1-copy' }]);
    expect(copied.defining_parents).toEqual(['l1-copy', 'c1-copy']);
    expect(copied.bisectMeta).toEqual({
      vertex: 'a-copy',
      seg1: { lineId: 'l1-copy', a: 'a-copy', b: 'b-copy' },
      seg2: { lineId: 'l2-copy', a: 'b-copy', b: 'a-copy' }
    });
    expect(copied.symmetricMeta).toEqual({ source: 'a-copy', mirror: { kind: 'line', id: 'l2-copy' } });
    expect(copied.parallel_helper_for).toBe('l1-copy');
    expect(copied.perpendicular_helper_for).toBe('l2-copy');
    expect(copied.created_group).toBe('group-copy');
    expect(source.parent_refs?.[0].id).toBe('l1');
    expect(source.bisectMeta?.seg1?.lineId).toBe('l1');
  });

  it('keeps references to uncopied parents and remaps point mirrors by kind', () => {
    const source = {
      id: 'p', x: 0, y: 0, style: {}, defining_parents: ['external'],
      parent_refs: [{ kind: 'point' as const, id: 'external' }],
      symmetricMeta: { source: 'external', mirror: { kind: 'point' as const, id: 'a' } }
    } as PointRuntime;
    const copied = remapCopiedPointMetadata(source, maps);
    expect(copied.defining_parents).toEqual(['external']);
    expect(copied.parent_refs?.[0].id).toBe('external');
    expect(copied.symmetricMeta).toEqual({ source: 'external', mirror: { kind: 'point', id: 'a-copy' } });
  });

  it('adds an imported full line as a line and preserves copied endpoint ids', () => {
    const runtime = makeEmptyRuntime();
    const engine = { runtime };
    const line = remapCopiedLine({
      id: 'old-line', points: ['a', 'b'], defining_points: ['a', 'b'], style: {},
      parallel: { referenceLine: 'l1', throughPoint: 'a', helperPoint: 'b' },
      bisector: { vertex: 'a', bisectPoint: 'b' }
    } as LineRuntime, maps);
    line.id = 'new-line';
    applyAction(engine, { type: 'ADD', kind: 'line', payload: line });
    expect(runtime.lines['new-line'].points).toEqual(['a-copy', 'b-copy']);
    expect(runtime.lines['new-line'].defining_points).toEqual(['a-copy', 'b-copy']);
    expect(runtime.lines['new-line'].parallel).toEqual({ referenceLine: 'l1-copy', throughPoint: 'a-copy', helperPoint: 'b-copy' });
    expect(runtime.lines['new-line'].bisector).toEqual({ vertex: 'a-copy', bisectPoint: 'b-copy' });
  });

  it('builds defining endpoints from the first and last points of a legacy line', () => {
    for (const defining_points of [undefined, [null, null], ['', '']]) {
      const legacy = {
        id: 'legacy-line', points: ['a', 'external', 'b'], style: {}, defining_points
      } as unknown as LineRuntime;
      const copy = remapCopiedLine(legacy, maps);
      expect(copy.points).toEqual(['a-copy', 'external', 'b-copy']);
      expect(copy.defining_points).toEqual(['a-copy', 'b-copy']);
    }
  });

  it('gives a copied free label a fresh id and independent position', () => {
    const source = { id: 'label-1', text: 'Test', pos: { x: 5, y: 8 } };
    const copy = createCopiedFreeLabel(source, 'label-2');
    const runtime = makeEmptyRuntime();
    runtime.labels[source.id] = source;
    applyAction({ runtime }, { type: 'ADD', kind: 'label', payload: copy });
    expect(Object.keys(runtime.labels)).toEqual(['label-1', 'label-2']);
    expect(runtime.labels['label-2'].pos).toEqual({ x: 25, y: 28 });
    expect(source.pos).toEqual({ x: 5, y: 8 });
  });

  it('remaps spatial point bindings and independently clones complete solids and groups', () => {
    const spatialMaps: CopyIdMaps = { ...maps,
      polygons: new Map([['face','face-copy'],['section','section-copy']]),
      solids: new Map([['solid','solid-copy']]), groups: new Map([['g','g-copy']]) };
    const point: PointRuntime = { id:'p',x:0,y:0,style:{},spatial:{groupId:'g',binding:{kind:'sectionEdge',sectionId:'section',endpoints:['a','b']}} };
    const cp=remapCopiedPointMetadata(point,spatialMaps);
    expect(cp.spatial).toEqual({groupId:'g-copy',binding:{kind:'sectionEdge',sectionId:'section-copy',endpoints:['a-copy','b-copy']}});
    const solid = { id:'solid',groupId:'g',origin:{x:0,y:0,z:0},basis:[1,0,0,0,1,0,0,0,1] as [number,number,number,number,number,number,number,number,number],size:{x:1,y:2,z:3},vertices:['a','b'],edges:['l1'],faces:['face'],cutSectionId:'section',polyhedron:{kind:'prism' as const,basePoints:['a','b'],normal:{x:0,y:0,z:1},height:2,offset:{x:0,y:0,z:0},rightLocked:true,faceVertices:[['a','b']]}};
    const cs=remapCopiedSolid(solid,spatialMaps);
    expect(cs).toMatchObject({id:'solid-copy',groupId:'g-copy',vertices:['a-copy','b-copy'],edges:['l1-copy'],faces:['face-copy'],cutSectionId:'section-copy',polyhedron:{basePoints:['a-copy','b-copy'],faceVertices:[['a-copy','b-copy']]}});
    cs.origin.x=9; cs.polyhedron!.normal.z=7;
    expect(solid.origin.x).toBe(0); expect(solid.polyhedron.normal.z).toBe(1);
    const group={id:'g',anchor:{x:2,y:3},orientation:[1,0,0,0,1,0,0,0,1] as [number,number,number,number,number,number,number,number,number],pivot:{x:0,y:0,z:0}};
    const cg=remapCopiedSpatialGroup(group,spatialMaps);cg.orientation[0]=5;
    expect(cg.id).toBe('g-copy'); expect(group.orientation[0]).toBe(1);
  });

  it('drops stale spatial point caches and remaps presentation tombstones to fresh IDs', () => {
    const copyMaps: CopyIdMaps = { ...maps,
      points: new Map([['a','a-copy'],['b','b-copy'],['kept','kept-copy']]),
      lines: new Map([['edge','edge-copy'],['erased-edge','erased-edge-tombstone']]),
      polygons: new Map([['face','face-copy'],['erased-face','erased-face-tombstone']]),
      solids: new Map([['solid','solid-copy']]), groups: new Map([['g','g-copy']]) };
    const line = remapCopiedLine({ id:'edge', points:['a','b'], defining_points:['a','b'], style:{},
      spatialParameters:{a:.2,stale:.8} } as LineRuntime, copyMaps);
    expect(line.spatialParameters).toEqual({ 'a-copy':.2 });
    const section = remapCopiedPolygon({id:'section',points:['a','b'],spatialSection:{solidId:'solid',plane:{kind:'points',points:['a','b','kept']},edgePoints:{'a|b':'kept','stale|a':'stale'},edgeLines:{'a|b':'erased-edge'}}} as PolygonRuntime,copyMaps);
    expect(section.spatialSection?.edgePoints).toEqual({'a-copy|b-copy':'kept-copy'});
    expect(section.spatialSection?.edgeLines).toEqual({'a-copy|b-copy':'erased-edge-tombstone'});
    const solid=remapCopiedSolid({id:'solid',groupId:'g',origin:{x:0,y:0,z:0},basis:[1,0,0,0,1,0,0,0,1],size:{x:1,y:1,z:1},vertices:['a','b'],edges:['erased-edge'],faces:['erased-face']} as any,copyMaps);
    expect(solid.edges).toEqual(['erased-edge-tombstone']);
    expect(solid.faces).toEqual(['erased-face-tombstone']);
  });
});
