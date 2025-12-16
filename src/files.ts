// Funkcjonalność zarządzania plikami w chmurze (Cloudflare KV), bibliotece i lokalnych

import { zipSync, unzipSync, strToU8 } from 'fflate';
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
let localDirectoryHandle: FileSystemDirectoryHandle | null = null;
let cloudActiveLoadCallback: ((data: LoadedFileResult) => void) | null = null;
type CloudPanelMode = 'load' | 'save';
let cloudPanelMode: CloudPanelMode = 'load';
let pendingSaveDocument: any = null;
let cloudSaveBar: HTMLElement | null = null;
let cloudFilenameInput: HTMLInputElement | null = null;
let cloudSaveButton: HTMLButtonElement | null = null;
type LoadedBundleEntry = { name: string; data: any };
type LoadedBundle = { entries: LoadedBundleEntry[]; index: number };
export type LoadedFileResult = { data: any; bundle?: LoadedBundle };

type DragState = {
  pointerId: number;
  start: { x: number; y: number };
  panelStart: { x: number; y: number };
};
let cloudDragState: DragState | null = null;
let storagePersistenceRequested = false;
let cloudFileExtension = '.ctr';
let cloudAllowedExtensions: string[] = ['.ctr'];
const textDecoder = new TextDecoder();

function emitCloudLoadedFile(name: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('cloud-file-loaded', { detail: { name } }));
}
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

export async function loadFromKV(key: string): Promise<ArrayBuffer> {
  const res = await fetch(`/api/json/${encodeURIComponent(key)}`);
  if (!res.ok) {
    throw new Error(`KV GET failed: ${res.status}`);
  }
  return await res.arrayBuffer();
}

export async function deleteFromKV(key: string): Promise<void> {
  const res = await fetch(`/api/json/${encodeURIComponent(key)}`, {
    method: "DELETE"
  });
  if (!res.ok) {
    throw new Error(`KV DELETE failed: ${res.status}`);
  }
}

export async function saveToKV(key: string, data: BodyInit, contentType?: string): Promise<void> {
  const res = await fetch(`/api/json/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: {
      "Content-Type": contentType || (typeof data === 'string' ? "application/json" : "application/octet-stream")
    },
    body: data
  });

  if (!res.ok) {
    throw new Error(`KV PUT failed: ${res.status}`);
  }
}

// === BIBLIOTEKA (content folder) ===
const LIBRARY_MANIFEST_URL = '/content/index.json';
const LIBRARY_MANIFEST_FILENAME = 'index.json';
const LIBRARY_CACHE_KEY = 'cloudLibraryCache';
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
          if (!name || !matchesAllowedExtension(name)) return false;
          return name.toLowerCase() !== LIBRARY_MANIFEST_FILENAME;
        });
    }
    return null;
  } catch (err) {
    console.warn('Library manifest unavailable:', err);
    return null;
  }
}

function loadLibraryCache(): string[] | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LIBRARY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((name) => typeof name === 'string' && name.trim().length > 0);
    }
  } catch (err) {
    console.warn('Failed to read library cache', err);
  }
  return null;
}

function saveLibraryCache(files: string[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify(files));
  } catch (err) {
    console.warn('Failed to save library cache', err);
  }
}

export async function listLibraryFiles(): Promise<string[]> {
  try {
    const manifest = await fetchLibraryManifest();
    if (manifest && manifest.length > 0) {
      saveLibraryCache(manifest);
      return manifest;
    }
    const res = await fetch('/content/', { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Library listing failed: ${res.status}`);
    }
    const text = await res.text();
    const escapedExt = cloudAllowedExtensions.map(escapeRegExp).join('|');
    const matches = text.matchAll(new RegExp(`href="([^\"]+(?:${escapedExt}))"`, 'gi'));
    const files = new Set<string>();
    for (const match of matches) {
      const href = match[1];
      const decoded = decodeURIComponent(href);
      const filename = decoded.split('/').pop() ?? decoded;
      if (matchesAllowedExtension(filename) && filename.toLowerCase() !== LIBRARY_MANIFEST_FILENAME) {
        files.add(filename);
      }
    }
    const list = Array.from(files).sort((a, b) => a.localeCompare(b, 'pl'));
    if (list.length) saveLibraryCache(list);
    return list;
  } catch (err) {
    console.error('Nie udało się pobrać listy biblioteki:', err);
    const cached = loadLibraryCache();
    if (cached && cached.length) {
      return cached;
    }
    return [];
  }
}

