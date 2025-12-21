// Minimal canvas renderer helpers: handle resizing and expose init helper.
// runtimeToModel removed: renderers use runtime coordinates directly when available

export function resizeCanvasElement(canvas: HTMLCanvasElement | null, dpr: number = (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)): CanvasRenderingContext2D | null {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  canvas.width = w;
  canvas.height = h;
  return canvas.getContext('2d');
}

// Render an adaptive grid/ruler in world coordinates. Uses the current canvas
// transform (world -> canvas) to compute visible world bounds so the grid
// aligns with pan/zoom. Grid visibility and colors are controlled via
// `THEME.grid` with optional fields: `show`, `minorColor`, `majorColor`,
// `axisColor`, and `spacingPx` (preferred pixel spacing for minor grid).
export function renderGrid(
  ctx: CanvasRenderingContext2D | null,
  deps: {
    THEME: any;
    dpr: number;
    zoomFactor: number;
    renderWidth: (w: number) => number;
    minorPerMajor?: number;
  }
) {
  if (!ctx) return;
  const { THEME, dpr, zoomFactor, renderWidth, minorPerMajor = 5 } = deps as any;
  const gridCfg = THEME?.grid ?? {};
  if (!gridCfg.show) return;

  // desired spacing in screen pixels for minor grid lines
  const spacingPx = gridCfg.spacingPx ?? 48;
  // world-space spacing that maps to approx `spacingPx` on screen
  const worldSpacing = spacingPx / (dpr * zoomFactor);
  if (!(worldSpacing > 0)) return;

  // compute visible world bounds by inverting current transform
  const tr = ctx.getTransform();
  const inv = tr.inverse();
  const p0 = inv.transformPoint(new DOMPoint(0, 0));
  const p1 = inv.transformPoint(new DOMPoint(ctx.canvas.width, ctx.canvas.height));
  const minX = Math.min(p0.x, p1.x);
  const maxX = Math.max(p0.x, p1.x);
  const minY = Math.min(p0.y, p1.y);
  const maxY = Math.max(p0.y, p1.y);

  const minorColor = gridCfg.minorColor ?? (THEME.gridMinor || '#e6e6e6');
  const majorColor = gridCfg.majorColor ?? (THEME.gridMajor || '#d1d5db');
  const axisColor = gridCfg.axisColor ?? (THEME.axisColor || '#9ca3af');

  ctx.save();
  ctx.setLineDash([]);
  ctx.lineWidth = renderWidth(0.5);

  // vertical lines
  const startX = Math.floor(minX / worldSpacing) * worldSpacing;
  for (let x = startX; x <= maxX + 1e-6; x += worldSpacing) {
    const isMajor = Math.abs(Math.round(x / worldSpacing) % minorPerMajor) === 0;
    ctx.beginPath();
    ctx.strokeStyle = isMajor ? majorColor : minorColor;
    ctx.moveTo(x, minY);
    ctx.lineTo(x, maxY);
    ctx.stroke();
  }

  // horizontal lines
  const startY = Math.floor(minY / worldSpacing) * worldSpacing;
  for (let y = startY; y <= maxY + 1e-6; y += worldSpacing) {
    const isMajor = Math.abs(Math.round(y / worldSpacing) % minorPerMajor) === 0;
    ctx.beginPath();
    ctx.strokeStyle = isMajor ? majorColor : minorColor;
    ctx.moveTo(minX, y);
    ctx.lineTo(maxX, y);
    ctx.stroke();
  }

  // axis lines (x=0,y=0)
  if (minX <= 0 && maxX >= 0) {
    ctx.beginPath();
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = renderWidth(1.25);
    ctx.moveTo(0, minY);
    ctx.lineTo(0, maxY);
    ctx.stroke();
  }
  if (minY <= 0 && maxY >= 0) {
    ctx.beginPath();
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = renderWidth(1.25);
    ctx.moveTo(minX, 0);
    ctx.lineTo(maxX, 0);
    ctx.stroke();
  }

  ctx.restore();
}

// Small helper local to renderer to check whether a polygon (index or id) contains a line
function polygonHasLineLocal(model: any, polyRef: number | string | null, lineIdx: number): boolean {
  if (polyRef === null || polyRef === undefined) return false;
  if (typeof polyRef === 'number') return !!model.polygons[polyRef] && model.polygons[polyRef].lines.includes(lineIdx);
  const idx = model.indexById && model.indexById.polygon ? model.indexById.polygon[polyRef] : undefined;
  return typeof idx === 'number' && !!model.polygons[idx] && model.polygons[idx].lines.includes(lineIdx);
}

