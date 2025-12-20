export type CanvasEventHandlers = {
  handleCanvasClick: (ev: PointerEvent) => void;
  handleCanvasPointerMove: (ev: PointerEvent) => void;
  handlePointerRelease: (ev: PointerEvent) => void;
  handleCanvasDblClick?: (ev: MouseEvent) => void;
  handleCanvasWheel?: (ev: WheelEvent) => void;
};

export function initCanvasEvents(canvas: HTMLCanvasElement | null, handlers: CanvasEventHandlers) {
  if (!canvas) return () => {};
  const onPointerDown = (ev: PointerEvent) => handlers.handleCanvasClick(ev);
  const onDblClick = (ev: MouseEvent) => handlers.handleCanvasDblClick?.(ev);
  const onPointerMove = (ev: PointerEvent) => handlers.handleCanvasPointerMove(ev);
  const onPointerUp = (ev: PointerEvent) => handlers.handlePointerRelease(ev);
  const onWheel = (ev: WheelEvent) => handlers.handleCanvasWheel?.(ev);

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('dblclick', onDblClick);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return function cleanup() {
    try {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('dblclick', onDblClick);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
    } catch {
      // ignore
    }
  };
}
