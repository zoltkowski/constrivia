// Used by main UI flow.
export function makeCanvasHandlers(ctx: {
  canvas: HTMLCanvasElement | null;
  canvasToWorld: (x: number, y: number) => { x: number; y: number };
  getMode: () => string;
  findLabelAt: (p: { x: number; y: number }) => any;
  selectLabel: (l: any) => void;
  openStyleMenu: () => void;
  labelTextInput: HTMLTextAreaElement | null;
}) {
  const dblclick = (ev: MouseEvent) => {
    if (!ctx.canvas) return;
    const rect = ctx.canvas.getBoundingClientRect();
    const canvasX = ev.clientX - rect.left;
    const canvasY = ev.clientY - rect.top;
    const p = ctx.canvasToWorld(canvasX, canvasY);
    if (ctx.getMode() === 'move') {
      const labelHit = ctx.findLabelAt({ x: p.x, y: p.y });
      if (labelHit) {
        ev.preventDefault();
        ev.stopPropagation();
        ctx.selectLabel(labelHit);
        ctx.openStyleMenu();
        setTimeout(() => {
          if (ctx.labelTextInput) {
            ctx.labelTextInput.focus();
            ctx.labelTextInput.dispatchEvent(new Event('input'));
          }
        }, 50);
      }
    }
  };

  return { dblclick };
}

// Used by point tools.
export function makePointerHandlers(ctx: {
  canvas: HTMLCanvasElement | null;
  canvasToWorld: (x: number, y: number) => { x: number; y: number };
  onPointerMove?: (p: { x: number; y: number }, ev: PointerEvent) => void;
  onPointerRelease?: (ev: PointerEvent) => void;
}) {
  const pointermove = (ev: PointerEvent) => {
    if (!ctx.canvas) return;
    try {
      // if a global pointer-down flag exists, expose an override on the event
      try {
        if ((typeof window !== 'undefined') && (window as any).__CONSTRIVIA_POINTER_DOWN) (ev as any).__CONSTRIVIA_BUTTONS_OVERRIDE = 1;
        else delete (ev as any).__CONSTRIVIA_BUTTONS_OVERRIDE;
      } catch {}
      const buttons = (ev as any).__CONSTRIVIA_BUTTONS_OVERRIDE ?? ev.buttons;
      if ((typeof window !== 'undefined') && (((window as any).__CONSTRIVIA_DEBUG__) || ((window as any).CONSTRIVIA_DEBUG)) && ((buttons & 1) === 1)) {
        // eslint-disable-next-line no-console
        console.debug('makePointerHandlers.pointermove', { pointerType: ev.pointerType, buttons });
      }
    } catch (e) {}
    const rect = ctx.canvas.getBoundingClientRect();
    const canvasX = ev.clientX - rect.left;
    const canvasY = ev.clientY - rect.top;
    const p = ctx.canvasToWorld(canvasX, canvasY);
    if (ctx.onPointerMove) ctx.onPointerMove(p, ev);
  };

  const pointerRelease = (ev: PointerEvent) => {
    if (ctx.onPointerRelease) ctx.onPointerRelease(ev);
  };

  return { pointermove, pointerRelease };
}

// Used by point tools.
export function handlePointerMoveEarly(ev: PointerEvent, ctx: {
  updateTouchPointFromEvent: (ev: PointerEvent) => void;
  activeTouchesSize: () => number;
  startPinchFromTouches: () => void;
  pinchState: any;
  continuePinchGesture: () => void;
  getMode: () => string;
  eraserActive: () => boolean;
  eraseInkStrokeAtPoint: (p: { x: number; y: number }) => void;
  appendInkStrokePoint: (ev: PointerEvent) => void;
  multiselectBoxStart: () => { x: number; y: number } | null;
  multiselectBoxEndSet: (p: { x: number; y: number } | null) => void;
  canvasToWorld: (x: number, y: number) => { x: number; y: number };
  draw: () => void;
  toPoint: (ev: PointerEvent) => { x: number; y: number };
}): boolean {
  const buttons = (ev as any).__CONSTRIVIA_BUTTONS_OVERRIDE ?? ((typeof window !== 'undefined' && (window as any).__CONSTRIVIA_POINTER_DOWN) ? 1 : ev.buttons);
  if (ev.pointerType === 'touch') {
    ctx.updateTouchPointFromEvent(ev);
    if (ctx.activeTouchesSize() >= 2 && !ctx.pinchState) {
      ctx.startPinchFromTouches();
    }
    if (ctx.pinchState) {
      ctx.continuePinchGesture();
      ev.preventDefault();
      return true;
    }
  }
  if (ctx.getMode() === 'handwriting') {
    if (ctx.eraserActive()) {
      if ((buttons & 1) === 1) {
        ctx.eraseInkStrokeAtPoint(ctx.toPoint(ev));
      }
      return true;
    }
    ctx.appendInkStrokePoint(ev);
    return true;
  }
  if (ctx.getMode() === 'multiselect' && ctx.multiselectBoxStart() && (buttons === 1)) {
    const { x, y } = ctx.canvasToWorld(ev.clientX, ev.clientY);
    ctx.multiselectBoxEndSet({ x, y });
    ctx.draw();
    return true;
  }
  return false;
}

