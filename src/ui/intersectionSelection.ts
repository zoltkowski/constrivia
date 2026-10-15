export type IntersectionTarget = { kind: 'line' | 'circle' | 'polygon'; id: string };

/** In step two, prefer a different object at the crossing over the selected one. */
export function intersectionTargetAtHit(candidates: IntersectionTarget[], first: IntersectionTarget | null): IntersectionTarget | null {
  if (first) {
    const other = candidates.find(candidate => candidate.kind !== first.kind || candidate.id !== first.id);
    if (other) return other;
  }
  return candidates[0] ?? null;
}
