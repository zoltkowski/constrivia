import { hasIndependentLineDirection } from '../core/lineSubdivision';
import { spatialIntensity, spatialLineType } from './spatialAppearance';
import { parseMathLabel, type MathLabelPart } from './labelFractions';
import type { LabelTextStyleRange } from '../core/runtimeTypes';
import { labelTextStyleAt } from '../ui/labelTextStyles';
import { isFixedSpatialVertex } from '../core/spatialPointMobility';
import { paintTransformControl, TRANSFORM_ICON_SCALE as HANDLE_ICON_SCALE } from './transformControl';
// Minimal canvas renderer helpers: handle resizing and expose init helper.
// runtimeToModel removed: renderers use runtime coordinates directly when available
import { mapCircleStyle, mapPointStyle, mapStrokeStyle } from '../styleMapper';
import type { ObjectId } from '../core/runtimeTypes';
import { isGeometryAvailable } from '../core/geometryAvailability';
import { linePresentationPoints, linePresentationDirection } from './linePresentation';


// Used by main UI flow.
export function resizeCanvasElement(canvas: HTMLCanvasElement | null, dpr: number = (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)): CanvasRenderingContext2D | null {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  canvas.width = w;
  canvas.height = h;
  return canvas.getContext('2d');
}

export { renderGrid } from './grid';

// Used by polygon tools to check whether a polygon contains a line by id.
function polygonHasLineLocal(runtime: any, polyId: ObjectId | null, lineId: ObjectId): boolean {
  if (!polyId || !lineId) return false;
  const poly = polygonGetLocal(runtime, polyId);
  const line = getLineLocal(runtime, lineId);
  if (!poly || !line || !Array.isArray(line.defining_points) || line.defining_points.length < 2) return false;
  const verts = Array.isArray(poly.points) ? poly.points.map((v: any) => String(v)) : [];
  if (verts.length < 2) return false;
  const a = String(line.defining_points[0]);
  const b = String(line.defining_points[1]);
  for (let i = 0; i < verts.length; i++) {
    const v1 = String(verts[i]);
    const v2 = String(verts[(i + 1) % verts.length]);
    if ((v1 === a && v2 === b) || (v1 === b && v2 === a)) return true;
  }
  return false;
}

// Used by polygon tools to find line segments that belong to polygon edges.
function polygonEdgeSegmentsLocal(
  runtime: any,
  polyId: ObjectId | null,
  lineId: ObjectId,
  polygonVerticesOrdered: (polyId: ObjectId) => ObjectId[]
): Set<number> | null {
  if (!polyId || !lineId) return null;
  const line = getLineLocal(runtime, lineId);
  if (!line || !Array.isArray(line.points) || line.points.length < 2) return null;
  const verts = polygonVerticesOrdered(polyId).map((v) => String(v));
  if (verts.length < 2) return null;
  const linePointIds = line.points.map((pid: ObjectId) => String(pid));
  const segs = new Set<number>();
  for (let i = 0; i < verts.length; i++) {
    const v1 = verts[i];
    const v2 = verts[(i + 1) % verts.length];
    if (!v1 || !v2 || v1 === v2) continue;
    const idxA = linePointIds.indexOf(v1);
    const idxB = linePointIds.indexOf(v2);
    if (idxA === -1 || idxB === -1) continue;
    const minIdx = Math.min(idxA, idxB);
    const maxIdx = Math.max(idxA, idxB);
    for (let s = minIdx; s < maxIdx; s++) segs.add(s);
  }
  return segs.size ? segs : null;
}

// Used by polygon tools.
function polygonGetLocal(runtime: any, polyId: ObjectId | null) {
  if (!polyId) return undefined;
  return runtime.polygons?.[String(polyId)];
}

// Used by point tools.
function getPointLocal(runtime: any, id: ObjectId | undefined | null) {
  if (!id) return undefined;
  return runtime.points?.[String(id)];
}

// Used by line tools.
function getLineLocal(runtime: any, id: ObjectId | undefined | null) {
  if (!id) return undefined;
  return runtime.lines?.[String(id)];
}

// Used by UI initialization.
export function initCanvasRenderer(
  canvas: HTMLCanvasElement | null,
  onResize?: () => void
): CanvasRenderingContext2D | null {
  const ctx = resizeCanvasElement(canvas);
  if (typeof window !== 'undefined') {
    const handler = () => {
      resizeCanvasElement(canvas);
      try {
        onResize && onResize();
      } catch {}
    };
    window.addEventListener('resize', handler);
  }
  return ctx;
}

// Small canvas icon helpers (moved from main.ts). Self-contained so callers
// can draw handles/icons without depending on main.ts globals.

// Used by rendering flow.
export function drawDiagonalHandle(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const usedSize = size * HANDLE_ICON_SCALE;
  const vb = 64; // original SVG viewBox size
  const s = usedSize / vb;
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 2 * s * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // diagonal from (18,46) to (46,18) centered on (32,32)
  ctx.moveTo((18 - 32) * s, (46 - 32) * s);
  ctx.lineTo((46 - 32) * s, (18 - 32) * s);
  // lower-left arrow: M18 38 v8 h8 -> (18,38)->(18,46)->(26,46)
  ctx.moveTo((18 - 32) * s, (38 - 32) * s);
  ctx.lineTo((18 - 32) * s, (46 - 32) * s);
  ctx.lineTo((26 - 32) * s, (46 - 32) * s);
  // upper-right arrow: M46 26 v-8 h-8 -> (46,26)->(46,18)->(38,18)
  ctx.moveTo((46 - 32) * s, (26 - 32) * s);
  ctx.lineTo((46 - 32) * s, (18 - 32) * s);
  ctx.lineTo((38 - 32) * s, (18 - 32) * s);
  ctx.stroke();
  ctx.restore();
}

// Render interaction handles and rotation helpers (group handles, rotate helper, selected line handles)
export function renderInteractionHelpers(
  ctx: CanvasRenderingContext2D | null,
  runtime: any,
  deps: {
    mode: string;
    scaleLocked?: boolean;
    hasMultiSelection: () => boolean;
    getMultiHandles: () => any;
    rotatingMulti?: any;
    activeAxisSnaps?: Map<ObjectId, any>;
    zoomFactor: number;
    THEME: any;
    HANDLE_SIZE?: number;
    HANDLE_HIT_PAD?: number;
    hexToRgba?: (h: string, a: number) => string;
    drawDiagonalHandle: typeof drawDiagonalHandle;
    drawRotateIcon: typeof drawRotateIcon;
    selectedLineId?: ObjectId | null;
    getLineHandle?: (lineId: ObjectId) => { x: number; y: number } | null;
    getLineRotateHandle?: (lineId: ObjectId) => { x: number; y: number } | null;
    selectedPolygonId?: ObjectId | null;
    selectedSegmentsSize?: number;
    getPolygonHandles?: (polygonId: ObjectId) => { center: { x: number; y: number }; scaleHandle: { x: number; y: number }; rotateHandle: { x: number; y: number } } | null;
  }
) {
  if (!ctx) return;
  const {
    mode,
    hasMultiSelection,
    getMultiHandles,
    rotatingMulti,
    activeAxisSnaps,
    zoomFactor,
    THEME,
    HANDLE_SIZE,
    HANDLE_HIT_PAD,
    hexToRgba,
    drawDiagonalHandle: drawDiag,
    drawRotateIcon: drawRot,
    selectedLineId,
    getLineHandle,
    getLineRotateHandle,
    selectedPolygonId,
    selectedSegmentsSize,
    getPolygonHandles
  } = deps as any;

  // Draw group handles for multiselect (scale + rotate)
  if (mode === 'multiselect' && hasMultiSelection && hasMultiSelection()) {
    const mh = getMultiHandles && getMultiHandles();
    if (mh) {
      // scale handle (bottom-right)
      if (!deps.scaleLocked) {
      ctx.save();
      ctx.translate(mh.scaleHandle.x, mh.scaleHandle.y);
      ctx.scale(1 / zoomFactor, 1 / zoomFactor);
      const baseSquareColor = THEME.preview || '#22c55e';
      paintTransformControl(ctx, 'scale', baseSquareColor, drawDiag);
      ctx.restore();

      }
      // rotate handle (top-center)
      ctx.save();
      ctx.translate(mh.rotateHandle.x, mh.rotateHandle.y);
      ctx.scale(1 / zoomFactor, 1 / zoomFactor);
      const baseCircleColor = THEME.palette?.[3] || THEME.preview || '#f59e0b';
      paintTransformControl(ctx, 'rotate', baseCircleColor, drawRot);
      ctx.restore();
    }
  }

  // If rotating a multiselect or polygon, show a central H/V helper when per-line snaps are detected
  if (rotatingMulti && ((mode === 'multiselect' && hasMultiSelection && hasMultiSelection()) || (mode === 'move' && selectedPolygonId && isGeometryAvailable(polygonGetLocal(runtime, selectedPolygonId))))) {
    let best: { lineId: ObjectId; axis: 'horizontal' | 'vertical'; strength: number } | null = null;
    if (activeAxisSnaps) {
      for (const [k, v] of activeAxisSnaps) {
        if (!best || v.strength > best.strength) best = { lineId: k, axis: v.axis, strength: v.strength };
      }
    }
    if (best) {
      const mh = getMultiHandles && getMultiHandles();
      const polyHandles = (mode === 'move' && selectedPolygonId && getPolygonHandles)
        ? getPolygonHandles(selectedPolygonId)
        : null;
      const pos = polyHandles?.center ?? mh?.center ?? rotatingMulti.center;
      const tag = best.axis === 'horizontal' ? 'H' : 'V';
      const alpha = 0.25 + best.strength * 0.35;
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.scale(1 / zoomFactor, 1 / zoomFactor);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = THEME.preview;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = Math.min(0.9, 0.6 + best.strength * 0.4);
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${12}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tag, 0, 0);
      ctx.restore();
    }
  }

  // Draw handles for selected polygon (scale + rotate)
  if (mode === 'move' && selectedPolygonId && isGeometryAvailable(polygonGetLocal(runtime, selectedPolygonId)) && selectedSegmentsSize === 0 && getPolygonHandles) {
    const polyHandles = getPolygonHandles(selectedPolygonId);
    if (polyHandles) {
      ctx.save();
      ctx.translate(polyHandles.scaleHandle.x, polyHandles.scaleHandle.y);
      ctx.scale(1 / zoomFactor, 1 / zoomFactor);
      const baseSquareColor = THEME.preview || '#22c55e';
      paintTransformControl(ctx, 'scale', baseSquareColor, drawDiag);
      ctx.restore();

      ctx.save();
      ctx.translate(polyHandles.rotateHandle.x, polyHandles.rotateHandle.y);
      ctx.scale(1 / zoomFactor, 1 / zoomFactor);
      const baseCircleColor = THEME.palette?.[3] || THEME.preview || '#f59e0b';
      paintTransformControl(ctx, 'rotate', baseCircleColor, drawRot);
      ctx.restore();
    }
  }

  // Draw handles on top for easier touch interaction (selected line handles)
  if (selectedLineId && isGeometryAvailable(getLineLocal(runtime, selectedLineId)) && getLineHandle && getLineRotateHandle) {
    const handle = getLineHandle(selectedLineId);
    const rotateHandle = getLineRotateHandle(selectedLineId);
    if (handle) {
      ctx.save();
      ctx.translate(handle.x, handle.y);
      ctx.scale(1 / zoomFactor, 1 / zoomFactor);
      const baseSquareColor = THEME.preview || '#22c55e';
      paintTransformControl(ctx, 'scale', baseSquareColor, drawDiag);
      ctx.restore();
    }
    if (rotateHandle) {
      ctx.save();
      ctx.translate(rotateHandle.x, rotateHandle.y);
      ctx.scale(1 / zoomFactor, 1 / zoomFactor);
      const baseCircleColor = THEME.palette?.[3] || THEME.preview || '#f59e0b';
      paintTransformControl(ctx, 'rotate', baseCircleColor, drawRot);
      ctx.restore();
    }
  }
}

