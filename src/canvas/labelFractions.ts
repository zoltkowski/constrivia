export type LabelPart = { text: string } | { numerator: string; denominator: string };

// Whitespace separates implicit operands, but never splits a balanced brace group.
export function parseLabelFractions(text: string): LabelPart[] {
  const parts: LabelPart[] = [];
  const append = (value: string) => {
    if (!value) return;
    const last = parts[parts.length - 1];
    if (last && 'text' in last) last.text += value;
    else parts.push({ text: value });
  };
  let start = 0;
  while (start < text.length) {
    if (/\s/.test(text[start])) { append(text[start++]); continue; }
    let end = start;
    const stack: number[] = [];
    const groups = new Map<number, number>();
    const slashes: number[] = [];
    let invalid = false;
    for (; end < text.length; end++) {
      const c = text[end];
      if (/\s/.test(c) && !stack.length) break;
      if (c === '{') stack.push(end);
      else if (c === '}') {
        const opening = stack.pop();
        if (opening === undefined) invalid = true;
        else { groups.set(opening, end); groups.set(end, opening); }
      } else if (c === '/' && !stack.length) slashes.push(end);
    }
    if (invalid || stack.length || slashes.length !== 1) {
      append(text.slice(start, end)); start = end; continue;
    }
    const slash = slashes[0];
    let left = start;
    let right = end;
    let numerator = text.slice(start, slash);
    let denominator = text.slice(slash + 1, end);
    const opening = groups.get(slash - 1);
    // Braces belonging to a sub/superscript are part of the implicit operand.
    if (text[slash - 1] === '}' && opening !== undefined &&
        !['_', '^'].includes(text[opening - 1])) {
      left = opening;
      numerator = text.slice(opening + 1, slash - 1);
    }
    const closing = groups.get(slash + 1);
    if (text[slash + 1] === '{' && closing !== undefined) {
      right = closing + 1;
      denominator = text.slice(slash + 2, closing);
    }
    if (!numerator.trim() || !denominator.trim()) append(text.slice(start, end));
    else {
      append(text.slice(start, left));
      parts.push({ numerator, denominator });
      append(text.slice(right, end));
    }
    start = end;
  }
  return parts;
}
