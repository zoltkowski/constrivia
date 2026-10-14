export type Rect = { left: number; top: number; right: number; bottom: number };

export function fitBoundsInViewport(bounds: Rect, viewport: Rect, minZoom: number, maxZoom: number) {
  const width = viewport.right - viewport.left;
  const height = viewport.bottom - viewport.top;
  if (!(width > 0 && height > 0)) return null;
  // Reserve space for point labels and scale/rotation handles, also on phones.
  const padding = Math.min(48, width * 0.15, height * 0.15);
  const zoom = Math.max(minZoom, Math.min(maxZoom,
    (width - 2 * padding) / Math.max(bounds.right - bounds.left, 1e-3),
    (height - 2 * padding) / Math.max(bounds.bottom - bounds.top, 1e-3)));
  return {
    zoom,
    pan: {
      x: (viewport.left + viewport.right) / 2 - (bounds.left + bounds.right) / 2 * zoom,
      y: (viewport.top + viewport.bottom) / 2 - (bounds.top + bounds.bottom) / 2 * zoom
    }
  };
}

export function availableCanvasViewport(canvas: HTMLCanvasElement): Rect {
  const canvasRect = canvas.getBoundingClientRect();
  const viewport = { left: 0, top: 0, right: canvasRect.width, bottom: canvasRect.height };
  for (const selector of ['.toolbar-top', '.toolbar-bottom', '#hintBar']) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element || !element.getClientRects().length) continue;
    const rect = element.getBoundingClientRect();
    if (selector === '.toolbar-top') viewport.top = Math.max(viewport.top, rect.bottom - canvasRect.top);
    else viewport.bottom = Math.min(viewport.bottom, rect.top - canvasRect.top);
  }
  return viewport;
}