// Used by point tools.
export function handlePointerMoveTransforms(ev: PointerEvent, ctx: {
  getResizingMulti: () => any | null;
  getRotatingMulti: () => any | null;
  getPoint: (id: string) => any | null;
  setPoint: (id: string, p: any) => void;
  constrainToLineParent: (id: string, p: { x: number; y: number }) => { x: number; y: number };
  constrainToCircles: (id: string, p: { x: number; y: number }) => { x: number; y: number };
  updateMidpointsForPoint: (id: string) => void;
  updateCirclesForPoint: (id: string) => void;
  findLinesContainingPoint: (id: string) => string[];
  updateIntersectionsForLine: (lineId: string) => void;
  updateParallelLinesForLine?: (lineId: string) => void;
  updatePerpendicularLinesForLine?: (lineId: string) => void;
  applyFractionsToLine?: (lineId: string, fractions: number[]) => void;
  draw: () => void;
  markMovedDuringDrag: () => void;
  toPoint: (ev: PointerEvent) => { x: number; y: number };
}): boolean {
  const buttons = (ev as any).__CONSTRIVIA_BUTTONS_OVERRIDE ?? ((typeof window !== 'undefined' && (window as any).__CONSTRIVIA_POINTER_DOWN) ? 1 : ev.buttons);
  try {
    if ((typeof window !== 'undefined') && (((window as any).__CONSTRIVIA_DEBUG__) || ((window as any).CONSTRIVIA_DEBUG)) && ((buttons & 1) === 1)) {
      // eslint-disable-next-line no-console
      console.debug('handlePointerMoveTransforms', { pointerType: ev.pointerType, buttons });
    }
  } catch (e) {}
  const { x, y } = ctx.toPoint(ev);
  const resizingMulti = ctx.getResizingMulti();
  if (resizingMulti) {
    const { center, vectors, startHandleDist } = resizingMulti;
    const curDist = Math.max(1e-3, Math.hypot(x - center.x, y - center.y));
    const scale = curDist / Math.max(1e-3, startHandleDist);
    const touched = new Set<string>();
    vectors.forEach(({ idx, vx, vy }: { idx: string; vx: number; vy: number }) => {
      const p = ctx.getPoint(idx);
      if (!p) return;
      const tx = center.x + vx * scale;
      const ty = center.y + vy * scale;
      const constrained = ctx.constrainToCircles(idx, ctx.constrainToLineParent(idx, { x: tx, y: ty }));
      ctx.setPoint(idx, { ...p, ...constrained });
      touched.add(idx);
    });
    touched.forEach((pi) => {
      ctx.updateMidpointsForPoint(pi);
      ctx.updateCirclesForPoint(pi);
    });
    if (ctx.applyFractionsToLine && resizingMulti.dependentLines) {
      resizingMulti.dependentLines.forEach((fractions: number[], lineId: string) => {
        ctx.applyFractionsToLine && ctx.applyFractionsToLine(lineId, fractions);
      });
    }
    const affectedLines = new Set<string>();
    vectors.forEach((v: any) => ctx.findLinesContainingPoint(v.idx).forEach((li) => affectedLines.add(li)));
    affectedLines.forEach((li) => ctx.updateIntersectionsForLine(li));
    if (ctx.updateParallelLinesForLine) {
      affectedLines.forEach((li) => ctx.updateParallelLinesForLine && ctx.updateParallelLinesForLine(li));
    }
    if (ctx.updatePerpendicularLinesForLine) {
      affectedLines.forEach((li) => ctx.updatePerpendicularLinesForLine && ctx.updatePerpendicularLinesForLine(li));
    }
    ctx.draw();
    ctx.markMovedDuringDrag();
    return true;
  }
  const rotatingMulti = ctx.getRotatingMulti();
  if (rotatingMulti) {
    const { center, vectors, startAngle } = rotatingMulti;
    const ang = Math.atan2(y - center.y, x - center.x);
    const delta = ang - startAngle;
    const cos = Math.cos(delta);
    const sin = Math.sin(delta);
    const touched = new Set<string>();
    vectors.forEach(({ idx, vx, vy }: { idx: string; vx: number; vy: number }) => {
      const p = ctx.getPoint(idx);
      if (!p) return;
      const nx = center.x + (vx * cos - vy * sin);
      const ny = center.y + (vx * sin + vy * cos);
      const constrained = ctx.constrainToCircles(idx, ctx.constrainToLineParent(idx, { x: nx, y: ny }));
      ctx.setPoint(idx, { ...p, ...constrained });
      touched.add(idx);
    });
    touched.forEach((pi) => {
      ctx.updateMidpointsForPoint(pi);
      ctx.updateCirclesForPoint(pi);
    });
    if (ctx.applyFractionsToLine && rotatingMulti.dependentLines) {
      rotatingMulti.dependentLines.forEach((fractions: number[], lineId: string) => {
        ctx.applyFractionsToLine && ctx.applyFractionsToLine(lineId, fractions);
      });
    }
    const affectedLines = new Set<string>();
    touched.forEach((pi) => ctx.findLinesContainingPoint(pi).forEach((li) => affectedLines.add(li)));
    affectedLines.forEach((li) => ctx.updateIntersectionsForLine(li));
    if (ctx.updateParallelLinesForLine) {
      affectedLines.forEach((li) => ctx.updateParallelLinesForLine && ctx.updateParallelLinesForLine(li));
    }
    if (ctx.updatePerpendicularLinesForLine) {
      affectedLines.forEach((li) => ctx.updatePerpendicularLinesForLine && ctx.updatePerpendicularLinesForLine(li));
    }
    ctx.draw();
    ctx.markMovedDuringDrag();
    return true;
  }
  return false;
}

