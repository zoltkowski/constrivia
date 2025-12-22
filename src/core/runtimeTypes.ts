export type ObjectId = string | number;

export type TickLevel = 0 | 1 | 2 | 3;

export type GeometryKind = 'point' | 'line' | 'circle' | 'angle' | 'polygon';
export type GeoObjectType = GeometryKind;

export type LabelAlignment = 'left' | 'center';

export type LabelSeq = { kind: 'upper' | 'lower' | 'greek'; idx: number };

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
  offset?: { x: number; y: number };
  color?: string;
  hidden?: boolean;
  fontSize?: number;
  seq?: LabelSeq;
  textAlign?: LabelAlignment;
};

export type CopiedStyle = {
  sourceType: 'point' | 'line' | 'circle' | 'angle' | 'ink' | 'label';
  color?: string;
  width?: number;
  type?: 'solid' | 'dashed' | 'dotted';
  size?: number;
  fontSize?: number;
  arcCount?: number;
  right?: boolean;
  fill?: string;
  arcRadiusOffset?: number;
  baseWidth?: number;
  tick?: TickLevel;
};

export type FreeLabel = {
  text: string;
  pos: { x: number; y: number };
  color?: string;
  hidden?: boolean;
  fontSize?: number;
  seq?: LabelSeq;
  textAlign?: LabelAlignment;
};

export type InkPoint = {
  x: number;
  y: number;
  pressure: number;
  time: number;
};

export type InkStrokeRuntime = {
  id: string;
  points: InkPoint[];
  color: string;
  baseWidth: number;
  hidden?: boolean;
  opacity?: number;
};

export type ConstructionParent = { kind: 'line' | 'circle' | 'point'; id: ObjectId };
export type LineConstructionKind = 'free' | 'parallel' | 'perpendicular';
export type PointConstructionKind = 'free' | 'on_object' | 'intersection' | 'midpoint' | 'bisect' | 'symmetric';

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
  seg1: BisectSegmentRef;
  seg2: BisectSegmentRef;
  epsilon?: number;
};

export type SymmetricMeta = {
  source: ObjectId;
  mirror: { kind: 'point' | 'line'; id: ObjectId };
};

export type ParallelLineMeta = {
  throughPoint: ObjectId;
  referenceLine: ObjectId;
  helperPoint: ObjectId;
};

export type PerpendicularLineMeta = {
  throughPoint: ObjectId;
  referenceLine: ObjectId;
  helperPoint: ObjectId;
  helperDistance?: number;
  helperOrientation?: 1 | -1;
  helperMode?: 'projection' | 'normal';
};

export interface PointRuntime {
  id: ObjectId;
  x: number;
  y: number;
  constructionKind?: string;
  parents?: ObjectId[];
  style: PointStyle;
  label?: Label;
  hidden?: boolean;
  object_type?: GeoObjectType;
  recompute?: (ctx: GeometryContext) => void;
  on_parent_deleted?: (parentId: ObjectId, ctx: GeometryContext) => void;
  // legacy/compat fields (to be removed once refactor completes)
  construction_kind?: string;
  defining_parents?: ObjectId[];
  parent_refs?: ConstructionParent[];
  parallel_helper_for?: ObjectId;
  perpendicular_helper_for?: ObjectId;
  created_group?: string;
  midpointMeta?: MidpointMeta;
  bisectMeta?: BisectMeta;
  symmetricMeta?: SymmetricMeta;
  // legacy aliases for transition
  midpoint?: MidpointMeta;
  bisect?: BisectMeta;
  symmetric?: SymmetricMeta;
}

export interface LineRuntime {
  id: ObjectId;
  definingPoints: Array<ObjectId | number>;
  pointIds?: Array<ObjectId | number>;
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
  constructionKind?: string;
  // legacy/compat fields (to be removed once refactor completes)
  construction_kind?: string;
  defining_parents?: ObjectId[];
  points: Array<ObjectId | number>;
  defining_points: [ObjectId | number, ObjectId | number];
  parallel?: ParallelLineMeta;
  perpendicular?: PerpendicularLineMeta;
}

