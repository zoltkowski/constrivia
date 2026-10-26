import type { EngineState } from './engineModel';
import { circleFromThree } from './circleTools';
import { circleCircleIntersections, intersectLines, lineCircleIntersections } from './engine';
import { bisectorPointPosition } from './bisectorGeometry';
import { resolveAngleDefinition, angleDefinitionDependencies } from './angleDefinition';
import { referenceLineGeometry, referenceDependencies } from './dependentLineGeometry';
import { resolveCircleGeometry, circleInputPointIds, compassSourceLines } from './circleGeometry';
import { assignBoundaryIntersectionBranches, polygonBoundaryIntersections } from './boundaryIntersectionGeometry';

type Target = { geometryValid?: boolean };
type Node = { target?: Target; valid: boolean; dependencies: string[] };
const EPS = 1e-6;

/**
 * Rebuild geometric existence independently of user-controlled visibility.
 * Invalidity propagates through defining inputs, never through hidden styles or
 * every subdivision point of an otherwise valid line/circle.
 */
export function updateGeometryValidity(engine: EngineState): boolean {
  const nodes = new Map<string, Node>();
  const pointKey = (id: string) => `point:${id}`;
  const lineKey = (id: string) => `line:${id}`;
  const circleKey = (id: string) => `circle:${id}`;
  const constraintKey = (id: string) => `constraint:${id}`;
  const finite = (p: { x: number; y: number } | undefined) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const endpoints = (id: string) => {
    const line = engine.lines[id];
    if (!line) return null;
    const a = engine.points[line.defining_points?.[0] ?? line.points[0]];
    const b = engine.points[line.defining_points?.[1] ?? line.points[line.points.length - 1]];
    return finite(a) && finite(b) && Math.hypot(b.x - a.x, b.y - a.y) > EPS ? { a, b } : null;
  };
  const circleGeometry = (id: string) => {
    const circle = engine.circles[id];
    if (!circle) return null;
    return resolveCircleGeometry(engine, circle);
  };
  const helperOwners = new Map<string, string[]>();
  const centerOwners = new Map<string, string[]>();
  const boundarySlotValidity = new Map<string, boolean>();
  const boundaryGroups = new Map<string, typeof engine.points[string][]>();
  for (const point of Object.values(engine.points)) {
    const setId = point.boundaryIntersectionSlot?.setId;
    if (setId) boundaryGroups.set(setId, [...(boundaryGroups.get(setId) ?? []), point]);
  }
  for (const points of boundaryGroups.values()) {
    const set = points.find(point => point.boundaryIntersectionSet)?.boundaryIntersectionSet;
    const assignments = set ? assignBoundaryIntersectionBranches(points, polygonBoundaryIntersections(engine, set.parents)) : [];
    for (const assignment of assignments) boundarySlotValidity.set(assignment.id, !!assignment.position);
  }
  for (const line of Object.values(engine.lines)) {
    const meta = line.parallel ?? line.perpendicular;
    if (!meta) continue;
    const key = constraintKey(line.id);
    const directBisector = line.perpendicular?.directBisector === true;
    const directRefs = directBisector ? line.perpendicular?.referencePoints ?? [] : [];
    nodes.set(key, {
      valid: (directBisector
        ? directRefs.length === 2 && directRefs.every(id => finite(engine.points[id])) &&
          Math.hypot(engine.points[directRefs[1]]!.x - engine.points[directRefs[0]]!.x, engine.points[directRefs[1]]!.y - engine.points[directRefs[0]]!.y) > EPS
        : !!referenceLineGeometry(engine, meta)) && finite(engine.points[meta.throughPoint]) && !!engine.points[meta.helperPoint],
      dependencies: [pointKey(meta.throughPoint), ...(
        directBisector ? directRefs.map(pointKey) : referenceDependencies(meta).map(ref => `${ref.kind}:${ref.id}`)
      )]
    });
    helperOwners.set(meta.helperPoint, [...(helperOwners.get(meta.helperPoint) ?? []), line.id]);
  }
  for (const circle of Object.values(engine.circles)) {
    if (circle.circle_kind === 'three-point') centerOwners.set(circle.center, [...(centerOwners.get(circle.center) ?? []), circle.id]);
  }

  for (const point of Object.values(engine.points)) {
    const dependencies: string[] = [];
    let valid = finite(point);
    const owners = helperOwners.get(point.id) ?? [];
    const projectionOwner = owners.find(id => engine.lines[id].perpendicular?.helperMode === 'projection');
    dependencies.push(...owners.map(constraintKey), ...(centerOwners.get(point.id) ?? []).map(circleKey));
    // A projection foot belongs to the perpendicular's inputs. Its own line
    // also uses that foot as an endpoint, so treating the incidental intersection
    // metadata as a second independent definition would create a false cycle.
    if (point.boundaryIntersectionSlot) {
      const set = point.boundaryIntersectionSet ?? boundaryGroups.get(point.boundaryIntersectionSlot.setId)?.find(candidate => candidate.boundaryIntersectionSet)?.boundaryIntersectionSet;
      valid = valid && !!set && boundarySlotValidity.get(point.id) === true;
      if (set) dependencies.push(...set.parents.map(parent => `${parent.kind}:${parent.id}`));
    } else if (point.construction_kind === 'intersection' && !projectionOwner) {
      const parents = point.parent_refs?.slice(0, 2) ?? [];
      dependencies.push(...parents.map(parent => `${parent.kind}:${parent.id}`));
      if (parents.length !== 2) valid = false;
      else {
        const [a, b] = parents;
        if (a.kind === 'line' && b.kind === 'line') {
          const first = endpoints(a.id), second = endpoints(b.id);
          valid = valid && !!first && !!second && !!intersectLines(first!.a, first!.b, second!.a, second!.b);
        } else if (a.kind === 'circle' && b.kind === 'circle') {
          const first = circleGeometry(a.id), second = circleGeometry(b.id);
          valid = valid && !!first && !!second && circleCircleIntersections(first!.center, first!.radius, second!.center, second!.radius).length > 0;
        } else {
          const line = parents.find(parent => parent.kind === 'line');
          const circle = parents.find(parent => parent.kind === 'circle');
          const l = line && endpoints(line.id), c = circle && circleGeometry(circle.id);
          valid = valid && !!l && !!c && lineCircleIntersections(l!.a, l!.b, c!.center, c!.radius, false).length > 0;
        }
      }
    } else if (point.construction_kind === 'midpoint') {
      const meta = point.midpointMeta;
      valid = valid && !!meta;
      if (meta) {
        dependencies.push(...meta.parents.map(pointKey));
        if (meta.parentLineId) dependencies.push(lineKey(meta.parentLineId));
      }
    } else if (point.construction_kind === 'bisect') {
      const meta = point.bisectMeta;
      valid = valid && !!meta && !!bisectorPointPosition(engine, meta!);
      if (meta) dependencies.push(...(meta.arms
        ? angleDefinitionDependencies({ vertex: meta.vertex, arm1: meta.arms[0], arm2: meta.arms[1] }).map(ref => `${ref.kind}:${ref.id}`)
        : [pointKey(meta.vertex), pointKey(meta.seg1.a), pointKey(meta.seg1.b), pointKey(meta.seg2.a), pointKey(meta.seg2.b), lineKey(meta.seg1.lineId), lineKey(meta.seg2.lineId)]));
    } else if (point.construction_kind === 'symmetric') {
      const meta = point.symmetricMeta;
      valid = valid && !!meta;
      if (meta) dependencies.push(pointKey(meta.source), `${meta.mirror.kind}:${meta.mirror.id}`);
    } else if (!projectionOwner && !owners.length && !centerOwners.has(point.id)) {
      dependencies.push(...(point.parent_refs ?? []).map(parent => `${parent.kind}:${parent.id}`));
    }
    nodes.set(pointKey(point.id), { target: point, valid, dependencies });
  }

  for (const line of Object.values(engine.lines)) {
    const ids = line.defining_points ?? [line.points[0], line.points[line.points.length - 1]];
    nodes.set(lineKey(line.id), {
      target: line,
      valid: !!endpoints(line.id),
      dependencies: [...ids.map(pointKey), ...(line.parallel || line.perpendicular ? [constraintKey(line.id)] : [])]
    });
  }
  for (const circle of Object.values(engine.circles)) {
    let valid = !!circleGeometry(circle.id);
    let dependencies: string[];
    if (circle.circle_kind === 'three-point') {
      const defs = circle.defining_points ?? [];
      const points = defs.map(id => engine.points[id]);
      valid = valid && defs.length === 3 && !defs.includes(circle.center) && points.every(p => finite(p)) && !!circleFromThree(points[0], points[1], points[2]);
      dependencies = defs.map(pointKey);
    } else dependencies = circleInputPointIds(circle).map(pointKey);
    if (circle.compassSource) dependencies.push(...compassSourceLines(circle.compassSource).map(line => lineKey(line.lineId)));
    nodes.set(circleKey(circle.id), { target: circle, valid, dependencies });
  }
  for (const polygon of Object.values(engine.polygons)) nodes.set(`polygon:${polygon.id}`, {
    target: polygon, valid: polygon.points.length >= 3, dependencies: polygon.points.map(pointKey)
  });
  for (const angle of Object.values(engine.angles)) {
    const armKey = (pointId?: string, lineId?: string) => lineId ? lineKey(lineId) : pointId ? (engine.points[pointId] ? pointKey(pointId) : lineKey(pointId)) : '';
    nodes.set(`angle:${angle.id}`, {
      target: angle, valid: !!resolveAngleDefinition(engine, angle),
      dependencies: angle.arm1 || angle.arm2
        ? angleDefinitionDependencies(angle).map(ref => `${ref.kind}:${ref.id}`)
        : [pointKey(angle.vertex), armKey(angle.point1, angle.arm1LineId), armKey(angle.point2, angle.arm2LineId)]
    });
  }

  // Propagate invalidity with a queue. Only defining dependencies participate;
  // cycles without an invalid input do not accidentally hide valid helpers.
  const dependents = new Map<string, string[]>();
  const queue: string[] = [];
  for (const [key, node] of nodes) {
    for (const parent of node.dependencies) {
      if (!nodes.has(parent)) node.valid = false;
      dependents.set(parent, [...(dependents.get(parent) ?? []), key]);
    }
    if (!node.valid) queue.push(key);
  }
  for (let i = 0; i < queue.length; i++) for (const child of dependents.get(queue[i]) ?? []) {
    const node = nodes.get(child)!;
    if (node.valid) { node.valid = false; queue.push(child); }
  }
  let changed = false;
  for (const node of nodes.values()) if (node.target && node.target.geometryValid !== node.valid) {
    node.target.geometryValid = node.valid;
    changed = true;
  }
  return changed;
}