// Used by circle tools.
export function handlePointerMoveCircle(ev: PointerEvent, ctx: {
  getResizingCircle: () => any | null;
  getRotatingCircle: () => any | null;
  getResizingMulti: () => any | null;
  getCircle: (id: string) => any | null;
  getPoint: (id: string) => any | null;
  setPoint: (id: string, p: any) => void;
  constrainToLineParent: (id: string, p: { x: number; y: number }) => { x: number; y: number };
  constrainToCircles: (id: string, p: { x: number; y: number }) => { x: number; y: number };
  updateMidpointsForPoint: (id: string) => void;
  updateCirclesForPoint: (id: string) => void;
  updateIntersectionsForCircle: (circleId: string) => void;
  findLinesContainingPoint: (id: string) => string[];
  updateIntersectionsForLine: (lineId: string) => void;
  updateParallelLinesForLine?: (lineId: string) => void;
  updatePerpendicularLinesForLine?: (lineId: string) => void;
  draw: () => void;
  markMovedDuringDrag: () => void;
  toPoint: (ev: PointerEvent) => { x: number; y: number };
}): boolean {
  const buttons = (ev as any).__CONSTRIVIA_BUTTONS_OVERRIDE ?? ((typeof window !== 'undefined' && (window as any).__CONSTRIVIA_POINTER_DOWN) ? 1 : ev.buttons);
  try {
    if ((typeof window !== 'undefined') && (((window as any).__CONSTRIVIA_DEBUG__) || ((window as any).CONSTRIVIA_DEBUG)) && ((buttons & 1) === 1)) {
      // eslint-disable-next-line no-console
      console.debug('handlePointerMoveCircle', { pointerType: ev.pointerType, buttons });
    }
  } catch (e) {}
  const { x, y } = ctx.toPoint(ev);
  const resizingCircle = ctx.getResizingCircle();
  if (resizingCircle) {
    const { circleId, center, startRadius } = resizingCircle;
    const c = ctx.getCircle(circleId);
    if (c && c.circle_kind === 'three-point') {
      return true;
    }
    if (c) {
      const newRadius = Math.max(2, Math.hypot(x - center.x, y - center.y));
      const radiusPtIdx = c.radius_point;
      const dir = (() => {
        const len = Math.hypot(x - center.x, y - center.y) || 1;
        return { x: (x - center.x) / len, y: (y - center.y) / len };
      })();
      const target = { x: center.x + dir.x * newRadius, y: center.y + dir.y * newRadius };
      const rp = ctx.getPoint(radiusPtIdx);
      if (rp) {
        const constrained = ctx.constrainToCircles(radiusPtIdx, ctx.constrainToLineParent(radiusPtIdx, target));
        ctx.setPoint(radiusPtIdx, { ...rp, ...constrained });
        ctx.updateMidpointsForPoint(radiusPtIdx);
      }
      ctx.updateIntersectionsForCircle(circleId);
      ctx.markMovedDuringDrag();
      ctx.draw();
      return true;
    }
    // handle multi-resize fallback using resizingMulti if present
    const rm = ctx.getResizingMulti();
    if (rm) {
      const center = rm.center;
      const vectors = rm.vectors;
      const startHandleDist = rm.startHandleDist;
      const curDist = Math.max(1e-3, Math.hypot(x - center.x, y - center.y));
      const scale = curDist / Math.max(1e-3, startHandleDist);
      const touched = new Set<string>();
      vectors.forEach(({ idx, vx, vy }: { idx: string; vx: number; vy: number }) => {
        const p = ctx.getPoint(idx);
        if (!p) return;
        const tx = center.x + vx * scale;
        const ty = center.y + vy * scale;
        const constrained = ctx.constrainToCircles(idx, ctx.constrainToLineParent(idx, { x: tx, y: ty }));
        ctx.setPoint(idx, { ...p, ...constrained });
        touched.add(idx);
      });
      touched.forEach((pi) => {
        ctx.updateMidpointsForPoint(pi);
        ctx.updateCirclesForPoint(pi);
      });
      const affectedLines = new Set<string>();
      vectors.forEach((v: any) => ctx.findLinesContainingPoint(v.idx).forEach((li) => affectedLines.add(li)));
      affectedLines.forEach((li) => ctx.updateIntersectionsForLine(li));
      if (ctx.updateParallelLinesForLine) {
        affectedLines.forEach((li) => ctx.updateParallelLinesForLine && ctx.updateParallelLinesForLine(li));
      }
      if (ctx.updatePerpendicularLinesForLine) {
        affectedLines.forEach((li) => ctx.updatePerpendicularLinesForLine && ctx.updatePerpendicularLinesForLine(li));
      }
      ctx.markMovedDuringDrag();
      ctx.draw();
      return true;
    }
  }
  const rotatingCircle = ctx.getRotatingCircle();
  if (rotatingCircle) {
    const { center, vectors, startAngle, circleId } = rotatingCircle;
    const c = circleId ? ctx.getCircle(circleId) : null;
    if (c && c.circle_kind === 'three-point') {
      return true;
    }
    const ang = Math.atan2(y - center.y, x - center.x);
    const delta = ang - startAngle;
    const cos = Math.cos(delta);
    const sin = Math.sin(delta);
    const touched = new Set<string>();
    vectors.forEach(({ idx, vx, vy }: { idx: string; vx: number; vy: number }) => {
      const p = ctx.getPoint(idx);
      if (!p) return;
      const tx = center.x + (vx * cos - vy * sin);
      const ty = center.y + (vx * sin + vy * cos);
      const constrained = ctx.constrainToCircles(idx, ctx.constrainToLineParent(idx, { x: tx, y: ty }));
      ctx.setPoint(idx, { ...p, ...constrained });
      touched.add(idx);
    });
    if (circleId) {
      ctx.updateIntersectionsForCircle(circleId);
    }
    touched.forEach((pi) => {
      ctx.updateMidpointsForPoint(pi);
      ctx.updateCirclesForPoint(pi);
    });
    const affectedLines = new Set<string>();
    touched.forEach((pi) => ctx.findLinesContainingPoint(pi).forEach((li) => affectedLines.add(li)));
    affectedLines.forEach((li) => ctx.updateIntersectionsForLine(li));
    if (ctx.updateParallelLinesForLine) {
      affectedLines.forEach((li) => ctx.updateParallelLinesForLine && ctx.updateParallelLinesForLine(li));
    }
    if (ctx.updatePerpendicularLinesForLine) {
      affectedLines.forEach((li) => ctx.updatePerpendicularLinesForLine && ctx.updatePerpendicularLinesForLine(li));
    }
    ctx.markMovedDuringDrag();
    ctx.draw();
    return true;
  }
  return false;
}

