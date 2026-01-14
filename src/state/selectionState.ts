import type { ObjectId } from '../core/runtimeTypes';

export interface SelectionState {
  selectedPointId: ObjectId | null;
  selectedLineId: ObjectId | null;
  selectedCircleId: ObjectId | null;
  selectedAngleId: ObjectId | null;
  selectedPolygonId: ObjectId | null;
  selectedInkStrokeId: ObjectId | null;
  selectedLabel: { kind: 'point' | 'line' | 'angle' | 'free'; id: ObjectId } | null;
  multiSelectedPoints: Set<ObjectId>;
  multiSelectedLines: Set<ObjectId>;
  multiSelectedCircles: Set<ObjectId>;
  multiSelectedAngles: Set<ObjectId>;
  multiSelectedPolygons: Set<ObjectId>;
  multiSelectedInkStrokes: Set<ObjectId>;
  multiSelectedLabels: Set<ObjectId>;
}

export const selectionState: SelectionState = {
  selectedPointId: null,
  selectedLineId: null,
  selectedCircleId: null,
  selectedAngleId: null,
  selectedPolygonId: null,
  selectedInkStrokeId: null,
  selectedLabel: null,
  multiSelectedPoints: new Set<ObjectId>(),
  multiSelectedLines: new Set<ObjectId>(),
  multiSelectedCircles: new Set<ObjectId>(),
  multiSelectedAngles: new Set<ObjectId>(),
  multiSelectedPolygons: new Set<ObjectId>(),
  multiSelectedInkStrokes: new Set<ObjectId>(),
  multiSelectedLabels: new Set<ObjectId>(),
};

// Used by main UI flow.
export function hasMultiSelection() {
  return (
    selectionState.multiSelectedPoints.size > 0 ||
    selectionState.multiSelectedLines.size > 0 ||
    selectionState.multiSelectedCircles.size > 0 ||
    selectionState.multiSelectedAngles.size > 0 ||
    selectionState.multiSelectedPolygons.size > 0 ||
    selectionState.multiSelectedInkStrokes.size > 0 ||
    selectionState.multiSelectedLabels.size > 0
  );
}
