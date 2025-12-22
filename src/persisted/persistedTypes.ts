import { PointStyle, StrokeStyle, AngleStyle, LabelRuntime, FreeLabel, InkStrokeRuntime as InkStroke, ObjectId } from '../core/runtimeTypes';

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
  points: ObjectId[];
  defining_points?: [ObjectId, ObjectId];
  segmentStyles?: StrokeStyle[];
  style: StrokeStyle;
  label?: FreeLabel;
  hidden?: boolean;
}

export interface PersistedCircle {
  id?: string;
  center: ObjectId;
  radius_point?: ObjectId;
  points: ObjectId[];
  defining_points?: [ObjectId, ObjectId, ObjectId];
  style: StrokeStyle;
  fill?: string;
  label?: FreeLabel;
  hidden?: boolean;
}

export interface PersistedAngle {
  id?: string;
  point1?: ObjectId;
  point2?: ObjectId;
  vertex: ObjectId;
  arm1LineId?: ObjectId;
  arm2LineId?: ObjectId;
  style: AngleStyle;
  label?: FreeLabel;
  hidden?: boolean;
}

export interface PersistedPolygon {
  id?: string;
  points: ObjectId[];
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
  labels?: LabelRuntime[];
  idCounters?: Record<string, number>;
  indexById?: Record<string, Record<string, number>>;
}

export interface PersistedDocument {
  model: PersistedModel;
  measurementReferenceSegment?: string;
  measurementReferenceValue?: number;
}
