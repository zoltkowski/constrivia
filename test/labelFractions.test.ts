import { describe, expect, it } from 'vitest';
import { parseLabelFractions } from '../src/canvas/labelFractions';
import { autoAddBraces, getLabelScreenDimensions, renderFormattedText } from '../src/canvas/renderer';

describe('label fractions', () => {
  it('preserves explicit script groups inside fraction operands', () => {
    expect(autoAddBraces('A_{12}')).toBe('A_{12}');
    expect(autoAddBraces('B^{2}')).toBe('B^{2}');
  });
  it.each([
    ['A+B/C+D', [{ numerator: 'A+B', denominator: 'C+D' }]],
    ['A+ B/C +D', [{ text: 'A+ ' }, { numerator: 'B', denominator: 'C' }, { text: ' +D' }]],
    ['{długość podstawy}/{wysokość bryły}', [{ numerator: 'długość podstawy', denominator: 'wysokość bryły' }]],
    ['x={A + B}/{C + D}+y', [{ text: 'x=' }, { numerator: 'A + B', denominator: 'C + D' }, { text: '+y' }]],
    ['{A + B}/C', [{ numerator: 'A + B', denominator: 'C' }]],
    ['A/{B + C}', [{ numerator: 'A', denominator: 'B + C' }]],
    ['A_{12}/B^2', [{ numerator: 'A_{12}', denominator: 'B^2' }]],
    ['A/B C/D', [{ numerator: 'A', denominator: 'B' }, { text: ' ' }, { numerator: 'C', denominator: 'D' }]],
  ])('parses %s', (source, expected) => expect(parseLabelFractions(source as string)).toEqual(expected));

  it.each(['a/b/c', 'a / b', '/b', 'a/', '{}/b', '{a b/b', 'a/{b', 'a/{}', 'A_{1}', '{plain text}'])('keeps incomplete or ambiguous text: %s', source => {
    expect(parseLabelFractions(source)).toEqual([{ text: source }]);
  });

  it('uses rendered width and taller rows for bounds and centers numerator and denominator', () => {
    const drawn: { text: string; x: number; y: number }[] = [];
    const lines: number[][] = [];
    const ctx = {
      font: '20px sans-serif', fillStyle: '#000',
      save() {}, restore() {}, setLineDash() {}, beginPath() {}, stroke() {},
      measureText(text: string) { return { width: text.length * 10 }; },
      fillText(text: string, x: number, y: number) { drawn.push({ text, x, y }); },
      moveTo(x: number, y: number) { lines.push([x, y]); },
      lineTo(x: number, y: number) { lines.push([x, y]); },
    } as unknown as CanvasRenderingContext2D;
    const dimensions = getLabelScreenDimensions(ctx, { text: 'AB/C\nplain', fontSize: 20 }, () => 20);
    expect(dimensions.lineWidths).toEqual([28, 50]);
    expect(dimensions.lineHeights).toEqual([52, 24]);
    expect(dimensions.height).toBe(76);
    renderFormattedText(ctx, 'AB/C', 0, 0);
    expect(drawn).toEqual([{ text: 'A', x: 4, y: -13 }, { text: 'B', x: 14, y: -13 }, { text: 'C', x: 9, y: 13 }]);
    expect(lines).toEqual([[0, 0], [28, 0]]);
  });
});
