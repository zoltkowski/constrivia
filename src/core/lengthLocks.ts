import type { ObjectId } from './runtimeTypes';

export type SegmentEnds = [ObjectId, ObjectId];

export function sameSegment(a: SegmentEnds, b: SegmentEnds): boolean {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

export function lockedLineSegments(line: {
  defining_points: SegmentEnds; lengthLocked?: boolean; lockedSegments?: SegmentEnds[];
}): SegmentEnds[] {
  return line.lengthLocked ? [line.defining_points, ...(line.lockedSegments ?? [])] : line.lockedSegments ?? [];
}
