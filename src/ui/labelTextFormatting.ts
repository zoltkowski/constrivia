import type { Label, LabelTextStyle } from '../core/runtimeTypes';
import { applyLabelTextStyle, editLabelTextStyles, labelTextStyleAt } from './labelTextStyles';

export function initLabelTextFormatting(deps: {
  input: HTMLTextAreaElement;
  getLabel: () => Label | null;
  setLabel: (label: Label) => void;
  fontSize: (delta?: number) => number;
  onChange: () => void;
  onSelectionChange: () => void;
}) {
  const { input } = deps;
  const bold = document.getElementById('labelInlineBold') as HTMLButtonElement;
  const italic = document.getElementById('labelInlineItalic') as HTMLButtonElement;
  const clear = document.getElementById('labelInlineClear') as HTMLButtonElement;

  let beforeEdit: { start: number; end: number } | undefined;
  const selection = () => ({ start: input.selectionStart, end: input.selectionEnd });
  const scope = (label: Label) => {
    const { start, end } = selection();
    return end > start ? { start, end } : { start: 0, end: label.text.length };
  };
  const stylesInScope = (label: Label) => {
    const { start, end } = scope(label);
    return Array.from({ length: end - start }, (_, i) => labelTextStyleAt(label.textStyles, start + i));
  };
  const refresh = () => {
    const label = deps.getLabel();
    const styles = label ? stylesInScope(label) : [];
    const enabled = styles.length > 0;
    bold.disabled = italic.disabled = !enabled;
    clear.disabled = !label || input.selectionStart === input.selectionEnd;
    for (const [button, key] of [[bold, 'bold'], [italic, 'italic']] as const) {
      const active = enabled && styles.every(style => style[key]);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  };
  const apply = (patch: LabelTextStyle | null) => {
    const label = deps.getLabel();
    if (!label) return;
    const { start, end } = scope(label);
    const whole = input.selectionStart === input.selectionEnd;
    const next = { ...label };
    let rangePatch = patch;
    if (whole && patch?.color !== undefined) {
      next.color = patch.color;
      rangePatch = { color: undefined };
    }
    if (whole && patch?.fontSize !== undefined) {
      next.fontSize = patch.fontSize - deps.fontSize(0);
      rangePatch = { fontSize: undefined };
    }
    const textStyles = applyLabelTextStyle(label.text, label.textStyles, start, end, rangePatch);
    next.textStyles = textStyles.length ? textStyles : undefined;
    if (JSON.stringify(next) !== JSON.stringify(label)) {
      deps.setLabel(next);
      deps.onChange();
    }
    refresh();
  };
  const toggle = (key: 'bold' | 'italic') => {
    const label = deps.getLabel();
    const active = label && stylesInScope(label).every(style => style[key]);
    apply({ [key]: !active });
  };
  [bold, italic, clear].forEach(button => button.addEventListener('pointerdown', event => event.preventDefault()));
  bold.addEventListener('click', () => toggle('bold'));
  italic.addEventListener('click', () => toggle('italic'));
  clear.addEventListener('click', () => apply(null));
  input.addEventListener('beforeinput', event => {
    beforeEdit = selection();
    if (beforeEdit.start !== beforeEdit.end) return;
    if (event.inputType === 'deleteContentBackward' && beforeEdit.start > 0) {
      beforeEdit.start -= /[\uDC00-\uDFFF]/.test(input.value[beforeEdit.start - 1]) ? 2 : 1;
    } else if (event.inputType === 'deleteContentForward' && beforeEdit.end < input.value.length) {
      beforeEdit.end += String.fromCodePoint(input.value.codePointAt(beforeEdit.end)!).length;
    }
  });
  input.addEventListener('input', () => {
    const label = deps.getLabel();
    if (label && input.value !== label.text) {
      const textStyles = editLabelTextStyles(label.text, input.value, label.textStyles, beforeEdit);
      deps.setLabel({ ...label, text: input.value, textStyles: textStyles.length ? textStyles : undefined });
      deps.onChange();
    }
    beforeEdit = undefined;
    refresh();
  });
  ['select', 'keyup', 'pointerup', 'focus'].forEach(event => input.addEventListener(event, () => { refresh(); deps.onSelectionChange(); }));
  input.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && ['b', 'i'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      event.stopPropagation();
      toggle(event.key.toLowerCase() === 'b' ? 'bold' : 'italic');
    }
  });
  refresh();
  const size = () => {
    const label = deps.getLabel();
    if (!label) return null;
    const base = deps.fontSize(label.fontSize);
    if (input.selectionStart === input.selectionEnd) return base;
    return labelTextStyleAt(label.textStyles, input.selectionStart).fontSize ?? base;
  };
  const selectedColor = () => {
    if (input.selectionStart === input.selectionEnd) return undefined;
    return labelTextStyleAt(deps.getLabel()?.textStyles, input.selectionStart).color;
  };
  return { refresh, size, apply, selectedColor };
}
