/** One delegated binding covers original, cloned and rebuilt toolbar buttons. */
export function bindToolbarHints(
  root: Document,
  resolve: (button: HTMLButtonElement) => string | null,
  show: (text: string) => void,
  clear: () => void
): () => void {
  const buttonFor = (event: Event) => event.target instanceof Element
    ? event.target.closest<HTMLButtonElement>('button') : null;
  const entered = (event: Event) => {
    const button = buttonFor(event);
    if (!button) return;
    const related = (event as PointerEvent | FocusEvent).relatedTarget;
    if (related instanceof Node && button.contains(related)) return;
    const text = resolve(button);
    if (text) show(text);
  };
  const left = (event: Event) => {
    const button = buttonFor(event);
    if (!button || !resolve(button)) return;
    const related = (event as PointerEvent | FocusEvent).relatedTarget;
    if (related instanceof Node && button.contains(related)) return;
    clear();
  };
  const clicked = (event: Event) => {
    const button = buttonFor(event);
    if (!button || !resolve(button)) return;
    // A multi-tool button changes its current tool in its own click handler.
    queueMicrotask(() => {
      if (!button.isConnected) { clear(); return; }
      const text = resolve(button);
      if (text) show(text);
    });
  };
  const bindings: [string, EventListener][] = [
    ['pointerover', entered], ['pointerout', left],
    ['focusin', entered], ['focusout', left], ['click', clicked]
  ];
  // Capture also reaches buttons whose tool handlers stop propagation.
  for (const [name, listener] of bindings) root.addEventListener(name, listener, true);
  return () => {
    for (const [name, listener] of bindings) root.removeEventListener(name, listener, true);
  };
}