// Used by line tools.
export function handlePointerMoveLine(ev: PointerEvent, ctx: {
  getResizingLine: () => any | null;
  getRotatingLine: () => any | null;
  getPoint: (id: string) => any | null;
  setPoint: (id: string, p: any) => void;
  constrainToLineParent: (id: string, p: { x: number; y: number }) => { x: number; y: number };
  constrainToCircles: (id: string, p: { x: number; y: number }) => { x: number; y: number };
  updateMidpointsForPoint: (id: string) => void;
  updateCirclesForPoint: (id: string) => void;
  findLinesContainingPoint: (id: string) => string[];
  enforceIntersections: (lineId: string) => void;
  updateParallelLinesForLine?: (lineId: string) => void;
  updatePerpendicularLinesForLine?: (lineId: string) => void;
  applyLineFractions?: (lineId: string) => void;
  lineExtent: (lineId: string) => any | null;
  draw: () => void;
  markMovedDuringDrag: () => void;
  toPoint: (ev: PointerEvent) => { x: number; y: number };
  setActiveAxisSnaps: (map: Map<string, { axis: 'horizontal' | 'vertical'; strength: number }>) => void;
  setActiveAxisSnap: (val: { lineId: string; axis: 'horizontal' | 'vertical'; strength: number } | null) => void;
  axisSnapWeight: (closeness: number) => number;
  LINE_SNAP_SIN_ANGLE: number;
  LINE_SNAP_INDICATOR_THRESHOLD: number;
}): boolean {
  const buttons = (ev as any).__CONSTRIVIA_BUTTONS_OVERRIDE ?? ((typeof window !== 'undefined' && (window as any).__CONSTRIVIA_POINTER_DOWN) ? 1 : ev.buttons);
  try {
    if ((typeof window !== 'undefined') && (((window as any).__CONSTRIVIA_DEBUG__) || ((window as any).CONSTRIVIA_DEBUG)) && ((buttons & 1) === 1)) {
      // eslint-disable-next-line no-console
      console.debug('handlePointerMoveLine', { pointerType: ev.pointerType, buttons });
    }
  } catch (e) {}
  const { x, y } = ctx.toPoint(ev);
  const resizingLine = ctx.getResizingLine();
  if (resizingLine) {
    const { center, dir, vectors, baseHalf, lines } = resizingLine;
    const vec = { x: x - center.x, y: y - center.y };
    const proj = vec.x * dir.x + vec.y * dir.y;
    const newHalf = Math.max(5, Math.abs(proj));
    const scale = newHalf / Math.max(baseHalf, 0.0001);
    const touched = new Set<string>();
    vectors.forEach(({ idx, vx, vy }: { idx: string; vx: number; vy: number }) => {
      const p = ctx.getPoint(idx);
      if (!p) return;
      const target = { x: center.x + vx * scale, y: center.y + vy * scale };
      const constrained = ctx.constrainToCircles(idx, ctx.constrainToLineParent(idx, target));
      ctx.setPoint(idx, { ...p, ...constrained });
      touched.add(idx);
    });
    if (lines && lines.forEach) lines.forEach((li: string) => ctx.enforceIntersections(li));
    touched.forEach((idx) => {
      ctx.updateMidpointsForPoint(idx);
      ctx.updateCirclesForPoint(idx);
    });
    const affected = new Set<string>();
    if (lines && lines.forEach) lines.forEach((li: string) => affected.add(li));
    else touched.forEach((pi) => ctx.findLinesContainingPoint(pi).forEach((li) => affected.add(li)));
    if (ctx.applyLineFractions) {
      affected.forEach((li) => ctx.applyLineFractions && ctx.applyLineFractions(li));
    }
    if (ctx.updateParallelLinesForLine) {
      affected.forEach((li) => ctx.updateParallelLinesForLine && ctx.updateParallelLinesForLine(li));
    }
    if (ctx.updatePerpendicularLinesForLine) {
      affected.forEach((li) => ctx.updatePerpendicularLinesForLine && ctx.updatePerpendicularLinesForLine(li));
    }
    try {
      const affectedLines = new Set<string>();
      const rotatingLine = ctx.getRotatingLine();
      if (rotatingLine && rotatingLine.lines && rotatingLine.lines.length) {
        rotatingLine.lines.forEach((li: string) => affectedLines.add(li));
      } else {
        touched.forEach((pi) => ctx.findLinesContainingPoint(pi).forEach((li) => affectedLines.add(li)));
      }
      let best: { lineId: string; axis: 'horizontal' | 'vertical'; strength: number } | null = null;
      affectedLines.forEach((li) => {
        const ext = ctx.lineExtent(li);
        if (!ext) return;
        const aPt = ext.startPoint ?? (ext.order && ext.order[0] ? ext.order[0] : null);
        const bPt = ext.endPoint ?? (ext.order && ext.order[ext.order.length - 1] ? ext.order[ext.order.length - 1] : null);
        const aObj = aPt ? { x: aPt.x, y: aPt.y } : null;
        const bObj = bPt ? { x: bPt.x, y: bPt.y } : null;
        if (!aObj || !bObj) return;
        const vx = bObj.x - aObj.x;
        const vy = bObj.y - aObj.y;
        const len = Math.hypot(vx, vy) || 1;
        const threshold = Math.max(1e-4, len * ctx.LINE_SNAP_SIN_ANGLE);
        if (Math.abs(vy) <= threshold) {
          const closeness = 1 - Math.min(Math.abs(vy) / threshold, 1);
          if (closeness >= ctx.LINE_SNAP_INDICATOR_THRESHOLD) {
            const strength = Math.min(1, Math.max(0, (closeness - ctx.LINE_SNAP_INDICATOR_THRESHOLD) / (1 - ctx.LINE_SNAP_INDICATOR_THRESHOLD)));
            if (!best || strength > best.strength) best = { lineId: li, axis: 'horizontal', strength };
          }
        } else if (Math.abs(vx) <= threshold) {
          const closeness = 1 - Math.min(Math.abs(vx) / threshold, 1);
          if (closeness >= ctx.LINE_SNAP_INDICATOR_THRESHOLD) {
            const strength = Math.min(1, Math.max(0, (closeness - ctx.LINE_SNAP_INDICATOR_THRESHOLD) / (1 - ctx.LINE_SNAP_INDICATOR_THRESHOLD)));
            if (!best || strength > best.strength) best = { lineId: li, axis: 'vertical', strength };
          }
        }

        
      });
      if (best) {
        ctx.setActiveAxisSnap(best);
      } else {
        ctx.setActiveAxisSnap(null);
      }
    } catch (e) {
      ctx.setActiveAxisSnap(null);
    }
    ctx.markMovedDuringDrag();
    ctx.draw();
    return true;
  } else if (ctx.getRotatingLine()) {
    const rotatingLine = ctx.getRotatingLine();
    const { center, vectors } = rotatingLine;
    const ang = Math.atan2(y - center.y, x - center.x);
    const delta = ang - rotatingLine.startAngle;
    const cos = Math.cos(delta);
    const sin = Math.sin(delta);
    const touched = new Set<string>();
    vectors.forEach(({ idx, vx, vy }: { idx: string; vx: number; vy: number }) => {
      const p = ctx.getPoint(idx);
      if (!p) return;
      const tx = center.x + vx * cos - vy * sin;
      const ty = center.y + vx * sin + vy * cos;
      const constrained = ctx.constrainToCircles(idx, ctx.constrainToLineParent(idx, { x: tx, y: ty }));
      ctx.setPoint(idx, { ...p, ...constrained });
      touched.add(idx);
    });
    const rotating = rotatingLine;
    if (rotating && rotating.lines) {
      rotating.lines.forEach((li: string) => ctx.enforceIntersections(li));
    } else {
      touched.forEach((pi) => {
        ctx.findLinesContainingPoint(pi).forEach((li) => ctx.enforceIntersections(li));
      });
    }
    touched.forEach((idx) => {
      ctx.updateMidpointsForPoint(idx);
      ctx.updateCirclesForPoint(idx);
    });
    const affected = new Set<string>();
    if (rotating && rotating.lines && rotating.lines.length) {
      rotating.lines.forEach((li: string) => affected.add(li));
    } else {
      touched.forEach((pi) => ctx.findLinesContainingPoint(pi).forEach((li) => affected.add(li)));
    }
    if (ctx.applyLineFractions) {
      affected.forEach((li) => ctx.applyLineFractions && ctx.applyLineFractions(li));
    }
    if (ctx.updateParallelLinesForLine) {
      affected.forEach((li) => ctx.updateParallelLinesForLine && ctx.updateParallelLinesForLine(li));
    }
    if (ctx.updatePerpendicularLinesForLine) {
      affected.forEach((li) => ctx.updatePerpendicularLinesForLine && ctx.updatePerpendicularLinesForLine(li));
    }
    ctx.markMovedDuringDrag();
    try {
      const affectedLines = new Set<string>();
      if (rotating && rotating.lines && rotating.lines.length) {
        rotating.lines.forEach((li: string) => affectedLines.add(li));
      } else {
        touched.forEach((pi) => ctx.findLinesContainingPoint(pi).forEach((li) => affectedLines.add(li)));
      }
      const snaps = new Map<string, { axis: 'horizontal' | 'vertical'; strength: number }>();
      affectedLines.forEach((li) => {
        const ext = ctx.lineExtent(li);
        if (!ext) return;
        const aPt = ext.startPoint ?? (ext.order && ext.order[0] ? ext.order[0] : null);
        const bPt = ext.endPoint ?? (ext.order && ext.order[ext.order.length - 1] ? ext.order[ext.order.length - 1] : null);
        if (!aPt || !bPt) return;
        const aObj = { x: aPt.x, y: aPt.y };
        const bObj = { x: bPt.x, y: bPt.y };
        const vx = bObj.x - aObj.x;
        const vy = bObj.y - aObj.y;
        const len = Math.hypot(vx, vy) || 1;
        const threshold = Math.max(1e-4, len * ctx.LINE_SNAP_SIN_ANGLE);
        if (Math.abs(vy) <= threshold) {
          const closeness = 1 - Math.min(Math.abs(vy) / threshold, 1);
          if (closeness >= ctx.LINE_SNAP_INDICATOR_THRESHOLD) {
            const strength = Math.min(1, Math.max(0, (closeness - ctx.LINE_SNAP_INDICATOR_THRESHOLD) / (1 - ctx.LINE_SNAP_INDICATOR_THRESHOLD)));
            snaps.set(li, { axis: 'horizontal', strength });
          }
        } else if (Math.abs(vx) <= threshold) {
          const closeness = 1 - Math.min(Math.abs(vx) / threshold, 1);
          if (closeness >= ctx.LINE_SNAP_INDICATOR_THRESHOLD) {
            const strength = Math.min(1, Math.max(0, (closeness - ctx.LINE_SNAP_INDICATOR_THRESHOLD) / (1 - ctx.LINE_SNAP_INDICATOR_THRESHOLD)));
            snaps.set(li, { axis: 'vertical', strength });
          }
        }
      });
      ctx.setActiveAxisSnaps(snaps);
      let best: { lineId: string; axis: 'horizontal' | 'vertical'; strength: number } | null = null;
      snaps.forEach((v, k) => {
        if (!best || v.strength > best.strength) best = { lineId: k, axis: v.axis, strength: v.strength };
      });
      ctx.setActiveAxisSnap(best);
    } catch (e) {
      ctx.setActiveAxisSnaps(new Map());
      ctx.setActiveAxisSnap(null);
    }
    ctx.draw();
    return true;
  }
  return false;
}

