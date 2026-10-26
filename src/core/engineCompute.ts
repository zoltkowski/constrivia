import { lineSubdivisionPointIds } from './lineSubdivision';
import type { ObjectId } from './runtimeTypes';
import type { EngineCircle, EngineLine, EnginePoint, EngineState } from './engineModel';
import { circleFromThree } from './circleTools';
import { circleCircleIntersections, intersectLines, lineCircleIntersections, projectPointOnLine } from './engine';
import { bisectorPointPosition } from './bisectorGeometry';
import { assignIntersectionBranches } from './intersectionBranches';
import { updateGeometryValidity } from './geometryValidity';
import { referenceLineGeometry } from './dependentLineGeometry';
import { resolveCircleGeometry, circleInputPointIds } from './circleGeometry';
import { commonTangentContactPosition } from './tangentGeometry';
import { assignBoundaryIntersectionBranches, polygonBoundaryIntersections } from './boundaryIntersectionGeometry';

const EPS = 1e-6;

type Vec = { x: number; y: number };

const nearlyEqual = (a: number, b: number) => Math.abs(a - b) <= EPS;

const normalize = (v: Vec) => {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
};

const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;

const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

const getPoint = (engine: EngineState, id: ObjectId | undefined | null): EnginePoint | null => {
  if (id === undefined || id === null) return null;
  return engine.points[String(id)] ?? null;
};

const getLine = (engine: EngineState, id: ObjectId | undefined | null): EngineLine | null => {
  if (id === undefined || id === null) return null;
  return engine.lines[String(id)] ?? null;
};

const getCircle = (engine: EngineState, id: ObjectId | undefined | null): EngineCircle | null => {
  if (id === undefined || id === null) return null;
  return engine.circles[String(id)] ?? null;
};

const setPointPosition = (engine: EngineState, id: ObjectId, pos: Vec): boolean => {
  const point = engine.points[String(id)];
  if (!point) return false;
  if (nearlyEqual(point.x, pos.x) && nearlyEqual(point.y, pos.y)) return false;
  point.x = pos.x;
  point.y = pos.y;
  return true;
};

const lineEndpointIds = (line: EngineLine): [ObjectId, ObjectId] | null => {
  const aId = line.defining_points?.[0] ?? line.points[0];
  const bId = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  if (!aId || !bId) return null;
  return [String(aId), String(bId)];
};

const lineEndpoints = (engine: EngineState, line: EngineLine): { a: EnginePoint; b: EnginePoint } | null => {
  const ids = lineEndpointIds(line);
  if (!ids) return null;
  const a = getPoint(engine, ids[0]);
  const b = getPoint(engine, ids[1]);
  if (!a || !b) return null;
  if (a.id === b.id) return null;
  return { a, b };
};

const lineDirection = (engine: EngineState, line: EngineLine): { dir: Vec; length: number } | null => {
  const endpoints = lineEndpoints(engine, line);
  if (!endpoints) return null;
  const dx = endpoints.b.x - endpoints.a.x;
  const dy = endpoints.b.y - endpoints.a.y;
  const len = Math.hypot(dx, dy);
  if (len <= EPS) return null;
  return { dir: { x: dx / len, y: dy / len }, length: len };
};

const lineLength = (engine: EngineState, line: EngineLine): number => {
  const endpoints = lineEndpoints(engine, line);
  if (!endpoints) return 0;
  return Math.hypot(endpoints.b.x - endpoints.a.x, endpoints.b.y - endpoints.a.y);
};

const circleHasDefiningPoint = (circle: EngineCircle, pointId: ObjectId): boolean => {
  if (circle.circle_kind !== 'three-point' && circle.circle_kind !== 'compass') return false;
  return circleInputPointIds(circle).some((id) => String(id) === String(pointId));
};

const circleRadius = (engine: EngineState, circle: EngineCircle): number => {
  return resolveCircleGeometry(engine, circle)?.radius ?? 0;
};

const circlesContainingPoint = (engine: EngineState, pointId: ObjectId): EngineCircle[] => {
  const res: EngineCircle[] = [];
  Object.values(engine.circles).forEach((circle) => {
    const includes = (circle.points ?? []).some((pid) => String(pid) === String(pointId));
    if (includes && !circleHasDefiningPoint(circle, pointId)) res.push(circle);
  });
  return res;
};

const constrainToLineId = (engine: EngineState, lineId: ObjectId, target: Vec): Vec => {
  const line = getLine(engine, lineId);
  if (!line) return target;
  const endpoints = lineEndpoints(engine, line);
  if (!endpoints) return target;
  return projectPointOnLine(target, endpoints.a, endpoints.b);
};

