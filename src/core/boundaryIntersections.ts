import type {
  BoundaryIntersectionParent,
  BoundaryIntersectionSet,
  ConstructionRuntime,
  ObjectId,
  PointStyle
} from './runtimeTypes';
import { toEngineState } from './engineAdapter';
import { findLineIdForSegment } from './lineTools';
import { reconcileLineTopologyStyles } from '../ui/lineTopologyStyles';
import { polygonBoundaryIntersections, type BoundaryIntersectionCoordinates } from './boundaryIntersectionGeometry';
export { assignBoundaryIntersectionBranches, polygonBoundaryIntersections } from './boundaryIntersectionGeometry';

type Vec = BoundaryIntersectionCoordinates;
const EPS = 1e-8;

function allocatePointId(runtime: ConstructionRuntime): ObjectId {
  runtime.idCounters.point += 1;
  return `pt${runtime.idCounters.point}`;
}

/** Create one persisted output point per current hit; runtime recompute can add slots as hits appear. */
export function createBoundaryIntersectionSet(
  runtime: ConstructionRuntime,
  parents: [BoundaryIntersectionParent, BoundaryIntersectionParent],
  style: PointStyle = { color: '#ffffff', size: 4 }
): ObjectId[] {
  const hits = polygonBoundaryIntersections(toEngineState(runtime), parents);
  if (!hits.length) return [];
  const outputs = hits.map(() => allocatePointId(runtime));
  const setId = outputs[0];
  const set: BoundaryIntersectionSet = { parents: parents.map(parent => ({ ...parent })) as BoundaryIntersectionSet['parents'], outputs };
  hits.forEach((position, index) => {
    const id = outputs[index];
    runtime.points[id] = {
      object_type: 'point', id, ...position, style: { ...style }, construction_kind: 'intersection',
      parent_refs: [], defining_parents: [],
      boundaryIntersectionSet: { parents: set.parents.map(parent => ({ ...parent })) as BoundaryIntersectionSet['parents'], outputs: outputs.slice() },
      boundaryIntersectionSlot: { setId, index },
      recompute: () => {}, on_parent_deleted: () => {}
    };
  });
  syncBoundaryIntersectionTopology(runtime);
  return outputs;
}

/** Output points whose construction lost a defining line or polygon. */
export function boundaryIntersectionOutputsWithMissingParents(runtime: ConstructionRuntime): ObjectId[] {
  const groups = new Map<ObjectId, { set: BoundaryIntersectionSet; outputs: Set<ObjectId> }>();
  for (const point of Object.values(runtime.points)) {
    const set = point?.boundaryIntersectionSet;
    const slot = point?.boundaryIntersectionSlot;
    if (!set || !slot) continue;
    const group = groups.get(slot.setId) ?? { set, outputs: new Set<ObjectId>() };
    group.outputs.add(point.id);
    set.outputs.forEach(id => group.outputs.add(id));
    groups.set(slot.setId, group);
  }
  const missing = (parent: BoundaryIntersectionParent) => parent.kind === 'line'
    ? !runtime.lines[parent.id]
    : !runtime.polygons[parent.id];
  return [...groups.values()].flatMap(group => group.set.parents.some(missing) ? [...group.outputs] : []);
}

/** Add persistent output slots only when the construction reaches a new maximum number of hits. */
export function syncBoundaryIntersectionSlots(runtime: ConstructionRuntime): boolean {
  const groups = new Map<string, { set: BoundaryIntersectionSet; representative: string }>();
  for (const point of Object.values(runtime.points)) {
    if (!point?.boundaryIntersectionSet || !point.boundaryIntersectionSlot) continue;
    const key = point.boundaryIntersectionSlot.setId;
    if (!groups.has(key)) groups.set(key, { set: point.boundaryIntersectionSet, representative: point.id });
  }
  if (!groups.size) return false;
  const engine = toEngineState(runtime);
  let changed = false;
  for (const [setId, group] of groups) {
    const hits = polygonBoundaryIntersections(engine, group.set.parents);
    const outputs = group.set.outputs.slice();
    const representative = runtime.points[group.representative];
    while (outputs.length < hits.length) {
      const index = outputs.length;
      const id = allocatePointId(runtime);
      const set: BoundaryIntersectionSet = { parents: group.set.parents.map(parent => ({ ...parent })) as BoundaryIntersectionSet['parents'], outputs: [...outputs, id] };
      runtime.points[id] = {
        object_type: 'point', id, x: hits[index].x, y: hits[index].y,
        style: { ...(representative?.style ?? { color: '#ffffff', size: 4 }) },
        construction_kind: 'intersection', parent_refs: [], defining_parents: [], boundaryIntersectionSlot: { setId, index },
        boundaryIntersectionSet: set, recompute: () => {}, on_parent_deleted: () => {}
      };
      outputs.push(id);
      changed = true;
    }
    if (changed || outputs.length !== group.set.outputs.length) {
      for (const id of outputs) {
        const point = runtime.points[id];
        if (point?.boundaryIntersectionSet) point.boundaryIntersectionSet.outputs = outputs.slice();
      }
    }
  }
  if (changed) syncBoundaryIntersectionTopology(runtime);
  return changed;
}

function boundaryEdgeLine(runtime: ConstructionRuntime, aId: ObjectId, bId: ObjectId): ObjectId | null {
  const exact = findLineIdForSegment(runtime, aId, bId);
  if (exact) return String(exact);
  for (const line of Object.values(runtime.lines)) {
    const points = line.points.map(String);
    if (points.includes(String(aId)) && points.includes(String(bId))) return String(line.id);
  }
  return null;
}

