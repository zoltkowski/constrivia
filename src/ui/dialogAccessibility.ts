type DialogControllerOptions = {
  onClose: () => void;
  labelledBy?: string;
};

type DialogState = {
  dialog: HTMLElement;
  opener: HTMLElement | null;
  fallbackOpener: HTMLElement | null;
  suspendedFocus: HTMLElement | null;
  open: boolean;
  suspended: boolean;
  onClose: () => void;
};

type DocumentDialogState = {
  dialogs: DialogState[];
  onKeyDown: (event: KeyboardEvent) => void;
};

const documents = new WeakMap<Document, DocumentDialogState>();

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function isHidden(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true' || current.hasAttribute('inert')) return true;
    const style = view?.getComputedStyle(current);
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return true;
  }
  return false;
}

function getFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(element => {
    return element.tabIndex >= 0 && !element.matches(':disabled') && !isHidden(element);
  });
}

function focus(element: HTMLElement | null | undefined): boolean {
  if (!element || !element.isConnected || isHidden(element) || (element as HTMLButtonElement).disabled) return false;
  element.focus();
  return element.ownerDocument.activeElement === element;
}

function topDialog(state: DocumentDialogState): DialogState | undefined {
  for (let index = state.dialogs.length - 1; index >= 0; index -= 1) {
    const dialog = state.dialogs[index];
    if (dialog.open && !dialog.suspended && dialog.dialog.isConnected) return dialog;
  }
  return undefined;
}

function focusFirstOrLast(dialog: HTMLElement, last: boolean): void {
  const focusable = getFocusableElements(dialog);
  if (!focusable.length) {
    dialog.focus();
    return;
  }
  focus(last ? focusable[focusable.length - 1] : focusable[0]);
}

function ensureDocumentState(document: Document): DocumentDialogState {
  const existing = documents.get(document);
  if (existing) return existing;

  const state: DocumentDialogState = {
    dialogs: [],
    onKeyDown: event => {
      const active = topDialog(state);
      if (!active) return;

      const { dialog } = active;
      const target = event.target;
      const targetInside = target instanceof (document.defaultView?.Node ?? Node) && dialog.contains(target as Node);

      // Capture these modal controls before app-wide shortcuts.
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeDialog(active);
        return;
      }

      if (event.key === 'Tab') {
        const focusable = getFocusableElements(dialog);
        if (!focusable.length) {
          event.preventDefault();
          event.stopImmediatePropagation();
          dialog.focus();
          return;
        }
        const currentIndex = targetInside ? focusable.indexOf(document.activeElement as HTMLElement) : -1;
        const shouldWrap = event.shiftKey ? currentIndex <= 0 : currentIndex === -1 || currentIndex === focusable.length - 1;
        if (shouldWrap) {
          event.preventDefault();
          event.stopImmediatePropagation();
          focus(event.shiftKey ? focusable[focusable.length - 1] : focusable[0]);
        }
        return;
      }
    }
  };
  documents.set(document, state);
  document.addEventListener('keydown', state.onKeyDown, true);
  return state;
}

function closeDialog(state: DialogState): void {
  if (!state.open) return;
  state.open = false;
  state.suspended = false;
  state.dialog.setAttribute('aria-modal', 'false');
  const documentState = documents.get(state.dialog.ownerDocument);
  if (documentState) {
    const index = documentState.dialogs.indexOf(state);
    if (index !== -1) documentState.dialogs.splice(index, 1);
  }
  state.onClose();
  if (!focus(state.opener)) focus(state.fallbackOpener);
  state.suspendedFocus = null;
}

export type AccessibleDialogController = {
  open(opener?: HTMLElement | null, fallbackOpener?: HTMLElement | null): void;
  close(): void;
  suspend(): void;
  resume(restoreFocus?: boolean): void;
  dispose(): void;
};

/** Adds keyboard and focus behavior to an existing modal dialog element. */
export function createAccessibleDialog(dialog: HTMLElement, options: DialogControllerOptions): AccessibleDialogController {
  const state: DialogState = {
    dialog,
    opener: null,
    fallbackOpener: null,
    suspendedFocus: null,
    open: false,
    suspended: false,
    onClose: options.onClose
  };

  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'false');
  if (options.labelledBy) dialog.setAttribute('aria-labelledby', options.labelledBy);
  if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
  dialog.addEventListener('keydown', event => {
    if (state.open && !state.suspended && event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
  });

  return {
    open(opener, fallbackOpener) {
      const documentState = ensureDocumentState(dialog.ownerDocument);
      if (state.open) {
        state.suspended = false;
        state.opener = opener ?? state.opener;
        state.fallbackOpener = fallbackOpener ?? state.fallbackOpener;
        state.dialog.setAttribute('aria-modal', 'true');
        const previousIndex = documentState.dialogs.indexOf(state);
        if (previousIndex !== -1) documentState.dialogs.splice(previousIndex, 1);
      } else {
        state.open = true;
        state.suspended = false;
        state.opener = opener ?? (dialog.ownerDocument.activeElement as HTMLElement | null);
        state.fallbackOpener = fallbackOpener ?? null;
      }
      documentState.dialogs.push(state);
      state.dialog.setAttribute('aria-modal', 'true');
      state.suspendedFocus = null;
      focusFirstOrLast(dialog, false);
    },
    close() {
      closeDialog(state);
    },
    suspend() {
      if (!state.open || state.suspended) return;
      const activeElement = dialog.ownerDocument.activeElement as HTMLElement | null;
      state.suspendedFocus = activeElement && dialog.contains(activeElement) ? activeElement : null;
      state.suspended = true;
      dialog.setAttribute('aria-modal', 'false');
    },
    resume(restoreFocus = true) {
      if (!state.open || !state.suspended) return;
      state.suspended = false;
      dialog.setAttribute('aria-modal', 'true');
      if (restoreFocus && !focus(state.suspendedFocus)) focusFirstOrLast(dialog, false);
      state.suspendedFocus = null;
    },
    dispose() {
      closeDialog(state);
    }
  };
}
