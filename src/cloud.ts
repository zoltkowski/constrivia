// Funkcjonalność zarządzania plikami w chmurze (Cloudflare KV), bibliotece i lokalnych

import { saveDefaultFolderHandle } from './main';

// === PANEL STATE ===
const DEBUG_PANEL_MARGIN = { x: 20, y: 20 };
const DEBUG_PANEL_TOP_MIN = 60;

let cloudPanel: HTMLElement | null = null;
let cloudPanelHeader: HTMLElement | null = null;
let cloudCloseBtn: HTMLButtonElement | null = null;
let localFileList: HTMLElement | null = null;
let libraryFileList: HTMLElement | null = null;
let cloudFileList: HTMLElement | null = null;
let currentTab: 'local' | 'library' | 'cloud' = 'local';
let cloudPanelPos: { x: number; y: number } | null = null;
let lastLoadedFile: { name: string; type: 'local' | 'library' | 'cloud' } | null = null;
let isCollapsedState = false;
let localDirectoryHandle: FileSystemDirectoryHandle | null = null;
let cloudActiveLoadCallback: ((data: any) => void) | null = null;
type CloudPanelMode = 'load' | 'save';
let cloudPanelMode: CloudPanelMode = 'load';
let pendingSaveDocument: any = null;
let cloudSaveBar: HTMLElement | null = null;
let cloudFilenameInput: HTMLInputElement | null = null;
let cloudSaveButton: HTMLButtonElement | null = null;

type DragState = {
  pointerId: number;
  start: { x: number; y: number };
  panelStart: { x: number; y: number };
};
let cloudDragState: DragState | null = null;
let storagePersistenceRequested = false;
let cloudFileExtension = '.json';
function emitCloudEvent(name: 'cloud-panel-opened' | 'cloud-panel-closed') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(name));
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('default-folder-changed', (event) => {
    const detail = (event as CustomEvent<{ handle: FileSystemDirectoryHandle | null }>).detail;
    const nextHandle = detail?.handle ?? null;
    localDirectoryHandle = nextHandle;
    if (currentTab === 'local' && cloudActiveLoadCallback) {
      loadLocalList(cloudActiveLoadCallback);
    }
  });
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

async function ensureStoragePersistence() {
  if (storagePersistenceRequested) return;
  storagePersistenceRequested = true;
  try {
    if (navigator.storage?.persist) {
      const already = await navigator.storage.persisted();
      if (!already) {
        await navigator.storage.persist();
      }
    }
  } catch (err) {
    console.warn('Storage persistence request failed:', err);
  }
}

// === INDEXEDDB FOR LOCAL FOLDER ===
const DB_NAME = 'GeometryAppDB';
const DB_VERSION = 1;
// Must match src/main.ts IndexedDB schema (saveDefaultFolderHandle).
const STORE_NAME = 'settings';

function openDBWithVersion(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      console.warn('IndexedDB open blocked (another tab may still be using it).');
    };
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function openDB(): Promise<IDBDatabase> {
  let db = await openDBWithVersion(DB_VERSION);

  // If an older schema exists without the store, bump version to trigger upgrade.
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    const nextVersion = db.version + 1;
    db.close();
    db = await openDBWithVersion(nextVersion);
  }

  return db;
}

async function loadLocalDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get('defaultFolderHandle');
    
    return new Promise((resolve, reject) => {
      const close = () => {
        try {
          db.close();
        } catch {
          // ignore
        }
      };

      request.onsuccess = () => {
        const handle = request.result as FileSystemDirectoryHandle | undefined;
        resolve(handle || null);
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = close;
      transaction.onerror = () => {
        close();
        reject(transaction.error);
      };
      transaction.onabort = () => {
        close();
        reject(transaction.error);
      };
    });
  } catch (err) {
    console.error('Failed to load folder handle from IndexedDB:', err);
    return null;
  }
}

type FileSystemPermissionMode = 'read' | 'readwrite';

async function verifyPermission(
  handle: FileSystemDirectoryHandle,
  mode: FileSystemPermissionMode = 'read',
  persistOnGrant: boolean = false
): Promise<boolean> {
  await ensureStoragePersistence();
  try {
    // @ts-ignore
    const permission = await handle.queryPermission({ mode });
    if (permission === 'granted') return true;

    // @ts-ignore
    const requestPermission = await handle.requestPermission({ mode });
    const granted = requestPermission === 'granted';
    if (granted && persistOnGrant) {
      await saveDefaultFolderHandle(handle);
    }
    return granted;
  } catch (err) {
    console.error('Permission verification failed:', err);
    return false;
  }
}

// === CLOUDFLARE KV ===
export async function listKeys(): Promise<string[]> {
  const res = await fetch("/api/json/list");
  const data = await res.json();
  return data.result.map((k: any) => k.name);
}

export async function loadFromKV(key: string): Promise<any> {
  const res = await fetch(`/api/json/${encodeURIComponent(key)}`);
  if (!res.ok) {
    throw new Error(`KV GET failed: ${res.status}`);
  }
  return await res.json();
}

export async function deleteFromKV(key: string): Promise<void> {
  const res = await fetch(`/api/json/${encodeURIComponent(key)}`, {
    method: "DELETE"
  });
  if (!res.ok) {
    throw new Error(`KV DELETE failed: ${res.status}`);
  }
}

export async function saveToKV(key: string, data: any): Promise<void> {
  const res = await fetch(`/api/json/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    throw new Error(`KV PUT failed: ${res.status}`);
  }
}

// === BIBLIOTEKA (content folder) ===
const LIBRARY_MANIFEST_URL = '/content/index.json';
const LIBRARY_MANIFEST_FILENAME = 'index.json';
const decodeKvKey = (key: string) => {
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
};

async function fetchLibraryManifest(): Promise<string[] | null> {
  try {
    const res = await fetch(`${LIBRARY_MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      return data
        .map(name => (typeof name === 'string' ? name.trim() : ''))
        .filter(name => {
          if (!name || !name.toLowerCase().endsWith(cloudFileExtension)) return false;
          return name.toLowerCase() !== LIBRARY_MANIFEST_FILENAME;
        });
    }
    return null;
  } catch (err) {
    console.warn('Library manifest unavailable:', err);
    return null;
  }
}

