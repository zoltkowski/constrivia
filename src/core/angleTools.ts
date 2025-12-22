import type { Angle, ConstructionRuntime, Model } from './runtimeTypes';
import {
  angleBaseGeometryPure,
  angleBaseGeometryRuntime,
  clamp,
  findSegmentIndexPure,
  getVertexOnLegRuntime,
  getVertexOnLegPure
} from './engine';
import { resolveLineIndexOrId, getLineByRef, getPointByRef } from './refactorHelpers';

export type AngleGeometryDeps = {
  model: Model;
  runtime: ConstructionRuntime | null;
};

export type AngleGeometryConfig = {
  radiusMargin: number;
  minRadius: number;
  defaultRadius: number;
};

export type AngleBaseGeometry = {
  v: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  start: number;
  end: number;
  span: number;
  clockwise: boolean;
  radius: number;
  minRadius: number;
  maxRadius: number;
};

export type AngleGeometry = AngleBaseGeometry & {
  radius: number;
  style: Angle['style'];
  clockwise: boolean;
};

// Used by angle tools to normalize point id/index references.
const resolvePointIndex = (model: Model, ref: unknown): number | null => {
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'string') {
    const idx = model.indexById?.point?.[String(ref)];
    return typeof idx === 'number' ? idx : null;
  }
  return null;
};

// Used by angle tools to normalize mixed legacy/runtime leg references.
export function getAngleArmRef(ang: any, leg: 1 | 2): string | number | undefined {
  return leg === 1 ? (ang as any).arm1LineId ?? (ang as any).leg1?.line : (ang as any).arm2LineId ?? (ang as any).leg2?.line;
}

// Used by angle tools to synthesize legacy leg objects.
export function makeAngleLeg(ang: any, leg: 1 | 2) {
  if (leg === 1) return (ang as any).leg1 ?? { line: (ang as any).arm1LineId, otherPoint: (ang as any).point1 ?? undefined };
  return (ang as any).leg2 ?? { line: (ang as any).arm2LineId, otherPoint: (ang as any).point2 ?? undefined };
}

// Used by angle tools to resolve a leg vertex into model indices.
export function getVertexOnLeg(leg: any, vertex: number, deps: AngleGeometryDeps): number {
  if (!leg) return -1;
  const { model, runtime } = deps;
  const ref = leg.line !== undefined ? leg.line : leg;
  const resolved = resolveLineIndexOrId(ref, model);
  // numeric/index-based path
  if (typeof resolved.index === 'number' && resolved.index >= 0) {
    const numericLeg: any = { line: resolved.index };
    if (typeof leg.otherPoint === 'number') numericLeg.otherPoint = leg.otherPoint;
    if (typeof leg.seg === 'number') numericLeg.seg = leg.seg;
    return getVertexOnLegPure(numericLeg, vertex, model.points as any, model.lines as any);
  }
  // runtime/object-id case
  const vertexId = model.points[vertex]?.id;
  if (!vertexId || !runtime) return -1;
  const otherId = getVertexOnLegRuntime({ line: resolved.id }, vertexId, runtime);
  return otherId ? (model.indexById.point[String(otherId)] ?? -1) : -1;
}

