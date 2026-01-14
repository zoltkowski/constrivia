import {
  PointStyle,
  StrokeStyle,
  AngleStyle,
  LabelRuntime,
  FreeLabel,
  InkStrokeRuntime as InkStroke,
  ObjectId,
  MidpointMeta,
  BisectMeta,
  SymmetricMeta,
  ParallelLineMeta,
  PerpendicularLineMeta
} from '../core/runtimeTypes';

export type BisectorLineMeta = { vertex: ObjectId; bisectPoint: ObjectId };

export interface PersistedPoint {
  id?: string;
  x: number;
  y: number;
  style?: PointStyle;
  label?: FreeLabel;
  construction_kind?: string;
  parent_refs?: { kind: 'line' | 'circle' | 'point'; id: string }[];
  defining_parents?: ObjectId[];
  created_group?: string;
  parallel_helper_for?: ObjectId;
  perpendicular_helper_for?: ObjectId;
  midpointMeta?: MidpointMeta;
  bisectMeta?: BisectMeta;
  symmetricMeta?: SymmetricMeta;
}

export interface PersistedLine {
  id?: string;
  points: ObjectId[];
  defining_points?: [ObjectId, ObjectId];
  segmentStyles?: StrokeStyle[];
  style?: StrokeStyle;
  label?: FreeLabel;
  hidden?: boolean;
  construction_kind?: string;
  defining_parents?: ObjectId[];
  parallel?: ParallelLineMeta;
  perpendicular?: PerpendicularLineMeta;
  leftRay?: StrokeStyle;
  rightRay?: StrokeStyle;
  bisector?: BisectorLineMeta;
}

export interface PersistedCircle {
  id?: string;
  center: ObjectId;
  radius_point?: ObjectId;
  points?: ObjectId[];
  defining_points?: [ObjectId, ObjectId, ObjectId];
  style?: StrokeStyle;
  fill?: string;
  fillOpacity?: number;
  arcStyles?: StrokeStyle[] | Record<string, StrokeStyle>;
  label?: FreeLabel;
  hidden?: boolean;
  construction_kind?: string;
  defining_parents?: ObjectId[];
  circle_kind?: 'center-radius' | 'three-point';
}

export interface PersistedAngle {
  id?: string;
  point1?: ObjectId;
  point2?: ObjectId;
  vertex: ObjectId;
  arm1LineId?: ObjectId;
  arm2LineId?: ObjectId;
  style?: AngleStyle;
  label?: FreeLabel;
  hidden?: boolean;
  construction_kind?: string;
  defining_parents?: ObjectId[];
}

export interface PersistedPolygon {
  id?: string;
  points: ObjectId[];
  fill?: string;
  fillOpacity?: number;
  hidden?: boolean;
  locked?: boolean;
  construction_kind?: string;
  defining_parents?: ObjectId[];
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
