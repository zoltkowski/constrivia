import type { Angle, ConstructionRuntime, Model, ObjectId, Point, Line } from './runtimeTypes';
import {
  angleBaseGeometryPure,
  angleBaseGeometryRuntime,
  clamp,
  findSegmentIndexPure,
  getVertexOnLegRuntime,
  getVertexOnLegPure
} from './engine';

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

// Used by angle tools to resolve ids into model points.
const getPointById = (model: Model, id: ObjectId | undefined | null): Point | null => {
  if (!id) return null;
  const idx = model.indexById?.point?.[String(id)];
  if (typeof idx === 'number') return model.points[idx] ?? null;
  return model.points.find((p) => p?.id === id) ?? null;
};

// Used by angle tools to resolve ids into model lines.
const getLineById = (model: Model, id: ObjectId | undefined | null): Line | null => {
  if (!id) return null;
  const idx = model.indexById?.line?.[String(id)];
  if (typeof idx === 'number') return model.lines[idx] ?? null;
  return model.lines.find((l) => l?.id === id) ?? null;
};

// Used by angle tools to resolve ids into model line indices.
const getLineIndexById = (model: Model, id: ObjectId | undefined | null): number | undefined => {
  if (!id) return undefined;
  const idx = model.indexById?.line?.[String(id)];
  return typeof idx === 'number' ? idx : undefined;
};

// Used by angle tools to read arm line ids from angle objects.
export function getAngleArmRef(ang: any, leg: 1 | 2): ObjectId | undefined {
  return leg === 1 ? (ang as any).arm1LineId : (ang as any).arm2LineId;
}

// Used by angle tools to build arm descriptors for geometry helpers.
export function makeAngleLeg(ang: any, leg: 1 | 2) {
  if (leg === 1) return { line: (ang as any).arm1LineId, otherPoint: (ang as any).point1 ?? undefined };
  return { line: (ang as any).arm2LineId, otherPoint: (ang as any).point2 ?? undefined };
}

// Used by selection helpers to get other point ids for angle legs on a line.
export function getAngleOtherPointsForLine(angle: Angle, lineId: ObjectId, model: Model) {
  let leg1Other: ObjectId | null = angle.point1 ?? null;
  let leg2Other: ObjectId | null = angle.point2 ?? null;
  if (!lineId) return { leg1Other, leg2Other };
  const line = getLineById(model, lineId);
  if (!line || !line.points?.length) return { leg1Other, leg2Other };
  const vertexId = angle.vertex as ObjectId;

  const resolveOther = () => {
    for (let i = 0; i < line.points.length - 1; i++) {
      const a = line.points[i];
      const b = line.points[i + 1];
      if (a === vertexId) return b;
      if (b === vertexId) return a;
    }
    return null;
  };

  if (!leg1Other) leg1Other = resolveOther();
  if (!leg2Other) leg2Other = resolveOther();
  return { leg1Other, leg2Other };
}

// Used by angle tools to resolve a leg vertex into model indices.
export function getVertexOnLeg(leg: any, vertexId: ObjectId, deps: AngleGeometryDeps): ObjectId {
  if (!leg) return '';
  const { model, runtime } = deps;
  const lineId = leg.line ?? leg;
  if (runtime) {
    return getVertexOnLegRuntime({ line: lineId, otherPoint: leg.otherPoint }, vertexId, runtime);
  }
  return getVertexOnLegPure({ line: lineId, otherPoint: leg.otherPoint }, vertexId, model.points as any, model.lines as any);
}

// Used by angle tools to compute base angle geometry.
export function angleBaseGeometry(ang: Angle, deps: AngleGeometryDeps, cfg: AngleGeometryConfig): AngleBaseGeometry | null {
  const { model, runtime } = deps;
  let res: any = null;
  if (runtime) res = angleBaseGeometryRuntime(ang as any, runtime) ?? null;
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
  const vertexId = angle.vertex as ObjectId;
  const legObj = makeAngleLeg(angle, leg);
  const lineId = legObj?.line as ObjectId | undefined;
  const lineIdx = getLineIndexById(model, lineId);
  if (lineIdx === undefined) return 0;
  const line = model.lines[lineIdx];
  if (!line) return 0;
  const otherId = legObj.otherPoint ?? (runtime ? getVertexOnLegRuntime({ line: lineId }, vertexId, runtime) : getVertexOnLegPure({ line: lineId }, vertexId, model.points as any, model.lines as any));
  if (!otherId) return 0;
  return findSegmentIndexPure(line as any, vertexId, otherId, model.points as any);
}
