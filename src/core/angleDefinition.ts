import type { AngleArm, ObjectId } from './runtimeTypes';
import type { LineHit } from './hitTypes';

type Position = { x: number; y: number };
type Geometry = {
  points: Record<ObjectId, Position & { geometryValid?: boolean }>;
  lines: Record<ObjectId, { points: ObjectId[]; defining_points?: [ObjectId, ObjectId] }>;
};
type Definition = {
  vertex: ObjectId; point1?: ObjectId; point2?: ObjectId;
  arm1LineId?: ObjectId; arm2LineId?: ObjectId;
  arm1?: AngleArm; arm2?: AngleArm;
};

function endpoints(geometry: Geometry, id: ObjectId) {
  const line = geometry.lines[id];
  if (!line) return null;
  const ids = line.defining_points ?? [line.points[0], line.points[line.points.length - 1]];
  const a = geometry.points[ids[0]], b = geometry.points[ids[1]];
  if (!a || !b || !Number.isFinite(a.x + a.y + b.x + b.y) || Math.hypot(b.x - a.x, b.y - a.y) <= 1e-6) return null;
  return { a, b };
}

/** A line arm keeps its direction relative to defining inputs, never subdivision indices. */
export function lineAngleArm(geometry: Geometry, lineId: ObjectId, vertex: Position, click: Position): AngleArm | null {
  const base = endpoints(geometry, lineId);
  if (!base) return null;
  const dot = (click.x - vertex.x) * (base.b.x - base.a.x) + (click.y - vertex.y) * (base.b.y - base.a.y);
  if (Math.abs(dot) < 1e-6) return null;
  return { kind: 'line', lineId, direction: dot > 0 ? 1 : -1 };
}

export function lineAngleDefinition(geometry: Geometry, firstId: ObjectId, firstClick: Position, secondId: ObjectId, secondClick: Position,
  intersection: (a: Position, b: Position, c: Position, d: Position) => Position | null, firstHit?: LineHit, secondHit?: LineHit) {
  const first = endpoints(geometry, firstId), second = endpoints(geometry, secondId);
  if (!first || !second) return null;
  const hitPoints = (id: ObjectId, hit?: LineHit) => {
    const points = geometry.lines[id].points;
    return !hit ? [] : hit.part === 'rayLeft' ? [points[0]] : hit.part === 'rayRight' ? [points[points.length - 1]] : [points[hit.seg], points[hit.seg + 1]];
  };
  const common = firstId === secondId ? hitPoints(firstId, firstHit).filter(id => hitPoints(secondId, secondHit).includes(id)) : [];
  if (firstId === secondId && common.length !== 1) return null;
  const vertex = firstId === secondId ? geometry.points[common[0]] : intersection(first.a, first.b, second.a, second.b);
  if (!vertex) return null;
  const arm1 = lineAngleArm(geometry, firstId, vertex, firstClick), arm2 = lineAngleArm(geometry, secondId, vertex, secondClick);
  if (!arm1 || !arm2) return null;
  if (firstId === secondId && arm1.kind === 'line' && arm2.kind === 'line' && arm1.direction === arm2.direction) return null;
  const existingVertex = geometry.lines[firstId].points.find(id => {
    const point = geometry.points[id];
    return geometry.lines[secondId].points.includes(id) && point && point.geometryValid !== false && Math.hypot(point.x - vertex.x, point.y - vertex.y) < 1e-6;
  }) ?? null;
  return { vertex, existingVertex, arm1, arm2 };
}

export function angleArmPoint(geometry: Geometry, vertex: Position, arm: AngleArm): Position | null {
  if (arm.kind === 'point') return geometry.points[arm.pointId] ?? null;
  const base = endpoints(geometry, arm.lineId);
  if (!base || (arm.direction !== 1 && arm.direction !== -1)) return null;
  const dx = base.b.x - base.a.x, dy = base.b.y - base.a.y;
  const scale = arm.direction / Math.hypot(dx, dy);
  return { x: vertex.x + dx * scale, y: vertex.y + dy * scale };
}

export function resolveAngleDefinition(geometry: Geometry, angle: Definition) {
  const v = geometry.points[angle.vertex];
  if (!v) return null;
  const legacyArm = (pointId?: ObjectId, lineId?: ObjectId): AngleArm | null => {
    if (pointId && geometry.points[pointId]) return { kind: 'point', pointId };
    const line = geometry.lines[lineId ?? pointId ?? ''];
    if (!line) return null;
    const other = line.points.filter(id => id !== angle.vertex && geometry.points[id])
      .sort((a, b) => Math.hypot(geometry.points[a].x - v.x, geometry.points[a].y - v.y) - Math.hypot(geometry.points[b].x - v.x, geometry.points[b].y - v.y))[0];
    return other ? { kind: 'point', pointId: other } : null;
  };
  const arm1 = angle.arm1 ?? legacyArm(angle.point1, angle.arm1LineId);
  const arm2 = angle.arm2 ?? legacyArm(angle.point2, angle.arm2LineId);
  const p1 = arm1 && angleArmPoint(geometry, v, arm1), p2 = arm2 && angleArmPoint(geometry, v, arm2);
  if (!p1 || !p2 || !Number.isFinite(v.x + v.y + p1.x + p1.y + p2.x + p2.y) || Math.hypot(p1.x - v.x, p1.y - v.y) <= 1e-6 || Math.hypot(p2.x - v.x, p2.y - v.y) <= 1e-6) return null;
  const normalize = (angle: number) => (angle + 2 * Math.PI) % (2 * Math.PI);
  return { v, p1, p2, ang1: normalize(Math.atan2(p1.y - v.y, p1.x - v.x)), ang2: normalize(Math.atan2(p2.y - v.y, p2.x - v.x)) };
}

export function angleDefinitionDependencies(angle: Definition): { kind: 'point' | 'line'; id: ObjectId }[] {
  const arm = (value: AngleArm | undefined, point?: ObjectId, line?: ObjectId) => value
    ? { kind: value.kind, id: value.kind === 'point' ? value.pointId : value.lineId }
    : { kind: line ? 'line' as const : 'point' as const, id: line ?? point ?? '' };
  return [{ kind: 'point', id: angle.vertex }, arm(angle.arm1, angle.point1, angle.arm1LineId), arm(angle.arm2, angle.point2, angle.arm2LineId)];
}
