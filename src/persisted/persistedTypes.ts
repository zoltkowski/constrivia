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
  leg1: { line: number; otherPoint: number };
  leg2: { line: number; otherPoint: number };
  vertex: number;
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
