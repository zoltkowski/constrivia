/* Extracted configuration & appearance pane logic.
   This module exposes `setupConfigPane(deps)` which returns an API
   for initializing and interacting with the config UI.
*/

export type Mode = any;
export type ThemeName = any;

export function setupConfigPane(deps: {
  getMode: () => Mode;
  setMode: (m: Mode) => void;
  draw: () => void;
  copyStyleFromSelection: () => any;
  isCopyStyleActive: () => boolean;
  activateCopyStyle: (style: any) => void;
  deactivateCopyStyle: () => void;
  updateSelectionButtons: () => void;
  updateToolButtons: () => void;
  getMeasurementPrecisionLength: () => number;
  setMeasurementPrecisionLength: (v: number) => void;
  getMeasurementPrecisionAngle: () => number;
  setMeasurementPrecisionAngle: (v: number) => void;
  POINT_STYLE_MODE_KEY: string;
  saveThemeOverrides: () => void;
  applyThemeWithOverrides: (theme: ThemeName) => void;
  getCurrentTheme: () => ThemeName;
  getThemeOverrides: () => any;
  initCloudSaveUI: (config: any, defaultName: string, ext: string) => void;
  handleToolClick: (id: string) => void;
  handleToolSticky: (id: string) => void;
  setupDoubleTapSticky: (btn: HTMLElement | null, id: string) => void;
}) {
  // --- Internal state (previously in main.ts) ---
  type SecondRowTriggerMode = 'swipe' | 'tap';

  type ButtonConfig = {
    multiButtons: Record<string, string[]>;
    secondRow: Record<string, string[]>;
    secondRowTrigger?: SecondRowTriggerMode;
  };

  let buttonConfig: ButtonConfig = { multiButtons: {}, secondRow: {}, secondRowTrigger: 'swipe' };
  let multiButtonStates: Record<string, number> = {};
  let secondRowVisible = false;
  let secondRowActiveButton: string | null = null;
  let secondRowToolIds: string[] = [];
  let secondRowActivationMode: SecondRowTriggerMode = 'swipe';
  const secondRowHandlerCleanup = new Map<string, () => void>();

  const doubleTapTimeouts: Map<HTMLElement, number> = new Map();
  const DOUBLE_TAP_DELAY = 300;

  interface TouchDragState {
    element: HTMLElement | null;
    toolId: string;
    toolIcon: string;
    toolViewBox: string;
    toolLabel: string;
    startX: number;
    startY: number;
    fromGroup: boolean;
  }
  let configTouchDrag: TouchDragState | null = null;

  let buttonOrder: string[] = [];

  // Tool list (kept as const data)
  type ToolDef = { id: string; icon: string; viewBox: string; label: string; mode?: any };
  const TOOL_BUTTONS: ToolDef[] = ((window as any).TOOL_BUTTONS || []) as ToolDef[];

  // appearance preview callback inside this module
  let appearancePreviewCallback: (() => void) | null = null;

  // Safe accessor for theme overrides — use this everywhere instead of calling deps.getThemeOverrides() directly
  function getThemeOverridesSafeGlobal() {
    try {
      const obj = typeof deps.getThemeOverrides === 'function' ? deps.getThemeOverrides() : {};
      return obj || { dark: {}, light: {} };
    } catch (_) {
      return { dark: {}, light: {} };
    }
  }

  // --- Functions (ported, adapted to use deps where needed) ---
  function initializeButtonConfig() {
    const multiButtonArea = document.getElementById('multiButtonConfig');
    if (!multiButtonArea) return;
    if (buttonOrder.length === 0) buttonOrder = TOOL_BUTTONS.map(t => t.id);

    const palette = document.createElement('div');
    palette.className = 'button-palette';
    const paletteGrid = document.createElement('div');
    paletteGrid.id = 'paletteGrid';
    paletteGrid.className = 'palette-grid';
    paletteGrid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(42px, 1fr)); gap:5px; margin-bottom:16px;';

    buttonOrder.forEach(toolId => {
      const tool = TOOL_BUTTONS.find((t: any) => t.id === toolId);
      if (!tool) return;
      const btn = document.createElement('button');
      btn.className = 'config-tool-btn tool icon-btn';
      btn.dataset.toolId = tool.id;
      btn.title = tool.label;
      btn.style.cssText = 'padding:6px; background:var(--btn); border:1px solid var(--btn-border); border-radius:8px; cursor:move; display:flex; align-items:center; justify-content:center; min-height:44px; width:100%; aspect-ratio:1;';
      const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgIcon.setAttribute('class', 'icon');
      svgIcon.setAttribute('viewBox', tool.viewBox);
      svgIcon.setAttribute('aria-hidden', 'true');
      svgIcon.style.cssText = 'width:22px; height:22px; pointer-events:none;';
      svgIcon.innerHTML = tool.icon;
      btn.appendChild(svgIcon);
      paletteGrid.appendChild(btn);
    });

    palette.appendChild(paletteGrid);

    const multiContainer = document.createElement('div');
    multiContainer.style.cssText = 'padding: 0 12px;';
    multiContainer.innerHTML = '<h5 style="margin:12px 0 12px; font-size:14px; font-weight:600;">Multiprzyciski:</h5>';
    const multiGroups = document.createElement('div');
    multiGroups.id = 'multiGroups';
    multiGroups.style.cssText = 'display:flex; flex-direction:column; gap:8px; min-height:120px; padding:12px; background:rgba(0,0,0,0.1); border-radius:8px; border:2px dashed transparent; transition:all 0.2s;';
    multiContainer.appendChild(multiGroups);

    const secondContainer = document.createElement('div');
    secondContainer.style.cssText = 'padding: 0 12px 12px;';
    secondContainer.innerHTML = '<h5 style="margin:12px 0 12px; font-size:14px; font-weight:600;">Dwa rzędy:</h5>';
    const secondGroups = document.createElement('div');
    secondGroups.id = 'secondGroups';
    secondGroups.style.cssText = 'display:flex; flex-direction:column; gap:8px; min-height:120px; padding:12px; background:rgba(0,0,0,0.1); border-radius:8px; border:2px dashed transparent; transition:all 0.2s;';
    secondContainer.appendChild(secondGroups);

    multiButtonArea.innerHTML = '';
    multiButtonArea.appendChild(palette);
    multiButtonArea.appendChild(multiContainer);
    multiButtonArea.appendChild(secondContainer);

    const triggerRow = document.createElement('div');
    triggerRow.style.cssText = 'padding:0 12px 12px;';
    const triggerLabel = document.createElement('label');
    triggerLabel.textContent = 'Otwieranie drugiego rzędu:';
    triggerLabel.style.cssText = 'display:block; font-size:13px; font-weight:600; margin-bottom:6px;';
    triggerLabel.htmlFor = 'secondRowTriggerSelect';
    const triggerSelect = document.createElement('select');
    triggerSelect.id = 'secondRowTriggerSelect';
    triggerSelect.style.cssText = 'width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--btn-border); background:var(--btn); color:var(--text); font-size:13px;';
    const swipeOption = document.createElement('option'); swipeOption.value = 'swipe'; swipeOption.textContent = 'Po przesunięciu w górę';
    const tapOption = document.createElement('option'); tapOption.value = 'tap'; tapOption.textContent = 'Po kliknięciu przycisku';
    triggerSelect.appendChild(swipeOption); triggerSelect.appendChild(tapOption);
    triggerSelect.value = secondRowActivationMode;
    triggerSelect.addEventListener('change', () => {
      const value = triggerSelect.value === 'tap' ? 'tap' : 'swipe';
      setSecondRowActivationMode(value as SecondRowTriggerMode);
    });
    triggerRow.appendChild(triggerLabel);
    triggerRow.appendChild(triggerSelect);
    multiButtonArea.appendChild(triggerRow);

    setupPaletteDragAndDrop();
    setupDropZone(multiGroups, 'multi');
    setupDropZone(secondGroups, 'second');
    loadConfigIntoUI(multiGroups, secondGroups);
  }

  function loadConfigIntoUI(multiGroups: HTMLElement, secondGroups: HTMLElement) {
    Object.entries(buttonConfig.multiButtons).forEach(([mainId, buttonIds]: [string, string[]]) => {
      if (buttonIds.length > 0) {
        const group = addButtonGroup(multiGroups, 'multi');
        if (!group) return;
        const removeBtn = group.querySelector('.group-remove-btn');
        buttonIds.forEach(toolId => {
          const toolInfo = TOOL_BUTTONS.find(t => t.id === toolId);
          if (!toolInfo) return;
          const toolBtn = createConfigToolButton(toolInfo.id, toolInfo.icon, toolInfo.viewBox, toolInfo.label);
          if (removeBtn) group.insertBefore(toolBtn, removeBtn);
        });
      }
    });

    Object.entries(buttonConfig.secondRow).forEach(([mainId, secondRowIds]: [string, string[]]) => {
      if (secondRowIds.length > 0) {
        const group = addButtonGroup(secondGroups, 'second');
        if (!group) return;
        const removeBtn = group.querySelector('.group-remove-btn');
        const mainToolInfo = TOOL_BUTTONS.find(t => t.id === mainId);
        if (mainToolInfo) {
          const mainBtn = createConfigToolButton(mainToolInfo.id, mainToolInfo.icon, mainToolInfo.viewBox, mainToolInfo.label);
          if (removeBtn) group.insertBefore(mainBtn, removeBtn);
        }
        secondRowIds.forEach(toolId => {
          const toolInfo = TOOL_BUTTONS.find(t => t.id === toolId);
          if (!toolInfo) return;
          const toolBtn = createConfigToolButton(toolInfo.id, toolInfo.icon, toolInfo.viewBox, toolInfo.label);
          if (removeBtn) group.insertBefore(toolBtn, removeBtn);
        });
      }
    });
  }

  function cleanupSecondRowHandlers() {
    secondRowHandlerCleanup.forEach((dispose) => dispose());
    secondRowHandlerCleanup.clear();
  }

  function setSecondRowActivationMode(mode: SecondRowTriggerMode) {
    if (secondRowActivationMode === mode) return;
    secondRowActivationMode = mode;
    buttonConfig.secondRowTrigger = mode;
    saveButtonConfigToStorage();
    applyButtonConfiguration();
    deps.updateToolButtons();
  }

  function applyButtonConfiguration() {
    const toolRow = document.getElementById('toolbarMainRow');
    if (!toolRow) return;
    if (!buttonConfig.secondRowTrigger) buttonConfig.secondRowTrigger = 'swipe';
    secondRowActivationMode = buttonConfig.secondRowTrigger;
    hideSecondRow();
    cleanupSecondRowHandlers();

    const allButtons = new Map<string, HTMLElement>();
    TOOL_BUTTONS.forEach(tool => {
      const btn = document.getElementById(tool.id);
      if (btn) allButtons.set(tool.id, btn as HTMLElement);
    });
    allButtons.forEach((btn) => {
      const indicator = btn.querySelector('.multi-indicator'); if (indicator) indicator.remove();
      btn.classList.remove('has-second-row'); delete (btn.dataset as any).secondRowConfig;
    });

    const placedButtons = new Set<string>();
    Object.entries(buttonConfig.multiButtons).forEach(([mainId, buttonIds]: [string, string[]]) => {
      const mainBtn = allButtons.get(mainId);
      if (!mainBtn || buttonIds.length === 0) return;
      buttonIds.forEach(id => placedButtons.add(id));
      if (!(mainId in multiButtonStates)) multiButtonStates[mainId] = 0;
      if (buttonIds.length > 1) {
        const oldIndicator = mainBtn.querySelector('.multi-indicator'); if (oldIndicator) oldIndicator.remove();
        const indicator = document.createElement('span'); indicator.className = 'multi-indicator';
        indicator.style.cssText = 'position:absolute; top:3px; right:3px; width:10px; height:10px; display:flex; flex-direction:column; align-items:center; gap:1px;';
        const dot1 = document.createElement('span'); dot1.style.cssText = 'width:2.5px; height:2.5px; background:rgba(128,128,128,0.6); border-radius:50%;';
        const dotsRow = document.createElement('span'); dotsRow.style.cssText = 'display:flex; gap:2px;';
        const dot2 = document.createElement('span'); dot2.style.cssText = 'width:2.5px; height:2.5px; background:rgba(128,128,128,0.6); border-radius:50%;';
        const dot3 = document.createElement('span'); dot3.style.cssText = 'width:2.5px; height:2.5px; background:rgba(128,128,128,0.6); border-radius:50%;';
        dotsRow.appendChild(dot2); dotsRow.appendChild(dot3); indicator.appendChild(dot1); indicator.appendChild(dotsRow);
        mainBtn.style.position = 'relative'; mainBtn.appendChild(indicator);
        const newBtn = mainBtn.cloneNode(true) as HTMLElement; mainBtn.parentNode?.replaceChild(newBtn, mainBtn); allButtons.set(mainId, newBtn);
        newBtn.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          const currentIndex = multiButtonStates[mainId];
          const currentToolId = buttonIds[currentIndex];
          const currentTool = TOOL_BUTTONS.find(t => t.id === currentToolId);
          if (!currentTool) return;
          let isCurrentToolActive = false;
          if (currentToolId === 'copyStyleBtn') {
            isCurrentToolActive = deps.isCopyStyleActive();
          } else {
            isCurrentToolActive = deps.getMode() === currentTool.mode;
          }
          if (isCurrentToolActive) {
            multiButtonStates[mainId] = (multiButtonStates[mainId] + 1) % buttonIds.length;
            const newIndex = multiButtonStates[mainId];
            const newToolId = buttonIds[newIndex];
            const newTool = TOOL_BUTTONS.find(t => t.id === newToolId);
            if (newTool) {
              const svgElement = newBtn.querySelector('svg'); if (svgElement) { svgElement.setAttribute('viewBox', newTool.viewBox); svgElement.innerHTML = newTool.icon; }
              newBtn.setAttribute('title', newTool.label); newBtn.setAttribute('aria-label', newTool.label);
              if (newIndex === 0) {
                if (newToolId === 'copyStyleBtn') { deps.deactivateCopyStyle(); deps.updateSelectionButtons(); } else { deps.setMode('move' as any); }
              } else {
                if (newToolId === 'copyStyleBtn') {
                  if (!deps.isCopyStyleActive()) {
                    const style = deps.copyStyleFromSelection(); if (style) { deps.activateCopyStyle(style); deps.updateSelectionButtons(); }
                  }
                } else {
                  deps.setMode(newTool.mode as Mode);
                }
              }
            }
          } else {
            if (currentToolId === 'copyStyleBtn') {
              if (!deps.isCopyStyleActive()) {
                const style = deps.copyStyleFromSelection(); if (style) { deps.activateCopyStyle(style); deps.updateSelectionButtons(); }
              } else { deps.deactivateCopyStyle(); deps.updateSelectionButtons(); }
            } else { deps.setMode(currentTool.mode as Mode); }
          }
        });
        const initialTool = TOOL_BUTTONS.find(t => t.id === buttonIds[multiButtonStates[mainId]]);
        if (initialTool) {
          const svgElement = newBtn.querySelector('svg'); if (svgElement) { svgElement.setAttribute('viewBox', initialTool.viewBox); svgElement.innerHTML = initialTool.icon; }
          newBtn.setAttribute('title', initialTool.label); newBtn.setAttribute('aria-label', initialTool.label);
        }
      }
    });

    Object.entries(buttonConfig.secondRow).forEach(([mainId, secondRowIds]: [string, string[]]) => {
      const mainBtn = allButtons.get(mainId);
      if (!mainBtn || secondRowIds.length === 0) return;
      placedButtons.add(mainId); secondRowIds.forEach(id => placedButtons.add(id));
      mainBtn.classList.add('has-second-row'); mainBtn.dataset.secondRowConfig = JSON.stringify(secondRowIds);
    });

    allButtons.forEach((btn, id) => {
      const isMainInMulti = Object.keys(buttonConfig.multiButtons).includes(id);
      const isSecondaryInMulti = Object.values(buttonConfig.multiButtons).some(group => group.includes(id) && group[0] !== id);
      const isMainInSecondRow = Object.keys(buttonConfig.secondRow).includes(id);
      const isInSecondRow = Object.values(buttonConfig.secondRow).some(group => group.includes(id));
      if (isSecondaryInMulti || isInSecondRow) { btn.style.display = 'none'; } else { btn.style.display = 'inline-flex'; }
    });

    const orderedButtons: HTMLElement[] = [];
    buttonOrder.forEach(toolId => { const btn = allButtons.get(toolId); if (btn && btn.style.display !== 'none') orderedButtons.push(btn); });
    orderedButtons.forEach(btn => { toolRow.appendChild(btn); });
    attachSecondRowHandlers(allButtons);
  }

  function attachSecondRowHandlers(allButtons: Map<string, HTMLElement>) {
    const toolbar = document.getElementById('toolbarMainRow'); if (!toolbar) return; cleanupSecondRowHandlers();
    const secondRowButtons = toolbar.querySelectorAll('.has-second-row');
    secondRowButtons.forEach((btn) => {
      const htmlBtn = btn as HTMLElement; const secondRowConfig = htmlBtn.dataset.secondRowConfig; if (!secondRowConfig) return;
      const secondRowIds: string[] = JSON.parse(secondRowConfig); const mainId = htmlBtn.id; const disposers: Array<() => void> = [];
      if (secondRowActivationMode === 'tap') {
        const onClick = () => { if (secondRowVisible && secondRowActiveButton === mainId) { hideSecondRow(); } else { toggleSecondRow(mainId, secondRowIds, allButtons); } };
        htmlBtn.addEventListener('click', onClick); disposers.push(() => htmlBtn.removeEventListener('click', onClick));
      } else {
        let startY = 0; let startTime = 0; let isDragging = false; let hasMovedEnough = false;
        const handleStart = (clientY: number) => { startY = clientY; startTime = Date.now(); isDragging = false; hasMovedEnough = false; };
        const handleMove = (clientY: number, event?: Event) => {
          const deltaY = startY - clientY; const deltaTime = Date.now() - startTime; if (Math.abs(deltaY) > 5) hasMovedEnough = true; if (deltaY > 20 && deltaTime < 500 && !isDragging) { isDragging = true; if (event) event.preventDefault(); toggleSecondRow(mainId, secondRowIds, allButtons); }
        };
        const handleEnd = () => { isDragging = false; };
        const onTouchStart = (e: TouchEvent) => handleStart(e.touches[0].clientY);
        const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientY, e);
        const onTouchEnd = () => handleEnd();
        htmlBtn.addEventListener('touchstart', onTouchStart, { passive: true }); htmlBtn.addEventListener('touchmove', onTouchMove, { passive: false }); htmlBtn.addEventListener('touchend', onTouchEnd, { passive: true });
        let mouseDown = false;
        const onMouseDown = (e: MouseEvent) => { mouseDown = true; handleStart(e.clientY); };
        const onMouseMove = (e: MouseEvent) => { if (mouseDown) { handleMove(e.clientY, e); if (hasMovedEnough) e.preventDefault(); } };
        const handleMouseEnd = () => { mouseDown = false; handleEnd(); };
        htmlBtn.addEventListener('mousedown', onMouseDown); htmlBtn.addEventListener('mousemove', onMouseMove); htmlBtn.addEventListener('mouseup', handleMouseEnd); htmlBtn.addEventListener('mouseleave', handleMouseEnd);
        disposers.push(() => { htmlBtn.removeEventListener('touchstart', onTouchStart); htmlBtn.removeEventListener('touchmove', onTouchMove); htmlBtn.removeEventListener('touchend', onTouchEnd); htmlBtn.removeEventListener('mousedown', onMouseDown); htmlBtn.removeEventListener('mousemove', onMouseMove); htmlBtn.removeEventListener('mouseup', handleMouseEnd); htmlBtn.removeEventListener('mouseleave', handleMouseEnd); });
      }
      secondRowHandlerCleanup.set(mainId, () => { disposers.forEach(d => d()); });
    });
  }

  function toggleSecondRow(mainId: string, secondRowIds: string[], allButtons: Map<string, HTMLElement>) {
    const secondRowContainer = document.getElementById('toolbarSecondRow'); if (!secondRowContainer) return;
    if (secondRowVisible && secondRowActiveButton === mainId) { hideSecondRow(); return; }
    secondRowContainer.innerHTML = '';
    secondRowToolIds = [mainId, ...secondRowIds];
    secondRowIds.forEach(id => {
      const btn = allButtons.get(id); if (btn) {
        const clonedBtn = btn.cloneNode(true) as HTMLElement; clonedBtn.style.display = 'inline-flex'; clonedBtn.classList.remove('active'); clonedBtn.dataset.toolId = id; secondRowContainer.appendChild(clonedBtn);
        const tool = TOOL_BUTTONS.find(t => t.id === id);
        if (tool) {
          clonedBtn.setAttribute('title', tool.label);
          if (tool.mode === deps.getMode()) clonedBtn.classList.add('active');
          clonedBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); deps.setMode(tool.mode as Mode); });
        }
      }
    });
    secondRowContainer.style.display = 'flex'; secondRowContainer.classList.remove('hidden'); setTimeout(() => { secondRowContainer.classList.remove('hidden'); }, 10);
    secondRowVisible = true; secondRowActiveButton = mainId;
  }

  function hideSecondRow() { const secondRowContainer = document.getElementById('toolbarSecondRow'); if (!secondRowContainer) return; secondRowContainer.classList.add('hidden'); setTimeout(() => { secondRowContainer.style.display = 'none'; }, 250); secondRowContainer.innerHTML = ''; secondRowVisible = false; secondRowActiveButton = null; secondRowToolIds = []; }

  function updateSecondRowActiveStates() {
    if (!secondRowVisible) return; const secondRowContainer = document.getElementById('toolbarSecondRow'); if (!secondRowContainer) return; const buttons = secondRowContainer.querySelectorAll('button.tool'); buttons.forEach(btn => { const element = btn as HTMLElement; const toolId = element.dataset.toolId; let btnTool = toolId ? TOOL_BUTTONS.find((t: any) => t.id === toolId) : undefined; if (!btnTool) { const btnTitle = btn.getAttribute('title'); if (btnTitle) btnTool = TOOL_BUTTONS.find((t: any) => t.label === btnTitle); } if (btnTool && btnTool.mode === deps.getMode()) btn.classList.add('active'); else btn.classList.remove('active'); });
  }

  function setupPaletteDragAndDrop() {
    const paletteGridEl = document.getElementById('paletteGrid') as HTMLElement | null; if (!paletteGridEl) return;
    const paletteButtons = paletteGridEl.querySelectorAll('.config-tool-btn');
    paletteButtons.forEach(btn => {
      const htmlBtn = btn as HTMLElement; htmlBtn.draggable = true; const toolId = htmlBtn.dataset.toolId; const tool = TOOL_BUTTONS.find((t: any) => t.id === toolId); if (!tool) return;
      htmlBtn.addEventListener('dragstart', (e) => { const ev = e as DragEvent; if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'copyMove'; ev.dataTransfer.setData('toolId', tool.id); ev.dataTransfer.setData('toolIcon', tool.icon); ev.dataTransfer.setData('toolViewBox', tool.viewBox); ev.dataTransfer.setData('toolLabel', tool.label); ev.dataTransfer.setData('fromPalette', 'true'); htmlBtn.classList.add('dragging-from-palette'); htmlBtn.style.opacity = '0.4'; } });
      htmlBtn.addEventListener('dragend', () => { htmlBtn.classList.remove('dragging-from-palette'); htmlBtn.style.opacity = '1'; saveButtonConfig(); });
      try { setupConfigTouchDrag(htmlBtn, tool.id, tool.icon, tool.viewBox, tool.label, false); } catch (err) {}
    });
    const getDragAfterElement = (container: HTMLElement, y: number) => { const draggableElements = [...container.querySelectorAll('.config-tool-item:not(.dragging-from-palette)')] as HTMLElement[]; let closest: { offset: number; element: HTMLElement | null } = { offset: Number.NEGATIVE_INFINITY, element: null }; draggableElements.forEach(child => { const box = child.getBoundingClientRect(); const offset = y - box.top - box.height / 2; if (offset < 0 && offset > closest.offset) { closest = { offset, element: child }; } }); return closest.element; };
    paletteGridEl.addEventListener('dragover', (e) => { const ev = e as DragEvent; ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'; const after = getDragAfterElement(paletteGridEl, ev.clientY); const dragging = document.querySelector('.dragging-from-palette') as HTMLElement | null; if (!dragging) return; if (after == null) { paletteGridEl.appendChild(dragging); } else { paletteGridEl.insertBefore(dragging, after); } });
    paletteGridEl.addEventListener('drop', (e) => { e.preventDefault(); saveButtonConfig(); });
  }

  function setupDropZone(element: HTMLElement, type: 'multi' | 'second') {
    element.addEventListener('dragover', (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; element.style.borderColor = '#3b82f6'; element.style.background = 'rgba(59, 130, 246, 0.1)'; });
    element.addEventListener('dragleave', () => { element.style.borderColor = 'transparent'; element.style.background = 'rgba(0,0,0,0.1)'; });
    element.addEventListener('drop', (e) => {
      e.preventDefault(); element.style.borderColor = 'transparent'; element.style.background = 'rgba(0,0,0,0.1)'; if (!e.dataTransfer) return; const toolId = e.dataTransfer.getData('toolId'); const toolIcon = e.dataTransfer.getData('toolIcon'); const toolViewBox = e.dataTransfer.getData('toolViewBox'); const toolLabel = e.dataTransfer.getData('toolLabel'); const target = e.target as HTMLElement; const droppedOnGroup = target.classList.contains('button-group') || target.closest('.button-group'); if (toolId && toolIcon && toolViewBox) { if (droppedOnGroup && target !== element) { const group = target.classList.contains('button-group') ? target : target.closest('.button-group'); if (group) { const removeBtn = group.querySelector('.group-remove-btn'); const toolBtn = createConfigToolButton(toolId, toolIcon, toolViewBox, toolLabel); if (removeBtn) group.insertBefore(toolBtn, removeBtn); else group.appendChild(toolBtn); saveButtonConfig(); } } else { addButtonGroup(element, type); const newGroup = element.lastElementChild as HTMLElement; if (newGroup) { const removeBtn = newGroup.querySelector('.group-remove-btn'); const toolBtn = createConfigToolButton(toolId, toolIcon, toolViewBox, toolLabel); if (removeBtn) newGroup.insertBefore(toolBtn, removeBtn); else newGroup.appendChild(toolBtn); saveButtonConfig(); } } }
    });
  }

  function createConfigToolButton(toolId: string, toolIcon: string, toolViewBox: string, toolLabel: string): HTMLElement {
    const toolBtn = document.createElement('div'); toolBtn.className = 'config-tool-item'; toolBtn.dataset.toolId = toolId; toolBtn.title = toolLabel; toolBtn.draggable = true; toolBtn.style.cssText = 'padding:6px; background:var(--btn); border:1px solid var(--btn-border); border-radius:6px; display:flex; gap:4px; align-items:center; justify-content:center; min-width:40px; min-height:40px; cursor:grab; position:relative;';
    const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svgIcon.setAttribute('class', 'icon'); svgIcon.setAttribute('viewBox', toolViewBox); svgIcon.setAttribute('aria-hidden', 'true'); svgIcon.style.cssText = 'width:20px; height:20px; pointer-events:none; flex-shrink:0;'; svgIcon.innerHTML = toolIcon; toolBtn.appendChild(svgIcon);
    const removeIcon = document.createElement('span'); removeIcon.textContent = '✕'; removeIcon.style.cssText = 'width:18px; height:18px; background:#ef4444; color:white; border-radius:50%; display:none; align-items:center; justify-content:center; font-size:12px; cursor:pointer; flex-shrink:0; position:absolute; top:-6px; right:-6px;'; toolBtn.appendChild(removeIcon);
    toolBtn.addEventListener('mouseenter', () => { removeIcon.style.display = 'flex'; }); toolBtn.addEventListener('mouseleave', () => { removeIcon.style.display = 'none'; }); removeIcon.addEventListener('click', (e) => { e.stopPropagation(); toolBtn.remove(); saveButtonConfig(); });
    toolBtn.addEventListener('dragstart', (e) => { if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('toolId', toolId); e.dataTransfer.setData('toolIcon', toolIcon); e.dataTransfer.setData('toolViewBox', toolViewBox); e.dataTransfer.setData('toolLabel', toolLabel); e.dataTransfer.setData('fromGroup', 'true'); toolBtn.style.opacity = '0.4'; } });
    toolBtn.addEventListener('dragend', () => { toolBtn.style.opacity = '1'; });
    toolBtn.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); const fromGroup = e.dataTransfer?.types.includes('text/plain'); if (fromGroup) toolBtn.style.background = 'rgba(59, 130, 246, 0.2)'; });
    toolBtn.addEventListener('dragleave', () => { toolBtn.style.background = 'var(--btn)'; });
    toolBtn.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); toolBtn.style.background = 'var(--btn)'; if (!e.dataTransfer) return; const draggedToolId = e.dataTransfer.getData('toolId'); const draggedToolIcon = e.dataTransfer.getData('toolIcon'); const draggedToolViewBox = e.dataTransfer.getData('toolViewBox'); const draggedToolLabel = e.dataTransfer.getData('toolLabel'); const fromGroup = e.dataTransfer.getData('fromGroup'); if (draggedToolId && draggedToolId !== toolId) { const group = toolBtn.closest('.button-group'); if (!group) return; if (fromGroup) { const existingBtn = Array.from(group.querySelectorAll('.config-tool-item')).find(btn => (btn as HTMLElement).dataset.toolId === draggedToolId); if (existingBtn) existingBtn.remove(); } const newBtn = createConfigToolButton(draggedToolId, draggedToolIcon, draggedToolViewBox, draggedToolLabel); toolBtn.parentElement?.insertBefore(newBtn, toolBtn); saveButtonConfig(); } });
    setupConfigTouchDrag(toolBtn, toolId, toolIcon, toolViewBox, toolLabel, true);
    return toolBtn;
  }

  function addButtonGroup(container: HTMLElement, type: 'multi' | 'second') {
    const group = document.createElement('div'); group.className = 'button-group'; group.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding:12px; background:var(--panel); border:2px solid var(--btn-border); border-radius:8px; min-height:60px; width:100%;'; group.dataset.groupType = type;
    const removeBtn = document.createElement('button'); removeBtn.textContent = '✕'; removeBtn.className = 'tool icon-btn group-remove-btn'; removeBtn.style.cssText = 'margin-left:auto; width:24px; height:24px; padding:0; background:transparent; border:none; font-size:18px; opacity:0.6; cursor:pointer;'; removeBtn.addEventListener('click', () => { group.remove(); saveButtonConfig(); });
    removeBtn.addEventListener('dragover', (e) => { e.stopPropagation(); }); removeBtn.addEventListener('drop', (e) => { e.stopPropagation(); e.preventDefault(); });
    group.appendChild(removeBtn); setupGroupDropZone(group); container.appendChild(group); return group;
  }

  function setupGroupDropZone(group: HTMLElement) {
    group.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; group.style.background = 'rgba(59, 130, 246, 0.1)'; });
    group.addEventListener('dragleave', (e) => { e.stopPropagation(); group.style.background = 'var(--panel)'; });
    group.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); group.style.background = 'var(--panel)'; if (!e.dataTransfer) return; const toolId = e.dataTransfer.getData('toolId'); const toolIcon = e.dataTransfer.getData('toolIcon'); const toolViewBox = e.dataTransfer.getData('toolViewBox'); const toolLabel = e.dataTransfer.getData('toolLabel'); if (toolId && toolIcon && toolViewBox) { const removeBtn = group.querySelector('.group-remove-btn'); const toolBtn = createConfigToolButton(toolId, toolIcon, toolViewBox, toolLabel); if (removeBtn) group.insertBefore(toolBtn, removeBtn); else group.appendChild(toolBtn); saveButtonConfig(); } });
  }

  function saveButtonConfigToStorage() {
    try { localStorage.setItem('geometryButtonConfig', JSON.stringify(buttonConfig)); } catch (e) {}
  }

  function saveButtonConfig() {
    const multiGroups = document.getElementById('multiGroups'); const secondGroups = document.getElementById('secondGroups'); buttonConfig = { multiButtons: {}, secondRow: {}, secondRowTrigger: secondRowActivationMode };
    if (multiGroups) {
      const groups = multiGroups.querySelectorAll('.button-group'); groups.forEach((group, index) => { const buttons = group.querySelectorAll('.config-tool-item'); const buttonIds: string[] = []; buttons.forEach(btn => { const toolId = (btn as HTMLElement).dataset.toolId; if (toolId) buttonIds.push(toolId); }); if (buttonIds.length > 0) { const mainId = buttonIds[0]; buttonConfig.multiButtons[mainId] = buttonIds; } });
    }
    if (secondGroups) {
      const groups = secondGroups.querySelectorAll('.button-group'); groups.forEach((group) => { const buttons = group.querySelectorAll('.config-tool-item'); const buttonIds: string[] = []; buttons.forEach(btn => { const toolId = (btn as HTMLElement).dataset.toolId; if (toolId) buttonIds.push(toolId); }); if (buttonIds.length > 0) { const mainId = buttonIds[0]; const secondRowIds = buttonIds.slice(1); if (secondRowIds.length > 0) buttonConfig.secondRow[mainId] = secondRowIds; } });
    }
    saveButtonConfigToStorage(); applyButtonConfiguration(); deps.updateToolButtons();
  }

  function saveButtonOrder() { try { localStorage.setItem('geometryButtonOrder', JSON.stringify(buttonOrder)); } catch (e) {} }

  function loadButtonOrder() {
    try {
      const saved = localStorage.getItem('geometryButtonOrder');
      if (saved) {
        buttonOrder = JSON.parse(saved);
        const allToolIds = TOOL_BUTTONS.map(t => t.id);
        const newButtons = allToolIds.filter(id => !buttonOrder.includes(id));
        if (newButtons.length > 0) { buttonOrder.push(...newButtons); saveButtonOrder(); }
      } else { buttonOrder = TOOL_BUTTONS.map(t => t.id); }
    } catch (e) { buttonOrder = TOOL_BUTTONS.map(t => t.id); }
  }

  function rebuildPalette() { const paletteGrid = document.getElementById('paletteGrid'); if (!paletteGrid) return; paletteGrid.innerHTML = ''; buttonOrder.forEach(toolId => { const tool = TOOL_BUTTONS.find((t: any) => t.id === toolId); if (!tool) return; const btn = document.createElement('button'); btn.className = 'config-tool-btn tool icon-btn'; btn.dataset.toolId = tool.id; btn.title = tool.label; btn.style.cssText = 'padding:6px; background:var(--btn); border:1px solid var(--btn-border); border-radius:8px; cursor:move; display:flex; align-items:center; justify-content:center; min-height:44px; width:100%; aspect-ratio:1;'; const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svgIcon.setAttribute('class', 'icon'); svgIcon.setAttribute('viewBox', tool.viewBox); svgIcon.setAttribute('aria-hidden', 'true'); svgIcon.style.cssText = 'width:22px; height:22px; pointer-events:none;'; svgIcon.innerHTML = tool.icon; btn.appendChild(svgIcon); paletteGrid.appendChild(btn); }); setupPaletteDragAndDrop(); }

  function setupConfigTouchDrag(toolBtn: HTMLElement, toolId: string, toolIcon: string, toolViewBox: string, toolLabel: string, fromGroup: boolean) {
    let isDragging = false; let phantom: HTMLElement | null = null; let currentDropZone: HTMLElement | null = null;
    toolBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); const touch = e.touches[0]; isDragging = false; configTouchDrag = { element: toolBtn, toolId, toolIcon, toolViewBox, toolLabel, startX: touch.clientX, startY: touch.clientY, fromGroup }; }, { passive: false });
    toolBtn.addEventListener('touchmove', (e) => { if (!configTouchDrag) return; const touch = e.touches[0]; const dx = Math.abs(touch.clientX - configTouchDrag.startX); const dy = Math.abs(touch.clientY - configTouchDrag.startY); if (!isDragging && (dx > 5 || dy > 5)) { isDragging = true; toolBtn.style.opacity = '0.4'; phantom = document.createElement('div'); phantom.style.cssText = 'position:fixed; pointer-events:none; opacity:0.8; z-index:10000; padding:6px; background:var(--btn); border:2px solid #3b82f6; border-radius:6px; display:flex; align-items:center; justify-content:center; width:40px; height:40px;'; const svgEl = toolBtn.querySelector('svg'); const svgClone = svgEl ? (svgEl.cloneNode(true) as SVGElement) : null; if (svgClone) phantom.appendChild(svgClone); phantom.style.left = (touch.clientX - 20) + 'px'; phantom.style.top = (touch.clientY - 20) + 'px'; document.body.appendChild(phantom); e.preventDefault(); } if (isDragging && phantom) { phantom.style.left = (touch.clientX - 20) + 'px'; phantom.style.top = (touch.clientY - 20) + 'px'; const target = document.elementFromPoint(touch.clientX, touch.clientY); if (target) { const group = target.closest('.button-group'); const dropZone = target.closest('#multiGroups, #secondGroups') as HTMLElement; if (currentDropZone && currentDropZone !== group && currentDropZone !== dropZone) { currentDropZone.style.background = ''; currentDropZone.style.borderColor = ''; } if (group) { if (currentDropZone !== group) (group as HTMLElement).style.background = 'rgba(59, 130, 246, 0.1)'; currentDropZone = group as HTMLElement; } else if (dropZone) { if (currentDropZone !== dropZone) { dropZone.style.background = 'rgba(59, 130, 246, 0.05)'; dropZone.style.borderColor = '#3b82f6'; } currentDropZone = dropZone; } else { if (currentDropZone) { currentDropZone.style.background = ''; currentDropZone.style.borderColor = ''; currentDropZone = null; } } } e.preventDefault(); } }, { passive: false });
    toolBtn.addEventListener('touchend', (e) => {
      if (currentDropZone) { currentDropZone.style.background = ''; currentDropZone.style.borderColor = ''; currentDropZone = null; }
      if (phantom) { phantom.remove(); phantom = null; }
      if (!configTouchDrag || !isDragging) { toolBtn.style.opacity = '1'; configTouchDrag = null; isDragging = false; return; }
      toolBtn.style.opacity = '1'; const touch = e.changedTouches[0]; const target = document.elementFromPoint(touch.clientX, touch.clientY); if (!target) { configTouchDrag = null; isDragging = false; return; }
      const paletteBtn = target.closest('.config-tool-btn'); const paletteGrid = document.getElementById('paletteGrid'); if (paletteBtn && paletteGrid && paletteBtn.parentElement === paletteGrid && !fromGroup) { const targetToolId = (paletteBtn as HTMLElement).dataset.toolId; const draggedToolId = configTouchDrag.toolId; if (targetToolId && draggedToolId && targetToolId !== draggedToolId) { const draggedIndex = buttonOrder.indexOf(draggedToolId); const targetIndex = buttonOrder.indexOf(targetToolId); if (draggedIndex !== -1 && targetIndex !== -1) { buttonOrder.splice(draggedIndex, 1); buttonOrder.splice(targetIndex, 0, draggedToolId); saveButtonOrder(); rebuildPalette(); applyButtonConfiguration(); } } configTouchDrag = null; isDragging = false; return; }
      const group = target.closest('.button-group'); if (group) { const targetBtn = target.closest('.config-tool-item') as HTMLElement; if (targetBtn && targetBtn !== toolBtn) { const toolBtnGroup = toolBtn.closest('.button-group'); if (toolBtnGroup === group) { group.insertBefore(toolBtn, targetBtn); } else { toolBtn.remove(); group.insertBefore(createConfigToolButton(configTouchDrag.toolId, configTouchDrag.toolIcon, configTouchDrag.toolViewBox, configTouchDrag.toolLabel), targetBtn); } saveButtonConfig(); } else if (!targetBtn || targetBtn === toolBtn) { if (targetBtn !== toolBtn) { const toolBtnGroup = toolBtn.closest('.button-group'); if (fromGroup) { const existingBtn = Array.from(group.querySelectorAll('.config-tool-item')).find(btn => (btn as HTMLElement).dataset.toolId === configTouchDrag!.toolId); if (existingBtn && existingBtn !== toolBtn) existingBtn.remove(); } if (toolBtnGroup === group && fromGroup) { } else { const removeBtn = group.querySelector('.group-remove-btn'); const newBtn = createConfigToolButton(configTouchDrag.toolId, configTouchDrag.toolIcon, configTouchDrag.toolViewBox, configTouchDrag.toolLabel); if (removeBtn) group.insertBefore(newBtn, removeBtn); else group.appendChild(newBtn); if (fromGroup && toolBtnGroup !== group) toolBtn.remove(); } saveButtonConfig(); } } configTouchDrag = null; isDragging = false; return; }
      const dropZone = target.closest('#multiGroups, #secondGroups'); if (fromGroup && !dropZone) { toolBtn.remove(); saveButtonConfig(); configTouchDrag = null; isDragging = false; return; }
      if (dropZone && !fromGroup) { const dropZoneId = (dropZone as HTMLElement).id; const groupType = dropZoneId === 'multiGroups' ? 'multi' : 'second'; const newGroup = addButtonGroup(dropZone as HTMLElement, groupType); if (newGroup) { const removeBtn = newGroup.querySelector('.group-remove-btn'); const newBtn = createConfigToolButton(configTouchDrag.toolId, configTouchDrag.toolIcon, configTouchDrag.toolViewBox, configTouchDrag.toolLabel); if (removeBtn) newGroup.insertBefore(newBtn, removeBtn); else newGroup.appendChild(newBtn); saveButtonConfig(); } }
      configTouchDrag = null; isDragging = false;
    }, { passive: false });

    toolBtn.addEventListener('touchcancel', () => { if (currentDropZone) { currentDropZone.style.background = ''; currentDropZone.style.borderColor = ''; currentDropZone = null; } if (phantom) { phantom.remove(); phantom = null; } toolBtn.style.opacity = '1'; configTouchDrag = null; isDragging = false; }, { passive: false });

    // Pointer events fallback (covers mouse + pointer-capable touch)
    let pointerMoveHandler: ((ev: PointerEvent) => void) | null = null;
    let pointerUpHandler: ((ev: PointerEvent) => void) | null = null;
    toolBtn.addEventListener('pointerdown', (e: PointerEvent) => {
      // Only handle primary button
      if ((e as any).button && (e as any).button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      isDragging = false;
      configTouchDrag = {
        element: toolBtn,
        toolId,
        toolIcon,
        toolViewBox,
        toolLabel,
        startX,
        startY,
        fromGroup
      };

      try { toolBtn.setPointerCapture(e.pointerId); } catch {}

      pointerMoveHandler = (ev: PointerEvent) => {
        if (!configTouchDrag) return;
        const dx = Math.abs(ev.clientX - configTouchDrag.startX);
        const dy = Math.abs(ev.clientY - configTouchDrag.startY);

        if (!isDragging && (dx > 5 || dy > 5)) {
          isDragging = true;
          toolBtn.style.opacity = '0.4';
          phantom = document.createElement('div');
          phantom.style.cssText = 'position:fixed; pointer-events:none; opacity:0.8; z-index:10000; padding:6px; background:var(--btn); border:2px solid #3b82f6; border-radius:6px; display:flex; align-items:center; justify-content:center; width:40px; height:40px;';
          const svgEl = toolBtn.querySelector('svg');
          const svgClone = svgEl ? (svgEl.cloneNode(true) as SVGElement) : null;
          if (svgClone) phantom.appendChild(svgClone);
          phantom.style.left = (ev.clientX - 20) + 'px';
          phantom.style.top = (ev.clientY - 20) + 'px';
          document.body.appendChild(phantom);
        }

        if (isDragging && phantom) {
          phantom.style.left = (ev.clientX - 20) + 'px';
          phantom.style.top = (ev.clientY - 20) + 'px';
          const target = document.elementFromPoint(ev.clientX, ev.clientY);
          if (target) {
            const group = target.closest('.button-group');
            const dropZone = target.closest('#multiGroups, #secondGroups') as HTMLElement;
            if (currentDropZone && currentDropZone !== group && currentDropZone !== dropZone) {
              currentDropZone.style.background = '';
              currentDropZone.style.borderColor = '';
            }
            if (group) {
              if (currentDropZone !== group) (group as HTMLElement).style.background = 'rgba(59, 130, 246, 0.1)';
              currentDropZone = group as HTMLElement;
            } else if (dropZone) {
              if (currentDropZone !== dropZone) {
                dropZone.style.background = 'rgba(59, 130, 246, 0.05)';
                dropZone.style.borderColor = '#3b82f6';
              }
              currentDropZone = dropZone;
            } else {
              if (currentDropZone) {
                currentDropZone.style.background = '';
                currentDropZone.style.borderColor = '';
                currentDropZone = null;
              }
            }
          }
        }
      };

      pointerUpHandler = (ev: PointerEvent) => {
        if (currentDropZone) {
          currentDropZone.style.background = '';
          currentDropZone.style.borderColor = '';
          currentDropZone = null;
        }
        if (phantom) {
          phantom.remove();
          phantom = null;
        }
        try { toolBtn.releasePointerCapture(ev.pointerId); } catch {}
        if (!configTouchDrag || !isDragging) {
          toolBtn.style.opacity = '1';
          configTouchDrag = null;
          isDragging = false;
          // cleanup
          if (pointerMoveHandler) document.removeEventListener('pointermove', pointerMoveHandler as any);
          if (pointerUpHandler) document.removeEventListener('pointerup', pointerUpHandler as any);
          pointerMoveHandler = null;
          pointerUpHandler = null;
          return;
        }

        toolBtn.style.opacity = '1';
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        if (!target) {
          configTouchDrag = null;
          isDragging = false;
          if (pointerMoveHandler) document.removeEventListener('pointermove', pointerMoveHandler as any);
          if (pointerUpHandler) document.removeEventListener('pointerup', pointerUpHandler as any);
          pointerMoveHandler = null;
          pointerUpHandler = null;
          return;
        }

        // Reuse same drop logic as touchend
        const paletteBtn = target.closest('.config-tool-btn');
        const paletteGrid = document.getElementById('paletteGrid');
        if (paletteBtn && paletteGrid && paletteBtn.parentElement === paletteGrid && !fromGroup) {
          const targetToolId = (paletteBtn as HTMLElement).dataset.toolId;
          const draggedToolId = configTouchDrag.toolId;
          if (targetToolId && draggedToolId && targetToolId !== draggedToolId) {
            const draggedIndex = buttonOrder.indexOf(draggedToolId);
            const targetIndex = buttonOrder.indexOf(targetToolId);
            if (draggedIndex !== -1 && targetIndex !== -1) {
              buttonOrder.splice(draggedIndex, 1);
              buttonOrder.splice(targetIndex, 0, draggedToolId);
              saveButtonOrder();
              rebuildPalette();
              applyButtonConfiguration();
            }
          }
          configTouchDrag = null;
          isDragging = false;
          if (pointerMoveHandler) document.removeEventListener('pointermove', pointerMoveHandler as any);
          if (pointerUpHandler) document.removeEventListener('pointerup', pointerUpHandler as any);
          pointerMoveHandler = null;
          pointerUpHandler = null;
          return;
        }

        const group = target.closest('.button-group');
        if (group) {
          const targetBtn = target.closest('.config-tool-item') as HTMLElement;
          if (targetBtn && targetBtn !== toolBtn) {
            const toolBtnGroup = toolBtn.closest('.button-group');
            if (toolBtnGroup === group) {
              group.insertBefore(toolBtn, targetBtn);
            } else {
              toolBtn.remove();
              group.insertBefore(createConfigToolButton(configTouchDrag.toolId, configTouchDrag.toolIcon, configTouchDrag.toolViewBox, configTouchDrag.toolLabel), targetBtn);
            }
            saveButtonConfig();
          } else if (!targetBtn || targetBtn === toolBtn) {
            if (targetBtn !== toolBtn) {
              const toolBtnGroup = toolBtn.closest('.button-group');
              if (fromGroup) {
                const existingBtn = Array.from(group.querySelectorAll('.config-tool-item')).find(btn => (btn as HTMLElement).dataset.toolId === configTouchDrag!.toolId);
                if (existingBtn && existingBtn !== toolBtn) existingBtn.remove();
              }
              if (toolBtnGroup === group && fromGroup) {
                // same group, dropped on empty space - do nothing
              } else {
                const removeBtn = group.querySelector('.group-remove-btn');
                const newBtn = createConfigToolButton(configTouchDrag.toolId, configTouchDrag.toolIcon, configTouchDrag.toolViewBox, configTouchDrag.toolLabel);
                if (removeBtn) group.insertBefore(newBtn, removeBtn); else group.appendChild(newBtn);
                if (fromGroup && toolBtnGroup !== group) toolBtn.remove();
              }
              saveButtonConfig();
            }
          }
          configTouchDrag = null;
          isDragging = false;
          if (pointerMoveHandler) document.removeEventListener('pointermove', pointerMoveHandler as any);
          if (pointerUpHandler) document.removeEventListener('pointerup', pointerUpHandler as any);
          pointerMoveHandler = null;
          pointerUpHandler = null;
          return;
        }

        const dropZone = target.closest('#multiGroups, #secondGroups');
        if (fromGroup && !dropZone) {
          toolBtn.remove();
          saveButtonConfig();
          configTouchDrag = null;
          isDragging = false;
          if (pointerMoveHandler) document.removeEventListener('pointermove', pointerMoveHandler as any);
          if (pointerUpHandler) document.removeEventListener('pointerup', pointerUpHandler as any);
          pointerMoveHandler = null;
          pointerUpHandler = null;
          return;
        }

        if (dropZone && !fromGroup) {
          const dropZoneId = (dropZone as HTMLElement).id;
          const groupType = dropZoneId === 'multiGroups' ? 'multi' : 'second';
          const newGroup = addButtonGroup(dropZone as HTMLElement, groupType);
          if (newGroup) {
            const removeBtn = newGroup.querySelector('.group-remove-btn');
            const newBtn = createConfigToolButton(configTouchDrag.toolId, configTouchDrag.toolIcon, configTouchDrag.toolViewBox, configTouchDrag.toolLabel);
            if (removeBtn) newGroup.insertBefore(newBtn, removeBtn); else newGroup.appendChild(newBtn);
            saveButtonConfig();
          }
        }

        configTouchDrag = null;
        isDragging = false;
        if (pointerMoveHandler) document.removeEventListener('pointermove', pointerMoveHandler as any);
        if (pointerUpHandler) document.removeEventListener('pointerup', pointerUpHandler as any);
        pointerMoveHandler = null;
        pointerUpHandler = null;
      };

      document.addEventListener('pointermove', pointerMoveHandler as any);
      document.addEventListener('pointerup', pointerUpHandler as any);
    });
  }

  function loadButtonConfiguration() {
    try { const saved = localStorage.getItem('geometryButtonConfig'); if (saved) buttonConfig = JSON.parse(saved); } catch (e) {}
    if (!buttonConfig.secondRowTrigger || (buttonConfig.secondRowTrigger !== 'tap' && buttonConfig.secondRowTrigger !== 'swipe')) buttonConfig.secondRowTrigger = 'swipe';
    secondRowActivationMode = buttonConfig.secondRowTrigger;
    try { const savedPrecisionLength = localStorage.getItem('measurementPrecisionLength'); if (savedPrecisionLength !== null) { const value = parseInt(savedPrecisionLength, 10); if (!isNaN(value) && value >= 0 && value <= 5) deps.setMeasurementPrecisionLength(value); } } catch (e) {}
    try { const savedPrecisionAngle = localStorage.getItem('measurementPrecisionAngle'); if (savedPrecisionAngle !== null) { const value = parseInt(savedPrecisionAngle, 10); if (!isNaN(value) && value >= 0 && value <= 5) deps.setMeasurementPrecisionAngle(value); } } catch (e) {}
    try { const savedPointStyle = localStorage.getItem(deps.POINT_STYLE_MODE_KEY); if (savedPointStyle === 'filled' || savedPointStyle === 'hollow') { setDefaultPointFillMode(savedPointStyle as any); } } catch (e) {}
  }

  function getTimestampString() { const now = new Date(); const pad = (n: number) => n.toString().padStart(2, '0'); return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`; }
  function getDateString() { const now = new Date(); const pad = (n: number) => n.toString().padStart(2, '0'); return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; }

  function exportButtonConfiguration() {
    const config = { version: 1, buttonOrder: buttonOrder, multiButtons: buttonConfig.multiButtons, secondRow: buttonConfig.secondRow, secondRowTrigger: buttonConfig.secondRowTrigger ?? secondRowActivationMode, themeOverrides: getThemeOverridesSafeGlobal(), measurementPrecisionLength: deps.getMeasurementPrecisionLength(), measurementPrecisionAngle: deps.getMeasurementPrecisionAngle(), pointStyleMode: localStorage.getItem(deps.POINT_STYLE_MODE_KEY) };
    const defaultName = `constrivia-${getTimestampString()}`; deps.initCloudSaveUI(config, defaultName, '.config');
  }

  function importButtonConfiguration(jsonString: string) {
    try {
      const config = JSON.parse(jsonString);
      if (config.buttonOrder && Array.isArray(config.buttonOrder)) {
        const validIds = config.buttonOrder.filter((id: string) => TOOL_BUTTONS.some(t => t.id === id));
        const allToolIds = TOOL_BUTTONS.map(t => t.id); const newButtons = allToolIds.filter(id => !validIds.includes(id)); buttonOrder = [...validIds, ...newButtons];
      } else { buttonOrder = TOOL_BUTTONS.map(t => t.id); }
      if (config.multiButtons && typeof config.multiButtons === 'object') {
        const validMultiButtons: Record<string, string[]> = {};
        Object.entries(config.multiButtons).forEach(([mainId, buttonIds]: [string, any]) => { if (Array.isArray(buttonIds)) { const validIds = buttonIds.filter((id: string) => TOOL_BUTTONS.some(t => t.id === id)); if (validIds.length > 0) validMultiButtons[mainId] = validIds; } }); buttonConfig.multiButtons = validMultiButtons;
      } else { buttonConfig.multiButtons = {}; }
      if (config.secondRow && typeof config.secondRow === 'object') { const validSecondRow: Record<string, string[]> = {}; Object.entries(config.secondRow).forEach(([mainId, buttonIds]: [string, any]) => { if (Array.isArray(buttonIds)) { const validIds = buttonIds.filter((id: string) => TOOL_BUTTONS.some(t => t.id === id)); if (validIds.length > 0) validSecondRow[mainId] = validIds; } }); buttonConfig.secondRow = validSecondRow; } else { buttonConfig.secondRow = {}; }
      const trigger = config.secondRowTrigger === 'tap' ? 'tap' : 'swipe'; buttonConfig.secondRowTrigger = trigger; secondRowActivationMode = trigger;
      if (config.themeOverrides && typeof config.themeOverrides === 'object') { const themeOverrides = getThemeOverridesSafeGlobal(); themeOverrides.dark = config.themeOverrides.dark || {}; themeOverrides.light = config.themeOverrides.light || {}; try { deps.saveThemeOverrides(); } catch (_) {} deps.applyThemeWithOverrides(deps.getCurrentTheme()); if (typeof (window as any).refreshAppearanceTab === 'function') (window as any).refreshAppearanceTab(); }
      if (typeof config.measurementPrecisionLength === 'number') { deps.setMeasurementPrecisionLength(config.measurementPrecisionLength); localStorage.setItem('measurementPrecisionLength', config.measurementPrecisionLength.toString()); }
      if (typeof config.measurementPrecisionAngle === 'number') { deps.setMeasurementPrecisionAngle(config.measurementPrecisionAngle); localStorage.setItem('measurementPrecisionAngle', config.measurementPrecisionAngle.toString()); }
      if (config.pointStyleMode === 'filled' || config.pointStyleMode === 'hollow') setDefaultPointFillMode(config.pointStyleMode);
      saveButtonConfigToStorage(); saveButtonOrder(); applyButtonConfiguration(); reinitToolButtons(); const toolbarMain = document.getElementById('toolbarMainRow'); if (toolbarMain) { toolbarMain.addEventListener('click', (e) => { const target = e.target as HTMLElement | null; if (!target) return; const btn = target.closest('button') as HTMLButtonElement | null; if (!btn) return; if (btn.id === 'modeIntersection') { deps.handleToolClick('intersection'); } }); }
      initializeButtonConfig(); const precisionLengthInput = document.getElementById('precisionLength') as HTMLInputElement | null; const precisionAngleInput = document.getElementById('precisionAngle') as HTMLInputElement | null; if (precisionLengthInput) precisionLengthInput.value = deps.getMeasurementPrecisionLength().toString(); if (precisionAngleInput) precisionAngleInput.value = deps.getMeasurementPrecisionAngle().toString(); deps.draw(); return true;
    } catch (e) { return false; }
  }

  function setDefaultPointFillMode(mode: any, persist = true) {
    try { if (persist) localStorage.setItem(deps.POINT_STYLE_MODE_KEY, mode); } catch (err) {}
    updatePointStyleConfigButtons();
  }

  function updatePointStyleConfigButtons() {
    const pointStyleToggleBtn = document.getElementById('pointStyleToggleBtn') as HTMLButtonElement | null;
    if (!pointStyleToggleBtn) return; const hollowActive = (localStorage.getItem(deps.POINT_STYLE_MODE_KEY) === 'hollow'); pointStyleToggleBtn.classList.toggle('active', hollowActive); pointStyleToggleBtn.setAttribute('aria-pressed', hollowActive ? 'true' : 'false'); pointStyleToggleBtn.innerHTML = hollowActive ? '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5.2" fill="none" stroke="currentColor" stroke-width="2"/></svg>' : '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5.2" class="icon-fill"/></svg>';
  }

  function initAppearanceTab() {
    const themeBtns = document.querySelectorAll<HTMLButtonElement>('.appearance-theme-toggle .theme-btn');
    const previewCanvas = document.getElementById('previewCanvas') as HTMLCanvasElement;
    let activeTheme: ThemeName = deps.getCurrentTheme();
    const themeBgColor = document.getElementById('themeBgColor') as HTMLInputElement;
    const themeStrokeColor = document.getElementById('themeStrokeColor') as HTMLInputElement;
    const themePanelColor = document.getElementById('themePanelColor') as HTMLInputElement;
    const themeHighlightColor = document.getElementById('themeHighlightColor') as HTMLInputElement;
    const themeBgColorHex = document.getElementById('themeBgColorHex') as HTMLInputElement;
    const themeStrokeColorHex = document.getElementById('themeStrokeColorHex') as HTMLInputElement;
    const themeHighlightColorHex = document.getElementById('themeHighlightColorHex') as HTMLInputElement;
    const themeSelectionLineStyle = document.getElementById('themeSelectionLineStyle') as HTMLSelectElement;
    const themeSelectionEffect = document.getElementById('themeSelectionEffect') as HTMLSelectElement;
    const themeSelectionPointStyleSameAsLine = document.getElementById('themeSelectionPointStyleSameAsLine') as HTMLInputElement;
    const themePanelColorHex = document.getElementById('themePanelColorHex') as HTMLInputElement;
    const themeLineWidthValue = document.getElementById('themeLineWidthValue');
    const themePointSizeValue = document.getElementById('themePointSizeValue');
    const themeArcRadiusValue = document.getElementById('themeArcRadiusValue');
    const themeFontSizeValue = document.getElementById('themeFontSizeValue');
    const themeHighlightWidthValue = document.getElementById('themeHighlightWidthValue');
    const themeSelectionPointRadiusValue = document.getElementById('themeSelectionPointRadiusValue');
    const resetBtn = document.getElementById('resetThemeDefaults');

    const getThemeOverridesSafe = () => {
      try {
        const obj = typeof deps.getThemeOverrides === 'function' ? deps.getThemeOverrides() : {};
        return obj || {};
      } catch (_) {
        return {};
      }
    };

    function loadThemeValues() {
      const theme = activeTheme; const presets = (window as any).THEME_PRESETS || {}; const base = presets[theme] || {}; const overridesObj = getThemeOverridesSafe(); const overrides = overridesObj[theme] || {}; const current = { ...base, ...overrides };
      if (themeBgColor) themeBgColor.value = current.bg || base.bg || '';
      if (themeBgColorHex) {
        const v = current.bg ?? base.bg ?? '';
        themeBgColorHex.value = String(v).toLowerCase();
      }
      if (themeStrokeColor) themeStrokeColor.value = current.defaultStroke || base.defaultStroke || '';
      if (themeStrokeColorHex) {
        const v = current.defaultStroke ?? base.defaultStroke ?? '';
        themeStrokeColorHex.value = String(v).toLowerCase();
      }
      if (themePanelColor) themePanelColor.value = current.panel ?? base.panel ?? '';
      if (themePanelColorHex) {
        const v = current.panel ?? base.panel ?? '';
        themePanelColorHex.value = String(v).toLowerCase();
      }
      if (themeHighlightColor) themeHighlightColor.value = current.highlight || base.highlight || '';
      if (themeHighlightColorHex) {
        const v = current.highlight ?? base.highlight ?? '';
        themeHighlightColorHex.value = String(v).toLowerCase();
      }
      if (themeSelectionLineStyle) themeSelectionLineStyle.value = current.selectionLineStyle || base.selectionLineStyle || 'auto';
      if (themeSelectionEffect) themeSelectionEffect.value = current.selectionEffect || base.selectionEffect || 'color';
      if (themeSelectionPointStyleSameAsLine) themeSelectionPointStyleSameAsLine.checked = current.selectionPointStyleSameAsLine ?? base.selectionPointStyleSameAsLine ?? false;
      if (themeLineWidthValue) themeLineWidthValue.textContent = `${current.lineWidth || base.lineWidth} px`;
      if (themePointSizeValue) themePointSizeValue.textContent = `${current.pointSize || base.pointSize} px`;
      if (themeArcRadiusValue) themeArcRadiusValue.textContent = `${current.angleDefaultRadius || base.angleDefaultRadius} px`;
      if (themeFontSizeValue) themeFontSizeValue.textContent = `${current.fontSize || base.fontSize} px`;
      if (themeHighlightWidthValue) themeHighlightWidthValue.textContent = `${current.highlightWidth || base.highlightWidth} px`;
      if (themeSelectionPointRadiusValue) themeSelectionPointRadiusValue.textContent = `${current.selectionPointRadius || base.selectionPointRadius} px`;
      themeBtns.forEach(btn => { btn.classList.toggle('active', btn.dataset.theme === theme); });
      drawPreview();
    }

    (window as any).refreshAppearanceTab = loadThemeValues;

    themeBtns.forEach(btn => { btn.addEventListener('click', () => { const theme = btn.dataset.theme as ThemeName; if (theme) { activeTheme = theme; loadThemeValues(); } }); });

    function saveThemeValue(key: keyof any, value: any) {
      const overridesObj = getThemeOverridesSafe();
      if (!overridesObj[activeTheme]) overridesObj[activeTheme] = {};
      overridesObj[activeTheme][key] = value;
      try { deps.saveThemeOverrides(); } catch (_) {}
      if (activeTheme === deps.getCurrentTheme()) { deps.applyThemeWithOverrides(activeTheme); deps.draw(); }
      drawPreview();
    }

    themeBgColor?.addEventListener('input', (e) => { const v = (e.target as HTMLInputElement).value; if (themeBgColorHex) themeBgColorHex.value = v.toLowerCase(); saveThemeValue('bg', v); });
    themeStrokeColor?.addEventListener('input', (e) => { const v = (e.target as HTMLInputElement).value; if (themeStrokeColorHex) themeStrokeColorHex.value = v.toLowerCase(); saveThemeValue('defaultStroke', v); });
    themePanelColor?.addEventListener('input', (e) => { const v = (e.target as HTMLInputElement).value; try { const root = document.documentElement; const body = document.body; root.style.setProperty('--panel', v); root.style.setProperty('--panel-border', v); if (body) { body.style.setProperty('--panel', v); body.style.setProperty('--panel-border', v); } } catch {} saveThemeValue('panel', v); saveThemeValue('panelBorder', v); });

    function normalizeHex(input: string): string | null { if (!input) return null; let v = input.trim(); if (!v.startsWith('#')) v = '#' + v; if (/^#([0-9a-fA-F]{3})$/.test(v)) { const r = v.charAt(1); const g = v.charAt(2); const b = v.charAt(3); return ('#' + r + r + g + g + b + b).toLowerCase(); } if (/^#([0-9a-fA-F]{6})$/.test(v)) return v.toLowerCase(); return null; }

    themeBgColorHex?.addEventListener('change', (e) => { const raw = (e.target as HTMLInputElement).value; const v = normalizeHex(raw); if (v && themeBgColor) { themeBgColor.value = v; saveThemeValue('bg', v); } else if (raw === '') { themeBgColorHex.value = ''; } });
    themeStrokeColorHex?.addEventListener('change', (e) => { const raw = (e.target as HTMLInputElement).value; const v = normalizeHex(raw); if (v && themeStrokeColor) { themeStrokeColor.value = v; saveThemeValue('defaultStroke', v); } });
    themeHighlightColorHex?.addEventListener('change', (e) => { const raw = (e.target as HTMLInputElement).value; const v = normalizeHex(raw); if (v && themeHighlightColor) { themeHighlightColor.value = v; saveThemeValue('highlight', v); } });
    themePanelColorHex?.addEventListener('change', (e) => { const raw = (e.target as HTMLInputElement).value; const v = normalizeHex(raw); if (v && themePanelColor) { themePanelColor.value = v; try { const root = document.documentElement; const body = document.body; root.style.setProperty('--panel', v); root.style.setProperty('--panel-border', v); if (body) { body.style.setProperty('--panel', v); body.style.setProperty('--panel-border', v); } } catch {} saveThemeValue('panel', v); saveThemeValue('panelBorder', v); } });

    themeHighlightColor?.addEventListener('input', (e) => { const v = (e.target as HTMLInputElement).value; if (themeHighlightColorHex) themeHighlightColorHex.value = v.toLowerCase(); saveThemeValue('highlight', v); });
    themeSelectionLineStyle?.addEventListener('change', (e) => { const v = (e.target as HTMLSelectElement).value; saveThemeValue('selectionLineStyle', v); });
    themeSelectionEffect?.addEventListener('change', (e) => { const v = (e.target as HTMLSelectElement).value; saveThemeValue('selectionEffect', v); });
    themeSelectionPointStyleSameAsLine?.addEventListener('change', (e) => { const v = (e.target as HTMLInputElement).checked; saveThemeValue('selectionPointStyleSameAsLine', v); });

    const sizeBtns = document.querySelectorAll<HTMLButtonElement>('.size-btn');
    function updateSize(btn: HTMLButtonElement) {
      const action = btn.dataset.action; const target = btn.dataset.target; if (!action || !target) return; const presets = (window as any).THEME_PRESETS || {}; const base = presets[activeTheme] || {}; const overridesObj = getThemeOverridesSafe(); const overrides = overridesObj[activeTheme] || {}; const current = { ...base, ...overrides };
      const delta = action === 'increase' ? 1 : -1;
      if (target === 'lineWidth') { const step = 0.1; const val = (current.lineWidth || base.lineWidth) + delta * step; const newValue = Math.max(0.1, Math.min(50, Math.round(val * 10) / 10)); saveThemeValue('lineWidth', newValue); saveThemeValue('angleStrokeWidth', newValue); if (themeLineWidthValue) themeLineWidthValue.textContent = `${newValue} px`; }
      else if (target === 'pointSize') { const step = 0.1; const val = (current.pointSize || base.pointSize) + delta * step; const newValue = Math.max(0.1, Math.min(50, Math.round(val * 10) / 10)); saveThemeValue('pointSize', newValue); if (themePointSizeValue) themePointSizeValue.textContent = `${newValue} px`; }
      else if (target === 'arcRadius') { const step = 1; const val = (current.angleDefaultRadius || base.angleDefaultRadius) + delta * step; const newValue = Math.max(1, Math.min(200, val)); saveThemeValue('angleDefaultRadius', newValue); if (themeArcRadiusValue) themeArcRadiusValue.textContent = `${newValue} px`; }
      else if (target === 'fontSize') { const step = 1; const val = (current.fontSize || base.fontSize) + delta * step; const newValue = Math.max(4, Math.min(100, val)); saveThemeValue('fontSize', newValue); if (themeFontSizeValue) themeFontSizeValue.textContent = `${newValue} px`; }
      else if (target === 'highlightWidth') { const step = 0.1; const val = (current.highlightWidth || base.highlightWidth) + delta * step; const newValue = Math.max(0.1, Math.min(20, Math.round(val * 10) / 10)); saveThemeValue('highlightWidth', newValue); if (themeHighlightWidthValue) themeHighlightWidthValue.textContent = `${newValue} px`; }
      else if (target === 'selectionPointRadius') { const step = 1; const val = (current.selectionPointRadius || base.selectionPointRadius) + delta * step; const newValue = Math.max(1, Math.min(50, val)); saveThemeValue('selectionPointRadius', newValue); if (themeSelectionPointRadiusValue) themeSelectionPointRadiusValue.textContent = `${newValue} px`; }
    }

    sizeBtns.forEach(btn => {
      let intervalId: any = null; let timeoutId: any = null; const stop = () => { if (timeoutId) clearTimeout(timeoutId); if (intervalId) clearInterval(intervalId); timeoutId = null; intervalId = null; };
      const start = (e: Event) => { if (e instanceof MouseEvent && e.button !== 0) return; e.preventDefault(); stop(); updateSize(btn); timeoutId = setTimeout(() => { intervalId = setInterval(() => { updateSize(btn); }, 100); }, 500); };
      btn.addEventListener('mousedown', start); btn.addEventListener('touchstart', start, { passive: false }); btn.addEventListener('mouseup', stop); btn.addEventListener('mouseleave', stop); btn.addEventListener('touchend', stop); btn.addEventListener('touchcancel', stop); btn.addEventListener('click', (e) => { updateSize(btn); });
    });

    resetBtn?.addEventListener('click', () => {
      const overridesObj = getThemeOverridesSafe(); overridesObj[activeTheme] = {};
      try { deps.saveThemeOverrides(); } catch (_) {}
      if (activeTheme === deps.getCurrentTheme()) { deps.applyThemeWithOverrides(activeTheme); deps.draw(); }
      loadThemeValues();
    });

    function drawPreview() {
      if (!previewCanvas) return; const ctx = previewCanvas.getContext('2d'); if (!ctx) return; const presets = (window as any).THEME_PRESETS || {}; const base = presets[activeTheme] || {}; const overridesObj = getThemeOverridesSafe(); const overrides = overridesObj[activeTheme] || {}; const theme = { ...base, ...overrides };
      const w = previewCanvas.width; const h = previewCanvas.height; ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, w, h);
      const points = [ { x: w * 0.25, y: h * 0.7 }, { x: w * 0.75, y: h * 0.7 }, { x: w * 0.5, y: h * 0.3 } ]; ctx.strokeStyle = theme.defaultStroke; ctx.lineWidth = theme.lineWidth; ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); ctx.lineTo(points[1].x, points[1].y); ctx.moveTo(points[2].x, points[2].y); ctx.lineTo(points[0].x, points[0].y); ctx.stroke(); ctx.save(); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(points[1].x, points[1].y); ctx.lineTo(points[2].x, points[2].y); ctx.stroke(); ctx.restore(); const lineStyle = theme.selectionLineStyle || 'auto'; const effect = theme.selectionEffect || 'color'; ctx.save(); if (effect === 'halo') { ctx.globalAlpha = 0.5; const extraWidth = (theme.highlightWidth || 1.5) * 4; ctx.lineWidth = theme.lineWidth + extraWidth; } else { ctx.globalAlpha = 1.0; ctx.lineWidth = theme.lineWidth + (theme.highlightWidth || 0); } ctx.strokeStyle = theme.highlight; if (lineStyle === 'dashed') ctx.setLineDash([4,4]); else if (lineStyle === 'dotted') { const dotSize = ctx.lineWidth; ctx.setLineDash([0, dotSize*2]); ctx.lineCap = 'round'; } else ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(points[1].x, points[1].y); ctx.lineTo(points[2].x, points[2].y); ctx.stroke(); if (lineStyle === 'dotted') ctx.lineCap = 'butt'; ctx.restore(); const previewHollow = (localStorage.getItem(deps.POINT_STYLE_MODE_KEY) === 'hollow'); const previewRadius = theme.pointSize + 2; const drawPointMarker = (p: { x:number,y:number }) => { ctx.beginPath(); ctx.arc(p.x, p.y, previewRadius, 0, Math.PI*2); if (previewHollow) { ctx.strokeStyle = theme.defaultStroke; ctx.lineWidth = 2; ctx.stroke(); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(previewRadius-3,0), 0, Math.PI*2); ctx.fillStyle = theme.bg; ctx.fill(); } else { ctx.fillStyle = theme.defaultStroke; ctx.fill(); } }; points.forEach(drawPointMarker);
      // selection markers
      ctx.save(); if (theme.selectionPointStyleSameAsLine) { if (effect === 'halo') { ctx.globalAlpha = 0.5; ctx.lineWidth = (theme.highlightWidth || 1.5) * 4; } else { ctx.globalAlpha = 1.0; ctx.lineWidth = theme.highlightWidth || 1.5; } if (lineStyle === 'dashed') ctx.setLineDash([4,4]); else if (lineStyle === 'dotted') { const dotSize = ctx.lineWidth; ctx.setLineDash([0, dotSize*2]); ctx.lineCap = 'round'; } else ctx.setLineDash([6,3]); } else { ctx.globalAlpha = 1.0; ctx.lineWidth = 2; ctx.setLineDash([6,3]); } ctx.strokeStyle = theme.highlight; ctx.beginPath(); ctx.arc(points[1].x, points[1].y, theme.selectionPointRadius, 0, Math.PI*2); ctx.stroke(); if (theme.selectionPointStyleSameAsLine && lineStyle === 'dotted') ctx.lineCap = 'butt'; ctx.restore(); const centerPoint = { x: (points[0].x + points[1].x + points[2].x)/3, y: (points[0].y + points[1].y + points[2].y)/3 }; drawPointMarker(centerPoint); ctx.save(); if (theme.selectionPointStyleSameAsLine) { if (effect === 'halo') { ctx.globalAlpha = 0.5; ctx.lineWidth = (theme.highlightWidth || 1.5) * 4; } else { ctx.globalAlpha = 1.0; ctx.lineWidth = theme.highlightWidth || 1.5; } if (lineStyle === 'dashed') ctx.setLineDash([4,4]); else if (lineStyle === 'dotted') { const dotSize = ctx.lineWidth; ctx.setLineDash([0, dotSize*2]); ctx.lineCap = 'round'; } else ctx.setLineDash([6,3]); } else { ctx.globalAlpha = 1.0; ctx.lineWidth = 2; ctx.setLineDash([6,3]); } ctx.strokeStyle = theme.highlight; ctx.beginPath(); ctx.arc(centerPoint.x, centerPoint.y, theme.selectionPointRadius, 0, Math.PI*2); ctx.stroke(); if (theme.selectionPointStyleSameAsLine && lineStyle === 'dotted') ctx.lineCap = 'butt'; ctx.restore(); const angleCenter = points[2]; const angle1 = Math.atan2(points[0].y - angleCenter.y, points[0].x - angleCenter.x); const angle2 = Math.atan2(points[1].y - angleCenter.y, points[1].x - angleCenter.x); ctx.strokeStyle = theme.defaultStroke; ctx.lineWidth = theme.lineWidth; ctx.beginPath(); ctx.arc(angleCenter.x, angleCenter.y, theme.angleDefaultRadius, angle2, angle1); ctx.stroke(); const circleCenter = { x: w*0.75, y: h*0.35 }; const circleRadius = w*0.12; ctx.strokeStyle = theme.defaultStroke; ctx.lineWidth = theme.lineWidth; ctx.beginPath(); ctx.arc(circleCenter.x, circleCenter.y, circleRadius, 0, Math.PI*2); ctx.stroke(); const circlePoint1 = { x: circleCenter.x + circleRadius*Math.cos(Math.PI*0.25), y: circleCenter.y + circleRadius*Math.sin(Math.PI*0.25) }; const circlePoint2 = { x: circleCenter.x + circleRadius*Math.cos(Math.PI*1.75), y: circleCenter.y + circleRadius*Math.sin(Math.PI*1.75) }; [circlePoint1, circlePoint2].forEach(drawPointMarker); ctx.fillStyle = theme.defaultStroke; ctx.font = `${theme.fontSize || 12}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('A', points[0].x, points[0].y + 20); ctx.fillText('B', points[1].x, points[1].y + 20); ctx.fillText('C', points[2].x, points[2].y - 20);
    }
    appearancePreviewCallback = () => drawPreview();
    loadThemeValues();
  }

  function initLabelKeypad() {
    const container = document.getElementById('labelGreekRow'); if (!container) return; const count = Math.max((window as any).GREEK_LOWER.length, (window as any).SCRIPT_LOWER.length); for (let i=0;i<count;i++) { const lower = (window as any).GREEK_LOWER[i]; const upper = lower ? lower.toUpperCase() : ''; const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'tool icon-btn label-greek-btn'; if (lower) { btn.title = lower; btn.dataset.letter = lower; btn.dataset.letterLower = lower; btn.dataset.letterUpper = upper; btn.textContent = lower; } else { btn.title = ''; btn.dataset.letter = ''; btn.dataset.letterLower = ''; btn.dataset.letterUpper = ''; btn.textContent = ''; btn.style.display = 'none'; } container.appendChild(btn); } for (const sym of (window as any).LABEL_SYMBOLS) { const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'tool icon-btn label-greek-btn label-symbol-btn'; btn.title = sym; btn.dataset.letter = sym; btn.dataset.letterLower = sym; btn.dataset.letterUpper = sym; btn.textContent = sym; container.appendChild(btn); } }

  function showImportFeedback(success: boolean) { const btn = document.getElementById('importConfigBtn'); if (!btn) return; const existing = btn.querySelector('.import-feedback'); if (existing) existing.remove(); const feedback = document.createElement('span'); feedback.className = 'import-feedback'; feedback.style.cssText = 'margin-left: 8px; font-size: 16px; display: inline-block; animation: fadeIn 0.3s ease;'; feedback.textContent = success ? '✓' : '✗'; feedback.style.color = success ? '#4ade80' : '#f87171'; btn.appendChild(feedback); setTimeout(() => { feedback.style.transition = 'opacity 0.3s ease'; feedback.style.opacity = '0'; setTimeout(() => feedback.remove(), 300); }, 2000); }

  function reinitToolButtons() {
    // Re-query tool buttons and attach handlers that delegate into deps
    const modeAddBtn = document.getElementById('modeAdd') as HTMLButtonElement | null;
    const modeIntersectionBtn = document.getElementById('modeIntersection') as HTMLButtonElement | null;
    const modeSegmentBtn = document.getElementById('modeSegment') as HTMLButtonElement | null;
    const modeLabelBtn = document.getElementById('modeLabel') as HTMLButtonElement | null;
    const modeMoveBtn = document.getElementById('modeMove') as HTMLButtonElement | null;
    const modeMultiselectBtn = document.getElementById('modeMultiselect') as HTMLButtonElement | null;
    modeAddBtn?.addEventListener('click', () => deps.handleToolClick('add'));
    modeIntersectionBtn?.addEventListener('click', () => deps.handleToolClick('intersection'));
    modeSegmentBtn?.addEventListener('click', () => deps.handleToolClick('segment'));
    modeLabelBtn?.addEventListener('click', () => { deps.setMode('label' as any); deps.updateToolButtons(); });
    modeMoveBtn?.addEventListener('click', () => { if (deps.getMode() === 'move') { /* noop */ } else { deps.setMode('move' as any); deps.updateToolButtons(); deps.updateSelectionButtons(); deps.draw(); } });
    modeMultiselectBtn?.addEventListener('click', () => deps.handleToolClick('multiselect'));
    // double-tap sticky behavior handled via deps.setupDoubleTapSticky if needed
  }

  function attachHoldHandler(btn: HTMLElement, action: () => void) {
    let intervalId: any = null; let timeoutId: any = null; const stop = () => { if (timeoutId) clearTimeout(timeoutId); if (intervalId) clearInterval(intervalId); timeoutId = null; intervalId = null; };
    const start = (e: Event) => { if (e instanceof MouseEvent && e.button !== 0) return; e.preventDefault(); stop(); action(); timeoutId = setTimeout(() => { intervalId = setInterval(() => { action(); }, 100); }, 500); };
    btn.addEventListener('mousedown', start); btn.addEventListener('touchstart', start, { passive: false }); btn.addEventListener('mouseup', stop); btn.addEventListener('mouseleave', stop); btn.addEventListener('touchend', stop); btn.addEventListener('touchcancel', stop); btn.addEventListener('click', (e) => { if ((e as any).detail === 0) action(); });
  }

  // --- Exported API ---
  return {
    initializeButtonConfig,
    loadButtonOrder,
    loadButtonConfiguration,
    applyButtonConfiguration,
    exportButtonConfiguration,
    importButtonConfiguration,
    setDefaultPointFillMode,
    updatePointStyleConfigButtons,
    initAppearanceTab,
    initLabelKeypad,
    showImportFeedback,
    reinitToolButtons,
    attachHoldHandler,
    // expose helper functions so callers can trigger palette rebuild/drag setup
    rebuildPalette,
    setupPaletteDragAndDrop,
    triggerAppearancePreview: () => { appearancePreviewCallback?.(); }
  };
}
