import type { LineHit } from './hitTypes';
import type { ObjectId } from './runtimeTypes';

// Used by selection to stringify segment selections.
export function segmentKey(lineId: ObjectId, part: 'segment' | 'rayLeft' | 'rayRight', seg?: number) {
  if (part === 'segment') return `${lineId}:s:${seg ?? 0}`;
  return `${lineId}:${part}`;
}

// Used by selection to stringify hits.
export function hitKey(hit: LineHit) {
  return segmentKey(hit.lineId, hit.part, hit.part === 'segment' ? hit.seg : undefined);
}

// Used by selection to parse segment selection keys.
export function parseSegmentKey(
  key: string
): { lineId: ObjectId; part: 'segment' | 'rayLeft' | 'rayRight'; seg?: number } | null {
  if (key.includes(':s:')) {
    const [lineId, , segStr] = key.split(':');
    const seg = Number(segStr);
    if (!lineId || Number.isNaN(seg)) return null;
    return { lineId, part: 'segment', seg };
  }
  const [lineId, part] = key.split(':');
  if (!lineId) return null;
  if (part === 'rayLeft' || part === 'rayRight') return { lineId, part };
  return null;
}
