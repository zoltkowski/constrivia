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

  isHoverButtonPressed(pointerId: number) {
    return this.hoverButtonPointerId === pointerId;
  }
}

export function usesAndroidPenButtons(userAgent: string, platform = '') {
  return /Android|SamsungBrowser/i.test(userAgent) || platform === 'Android';
}

/** One button press arms the eraser until a second press or a successful stroke. */
export class PenButtonToggle {
  active = false;
  buttonDown = false;
  private erasedPointerId: number | null = null;

  updatePressed(pressed: boolean) {
    if (pressed && !this.buttonDown) this.active = !this.active;
    this.buttonDown = pressed;
  }

  markErased(pointerId: number) {
    if (this.active) this.erasedPointerId = pointerId;
  }

  release(pointerId: number) {
    if (this.erasedPointerId !== pointerId) return false;
    this.active = false;
    this.erasedPointerId = null;
    return true;
  }

  reset() {
    this.active = false;
    this.buttonDown = false;
    this.erasedPointerId = null;
  }
}