// Used by rendering flow.
export function drawRotateIcon(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const usedSize = size * HANDLE_ICON_SCALE;
  const vb = 24;
  const s = usedSize / vb;
  const r = 8 * s; // radius from SVG units -> canvas
  // helper to map svg coords (0..24) with center (12,12) -> canvas coords
  const tx = (x: number) => (x - 12) * s;
  const ty = (y: number) => (y - 12) * s;
  // SVG path: M19.95 11 a8 8 0 1 0 -.5 4 m.5 5 v-5 h-5
  const startPt = { x: 19.95, y: 11 };
  const arcEnd = { x: 19.95 - 0.5, y: 11 + 4 }; // (19.45,15)
  const largeArc = true;
  const sweep = 0; // sweep-flag = 0 => anticlockwise
  const anticlockwise = sweep === 0;
  // compute start/end angles relative to center (12,12)
  const sx = startPt.x - 12;
  const sy = startPt.y - 12;
  const ex = arcEnd.x - 12;
  const ey = arcEnd.y - 12;
  let startAngle = Math.atan2(sy, sx);
  let endAngle = Math.atan2(ey, ex);
  // normalize angles to [0,2pi)
  const norm = (a: number) => (a < 0 ? a + Math.PI * 2 : a);
  startAngle = norm(startAngle);
  endAngle = norm(endAngle);
  // compute angle length in chosen direction
  const angleLen = anticlockwise
    ? (startAngle - endAngle + Math.PI * 2) % (Math.PI * 2)
    : (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2);
  // if largeArc requested but angleLen is small, extend by 2pi
  if (largeArc && angleLen < Math.PI) {
    if (anticlockwise) startAngle += Math.PI * 2;
    else endAngle += Math.PI * 2;
  }

  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 2 * s * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // draw arc centered at 0,0 with radius r
  ctx.arc(0, 0, r, startAngle, endAngle, anticlockwise);
  ctx.stroke();
  // draw the little L-shaped arrow: from arc end, move (.5,5) then v-5 h-5
  const arrowBase = { x: arcEnd.x + 0.5, y: arcEnd.y + 5 }; // (19.95,20)
  const arrowVto = { x: arcEnd.x + 0.5, y: arcEnd.y }; // back to (19.95,15)
  const arrowHto = { x: arcEnd.x + 0.5 - 5, y: arcEnd.y }; // (14.95,15)
  ctx.beginPath();
  ctx.moveTo(tx(arrowBase.x), ty(arrowBase.y));
  ctx.lineTo(tx(arrowVto.x), ty(arrowVto.y));
  ctx.lineTo(tx(arrowHto.x), ty(arrowHto.y));
  ctx.stroke();
  ctx.restore();
}

// Tick drawing helpers. These are pure drawing utilities that require a
// `screenUnits` function (converts world units -> screen units, typically
// `value => value / zoomFactor`). Keeping `screenUnits` as a parameter
// avoids coupling renderer to main.ts globals.
function clamp(v: number, a: number, b: number) {
  return Math.min(Math.max(v, a), b);
}

// Used by angle tools.
function normalizeAngle(a: number) {
  while (a < 0) a += Math.PI * 2;
  while (a >= Math.PI * 2) a -= Math.PI * 2;
  return a;
}

// Used by rendering flow.
export function drawSegmentTicks(
  a: { x: number; y: number },
  b: { x: number; y: number },
  level: 0 | 1 | 2 | 3,
  context: CanvasRenderingContext2D,
  screenUnits: (v: number) => number
) {
  if (level <= 0) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= screenUnits(2)) return;
  const dir = { x: dx / length, y: dy / length };
  const perp = { x: -dir.y, y: dir.x };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const TICK_LENGTH_UNITS = 12;
  const TICK_MARGIN_UNITS = 4;
  const TICK_SPACING_UNITS = 8;
  const tickLength = screenUnits(TICK_LENGTH_UNITS);
  const edgeMargin = screenUnits(TICK_MARGIN_UNITS);
  const maxOffset = Math.max(0, length / 2 - edgeMargin);
  const rawStep = level === 1 ? 0 : screenUnits(TICK_SPACING_UNITS);
  const maxStep = (maxOffset * 2) / Math.max(1, level - 1);
  const step = level === 1 ? 0 : Math.min(rawStep, maxStep);
  context.save();
  context.setLineDash([]);
  context.lineCap = 'round';
  for (let i = 0; i < level; i++) {
    const offset = step * (i - (level - 1) / 2);
    const clampedOffset = clamp(offset, -maxOffset, maxOffset);
    const base = {
      x: mid.x + dir.x * clampedOffset,
      y: mid.y + dir.y * clampedOffset
    };
    const start = {
      x: base.x + perp.x * (tickLength / 2),
      y: base.y + perp.y * (tickLength / 2)
    };
    const end = {
      x: base.x - perp.x * (tickLength / 2),
      y: base.y - perp.y * (tickLength / 2)
    };
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }
  context.restore();
}

// Used by rendering flow.
export function drawArcTicks(
  center: { x: number; y: number },
  radius: number,
  start: number,
  end: number,
  clockwise: boolean,
  level: 0 | 1 | 2 | 3,
  context: CanvasRenderingContext2D,
  screenUnits: (v: number) => number
) {
  if (level <= 0 || radius <= 0) return;
  let span = clockwise ? (start - end + Math.PI * 2) % (Math.PI * 2) : (end - start + Math.PI * 2) % (Math.PI * 2);
  if (span < 1e-4) span = Math.PI * 2;
  const dir = clockwise ? -1 : 1;
  const mid = clockwise ? normalizeAngle(start - span / 2) : normalizeAngle(start + span / 2);
  const TICK_LENGTH_UNITS = 12;
  const TICK_MARGIN_UNITS = 4;
  const TICK_SPACING_UNITS = 8;
  const tickLength = screenUnits(TICK_LENGTH_UNITS);
  const margin = Math.min(span / 4, screenUnits(TICK_MARGIN_UNITS) / Math.max(radius, 1e-3));
  const maxAngleOffset = Math.max(0, span / 2 - margin);
  const rawStep = level === 1 ? 0 : screenUnits(TICK_SPACING_UNITS) / Math.max(radius, 1e-3);
  const maxStep = (maxAngleOffset * 2) / Math.max(1, level - 1);
  const step = level === 1 ? 0 : Math.min(rawStep, maxStep);
  context.save();
  context.setLineDash([]);
  context.lineCap = 'round';
  for (let i = 0; i < level; i++) {
    const offset = step * (i - (level - 1) / 2);
    const clampedOffset = clamp(offset, -maxAngleOffset, maxAngleOffset);
    const angle = normalizeAngle(mid + dir * clampedOffset);
    const base = {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    };
    const normal = { x: Math.cos(angle), y: Math.sin(angle) };
    const startPt = {
      x: base.x + normal.x * (tickLength / 2),
      y: base.y + normal.y * (tickLength / 2)
    };
    const endPt = {
      x: base.x - normal.x * (tickLength / 2),
      y: base.y - normal.y * (tickLength / 2)
    };
    context.beginPath();
    context.moveTo(startPt.x, startPt.y);
    context.lineTo(endPt.x, endPt.y);
    context.stroke();
  }
  context.restore();
}

// Used by circle tools.
export function drawCircleTicks(
  center: { x: number; y: number },
  radius: number,
  level: 0 | 1 | 2 | 3,
  context: CanvasRenderingContext2D,
  screenUnits: (v: number) => number
) {
  drawArcTicks(center, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, false, level, context, screenUnits);
}

