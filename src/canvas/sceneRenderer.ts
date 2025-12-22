import {
  renderGrid,
  renderPolygonsAndLines,
  renderCirclesAndArcs,
  renderAngles,
  renderPoints,
  renderFreeLabels,
  renderMeasurementLabels,
  renderInkStroke,
  renderMultiselectBox,
  renderMultiselectOverlays,
  renderInteractionHelpers
} from './renderer';

export type RenderSceneDeps = {
  canvas: HTMLCanvasElement | null;
  model: any;
  runtime: any;
  showMeasurements: boolean;
  measurementLabels: any[];
  generateMeasurementLabels: () => void;
  THEME: any;
  dpr: number;
  zoomFactor: number;
  panOffset: { x: number; y: number };
  renderWidth: (w: number) => number;
  screenUnits: (v: number) => number;
  worldToCanvas: (x: number, y: number) => { x: number; y: number };
  labelFontSizePx: (d?: number, b?: number) => number;
  getLabelAlignment: (label?: any) => any;
  showHidden: boolean;
  selectedLineIndex: number | null;
  selectedSegments: Set<string>;
  selectionEdges: boolean;
  selectedPolygonIndex: number | null;
  multiSelectedLines: Set<number>;
  selectedCircleIndex: number | null;
  selectedArcSegments: Set<string>;
  selectedAngleIndex: number | null;
  selectedLabel: any;
  multiSelectedAngles: Set<number>;
  polygonVerticesOrdered: (polyRef: number | string) => number[];
  segmentKey: (lineIdx: number, kind: 'segment' | 'rayLeft' | 'rayRight', seg?: number) => string;
  lineExtent: (lineIdx: number) => any;
  circleRadius: (circle: any) => number;
  getLineHandle: (lineIdx: number) => { x: number; y: number } | null;
  getLineRotateHandle: (lineIdx: number) => { x: number; y: number } | null;
  getCircleHandle: (circleIdx: number) => { x: number; y: number } | null;
  getCircleRotateHandle: (circleIdx: number) => { x: number; y: number } | null;
  defaultLineLabelOffset: (lineIdx: number) => { x: number; y: number };
  defaultAngleLabelOffset: (angleIdx: number) => { x: number; y: number };
  drawSegmentTicks: (...args: any[]) => void;
  drawCircleTicks: (...args: any[]) => void;
  drawArcTicks: (...args: any[]) => void;
  drawDiagonalHandle: (...args: any[]) => void;
  drawRotateIcon: (...args: any[]) => void;
  drawLabelText: (...args: any[]) => void;
  applyStrokeStyle: (t: any) => void;
  applySelectionStyle: (ctx: CanvasRenderingContext2D, width: number, color: string, forPoint?: boolean) => void;
  isParallelLine: (line: any) => boolean;
  isPerpendicularLine: (line: any) => boolean;
  LABEL_PADDING_X: number;
  LABEL_PADDING_Y: number;
  pointRadius: (size: number) => number;
  activeAxisSnap: any;
  activeAxisSnaps: Map<number, any>;
  circlePerimeterPoints: (circle: any) => number[];
  circleArcs: (circleIdx: number) => any[];
  angleGeometry: (ang: any) => any;
  getAngleLegSeg: (angle: any, leg: 1 | 2) => number;
  defaultPointLabelOffset: (pointIdx: number) => { x: number; y: number };
  mode: string;
  circleThreePoints: number[] | null;
  hoverPointIndex: number | null;
  selectionVertices: boolean;
  pointInLine: (pi: number, line: any) => boolean;
  polygonHasPoint: (pi: number, poly: any) => boolean;
  circleHasDefiningPoint: (circle: any, pi: number) => boolean;
  selectedPointIndex: number | null;
  multiSelectedPoints: Set<number>;
  multiSelectedCircles: Set<number>;
  multiSelectedInkStrokes: Set<number>;
  multiselectBoxStart: { x: number; y: number } | null;
  multiselectBoxEnd: { x: number; y: number } | null;
  hasMultiSelection: () => boolean;
  getMultiHandles: () => any;
  rotatingMulti: any;
  hexToRgba: (hex: string, alpha: number) => string;
  selectedInkStrokeIndex: number | null;
  strokeBounds: (stroke: any) => { minX: number; minY: number; maxX: number; maxY: number } | null;
  showDebugLabels: () => boolean;
  drawDebugLabels: () => void;
  renderDebugPanel: () => void;
  getMeasurementLabelText: (label: any) => string;
  normalize: (v: { x: number; y: number }) => { x: number; y: number };
  RIGHT_ANGLE_MARK_MARGIN: number;
  RIGHT_ANGLE_MARK_MIN: number;
  RIGHT_ANGLE_MARK_MAX: number;
  RIGHT_ANGLE_MARK_RATIO: number;
  HANDLE_SIZE: number;
  HANDLE_HIT_PAD: number;
  multiSelectedLabels: Set<number>;
};

