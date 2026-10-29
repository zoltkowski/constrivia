// Funkcjonalność zarządzania plikami w chmurze (Cloudflare KV), bibliotece i lokalnych

import { zipSync, unzipSync, strToU8 } from 'fflate';
import { CHANGE_FOLDER_ICON, DELETE_ICON } from './ui/icons';
import { compareFiles, fileTimestamp, type FileSortOrder } from './ui/fileSorting';
import { filePanelText } from './ui/filePanelStrings';

// Avoid static import of `saveDefaultFolderHandle` from './main' to prevent
// circular-module evaluation issues. Use a dynamic import at runtime instead.
async function saveDefaultFolderHandleRuntime(handle: FileSystemDirectoryHandle | null): Promise<void> {
  try {
    const m = await import('./main');
    if (m && typeof (m as any).saveDefaultFolderHandle === 'function') {
      return (m as any).saveDefaultFolderHandle(handle);
    }
  } catch (err) {
    console.warn('Failed to call saveDefaultFolderHandle:', err);
  }
}

// === PANEL STATE ===
const FILE_PANEL_MARGIN = { x: 20, y: 20 };
const FILE_PANEL_TOP_MIN = 60;

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
let cloudPanelTitleKey: 'configurationTitle' | null = null;
let cloudPanelTitleOverride: string | null = null;
let pendingSaveDocument: any = null;
let pendingSavePages: { currentPage: any; allPages: any } | null = null;
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
type FileSortSource = 'local';
const fileSortOrders: Record<FileSortSource, FileSortOrder> = { local: 'name' };
const initializedFileSorts = new Set<FileSortSource>();
let localListRequest = 0, cloudListRequest = 0;

function getFileSortOrder(source: FileSortSource): FileSortOrder {
  if (!initializedFileSorts.has(source)) {
    try {
      const saved = localStorage.getItem(`geometry.fileSort.${source}`);
      if (saved === 'name' || saved === 'date') fileSortOrders[source] = saved;
    } catch { /* The current session still remembers the selection. */ }
    initializedFileSorts.add(source);
  }
  return fileSortOrders[source];
}

function createFileSortSelector(source: FileSortSource, onChange: (order: FileSortOrder) => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'file-sort-selector';
  group.dataset.sortSource = source;
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', filePanelText('sortFiles'));
  const button = document.createElement('button');
  button.type = 'button';
  const update = () => {
    const order = getFileSortOrder(source);
    button.dataset.fileSort = order;
    button.textContent = order === 'name' ? filePanelText('sortName') : filePanelText('sortTime');
    button.title = order === 'name' ? filePanelText('sortByName') : filePanelText('sortByTime');
    button.setAttribute('aria-label', button.title);
  };
  button.addEventListener('click', () => {
    const order = getFileSortOrder(source) === 'name' ? 'date' : 'name';
    fileSortOrders[source] = order;
    try { localStorage.setItem(`geometry.fileSort.${source}`, order); } catch { /* Session-only preference. */ }
    update();onChange(order);
  });
  group.appendChild(button);
  update();return group;
}

function sortFileRows(container: HTMLElement, order: FileSortOrder) {
  const rows = Array.from(container.children) as HTMLElement[];
  const data = (row: HTMLElement) => ({ name: row.dataset.sortName ?? '', modifiedAt: row.dataset.modifiedAt === undefined ? undefined : Number(row.dataset.modifiedAt) });
  rows.sort((a, b) => compareFiles(data(a), data(b), order));
  for (const row of rows) container.appendChild(row);
}

// Used by main UI flow.
function emitCloudLoadedFile(name: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('cloud-file-loaded', { detail: { name } }));
}
// Used by main UI flow.
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

// Used by main UI flow.
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

// Used by UI controls.
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
      await saveDefaultFolderHandleRuntime(handle);
    }
    return granted;
  } catch (err) {
    console.error('Permission verification failed:', err);
    return false;
  }
}

