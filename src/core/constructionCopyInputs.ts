import type { ConstructionParent, ConstructionRuntime, ObjectId } from './runtimeTypes';
import { circleInputPointIds } from './circleGeometry';

/** Collect a construction's inputs once, including dependencies of derived points. */
export function collectConstructionCopyInputs(runtime: ConstructionRuntime, roots: ConstructionParent[]) {
  const points = new Set<ObjectId>(), lines = new Set<ObjectId>(), circles = new Set<ObjectId>();
  const queue = roots.slice();
  const point = (id?: ObjectId | null) => { if (id) queue.push({kind:'point',id}); };
  const line = (id?: ObjectId | null) => { if (id) queue.push({kind:'line',id}); };
  for (let i=0;i<queue.length;i++) {
    const ref=queue[i];
    if (ref.kind==='point') {
      const p=runtime.points[ref.id];
      if (!p || points.has(ref.id)) continue;
      points.add(ref.id);
      queue.push(...(p.parent_refs ?? []));
      if (p.midpointMeta) {p.midpointMeta.parents.forEach(point);line(p.midpointMeta.parentLineId);}
      if (p.symmetricMeta) {point(p.symmetricMeta.source);queue.push(p.symmetricMeta.mirror);}
      if (p.bisectMeta) {
        const meta=p.bisectMeta;point(meta.vertex);
        if (meta.arms) meta.arms.forEach(arm=>arm.kind==='point'?point(arm.pointId):line(arm.lineId));
        else [meta.seg1,meta.seg2].forEach(seg=>{point(seg.a);point(seg.b);line(seg.lineId);});
      }
      line(p.parallel_helper_for);line(p.perpendicular_helper_for);line(p.auxiliaryFor);
    } else if (ref.kind==='line') {
      const l=runtime.lines[ref.id];
      if (!l || lines.has(ref.id)) continue;
      lines.add(ref.id);l.points.forEach(point);l.defining_points?.forEach(point);
      if (l.parallel) {point(l.parallel.throughPoint);point(l.parallel.helperPoint);line(l.parallel.referenceLine);}
      if (l.perpendicular) {point(l.perpendicular.throughPoint);point(l.perpendicular.helperPoint);line(l.perpendicular.referenceLine);l.perpendicular.referencePoints?.forEach(point);}
      if (l.bisector) {point(l.bisector.vertex);point(l.bisector.bisectPoint);}
    } else {
      const c=runtime.circles[ref.id];
      if (!c || circles.has(ref.id)) continue;
      circles.add(ref.id);point(c.center);circleInputPointIds(c).forEach(point);c.points.forEach(point);
    }
  }
  return {points,lines,circles};
}
