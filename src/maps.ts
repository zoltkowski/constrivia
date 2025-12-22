export type ObjectId = string | number;

// Used by main UI flow.
export function arrayToMap<T>(arr: T[], getId: (t: T) => ObjectId): Map<ObjectId, T> {
  const m = new Map<ObjectId, T>();
  if (!arr) return m;
  for (const item of arr) {
    const id = getId(item);
    m.set(id, item);
  }
  return m;
}

// Used by main UI flow.
export function mapToArray<T>(map: Map<ObjectId, T>): T[] {
  if (!map) return [];
  return Array.from(map.values());
}