// Factory that returns an `applySelectionStyle` function bound to the provided
// theme and `renderWidth` implementation. The returned function signature
// matches the original usage in the codebase: `(ctx, baseWidth, color, forPoint?)`.
export function makeApplySelectionStyle(THEME: any, renderWidth: (w: number) => number) {
  return function applySelectionStyle(ctx: CanvasRenderingContext2D, baseWidth: number, color: string, forPoint: boolean = false, intensity: number = 1) {
    ctx.save();
    const lineStyle = THEME.selectionLineStyle || 'auto';
    const effect = THEME.selectionEffect || 'color';
    const sameStyle = THEME.selectionPointStyleSameAsLine ?? false;

    // For points, check if we should use custom style or line style
    if (forPoint && !sameStyle) {
      ctx.globalAlpha = intensity;
      ctx.lineWidth = renderWidth(2);
      ctx.strokeStyle = color;
      ctx.setLineDash([6, 3]);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (effect === 'halo') {
      ctx.globalAlpha = 0.5 * intensity;
      const extraWidth = (THEME.highlightWidth || 1.5) * 4;
      ctx.lineWidth = renderWidth(baseWidth + extraWidth);
    } else {
      ctx.globalAlpha = intensity;
      ctx.lineWidth = renderWidth(baseWidth + (THEME.highlightWidth || 0));
    }

    ctx.strokeStyle = color;

    if (lineStyle === 'dashed') {
      ctx.setLineDash([4, 4]);
    } else if (lineStyle === 'dotted') {
      const dotSize = ctx.lineWidth;
      ctx.setLineDash([0, dotSize * 2]);
      ctx.lineCap = 'round';
    } else if (forPoint) {
      ctx.setLineDash([6, 3]);
    }

    ctx.stroke();

    if (lineStyle === 'dotted') ctx.lineCap = 'butt';
    ctx.restore();
  };
}

// Render polygons and lines (polygons behind lines). This extracts the
// large canvas-only blocks from main.ts. All external values are passed
// via the `deps` object to keep this pure and testable.
export function renderPolygonsAndLines(
  ctx: CanvasRenderingContext2D | null,
  runtime: any,
  deps: {
    mode?: string;
    rotatingMulti?: any;
    hasMultiSelection: () => boolean;
    showHidden: boolean;
    THEME: any;
    dpr: number;
    zoomFactor: number;
    screenUnits: (v: number) => number;
    renderWidth: (w: number) => number;
    worldToCanvas: (x: number, y: number) => { x: number; y: number };
    labelFontSizePx: (delta?: number, base?: number) => number;
    getLabelAlignment: (label?: any) => any;
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
    segmentKey: (lineId: ObjectId, kind: 'segment' | 'rayLeft' | 'rayRight', i?: number) => string;
    lineExtent: (lineId: ObjectId) => { center: { x: number; y: number } } | null;
    circleRadius: (c: any) => number;
    getLineHandle: (lineId: ObjectId) => { x: number; y: number } | null;
    getLineRotateHandle: (lineId: ObjectId) => { x: number; y: number } | null;
    getCircleHandle: (circleId: ObjectId) => { x: number; y: number } | null;
    getCircleRotateHandle: (circleId: ObjectId) => { x: number; y: number } | null;
    defaultLineLabelOffset: (lineId: ObjectId) => { x: number; y: number };
    defaultAngleLabelOffset: (angleId: ObjectId) => { x: number; y: number };
    drawSegmentTicks: typeof drawSegmentTicks;
    drawCircleTicks: typeof drawCircleTicks;
    drawArcTicks: typeof drawArcTicks;
    drawDiagonalHandle: typeof drawDiagonalHandle;
    drawRotateIcon: typeof drawRotateIcon;
    drawLabelText: typeof drawLabelText;
    applyStrokeStyle: (type: any) => void;
    applySelectionStyle: (ctx: CanvasRenderingContext2D, width: number, color: string, forPoint?: boolean, intensity?: number) => void;
    isParallelLine: (line: any) => boolean;
    isPerpendicularLine: (line: any) => boolean;
    LABEL_PADDING_X: number;
    LABEL_PADDING_Y: number;
    pointRadius?: (size: number) => number;
    activeAxisSnap?: any;
    activeAxisSnaps?: Map<ObjectId, any>;
  }
) {
  if (!ctx) return;
    const {
      mode,
      rotatingMulti,
      hasMultiSelection,
      showHidden,
      THEME,
      dpr,
    zoomFactor,
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
    drawSegmentTicks: drawSegTicks,
    drawCircleTicks: drawCrcTicks,
    drawArcTicks: drawArcTicks,
    drawDiagonalHandle: drawDiagHandle,
    drawRotateIcon: drawRotIcon,
    drawLabelText: drawLblText,
    applyStrokeStyle: applyStroke,
    applySelectionStyle: applySelection,
    isParallelLine,
    isPerpendicularLine,
    LABEL_PADDING_X,
    LABEL_PADDING_Y,
    pointRadius,
    activeAxisSnap,
      activeAxisSnaps
    } = deps;

    // draw polygon fills (behind edges)
    const polygons:any[]=Object.values(runtime.polygons??{});
    const depth=(poly:any)=>poly.points.reduce((sum:number,id:string)=>sum+(runtime.points[id]?.spatialDepth??0),0)/Math.max(1,poly.points.length);
    const facePolygons=polygons.filter(p=>p.solidFace).sort((a,b)=>depth(a)-depth(b));
    [...facePolygons,...polygons.filter(p=>!p.solidFace)].forEach((poly: any) => {
      if(poly.solidBackFace || (poly.hidden&&!showHidden) || (poly.solidFace&&runtime.solids?.[poly.solidFace.solidId]?.hidden))return;
      if (!isGeometryAvailable(poly) || !poly.fill) return;
      const verts = polygonVerticesOrdered(poly.id);
      if (verts.length < 3) return;
      const points = verts.map((id) => getPointLocal(runtime, id));
      if (points.some((point) => !point || !isGeometryAvailable(point))) return;
      const first = points[0];
      ctx.save();
      const baseAlpha = poly.fillOpacity !== undefined ? poly.fillOpacity : 1;
      const outerAlpha = poly.hidden && showHidden ? 0.4 : 1;
      ctx.globalAlpha = outerAlpha * baseAlpha;
      ctx.fillStyle = poly.fill;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < verts.length; i++) {
        const p = points[i]!;
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

  // draw lines
  Object.values(runtime.lines ?? {}).forEach((lRt: any) => {
      const line = getLineLocal(runtime, lRt.id);
      if (!line || !isGeometryAvailable(line) || (line.hidden && !showHidden) || spatialIntensity(line,THEME)===0) return;
      const lineId = String(line.id);
      const pts = linePresentationPoints(line, runtime);
      if (!pts || !pts.length) return;
      const polygonSegments = selectedPolygonId !== null && isGeometryAvailable(polygonGetLocal(runtime, selectedPolygonId))
        ? polygonEdgeSegmentsLocal(runtime, selectedPolygonId, lineId, polygonVerticesOrdered)
        : null;
      const lineSelected = selectedLineId === lineId;
      const highlightColor = isParallelLine(line) || isPerpendicularLine(line) ? '#9ca3af' : THEME.highlight;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (!a || !b || !isGeometryAvailable(a) || !isGeometryAvailable(b)) continue;
        const rawStyle = line.segmentStyles?.[i] ?? line.style;
        const style = mapStrokeStyle(rawStyle, { color: THEME.defaultStroke, width: THEME.lineWidth, type: 'solid' });
        style.type = spatialLineType(line,style.type,THEME);
        if (style.hidden && !showHidden) continue;
        const segKey = segmentKey(lineId, 'segment', i);
        const isSegmentSelected = selectedSegments.size > 0 && selectedSegments.has(segKey);
        const isPolygonSegment = !!polygonSegments && polygonSegments.has(i);
        const shouldHighlight =
          selectionEdges &&
          ((selectedSegments.size > 0 && isSegmentSelected) ||
            (selectedSegments.size === 0 && (lineSelected || isPolygonSegment)));
        const segHidden = !!style.hidden || line.hidden;
        ctx.save();
        ctx.globalAlpha = (segHidden && showHidden ? 0.4 : 1) * spatialIntensity(line,THEME);
        ctx.strokeStyle = style.color;
        ctx.lineWidth = renderWidth(style.width);
        applyStroke(style.type);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (style.tick) drawSegTicks({ x: a.x, y: a.y }, { x: b.x, y: b.y }, style.tick, ctx, screenUnits);
        if (shouldHighlight) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          applySelection(ctx, style.width, highlightColor, false, spatialIntensity(line,THEME));
        }
        ctx.restore();
      }
      // draw rays
      const first = pts[0];
      const last = pts[pts.length - 1];
      if (!first || !last || !isGeometryAvailable(first) || !isGeometryAvailable(last)) return;
      const dx = last.x - first.x;
      const dy = last.y - first.y;
      const len = Math.hypot(dx, dy) || 1;
      const dir = hasIndependentLineDirection(line) ? linePresentationDirection(line, runtime) : { x: dx / len, y: dy / len };
      if (!dir) return;
      const extend = (ctx.canvas.width + ctx.canvas.height) / dpr;
      if (line.leftRay && !(line.leftRay.hidden && !showHidden)) {
        const rayStyle = mapStrokeStyle(line.leftRay, { color: THEME.defaultStroke, width: THEME.lineWidth, type: 'solid' });
        ctx.strokeStyle = rayStyle.color;
        ctx.lineWidth = renderWidth(rayStyle.width);
        const hiddenRay = !!rayStyle.hidden || line.hidden;
        ctx.save();
        ctx.globalAlpha = (hiddenRay && showHidden ? 0.4 : 1)*spatialIntensity(line,THEME);
        applyStroke(spatialLineType(line,rayStyle.type,THEME));
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        ctx.lineTo(first.x - dir.x * extend, first.y - dir.y * extend);
        ctx.stroke();
        if (lineSelected && selectionEdges && (selectedSegments.size === 0 || selectedSegments.has(segmentKey(lineId, 'rayLeft')))) {
          ctx.beginPath();
          ctx.moveTo(first.x, first.y);
          ctx.lineTo(first.x - dir.x * extend, first.y - dir.y * extend);
          applySelection(ctx, rayStyle.width, highlightColor, false, spatialIntensity(line,THEME));
        }
        ctx.restore();
      }
      if (line.rightRay && !(line.rightRay.hidden && !showHidden)) {
        const rayStyle = mapStrokeStyle(line.rightRay, { color: THEME.defaultStroke, width: THEME.lineWidth, type: 'solid' });
        ctx.strokeStyle = rayStyle.color;
        ctx.lineWidth = renderWidth(rayStyle.width);
        const hiddenRay = !!rayStyle.hidden || line.hidden;
        ctx.save();
        ctx.globalAlpha = (hiddenRay && showHidden ? 0.4 : 1)*spatialIntensity(line,THEME);
        applyStroke(spatialLineType(line,rayStyle.type,THEME));
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(last.x + dir.x * extend, last.y + dir.y * extend);
        ctx.stroke();
        if (lineSelected && selectionEdges && (selectedSegments.size === 0 || selectedSegments.has(segmentKey(lineId, 'rayRight')))) {
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(last.x + dir.x * extend, last.y + dir.y * extend);
          applySelection(ctx, rayStyle.width, highlightColor, false, spatialIntensity(line,THEME));
        }
        ctx.restore();
      }
      // labels
      if (line.label && !line.label.hidden) {
        const ext = lineExtent(lineId);
        if (ext) {
          if (!line.label.offset) line.label.offset = defaultLineLabelOffset(lineId);
          const off = line.label.offset ?? { x: 0, y: -10 };
          const selected = (selectedLabel?.kind === 'line' && selectedLabel.id === lineId) || multiSelectedLines.has(lineId);
          ctx.save();ctx.globalAlpha*=spatialIntensity(line,THEME);
          drawLblText(
            ctx,
            { text: line.label.text, color: line.label.color ?? THEME.defaultStroke, fontSize: line.label.fontSize, textAlign: line.label.textAlign, textStyles: line.label.textStyles },
            ext.center,
            selected,
            off,
            worldToCanvas,
            labelFontSizePx,
            getLabelAlignment,
            dpr,
            THEME.highlight,
            LABEL_PADDING_X,
            LABEL_PADDING_Y
          );
          ctx.restore();
        }
      }
      const suppressLineAxisHints =
        rotatingMulti &&
        ((mode === 'multiselect' && hasMultiSelection()) ||
          (mode === 'move' && !!selectedPolygonId));
      if (!suppressLineAxisHints) {
        const snap = (activeAxisSnap && activeAxisSnap.lineId === lineId)
          ? activeAxisSnap
          : (activeAxisSnaps && activeAxisSnaps.get(lineId)
            ? { lineId, axis: activeAxisSnaps.get(lineId)!.axis, strength: activeAxisSnaps.get(lineId)!.strength }
            : null);
        if (snap) {
          const extent = lineExtent(lineId);
          if (extent) {
            const strength = Math.max(0, Math.min(1, snap.strength));
            const indicatorRadius = 11;
            const gap = 4;
            const offsetAmount = screenUnits(indicatorRadius * 2 + gap);
            const offset = snap.axis === 'horizontal' ? { x: 0, y: -offsetAmount } : { x: -offsetAmount, y: 0 };
            const pos = { x: extent.center.x + offset.x, y: extent.center.y + offset.y };
            ctx.save();
            ctx.translate(pos.x, pos.y);
            ctx.scale(1 / zoomFactor, 1 / zoomFactor);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.globalAlpha = 0.25 + strength * 0.35;
            ctx.fillStyle = THEME.preview;
            ctx.beginPath();
            ctx.arc(0, 0, indicatorRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = Math.min(0.6 + strength * 0.4, 0.95);
            ctx.strokeStyle = THEME.preview;
            ctx.lineWidth = renderWidth(1.4);
            ctx.beginPath();
            ctx.arc(0, 0, indicatorRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.font = `${11}px sans-serif`;
            ctx.fillStyle = '#0f172a';
            const tag = snap.axis === 'horizontal' ? 'H' : 'V';
            ctx.fillText(tag, 0, 0);
            ctx.restore();
          }
        }
      }
    });
}

// Render circles and arcs (including handles, ticks and selection highlights).
export function renderCirclesAndArcs(
  ctx: CanvasRenderingContext2D | null,
  runtime: any,
  deps: {
    showHidden: boolean;
    THEME: any;
    dpr: number;
    renderWidth: (w: number) => number;
    screenUnits: (v: number) => number;
    circleRadius: (c: any) => number;
    circlePerimeterPoints: (c: any) => any[];
    circleArcs: (circleId: ObjectId) => any[];
    drawCircleTicks: typeof drawCircleTicks;
    drawArcTicks: typeof drawArcTicks;
    selectedCircleId: ObjectId | null;
    selectedArcSegments: Set<string>;
    getCircleHandle: (circleId: ObjectId) => { x: number; y: number } | null;
    getCircleRotateHandle: (circleId: ObjectId) => { x: number; y: number } | null;
    drawDiagonalHandle: typeof drawDiagonalHandle;
    drawRotateIcon: typeof drawRotateIcon;
    zoomFactor?: number;
    selectionEdges: boolean;
    applySelectionStyle: (ctx: CanvasRenderingContext2D, width: number, color: string, forPoint?: boolean, intensity?: number) => void;
    applyStrokeStyle?: (type: any) => void;
    THEMEpalette?: any;
    THEMEpreview?: any;
    HANDLE_SIZE?: number;
    HANDLE_HIT_PAD?: number;
    hexToRgba?: (h: string, a: number) => string;
  }
) {
  if (!ctx) return;
  const {
    showHidden,
    THEME,
    dpr,
    renderWidth,
    circleRadius,
    circlePerimeterPoints,
    circleArcs,
    drawCircleTicks: drawCrcTicks,
    drawArcTicks: drawArcTicks,
    selectedCircleId,
    selectedArcSegments,
    getCircleHandle,
    getCircleRotateHandle,
    drawDiagonalHandle: drawDiagHandle,
    drawRotateIcon: drawRotIcon,
    zoomFactor,
    selectionEdges,
    applySelectionStyle: applySelection,
    HANDLE_SIZE,
    HANDLE_HIT_PAD,
    hexToRgba
  } = deps as any;

  // draw circles
  Object.values(runtime.circles ?? {}).forEach((circle: any) => {
    if (!isGeometryAvailable(circle) || (circle.hidden && !showHidden)) return;
    const circleId = String(circle.id);
    const center = getPointLocal(runtime, circle.center);
    if (!center || !isGeometryAvailable(center)) return;
    const radius = circleRadius(circle);
    if (radius <= 1e-3) return;
    const style = mapCircleStyle(circle, { color: THEME.defaultStroke, width: THEME.lineWidth, type: 'solid' });
    const selected = selectedCircleId === circleId && selectionEdges;
    ctx.save();
    ctx.globalAlpha = circle.hidden && showHidden ? 0.4 : 1;
    if (circle.fill) {
      const baseAlpha = circle.fillOpacity !== undefined ? circle.fillOpacity : 1;
      ctx.save();
      ctx.globalAlpha = (circle.hidden && showHidden ? 0.4 : 1) * baseAlpha;
      ctx.fillStyle = circle.fill;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // If the circle has explicit perimeter points (arcs with possibly different styles),
    // don't draw a full-ring stroke here — arcs will be drawn individually below.
    const perimeterPts = circlePerimeterPoints(circle);
    if (perimeterPts.length < 2) {
      ctx.strokeStyle = style.color;
      ctx.lineWidth = renderWidth(style.width);
      (deps as any).applyStrokeStyle?.(style.type);
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      if (style.tick) drawCrcTicks(center, radius, style.tick, ctx, deps.screenUnits);
      if (selected) {
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        applySelection(ctx, style.width, THEME.highlight);
      }
    }
    // draw handles for selected circle (scale square and rotate circle)
    if (selected && selectedCircleId === circleId) {
      const ch = getCircleHandle(circleId);
      if (ch) {
        ctx.save();
        ctx.translate(ch.x, ch.y);
        ctx.scale(1 / (zoomFactor ?? 1), 1 / (zoomFactor ?? 1));
        const baseSquareColor = THEME.preview || '#22c55e';
        paintTransformControl(ctx, 'scale', baseSquareColor, drawDiagHandle);
        ctx.restore();
      }
      const crh = getCircleRotateHandle(circleId);
      if (crh) {
        ctx.save();
        ctx.translate(crh.x, crh.y);
        ctx.scale(1 / (zoomFactor ?? 1), 1 / (zoomFactor ?? 1));
        const baseCircleColor = THEME.palette?.[3] || THEME.preview || '#f59e0b';
        paintTransformControl(ctx, 'rotate', baseCircleColor, drawRotIcon);
        ctx.restore();
      }
    }
    ctx.restore();
  });

  // draw arcs derived from circle points
  Object.values(runtime.circles ?? {}).forEach((circle: any) => {
    if (!isGeometryAvailable(circle) || (circle.hidden && !showHidden)) return;
    const circleStyle = mapCircleStyle(circle, { color: THEME.defaultStroke, width: THEME.lineWidth, type: 'solid' });
    const circleId = String(circle.id);
    const arcs = circleArcs(circleId);
    arcs.forEach((arc: any) => {
      if (arc.hidden && !showHidden) return;
      const center = arc.center;
      const style = mapStrokeStyle(arc.style ?? circle.style, { color: THEME.defaultStroke, width: THEME.lineWidth, type: 'solid' }, 'circle');
      ctx.save();
      ctx.strokeStyle = style.color;
      ctx.lineWidth = renderWidth(style.width);
      (deps as any).applyStrokeStyle?.(style.type);
      ctx.beginPath();
      ctx.arc(center.x, center.y, arc.radius, arc.start, arc.end, arc.clockwise);
      ctx.stroke();
      const baseTick = (circleStyle.tick ?? 0) as any;
      const arcTick = (style.tick ?? baseTick) as any;
      if (arcTick) drawArcTicks(center, arc.radius, arc.start, arc.end, arc.clockwise, arcTick, ctx, deps.screenUnits);
      const key = arc.key;
      const isSelected =
        selectedCircleId === circleId && (selectedArcSegments.size === 0 || selectedArcSegments.has(key));
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(center.x, center.y, arc.radius, arc.start, arc.end, arc.clockwise);
        applySelection(ctx, style.width, THEME.highlight);
      }
      ctx.restore();
    });
  });
}

// Render angles (arcs, right-angle marks, labels and selection highlights)
export function renderAngles(
  ctx: CanvasRenderingContext2D | null,
  runtime: any,
  deps: {
    showHidden: boolean;
    THEME: any;
    renderWidth: (w: number) => number;
    applyStrokeStyle: (t: any) => void;
    applySelectionStyle: (ctx: CanvasRenderingContext2D, width: number, color: string, forPoint?: boolean, intensity?: number) => void;
    angleGeometry: (ang: any) => any;
    getAngleLegSeg: (angle: any, leg: 1 | 2) => number;
    defaultAngleLabelOffset: (angleId: ObjectId) => { x: number; y: number };
    drawLabelText: typeof drawLabelText;
    labelFontSizePx: (d?: number, b?: number) => number;
    getLabelAlignment: (label?: any) => any;
    dpr: number;
    RIGHT_ANGLE_MARK_MARGIN: number;
    RIGHT_ANGLE_MARK_MIN: number;
    RIGHT_ANGLE_MARK_MAX: number;
    RIGHT_ANGLE_MARK_RATIO: number;
    selectedAngleId: ObjectId | null;
    selectedLabel: any;
    multiSelectedAngles: Set<ObjectId>;
  }
) {
  if (!ctx) return;
  const {
    showHidden,
    THEME,
    renderWidth,
    applyStrokeStyle,
    applySelectionStyle,
    angleGeometry,
    getAngleLegSeg,
    defaultAngleLabelOffset,
    drawLabelText,
    labelFontSizePx,
    getLabelAlignment,
    dpr,
    RIGHT_ANGLE_MARK_MARGIN,
    RIGHT_ANGLE_MARK_MIN,
    RIGHT_ANGLE_MARK_MAX,
    RIGHT_ANGLE_MARK_RATIO,
    selectedAngleId,
    selectedLabel,
    multiSelectedAngles
  } = deps as any;

  Object.values(runtime.angles ?? {}).forEach((ang: any) => {
    if (!isGeometryAvailable(ang) || (ang.hidden && !showHidden)) return;
    const angleId = String(ang.id);
    try {
      // diagnostic logging: help detect why angles may be skipped
    } catch (e) {
      /* ignore */
    }
    const geom = angleGeometry(ang);
    if (!geom) return;
    const { v, p1: effectiveP1, p2: effectiveP2 } = geom;
    const { start, end, clockwise, radius: r, style } = geom;
    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = renderWidth(style.width);
    applyStrokeStyle(style.type);
    if(geom.spatialArc){
      const arcs=style.right?[geom.spatialRightMark]:geom.spatialArcs;
      for(const path of arcs){
        ctx.beginPath();path.forEach((p:any,i:number)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
        if(style.fill||style.arcCount===4){ctx.lineTo(v.x,v.y);ctx.closePath();ctx.fillStyle=style.fill??style.color;ctx.fill();}
        ctx.stroke();
        if(selectedAngleId===angleId)applySelectionStyle(ctx,style.width,THEME.highlight);
      }
      if(ang.label&&!ang.label.hidden)drawLabelText(ctx,{text:ang.label.text,color:ang.label.color??THEME.defaultStroke,fontSize:ang.label.fontSize,textAlign:ang.label.textAlign,textStyles:ang.label.textStyles},v,selectedLabel?.kind==='angle'&&selectedLabel.id===angleId,ang.label.offset??defaultAngleLabelOffset(angleId),(deps as any).worldToCanvas,labelFontSizePx,getLabelAlignment,dpr,THEME.highlight,(deps as any).LABEL_PADDING_X,(deps as any).LABEL_PADDING_Y);
      ctx.restore();return;
    }
    if (style.fill) {
      ctx.beginPath();
      ctx.moveTo(v.x, v.y);
      ctx.arc(v.x, v.y, r, start, end, clockwise);
      ctx.closePath();
      ctx.fillStyle = style.fill;
      ctx.fill();
    }
    const isRight = !!style.right;
    const arcCount = Math.max(1, style.arcCount ?? 1);
    const isFilled = arcCount === 4;
    const drawArcs = () => {
      if (isFilled) {
        ctx.beginPath();
        ctx.moveTo(v.x, v.y);
        ctx.arc(v.x, v.y, r, start, end, clockwise);
        ctx.closePath();
        ctx.fillStyle = style.color;
        ctx.fill();
      } else {
        for (let i = 0; i < arcCount; i++) {
          const rr = Math.max(2, r - i * 6);
          ctx.beginPath();
          ctx.arc(v.x, v.y, rr, start, end, clockwise);
          ctx.stroke();
        }
      }
    };
    const drawRightMark = () => {
      const p1 = effectiveP1;
      const p2 = effectiveP2;
      const legLen1 = ang.arm1?.kind === "line" ? Infinity : Math.hypot(p1.x - v.x, p1.y - v.y);
      const legLen2 = ang.arm2?.kind === "line" ? Infinity : Math.hypot(p2.x - v.x, p2.y - v.y);
      const usable = Math.max(0, Math.min(legLen1, legLen2) - RIGHT_ANGLE_MARK_MARGIN);
      if (usable <= 0) return;
      const u1 = ((deps as any).normalize)({ x: p1.x - v.x, y: p1.y - v.y });
      const u2 = ((deps as any).normalize)({ x: p2.x - v.x, y: p2.y - v.y });
      let size: number;
      if (usable < RIGHT_ANGLE_MARK_MIN) {
        size = usable;
      } else {
        const growth = Math.max(0, r - RIGHT_ANGLE_MARK_MIN) * RIGHT_ANGLE_MARK_RATIO;
        size = RIGHT_ANGLE_MARK_MIN + growth;
        size = Math.min(size, RIGHT_ANGLE_MARK_MAX, usable);
      }
      const pA = { x: v.x + u1.x * size, y: v.y + u1.y * size };
      const pC = { x: v.x + u2.x * size, y: v.y + u2.y * size };
      const pB = { x: pA.x + u2.x * size, y: pA.y + u2.y * size };
      ctx.beginPath();
      ctx.moveTo(v.x, v.y);
      ctx.lineTo(pA.x, pA.y);
      ctx.lineTo(pB.x, pB.y);
      ctx.lineTo(pC.x, pC.y);
      ctx.stroke();
    };
    if (isRight) {
      drawRightMark();
    } else {
      drawArcs();
    }
    const selected = selectedAngleId === angleId;
    if (selected) {
      applySelectionStyle(ctx, style.width, THEME.highlight);
    }
    if (ang.label && !ang.label.hidden) {
      if (!ang.label.offset) ang.label.offset = defaultAngleLabelOffset(angleId);
      const off = ang.label.offset ?? { x: 0, y: 0 };
      const selectedLbl = (selectedLabel?.kind === 'angle' && selectedLabel.id === angleId) || multiSelectedAngles.has(angleId);
      drawLabelText(
        ctx,
        { text: ang.label.text, color: ang.label.color ?? THEME.defaultStroke, fontSize: ang.label.fontSize, textAlign: ang.label.textAlign, textStyles: ang.label.textStyles },
        v,
        selectedLbl,
        off,
        (deps as any).worldToCanvas,
        labelFontSizePx,
        getLabelAlignment,
        dpr,
        THEME.highlight,
        (deps as any).LABEL_PADDING_X,
        (deps as any).LABEL_PADDING_Y
      );
    }
    ctx.restore();
  });
}

// Render points (markers, hollow/filled, labels and selection highlights)
export function renderPoints(
  ctx: CanvasRenderingContext2D | null,
  runtime: any,
  deps: {
    showHidden: boolean;
    THEME: any;
    pointRadius: (size: number) => number;
    zoomFactor: number;
    defaultPointLabelOffset: (pointId: ObjectId) => { x: number; y: number };
    drawLabelText: typeof drawLabelText;
    worldToCanvas: (x: number, y: number) => { x: number; y: number };
    labelFontSizePx: (d?: number, b?: number) => number;
    getLabelAlignment: (label?: any) => any;
    dpr: number;
    selectedPointId: ObjectId | null;
    mode?: string;
    constructionPointIds?: ObjectId[];
    hoverPointId?: ObjectId | null;
    selectedLineId?: ObjectId | null;
    selectionVertices?: boolean;
    pointInLine?: (pointId: ObjectId, line: any) => boolean;
    selectedPolygonId?: ObjectId | null;
    polygonHasPoint?: (pointId: ObjectId, poly: any) => boolean;
    selectedCircleId?: ObjectId | null;
    circleHasDefiningPoint?: (c: any, pointId: ObjectId) => boolean;
    applySelectionStyle: (ctx: CanvasRenderingContext2D, width: number, color: string, forPoint?: boolean, intensity?: number) => void;
  }
) {
  if (!ctx) return;
  const {
    showHidden,
    THEME,
    pointRadius,
    zoomFactor,
    defaultPointLabelOffset,
    drawLabelText,
    worldToCanvas,
    labelFontSizePx,
    getLabelAlignment,
    dpr,
    selectedPointId,
    mode,
    constructionPointIds,
    hoverPointId,
    selectedLineId,
    selectionVertices,
    pointInLine,
    selectedPolygonId,
    polygonHasPoint,
    selectedCircleId,
    circleHasDefiningPoint,
    applySelectionStyle
  } = deps as any;

  const computedCenterIds = new Set<string>();
    Object.values(runtime.circles ?? {}).forEach((circle: any) => {
      if (!circle || circle.circle_kind !== 'three-point') return;
      if (circle.center !== undefined && circle.center !== null) {
        computedCenterIds.add(String(circle.center));
      }
    });

    Object.values(runtime.points ?? {}).forEach((p: any) => {
    if (!isGeometryAvailable(p) || p.auxiliaryFor || spatialIntensity(p,THEME)===0) return;
    const pointId = String(p.id);
    const pStyle = mapPointStyle(p, { color: THEME.defaultStroke, size: THEME.pointSize });
    if (pStyle.hidden && !showHidden) return;
    const pointHidden = !!pStyle.hidden;
    ctx.save();
    ctx.globalAlpha = (pointHidden && showHidden ? 0.4 : 1) * spatialIntensity(p,THEME);
    const r = pointRadius(pStyle.size);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1 / zoomFactor, 1 / zoomFactor);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    if (pStyle.hollow) {
      ctx.strokeStyle = pStyle.color;
      const outlineWidth = Math.max(1, r * 0.45);
      ctx.lineWidth = outlineWidth;
      ctx.stroke();
      const innerRadius = Math.max(r - outlineWidth * 0.55, 0);
      ctx.beginPath();
      ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
      ctx.fillStyle = THEME.bg;
      ctx.fill();
    } else {
      ctx.fillStyle = pStyle.color;
      ctx.fill();
    }
    ctx.restore();
    if (p.label && !p.label.hidden) {
      if (!p.label.offset) p.label.offset = defaultPointLabelOffset(pointId);
      const off = p.label.offset ?? { x: 8, y: -8 };
      const selected = ((deps as any).selectedLabel?.kind === 'point' && (deps as any).selectedLabel.id === pointId)
        || (deps as any).multiSelectedPoints?.has(pointId);
      drawLabelText(
        ctx,
        { text: p.label.text, color: p.label.color ?? THEME.defaultStroke, fontSize: p.label.fontSize, textAlign: p.label.textAlign, textStyles: p.label.textStyles },
        { x: p.x, y: p.y },
        selected,
        off,
        worldToCanvas,
        labelFontSizePx,
        getLabelAlignment,
        dpr,
        THEME.highlight,
        (deps as any).LABEL_PADDING_X,
        (deps as any).LABEL_PADDING_Y
      );
    }
    const highlightPoint =
      pointId === selectedPointId || (constructionPointIds || []).includes(pointId);
    const hoverPoint = hoverPointId === pointId;
    const isComputedCenter = computedCenterIds.has(pointId);
    const highlightColor =
      isFixedSpatialVertex(runtime,pointId) || isComputedCenter ||
      p.construction_kind === 'intersection' ||
      p.construction_kind === 'midpoint' ||
      p.construction_kind === 'symmetric'
        ? '#9ca3af'
        : p.construction_kind === 'on_object'
        ? '#ef4444'
        : THEME.highlight;
    if (
      (highlightPoint ||
        hoverPoint ||
        (selectedLineId !== null && selectionVertices && pointInLine && (() => {
          const selLine = getLineLocal(runtime, selectedLineId);
          return selLine ? pointInLine(pointId, selLine) : false;
        })()) ||
        (selectedPolygonId !== null && selectionVertices && polygonHasPoint && (() => {
          const selPoly = polygonGetLocal(runtime, selectedPolygonId);
          return selPoly ? polygonHasPoint(pointId, selPoly) : false;
        })()) ||
        (selectedCircleId !== null && selectionVertices && (() => {
          const selCircle = selectedCircleId ? runtime.circles?.[String(selectedCircleId)] : null;
          return !!selCircle && (
            (circleHasDefiningPoint && circleHasDefiningPoint(selCircle, pointId)) ||
            (selCircle.circle_kind === 'center-radius' &&
              (String(selCircle.center) === pointId || String(selCircle.radius_point) === pointId))
          );
        })())) &&
      (!pStyle.hidden || showHidden)
    ) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(1 / zoomFactor, 1 / zoomFactor);
      ctx.beginPath();
      ctx.arc(0, 0, THEME.selectionPointRadius, 0, Math.PI * 2);
      applySelectionStyle(ctx, 2, highlightColor, true, spatialIntensity(p,THEME));
      ctx.restore();
    }
    ctx.restore();
  });
}

// Render free labels (runtime.labels)
export function renderFreeLabels(
  ctx: CanvasRenderingContext2D | null,
  runtime: any,
  deps: {
    showHidden: boolean;
    drawLabelText: typeof drawLabelText;
    worldToCanvas: (x: number, y: number) => { x: number; y: number };
    labelFontSizePx: (d?: number, b?: number) => number;
    getLabelAlignment: (label?: any) => any;
    dpr: number;
    THEME: any;
    LABEL_PADDING_X: number;
    LABEL_PADDING_Y: number;
    selectedLabel?: any;
    multiSelectedLabels?: Set<ObjectId>;
  }
) {
  if (!ctx) return;
  const { showHidden, drawLabelText, worldToCanvas, labelFontSizePx, getLabelAlignment, dpr, THEME, LABEL_PADDING_X, LABEL_PADDING_Y, selectedLabel, multiSelectedLabels } = deps as any;
  Object.values(runtime.labels ?? {}).forEach((lab: any) => {
    if (lab.hidden && !showHidden) return;
    const labelId = String(lab.id);
    const selected = (selectedLabel?.kind === 'free' && selectedLabel.id === labelId) || (multiSelectedLabels?.has(labelId));
    drawLabelText(ctx, { text: lab.text, color: lab.color, fontSize: lab.fontSize, textAlign: lab.textAlign, textStyles: lab.textStyles }, lab.pos, selected, undefined, worldToCanvas, labelFontSizePx, getLabelAlignment, dpr, THEME.highlight, LABEL_PADDING_X, LABEL_PADDING_Y);
  });
}

// Render measurement labels (background + text) when showMeasurements is active
export function renderMeasurementLabels(
  ctx: CanvasRenderingContext2D | null,
  labels: any[],
  deps: {
    showMeasurements: boolean;
    runtime?: any;
    getMeasurementLabelText: (label: any) => string;
    zoomFactor: number;
    labelFontSizePx: (d?: number, b?: number) => number;
    worldToCanvas?: (x: number, y: number) => { x: number; y: number };
    THEME: any;
    screenUnits: (v: number) => number;
    dpr: number;
  }
) {
  if (!ctx) return;
  const { showMeasurements, runtime, getMeasurementLabelText, zoomFactor, labelFontSizePx, THEME, dpr } = deps as any;
  if (!showMeasurements) return;
  labels.forEach((label: any) => {
    if (runtime) {
      if (label.kind === 'segment') {
        const match = /-seg(\d+)$/.exec(String(label.targetId));
        if (!match) return;
        const lineId = String(label.targetId).slice(0, match.index);
        const line = runtime.lines?.[lineId];
        const segmentIndex = Number(match[1]);
        const a = line && runtime.points?.[String(line.points?.[segmentIndex])];
        const b = line && runtime.points?.[String(line.points?.[segmentIndex + 1])];
        if (!line || !isGeometryAvailable(line) || !a || !b || !isGeometryAvailable(a) || !isGeometryAvailable(b)) return;
      } else if (label.kind === 'angle') {
        const angle = runtime.angles?.[String(label.targetId)];
        const vertex = angle && runtime.points?.[String(angle.vertex)];
        if (!angle || !isGeometryAvailable(angle) || !vertex || !isGeometryAvailable(vertex)) return;
      }
    }
    const text = getMeasurementLabelText(label);
    ctx.save();
    ctx.translate(label.pos.x, label.pos.y);
    ctx.scale(1 / zoomFactor, 1 / zoomFactor);
    const fontSize = labelFontSizePx(label.fontSize);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const displayText = text || '—';
    const metrics = ctx.measureText(displayText);
    const padding = 6;
    const minWidth = 30;
    const bgWidth = Math.max(metrics.width + padding * 2, minWidth);
    const bgHeight = fontSize + padding * 2;
    const isEmpty = text === '—' || text === '';
    if (label.pinned) {
      ctx.fillStyle = '#fbbf24';
    } else if (isEmpty && label.kind === 'segment') {
      ctx.fillStyle = THEME.bg;
    } else {
      ctx.fillStyle = THEME.bg;
    }
    ctx.fillRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight);
    ctx.strokeStyle = label.color ?? THEME.defaultStroke;
    ctx.lineWidth = 1;
    if (isEmpty && label.kind === 'segment') ctx.setLineDash([3, 3]);
    ctx.strokeRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight);
    ctx.setLineDash([]);
    ctx.fillStyle = label.pinned ? '#000000' : (label.color ?? THEME.defaultStroke);
    if (isEmpty && label.kind === 'segment') ctx.globalAlpha = 0.4;
    ctx.fillText(displayText, 0, 0);
    ctx.restore();
  });
}

