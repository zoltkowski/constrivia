export type CanvasEventsHandle = {
  setPointerRelease: (h: (ev: PointerEvent) => void) => void;
  dispose: () => void;
};

// Used by UI initialization.
export function initCanvasEvents(canvas: HTMLCanvasElement | null, handlers: {
  pointerdown?: (ev: PointerEvent) => void;
  dblclick?: (ev: MouseEvent) => void;
  pointermove?: (ev: PointerEvent) => void;
  wheel?: (ev: WheelEvent) => void;
}): CanvasEventsHandle {
  if (!canvas) return { setPointerRelease: () => {}, dispose: () => {} };

  const attached: Array<() => void> = [];
  const activeCanvasPointerIds = new Set<number>();

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
    if (activeCanvasPointerIds.has(ev.pointerId)) {
      activeCanvasPointerIds.delete(ev.pointerId);
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
      if (!activeCanvasPointerIds.has(ev.pointerId)) return;
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
  };

  return { setPointerRelease, dispose };
}
