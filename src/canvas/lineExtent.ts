import type { ConstructionRuntime, ObjectId, Point } from '../core/runtimeTypes';
import { lineExtentRuntime } from '../core/engine';

// Used by UI helpers to enrich line extent with a concrete end-point coordinate.
export function lineExtentWithEndPoint(lineId: ObjectId, runtime: ConstructionRuntime) {
  const ext = lineExtentRuntime(String(lineId), runtime);
  if (!ext) return null;
  let end: Point | null = ext.endPoint ?? null;
  if (!end && Array.isArray(ext.order) && ext.order.length) {
    const lastId = ext.order[ext.order.length - 1]?.id;
    end = lastId ? runtime.points[String(lastId)] ?? null : null;
  }
  if (!end) end = ext.startPoint ?? null;
  if (!end) return null;
  return { ...ext, endPointCoord: { x: end.x, y: end.y } };
}
