// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initCanvasEvents, type CanvasEventsHandle } from '../src/canvas/events';

let handle: CanvasEventsHandle;
afterEach(() => { handle?.dispose(); document.body.innerHTML = ''; });

function pen(target: EventTarget, type: string, buttons: number, pressure: number) {
  const ev = new MouseEvent(type, { bubbles: true, buttons });
  Object.defineProperties(ev, { pointerId: { value: 7 }, pointerType: { value: 'pen' }, pressure: { value: pressure } });
  target.dispatchEvent(ev);
}

describe('canvas pen hover routing', () => {
  it('releases hover-only buttons without marking the canvas as touched', () => {
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    const release = vi.fn(), move = vi.fn(), hover = vi.fn(() => true);
    handle = initCanvasEvents(canvas, { pointerdown: vi.fn(), pointermove: move, penhover: hover });
    handle.setPointerRelease(release);
    pen(canvas, 'pointermove', 1, 0);
    expect(hover).toHaveBeenCalledOnce();
    expect(move).not.toHaveBeenCalled();
    expect((window as any).__CONSTRIVIA_POINTER_DOWN).not.toBe(true);
    pen(document, 'pointerup', 0, 0);
    expect(release).toHaveBeenCalledOnce();
    pen(document, 'pointerup', 0, 0);
    expect(release).toHaveBeenCalledOnce();
  });

  it('tracks contact entering without pointerdown and continues outside the canvas', () => {
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    const release = vi.fn(), move = vi.fn(), hover = vi.fn(() => true);
    handle = initCanvasEvents(canvas, { pointermove: move, penhover: hover });
    handle.setPointerRelease(release);
    pen(document, 'pointermove', 2, .5);
    expect(hover).not.toHaveBeenCalled();
    pen(canvas, 'pointermove', 2, .5);
    expect(hover).toHaveBeenCalledOnce();
    pen(document, 'pointermove', 2, .5);
    expect(move).toHaveBeenCalledOnce();
    pen(document, 'pointercancel', 0, 0);
    expect(release).toHaveBeenCalledOnce();
    expect((window as any).__CONSTRIVIA_POINTER_DOWN).toBe(false);
  });

  it('clears a hover-only button on leave and removes listeners on disposal', () => {
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    const release = vi.fn(), hover = vi.fn(() => true);
    handle = initCanvasEvents(canvas, { pointermove: vi.fn(), penhover: hover });
    handle.setPointerRelease(release);
    pen(canvas, 'pointermove', 1, 0);
    pen(canvas, 'pointerleave', 1, 0);
    expect(release).toHaveBeenCalledOnce();
    handle.dispose();
    pen(canvas, 'pointermove', 1, 0);
    expect(hover).toHaveBeenCalledOnce();
  });
});
