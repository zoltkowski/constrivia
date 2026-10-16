import { addPoint, addLineFromPoints } from './engineActions';
import { bisectorPointPosition } from './bisectorGeometry';
import type { ConstructionRuntime, BisectMeta, StrokeStyle, PointStyle } from './runtimeTypes';

/** Three explicit point inputs: the second point is the angle vertex. */
export function createPointAngleBisector(
  runtime: ConstructionRuntime,
  ids: [string, string, string],
  stroke: StrokeStyle = {},
  pointStyle: PointStyle = {}
): string | null {
  if (new Set(ids).size !== 3 || ids.some(id =>
    !runtime.points[id] || runtime.points[id].spatial || runtime.points[id].geometryValid === false
  )) return null;

  const [a, vertex, b] = ids;
  const meta: BisectMeta = {
    vertex,
    arms: [{ kind: 'point', pointId: a }, { kind: 'point', pointId: b }],
    epsilon: 8
  };
  return createAngleBisector(runtime, meta, stroke, pointStyle);
}

/** Create the same ray for point arms, segment arms and an existing angle. */
export function createAngleBisector(
  runtime: ConstructionRuntime,
  meta: BisectMeta,
  stroke: StrokeStyle = {},
  pointStyle: PointStyle = {}
): string | null {
  const vertex = runtime.points[meta.vertex];
  if (!vertex || vertex.spatial || vertex.geometryValid === false) return null;
  const position = bisectorPointPosition(runtime, meta);
  if (!position) return null;

  const helper = addPoint(runtime, {
    ...position,
    style: { ...pointStyle, hidden: true },
    construction_kind: 'bisect',
    bisectMeta: meta
  });
  const id = addLineFromPoints(runtime, meta.vertex, helper, stroke);
  const line = runtime.lines[id];
  line.points = [meta.vertex];
  line.segmentStyles = [];
  line.segmentKeys = [];
  line.rightRay = { ...stroke, hidden: false };
  line.leftRay = { ...stroke, hidden: true };
  line.bisector = { vertex: meta.vertex, bisectPoint: helper };
  runtime.points[helper].auxiliaryFor = id;
  return id;
}