const constrainToLineParent = (engine: EngineState, pointId: ObjectId, target: Vec): Vec => {
  const point = getPoint(engine, pointId);
  if (!point) return target;
  const parent = point.parent_refs?.find((pr) => pr.kind === 'line' && pr.id);
  if (!parent) return target;
  return constrainToLineId(engine, parent.id, target);
};

const constrainToCircle = (engine: EngineState, circle: EngineCircle, pointId: ObjectId, target: Vec): Vec => {
  const center = getPoint(engine, circle.center);
  const current = getPoint(engine, pointId);
  if (!center || !current) return target;
  const radius = circleRadius(engine, circle);
  if (!(radius > EPS)) return target;
  let dir = { x: target.x - center.x, y: target.y - center.y };
  let len = Math.hypot(dir.x, dir.y);
  if (len < EPS) {
    dir = { x: current.x - center.x, y: current.y - center.y };
    len = Math.hypot(dir.x, dir.y) || 1;
  }
  const norm = { x: dir.x / len, y: dir.y / len };
  return { x: center.x + norm.x * radius, y: center.y + norm.y * radius };
};

const constrainToCircles = (engine: EngineState, pointId: ObjectId, target: Vec): Vec => {
  const circles = circlesContainingPoint(engine, pointId);
  if (!circles.length) return target;
  return constrainToCircle(engine, circles[0], pointId, target);
};

const ensureLineIncludesPoint = (line: EngineLine, pointId: ObjectId) => {
  if (!line.points.some((pid) => String(pid) === String(pointId))) {
    line.points.push(String(pointId));
  }
};

const reorderLinePoints = (engine: EngineState, line: EngineLine): boolean => {
  if (!line.points || line.points.length < 2) return false;
  const endpoints = lineEndpoints(engine, line);
  if (!endpoints) return false;
  const dir = normalize({ x: endpoints.b.x - endpoints.a.x, y: endpoints.b.y - endpoints.a.y });
  const base = endpoints.a;
  const unique = Array.from(new Set(line.points.map((pid) => String(pid))));
  unique.sort((p1, p2) => {
    const pt1 = getPoint(engine, p1);
    const pt2 = getPoint(engine, p2);
    if (!pt1 || !pt2) return 0;
    const t1 = (pt1.x - base.x) * dir.x + (pt1.y - base.y) * dir.y;
    const t2 = (pt2.x - base.x) * dir.x + (pt2.y - base.y) * dir.y;
    return t1 - t2;
  });
  const next = unique;
  if (next.length === line.points.length && next.every((id, idx) => String(line.points[idx]) === id)) return false;
  line.points = next;
  return true;
};

const recomputeMidpoint = (engine: EngineState, pointId: ObjectId): boolean => {
  const point = getPoint(engine, pointId);
  if (!point || point.construction_kind !== 'midpoint' || !point.midpointMeta) return false;
  const [parentAId, parentBId] = point.midpointMeta.parents;
  const parentA = getPoint(engine, parentAId);
  const parentB = getPoint(engine, parentBId);
  if (!parentA || !parentB) return false;
  let target = { x: (parentA.x + parentB.x) / 2, y: (parentA.y + parentB.y) / 2 };
  const parentLineId = point.midpointMeta.parentLineId ?? null;
  if (parentLineId) target = constrainToLineId(engine, parentLineId, target);
  target = constrainToCircles(engine, pointId, target);
  return setPointPosition(engine, pointId, target);
};

const recomputeBisectPoint = (engine: EngineState, pointId: ObjectId): boolean => {
  const point = getPoint(engine, pointId);
  if (!point || point.construction_kind !== 'bisect' || !point.bisectMeta) return false;
  const target = bisectorPointPosition(engine, point.bisectMeta);
  if (!target) return false;
  return setPointPosition(engine, pointId, constrainToCircles(engine, pointId, target));
};

const reflectPointAcrossLine = (engine: EngineState, source: Vec, line: EngineLine): Vec | null => {
  const endpoints = lineEndpoints(engine, line);
  if (!endpoints) return null;
  const dx = endpoints.b.x - endpoints.a.x;
  const dy = endpoints.b.y - endpoints.a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= EPS) return null;
  const t = ((source.x - endpoints.a.x) * dx + (source.y - endpoints.a.y) * dy) / lenSq;
  const proj = { x: endpoints.a.x + dx * t, y: endpoints.a.y + dy * t };
  return { x: 2 * proj.x - source.x, y: 2 * proj.y - source.y };
};