function polygonGetLocal(model: any, polyRef: number | string | null) {
  if (polyRef === null || polyRef === undefined) return undefined;
  if (typeof polyRef === 'number') return model.polygons[polyRef];
  const idx = model.indexById && model.indexById.polygon ? model.indexById.polygon[polyRef] : undefined;
  return typeof idx === 'number' ? model.polygons[idx] : undefined;
}

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
const HANDLE_ICON_SCALE = 1.6;

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
  model: any,
  deps: {
    mode: string;
    hasMultiSelection: () => boolean;
    getMultiHandles: () => any;
    rotatingMulti?: any;
    activeAxisSnaps?: Map<number, any>;
    zoomFactor: number;
    THEME: any;
    HANDLE_SIZE?: number;
    HANDLE_HIT_PAD?: number;
    hexToRgba?: (h: string, a: number) => string;
    drawDiagonalHandle: typeof drawDiagonalHandle;
    drawRotateIcon: typeof drawRotateIcon;
    selectedLineIndex?: number | null;
    getLineHandle?: (idx: number) => { x: number; y: number } | null;
    getLineRotateHandle?: (idx: number) => { x: number; y: number } | null;
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
    selectedLineIndex,
    getLineHandle,
    getLineRotateHandle
  } = deps as any;

  // Draw group handles for multiselect (scale + rotate)
  if (mode === 'multiselect' && hasMultiSelection && hasMultiSelection()) {
    const mh = getMultiHandles && getMultiHandles();
    if (mh) {
      // scale handle (bottom-right)
      ctx.save();
      ctx.translate(mh.scaleHandle.x, mh.scaleHandle.y);
      ctx.scale(1 / zoomFactor, 1 / zoomFactor);
      const baseSquareColor = THEME.preview || '#22c55e';
      ctx.beginPath();
      ctx.fillStyle = (hexToRgba && hexToRgba(baseSquareColor, 0.33)) || 'rgba(34,197,94,0.33)';
      ctx.arc(0, 0, (HANDLE_SIZE || 16) / 2 + (HANDLE_HIT_PAD || 4), 0, Math.PI * 2);
      ctx.fill();
      drawDiag(ctx, (HANDLE_SIZE || 16), baseSquareColor);
      ctx.restore();

      // rotate handle (top-center)
      ctx.save();
      ctx.translate(mh.rotateHandle.x, mh.rotateHandle.y);
      ctx.scale(1 / zoomFactor, 1 / zoomFactor);
      const baseCircleColor = THEME.palette?.[3] || THEME.preview || '#f59e0b';
      ctx.beginPath();
      ctx.fillStyle = (hexToRgba && hexToRgba(baseCircleColor, 0.33)) || 'rgba(245,158,11,0.33)';
      ctx.arc(0, 0, (HANDLE_SIZE || 16) / 2 + (HANDLE_HIT_PAD || 4), 0, Math.PI * 2);
      ctx.fill();
      drawRot(ctx, Math.max(10, Math.min((HANDLE_SIZE || 16), 14)), baseCircleColor);
      ctx.restore();
    }
  }

  // If rotating a multiselect, show a central H/V helper when per-line snaps are detected
  if (mode === 'multiselect' && rotatingMulti) {
    let best: { lineIdx: number; axis: 'horizontal' | 'vertical'; strength: number } | null = null;
    if (activeAxisSnaps) {
      for (const [k, v] of activeAxisSnaps) {
        if (!best || v.strength > best.strength) best = { lineIdx: k, axis: v.axis, strength: v.strength };
      }
    }
    if (best) {
      const mh = getMultiHandles && getMultiHandles();
      const pos = mh ? mh.center : rotatingMulti.center;
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
    } else {
      const ang = rotatingMulti.currentAngle ?? rotatingMulti.startAngle;
      const delta = ang - rotatingMulti.startAngle;
      const mod = ((delta % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
      const thr = (4 * Math.PI) / 180; // 4 degrees tolerance
      if (mod < thr || Math.abs(mod - Math.PI / 2) < thr) {
        const isH = mod < thr;
        const tag = isH ? 'H' : 'V';
        const mh = getMultiHandles && getMultiHandles();
        const pos = mh ? mh.center : rotatingMulti.center;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.scale(1 / zoomFactor, 1 / zoomFactor);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = THEME.preview;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.font = `bold ${12}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, 0, 0);
        ctx.restore();
      }
    }
  }

  // Draw handles on top for easier touch interaction (selected line handles)
  if (selectedLineIndex !== null && getLineHandle && getLineRotateHandle) {
    const sel = selectedLineIndex;
    const handle = getLineHandle(sel);
    const rotateHandle = getLineRotateHandle(sel);
    if (handle) {
      ctx.save();
      ctx.translate(handle.x, handle.y);
      ctx.scale(1 / zoomFactor, 1 / zoomFactor);
      const baseSquareColor = THEME.preview || '#22c55e';
      ctx.beginPath();
      ctx.fillStyle = (hexToRgba && hexToRgba(baseSquareColor, 0.33)) || 'rgba(34,197,94,0.33)';
      ctx.arc(0, 0, (HANDLE_SIZE || 16) / 2 + (HANDLE_HIT_PAD || 4), 0, Math.PI * 2);
      ctx.fill();
      drawDiag(ctx, (HANDLE_SIZE || 16), baseSquareColor);
      ctx.restore();
    }
    if (rotateHandle) {
      ctx.save();
      ctx.translate(rotateHandle.x, rotateHandle.y);
      ctx.scale(1 / zoomFactor, 1 / zoomFactor);
      const baseCircleColor = THEME.palette?.[3] || THEME.preview || '#f59e0b';
      ctx.beginPath();
      ctx.fillStyle = (hexToRgba && hexToRgba(baseCircleColor, 0.33)) || 'rgba(245,158,11,0.33)';
      ctx.arc(0, 0, (HANDLE_SIZE || 16) / 2 + (HANDLE_HIT_PAD || 4), 0, Math.PI * 2);
      ctx.fill();
      drawRot(ctx, Math.max(10, Math.min((HANDLE_SIZE || 16), 14)), baseCircleColor);
      ctx.restore();
    }
  }
}

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

function normalizeAngle(a: number) {
  while (a < 0) a += Math.PI * 2;
  while (a >= Math.PI * 2) a -= Math.PI * 2;
  return a;
}

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
  return function applySelectionStyle(ctx: CanvasRenderingContext2D, baseWidth: number, color: string, forPoint: boolean = false) {
    ctx.save();
    const lineStyle = THEME.selectionLineStyle || 'auto';
    const effect = THEME.selectionEffect || 'color';
    const sameStyle = THEME.selectionPointStyleSameAsLine ?? false;

    // For points, check if we should use custom style or line style
    if (forPoint && !sameStyle) {
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = renderWidth(2);
      ctx.strokeStyle = color;
      ctx.setLineDash([6, 3]);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (effect === 'halo') {
      ctx.globalAlpha = 0.5;
      const extraWidth = (THEME.highlightWidth || 1.5) * 4;
      ctx.lineWidth = renderWidth(baseWidth + extraWidth);
    } else {
      ctx.globalAlpha = 1.0;
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
  model: any,
  deps: {
    showHidden: boolean;
    THEME: any;
    dpr: number;
    zoomFactor: number;
    screenUnits: (v: number) => number;
    renderWidth: (w: number) => number;
    worldToCanvas: (x: number, y: number) => { x: number; y: number };
    labelFontSizePx: (delta?: number, base?: number) => number;
    getLabelAlignment: (label?: any) => any;
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
    polygonVerticesOrdered: (polyIdx: number) => number[];
    segmentKey: (lineIdx: number, kind: 'segment' | 'rayLeft' | 'rayRight', i?: number) => string;
    lineExtent: (idx: number) => { center: { x: number; y: number } } | null;
    circleRadius: (c: any) => number;
    getLineHandle: (idx: number) => { x: number; y: number } | null;
    getLineRotateHandle: (idx: number) => { x: number; y: number } | null;
    getCircleHandle: (idx: number) => { x: number; y: number } | null;
    getCircleRotateHandle: (idx: number) => { x: number; y: number } | null;
    defaultLineLabelOffset: (lineIdx: number) => { x: number; y: number };
    defaultAngleLabelOffset: (angleIdx: number) => { x: number; y: number };
    drawSegmentTicks: typeof drawSegmentTicks;
    drawCircleTicks: typeof drawCircleTicks;
    drawArcTicks: typeof drawArcTicks;
    drawDiagonalHandle: typeof drawDiagonalHandle;
    drawRotateIcon: typeof drawRotateIcon;
    drawLabelText: typeof drawLabelText;
    applyStrokeStyle: (type: any) => void;
    applySelectionStyle: (ctx: CanvasRenderingContext2D, width: number, color: string) => void;
    isParallelLine: (line: any) => boolean;
    isPerpendicularLine: (line: any) => boolean;
    LABEL_PADDING_X: number;
    LABEL_PADDING_Y: number;
    pointRadius?: (size: number) => number;
    activeAxisSnap?: any;
    activeAxisSnaps?: Map<number, any>;
  }
) {
  if (!ctx) return;
  const getRuntime = (deps as any).getRuntime;
  const rt = getRuntime ? (() => {
    try { return getRuntime(); } catch { return null; }
  })() : null;
  const {
    showHidden,
    THEME,
    dpr,
    zoomFactor,
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

  // draw polygon fills (behind edges) — prefer runtime polygons when available
      if (rt) {
          Object.values(rt.polygons).forEach((polyRt: any) => {
            const polyIdx = model.indexById.polygon[polyRt.id];
            const poly = polygonGetLocal(model, polyIdx);
            if (!poly || !poly.fill) return;
          const verts = (polyRt.vertices || []).map((pid: string) => rt.points[pid]).filter(Boolean);
          if (verts.length < 3) return;
          const first = verts[0];
          ctx.save();
          const baseAlpha = poly.fillOpacity !== undefined ? poly.fillOpacity : 1;
          const outerAlpha = poly.hidden && showHidden ? 0.4 : 1;
          ctx.globalAlpha = outerAlpha * baseAlpha;
          ctx.fillStyle = poly.fill;
          ctx.beginPath();
          ctx.moveTo(first.x, first.y);
          for (let i = 1; i < verts.length; i++) {
            const p = verts[i];
            ctx.lineTo(p.x, p.y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        });
      } else {
    model.polygons.forEach((_: any, polyIdx: number) => {
      const poly = polygonGetLocal(model, polyIdx);
      if (!poly || !poly.fill) return;
      const verts = polygonVerticesOrdered(polyIdx);
      if (verts.length < 3) return;
      const first = model.points[verts[0]];
      if (!first) return;
      ctx.save();
      const baseAlpha = poly.fillOpacity !== undefined ? poly.fillOpacity : 1;
      const outerAlpha = poly.hidden && showHidden ? 0.4 : 1;
      ctx.globalAlpha = outerAlpha * baseAlpha;
      ctx.fillStyle = poly.fill;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < verts.length; i++) {
        const p = model.points[verts[i]];
        if (!p) continue;
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  }

  // draw lines (prefer runtime lines when available)
  if (rt) {
    Object.values(rt.lines).forEach((lRt: any) => {
      const lineIdx = model.indexById.line[lRt.id];
      const line = model.lines[lineIdx];
      if (!line || (line.hidden && !showHidden)) return;
      const pts = (lRt.pointIds || []).map((pid: string) => rt.points[pid]).filter(Boolean) as any[];
      if (pts.length < 2) return;
      const inSelectedPolygon =
        selectedPolygonIndex !== null && polygonHasLineLocal(model, selectedPolygonIndex, lineIdx);
      const lineSelected = selectedLineIndex === lineIdx || inSelectedPolygon;
      const highlightColor = isParallelLine(line) || isPerpendicularLine(line) ? '#9ca3af' : THEME.highlight;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const style = line.segmentStyles?.[i] ?? line.style;
        if (style.hidden && !showHidden) continue;
        const segKey = segmentKey(lineIdx, 'segment', i);
        const isSegmentSelected = selectedSegments.size > 0 && selectedSegments.has(segKey);
        const shouldHighlight = lineSelected && selectionEdges && (selectedSegments.size === 0 || isSegmentSelected);
        const segHidden = !!style.hidden || line.hidden;
        ctx.save();
        ctx.globalAlpha = segHidden && showHidden ? 0.4 : 1;
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
          applySelection(ctx, style.width, highlightColor);
        }
        ctx.restore();
      }
      // draw rays
      const first = pts[0];
      const last = pts[pts.length - 1];
      const dx = last.x - first.x;
      const dy = last.y - first.y;
      const len = Math.hypot(dx, dy) || 1;
      const dir = { x: dx / len, y: dy / len };
      const extend = (ctx.canvas.width + ctx.canvas.height) / dpr;
      if (line.leftRay && !(line.leftRay.hidden && !showHidden)) {
        ctx.strokeStyle = line.leftRay.color;
        ctx.lineWidth = renderWidth(line.leftRay.width);
        const hiddenRay = !!line.leftRay.hidden || line.hidden;
        ctx.save();
        ctx.globalAlpha = hiddenRay && showHidden ? 0.4 : 1;
        applyStroke(line.leftRay.type);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        ctx.lineTo(first.x - dir.x * extend, first.y - dir.y * extend);
        ctx.stroke();
        if (lineSelected && selectionEdges && (selectedSegments.size === 0 || selectedSegments.has(segmentKey(lineIdx, 'rayLeft')))) {
          ctx.beginPath();
          ctx.moveTo(first.x, first.y);
          ctx.lineTo(first.x - dir.x * extend, first.y - dir.y * extend);
          applySelection(ctx, line.leftRay.width, highlightColor);
        }
        ctx.restore();
      }
      if (line.rightRay && !(line.rightRay.hidden && !showHidden)) {
        ctx.strokeStyle = line.rightRay.color;
        ctx.lineWidth = renderWidth(line.rightRay.width);
        const hiddenRay = !!line.rightRay.hidden || line.hidden;
        ctx.save();
        ctx.globalAlpha = hiddenRay && showHidden ? 0.4 : 1;
        applyStroke(line.rightRay.type);
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(last.x + dir.x * extend, last.y + dir.y * extend);
        ctx.stroke();
        if (lineSelected && selectionEdges && (selectedSegments.size === 0 || selectedSegments.has(segmentKey(lineIdx, 'rayRight')))) {
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(last.x + dir.x * extend, last.y + dir.y * extend);
          applySelection(ctx, line.rightRay.width, highlightColor);
        }
        ctx.restore();
      }
      // handles and labels
      const handle = selectedLineIndex === lineIdx ? getLineHandle(lineIdx) : null;
      if (handle) {
        ctx.save();
        const size = (deps as any).HANDLE_SIZE ?? 14;
        ctx.translate(handle.x, handle.y);
        ctx.scale(1 / zoomFactor, 1 / zoomFactor);
        drawDiagHandle(ctx, size, THEME.preview);
        ctx.restore();
      }
      const rotateHandle = selectedLineIndex === lineIdx ? getLineRotateHandle(lineIdx) : null;
      if (rotateHandle) {
        ctx.save();
        const size = Math.max(10, Math.min((deps as any).HANDLE_SIZE ?? 14, 14));
        ctx.translate(rotateHandle.x, rotateHandle.y);
        ctx.scale(1 / zoomFactor, 1 / zoomFactor);
        drawRotIcon(ctx, size, THEME.palette[3] || '#f59e0b');
        ctx.restore();
      }
      if (line.label && !line.label.hidden) {
        const ext = lineExtent(lineIdx);
        if (ext) {
          if (!line.label.offset) line.label.offset = defaultLineLabelOffset(lineIdx);
          const off = line.label.offset ?? { x: 0, y: -10 };
          const selected = (selectedLabel?.kind === 'line' && selectedLabel.id === lineIdx) || multiSelectedLines.has(lineIdx);
          drawLblText(
            ctx,
            { text: line.label.text, color: line.label.color ?? THEME.defaultStroke, fontSize: line.label.fontSize, textAlign: line.label.textAlign },
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
        }
      }
      const snap = (activeAxisSnap && activeAxisSnap.lineIdx === lineIdx) ? activeAxisSnap : (activeAxisSnaps && activeAxisSnaps.get(lineIdx) ? { lineIdx, axis: activeAxisSnaps.get(lineIdx)!.axis, strength: activeAxisSnaps.get(lineIdx)!.strength } : null);
      if (snap) {
        const extent = lineExtent(lineIdx);
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
    });
  } else {
    model.lines.forEach((line: any, lineIdx: number) => {
      if (line.hidden && !showHidden) return;
      const pts = line.points.map((idx: number) => model.points[idx]).filter(Boolean) as any[];
      if (pts.length < 2) return;
      const inSelectedPolygon =
        selectedPolygonIndex !== null && polygonHasLineLocal(model, selectedPolygonIndex, lineIdx);
      const lineSelected = selectedLineIndex === lineIdx || inSelectedPolygon;
      const highlightColor = isParallelLine(line) || isPerpendicularLine(line) ? '#9ca3af' : THEME.highlight;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const style = line.segmentStyles?.[i] ?? line.style;
        if (style.hidden && !showHidden) {
          continue;
        }
        const segKey = segmentKey(lineIdx, 'segment', i);
        const isSegmentSelected = selectedSegments.size > 0 && selectedSegments.has(segKey);
        const shouldHighlight =
          lineSelected && selectionEdges && (selectedSegments.size === 0 || isSegmentSelected);
        const segHidden = !!style.hidden || line.hidden;
        ctx.save();
        ctx.globalAlpha = segHidden && showHidden ? 0.4 : 1;
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
          applySelection(ctx, style.width, highlightColor);
        }
        ctx.restore();
      }
      // draw rays if enabled
      const first = pts[0];
      const last = pts[pts.length - 1];
      const dx = last.x - first.x;
      const dy = last.y - first.y;
      const len = Math.hypot(dx, dy) || 1;
      const dir = { x: dx / len, y: dy / len };
      const extend = (ctx.canvas.width + ctx.canvas.height) / dpr;
      if (line.leftRay && !(line.leftRay.hidden && !showHidden)) {
        ctx.strokeStyle = line.leftRay.color;
        ctx.lineWidth = renderWidth(line.leftRay.width);
        const hiddenRay = !!line.leftRay.hidden || line.hidden;
        ctx.save();
        ctx.globalAlpha = hiddenRay && showHidden ? 0.4 : 1;
        applyStroke(line.leftRay.type);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        ctx.lineTo(first.x - dir.x * extend, first.y - dir.y * extend);
        ctx.stroke();
        if (
          lineSelected &&
          selectionEdges &&
          (selectedSegments.size === 0 || selectedSegments.has(segmentKey(lineIdx, 'rayLeft')))
        ) {
          ctx.beginPath();
          ctx.moveTo(first.x, first.y);
          ctx.lineTo(first.x - dir.x * extend, first.y - dir.y * extend);
          applySelection(ctx, line.leftRay.width, highlightColor);
        }
        ctx.restore();
      }
      if (line.rightRay && !(line.rightRay.hidden && !showHidden)) {
        ctx.strokeStyle = line.rightRay.color;
        ctx.lineWidth = renderWidth(line.rightRay.width);
        const hiddenRay = !!line.rightRay.hidden || line.hidden;
        ctx.save();
        ctx.globalAlpha = hiddenRay && showHidden ? 0.4 : 1;
        applyStroke(line.rightRay.type);
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(last.x + dir.x * extend, last.y + dir.y * extend);
        ctx.stroke();
        if (
          lineSelected &&
          selectionEdges &&
          (selectedSegments.size === 0 || selectedSegments.has(segmentKey(lineIdx, 'rayRight')))
        ) {
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(last.x + dir.x * extend, last.y + dir.y * extend);
          applySelection(ctx, line.rightRay.width, highlightColor);
        }
        ctx.restore();
      }
      // draw handle for pure segment (both rays hidden)
      const handle = selectedLineIndex === lineIdx ? getLineHandle(lineIdx) : null;
      if (handle) {
        ctx.save();
        const size = (deps as any).HANDLE_SIZE ?? 14;
        ctx.translate(handle.x, handle.y);
        ctx.scale(1 / zoomFactor, 1 / zoomFactor);
        drawDiagHandle(ctx, size, THEME.preview);
        ctx.restore();
      }
      // draw rotation handle
      const rotateHandle = selectedLineIndex === lineIdx ? getLineRotateHandle(lineIdx) : null;
      if (rotateHandle) {
        ctx.save();
        const size = Math.max(10, Math.min((deps as any).HANDLE_SIZE ?? 14, 14));
        ctx.translate(rotateHandle.x, rotateHandle.y);
        ctx.scale(1 / zoomFactor, 1 / zoomFactor);
        drawRotIcon(ctx, size, THEME.palette[3] || '#f59e0b');
        ctx.restore();
      }
      if (line.label && !line.label.hidden) {
        const ext = lineExtent(lineIdx);
        if (ext) {
          if (!line.label.offset) line.label.offset = defaultLineLabelOffset(lineIdx);
          const off = line.label.offset ?? { x: 0, y: -10 };
          const selected = (selectedLabel?.kind === 'line' && selectedLabel.id === lineIdx) || multiSelectedLines.has(lineIdx);
          drawLblText(
            ctx,
            { text: line.label.text, color: line.label.color ?? THEME.defaultStroke, fontSize: line.label.fontSize, textAlign: line.label.textAlign },
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
        }
      }
      // show axis indicator if either legacy single snap or per-line snap exists
      const snap = (activeAxisSnap && activeAxisSnap.lineIdx === lineIdx) ? activeAxisSnap : (activeAxisSnaps && activeAxisSnaps.get(lineIdx) ? { lineIdx, axis: activeAxisSnaps.get(lineIdx)!.axis, strength: activeAxisSnaps.get(lineIdx)!.strength } : null);
      if (snap) {
        const extent = lineExtent(lineIdx);
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
    });
  }
}

// Render circles and arcs (including handles, ticks and selection highlights).
export function renderCirclesAndArcs(
  ctx: CanvasRenderingContext2D | null,
  model: any,
  deps: {
    showHidden: boolean;
    THEME: any;
    dpr: number;
    renderWidth: (w: number) => number;
    screenUnits: (v: number) => number;
    circleRadius: (c: any) => number;
    circlePerimeterPoints: (c: any) => any[];
    circleArcs: (ci: number) => any[];
    drawCircleTicks: typeof drawCircleTicks;
    drawArcTicks: typeof drawArcTicks;
    selectedCircleIndex: number | null;
    selectedArcSegments: Set<string>;
    getCircleHandle: (idx: number) => { x: number; y: number } | null;
    getCircleRotateHandle: (idx: number) => { x: number; y: number } | null;
    drawDiagonalHandle: typeof drawDiagonalHandle;
    drawRotateIcon: typeof drawRotateIcon;
    zoomFactor?: number;
    selectionEdges: boolean;
    applySelectionStyle: (ctx: CanvasRenderingContext2D, width: number, color: string) => void;
    applyStrokeStyle?: (type: any) => void;
    THEMEpalette?: any;
    THEMEpreview?: any;
  }
) {
  if (!ctx) return;
  const getRuntime = (deps as any).getRuntime;
  if (getRuntime) {
    try {
      const rt = getRuntime();
      if (rt && model && Array.isArray(model.points)) {
        const originalModel = model;
        model = { ...originalModel, points: originalModel.points.map((p: any) => {
          try {
            const rp = rt.points?.[p.id];
            return rp ? { ...p, x: rp.x, y: rp.y } : p;
          } catch { return p; }
        }) };
      }
    } catch {}
  }
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
    selectedCircleIndex,
    selectedArcSegments,
    getCircleHandle,
    getCircleRotateHandle,
    drawDiagonalHandle: drawDiagHandle,
    drawRotateIcon: drawRotIcon,
    zoomFactor,
    selectionEdges,
    applySelectionStyle: applySelection
  } = deps as any;

  // draw circles
  model.circles.forEach((circle: any, idx: number) => {
    if (circle.hidden && !showHidden) return;
    const center = model.points[circle.center];
    if (!center) return;
    const radius = circleRadius(circle);
    if (radius <= 1e-3) return;
    const style = circle.style;
    const selected = selectedCircleIndex === idx && selectionEdges;
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
    if (selected && selectedCircleIndex === idx) {
      const ch = getCircleHandle(idx);
      if (ch) {
        ctx.save();
        const size = (deps as any).HANDLE_SIZE ?? 14;
        ctx.translate(ch.x, ch.y);
        ctx.scale(1 / ((deps as any).zoomFactor ?? 1), 1 / ((deps as any).zoomFactor ?? 1));
        drawDiagHandle(ctx, size, THEME.preview);
        ctx.restore();
      }
      const crh = getCircleRotateHandle(idx);
      if (crh) {
        ctx.save();
        const size = Math.max(10, Math.min((deps as any).HANDLE_SIZE ?? 14, 14));
        ctx.translate(crh.x, crh.y);
        ctx.scale(1 / ((deps as any).zoomFactor ?? 1), 1 / ((deps as any).zoomFactor ?? 1));
        drawRotIcon(ctx, size, THEME.palette?.[3] || '#f59e0b');
        ctx.restore();
      }
    }
    ctx.restore();
  });

  // draw arcs derived from circle points
  model.circles.forEach((circle: any, ci: number) => {
    if (circle.hidden && !showHidden) return;
    const arcs = circleArcs(ci);
    arcs.forEach((arc: any) => {
      if (arc.hidden && !showHidden) return;
      const center = arc.center;
      const style = arc.style;
      ctx.save();
      ctx.strokeStyle = style.color;
      ctx.lineWidth = renderWidth(style.width);
      (deps as any).applyStrokeStyle?.(style.type);
      ctx.beginPath();
      ctx.arc(center.x, center.y, arc.radius, arc.start, arc.end, arc.clockwise);
      ctx.stroke();
      const baseTick = (circle.style.tick ?? 0) as any;
      const arcTick = (style.tick ?? baseTick) as any;
      if (arcTick) drawArcTicks(center, arc.radius, arc.start, arc.end, arc.clockwise, arcTick, ctx, deps.screenUnits);
      const key = arc.key;
      const isSelected =
        (deps as any).selectedCircleIndex === ci && (selectedArcSegments.size === 0 || selectedArcSegments.has(key));
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
  model: any,
  deps: {
    showHidden: boolean;
    THEME: any;
    renderWidth: (w: number) => number;
    applyStrokeStyle: (t: any) => void;
    applySelectionStyle: (ctx: CanvasRenderingContext2D, width: number, color: string) => void;
    angleGeometry: (ang: any) => any;
    getAngleLegSeg: (angle: any, leg: 1 | 2) => number;
    defaultAngleLabelOffset: (angleIdx: number) => { x: number; y: number };
    drawLabelText: typeof drawLabelText;
    labelFontSizePx: (d?: number, b?: number) => number;
    getLabelAlignment: (label?: any) => any;
    dpr: number;
    RIGHT_ANGLE_MARK_MARGIN: number;
    RIGHT_ANGLE_MARK_MIN: number;
    RIGHT_ANGLE_MARK_MAX: number;
    RIGHT_ANGLE_MARK_RATIO: number;
    selectedAngleIndex: number | null;
    selectedLabel: any;
    multiSelectedAngles: Set<number>;
  }
) {
  if (!ctx) return;
  const getRuntime = (deps as any).getRuntime;
  if (getRuntime) {
    try {
      const rt = getRuntime();
      if (rt && model && Array.isArray(model.points)) {
        const originalModel = model;
        model = { ...originalModel, points: originalModel.points.map((p: any) => {
          try {
            const rp = rt.points?.[p.id];
            return rp ? { ...p, x: rp.x, y: rp.y } : p;
          } catch { return p; }
        }) };
      }
    } catch {}
  }
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
    selectedAngleIndex,
    selectedLabel,
    multiSelectedAngles
  } = deps as any;

  model.angles.forEach((ang: any, idx: number) => {
    if (ang.hidden && !showHidden) return;
    const leg1 = ang.leg1;
    const leg2 = ang.leg2;
    const resolveLine = (ref: any) => {
      if (typeof ref === 'number') return model.lines[ref];
      if (typeof ref === 'string') return model.lines[model.indexById?.line?.[ref]];
      return undefined;
    };
    const l1 = leg1 ? resolveLine(leg1.line) : undefined;
    const l2 = leg2 ? resolveLine(leg2.line) : undefined;
    if (!l1 || !l2) return;
    const v = model.points[ang.vertex];
    const seg1 = getAngleLegSeg(ang, 1);
    const seg2 = getAngleLegSeg(ang, 2);
    const a = model.points[l1.points[seg1]];
    const b = model.points[l1.points[seg1 + 1]];
    const c = model.points[l2.points[seg2]];
    const d = model.points[l2.points[seg2 + 1]];
    if (!v || !a || !b || !c || !d) return;
    const p1 = ang.vertex === l1.points[seg1] ? b : a;
    const p2 = ang.vertex === l2.points[seg2] ? d : c;
    const geom = angleGeometry(ang);
    if (!geom) return;
    const { start, end, clockwise, radius: r, style } = geom;
    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = renderWidth(style.width);
    applyStrokeStyle(style.type);
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
      const p1 = ang.vertex === l1.points[seg1] ? b : a;
      const p2 = ang.vertex === l2.points[seg2] ? d : c;
      const legLen1 = Math.hypot(p1.x - v.x, p1.y - v.y);
      const legLen2 = Math.hypot(p2.x - v.x, p2.y - v.y);
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
    const selected = selectedAngleIndex === idx;
    if (selected) {
      applySelectionStyle(ctx, style.width, THEME.highlight);
    }
    if (ang.label && !ang.label.hidden) {
      if (!ang.label.offset) ang.label.offset = defaultAngleLabelOffset(idx);
      const off = ang.label.offset ?? { x: 0, y: 0 };
      const selectedLbl = (selectedLabel?.kind === 'angle' && selectedLabel.id === idx) || multiSelectedAngles.has(idx);
      drawLabelText(
        ctx,
        { text: ang.label.text, color: ang.label.color ?? THEME.defaultStroke, fontSize: ang.label.fontSize, textAlign: ang.label.textAlign },
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
  model: any,
  deps: {
    showHidden: boolean;
    THEME: any;
    pointRadius: (size: number) => number;
    zoomFactor: number;
    defaultPointLabelOffset: (idx: number) => { x: number; y: number };
    drawLabelText: typeof drawLabelText;
    worldToCanvas: (x: number, y: number) => { x: number; y: number };
    labelFontSizePx: (d?: number, b?: number) => number;
    getLabelAlignment: (label?: any) => any;
    dpr: number;
    selectedPointIndex: number | null;
    mode?: string;
    circleThreePoints?: number[];
    hoverPointIndex?: number | null;
    selectedLineIndex?: number | null;
    selectionVertices?: boolean;
    pointInLine?: (idx: number, line: any) => boolean;
    selectedPolygonIndex?: number | null;
    polygonHasPoint?: (ptIdx: number, poly: any) => boolean;
    selectedCircleIndex?: number | null;
    circleHasDefiningPoint?: (c: any, ptIdx: number) => boolean;
    applySelectionStyle: (ctx: CanvasRenderingContext2D, width: number, color: string, forPoint?: boolean) => void;
  }
) {
  if (!ctx) return;
  const getRuntime = (deps as any).getRuntime;
  if (getRuntime) {
    try {
      const rt = getRuntime();
      if (rt && model && Array.isArray(model.points)) {
        const origModel = model;
        model = { ...origModel, points: origModel.points.map((p: any) => {
          try {
            const rp = rt.points?.[p.id];
            return rp ? { ...p, x: rp.x, y: rp.y } : p;
          } catch { return p; }
        }) };
      }
    } catch {}
  }
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
    applySelectionStyle
  } = deps as any;

  model.points.forEach((p: any, idx: number) => {
    if (p.style.hidden && !showHidden) return;
    const pointHidden = !!p.style.hidden;
    ctx.save();
    ctx.globalAlpha = pointHidden && showHidden ? 0.4 : 1;
    const r = pointRadius(p.style.size);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1 / zoomFactor, 1 / zoomFactor);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    if (p.style.hollow) {
      ctx.strokeStyle = p.style.color;
      const outlineWidth = Math.max(1, r * 0.45);
      ctx.lineWidth = outlineWidth;
      ctx.stroke();
      const innerRadius = Math.max(r - outlineWidth * 0.55, 0);
      ctx.beginPath();
      ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
      ctx.fillStyle = THEME.bg;
      ctx.fill();
    } else {
      ctx.fillStyle = p.style.color;
      ctx.fill();
    }
    ctx.restore();
    if (p.label && !p.label.hidden) {
      if (!p.label.offset) p.label.offset = defaultPointLabelOffset(idx);
      const off = p.label.offset ?? { x: 8, y: -8 };
      const selected = (deps as any).selectedLabel?.kind === 'point' && (deps as any).selectedLabel.id === idx || (deps as any).multiSelectedPoints?.has(idx);
      drawLabelText(
        ctx,
        { text: p.label.text, color: p.label.color ?? THEME.defaultStroke, fontSize: p.label.fontSize, textAlign: p.label.textAlign },
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
      idx === selectedPointIndex || (mode === 'circleThree' && (circleThreePoints || []).includes(idx));
    const hoverPoint = hoverPointIndex === idx;
    const highlightColor =
      p.construction_kind === 'intersection' || p.construction_kind === 'midpoint' || p.construction_kind === 'symmetric'
        ? '#9ca3af'
        : p.construction_kind === 'on_object'
        ? '#ef4444'
        : THEME.highlight;
    if (
      (highlightPoint ||
        hoverPoint ||
        (selectedLineIndex !== null && selectionVertices && pointInLine && pointInLine(idx, model.lines[selectedLineIndex])) ||
        (selectedPolygonIndex !== null && selectionVertices && polygonHasPoint && polygonHasPoint(idx, polygonGetLocal(model, selectedPolygonIndex))) ||
        (selectedCircleIndex !== null && selectionVertices && (
          circleHasDefiningPoint && circleHasDefiningPoint(model.circles[selectedCircleIndex], idx) ||
          (model.circles[selectedCircleIndex].circle_kind === 'center-radius' &&
            (model.circles[selectedCircleIndex].center === idx || model.circles[selectedCircleIndex].radius_point === idx))
        ))) &&
      (!p.style.hidden || showHidden)
    ) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(1 / zoomFactor, 1 / zoomFactor);
      ctx.beginPath();
      ctx.arc(0, 0, THEME.selectionPointRadius, 0, Math.PI * 2);
      applySelectionStyle(ctx, 2, highlightColor, true);
      ctx.restore();
    }
    ctx.restore();
  });
}

// Render free labels (model.labels)
export function renderFreeLabels(
  ctx: CanvasRenderingContext2D | null,
  model: any,
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
    multiSelectedLabels?: Set<number>;
  }
) {
  if (!ctx) return;
  const { showHidden, drawLabelText, worldToCanvas, labelFontSizePx, getLabelAlignment, dpr, THEME, LABEL_PADDING_X, LABEL_PADDING_Y, selectedLabel, multiSelectedLabels } = deps as any;
  model.labels.forEach((lab: any, idx: number) => {
    if (lab.hidden && !showHidden) return;
    const selected = (selectedLabel?.kind === 'free' && selectedLabel.id === idx) || (multiSelectedLabels?.has(idx));
    drawLabelText(ctx, { text: lab.text, color: lab.color, fontSize: lab.fontSize, textAlign: lab.textAlign }, lab.pos, selected, undefined, worldToCanvas, labelFontSizePx, getLabelAlignment, dpr, THEME.highlight, LABEL_PADDING_X, LABEL_PADDING_Y);
  });
}

// Render measurement labels (background + text) when showMeasurements is active
export function renderMeasurementLabels(
  ctx: CanvasRenderingContext2D | null,
  labels: any[],
  deps: {
    showMeasurements: boolean;
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
  const { showMeasurements, getMeasurementLabelText, zoomFactor, labelFontSizePx, THEME, dpr } = deps as any;
  if (!showMeasurements) return;
  labels.forEach((label: any) => {
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
  model: any,
  deps: {
    THEME: any;
    showHidden: boolean;
    multiSelectedPoints: Set<number>;
    multiSelectedLines: Set<number>;
    multiSelectedCircles: Set<number>;
    multiSelectedAngles: Set<number>;
    multiSelectedInkStrokes: Set<number>;
    zoomFactor: number;
    renderWidth: (w: number) => number;
    applySelectionStyle: (ctx: CanvasRenderingContext2D, width: number, color: string, forPoint?: boolean) => void;
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
  multiSelectedPoints.forEach((idx: number) => {
    const p = model.points[idx];
    if (!p) return;
    const r = (p.style.size ?? THEME.pointSize) + 2;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1 / zoomFactor, 1 / zoomFactor);
    ctx.beginPath();
    ctx.arc(0, 0, THEME.selectionPointRadius, 0, Math.PI * 2);
    applySelectionStyle(ctx, 2, THEME.highlight, true);
    ctx.restore();
  });

  // Lines
  multiSelectedLines.forEach((idx: number) => {
    const line = model.lines[idx];
    if (!line) return;
    line.points.forEach((pi: number, i: number) => {
      if (i === 0) return;
      const a = model.points[line.points[i - 1]];
      const b = model.points[pi];
      if (!a || !b) return;
      const style = line.segmentStyles?.[i - 1] ?? line.style;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      applySelectionStyle(ctx, style.width, THEME.highlight);
    });
  });

  // Circles
  multiSelectedCircles.forEach((idx: number) => {
    const circle = model.circles[idx];
    if (!circle) return;
    const center = model.points[circle.center];
    if (!center) return;
    const radius = circleRadius ? circleRadius(circle) : 0;
    const style = circle.style;
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
  multiSelectedAngles.forEach((idx: number) => {
    const ang = model.angles[idx];
    if (!ang) return;
    const geom = angleGeometry ? angleGeometry(ang) : null;
    if (!geom) return;
    const v = model.points[ang.vertex];
    if (!v) return;
    ctx.beginPath();
    ctx.arc(v.x, v.y, geom.radius, geom.start, geom.end, geom.clockwise);
    ctx.stroke();
  });

  // Ink strokes (bounding boxes)
  multiSelectedInkStrokes.forEach((idx: number) => {
    const stroke = model.inkStrokes[idx];
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
        result += char;
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

export function measureFormattedText(ctx: CanvasRenderingContext2D, text: string): number {
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

export function renderFormattedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
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

// Label layout and rendering helpers.
export function getLabelScreenDimensions(
  ctx: CanvasRenderingContext2D | null,
  label: Pick<any, 'text' | 'fontSize'>,
  labelFontSizePx: (delta?: number, base?: number) => number
) {
  if (!ctx) return { width: 0, height: 0, lines: [] as string[], lineWidths: [] as number[], lineHeight: 0 };
  const fontSize = labelFontSizePx(label.fontSize);
  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  let text = label.text;
  while (text.endsWith('\n')) text = text.slice(0, -1);
  const lines = text.split('\n');
  const lineHeight = fontSize * 1.2;
  let maxWidth = 0;
  const lineWidths: number[] = [];
  lines.forEach((line: string) => {
    const w = measureFormattedText(ctx!, line);
    lineWidths.push(w);
    if (w > maxWidth) maxWidth = w;
  });
  const totalHeight = lines.length * lineHeight;
  ctx.restore();
  return { width: maxWidth, height: totalHeight, lines, lineWidths, lineHeight };
}

export function drawLabelText(
  ctx: CanvasRenderingContext2D | null,
  label: Pick<any, 'text' | 'color' | 'fontSize' | 'textAlign'>,
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
  const { width: maxWidth, height: totalHeight, lines, lineWidths, lineHeight } = getLabelScreenDimensions(ctx, label as any, labelFontSizePx);
  const startY = -(totalHeight / 2) + lineHeight / 2;
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
  lines.forEach((line: string, i: number) => {
    const w = lineWidths[i];
    const y = startY + i * lineHeight;
    const startX = alignment === 'left' ? 0 : -w / 2;
    renderFormattedText(ctx!, line, startX, y);
  });
  ctx.restore();
}

// Draw debug overlay labels. This is a pure drawing routine that depends on
// caller-provided helpers (world<->canvas, geometry helpers, and flags).
export function drawDebugLabelsCanvas(
  ctx: CanvasRenderingContext2D | null,
  model: any,
  worldToCanvas: (x: number, y: number) => { x: number; y: number },
  screenUnits: (v: number) => number,
  pointRadius: (size: number) => number,
  zoomFactor: number,
  lineExtent: (idx: number) => { center: { x: number; y: number } } | null,
  circleRadius: (c: any) => number,
  polygonCentroid: (idx: number) => { x: number; y: number } | null,
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

  model.points.forEach((p: any) => {
    if (p.style.hidden && !showHidden) return;
    const topOffset = pointRadius(p.style.size) / zoomFactor + screenUnits(10);
    addLabel({ x: p.x, y: p.y - topOffset }, friendlyLabelForId(p.id));
  });
  model.lines.forEach((l: any, idx: number) => {
    if (l.hidden && !showHidden) return;
    const ext = lineExtent(idx);
    if (!ext) return;
    addLabel({ x: ext.center.x, y: ext.center.y - screenUnits(10) }, friendlyLabelForId(l.id));
  });
  model.circles.forEach((c: any) => {
    if (c.hidden && !showHidden) return;
    const center = model.points[c.center];
    if (!center) return;
    const radius = circleRadius(c);
    addLabel({ x: center.x, y: center.y - radius - screenUnits(10) }, friendlyLabelForId(c.id));
  });
  model.angles.forEach((a: any) => {
    const v = model.points[a.vertex];
    if (!v) return;
    addLabel({ x: v.x + screenUnits(12), y: v.y + screenUnits(12) }, friendlyLabelForId(a.id));
  });
  model.polygons.forEach((p: any, idx: number) => {
    const centroid = polygonCentroid(idx);
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
