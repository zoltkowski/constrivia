import type { Cuboid, SpatialGroup, SpatialPointDefinition, SpatialAngleDefinition, SpatialSectionDefinition, Vec3 } from './spatialTypes';
export type ObjectId = string;

export type TickLevel = 0 | 1 | 2 | 3;

export type GeometryKind = 'point' | 'line' | 'circle' | 'angle' | 'polygon';
export type GeoObjectType = GeometryKind;

export type LabelAlignment = 'left' | 'center';

export type PointFillMode = 'filled' | 'hollow';

export type LabelSeq = { kind: 'upper' | 'lower' | 'greek'; idx: number };

export type LabelTextStyle = { bold?: boolean; italic?: boolean; color?: string; fontSize?: number };
// Offsets refer to the source text (UTF-16), including mathematical notation.
export type LabelTextStyleRange = LabelTextStyle & { start: number; end: number };

export type PointStyle = { color?: string; size?: number; hidden?: boolean; hollow?: boolean };

export type StrokeStyle = {
  color?: string;
  width?: number;
  type?: 'solid' | 'dashed' | 'dotted';
  hidden?: boolean;
  tick?: TickLevel;
};

export type AngleStyle = StrokeStyle & {
  fill?: string;
  arcCount?: number;
  right?: boolean;
  exterior?: boolean;
  arcRadiusOffset?: number;
};

export type Label = {
  text: string;
  textStyles?: LabelTextStyleRange[];
  offset?: { x: number; y: number };
  color?: string;
  hidden?: boolean;
  fontSize?: number;
  seq?: LabelSeq;
  textAlign?: LabelAlignment;
};

export type CopiedStyle = {
  sourceType: 'point' | 'line' | 'circle' | 'angle' | 'polygon' | 'ink' | 'label';
  color?: string;
  width?: number;
  type?: 'solid' | 'dashed' | 'dotted';
  size?: number;
  fontSize?: number;
  arcCount?: number;
  right?: boolean;
  fill?: string;
  fillOpacity?: number | null;
  shadowOpacity?: number | null;
  arcRadiusOffset?: number;
  baseWidth?: number;
  tick?: TickLevel;
};

export type FreeLabel = {
  /** Pin an explanatory label to the upper-left of the visible canvas. */
  viewportAnchor?: 'top-left';
  symmetry?: ObjectSymmetry;
  measurement?: BoundMeasurement;
  text: string;
  textStyles?: LabelTextStyleRange[];
  pos: { x: number; y: number };
  color?: string;
  hidden?: boolean;
  fontSize?: number;
  seq?: LabelSeq;
  textAlign?: LabelAlignment;
};

export type BoundMeasurement = (
  | { kind: 'segment'; lineId: ObjectId; points: [ObjectId,ObjectId]; scale: number }
  | { kind: 'angle'; angleId: ObjectId }
) & { offset: { x: number; y: number } };

export type InkPoint = {
  breakBefore?: boolean;
  x: number;
  y: number;
  pressure: number;
  time: number;
};

export type InkStrokeRuntime = {
  symmetry?: ObjectSymmetry;
  id: string;
  points: InkPoint[];
  color: string;
  baseWidth: number;
  hidden?: boolean;
  opacity?: number;
};

export type ConstructionParent = { kind: 'line' | 'circle' | 'point'; id: ObjectId };
export type LineConstructionKind = 'free' | 'parallel' | 'perpendicular';
export type PointConstructionKind = 'free' | 'on_object' | 'intersection' | 'midpoint' | 'bisect' | 'symmetric' | 'common-tangent';

export type MidpointMeta = {
  parents: [ObjectId, ObjectId];
  parentLineId?: ObjectId | null;
};

export type BisectSegmentRef = {
  lineId: ObjectId;
  a: ObjectId;
  b: ObjectId;
};

export type BisectMeta = {
  vertex: ObjectId;
  exterior?: boolean;
  epsilon?: number;
} & ({ arms: [AngleArm, AngleArm]; seg1?: never; seg2?: never } |
  { arms?: never; seg1: BisectSegmentRef; seg2: BisectSegmentRef });

export type BisectorLineMeta = { vertex: ObjectId; bisectPoint: ObjectId };

export type SymmetricMeta = {
  source: ObjectId;
  mirror: { kind: 'point' | 'line' | 'circle'; id: ObjectId };
};

export type SymmetryCollection = 'points' | 'lines' | 'circles' | 'angles' | 'polygons' | 'inkStrokes' | 'labels';
export type ObjectSymmetry = {
  source: { collection: SymmetryCollection; id: ObjectId };
  mirror: SymmetricMeta['mirror'];
  batch: string;
  helper?: boolean;
  /** Subdivision points of a reflected line with independent computational endpoints. */
  linePoints?: ObjectId[];
};

