import type { ConstructionRuntime, ObjectId, Point, Line } from './runtimeTypes';
import {
  calculateLineFractions as calculateLineFractionsCore,
  applyFractionsToLine as applyFractionsToLineCore,
  applyLineFractions as applyLineFractionsCore,
  type LineConstraintDeps
} from './lineConstraints';
import { linesContainingPoint } from './lineTools';
import type { RuntimeRecomputeHandlers } from './runtimeRecomputeHandlers';

export type LineConstraintRecomputeDeps = Pick<
  RuntimeRecomputeHandlers,
  | 'updateIntersectionsForLine'
  | 'updateParallelLinesForLine'
  | 'updatePerpendicularLinesForLine'
  | 'updateMidpointsForPoint'
  | 'updateCirclesForPoint'
>;

export type RuntimeLineConstraintHandlers = {
  findLinesContainingPoint: (pointId: ObjectId) => ObjectId[];
  calculateLineFractions: (lineId: ObjectId) => number[];
  applyFractionsToLine: (lineId: ObjectId, fractions: number[]) => void;
  applyLineFractions: (lineId: ObjectId, visited?: Set<string>) => ReturnType<typeof applyLineFractionsCore>;
  captureLineContext: (pointId: ObjectId) => { lineId: string; fractions: number[] } | null;
};

export function createRuntimeLineConstraintHandlers(
  getRuntime: () => ConstructionRuntime,
  recompute: LineConstraintRecomputeDeps
): RuntimeLineConstraintHandlers {
  const getPointById = (id: ObjectId, runtime: ConstructionRuntime): Point | null => {
    return runtime.points[String(id)] ?? null;
  };

  const getLineById = (id: ObjectId, runtime: ConstructionRuntime): Line | null => {
    return runtime.lines[String(id)] ?? null;
  };

  const getDeps = (): LineConstraintDeps => {
    const runtime = getRuntime();
    return {
      runtime,
      getPointById,
      enforceIntersections: recompute.updateIntersectionsForLine,
      updateMidpointsForPoint: recompute.updateMidpointsForPoint,
      updateCirclesForPoint: recompute.updateCirclesForPoint
    };
  };

  const findLinesContainingPointHandler = (pointId: ObjectId): ObjectId[] => {
    return linesContainingPoint(getRuntime(), pointId);
  };

  const calculateLineFractions = (lineId: ObjectId): number[] => {
    return calculateLineFractionsCore(lineId, getDeps());
  };

  const applyFractionsToLine = (lineId: ObjectId, fractions: number[]): void => {
    applyFractionsToLineCore(lineId, fractions, getDeps());
  };

  const applyLineFractions = (lineId: ObjectId, visited: Set<string> = new Set<string>()) => {
    const lineKey = String(lineId);
    if (visited.has(lineKey)) return null;
    visited.add(lineKey);

    const deps = getDeps();
    const result = applyLineFractionsCore(lineId, deps);
    const line = getLineById(lineId, deps.runtime);
    if (!line || !Array.isArray(line.points)) return result;

    const affectedLines = new Set<string>();
    line.points.forEach((pid) => {
      findLinesContainingPointHandler(pid).forEach((li) => {
        const key = String(li);
        if (key !== lineKey && !visited.has(key)) affectedLines.add(key);
      });
    });
    affectedLines.forEach((li) => {
      recompute.updateIntersectionsForLine(li);
      applyLineFractions(li, visited);
      recompute.updateParallelLinesForLine(li);
      recompute.updatePerpendicularLinesForLine(li);
    });
    return result;
  };

  const captureLineContext = (pointId: ObjectId): { lineId: string; fractions: number[] } | null => {
    const lineId = findLinesContainingPointHandler(pointId)[0];
    if (!lineId) return null;
    const fractions = calculateLineFractions(lineId);
    if (!fractions.length) return null;
    return { lineId: String(lineId), fractions };
  };

  return {
    findLinesContainingPoint: findLinesContainingPointHandler,
    calculateLineFractions,
    applyFractionsToLine,
    applyLineFractions,
    captureLineContext
  };
}
