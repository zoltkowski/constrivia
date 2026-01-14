export type StyleMenuHandlers = {
  toggleStyleMenu: () => void;
  closeStyleMenu: () => void;
  openStyleMenu: () => void;
};

export function createStyleMenuHandlers(deps: {
  getStyleMenuContainer: () => HTMLElement | null;
  getStyleMenuDropdown: () => HTMLElement | null;
  getStyleMenuBtn: () => HTMLElement | null;
  getStyleMenuOpen: () => boolean;
  setStyleMenuOpen: (open: boolean) => void;
  setStyleMenuSuppressed: (suppressed: boolean) => void;
  getCustomColorRow: () => HTMLElement | null;
  setCustomColorRowOpen: (open: boolean) => void;
  clearCopyStyle: () => void;
  updateSelectionButtons: () => void;
  updateStyleMenuValues: () => void;
}) : StyleMenuHandlers {
  const closeStyleMenu = () => {
    deps.setStyleMenuOpen(false);
    deps.getStyleMenuContainer()?.classList.remove('open');
    const customColorRow = deps.getCustomColorRow();
    if (customColorRow) {
      deps.setCustomColorRowOpen(false);
      customColorRow.style.display = 'none';
    }
  };

  const openStyleMenu = () => {
    const container = deps.getStyleMenuContainer();
    if (!container) return;
    const dropdown = deps.getStyleMenuDropdown();
    if (dropdown) {
      dropdown.style.position = 'fixed';
      const btnRect = deps.getStyleMenuBtn()?.getBoundingClientRect();
      dropdown.style.top = `${btnRect ? btnRect.bottom + 6 : 52}px`;
      dropdown.style.left = `${btnRect ? btnRect.left : 8}px`;
      dropdown.style.right = 'auto';
      dropdown.style.width = 'auto';
      dropdown.style.minWidth = '240px';
      dropdown.style.maxWidth = '360px';
    }
    container.classList.add('open');
    deps.setStyleMenuOpen(true);
    deps.updateStyleMenuValues();
  };

  const toggleStyleMenu = () => {
    const container = deps.getStyleMenuContainer();
    if (!container) return;
    const nextOpen = !deps.getStyleMenuOpen();
    deps.setStyleMenuOpen(nextOpen);
    if (nextOpen) {
      deps.clearCopyStyle();
      deps.updateSelectionButtons();
      openStyleMenu();
    } else {
      deps.setStyleMenuSuppressed(true);
      closeStyleMenu();
    }
  };

  return { toggleStyleMenu, closeStyleMenu, openStyleMenu };
}