export type ParallelLineMeta = {
  throughPoint: ObjectId;
  referenceLine: ObjectId;
  helperPoint: ObjectId;
  helperDistance?: number;
};

export type PerpendicularLineMeta = {
  throughPoint: ObjectId;
  referenceLine?: ObjectId;
  referencePoints?: [ObjectId, ObjectId];
  helperPoint: ObjectId;
  helperDistance?: number;
  helperOrientation?: 1 | -1;
  helperMode?: 'projection' | 'normal';
  /** Use the ordered reference points as a segment whose perpendicular bisector is this line. */
  directBisector?: true;
};

export type BoundaryIntersectionParent = { kind: 'line' | 'polygon'; id: ObjectId };
export type BoundaryIntersectionSet = {
  parents: [BoundaryIntersectionParent, BoundaryIntersectionParent];
  outputs: ObjectId[];
};
export type BoundaryIntersectionSlot = { setId: ObjectId; index: number; topologyLines?: ObjectId[] };

export interface PointRuntime {
  inversionHelper?: import('./inversionGeometry').InversionHelper;
  symmetry?: ObjectSymmetry;
  commonTangent?: import('./tangentGeometry').CommonTangentContact;
  spatial?: SpatialPointDefinition;
  spatialPosition?: Vec3;
  spatialDepth?: number;
  spatialHiddenPoint?: boolean;
  id: ObjectId;
  geometryValid?: boolean;
  x: number;
  y: number;
  style: PointStyle;
  label?: Label;
  hidden?: boolean;
  object_type?: GeoObjectType;
  recompute?: (ctx: GeometryContext) => void;
  on_parent_deleted?: (parentId: ObjectId, ctx: GeometryContext) => void;
  construction_kind?: string;
  defining_parents?: ObjectId[];
  parent_refs?: ConstructionParent[];
  parallel_helper_for?: ObjectId;
  perpendicular_helper_for?: ObjectId;
  /** Computational direction endpoint owned by a line, not a user-hidden marker. */
  auxiliaryFor?: ObjectId;
  created_group?: string;
  midpointMeta?: MidpointMeta;
  bisectMeta?: BisectMeta;
  symmetricMeta?: SymmetricMeta;
  boundaryIntersectionSet?: BoundaryIntersectionSet;
  boundaryIntersectionSlot?: BoundaryIntersectionSlot;
}

export interface LineRuntime {
  inversion?: import('./inversionGeometry').InversionCurve;
  symmetry?: ObjectSymmetry;
  spatialHiddenEdge?: boolean;
  spatialSectionActive?: boolean;
  spatialParameters?: Record<ObjectId, number>;
  id: ObjectId;
  geometryValid?: boolean;
  points: ObjectId[];
  defining_points: [ObjectId, ObjectId];
  style: StrokeStyle;
  segmentStyles?: StrokeStyle[];
  segmentKeys?: string[];
  leftRay?: StrokeStyle;
  rightRay?: StrokeStyle;
  label?: Label;
  hidden?: boolean;
  object_type?: GeoObjectType;
  recompute?: (ctx: GeometryContext) => void;
  on_parent_deleted?: (parentId: ObjectId, ctx: GeometryContext) => void;
  construction_kind?: string;
  defining_parents?: ObjectId[];
  parallel?: ParallelLineMeta;
  perpendicular?: PerpendicularLineMeta;
  bisector?: BisectorLineMeta;
}

export interface CircleRuntime {
  inversion?: import('./inversionGeometry').InversionCurve;
  symmetry?: ObjectSymmetry;
  compassSource?: import('./circleGeometry').CompassDistanceSource;
  id: ObjectId;
  geometryValid?: boolean;
  center: ObjectId;
  radius_point?: ObjectId;
  points: ObjectId[];
  defining_points: [ObjectId, ObjectId, ObjectId];
  style: StrokeStyle;
  fill?: string;
  fillOpacity?: number;
  arcStyles?: StrokeStyle[] | Record<string, StrokeStyle>;
  label?: Label;
  hidden?: boolean;
  object_type?: GeoObjectType;
  recompute?: (ctx: GeometryContext) => void;
  on_parent_deleted?: (parentId: ObjectId, ctx: GeometryContext) => void;
  construction_kind?: string;
  defining_parents?: ObjectId[];
  circle_kind?: 'center-radius' | 'three-point' | 'compass' | 'incircle';
}

