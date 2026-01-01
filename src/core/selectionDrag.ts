export type DragTarget = 'line' | 'polygon';

// Used by move-mode selection to decide whether a polygon edge drag should move a line or polygon.
export function dragTargetForPolygonLineSelection(opts: {
  selectedSegmentsSize: number;
  lineIsDraggable: boolean;
  polygonDraggable: boolean;
}): DragTarget | null {
  if (opts.selectedSegmentsSize > 0) {
    return opts.lineIsDraggable ? 'line' : null;
  }
  return opts.polygonDraggable ? 'polygon' : null;
}
