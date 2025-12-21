import { PointStyle, StrokeStyle, AngleStyle, FreeLabel, InkStroke } from '../types';

export interface PersistedPoint {
  id?: string;
  x: number;
  y: number;
  style: PointStyle;
  label?: FreeLabel;
  construction_kind?: string;
  parent_refs?: { kind: 'line' | 'circle' | 'point'; id: string }[];
}

export interface PersistedLine {
  id?: string;
  points: number[];
  defining_points?: [number, number];
  segmentStyles?: StrokeStyle[];
  style: StrokeStyle;
  label?: FreeLabel;
  hidden?: boolean;
}

export interface PersistedCircle {
  id?: string;
  center: number;
  radius_point?: number;
  points: number[];
  style: StrokeStyle;
  fill?: string;
  label?: FreeLabel;
  hidden?: boolean;
}

export interface PersistedAngle {
  id?: string;
  /**
   * @deprecated Legacy numeric leg refs. Present only for older payloads
   * and during migration. New persisted payloads use id-based fields
   * (`point1`/`point2` and `arm*LineId`) instead.
   */
  leg1?: { line: number | string; otherPoint?: number; seg?: number };
  /**
   * @deprecated Legacy numeric leg refs. Present only for older payloads
   * and during migration. New persisted payloads use id-based fields
   * (`point1`/`point2` and `arm*LineId`) instead.
   */
  leg2?: { line: number | string; otherPoint?: number; seg?: number };
  // Canonical persisted fields (id-based) — preferred for new payloads
  point1?: string;
  point2?: string;
  // vertex may be numeric index (legacy) or id (preferred)
  // prefer string id; numeric index kept for backwards compatibility
  vertex: number | string;
  // Runtime arm ids if preserved in exported payloads
  arm1LineId?: string;
  arm2LineId?: string;
  style: AngleStyle;
  label?: FreeLabel;
  hidden?: boolean;
}

export interface PersistedPolygon {
  id?: string;
  lines: number[];
  fill?: string;
  hidden?: boolean;
}

export interface PersistedModel {
  points?: PersistedPoint[];
  lines?: PersistedLine[];
  circles?: PersistedCircle[];
  angles?: PersistedAngle[];
  polygons?: PersistedPolygon[];
  inkStrokes?: InkStroke[];
  labels?: FreeLabel[];
  idCounters?: Record<string, number>;
  // indexById keeps numeric indices for quick lookup after loading
  indexById?: Record<string, Record<string, number>>;
}

export interface PersistedDocument {
  model: PersistedModel;
  measurementReferenceSegment?: string;
  measurementReferenceValue?: number;
}
