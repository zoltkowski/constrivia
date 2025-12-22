import type {
  PointRuntime,
  LineRuntime,
  CircleRuntime,
  PointStyle,
  StrokeStyle,
  AngleStyle
} from './core/runtimeTypes';

export type ResolvedPointStyle = PointStyle & { color: string; size: number };
export type ResolvedStrokeStyle = StrokeStyle & { color: string; width: number; type: 'solid' | 'dashed' | 'dotted' };
export type ResolvedAngleStyle = AngleStyle & { color: string; width: number; type: 'solid' | 'dashed' | 'dotted' };

export type StyleOverrides = Partial<{
  point: Partial<PointStyle>;
  line: Partial<StrokeStyle>;
  circle: Partial<StrokeStyle>;
}>;

const DEFAULT_POINT_STYLE: ResolvedPointStyle = { color: '#ffffff', size: 4 };
const DEFAULT_STROKE: ResolvedStrokeStyle = { color: '#000000', width: 2, type: 'solid' };
const DEFAULT_ANGLE_STYLE: ResolvedAngleStyle = { ...DEFAULT_STROKE, arcCount: 1, right: false };

let overrides: StyleOverrides = {};

// Used by UI state helpers.
export function setStyleOverrides(next: StyleOverrides) {
  overrides = { ...overrides, ...next };
}

// Used by main UI flow.
export function resetStyleOverrides() {
  overrides = {};
}

// Used by point tools.
export function mapPointStyle(point: Pick<PointRuntime, 'style'> | null | undefined, defaults?: Partial<PointStyle>): ResolvedPointStyle {
  const base: ResolvedPointStyle = { ...DEFAULT_POINT_STYLE, ...(defaults ?? {}), ...((point && point.style) ?? {}) };
  const o = overrides.point ?? {};
  return { ...base, ...o } as ResolvedPointStyle;
}

// Used by main UI flow.
export function mapStrokeStyle(
  style: StrokeStyle | null | undefined,
  defaults?: Partial<StrokeStyle>,
  kind: 'line' | 'circle' = 'line'
): ResolvedStrokeStyle {
  const base: ResolvedStrokeStyle = { ...DEFAULT_STROKE, ...(defaults ?? {}), ...(style ?? {}) } as ResolvedStrokeStyle;
  const o = kind === 'circle' ? (overrides.circle ?? {}) : (overrides.line ?? {});
  return { ...base, ...o } as ResolvedStrokeStyle;
}

// Used by line tools.
export function mapLineStyle(line: LineRuntime, defaults?: Partial<StrokeStyle>): ResolvedStrokeStyle {
  const baseStyle = (line.segmentStyles?.[0] ?? line.style ?? DEFAULT_STROKE) as StrokeStyle;
  const base: ResolvedStrokeStyle = { ...DEFAULT_STROKE, ...(defaults ?? {}), ...baseStyle } as ResolvedStrokeStyle;
  const o = overrides.line ?? {};
  return { ...base, ...o } as ResolvedStrokeStyle;
}

// Used by circle tools.
export function mapCircleStyle(circle: CircleRuntime, defaults?: Partial<StrokeStyle>): ResolvedStrokeStyle {
  const baseStyle = (circle.style ?? DEFAULT_STROKE) as StrokeStyle;
  const base: ResolvedStrokeStyle = { ...DEFAULT_STROKE, ...(defaults ?? {}), ...baseStyle } as ResolvedStrokeStyle;
  const o = overrides.circle ?? {};
  return { ...base, ...o } as ResolvedStrokeStyle;
}

// Used by angle tools.
export function mapAngleStyle(angle: { style?: AngleStyle | null } | null | undefined, defaults?: Partial<AngleStyle>): ResolvedAngleStyle {
  const base: ResolvedAngleStyle = { ...DEFAULT_ANGLE_STYLE, ...(defaults ?? {}), ...((angle && angle.style) ?? {}) };
  return { ...base } as ResolvedAngleStyle;
}

// Used by UI state helpers.
export function getStyleOverrides() {
  return { ...overrides };
}
