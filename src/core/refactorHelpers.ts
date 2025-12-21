export function resolveLineIndexOrId(ref: any, model: any): { index: number | null; id: string | null } {
  if (ref === undefined || ref === null) return { index: null, id: null };
  if (typeof ref === 'number') return { index: ref, id: model.lines?.[ref]?.id ?? null };
  if (typeof ref === 'string') return { index: model.indexById?.line?.[ref] ?? null, id: ref };
  // unknown shape
  return { index: null, id: null };
}

export function resolvePointIndexOrId(ref: any, model: any): { index: number | null; id: string | null } {
  if (ref === undefined || ref === null) return { index: null, id: null };
  if (typeof ref === 'number') return { index: ref, id: model.points?.[ref]?.id ?? null };
  if (typeof ref === 'string') return { index: model.indexById?.point?.[ref] ?? null, id: ref };
  return { index: null, id: null };
}

export function pointRefToId(ref: any, model: any): string | null {
  const r = resolvePointIndexOrId(ref, model);
  if (r.id) return r.id;
  if (typeof r.index === 'number') return model.points?.[r.index]?.id ?? null;
  return null;
}

export function lineRefToId(ref: any, model: any): string | null {
  const r = resolveLineIndexOrId(ref, model);
  if (r.id) return r.id;
  if (typeof r.index === 'number') return model.lines?.[r.index]?.id ?? null;
  return null;
}

export function getPointByRef(ref: any, model: any) {
  const r = resolvePointIndexOrId(ref, model);
  if (typeof r.index === 'number') return model.points?.[r.index] ?? undefined;
  if (r.id) {
    const idx = model.indexById?.point?.[r.id];
    return typeof idx === 'number' ? model.points?.[idx] : undefined;
  }
  return undefined;
}

export function getLineByRef(ref: any, model: any) {
  const r = resolveLineIndexOrId(ref, model);
  if (typeof r.index === 'number') return model.lines?.[r.index] ?? undefined;
  if (r.id) {
    const idx = model.indexById?.line?.[r.id];
    return typeof idx === 'number' ? model.lines?.[idx] : undefined;
  }
  return undefined;
}

// Return the 'other' point indices for an angle when a specific line index
// (candidate arm) is involved. Prefers `point1`/`point2` refs when present,
// otherwise falls back to legacy leg/arm resolution using available model data.
export function getAngleOtherPointsForLine(angle: any, lineIdx: number, model: any) {
  let leg1Other: number | null = null;
  let leg2Other: number | null = null;
  try {
    const vertexRef = (angle as any).vertex;
    const vRes = resolvePointIndexOrId(vertexRef, model);
    const vertexIdx = typeof vRes.index === 'number' && vRes.index >= 0 ? vRes.index : -1;

    const resolveOther = (which: 1 | 2) => {
      const pointField = which === 1 ? (angle as any).point1 : (angle as any).point2;
      if (pointField !== undefined && pointField !== null) {
        const r = resolvePointIndexOrId(pointField, model);
        if (typeof r.index === 'number' && r.index >= 0) return r.index;
      }
      const legField = which === 1 ? (angle as any).leg1 : (angle as any).leg2;
      const armIdField = which === 1 ? (angle as any).arm1LineId : (angle as any).arm2LineId;
      let lineRef: any = undefined;
      let legObj: any = undefined;
      if (legField !== undefined) {
        legObj = legField;
        lineRef = legField.line !== undefined ? legField.line : legField;
      } else if (armIdField !== undefined) {
        lineRef = armIdField;
      }
      if (lineRef === undefined || vertexIdx < 0) return null;
      const rLine = resolveLineIndexOrId(lineRef, model);
      let lIdx: number | null = null;
      if (typeof rLine.index === 'number') lIdx = rLine.index;
      else if (rLine.id) lIdx = model.indexById?.line?.[rLine.id] ?? null;
      if (typeof lIdx !== 'number' || lIdx < 0) return null;
      const line = model.lines[lIdx];
      if (!line) return null;
      if (legObj && typeof legObj.seg === 'number') {
        const aIdx = line.points[legObj.seg];
        const bIdx = line.points[legObj.seg + 1];
        if (aIdx === undefined || bIdx === undefined) return null;
        return aIdx === vertexIdx ? bIdx : aIdx;
      }
      if (legObj && typeof legObj.otherPoint === 'number') return legObj.otherPoint;
      // If no seg/otherPoint provided, attempt to find the segment that contains vertex
      for (let si = 0; si < line.points.length - 1; si++) {
        if (line.points[si] === vertexIdx || line.points[si + 1] === vertexIdx) {
          const aIdx = line.points[si];
          const bIdx = line.points[si + 1];
          return aIdx === vertexIdx ? bIdx : aIdx;
        }
      }
      return null;
    };

    const o1 = resolveOther(1);
    const o2 = resolveOther(2);
    leg1Other = o1 !== null && o1 !== undefined ? o1 : null;
    leg2Other = o2 !== null && o2 !== undefined ? o2 : null;
  } catch (e) {
    // ignore
  }
  return { leg1Other, leg2Other };
}
