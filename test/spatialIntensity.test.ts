import { describe, expect, it, vi } from 'vitest';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { addSpatialEdgePoint, createCuboid, createPrismOrPyramid, rotateSpatialGroup, syncSpatialGeometry } from '../src/core/spatialGeometry';
import { makeApplySelectionStyle, renderMultiselectOverlays, renderPoints, renderPolygonsAndLines } from '../src/canvas/renderer';

const theme = { defaultStroke: '#123456', lineWidth: 2, pointSize: 2, highlight: '#ffaa00', selectionPointRadius: 4 };
function canvasHarness() {
  const draws: { alpha: number; kind: string; end?: number[] }[] = [];
  const stack: number[] = [];
  let end: number[] | undefined;
  const ctx: any = { globalAlpha: 1, canvas: { width: 800, height: 600 },
    save: () => stack.push(ctx.globalAlpha), restore: () => { ctx.globalAlpha = stack.pop()!; },
    beginPath: () => { end = undefined; }, moveTo: vi.fn(), lineTo: (x: number,y: number) => { end = [x,y]; },
    stroke: () => draws.push({alpha: ctx.globalAlpha, kind: 'stroke', end}),
    fill: () => draws.push({alpha: ctx.globalAlpha, kind: 'fill'}),
    setLineDash: vi.fn(), translate: vi.fn(), scale: vi.fn(), arc: vi.fn()
  };
  return { ctx, draws };
}
const deps = () => ({ THEME: theme, showHidden: false, dpr: 1, zoomFactor: 1,
  hasMultiSelection: () => false, selectedLineId: null, selectedPolygonId: null,
  selectedCircleId: null, selectedAngleId: null, selectedLabel: null,
  selectedSegments: new Set<string>(), selectedArcSegments: new Set(),
  multiSelectedLines: new Set(), multiSelectedPoints: new Set(), multiSelectedCircles: new Set(),
  multiSelectedAngles: new Set(), multiSelectedInkStrokes: new Set(), selectionEdges: true,
  screenUnits: (n: number) => n, renderWidth: (n: number) => n, pointRadius: (n: number) => n,
  worldToCanvas: (x: number,y: number) => ({x,y}), polygonVerticesOrdered: () => [],
  segmentKey: (id: string,_: unknown,i: number) => id+':'+i,
  lineExtent: () => null, getLineHandle: () => null, getLineRotateHandle: () => null,
  isParallelLine: () => false, isPerpendicularLine: () => false,
  applyStrokeStyle: vi.fn(), drawSegmentTicks: vi.fn(), drawLabelText: vi.fn(),
  applySelectionStyle: makeApplySelectionStyle(theme, n=>n)
});

describe('3D back geometry intensity', () => {
  it.each(['cuboid','prism','pyramid'] as const)('updates back vertices and edge subdivision points after rotating a %s', kind => {
    const runtime=makeEmptyRuntime(), id=kind==='cuboid'?createCuboid(runtime,{x:0,y:0},60):createPrismOrPyramid(runtime,kind,{x:0,y:0},60,4)!;
    const solid=runtime.solids![id];
    runtime.spatialGroups![solid.groupId].orientation=[1,0,0,0,0,-1,0,1,0];
    syncSpatialGeometry(runtime);
    const hiddenVertex=solid.vertices.find(id=>runtime.points[id].spatialHiddenPoint)!;
    const back=solid.edges.map(id=>runtime.lines[id]).find(l=>l.spatialHiddenEdge)!;
    expect(hiddenVertex).toBeTruthy();expect(back).toBeTruthy();
    const pointId=addSpatialEdgePoint(runtime,...back.defining_points,.5,back.id)!;
    syncSpatialGeometry(runtime);
    expect(runtime.points[pointId].spatialHiddenPoint).toBe(true);
    const styles=JSON.stringify([solid.edges.map(id=>runtime.lines[id].style),solid.vertices.map(id=>runtime.points[id].style)]);
    const initial=[...runtime.spatialGroups![solid.groupId].orientation] as any;
    rotateSpatialGroup(runtime,solid.groupId,initial,Math.PI/.012,0);
    expect(runtime.points[hiddenVertex].spatialHiddenPoint).toBe(false);
    expect(runtime.points[pointId].spatialHiddenPoint).toBe(false);
    expect(JSON.stringify([solid.edges.map(id=>runtime.lines[id].style),solid.vertices.map(id=>runtime.points[id].style)])).toBe(styles);
  });
  it('draws back edges and their direct and group selection at 15%, with full intensity on front edges', () => {
    const runtime=makeEmptyRuntime();
    runtime.points={a:{id:'a',x:0,y:0,style:{}},b:{id:'b',x:40,y:0,style:{}},c:{id:'c',x:0,y:20,style:{}},d:{id:'d',x:40,y:20,style:{}}};
    runtime.lines={back:{id:'back',defining_points:['a','b'],points:['a','b'],style:{},spatialHiddenEdge:true},front:{id:'front',defining_points:['c','d'],points:['c','d'],style:{}}};
    const h=canvasHarness(), d:any=deps();d.selectedSegments=new Set(['back:0','front:0']);
    renderPolygonsAndLines(h.ctx,runtime,d);
    expect(h.draws.filter(x=>x.end?.[1]===0).map(x=>x.alpha)).toEqual([.15,.15]);
    expect(h.draws.filter(x=>x.end?.[1]===20).map(x=>x.alpha)).toEqual([1,1]);
    h.draws.length=0;d.applyStrokeStyle.mockClear();d.multiSelectedLines=new Set(['back','front']);
    renderMultiselectOverlays(h.ctx,runtime,d);
    expect(h.draws.map(x=>x.alpha)).toEqual([.15,1]);
    expect(d.applyStrokeStyle.mock.calls).toEqual([['dashed']]);
    expect(h.ctx.globalAlpha).toBe(1);
  });
  it('draws back vertices and direct and group selection at 15% while front and 2D points stay full intensity', () => {
    const runtime=makeEmptyRuntime();runtime.points={back:{id:'back',x:0,y:0,style:{},spatialHiddenPoint:true},front:{id:'front',x:40,y:0,style:{}},flat:{id:'flat',x:80,y:0,style:{}}};
    const h=canvasHarness(),d:any={...deps(),selectedPointId:'back'};
    renderPoints(h.ctx,runtime,d);
    expect(h.draws.filter(x=>x.kind==='fill').map(x=>x.alpha)).toEqual([.15,1,1]);
    expect(h.draws.filter(x=>x.kind==='stroke').map(x=>x.alpha)).toEqual([.15]);
    h.draws.length=0;d.multiSelectedPoints=new Set(['back','front','flat']);
    renderMultiselectOverlays(h.ctx,runtime,d);
    expect(h.draws.map(x=>x.alpha)).toEqual([.15,1,1]);
    expect(h.ctx.globalAlpha).toBe(1);
  });
});