const recomputeSymmetricPoint = (engine: EngineState, pointId: ObjectId): boolean => {
  const point = getPoint(engine, pointId);
  if (!point || point.construction_kind !== 'symmetric' || !point.symmetricMeta) return false;
  const sm = point.symmetricMeta;
  const source = getPoint(engine, sm.source);
  if (!source) return false;
  let target: Vec | null = null;
  if (sm.mirror.kind === 'point') {
    const mirror = getPoint(engine, sm.mirror.id);
    if (!mirror) return false;
    target = { x: mirror.x * 2 - source.x, y: mirror.y * 2 - source.y };
  } else {
    const line = getLine(engine, sm.mirror.id);
    if (!line) return false;
    target = reflectPointAcrossLine(engine, source, line);
  }
  if (!target) return false;
  target = constrainToCircles(engine, pointId, target);
  return setPointPosition(engine, pointId, target);
};

const recomputeParallelLine = (engine: EngineState, lineId: ObjectId, stack: Set<ObjectId>): boolean => {
  if (stack.has(lineId)) return false;
  const line = getLine(engine, lineId);
  if (!line || line.construction_kind !== 'parallel' || !line.parallel) return false;
  const anchor = getPoint(engine, line.parallel.throughPoint);
  const helper = getPoint(engine, line.parallel.helperPoint);
  const baseLine = getLine(engine, line.parallel.referenceLine);
  if (!anchor || !helper || !baseLine) return false;
  const dirInfo = lineDirection(engine, baseLine);
  if (!dirInfo) return false;
  stack.add(lineId);
  try {
    const direction = dirInfo.dir;
    const distances = new Map<ObjectId, number>();
    line.points.forEach((pid) => {
      const pt = getPoint(engine, pid);
      if (!pt) return;
      const vec = { x: pt.x - anchor.x, y: pt.y - anchor.y };
      distances.set(pt.id, dot(vec, direction));
    });
    if (!distances.has(helper.id)) {
      const vec = { x: helper.x - anchor.x, y: helper.y - anchor.y };
      distances.set(helper.id, dot(vec, direction));
    }
    // The direction endpoint is an output, not a draggable definition. Projecting
    // it onto a rotated base changes its length or reverses the parameter axis.
    const oldLength = distance(helper, anchor);
    const helperDistance = line.parallel.helperDistance ?? (oldLength > EPS ? oldLength : Math.max(dirInfo.length, 120));
    line.parallel.helperDistance = helperDistance;
    distances.set(helper.id, helperDistance);
    let changed = false;
    distances.forEach((dist, pid) => {
      if (pid === anchor.id) return;
      const target = { x: anchor.x + direction.x * dist, y: anchor.y + direction.y * dist };
      const constrained = constrainToCircles(engine, pid, target);
      if (setPointPosition(engine, pid, constrained)) changed = true;
    });
    ensureLineIncludesPoint(line, line.parallel.throughPoint);
    ensureLineIncludesPoint(line, line.parallel.helperPoint);
    const nextDef: [ObjectId, ObjectId] = [line.parallel.throughPoint, line.parallel.helperPoint];
    if (
      String(line.defining_points?.[0] ?? '') !== String(nextDef[0]) ||
      String(line.defining_points?.[1] ?? '') !== String(nextDef[1])
    ) {
      line.defining_points = nextDef;
      changed = true;
    }
    if (reorderLinePoints(engine, line)) changed = true;
    return changed;
  } finally {
    stack.delete(lineId);
  }
};

