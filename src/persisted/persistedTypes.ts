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
  // Legacy numeric leg refs (optional during migration)
  leg1?: { line: number | string; otherPoint?: number; seg?: number };
  leg2?: { line: number | string; otherPoint?: number; seg?: number };
  // Canonical persisted fields (id-based) — may be present on copied/persisted payloads
  point1?: string;
  point2?: string;
  // vertex may be numeric index (legacy) or id (preferred)
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
