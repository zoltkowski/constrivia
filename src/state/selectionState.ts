export interface SelectionState {
  selectedPointIndex: number | null;
  selectedLineIndex: number | null;
  selectedCircleIndex: number | null;
  selectedAngleIndex: number | null;
  selectedPolygonIndex: number | null;
  selectedInkStrokeIndex: number | null;
  selectedLabel: { kind: 'point' | 'line' | 'angle' | 'free'; id: number } | null;
  multiSelectedPoints: Set<number>;
  multiSelectedLines: Set<number>;
  multiSelectedCircles: Set<number>;
  multiSelectedAngles: Set<number>;
  multiSelectedPolygons: Set<string>;
  multiSelectedInkStrokes: Set<number>;
  multiSelectedLabels: Set<number>;
}

export const selectionState: SelectionState = {
  selectedPointIndex: null,
  selectedLineIndex: null,
  selectedCircleIndex: null,
  selectedAngleIndex: null,
  selectedPolygonIndex: null,
  selectedInkStrokeIndex: null,
  selectedLabel: null,
  multiSelectedPoints: new Set<number>(),
  multiSelectedLines: new Set<number>(),
  multiSelectedCircles: new Set<number>(),
  multiSelectedAngles: new Set<number>(),
  multiSelectedPolygons: new Set<string>(),
  
  multiSelectedInkStrokes: new Set<number>(),
  multiSelectedLabels: new Set<number>(),
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
