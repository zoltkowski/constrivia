import { findLineHits, findLineHitForPos, type HitTestDeps } from '../src/canvas/hitTesting';
import { linePresentationPoints } from '../src/canvas/linePresentation';
import { pointToSegmentDistance } from '../src/core/lineTools';
import { applyEngineState, toEngineState } from '../src/core/engineAdapter';
import { recomputeAll } from '../src/core/engineCompute';
import { reconcileLineTopologyStyles } from '../src/ui/lineTopologyStyles';
import {describe,it,expect} from 'vitest';
import {makeEmptyRuntime} from '../src/core/runtimeTypes';
import {createPointAngleBisector, createAngleBisector} from '../src/core/pointAngleBisector';
import {recomputeAllRuntime} from '../src/core/runtimeRecompute';
import {createConstructionClipboard,pasteConstructionClipboard} from '../src/core/constructionClipboard';
const scene=()=>{const r=makeEmptyRuntime();r.points={A:{id:'A',x:100,y:0,style:{}},V:{id:'V',x:0,y:0,style:{}},B:{id:'B',x:0,y:100,style:{}}};return r;};
describe('three-point angle bisector',()=>{
 it('creates one ray and no arm segments or visible auxiliary points',()=>{const r=scene();const id=createPointAngleBisector(r,['A','V','B'])!;expect(Object.keys(r.lines)).toEqual([id]);expect(Object.values(r.points).filter(p=>!p.style.hidden)).toHaveLength(3);expect(r.lines[id].leftRay?.hidden).toBe(true);expect(r.lines[id].rightRay?.hidden).toBe(false);expect(r.lines[id].points).toEqual(['V']);expect(r.lines[id].segmentStyles).toEqual([]);const h=r.points[r.lines[id].bisector!.bisectPoint];expect(h.x).toBeCloseTo(h.y);expect(h.bisectMeta?.vertex).toBe('V');});
 it('follows all three points and recovers after a collapsed arm',()=>{const r=scene();const id=createPointAngleBisector(r,['A','V','B'])!;r.points.A.x=0;recomputeAllRuntime(r);expect(r.lines[id].geometryValid).toBe(false);r.points.A.x=150;r.points.V={...r.points.V,x:20,y:30};recomputeAllRuntime(r);expect(r.lines[id].geometryValid).toBe(true);const h=r.points[r.lines[id].bisector!.bisectPoint],v=r.points.V;const cos=(p:{x:number;y:number})=>((h.x-v.x)*(p.x-v.x)+(h.y-v.y)*(p.y-v.y))/(Math.hypot(h.x-v.x,h.y-v.y)*Math.hypot(p.x-v.x,p.y-v.y));expect(cos(r.points.A)).toBeCloseTo(cos(r.points.B));});
 it('copies all input points without reconnecting to the source after JSON roundtrip',()=>{const r=scene();const id=createPointAngleBisector(r,['A','V','B'])!;const clip=JSON.parse(JSON.stringify(createConstructionClipboard(r,{lines:[id]})));const pasted=pasteConstructionClipboard(r,clip)!;expect(pasted).toBeTruthy();const other=Object.values(r.lines).find(l=>l.id!==id)!;const meta=r.points[other.bisector!.bisectPoint].bisectMeta!;expect(meta.vertex).not.toBe('V');expect(meta.arms?.map(a=>a.kind==='point'&&a.pointId).every(id=>!['A','B','V'].includes(String(id)))).toBe(true);expect(other.points).toEqual([meta.vertex]);expect(other.segmentStyles).toEqual([]);const helper={...r.points[other.bisector!.bisectPoint]};r.points.A.y=90;recomputeAllRuntime(r);expect(r.points[helper.id].x).toBeCloseTo(helper.x);expect(r.points[helper.id].y).toBeCloseTo(helper.y);});
 it('rejects incomplete, coincident and spatial inputs atomically',()=>{const r=scene();expect(createPointAngleBisector(r,['A','A','B'])).toBeNull();r.points.A.x=0;expect(createPointAngleBisector(r,['A','V','B'])).toBeNull();expect(Object.keys(r.lines)).toHaveLength(0);expect(Object.keys(r.points)).toHaveLength(3);});
});

const hitDeps = (runtime: ReturnType<typeof scene>): HitTestDeps => ({
  runtime, showHidden: false, canvas: null, dpr: 1, zoomFactor: 1,
  currentHitRadius: () => 0.01, pointToSegmentDistance,
  getPointById: id => runtime.points[id] ?? null
});

