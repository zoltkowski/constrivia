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

export function makePointerHandlers(ctx: {
  canvas: HTMLCanvasElement | null;
  canvasToWorld: (x: number, y: number) => { x: number; y: number };
  onPointerMove?: (p: { x: number; y: number }, ev: PointerEvent) => void;
  onPointerRelease?: (ev: PointerEvent) => void;
}) {
  const pointermove = (ev: PointerEvent) => {
    if (!ctx.canvas) return;
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
      if ((ev.buttons & 1) === 1) {
        ctx.eraseInkStrokeAtPoint(ctx.toPoint(ev));
      }
      return true;
    }
    ctx.appendInkStrokePoint(ev);
    return true;
  }
  if (ctx.getMode() === 'multiselect' && ctx.multiselectBoxStart() && (ev.buttons === 1)) {
    const { x, y } = ctx.canvasToWorld(ev.clientX, ev.clientY);
    ctx.multiselectBoxEndSet({ x, y });
    ctx.draw();
    return true;
  }
  return false;
}

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
  getActiveAxisSnap: () => { lineIdx: number; axis: 'horizontal' | 'vertical'; strength?: number } | null;
  getActiveAxisSnaps: () => Map<number, { axis: 'horizontal' | 'vertical'; strength?: number }>;
  clearActiveAxisSnaps: () => void;
  enforceAxisAlignment: (lineIdx: number, axis: 'horizontal' | 'vertical') => void;
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

  const snaps: { lineIdx: number; axis: 'horizontal' | 'vertical'; strength?: number }[] = [];
  const active = ctx.getActiveAxisSnap();
  if (active) snaps.push(active);
  ctx.getActiveAxisSnaps().forEach((v, k) => snaps.push({ lineIdx: k, axis: v.axis, strength: v.strength }));
  ctx.clearActiveAxisSnaps();
  if (snaps.length) {
    snaps.forEach((s) => ctx.enforceAxisAlignment(s.lineIdx, s.axis));
    ctx.draw();
  }

  // Let caller decide about history/eraser push; call provided helper
  ctx.markHistoryIfNeeded();
  ctx.resetEraserState();
}