// Used by rendering flow.
export function renderScene(ctx: CanvasRenderingContext2D | null, deps: RenderSceneDeps) {
  if (!ctx) return;
  const {
    canvas,
    model,
    runtime,
    showMeasurements,
    measurementLabels,
    generateMeasurementLabels,
    THEME,
    dpr,
    zoomFactor,
    panOffset,
    renderWidth,
    screenUnits,
    worldToCanvas,
    labelFontSizePx,
    getLabelAlignment,
    showHidden,
    selectedLineIndex,
    selectedSegments,
    selectionEdges,
    selectedPolygonIndex,
    multiSelectedLines,
    selectedCircleIndex,
    selectedArcSegments,
    selectedAngleIndex,
    selectedLabel,
    multiSelectedAngles,
    polygonVerticesOrdered,
    segmentKey,
    lineExtent,
    circleRadius,
    getLineHandle,
    getLineRotateHandle,
    getCircleHandle,
    getCircleRotateHandle,
    defaultLineLabelOffset,
    defaultAngleLabelOffset,
    drawSegmentTicks,
    drawCircleTicks,
    drawArcTicks,
    drawDiagonalHandle,
    drawRotateIcon,
    drawLabelText,
    applyStrokeStyle,
    applySelectionStyle,
    isParallelLine,
    isPerpendicularLine,
    LABEL_PADDING_X,
    LABEL_PADDING_Y,
    pointRadius,
    activeAxisSnap,
    activeAxisSnaps,
    circlePerimeterPoints,
    circleArcs,
    angleGeometry,
    getAngleLegSeg,
    defaultPointLabelOffset,
    mode,
    circleThreePoints,
    hoverPointIndex,
    selectionVertices,
    pointInLine,
    polygonHasPoint,
    circleHasDefiningPoint,
    selectedPointIndex,
    multiSelectedPoints,
    multiSelectedCircles,
    multiSelectedInkStrokes,
    multiselectBoxStart,
    multiselectBoxEnd,
    hasMultiSelection,
    getMultiHandles,
    rotatingMulti,
    hexToRgba,
    selectedInkStrokeIndex,
    strokeBounds,
    showDebugLabels,
    drawDebugLabels,
    renderDebugPanel,
    getMeasurementLabelText,
    normalize
  } = deps;

  if (!canvas) return;

  if (showMeasurements && measurementLabels.length > 0) {
    generateMeasurementLabels();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * zoomFactor, 0, 0, dpr * zoomFactor, panOffset.x * dpr, panOffset.y * dpr);

  renderGrid(ctx, { THEME, dpr, zoomFactor, renderWidth } as any);

  renderPolygonsAndLines(ctx, model, {
    showHidden,
    THEME,
    dpr,
    zoomFactor,
    getRuntime: () => runtime,
    screenUnits,
    renderWidth,
    worldToCanvas,
    labelFontSizePx,
    getLabelAlignment,
    selectedLineIndex,
    selectedSegments,
    selectionEdges,
    selectedPolygonIndex,
    multiSelectedLines,
    selectedCircleIndex,
    selectedArcSegments,
    selectedAngleIndex,
    selectedLabel,
    multiSelectedAngles,
    polygonVerticesOrdered,
    segmentKey,
    lineExtent,
    circleRadius,
    getLineHandle,
    getLineRotateHandle,
    getCircleHandle,
    getCircleRotateHandle,
    defaultLineLabelOffset,
    defaultAngleLabelOffset,
    drawSegmentTicks,
    drawCircleTicks,
    drawArcTicks,
    drawDiagonalHandle,
    drawRotateIcon,
    drawLabelText,
    applyStrokeStyle,
    applySelectionStyle,
    isParallelLine,
    isPerpendicularLine,
    LABEL_PADDING_X,
    LABEL_PADDING_Y,
    pointRadius,
    activeAxisSnap,
    activeAxisSnaps
  } as any);

  renderCirclesAndArcs(ctx, model, {
    showHidden,
    THEME,
    dpr,
    getRuntime: () => runtime,
    renderWidth,
    screenUnits,
    circleRadius,
    circlePerimeterPoints,
    circleArcs,
    drawCircleTicks,
    drawArcTicks,
    selectedCircleIndex,
    selectedArcSegments,
    getCircleHandle,
    getCircleRotateHandle,
    drawDiagonalHandle,
    drawRotateIcon,
    selectionEdges,
    applySelectionStyle,
    applyStrokeStyle,
    zoomFactor
  } as any);

  renderAngles(ctx, model, {
    showHidden,
    THEME,
    renderWidth,
    getRuntime: () => runtime,
    applyStrokeStyle,
    applySelectionStyle,
    angleGeometry,
    getAngleLegSeg,
    defaultAngleLabelOffset,
    drawLabelText,
    labelFontSizePx,
    getLabelAlignment,
    dpr,
    RIGHT_ANGLE_MARK_MARGIN: (deps as any).RIGHT_ANGLE_MARK_MARGIN,
    RIGHT_ANGLE_MARK_MIN: (deps as any).RIGHT_ANGLE_MARK_MIN,
    RIGHT_ANGLE_MARK_MAX: (deps as any).RIGHT_ANGLE_MARK_MAX,
    RIGHT_ANGLE_MARK_RATIO: (deps as any).RIGHT_ANGLE_MARK_RATIO,
    selectedAngleIndex,
    selectedLabel,
    multiSelectedAngles,
    worldToCanvas,
    LABEL_PADDING_X,
    LABEL_PADDING_Y,
    normalize
  } as any);

  renderPoints(ctx, model, {
    showHidden,
    THEME,
    pointRadius,
    getRuntime: () => runtime,
    zoomFactor,
    defaultPointLabelOffset,
    drawLabelText,
    worldToCanvas,
    labelFontSizePx,
    getLabelAlignment,
    dpr,
    selectedPointIndex,
    mode,
    circleThreePoints,
    hoverPointIndex,
    selectedLineIndex,
    selectionVertices,
    pointInLine,
    selectedPolygonIndex,
    polygonHasPoint,
    selectedCircleIndex,
    circleHasDefiningPoint,
    applySelectionStyle,
    selectedLabel,
    multiSelectedPoints,
    LABEL_PADDING_X,
    LABEL_PADDING_Y
  } as any);

  renderFreeLabels(ctx, model, {
    showHidden,
    drawLabelText,
    worldToCanvas,
    labelFontSizePx,
    getLabelAlignment,
    dpr,
    THEME,
    LABEL_PADDING_X,
    LABEL_PADDING_Y,
    selectedLabel,
    multiSelectedLabels: (deps as any).multiSelectedLabels
  } as any);

  renderMeasurementLabels(ctx, measurementLabels, {
    showMeasurements,
    getMeasurementLabelText,
    zoomFactor,
    labelFontSizePx,
    THEME,
    screenUnits,
    dpr
  } as any);

  model.inkStrokes.forEach((stroke: any, idx: number) => {
    if (stroke.hidden && !showHidden) return;
    ctx.save();
    if (stroke.hidden && showHidden) ctx.globalAlpha = 0.4;
    renderInkStroke(stroke, ctx, renderWidth);
    if (idx === selectedInkStrokeIndex) {
      const bounds = strokeBounds(stroke);
      if (bounds) {
        const margin = screenUnits(8);
        ctx.beginPath();
        ctx.rect(
          bounds.minX - margin,
          bounds.minY - margin,
          bounds.maxX - bounds.minX + margin * 2,
          bounds.maxY - bounds.minY + margin * 2
        );
        applySelectionStyle(ctx, THEME.highlightWidth ?? 2, THEME.highlight);
      }
    }
    ctx.restore();
  });

  renderMultiselectBox(ctx, multiselectBoxStart, multiselectBoxEnd, { mode, THEME, renderWidth, zoomFactor } as any);

  renderMultiselectOverlays(ctx, model, {
    THEME,
    showHidden,
    multiSelectedPoints,
    multiSelectedLines,
    multiSelectedCircles,
    multiSelectedAngles,
    multiSelectedInkStrokes,
    zoomFactor,
    renderWidth,
    applySelectionStyle,
    applyStrokeStyle,
    circleRadius,
    strokeBounds,
    screenUnits,
    angleGeometry
  } as any);

  renderInteractionHelpers(ctx, model, {
    mode,
    hasMultiSelection,
    getMultiHandles,
    rotatingMulti,
    activeAxisSnaps,
    zoomFactor,
    THEME,
    HANDLE_SIZE: (deps as any).HANDLE_SIZE,
    HANDLE_HIT_PAD: (deps as any).HANDLE_HIT_PAD,
    hexToRgba,
    drawDiagonalHandle,
    drawRotateIcon,
    selectedLineIndex,
    getLineHandle,
    getLineRotateHandle
  } as any);

  if (showDebugLabels()) {
    drawDebugLabels();
  }
  renderDebugPanel();
}

// Used by main UI flow.
export function resizeCanvasAndRender(canvas: HTMLCanvasElement | null, dpr: number, render: () => void) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  render();
}