const recomputePerpendicularLine = (
  engine: EngineState,
  lineId: ObjectId,
  stack: Set<ObjectId>,
  movedPointIds?: Set<ObjectId>
): boolean => {
  if (stack.has(lineId)) return false;
  const line = getLine(engine, lineId);
  if (!line || line.construction_kind !== 'perpendicular' || !line.perpendicular) return false;
  const anchor = getPoint(engine, line.perpendicular.throughPoint);
  let helper = getPoint(engine, line.perpendicular.helperPoint);
  if (!anchor || !helper) return false;
  if (line.perpendicular.directBisector) {
    const refs = line.perpendicular.referencePoints;
    const a = refs ? getPoint(engine, refs[0]) : null;
    const b = refs ? getPoint(engine, refs[1]) : null;
    if (!a || !b) return false;
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length <= EPS) return false;
    const half = line.perpendicular.helperDistance ?? length / 2;
    if (!(half > EPS) || !Number.isFinite(half)) return false;
    line.perpendicular.helperDistance = half;
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const normal = { x: -dy / length, y: dx / length };
    let changed = false;
    if (setPointPosition(engine, line.perpendicular.throughPoint, { x: midpoint.x - normal.x * half, y: midpoint.y - normal.y * half })) changed = true;
    if (setPointPosition(engine, line.perpendicular.helperPoint, { x: midpoint.x + normal.x * half, y: midpoint.y + normal.y * half })) changed = true;
    const divisions = lineSubdivisionPointIds(line);
    if (divisions.length !== line.points.length) {
      line.points = divisions;
      changed = true;
    }
    const nextDef: [ObjectId, ObjectId] = [line.perpendicular.throughPoint, line.perpendicular.helperPoint];
    if (String(line.defining_points?.[0] ?? '') !== String(nextDef[0]) || String(line.defining_points?.[1] ?? '') !== String(nextDef[1])) {
      line.defining_points = nextDef;
      changed = true;
    }
    if (reorderLinePoints(engine, line)) changed = true;
    return changed;
  }
  const dirInfo = referenceLineGeometry(engine, line.perpendicular);
  if (!dirInfo) return false;
  stack.add(lineId);
  try {
    const baseNormal = { x: -dirInfo.dir.y, y: dirInfo.dir.x };
    const helperMode = line.perpendicular.helperMode ?? 'normal';
    if (helperMode === 'projection') {
      const endpoints = dirInfo;
      if (endpoints) {
        const projected = projectPointOnLine(anchor, endpoints.a, endpoints.b);
        const constrained = constrainToCircles(engine, line.perpendicular.helperPoint, projected);
        if (setPointPosition(engine, line.perpendicular.helperPoint, constrained)) {
          helper = getPoint(engine, helper.id) ?? helper;
        }
      }
    }
    const helperVecRaw = { x: helper.x - anchor.x, y: helper.y - anchor.y };
    const baseProjection = dot(helperVecRaw, baseNormal);
    let orientation: 1 | -1 = line.perpendicular.helperOrientation ?? (baseProjection >= 0 ? 1 : -1);
    if (helperMode === 'projection') orientation = baseProjection >= 0 ? 1 : -1;
    line.perpendicular.helperOrientation = orientation;
    const direction = orientation === 1 ? baseNormal : { x: -baseNormal.x, y: -baseNormal.y };
    const distances = new Map<ObjectId, number>();
    line.points.forEach((pid) => {
      const pt = getPoint(engine, pid);
      if (!pt) return;
      const vec = { x: pt.x - anchor.x, y: pt.y - anchor.y };
      distances.set(pt.id, dot(vec, direction));
    });
    const helperProjection = dot(helperVecRaw, direction);
    let helperDistance = line.perpendicular.helperDistance;
    const helperDragged =
      movedPointIds !== undefined &&
      movedPointIds.has(String(line.perpendicular.helperPoint));
    if (helperMode === 'projection') {
      helperDistance = Math.abs(helperProjection);
      line.perpendicular.helperDistance = helperDistance;
    } else if (helperDragged) {
      let updatedDistance = Math.abs(helperProjection);
      if (!Number.isFinite(updatedDistance) || updatedDistance < 1e-3) {
        const baseLen = dirInfo.length;
        updatedDistance = baseLen > 1e-3 ? baseLen : 120;
      }
      helperDistance = updatedDistance;
      line.perpendicular.helperDistance = helperDistance;
    } else if (helperDistance === undefined || helperDistance < 1e-3) {
      let inferred = Math.abs(helperProjection);
      if (!Number.isFinite(inferred) || inferred < 1e-3) {
        const baseLen = dirInfo.length;
        inferred = baseLen > 1e-3 ? baseLen : 120;
      }
      helperDistance = inferred;
      line.perpendicular.helperDistance = helperDistance;
    }
    helperDistance = line.perpendicular.helperDistance ?? helperDistance ?? 0;
    if (!Number.isFinite(helperDistance) || helperDistance < 1e-3) {
      const baseLen = dirInfo.length;
      helperDistance = baseLen > 1e-3 ? baseLen : 120;
    }
    line.perpendicular.helperDistance = helperDistance;
    distances.set(helper.id, helperDistance);
    let changed = false;
    distances.forEach((dist, pid) => {
      if (pid === anchor.id) return;
      const target = { x: anchor.x + direction.x * dist, y: anchor.y + direction.y * dist };
      const constrained = constrainToCircles(engine, pid, target);
      if (setPointPosition(engine, pid, constrained)) changed = true;
    });
    ensureLineIncludesPoint(line, line.perpendicular.throughPoint);
    ensureLineIncludesPoint(line, line.perpendicular.helperPoint);
    const nextDef: [ObjectId, ObjectId] = [line.perpendicular.throughPoint, line.perpendicular.helperPoint];
    if (
      String(line.defining_points?.[0] ?? '') !== String(nextDef[0]) ||
      String(line.defining_points?.[1] ?? '') !== String(nextDef[1])
    ) {
      line.defining_points = nextDef;
      changed = true;
    }
    if (reorderLinePoints(engine, line)) changed = true;
    return changed;
  } finally {
    stack.delete(lineId);
  }
};