// Render the multiselect box (drag rectangle)
export function renderMultiselectBox(
  ctx: CanvasRenderingContext2D | null,
  boxStart: { x: number; y: number } | null,
  boxEnd: { x: number; y: number } | null,
  deps: {
    mode: string;
    THEME: any;
    renderWidth: (w: number) => number;
    zoomFactor: number;
  }
) {
  if (!ctx) return;
  const { mode, THEME, renderWidth, zoomFactor } = deps as any;
  if (mode !== 'multiselect' || !boxStart || !boxEnd) return;
  ctx.save();
  ctx.strokeStyle = THEME.highlight;
  ctx.lineWidth = renderWidth(THEME.highlightWidth ?? 2);
  ctx.setLineDash([4, 4]);
  ctx.fillStyle = THEME.highlight + '20';
  const x1 = Math.min(boxStart.x, boxEnd.x);
  const y1 = Math.min(boxStart.y, boxEnd.y);
  const w = Math.abs(boxEnd.x - boxStart.x);
  const h = Math.abs(boxEnd.y - boxStart.y);
  ctx.fillRect(x1, y1, w, h);
  ctx.strokeRect(x1, y1, w, h);
  ctx.setLineDash([]);
  ctx.restore();
}

// Render overlays for multi-selected objects (points, lines, circles, angles, ink strokes)
export function renderMultiselectOverlays(
  ctx: CanvasRenderingContext2D | null,
  runtime: any,
  deps: {
    THEME: any;
    showHidden: boolean;
    multiSelectedPoints: Set<ObjectId>;
    multiSelectedLines: Set<ObjectId>;
    multiSelectedCircles: Set<ObjectId>;
    multiSelectedAngles: Set<ObjectId>;
    multiSelectedInkStrokes: Set<ObjectId>;
    zoomFactor: number;
    renderWidth: (w: number) => number;
    applySelectionStyle: (ctx: CanvasRenderingContext2D, width: number, color: string, forPoint?: boolean, intensity?: number) => void;
    applyStrokeStyle?: (t: any) => void;
    circleRadius?: (c: any) => number;
    strokeBounds?: (s: any) => { minX: number; minY: number; maxX: number; maxY: number } | null;
    screenUnits?: (v: number) => number;
    angleGeometry?: (ang: any) => any;
  }
) {
  if (!ctx) return;
  const {
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
  } = deps as any;

  ctx.save();
  // Points
  multiSelectedPoints.forEach((pointId: ObjectId) => {
    const p = getPointLocal(runtime, pointId);
    if (!p || !isGeometryAvailable(p) || spatialIntensity(p,THEME)===0) return;
    const pStyle = mapPointStyle(p, { color: THEME.defaultStroke, size: THEME.pointSize });
    const r = (pStyle.size ?? THEME.pointSize) + 2;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1 / zoomFactor, 1 / zoomFactor);
    ctx.beginPath();
    ctx.arc(0, 0, THEME.selectionPointRadius, 0, Math.PI * 2);
    applySelectionStyle(ctx, 2, isFixedSpatialVertex(runtime,pointId)?'#9ca3af':THEME.highlight, true, spatialIntensity(p,THEME));
    ctx.restore();
  });

  // Lines
  multiSelectedLines.forEach((lineId: ObjectId) => {
    const line = getLineLocal(runtime, lineId);
    if (!line || !isGeometryAvailable(line) || (line.hidden && !showHidden) || spatialIntensity(line,THEME)===0) return;
    const points = linePresentationPoints(line, runtime);
    if (!points) return;
    points.forEach((b: any, i: number) => {
      if (i === 0) return;
      const a = points[i - 1];
      const rawStyle = line.segmentStyles?.[i - 1] ?? line.style;
      const style = mapStrokeStyle(rawStyle, { color: THEME.defaultStroke, width: THEME.lineWidth, type: 'solid' });
      if (style.hidden && !showHidden) return;
      ctx.save();
      if (line.spatialHiddenEdge) applyStrokeStyle?.(spatialLineType(line,style.type,THEME));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      applySelectionStyle(ctx, style.width, THEME.highlight, false, spatialIntensity(line,THEME));
      ctx.restore();
    });
  });

  // Circles
  multiSelectedCircles.forEach((circleId: ObjectId) => {
    const circle = runtime.circles?.[String(circleId)] ?? null;
    if (!circle || !isGeometryAvailable(circle)) return;
    const center = getPointLocal(runtime, circle.center);
    if (!center || !isGeometryAvailable(center)) return;
    const radius = circleRadius ? circleRadius(circle) : 0;
    const style = mapCircleStyle(circle, { color: THEME.defaultStroke, width: THEME.lineWidth, type: 'solid' });
    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = renderWidth(style.width);
    applyStrokeStyle?.(style.type);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    applySelectionStyle(ctx, style.width, THEME.highlight);
    ctx.restore();
  });

  // Angles
  multiSelectedAngles.forEach((angleId: ObjectId) => {
    const ang = runtime.angles?.[String(angleId)] ?? null;
    if (!ang || !isGeometryAvailable(ang)) return;
    const geom = angleGeometry ? angleGeometry(ang) : null;
    if (!geom) return;
    const v = getPointLocal(runtime, ang.vertex);
    if (!v || !isGeometryAvailable(v)) return;
    ctx.beginPath();
    ctx.arc(v.x, v.y, geom.radius, geom.start, geom.end, geom.clockwise);
    ctx.stroke();
  });

  // Ink strokes (bounding boxes)
  multiSelectedInkStrokes.forEach((strokeId: ObjectId) => {
    const stroke = runtime.inkStrokes?.[String(strokeId)];
    if (!stroke) return;
    if (stroke.hidden && !showHidden) return;
    const bounds = strokeBounds ? strokeBounds(stroke) : null;
    if (!bounds) return;
    const margin = screenUnits ? screenUnits(8) : 8;
    ctx.beginPath();
    ctx.rect(
      bounds.minX - margin,
      bounds.minY - margin,
      bounds.maxX - bounds.minX + margin * 2,
      bounds.maxY - bounds.minY + margin * 2
    );
    applySelectionStyle(ctx, THEME.highlightWidth ?? 2, THEME.highlight);
  });

  ctx.restore();
}

