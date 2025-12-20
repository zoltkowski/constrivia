import type { Model } from '../types';
import type {
  ConstructionRuntime,
  PointRuntime,
  LineRuntime,
  CircleRuntime,
  AngleRuntime,
  PolygonRuntime
} from './runtimeTypes';
import { makeEmptyRuntime } from './runtimeTypes';
import { polygonVerticesFromPoly } from './engine';

// Adapter helpers for incremental migration: convert the legacy array-indexed
// `Model` (src/types.ts) to `ConstructionRuntime` (src/core/runtimeTypes.ts)
// and back. This is intentionally conservative and keeps placeholders for
// callbacks like `recompute` so the converted model remains usable during
// migration.

function idForPointIndex(model: Model, idx: number | undefined): string | null {
  if (typeof idx !== 'number' || idx < 0) return null;
  const p = model.points[idx];
  return p?.id ?? null;
}

function idForLineIndex(model: Model, idx: number | undefined): string | null {
  if (typeof idx !== 'number' || idx < 0) return null;
  const l = model.lines[idx];
  return l?.id ?? null;
}

export function modelToRuntime(model: Model): ConstructionRuntime {
  const rt = makeEmptyRuntime();

  // points
  model.points.forEach((p) => {
    const pr: PointRuntime = {
      id: p.id,
      x: p.x,
      y: p.y,
      constructionKind: p.construction_kind ?? 'free',
      parents: (p.defining_parents || []).slice()
    };
    if ((p as any).midpoint) pr.midpointMeta = (p as any).midpoint;
    if ((p as any).bisect) pr.bisectMeta = (p as any).bisect;
    if ((p as any).symmetric) pr.symmetricMeta = (p as any).symmetric;
    rt.points[pr.id] = pr;
  });

  // lines
  model.lines.forEach((l) => {
    const defPts: [string, string] = [
      idForPointIndex(model, l.defining_points?.[0]) ?? l.id,
      idForPointIndex(model, l.defining_points?.[1]) ?? l.id
    ];
    const lr: LineRuntime = {
      id: l.id,
      definingPoints: defPts,
      pointIds: (l.points || []).map((pi) => idForPointIndex(model, pi) ?? `p${pi}`)
    };
    rt.lines[lr.id] = lr;
  });

  // circles
  model.circles.forEach((c) => {
    const cr: CircleRuntime = {
      id: c.id,
      center: idForPointIndex(model, c.center) ?? c.id,
      radiusPoint: idForPointIndex(model, c.radius_point) ?? c.id,
      pointIds: (c.points || []).map((pi) => idForPointIndex(model, pi) ?? `p${pi}`)
    };
    if ((c as any).circle_kind === 'three-point' && (c as any).defining_points)
      cr.definingPoints3 = (c as any).defining_points.map((idx: number) => idForPointIndex(model, idx) ?? `p${idx}`) as [string, string, string];
    rt.circles[cr.id] = cr;
  });

  // angles
  model.angles.forEach((a) => {
    const ar: AngleRuntime = {
      id: a.id,
      vertex: idForPointIndex(model, a.vertex) ?? a.id,
      point1: idForPointIndex(model, a.leg1?.otherPoint) ?? a.id,
      point2: idForPointIndex(model, a.leg2?.otherPoint) ?? a.id
    };
    if (typeof a.leg1?.line === 'number') ar.arm1LineId = idForLineIndex(model, a.leg1.line) ?? undefined;
    if (typeof a.leg2?.line === 'number') ar.arm2LineId = idForLineIndex(model, a.leg2.line) ?? undefined;
    rt.angles[ar.id] = ar;
  });

  // polygons — prefer explicit vertices when present, else derive from lines
  model.polygons.forEach((p) => {
    const vertsIdx = (p as any).vertices && Array.isArray((p as any).vertices) && (p as any).vertices.length
      ? (p as any).vertices
      : polygonVerticesFromPoly(p, model.points as any, model.lines as any);
    const poly: PolygonRuntime = {
      id: p.id,
      vertices: (vertsIdx || []).map((vi: number) => idForPointIndex(model, vi) ?? `p${vi}`)
    };
    poly.edgeLines = (p.lines || []).map((li) => idForLineIndex(model, li) ?? undefined);
    rt.polygons[poly.id] = poly;
  });

  // labels
  (model.labels || []).forEach((lbl, i) => {
    rt.labels[`lbl${i}`] = { ...lbl, id: `lbl${i}` };
  });

  // ink strokes
  (model.inkStrokes || []).forEach((s) => {
    rt.inkStrokes[s.id] = { ...s } as any;
  });

  // counters
  rt.idCounters = {
    point: model.idCounters.point ?? 0,
    line: model.idCounters.line ?? 0,
    circle: model.idCounters.circle ?? 0,
    angle: model.idCounters.angle ?? 0,
    polygon: model.idCounters.polygon ?? 0
  };

  return rt;
}