const reprojectLinePoints = (engine: EngineState, line: EngineLine): boolean => {
  const endpoints = lineEndpoints(engine, line);
  if (!endpoints) return false;
  let changed = false;
  const defSet = new Set([String(line.defining_points?.[0] ?? ''), String(line.defining_points?.[1] ?? '')]);
  line.points.forEach((pid) => {
    if (defSet.has(String(pid))) return;
    const point = getPoint(engine, pid);
    if (!point) return;
    if (point.construction_kind === 'intersection' || point.commonTangent) return;
    const hasLineParent = point.parent_refs?.some((pr) => pr.kind === 'line' && String(pr.id) === String(line.id));
    if (!hasLineParent) return;
    const next = projectPointOnLine(point, endpoints.a, endpoints.b);
    const constrained = constrainToCircles(engine, point.id, next);
    if (setPointPosition(engine, point.id, constrained)) changed = true;
  });
  return changed;
};

const reprojectCirclePoints = (engine: EngineState, circle: EngineCircle): boolean => {
  const center = getPoint(engine, circle.center);
  if (!center) return false;
  const radius = circleRadius(engine, circle);
  if (!(radius > EPS)) return false;
  let changed = false;
  (circle.points ?? []).forEach((pid) => {
    if (circleHasDefiningPoint(circle, pid)) return;
    const point = getPoint(engine, pid);
    if (!point) return;
    if (point.construction_kind === 'intersection' || point.commonTangent) return;
    const angle = Math.atan2(point.y - center.y, point.x - center.x);
    if (!Number.isFinite(angle)) return;
    const target = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
    if (setPointPosition(engine, point.id, target)) changed = true;
  });
  return changed;
};

const recomputeCircleThroughPoints = (engine: EngineState, circle: EngineCircle): boolean => {
  if (circle.circle_kind !== 'three-point') return false;
  const defs = circle.defining_points ?? [];
  if (defs.length < 3) return false;
  const a = getPoint(engine, defs[0]);
  const b = getPoint(engine, defs[1]);
  const c = getPoint(engine, defs[2]);
  if (!a || !b || !c) return false;
  const centerPos = circleFromThree(a, b, c);
  if (!centerPos) return false;
  const radius = Math.hypot(centerPos.x - a.x, centerPos.y - a.y);
  if (!Number.isFinite(radius) || radius < EPS) return false;
  let changed = false;
  if (setPointPosition(engine, circle.center, centerPos)) changed = true;
  (circle.points ?? []).forEach((pid) => {
    if (circleHasDefiningPoint(circle, pid)) return;
    const pt = getPoint(engine, pid);
    if (!pt) return;
    const angle = Math.atan2(pt.y - centerPos.y, pt.x - centerPos.x);
    if (!Number.isFinite(angle)) return;
    const projected = { x: centerPos.x + Math.cos(angle) * radius, y: centerPos.y + Math.sin(angle) * radius };
    if (setPointPosition(engine, pt.id, projected)) changed = true;
  });
  return changed;
};

const applyIntersectionBranches = (engine: EngineState, point: EnginePoint, solutions: Vec[]): boolean => {
  const parents = point.parent_refs!.slice(0, 2);
  const group = Object.values(engine.points).filter(other =>
    other.construction_kind === 'intersection' && other.parent_refs?.length === 2 &&
    parents.every(parent => other.parent_refs!.some(ref => ref.kind === parent.kind && ref.id === parent.id))
  );
  if (!group.includes(point)) group.push(point);
  let changed = false;
  for (const assignment of assignIntersectionBranches(group, solutions)) {
    if (assignment.position && setPointPosition(engine, assignment.id, assignment.position)) changed = true;
  }
  return changed;
};