export async function listLibraryFiles(): Promise<string[]> {
  try {
    const manifest = await fetchLibraryManifest();
    if (manifest && manifest.length > 0) {
      return manifest;
    }
    
    // Próbuj pobrać listę plików z folderu content (fallback)
    const res = await fetch('/content/', { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Library listing failed: ${res.status}`);
    }
    const text = await res.text();
    
    // Prosta ekstrakcja linków do plików z dopuszczonym rozszerzeniem z HTML directory listing
    const escapedExt = cloudFileExtension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = text.matchAll(new RegExp(`href="([^"]+${escapedExt})"`, 'gi'));
    const files = new Set<string>();
    for (const match of matches) {
      const href = match[1];
      const decoded = decodeURIComponent(href);
      const filename = decoded.split('/').pop() ?? decoded;
      if (filename.toLowerCase().endsWith(cloudFileExtension) && filename.toLowerCase() !== LIBRARY_MANIFEST_FILENAME) {
        files.add(filename);
      }
    }
    
    return Array.from(files).sort((a, b) => a.localeCompare(b, 'pl'));
  } catch (err) {
    console.error('Nie udało się pobrać listy biblioteki:', err);
    return [];
  }
}

export async function loadFromLibrary(filename: string): Promise<any> {
  const res = await fetch(`/content/${filename}`);
  if (!res.ok) {
    throw new Error(`Library GET failed: ${res.status}`);
  }
  return await res.json();
}

// === PANEL MANAGEMENT ===
function applyCloudPanelPosition() {
  if (!cloudPanel || !cloudPanelPos) return;
  cloudPanel.style.left = `${cloudPanelPos.x}px`;
  cloudPanel.style.top = `${cloudPanelPos.y}px`;
}

function ensureCloudPanelPosition() {
  if (!cloudPanel) return;
  const rect = cloudPanel.getBoundingClientRect();
  const width = rect.width || cloudPanel.offsetWidth || 320;
  const height = rect.height || cloudPanel.offsetHeight || 240;
  const maxX = Math.max(DEBUG_PANEL_MARGIN.x, window.innerWidth - width - DEBUG_PANEL_MARGIN.x);
  const maxY = Math.max(DEBUG_PANEL_TOP_MIN, window.innerHeight - height - DEBUG_PANEL_MARGIN.y);
  if (!cloudPanelPos) {
    cloudPanelPos = {
      x: clamp(DEBUG_PANEL_MARGIN.x, DEBUG_PANEL_MARGIN.x, maxX),
      y: clamp(DEBUG_PANEL_TOP_MIN, DEBUG_PANEL_TOP_MIN, maxY)
    };
  } else {
    cloudPanelPos = {
      x: clamp(cloudPanelPos.x, DEBUG_PANEL_MARGIN.x, maxX),
      y: clamp(cloudPanelPos.y, DEBUG_PANEL_TOP_MIN, maxY)
    };
  }
  applyCloudPanelPosition();
}

function markActiveItem(container: HTMLElement | null, item: HTMLElement) {
  container?.querySelectorAll('.cloud-file-item--active').forEach((el) => {
    el.classList.remove('cloud-file-item--active');
  });
  item.classList.add('cloud-file-item--active');
}

function setLibraryTabVisibility(visible: boolean) {
  const libraryTab = cloudPanel?.querySelector('[data-tab="library"]') as HTMLElement | null;
  if (libraryTab) {
    libraryTab.style.display = visible ? '' : 'none';
  }
}

function updateSaveControlsVisibility() {
  if (!cloudSaveBar) return;
  cloudSaveBar.style.display = cloudPanelMode === 'save' ? 'flex' : 'none';
  if (cloudSaveButton) {
    cloudSaveButton.disabled = cloudPanelMode !== 'save';
  }
}

function stripExtension(name: string, ext: string): string {
  const escaped = ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name.replace(new RegExp(`${escaped}$`, 'i'), '');
}

