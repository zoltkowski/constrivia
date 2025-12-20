import { PersistedDocument, PersistedPoint, PersistedLine, PersistedCircle, PersistedAngle, PersistedPolygon } from '../persisted/persistedTypes';
import {
  ConstructionRuntime,
  ObjectId,
  PointRuntime,
  LineRuntime,
  CircleRuntime,
  AngleRuntime,
  PolygonRuntime
} from './runtimeTypes';

function ensureId(obj: any, fallbackPrefix: string, idx: number): string {
  if (obj && typeof obj.id === 'string' && obj.id.length) return obj.id;
  return `${fallbackPrefix}-${idx}`;
}

export function persistedToRuntime(doc: PersistedDocument): ConstructionRuntime {
  const model = doc.model || (doc as any);
  const runtime: ConstructionRuntime = {
    points: {},
    lines: {},
    circles: {},
    angles: {},
    polygons: {},
    labels: {},
    inkStrokes: {},
    idCounters: { point: 0, line: 0, circle: 0, angle: 0, polygon: 0 }
  };

  const pts = Array.isArray((model as any).points) ? (model as any).points as PersistedPoint[] : [];
  const lines = Array.isArray((model as any).lines) ? (model as any).lines as PersistedLine[] : [];
  const circles = Array.isArray((model as any).circles) ? (model as any).circles as PersistedCircle[] : [];
  const angles = Array.isArray((model as any).angles) ? (model as any).angles as PersistedAngle[] : [];
  const polys = Array.isArray((model as any).polygons) ? (model as any).polygons as PersistedPolygon[] : [];

  // Points -> runtime geometry-only shape
  pts.forEach((p, i) => {
    const id = ensureId(p, 'pt', i);
    const parents: string[] = (p as any).parent_refs ? (p as any).parent_refs.map((r: any) => r.id).filter(Boolean) : [];
    runtime.points[id] = {
      id,
      x: p.x,
      y: p.y,
      constructionKind: (p as any).construction_kind || 'free',
      parents,
      midpointMeta: (p as any).midpoint ? { parents: (p as any).midpoint.parents || ['', ''], parentLineId: (p as any).midpoint.parentLineId ?? null } : undefined
    } as PointRuntime;
    runtime.idCounters.point = Math.max(runtime.idCounters.point, parseInt(id.replace(/[^0-9]/g, '') || '0') || 0);
  });

  // Lines -> runtime uses definingPoints & pointIds
  lines.forEach((l, i) => {
    const id = ensureId(l, 'ln', i);
    const resolvePoint = (ref: any) => {
      if (typeof ref === 'number') return pts[ref]?.id ?? null;
      if (typeof ref === 'string') return ref;
      return null;
    };
    const pointIds: string[] = (l.points || []).map(resolvePoint).filter(Boolean) as string[];
    const defA = resolvePoint((l as any).defining_points?.[0]);
    const defB = resolvePoint((l as any).defining_points?.[1]);
    const definingPoints: [string, string] | undefined = defA && defB ? [defA as string, defB as string] : undefined;
    runtime.lines[id] = {
      id,
      definingPoints: definingPoints ?? (pointIds.length >= 2 ? [pointIds[0], pointIds[pointIds.length - 1]] : [pointIds[0] ?? '', pointIds[0] ?? '']),
      pointIds: pointIds
    } as LineRuntime;
    runtime.idCounters.line = Math.max(runtime.idCounters.line, parseInt(id.replace(/[^0-9]/g, '') || '0') || 0);
  });

  // Circles -> runtime geometry-only
  circles.forEach((c, i) => {
    const id = ensureId(c, 'c', i);
    const center = typeof c.center === 'number' ? pts[c.center]?.id : c.center;
    const rp = typeof (c as any).radius_point === 'number' ? pts[(c as any).radius_point]?.id : (c as any).radius_point;
    const ptsArr = (c.points || []).map((ref: any) => (typeof ref === 'number' ? pts[ref]?.id : ref)).filter(Boolean) as string[];
    runtime.circles[id] = {
      id,
      center: center ?? '',
      radiusPoint: rp ?? '' as any,
      pointIds: ptsArr,
      definingPoints3: (c as any).defining_points || undefined
    } as CircleRuntime;
    runtime.idCounters.circle = Math.max(runtime.idCounters.circle, parseInt(id.replace(/[^0-9]/g, '') || '0') || 0);
  });

  // Angles -> runtime as triple of points + optional arm line ids
  angles.forEach((a, i) => {
    const id = ensureId(a, 'ang', i);
    const vertexId = typeof a.vertex === 'number' ? pts[a.vertex]?.id : a.vertex;
    const convertLeg = (leg: any) => {
      if (!leg) return { lineId: undefined as any, otherId: undefined as any };
      const lineId = typeof leg.line === 'number' ? lines[leg.line]?.id : leg.line;
      if (typeof leg.seg === 'number' && lineId && runtime.lines[lineId]) {
        const lp = (runtime.lines[lineId] as any).pointIds || [];
        const aId = lp[leg.seg];
        const bId = lp[leg.seg + 1];
        const other = aId === vertexId ? bId : aId;
        return { lineId, otherId: other };
      }
      if (typeof leg.otherPoint === 'number' && lineId) {
        const otherId = pts[leg.otherPoint]?.id;
        return { lineId, otherId };
      }
      return { lineId, otherId: leg.otherPoint };
    };
    const l1 = convertLeg((a as any).leg1);
    const l2 = convertLeg((a as any).leg2);
    runtime.angles[id] = {
      id,
      vertex: vertexId ?? '',
      point1: l1.otherId ?? '',
      point2: l2.otherId ?? '',
      arm1LineId: l1.lineId,
      arm2LineId: l2.lineId
    } as AngleRuntime;
    runtime.idCounters.angle = Math.max(runtime.idCounters.angle, parseInt(id.replace(/[^0-9]/g, '') || '0') || 0);
  });

  // Polygons -> runtime vertices (try to keep edgeLines if present)
  polys.forEach((p, i) => {
    const id = ensureId(p, 'poly', i);
    const lineIds = (p.lines || []).map((ref: any) => (typeof ref === 'number' ? lines[ref]?.id : ref)).filter(Boolean) as string[];
    runtime.polygons[id] = {
      id,
      vertices: (p as any).vertices || [],
      edgeLines: lineIds.length ? lineIds : undefined
    } as PolygonRuntime;
    runtime.idCounters.polygon = Math.max(runtime.idCounters.polygon, parseInt(id.replace(/[^0-9]/g, '') || '0') || 0);
  });

  // Labels: persisted labels are arrays without ids; create ids
  const lbls = Array.isArray((model as any).labels) ? (model as any).labels : [];
  (lbls as any[]).forEach((lb, i) => {
    const id = (lb && lb.id) || `lab-${i}`;
    runtime.labels[id] = { ...lb, id } as any;
  });

  // Ink strokes (use id if present)
  const inks = Array.isArray((model as any).inkStrokes) ? (model as any).inkStrokes : [];
  (inks as any[]).forEach((s: any, i: number) => {
    const id = s?.id || `ink-${i}`;
    runtime.inkStrokes[id] = { ...s, id } as any;
  });

  return runtime;
}