export async function loadFromLibrary(filename: string): Promise<any> {
  const res = await fetch(`/content/${filename}`);
  if (!res.ok) {
    throw new Error(`Library GET failed: ${res.status}`);
  }
  if (filename.toLowerCase().endsWith('.ctr')) {
    return await res.arrayBuffer();
  }
  return await res.text();
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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function setCloudFileExtension(ext: string | undefined) {
  if (!ext) {
    cloudFileExtension = '.ctr';
    return;
  }
  cloudFileExtension = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
}

function normalizeExtensions(exts?: string | string[]): string[] {
  if (!exts) return ['.ctr'];
  const arr = Array.isArray(exts) ? exts : [exts];
  const normed = arr
    .map((e) => (e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`))
    .filter(Boolean);
  return normed.length ? Array.from(new Set(normed)) : ['.json'];
}

function setCloudAllowedExtensions(exts?: string | string[]) {
  cloudAllowedExtensions = normalizeExtensions(exts);
}

function matchesAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return cloudAllowedExtensions.some((ext) => lower.endsWith(ext));
}

function allowedExtensionsLabel(): string {
  return cloudAllowedExtensions.join(', ');
}

function stripAnyAllowedExtension(name: string): string {
  const lower = name.toLowerCase();
  const match = cloudAllowedExtensions.find((ext) => lower.endsWith(ext)) ?? cloudFileExtension;
  return stripExtension(name, match);
}

function parseCtrArchive(name: string, buffer: ArrayBuffer): LoadedFileResult {
  const archive = unzipSync(new Uint8Array(buffer));
  const entries: LoadedBundleEntry[] = Object.entries(archive)
    .filter(([entryName]) => entryName.toLowerCase().endsWith('.json'))
    .sort((a, b) => a[0].localeCompare(b[0], 'pl'))
    .map(([entryName, data]) => {
      const decoded = textDecoder.decode(data);
      return { name: entryName, data: JSON.parse(decoded) };
    });
  if (!entries.length) {
    throw new Error(`Brak plików JSON w archiwum ${name}`);
  }
  return { data: entries[0].data, bundle: { entries, index: 0 } };
}

function parseLoadedContent(name: string, content: string | ArrayBuffer): LoadedFileResult {
  const lower = name.toLowerCase();
  if (lower.endsWith('.ctr')) {
    if (typeof content === 'string') {
      throw new Error('Archiwum CTR wymaga danych binarnych');
    }
    return parseCtrArchive(name, content);
  }
  const text = typeof content === 'string' ? content : textDecoder.decode(new Uint8Array(content));
  return { data: JSON.parse(text) };
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

function buildCtrArchive(baseName: string, documentData: any): Uint8Array {
  const jsonName = `${baseName}.json`;
  const jsonPayload = JSON.stringify(documentData, null, 2);
  return zipSync({ [jsonName]: strToU8(jsonPayload) });
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
    const baseName = stripExtension(fileName, cloudFileExtension);
    if (cloudFileExtension === '.ctr') {
      const archive = buildCtrArchive(baseName, pendingSaveDocument);
      await writable.write(archive as any);
    } else {
      const payload = JSON.stringify(pendingSaveDocument, null, 2);
      await writable.write(payload as any);
    }
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
  const keyName = `${baseName}${cloudFileExtension}`;
  try {
    if (cloudFileExtension === '.ctr') {
      const archive = buildCtrArchive(baseName, pendingSaveDocument);
      await saveToKV(keyName, archive as any, 'application/octet-stream');
    } else {
      await saveToKV(keyName, JSON.stringify(pendingSaveDocument), 'application/json');
    }
    lastLoadedFile = { name: keyName, type: 'cloud' };
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
  let saved = false;
  if (currentTab === 'local') {
    const fileName = `${baseName}${cloudFileExtension}`;
    saved = await saveDocumentLocally(fileName);
  } else if (currentTab === 'cloud') {
    saved = await saveDocumentToCloud(baseName);
  } else {
    window.alert('Wybierz zakładkę zapisu (Lokalnie lub Chmura).');
  }
  if (saved) {
    closeCloudPanel();
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
}

function setupCloudTabs(onLoadCallback: (data: LoadedFileResult) => void) {
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
  allowedExtensions?: string | string[];
};

export function initCloudUI(onLoadCallback: (data: LoadedFileResult) => void, options?: CloudInitOptions) {
  if (!cloudPanel || !localFileList || !libraryFileList || !cloudFileList) {
    console.error('Cloud panel not initialized. Call initCloudPanel() first.');
    return;
  }
  
  setCloudFileExtension(options?.fileExtension || '.ctr');
  // Domyślnie pokazuj tylko .ctr przy odczycie; jeśli wskazano fileExtension bez allowedExtensions, użyj go jako filtra
  const defaultAllowed = ['.ctr'];
  const resolvedAllowed = options?.allowedExtensions ?? (options?.fileExtension ? [options.fileExtension] : defaultAllowed);
  setCloudAllowedExtensions(resolvedAllowed);
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
  const panelContent = document.querySelector('#cloudPanel .debug-panel__content') as HTMLElement;
  const panelTitle = document.getElementById('cloudPanelTitle') as HTMLElement;
  if (panelContent) panelContent.style.display = '';
  if (panelTitle) panelTitle.style.display = '';
  
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
  const noop = (_data?: LoadedFileResult) => {};
  setCloudFileExtension(fileExtension);
  setCloudAllowedExtensions(fileExtension);
  cloudActiveLoadCallback = noop;
  cloudPanelMode = 'save';
  pendingSaveDocument = data;
  const base = sanitizeFileBase(suggestedName || '') || 'geometry';
  if (cloudFilenameInput) cloudFilenameInput.value = base;
  updateCloudPanelTitle();
  updateSaveControlsVisibility();
  setLibraryTabVisibility(false);
  
  const panelContent = document.querySelector('#cloudPanel .debug-panel__content') as HTMLElement;
  const panelTitle = document.getElementById('cloudPanelTitle') as HTMLElement;
  if (panelContent) panelContent.style.display = '';
  if (panelTitle) panelTitle.style.display = '';
  
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

function switchTab(tab: 'local' | 'library' | 'cloud', onLoadCallback: (data: LoadedFileResult) => void) {
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

async function loadLocalList(onLoadCallback: (data: LoadedFileResult) => void) {
  if (!localFileList) return;
  
  const createChangeFolderToolbar = () => {
    const toolbar = document.createElement('div');
    toolbar.className = 'cloud-toolbar';

    const changeFolderBtn = document.createElement('button');
    changeFolderBtn.className = 'cloud-toolbar-btn';
    changeFolderBtn.setAttribute('data-change-folder', 'true');
    changeFolderBtn.title = 'Zmień folder';
    changeFolderBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 13h8"/><path d="M9 17h5"/></svg>`;
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

    toolbar.appendChild(changeFolderBtn);
    return toolbar;
  };

  try {
    localFileList.innerHTML = '';
    localFileList.appendChild(createChangeFolderToolbar());

    const content = document.createElement('div');
    localFileList.appendChild(content);
    content.innerHTML = '<div class="cloud-loading">Ładowanie...</div>';
    
    // Spróbuj załadować handle z IndexedDB jeśli nie mamy go w pamięci
    if (!localDirectoryHandle) {
      localDirectoryHandle = await loadLocalDirectoryHandle();
    }
    
    // Sprawdź czy mamy handle i czy mamy do niego uprawnienia
    if (!localDirectoryHandle) {
      content.innerHTML = `
        <div style="padding: 20px; text-align: center;">
          <p style="margin-bottom: 10px;">Nie wybrano folderu z plikami</p>
          <p style="margin-bottom: 0; font-size: 13px; color: #888;">Kliknij „Zmień folder”, aby wybrać folder.</p>
        </div>
      `;
      return;
    }
    
    // Sprawdź uprawnienia
    const hasPermission = await verifyPermission(localDirectoryHandle, 'read', true);
    if (!hasPermission) {
      content.innerHTML = `
        <div style="padding: 20px; text-align: center;">
          <p style="margin-bottom: 10px;">Brak dostępu do folderu: ${localDirectoryHandle.name}</p>
          <button id="grantLocalAccess" style="padding: 8px 16px; cursor: pointer;">
            Przyznaj dostęp
          </button>
        </div>
      `;

      document.getElementById('grantLocalAccess')?.addEventListener('click', async () => {
        loadLocalList(onLoadCallback);
      });
      return;
    }
    
    // Pobierz pliki o dozwolonych rozszerzeniach z folderu
    const files: { name: string; handle: FileSystemFileHandle }[] = [];
    // @ts-ignore
    for await (const entry of localDirectoryHandle.values()) {
      if (entry.kind === 'file' && matchesAllowedExtension(entry.name)) {
        files.push({ name: entry.name, handle: entry as FileSystemFileHandle });
      }
    }
    
    // Sortuj pliki po nazwie
    files.sort((a, b) => a.name.localeCompare(b.name));

    if (files.length === 0) {
      content.innerHTML = `<div class="cloud-empty">Brak plików ${allowedExtensionsLabel()} w folderze</div>`;
      return;
    }

    content.innerHTML = '';

    // Lista plików
    const fileListContainer = document.createElement('div');
    fileListContainer.className = 'cloud-file-list-container';
    
    for (const { name, handle } of files) {
      const item = document.createElement('div');
      item.className = 'cloud-file-item';
      
      // Zaznacz ostatnio wczytany plik
      if (lastLoadedFile?.type === 'local' && lastLoadedFile?.name === name) {
        item.classList.add('cloud-file-item--active');
      }
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'cloud-file-item__name';
      nameSpan.textContent = stripAnyAllowedExtension(name);
      item.appendChild(nameSpan);
      
      const actions = document.createElement('div');
      actions.className = 'cloud-file-item__actions';
      
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `Wczytaj ${nameSpan.textContent ?? name}`);
      
      const loadFile = async () => {
        try {
          const file = await handle.getFile();
          const lower = name.toLowerCase();
          const loaded =
            lower.endsWith('.ctr')
              ? parseLoadedContent(name, await file.arrayBuffer())
              : parseLoadedContent(name, await file.text());
          lastLoadedFile = { name, type: 'local' };
          emitCloudLoadedFile(stripAnyAllowedExtension(name));
          markActiveItem(localFileList, item);
          onLoadCallback(loaded);
        } catch (err) {
          console.error('Nie udało się wczytać pliku:', err);
          alert('Nie udało się wczytać pliku lokalnego.');
        }
      };
      
      const handleSelection = () => {
        if (cloudPanelMode === 'save') {
          setFilenameInputValue(stripAnyAllowedExtension(name));
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
    
    content.appendChild(fileListContainer);
    
  } catch (err) {
    console.error('Nie udało się pobrać listy plików lokalnych:', err);
    localFileList.innerHTML = '';
    localFileList.appendChild(createChangeFolderToolbar());
    localFileList.insertAdjacentHTML('beforeend', '<div class="cloud-error">Nie udało się pobrać listy plików</div>');
  }
}

async function loadLibraryList(onLoadCallback: (data: LoadedFileResult) => void) {
  if (!libraryFileList) return;
  
  try {
    libraryFileList.innerHTML = '<div class="cloud-loading">Ładowanie...</div>';
    
    const files = (await listLibraryFiles()).filter((f) => matchesAllowedExtension(f));
    
    if (files.length === 0) {
      libraryFileList.innerHTML = `<div class="cloud-empty">Brak plików ${allowedExtensionsLabel()} w bibliotece</div>`;
      return;
    }
    
    // Sortuj pliki po nazwie
    files.sort();
    
    libraryFileList.innerHTML = '';
    
    // Lista plik\u00f3w
    const fileListContainer = document.createElement('div');
    fileListContainer.className = 'cloud-file-list-container';
    
    for (const filename of files) {
      const item = document.createElement('div');
      item.className = 'cloud-file-item';
      
      // Zaznacz ostatnio wczytany plik
      if (lastLoadedFile?.type === 'library' && lastLoadedFile?.name === filename) {
        item.classList.add('cloud-file-item--active');
      }
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'cloud-file-item__name';
      nameSpan.textContent = stripAnyAllowedExtension(filename);
      item.appendChild(nameSpan);
      
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `Wczytaj ${nameSpan.textContent ?? filename}`);
      
      const loadFile = async () => {
        try {
          const raw = await loadFromLibrary(filename);
          const data = parseLoadedContent(filename, raw);
          lastLoadedFile = { name: filename, type: 'library' };
          emitCloudLoadedFile(stripAnyAllowedExtension(filename));
          markActiveItem(libraryFileList, item);
          
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
  } catch (err) {
    console.error('Nie udało się pobrać listy biblioteki:', err);
    libraryFileList.innerHTML = '<div class="cloud-error">Nie udało się pobrać listy plików</div>';
  }
}

async function loadCloudList(onLoadCallback: (data: LoadedFileResult) => void) {
  if (!cloudFileList) return;
  
  try {
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
    const filteredEntries = entries.filter((entry) => matchesAllowedExtension(entry.decoded));
    if (filteredEntries.length === 0) {
      cloudFileList.innerHTML = `<div class="cloud-empty">Brak plików ${allowedExtensionsLabel()} w chmurze</div>`;
      return;
    }

    cloudFileList.innerHTML = '';
    
    // Lista plik\u00f3w
    const fileListContainer = document.createElement('div');
    fileListContainer.className = 'cloud-file-list-container';

    for (const { decoded: keyName } of filteredEntries) {
      const item = document.createElement('div');
      item.className = 'cloud-file-item';
      
      // Zaznacz ostatnio wczytany plik
      if (lastLoadedFile?.type === 'cloud' && lastLoadedFile?.name === keyName) {
        item.classList.add('cloud-file-item--active');
      }
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'cloud-file-item__name';
      nameSpan.textContent = stripAnyAllowedExtension(keyName);
      item.appendChild(nameSpan);
      
      const actions = document.createElement('div');
      actions.className = 'cloud-file-item__actions';
      
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `Wczytaj ${nameSpan.textContent ?? keyName}`);
      
      const loadFile = async () => {
        try {
          const raw = await loadFromKV(keyName);
          const data = parseLoadedContent(keyName, raw);
          lastLoadedFile = { name: keyName, type: 'cloud' };
          emitCloudLoadedFile(stripAnyAllowedExtension(keyName));
          markActiveItem(cloudFileList, item);
          onLoadCallback(data);
        } catch (err) {
          console.error('Nie udało się wczytać pliku:', err);
          alert('Nie udało się wczytać pliku z chmury.');
        }
      };
      
      const handleSelection = () => {
        if (cloudPanelMode === 'save') {
          setFilenameInputValue(stripAnyAllowedExtension(keyName));
          lastLoadedFile = { name: keyName, type: 'cloud' };
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
          await deleteFromKV(keyName);
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
  } catch (err) {
    console.error('Nie udało się pobrać listy plików:', err);
    cloudFileList.innerHTML = '<div class="cloud-error">Nie udało się pobrać listy plików</div>';
  }
}