// Ink stroke rendering moved from main. This requires a `renderWidth`
// function from the caller (main has one that depends on `dpr`/`zoomFactor`).
export function renderInkStroke(stroke: any, context: CanvasRenderingContext2D, renderWidth: (w: number) => number) {
  const points = stroke.points;
  if (!points.length) return;
  context.save();
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  const isHighlighter = stroke.opacity !== undefined;
  if (isHighlighter) context.globalAlpha = stroke.opacity as number;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (points.length === 1) {
    const pt = points[0];
    const radius = renderWidth(stroke.baseWidth) * 0.5;
    context.beginPath();
    context.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }
  if (isHighlighter) {
    const w = renderWidth(stroke.baseWidth);
    context.lineWidth = w;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
    context.stroke();
    const r = w * 0.5;
    context.beginPath();
    for (let i = 0; i < points.length; i++) {
      context.moveTo(points[i].x + r, points[i].y);
      context.arc(points[i].x, points[i].y, r, 0, Math.PI * 2);
    }
    context.fill();
  } else {
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const avgPressure = Math.max(0.2, (prev.pressure + curr.pressure) * 0.5);
      context.lineWidth = renderWidth(stroke.baseWidth * avgPressure);
      context.beginPath();
      context.moveTo(prev.x, prev.y);
      context.lineTo(curr.x, curr.y);
      context.stroke();
    }
  }
  context.restore();
}

