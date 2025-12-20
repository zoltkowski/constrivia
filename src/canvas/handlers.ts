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