export type AngleArm = { kind: 'point'; pointId: ObjectId } | { kind: 'line'; lineId: ObjectId; direction: 1 | -1 };

export interface AngleRuntime {
  symmetry?: ObjectSymmetry;
  spatial?: SpatialAngleDefinition;
  id: ObjectId;
  geometryValid?: boolean;
  vertex: ObjectId;
  point1?: ObjectId;
  point2?: ObjectId;
  arm1LineId?: ObjectId;
  arm2LineId?: ObjectId;
  arm1?: AngleArm;
  arm2?: AngleArm;
  style: AngleStyle;
  label?: Label;
  hidden?: boolean;
  object_type?: GeoObjectType;
  recompute?: (ctx: GeometryContext) => void;
  on_parent_deleted?: (parentId: ObjectId, ctx: GeometryContext) => void;
  construction_kind?: string;
  defining_parents?: ObjectId[];
}

export type PolygonLockRef = {
  base: [ObjectId, ObjectId];
  coords: Array<{ id: ObjectId; u: number; v: number }>;
};

export interface PolygonRuntime {
  inversionRegion?: import('./inversionGeometry').InversionRegion;
  symmetry?: ObjectSymmetry;
  solidFace?: {solidId:ObjectId;axis:0|1|2;side:0|1;index?:number};
  spatialSection?: SpatialSectionDefinition;
  solidBackFace?: boolean;
  spatialGroupId?: ObjectId;
  id: ObjectId;
  geometryValid?: boolean;
  points: ObjectId[];
  fill?: string;
  fillOpacity?: number;
  hidden?: boolean;
  object_type?: GeoObjectType;
  recompute?: (ctx: GeometryContext) => void;
  on_parent_deleted?: (parentId: ObjectId, ctx: GeometryContext) => void;
  construction_kind?: string;
  defining_parents?: ObjectId[];
  locked?: boolean;
  lockRef?: PolygonLockRef;
}

export interface LabelRuntime extends FreeLabel {
  id: string;
}

export type ObjectGroup = {
  id: ObjectId;
  members: Partial<Record<'points' | 'lines' | 'circles' | 'angles' | 'polygons' | 'inkStrokes' | 'labels', ObjectId[]>>;
  locked?: boolean;
};

export interface ConstructionRuntime {
  objectGroups?: Record<ObjectId, ObjectGroup>;
  solids?: Record<ObjectId, Cuboid>;
  spatialGroups?: Record<ObjectId, SpatialGroup>;
  points: Record<ObjectId, PointRuntime>;
  lines: Record<ObjectId, LineRuntime>;
  circles: Record<ObjectId, CircleRuntime>;
  angles: Record<ObjectId, AngleRuntime>;
  polygons: Record<ObjectId, PolygonRuntime>;
  labels: Record<string, LabelRuntime>;
  inkStrokes: Record<string, InkStrokeRuntime>;
  measurementReference?: { lineId: ObjectId; segIdx: number };
  measurementReferenceValue?: number | null;
  idCounters: {
    point: number;
    line: number;
    circle: number;
    angle: number;
    polygon: number;
  };
}

export type GeometryContext = { runtime: ConstructionRuntime };

export type Point = PointRuntime;
export type Line = LineRuntime;
export type Circle = CircleRuntime;
export type Angle = AngleRuntime;
export type Polygon = PolygonRuntime;
export type InkStroke = InkStrokeRuntime;

export type CircleWithCenter = CircleRuntime & { circle_kind?: 'center-radius' };
export type CircleThroughPoints = CircleRuntime & {
  circle_kind?: 'three-point';
  defining_points?: [ObjectId, ObjectId, ObjectId];
};

export type MidpointPoint = PointRuntime & { construction_kind?: 'midpoint'; midpointMeta?: MidpointMeta };
export type BisectPoint = PointRuntime & { construction_kind?: 'bisect'; bisectMeta?: BisectMeta };
export type SymmetricPoint = PointRuntime & { construction_kind?: 'symmetric'; symmetricMeta?: SymmetricMeta };

export type MeasurementLabel = {
  id: string;
  kind: 'segment' | 'angle';
  targetId: string;
  pos: { x: number; y: number };
  pinned: boolean;
  color?: string;
  fontSize?: number;
};

// Used by main UI flow.
export function makeEmptyRuntime(): ConstructionRuntime {
  return {
    points: {},
    lines: {},
    circles: {},
    angles: {},
    polygons: {},
    labels: {},
    inkStrokes: {},
    idCounters: { point: 0, line: 0, circle: 0, angle: 0, polygon: 0 }
  };
}
