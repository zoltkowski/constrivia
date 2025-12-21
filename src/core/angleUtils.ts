import { Model, Line } from '../types';

export function resolveLineFromLegRef(model: Model, ref: unknown): Line | undefined {
  if (ref == null) return undefined;
  // direct numeric index
  if (typeof ref === 'number') return model.lines[ref];
  // runtime id
  if (typeof ref === 'string') {
    const idx = model.indexById?.line?.[ref];
    return idx !== undefined ? model.lines[idx] : undefined;
  }
  // object with .line (legacy leg object)
  if (typeof ref === 'object') {
    try {
      const asAny = ref as any;
      return resolveLineFromLegRef(model, asAny.line ?? asAny.arm1LineId ?? asAny.arm2LineId ?? undefined);
    } catch (e) {
      return undefined;
    }
  }
  return undefined;
}
