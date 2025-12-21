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
