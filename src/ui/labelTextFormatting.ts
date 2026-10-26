import type { Label, LabelTextStyle } from '../core/runtimeTypes';
import { applyLabelTextStyle, editLabelTextStyles, labelTextStyleAt } from './labelTextStyles';

export function initLabelTextFormatting(deps: {
  input: HTMLTextAreaElement;
  getLabel: () => Label | null;
  setLabel: (label: Label) => void;
  fontSize: (delta?: number) => number;
  onChange: () => void;
}) {
  const { input } = deps;
  const bold = document.getElementById('labelInlineBold') as HTMLButtonElement;
  const italic = document.getElementById('labelInlineItalic') as HTMLButtonElement;
  const color = document.getElementById('labelInlineColor') as HTMLInputElement;
  const size = document.getElementById('labelInlineSize') as HTMLInputElement;
  const clear = document.getElementById('labelInlineClear') as HTMLButtonElement;
  const controls = [bold, italic, color, size, clear];
  let beforeEdit: { start: number; end: number } | undefined;
  const selection = () => ({ start: input.selectionStart, end: input.selectionEnd });
  const refresh = () => {
    const label = deps.getLabel();
    const { start, end } = selection();
    const enabled = !!label && end > start;
    controls.forEach(control => { control.disabled = !enabled; });
    const styles = Array.from({ length: end - start }, (_, i) => labelTextStyleAt(label?.textStyles, start + i));
    for (const [button, key] of [[bold, 'bold'], [italic, 'italic']] as const) {
      const active = enabled && styles.every(style => style[key]);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    const first = styles[0] ?? {};
    color.value = first.color ?? (/^#[\da-f]{6}$/i.test(label?.color ?? '') ? label!.color! : '#000000');
    const base = deps.fontSize(label?.fontSize);
    const firstSize = first.fontSize ?? base;
    size.value = styles.every(style => (style.fontSize ?? base) === firstSize) ? String(firstSize) : '';
  };
  const apply = (patch: LabelTextStyle | null) => {
    const label = deps.getLabel();
    const { start, end } = selection();
    if (!label || start === end) return;
    const textStyles = applyLabelTextStyle(label.text, label.textStyles, start, end, patch);
    if (JSON.stringify(textStyles) !== JSON.stringify(label.textStyles ?? [])) {
      deps.setLabel({ ...label, textStyles: textStyles.length ? textStyles : undefined });
      deps.onChange();
    }
    refresh();
  };
  const toggle = (key: 'bold' | 'italic') => {
    const label = deps.getLabel();
    const { start, end } = selection();
    const active = end > start && Array.from({ length: end - start }, (_, i) => labelTextStyleAt(label?.textStyles, start + i))
      .every(style => style[key]);
    apply({ [key]: !active });
  };
  [bold, italic, clear].forEach(button => button.addEventListener('pointerdown', event => event.preventDefault()));
  bold.addEventListener('click', () => toggle('bold'));
  italic.addEventListener('click', () => toggle('italic'));
  clear.addEventListener('click', () => apply(null));
  color.addEventListener('input', () => apply({ color: color.value }));
  size.addEventListener('change', () => {
    if (size.value !== '' && Number.isFinite(size.valueAsNumber)) {
      apply({ fontSize: Math.max(8, Math.min(48, Math.round(size.valueAsNumber))) });
    } else refresh();
  });
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
  ['select', 'keyup', 'pointerup', 'focus'].forEach(event => input.addEventListener(event, refresh));
  input.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && ['b', 'i'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      event.stopPropagation();
      toggle(event.key.toLowerCase() === 'b' ? 'bold' : 'italic');
    }
  });
  refresh();
  return { refresh };
}