export function runtimeToModel(rt: ConstructionRuntime): Model {
  // build arrays and id->index maps
  const model: Model = {
    points: [],
    lines: [],
    circles: [],
    angles: [],
    polygons: [],
    inkStrokes: [],
    labels: [],
    idCounters: { point: 0, line: 0, circle: 0, angle: 0, polygon: 0 },
    indexById: { point: {}, line: {}, circle: {}, angle: {}, polygon: {} }
  } as unknown as Model;

  // points
  Object.values(rt.points).forEach((p) => {
    const point: any = {
      object_type: 'point',
      id: p.id,
      x: p.x,
      y: p.y,
      style: { color: '#ffffff', size: 4 },
      label: undefined,
      construction_kind: (p.constructionKind as any) ?? 'free',
      defining_parents: (p.parents || []).slice(),
      parent_refs: [],
      recompute: () => {},
      on_parent_deleted: () => {}
    };
    if (p.midpointMeta) point.midpoint = p.midpointMeta;
    if (p.bisectMeta) point.bisect = p.bisectMeta;
    if (p.symmetricMeta) point.symmetric = p.symmetricMeta;
    model.points.push(point);
    model.indexById.point[point.id] = model.points.length - 1;
  });

  const pointIdToIndex: Record<string, number> = {};
  model.points.forEach((p, i) => (pointIdToIndex[p.id] = i));

  // lines
  Object.values(rt.lines).forEach((l) => {
    const pts = (l.pointIds || []).map((id) => pointIdToIndex[id]).filter((v) => typeof v === 'number');
    const def0 = l.definingPoints?.[0] ? pointIdToIndex[l.definingPoints[0]] : pts[0] ?? 0;
    const def1 = l.definingPoints?.[1] ? pointIdToIndex[l.definingPoints[1]] : pts[pts.length - 1] ?? 0;
    const line: any = {
      object_type: 'line',
      id: l.id,
      points: pts,
      defining_points: [def0, def1],
      segmentStyles: [],
      segmentKeys: [],
      style: { color: '#000', width: 1, type: 'solid' },
      leftRay: { color: '#000', width: 1, type: 'solid', hidden: true },
      rightRay: { color: '#000', width: 1, type: 'solid', hidden: true },
      construction_kind: 'free',
      defining_parents: [],
      recompute: () => {},
      on_parent_deleted: () => {}
    };
    model.lines.push(line);
    model.indexById.line[line.id] = model.lines.length - 1;
  });

  // circles
  Object.values(rt.circles).forEach((c) => {
    const centerIdx = pointIdToIndex[c.center] ?? 0;
    const radIdx = pointIdToIndex[c.radiusPoint] ?? 0;
    const pts = (c.pointIds || []).map((id) => pointIdToIndex[id]).filter((v) => typeof v === 'number');
    const circle: any = {
      object_type: 'circle',
      id: c.id,
      center: centerIdx,
      radius_point: radIdx,
      points: pts,
      style: { color: '#000', width: 1, type: 'solid' },
      circle_kind: c.definingPoints3 ? 'three-point' : 'center-radius'
    };
    if (c.definingPoints3) circle.defining_points = c.definingPoints3.map((id) => pointIdToIndex[id]);
    model.circles.push(circle);
    model.indexById.circle[circle.id] = model.circles.length - 1;
  });

  // angles
  Object.values(rt.angles).forEach((a) => {
    const ang: any = {
      object_type: 'angle',
      id: a.id,
      vertex: pointIdToIndex[a.vertex] ?? 0,
      leg1: { line: a.arm1LineId ? -1 : -1, otherPoint: pointIdToIndex[a.point1] ?? 0 },
      leg2: { line: a.arm2LineId ? -1 : -1, otherPoint: pointIdToIndex[a.point2] ?? 0 },
      style: { color: '#000', width: 1, type: 'solid' }
    };
    model.angles.push(ang);
    model.indexById.angle[ang.id] = model.angles.length - 1;
  });

  // polygons
  Object.values(rt.polygons).forEach((p) => {
    const verts = (p.vertices || []).map((id) => pointIdToIndex[id]).filter((v) => typeof v === 'number');
    const poly: any = {
      object_type: 'polygon',
      id: p.id,
      lines: (p.edgeLines || []).map((lid) => lid ? (model.indexById.line[lid] ?? -1) : -1).filter((v) => v >= 0),
      vertices: verts
    };
    model.polygons.push(poly);
    model.indexById.polygon[poly.id] = model.polygons.length - 1;
  });

  // ink & labels
  Object.values(rt.inkStrokes).forEach((s) => model.inkStrokes.push(s as any));
  Object.values(rt.labels).forEach((l) => model.labels.push({ text: l.text, pos: l.pos, color: l.color, hidden: l.hidden } as any));

  // counters
  model.idCounters = {
    point: rt.idCounters.point ?? 0,
    line: rt.idCounters.line ?? 0,
    circle: rt.idCounters.circle ?? 0,
    angle: rt.idCounters.angle ?? 0,
    polygon: rt.idCounters.polygon ?? 0
  };

  return model;
}

export default {
  modelToRuntime,
  runtimeToModel
};
