export type CanvasEventsHandle = {
  setPointerRelease: (h: (ev: PointerEvent) => void) => void;
  dispose: () => void;
};

// Used by UI initialization.
export function initCanvasEvents(canvas: HTMLCanvasElement | null, handlers: {
  pointerdown?: (ev: PointerEvent) => void;
  dblclick?: (ev: MouseEvent) => void;
  pointermove?: (ev: PointerEvent) => void;
}): CanvasEventsHandle {
  if (!canvas) return { setPointerRelease: () => {}, dispose: () => {} };

  const attached: Array<() => void> = [];

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
        (window as any).__CONSTRIVIA_POINTER_DOWN = true;
        (window as any).__CONSTRIVIA_POINTER_ID = e.pointerId;
      } catch {}
    };
    const _clearDown = (e: PointerEvent) => {
      try {
        if ((window as any).__CONSTRIVIA_POINTER_ID === e.pointerId) {
          (window as any).__CONSTRIVIA_POINTER_DOWN = false;
          (window as any).__CONSTRIVIA_POINTER_ID = null;
        }
      } catch {}
    };
    canvas.addEventListener('pointerdown', _setDown);
    attached.push(() => canvas.removeEventListener('pointerdown', _setDown));
    document.addEventListener('pointerup', _clearDown, true);
    document.addEventListener('pointercancel', _clearDown, true);
    attached.push(() => document.removeEventListener('pointerup', _clearDown, true));
    attached.push(() => document.removeEventListener('pointercancel', _clearDown, true));
  }
  if (handlers.dblclick) {
    canvas.addEventListener('dblclick', handlers.dblclick);
    attached.push(() => canvas.removeEventListener('dblclick', handlers.dblclick!));
  }
  if (handlers.pointermove) {
    canvas.addEventListener('pointermove', handlers.pointermove as any);
    attached.push(() => canvas.removeEventListener('pointermove', handlers.pointermove as any));
  }

  let releaseHandler: ((ev: PointerEvent) => void) | null = null;
  const setPointerRelease = (h: (ev: PointerEvent) => void) => {
    if (releaseHandler) {
      try { canvas.removeEventListener('pointerup', releaseHandler); } catch {}
      try { canvas.removeEventListener('pointercancel', releaseHandler); } catch {}
    }
    releaseHandler = h;
    canvas.addEventListener('pointerup', releaseHandler);
    canvas.addEventListener('pointercancel', releaseHandler);
  };

  const dispose = () => {
    attached.forEach((r) => r());
    if (releaseHandler) {
      try { canvas.removeEventListener('pointerup', releaseHandler); } catch {}
      try { canvas.removeEventListener('pointercancel', releaseHandler); } catch {}
      releaseHandler = null;
    }
  };

  return { setPointerRelease, dispose };
}