function sanitizeFileBase(raw: string, ext: string = cloudFileExtension): string {
  return stripExtension(raw, ext).replace(/[\\/:*?"<>|]/g, '').trim();
}

function setCloudFileExtension(ext: string | undefined) {
  if (!ext) {
    cloudFileExtension = '.json';
    return;
  }
  cloudFileExtension = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
}

function setFilenameInputValue(raw: string) {
  if (!cloudFilenameInput) return;
  const base = sanitizeFileBase(raw);
  if (base.length > 0) {
    cloudFilenameInput.value = base;
  } else {
    cloudFilenameInput.value = '';
  }
}

function getFilenameInputValue(): string {
  if (!cloudFilenameInput) return '';
  return sanitizeFileBase(cloudFilenameInput.value || '');
}

function updateCloudPanelTitle() {
  const panelTitle = document.getElementById('cloudPanelTitle') as HTMLElement | null;
  if (!panelTitle) return;
  panelTitle.textContent = cloudPanelMode === 'save' ? 'Zapis pliku' : 'Pliki';
}

async function ensureLocalDirectoryForSave(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (!localDirectoryHandle) {
      localDirectoryHandle = await loadLocalDirectoryHandle();
    }
    if (!localDirectoryHandle) {
      // @ts-ignore
      localDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await saveDefaultFolderHandle(localDirectoryHandle);
    }
  } catch (err) {
    console.error('Nie wybrano folderu do zapisu:', err);
    return null;
  }
  
  const hasPermission = await verifyPermission(localDirectoryHandle!, 'readwrite', true);
  if (!hasPermission) {
    window.alert('Brak uprawnień do zapisu w wybranym folderze.');
    return null;
  }
  return localDirectoryHandle;
}

async function saveDocumentLocally(fileName: string): Promise<boolean> {
  const directoryHandle = await ensureLocalDirectoryForSave();
  if (!directoryHandle) return false;
  try {
    // @ts-ignore
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    const payload = JSON.stringify(pendingSaveDocument, null, 2);
    await writable.write(payload);
    await writable.close();
    lastLoadedFile = { name: fileName, type: 'local' };
    await loadLocalList(cloudActiveLoadCallback || (() => {}));
    return true;
  } catch (err) {
    console.error('Nie udało się zapisać pliku lokalnego:', err);
    window.alert('Nie udało się zapisać pliku lokalnego.');
    return false;
  }
}

async function saveDocumentToCloud(baseName: string): Promise<boolean> {
  const keyEncoded = encodeURIComponent(`${baseName}${cloudFileExtension}`);
  try {
    await saveToKV(keyEncoded, pendingSaveDocument);
    lastLoadedFile = { name: keyEncoded, type: 'cloud' };
    await loadCloudList(cloudActiveLoadCallback || (() => {}));
    return true;
  } catch (err) {
    console.error('Nie udało się zapisać pliku w chmurze:', err);
    window.alert('Nie udało się zapisać pliku w chmurze.');
    return false;
  }
}

async function handleCloudSaveAction() {
  if (cloudPanelMode !== 'save') return;
  if (!pendingSaveDocument) {
    window.alert('Brak danych do zapisania.');
    return;
  }
  const baseName = getFilenameInputValue();
  if (!baseName) {
    window.alert('Podaj nazwę pliku.');
    cloudFilenameInput?.focus();
    return;
  }
  if (currentTab === 'local') {
    const fileName = `${baseName}${cloudFileExtension}`;
    await saveDocumentLocally(fileName);
  } else if (currentTab === 'cloud') {
    await saveDocumentToCloud(baseName);
  } else {
    window.alert('Wybierz zakładkę zapisu (Lokalnie lub Chmura).');
  }
}

function endCloudPanelDrag(pointerId?: number) {
  if (!cloudDragState) return;
  if (pointerId !== undefined && cloudDragState.pointerId !== pointerId) return;
  try {
    cloudPanelHeader?.releasePointerCapture(cloudDragState.pointerId);
  } catch (err) {
    // ignore
  }
  cloudPanel?.classList.remove('debug-panel--dragging');
  cloudDragState = null;
}

export function initCloudPanel() {
  cloudPanel = document.getElementById('cloudPanel');
  cloudPanelHeader = document.getElementById('cloudPanelHandle');
  cloudCloseBtn = document.getElementById('cloudCloseBtn') as HTMLButtonElement | null;
  localFileList = document.getElementById('localFileList');
  libraryFileList = document.getElementById('libraryFileList');
  cloudFileList = document.getElementById('cloudFileList');
  cloudSaveBar = document.getElementById('cloudSaveBar');
  cloudFilenameInput = document.getElementById('cloudFilenameInput') as HTMLInputElement | null;
  cloudSaveButton = document.getElementById('cloudSaveBtn') as HTMLButtonElement | null;
  
  if (!cloudPanel || !cloudPanelHeader || !localFileList || !libraryFileList || !cloudFileList) {
    console.error('Cloud panel elements not found');
    return;
  }

  // Request persistent storage so zapisane uchwyty do folderu mają większą szansę przetrwać restart PWA
  ensureStoragePersistence();

  cloudSaveButton?.addEventListener('click', () => {
    handleCloudSaveAction();
  });
  cloudFilenameInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleCloudSaveAction();
    }
  });
  updateSaveControlsVisibility();

  // Close button
  cloudCloseBtn?.addEventListener('click', () => {
    closeCloudPanel();
  });

  // Drag handling
  const handleCloudPointerDown = (ev: PointerEvent) => {
    if (!cloudPanel || !cloudPanelHeader) return;
    const target = ev.target as HTMLElement | null;
    if (target && (target.closest('#cloudCloseBtn') || target.closest('.cloud-toolbar') || target.closest('.cloud-toolbar-btn'))) return;
    cloudPanelHeader.setPointerCapture(ev.pointerId);
    const rect = cloudPanel.getBoundingClientRect();
    if (!cloudPanelPos) {
      cloudPanelPos = { x: rect.left, y: rect.top };
    }
    cloudDragState = {
      pointerId: ev.pointerId,
      start: { x: ev.clientX, y: ev.clientY },
      panelStart: { x: cloudPanelPos!.x, y: cloudPanelPos!.y }
    };
    cloudPanel.classList.add('debug-panel--dragging');
    ev.preventDefault();
  };

  cloudPanelHeader.addEventListener('pointerdown', handleCloudPointerDown);
  cloudPanelHeader.addEventListener('pointermove', (ev) => {
    if (!cloudDragState || cloudDragState.pointerId !== ev.pointerId || !cloudPanel) return;
    const dx = ev.clientX - cloudDragState.start.x;
    const dy = ev.clientY - cloudDragState.start.y;
    const rect = cloudPanel.getBoundingClientRect();
    const width = rect.width || cloudPanel.offsetWidth || 320;
    const height = rect.height || cloudPanel.offsetHeight || 240;
    const maxX = Math.max(DEBUG_PANEL_MARGIN.x, window.innerWidth - width - DEBUG_PANEL_MARGIN.x);
    const maxY = Math.max(DEBUG_PANEL_TOP_MIN, window.innerHeight - height - DEBUG_PANEL_MARGIN.y);
    cloudPanelPos = {
      x: clamp(cloudDragState.panelStart.x + dx, DEBUG_PANEL_MARGIN.x, maxX),
      y: clamp(cloudDragState.panelStart.y + dy, DEBUG_PANEL_TOP_MIN, maxY)
    };
    applyCloudPanelPosition();
  });
  
  const releaseCloudPointer = (ev: PointerEvent) => {
    if (!cloudDragState || cloudDragState.pointerId !== ev.pointerId) return;
    endCloudPanelDrag(ev.pointerId);
  };
  
  cloudPanelHeader.addEventListener('pointerup', releaseCloudPointer);
  cloudPanelHeader.addEventListener('pointercancel', releaseCloudPointer);

  // Resize handling
  window.addEventListener('resize', () => {
    if (cloudPanel && cloudPanel.style.display !== 'none') {
      ensureCloudPanelPosition();
    }
  });
  
  // Event delegation dla przycisków toggle
  cloudPanel.addEventListener('click', (e: MouseEvent) => {
    const panel = cloudPanel;
    if (!panel) return;

    const target = e.target as HTMLElement;
    
    // Sprawdź czy kliknięto w toggle button lub jego dzieci (SVG)
    let toggleBtn = target.closest('[data-toggle-local], [data-toggle-library], [data-toggle-cloud]') as HTMLElement;
    
    // Jeśli to SVG/path, sprawdź czy rodzic ma data-toggle
    if (!toggleBtn && (target.tagName === 'svg' || target.tagName === 'path')) {
      const parent = target.closest('button');
      if (parent?.hasAttribute('data-toggle-local') || parent?.hasAttribute('data-toggle-library') || parent?.hasAttribute('data-toggle-cloud')) {
        toggleBtn = parent as HTMLElement;
      }
    }
    
    if (!toggleBtn) return;
    
    const panelContent = document.querySelector('#cloudPanel .debug-panel__content') as HTMLElement;
    const panelTitle = document.getElementById('cloudPanelTitle') as HTMLElement;
    const toolbarHeader = document.getElementById('cloudToolbarHeader') as HTMLElement;
    
    const isCurrentlyCollapsed = panelContent?.style.display === 'none';
    
    if (isCurrentlyCollapsed) {
      // Rozwiń
      if (panelContent) panelContent.style.display = '';
      if (panelTitle) {
        panelTitle.style.display = '';
        panelTitle.style.pointerEvents = '';
      }
      const closeBtn = panel.querySelector('.debug-panel__close') as HTMLElement;
      if (closeBtn) closeBtn.style.pointerEvents = '';
      if (toolbarHeader) {
        const toolbar = toolbarHeader.querySelector('.cloud-toolbar');
        // Sprawdź która zakładka jest aktywna
        const tabLocal = panel.querySelector('[data-tab="local"]');
        const tabLibrary = panel.querySelector('[data-tab="library"]');
        const tabCloud = panel.querySelector('[data-tab="cloud"]');
        const isLocalActive = tabLocal?.classList.contains('cloud-tab--active');
        const isLibraryActive = tabLibrary?.classList.contains('cloud-tab--active');
        const targetList = isLocalActive ? localFileList : (isLibraryActive ? libraryFileList : cloudFileList);
        
        if (toolbar && targetList) {
          // Jeśli lista jest pusta lub pierwszy element to już toolbar, użyj appendChild
          const firstElement = targetList.firstElementChild;
          if (!firstElement || firstElement.classList.contains('cloud-toolbar')) {
            targetList.appendChild(toolbar);
          } else {
            targetList.insertBefore(toolbar, firstElement);
          }
        }
        toolbarHeader.style.display = 'none';
      }
      const refreshBtn = panel.querySelector('.cloud-toolbar button:nth-child(4)') as HTMLElement;
      if (refreshBtn) refreshBtn.style.display = '';
      const toolbar = panel.querySelector('.cloud-toolbar') as HTMLElement;
      if (toolbar) toolbar.style.borderBottom = '';
      isCollapsedState = false;
      toggleBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>`;
    } else {
      // Zwiń
      if (panelContent) panelContent.style.display = 'none';
      if (panelTitle) {
        panelTitle.style.display = 'none';
        panelTitle.style.pointerEvents = 'none';
      }
      const closeBtn = panel.querySelector('.debug-panel__close') as HTMLElement;
      if (closeBtn) closeBtn.style.pointerEvents = 'none';
      if (toolbarHeader) {
        // Znajdź toolbar z AKTYWNEJ listy, nie pierwszy w DOM
        const tabLocal = panel.querySelector('[data-tab="local"]');
        const tabLibrary = panel.querySelector('[data-tab="library"]');
        const isLocalActive = tabLocal?.classList.contains('cloud-tab--active');
        const isLibraryActive = tabLibrary?.classList.contains('cloud-tab--active');
        const activeList = isLocalActive ? localFileList : (isLibraryActive ? libraryFileList : cloudFileList);
        const toolbar = activeList?.querySelector('.cloud-toolbar');
        
        if (toolbar && toolbar.parentElement !== toolbarHeader) {
          toolbarHeader.appendChild(toolbar);
          toolbarHeader.style.display = 'flex';
          toolbarHeader.style.pointerEvents = 'auto';
          toolbar.querySelectorAll('button').forEach(btn => {
            (btn as HTMLElement).style.pointerEvents = 'auto';
          });
        }
      }
      const refreshBtn = panel.querySelector('.cloud-toolbar button:nth-child(4)') as HTMLElement;
      if (refreshBtn) refreshBtn.style.display = 'none';
      const toolbar = panel.querySelector('.cloud-toolbar') as HTMLElement;
      if (toolbar) toolbar.style.borderBottom = 'none';
      isCollapsedState = true;
      toggleBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>`;
    }
  });
}

