// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessibleDialog } from '../src/ui/dialogAccessibility';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('accessible modal dialogs', () => {
  it('moves focus into the dialog, traps Tab, and restores the opener on close', () => {
    document.body.innerHTML = `
      <button id="opener">Open</button>
      <div id="dialog" hidden><h2 id="title">Settings</h2>
        <button id="hidden" hidden>Hidden</button>
        <button id="disabled" disabled>Disabled</button>
        <button id="first">First</button>
        <button id="middle">Middle</button>
        <button id="last">Last</button>
      </div>`;
    const opener = document.getElementById('opener') as HTMLButtonElement;
    const dialog = document.getElementById('dialog') as HTMLElement;
    const first = document.getElementById('first') as HTMLButtonElement;
    const middle = document.getElementById('middle') as HTMLButtonElement;
    const last = document.getElementById('last') as HTMLButtonElement;
    const onClose = vi.fn(() => { dialog.hidden = true; });
    const controller = createAccessibleDialog(dialog, { labelledBy: 'title', onClose });

    opener.focus();
    dialog.hidden = false;
    controller.open(opener);
    expect(document.activeElement).toBe(first);
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('title');

    middle.focus();
    const middleTab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    middle.dispatchEvent(middleTab);
    expect(middleTab.defaultPrevented).toBe(false);

    last.focus();
    const lastTab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(lastTab);
    expect(document.activeElement).toBe(first);
    expect(lastTab.defaultPrevented).toBe(true);

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(last);

    controller.close();
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
    expect(dialog.getAttribute('aria-modal')).toBe('false');
  });

  it('dismisses on Escape and keeps dialog typing away from app keyboard handlers', () => {
    document.body.innerHTML = '<button id="opener">Open</button><div id="dialog"><input id="field"></div>';
    const opener = document.getElementById('opener') as HTMLButtonElement;
    const dialog = document.getElementById('dialog') as HTMLElement;
    const field = document.getElementById('field') as HTMLInputElement;
    const appKeyHandler = vi.fn();
    const fieldKeyHandler = vi.fn();
    field.addEventListener('keydown', fieldKeyHandler);
    window.addEventListener('keydown', appKeyHandler);
    const onClose = vi.fn();
    const controller = createAccessibleDialog(dialog, { onClose });

    controller.open(opener);
    field.focus();
    const typing = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    field.dispatchEvent(typing);
    expect(typing.defaultPrevented).toBe(false);
    expect(fieldKeyHandler).toHaveBeenCalledOnce();
    expect(appKeyHandler).not.toHaveBeenCalled();

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    field.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
    expect(appKeyHandler).not.toHaveBeenCalled();
    window.removeEventListener('keydown', appKeyHandler);
  });

  it('suspends for a nested panel and restores focus inside settings when resumed', () => {
    document.body.innerHTML = '<button id="open">Open</button><div id="dialog"><button id="export">Export</button></div>';
    const opener = document.getElementById('open') as HTMLButtonElement;
    const dialog = document.getElementById('dialog') as HTMLElement;
    const exportButton = document.getElementById('export') as HTMLButtonElement;
    const controller = createAccessibleDialog(dialog, { onClose: () => {} });

    controller.open(opener);
    exportButton.focus();
    controller.suspend();
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    controller.resume();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(exportButton);
    controller.close();
  });

  it('skips controls removed from tab order and restores a visible fallback opener', () => {
    document.body.innerHTML = '<button id="menu">Menu</button><button id="opener">Help</button><div id="dialog"><button tabindex="-1">Skip</button><button id="close">Close</button></div>';
    const dialog = document.getElementById('dialog')!;
    const opener = document.getElementById('opener')!;
    const menu = document.getElementById('menu')!;
    const controller = createAccessibleDialog(dialog, { onClose: () => dialog.remove() });
    controller.open(opener, menu);
    expect(document.activeElement?.id).toBe('close');
    opener.hidden = true;
    controller.close();
    expect(document.activeElement).toBe(menu);
  });
});
