import { expect, test } from 'vitest';

test('serialize angle leg.line when leg line is string id', () => {
  const model: any = {
    points: [{ id: 'pt1' }],
    lines: [{ id: 'ln1' }, { id: 'ln2' }]
  };
  const a: any = { vertex: 0, leg1: { line: 'ln1', otherPoint: 0 }, leg2: { line: 1, otherPoint: 0 } };

  const serializeLineRef = (ref: any) => {
    if (typeof ref === 'number') return model.lines[ref]?.id ?? null;
    if (typeof ref === 'string') return ref;
    return null;
  };

  const out: any = JSON.parse(JSON.stringify(a));
  out.leg1 = out.leg1 ? { ...out.leg1, line: serializeLineRef(a.leg1.line) } : out.leg1;
  out.leg2 = out.leg2 ? { ...out.leg2, line: serializeLineRef(a.leg2.line) } : out.leg2;

  expect(out.leg1.line).toBe('ln1');
  expect(out.leg2.line).toBe('ln2');
});
