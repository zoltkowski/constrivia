import type {
  AngleRuntime,
  CircleRuntime,
  ConstructionRuntime,
  LineRuntime,
  PointRuntime,
  PolygonRuntime,
  PointConstructionKind
} from './runtimeTypes';
import type { EngineAngle, EngineCircle, EngineLine, EnginePoint, EnginePolygon, EngineState } from './engineModel';

const toEnginePoint = (point: PointRuntime): EnginePoint => ({
  id: String(point.id),
  x: point.x,
  y: point.y,
  hidden: point.style?.hidden ?? point.hidden,
  construction_kind: point.construction_kind as PointConstructionKind | undefined,
  parent_refs: point.parent_refs ? point.parent_refs.map((p) => ({ ...p })) : undefined,
  defining_parents: point.defining_parents ? point.defining_parents.slice() : undefined,
  created_group: point.created_group,
  midpointMeta: point.midpointMeta,
  bisectMeta: point.bisectMeta,
  symmetricMeta: point.symmetricMeta
});

const toEngineLine = (line: LineRuntime): EngineLine => {
  const points = line.points ? line.points.map((id) => String(id)) : [];
  const def0 = line.defining_points?.[0] ?? points[0];
  const def1 = line.defining_points?.[1] ?? points[points.length - 1];
  const bisector = (line as any)?.bisector;
  return {
    id: String(line.id),
    points,
    defining_points: [String(def0 ?? ''), String(def1 ?? '')],
    construction_kind: line.construction_kind as any,
    defining_parents: line.defining_parents ? line.defining_parents.slice() : undefined,
    parallel: line.parallel ? { ...line.parallel } : undefined,
    perpendicular: line.perpendicular ? { ...line.perpendicular } : undefined,
    bisector: bisector ? { vertex: String(bisector.vertex), bisectPoint: String(bisector.bisectPoint) } : undefined
  };
};

const toEngineCircle = (circle: CircleRuntime): EngineCircle => {
  const points = circle.points ? circle.points.map((id) => String(id)) : [];
  const defs = circle.defining_points ?? [
    String(circle.center ?? ''),
    String(circle.radius_point ?? circle.center ?? ''),
    String(points[0] ?? circle.center ?? '')
  ];
  return {
    id: String(circle.id),
    center: String(circle.center),
    radius_point: circle.radius_point !== undefined ? String(circle.radius_point) : undefined,
    points,
    defining_points: [String(defs[0]), String(defs[1]), String(defs[2])],
    circle_kind: circle.circle_kind,
    defining_parents: circle.defining_parents ? circle.defining_parents.slice() : undefined
  };
};

const toEngineAngle = (angle: AngleRuntime): EngineAngle => ({
  id: String(angle.id),
  vertex: String(angle.vertex),
  point1: angle.point1 !== undefined ? String(angle.point1) : undefined,
  point2: angle.point2 !== undefined ? String(angle.point2) : undefined,
  arm1LineId: angle.arm1LineId !== undefined ? String(angle.arm1LineId) : undefined,
  arm2LineId: angle.arm2LineId !== undefined ? String(angle.arm2LineId) : undefined,
  defining_parents: angle.defining_parents ? angle.defining_parents.slice() : undefined
});

const toEnginePolygon = (poly: PolygonRuntime): EnginePolygon => ({
  id: String(poly.id),
  points: poly.points ? poly.points.map((id) => String(id)) : [],
  defining_parents: poly.defining_parents ? poly.defining_parents.slice() : undefined,
  locked: poly.locked ?? false,
  lockRef: poly.lockRef
    ? {
        base: [String(poly.lockRef.base[0]), String(poly.lockRef.base[1])],
        coords: poly.lockRef.coords.map((c) => ({ id: String(c.id), u: c.u, v: c.v }))
      }
    : undefined
});

export function toEngineState(runtime: ConstructionRuntime): EngineState {
  const points: Record<string, EnginePoint> = {};
  const lines: Record<string, EngineLine> = {};
  const circles: Record<string, EngineCircle> = {};
  const angles: Record<string, EngineAngle> = {};
  const polygons: Record<string, EnginePolygon> = {};

  Object.values(runtime.points).forEach((pt) => {
    if (pt?.id) points[String(pt.id)] = toEnginePoint(pt);
  });
  Object.values(runtime.lines).forEach((line) => {
    if (line?.id) lines[String(line.id)] = toEngineLine(line);
  });
  Object.values(runtime.circles).forEach((circle) => {
    if (circle?.id) circles[String(circle.id)] = toEngineCircle(circle);
  });
  Object.values(runtime.angles).forEach((angle) => {
    if (angle?.id) angles[String(angle.id)] = toEngineAngle(angle);
  });
  Object.values(runtime.polygons).forEach((poly) => {
    if (poly?.id) polygons[String(poly.id)] = toEnginePolygon(poly);
  });

  return { points, lines, circles, angles, polygons };
}

