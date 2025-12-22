import type { LineHit } from './hitTypes';

// Used by selection to stringify segment selections.
export function segmentKey(line: number, part: 'segment' | 'rayLeft' | 'rayRight', seg?: number) {
  if (part === 'segment') return `${line}:s:${seg ?? 0}`;
  return `${line}:${part}`;
}

// Used by selection to stringify hits.
export function hitKey(hit: LineHit) {
  return segmentKey(hit.line, hit.part, hit.part === 'segment' ? hit.seg : undefined);
}

// Used by selection to parse segment selection keys.
export function parseSegmentKey(
  key: string
): { line: number; part: 'segment' | 'rayLeft' | 'rayRight'; seg?: number } | null {
  if (key.includes(':s:')) {
    const [lineStr, , segStr] = key.split(':');
    const line = Number(lineStr);
    const seg = Number(segStr);
    if (Number.isNaN(line) || Number.isNaN(seg)) return null;
    return { line, part: 'segment', seg };
  }
  const [lineStr, part] = key.split(':');
  const line = Number(lineStr);
  if (Number.isNaN(line)) return null;
  if (part === 'rayLeft' || part === 'rayRight') return { line, part };
  return null;
}
