import type { ConstructionRuntime, Model } from './runtimeTypes';
import { makeEmptyRuntime } from './runtimeTypes';

// Used by main UI flow to mirror the array model into runtime maps.
export function modelToRuntime(model: Model): ConstructionRuntime {
  const rt = makeEmptyRuntime();

  model.points.forEach((p) => {
    if (p?.id) rt.points[p.id] = p;
  });
  model.lines.forEach((l) => {
    if (l?.id) rt.lines[l.id] = l;
  });
  model.circles.forEach((c) => {
    if (c?.id) rt.circles[c.id] = c;
  });
  model.angles.forEach((a) => {
    if (a?.id) rt.angles[a.id] = a;
  });
  model.polygons.forEach((p) => {
    if (p?.id) rt.polygons[p.id] = p;
  });
  model.labels.forEach((lbl, i) => {
    rt.labels[`lbl${i}`] = { ...lbl, id: `lbl${i}` } as any;
  });
  model.inkStrokes.forEach((s) => {
    if (s?.id) rt.inkStrokes[s.id] = s;
  });
  rt.idCounters = {
    point: model.idCounters.point ?? 0,
    line: model.idCounters.line ?? 0,
    circle: model.idCounters.circle ?? 0,
    angle: model.idCounters.angle ?? 0,
    polygon: model.idCounters.polygon ?? 0
  };

  return rt;
}

export default { modelToRuntime };
