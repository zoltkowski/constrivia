import type { ConstructionRuntime, ObjectId } from './runtimeTypes';
import { recomputeAllRuntime } from './runtimeRecompute';

export type RuntimeRecomputeHandlers = {
  recomputeAllConstraints: (movedPointIds?: Iterable<ObjectId>) => void;
  updateCirclesForPoint: (pointId: ObjectId) => void;
  updateMidpointsForPoint: (pointId: ObjectId) => void;
  recomputeMidpoint: (pointId: ObjectId) => void;
  recomputeBisectPoint: (pointId: ObjectId) => void;
  recomputeSymmetricPoint: (pointId: ObjectId) => void;
  recomputeParallelLine: (lineId: ObjectId) => void;
  recomputePerpendicularLine: (lineId: ObjectId) => void;
  recomputeIntersectionPoint: (pointId: ObjectId) => void;
  updateIntersectionsForLine: (lineId: ObjectId | string | number) => void;
  updateIntersectionsForCircle: (circleId: ObjectId | string | number) => void;
  updateParallelLinesForLine: (lineId: ObjectId) => void;
  updatePerpendicularLinesForLine: (lineId: ObjectId) => void;
  updateParallelLinesForPoint: (pointId: ObjectId) => void;
  updatePerpendicularLinesForPoint: (pointId: ObjectId) => void;
  updateSymmetricPointsForLine: (lineId: ObjectId) => void;
};

export function createRuntimeRecomputeHandlers(getRuntime: () => ConstructionRuntime): RuntimeRecomputeHandlers {
  const recomputeAllConstraints = (movedPointIds?: Iterable<ObjectId>) => {
    recomputeAllRuntime(getRuntime(), { movedPointIds });
  };

  const updateCirclesForPoint = (pointId: ObjectId) => recomputeAllConstraints([pointId]);
  const updateMidpointsForPoint = (pointId: ObjectId) => recomputeAllConstraints([pointId]);
  const recomputeMidpoint = (pointId: ObjectId) => recomputeAllConstraints([pointId]);
  const recomputeBisectPoint = (pointId: ObjectId) => recomputeAllConstraints([pointId]);
  const recomputeSymmetricPoint = (pointId: ObjectId) => recomputeAllConstraints([pointId]);
  const recomputeParallelLine = (_lineId: ObjectId) => recomputeAllConstraints();
  const recomputePerpendicularLine = (_lineId: ObjectId) => recomputeAllConstraints();
  const recomputeIntersectionPoint = (pointId: ObjectId) => recomputeAllConstraints([pointId]);
  const updateIntersectionsForLine = (_lineId: ObjectId | string | number) => recomputeAllConstraints();
  const updateIntersectionsForCircle = (_circleId: ObjectId | string | number) => recomputeAllConstraints();
  const updateParallelLinesForLine = (_lineId: ObjectId) => recomputeAllConstraints();
  const updatePerpendicularLinesForLine = (_lineId: ObjectId) => recomputeAllConstraints();
  const updateParallelLinesForPoint = (pointId: ObjectId) => recomputeAllConstraints([pointId]);
  const updatePerpendicularLinesForPoint = (pointId: ObjectId) => recomputeAllConstraints([pointId]);
  const updateSymmetricPointsForLine = (_lineId: ObjectId) => recomputeAllConstraints();

  return {
    recomputeAllConstraints,
    updateCirclesForPoint,
    updateMidpointsForPoint,
    recomputeMidpoint,
    recomputeBisectPoint,
    recomputeSymmetricPoint,
    recomputeParallelLine,
    recomputePerpendicularLine,
    recomputeIntersectionPoint,
    updateIntersectionsForLine,
    updateIntersectionsForCircle,
    updateParallelLinesForLine,
    updatePerpendicularLinesForLine,
    updateParallelLinesForPoint,
    updatePerpendicularLinesForPoint,
    updateSymmetricPointsForLine
  };
}