export interface CircleRuntime {
  id: ObjectId;
  center: ObjectId | number;
  radiusPoint?: ObjectId | number;
  pointIds?: Array<ObjectId | number>;
  definingPoints3?: [ObjectId | number, ObjectId | number, ObjectId | number];
  style: StrokeStyle;
  fill?: string;
  fillOpacity?: number;
  arcStyles?: StrokeStyle[] | Record<string, StrokeStyle>;
  label?: Label;
  hidden?: boolean;
  object_type?: GeoObjectType;
  recompute?: (ctx: GeometryContext) => void;
  on_parent_deleted?: (parentId: ObjectId, ctx: GeometryContext) => void;
  circleKind?: 'center-radius' | 'three-point';
  // legacy/compat fields (to be removed once refactor completes)
  construction_kind?: string;
  defining_parents?: ObjectId[];
  circle_kind?: 'center-radius' | 'three-point';
  points: Array<ObjectId | number>;
  defining_points: Array<ObjectId | number>;
  radius_point?: ObjectId | number;
}

export interface AngleRuntime {
  id: ObjectId;
  vertex: ObjectId | number;
  point1?: ObjectId | number;
  point2?: ObjectId | number;
  arm1LineId?: ObjectId;
  arm2LineId?: ObjectId;
  style: AngleStyle;
  label?: Label;
  hidden?: boolean;
  object_type?: GeoObjectType;
  recompute?: (ctx: GeometryContext) => void;
  on_parent_deleted?: (parentId: ObjectId, ctx: GeometryContext) => void;
  // legacy/compat fields (to be removed once refactor completes)
  construction_kind?: string;
  defining_parents?: ObjectId[];
}

export interface PolygonRuntime {
  id: ObjectId;
  vertices?: Array<ObjectId | number>;
  edgeLines?: (ObjectId | undefined)[];
  fill?: string;
  fillOpacity?: number;
  hidden?: boolean;
  object_type?: GeoObjectType;
  recompute?: (ctx: GeometryContext) => void;
  on_parent_deleted?: (parentId: ObjectId, ctx: GeometryContext) => void;
  // legacy/compat fields (to be removed once refactor completes)
  construction_kind?: string;
  defining_parents?: ObjectId[];
  points: Array<ObjectId | number>;
}

export interface LabelRuntime extends FreeLabel {
  id: string;
}

export interface ConstructionRuntime {
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

export type GeometryContext = { model: ConstructionRuntime };

export type Point = PointRuntime;
export type Line = LineRuntime;
export type Circle = CircleRuntime;
export type Angle = AngleRuntime;
export type Polygon = PolygonRuntime;
export type InkStroke = InkStrokeRuntime;

export type CircleWithCenter = CircleRuntime & { circleKind?: 'center-radius'; circle_kind?: 'center-radius' };
export type CircleThroughPoints = CircleRuntime & {
  circleKind?: 'three-point';
  circle_kind?: 'three-point';
  definingPoints3?: [ObjectId | number, ObjectId | number, ObjectId | number];
  defining_points?: [ObjectId | number, ObjectId | number, ObjectId | number];
};

export type MidpointPoint = PointRuntime & { constructionKind?: 'midpoint'; construction_kind?: 'midpoint'; midpointMeta?: MidpointMeta };
export type BisectPoint = PointRuntime & { constructionKind?: 'bisect'; construction_kind?: 'bisect'; bisectMeta?: BisectMeta };
export type SymmetricPoint = PointRuntime & { constructionKind?: 'symmetric'; construction_kind?: 'symmetric'; symmetricMeta?: SymmetricMeta };

export type MeasurementLabel = {
  id: string;
  kind: 'segment' | 'angle';
  targetId: string;
  pos: { x: number; y: number };
  pinned: boolean;
  color?: string;
  fontSize?: number;
};

export type Model = {
  points: PointRuntime[];
  lines: LineRuntime[];
  circles: CircleRuntime[];
  angles: AngleRuntime[];
  polygons: PolygonRuntime[];
  inkStrokes: InkStrokeRuntime[];
  labels: FreeLabel[];
  idCounters: Record<GeometryKind, number>;
  indexById: Record<GeometryKind, Record<string, number>>;
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
