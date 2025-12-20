import type { Point, Line, Circle, PointStyle, StrokeStyle } from './types';

export type StyleOverrides = Partial<{
  point: Partial<PointStyle>;
  line: Partial<StrokeStyle>;
  circle: Partial<StrokeStyle>;
}>;

const DEFAULT_POINT_STYLE: PointStyle = { color: '#ffffff', size: 4 };
const DEFAULT_STROKE: StrokeStyle = { color: '#000000', width: 2, type: 'solid' };

let overrides: StyleOverrides = {};

export function setStyleOverrides(next: StyleOverrides) {
  overrides = { ...overrides, ...next };
}

export function resetStyleOverrides() {
  overrides = {};
}

export function mapPointStyle(point: Point): PointStyle {
  const base: PointStyle = { ...DEFAULT_POINT_STYLE, ...(point.style ?? {}) };
  const o = overrides.point ?? {};
  return { ...base, ...o };
}

export function mapLineStyle(line: Line): StrokeStyle {
  const base: StrokeStyle = { ...(line.segmentStyles?.[0] ?? line.style ?? DEFAULT_STROKE) } as StrokeStyle;
  const o = overrides.line ?? {};
  return { ...base, ...o } as StrokeStyle;
}

export function mapCircleStyle(circle: Circle): StrokeStyle {
  const base: StrokeStyle = { ...(circle.style ?? DEFAULT_STROKE) } as StrokeStyle;
  const o = overrides.circle ?? {};
  return { ...base, ...o } as StrokeStyle;
}

export function getStyleOverrides() {
  return { ...overrides };
}
