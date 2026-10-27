type Position = { x: number; y: number };
const STORAGE_KEY = 'geometry.animationToolbarPosition';

export function clampToolbarPosition(position: Position, width: number, height: number, viewportWidth: number, viewportHeight: number): Position {
  const margin = 8;
  return {
    x: Math.max(margin, Math.min(position.x, Math.max(margin, viewportWidth - width - margin))),
    y: Math.max(margin, Math.min(position.y, Math.max(margin, viewportHeight - height - margin)))
  };
}

export function initAnimationToolbar(toolbar: HTMLElement, handle: HTMLElement) {
  let position: Position | null = null;
  let drag: { id: number; x: number; y: number; origin: Position } | null = null;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) position = { x: saved.x, y: saved.y };
  } catch { /* Keep the default position when storage is unavailable. */ }

  const refresh = () => {
    if (toolbar.hidden || !toolbar.getClientRects().length) return;
    const loop = toolbar.querySelector<HTMLButtonElement>('#animationLoop');
    if (loop) {
      loop.hidden = false;
      loop.hidden = toolbar.scrollWidth > toolbar.clientWidth + 1;
    }
    if (!position) { toolbar.style.left = ''; toolbar.style.top = ''; toolbar.style.right = ''; }
    const rect = toolbar.getBoundingClientRect();
    const next = clampToolbarPosition(position ?? { x: rect.left, y: rect.top }, rect.width, rect.height, innerWidth, innerHeight);
    if (position) position = next;
    toolbar.style.left = `${next.x}px`; toolbar.style.top = `${next.y}px`; toolbar.style.right = 'auto';
  };
  const remember = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(position)); } catch { /* Session-only position. */ } };
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const rect = toolbar.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: { x: rect.left, y: rect.top } };
    toolbar.classList.add('animation-player--dragging');
    handle.setPointerCapture(event.pointerId);
    event.preventDefault(); event.stopPropagation();
  });
  handle.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    position = { x: drag.origin.x + event.clientX - drag.x, y: drag.origin.y + event.clientY - drag.y };
    refresh(); event.preventDefault();
  });
  const finish = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null; toolbar.classList.remove('animation-player--dragging');
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    remember();
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('keydown', event => {
    const deltas: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
    const delta = deltas[event.key];
    if (!delta) return;
    const rect = toolbar.getBoundingClientRect();
    position = { x: rect.left + delta[0], y: rect.top + delta[1] };
    refresh(); remember(); event.preventDefault(); event.stopPropagation();
  });
  window.addEventListener('resize', refresh);
  refresh();
  return { refresh };
}
