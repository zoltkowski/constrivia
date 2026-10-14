import { circleCircleIntersections } from './engine';

type Position = { x: number; y: number };

/** Geometric plan only; creation and visibility of document objects belong to UI. */
export function tangentConstructionGeometry(center: Position, radius: number, point: Position) {
  if (![center.x, center.y, point.x, point.y, radius].every(Number.isFinite) || radius <= 1e-6) return null;
  const distance = Math.hypot(point.x - center.x, point.y - center.y);
  if (distance < radius - 1e-2) return { kind: 'inside' as const };
  if (Math.abs(distance - radius) < 1e-2) return { kind: 'contact' as const };
  const midpoint = { x: (point.x + center.x) / 2, y: (point.y + center.y) / 2 };
  const auxiliaryRadius = distance / 2;
  return { kind: 'external' as const, midpoint, auxiliaryRadius,
    contacts: circleCircleIntersections(midpoint, auxiliaryRadius, center, radius) };
}