// Text formatting helpers used by label rendering. These are pure helpers
// that operate on a provided `CanvasRenderingContext2D`.
export function autoAddBraces(text: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if ((char === '_' || char === '^') && i + 1 < text.length) {
      result += char;
      i++;
      if (text[i] === '{') {
        result += '{';
        i++;
        continue;
      }
      const startIdx = i;
      const firstChar = text[i];
      const isDigit = /\d/.test(firstChar);
      const isLowercase = /[a-z]/.test(firstChar);
      const isUppercase = /[A-Z]/.test(firstChar);
      const isGreek = /[α-ωΑ-Ω]/.test(firstChar);
      while (i < text.length) {
        const c = text[i];
        const matches = isDigit ? /\d/.test(c) : isLowercase ? /[a-z]/.test(c) : isUppercase ? /[A-Z]/.test(c) : isGreek ? /[α-ωΑ-Ω]/.test(c) : false;
        if (!matches) break;
        i++;
      }
      const group = text.substring(startIdx, i);
      if (group.length > 0) result += '{' + group + '}';
    } else {
      result += char;
      i++;
    }
  }
  return result;
}

// Used by main UI flow.
function measurePlainFormattedText(ctx: CanvasRenderingContext2D, text: string): number {
  const processedText = autoAddBraces(text);
  const baseFontSize = parseFloat(ctx.font) || 16;
  const subSupSize = baseFontSize * 0.7;
  let width = 0;
  let i = 0;
  while (i < processedText.length) {
    const char = processedText[i];
    if ((char === '_' || char === '^') && i + 1 < processedText.length && processedText[i + 1] === '{') {
      i += 2;
      let content = '';
      let braceCount = 1;
      while (i < processedText.length && braceCount > 0) {
        if (processedText[i] === '{') braceCount++;
        else if (processedText[i] === '}') {
          braceCount--;
          if (braceCount === 0) break;
        }
        content += processedText[i];
        i++;
      }
      ctx.save();
      ctx.font = `${subSupSize}px ${ctx.font.split('px ')[1] || 'sans-serif'}`;
      width += ctx.measureText(content).width;
      ctx.restore();
      i++;
    } else {
      width += ctx.measureText(char).width;
      i++;
    }
  }
  return width;
}