function pointOnFiniteSide(point: Vec, a: Vec, b: Vec): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length <= EPS) return false;
  const crossDistance = Math.abs(dx * (point.y - a.y) - dy * (point.x - a.x)) / length;
  const projection = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (length * length);
  const tolerance = Math.max(EPS * Math.max(1, length), Number.EPSILON * Math.max(1, Math.abs(point.x), Math.abs(point.y)) * 16);
  return crossDistance <= tolerance && projection >= -EPS && projection <= 1 + EPS;
}

/** Split only the clicked source line and polygon boundary sides that contain each live output. */
export function syncBoundaryIntersectionTopology(runtime: ConstructionRuntime): boolean {
  const livePoints = Object.values(runtime.points).filter(point => point?.boundaryIntersectionSet && point.boundaryIntersectionSlot);
  if (!livePoints.length) return false;
  const sets = new Map<string, BoundaryIntersectionSet>();
  const touchedLines = new Set<ObjectId>();
  const ownedByLine = new Map<ObjectId, Set<ObjectId>>();
  for (const point of livePoints) {
    const slot = point.boundaryIntersectionSlot!;
    const set = point.boundaryIntersectionSet!;
    if (!sets.has(slot.setId)) sets.set(slot.setId, set);
    slot.topologyLines?.forEach(lineId => touchedLines.add(lineId));
  }

  const desiredByPoint = new Map<ObjectId, Set<ObjectId>>();
  const sideLinesForPolygon = (polygonId: ObjectId) => {
    const polygon = runtime.polygons[String(polygonId)];
    const vertices = polygon?.points ?? [];
    const edges: Array<{ a: Vec; b: Vec; lineId: ObjectId }> = [];
    if (vertices.length < 3) return edges;
    for (let i = 0; i < vertices.length; i++) {
      const aId = String(vertices[i]), bId = String(vertices[(i + 1) % vertices.length]);
      const a = runtime.points[aId], b = runtime.points[bId], lineId = boundaryEdgeLine(runtime, aId, bId);
      if (a && b && lineId) edges.push({ a, b, lineId });
    }
    return edges;
  };
  for (const [setId, set] of sets) {
    const polygons = set.parents.filter(parent => parent.kind === 'polygon');
    const parentLine = set.parents.find(parent => parent.kind === 'line');
    const polygonEdges = polygons.flatMap(parent => sideLinesForPolygon(parent.id));
    const ownedLines = new Set<ObjectId>();
    if (parentLine) ownedLines.add(parentLine.id);
    polygonEdges.forEach(edge => ownedLines.add(edge.lineId));
    for (const point of livePoints) {
      if (point.boundaryIntersectionSlot?.setId !== setId) continue;
      point.boundaryIntersectionSlot.topologyLines?.forEach(lineId => ownedLines.add(lineId));
    }
    for (const lineId of ownedLines) {
      touchedLines.add(lineId);
      const owned = ownedByLine.get(lineId) ?? new Set<ObjectId>();
      set.outputs.forEach(id => owned.add(id));
      ownedByLine.set(lineId, owned);
    }
    for (const outputId of set.outputs) {
      const point = runtime.points[outputId];
      if (!point || !point.boundaryIntersectionSlot) continue;
      const targets = desiredByPoint.get(outputId) ?? new Set<ObjectId>();
      if (point.geometryValid !== false) {
        if (parentLine && runtime.lines[parentLine.id]) targets.add(parentLine.id);
        for (const edge of polygonEdges) if (pointOnFiniteSide(point, edge.a, edge.b)) targets.add(edge.lineId);
      } else {
        // Temporary loss of a crossing must retain subdivision identity and its
        // hidden styles. The renderer projects unavailable points onto the line.
        for (const lineId of point.boundaryIntersectionSlot.topologyLines ?? []) {
          if (runtime.lines[lineId]) targets.add(lineId);
        }
      }
      desiredByPoint.set(outputId, targets);
    }
  }

  const lineUpdates = new Map<ObjectId, ObjectId[]>();
  const positions = Object.fromEntries(Object.values(runtime.points).map(point => [point.id, { x: point.x, y: point.y }]));
  for (const lineId of touchedLines) {
    const line = runtime.lines[lineId];
    if (!line) continue;
    const ownedIds = ownedByLine.get(lineId) ?? new Set<ObjectId>();
    for (const id of line.defining_points) ownedIds.delete(id);
    const kept = line.points.map(String).filter(id => !ownedIds.has(id));
    for (const [id, targets] of desiredByPoint) if (targets.has(lineId)) kept.push(id);
    const unique = Array.from(new Set(kept));
    const a = runtime.points[line.defining_points?.[0] ?? unique[0]];
    const b = runtime.points[line.defining_points?.[1] ?? unique[unique.length - 1]];
    if (a && b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      unique.sort((id1, id2) => {
        const p1 = runtime.points[id1], p2 = runtime.points[id2];
        if (!p1 || !p2) return 0;
        return (p1.x - a.x) * dx + (p1.y - a.y) * dy - ((p2.x - a.x) * dx + (p2.y - a.y) * dy);
      });
    }
    if (unique.length !== line.points.length || unique.some((id, index) => id !== String(line.points[index]))) {
      const reconciled = reconcileLineTopologyStyles(line, unique, positions, positions);
      line.points = unique;
      line.segmentKeys = reconciled.segmentKeys;
      line.segmentStyles = reconciled.segmentStyles;
      lineUpdates.set(lineId, unique);
    }
  }

  for (const point of livePoints) {
    const targets = Array.from(desiredByPoint.get(point.id) ?? []);
    const slot = point.boundaryIntersectionSlot!;
    const previous = slot.topologyLines ?? [];
    if (targets.length !== previous.length || targets.some(id => !previous.includes(id))) {
      slot.topologyLines = targets;
    }
  }
  return lineUpdates.size > 0;
}
