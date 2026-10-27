import { describe, expect, it } from 'vitest';
import { clampToolbarPosition } from '../src/ui/animationToolbar';

describe('animation toolbar placement', () => {
  it('retains a valid dragged location', () => {
    expect(clampToolbarPosition({ x: 40, y: 200 }, 244, 50, 390, 844)).toEqual({ x: 40, y: 200 });
  });
  it('keeps the entire toolbar on screen after dragging or resizing', () => {
    expect(clampToolbarPosition({ x: 900, y: 900 }, 244, 50, 390, 844)).toEqual({ x: 138, y: 786 });
    expect(clampToolbarPosition({ x: -50, y: -80 }, 244, 50, 390, 844)).toEqual({ x: 8, y: 8 });
  });
  it('keeps the floating player below the main toolbar', () => {
    expect(clampToolbarPosition({ x: 20, y: 0 }, 166, 50, 320, 844, 60)).toEqual({ x: 20, y: 60 });
  });
});