const recomputeIntersectionPoint = (engine: EngineState, pointId: ObjectId): boolean => {
  const point = getPoint(engine, pointId);
  if (!point || !point.parent_refs || point.parent_refs.length < 2) return false;
  const [pa, pb] = point.parent_refs.slice(0, 2);

  // line-line
  if (pa.kind === 'line' && pb.kind === 'line') {
    const lineA = getLine(engine, pa.id);
    const lineB = getLine(engine, pb.id);
    if (!lineA || !lineB) return false;
    const endA = lineEndpoints(engine, lineA);
    const endB = lineEndpoints(engine, lineB);
    if (!endA || !endB) return false;
    const inter = intersectLines(endA.a, endA.b, endB.a, endB.b);
    if (inter) return setPointPosition(engine, pointId, inter);
    return false;
  }

  // line-circle
  if ((pa.kind === 'line' && pb.kind === 'circle') || (pa.kind === 'circle' && pb.kind === 'line')) {
    const lineRef = pa.kind === 'line' ? pa : pb;
    const circRef = pa.kind === 'circle' ? pa : pb;
    const line = getLine(engine, lineRef.id);
    const circle = getCircle(engine, circRef.id);
    if (!line || !circle) return false;
    const endpoints = lineEndpoints(engine, line);
    const center = getPoint(engine, circle.center);
    const radius = circleRadius(engine, circle);
    if (!endpoints || !center || radius <= 0) return false;
    const pts = lineCircleIntersections(endpoints.a, endpoints.b, center, radius, false);
    if (!pts.length) {
      return false;
    }
    return applyIntersectionBranches(engine, point, pts);
  }

  // circle-circle
  if (pa.kind === 'circle' && pb.kind === 'circle') {
    const circleA = getCircle(engine, pa.id);
    const circleB = getCircle(engine, pb.id);
    if (!circleA || !circleB) return false;
    const centerA = getPoint(engine, circleA.center);
    const centerB = getPoint(engine, circleB.center);
    const radiusA = circleRadius(engine, circleA);
    const radiusB = circleRadius(engine, circleB);
    if (!centerA || !centerB || radiusA <= 0 || radiusB <= 0) return false;
    const pts = circleCircleIntersections(centerA, radiusA, centerB, radiusB);
    return applyIntersectionBranches(engine, point, pts);
  }

  return false;
};

const recomputeDerivedPoints = (engine: EngineState): boolean => {
  let changed = false;
  Object.values(engine.points).forEach((pt) => {
    if (!pt) return;
    if (pt.commonTangent) {
      const position=commonTangentContactPosition(engine,pt.commonTangent);
      if(position && setPointPosition(engine,pt.id,position)) changed=true;
    } else if (pt.construction_kind === 'midpoint') {
      if (recomputeMidpoint(engine, pt.id)) changed = true;
    } else if (pt.construction_kind === 'bisect') {
      if (recomputeBisectPoint(engine, pt.id)) changed = true;
    } else if (pt.construction_kind === 'symmetric') {
      if (recomputeSymmetricPoint(engine, pt.id)) changed = true;
    }
  });
  return changed;
};

const recomputeParallelPerpendicularLines = (engine: EngineState, movedPointIds?: Set<ObjectId>): boolean => {
  let changed = false;
  const parallelStack = new Set<ObjectId>();
  const perpendicularStack = new Set<ObjectId>();
  Object.values(engine.lines).forEach((line) => {
    if (!line) return;
    if (line.construction_kind === 'parallel') {
      if (recomputeParallelLine(engine, line.id, parallelStack)) changed = true;
    } else if (line.construction_kind === 'perpendicular') {
      if (recomputePerpendicularLine(engine, line.id, perpendicularStack, movedPointIds)) changed = true;
    }
  });
  return changed;
};

const recomputeCircleGeometry = (engine: EngineState): boolean => {
  let changed = false;
  Object.values(engine.circles).forEach((circle) => {
    if (!circle) return;
    if (circle.circle_kind === 'three-point') {
      if (recomputeCircleThroughPoints(engine, circle)) changed = true;
    } else {
      if (reprojectCirclePoints(engine, circle)) changed = true;
    }
  });
  return changed;
};

const recomputeLockedPolygons = (engine: EngineState): boolean => {
  let changed = false;
  Object.values(engine.polygons).forEach((poly) => {
    if (!poly?.locked || !poly.lockRef) return;
    const [aId, bId] = poly.lockRef.base;
    const a = getPoint(engine, aId);
    const b = getPoint(engine, bId);
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len <= EPS) return;
    const axis = { x: dx / len, y: dy / len };
    const left = { x: -axis.y, y: axis.x };
    poly.lockRef.coords.forEach((coord) => {
      const pid = String(coord.id);
      if (pid === String(aId) || pid === String(bId)) return;
      const point = getPoint(engine, pid);
      if (!point) return;
      if (point.construction_kind && point.construction_kind !== 'free' && point.construction_kind !== 'on_object') return;
      const target = {
        x: a.x + axis.x * (coord.u * len) + left.x * (coord.v * len),
        y: a.y + axis.y * (coord.u * len) + left.y * (coord.v * len)
      };
      let next = target;
      next = constrainToLineParent(engine, pid, next);
      next = constrainToCircles(engine, pid, next);
      if (setPointPosition(engine, pid, next)) changed = true;
    });
  });
  return changed;
};

