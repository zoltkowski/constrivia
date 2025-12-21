export type PointStyle = { color: string; size: number; hidden?: boolean; hollow?: boolean };

export type MidpointMeta = {
  parents: [string, string];
  parentLineId?: string | null;
};

export type BisectSegmentRef = {
  lineId: string;
  a: string;
  b: string;
};

export type BisectMeta = {
  vertex: string;
  seg1: BisectSegmentRef;
  seg2: BisectSegmentRef;
  epsilon?: number;
};

export type SymmetricMeta = {
  source: string;
  mirror: { kind: 'point'; id: string } | { kind: 'line'; id: string };
};

export type ParallelLineMeta = {
  throughPoint: string;
  referenceLine: string;
  helperPoint: string;
};

export type PerpendicularLineMeta = {
  throughPoint: string;
  referenceLine: string;
  helperPoint: string;
  helperDistance?: number;
  helperOrientation?: 1 | -1;
  helperMode?: 'projection' | 'normal';
};

export type LineConstructionKind = 'free' | 'parallel' | 'perpendicular';

export type GeometryKind = 'point' | 'line' | 'circle' | 'angle' | 'polygon';
export type GeoObjectType = GeometryKind;

export type GeometryContext = { model: Model };

export type StrokeStyle = {
  color: string;
  width: number;
  type: 'solid' | 'dashed' | 'dotted';
  hidden?: boolean;
  tick?: 0 | 1 | 2 | 3;
};

export type AngleStyle = {
  color: string;
  width: number;
  type: 'solid' | 'dashed' | 'dotted';
  fill?: string;
  arcCount?: number;
  right?: boolean;
  exterior?: boolean;
  hidden?: boolean;
  arcRadiusOffset?: number;
  tick?: 0 | 1 | 2 | 3;
};

export type LabelAlignment = 'left' | 'center';

export type Label = {
  text: string;
  offset?: { x: number; y: number };
  color?: string;
  hidden?: boolean;
  fontSize?: number;
  seq?: { kind: 'upper' | 'lower' | 'greek'; idx: number };
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
  tick?: 0 | 1 | 2 | 3;
};

export type FreeLabel = {
  text: string;
  pos: { x: number; y: number };
  color?: string;
  hidden?: boolean;
  fontSize?: number;
  seq?: Label['seq'];
  textAlign?: LabelAlignment;
};

export type MeasurementLabel = {
  id: string;
  kind: 'segment' | 'angle';
  targetId: string;
  pos: { x: number; y: number };
  pinned: boolean;
  color?: string;
  fontSize?: number;
};

export type ConstructionParent = { kind: 'line' | 'circle' | 'point'; id: string };
export type PointConstructionKind = 'free' | 'on_object' | 'intersection' | 'midpoint' | 'bisect' | 'symmetric';

export interface GeoObject {
  id: string;
  object_type: GeoObjectType;
  construction_kind: string;
  defining_parents: string[];
  recompute(ctx: GeometryContext): void;
  on_parent_deleted(parent_id: string, ctx: GeometryContext): void;
}

export type Point = GeoObject & {
  object_type: 'point';
  x: number;
  y: number;
  style: PointStyle;
  label?: Label;
  construction_kind: PointConstructionKind;
  parent_refs: ConstructionParent[];
  midpoint?: MidpointMeta;
  bisect?: BisectMeta;
  symmetric?: SymmetricMeta;
  parallel_helper_for?: string;
  perpendicular_helper_for?: string;
  created_group?: string;
};

export type MidpointPoint = Point & { construction_kind: 'midpoint'; midpoint: MidpointMeta };
export type BisectPoint = Point & { construction_kind: 'bisect'; bisect: BisectMeta };
export type SymmetricPoint = Point & { construction_kind: 'symmetric'; symmetric: SymmetricMeta };

export type Line = GeoObject & {
  object_type: 'line';
  points: number[];
  defining_points: [number, number];
  segmentStyles?: StrokeStyle[];
  segmentKeys?: string[];
  leftRay?: StrokeStyle;
  rightRay?: StrokeStyle;
  style: StrokeStyle;
  label?: Label;
  hidden?: boolean;
  construction_kind: LineConstructionKind;
  parallel?: ParallelLineMeta;
  perpendicular?: PerpendicularLineMeta;
};

export type InkPoint = {
  x: number;
  y: number;
  pressure: number;
  time: number;
};

export type InkStroke = {
  id: string;
  points: InkPoint[];
  color: string;
  baseWidth: number;
  hidden?: boolean;
  opacity?: number;
};

export type CircleBase = GeoObject & {
  object_type: 'circle';
  center: number;
  radius_point: number;
  points: number[];
  style: StrokeStyle;
  fill?: string;
  fillOpacity?: number;
  arcStyles?: StrokeStyle[];
  label?: Label;
  hidden?: boolean;
};

export type CircleWithCenter = CircleBase & { circle_kind: 'center-radius' };
export type CircleThroughPoints = CircleBase & { circle_kind: 'three-point'; defining_points: [number, number, number] };
export type Circle = CircleWithCenter | CircleThroughPoints;

export type Angle = GeoObject & {
  object_type: 'angle';
  // New canonical representation: three points (indices into model.points)
  point1?: number; // one arm point
  vertex: number; // vertex point
  point2?: number; // other arm point
  // Runtime canonical arm line IDs (preferred over legacy numeric leg refs)
  arm1LineId?: string;
  arm2LineId?: string;
  // Note: runtime and persisted payloads prefer id-based arm fields
  // (`arm1LineId`/`arm2LineId`) and `point1`/`point2` when possible.
  // The internal `Model` still uses numeric point indices in many
  // places; conversion helpers map between index-based `Model` and
  // id-based runtime representations during the migration.
  style: AngleStyle;
  label?: Label;
  hidden?: boolean;
};

export type Polygon = GeoObject & {
  object_type: 'polygon';
  lines: number[];
  fill?: string;
  fillOpacity?: number;
  hidden?: boolean;
};

export type Model = {
  points: Point[];
  lines: Line[];
  circles: Circle[];
  angles: Angle[];
  polygons: Polygon[];
  inkStrokes: InkStroke[];
  labels: FreeLabel[];
  idCounters: Record<GeometryKind, number>;
  indexById: Record<GeometryKind, Record<string, number>>;
};

export type TickLevel = 0 | 1 | 2 | 3;

export type LabelSeq = NonNullable<Label['seq']>;