// === CLOUDFLARE KV ===
export async function listCloudFiles(): Promise<{ name: string; modifiedAt?: number }[]> {
  const res = await fetch("/api/json/list");
  if (!res.ok) throw new Error(`KV list failed: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.result)) throw new Error('Invalid KV file list');
  return data.result.filter((key: any) => typeof key?.name === 'string')
    .map((key: any) => ({ name: key.name, modifiedAt: fileTimestamp(key.metadata?.modifiedAt) }));
}

export async function listKeys(): Promise<string[]> {
  return (await listCloudFiles()).map(file => file.name);
}

export async function loadFromKV(key: string): Promise<ArrayBuffer> {
  const res = await fetch(`/api/json/${encodeURIComponent(key)}`);
  if (!res.ok) {
    throw new Error(filePanelText('cloudLoadStatus', { status: res.status }));
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
// Used by main UI flow.
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

// Used by persistence flow.
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

// Used by persistence flow.
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
    throw new Error(filePanelText('libraryLoadStatus', { status: res.status }));
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

// Used by main UI flow.
function ensureCloudPanelPosition() {
  if (!cloudPanel) return;
  const rect = cloudPanel.getBoundingClientRect();
  const width = rect.width || cloudPanel.offsetWidth || 320;
  const height = rect.height || cloudPanel.offsetHeight || 240;
  const maxX = Math.max(FILE_PANEL_MARGIN.x, window.innerWidth - width - FILE_PANEL_MARGIN.x);
  const maxY = Math.max(FILE_PANEL_TOP_MIN, window.innerHeight - height - FILE_PANEL_MARGIN.y);
  if (!cloudPanelPos) {
    cloudPanelPos = {
      x: clamp(FILE_PANEL_MARGIN.x, FILE_PANEL_MARGIN.x, maxX),
      y: clamp(FILE_PANEL_TOP_MIN, FILE_PANEL_TOP_MIN, maxY)
    };
  } else {
    cloudPanelPos = {
      x: clamp(cloudPanelPos.x, FILE_PANEL_MARGIN.x, maxX),
      y: clamp(cloudPanelPos.y, FILE_PANEL_TOP_MIN, maxY)
    };
  }
  applyCloudPanelPosition();
}

// Used by main UI flow.
function markActiveItem(container: HTMLElement | null, item: HTMLElement) {
  container?.querySelectorAll('.cloud-file-item--active').forEach((el) => {
    el.classList.remove('cloud-file-item--active');
  });
  item.classList.add('cloud-file-item--active');
}

// Used by UI state helpers.
function setLibraryTabVisibility(visible: boolean) {
  const libraryTab = cloudPanel?.querySelector('[data-tab="library"]') as HTMLElement | null;
  if (libraryTab) {
    libraryTab.style.display = visible ? '' : 'none';
  }
}

// Used by UI/state updates.
function updateSaveControlsVisibility() {
  if (!cloudSaveBar) return;
  cloudSaveBar.style.display = cloudPanelMode === 'save' ? 'flex' : 'none';
  const scopeRow = document.getElementById('cloudPageScopeRow');
  if (scopeRow) scopeRow.hidden = cloudPanelMode !== 'save' || !pendingSavePages;
  if (cloudSaveButton) {
    cloudSaveButton.disabled = cloudPanelMode !== 'save';
  }
}

// Used by main UI flow.
function stripExtension(name: string, ext: string): string {
  const escaped = ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name.replace(new RegExp(`${escaped}$`, 'i'), '');
}

// Used by main UI flow.
function sanitizeFileBase(raw: string, ext: string = cloudFileExtension): string {
  return stripExtension(raw, ext).replace(/[\\/:*?"<>|]/g, '').trim();
}

// Used by main UI flow.
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Used by UI state helpers.
function setCloudFileExtension(ext: string | undefined) {
  if (!ext) {
    cloudFileExtension = '.ctr';
    return;
  }
  cloudFileExtension = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
}

// Used by normalization helpers.
function normalizeExtensions(exts?: string | string[]): string[] {
  if (!exts) return ['.ctr'];
  const arr = Array.isArray(exts) ? exts : [exts];
  const normed = arr
    .map((e) => (e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`))
    .filter(Boolean);
  return normed.length ? Array.from(new Set(normed)) : ['.json'];
}

