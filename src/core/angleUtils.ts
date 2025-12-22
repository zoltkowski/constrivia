import type { ConstructionRuntime, LineRuntime } from './runtimeTypes';

// Used by line tools.
export function resolveLineFromLegRef(rt: ConstructionRuntime, ref: unknown): LineRuntime | undefined {
  if (ref == null) return undefined;
  // runtime id
  if (typeof ref === 'string') {
    return rt.lines[ref];
  }
  // object with .line (legacy leg object)
  if (typeof ref === 'object') {
    try {
      const asAny = ref as any;
      return resolveLineFromLegRef(rt, asAny.line ?? asAny.arm1LineId ?? asAny.arm2LineId ?? undefined);
    } catch (e) {
      return undefined;
    }
  }
  return undefined;
}
