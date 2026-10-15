import { describe, expect, it } from 'vitest';
import { boundaryIntersectionOutputsWithMissingParents, createBoundaryIntersectionSet, polygonBoundaryIntersections } from '../src/core/boundaryIntersections';
import { recomputeAllRuntime } from '../src/core/runtimeRecompute';
import { toEngineState } from '../src/core/engineAdapter';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';

function addPolygon(runtime: ReturnType<typeof makeEmptyRuntime>, id: string, coords: Array<[number, number]>) {
  const ids = coords.map(([x, y], index) => {
    const pointId = `${id}-p${index}`;
    runtime.points[pointId] = { id: pointId, x, y, style: {} };
    return pointId;
  });
  runtime.polygons[id] = { id, points: ids, fillOpacity: 0.2 };
}

function addLine(runtime: ReturnType<typeof makeEmptyRuntime>, id: string, y: number) {
  const a = `${id}-a`, b = `${id}-b`;
  runtime.points[a] = { id: a, x: -5, y, style: {} };
  runtime.points[b] = { id: b, x: 15, y, style: {} };
  runtime.lines[id] = { id, points: [a, b], defining_points: [a, b], style: {} };
  return [a, b] as const;
}

describe('polygon boundary intersections', () => {
  it('returns unique finite boundary hits and clips polygon-polygon edge pairs', () => {
    const runtime = makeEmptyRuntime();
    addPolygon(runtime, 'concave', [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10]]);
    addLine(runtime, 'line', 5);
    expect(polygonBoundaryIntersections(toEngineState(runtime), [{ kind: 'polygon', id: 'concave' }, { kind: 'line', id: 'line' }]))
      .toEqual([{ x: 0, y: 5 }, { x: 3, y: 5 }, { x: 7, y: 5 }, { x: 10, y: 5 }]);

    const other = makeEmptyRuntime();
    addPolygon(other, 'a', [[0, 0], [10, 0], [10, 10], [0, 10]]);
    addPolygon(other, 'b', [[5, -2], [12, -2], [12, 8], [5, 8]]);
    expect(polygonBoundaryIntersections(toEngineState(other), [{ kind: 'polygon', id: 'a' }, { kind: 'polygon', id: 'b' }]))
      .toEqual([{ x: 5, y: 0 }, { x: 10, y: 8 }]);
  });

  it('grows slots when a drag creates hits, then hides and recovers them without changing ids', () => {
    const runtime = makeEmptyRuntime();
    addPolygon(runtime, 'concave', [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10]]);
    const [a, b] = addLine(runtime, 'line', 1);
    const outputs = createBoundaryIntersectionSet(runtime, [
      { kind: 'polygon', id: 'concave' }, { kind: 'line', id: 'line' }
    ]);
    expect(outputs).toHaveLength(2);

    runtime.points[a].y = 5;
    runtime.points[b].y = 5;
    recomputeAllRuntime(runtime);
    const grownIds = Object.values(runtime.points).filter(point => point.boundaryIntersectionSlot).map(point => point.id).sort();
    expect(grownIds).toHaveLength(4);
    expect(grownIds.slice(0, outputs.length)).toEqual(outputs.slice().sort());
    const removed = grownIds[0];
    delete runtime.points[removed];

    runtime.points[a].y = 20;
    runtime.points[b].y = 20;
    recomputeAllRuntime(runtime);
    expect(grownIds.filter(id => id !== removed).every(id => runtime.points[id].geometryValid === false)).toBe(true);
    runtime.points[a].y = 5;
    runtime.points[b].y = 5;
    recomputeAllRuntime(runtime);
    expect(runtime.points[removed]).toBeUndefined();
    expect(grownIds.filter(id => id !== removed).every(id => runtime.points[id].geometryValid === true)).toBe(true);
  });

  it('reports every output slot when a defining line or polygon was deleted', () => {
    const runtime = makeEmptyRuntime();
    addPolygon(runtime, 'square', [[0, 0], [10, 0], [10, 10], [0, 10]]);
    addLine(runtime, 'line', 5);
    const outputs = createBoundaryIntersectionSet(runtime, [
      { kind: 'polygon', id: 'square' }, { kind: 'line', id: 'line' }
    ]);
    expect(outputs).toHaveLength(2);
    expect(boundaryIntersectionOutputsWithMissingParents(runtime)).toEqual([]);

    delete runtime.lines.line;
    expect(boundaryIntersectionOutputsWithMissingParents(runtime).sort()).toEqual(outputs.sort());
  });

  it('splits the source line and boundary sides, moves outputs between sides, and preserves styles', () => {
    const runtime = makeEmptyRuntime();
    const vertices: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10]];
    addPolygon(runtime, 'square', vertices);
    const edgeIds = vertices.map((_, index) => {
      const a = runtime.polygons.square.points[index];
      const b = runtime.polygons.square.points[(index + 1) % vertices.length];
      const id = `edge-${index}`;
      runtime.lines[id] = { id, points: [a, b], defining_points: [a, b], style: { color: '#00f' }, segmentStyles: [{ color: '#00f' }] };
      return id;
    });
    const [a, b] = addLine(runtime, 'source', 5);
    runtime.lines.source.segmentStyles = [{ color: '#f00', hidden: true }];
    const ids = createBoundaryIntersectionSet(runtime, [
      { kind: 'polygon', id: 'square' }, { kind: 'line', id: 'source' }
    ]);
    expect(runtime.lines.source.points).toHaveLength(4);
    expect(runtime.lines.source.segmentStyles?.map(style => style.color)).toEqual(['#f00', '#f00', '#f00']);
    expect(runtime.lines.source.segmentStyles?.every(style => style.hidden)).toBe(true);
    expect(runtime.lines[edgeIds[1]].points).toContain(ids[1]);
    expect(runtime.lines[edgeIds[3]].points).toContain(ids[0]);
    expect(runtime.lines[edgeIds[0]].points).toHaveLength(2);
    expect(runtime.lines[edgeIds[1]].segmentStyles?.every(style => style.color === '#00f')).toBe(true);

    const customA = 'custom-a', customB = 'custom-b';
    runtime.points[customA] = { id: customA, x: 20, y: 5, style: {} };
    runtime.points[customB] = { id: customB, x: 30, y: 5, style: {} };
    runtime.lines.custom = { id: 'custom', points: [customA, ids[0], customB], defining_points: [customA, customB], style: {} };

    runtime.points[a].x = 5;
    runtime.points[a].y = -5;
    runtime.points[b].x = 5;
    runtime.points[b].y = 15;
    recomputeAllRuntime(runtime);
    expect(runtime.lines[edgeIds[0]].points.filter(id => ids.includes(id))).toHaveLength(1);
    expect(runtime.lines[edgeIds[2]].points.filter(id => ids.includes(id))).toHaveLength(1);
    expect(runtime.lines[edgeIds[1]].points.filter(id => ids.includes(id))).toHaveLength(0);
    expect(runtime.lines[edgeIds[3]].points.filter(id => ids.includes(id))).toHaveLength(0);
    expect(runtime.lines.custom.points).toContain(ids[0]);

    runtime.points[a].x = -5;
    runtime.points[a].y = 1;
    runtime.points[b].x = 15;
    runtime.points[a].y = 1;
    runtime.points[b].y = 1;
    recomputeAllRuntime(runtime);
    expect(runtime.lines[edgeIds[0]].points.filter(id => ids.includes(id))).toHaveLength(0);
    expect(runtime.lines[edgeIds[2]].points.filter(id => ids.includes(id))).toHaveLength(0);
    expect(runtime.lines[edgeIds[1]].points).toContain(ids[1]);
    expect(runtime.lines[edgeIds[3]].points).toContain(ids[0]);
  });

  it('preserves a hidden split interval when all crossings disappear and recover', () => {
    const runtime=makeEmptyRuntime();
    addPolygon(runtime,'square',[[0,0],[10,0],[10,10],[0,10]]);
    const [a,b]=addLine(runtime,'source',5);
    const ids=createBoundaryIntersectionSet(runtime,[{kind:'polygon',id:'square'},{kind:'line',id:'source'}]);
    runtime.lines.source.segmentStyles![1]={color:'#abcdef',hidden:true,type:'dashed'};
    const originalOrder=[...runtime.lines.source.points],originalStyles=JSON.parse(JSON.stringify(runtime.lines.source.segmentStyles));
    runtime.points[a].y=20;runtime.points[b].y=20;recomputeAllRuntime(runtime);
    expect(ids.every(id=>runtime.points[id].geometryValid===false)).toBe(true);
    expect(runtime.lines.source.points).toEqual(originalOrder);
    expect(runtime.lines.source.segmentStyles).toEqual(originalStyles);
    runtime.points[a].y=5;runtime.points[b].y=5;recomputeAllRuntime(runtime);
    expect(ids.every(id=>runtime.points[id].geometryValid!==false)).toBe(true);
    expect(runtime.lines.source.points).toEqual(originalOrder);
    expect(runtime.lines.source.segmentStyles).toEqual(originalStyles);
  });

  it('handles a very long source line crossing a short polygon side', () => {
    const runtime = makeEmptyRuntime();
    addPolygon(runtime, 'square', [[0, 0], [10, 0], [10, 10], [0, 10]]);
    const a = 'long-a', b = 'long-b';
    runtime.points[a] = { id: a, x: -500_000_000, y: 5, style: {} };
    runtime.points[b] = { id: b, x: 500_000_000, y: 5, style: {} };
    runtime.lines.long = { id: 'long', points: [a, b], defining_points: [a, b], style: {} };
    expect(polygonBoundaryIntersections(toEngineState(runtime), [
      { kind: 'polygon', id: 'square' }, { kind: 'line', id: 'long' }
    ])).toEqual([{ x: 0, y: 5 }, { x: 10, y: 5 }]);
  });

  it('keeps an earlier output used as a defining endpoint of a later source line', () => {
    const runtime = makeEmptyRuntime();
    addPolygon(runtime, 'first', [[0, 0], [10, 0], [10, 10], [0, 10]]);
    const [a, b] = addLine(runtime, 'first-source', 5);
    const firstOutputs = createBoundaryIntersectionSet(runtime, [
      { kind: 'polygon', id: 'first' }, { kind: 'line', id: 'first-source' }
    ]);
    const anchor = firstOutputs[0];
    addPolygon(runtime, 'second', [[-5, -1], [5, -1], [5, 1], [-5, 1]]);
    const other = 'other-end';
    runtime.points[other] = { id: other, x: 0, y: -5, style: {} };
    runtime.lines['second-source'] = {
      id: 'second-source', points: [anchor, other], defining_points: [anchor, other], style: {}
    };
    const secondOutputs = createBoundaryIntersectionSet(runtime, [
      { kind: 'polygon', id: 'second' }, { kind: 'line', id: 'second-source' }
    ]);
    expect(secondOutputs).toHaveLength(2);
    expect(runtime.lines['second-source'].defining_points).toContain(anchor);
    expect(runtime.lines['second-source'].points).toContain(anchor);
    expect(runtime.lines['first-source'].points).toContain(anchor);
    runtime.points[a].y = 6;
    runtime.points[b].y = 6;
    recomputeAllRuntime(runtime);
    expect(runtime.lines['second-source'].points).toContain(anchor);
  });
});