function setupCloudTabs(onLoadCallback: (data: any) => void) {
  if (!cloudPanel) return;
  const tabs = cloudPanel.querySelectorAll('.cloud-tab');
  tabs.forEach((tab) => {
    const tabName = tab.getAttribute('data-tab') as 'local' | 'library' | 'cloud';
    const newTab = tab.cloneNode(true) as HTMLElement;
    tab.parentNode?.replaceChild(newTab, tab);
    newTab.addEventListener('click', () => {
      if (cloudPanelMode === 'save' && tabName === 'library') return;
      switchTab(tabName, onLoadCallback);
    });
  });
}

type CloudInitOptions = {
  hideLibraryTab?: boolean;
  title?: string;
  fileExtension?: string;
};

export function initCloudUI(onLoadCallback: (data: any) => void, options?: CloudInitOptions) {
  if (!cloudPanel || !localFileList || !libraryFileList || !cloudFileList) {
    console.error('Cloud panel not initialized. Call initCloudPanel() first.');
    return;
  }
  
  setCloudFileExtension(options?.fileExtension || '.json');
  cloudActiveLoadCallback = onLoadCallback;
  cloudPanelMode = 'load';
  pendingSaveDocument = null;
  setLibraryTabVisibility(!options?.hideLibraryTab);
  updateSaveControlsVisibility();
  if (options?.title) {
    const panelTitle = document.getElementById('cloudPanelTitle') as HTMLElement | null;
    if (panelTitle) panelTitle.textContent = options.title;
  } else {
    updateCloudPanelTitle();
  }
  if (cloudFilenameInput) cloudFilenameInput.value = '';
  
  // Reset do stanu rozwiniętego
  isCollapsedState = false;
  const panelContent = document.querySelector('#cloudPanel .debug-panel__content') as HTMLElement;
  const panelTitle = document.getElementById('cloudPanelTitle') as HTMLElement;
  const toolbarHeader = document.getElementById('cloudToolbarHeader') as HTMLElement;
  if (panelContent) panelContent.style.display = '';
  if (panelTitle) panelTitle.style.display = '';
  if (toolbarHeader) toolbarHeader.style.display = 'none';
  
  setupCloudTabs(onLoadCallback);
  
  // Show panel and load files
  cloudPanel.style.display = 'flex';
  ensureCloudPanelPosition();
  currentTab = 'local';
  switchTab('local', onLoadCallback);
  emitCloudEvent('cloud-panel-opened');
}