// Used by angle tools to compute base angle geometry.
export function angleBaseGeometry(ang: Angle, deps: AngleGeometryDeps, cfg: AngleGeometryConfig): AngleBaseGeometry | null {
  const { model, runtime } = deps;
  const angAny = ang as any;
  // Normalize mixed-model/runtime angle objects: if runtime is present but
  // `ang` contains numeric vertex/index references (legacy model form) while
  // some line references are ids (runtime form), convert numeric refs to ids
  // so `angleBaseGeometryRuntime` can resolve correctly.
  let res: any = null;
  if (runtime) {
    const angForRt: any = { ...ang };
    try {
      if (typeof ang.vertex === 'number') angForRt.vertex = getPointByRef(ang.vertex, model)?.id ?? ang.vertex;
      if (typeof (ang as any).point1 === 'number') angForRt.point1 = getPointByRef((ang as any).point1, model)?.id ?? angForRt.point1;
      if (typeof (ang as any).point2 === 'number') angForRt.point2 = getPointByRef((ang as any).point2, model)?.id ?? angForRt.point2;
      const armRef1 = getAngleArmRef(ang, 1);
      if (armRef1 !== undefined) {
        const r = resolveLineIndexOrId(armRef1, model as any);
        if (r.id) angForRt.arm1LineId = r.id;
        else if (typeof r.index === 'number') angForRt.arm1LineId = getLineByRef(r.index, model)?.id ?? angForRt.arm1LineId;
      }
      const armRef2 = getAngleArmRef(ang, 2);
      if (armRef2 !== undefined) {
        const r2 = resolveLineIndexOrId(armRef2, model as any);
        if (r2.id) angForRt.arm2LineId = r2.id;
        else if (typeof r2.index === 'number') angForRt.arm2LineId = getLineByRef(r2.index, model)?.id ?? angForRt.arm2LineId;
      }
    } catch {}
    res = angleBaseGeometryRuntime(angForRt as any, runtime) ?? null;
  }
  if (!res) res = angleBaseGeometryPure(ang as any, model.points as any, model.lines as any);
  if (!res) return null;
  const { v, p1, p2, ang1, ang2 } = res as any;
  let ccw = (ang2 - ang1 + Math.PI * 2) % (Math.PI * 2);
  let start = ang1;
  let end = ang2;
  if (ccw > Math.PI) {
    start = ang2;
    end = ang1;
    ccw = (end - start + Math.PI * 2) % (Math.PI * 2);
  }
  const clockwise = false;
  const legLen1 = Math.hypot(p1.x - v.x, p1.y - v.y);
  const legLen2 = Math.hypot(p2.x - v.x, p2.y - v.y);
  const legLimit = Math.max(4, Math.min(legLen1, legLen2) - cfg.radiusMargin);
  const maxRadius = Math.max(500, legLimit);
  const minRadius = cfg.minRadius;
  let radius = Math.min(cfg.defaultRadius, maxRadius);
  radius = clamp(radius, minRadius, maxRadius);
  return { v, p1, p2, start, end, span: ccw, clockwise, radius, minRadius, maxRadius };
}

// Used by angle tools to compute drawing geometry with style offsets.
export function angleGeometry(ang: Angle, deps: AngleGeometryDeps, cfg: AngleGeometryConfig): AngleGeometry | null {
  const base = angleBaseGeometry(ang, deps, cfg);
  if (!base) return null;
  const offset = ang.style.arcRadiusOffset ?? 0;
  const rawRadius = base.radius + offset;
  const radius = clamp(rawRadius, base.minRadius, base.maxRadius);
  // Handle exterior angles by inverting the direction (draws the reflex angle > 180deg)
  const isExterior = !!ang.style.exterior;
  const clockwise = isExterior ? !base.clockwise : base.clockwise;
  return { ...base, start: base.start, end: base.end, clockwise, radius, style: ang.style };
}

// Used by angle tools to get default arc radius for UI controls.
export function defaultAngleRadius(ang: Angle, deps: AngleGeometryDeps, cfg: AngleGeometryConfig): number | null {
  const base = angleBaseGeometry(ang, deps, cfg);
  return base ? base.radius : null;
}

// Used by renderer and hit tests to map leg references to segment indices.
export function getAngleLegSeg(angle: Angle, leg: 1 | 2, deps: AngleGeometryDeps): number {
  const { model, runtime } = deps;
  const vertexIdx = resolvePointIndex(model, angle.vertex);
  if (typeof vertexIdx !== 'number') return 0;
  const legObj =
    leg === 1
      ? (angle as any).leg1 ?? { line: (angle as any).arm1LineId, otherPoint: (angle as any).point1 ?? undefined }
      : (angle as any).leg2 ?? { line: (angle as any).arm2LineId, otherPoint: (angle as any).point2 ?? undefined };
  const resolved = resolveLineIndexOrId(legObj?.line, model);
  if (typeof resolved.index === 'number' && resolved.index >= 0) {
    // numeric/index-based path
    const numericLeg: any = { line: resolved.index, otherPoint: legObj?.otherPoint, seg: legObj?.seg };
    return findSegmentIndexPure(model.lines[resolved.index] as any, vertexIdx, numericLeg.otherPoint, model.points as any);
  }
  // runtime armLine id case
  if (typeof resolved.id === 'string') {
    if (!runtime) return 0;
    const vertexId = model.points[vertexIdx]?.id;
    const otherId = getVertexOnLegRuntime({ line: resolved.id }, vertexId, runtime);
    const otherIdx = otherId ? model.indexById.point[String(otherId)] : -1;
    const armLineIdx = model.indexById.line[String(resolved.id)] ?? -1;
    if (armLineIdx >= 0 && otherIdx >= 0)
      return findSegmentIndexPure(model.lines[armLineIdx] as any, vertexIdx, otherIdx, model.points as any);
  }
  return 0;
}
