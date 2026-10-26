import type { PersistedDocument } from './persistedTypes';

/** The active page remains at the top level for older single-page readers. */
export function packMultipageDocument(pages: PersistedDocument[], activePage: number): PersistedDocument {
  if (!pages.length) throw new Error('A document needs at least one page');
  const index = Math.max(0, Math.min(pages.length - 1, Math.trunc(activePage) || 0));
  const copies = pages.map(page => {
    const { pages: _pages, activePage: _index, ...single } = page;
    return JSON.parse(JSON.stringify(single)) as PersistedDocument;
  });
  return { ...copies[index], pages: copies, activePage: index };
}

export function readMultipageDocument(raw: unknown): { pages: PersistedDocument[]; index: number } | null {
  if (!raw || typeof raw !== 'object' || !('pages' in raw)) return null;
  const doc = raw as PersistedDocument;
  if (!Array.isArray(doc.pages) || !doc.pages.length || doc.pages.some(page =>
    !page || typeof page !== 'object' || !page.model || typeof page.model !== 'object' || 'pages' in page
  )) throw new Error('Invalid multipage document');
  const index = Number.isInteger(doc.activePage) ? Math.max(0, Math.min(doc.pages.length - 1, doc.activePage!)) : 0;
  return { pages: JSON.parse(JSON.stringify(doc.pages)), index };
}
