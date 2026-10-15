import { projectPointOnLine } from '../core/engine';
import { isGeometryAvailable } from '../core/geometryAvailability';
import type { ConstructionRuntime, Line, ObjectId, Point } from '../core/runtimeTypes';

export type LinePresentationPoint = Pick<Point, 'id' | 'x' | 'y'> & { geometryValid?: boolean; style?: Point['style'] };

const hasFiniteCoordinates = (point: { x?: number; y?: number } | null | undefined): point is { x: number; y: number } =>
  !!point && Number.isFinite(point.x) && Number.isFinite(point.y);

/** Build display coordinates for a valid line without changing runtime geometry. */
export function linePresentationPoints(line: Line, runtime: ConstructionRuntime): LinePresentationPoint[] | null {
  if (!line || !isGeometryAvailable(line) || !Array.isArray(line.points) || line.points.length < 2) return null;

  const definingIds = line.defining_points ?? [line.points[0], line.points[line.points.length - 1]];
  const definingA = runtime.points[String(definingIds[0])];
  const definingB = runtime.points[String(definingIds[1])];
  if (
    !isGeometryAvailable(definingA) || !isGeometryAvailable(definingB) ||
    !hasFiniteCoordinates(definingA) || !hasFiniteCoordinates(definingB)
  ) return null;

  const indexA = line.points.findIndex((id) => String(id) === String(definingIds[0]));
  const indexB = line.points.findIndex((id) => String(id) === String(definingIds[1]));
  if (indexA < 0 || indexB < 0) return null;
  const denominator = indexB === indexA ? 1 : indexB - indexA;

  const displayPoints: LinePresentationPoint[] = [];
  for (let index = 0; index < line.points.length; index++) {
    const id = line.points[index];
    const point = runtime.points[String(id)];
    if (point && isGeometryAvailable(point) && hasFiniteCoordinates(point)) {
      displayPoints.push(point);
      continue;
    }
    if (String(id) === String(definingIds[0]) || String(id) === String(definingIds[1])) return null;

    const cachedParameter=line.spatialParameters?.[String(id)];
    const projected = Number.isFinite(cachedParameter)
      ? {x:definingA.x+(definingB.x-definingA.x)*cachedParameter!,y:definingA.y+(definingB.y-definingA.y)*cachedParameter!}
      : point && hasFiniteCoordinates(point)
      ? projectPointOnLine(point, definingA, definingB)
      : {
          x: definingA.x + (definingB.x - definingA.x) * ((index - indexA) / denominator),
          y: definingA.y + (definingB.y - definingA.y) * ((index - indexA) / denominator)
        };
    displayPoints.push({
      ...(point ?? { id: id as ObjectId }),
      id,
      x: projected.x,
      y: projected.y,
      geometryValid: true
    });
  }
  return displayPoints;
}
