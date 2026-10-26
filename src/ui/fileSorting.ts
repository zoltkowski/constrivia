export type FileSortOrder = 'name' | 'date';
export type SortableFile = { name: string; modifiedAt?: number };

export function fileTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Missing dates go after dated files, with a deterministic alphabetical tie break. */
export function compareFiles(a: SortableFile, b: SortableFile, order: FileSortOrder): number {
  if (order === 'date') {
    const first = fileTimestamp(a.modifiedAt), second = fileTimestamp(b.modifiedAt);
    if (first !== second) {
      if (first === undefined) return 1;
      if (second === undefined) return -1;
      return second - first;
    }
  }
  return a.name.localeCompare(b.name, 'pl', { numeric: true, sensitivity: 'base' }) || a.name.localeCompare(b.name, 'pl');
}
