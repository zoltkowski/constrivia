import { describe, expect, it } from 'vitest';
import { createConstructionClipboard, pasteConstructionClipboard, readConstructionClipboard } from '../src/core/constructionClipboard';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { createBoundaryIntersectionSet } from '../src/core/boundaryIntersections';
import { recomputeAllRuntime } from '../src/core/runtimeRecompute';

describe('construction clipboard transactions', () => {
  it('copies and pastes the complete graph for partial midpoint, intersection, parallel, and line-angle selections', () => {
    const runtime = makeEmptyRuntime();
    runtime.points = {
      A: { id: 'A', x: 0, y: 0, style: { color: '#123456' } },
      B: { id: 'B', x: 10, y: 0, style: {} },
      M: { id: 'M', x: 5, y: 0, style: {}, construction_kind: 'midpoint', midpointMeta: { parents: ['A', 'B'], parentLineId: 'base' } },
      H: { id: 'H', x: 0, y: 5, style: {}, auxiliaryFor: 'parallel' },
      I: { id: 'I', x: 5, y: 4, style: {}, construction_kind: 'intersection', parent_refs: [{ kind: 'circle', id: 'c1' }, { kind: 'circle', id: 'c2' }] },
      unrelated: { id: 'unrelated', x: 30, y: 30, style: {} }
    };
    runtime.lines = {
      base: { id: 'base', points: ['A', 'B'], defining_points: ['A', 'B'], style: {} },
      parallel: { id: 'parallel', points: ['A', 'H'], defining_points: ['A', 'H'], style: {}, parallel: { throughPoint: 'A', referenceLine: 'base', helperPoint: 'H' } },
      arm: { id: 'arm', points: ['M', 'I'], defining_points: ['M', 'I'], style: {} }
    };
    runtime.circles = {
      c1: { id: 'c1', center: 'A', defining_points: ['A', 'B', 'M'], points: ['I'], style: {} },
      c2: { id: 'c2', center: 'B', defining_points: ['B', 'A', 'M'], points: ['I'], style: {} }
    };
    runtime.angles.a = { id: 'a', vertex: 'M', arm1LineId: 'base', arm2LineId: 'arm', defining_parents: ['base', 'arm'], style: {} };

    const snapshot = createConstructionClipboard(runtime, {
      points: ['M', 'I'], lines: ['parallel'], angles: ['a']
    });
    expect(snapshot.points.map(point => point.id).sort()).toEqual(['A', 'B', 'H', 'I', 'M']);
    expect(snapshot.lines.map(line => line.id).sort()).toEqual(['arm', 'base', 'parallel']);
    expect(snapshot.circles.map(circle => circle.id).sort()).toEqual(['c1', 'c2']);
    expect(snapshot.angles.map(angle => angle.id)).toEqual(['a']);
    expect(snapshot.points.some(point => point.id === 'unrelated')).toBe(false);

    const destination = makeEmptyRuntime();
    const maps = pasteConstructionClipboard(destination, snapshot);
    expect(maps).not.toBeNull();
    const pointId = maps!.points.get('M')!;
    const lineId = maps!.lines.get('parallel')!;
    const copiedMidpoint = destination.points[pointId];
    expect(copiedMidpoint.midpointMeta?.parents).toEqual(['A', 'B'].map(id => maps!.points.get(id)));
    expect(copiedMidpoint.midpointMeta?.parentLineId).toBe(maps!.lines.get('base'));
    expect(destination.lines[lineId].parallel).toEqual({
      throughPoint: maps!.points.get('A'), referenceLine: maps!.lines.get('base'), helperPoint: maps!.points.get('H')
    });
    expect(destination.points[maps!.points.get('I')!].parent_refs?.map(ref => ref.id).sort()).toEqual(['c1', 'c2'].map(id => maps!.circles.get(id)).sort());
    expect(destination.angles[maps!.angles.get('a')!].arm1LineId).toBe(maps!.lines.get('base'));
    for(const source of snapshot.lines) {
      const copy=destination.lines[maps!.lines.get(source.id)!];
      expect(copy.points).toEqual(source.points.map(id=>maps!.points.get(id)));
      expect(copy.defining_points.every(id=>copy.points.includes(id))).toBe(true);
    }
  });

  it('rejects an incomplete old clipboard without changing the destination runtime', () => {
    const incomplete = { points: [{ id: 'dependent', x: 1, y: 2, style: {}, parent_refs: [{ kind: 'line', id: 'lost-line' }] }] };
    expect(readConstructionClipboard(incomplete)).toBeNull();
    const destination = makeEmptyRuntime();
    destination.points.keep = { id: 'keep', x: 3, y: 4, style: {} };
    const before = structuredClone(destination);
    expect(pasteConstructionClipboard(destination, incomplete)).toBeNull();
    expect(destination).toEqual(before);
  });

  it('accepts a complete legacy plain-object clipboard and keeps styles independent', () => {
    const legacy = { points: [{ id: 'P', x: 1, y: 2, style: { color: '#ab1234' } }] };
    const parsed = readConstructionClipboard(legacy);
    expect(parsed?.version).toBe(2);
    legacy.points[0].style.color = '#000000';
    expect(parsed?.points[0].style.color).toBe('#ab1234');

    const destination = makeEmptyRuntime();
    const maps = pasteConstructionClipboard(destination, parsed);
    const copied = destination.points[maps!.points.get('P')!];
    copied.style.color = '#ffffff';
    expect(parsed?.points[0].style.color).toBe('#ab1234');
    expect(legacy.points[0].style.color).toBe('#000000');
  });

  it('remaps deleted boundary slots when copying a surviving output and grows independently after paste',()=>{
    const runtime=makeEmptyRuntime();
    const coords:Array<[number,number]>=[[0,0],[10,0],[10,10],[7,10],[7,3],[3,3],[3,10],[0,10]];
    const polygonPoints=coords.map(([x,y],index)=>{const id=`p${index}`;runtime.points[id]={id,x,y,style:{}};return id;});
    runtime.polygons.concave={id:'concave',points:polygonPoints};
    runtime.points.a={id:'a',x:-5,y:1,style:{}};runtime.points.b={id:'b',x:15,y:1,style:{}};
    runtime.lines.line={id:'line',points:['a','b'],defining_points:['a','b'],style:{}};
    const outputs=createBoundaryIntersectionSet(runtime,[{kind:'polygon',id:'concave'},{kind:'line',id:'line'}]);
    delete runtime.points[outputs[0]];

    const snapshot=createConstructionClipboard(runtime,{points:[outputs[1]]});
    const destination=makeEmptyRuntime(),maps=pasteConstructionClipboard(destination,snapshot)!;
    const pasted=destination.points[maps.points.get(outputs[1])!]!;
    const pastedSet=pasted.boundaryIntersectionSet!;
    expect(pastedSet.outputs).toHaveLength(2);
    expect(pastedSet.outputs[0]).not.toBe(outputs[0]);
    expect(destination.points[pastedSet.outputs[0]]).toBeUndefined();
    expect(pastedSet.outputs[1]).toBe(pasted.id);
    expect(pasted.boundaryIntersectionSlot?.setId).toBe(pastedSet.outputs[0]);
    expect(pastedSet.parents[0].id).toBe(maps.polygons.get('concave'));
    expect(pastedSet.parents[1].id).toBe(maps.lines.get('line'));

    const line=destination.lines[maps.lines.get('line')!]!,[a,b]=line.defining_points;
    destination.points[a].y=25;destination.points[b].y=25;
    recomputeAllRuntime(destination);
    const copiedSlots=Object.values(destination.points).filter(point=>point.boundaryIntersectionSlot?.setId===pasted.boundaryIntersectionSlot?.setId);
    expect(copiedSlots).toHaveLength(3);
    expect(copiedSlots.find(point=>point.boundaryIntersectionSlot?.index===1)?.id).toBe(maps.points.get(outputs[1]));
    expect(Object.values(runtime.points).filter(point=>point.boundaryIntersectionSlot).length).toBe(1);
  });

  it('rejects malformed saved labels and ink before allocating destination IDs', () => {
    const destination=makeEmptyRuntime(),before=JSON.stringify(destination);
    for(const invalid of [{labels:[{id:'label',text:'broken'}]},{inkStrokes:[{id:'stroke'}]}]){
      expect(readConstructionClipboard(invalid)).toBeNull();
      expect(pasteConstructionClipboard(destination,invalid)).toBeNull();
      expect(JSON.stringify(destination)).toBe(before);
    }
  });

  it('remaps same-group cube, prism, pyramid, and section references on repeated pastes', () => {
    const runtime = makeEmptyRuntime();
    runtime.spatialGroups = { g: { id: 'g', anchor: { x: 50, y: 60 }, pivot: { x: 0, y: 0, z: 0 }, orientation: [1,0,0,0,1,0,0,0,1] } };
    runtime.solids = {};
    const solidIds = ['cube', 'prism', 'pyramid'];
    for (const [index, id] of solidIds.entries()) {
      const vertex = `${id}-v`, edge = `${id}-e`, face = `${id}-f`, section = `${id}-section`;
      runtime.points[vertex] = { id: vertex, x: index, y: 0, style: {}, spatial: { groupId: 'g', binding: { kind: 'vertex', solidId: id, vertex: 0 } } };
      runtime.points[`${id}-base`] = { id: `${id}-base`, x: index + 1, y: 0, style: {}, spatial: { groupId: 'g', binding: { kind: 'position', position: { x: 1, y: 0, z: 0 } } } };
      runtime.lines[edge] = { id: edge, points: [vertex, `${id}-base`], defining_points: [vertex, `${id}-base`], style: {} };
      runtime.polygons[face] = { id: face, points: [vertex, `${id}-base`], spatialGroupId: 'g', solidFace: { solidId: id, axis: 0, side: 0 } };
      runtime.polygons[section] = {
        id: section, points: [vertex, `${id}-base`], spatialGroupId: 'g',
        spatialSection: { solidId: id, plane: { kind: 'points', points: [vertex, `${id}-base`, vertex] }, edgePoints: { [`${vertex}|${id}-base`]: `${id}-base` }, edgeLines: { [`${vertex}|${id}-base`]: edge } }
      };
      runtime.solids![id] = {
        id, groupId: 'g', origin: { x: 0, y: 0, z: 0 }, basis: [1,0,0,0,1,0,0,0,1], size: { x: 1, y: 1, z: 1 },
        vertices: [vertex], edges: [edge], faces: [face], cutSectionId: section,
        ...(id === 'cube' ? {} : { polyhedron: { kind: id, basePoints: [`${id}-base`], normal: { x: 0, y: 0, z: 1 }, height: 1, offset: { x: 0, y: 0, z: 0 }, rightLocked: false, faceVertices: [[vertex, `${id}-base`]] } })
      } as any;
    }
    const snapshot = createConstructionClipboard(runtime, { solids: ['cube'] });
    expect(snapshot.solids.map(solid => solid.id).sort()).toEqual(solidIds);
    expect(snapshot.polygons).toHaveLength(6);

    const destination = makeEmptyRuntime();
    const first = pasteConstructionClipboard(destination, snapshot)!;
    const second = pasteConstructionClipboard(destination, snapshot)!;
    for (const oldSolidId of solidIds) {
      const newSolidId = first.solids.get(oldSolidId)!;
      const newSolid = destination.solids![newSolidId];
      expect(newSolid.groupId).toBe(first.spatialGroups.get('g'));
      expect(newSolid.cutSectionId).toBe(first.polygons.get(`${oldSolidId}-section`));
      expect(newSolid.vertices.every(id => id !== `${oldSolidId}-v`)).toBe(true);
      expect(destination.polygons[newSolid.cutSectionId!].spatialSection?.solidId).toBe(newSolidId);
      expect(destination.points[first.points.get(`${oldSolidId}-v`)!].spatial?.binding).toMatchObject({ solidId: newSolidId });
      expect(second.solids.get(oldSolidId)).not.toBe(newSolidId);
      expect(second.spatialGroups.get('g')).not.toBe(first.spatialGroups.get('g'));
    }
    expect(Object.keys(destination.solids!).length).toBe(6);
    expect(Object.keys(destination.spatialGroups!).length).toBe(2);
  });
});