// Used by point tools.
export function handlePointerRelease(ev: PointerEvent, ctx: {
  removeTouchPoint: (id: number) => void;
  activeTouchesSize: () => number;
  pinchState: any;
  startPinchFromTouches: () => void;
  canvasReleasePointerCapture: (id: number) => void;
  getMode: () => string;
  multiselectBoxStart: () => { x: number; y: number } | null;
  multiselectBoxEnd: () => { x: number; y: number } | null;
  selectObjectsInBox: (b: { x1: number; y1: number; x2: number; y2: number }) => void;
  updateSelectionButtons: () => void;
  endInkStroke: (id: number) => void;
  clearDragState: () => void;
  getActiveAxisSnap: () => { lineId: string; axis: 'horizontal' | 'vertical'; strength?: number } | null;
  getActiveAxisSnaps: () => Map<string, { axis: 'horizontal' | 'vertical'; strength?: number }>;
  clearActiveAxisSnaps: () => void;
  enforceAxisAlignment: (lineId: string, axis: 'horizontal' | 'vertical') => void;
  markHistoryIfNeeded: () => void;
  resetEraserState: () => void;
  pushHistory: () => void;
  draw: () => void;
}) {
  if (ev.pointerType === 'touch') {
    ctx.removeTouchPoint(ev.pointerId);
    if (ctx.activeTouchesSize() >= 2 && !ctx.pinchState) {
      ctx.startPinchFromTouches();
    }
    try {
      ctx.canvasReleasePointerCapture(ev.pointerId);
    } catch (_) {
      /* ignore */
    }
  }

  // Finish multiselect box
  if (ctx.getMode() === 'multiselect' && ctx.multiselectBoxStart() && ctx.multiselectBoxEnd()) {
    const start = ctx.multiselectBoxStart()!;
    const end = ctx.multiselectBoxEnd()!;
    const x1 = Math.min(start.x, end.x);
    const y1 = Math.min(start.y, end.y);
    const x2 = Math.max(start.x, end.x);
    const y2 = Math.max(start.y, end.y);

    if (Math.abs(x2 - x1) > 5 || Math.abs(y2 - y1) > 5) {
      ctx.selectObjectsInBox({ x1, y1, x2, y2 });
      ctx.updateSelectionButtons();
    }
  }

  ctx.endInkStroke(ev.pointerId);
  try { ctx.canvasReleasePointerCapture(ev.pointerId); } catch {}

  ctx.clearDragState();

  const snaps: { lineId: string; axis: 'horizontal' | 'vertical'; strength?: number }[] = [];
  const active = ctx.getActiveAxisSnap();
  if (active) snaps.push(active);
  ctx.getActiveAxisSnaps().forEach((v, k) => snaps.push({ lineId: k, axis: v.axis, strength: v.strength }));
  ctx.clearActiveAxisSnaps();
  if (snaps.length) {
    snaps.forEach((s) => ctx.enforceAxisAlignment(s.lineId, s.axis));
    ctx.draw();
  }

  // Let caller decide about history/eraser push; call provided helper
  ctx.markHistoryIfNeeded();
  ctx.resetEraserState();
}