// Used by UI state helpers.
function setCloudAllowedExtensions(exts?: string | string[]) {
  cloudAllowedExtensions = normalizeExtensions(exts);
}

// Used by main UI flow.
function matchesAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return cloudAllowedExtensions.some((ext) => lower.endsWith(ext));
}

// Used by label UI flow.
function allowedExtensionsLabel(): string {
  return cloudAllowedExtensions.join(', ');
}

// Used by main UI flow.
function stripAnyAllowedExtension(name: string): string {
  const lower = name.toLowerCase();
  const match = cloudAllowedExtensions.find((ext) => lower.endsWith(ext)) ?? cloudFileExtension;
  return stripExtension(name, match);
}

// Used by main UI flow.
function parseCtrArchive(name: string, buffer: ArrayBuffer): LoadedFileResult {
  const archive = unzipSync(new Uint8Array(buffer));
  const entries: LoadedBundleEntry[] = Object.entries(archive)
    .filter(([entryName]) => entryName.toLowerCase().endsWith('.json'))
    .sort((a, b) => a[0].localeCompare(b[0], 'pl'))
    .map(([entryName, data]) => {
      const decoded = textDecoder.decode(data);
      try {
        return { name: entryName, data: JSON.parse(decoded) };
      } catch (err) {
        const details = err instanceof Error && err.message ? ` (${err.message})` : '';
        throw new Error(filePanelText('archiveJsonError', { name: entryName, details }));
      }
    });
  if (!entries.length) {
    throw new Error(filePanelText('archiveMissingJson', { name }));
  }
  return { data: entries[0].data, bundle: { entries, index: 0 } };
}

// Used by main UI flow.
function parseLoadedContent(name: string, content: string | ArrayBuffer): LoadedFileResult {
  const lower = name.toLowerCase();
  if (lower.endsWith('.ctr')) {
    if (typeof content === 'string') {
      throw new Error(filePanelText('ctrRequiresBinary'));
    }
    return parseCtrArchive(name, content);
  }
  const text = typeof content === 'string' ? content : textDecoder.decode(new Uint8Array(content));
  try {
    return { data: JSON.parse(text) };
  } catch (err) {
    const details = err instanceof Error && err.message ? ` (${err.message})` : '';
    throw new Error(filePanelText('jsonError', { name, details }));
  }
}

// Used by UI state helpers.
function setFilenameInputValue(raw: string) {
  if (!cloudFilenameInput) return;
  const base = sanitizeFileBase(raw);
  if (base.length > 0) {
    cloudFilenameInput.value = base;
  } else {
    cloudFilenameInput.value = '';
  }
}

// Used by UI state helpers.
function getFilenameInputValue(): string {
  if (!cloudFilenameInput) return '';
  return sanitizeFileBase(cloudFilenameInput.value || '');
}

// Used by UI/state updates.
function updateCloudPanelTitle() {
  const panelTitle = document.getElementById('cloudPanelTitle') as HTMLElement | null;
  if (!panelTitle) return;
  panelTitle.textContent = cloudPanelTitleKey
    ? filePanelText(cloudPanelTitleKey)
    : cloudPanelTitleOverride ?? (cloudPanelMode === 'save' ? filePanelText('saveTitle') : filePanelText('filesTitle'));
}

