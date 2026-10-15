import type { LineRuntime, ObjectId, StrokeStyle } from '../core/runtimeTypes';
import { segmentKeyForIds } from '../core/engine';

type Position = { x: number; y: number };
type Positions = Record<ObjectId, Position>;
type Region = 'left' | 'inside' | 'right';

function region(line: LineRuntime, aId: ObjectId, bId: ObjectId, positions: Positions): Region | null {
  const [first, last] = line.defining_points;
  const origin = positions[first], end = positions[last], a = positions[aId], b = positions[bId];
  if (!origin || !end || !a || !b) return null;
  const dx = end.x - origin.x, dy = end.y - origin.y, lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return null;
  const t = (((a.x + b.x) / 2 - origin.x) * dx + ((a.y + b.y) / 2 - origin.y) * dy) / lengthSquared;
  return t < -1e-6 ? 'left' : t > 1 + 1e-6 ? 'right' : 'inside';
}

function segmentContainsSegment(aId: ObjectId, bId: ObjectId, cId: ObjectId, dId: ObjectId, positions: Positions): boolean {
  const a = positions[aId], b = positions[bId], c = positions[cId], d = positions[dId];
  if (!a || !b || !c || !d) return false;
  const dx = d.x - c.x, dy = d.y - c.y, lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-12) return false;
  const tolerance = 1e-6 * Math.max(1, Math.sqrt(lengthSquared));
  const inside = (point: Position) => {
    const px = point.x - c.x, py = point.y - c.y;
    const crossDistance = Math.abs(dx * py - dy * px) / Math.sqrt(lengthSquared);
    const t = (px * dx + py * dy) / lengthSquared;
    return crossDistance <= tolerance && t >= -1e-6 && t <= 1 + 1e-6;
  };
  return inside(a) && inside(b);
}

/** Reconcile presentation when subdivision points cross the defining endpoints. */
export function reconcileLineTopologyStyles(line: LineRuntime, nextPoints: ObjectId[], before: Positions, after: Positions) {
  const oldStyles = new Map<string, StrokeStyle>();
  for (let i = 0; i < line.points.length - 1; i++) {
    oldStyles.set(segmentKeyForIds(line.points[i], line.points[i + 1]), line.segmentStyles?.[i] ?? line.style);
  }
  const segmentKeys: string[] = [], segmentStyles: StrokeStyle[] = [];
  for (let i = 0; i < nextPoints.length - 1; i++) {
    const a = nextPoints[i], b = nextPoints[i + 1], key = segmentKeyForIds(a, b);
    const oldStyle = oldStyles.get(key);
    let inheritedRegion = oldStyle ? region(line, a, b, before) : null;
    const nextRegion = region(line, a, b, after);
    let inheritedStyle = oldStyle;
    if (!inheritedStyle) {
      for (let oldIndex = 0; oldIndex < line.points.length - 1; oldIndex++) {
        const oldA = line.points[oldIndex], oldB = line.points[oldIndex + 1];
        if (segmentContainsSegment(a, b, oldA, oldB, after)) {
          inheritedStyle = oldStyles.get(segmentKeyForIds(oldA, oldB));
          inheritedRegion = region(line, oldA, oldB, before);
          break;
        }
      }
    }
    let style = inheritedStyle ?? line.style;
    if (nextRegion && (!inheritedStyle || (inheritedRegion && nextRegion !== inheritedRegion))) {
      // A newly exposed interval inherits its half-line's visibility and style.
      // Once it exists, the user may style/show that individual interval.
      style = nextRegion === 'inside' ? line.style :
        nextRegion === 'left' ? { ...line.style, ...(line.leftRay ?? { hidden: true }) } :
        { ...line.style, ...(line.rightRay ?? { hidden: true }) };
    }
    segmentKeys.push(key);
    segmentStyles.push({ ...style });
  }
  return { segmentKeys, segmentStyles };
}