// Used by rendering flow.
function renderPlainFormattedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.textAlign = 'left';
  const processedText = autoAddBraces(text);
  const baseFontSize = parseFloat(ctx.font) || 16;
  const subSupSize = baseFontSize * 0.7;
  const subOffset = baseFontSize * 0.3;
  const supOffset = -baseFontSize * 0.4;
  let currentX = x;
  let i = 0;
  while (i < processedText.length) {
    const char = processedText[i];
    if (char === '_' && i + 1 < processedText.length && processedText[i + 1] === '{') {
      i += 2;
      let content = '';
      let braceCount = 1;
      while (i < processedText.length && braceCount > 0) {
        if (processedText[i] === '{') braceCount++;
        else if (processedText[i] === '}') {
          braceCount--;
          if (braceCount === 0) break;
        }
        content += processedText[i];
        i++;
      }
      ctx.save();
      ctx.font = `${subSupSize}px ${ctx.font.split('px ')[1] || 'sans-serif'}`;
      ctx.fillText(content, currentX, y + subOffset);
      currentX += ctx.measureText(content).width;
      ctx.restore();
      i++;
    } else if (char === '^' && i + 1 < processedText.length && processedText[i + 1] === '{') {
      i += 2;
      let content = '';
      let braceCount = 1;
      while (i < processedText.length && braceCount > 0) {
        if (processedText[i] === '{') braceCount++;
        else if (processedText[i] === '}') {
          braceCount--;
          if (braceCount === 0) break;
        }
        content += processedText[i];
        i++;
      }
      ctx.save();
      ctx.font = `${subSupSize}px ${ctx.font.split('px ')[1] || 'sans-serif'}`;
      ctx.fillText(content, currentX, y + supOffset);
      currentX += ctx.measureText(content).width;
      ctx.restore();
      i++;
    } else {
      ctx.fillText(char, currentX, y);
      currentX += ctx.measureText(char).width;
      i++;
    }
  }
}

type StyledGlyph = { text: string; font: string; color?: string; width: number; offset: number };
const canvasFontSize = (font: string) => Number(font.match(/([\d.]+)px/)?.[1]) || 16;
function layoutStyledPlain(ctx: CanvasRenderingContext2D, text: string, styles: LabelTextStyleRange[], sourceOffset: number) {
  const baseSize = canvasFontSize(ctx.font);
  const glyphs: StyledGlyph[] = [];
  let height = baseSize * 1.2;
  const append = (start: number, end: number, script?: string) => {
    for (let i = start; i < end;) {
      const char = String.fromCodePoint(text.codePointAt(i)!);
      const style = labelTextStyleAt(styles, sourceOffset + i);
      const size = style.fontSize ?? baseSize;
      const offset = script === '_' ? size * 0.3 : script === '^' ? -size * 0.4 : 0;
      const font = `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${size * (script ? 0.7 : 1)}px sans-serif`;
      ctx.save();
      ctx.font = font;
      glyphs.push({ text: char, font, color: style.color, width: ctx.measureText(char).width, offset });
      ctx.restore();
      height = Math.max(height, size * 1.2);
      i += char.length;
    }
  };
  for (let i = 0; i < text.length;) {
    const marker = text[i];
    if ((marker === '_' || marker === '^') && i + 1 < text.length) {
      let start = i + 1;
      let end = start;
      if (text[start] === '{') {
        start++;
        end = start;
        let depth = 1;
        while (end < text.length) {
          if (text[end] === '{') depth++;
          if (text[end] === '}' && --depth === 0) break;
          end++;
        }
        append(start, end, marker);
        i = Math.min(text.length, end + 1);
      } else {
        const first = text[start];
        const pattern = /\d/.test(first) ? /\d/ : /[a-z]/.test(first) ? /[a-z]/
          : /[A-Z]/.test(first) ? /[A-Z]/ : /[α-ωΑ-Ω]/.test(first) ? /[α-ωΑ-Ω]/ : null;
        while (end < text.length && pattern?.test(text[end])) end++;
        append(start, end, marker);
        i = end;
      }
    } else {
      const end = i + String.fromCodePoint(text.codePointAt(i)!).length;
      append(i, end);
      i = end;
    }
  }
  return { glyphs, height, width: glyphs.reduce((sum, glyph) => sum + glyph.width, 0) };
}

type MathRun = { part: MathLabelPart; width: number; height: number; children?: MathRun[][]; glyphs?: StyledGlyph[]; size: number; color?: string };
function layoutFormattedText(ctx: CanvasRenderingContext2D, text: string, depth = 0, styles: LabelTextStyleRange[] = [], sourceOffset = 0): MathRun[] {
  const baseSize = canvasFontSize(ctx.font);
  const parts = depth < 64 ? parseMathLabel(text) : [{ text }];
  let cursor = 0;
  return parts.map(part => {
    if ('text' in part) {
      const offset = text.indexOf(part.text, cursor);
      cursor = offset + part.text.length;
      return styles.length
        ? { part, size: baseSize, ...layoutStyledPlain(ctx, part.text, styles, sourceOffset + offset) }
        : { part, size: baseSize, width: measurePlainFormattedText(ctx, part.text), height: baseSize * 1.2 };
    }
    let symbolIndex = text.indexOf('√', cursor);
    if (!('radicand' in part)) {
      let braces = 0;
      for (symbolIndex = cursor; symbolIndex < text.length; symbolIndex++) {
        if (text[symbolIndex] === '{') braces++;
        else if (text[symbolIndex] === '}') braces--;
        else if (text[symbolIndex] === '/' && braces === 0) break;
      }
    }
    const symbolStyle = labelTextStyleAt(styles, sourceOffset + symbolIndex);
    const size = symbolStyle.fontSize ?? baseSize;
    if ('radicand' in part) cursor = symbolIndex + 1;
    const children = ('radicand' in part ? [part.radicand] : [part.numerator, part.denominator])
      .map((content, index) => {
        if (index === 1) cursor = symbolIndex + 1;
        const offset = text.indexOf(content, cursor);
        cursor = offset + content.length;
        return layoutFormattedText(ctx, content, depth + 1, styles, sourceOffset + offset);
      });
    // Consume explicit closing braces, so following text retains its original offsets.
    if (text[cursor] === '}') cursor++;
    const width = Math.max(...children.map(runs => runs.reduce((sum, run) => sum + run.width, 0)));
    const height = Math.max(size * 1.2, ...children.flat().map(run => run.height));
    return 'radicand' in part
      ? { part, size, color: symbolStyle.color, width: width + size * 0.85, height: height + size * 0.5, children }
      : { part, size, color: symbolStyle.color, width: width + size * 0.4, height: height * 2 + size * 0.2, children };
  });
}

export function measureFormattedText(ctx: CanvasRenderingContext2D, text: string): number {
  return layoutFormattedText(ctx, text).reduce((sum, run) => sum + run.width, 0);
}

