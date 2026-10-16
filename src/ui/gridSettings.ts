import type { GridSettings } from '../canvas/grid';

export function initGridSettings(get: () => GridSettings, set: (value: GridSettings) => void, refreshPreview: () => void) {
  const color = document.getElementById('gridColor') as HTMLInputElement;
  const opacity = document.getElementById('gridOpacity') as HTMLInputElement;
  const width = document.getElementById('gridWidth') as HTMLInputElement;
  const dots = document.getElementById('gridDotsOnly') as HTMLInputElement;
  const visible = document.getElementById('gridVisible') as HTMLInputElement;
  const refresh = () => {
    const grid = get();
    color.value = grid.color;
    opacity.value = String(Math.round(grid.opacity * 100));
    width.value = String(grid.width);
    dots.checked = grid.dotsOnly;
    visible.checked = grid.visible;
    document.getElementById('gridOpacityValue')!.textContent = `${opacity.value}%`;
    document.getElementById('gridWidthValue')!.textContent = `${width.value} px`;
    refreshPreview();
  };
  const update = () => {
    set({ ...get(), visible: visible.checked, color: color.value, opacity: Number(opacity.value) / 100, width: Number(width.value), dotsOnly: dots.checked });
    refresh();
  };
  [color, opacity, width, dots, visible].forEach(input => input.addEventListener('input', update));
  refresh();
  return refresh;
}
