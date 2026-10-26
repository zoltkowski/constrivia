import { describe, expect, it } from 'vitest';
import { applyLabelTextStyle, editLabelTextStyles, labelTextStyleAt } from '../src/ui/labelTextStyles';
import { getLabelScreenDimensions, renderFormattedText } from '../src/canvas/renderer';

describe('inline label styles', () => {
  it('combines overlapping attributes, toggles one off and clears only the selection', () => {
    let ranges = applyLabelTextStyle('ABCDE', [], 1, 4, { bold: true });
    ranges = applyLabelTextStyle('ABCDE', ranges, 2, 5, { italic: true, color: '#ff0000', fontSize: 24 });
    expect(labelTextStyleAt(ranges, 0)).toEqual({});
    expect(labelTextStyleAt(ranges, 2)).toEqual({ bold: true, italic: true, color: '#ff0000', fontSize: 24 });
    ranges = applyLabelTextStyle('ABCDE', ranges, 2, 3, { bold: false });
    expect(labelTextStyleAt(ranges, 2)).toEqual({ italic: true, color: '#ff0000', fontSize: 24 });
    ranges = applyLabelTextStyle('ABCDE', ranges, 2, 4, null);
    expect(ranges).toEqual([
      { start: 1, end: 2, bold: true },
      { start: 4, end: 5, italic: true, color: '#ff0000', fontSize: 24 },
    ]);
  });
  it('merges adjacent styles and accepts empty selections', () => {
    const ranges = applyLabelTextStyle('ABCD', [{ start: 0, end: 2, bold: true }], 2, 4, { bold: true });
    expect(ranges).toEqual([{ start: 0, end: 4, bold: true }]);
    expect(applyLabelTextStyle('ABCD', ranges, 1, 1, null)).toEqual(ranges);
  });
  it('limits imported font sizes and rejects invalid colors', () => {
    expect(labelTextStyleAt([{ start: 0, end: 1, fontSize: 999, color: 'url(evil)' }], 0)).toEqual({ fontSize: 48 });
  });
  it.each([
    ['ABCD', 'xABCD', 2, 4],
    ['ABCD', 'ACD', 1, 2],
    ['ABCD', 'ABxyzCD', 1, 6],
    ['ABCD', 'AD', 0, 0],
    ['ABCD', '', 0, 0],
  ])('keeps styles anchored after editing %s to %s', (before, after, start, end) => {
    const ranges = editLabelTextStyles(before as string, after as string, [{ start: 1, end: 3, bold: true }]);
    for (let i = 0; i < (after as string).length; i++) {
      expect(!!labelTextStyleAt(ranges, i).bold).toBe(i >= (start as number) && i < (end as number));
    }
  });
  it('uses the actual edit selection to disambiguate repeated characters', () => {
    const ranges = editLabelTextStyles('AAA', 'AAAA', [{ start: 1, end: 2, bold: true }], { start: 1, end: 1 });
    expect(ranges).toEqual([{ start: 2, end: 3, bold: true }]);
    expect(editLabelTextStyles('AAAA', 'AAA', ranges, { start: 0, end: 1 }))
      .toEqual([{ start: 1, end: 2, bold: true }]);
  });
  it('supports UTF-16 offsets across emoji and newlines', () => {
    const ranges = editLabelTextStyles('A😀\nB', 'A😀\nxB', [{ start: 4, end: 5, italic: true }]);
    expect(ranges).toEqual([{ start: 5, end: 6, italic: true }]);
  });
});

function canvas() {
  const drawn: { text: string; font: string; color: unknown; x: number; y: number }[] = [];
  const stack: { font: string; fillStyle: unknown }[] = [];
  const mock = {
    font: '20px sans-serif', fillStyle: '#000000',
    save() { stack.push({ font: this.font, fillStyle: this.fillStyle }); },
    restore() { Object.assign(this, stack.pop()); },
    measureText(text: string) { return { width: text.length * Number(this.font.match(/([\d.]+)px/)?.[1]) / 2 * (this.font.includes('bold') ? 1.2 : 1) }; },
    fillText(text: string, x: number, y: number) { drawn.push({ text, font: this.font, color: this.fillStyle, x, y }); },
    setLineDash() {}, beginPath() {}, stroke() {}, moveTo() {}, lineTo() {},
  };
  return { ctx: mock as unknown as CanvasRenderingContext2D, drawn };
}

describe('formatted canvas labels', () => {
  it('keeps script and math layout unchanged when applying only a color', () => {
    const { ctx } = canvas();
    const text = 'A^2 + B_1\n√{A/B}';
    expect(getLabelScreenDimensions(ctx, { text, textStyles: [{ start: 0, end: text.length, color: '#ff0000' }] }, () => 20))
      .toEqual(getLabelScreenDimensions(ctx, { text }, () => 20));
  });
  it('measures and paints mixed styles using the same font metrics', () => {
    const { ctx, drawn } = canvas();
    const textStyles = [{ start: 1, end: 2, bold: true, italic: true, color: '#ff0000', fontSize: 40 }];
    const dim = getLabelScreenDimensions(ctx, { text: 'ABC\nD', textStyles }, () => 20);
    expect(dim.lineWidths).toEqual([44, 10]);
    expect(dim.lineHeights).toEqual([48, 24]);
    renderFormattedText(ctx, 'ABC', 0, 0, textStyles);
    expect(drawn.map(g => [g.text, g.font, g.color, g.x])).toEqual([
      ['A', '20px sans-serif', '#000000', 0],
      ['B', 'italic bold 40px sans-serif', '#ff0000', 10],
      ['C', '20px sans-serif', '#000000', 34],
    ]);
    expect(ctx.font).toBe('20px sans-serif');
    expect(ctx.fillStyle).toBe('#000000');
  });
  it.each(['A_12', 'A_{12}', 'A^12', 'A^{12}'])('preserves script positioning and weight in %s', text => {
    const { ctx, drawn } = canvas();
    renderFormattedText(ctx, text, 0, 0, [{ start: 0, end: text.length, bold: true }]);
    expect(drawn.map(g => g.text).join('')).toBe('A12');
    expect(drawn[1].font).toBe('bold 14px sans-serif');
    expect(drawn[1].y).toBe(text.includes('_') ? 6 : -8);
  });
  it.each(['{A/B}/C', '√{A/B}', 'A/{B/C}', '√√A'])('preserves nested math and character colors in %s', text => {
    const { ctx, drawn } = canvas();
    const last = text.length - 1;
    const target = text[last] === '}' ? last - 1 : last;
    renderFormattedText(ctx, text, 0, 0, [{ start: target, end: target + 1, color: '#ff0000' }]);
    expect(drawn.find(g => g.text === text[target])?.color).toBe('#ff0000');
    expect(drawn.filter(g => g.color === '#ff0000')).toHaveLength(1);
  });
});
