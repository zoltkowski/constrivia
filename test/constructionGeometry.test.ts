import { describe, expect, it } from 'vitest';
import { angleGeometry } from '../src/core/angleTools';
import { angleSectorDegrees, hasDistinctPositions, regularPolygonFromBase } from '../src/core/constructionGeometry';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';

describe('regular shape construction input and geometry', () => {
  it.each([3, 4, 5, 8])('constructs a regular %i-gon on the exact base, also after a similarity', sides => {
    for (const [a, b] of [[{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: -23, y: 19 }, { x: 107, y: -61 }]]) {
      const vertices = regularPolygonFromBase(a, b, sides)!;
      expect(vertices[0]).toEqual(a);
      expect(vertices[1]).toEqual(b);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      for (let i = 0; i < sides; i++) {
        const p = vertices[i], q = vertices[(i + 1) % sides], r = vertices[(i + 2) % sides];
        expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeCloseTo(length, 8);
        const dot = (p.x - q.x) * (r.x - q.x) + (p.y - q.y) * (r.y - q.y);
        expect(dot / length ** 2).toBeCloseTo(Math.cos(Math.PI - 2 * Math.PI / sides), 8);
      }
    }
  });

  it('rejects repeated or coincident inputs instead of fabricating unit-length sides', () => {
    const a = { x: 10, y: 20 };
    for (const b of [{ ...a }, { x: NaN, y: 20 }, { x: Infinity, y: 20 }]) {
      expect(hasDistinctPositions(a, b)).toBe(false);
      for (const sides of [3, 4, 5]) expect(regularPolygonFromBase(a, b, sides)).toBeNull();
    }
    expect(regularPolygonFromBase(a, { x: 30, y: 20 }, 2)).toBeNull();
  });
});

describe('measurement agrees with the selected angle sector', () => {
  it.each([30, 90, 135, 180])('measures minor and exterior sectors of a %i degree angle after rotation', degrees => {
    const rt = makeEmptyRuntime();
    for (const rotation of [0, 2.8, -3.1]) {
      const radians = degrees * Math.PI / 180;
      rt.points = {
        v: { id: 'v', x: 40, y: 80, style: {} },
        a: { id: 'a', x: 40 + 100 * Math.cos(rotation), y: 80 + 100 * Math.sin(rotation), style: {} },
        b: { id: 'b', x: 40 + 100 * Math.cos(rotation + radians), y: 80 + 100 * Math.sin(rotation + radians), style: {} }
      };
      for (const exterior of [false, true]) {
        const angle = { id: 'angle', vertex: 'v', point1: 'a', point2: 'b', style: { exterior } };
        const geometry = angleGeometry(angle, { runtime: rt }, { radiusMargin: 4, minRadius: 8, defaultRadius: 30 })!;
        expect(angleSectorDegrees(geometry)).toBeCloseTo(exterior ? 360 - degrees : degrees, 8);
      }
    }
  });
});