const recomputeIntersections = (engine: EngineState): boolean => {
  let changed = false;
  const boundaryGroups = new Map<string, EnginePoint[]>();
  Object.values(engine.points).forEach(point => {
    const setId = point.boundaryIntersectionSlot?.setId;
    if (setId) boundaryGroups.set(setId, [...(boundaryGroups.get(setId) ?? []), point]);
  });
  for (const group of boundaryGroups.values()) {
    const set = group.find(point => point.boundaryIntersectionSet)?.boundaryIntersectionSet;
    if (!set) continue;
    const solutions = polygonBoundaryIntersections(engine, set.parents);
    for (const assignment of assignBoundaryIntersectionBranches(group, solutions)) {
      if (assignment.position && setPointPosition(engine, assignment.id, assignment.position)) changed = true;
    }
  }
  Object.values(engine.points).forEach((pt) => {
    if (pt && pt.construction_kind === 'intersection' && !pt.boundaryIntersectionSlot) {
      if (recomputeIntersectionPoint(engine, pt.id)) changed = true;
    }
  });
  return changed;
};

const recomputeOnObjectPoints = (engine: EngineState): boolean => {
  let changed = false;
  Object.values(engine.lines).forEach((line) => {
    if (line) {
      const subdivisions = lineSubdivisionPointIds(line);
      if (subdivisions.length !== line.points.length) {
        line.points = subdivisions;
        changed = true;
      }
      if (reprojectLinePoints(engine, line)) changed = true;
      if (reorderLinePoints(engine, line)) changed = true;
    }
  });
  Object.values(engine.circles).forEach((circle) => {
    if (circle) {
      if (reprojectCirclePoints(engine, circle)) changed = true;
    }
  });
  return changed;
};

export function recomputeAll(
  engine: EngineState,
  options: { maxPasses?: number; movedPointIds?: Set<ObjectId> } = {}
): { converged: boolean; passes: number } {
  // A dependency may advance only one level per pass when objects were loaded
  // in reverse order. Allow a full document's dependency depth, with one final
  // verification pass. Keep a finite budget for cyclic/inconsistent constraints.
  const maxPasses = options.maxPasses ?? (
    Object.keys(engine.points).length + Object.keys(engine.lines).length +
    Object.keys(engine.circles).length + Object.keys(engine.polygons).length + 1
  );
  for (let pass = 0; pass < maxPasses; pass++) {
    const pointsBefore = Object.values(engine.points).map(p => ({ id: p.id, x: p.x, y: p.y, geometryValid: p.geometryValid }));
    const linesBefore = Object.values(engine.lines).map(line => ({ id: line.id, points: line.points.slice(), defining: line.defining_points.slice() }));
    recomputeParallelPerpendicularLines(engine, options.movedPointIds);
    recomputeCircleGeometry(engine);
    recomputeLockedPolygons(engine);
    recomputeIntersections(engine);
    recomputeDerivedPoints(engine);
    recomputeOnObjectPoints(engine);
    const validityChanged = updateGeometryValidity(engine);
    // Compare the result of a complete pass. Intermediate writes may cancel
    // each other; conversely, projection helpers used to omit their change flag.
    const pointsStable = pointsBefore.every(p => {
      const next = engine.points[p.id];
      return nearlyEqual(p.x, next.x) && nearlyEqual(p.y, next.y) && p.geometryValid === next.geometryValid;
    });
    const linesStable = linesBefore.every(line => {
      const next = engine.lines[line.id];
      return line.points.length === next.points.length && line.points.every((id, i) => id === next.points[i]) &&
        line.defining.every((id, i) => id === next.defining_points[i]);
    });
    if (pointsStable && linesStable && !validityChanged) return { converged: true, passes: pass + 1 };
  }
  return { converged: false, passes: maxPasses };
}

export function movePointAndRecompute(engine: EngineState, pointId: ObjectId, target: Vec): void {
  const point = getPoint(engine, pointId);
  if (!point || point.construction_kind === 'symmetric') return;
  let next = { x: target.x, y: target.y };
  if (point.construction_kind === 'on_object') {
    next = constrainToCircles(engine, pointId, constrainToLineParent(engine, pointId, next));
  }
  setPointPosition(engine, pointId, next);
  recomputeAll(engine, { movedPointIds: new Set([String(pointId)]) });
}

const calculateLineFractions = (engine: EngineState, line: EngineLine): number[] | null => {
  if (!line) return null;
  const endpoints = lineEndpoints(engine, line);
  if (!endpoints) return null;
  const dir = normalize({ x: endpoints.b.x - endpoints.a.x, y: endpoints.b.y - endpoints.a.y });
  const len = Math.hypot(endpoints.b.x - endpoints.a.x, endpoints.b.y - endpoints.a.y);
  if (len <= EPS) return null;
  return line.points.map((pid) => {
    const p = getPoint(engine, pid);
    if (!p) return 0;
    return ((p.x - endpoints.a.x) * dir.x + (p.y - endpoints.a.y) * dir.y) / len;
  });
};

