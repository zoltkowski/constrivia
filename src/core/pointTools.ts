import type { BisectMeta, BisectPoint, MidpointMeta, MidpointPoint, Point, SymmetricMeta, SymmetricPoint } from './runtimeTypes';

// Used by point tools to recognize midpoint points.
export const isMidpointPoint = (point: Point | null | undefined): point is MidpointPoint =>
  !!point &&
  point.construction_kind === 'midpoint' &&
  !!((point as any).midpointMeta ?? (point as any).midpoint);

// Used by point tools to recognize bisector points.
export const isBisectPoint = (point: Point | null | undefined): point is BisectPoint =>
  !!point &&
  point.construction_kind === 'bisect' &&
  !!((point as any).bisectMeta ?? (point as any).bisect);

// Used by point tools to recognize symmetric points.
export const isSymmetricPoint = (point: Point | null | undefined): point is SymmetricPoint =>
  !!point &&
  point.construction_kind === 'symmetric' &&
  !!((point as any).symmetricMeta ?? (point as any).symmetric);

// Used by point tools to access midpoint metadata consistently.
export function getMidpointMeta(point: Point): MidpointMeta | undefined {
  return (point as any).midpointMeta ?? (point as any).midpoint;
}

// Used by point tools to access bisector metadata consistently.
export function getBisectMeta(point: Point): BisectMeta | undefined {
  return (point as any).bisectMeta ?? (point as any).bisect;
}

// Used by point tools to access symmetric metadata consistently.
export function getSymmetricMeta(point: Point): SymmetricMeta | undefined {
  return (point as any).symmetricMeta ?? (point as any).symmetric;
}
