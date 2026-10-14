import type { PersistedCircle } from './persistedTypes';

export type PersistedCircleKind = NonNullable<PersistedCircle['circle_kind']>;

/** Runtime circles without a kind use the application's center/radius semantics. */
export function circleKindForPersistence(circleKind?: PersistedCircleKind): PersistedCircleKind {
  return circleKind ?? 'center-radius';
}

/**
 * Older documents omitted circle_kind. Their center/radius circles still carry
 * a three-entry adapter tuple, with the center repeated as its first point.
 * A legacy three-point circle has three distinct defining points and does not
 * include its computed center in that tuple.
 */
export function inferPersistedCircleKind(
  circle: Pick<PersistedCircle, 'circle_kind' | 'center' | 'defining_points'>
): PersistedCircleKind | undefined {
  if (circle.circle_kind) return circle.circle_kind;
  const definingPoints = circle.defining_points;
  if (!Array.isArray(definingPoints) || definingPoints.length !== 3) return undefined;
  return definingPoints.includes(circle.center) ? 'center-radius' : 'three-point';
}
