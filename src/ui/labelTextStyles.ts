import type { LabelTextStyle, LabelTextStyleRange } from '../core/runtimeTypes';

export function labelTextStyleAt(ranges: LabelTextStyleRange[] | undefined, index: number): LabelTextStyle {
  const style: LabelTextStyle = {};
  for (const range of ranges ?? []) {
    if (range.start <= index && index < range.end) {
      if (typeof range.bold === 'boolean') style.bold = range.bold;
      if (typeof range.italic === 'boolean') style.italic = range.italic;
      if (/^#[\da-f]{6}$/i.test(range.color ?? '')) style.color = range.color;
      if (Number.isFinite(range.fontSize)) style.fontSize = Math.max(8, Math.min(48, range.fontSize!));
    }
  }
  return style;
}

function compactStyles(styles: LabelTextStyle[]): LabelTextStyleRange[] {
  const result: LabelTextStyleRange[] = [];
  styles.forEach((style, index) => {
    const clean: LabelTextStyle = {};
    if (style.bold) clean.bold = true;
    if (style.italic) clean.italic = true;
    if (style.color) clean.color = style.color;
    if (style.fontSize !== undefined) clean.fontSize = style.fontSize;
    if (!Object.keys(clean).length) return;
    const last = result[result.length - 1];
    if (last?.end === index && last.bold === clean.bold && last.italic === clean.italic &&
        last.color === clean.color && last.fontSize === clean.fontSize) last.end++;
    else result.push({ start: index, end: index + 1, ...clean });
  });
  return result;
}

export function applyLabelTextStyle(text: string, ranges: LabelTextStyleRange[] | undefined,
  start: number, end: number, patch: LabelTextStyle | null): LabelTextStyleRange[] {
  return compactStyles(Array.from({ length: text.length }, (_, index) => {
    const style = labelTextStyleAt(ranges, index);
    return index >= start && index < end ? (patch === null ? {} : { ...style, ...patch }) : style;
  }));
}

// Preserve styles around edits and let inserted text inherit the replaced text/left neighbour.
export function editLabelTextStyles(before: string, after: string, ranges: LabelTextStyleRange[] | undefined,
  selection?: { start: number; end: number }): LabelTextStyleRange[] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  // beforeinput disambiguates edits within repeated characters and selected replacements.
  const insertedEnd = selection ? selection.end + after.length - before.length : -1;
  if (selection && insertedEnd >= selection.start && before.slice(0, selection.start) === after.slice(0, selection.start) &&
      before.slice(selection.end) === after.slice(insertedEnd)) {
    start = selection.start;
    oldEnd = selection.end;
    newEnd = insertedEnd;
  }
  const inherited = labelTextStyleAt(ranges, oldEnd > start ? start : Math.max(0, start - 1));
  return compactStyles(Array.from({ length: after.length }, (_, index) => index < start
    ? labelTextStyleAt(ranges, index)
    : index < newEnd ? inherited : labelTextStyleAt(ranges, index + oldEnd - newEnd)));
}