export function initCloudSaveUI(data: any, suggestedName?: string, fileExtension: string = '.json') {
  if (!cloudPanel || !localFileList || !cloudFileList) {
    console.error('Cloud panel not initialized. Call initCloudPanel() first.');
    return;
  }
  const noop = () => {};
  setCloudFileExtension(fileExtension);
  cloudActiveLoadCallback = noop;
  cloudPanelMode = 'save';
  pendingSaveDocument = data;
  const base = sanitizeFileBase(suggestedName || '') || 'geometry';
  if (cloudFilenameInput) cloudFilenameInput.value = base;
  updateCloudPanelTitle();
  updateSaveControlsVisibility();
  setLibraryTabVisibility(false);
  
  isCollapsedState = false;
  const panelContent = document.querySelector('#cloudPanel .debug-panel__content') as HTMLElement;
  const panelTitle = document.getElementById('cloudPanelTitle') as HTMLElement;
  const toolbarHeader = document.getElementById('cloudToolbarHeader') as HTMLElement;
  if (panelContent) panelContent.style.display = '';
  if (panelTitle) panelTitle.style.display = '';
  if (toolbarHeader) toolbarHeader.style.display = 'none';
  
  setupCloudTabs(noop);
  
  cloudPanel.style.display = 'flex';
  ensureCloudPanelPosition();
  currentTab = 'local';
  switchTab('local', noop);
  setTimeout(() => cloudFilenameInput?.focus(), 0);
  emitCloudEvent('cloud-panel-opened');
}

export function closeCloudPanel() {
  if (cloudPanel) {
    cloudPanel.style.display = 'none';
  }
  if (cloudPanelMode === 'save') {
    cloudPanelMode = 'load';
    pendingSaveDocument = null;
    setLibraryTabVisibility(true);
    updateSaveControlsVisibility();
    updateCloudPanelTitle();
  }
  emitCloudEvent('cloud-panel-closed');
}

function switchTab(tab: 'local' | 'library' | 'cloud', onLoadCallback: (data: any) => void) {
  if (cloudPanelMode === 'save' && tab === 'library') {
    return;
  }
  currentTab = tab;
  
  // Aktualizuj wygląd zakładek
  const tabs = cloudPanel?.querySelectorAll('.cloud-tab');
  tabs?.forEach(t => {
    if (t.getAttribute('data-tab') === tab) {
      t.classList.add('cloud-tab--active');
    } else {
      t.classList.remove('cloud-tab--active');
    }
  });
  
  // Pokaż odpowiednią listę
  if (localFileList && libraryFileList && cloudFileList) {
    if (tab === 'local') {
      localFileList.style.display = '';
      libraryFileList.style.display = 'none';
      cloudFileList.style.display = 'none';
      loadLocalList(onLoadCallback);
    } else if (tab === 'library') {
      localFileList.style.display = 'none';
      libraryFileList.style.display = '';
      cloudFileList.style.display = 'none';
      loadLibraryList(onLoadCallback);
    } else {
      localFileList.style.display = 'none';
      libraryFileList.style.display = 'none';
      cloudFileList.style.display = '';
      loadCloudList(onLoadCallback);
    }
  }
}

