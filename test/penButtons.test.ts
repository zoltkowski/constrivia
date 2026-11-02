import { describe, expect, it } from 'vitest';
import { PenButtonState, PenButtonToggle, usesAndroidPenButtons } from '../src/canvas/penButtons';

const event = (buttons: number, pressure: number, pointerId = 1, pointerType = 'pen') =>
  ({ buttons, pressure, pointerId, pointerType }) as PointerEvent;

describe('pen barrel button state', () => {
  it('detects Samsung desktop mode and Android platform hints', () => {
    expect(usesAndroidPenButtons('Linux SamsungBrowser/30.0')).toBe(true);
    expect(usesAndroidPenButtons('Linux Chrome/156.0', 'Android')).toBe(true);
    expect(usesAndroidPenButtons('Windows Chrome/156.0', 'Windows')).toBe(false);
  });
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

describe('Samsung pen eraser toggle', () => {
  it('toggles once per press and remains active after releasing the button', () => {
    const toggle = new PenButtonToggle();
    toggle.updatePressed(true);
    toggle.updatePressed(true);
    expect(toggle.active).toBe(true);
    toggle.updatePressed(false);
    expect(toggle.active).toBe(true);
    toggle.updatePressed(true);
    expect(toggle.active).toBe(false);
  });

  it('returns to writing only when the pen that actually erased is lifted', () => {
    const toggle = new PenButtonToggle();
    toggle.updatePressed(true);
    toggle.updatePressed(false);
    toggle.release(1); // Empty gesture.
    expect(toggle.active).toBe(true);
    toggle.markErased(1);
    toggle.release(2);
    expect(toggle.active).toBe(true);
    expect(toggle.release(1)).toBe(true);
    expect(toggle.active).toBe(false);
  });

  it('does not re-arm from continued holding after an erased stroke', () => {
    const toggle = new PenButtonToggle();
    toggle.updatePressed(true);
    toggle.markErased(1);
    toggle.release(1);
    toggle.updatePressed(true);
    expect(toggle.active).toBe(false);
    toggle.updatePressed(false);
    toggle.updatePressed(true);
    expect(toggle.active).toBe(true);
    toggle.reset();
    expect(toggle.active).toBe(false);
    expect(toggle.buttonDown).toBe(false);
  });
});
