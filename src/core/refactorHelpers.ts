export function resolveLineIndexOrId(ref: any, model: any): { index: number | null; id: string | null } {
  if (ref === undefined || ref === null) return { index: null, id: null };
  if (typeof ref === 'number') return { index: ref, id: model.lines?.[ref]?.id ?? null };
  if (typeof ref === 'string') return { index: model.indexById?.line?.[ref] ?? null, id: ref };
  // unknown shape
  return { index: null, id: null };
}
