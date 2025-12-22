import { describe, it, expect } from 'vitest';
import { createEmptyModel, addPoint, addLineFromPoints } from '../src/core/engineActions';
import { constrainPointToParentLine } from '../src/core/engine';
import type { StrokeStyle } from '../src/core/runtimeTypes';

describe('construction constraints', () => {
  it('keeps on-line points constrained to the parent line', () => {
    const model = createEmptyModel();
    const pointStyle = { color: '#ffffff', size: 4 };
    const lineStyle: StrokeStyle = { color: '#ffffff', width: 1, type: 'solid' };

    const p1 = addPoint(model, { x: 0, y: 0, style: pointStyle });
    const p2 = addPoint(model, { x: 10, y: 0, style: pointStyle });
    const lineId = addLineFromPoints(model, p1, p2, lineStyle);
    const p3 = addPoint(model, {
      x: 5,
      y: 0,
      style: pointStyle,
      defining_parents: [{ kind: 'line', id: lineId }]
    });

    const lineIdx = model.indexById.line[lineId];
    if (typeof lineIdx === 'number') {
      const line = model.lines[lineIdx];
      line.points = [p1, p3, p2];
      line.defining_points = [p1, p2];
    }

    const constrained = constrainPointToParentLine(model, p3, { x: 5, y: 7 });
    expect(constrained).not.toBeNull();
    expect(constrained!.x).toBeCloseTo(5);
    expect(constrained!.y).toBeCloseTo(0);
  });
});
