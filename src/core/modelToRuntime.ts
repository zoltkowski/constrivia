import { makeEmptyRuntime } from './runtimeTypes';
import { polygonVerticesFromPoly } from './engine';

type LegacyModel = {
  points: any[];
  lines: any[];
  circles: any[];
  angles: any[];
  polygons: any[];
  labels?: any[];
  inkStrokes?: any[];
  idCounters?: Partial<Record<'point' | 'line' | 'circle' | 'angle' | 'polygon', number>>;
};

// Used by main UI flow.
export function modelToRuntime(model: LegacyModel): any {
  const rt: any = makeEmptyRuntime();

  model.points.forEach((p) => {
    const pr: any = {
      id: p.id,
      x: p.x,
      y: p.y,
      constructionKind: (p as any).construction_kind ?? 'free',
      parents: ((p as any).defining_parents || []).slice()
    };
    if ((p as any).midpoint) pr.midpointMeta = (p as any).midpoint;
    if ((p as any).bisect) pr.bisectMeta = (p as any).bisect;
    if ((p as any).symmetric) pr.symmetricMeta = (p as any).symmetric;
    rt.points[pr.id] = pr;
  });

  model.lines.forEach((l) => {
    const defPts: [string, string] = [
      (function () { const i = (l as any).defining_points?.[0]; return typeof i === 'number' ? model.points[i]?.id ?? (l as any).id : (l as any).id })(),
      (function () { const i = (l as any).defining_points?.[1]; return typeof i === 'number' ? model.points[i]?.id ?? (l as any).id : (l as any).id })()
    ];
    const lr: any = {
      id: l.id,
      definingPoints: defPts,
      pointIds: ((l as any).points || []).map((pi: number) => (model.points[pi]?.id) ?? `p${pi}`)
    };
    rt.lines[lr.id] = lr;
  });

  model.circles.forEach((c) => {
    const cr: any = {
      id: c.id,
      center: (typeof (c as any).center === 'number' ? (model.points[(c as any).center]?.id ?? c.id) : c.id),
      radiusPoint: (typeof (c as any).radius_point === 'number' ? (model.points[(c as any).radius_point]?.id ?? c.id) : c.id),
      pointIds: ((c as any).points || []).map((pi: number) => (model.points[pi]?.id) ?? `p${pi}`)
    };
    if (((c as any).circle_kind) === 'three-point' && (c as any).defining_points)
      cr.definingPoints3 = (c as any).defining_points.map((idx: number) => (model.points[idx]?.id) ?? `p${idx}`);
    rt.circles[cr.id] = cr;
  });

  model.angles.forEach((a) => {
    const ar: any = {
      id: a.id,
      vertex: (typeof a.vertex === 'number' ? (model.points[a.vertex]?.id ?? a.id) : (typeof a.vertex === 'string' ? a.vertex : a.id)),
      point1: (typeof (a as any).point1 === 'string'
        ? (a as any).point1
        : (typeof (a as any).point1 === 'number'
          ? (model.points[(a as any).point1]?.id ?? a.id)
          : (typeof (a as any).leg1?.otherPoint === 'number' ? (model.points[(a as any).leg1.otherPoint]?.id ?? a.id) : a.id))),
      point2: (typeof (a as any).point2 === 'string'
        ? (a as any).point2
        : (typeof (a as any).point2 === 'number'
          ? (model.points[(a as any).point2]?.id ?? a.id)
          : (typeof (a as any).leg2?.otherPoint === 'number' ? (model.points[(a as any).leg2.otherPoint]?.id ?? a.id) : a.id)))
    };
    if (typeof (a as any).arm1LineId === 'string') ar.arm1LineId = (a as any).arm1LineId;
    else if (typeof (a as any).leg1?.line === 'number') ar.arm1LineId = (function(){ const li = (a as any).leg1.line; return model.lines[li]?.id ?? undefined })();
    if (typeof (a as any).arm2LineId === 'string') ar.arm2LineId = (a as any).arm2LineId;
    else if (typeof (a as any).leg2?.line === 'number') ar.arm2LineId = (function(){ const li = (a as any).leg2.line; return model.lines[li]?.id ?? undefined })();
    rt.angles[ar.id] = ar;
  });

  model.polygons.forEach((p) => {
    const vertsIdx = (p as any).points && Array.isArray((p as any).points) && (p as any).points.length
      ? (p as any).points
      : (p as any).vertices && Array.isArray((p as any).vertices) && (p as any).vertices.length
        ? (p as any).vertices
        : polygonVerticesFromPoly(p, model.points as any, model.lines as any);
    const poly: any = {
      id: p.id,
      vertices: (vertsIdx || []).map((vi: number) => (model.points[vi]?.id) ?? `p${vi}`)
    };
    poly.edgeLines = ((p as any).lines || []).map((li: number) => model.lines[li]?.id ?? undefined);
    rt.polygons[poly.id] = poly;
  });

  ((model.labels || []) as any[]).forEach((lbl: any, i: number) => {
    rt.labels[`lbl${i}`] = { ...lbl, id: `lbl${i}` };
  });

  ((model.inkStrokes || []) as any[]).forEach((s: any) => {
    rt.inkStrokes[s.id] = { ...s };
  });

  const counters = model.idCounters ?? {};
  rt.idCounters = {
    point: counters.point ?? 0,
    line: counters.line ?? 0,
    circle: counters.circle ?? 0,
    angle: counters.angle ?? 0,
    polygon: counters.polygon ?? 0
  };

  return rt;
}

export default { modelToRuntime };