async function loadLocalList(onLoadCallback: (data: any) => void) {
  if (!localFileList) return;
  
  try {
    // Wyczyść toolbar z nagłówka jeśli tam jest
    const toolbarHeader = document.getElementById('cloudToolbarHeader');
    if (toolbarHeader) toolbarHeader.innerHTML = '';
    
    localFileList.innerHTML = '<div class="cloud-loading">Ładowanie...</div>';
    
    // Spróbuj załadować handle z IndexedDB jeśli nie mamy go w pamięci
    if (!localDirectoryHandle) {
      localDirectoryHandle = await loadLocalDirectoryHandle();
    }
    
    // Sprawdź czy mamy handle i czy mamy do niego uprawnienia
    if (!localDirectoryHandle) {
      localFileList.innerHTML = `
        <div style="padding: 20px; text-align: center;">
          <p style="margin-bottom: 10px;">Nie wybrano folderu z plikami</p>
          <p style="margin-bottom: 15px; font-size: 13px; color: #888;">Ustaw domyślny folder w Konfiguracji lub wybierz tutaj</p>
          <button id="selectLocalFolder" style="padding: 8px 16px; cursor: pointer;">
            Wybierz folder
          </button>
        </div>
      `;
      
      const selectBtn = document.getElementById('selectLocalFolder');
      selectBtn?.addEventListener('click', async () => {
        try {
          const pickerMode: FileSystemPermissionMode = cloudPanelMode === 'save' ? 'readwrite' : 'read';
          // @ts-ignore - File System Access API
          localDirectoryHandle = await window.showDirectoryPicker({ mode: pickerMode });
          await saveDefaultFolderHandle(localDirectoryHandle);
          loadLocalList(onLoadCallback);
        } catch (err) {
          console.error('Nie wybrano folderu:', err);
        }
      });
      return;
    }
    
    // Sprawdź uprawnienia
    const hasPermission = await verifyPermission(localDirectoryHandle, 'read', true);
    if (!hasPermission) {
      localFileList.innerHTML = `
        <div style="padding: 20px; text-align: center;">
          <p style="margin-bottom: 10px;">Brak dostępu do folderu: ${localDirectoryHandle.name}</p>
          <button id="grantLocalAccess" style="padding: 8px 16px; cursor: pointer; margin-right: 8px;">
            Przyznaj dostęp
          </button>
          <button id="selectNewLocalFolder" style="padding: 8px 16px; cursor: pointer;">
            Wybierz inny folder
          </button>
        </div>
      `;
      
      document.getElementById('grantLocalAccess')?.addEventListener('click', async () => {
        loadLocalList(onLoadCallback);
      });
      
      document.getElementById('selectNewLocalFolder')?.addEventListener('click', async () => {
        try {
          const pickerMode: FileSystemPermissionMode = cloudPanelMode === 'save' ? 'readwrite' : 'read';
          // @ts-ignore
          localDirectoryHandle = await window.showDirectoryPicker({ mode: pickerMode });
          await saveDefaultFolderHandle(localDirectoryHandle);
          loadLocalList(onLoadCallback);
        } catch (err) {
          console.error('Nie wybrano folderu:', err);
        }
      });
      return;
    }
    
    // Pobierz pliki JSON z folderu
    const files: { name: string; handle: FileSystemFileHandle }[] = [];
    // @ts-ignore
    for await (const entry of localDirectoryHandle.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith(cloudFileExtension)) {
        files.push({ name: entry.name, handle: entry as FileSystemFileHandle });
      }
    }
    
    if (files.length === 0) {
      localFileList.innerHTML = '<div class="cloud-empty">Brak plików w folderze</div>';
      return;
    }
    
    // Sortuj pliki po nazwie
    files.sort((a, b) => a.name.localeCompare(b.name));
    
    localFileList.innerHTML = '';
    
    // Pasek nawigacji
    const toolbar = document.createElement('div');
    toolbar.className = 'cloud-toolbar';
    
    const prevBtn = document.createElement('button');
    prevBtn.className = 'cloud-toolbar-btn';
    prevBtn.title = 'Poprzedni plik';
    prevBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>`;
    
    const nextBtn = document.createElement('button');
    nextBtn.className = 'cloud-toolbar-btn';
    nextBtn.title = 'Następny plik';
    nextBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>`;
    
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'cloud-toolbar-btn';
    toggleBtn.title = 'Zwiń/rozwiń listę';
    toggleBtn.setAttribute('data-toggle-local', 'true');
    toggleBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>`;
    
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'cloud-toolbar-btn';
    refreshBtn.title = 'Odśwież listę';
    refreshBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
    
    const changeFolderBtn = document.createElement('button');
    changeFolderBtn.className = 'cloud-toolbar-btn';
    changeFolderBtn.title = 'Zmień folder';
    changeFolderBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 13h8"/><path d="M9 17h5"/></svg>`;
    
    toolbar.appendChild(prevBtn);
    toolbar.appendChild(nextBtn);
    toolbar.appendChild(toggleBtn);
    toolbar.appendChild(refreshBtn);
    toolbar.appendChild(changeFolderBtn);
    
    localFileList.appendChild(toolbar);
    
    changeFolderBtn.addEventListener('click', async () => {
      try {
        const pickerMode: FileSystemPermissionMode = cloudPanelMode === 'save' ? 'readwrite' : 'read';
        // @ts-ignore
        const handle = await window.showDirectoryPicker({ mode: pickerMode });
        if (handle) {
          localDirectoryHandle = handle;
          await saveDefaultFolderHandle(handle);
          await loadLocalList(onLoadCallback);
        }
      } catch (err) {
        console.error('Nie wybrano nowego folderu:', err);
      }
    });
    
    // Lista plików
    const fileListContainer = document.createElement('div');
    fileListContainer.className = 'cloud-file-list-container';
    const filteredFiles = files.filter(({ name }) => name.toLowerCase().endsWith(cloudFileExtension));
    if (filteredFiles.length === 0) {
      localFileList.innerHTML = `<div class="cloud-empty">Brak plików ${cloudFileExtension} w folderze</div>`;
      return;
    }
    
    for (const { name, handle } of filteredFiles) {
      const item = document.createElement('div');
      item.className = 'cloud-file-item';
      
      // Zaznacz ostatnio wczytany plik
      if (lastLoadedFile?.type === 'local' && lastLoadedFile?.name === name) {
        item.classList.add('cloud-file-item--active');
      }
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'cloud-file-item__name';
      nameSpan.textContent = stripExtension(name, cloudFileExtension);
      item.appendChild(nameSpan);
      
      const actions = document.createElement('div');
      actions.className = 'cloud-file-item__actions';
      
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `Wczytaj ${nameSpan.textContent ?? name}`);
      
      const loadFile = async () => {
        try {
          const file = await handle.getFile();
          const text = await file.text();
          const data = JSON.parse(text);
          lastLoadedFile = { name, type: 'local' };
          markActiveItem(localFileList, item);
          onLoadCallback(data);
        } catch (err) {
          console.error('Nie udało się wczytać pliku:', err);
          alert('Nie udało się wczytać pliku lokalnego.');
        }
      };
      
      const handleSelection = () => {
        if (cloudPanelMode === 'save') {
          setFilenameInputValue(name);
          lastLoadedFile = { name, type: 'local' };
          markActiveItem(localFileList, item);
          return;
        }
        loadFile();
      };
      
      item.addEventListener('click', (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('.cloud-file-item__btn--delete')) return;
        handleSelection();
      });
      
      item.addEventListener('keydown', (event) => {
        if (event.target !== item) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleSelection();
        }
      });
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'cloud-file-item__btn cloud-file-item__btn--delete';
      deleteBtn.title = 'Usuń';
      deleteBtn.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 6h14"/>
          <path d="M10 10v8"/>
          <path d="M14 10v8"/>
          <path d="M7 6 8 4h8l1 2"/>
          <path d="M6 6v14h12V6"/>
        </svg>
      `;
      deleteBtn.addEventListener('click', async (evt) => {
        evt.stopPropagation();
        if (!localDirectoryHandle) {
          alert('Brak dostępu do folderu.');
          return;
        }
        if (!confirm(`Czy na pewno chcesz usunąć plik "${name}" z folderu?`)) {
          return;
        }
        try {
          const hasWritePermission = await verifyPermission(localDirectoryHandle, 'readwrite', true);
          if (!hasWritePermission) {
            alert('Brak uprawnień do edycji folderu.');
            return;
          }
          const dirHandle = localDirectoryHandle as FileSystemDirectoryHandle & {
            removeEntry?: (entryName: string) => Promise<void>;
          };
          if (typeof dirHandle.removeEntry !== 'function') {
            alert('Usuwanie plików jest niedostępne w tej przeglądarce.');
            return;
          }
          await dirHandle.removeEntry(name);
          if (lastLoadedFile?.type === 'local' && lastLoadedFile.name === name) {
            lastLoadedFile = null;
          }
          await loadLocalList(onLoadCallback);
        } catch (err) {
          console.error('Nie udało się usunąć pliku lokalnego:', err);
          alert('Nie udało się usunąć pliku lokalnego.');
        }
      });
      
      actions.appendChild(deleteBtn);
      item.appendChild(actions);
      
      fileListContainer.appendChild(item);
    }
    
    localFileList.appendChild(fileListContainer);
    
    // Obsługa nawigacji
    const navigateFile = (direction: number) => {
      const activeName = lastLoadedFile && lastLoadedFile.type === 'local' ? lastLoadedFile.name : null;
      const currentIndex = activeName ? files.findIndex(f => f.name === activeName) : -1;
      const newIndex = currentIndex + direction;
      
      if (newIndex >= 0 && newIndex < files.length) {
        const targetItem = fileListContainer.children[newIndex] as HTMLElement | undefined;
        targetItem?.click();
      }
    };
    
    prevBtn.addEventListener('click', () => navigateFile(-1));
    nextBtn.addEventListener('click', () => navigateFile(1));
    
    refreshBtn.addEventListener('click', () => loadLocalList(onLoadCallback));
    
  } catch (err) {
    console.error('Nie udało się pobrać listy plików lokalnych:', err);
    localFileList.innerHTML = '<div class="cloud-error">Nie udało się pobrać listy plików</div>';
  }
}

async function loadLibraryList(onLoadCallback: (data: any) => void) {
  if (!libraryFileList) return;
  
  try {
    // Wyczyść toolbar z nagłówka jeśli tam jest
    const toolbarHeader = document.getElementById('cloudToolbarHeader');
    if (toolbarHeader) toolbarHeader.innerHTML = '';
    
    libraryFileList.innerHTML = '<div class="cloud-loading">Ładowanie...</div>';
    
    const files = (await listLibraryFiles()).filter((f) => f.toLowerCase().endsWith(cloudFileExtension));
    
    if (files.length === 0) {
      libraryFileList.innerHTML = '<div class="cloud-empty">Brak plików w bibliotece</div>';
      return;
    }
    
    // Sortuj pliki po nazwie
    files.sort();
    
    libraryFileList.innerHTML = '';
    
    // Pasek nawigacji
    const toolbar = document.createElement('div');
    toolbar.className = 'cloud-toolbar';
    
    const prevBtn = document.createElement('button');
    prevBtn.className = 'cloud-toolbar-btn';
    prevBtn.title = 'Poprzedni plik';
    prevBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>`;
    
    const nextBtn = document.createElement('button');
    nextBtn.className = 'cloud-toolbar-btn';
    nextBtn.title = 'Nast\u0119pny plik';
    nextBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>`;
    
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'cloud-toolbar-btn';
    toggleBtn.title = 'Zwiń/rozwiń listę';
    toggleBtn.setAttribute('data-toggle-library', 'true');
    toggleBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>`;
    
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'cloud-toolbar-btn';
    refreshBtn.title = 'Od\u015bwie\u017c list\u0119';
    refreshBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
    
    toolbar.appendChild(prevBtn);
    toolbar.appendChild(nextBtn);
    toolbar.appendChild(toggleBtn);
    toolbar.appendChild(refreshBtn);
    
    libraryFileList.appendChild(toolbar);
    
    // Lista plik\u00f3w
    const fileListContainer = document.createElement('div');
    fileListContainer.className = 'cloud-file-list-container';
    const filteredFiles = files.filter((filename) => filename.toLowerCase().endsWith(cloudFileExtension));
    if (filteredFiles.length === 0) {
      libraryFileList.innerHTML = `<div class="cloud-empty">Brak plików ${cloudFileExtension} w bibliotece</div>`;
      return;
    }
    
    for (const filename of filteredFiles) {
      const item = document.createElement('div');
      item.className = 'cloud-file-item';
      
      // Zaznacz ostatnio wczytany plik
      if (lastLoadedFile?.type === 'library' && lastLoadedFile?.name === filename) {
        item.classList.add('cloud-file-item--active');
      }
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'cloud-file-item__name';
      nameSpan.textContent = stripExtension(filename, cloudFileExtension);
      item.appendChild(nameSpan);
      
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `Wczytaj ${nameSpan.textContent ?? filename}`);
      
      const loadFile = async () => {
        try {
          const data = await loadFromLibrary(filename);
          lastLoadedFile = { name: filename, type: 'library' };
          
          libraryFileList?.querySelectorAll('.cloud-file-item--active').forEach(el => {
            el.classList.remove('cloud-file-item--active');
          });
          item.classList.add('cloud-file-item--active');
          
          onLoadCallback(data);
        } catch (err) {
          console.error('Nie udało się wczytać pliku:', err);
          alert('Nie udało się wczytać pliku z biblioteki.');
        }
      };
      
      item.addEventListener('click', () => {
        loadFile();
      });
      
      item.addEventListener('keydown', (event) => {
        if (event.target !== item) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          loadFile();
        }
      });
      
      fileListContainer.appendChild(item);
    }
    
    libraryFileList.appendChild(fileListContainer);
    
    // Obs\u0142uga nawigacji
    const navigateFile = (direction: number) => {
      const currentIndex = lastLoadedFile?.type === 'library' 
        ? filteredFiles.indexOf(lastLoadedFile.name) 
        : -1;
      const newIndex = currentIndex + direction;
      
      if (newIndex >= 0 && newIndex < filteredFiles.length) {
        const targetItem = fileListContainer.children[newIndex] as HTMLElement | undefined;
        targetItem?.click();
      }
    };
    
    prevBtn.addEventListener('click', () => navigateFile(-1));
    nextBtn.addEventListener('click', () => navigateFile(1));
    
    // toggleBtn obsługiwany przez event delegation w initCloudPanel
    
    refreshBtn.addEventListener('click', () => loadLibraryList(onLoadCallback));
    
  } catch (err) {
    console.error('Nie udało się pobrać listy biblioteki:', err);
    libraryFileList.innerHTML = '<div class="cloud-error">Nie udało się pobrać listy plików</div>';
  }
}