export function renderFormattedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, styles: LabelTextStyleRange[] = [], sourceOffset = 0) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const paint = (runs: MathRun[], left: number, centerY: number) => {
    for (const { part, width, height, children, glyphs, size, color } of runs) {
      if (glyphs) {
        let glyphX = left;
        for (const glyph of glyphs) {
          ctx.save();
          ctx.font = glyph.font;
          if (glyph.color) ctx.fillStyle = glyph.color;
          ctx.fillText(glyph.text, glyphX, centerY + glyph.offset);
          ctx.restore();
          glyphX += glyph.width;
        }
      }
      else if ('text' in part) renderPlainFormattedText(ctx, part.text, left, centerY);
      else {
        ctx.strokeStyle = color ?? ctx.fillStyle;
        ctx.lineWidth = Math.max(0.75, size / 18);
        ctx.setLineDash([]);
        ctx.beginPath();
        if ('radicand' in part) {
          const top = centerY - height / 2 + size * 0.1;
          ctx.moveTo(left + size * 0.05, centerY);
          ctx.lineTo(left + size * 0.22, centerY - size * 0.12);
          ctx.lineTo(left + size * 0.4, centerY + height / 2 - size * 0.15);
          ctx.lineTo(left + size * 0.65, top);
          ctx.lineTo(left + width, top);
        } else {
          ctx.moveTo(left, centerY);
          ctx.lineTo(left + width, centerY);
        }
        ctx.stroke();
        children!.forEach((child, index) => {
          const childWidth = child.reduce((sum, run) => sum + run.width, 0);
          const childX = 'radicand' in part ? left + size * 0.75 : left + (width - childWidth) / 2;
          const childY = 'radicand' in part ? centerY + size * 0.15
            : centerY + (index === 0 ? -1 : 1) * (height / 4);
          paint(child, childX, childY);
        });
      }
      left += width;
    }
  };
  paint(layoutFormattedText(ctx, text, 0, styles, sourceOffset), x, y);
  ctx.restore();
}

// Label layout and rendering helpers.
export function getLabelScreenDimensions(
  ctx: CanvasRenderingContext2D | null,
  label: { text: string; fontSize?: number; textStyles?: LabelTextStyleRange[] },
  labelFontSizePx: (delta?: number, base?: number) => number
) {
  if (!ctx) return { width: 0, height: 0, lines: [] as string[], lineWidths: [] as number[], lineHeights: [] as number[], lineHeight: 0 };
  const fontSize = labelFontSizePx(label.fontSize);
  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  let text = label.text;
  while (text.endsWith('\n')) text = text.slice(0, -1);
  const lines = text.split('\n');
  const lineHeight = fontSize * 1.2;
  let maxWidth = 0;
  const lineWidths: number[] = [];
  const lineHeights: number[] = [];
  let sourceOffset = 0;
  lines.forEach((line: string) => {
    const runs = layoutFormattedText(ctx!, line, 0, label.textStyles, sourceOffset);
    sourceOffset += line.length + 1;
    const w = runs.reduce((sum, run) => sum + run.width, 0);
    lineWidths.push(w);
    lineHeights.push(Math.max(lineHeight, ...runs.map(run => run.height)));
    if (w > maxWidth) maxWidth = w;
  });
  const totalHeight = lineHeights.reduce((sum, height) => sum + height, 0);
  ctx.restore();
  return { width: maxWidth, height: totalHeight, lines, lineWidths, lineHeights, lineHeight };
}

// Used by label UI flow.
export function drawLabelText(
  ctx: CanvasRenderingContext2D | null,
  label: { text: string; color?: string; fontSize?: number; textAlign?: string; textStyles?: LabelTextStyleRange[] },
  anchor: { x: number; y: number },
  selected: boolean,
  screenOffset: { x: number; y: number } | undefined,
  worldToCanvas: (x: number, y: number) => { x: number; y: number },
  labelFontSizePx: (delta?: number, base?: number) => number,
  getLabelAlignment: (label?: { textAlign?: any }) => any,
  dpr: number,
  highlightColor: string,
  padX: number,
  padY: number
) {
  if (!ctx) return;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const anchorScreen = worldToCanvas(anchor.x, anchor.y);
  const screenPos = { x: anchorScreen.x + (screenOffset?.x ?? 0), y: anchorScreen.y + (screenOffset?.y ?? 0) };
  ctx.translate(screenPos.x, screenPos.y);
  const fontSize = labelFontSizePx(label.fontSize);
  ctx.font = `${fontSize}px sans-serif`;
  const alignment = getLabelAlignment(label as any);
  ctx.textAlign = alignment === 'left' ? 'left' : 'center';
  ctx.textBaseline = 'middle';
  const { width: maxWidth, height: totalHeight, lines, lineWidths, lineHeights } = getLabelScreenDimensions(ctx, label as any, labelFontSizePx);
  if (selected) {
    const w = maxWidth + padX * 2;
    const h = totalHeight + padY * 2;
    ctx.fillStyle = 'rgba(251,191,36,0.18)';
    ctx.strokeStyle = highlightColor;
    ctx.lineWidth = 1;
    const x = alignment === 'left' ? -padX : -w / 2;
    const y = -h / 2;
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = label.color ?? '#000';
  let top = -totalHeight / 2;
  let sourceOffset = 0;
  lines.forEach((line: string, i: number) => {
    const w = lineWidths[i];
    const y = top + lineHeights[i] / 2;
    top += lineHeights[i];
    const startX = alignment === 'left' ? 0 : -w / 2;
    renderFormattedText(ctx!, line, startX, y, label.textStyles, sourceOffset);
    sourceOffset += line.length + 1;
  });
  ctx.restore();
}

// Draw debug overlay labels. This is a pure drawing routine that depends on
// caller-provided helpers (world<->canvas, geometry helpers, and flags).
export function drawDebugLabelsCanvas(
  ctx: CanvasRenderingContext2D | null,
  runtime: any,
  worldToCanvas: (x: number, y: number) => { x: number; y: number },
  screenUnits: (v: number) => number,
  pointRadius: (size: number) => number,
  zoomFactor: number,
  lineExtent: (lineId: string) => { center: { x: number; y: number } } | null,
  circleRadius: (c: any) => number,
  polygonCentroid: (polyId: string) => { x: number; y: number } | null,
  friendlyLabelForId: (id: string) => string,
  showHidden: boolean,
  dpr: number
) {
  if (!ctx) return;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = '12px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  const labels: { x: number; y: number; w: number; h: number; text: string }[] = [];
  const padding = 4;
  const h = 16;

  const addLabel = (pos: { x: number; y: number }, text: string) => {
    const screenPos = worldToCanvas(pos.x, pos.y);
    const metrics = ctx!.measureText(text);
    const w = metrics.width + padding * 2;
    labels.push({
      x: screenPos.x,
      y: screenPos.y,
      w,
      h,
      text
    });
  };

  Object.values(runtime.points ?? {}).forEach((p: any) => {
    if (!isGeometryAvailable(p)) return;
    const pStyle = mapPointStyle(p);
    if (pStyle.hidden && !showHidden) return;
    const topOffset = pointRadius(pStyle.size) / zoomFactor + screenUnits(10);
    addLabel({ x: p.x, y: p.y - topOffset }, friendlyLabelForId(p.id));
  });
  const getPointById = (id: string | null | undefined) => {
    if (!id) return null;
    return runtime.points?.[String(id)] ?? null;
  };

  Object.values(runtime.lines ?? {}).forEach((l: any) => {
    if (!isGeometryAvailable(l)) return;
    if (l.hidden && !showHidden) return;
    const ext = lineExtent(l.id);
    if (!ext) return;
    addLabel({ x: ext.center.x, y: ext.center.y - screenUnits(10) }, friendlyLabelForId(l.id));
  });
  Object.values(runtime.circles ?? {}).forEach((c: any) => {
    if (!isGeometryAvailable(c)) return;
    if (c.hidden && !showHidden) return;
    const center = getPointById(c.center);
    if (!center || !isGeometryAvailable(center)) return;
    const radius = circleRadius(c);
    addLabel({ x: center.x, y: center.y - radius - screenUnits(10) }, friendlyLabelForId(c.id));
  });
  Object.values(runtime.angles ?? {}).forEach((a: any) => {
    if (!isGeometryAvailable(a)) return;
    const v = getPointById(a.vertex);
    if (!v || !isGeometryAvailable(v)) return;
    addLabel({ x: v.x + screenUnits(12), y: v.y + screenUnits(12) }, friendlyLabelForId(a.id));
  });
  Object.values(runtime.polygons ?? {}).forEach((p: any) => {
    if (!isGeometryAvailable(p)) return;
    const centroid = polygonCentroid(p.id);
    if (!centroid) return;
    addLabel(centroid, friendlyLabelForId(p.id));
  });

  // Collision resolution
  for (let iter = 0; iter < 5; iter++) {
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i];
        const b = labels[j];

        const dx = a.x - b.x;
        const dy = a.y - b.y;

        const w = (a.w + b.w) / 2 + 2; // +2 padding
        const h = (a.h + b.h) / 2 + 2;

        if (Math.abs(dx) < w && Math.abs(dy) < h) {
          // Overlap
          const ox = w - Math.abs(dx);
          const oy = h - Math.abs(dy);

          if (ox < oy) {
            // Push in X
            const dir = dx > 0 ? 1 : -1;
            a.x += dir * ox * 0.5;
            b.x -= dir * ox * 0.5;
          } else {
            // Push in Y
            const dir = dy > 0 ? 1 : -1;
            a.y += dir * oy * 0.5;
            b.y -= dir * oy * 0.5;
          }
        }
      }
    }
  }

  labels.forEach((l) => {
    ctx!.save();
    ctx!.translate(l.x, l.y);
    ctx!.fillStyle = 'rgba(17,24,39,0.8)';
    ctx!.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx!.lineWidth = 1;
    ctx!.beginPath();
    // roundRect polyfill for older contexts: use roundRect if available
    if ((ctx as any).roundRect) {
      (ctx as any).roundRect(-l.w / 2, -l.h / 2, l.w, l.h, 4);
    } else {
      const x = -l.w / 2;
      const y = -l.h / 2;
      const r = 4;
      ctx!.moveTo(x + r, y);
      ctx!.lineTo(x + l.w - r, y);
      ctx!.quadraticCurveTo(x + l.w, y, x + l.w, y + r);
      ctx!.lineTo(x + l.w, y + l.h - r);
      ctx!.quadraticCurveTo(x + l.w, y + l.h, x + l.w - r, y + l.h);
      ctx!.lineTo(x + r, y + l.h);
      ctx!.quadraticCurveTo(x, y + l.h, x, y + l.h - r);
      ctx!.lineTo(x, y + r);
      ctx!.quadraticCurveTo(x, y, x + r, y);
    }
    ctx!.fill();
    ctx!.stroke();
    ctx!.fillStyle = '#e5e7eb';
    ctx!.fillText(l.text, 0, 0);
    ctx!.restore();
  });

  ctx.restore();
}