// Used by main UI flow.
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
      await saveDefaultFolderHandleRuntime(localDirectoryHandle);
    }
  } catch (err) {
    console.error('Nie wybrano folderu do zapisu:', err);
    return null;
  }
  
  const hasPermission = await verifyPermission(localDirectoryHandle!, 'readwrite', true);
  if (!hasPermission) {
    window.alert(filePanelText('savePermission'));
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
    window.alert(filePanelText('localSaveFailed'));
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
    window.alert(filePanelText('cloudSaveFailed'));
    return false;
  }
}

async function handleCloudSaveAction() {
  if (cloudPanelMode !== 'save') return;
  if (pendingSavePages) {
    const scope = document.getElementById('cloudPageScope') as HTMLSelectElement | null;
    pendingSaveDocument = scope?.value === 'current' ? pendingSavePages.currentPage : pendingSavePages.allPages;
  }
  if (!pendingSaveDocument) {
    window.alert(filePanelText('noSaveData'));
    return;
  }
  const baseName = getFilenameInputValue();
  if (!baseName) {
    window.alert(filePanelText('enterFilename'));
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
    window.alert(filePanelText('selectSaveTab'));
  }
  if (saved) {
    closeCloudPanel();
  }
}

// Used by gesture handling.
function endCloudPanelDrag(pointerId?: number) {
  if (!cloudDragState) return;
  if (pointerId !== undefined && cloudDragState.pointerId !== pointerId) return;
  try {
    cloudPanelHeader?.releasePointerCapture(cloudDragState.pointerId);
  } catch (err) {
    // ignore
  }
  cloudPanel?.classList.remove('file-panel--dragging');
  cloudDragState = null;
}

// Used by UI initialization.
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
    console.error(filePanelText('panelElementsMissing'));
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
    cloudPanel.classList.add('file-panel--dragging');
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
    const maxX = Math.max(FILE_PANEL_MARGIN.x, window.innerWidth - width - FILE_PANEL_MARGIN.x);
    const maxY = Math.max(FILE_PANEL_TOP_MIN, window.innerHeight - height - FILE_PANEL_MARGIN.y);
    cloudPanelPos = {
      x: clamp(cloudDragState.panelStart.x + dx, FILE_PANEL_MARGIN.x, maxX),
      y: clamp(cloudDragState.panelStart.y + dy, FILE_PANEL_TOP_MIN, maxY)
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

// Used by UI state helpers.
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
  titleKey?: 'configurationTitle';
  fileExtension?: string;
  allowedExtensions?: string | string[];
};

