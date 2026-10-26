import {
  PointStyle,
  StrokeStyle,
  AngleStyle,
  AngleArm,
  LabelRuntime,
  FreeLabel,
  InkStrokeRuntime as InkStroke,
  ObjectId,
  MidpointMeta,
  BisectMeta,
  BisectorLineMeta,
  SymmetricMeta,
  ParallelLineMeta,
  PerpendicularLineMeta,
  BoundaryIntersectionSet,
  BoundaryIntersectionSlot
} from '../core/runtimeTypes';
import type { Cuboid, SpatialGroup, SpatialPointDefinition,SpatialAngleDefinition } from '../core/spatialTypes';

export type { BisectorLineMeta } from '../core/runtimeTypes';

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
  auxiliaryFor?: ObjectId;
  midpointMeta?: MidpointMeta;
  bisectMeta?: BisectMeta;
  symmetricMeta?: SymmetricMeta;
  boundaryIntersectionSet?: BoundaryIntersectionSet;
  boundaryIntersectionSlot?: BoundaryIntersectionSlot;
  spatial?: SpatialPointDefinition;
}

export interface PersistedLine {
  spatialParameters?: Record<ObjectId, number>;
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
  compassSource?: import('../core/circleGeometry').CompassDistanceSource;
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
  circle_kind?: 'center-radius' | 'three-point' | 'compass';
}

export interface PersistedAngle {
  spatial?: SpatialAngleDefinition;
  id?: string;
  point1?: ObjectId;
  point2?: ObjectId;
  vertex: ObjectId;
  arm1LineId?: ObjectId;
  arm2LineId?: ObjectId;
  arm1?: AngleArm;
  arm2?: AngleArm;
  style?: AngleStyle;
  label?: FreeLabel;
  hidden?: boolean;
  construction_kind?: string;
  defining_parents?: ObjectId[];
}

export interface PersistedPolygon {
  solidFace?: {solidId:ObjectId;axis:0|1|2;side:0|1;index?:number};
  spatialSection?: import('../core/spatialTypes').SpatialSectionDefinition;
  spatialGroupId?: ObjectId;
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
  objectGroups?: Record<ObjectId, import('../core/runtimeTypes').ObjectGroup>;
  points?: PersistedPoint[];
  lines?: PersistedLine[];
  circles?: PersistedCircle[];
  angles?: PersistedAngle[];
  polygons?: PersistedPolygon[];
  inkStrokes?: InkStroke[];
  labels?: LabelRuntime[];
  idCounters?: Record<string, number>;
  indexById?: Record<string, Record<string, number>>;
  solids?: Record<ObjectId, Cuboid>;
  spatialGroups?: Record<ObjectId, SpatialGroup>;
}

export interface PersistedDocument {
  model: PersistedModel;
  measurementReferenceSegment?: string;
  measurementReferenceValue?: number;
}
