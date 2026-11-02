import { describe, expect, it } from 'vitest';
import { PenButtonState } from '../src/canvas/penButtons';

const event = (buttons: number, pressure: number, pointerId = 1, pointerType = 'pen') =>
  ({ buttons, pressure, pointerId, pointerType }) as PointerEvent;

describe('pen barrel button state', () => {
  it('recognizes standard barrel and eraser bits', () => {
    const state = new PenButtonState(false);
    for (const buttons of [2, 3, 32]) {
      expect(state.read(event(buttons, .5))).toEqual({ pressed: true, contact: true });
    }
    expect(state.read(event(1, .5))).toEqual({ pressed: false, contact: true });
    expect(state.read(event(2, 0))).toEqual({ pressed: true, contact: false });
  });

  it('uses Android hover evidence and retains it during contact until release', () => {
    const state = new PenButtonState(true);
    expect(state.read(event(0, 0))).toEqual({ pressed: false, contact: false });
    expect(state.read(event(1, 0))).toEqual({ pressed: true, contact: false });
    expect(state.read(event(1, .5))).toEqual({ pressed: true, contact: true });
    expect(state.read(event(1, 0))).toEqual({ pressed: true, contact: false });
    expect(state.read(event(0, 0))).toEqual({ pressed: false, contact: false });
    expect(state.read(event(1, .5))).toEqual({ pressed: false, contact: true });
  });

  it('does not infer a button from ordinary Android writing or other pointers', () => {
    const state = new PenButtonState(true);
    expect(state.read(event(1, .5)).pressed).toBe(false);
    state.read(event(1, 0));
    expect(state.read(event(1, .5, 2)).pressed).toBe(false);
    expect(state.read(event(2, .5, 1, 'mouse')).pressed).toBe(false);
    state.reset(1);
    expect(state.read(event(1, .5)).pressed).toBe(false);
  });

  it('does not enable the Android workaround on desktop pens', () => {
    expect(new PenButtonState(false).read(event(1, 0))).toEqual({ pressed: false, contact: true });
  });
});
