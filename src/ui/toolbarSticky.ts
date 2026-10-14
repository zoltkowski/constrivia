/** Delegate gestures so rebuilt toolbar buttons retain their behavior. */
export function bindToolbarStickyGestures(resolve: (button: HTMLButtonElement) => string | null, activate: (tool: string) => void) {
  const buttonFor = (event: Event) => event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
  let lastTap: { button: HTMLButtonElement; time: number } | null = null;
  document.addEventListener('dblclick', event => {
    const button = buttonFor(event);
    const tool = button ? resolve(button) : null;
    if (!tool) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    activate(tool);
  }, true);
  document.addEventListener('touchmove', () => { lastTap = null; }, { capture: true, passive: true });
  document.addEventListener('touchend', event => {
    const button = buttonFor(event);
    const tool = button ? resolve(button) : null;
    if (!tool || !button) return;
    const now = Date.now();
    if (lastTap?.button === button && now - lastTap.time < 300) {
      lastTap = null;
      event.preventDefault();
      event.stopImmediatePropagation();
      activate(tool);
    } else {
      lastTap = { button, time: now };
    }
  }, { capture: true, passive: false });
}
