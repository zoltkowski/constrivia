import { describe, expect, it, vi } from 'vitest';
import { handlePointerMoveCircle } from '../src/canvas/handlers';

function setup(hidden: boolean, useEngineMove: boolean) {
  const center = { x: 200, y: 200 };
  let point = { x: 140, y: 280, style: { hidden } };
  const ctx: Parameters<typeof handlePointerMoveCircle>[1] = {
    getResizingCircle: () => ({
      circleId: 'c', center, startRadius: 100, startHandleDist: 128,
      radiusDirection: { x: -0.6, y: 0.8 }
    }),
    getRotatingCircle: () => null,
    getResizingMulti: () => null,
    getCircle: () => ({ circle_kind: 'center-radius', radius_point: 'a' }),
    getPoint: () => point,
    setPoint: (_id, next) => { point = next; },
    constrainToLineParent: (_id, target) => target,
    constrainToCircles: (_id, target) => target,
    updateMidpointsForPoint: vi.fn(), updateCirclesForPoint: vi.fn(),
    updateIntersectionsForCircle: vi.fn(), findLinesContainingPoint: () => [],
    updateIntersectionsForLine: vi.fn(), draw: vi.fn(), markMovedDuringDrag: vi.fn(),
    toPoint: event => ({ x: event.clientX, y: event.clientY })
  };
  if (useEngineMove) ctx.applyPointMove = (_id, target) => { point = { ...point, ...target }; };
  const move = (x: number, y: number) => handlePointerMoveCircle({ clientX: x, clientY: y, buttons: 1 } as PointerEvent, ctx);
  return { center, point: () => point, move };
}

describe('circle scale handle', () => {
  it.each([false, true])('preserves the radius direction for a hidden=%s point through both movement paths', hidden => {
    for (const useEngineMove of [false, true]) {
      const h = setup(hidden, useEngineMove);
      expect(h.move(200, 378)).toBe(true);
      expect(h.point().x).toBeCloseTo(110);
      expect(h.point().y).toBeCloseTo(320);
      // Moving the cursor around the center at the same distance must not rotate the point.
      h.move(22, 200);
      expect(h.point().x).toBeCloseTo(110);
      expect(h.point().y).toBeCloseTo(320);
      expect(h.point().style.hidden).toBe(hidden);
      expect(h.center).toEqual({ x: 200, y: 200 });
    }
  });

  it('does not change the circle at the initial handle position or after returning there', () => {
    const h = setup(true, true);
    h.move(328, 200);
    expect(h.point()).toMatchObject({ x: 140, y: 280 });
    h.move(278, 200);
    expect(h.point()).toMatchObject({ x: 170, y: 240 });
    h.move(328, 200);
    expect(h.point()).toMatchObject({ x: 140, y: 280 });
  });

  it('keeps a positive minimum radius without flipping the defining point', () => {
    const h = setup(false, true);
    h.move(200, 200);
    expect(h.point().x).toBeCloseTo(198.8);
    expect(h.point().y).toBeCloseTo(201.6);
  });
});