const captureLineFractionsForMovedDefiningPoints = (
  engine: EngineState,
  movedPointIds: Set<ObjectId>
): Map<ObjectId, number[]> => {
  const res = new Map<ObjectId, number[]>();
  Object.values(engine.lines).forEach((line) => {
    if (!line) return;
    const def0 = String(line.defining_points?.[0] ?? line.points[0]);
    const def1 = String(line.defining_points?.[1] ?? line.points[line.points.length - 1]);
    if (!movedPointIds.has(def0) && !movedPointIds.has(def1)) return;
    const fractions = calculateLineFractions(engine, line);
    if (fractions) res.set(line.id, fractions);
  });
  return res;
};

const applyLineFractions = (engine: EngineState, lineId: ObjectId, fractions: number[]): boolean => {
  const line = getLine(engine, lineId);
  if (!line) return false;
  const endpoints = lineEndpoints(engine, line);
  if (!endpoints) return false;
  const dir = normalize({ x: endpoints.b.x - endpoints.a.x, y: endpoints.b.y - endpoints.a.y });
  const len = Math.hypot(endpoints.b.x - endpoints.a.x, endpoints.b.y - endpoints.a.y);
  if (len <= EPS) return false;
  let changed = false;
  fractions.forEach((t, idx) => {
    if (idx >= line.points.length) return;
    const pId = line.points[idx];
    if (line.defining_points?.some((pid) => String(pid) === String(pId))) return;
    const pos = { x: endpoints.a.x + dir.x * t * len, y: endpoints.a.y + dir.y * t * len };
    if (setPointPosition(engine, pId, pos)) changed = true;
  });
  return changed;
};

export type MovePointsOptions = {
  constrainToLine?: boolean;
  constrainToCircle?: boolean;
};

export type TransformOptions = MovePointsOptions & {
  center: Vec;
  vectors: Array<{ id: ObjectId; vx: number; vy: number }>;
  scale?: number;
  rotation?: number;
  dependentLineFractions?: Map<ObjectId, number[]>;
};

export function movePointsByDeltaAndRecompute(
  engine: EngineState,
  originals: Map<ObjectId, Vec>,
  delta: Vec,
  options: MovePointsOptions = {}
): Set<ObjectId> {
  const movedPointIds = new Set<ObjectId>();
  const movedKeys = new Set<ObjectId>();
  originals.forEach((_pos, id) => movedKeys.add(String(id)));
  const lineFractions = captureLineFractionsForMovedDefiningPoints(engine, movedKeys);

  const constrainToLine = options.constrainToLine !== false;
  const constrainToCircle = options.constrainToCircle !== false;

  originals.forEach((orig, pointId) => {
    const point = getPoint(engine, pointId);
    if (!point || point.construction_kind === 'symmetric') return;
    let next = { x: orig.x + delta.x, y: orig.y + delta.y };
    if (constrainToLine) next = constrainToLineParent(engine, pointId, next);
    if (constrainToCircle) next = constrainToCircles(engine, pointId, next);
    if (setPointPosition(engine, pointId, next)) movedPointIds.add(String(pointId));
  });

  lineFractions.forEach((fractions, lineId) => {
    applyLineFractions(engine, lineId, fractions);
  });

  recomputeAll(engine, { movedPointIds: movedKeys });
  return movedPointIds;
}

export function transformPointsAndRecompute(engine: EngineState, options: TransformOptions): Set<ObjectId> {
  const movedPointIds = new Set<ObjectId>();
  const movedKeys = new Set<ObjectId>();
  options.vectors.forEach((v) => movedKeys.add(String(v.id)));

  const autoFractions = captureLineFractionsForMovedDefiningPoints(engine, movedKeys);
  if (options.dependentLineFractions) {
    options.dependentLineFractions.forEach((fractions, lineId) => {
      autoFractions.set(String(lineId), fractions);
    });
  }

  const scale = options.scale ?? 1;
  const rotation = options.rotation ?? 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const constrainToLine = options.constrainToLine !== false;
  const constrainToCircle = options.constrainToCircle !== false;

  options.vectors.forEach(({ id, vx, vy }) => {
    const point = getPoint(engine, id);
    if (!point || point.construction_kind === 'symmetric') return;
    const sx = vx * scale;
    const sy = vy * scale;
    const rx = sx * cos - sy * sin;
    const ry = sx * sin + sy * cos;
    let next = { x: options.center.x + rx, y: options.center.y + ry };
    if (constrainToLine) next = constrainToLineParent(engine, id, next);
    if (constrainToCircle) next = constrainToCircles(engine, id, next);
    if (setPointPosition(engine, id, next)) movedPointIds.add(String(id));
  });

  autoFractions.forEach((fractions, lineId) => {
    applyLineFractions(engine, lineId, fractions);
  });

  recomputeAll(engine, { movedPointIds: movedKeys });
  return movedPointIds;
}
