export type AxisSnap = { lineId: string; axis: 'horizontal' | 'vertical'; strength: number };

export type AxisSnapResult = {
  snaps: Map<string, AxisSnap>;
  best: AxisSnap | null;
};

export function computeAxisSnapsForLines(
  lineIds: Iterable<string>,
  opts: {
    lineExtent: (lineId: string) => { startPoint?: { x: number; y: number }; endPoint?: { x: number; y: number }; order?: Array<{ x: number; y: number }> } | null;
    lineSnapSinAngle: number;
    lineSnapIndicatorThreshold: number;
  }
): AxisSnapResult {
  const { lineExtent, lineSnapSinAngle, lineSnapIndicatorThreshold } = opts;
  const snaps = new Map<string, AxisSnap>();
  let best: AxisSnap | null = null;
  for (const lineId of lineIds) {
    const ext = lineExtent(lineId);
    if (!ext) continue;
    const aPt = ext.startPoint ?? (ext.order && ext.order[0] ? ext.order[0] : null);
    const bPt = ext.endPoint ?? (ext.order && ext.order[ext.order.length - 1] ? ext.order[ext.order.length - 1] : null);
    if (!aPt || !bPt) continue;
    const vx = bPt.x - aPt.x;
    const vy = bPt.y - aPt.y;
    const len = Math.hypot(vx, vy) || 1;
    const threshold = Math.max(1e-4, len * lineSnapSinAngle);
    if (Math.abs(vy) <= threshold) {
      const closeness = 1 - Math.min(Math.abs(vy) / threshold, 1);
      if (closeness >= lineSnapIndicatorThreshold) {
        const strength = Math.min(1, Math.max(0, (closeness - lineSnapIndicatorThreshold) / (1 - lineSnapIndicatorThreshold)));
        const snap = { lineId, axis: 'horizontal' as const, strength };
        snaps.set(lineId, snap);
        if (!best || strength > best.strength) best = snap;
      }
    } else if (Math.abs(vx) <= threshold) {
      const closeness = 1 - Math.min(Math.abs(vx) / threshold, 1);
      if (closeness >= lineSnapIndicatorThreshold) {
        const strength = Math.min(1, Math.max(0, (closeness - lineSnapIndicatorThreshold) / (1 - lineSnapIndicatorThreshold)));
        const snap = { lineId, axis: 'vertical' as const, strength };
        snaps.set(lineId, snap);
        if (!best || strength > best.strength) best = snap;
      }
    }
  }
  return { snaps, best };
}