export function runtimeToPersisted(runtime: ConstructionRuntime): PersistedDocument {
  // Build arrays and index maps
  const points = Object.values(runtime.points || {});
  const lines = Object.values(runtime.lines || {});
  const circles = Object.values(runtime.circles || {});
  const angles = Object.values(runtime.angles || {});
  const polygons = Object.values(runtime.polygons || {});

  const pointIndex: Record<string, number> = {};
  points.forEach((p, i) => (pointIndex[p.id] = i));
  const lineIndex: Record<string, number> = {};
  lines.forEach((l, i) => (lineIndex[l.id] = i));

  const persisted: PersistedDocument = { model: { } as any };
  (persisted.model as any).points = points.map((p) => {
    const out: any = { ...p };
    // runtime stores geometry-only; if any visual props exist on the runtime object keep them
    delete out.constructionKind;
    delete out.parents;
    delete out.midpointMeta;
    return out;
  });

  (persisted.model as any).lines = lines.map((l) => {
    const pts = ((l as any).pointIds || []).map((pid: any) => pointIndex[pid]).filter((n: number) => n >= 0);
    const def = (l as any).definingPoints ? [(l as any).definingPoints[0] ? pointIndex[(l as any).definingPoints[0]] : -1, (l as any).definingPoints[1] ? pointIndex[(l as any).definingPoints[1]] : -1] : undefined;
    const out: any = { ...l, points: pts };
    if (def) out.defining_points = def;
    return out;
  });

  (persisted.model as any).circles = circles.map((c) => {
    const ctr = pointIndex[(c as any).center] ?? -1;
    const rp = (c as any).radiusPoint ? pointIndex[(c as any).radiusPoint] ?? -1 : undefined;
    const pts = ((c as any).pointIds || []).map((pid: any) => pointIndex[pid]).filter((n: number) => n >= 0);
    const out: any = { ...c, center: ctr, points: pts };
    if (rp !== undefined) out.radius_point = rp;
    return out;
  });

  (persisted.model as any).angles = angles.map((a) => {
    const vertex = pointIndex[(a as any).vertex] ?? -1;
    const p1 = pointIndex[(a as any).point1] ?? -1;
    const p2 = pointIndex[(a as any).point2] ?? -1;
    const out: any = { ...a, vertex };
    if (p1 >= 0) out.leg1 = { line: (a as any).arm1LineId ? lineIndex[(a as any).arm1LineId] ?? -1 : -1, otherPoint: p1 };
    if (p2 >= 0) out.leg2 = { line: (a as any).arm2LineId ? lineIndex[(a as any).arm2LineId] ?? -1 : -1, otherPoint: p2 };
    return out;
  });

  (persisted.model as any).polygons = polygons.map((p) => {
    const linesArr = ((p as any).edgeLines || []).map((lid: any) => lineIndex[lid]).filter((n: number) => n >= 0);
    const out: any = { ...p, lines: linesArr };
    return out;
  });

  (persisted.model as any).labels = Object.values(runtime.labels || {}).map((l: any) => {
    const { id, ...rest } = l;
    return rest;
  });
  (persisted.model as any).inkStrokes = Object.values(runtime.inkStrokes || {});

  return persisted;
}