// Used by point tools.
export function handlePointerDownEarly(ev: PointerEvent, ctx: {
  canvas: HTMLCanvasElement | null;
  setPointerCapture: (id: number) => void;
  updateTouchPointFromEvent: (ev: PointerEvent) => void;
  activeTouchesSize: () => number;
  startPinchFromTouches: () => void;
  pinchState: any;
  getMode: () => string;
  eraserActive: () => boolean;
  resetEraserState: () => void;
  eraseInkStrokeAtPoint: (p: { x: number; y: number }) => void;
  beginInkStroke: (ev: PointerEvent) => void;
  toPoint: (ev: PointerEvent) => { x: number; y: number };
}): boolean {
  // Ensure pointer capture for non-touch so buttons state stays consistent.
  try {
    if (ev.pointerType !== 'touch') {
      ctx.setPointerCapture(ev.pointerId);
    }
  } catch {}

  if (ev.pointerType === 'touch') {
    ctx.updateTouchPointFromEvent(ev);
    try {
      ctx.setPointerCapture(ev.pointerId);
    } catch {}
    if (ctx.activeTouchesSize() >= 2) {
      if (!ctx.pinchState) ctx.startPinchFromTouches();
      ev.preventDefault();
      return true;
    }
  }

  if (ctx.getMode() === 'handwriting') {
    if (ctx.eraserActive()) {
      ctx.resetEraserState();
      ctx.eraseInkStrokeAtPoint(ctx.toPoint(ev));
      return true;
    }
    ctx.beginInkStroke(ev);
    return true;
  }

  return false;
}