async function loadCloudList(onLoadCallback: (data: any) => void) {
  if (!cloudFileList) return;
  
  try {
    // Wyczyść toolbar z nagłówka jeśli tam jest
    const toolbarHeader = document.getElementById('cloudToolbarHeader');
    if (toolbarHeader) toolbarHeader.innerHTML = '';
    
    cloudFileList.innerHTML = '<div class="cloud-loading">Ładowanie...</div>';
    
    const rawKeys = await listKeys();
    if (rawKeys.length === 0) {
      cloudFileList.innerHTML = '<div class="cloud-empty">Brak plików w chmurze</div>';
      return;
    }
    
    // Sortuj pliki po nazwie
  const entries = rawKeys
    .map((encoded) => ({ encoded, decoded: decodeKvKey(encoded) }))
    .sort((a, b) => b.decoded.localeCompare(a.decoded, 'pl'));
  const filteredEntries = entries.filter((entry) => entry.decoded.toLowerCase().endsWith(cloudFileExtension));
  if (filteredEntries.length === 0) {
    cloudFileList.innerHTML = '<div class="cloud-empty">Brak plików w chmurze</div>';
    return;
  }

    cloudFileList.innerHTML = '';
    // Pasek nawigacji
    const toolbar = document.createElement('div');
    toolbar.className = 'cloud-toolbar';
    
    const prevBtn = document.createElement('button');
    prevBtn.className = 'cloud-toolbar-btn';
    prevBtn.title = 'Poprzedni plik';
    prevBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>`;
    
    const nextBtn = document.createElement('button');
    nextBtn.className = 'cloud-toolbar-btn';
    nextBtn.title = 'Nast\u0119pny plik';
    nextBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>`;
    
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'cloud-toolbar-btn';
    toggleBtn.title = 'Zwi\u0144/rozwi\u0144 list\u0119';    toggleBtn.setAttribute('data-toggle-cloud', 'true');    toggleBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>`;
    
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'cloud-toolbar-btn';
    refreshBtn.title = 'Od\u015bwie\u017c list\u0119';
    refreshBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
    
    toolbar.appendChild(prevBtn);
    toolbar.appendChild(nextBtn);
    toolbar.appendChild(toggleBtn);
    toolbar.appendChild(refreshBtn);
    
    cloudFileList.appendChild(toolbar);
    
    // Lista plik\u00f3w
    const fileListContainer = document.createElement('div');
    fileListContainer.className = 'cloud-file-list-container';
    for (const { encoded: keyEncoded, decoded: keyName } of filteredEntries) {
      const item = document.createElement('div');
      item.className = 'cloud-file-item';
      
      // Zaznacz ostatnio wczytany plik
      if (lastLoadedFile?.type === 'cloud' && lastLoadedFile?.name === keyEncoded) {
        item.classList.add('cloud-file-item--active');
      }
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'cloud-file-item__name';
      nameSpan.textContent = keyName;
      item.appendChild(nameSpan);
      
      const actions = document.createElement('div');
      actions.className = 'cloud-file-item__actions';
      
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `Wczytaj ${keyName}`);
      
      const loadFile = async () => {
        try {
          const data = await loadFromKV(keyEncoded);
          lastLoadedFile = { name: keyEncoded, type: 'cloud' };
          markActiveItem(cloudFileList, item);
          onLoadCallback(data);
        } catch (err) {
          console.error('Nie udało się wczytać pliku:', err);
          alert('Nie udało się wczytać pliku z chmury.');
        }
      };
      
      const handleSelection = () => {
        if (cloudPanelMode === 'save') {
          setFilenameInputValue(keyName);
          lastLoadedFile = { name: keyEncoded, type: 'cloud' };
          markActiveItem(cloudFileList, item);
          return;
        }
        loadFile();
      };
      
      item.addEventListener('click', (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('.cloud-file-item__btn--delete')) return;
        handleSelection();
      });
      
      item.addEventListener('keydown', (event) => {
        if (event.target !== item) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleSelection();
        }
      });
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'cloud-file-item__btn cloud-file-item__btn--delete';
      deleteBtn.title = 'Usuń';
      deleteBtn.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 6h14"/>
          <path d="M10 10v8"/>
          <path d="M14 10v8"/>
          <path d="M7 6 8 4h8l1 2"/>
          <path d="M6 6v14h12V6"/>
        </svg>
      `;
      deleteBtn.addEventListener('click', async (evt) => {
        evt.stopPropagation();
        if (!confirm(`Czy na pewno chcesz usunąć plik "${keyName}" z chmury?`)) {
          return;
        }
        try {
          await deleteFromKV(keyEncoded);
          // Odśwież listę
          loadCloudList(onLoadCallback);
        } catch (err) {
          console.error('Nie udało się usunąć pliku:', err);
          alert('Nie udało się usunąć pliku z chmury.');
        }
      });
      
      actions.appendChild(deleteBtn);
      item.appendChild(actions);
      
      fileListContainer.appendChild(item);
    }
    
    cloudFileList.appendChild(fileListContainer);
    
    // Obsługa nawigacji
    const navigateFile = (direction: number) => {
      const currentIndex = lastLoadedFile?.type === 'cloud'
        ? filteredEntries.findIndex((entry) => entry.encoded === lastLoadedFile!.name)
        : -1;
      const newIndex = currentIndex + direction;
      
      if (newIndex >= 0 && newIndex < filteredEntries.length) {
        const targetItem = fileListContainer.children[newIndex] as HTMLElement | undefined;
        targetItem?.click();
      }
    };
    
    prevBtn.addEventListener('click', () => navigateFile(-1));
    nextBtn.addEventListener('click', () => navigateFile(1));
    

    refreshBtn.addEventListener('click', () => loadCloudList(onLoadCallback));
    
  } catch (err) {
    console.error('Nie udało się pobrać listy plików:', err);
    cloudFileList.innerHTML = '<div class="cloud-error">Nie udało się pobrać listy plików</div>';
  }
}
