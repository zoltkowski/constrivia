import type {
  BisectMeta,
  ConstructionParent,
  LineConstructionKind,
  MidpointMeta,
  ObjectId,
  PolygonLockRef,
  PerpendicularLineMeta,
  ParallelLineMeta,
  PointConstructionKind,
  SymmetricMeta
} from './runtimeTypes';

// Geometry-only engine types (no styles, labels, or UI metadata).
export type EnginePoint = {
  id: ObjectId;
  x: number;
  y: number;
  hidden?: boolean;
  construction_kind?: PointConstructionKind;
  parent_refs?: ConstructionParent[];
  defining_parents?: ObjectId[];
  created_group?: string;
  midpointMeta?: MidpointMeta;
  bisectMeta?: BisectMeta;
  symmetricMeta?: SymmetricMeta;
};

export type EngineLine = {
  id: ObjectId;
  points: ObjectId[];
  defining_points: [ObjectId, ObjectId];
  construction_kind?: LineConstructionKind;
  defining_parents?: ObjectId[];
  parallel?: ParallelLineMeta;
  perpendicular?: PerpendicularLineMeta;
  bisector?: { vertex: ObjectId; bisectPoint: ObjectId };
};

export type EngineCircle = {
  id: ObjectId;
  center: ObjectId;
  radius_point?: ObjectId;
  points: ObjectId[];
  defining_points: [ObjectId, ObjectId, ObjectId];
  circle_kind?: 'center-radius' | 'three-point';
  defining_parents?: ObjectId[];
};

export type EngineAngle = {
  id: ObjectId;
  vertex: ObjectId;
  point1?: ObjectId;
  point2?: ObjectId;
  arm1LineId?: ObjectId;
  arm2LineId?: ObjectId;
  defining_parents?: ObjectId[];
};

export type EnginePolygon = {
  id: ObjectId;
  points: ObjectId[];
  defining_parents?: ObjectId[];
  locked?: boolean;
  lockRef?: PolygonLockRef;
};

export type EngineState = {
  points: Record<ObjectId, EnginePoint>;
  lines: Record<ObjectId, EngineLine>;
  circles: Record<ObjectId, EngineCircle>;
  angles: Record<ObjectId, EngineAngle>;
  polygons: Record<ObjectId, EnginePolygon>;
};