// Used by point tools.
export function handleCanvasPointerMove(ev: PointerEvent, ctx: {
  // early
  updateTouchPointFromEvent: (ev: PointerEvent) => void;
  activeTouchesSize: () => number;
  startPinchFromTouches: () => void;
  pinchState: any;
  continuePinchGesture: () => void;
  getMode: () => string;
  eraserActive: () => boolean;
  eraseInkStrokeAtPoint: (p: { x: number; y: number }) => void;
  appendInkStrokePoint: (ev: PointerEvent) => void;
  multiselectBoxStart: () => { x: number; y: number } | null;
  multiselectBoxEndSet: (p: { x: number; y: number } | null) => void;
  canvasToWorld: (x: number, y: number) => { x: number; y: number };
  draw: () => void;
  toPoint: (ev: PointerEvent) => { x: number; y: number };
  // transforms
  getResizingMulti: () => any | null;
  getRotatingMulti: () => any | null;
  getPoint: (id: string) => any | null;
  setPoint: (id: string, p: any) => void;
  constrainToLineParent: (id: string, p: { x: number; y: number }) => { x: number; y: number };
  constrainToCircles: (id: string, p: { x: number; y: number }) => { x: number; y: number };
  updateMidpointsForPoint: (id: string) => void;
  updateCirclesForPoint: (id: string) => void;
  findLinesContainingPoint: (id: string) => string[];
  updateIntersectionsForLine: (lineId: string) => void;
  updateParallelLinesForLine?: (lineId: string) => void;
  updatePerpendicularLinesForLine?: (lineId: string) => void;
  applyFractionsToLine?: (lineId: string, fractions: number[]) => void;
  markMovedDuringDrag: () => void;
  // circle
  getResizingCircle: () => any | null;
  getRotatingCircle: () => any | null;
  getCircle: (id: string) => any | null;
  updateIntersectionsForCircle: (circleId: string) => void;
  // line
  getResizingLine: () => any | null;
  getRotatingLine: () => any | null;
  enforceIntersections: (lineId: string) => void;
  applyLineFractions?: (lineId: string) => void;
  lineExtent: (lineId: string) => any | null;
  setActiveAxisSnaps: (m: Map<string, { axis: 'horizontal' | 'vertical'; strength: number }>) => void;
  setActiveAxisSnap: (v: { lineId: string; axis: 'horizontal' | 'vertical'; strength: number } | null) => void;
  axisSnapWeight: (closeness: number) => number;
  LINE_SNAP_SIN_ANGLE: number;
  LINE_SNAP_INDICATOR_THRESHOLD: number;
}): boolean {
  try {
    if ((typeof window !== 'undefined') && (window as any).__CONSTRIVIA_DEBUG__) {
      // eslint-disable-next-line no-console
      console.debug('handleCanvasPointerMove entry', { pointerType: ev.pointerType, buttons: ev.buttons });
    }
  } catch (e) {}
  try {
    if (handlePointerMoveEarly(ev, {
      updateTouchPointFromEvent: ctx.updateTouchPointFromEvent,
      activeTouchesSize: ctx.activeTouchesSize,
      startPinchFromTouches: ctx.startPinchFromTouches,
      pinchState: ctx.pinchState,
      continuePinchGesture: ctx.continuePinchGesture,
      getMode: ctx.getMode,
      eraserActive: ctx.eraserActive,
      eraseInkStrokeAtPoint: ctx.eraseInkStrokeAtPoint,
      appendInkStrokePoint: ctx.appendInkStrokePoint,
      multiselectBoxStart: ctx.multiselectBoxStart,
      multiselectBoxEndSet: ctx.multiselectBoxEndSet,
      canvasToWorld: ctx.canvasToWorld,
      draw: ctx.draw,
      toPoint: ctx.toPoint
    })) {
      try { if ((window as any).__CONSTRIVIA_DEBUG__) console.debug('handleCanvasPointerMove: handled by early'); } catch {}
      return true;
    }
  } catch (e) {
    // fall through
  }
  try {
    if (handlePointerMoveTransforms(ev, {
      getResizingMulti: ctx.getResizingMulti,
      getRotatingMulti: ctx.getRotatingMulti,
      getPoint: ctx.getPoint,
      setPoint: ctx.setPoint,
      constrainToLineParent: ctx.constrainToLineParent,
      constrainToCircles: ctx.constrainToCircles,
      updateMidpointsForPoint: ctx.updateMidpointsForPoint,
      updateCirclesForPoint: ctx.updateCirclesForPoint,
      findLinesContainingPoint: ctx.findLinesContainingPoint,
      updateIntersectionsForLine: ctx.updateIntersectionsForLine,
      updateParallelLinesForLine: ctx.updateParallelLinesForLine,
      updatePerpendicularLinesForLine: ctx.updatePerpendicularLinesForLine,
      applyFractionsToLine: ctx.applyFractionsToLine,
      draw: ctx.draw,
      markMovedDuringDrag: ctx.markMovedDuringDrag,
      toPoint: ctx.toPoint
    })) {
      try { if ((window as any).__CONSTRIVIA_DEBUG__) console.debug('handleCanvasPointerMove: handled by transforms'); } catch {}
      return true;
    }
  } catch (e) {
    // continue
  }
  try {
    if (handlePointerMoveCircle(ev, {
      getResizingCircle: ctx.getResizingCircle,
      getRotatingCircle: ctx.getRotatingCircle,
      getResizingMulti: ctx.getResizingMulti,
      getCircle: ctx.getCircle,
      getPoint: ctx.getPoint,
      setPoint: ctx.setPoint,
      constrainToLineParent: ctx.constrainToLineParent,
      constrainToCircles: ctx.constrainToCircles,
      updateMidpointsForPoint: ctx.updateMidpointsForPoint,
      updateCirclesForPoint: ctx.updateCirclesForPoint,
      updateIntersectionsForCircle: ctx.updateIntersectionsForCircle,
      findLinesContainingPoint: ctx.findLinesContainingPoint,
      updateIntersectionsForLine: ctx.updateIntersectionsForLine,
      updateParallelLinesForLine: ctx.updateParallelLinesForLine,
      updatePerpendicularLinesForLine: ctx.updatePerpendicularLinesForLine,
      draw: ctx.draw,
      markMovedDuringDrag: ctx.markMovedDuringDrag,
      toPoint: ctx.toPoint
    })) {
      try { if ((window as any).__CONSTRIVIA_DEBUG__) console.debug('handleCanvasPointerMove: handled by circle'); } catch {}
      return true;
    }
  } catch (e) {
    // continue
  }
  try {
    if (handlePointerMoveLine(ev, {
      getResizingLine: ctx.getResizingLine,
      getRotatingLine: ctx.getRotatingLine,
      getPoint: ctx.getPoint,
      setPoint: ctx.setPoint,
      constrainToLineParent: ctx.constrainToLineParent,
      constrainToCircles: ctx.constrainToCircles,
      updateMidpointsForPoint: ctx.updateMidpointsForPoint,
      updateCirclesForPoint: ctx.updateCirclesForPoint,
      findLinesContainingPoint: ctx.findLinesContainingPoint,
      enforceIntersections: ctx.enforceIntersections,
      updateParallelLinesForLine: ctx.updateParallelLinesForLine,
      updatePerpendicularLinesForLine: ctx.updatePerpendicularLinesForLine,
      applyLineFractions: ctx.applyLineFractions,
      lineExtent: ctx.lineExtent,
      draw: ctx.draw,
      markMovedDuringDrag: ctx.markMovedDuringDrag,
      toPoint: ctx.toPoint,
      setActiveAxisSnaps: ctx.setActiveAxisSnaps,
      setActiveAxisSnap: ctx.setActiveAxisSnap,
      axisSnapWeight: ctx.axisSnapWeight,
      LINE_SNAP_SIN_ANGLE: ctx.LINE_SNAP_SIN_ANGLE,
      LINE_SNAP_INDICATOR_THRESHOLD: ctx.LINE_SNAP_INDICATOR_THRESHOLD
    })) {
      try { if ((window as any).__CONSTRIVIA_DEBUG__) console.debug('handleCanvasPointerMove: handled by line'); } catch {}
      return true;
    }
  } catch (e) {
    // noop
  }
  return false;
}
