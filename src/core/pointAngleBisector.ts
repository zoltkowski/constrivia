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
  const position = bisectorPointPosition(runtime, meta);
  if (!position) return null;

  const helper = addPoint(runtime, {
    ...position,
    style: { ...pointStyle, hidden: true },
    construction_kind: 'bisect',
    bisectMeta: meta
  });
  const id = addLineFromPoints(runtime, vertex, helper, stroke);
  const line = runtime.lines[id];
  line.rightRay = { ...stroke, hidden: false };
  line.leftRay = { ...stroke, hidden: true };
  line.bisector = { vertex, bisectPoint: helper };
  runtime.points[helper].auxiliaryFor = id;
  return id;
}
