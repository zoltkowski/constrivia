import { describe, expect, it } from 'vitest';
import { intersectionTargetAtHit, type IntersectionTarget } from '../src/ui/intersectionSelection';

describe('intersection tool second object selection', () => {
  const line: IntersectionTarget = { kind: 'line', id: 'line' };
  const circle: IntersectionTarget = { kind: 'circle', id: 'circle' };
  it('selects the circle when the selected line also passes through the clicked circumference', () => {
    expect(intersectionTargetAtHit([line, line, circle], line)).toEqual(circle);
    expect(intersectionTargetAtHit([line, circle], null)).toEqual(line);
  });
  it('works at line-line and circle-circle crossings and still permits cancelling a lone selected object', () => {
    const line2: IntersectionTarget = { kind: 'line', id: 'other' };
    const circle2: IntersectionTarget = { kind: 'circle', id: 'other' };
    expect(intersectionTargetAtHit([line, line2], line)).toEqual(line2);
    expect(intersectionTargetAtHit([circle, circle2], circle)).toEqual(circle2);
    expect(intersectionTargetAtHit([line, circle], circle)).toEqual(line);
    expect(intersectionTargetAtHit([line], line)).toEqual(line);
    expect(intersectionTargetAtHit([], line)).toBeNull();
  });
});
