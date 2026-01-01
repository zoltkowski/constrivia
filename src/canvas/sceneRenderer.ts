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
import type { ObjectId } from '../core/runtimeTypes';

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
  selectedLineId: ObjectId | null;
  selectedSegments: Set<string>;
  selectionEdges: boolean;
  selectedPolygonId: ObjectId | null;
  multiSelectedLines: Set<ObjectId>;
  selectedCircleId: ObjectId | null;
  selectedArcSegments: Set<string>;
  selectedAngleId: ObjectId | null;
  selectedLabel: any;
  multiSelectedAngles: Set<ObjectId>;
  polygonVerticesOrdered: (polyId: ObjectId) => ObjectId[];
  segmentKey: (lineId: ObjectId, kind: 'segment' | 'rayLeft' | 'rayRight', seg?: number) => string;
  lineExtent: (lineId: ObjectId) => any;
  circleRadius: (circle: any) => number;
  getLineHandle: (lineId: ObjectId) => { x: number; y: number } | null;
  getLineRotateHandle: (lineId: ObjectId) => { x: number; y: number } | null;
  getCircleHandle: (circleId: ObjectId) => { x: number; y: number } | null;
  getCircleRotateHandle: (circleId: ObjectId) => { x: number; y: number } | null;
  getPolygonHandles: (polygonId: ObjectId) => { center: { x: number; y: number }; scaleHandle: { x: number; y: number }; rotateHandle: { x: number; y: number } } | null;
  defaultLineLabelOffset: (lineId: ObjectId) => { x: number; y: number };
  defaultAngleLabelOffset: (angleId: ObjectId) => { x: number; y: number };
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
  activeAxisSnaps: Map<ObjectId, any>;
  circlePerimeterPoints: (circle: any) => ObjectId[];
  circleArcs: (circleId: ObjectId) => any[];
  angleGeometry: (ang: any) => any;
  getAngleLegSeg: (angle: any, leg: 1 | 2) => number;
  defaultPointLabelOffset: (pointId: ObjectId) => { x: number; y: number };
  mode: string;
  circleThreePoints: ObjectId[] | null;
  hoverPointId: ObjectId | null;
  selectionVertices: boolean;
  pointInLine: (pointId: ObjectId, line: any) => boolean;
  polygonHasPoint: (pointId: ObjectId, poly: any) => boolean;
  circleHasDefiningPoint: (circle: any, pointId: ObjectId) => boolean;
  selectedPointId: ObjectId | null;
  multiSelectedPoints: Set<ObjectId>;
  multiSelectedCircles: Set<ObjectId>;
  multiSelectedInkStrokes: Set<ObjectId>;
  multiselectBoxStart: { x: number; y: number } | null;
  multiselectBoxEnd: { x: number; y: number } | null;
  hasMultiSelection: () => boolean;
  getMultiHandles: () => any;
  rotatingMulti: any;
  hexToRgba: (hex: string, alpha: number) => string;
  selectedInkStrokeId: ObjectId | null;
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
  multiSelectedLabels: Set<ObjectId>;
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
    selectedLineId,
    selectedSegments,
    selectionEdges,
    selectedPolygonId,
    multiSelectedLines,
    selectedCircleId,
    selectedArcSegments,
    selectedAngleId,
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
    getPolygonHandles,
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
    hoverPointId,
    selectionVertices,
    pointInLine,
    polygonHasPoint,
    circleHasDefiningPoint,
    selectedPointId,
    multiSelectedPoints,
    multiSelectedCircles,
    multiSelectedInkStrokes,
    multiselectBoxStart,
    multiselectBoxEnd,
    hasMultiSelection,
    getMultiHandles,
    rotatingMulti,
    hexToRgba,
    selectedInkStrokeId,
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
    selectedLineId,
    selectedSegments,
    selectionEdges,
    selectedPolygonId,
    multiSelectedLines,
    selectedCircleId,
    selectedArcSegments,
    selectedAngleId,
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
    selectedCircleId,
    selectedArcSegments,
    getCircleHandle,
    getCircleRotateHandle,
    drawDiagonalHandle,
    drawRotateIcon,
    selectionEdges,
    applySelectionStyle,
    applyStrokeStyle,
    zoomFactor,
    HANDLE_SIZE: (deps as any).HANDLE_SIZE,
    HANDLE_HIT_PAD: (deps as any).HANDLE_HIT_PAD,
    hexToRgba
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
    selectedAngleId,
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
    selectedPointId,
    mode,
    circleThreePoints,
    hoverPointId,
    selectedLineId,
    selectionVertices,
    pointInLine,
    selectedPolygonId,
    polygonHasPoint,
    selectedCircleId,
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

  model.inkStrokes.forEach((stroke: any) => {
    if (stroke.hidden && !showHidden) return;
    ctx.save();
    if (stroke.hidden && showHidden) ctx.globalAlpha = 0.4;
    renderInkStroke(stroke, ctx, renderWidth);
    if (selectedInkStrokeId && String(stroke.id) === String(selectedInkStrokeId)) {
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
    selectedLineId,
    getLineHandle,
    getLineRotateHandle,
    selectedPolygonId,
    selectedSegmentsSize: selectedSegments.size,
    getPolygonHandles
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
