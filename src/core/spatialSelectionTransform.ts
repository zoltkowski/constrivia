import type { ConstructionRuntime, PointRuntime } from './runtimeTypes';
import type { Cuboid, SpatialGroup, Vec3 } from './spatialTypes';
import { syncSpatialGeometry } from './spatialGeometry';

export type SpatialSelectionSnapshot = {
  groupIds: string[];
  groups: Record<string, SpatialGroup>;
  solids: Record<string, Cuboid>;
  points: Record<string, PointRuntime['spatial']>;
};
export type SpatialSelectionTransform = {
  center?: { x: number; y: number };
  scale?: number;
  rotation?: number;
  delta?: { x: number; y: number };
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Return all 3D groups touched by selected points. */
export function selectedSpatialGroupIds(runtime: ConstructionRuntime, pointIds: Iterable<string>): string[] {
  return [...new Set([...pointIds].map(id => runtime.points[id]?.spatial?.groupId).filter((id): id is string => !!id && !!runtime.spatialGroups?.[id]))];
}

/** Capture complete selected groups so every pointer update can start from the same state. */
export function captureSpatialSelection(runtime: ConstructionRuntime, pointIds: Iterable<string>): SpatialSelectionSnapshot {
  const groupIds = selectedSpatialGroupIds(runtime, pointIds), selected = new Set(groupIds);
  const groups: Record<string, SpatialGroup> = {}, solids: Record<string, Cuboid> = {}, points: Record<string, PointRuntime['spatial']> = {};
  for (const id of groupIds) groups[id] = clone(runtime.spatialGroups![id]);
  for (const solid of Object.values(runtime.solids ?? {})) if (selected.has(solid.groupId)) solids[solid.id] = clone(solid);
  for (const point of Object.values(runtime.points)) if (point.spatial && selected.has(point.spatial.groupId)) points[point.id] = clone(point.spatial);
  return { groupIds, groups, solids, points };
}

const scaleVec = (v: Vec3, scale: number): Vec3 => ({ x: v.x * scale, y: v.y * scale, z: v.z * scale });
const rotateZ = (x: number, y: number, angle: number) => ({ x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) });

/** Apply a transform from the captured baseline, so repeated pointer updates never compound. */
export function transformSpatialSelection(runtime: ConstructionRuntime, snapshot: SpatialSelectionSnapshot, transform: SpatialSelectionTransform = {}): void {
  const scale = transform.scale ?? 1, rotation = transform.rotation ?? 0, delta = transform.delta ?? { x: 0, y: 0 };
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(rotation) || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return;
  const center = transform.center ?? { x: 0, y: 0 }, c = Math.cos(rotation), s = Math.sin(rotation);
  const rz = (m: SpatialGroup['orientation']): SpatialGroup['orientation'] => [
    c * m[0] - s * m[3], c * m[1] - s * m[4], c * m[2] - s * m[5],
    s * m[0] + c * m[3], s * m[1] + c * m[4], s * m[2] + c * m[5],
    m[6], m[7], m[8]
  ];
  for (const groupId of snapshot.groupIds) {
    const base = snapshot.groups[groupId], group = runtime.spatialGroups?.[groupId];
    if (!base || !group) continue;
    const scaled = { x: (base.anchor.x - center.x) * scale, y: (base.anchor.y - center.y) * scale };
    const rotated = rotateZ(scaled.x, scaled.y, rotation);
    group.anchor = { x: center.x + rotated.x + delta.x, y: center.y + rotated.y + delta.y };
    group.orientation = rz(base.orientation);
    group.pivot = scaleVec(base.pivot, scale);
  }
  for (const [id, base] of Object.entries(snapshot.solids)) {
    const solid = runtime.solids?.[id]; if (!solid) continue;
    const scaled = clone(base);
    scaled.origin = scaleVec(base.origin, scale);
    scaled.size = { x: base.size.x * scale, y: base.size.y * scale, z: base.size.z * scale };
    if (base.polyhedron) {
      scaled.polyhedron!.height = base.polyhedron.height * scale;
      scaled.polyhedron!.offset = scaleVec(base.polyhedron.offset, scale);
      scaled.polyhedron!.normal = { ...base.polyhedron.normal };
    }
    Object.assign(solid, scaled);
  }
  for (const [id, base] of Object.entries(snapshot.points)) {
    const point = runtime.points[id]; if (!point || !base) continue;
    point.spatial = clone(base);
    if (point.spatial.binding.kind === 'position') point.spatial.binding.position = scaleVec(base.binding.kind === 'position' ? base.binding.position : { x: 0, y: 0, z: 0 }, scale);
  }
  syncSpatialGeometry(runtime);
}
