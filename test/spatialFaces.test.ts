import { describe, expect, it } from 'vitest';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { createCuboid, ensureSpatialFaces, resizeSpatialSolid, rotateSpatialGroup, spatialFacePolygon, spatialFaces, syncSpatialGeometry } from '../src/core/spatialGeometry';
import type { Mat3 } from '../src/core/spatialTypes';

const faceKey = (face: { axis: number; side: number }) => `${face.axis}:${face.side}`;

describe('stable spatial cube faces', () => {
  it('creates six addressable solid faces and keeps their ids across geometry updates', () => {
    const runtime = makeEmptyRuntime();
    const solidId = createCuboid(runtime, { x: 100, y: 80 }, 40);
    const solid = runtime.solids![solidId];
    const faces = Object.values(runtime.polygons).filter((polygon) => polygon.solidFace?.solidId === solidId);
    expect(faces).toHaveLength(6);
    expect(new Set(faces.map((polygon) => faceKey(polygon.solidFace!))).size).toBe(6);
    expect(faces.every((polygon) => polygon.spatialGroupId === solid.groupId && polygon.points.length === 4)).toBe(true);

    const ids = new Map(faces.map((polygon) => [faceKey(polygon.solidFace!), polygon.id]));
    for (const polygon of faces) {
      const { axis, side } = polygon.solidFace!;
      expect(spatialFacePolygon(runtime, solidId, axis as 0 | 1 | 2, side as 0 | 1)).toBe(polygon.id);
    }
    const initial = [...runtime.spatialGroups![solid.groupId].orientation] as Mat3;
    rotateSpatialGroup(runtime, solid.groupId, initial, 35, -48);
    syncSpatialGeometry(runtime);
    expect(Object.values(runtime.polygons).filter((polygon) => polygon.solidFace?.solidId === solidId)).toHaveLength(6);
    for (const [key, id] of ids) expect(runtime.polygons[id]?.solidFace && faceKey(runtime.polygons[id].solidFace!)).toBe(key);

    const restored = JSON.parse(JSON.stringify(runtime)) as typeof runtime;
    syncSpatialGeometry(restored);
    expect(restored.solids![solidId].faces).toEqual(runtime.solids![solidId].faces);
    expect(Object.values(restored.polygons).filter((polygon) => polygon.solidFace?.solidId === solidId).map((polygon) => polygon.id).sort()).toEqual([...ids.values()].sort());
  });

  it('migrates a cube with missing saved face records without duplicating faces or user polygons', () => {
    const runtime = makeEmptyRuntime();
    const solidId = createCuboid(runtime, { x: 0, y: 0 }, 32);
    const original = Object.values(runtime.polygons).filter((polygon) => polygon.solidFace?.solidId === solidId);
    const originalIds = original.map((polygon) => polygon.id);
    delete runtime.solids![solidId].faces;
    for (const polygon of original) delete runtime.polygons[polygon.id];

    ensureSpatialFaces(runtime);
    const migrated = Object.values(runtime.polygons).filter((polygon) => polygon.solidFace?.solidId === solidId);
    expect(migrated).toHaveLength(6);
    const migratedIds = migrated.map((polygon) => polygon.id);
    ensureSpatialFaces(runtime);
    syncSpatialGeometry(runtime);
    expect(Object.values(runtime.polygons).filter((polygon) => polygon.solidFace?.solidId === solidId).map((polygon) => polygon.id)).toEqual(migratedIds);
    expect(new Set(migratedIds).size).toBe(6);
    expect(migratedIds.some((id) => originalIds.includes(id))).toBe(false);
  });

  it('does not recreate a deliberately deleted face record when the solid already has face ids', () => {
    const runtime = makeEmptyRuntime();
    const solidId = createCuboid(runtime, { x: 0, y: 0 }, 32);
    const solid = runtime.solids![solidId], removedId = solid.faces![0];
    delete runtime.polygons[removedId];

    ensureSpatialFaces(runtime);
    syncSpatialGeometry(runtime);
    expect(solid.faces).toHaveLength(6);
    expect(runtime.polygons[removedId]).toBeUndefined();
    expect(Object.values(runtime.polygons).filter((polygon) => polygon.solidFace?.solidId === solidId)).toHaveLength(5);
  });

  it('allows finite bounded face resizing when a rotated axis is nearly head-on', () => {
    const runtime = makeEmptyRuntime();
    const solidId = createCuboid(runtime, { x: 100, y: 80 }, 40);
    const solid = runtime.solids![solidId], group = runtime.spatialGroups![solid.groupId];
    solid.shapeLocked = false;
    const initialOrientation = [...group.orientation] as Mat3;
    rotateSpatialGroup(runtime, solid.groupId, initialOrientation, 65, 42);
    const positiveYFace = spatialFaces(runtime, solidId).find((face) => face.axis === 1 && face.side === 1);
    expect(positiveYFace).toBeDefined();

    // This orientation leaves a small but nonzero screen projection for the y axis.
    const a = runtime.points[solid.vertices[0]], b = runtime.points[solid.vertices[2]];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const delta = { x: (b.x - a.x) / length * 8, y: (b.y - a.y) / length * 8 };
    const before = solid.size.y;
    resizeSpatialSolid(runtime, solidId, 1, 1, delta, { ...solid.size }, { ...solid.origin });

    expect(Number.isFinite(solid.size.y)).toBe(true);
    expect(solid.size.y).toBeGreaterThan(10);
    expect(solid.size.y).toBeLessThan(1000);
    expect(solid.size.y).not.toBe(before);
  });
});