// Used by UI initialization.
export function initCloudUI(onLoadCallback: (data: LoadedFileResult) => void, options?: CloudInitOptions) {
  if (!cloudPanel || !localFileList || !libraryFileList || !cloudFileList) {
    console.error(filePanelText('panelNotInitialized'));
    return;
  }
  
  setCloudFileExtension(options?.fileExtension || '.ctr');
  // Domyślnie pokazuj tylko .ctr przy odczycie; jeśli wskazano fileExtension bez allowedExtensions, użyj go jako filtra
  const defaultAllowed = ['.ctr'];
  const resolvedAllowed = options?.allowedExtensions ?? (options?.fileExtension ? [options.fileExtension] : defaultAllowed);
  setCloudAllowedExtensions(resolvedAllowed);
  cloudActiveLoadCallback = onLoadCallback;
  cloudPanelMode = 'load';
  cloudPanelTitleKey = options?.titleKey ?? null;
  cloudPanelTitleOverride = options?.titleKey ? null : options?.title ?? null;
  pendingSaveDocument = null;
  pendingSavePages = null;
  setLibraryTabVisibility(!options?.hideLibraryTab);
  updateSaveControlsVisibility();
  updateCloudPanelTitle();
  if (cloudFilenameInput) cloudFilenameInput.value = '';
  
  // Reset do stanu rozwiniętego
  const panelContent = document.querySelector('#cloudPanel .file-panel__content') as HTMLElement;
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

// Used by UI initialization.
export function initCloudSaveUI(data: any, suggestedName?: string, fileExtension: string = '.json', pages?: { currentPage: any; allPages: any }) {
  if (!cloudPanel || !localFileList || !cloudFileList) {
    console.error(filePanelText('panelNotInitialized'));
    return;
  }
  const noop = (_data?: LoadedFileResult) => {};
  setCloudFileExtension(fileExtension);
  setCloudAllowedExtensions(fileExtension);
  cloudActiveLoadCallback = noop;
  cloudPanelMode = 'save';
  cloudPanelTitleKey = null;
  cloudPanelTitleOverride = null;
  pendingSaveDocument = data;
  pendingSavePages = pages ?? null;
  const scope = document.getElementById('cloudPageScope') as HTMLSelectElement | null;
  if (scope) scope.value = 'all';
  const base = sanitizeFileBase(suggestedName || '') || 'geometry';
  if (cloudFilenameInput) cloudFilenameInput.value = base;
  updateCloudPanelTitle();
  updateSaveControlsVisibility();
  setLibraryTabVisibility(false);
  
  const panelContent = document.querySelector('#cloudPanel .file-panel__content') as HTMLElement;
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

/** Refresh dynamic file-panel text after the application language changes. */
export function refreshFilePanelLanguage() {
  if (!cloudPanel) return;
  updateCloudPanelTitle();
  if (cloudPanel.style.display === 'none') return;
  const callback = cloudActiveLoadCallback ?? (() => {});
  if (currentTab === 'local') loadLocalList(callback);
  else if (currentTab === 'library') loadLibraryList(callback);
  else loadCloudList(callback);
}

// Used by UI controls.
export function closeCloudPanel() {
  if (cloudPanel) {
    cloudPanel.style.display = 'none';
  }
  if (cloudPanelMode === 'save') {
    cloudPanelMode = 'load';
    pendingSaveDocument = null;
    pendingSavePages = null;
    setLibraryTabVisibility(true);
    updateSaveControlsVisibility();
    updateCloudPanelTitle();
  }
  emitCloudEvent('cloud-panel-closed');
}

// Used by main UI flow.
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
  const request = ++localListRequest;
  let fileListContainer: HTMLElement | null = null;
  
  const createChangeFolderToolbar = () => {
    const toolbar = document.createElement('div');
    toolbar.className = 'cloud-toolbar';

    const changeFolderBtn = document.createElement('button');
    changeFolderBtn.className = 'cloud-toolbar-btn';
    changeFolderBtn.setAttribute('data-change-folder', 'true');
    changeFolderBtn.title = filePanelText('changeFolder');
    changeFolderBtn.setAttribute('aria-label', filePanelText('changeFolder'));
    changeFolderBtn.innerHTML = CHANGE_FOLDER_ICON;
    changeFolderBtn.addEventListener('click', async () => {
      try {
        const pickerMode: FileSystemPermissionMode = cloudPanelMode === 'save' ? 'readwrite' : 'read';
        // @ts-ignore
        const handle = await window.showDirectoryPicker({ mode: pickerMode });
        if (handle) {
          localDirectoryHandle = handle;
          await saveDefaultFolderHandleRuntime(handle);
          await loadLocalList(onLoadCallback);
        }
      } catch (err) {
        console.error('Nie wybrano nowego folderu:', err);
      }
    });

    toolbar.appendChild(changeFolderBtn);
    toolbar.appendChild(createFileSortSelector('local', order => { if (fileListContainer) sortFileRows(fileListContainer, order); }));
    return toolbar;
  };

  try {
    localFileList.innerHTML = '';
    localFileList.appendChild(createChangeFolderToolbar());

    const content = document.createElement('div');
    localFileList.appendChild(content);
    content.innerHTML = `<div class="cloud-loading">${filePanelText('loading')}</div>`;
    
    // Spróbuj załadować handle z IndexedDB jeśli nie mamy go w pamięci
    if (!localDirectoryHandle) {
      const savedHandle = await loadLocalDirectoryHandle();
      if (request !== localListRequest) return;
      localDirectoryHandle = savedHandle;
    }
    if (request !== localListRequest) return;
    
    // Sprawdź czy mamy handle i czy mamy do niego uprawnienia
    if (!localDirectoryHandle) {
      content.innerHTML = `
        <div style="padding: 20px; text-align: center;">
          <p style="margin-bottom: 10px;">${filePanelText('noFolder')}</p>
          <p style="margin-bottom: 0; font-size: 13px; color: #888;">${filePanelText('chooseFolderHint')}</p>
        </div>
      `;
      return;
    }
    
    // Sprawdź uprawnienia
    const hasPermission = await verifyPermission(localDirectoryHandle, 'read', true);
    if (request !== localListRequest) return;
    if (!hasPermission) {
      content.innerHTML = `
        <div style="padding: 20px; text-align: center;">
          <p style="margin-bottom: 10px;">${filePanelText('noFolderAccess', { folder: localDirectoryHandle.name })}</p>
          <button id="grantLocalAccess" style="padding: 8px 16px; cursor: pointer;">
            ${filePanelText('grantAccess')}
          </button>
        </div>
      `;

      document.getElementById('grantLocalAccess')?.addEventListener('click', async () => {
        loadLocalList(onLoadCallback);
      });
      return;
    }
    
    // Pobierz pliki o dozwolonych rozszerzeniach z folderu
    const files: { name: string; handle: FileSystemFileHandle; modifiedAt?: number }[] = [];
    // @ts-ignore
    for await (const entry of localDirectoryHandle.values()) {
      if (entry.kind === 'file' && matchesAllowedExtension(entry.name)) {
        files.push({ name: entry.name, handle: entry as FileSystemFileHandle });
      }
    }
    
    await Promise.all(files.map(async entry => {
      try { entry.modifiedAt = fileTimestamp((await entry.handle.getFile()).lastModified); }
      catch { /* An unavailable file can still be listed and retried when opened. */ }
    }));
    if (request !== localListRequest) return;

    if (files.length === 0) {
      content.innerHTML = `<div class="cloud-empty">${filePanelText('noFilesInFolder', { extensions: allowedExtensionsLabel() })}</div>`;
      return;
    }

    content.innerHTML = '';

    // Lista plików
    fileListContainer = document.createElement('div');
    fileListContainer.className = 'cloud-file-list-container';
    
    for (const { name, handle, modifiedAt } of files) {
      const item = document.createElement('div');
      item.className = 'cloud-file-item';
      item.dataset.sortName = name;
      if (modifiedAt !== undefined) item.dataset.modifiedAt = String(modifiedAt);
      
      // Zaznacz ostatnio wczytany plik
      if (lastLoadedFile?.type === 'local' && lastLoadedFile?.name === name) {
        item.classList.add('cloud-file-item--active');
      }
      
      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'cloud-file-item__select';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'cloud-file-item__name';
      nameSpan.textContent = stripAnyAllowedExtension(name);
      selectBtn.appendChild(nameSpan);
      item.appendChild(selectBtn);

      const actions = document.createElement('div');
      actions.className = 'cloud-file-item__actions';
      
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
          const message = err instanceof Error && err.message ? err.message : filePanelText('localLoadFailed');
          alert(message);
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
      
      const updateSelectLabel = () => {
        const visibleName = nameSpan.textContent ?? stripAnyAllowedExtension(name);
        selectBtn.setAttribute('aria-label', cloudPanelMode === 'save'
          ? filePanelText('useFilename', { name: visibleName })
          : filePanelText('loadFile', { name: visibleName }));
        selectBtn.title = selectBtn.getAttribute('aria-label')!;
      };
      updateSelectLabel();
      selectBtn.addEventListener('click', () => {
        handleSelection();
      });
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'cloud-file-item__btn cloud-file-item__btn--delete';
      deleteBtn.title = filePanelText('deleteFile', { name });
      deleteBtn.setAttribute('aria-label', deleteBtn.title);
      deleteBtn.innerHTML = DELETE_ICON;
      deleteBtn.addEventListener('click', async (evt) => {
        evt.stopPropagation();
        if (!localDirectoryHandle) {
          alert(filePanelText('noFolderAccessAlert'));
          return;
        }
        if (!confirm(filePanelText('deleteConfirmLocal', { name }))) {
          return;
        }
        try {
          const hasWritePermission = await verifyPermission(localDirectoryHandle, 'readwrite', true);
          if (!hasWritePermission) {
            alert(filePanelText('noFolderWritePermission'));
            return;
          }
          const dirHandle = localDirectoryHandle as FileSystemDirectoryHandle & {
            removeEntry?: (entryName: string) => Promise<void>;
          };
          if (typeof dirHandle.removeEntry !== 'function') {
            alert(filePanelText('deleteUnsupported'));
            return;
          }
          await dirHandle.removeEntry(name);
          if (lastLoadedFile?.type === 'local' && lastLoadedFile.name === name) {
            lastLoadedFile = null;
          }
          await loadLocalList(onLoadCallback);
        } catch (err) {
          console.error('Nie udało się usunąć pliku lokalnego:', err);
          alert(filePanelText('localDeleteFailed'));
        }
      });
      
      actions.appendChild(deleteBtn);
      item.appendChild(actions);
      
      fileListContainer.appendChild(item);
    }
    
    sortFileRows(fileListContainer, getFileSortOrder('local'));
    content.appendChild(fileListContainer);
    
  } catch (err) {
    if (request !== localListRequest) return;
    console.error('Nie udało się pobrać listy plików lokalnych:', err);
    localFileList.innerHTML = '';
    localFileList.appendChild(createChangeFolderToolbar());
    localFileList.insertAdjacentHTML('beforeend', `<div class="cloud-error">${filePanelText('fileListError')}</div>`);
  }
}

async function loadLibraryList(onLoadCallback: (data: LoadedFileResult) => void) {
  if (!libraryFileList) return;
  
  try {
    libraryFileList.innerHTML = `<div class="cloud-loading">${filePanelText('loading')}</div>`;
    
    const files = (await listLibraryFiles()).filter((f) => matchesAllowedExtension(f));
    
    if (files.length === 0) {
      libraryFileList.innerHTML = `<div class="cloud-empty">${filePanelText('noFilesInLibrary', { extensions: allowedExtensionsLabel() })}</div>`;
      return;
    }
    
    // Sortuj pliki po nazwie
    files.sort((a, b) => compareFiles({ name: a }, { name: b }, 'name'));
    
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
      
      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'cloud-file-item__select';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'cloud-file-item__name';
      nameSpan.textContent = stripAnyAllowedExtension(filename);
      selectBtn.appendChild(nameSpan);
      item.appendChild(selectBtn);
      
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
          const message = err instanceof Error && err.message ? err.message : filePanelText('libraryLoadFailed');
          alert(message);
        }
      };
      
      selectBtn.setAttribute('aria-label', filePanelText('loadFile', { name: nameSpan.textContent ?? filename }));
      selectBtn.title = selectBtn.getAttribute('aria-label')!;
      selectBtn.addEventListener('click', () => {
        loadFile();
      });
      
      fileListContainer.appendChild(item);
    }
    
    libraryFileList.appendChild(fileListContainer);
  } catch (err) {
    console.error('Nie udało się pobrać listy biblioteki:', err);
    libraryFileList.innerHTML = `<div class="cloud-error">${filePanelText('fileListError')}</div>`;
  }
}