export type ApplyEngineOptions = {
  points?: boolean;
  pointParents?: boolean;
  lines?: boolean;
  linePoints?: boolean;
  lineDefiningPoints?: boolean;
  circles?: boolean;
  angles?: boolean;
  polygons?: boolean;
};

export function applyEngineState(
  runtime: ConstructionRuntime,
  engine: EngineState,
  options: ApplyEngineOptions = {}
) {
  const opts: Required<ApplyEngineOptions> = {
    points: options.points ?? true,
    pointParents: options.pointParents ?? false,
    lines: options.lines ?? false,
    linePoints: options.linePoints ?? false,
    lineDefiningPoints: options.lineDefiningPoints ?? false,
    circles: options.circles ?? false,
    angles: options.angles ?? false,
    polygons: options.polygons ?? false
  };

  if (opts.points) {
    Object.values(engine.points).forEach((pt) => {
      const cur = runtime.points[String(pt.id)];
      if (!cur) return;
      runtime.points[String(pt.id)] = {
        ...cur,
        x: pt.x,
        y: pt.y,
        style: pt.hidden === undefined ? cur.style : { ...cur.style, hidden: pt.hidden },
        ...(opts.pointParents
          ? {
              parent_refs: pt.parent_refs ? pt.parent_refs.map((p) => ({ ...p })) : cur.parent_refs,
              defining_parents: pt.defining_parents ? pt.defining_parents.slice() : cur.defining_parents,
              construction_kind: pt.construction_kind ?? cur.construction_kind,
              midpointMeta: pt.midpointMeta ?? cur.midpointMeta,
              bisectMeta: pt.bisectMeta ?? cur.bisectMeta,
              symmetricMeta: pt.symmetricMeta ?? cur.symmetricMeta,
              created_group: pt.created_group ?? cur.created_group
            }
          : {})
      };
    });
  }

  if (opts.lines || opts.linePoints || opts.lineDefiningPoints) {
    Object.values(engine.lines).forEach((line) => {
      const cur = runtime.lines[String(line.id)];
      if (!cur) return;
      const next: LineRuntime = { ...cur };
      if (opts.lines || opts.linePoints) next.points = line.points.slice();
      if (opts.lines || opts.lineDefiningPoints) {
        next.defining_points = [line.defining_points[0], line.defining_points[1]];
      }
      if (opts.lines) {
        next.construction_kind = line.construction_kind ?? next.construction_kind;
        next.defining_parents = line.defining_parents ? line.defining_parents.slice() : next.defining_parents;
        next.parallel = line.parallel ? { ...line.parallel } : next.parallel;
        next.perpendicular = line.perpendicular ? { ...line.perpendicular } : next.perpendicular;
        if (line.bisector) (next as any).bisector = { ...line.bisector };
      }
      runtime.lines[String(line.id)] = next;
    });
  }

  if (opts.circles) {
    Object.values(engine.circles).forEach((circle) => {
      const cur = runtime.circles[String(circle.id)];
      if (!cur) return;
      const next: CircleRuntime = { ...cur };
      next.center = circle.center;
      next.radius_point = circle.radius_point;
      next.points = circle.points.slice();
      next.defining_points = [
        circle.defining_points[0],
        circle.defining_points[1],
        circle.defining_points[2]
      ];
      next.circle_kind = circle.circle_kind ?? next.circle_kind;
      next.defining_parents = circle.defining_parents ? circle.defining_parents.slice() : next.defining_parents;
      runtime.circles[String(circle.id)] = next;
    });
  }

  if (opts.angles) {
    Object.values(engine.angles).forEach((angle) => {
      const cur = runtime.angles[String(angle.id)];
      if (!cur) return;
      const next: AngleRuntime = { ...cur };
      next.vertex = angle.vertex;
      next.point1 = angle.point1;
      next.point2 = angle.point2;
      next.arm1LineId = angle.arm1LineId;
      next.arm2LineId = angle.arm2LineId;
      next.defining_parents = angle.defining_parents ? angle.defining_parents.slice() : next.defining_parents;
      runtime.angles[String(angle.id)] = next;
    });
  }

  if (opts.polygons) {
    Object.values(engine.polygons).forEach((poly) => {
      const cur = runtime.polygons[String(poly.id)];
      if (!cur) return;
      const next: PolygonRuntime = { ...cur };
      next.points = poly.points.slice();
      next.defining_parents = poly.defining_parents ? poly.defining_parents.slice() : next.defining_parents;
      if (poly.locked !== undefined) next.locked = poly.locked;
      if (poly.lockRef) {
        next.lockRef = {
          base: [String(poly.lockRef.base[0]), String(poly.lockRef.base[1])],
          coords: poly.lockRef.coords.map((c) => ({ id: String(c.id), u: c.u, v: c.v }))
        };
      }
      runtime.polygons[String(poly.id)] = next;
    });
  }
}

export function applyEnginePointPositions(runtime: ConstructionRuntime, engine: EngineState) {
  applyEngineState(runtime, engine, { points: true, pointParents: false });
}
