import { addLineFromPoints, addPoint } from './engineActions';
import { perpendicularBisectorSeed } from './dependentLineGeometry';
import type { ConstructionRuntime, PointStyle, StrokeStyle } from './runtimeTypes';

/** Create a perpendicular bisector from two points without adding a midpoint object. */
export function createDirectPerpendicularBisector(
  runtime: ConstructionRuntime,
  aId: string,
  bId: string,
  strokeStyle: StrokeStyle = {},
  pointStyle: PointStyle = {}
): string | null {
  const a = runtime.points[aId], b = runtime.points[bId];
  if (!a || !b || a.spatial || b.spatial || a.geometryValid === false || b.geometryValid === false) return null;
  const seed = perpendicularBisectorSeed(runtime, aId, bId);
  if (!seed) return null;

  const negativeId = addPoint(runtime, {
    ...seed.negativeEndpoint,
    style: { ...pointStyle, hidden: true },
    construction_kind: 'free'
  });
  const positiveId = addPoint(runtime, {
    ...seed.positiveEndpoint,
    style: { ...pointStyle, hidden: true },
    construction_kind: 'free'
  });
  const lineId = addLineFromPoints(runtime, negativeId, positiveId, { ...strokeStyle });
  const line = runtime.lines[lineId];
  // Defining helpers describe direction only; subdivision contains user points.
  line.points = [];
  line.segmentStyles = [];
  line.segmentKeys = [];
  line.construction_kind = 'perpendicular';
  line.defining_parents = [aId, bId];
  line.perpendicular = {
    directBisector: true,
    throughPoint: negativeId,
    helperPoint: positiveId,
    referencePoints: [aId, bId],
    helperDistance: seed.helperDistance
  };
  line.leftRay = { ...strokeStyle, hidden: false };
  line.rightRay = { ...strokeStyle, hidden: false };

  runtime.points[negativeId].auxiliaryFor = lineId;
  runtime.points[negativeId].perpendicular_helper_for = lineId;
  runtime.points[positiveId].auxiliaryFor = lineId;
  runtime.points[positiveId].perpendicular_helper_for = lineId;
  return lineId;
}
