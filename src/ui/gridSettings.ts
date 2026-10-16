import { renderGrid, type GridSettings } from '../canvas/grid';

export function initGridSettings(get: () => GridSettings, set: (value: GridSettings) => void, background: () => string) {
  const color = document.getElementById('gridColor') as HTMLInputElement;
  const opacity = document.getElementById('gridOpacity') as HTMLInputElement;
  const width = document.getElementById('gridWidth') as HTMLInputElement;
  const dots = document.getElementById('gridDotsOnly') as HTMLInputElement;
  const preview = document.getElementById('gridPreview') as HTMLCanvasElement;
  const refresh = () => {
    const grid = get();
    color.value = grid.color;
    opacity.value = String(Math.round(grid.opacity * 100));
    width.value = String(grid.width);
    dots.checked = grid.dotsOnly;
    document.getElementById('gridOpacityValue')!.textContent = `${opacity.value}%`;
    document.getElementById('gridWidthValue')!.textContent = `${width.value} px`;
    const ctx = preview.getContext('2d');
    if (ctx) {
      ctx.fillStyle = background();
      ctx.fillRect(0, 0, preview.width, preview.height);
      renderGrid(ctx, { grid: { ...grid, visible: true }, zoomFactor: 1 });
    }
  };
  const update = () => {
    set({ ...get(), color: color.value, opacity: Number(opacity.value) / 100, width: Number(width.value), dotsOnly: dots.checked });
    refresh();
  };
  [color, opacity, width, dots].forEach(input => input.addEventListener('input', update));
  refresh();
  return refresh;
}
