import { spatialIntensity, spatialLineType, normalizeSpatialAppearance } from '../src/canvas/spatialAppearance';
import { findPoint, findPointWithRadius, findLineHits, findLineHitForPos } from '../src/canvas/hitTesting';
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

describe('Configurable back geometry appearance',()=>{
 it('normalizes appearance settings and leaves front and 2D objects unaffected',()=>{
  expect(normalizeSpatialAppearance()).toEqual({spatialBackIntensity:.15,spatialBackEdgeStyle:'dashed',spatialBackHidden:false});
  expect(normalizeSpatialAppearance({spatialBackIntensity:NaN,spatialBackEdgeStyle:'invalid' as any}).spatialBackIntensity).toBe(.15);
  expect(normalizeSpatialAppearance({spatialBackIntensity:-3}).spatialBackIntensity).toBe(0);
  expect(normalizeSpatialAppearance({spatialBackIntensity:3}).spatialBackIntensity).toBe(1);
  for(const value of [0,.35,1]){
   const settings={spatialBackIntensity:value};expect(spatialIntensity({spatialHiddenPoint:true},settings)).toBe(value);expect(spatialIntensity({spatialHiddenEdge:true},settings)).toBe(value);expect(spatialIntensity({},settings)).toBe(1);
  }
  expect(spatialIntensity({spatialHiddenPoint:true},{spatialBackHidden:true})).toBe(0);expect(spatialIntensity({},{spatialBackHidden:true})).toBe(1);
  for(const style of ['solid','dashed','dotted'] as const){expect(spatialLineType({spatialHiddenEdge:true},'dotted',{spatialBackEdgeStyle:style})).toBe(style);expect(spatialLineType({},'dotted',{spatialBackEdgeStyle:style})).toBe('dotted');}
 });
 it('uses the chosen intensity and line style for strokes and selection without changing saved styles',()=>{
  const r=makeEmptyRuntime();r.points={a:{id:'a',x:0,y:0,style:{}},b:{id:'b',x:40,y:0,style:{}}};r.lines.back={id:'back',points:['a','b'],defining_points:['a','b'],style:{type:'solid'},spatialHiddenEdge:true};
  const original=JSON.stringify(r.lines);
  for(const style of ['solid','dashed','dotted'] as const){
   const h=canvasHarness(),d:any=deps();d.THEME={...theme,spatialBackIntensity:.6,spatialBackEdgeStyle:style};d.selectedSegments=new Set(['back:0']);renderPolygonsAndLines(h.ctx,r,d);
   expect(h.draws.map(v=>v.alpha)).toEqual([.6,.6]);expect(d.applyStrokeStyle).toHaveBeenCalledWith(style);
   h.draws.length=0;d.multiSelectedLines=new Set(['back']);renderMultiselectOverlays(h.ctx,r,d);expect(h.draws.map(v=>v.alpha)).toEqual([.6]);
  }
  expect(JSON.stringify(r.lines)).toBe(original);
 });
 it.each([{spatialBackHidden:true},{spatialBackIntensity:0}])('fully hides rear markers, labels and selections for %j',settings=>{
  const r=makeEmptyRuntime();r.points={a:{id:'a',x:0,y:0,style:{},spatialHiddenPoint:true,label:{text:'A',offset:{x:8,y:-8}}},b:{id:'b',x:40,y:0,style:{},spatialHiddenPoint:true}};r.lines.back={id:'back',points:['a','b'],defining_points:['a','b'],style:{},spatialHiddenEdge:true,label:{text:'a',offset:{x:0,y:-10}}};
  const h=canvasHarness(),d:any=deps();d.THEME={...theme,...settings};d.selectedPointId='a';d.selectedSegments=new Set(['back:0']);d.multiSelectedPoints=new Set(['a']);d.multiSelectedLines=new Set(['back']);
  renderPolygonsAndLines(h.ctx,r,d);renderPoints(h.ctx,r,d);renderMultiselectOverlays(h.ctx,r,d);expect(h.draws).toEqual([]);expect(d.drawLabelText).not.toHaveBeenCalled();
 });
 it('does not hit fully hidden rear points or edges, including custom-radius and selected-line paths',()=>{
  const r=makeEmptyRuntime();r.points={a:{id:'a',x:0,y:0,style:{},spatialHiddenPoint:true},b:{id:'b',x:40,y:0,style:{},spatialHiddenPoint:true},front:{id:'front',x:80,y:0,style:{}}};r.lines.back={id:'back',points:['a','b'],defining_points:['a','b'],style:{},spatialHiddenEdge:true};
  const d:any={runtime:r,showHidden:true,currentHitRadius:()=>4,canvas:null,dpr:1,zoomFactor:1,pointToSegmentDistance:(p:any)=>Math.abs(p.y),spatialAppearance:{spatialBackHidden:true}};
  expect(findPoint({x:0,y:0},d)).toBeNull();expect(findPointWithRadius({x:0,y:0},10,d)).toBeNull();expect(findPoint({x:80,y:0},d)).toBe('front');expect(findLineHits({x:20,y:0},d)).toEqual([]);expect(findLineHitForPos('back',{x:20,y:0},d)).toBeNull();
  d.spatialAppearance.spatialBackHidden=false;expect(findPoint({x:0,y:0},d)).toBe('a');expect(findLineHits({x:20,y:0},d)).toHaveLength(1);
 });
});
