import { PersistedDocument, PersistedPoint, PersistedLine, PersistedCircle, PersistedAngle, PersistedPolygon } from '../persisted/persistedTypes';
import { migratePersistedAngles } from './migratePersistedAngles';
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
  // Run a one-time persisted-angle migration to normalize legacy numeric leg refs
  try {
    if ((doc as any).model) {
      (doc as any).model = migratePersistedAngles((doc as any).model as any);
    } else {
      // if doc is actually a model object
      (doc as any) = migratePersistedAngles(doc as any);
    }
  } catch (e) {
    // ignore migration errors and continue with best-effort mapping
  }
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
    // map persisted midpoint parents (which may be numeric indices) to runtime point ids
    const midpointRaw = (p as any).midpoint;
    let midpointMeta: any = undefined;
    if (midpointRaw) {
      const rawParents = midpointRaw.parents;
      const mappedParents = Array.isArray(rawParents)
        ? rawParents.map((pr: any) => (typeof pr === 'number' ? pts[pr]?.id ?? '' : pr || ''))
        : ['', ''];
      const parentLineId = midpointRaw.parentLineId !== undefined
        ? (typeof midpointRaw.parentLineId === 'number' ? (lines[midpointRaw.parentLineId]?.id ?? null) : midpointRaw.parentLineId ?? null)
        : null;
      midpointMeta = { parents: mappedParents, parentLineId };
    }
    runtime.points[id] = {
      id,
      x: p.x,
      y: p.y,
      constructionKind: (p as any).construction_kind || 'free',
      parents,
      midpointMeta
    } as PointRuntime;
    runtime.idCounters.point = Math.max(runtime.idCounters.point, parseInt(id.replace(/[^0-9]/g, '') || '0') || 0);
  });

  // keep raw persisted points mapped by runtime id for later mapping of bisect/symmetric
  const persistedPointById: Record<string, PersistedPoint> = {};
  pts.forEach((p, i) => {
    const id = ensureId(p, 'pt', i);
    persistedPointById[id] = p;
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

    // measurement reference (top-level persisted document fields)
    try {
      const mseg = (doc as any).measurementReferenceSegment;
      const mval = (doc as any).measurementReferenceValue;
      if (typeof mseg === 'string') {
        const m = /^\s*(\d+)\s*:(\d+)\s*$/.exec(mseg);
        if (m) {
          const lineIdx = Number(m[1]);
          const segIdx = Number(m[2]);
          const lineObj = lines[lineIdx];
          if (lineObj) {
            const lineId = ensureId(lineObj, 'ln', lineIdx);
            (runtime as any).measurementReference = { lineId, segIdx };
            (runtime as any).measurementReferenceValue = typeof mval === 'number' ? mval : null;
          }
        }
      }
    } catch (e) {
      // ignore measurement mapping errors
    }

    // Post-process persisted point-level construction metadata that depends on lines/points mapping
    Object.keys(persistedPointById).forEach((id) => {
      const p = persistedPointById[id] as any;
      if (!p) return;
      const rp = runtime.points[id];
      // bisect (legacy persisted form) -> runtime.bisectMeta
      if (p.bisect) {
        try {
          const mapSeg = (seg: any) => {
            // seg can be { line: number, seg: number } or { line: number, a: number, b: number } or { a: number, b: number }
            if (seg.line !== undefined && typeof seg.line === 'number') {
              const lineObj = lines[seg.line];
              const lineId = lineObj ? ensureId(lineObj, 'ln', seg.line) : '';
              const lp = runtime.lines[lineId] ? (runtime.lines[lineId] as any).pointIds || [] : [];
              if (typeof seg.seg === 'number') {
                const aId = lp[seg.seg] ?? '';
                const bId = lp[seg.seg + 1] ?? '';
                return { lineId, a: aId, b: bId };
              }
              if (typeof seg.a === 'number' && typeof seg.b === 'number') {
                const aId = pts[seg.a]?.id ?? '';
                const bId = pts[seg.b]?.id ?? '';
                return { lineId, a: aId, b: bId };
              }
              return { lineId, a: lp[0] ?? '', b: lp[1] ?? '' };
            }
            // seg without line: direct point refs
            const aId = typeof seg.a === 'number' ? pts[seg.a]?.id ?? '' : seg.a || '';
            const bId = typeof seg.b === 'number' ? pts[seg.b]?.id ?? '' : seg.b || '';
            return { lineId: '', a: aId, b: bId };
          };
          const seg1 = mapSeg(p.bisect.seg1 || p.bisect.a || {});
          const seg2 = mapSeg(p.bisect.seg2 || p.bisect.b || {});
          const vertex = typeof p.bisect.vertex === 'number' ? pts[p.bisect.vertex]?.id ?? '' : p.bisect.vertex || id;
          rp.bisectMeta = { vertex, seg1, seg2, epsilon: p.bisect.epsilon };
        } catch (e) {
          // ignore mapping errors and skip bisect meta
        }
      }

      // symmetric (legacy) -> runtime.symmetricMeta
      if (p.symmetric) {
        try {
          const src = typeof p.symmetric.source === 'number' ? pts[p.symmetric.source]?.id ?? '' : p.symmetric.source || '';
          const mirrorRaw = p.symmetric.mirror || p.symmetric;
          let mirror: any = { kind: 'point', id: '' };
          if (mirrorRaw) {
            if (mirrorRaw.kind === 'line' || mirrorRaw.kind === 'point') {
              mirror.kind = mirrorRaw.kind;
              mirror.id = typeof mirrorRaw.id === 'number' ? (mirrorRaw.kind === 'point' ? pts[mirrorRaw.id]?.id ?? '' : (lines[mirrorRaw.id]?.id ?? '')) : mirrorRaw.id || '';
            } else if (mirrorRaw.line !== undefined) {
              mirror.kind = 'line';
              mirror.id = lines[mirrorRaw.line] ? ensureId(lines[mirrorRaw.line], 'ln', mirrorRaw.line) : '';
            } else if (mirrorRaw.otherPoint !== undefined) {
              mirror.kind = 'point';
              mirror.id = typeof mirrorRaw.otherPoint === 'number' ? pts[mirrorRaw.otherPoint]?.id ?? '' : mirrorRaw.otherPoint || '';
            }
          }
          rp.symmetricMeta = { source: src, mirror };
        } catch (e) {
          // ignore
        }
      }
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
    // runtime stores geometry-only; remove runtime-only helpers and map them back to legacy persisted form
    delete out.constructionKind;
    delete out.parents;
    // midpoint
    if ((p as any).midpointMeta) {
      const mm = (p as any).midpointMeta;
      out.midpoint = { parents: [mm.parents[0] ? pointIndex[mm.parents[0]] : -1, mm.parents[1] ? pointIndex[mm.parents[1]] : -1] };
      if (mm.parentLineId) out.midpoint.parentLineId = lineIndex[mm.parentLineId] ?? -1;
    } else {
      delete out.midpointMeta;
    }
    // bisect
    if ((p as any).bisectMeta) {
      const bm = (p as any).bisectMeta;
      const segToPersist = (s: any) => {
        const lineIdx = s.lineId ? lineIndex[s.lineId] ?? -1 : -1;
        const aIdx = s.a ? pointIndex[s.a] ?? -1 : -1;
        const bIdx = s.b ? pointIndex[s.b] ?? -1 : -1;
        return { line: lineIdx, a: aIdx, b: bIdx };
      };
      out.bisect = { vertex: pointIndex[bm.vertex] ?? -1, seg1: segToPersist(bm.seg1), seg2: segToPersist(bm.seg2), epsilon: bm.epsilon };
    }
    // symmetric
    if ((p as any).symmetricMeta) {
      const sm = (p as any).symmetricMeta;
      const mirror = sm.mirror || { kind: 'point', id: '' };
      const mirrorIdx = mirror.kind === 'point' ? (pointIndex[mirror.id] ?? -1) : (lineIndex[mirror.id] ?? -1);
      out.symmetric = { source: pointIndex[sm.source] ?? -1, mirror: { kind: mirror.kind, id: mirrorIdx } };
    }
    // Remove runtime-only helper fields entirely from persisted point payload
    delete out.bisectMeta;
    delete out.symmetricMeta;
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

  // Persist angles using canonical id-based fields when available.
  // Avoid emitting legacy numeric `leg1`/`leg2` entries; keep persisted shape id-first.
  (persisted.model as any).angles = angles.map((a) => {
    const out: any = { ...a };
    // Prefer preserving runtime id-based vertex if present, otherwise fall back to numeric index
    out.vertex = (a as any).vertex !== undefined ? (a as any).vertex : (pointIndex[(a as any).vertex] ?? -1);
    if ((a as any).point1) out.point1 = (a as any).point1;
    if ((a as any).point2) out.point2 = (a as any).point2;
    if ((a as any).arm1LineId) out.arm1LineId = (a as any).arm1LineId;
    if ((a as any).arm2LineId) out.arm2LineId = (a as any).arm2LineId;
    // Persist using canonical id-based fields only. Legacy numeric `leg1`/`leg2`
    // are no longer emitted from the runtime conversion boundary.
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

  // Propagate measurement reference back to top-level persisted document form
  if ((runtime as any).measurementReference) {
    const mr = (runtime as any).measurementReference as { lineId: string; segIdx: number };
    const li = lineIndex[mr.lineId];
    if (typeof li === 'number' && li >= 0) {
      (persisted as any).measurementReferenceSegment = `${li}:${mr.segIdx}`;
    }
    if ((runtime as any).measurementReferenceValue !== undefined) {
      (persisted as any).measurementReferenceValue = (runtime as any).measurementReferenceValue;
    }
  }

  return persisted;
}
