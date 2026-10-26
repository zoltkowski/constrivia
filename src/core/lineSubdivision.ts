import type { LineRuntime } from './runtimeTypes';

type Definition = Pick<LineRuntime, 'perpendicular' | 'bisector' | 'symmetry'>;
type Subdivision = Definition & Pick<LineRuntime, 'points'>;

/** These constructors keep computational direction points outside user subdivisions. */
export function hasIndependentLineDirection(line: Definition): boolean {
  return !!(line.perpendicular?.directBisector || line.bisector || line.symmetry?.linePoints);
}

export function lineSubdivisionPointIds(line: Subdivision): string[] {
  if(line.symmetry?.linePoints)return line.symmetry.linePoints;
  if (line.perpendicular?.directBisector) {
    const { throughPoint, helperPoint } = line.perpendicular;
    return line.points.filter(id => id !== throughPoint && id !== helperPoint);
  }
  if (line.bisector) return line.points.filter(id => id !== line.bisector!.bisectPoint);
  return line.points;
}
