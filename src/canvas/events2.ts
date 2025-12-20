export type CanvasEventsHandle = {
  setPointerRelease: (h: (ev: PointerEvent) => void) => void;
  dispose: () => void;
};

export function initCanvasEvents(canvas: HTMLCanvasElement | null, handlers: {
  pointerdown?: (ev: PointerEvent) => void;
  dblclick?: (ev: MouseEvent) => void;
  pointermove?: (ev: PointerEvent) => void;
}): CanvasEventsHandle {
  if (!canvas) return { setPointerRelease: () => {}, dispose: () => {} };

  const attached: Array<() => void> = [];

  if (handlers.pointerdown) {
    canvas.addEventListener('pointerdown', handlers.pointerdown);
    attached.push(() => canvas.removeEventListener('pointerdown', handlers.pointerdown!));
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