describe('angle bisector without an artificial segment', () => {
  it('hits one continuous ray from the vertex across the direction helper', () => {
    const r = scene(), id = createPointAngleBisector(r, ['A', 'V', 'B'])!;
    const deps = hitDeps(r);
    for (const distance of [0.5, 2, 6, 8, 20, 100]) {
      const p = { x: distance / Math.sqrt(2), y: distance / Math.sqrt(2) };
      expect(findLineHits(p, deps)).toEqual([{ lineId: id, part: 'rayRight' }]);
      expect(findLineHitForPos(id, p, deps)?.part).toBe('rayRight');
    }
    expect(findLineHits({ x: -5, y: -5 }, deps)).toEqual([]);
    expect(linePresentationPoints(r.lines[id], r)?.map(p => p.id)).toEqual(['V']);
    r.lines[id].rightRay!.hidden = true;
    expect(findLineHits({ x: 2, y: 2 }, deps)).toEqual([]);
  });

  it('uses the same topology for segment arms and the exterior sector of an angle', () => {
    const r = scene();
    r.lines.a = { id: 'a', points: ['V', 'A'], defining_points: ['V', 'A'], style: {} };
    r.lines.b = { id: 'b', points: ['V', 'B'], defining_points: ['V', 'B'], style: {} };
    const segmentId = createAngleBisector(r, { vertex: 'V', seg1: { lineId: 'a', a: 'V', b: 'A' }, seg2: { lineId: 'b', a: 'V', b: 'B' }, epsilon: 8 })!;
    const exteriorId = createAngleBisector(r, { vertex: 'V', arms: [{ kind: 'line', lineId: 'a', direction: 1 }, { kind: 'line', lineId: 'b', direction: 1 }], exterior: true, epsilon: 8 })!;
    expect(r.lines[segmentId].points).toEqual(['V']);
    expect(r.lines[exteriorId].points).toEqual(['V']);
    expect(r.lines[segmentId].segmentStyles).toEqual([]);
    expect(r.lines[exteriorId].segmentStyles).toEqual([]);
    expect(findLineHits({ x: -2, y: -2 }, hitDeps(r))).toEqual([{ lineId: exteriorId, part: 'rayRight' }]);
  });

  it('removes a stored helper subdivision and keeps intersections before that helper', () => {
    const r = scene(), id = createPointAngleBisector(r, ['A', 'V', 'B'])!;
    const line = r.lines[id], helper = line.bisector!.bisectPoint;
    line.points.push(helper); line.segmentStyles = [{ color: '#f00' }];
    r.points.C = { id: 'C', x: -10, y: 2, style: {} };
    r.points.D = { id: 'D', x: 20, y: 2, style: {} };
    r.lines.cut = { id: 'cut', points: ['C', 'D'], defining_points: ['C', 'D'], style: {} };
    r.points.I = { id: 'I', x: 0, y: 0, style: {}, construction_kind: 'intersection', parent_refs: [{ kind: 'line', id }, { kind: 'line', id: 'cut' }] };
    const engine = toEngineState(r);
    expect(recomputeAll(engine).converged).toBe(true);
    applyEngineState(r, engine, { lines: true });
    expect(r.lines[id].points).toEqual(['V']);
    expect(r.lines[id].segmentStyles).toEqual([]);
    expect(r.points.I.x).toBeCloseTo(2); expect(r.points.I.y).toBeCloseTo(2);
  });

  it('creates only a real interval from the vertex to a user point and preserves its style past the helper', () => {
    const r = scene(), id = createPointAngleBisector(r, ['A', 'V', 'B'])!;
    const line = r.lines[id];
    r.points.P = { id: 'P', x: 2, y: 2, style: {}, construction_kind: 'on_object', parent_refs: [{ kind: 'line', id }] };
    line.points.push('P'); line.segmentStyles = [{ color: '#ff5500', hidden: false }];
    expect(findLineHits({ x: 1, y: 1 }, hitDeps(r))).toEqual([{ lineId: id, part: 'segment', seg: 0 }]);
    expect(findLineHits({ x: 3, y: 3 }, hitDeps(r))).toEqual([{ lineId: id, part: 'rayRight' }]);
    line.rightRay!.hidden = true;
    const before = Object.fromEntries(Object.entries(r.points).map(([id, p]) => [id, { x: p.x, y: p.y }])), after = { ...before, P: { x: 100, y: 100 } };
    const next = reconcileLineTopologyStyles(line, ['V', 'P'], before, after);
    expect(next.segmentStyles).toEqual([{ color: '#ff5500', hidden: false }]);
    r.points.A.y = 60; recomputeAllRuntime(r);
    const v = r.points.V, h = r.points[line.bisector!.bisectPoint], p = r.points.P;
    expect((p.x-v.x)*(h.y-v.y)-(p.y-v.y)*(h.x-v.x)).toBeCloseTo(0);
    expect(r.lines[id].segmentStyles?.[0].color).toBe('#ff5500');
    expect(r.lines[id].rightRay?.hidden).toBe(true);
  });
});
