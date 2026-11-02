export type CanvasEventsHandle = {
  setPointerRelease: (h: (ev: PointerEvent) => void) => void;
  dispose: () => void;
};

// Used by UI initialization.
export function initCanvasEvents(canvas: HTMLCanvasElement | null, handlers: {
  pointerdown?: (ev: PointerEvent) => void;
  dblclick?: (ev: MouseEvent) => void;
  pointermove?: (ev: PointerEvent) => void;
  penhover?: (ev: PointerEvent) => boolean;
  wheel?: (ev: WheelEvent) => void;
}): CanvasEventsHandle {
  if (!canvas) return { setPointerRelease: () => {}, dispose: () => {} };

  const attached: Array<() => void> = [];
  const activeCanvasPointerIds = new Set<number>();
  const hoverPenPointerIds = new Set<number>();

  let releaseHandler: ((ev: PointerEvent) => void) | null = null;
  const syncGlobalPointerDownFlag = () => {
    try {
      (window as any).__CONSTRIVIA_POINTER_DOWN = activeCanvasPointerIds.size > 0;
      (window as any).__CONSTRIVIA_POINTER_ID =
        activeCanvasPointerIds.size > 0 ? Array.from(activeCanvasPointerIds)[activeCanvasPointerIds.size - 1] : null;
    } catch {}
  };
  const onAnyPointerRelease = (ev: PointerEvent) => {
    // If the pointer started on the canvas, treat this as a release for canvas interactions,
    // even if the platform didn't deliver `pointerup`/`pointercancel` to the canvas.
    if (activeCanvasPointerIds.has(ev.pointerId) || hoverPenPointerIds.has(ev.pointerId)) {
      activeCanvasPointerIds.delete(ev.pointerId);
      hoverPenPointerIds.delete(ev.pointerId);
      try {
        releaseHandler?.(ev);
      } catch {
        // swallow
      }
    }
    syncGlobalPointerDownFlag();
  };

  // Release must be detected globally; some platforms/browsers won't deliver pointerup to the canvas
  // if pointer capture fails or the release happens outside the element.
  document.addEventListener('pointerup', onAnyPointerRelease, true);
  document.addEventListener('pointercancel', onAnyPointerRelease, true);
  attached.push(() => document.removeEventListener('pointerup', onAnyPointerRelease, true));
  attached.push(() => document.removeEventListener('pointercancel', onAnyPointerRelease, true));
  const onPenLeave = (ev: PointerEvent) => {
    if (hoverPenPointerIds.has(ev.pointerId) && !activeCanvasPointerIds.has(ev.pointerId)) onAnyPointerRelease(ev);
  };
  canvas.addEventListener('pointerleave', onPenLeave);
  attached.push(() => canvas.removeEventListener('pointerleave', onPenLeave));

  if (handlers.pointerdown) {
    const _ptrDown = (ev: PointerEvent) => {
      try {
        if ((typeof window !== 'undefined') && (((window as any).__CONSTRIVIA_DEBUG__) || ((window as any).CONSTRIVIA_DEBUG))) {
          // eslint-disable-next-line no-console
          console.debug('canvas.pointerdown (attached)', { clientX: ev.clientX, clientY: ev.clientY, pointerType: ev.pointerType, buttons: ev.buttons });
          try { /* also log element at point to diagnose overlays */
            // eslint-disable-next-line no-undef
            const el = document.elementFromPoint(ev.clientX, ev.clientY);
            // eslint-disable-next-line no-console
            console.debug('elementFromPoint', { tag: el?.tagName, id: el?.id, classes: el?.className });
          } catch (e) {}
        }
      } catch (e) {}
      handlers.pointerdown!(ev);
    };
    canvas.addEventListener('pointerdown', _ptrDown);
    attached.push(() => canvas.removeEventListener('pointerdown', _ptrDown));
    // track a simple global pointer-down flag to help infer pressed state
    // in pointermove handlers when the platform reports `buttons` inconsistently
    const _setDown = (e: PointerEvent) => {
      try {
        activeCanvasPointerIds.add(e.pointerId);
      } catch {}
      syncGlobalPointerDownFlag();
    };
    canvas.addEventListener('pointerdown', _setDown);
    attached.push(() => canvas.removeEventListener('pointerdown', _setDown));
  }
  if (handlers.dblclick) {
    canvas.addEventListener('dblclick', handlers.dblclick);
    attached.push(() => canvas.removeEventListener('dblclick', handlers.dblclick!));
  }
  if (handlers.pointermove) {
    const _docMove = (ev: PointerEvent) => {
      if (!activeCanvasPointerIds.has(ev.pointerId)) {
        // S Pen button changes may arrive only as pointermove, including
        // when the button was pressed before the pen entered the canvas.
        if (ev.pointerType === 'pen' && (ev.target === canvas || hoverPenPointerIds.has(ev.pointerId)) && handlers.penhover?.(ev)) {
          if (ev.buttons) hoverPenPointerIds.add(ev.pointerId);
          else hoverPenPointerIds.delete(ev.pointerId);
          if (ev.pressure > 0) {
            activeCanvasPointerIds.add(ev.pointerId);
            syncGlobalPointerDownFlag();
          }
        }
        return;
      }
      handlers.pointermove!(ev);
    };
    document.addEventListener('pointermove', _docMove, true);
    attached.push(() => document.removeEventListener('pointermove', _docMove, true));
  }
  if (handlers.wheel) {
    const _wheel = (ev: WheelEvent) => handlers.wheel!(ev);
    canvas.addEventListener('wheel', _wheel, { passive: false });
    attached.push(() => canvas.removeEventListener('wheel', _wheel as any));
  }

  const setPointerRelease = (h: (ev: PointerEvent) => void) => {
    releaseHandler = h;
  };

  const dispose = () => {
    attached.forEach((r) => r());
    releaseHandler = null;
    activeCanvasPointerIds.clear();
    hoverPenPointerIds.clear();
  };

  return { setPointerRelease, dispose };
}
