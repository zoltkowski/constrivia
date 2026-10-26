import type {
  BisectMeta,
  AngleArm,
  BisectorLineMeta,
  ConstructionParent,
  LineConstructionKind,
  MidpointMeta,
  ObjectId,
  PolygonLockRef,
  PerpendicularLineMeta,
  ParallelLineMeta,
  PointConstructionKind,
  SymmetricMeta,
  BoundaryIntersectionSet,
  BoundaryIntersectionSlot
} from './runtimeTypes';

// Geometry-only engine types (no styles, labels, or UI metadata).
export type EnginePoint = {
  id: ObjectId;
  x: number;
  y: number;
  geometryValid?: boolean;
  construction_kind?: PointConstructionKind;
  parent_refs?: ConstructionParent[];
  defining_parents?: ObjectId[];
  created_group?: string;
  midpointMeta?: MidpointMeta;
  bisectMeta?: BisectMeta;
  symmetricMeta?: SymmetricMeta;
  boundaryIntersectionSet?: BoundaryIntersectionSet;
  boundaryIntersectionSlot?: BoundaryIntersectionSlot;
};

export type EngineLine = {
  id: ObjectId;
  geometryValid?: boolean;
  points: ObjectId[];
  defining_points: [ObjectId, ObjectId];
  construction_kind?: LineConstructionKind;
  defining_parents?: ObjectId[];
  parallel?: ParallelLineMeta;
  perpendicular?: PerpendicularLineMeta;
  bisector?: BisectorLineMeta;
};

export type EngineCircle = {
  compassSource?: import('./circleGeometry').CompassDistanceSource;
  id: ObjectId;
  geometryValid?: boolean;
  center: ObjectId;
  radius_point?: ObjectId;
  points: ObjectId[];
  defining_points: [ObjectId, ObjectId, ObjectId];
  circle_kind?: 'center-radius' | 'three-point' | 'compass';
  defining_parents?: ObjectId[];
};

export type EngineAngle = {
  id: ObjectId;
  geometryValid?: boolean;
  vertex: ObjectId;
  point1?: ObjectId;
  point2?: ObjectId;
  arm1LineId?: ObjectId;
  arm2LineId?: ObjectId;
  arm1?: AngleArm;
  arm2?: AngleArm;
  defining_parents?: ObjectId[];
};

export type EnginePolygon = {
  id: ObjectId;
  geometryValid?: boolean;
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
