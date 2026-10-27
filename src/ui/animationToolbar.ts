type Position = { x: number; y: number };
const STORAGE_KEY = 'geometry.animationToolbarPosition';

export function clampToolbarPosition(position: Position, width: number, height: number, viewportWidth: number, viewportHeight: number, minimumTop = 8): Position {
  const margin = 8;
  return {
    x: Math.max(margin, Math.min(position.x, Math.max(margin, viewportWidth - width - margin))),
    y: Math.max(minimumTop, Math.min(position.y, Math.max(minimumTop, viewportHeight - height - margin)))
  };
}

export function initAnimationToolbar(toolbar: HTMLElement, handle: HTMLElement) {
  let position: Position | null = null;
  let drag: { id: number; x: number; y: number; origin: Position } | null = null;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) position = { x: saved.x, y: saved.y };
  } catch { /* Keep the default position when storage is unavailable. */ }

  const topbar = toolbar.closest<HTMLElement>('.toolbar-top')!;
  const row = topbar.querySelector<HTMLElement>('.tool-row')!;
  const left = topbar.querySelector<HTMLElement>('.topbar-left')!;
  const right = topbar.querySelector<HTMLElement>('.topbar-right')!;
  const gap = (node: HTMLElement) => parseFloat(getComputedStyle(node).columnGap) || 0;
  const visibleChildren = (node: HTMLElement) => [...node.children].filter((child): child is HTMLElement =>
    child instanceof HTMLElement && child !== toolbar && child.getClientRects().length > 0);
  // Flex children can already be squeezed or clipped: compare their preferred widths.
  const preferredWidth = (node: HTMLElement) => {
    const style = getComputedStyle(node);
    return Math.max(node.getBoundingClientRect().width, parseFloat(style.flexBasis) || 0) +
      (parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0);
  };
  const groupWidth = (node: HTMLElement, children: HTMLElement[]) =>
    children.reduce((sum, child) => sum + preferredWidth(child), 0) + Math.max(0, children.length - 1) * gap(node);
  const refresh = () => {
    if (toolbar.hidden) {
      document.body.classList.remove('animation-player-floating');
      return;
    }
    const controls = [...toolbar.querySelectorAll<HTMLElement>('.tool')];
    const playerWidth = controls.reduce((sum, control) => sum + (parseFloat(getComputedStyle(control).width) || 40), 0) +
      Math.max(0, controls.length - 1) * gap(toolbar);
    const leftChildren = visibleChildren(left), rightChildren = visibleChildren(right);
    const required = groupWidth(left, leftChildren) + groupWidth(right, rightChildren) + playerWidth +
      (leftChildren.length ? gap(left) : 0) + gap(row);
    const floating = required > row.clientWidth;
    toolbar.classList.toggle('animation-player--floating', floating);
    document.body.classList.toggle('animation-player-floating', floating);
    toolbar.dataset.layout = floating ? 'floating' : 'inline';
    handle.hidden = !floating;
    toolbar.style.left = ''; toolbar.style.top = ''; toolbar.style.right = '';
    const loop = toolbar.querySelector<HTMLButtonElement>('#animationLoop');
    if (loop) {
      loop.hidden = false;
      if (floating) loop.hidden = toolbar.scrollWidth > toolbar.clientWidth + 1;
    }
    if (!floating) return;
    const rect = toolbar.getBoundingClientRect(), top = topbar.getBoundingClientRect().bottom + 4;
    const next = clampToolbarPosition(position ?? { x: row.getBoundingClientRect().right - rect.width, y: top },
      rect.width, rect.height, innerWidth, innerHeight, top);
    if (position) position = next;
    toolbar.style.left = `${next.x}px`; toolbar.style.top = `${next.y}px`; toolbar.style.right = 'auto';
  };
  const remember = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(position)); } catch { /* Session-only position. */ } };
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || toolbar.dataset.layout !== 'floating') return;
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
    if (!delta || toolbar.dataset.layout !== 'floating') return;
    const rect = toolbar.getBoundingClientRect();
    position = { x: rect.left + delta[0], y: rect.top + delta[1] };
    refresh(); remember(); event.preventDefault(); event.stopPropagation();
  });
  window.addEventListener('resize', refresh);
  const observer = new ResizeObserver(refresh);
  for (const node of [row, left, right]) observer.observe(node);
  refresh();
  return { refresh };
}
