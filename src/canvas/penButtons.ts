/** Chromium on Android maps the primary barrel button to the tip's bit.
 * Only a zero-pressure hover provides evidence that this bit means a button.
 * Once touching, buttons=1 alone cannot distinguish tip from barrel release.
 */
export class PenButtonState {
  private hoverButtonPointerId: number | null = null;

  constructor(private readonly android: boolean) {}

  read(ev: PointerEvent) {
    if (ev.pointerType !== 'pen') return { pressed: false, contact: false };
    if (this.android) {
      if (ev.buttons === 1 && ev.pressure === 0) this.hoverButtonPointerId = ev.pointerId;
      else if (this.hoverButtonPointerId === ev.pointerId && ev.buttons !== 1) this.reset(ev.pointerId);
    }
    return {
      pressed: (ev.buttons & (2 | 32)) !== 0 || this.hoverButtonPointerId === ev.pointerId,
      contact: ev.pressure > 0 || (!this.android && (ev.buttons & 1) !== 0)
    };
  }

  reset(pointerId: number) {
    if (this.hoverButtonPointerId === pointerId) this.hoverButtonPointerId = null;
  }
}