async function loadCloudList(onLoadCallback: (data: LoadedFileResult) => void) {
  if (!cloudFileList) return;
  const request = ++cloudListRequest;
  cloudFileList.innerHTML = '';
  const content = document.createElement('div');
  cloudFileList.appendChild(content);
  
  try {
    content.innerHTML = `<div class="cloud-loading">${filePanelText('loading')}</div>`;
    
    const rawKeys = await listCloudFiles();
    if (request !== cloudListRequest) return;
    if (rawKeys.length === 0) {
      content.innerHTML = `<div class="cloud-empty">${filePanelText('noFilesInCloud')}</div>`;
      return;
    }
    
    const entries = rawKeys
      .map(({ name, modifiedAt }) => ({ decoded: decodeKvKey(name), modifiedAt }));
    const filteredEntries = entries.filter((entry) => matchesAllowedExtension(entry.decoded));
    if (filteredEntries.length === 0) {
      content.innerHTML = `<div class="cloud-empty">${filePanelText('noMatchingFilesInCloud', { extensions: allowedExtensionsLabel() })}</div>`;
      return;
    }

    content.innerHTML = '';
    
    // Lista plik\u00f3w
    const fileListContainer = document.createElement('div');
    fileListContainer.className = 'cloud-file-list-container';

    for (const { decoded: keyName, modifiedAt } of filteredEntries) {
      const item = document.createElement('div');
      item.className = 'cloud-file-item';
      item.dataset.sortName = keyName;
      if (modifiedAt !== undefined) item.dataset.modifiedAt = String(modifiedAt);
      
      // Zaznacz ostatnio wczytany plik
      if (lastLoadedFile?.type === 'cloud' && lastLoadedFile?.name === keyName) {
        item.classList.add('cloud-file-item--active');
      }
      
      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'cloud-file-item__select';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'cloud-file-item__name';
      nameSpan.textContent = stripAnyAllowedExtension(keyName);
      selectBtn.appendChild(nameSpan);
      item.appendChild(selectBtn);
      
      const actions = document.createElement('div');
      actions.className = 'cloud-file-item__actions';
      
      
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
          const message = err instanceof Error && err.message ? err.message : filePanelText('cloudLoadFailed');
          alert(message);
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
      
      const updateSelectLabel = () => {
        const visibleName = nameSpan.textContent ?? stripAnyAllowedExtension(keyName);
        selectBtn.setAttribute('aria-label', cloudPanelMode === 'save'
          ? filePanelText('useFilename', { name: visibleName })
          : filePanelText('loadFile', { name: visibleName }));
        selectBtn.title = selectBtn.getAttribute('aria-label')!;
      };
      updateSelectLabel();
      selectBtn.addEventListener('click', () => {
        handleSelection();
      });
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'cloud-file-item__btn cloud-file-item__btn--delete';
      deleteBtn.title = filePanelText('deleteFile', { name: keyName });
      deleteBtn.setAttribute('aria-label', deleteBtn.title);
      deleteBtn.innerHTML = DELETE_ICON;
      deleteBtn.addEventListener('click', async (evt) => {
        evt.stopPropagation();
        if (!confirm(filePanelText('deleteConfirmCloud', { name: keyName }))) {
          return;
        }
        try {
          await deleteFromKV(keyName);
          // Odśwież listę
          loadCloudList(onLoadCallback);
        } catch (err) {
          console.error('Nie udało się usunąć pliku:', err);
          alert(filePanelText('cloudDeleteFailed'));
        }
      });
      
      actions.appendChild(deleteBtn);
      item.appendChild(actions);
      
      fileListContainer.appendChild(item);
    }
    
    sortFileRows(fileListContainer, 'name');
    content.appendChild(fileListContainer);
  } catch (err) {
    if (request !== cloudListRequest) return;
    console.error('Nie udało się pobrać listy plików:', err);
    content.innerHTML = `<div class="cloud-error">${filePanelText('fileListError')}</div>`;
  }
}
