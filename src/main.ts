import { initCloudPanel, initCloudUI, initCloudSaveUI, closeCloudPanel } from './files';
import { setupConfigPane } from './configPane';
import { HINTS, setLanguage, getLanguage, applyUILanguage } from './i18n';
import type { LoadedFileResult } from './files';
import type {
  BisectMeta,
  SymmetricMeta,
  ParallelLineMeta,
  PerpendicularLineMeta,
  LineConstructionKind,
  GeometryKind,
  GeoObjectType,
  GeometryContext,
  StrokeStyle,
  AngleStyle,
  Label,
  CopiedStyle,
  FreeLabel,
  MeasurementLabel,
  LabelAlignment,
  TickLevel,
  BisectSegmentRef,
  LabelSeq,
  Point,
  Line,
  Circle,
  Angle,
  Polygon,
  Model,
  CircleWithCenter,
  CircleThroughPoints,
  MidpointPoint,
  BisectPoint,
  SymmetricPoint,
  PointStyle,
  MidpointMeta,
  ConstructionParent,
  PointConstructionKind,
  InkStroke,
  InkPoint
} from './types';
import type {
  PersistedPoint,
  PersistedLine,
  PersistedCircle,
  PersistedAngle,
  PersistedPolygon,
  PersistedModel,
  PersistedDocument
} from './persisted/persistedTypes';
import {
  resizeCanvasElement,
  initCanvasRenderer,
  drawDiagonalHandle,
  drawRotateIcon,
  drawSegmentTicks,
  drawArcTicks,
  drawCircleTicks,
  renderInkStroke,
  autoAddBraces,
  measureFormattedText,
  renderFormattedText
  , getLabelScreenDimensions, drawLabelText
  , drawDebugLabelsCanvas
  , renderPolygonsAndLines
  , renderCirclesAndArcs
  , renderAngles
  , renderPoints
  , renderFreeLabels
  , renderMeasurementLabels
  , renderGrid
  , renderMultiselectBox
  , renderMultiselectOverlays
  , renderInteractionHelpers
  , makeApplySelectionStyle
} from './canvas/renderer';
import { recomputeIntersectionPointEngineById, polygonVerticesFromPoly, polygonVerticesOrderedFromPoly, polygonVerticesFromPolyRuntime, polygonVerticesOrderedFromPolyRuntime, findSegmentIndexPure, getVertexOnLegPure, angleBaseGeometryPure, segmentKeyForPointsPure, findLineIndexForSegmentPure, findLineIndexForSegmentFromArrays, reorderLinePointsPure, projectPointOnSegment as engineProjectPointOnSegment, projectPointOnLine as engineProjectPointOnLine, lineCircleIntersections as engineLineCircleIntersections, circleCircleIntersections as engineCircleCircleIntersections, angleBaseGeometryRuntime, getVertexOnLegRuntime, reorderLinePointIdsRuntime, lineExtentRuntime, axisSnapWeight, clamp } from './core/engine';
import { recomputeLinePointsWithReferences } from './core/lineProjection';
import { initDebugPanel, ensureDebugPanelPosition, endDebugPanelDrag, renderDebugPanel } from './debugPanel';
import { modelToRuntime } from './core/modelToRuntime';
import { initUi } from './ui/initUi';
import { uiRefs } from './ui/uiRefs';
import { selectionState, hasMultiSelection } from './state/selectionState';
import { interactionState, hasActiveInteraction } from './state/interactionState';
import { viewState } from './state/viewState';
import { initCanvasEvents } from './canvas/events';
import { makeCanvasHandlers, handlePointerRelease as handlersHandlePointerRelease, handleCanvasPointerMove, handlePointerMoveEarly, handlePointerMoveTransforms, handlePointerMoveCircle, handlePointerMoveLine } from './canvas/handlers';

// Label/font defaults and constraints
const LABEL_FONT_MIN = 8;
const LABEL_FONT_MAX = 48;
const LABEL_FONT_DEFAULT = 14;
const LABEL_FONT_STEP = 1;
const DEFAULT_LABEL_ALIGNMENT: LabelAlignment = 'left';

function getLabelFontDefault(): number {
  return LABEL_FONT_DEFAULT;
}

export const createEmptyModel = (): Model => ({
  points: [],
  lines: [],
  circles: [],
  angles: [],
  polygons: [],
  inkStrokes: [],
  labels: [],
  idCounters: {
    point: 0,
    line: 0,
    circle: 0,
    angle: 0,
    polygon: 0
  },
  indexById: {
    point: {},
    line: {},
    circle: {},
    angle: {},
    polygon: {}
  }
});

const ID_PREFIX: Record<GeometryKind, string> = {
  point: 'pt',
  line: 'ln',
  circle: 'c',
  angle: 'ang',
  polygon: 'poly'
};
const LABEL_PREFIX: Record<GeometryKind, string> = {
  point: 'P',
  line: 'L',
  circle: 'O',
  angle: '∠',
  polygon: 'W'
};

const segmentKeyForPoints = (aIdx: number, bIdx: number) => {
  try {
    const rt = runtime;
    const aId = model.points[aIdx]?.id;
    const bId = model.points[bIdx]?.id;
    if (aId && bId) return aId < bId ? `${aId}-${bId}` : `${bId}-${aId}`;
  } catch {}
  return segmentKeyForPointsPure(model.points, aIdx, bIdx);
};

function findLineIndexForSegment(aIdx: number, bIdx: number): number | null {
  try {
    const aId = model.points[aIdx]?.id;
    const bId = model.points[bIdx]?.id;
    if (aId && bId) {
      const byIdIdx = findLineIndexForSegmentFromArrays(model.points, model.lines, aId, bId);
      if (byIdIdx !== null) return byIdIdx;
    }
  } catch {}
  return findLineIndexForSegmentPure(model.points, model.lines, aIdx, bIdx);
}

function resolveLineRefIndex(ref: number | string | undefined): number | undefined {
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'string') return model.indexById?.line?.[ref];
  return undefined;
}

function getOrCreateLineBetweenPoints(aIdx: number, bIdx: number, style: StrokeStyle): number {
  const existing = findLineIndexForSegment(aIdx, bIdx);
  if (existing !== null) return existing;
  return addLineFromPoints(model, aIdx, bIdx, style);
}

function nextId(kind: GeometryKind, target: Model = model) {
  target.idCounters[kind] += 1;
  return `${ID_PREFIX[kind]}${target.idCounters[kind]}`;
}

function registerIndex(target: Model, kind: GeometryKind, id: string, idx: number) {
  target.indexById[kind][id] = idx;
}

function rebuildIndexMaps(target: Model = model) {
  target.indexById = {
    point: {},
    line: {},
    circle: {},
    angle: {},
    polygon: {}
  };
  target.points.forEach((p, i) => registerIndex(target, 'point', p.id, i));
  target.lines.forEach((l, i) => registerIndex(target, 'line', l.id, i));
  target.circles.forEach((c, i) => registerIndex(target, 'circle', c.id, i));
  target.angles.forEach((a, i) => registerIndex(target, 'angle', a.id, i));
  target.polygons.forEach((p, i) => registerIndex(target, 'polygon', p.id, i));
}

type PointInit = Omit<
  Point,
  | 'style'
  | 'construction_kind'
  | 'defining_parents'
  | 'id'
  | 'object_type'
  | 'parent_refs'
  | 'recompute'
  | 'on_parent_deleted'
> & {
  style?: PointStyle;
  construction_kind?: PointConstructionKind;
  defining_parents?: ConstructionParent[];
  id?: string;
  created_group?: string;
};

const normalizeParents = (parents?: ConstructionParent[]): ConstructionParent[] => {
  const res: ConstructionParent[] = [];
  parents?.forEach((p) => {
    if (!p) return;
    if (p.kind !== 'line' && p.kind !== 'circle') return;
    if (typeof p.id !== 'string' || !p.id.length) return;
    // Only keep up to two parents — if multiple objects intersect at one point,
    // pick the first two unique parents encountered.
    if (res.length >= 2) return;
    if (!res.some((r) => r.kind === p.kind && r.id === p.id)) res.push({ kind: p.kind, id: p.id });
  });
  
  
  return res;
};

const resolveConstructionKind = (
  parents: ConstructionParent[],
  explicit?: PointConstructionKind
): PointConstructionKind => {
  if (explicit) return explicit;
  if (parents.length >= 2) return 'intersection';
  if (parents.length === 1) return 'on_object';
  return 'free';
};

const isMidpointPoint = (point: Point | null | undefined): point is MidpointPoint =>
  !!point && point.construction_kind === 'midpoint' && (!!(point as any).midpoint || !!(point as any).midpointMeta);

const isBisectPoint = (point: Point | null | undefined): point is BisectPoint =>
  !!point && point.construction_kind === 'bisect' && (!!(point as any).bisect || !!(point as any).bisectMeta);

const isSymmetricPoint = (point: Point | null | undefined): point is SymmetricPoint =>
  !!point && point.construction_kind === 'symmetric' && (!!(point as any).symmetric || !!(point as any).symmetricMeta);

function getMidpointMeta(point: Point): MidpointMeta | undefined {
  return (point as any).midpointMeta ?? (point as any).midpoint;
}

function getBisectMeta(point: Point): BisectMeta | undefined {
  return (point as any).bisectMeta ?? (point as any).bisect;
}

function getSymmetricMeta(point: Point): SymmetricMeta | undefined {
  return (point as any).symmetricMeta ?? (point as any).symmetric;
}

const isPointDraggable = (point: Point | null | undefined): boolean => {
  if (!point) return false;
  if (point.construction_kind === 'intersection') return false;
  if (point.construction_kind === 'midpoint') return false;
  if (point.construction_kind === 'bisect') return false;
  if (point.construction_kind === 'symmetric') return false;
  
  // Check if point is center of a three-point circle (computed center, not draggable)
  const pointIdx = model.points.indexOf(point);
  if (pointIdx >= 0) {
    const isThreePointCenter = model.circles.some(c => 
      isCircleThroughPoints(c) && c.center === pointIdx
    );
    if (isThreePointCenter) return false;
  }
  
  return true;
};

const isDefiningPointOfLine = (pointIdx: number, lineIdx: number): boolean => {
  const line = model.lines[lineIdx];
  return !!line && line.defining_points.includes(pointIdx);
};

type ParallelLine = Line & { construction_kind: 'parallel'; parallel: ParallelLineMeta };
type PerpendicularLine = Line & { construction_kind: 'perpendicular'; perpendicular: PerpendicularLineMeta };

const isParallelLine = (line: Line | null | undefined): line is ParallelLine =>
  !!line && line.construction_kind === 'parallel' && !!line.parallel;

const isPerpendicularLine = (line: Line | null | undefined): line is PerpendicularLine =>
  !!line && line.construction_kind === 'perpendicular' && !!line.perpendicular;

const isLineDraggable = (line: Line | null | undefined): boolean =>
  !line ||
  ((line.construction_kind !== 'parallel' && line.construction_kind !== 'perpendicular') && !(line as any)?.bisector);

export const addPoint = (model: Model, p: PointInit): number => {
  const { style: maybeStyle, construction_kind, defining_parents, id, ...rest } = p;
  const style: PointStyle = maybeStyle ?? { color: '#ffffff', size: 4 };
  const parents = normalizeParents(defining_parents);
  const pid = id ?? nextId('point', model);
  const point: Point = {
    object_type: 'point',
    id: pid,
    ...rest,
    style,
    defining_parents: parents.map((pr) => pr.id),
    parent_refs: parents,
    construction_kind: resolveConstructionKind(parents, construction_kind),
    recompute: () => {},
    on_parent_deleted: () => {}
  };
  model.points.push(point);
  registerIndex(model, 'point', pid, model.points.length - 1);
  return model.points.length - 1;
};

export const addLineFromPoints = (model: Model, a: number, b: number, style: StrokeStyle): number => {
  const id = nextId('line', model);
  const line: Line = {
    object_type: 'line',
    id,
    points: [a, b],
    defining_points: [a, b],
    segmentStyles: [style],
    segmentKeys: [segmentKeyForPoints(a, b)],
    style,
    leftRay: { ...style, hidden: true },
    rightRay: { ...style, hidden: true },
    construction_kind: 'free',
    defining_parents: [],
    recompute: () => {},
    on_parent_deleted: () => {}
  };
    model.lines.push(line);
  registerIndex(model, 'line', id, model.lines.length - 1);
  return model.lines.length - 1;
};

// Circle/Angle/Polygon/Ink types are imported from ./types

const isCircleThroughPoints = (circle: Circle): circle is CircleThroughPoints => circle.circle_kind === 'three-point';

const circleDefiningPoints = (circle: Circle): number[] => (isCircleThroughPoints(circle) ? circle.defining_points : []);

const circlePerimeterPoints = (circle: Circle): number[] => {
  const result: number[] = [];
  const seen = new Set<number>();
  const pushUnique = (idx: number) => {
    if (idx === circle.center) return;
    if (!seen.has(idx)) {
      seen.add(idx);
      result.push(idx);
    }
  };
  pushUnique(circle.radius_point);
  circle.points.forEach(pushUnique);
  circleDefiningPoints(circle).forEach(pushUnique);
  return result;
};

const circleRadius = (circle: Circle): number => {
  const center = model.points[circle.center];
  const radiusPt = model.points[circle.radius_point];
  if (!center || !radiusPt) return 0;
  return Math.hypot(radiusPt.x - center.x, radiusPt.y - center.y);
};

const circleRadiusVector = (circle: Circle): { x: number; y: number } | null => {
  const center = model.points[circle.center];
  const radiusPt = model.points[circle.radius_point];
  if (!center || !radiusPt) return null;
  return { x: radiusPt.x - center.x, y: radiusPt.y - center.y };
};

const circleHasDefiningPoint = (circle: Circle, pointIdx: number): boolean =>
  isCircleThroughPoints(circle) && circle.defining_points.includes(pointIdx);

type Mode =
  | 'move'
  | 'add'
  | 'segment'
  | 'parallel'
  | 'perpendicular'
  | 'circle'
  | 'circleThree'
  | 'triangleUp'
  | 'square'
  | 'polygon'
  | 'angle'
  | 'bisector'
  | 'bisectPoint'
  | 'midpoint'
  | 'intersection'
  | 'symmetric'
  | 'parallelLine'
  | 'tangent'
  | 'perpBisector'
  | 'ngon'
  | 'label'
  | 'handwriting'
  | 'multiselect';

const dpr = window.devicePixelRatio || 1;
const HIT_RADIUS = 16;
const HANDLE_SIZE = 16;
const HANDLE_HIT_PAD = 14; // extra touch tolerance in screen pixels
 
const DEFAULT_COLORS_DARK = ['#15a3ff', '#ff4d4f', '#22c55e', '#f59e0b', '#a855f7', '#0ea5e9'];
// Use the same default palette for light mode as for dark mode so the
// style menu offers consistent color choices across themes.
const DEFAULT_COLORS_LIGHT = ['#15a3ff', '#ff4d4f', '#22c55e', '#f59e0b', '#a855f7', '#0ea5e9'];
type ThemeName = 'dark' | 'light';
type SelectionLineStyle = 'auto' | 'dashed' | 'dotted';
type SelectionEffect = 'color' | 'halo';

type ThemeConfig = {
  palette: readonly string[];
  defaultStroke: string;
  highlight: string;
  selectionLineStyle: SelectionLineStyle;
  selectionEffect: SelectionEffect;
  selectionPointStyleSameAsLine: boolean;
  selectionPointRadius: number;
  preview: string;
  pointSize: number;
  lineWidth: number;
  angleStrokeWidth: number;
  angleDefaultRadius: number;
  midpointColor: string;
  bg: string;
  fontSize: number;
  highlightWidth: number;
  panel: string;
  panelBorder: string;
};

const THEME_PRESETS: Record<ThemeName, ThemeConfig> = {
  dark: {
    palette: DEFAULT_COLORS_DARK,
    defaultStroke: DEFAULT_COLORS_DARK[0],
    highlight: '#fbbf24',
    selectionLineStyle: 'auto',
    selectionEffect: 'color',
    selectionPointStyleSameAsLine: false,
    selectionPointRadius: 8,
    preview: '#22c55e',
    pointSize: 2,
    lineWidth: 2,
    angleStrokeWidth: 2,
    angleDefaultRadius: 28,
    midpointColor: '#9ca3af',
    bg: '#111827',
    fontSize: 12,
    highlightWidth: 1.5
    ,panel: '#111827ef',
    panelBorder: '#1f2937'
  },
  light: {
    palette: DEFAULT_COLORS_LIGHT,
    // Default stroke should be black in light theme
    defaultStroke: '#000000',
    // Use yellow for selection highlight in light theme (matching dark)
    highlight: '#fbbf24',
    selectionLineStyle: 'auto',
    selectionEffect: 'color',
    selectionPointStyleSameAsLine: false,
    selectionPointRadius: 8,
    preview: DEFAULT_COLORS_LIGHT[0],
    pointSize: 2,
    lineWidth: 2,
    angleStrokeWidth: 2,
    angleDefaultRadius: 28,
    midpointColor: '#737373',
    bg: '#ffffff',
    fontSize: 12,
    highlightWidth: 1.5
    // Use a white panel background for the light theme
    ,panel: '#ffffff',
    panelBorder: 'transparent'
  }
};

const THEME: ThemeConfig = { ...THEME_PRESETS.dark };
let currentTheme: ThemeName = 'dark';
const THEME_STORAGE_KEY = 'geometry.theme';
const SHOW_HIDDEN_STORAGE_KEY = 'geometry.showHidden';
const SHOW_HINTS_STORAGE_KEY = 'geometry.showHints';
const RECENT_COLORS_STORAGE_KEY = 'geometry.recentColors';

const normalizeThemeName = (value: string | null | undefined): ThemeName | null => {
  if (value === 'dark' || value === 'light') return value;
  if (value === 'default') return 'dark';
  if (value === 'eink') return 'light';
  return null;
};
if (typeof window !== 'undefined') {
  try {
    const storedTheme = normalizeThemeName(window.localStorage?.getItem(THEME_STORAGE_KEY));
    if (storedTheme) viewState.currentTheme = storedTheme;
  } catch {
    // ignore storage access issues
  }
}
const HIGHLIGHT_LINE = { color: THEME.highlight, width: 1.5, dash: [4, 4] as [number, number] };
const LABEL_HIT_RADIUS = 18;
const DEBUG_PANEL_MARGIN = { x: 12, y: 12 };
const DEBUG_PANEL_TOP_MIN = 56;

// Rendering and geometry constants (originally grouped near top)
const LABEL_PADDING_X = 8;
const LABEL_PADDING_Y = 6;

const RIGHT_ANGLE_MARK_MARGIN = 6;
const RIGHT_ANGLE_MARK_MIN = 8;
const RIGHT_ANGLE_MARK_MAX = 28;
const RIGHT_ANGLE_MARK_RATIO = 0.5;

const BISECT_POINT_DISTANCE = 48;
const BISECT_POINT_CREATION_DISTANCE = 8;

// Line snapping heuristics
const LINE_SNAP_SIN_ANGLE = Math.sin((6 * Math.PI) / 180); // ~6 degrees
const LINE_SNAP_INDICATOR_THRESHOLD = 0.6;

// Angle label / arc radius constants
const ANGLE_RADIUS_MARGIN = 8;
const ANGLE_MIN_RADIUS = 10;
const ANGLE_DEFAULT_RADIUS = THEME.angleDefaultRadius ?? 28;
const ANGLE_RADIUS_STEP = 4;
const ANGLE_RADIUS_EPSILON = 0.5;

// Label alignment icons (small SVG placeholders)
const LABEL_ALIGN_ICON_LEFT = '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="3" width="8" height="2" rx="1"/><rect x="1" y="7" width="12" height="2" rx="1"/><rect x="1" y="11" width="8" height="2" rx="1"/></svg>';
const LABEL_ALIGN_ICON_CENTER = '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="2" y="11" width="12" height="2" rx="1"/></svg>';

// Lightweight stub for axis-snapping application (keeps type-checking);
// full behavior originally in main.ts - restore later if desired.
function applyAxisSnapForMovedPoints(movedPoints: Set<number>) {
  // No-op stub: real implementation adjusts moved points to align with axis snaps.
}

// User-customizable theme overrides
type ThemeOverrides = Partial<ThemeConfig>;
const themeOverrides: Record<ThemeName, ThemeOverrides> = {
  dark: {},
  light: {}
};

// Load theme overrides from localStorage
const THEME_OVERRIDES_KEY = 'geometry.themeOverrides';
function loadThemeOverrides() {
  try {
    const stored = localStorage.getItem(THEME_OVERRIDES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.dark) themeOverrides.dark = parsed.dark;
      if (parsed.light) themeOverrides.light = parsed.light;
    }
  } catch {
    // ignore
  }
}

function saveThemeOverrides() {
  try {
    localStorage.setItem(THEME_OVERRIDES_KEY, JSON.stringify(themeOverrides));
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined') {
  loadThemeOverrides();
}

function applyThemeWithOverrides(theme: ThemeName) {
  const base = THEME_PRESETS[theme];
  const overrides = themeOverrides[theme];
  Object.assign(THEME, base, overrides);
  // Apply panel colors to CSS variables so modals/debug use the same panel color
  if (typeof document !== 'undefined') {
    try {
      const root = document.documentElement;
      const body = document.body;
      const panelVal = THEME.panel ?? base.panel;
      const panelBorderVal = THEME.panelBorder ?? base.panelBorder;
      root.style.setProperty('--panel', panelVal);
      root.style.setProperty('--panel-border', panelBorderVal);
      if (body) {
        body.style.setProperty('--panel', panelVal);
        body.style.setProperty('--panel-border', panelBorderVal);
      }
    } catch {}
  }
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let model: Model = createEmptyModel();
let runtime = modelToRuntime(model);

const clampLabelFontSize = (value: number) => clamp(value, LABEL_FONT_MIN, LABEL_FONT_MAX);
const normalizeLabelFontSize = (value?: number): number => {
  if (!Number.isFinite(value ?? NaN)) return LABEL_FONT_DEFAULT;
  const rounded = Math.round(value!);
  const snapped = LABEL_FONT_MIN + Math.round((rounded - LABEL_FONT_MIN) / LABEL_FONT_STEP) * LABEL_FONT_STEP;
  return clampLabelFontSize(snapped);
};
const normalizeLabelFontDelta = (value?: number): number => {
  if (!Number.isFinite(value ?? NaN)) return 0;
  const rounded = Math.round(value!);
  const snapped = Math.round(rounded / LABEL_FONT_STEP) * LABEL_FONT_STEP;
  return snapped;
};
const labelFontSizePx = (delta?: number, base: number = getLabelFontDefault()): number =>
  normalizeLabelFontSize(base + normalizeLabelFontDelta(delta));
const clampLabelFontDelta = (delta?: number, base: number = getLabelFontDefault()): number =>
  labelFontSizePx(delta, base) - base;
const normalizeLabelAlignment = (value?: string): LabelAlignment =>
  value === 'left' ? 'left' : DEFAULT_LABEL_ALIGNMENT;

const mergeParents = (existing: ConstructionParent[] = [], incoming: ConstructionParent[] = []) =>
  normalizeParents([...(existing ?? []), ...incoming]);

function applyPointConstruction(pointIdx: number, parents: ConstructionParent[]) {
  const point = model.points[pointIdx];
  if (!point) return;
  const merged = mergeParents(point.parent_refs, parents);
  const construction_kind = isMidpointPoint(point)
    ? 'midpoint'
    : isBisectPoint(point)
    ? 'bisect'
    : isSymmetricPoint(point)
    ? 'symmetric'
    : resolveConstructionKind(merged);
  model.points[pointIdx] = {
    ...point,
    parent_refs: merged,
    defining_parents: merged.map((p) => p.id),
    construction_kind
  };
}

let selectedPointIndex: number | null = null;
let selectedLineIndex: number | null = null;
let selectedCircleIndex: number | null = null;
let selectedAngleIndex: number | null = null;
let selectedPolygonIndex: number | null = null;
let selectedInkStrokeIndex: number | null = null;
let selectedLabel: { kind: 'point' | 'line' | 'angle' | 'free'; id: number } | null = null;
const selectedSegments = new Set<string>();
const selectedArcSegments = new Set<string>();

// Multi-selection
const multiSelectedPoints = new Set<number>();
const multiSelectedLines = new Set<number>();
const multiSelectedCircles = new Set<number>();
const multiSelectedAngles = new Set<number>();
const multiSelectedPolygons = new Set<string>();
const multiSelectedInkStrokes = new Set<number>();
const multiSelectedLabels = new Set<number>();
let multiselectBoxStart: { x: number; y: number } | null = null;
let multiselectBoxEnd: { x: number; y: number } | null = null;

let mode: Mode = 'move';
let segmentStartIndex: number | null = null;
let segmentStartTemporary = false;
let circleCenterIndex: number | null = null;
let triangleStartIndex: number | null = null;
let squareStartIndex: number | null = null;
let ngonSecondIndex: number | null = null;
let polygonChain: number[] = [];
let angleFirstLeg: { line: number; seg: number; a: number; b: number } | null = null;
let anglePoints: number[] = [];
let bisectorFirstLeg: { line: number; seg: number; a: number; b: number; vertex: number } | null = null;
let bisectPointVertexIndex: number | null = null;
let bisectPointFirstSeg: { line: number; seg: number } | null = null;
let midpointFirstIndex: number | null = null;
let symmetricSourceIndex: number | null = null;
let parallelAnchorPointIndex: number | null = null;
let parallelReferenceLineIndex: number | null = null;
let ngonSides = 9;
let currentPolygonLines: number[] = [];
let hoverPointIndex: number | null = null;
let strokeColorInput: HTMLInputElement | null = null;
let modeAddBtn: HTMLButtonElement | null = null;
let modeMoveBtn: HTMLButtonElement | null = null;
let modeMultiselectBtn: HTMLButtonElement | null = null;
let modeSegmentBtn: HTMLButtonElement | null = null;
let modeParallelBtn: HTMLButtonElement | null = null;
let modePerpBtn: HTMLButtonElement | null = null;
let modeCircleThreeBtn: HTMLButtonElement | null = null;
let modeTriangleBtn: HTMLButtonElement | null = null;
let modeSquareBtn: HTMLButtonElement | null = null;
let modePolygonBtn: HTMLButtonElement | null = null;
let modeAngleBtn: HTMLButtonElement | null = null;
let modeBisectorBtn: HTMLButtonElement | null = null;
// modeBisectPoint helper removed from toolbar
let modeMidpointBtn: HTMLButtonElement | null = null;
let modeSymmetricBtn: HTMLButtonElement | null = null;
let modeParallelLineBtn: HTMLButtonElement | null = null;
let modeTangentBtn: HTMLButtonElement | null = null;
let modePerpBisectorBtn: HTMLButtonElement | null = null;
let modeNgonBtn: HTMLButtonElement | null = null;
let modeIntersectionBtn: HTMLButtonElement | null = null;
let ngonModal: HTMLElement | null = null;
let ngonCloseBtn: HTMLButtonElement | null = null;
let ngonConfirmBtn: HTMLButtonElement | null = null;
let ngonInput: HTMLInputElement | null = null;
let ngonPresetButtons: HTMLButtonElement[] = [];
let modeLabelBtn: HTMLButtonElement | null = null;
let modeHandwritingBtn: HTMLButtonElement | null = null;
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };
let panStartOffset = { x: 0, y: 0 };
let pendingPanCandidate: { x: number; y: number } | null = null;
let zoomFactor = 1;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
type TouchPoint = { x: number; y: number };
const activeTouches = new Map<number, TouchPoint>();

type ActiveInkStroke = {
  pointerId: number;
  stroke: InkStroke;
};

const INK_BASE_WIDTH = 3;
let inkBaseWidth = INK_BASE_WIDTH;
const INK_PRESSURE_FALLBACK = 0.6;
const INK_MIN_SAMPLE_PX = 0.6;
let activeInkStroke: ActiveInkStroke | null = null;
type PinchState = {
  pointerIds: [number, number];
  initialDistance: number;
  initialZoom: number;
};
let pinchState: PinchState | null = null;
type CircleDragContext = {
  circleIdx: number;
  originals: Map<number, { x: number; y: number }>;
  dependentLines?: Map<number, number[]>;
};
type PolygonDragContext = {
  polygonId: string;
  dependentLines: Map<number, number[]>;
};
let circleDragContext: CircleDragContext | null = null;
let polygonDragContext: PolygonDragContext | null = null;
let draggingSelection = false;
let measurementScale: number | null = null; // pixels per unit
let measurementReferenceSegment: { lineId: string; segIdx: number } | null = null;
let measurementReferenceValue: number | null = null; // user's reference value (e.g., "5" if segment is 5 units)
let measurementLabels: MeasurementLabel[] = [];
let measurementLabelIdCounter = 0;
let editingMeasurementLabel: string | null = null; // ID of the label being edited
let measurementInputBox: HTMLInputElement | null = null;
let currentCtrBundle: { entries: { name: string; data: any }[]; index: number } | null = null;
let measurementPrecisionLength: number = 0; // decimal places for lengths
let measurementPrecisionAngle: number = 0; // decimal places for angles
const POINT_STYLE_MODE_KEY = 'defaultPointStyle';
type PointFillMode = 'filled' | 'hollow';
let defaultPointFillMode: PointFillMode = 'filled';
let appearancePreviewCallback: (() => void) | null = null;
let draggingMultiSelection = false;
let dragStart = { x: 0, y: 0 };
// Multi-select resize/rotate contexts
type ResizeMultiContext = {
  center: { x: number; y: number };
  vectors: { idx: number; vx: number; vy: number; dist: number }[];
  startHandleDist: number;
};
type RotateMultiContext = {
  center: { x: number; y: number };
  vectors: { idx: number; vx: number; vy: number }[];
  startAngle: number;
  currentAngle?: number;
};
let resizingMulti: ResizeMultiContext | null = null;
let rotatingMulti: RotateMultiContext | null = null;
type ResizeContext = {
  lineIdx: number;
  center: { x: number; y: number };
  dir: { x: number; y: number };
  vectors: { idx: number; vx: number; vy: number }[];
  baseHalf: number;
  lines: number[];
};
let resizingLine: ResizeContext | null = null;
type RotateContext = {
  lineIdx: number;
  center: { x: number; y: number };
  // store original vectors relative to center
  vectors: { idx: number; vx: number; vy: number }[];
  startAngle: number;
  lines?: number[];
};
let rotatingLine: RotateContext | null = null;
type ResizeCircleContext = {
  circleIdx: number;
  center: { x: number; y: number };
  startRadius: number;
};
type RotateCircleContext = {
  circleIdx: number;
  center: { x: number; y: number };
  // original vectors (relative to center) for all perimeter points included in rotation
  vectors: { idx: number; vx: number; vy: number }[];
  startAngle: number;
  radius: number;
};
let resizingCircle: ResizeCircleContext | null = null;
let rotatingCircle: RotateCircleContext | null = null;
let lineDragContext: { lineIdx: number; fractions: number[] } | null = null;
let stickyTool: Mode | null = null;
let viewModeToggleBtn: HTMLButtonElement | null = null;
let selectionVertices = false;
let selectionEdges = true;
let rayModeToggleBtn: HTMLButtonElement | null = null;
let viewModeMenuContainer: HTMLElement | null = null;
let rayModeMenuContainer: HTMLElement | null = null;
let raySegmentBtn: HTMLButtonElement | null = null;
let rayRightBtn: HTMLButtonElement | null = null;
let rayLeftBtn: HTMLButtonElement | null = null;
let debugToggleBtn: HTMLButtonElement | null = null;
// Debug panel DOM elements managed by src/debugPanel.ts
// Debug drag state managed by src/debugPanel.ts
let styleEdgesRow: HTMLElement | null = null;
let viewModeOpen = false;
let rayModeOpen = false;
let hideBtn: HTMLButtonElement | null = null;
let deleteBtn: HTMLButtonElement | null = null;
let copyStyleBtn: HTMLButtonElement | null = null;
let copyStyleActive = false;
let copiedStyle: CopiedStyle | null = null;
let multiMoveBtn: HTMLButtonElement | null = null;
let multiCloneBtn: HTMLButtonElement | null = null;
let multiMoveActive = false;
// pasteBtn removed; reuse `multiCloneBtn` and swap its icon when needed

const COPIED_OBJECTS_STORAGE_KEY = 'constrivia.copied_objects.v1';
let copiedObjects: any = null; // serialized copied selection persisted in localStorage
let showHidden = false;
if (typeof window !== 'undefined') {
  try {
    viewState.showHidden = window.localStorage?.getItem(SHOW_HIDDEN_STORAGE_KEY) === 'true';
    showHidden = viewState.showHidden;
  } catch {
    // ignore storage failures
  }
}
let showHints = true;
if (typeof window !== 'undefined') {
  try {
    const stored = window.localStorage?.getItem(SHOW_HINTS_STORAGE_KEY);
    if (stored !== null) showHints = stored === 'true';
  } catch {
    // ignore
  }
}
let showMeasurements = false;
let zoomMenuBtn: HTMLButtonElement | null = null;
let zoomMenuContainer: HTMLElement | null = null;
let zoomMenuOpen = false;
let zoomMenuDropdown: HTMLElement | null = null;
let lastLoadedConstructionName: string | null = null;
let showHiddenBtn: HTMLButtonElement | null = null;
let showMeasurementsBtn: HTMLButtonElement | null = null;
let copyImageBtn: HTMLButtonElement | null = null;
let saveImageBtn: HTMLButtonElement | null = null;
let clearAllBtn: HTMLButtonElement | null = null;
let exportJsonBtn: HTMLButtonElement | null = null;
let cloudFilesBtn: HTMLButtonElement | null = null;
let bundlePrevBtn: HTMLButtonElement | null = null;
let bundleNextBtn: HTMLButtonElement | null = null;
let themeDarkBtn: HTMLButtonElement | null = null;
let undoBtn: HTMLButtonElement | null = null;
let redoBtn: HTMLButtonElement | null = null;
let styleMenuBtn: HTMLButtonElement | null = null;
let styleMenuContainer: HTMLElement | null = null;
let styleMenuDropdown: HTMLElement | null = null;
let styleMenuOpen = false;

let eraserBtn: HTMLButtonElement | null = null;
let eraserActive = false;
let eraserLastStrokeId: string | null = null;
let eraserChangedDuringDrag = false;
let highlighterBtn: HTMLButtonElement | null = null;
let highlighterActive = false;
// More transparent presets (lower alpha = more transparent)
const HIGHLIGHTER_ALPHA_PRESETS = [0.08, 0.14, 0.2, 0.3];
let highlighterAlphaIdx = 0;
let highlighterAlpha = HIGHLIGHTER_ALPHA_PRESETS[highlighterAlphaIdx];
let highlighterAlphaInput: HTMLInputElement | null = null;
let highlighterAlphaValueDisplay: HTMLElement | null = null;
let prevStyleWidthValue: string | null = null;
let prevStyleWidthStep: string | null = null;
let prevInkBaseWidth: number | null = null;

let styleMenuSuppressed = false;
let styleColorRow: HTMLElement | null = null;
let styleWidthRow: HTMLElement | null = null;
let styleHighlighterAlphaRow: HTMLElement | null = null;
let styleTypeRow: HTMLElement | null = null;
let styleTypeInline: HTMLElement | null = null;
let styleArcRow: HTMLElement | null = null;
let styleHideRow: HTMLElement | null = null;
let labelTextRow: HTMLElement | null = null;
let labelFontRow: HTMLElement | null = null;
let labelGreekRow: HTMLElement | null = null;
let styleColorInput: HTMLInputElement | null = null;
let styleWidthInput: HTMLInputElement | null = null;
let lineWidthDecreaseBtn: HTMLButtonElement | null = null;
let lineWidthIncreaseBtn: HTMLButtonElement | null = null;
let lineWidthValueDisplay: HTMLElement | null = null;
let styleTypeSelect: HTMLSelectElement | null = null;
let labelTextInput: HTMLTextAreaElement | null = null;
let arcCountButtons: HTMLButtonElement[] = [];
let rightAngleBtn: HTMLButtonElement | null = null;
let exteriorAngleBtn: HTMLButtonElement | null = null;
let fillToggleBtn: HTMLButtonElement | null = null;
let pointHollowToggleBtn: HTMLButtonElement | null = null;
let angleRadiusDecreaseBtn: HTMLButtonElement | null = null;
let angleRadiusIncreaseBtn: HTMLButtonElement | null = null;
let colorSwatchButtons: HTMLButtonElement[] = [];
let customColorBtn: HTMLButtonElement | null = null;
let styleTypeButtons: HTMLButtonElement[] = [];
let labelGreekButtons: HTMLButtonElement[] = [];
let labelGreekToggleBtn: HTMLButtonElement | null = null;
let labelGreekShiftBtn: HTMLButtonElement | null = null;
let labelScriptBtn: HTMLButtonElement | null = null;
let labelScriptVisible = false;

// touch double-tap tracker for label editing
let lastLabelTouchTap: { t: number; x: number; y: number } | null = null;
let labelAlignToggleBtn: HTMLButtonElement | null = null;
let pointLabelsAutoBtn: HTMLButtonElement | null = null;
let pointLabelsAwayBtn: HTMLButtonElement | null = null;
let pointLabelsCloserBtn: HTMLButtonElement | null = null;
let topbarLeft: HTMLElement | null = null;
let labelToolsGroup: HTMLElement | null = null;
let labelToolsOverflowContainer: HTMLElement | null = null;
let labelToolsOverflowBtn: HTMLButtonElement | null = null;
let labelToolsOverflowMenu: HTMLElement | null = null;
let labelToolsOverflowRow: HTMLElement | null = null;
let labelToolsOverflowOpen = false;
let pointLabelToolsEnabled = false;
let styleRayGroup: HTMLElement | null = null;
let styleTickGroup: HTMLElement | null = null;
let styleTickButton: HTMLButtonElement | null = null;
let styleTypeGap: HTMLElement | null = null;
let labelGreekVisible = false;
let labelGreekUppercase = false;
// Predefined letter sets (unified definitions)
const GREEK_LOWER = [
  'α','β','γ','δ','ε','ζ','η','θ','λ','μ','ξ','π','σ','τ','φ','χ','ψ', 'Γ','Θ','Π','Σ','Φ','Ψ','Ω'
];
// const GREEK_UPPER = [
//   'Γ','Θ','Π','Σ','Φ','Ψ','Ω'
// ];
// const GREEK_LOWER = [
//   'α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','ο','π','ρ','σ','τ','υ','φ','χ','ψ','ω'
// ];
// const GREEK_UPPER = [
//   'Α','Β','Γ','Δ','Ε','Ζ','Η','Θ','Ι','Κ','Λ','Μ','Ν','Ξ','Ο','Π','Ρ','Σ','Τ','Υ','Φ','Χ','Ψ','Ω'
// ];
const LABEL_SYMBOLS = [
  '⟂', '∥', '∦', '∈', '∩', '∪', '△', '∼','∢', '⇐', '⇒', '⇔', '°'
];
// Symbol buttons that should not be replaced by script mode
// Added arrow symbols for label keypad: left, right, and double arrow
// Script letters (mathematical script)
const SCRIPT_UPPER = [
  '𝒜','ℬ','𝒞','𝒟','ℰ','ℱ','𝒢','ℋ','ℐ','𝒥','𝒦','ℒ','ℳ','𝒩','𝒪','𝒫','𝒬','ℛ','𝒮','𝒯','𝒰','𝒱','𝒲','𝒳','𝒴','𝒵'
];
const SCRIPT_LOWER = [
  '𝒶','𝒷','𝒸','𝒹','𝒺','𝒻','𝒼','𝒽','𝒾','𝒿','𝓀','𝓁','𝓂','𝓃','𝑜','𝓅','𝓆','𝓇','𝓈','𝓉','𝓊','𝓋','𝓌','𝓍','𝓎','𝓏'
];
let labelFontDecreaseBtn: HTMLButtonElement | null = null;

let pointStyleToggleBtn: HTMLButtonElement | null = null;

// IndexedDB helpers for persisting folder handle
const DB_NAME = 'GeometryAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'settings';

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function saveDefaultFolderHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    if (handle) {
      store.put(handle, 'defaultFolderHandle');
      localStorage.setItem('defaultFolderName', handle.name);
    } else {
      store.delete('defaultFolderHandle');
      localStorage.removeItem('defaultFolderName');
    }
    
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('default-folder-changed', {
        detail: { handle }
      });
      window.dispatchEvent(event);
    }
  } catch (err) {
  }
}

function loadRecentColorsFromStorage(fallback: string[]): string[] {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage?.getItem(RECENT_COLORS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const colors = parsed.map((c) => String(c)).filter(Boolean).slice(0, 20);
    return colors.length ? colors : fallback;
  } catch {
    return fallback;
  }
}

function saveRecentColorsToStorage(colors: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(RECENT_COLORS_STORAGE_KEY, JSON.stringify(colors.slice(0, 20)));
  } catch {
    // ignore storage failures
  }
}


let labelFontIncreaseBtn: HTMLButtonElement | null = null;
let labelFontSizeDisplay: HTMLElement | null = null;
let recentColors: string[] = [];
let labelUpperIdx = 0;
let labelLowerIdx = 0;
let labelGreekIdx = 0;
let freeUpperIdx: number[] = [];
let freeLowerIdx: number[] = [];
let freeGreekIdx: number[] = [];
if (typeof document !== 'undefined') {
  setTheme(viewState.currentTheme);
  recentColors = loadRecentColorsFromStorage([THEME.palette[0] ?? THEME.defaultStroke]);
}
let pendingParallelPoint: number | null = null;
let pendingParallelLine: number | null = null;
let pendingIntersection: { kind: 'line' | 'circle'; idx: number } | null = null;
let pendingCircleRadiusPoint: number | null = null;
let tangentPendingPoint: number | null = null;
let tangentPendingCircle: number | null = null;
let perpBisectorFirstPoint: number | null = null;
let perpBisectorSecondPoint: number | null = null;
let perpBisectorLine: number | null = null;
let pendingCircleRadiusLength: number | null = null;
let draggingLabel:
  | null
  | {
      kind: 'point' | 'line' | 'angle' | 'free';
      id: number;
      start: { x: number; y: number };
      initialOffset: { x: number; y: number };
    };
let draggingCircleCenterAngles: Map<number, Map<number, number>> | null = null;
let circleThreePoints: number[] = [];
let activeAxisSnap: { lineIdx: number; axis: 'horizontal' | 'vertical'; strength: number } | null = null;
let activeAxisSnaps: Map<number, { axis: 'horizontal' | 'vertical'; strength: number }> = new Map();
let updatePromptEl: HTMLElement | null = null;
let updatePromptAction: (() => void) | null = null;
const ICONS = {
  moveSelect:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 9.5 5.5 12 8l2.5-2.5L12 3Zm0 13-2.5 2.5L12 21l2.5-2.5L12 16Zm-9-4 2.5 2.5L8 12 5.5 9.5 3 12Zm13 0 2.5 2.5L21 12l-2.5-2.5L16 12ZM8 12l8 0" /></svg>',
  vertices:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" class="icon-fill"/></svg>',
  edges:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  rayLeft:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H6"/><path d="m6 8-4 4 4 4"/></svg>',
  rayRight:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14"/><path d="m18 8 4 4-4 4"/></svg>',
  viewVertices:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="3.8" fill="none" stroke="currentColor"/><circle cx="8" cy="12" r="1.6" class="icon-fill"/><circle cx="16" cy="12" r="3.8" fill="none" stroke="currentColor"/><circle cx="16" cy="12" r="1.6" class="icon-fill"/></svg>',
  viewEdges:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="3.2" fill="none" stroke="currentColor"/><circle cx="6" cy="12" r="1.5" class="icon-fill"/><circle cx="18" cy="12" r="3.2" fill="none" stroke="currentColor"/><circle cx="18" cy="12" r="1.5" class="icon-fill"/><line x1="6" y1="12" x2="18" y2="12" stroke-linecap="round" stroke-width="2"/></svg>',
  viewBoth:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="3.2" fill="none" stroke="currentColor"/><circle cx="6" cy="12" r="1.5" class="icon-fill"/><circle cx="18" cy="12" r="3.2" fill="none" stroke="currentColor"/><circle cx="18" cy="12" r="1.5" class="icon-fill"/><line x1="6" y1="12" x2="18" y2="12" stroke-linecap="round" stroke-width="2"/></svg>',
  rayLine:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="12" x2="20" y2="12"/></svg>',
  rayRightOnly:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="12" x2="14" y2="12"/><path d="m14 8 6 4-6 4"/></svg>',
  rayLeftOnly:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="10" y1="12" x2="20" y2="12"/><path d="m10 8-6 4 6 4"/></svg>',
  raySegment:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="2" class="icon-fill"/><circle cx="16" cy="12" r="2" class="icon-fill"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  tick1:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="12" x2="20" y2="12" stroke-linecap="round" stroke-width="1.8"/><line x1="12" y1="8" x2="12" y2="16" stroke-linecap="round" stroke-width="1.8"/></svg>',
  tick2:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="12" x2="20" y2="12" stroke-linecap="round" stroke-width="1.8"/><line x1="10" y1="8" x2="10" y2="16" stroke-linecap="round" stroke-width="1.8"/><line x1="14" y1="8" x2="14" y2="16" stroke-linecap="round" stroke-width="1.8"/></svg>',
  tick3:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="12" x2="20" y2="12" stroke-linecap="round" stroke-width="1.8"/><line x1="9" y1="7.5" x2="9" y2="16.5" stroke-linecap="round" stroke-width="1.8"/><line x1="12" y1="7.5" x2="12" y2="16.5" stroke-linecap="round" stroke-width="1.8"/><line x1="15" y1="7.5" x2="15" y2="16.5" stroke-linecap="round" stroke-width="1.8"/></svg>',
  eye:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="3"/><path d="M4 4 20 20"/></svg>'
};

type Snapshot = {
  model: Model;
  panOffset: { x: number; y: number };
  zoom: number;
  labelState: {
    upperIdx: number;
    lowerIdx: number;
    greekIdx: number;
    freeUpper: number[];
    freeLower: number[];
    freeGreek: number[];
  };
};
// Persisted types are centralized in src/persisted/persistedTypes.ts

function polygonCentroid(polyIdx: number): { x: number; y: number } | null {
  const verts = polygonVertices(polyIdx);
  if (!verts.length) return null;
  const sum = verts.reduce(
    (acc, vi) => {
      const p = model.points[vi];
      return p ? { x: acc.x + p.x, y: acc.y + p.y } : acc;
    },
    { x: 0, y: 0 }
  );
  return { x: sum.x / verts.length, y: sum.y / verts.length };
}

let history: Snapshot[] = [];
let historyIndex = -1;
let movedDuringDrag = false;
let movedDuringPan = false;
const parallelRecomputeStack = new Set<number>();
const perpendicularRecomputeStack = new Set<number>();

function currentPointStyle(): PointStyle {
  return { color: THEME.defaultStroke, size: THEME.pointSize, hollow: defaultPointFillMode === 'hollow' };
}

function midpointPointStyle(): PointStyle {
  return { color: THEME.midpointColor, size: THEME.pointSize, hollow: defaultPointFillMode === 'hollow' };
}

function bisectPointStyle(): PointStyle {
  return { color: THEME.midpointColor, size: THEME.pointSize, hollow: defaultPointFillMode === 'hollow' };
}

function symmetricPointStyle(): PointStyle {
  return { color: THEME.defaultStroke, size: THEME.pointSize, hollow: defaultPointFillMode === 'hollow' };
}

function currentStrokeStyle(): StrokeStyle {
  return {
    color: THEME.defaultStroke,
    width: THEME.lineWidth,
    type: 'solid',
    tick: 0
  };
}

function currentAngleStyle(): AngleStyle {
  const s: StrokeStyle = {
    color: THEME.defaultStroke,
    width: THEME.angleStrokeWidth,
    type: 'solid'
  };
  return { ...s, fill: undefined, arcCount: 1, right: false, arcRadiusOffset: 0 };
}

const UPPER_SEQ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER_SEQ = 'abcdefghijklmnopqrstuvwxyz';
const GREEK_SEQ = GREEK_LOWER;

function seqLetter(idx: number, alphabet: string) {
  const base = alphabet.length;
  let n = idx;
  let res = '';
  do {
    res = alphabet[n % base] + res;
    n = Math.floor(n / base) - 1;
  } while (n >= 0);
  return res;
}

function nextUpper() {
  if (freeUpperIdx.length) {
    const idx = freeUpperIdx.shift()!;
    return { text: seqLetter(idx, UPPER_SEQ), seq: { kind: 'upper' as const, idx } };
  }
  const idx = labelUpperIdx;
  const res = seqLetter(idx, UPPER_SEQ);
  labelUpperIdx += 1;
  return { text: res, seq: { kind: 'upper' as const, idx } };
}
function nextLower() {
  if (freeLowerIdx.length) {
    const idx = freeLowerIdx.shift()!;
    return { text: seqLetter(idx, LOWER_SEQ), seq: { kind: 'lower' as const, idx } };
  }
  const idx = labelLowerIdx;
  const res = seqLetter(idx, LOWER_SEQ);
  labelLowerIdx += 1;
  return { text: res, seq: { kind: 'lower' as const, idx } };
}
function nextGreek() {
  if (freeGreekIdx.length) {
    const idx = freeGreekIdx.shift()!;
    return { text: GREEK_SEQ[idx % GREEK_SEQ.length], seq: { kind: 'greek' as const, idx } };
  }
  const idx = labelGreekIdx;
  const res = GREEK_SEQ[idx % GREEK_SEQ.length];
  labelGreekIdx += 1;
  return { text: res, seq: { kind: 'greek' as const, idx } };
}

function parseSeqIndexFromText(text: string, alphabet: string): number | null {
  if (!text) return null;
  const base = alphabet.length;
  let value = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const pos = alphabet.indexOf(ch);
    if (pos < 0) return null;
    value = value * base + (pos + 1);
  }
  return value - 1;
}

function labelOccupiesSeqIdx(label?: Label | FreeLabel): LabelSeq | null {
  if (!label?.text) return null;
  const text = label.text;
  const single = text.length === 1;
  const upperSingleIdx = single ? UPPER_SEQ.indexOf(text) : -1;
  const lowerSingleIdx = single ? LOWER_SEQ.indexOf(text) : -1;
  const greekSingleIdx = single ? GREEK_SEQ.indexOf(text) : -1;
  const seq = label.seq;
  if (seq) {
    const expectedText =
      seq.kind === 'upper'
        ? seqLetter(seq.idx, UPPER_SEQ)
        : seq.kind === 'lower'
          ? seqLetter(seq.idx, LOWER_SEQ)
          : GREEK_SEQ[seq.idx % GREEK_SEQ.length];

    // If user edited the label text, don't keep reserving the old seq.idx.
    if (label.text === expectedText) {
      if (seq.kind === 'upper') return expectedText.length === 1 ? { kind: 'upper', idx: upperSingleIdx } : null;
      if (seq.kind === 'lower') return expectedText.length === 1 ? { kind: 'lower', idx: lowerSingleIdx } : null;
      return expectedText.length === 1 ? { kind: 'greek', idx: greekSingleIdx } : null;
    }

    if (seq.kind === 'upper') {
      return upperSingleIdx >= 0 ? { kind: 'upper', idx: upperSingleIdx } : null;
    }
    if (seq.kind === 'lower') {
      return lowerSingleIdx >= 0 ? { kind: 'lower', idx: lowerSingleIdx } : null;
    }
    return greekSingleIdx >= 0 ? { kind: 'greek', idx: greekSingleIdx } : null;
  }

  // Labels without seq can still reserve indices if they look like sequence labels.
  if (upperSingleIdx >= 0) return { kind: 'upper', idx: upperSingleIdx };
  if (lowerSingleIdx >= 0) return { kind: 'lower', idx: lowerSingleIdx };
  if (greekSingleIdx >= 0) return { kind: 'greek', idx: greekSingleIdx };
  return null;
}

function refreshLabelPoolsFromModel(target: Model = model) {
  const usedUpper = new Set<number>();
  const usedLower = new Set<number>();
  const usedGreek = new Set<number>();

  const addUsed = (label?: Label | FreeLabel) => {
    const occ = labelOccupiesSeqIdx(label);
    if (!occ) return;
    if (!Number.isFinite(occ.idx) || occ.idx < 0) return;
    if (occ.kind === 'upper') {
      if (occ.idx >= UPPER_SEQ.length) return;
      usedUpper.add(occ.idx);
    } else if (occ.kind === 'lower') {
      if (occ.idx >= LOWER_SEQ.length) return;
      usedLower.add(occ.idx);
    } else {
      if (occ.idx >= GREEK_SEQ.length) return;
      usedGreek.add(occ.idx);
    }
  };

  target.points.forEach((p) => addUsed(p.label));
  target.lines.forEach((l) => addUsed(l.label));
  target.circles.forEach((c) => addUsed(c.label));
  target.angles.forEach((a) => addUsed(a.label));
  target.labels.forEach((l) => addUsed(l));

  const compute = (used: Set<number>) => {
    if (used.size === 0) return { next: 0, free: [] as number[] };
    let maxUsed = -1;
    used.forEach((v) => {
      if (v > maxUsed) maxUsed = v;
    });
    const free: number[] = [];
    for (let i = 0; i <= maxUsed; i++) {
      if (!used.has(i)) free.push(i);
    }
    return { next: maxUsed + 1, free };
  };

  const upper = compute(usedUpper);
  const lower = compute(usedLower);
  const greek = compute(usedGreek);

  labelUpperIdx = upper.next;
  labelLowerIdx = lower.next;
  labelGreekIdx = greek.next;
  freeUpperIdx = upper.free;
  freeLowerIdx = lower.free;
  freeGreekIdx = greek.free;
}

function clearSelectionState() {
  selectedLineIndex = null;
  selectedPointIndex = null;
  selectedCircleIndex = null;
  selectedAngleIndex = null;
  selectedPolygonIndex = null;
  selectedInkStrokeIndex = null;
  selectedLabel = null;
  selectedSegments.clear();
  selectedArcSegments.clear();
  draggingLabel = null;
  resizingLine = null;
  lineDragContext = null;
  parallelAnchorPointIndex = null;
  parallelReferenceLineIndex = null;
  squareStartIndex = null;
  ngonSecondIndex = null;
}

function copyStyleFromSelection(): CopiedStyle | null {
  if (selectedPointIndex !== null) {
    const pt = model.points[selectedPointIndex];
    if (!pt) return null;
    return {
      sourceType: 'point',
      color: pt.style.color,
      size: pt.style.size
    };
  }
  if (selectedLineIndex !== null) {
    const line = model.lines[selectedLineIndex];
    if (!line) return null;
    // Jeśli zaznaczony jest konkretny segment, weź jego styl
    if (selectedSegments.size > 0) {
      const firstKey = Array.from(selectedSegments)[0];
      const parsed = parseSegmentKey(firstKey);
      if (parsed && parsed.line === selectedLineIndex) {
        let style: StrokeStyle | undefined;
        if (parsed.part === 'segment' && parsed.seg !== undefined) {
          style = line.segmentStyles?.[parsed.seg] ?? line.style;
        } else if (parsed.part === 'rayLeft') {
          style = line.leftRay ?? line.style;
        } else if (parsed.part === 'rayRight') {
          style = line.rightRay ?? line.style;
        }
        if (style) {
          return {
            sourceType: 'line',
            color: style.color,
            width: style.width,
            type: style.type,
            tick: style.tick
          };
        }
      }
    }
    // Jeśli zaznaczona cała linia, weź styl całej linii
    return {
      sourceType: 'line',
      color: line.style.color,
      width: line.style.width,
      type: line.style.type,
      tick: line.style.tick
    };
  }
    if (selectedCircleIndex !== null) {
    const circle = model.circles[selectedCircleIndex!];
    if (!circle) return null;
    // Jeśli zaznaczony jest konkretny łuk, weź jego styl
      if (selectedArcSegments.size > 0) {
      const firstKey = Array.from(selectedArcSegments)[0];
      const parsed = parseArcKey(firstKey);
      if (parsed && parsed.circle === selectedCircleIndex && parsed.start !== undefined && parsed.end !== undefined) {
        const key = arcKey(selectedCircleIndex!, parsed.start, parsed.end);
        const style = (circle.arcStyles as any)?.[key] ?? circle.style;
        return {
          sourceType: 'circle',
          color: style.color,
          width: style.width,
          type: style.type,
          tick: style.tick
        };
      }
    }
    // Jeśli zaznaczony cały okrąg, weź styl całego okręgu
    return {
      sourceType: 'circle',
      color: circle.style.color,
      width: circle.style.width,
      type: circle.style.type,
      tick: circle.style.tick
    };
  }
  if (selectedAngleIndex !== null) {
    const angle = model.angles[selectedAngleIndex];
    if (!angle) return null;
    return {
      sourceType: 'angle',
      color: angle.style.color,
      width: angle.style.width,
      type: angle.style.type,
      arcCount: angle.style.arcCount,
      right: angle.style.right,
      fill: angle.style.fill,
      arcRadiusOffset: angle.style.arcRadiusOffset
    };
  }
  if (selectedLabel !== null) {
    const sel = selectedLabel;
    let lbl: Label | undefined | null = null;
    if (sel.kind === 'free') lbl = model.labels[sel.id];
    else if (sel.kind === 'point') lbl = model.points[sel.id]?.label ?? null;
    else if (sel.kind === 'line') lbl = model.lines[sel.id]?.label ?? null;
    else if (sel.kind === 'angle') lbl = model.angles[sel.id]?.label ?? null;
    if (lbl) {
      return { sourceType: 'label' as const, color: lbl.color, fontSize: normalizeLabelFontSize(lbl.fontSize) };
    }
  }
  if (selectedInkStrokeIndex !== null) {
    const stroke = model.inkStrokes[selectedInkStrokeIndex];
    if (!stroke) return null;
    return {
      sourceType: 'ink',
      color: stroke.color,
      baseWidth: stroke.baseWidth
    };
  }
  return null;
}

function applyStyleToSelection(style: CopiedStyle) {
  let changed = false;
  if (selectedPointIndex !== null && style.color !== undefined && style.size !== undefined) {
    const pt = model.points[selectedPointIndex];
    if (pt) {
      pt.style.color = style.color;
      pt.style.size = style.size;
      changed = true;
    }
  }
  if (selectedLineIndex !== null && style.color !== undefined && style.width !== undefined && style.type !== undefined) {
    const line = model.lines[selectedLineIndex];
    if (line) {
      // Jeśli zaznaczone są konkretne segmenty, aplikuj tylko do nich
      if (selectedSegments.size > 0) {
        ensureSegmentStylesForLine(selectedLineIndex);
        selectedSegments.forEach((key) => {
          const parsed = parseSegmentKey(key);
          if (!parsed || parsed.line !== selectedLineIndex) return;
          if (parsed.part === 'segment' && parsed.seg !== undefined) {
            if (!line.segmentStyles) line.segmentStyles = [];
            const base = line.segmentStyles[parsed.seg] ?? line.style;
            line.segmentStyles[parsed.seg] = { ...base, color: style.color!, width: style.width!, type: style.type! };
            if (style.tick !== undefined) line.segmentStyles[parsed.seg].tick = style.tick;
          } else if (parsed.part === 'rayLeft') {
            const base = line.leftRay ?? line.style;
            line.leftRay = { ...base, color: style.color!, width: style.width!, type: style.type! };
            if (style.tick !== undefined) line.leftRay.tick = style.tick;
          } else if (parsed.part === 'rayRight') {
            const base = line.rightRay ?? line.style;
            line.rightRay = { ...base, color: style.color!, width: style.width!, type: style.type! };
            if (style.tick !== undefined) line.rightRay.tick = style.tick;
          }
        });
        changed = true;
      } else {
        // Aplikuj do całej linii
        line.style.color = style.color;
        line.style.width = style.width;
        line.style.type = style.type;
        if (style.tick !== undefined) line.style.tick = style.tick;
        
        // Jeśli linia ma segmentStyles, zaktualizuj też wszystkie segmenty
        if (line.segmentStyles && line.segmentStyles.length > 0) {
          line.segmentStyles = line.segmentStyles.map(seg => ({
            ...seg,
            color: style.color!,
            width: style.width!,
            type: style.type!,
            tick: style.tick !== undefined ? style.tick : seg.tick
          }));
        }
        
        // Zaktualizuj też półproste jeśli istnieją
        if (line.leftRay) {
          line.leftRay = { ...line.leftRay, color: style.color, width: style.width, type: style.type };
          if (style.tick !== undefined) line.leftRay.tick = style.tick;
        }
        if (line.rightRay) {
          line.rightRay = { ...line.rightRay, color: style.color, width: style.width, type: style.type };
          if (style.tick !== undefined) line.rightRay.tick = style.tick;
        }
        
        changed = true;
      }
    }
  }
  if (selectedCircleIndex !== null && style.color !== undefined && style.width !== undefined && style.type !== undefined) {
    const circle = model.circles[selectedCircleIndex];
    if (circle) {
      // Jeśli zaznaczone są konkretne łuki, aplikuj tylko do nich
      if (selectedArcSegments.size > 0) {
        const arcs = circleArcs(selectedCircleIndex!);
        ensureArcStyles(selectedCircleIndex!, arcs.length);
        selectedArcSegments.forEach((key) => {
          const parsed = parseArcKey(key);
          if (!parsed || parsed.circle !== selectedCircleIndex || parsed.start === undefined || parsed.end === undefined) return;
          if (!circle.arcStyles) circle.arcStyles = {} as any;
          const mapKey = arcKey(selectedCircleIndex!, parsed.start, parsed.end);
          const base = (circle.arcStyles as any)[mapKey] ?? circle.style;
          (circle.arcStyles as any)[mapKey] = { ...base, color: style.color!, width: style.width!, type: style.type! };
          if (style.tick !== undefined) (circle.arcStyles as any)[mapKey].tick = style.tick;
        });
        changed = true;
      } else {
        // Aplikuj do całego okręgu
        circle.style.color = style.color;
        circle.style.width = style.width;
        circle.style.type = style.type;
        if (style.tick !== undefined) circle.style.tick = style.tick;
        
        // Jeśli okrąg ma arcStyles, zaktualizuj też wszystkie łuki
        if (circle.arcStyles && !(Array.isArray(circle.arcStyles))) {
          const newMap: Record<string, StrokeStyle> = {};
          const arcs = circleArcs(selectedCircleIndex!);
          arcs.forEach((arc) => {
              const k = arc.key;
            const prev = (circle.arcStyles as any)?.[k] ?? circle.style;
            newMap[k] = {
              ...prev,
              color: style.color!,
              width: style.width!,
              type: style.type!,
              tick: style.tick !== undefined ? style.tick : prev.tick
            };
          });
          circle.arcStyles = newMap as any;
        }
        
        changed = true;
      }
    }
  }
  if (selectedAngleIndex !== null && style.color !== undefined && style.width !== undefined && style.type !== undefined) {
    const angle = model.angles[selectedAngleIndex];
    if (angle) {
      angle.style.color = style.color;
      angle.style.width = style.width;
      angle.style.type = style.type;
      if (style.arcCount !== undefined) angle.style.arcCount = style.arcCount;
      if (style.right !== undefined) angle.style.right = style.right;
      if (style.fill !== undefined) angle.style.fill = style.fill;
      if (style.arcRadiusOffset !== undefined) angle.style.arcRadiusOffset = style.arcRadiusOffset;
      changed = true;
    }
  }
  // Apply to labels (selected single label or multi-selected free labels)
  if (selectedLabel !== null || multiSelectedLabels.size > 0) {
    // apply without logging
    if (selectedLabel) {
      const sel = selectedLabel;
      if (sel.kind === 'free') {
        const lab = model.labels[sel.id];
        if (lab) {
          if (style.color !== undefined) lab.color = style.color;
          if (style.fontSize !== undefined) lab.fontSize = style.fontSize;
          changed = true;
        }
      } else if (sel.kind === 'point') {
        const p = model.points[sel.id];
        if (p && p.label) {
          if (style.color !== undefined) p.label.color = style.color;
          if (style.fontSize !== undefined) p.label.fontSize = style.fontSize;
          changed = true;
        }
      } else if (sel.kind === 'line') {
        const l = model.lines[sel.id];
        if (l && l.label) {
          if (style.color !== undefined) l.label.color = style.color;
          if (style.fontSize !== undefined) l.label.fontSize = style.fontSize;
          changed = true;
        }
      } else if (sel.kind === 'angle') {
        const a = model.angles[sel.id];
        if (a && a.label) {
          if (style.color !== undefined) a.label.color = style.color;
          if (style.fontSize !== undefined) a.label.fontSize = style.fontSize;
          changed = true;
        }
      }
    }
    if (multiSelectedLabels.size > 0) {
      multiSelectedLabels.forEach((id) => {
        const lab = model.labels[id];
        if (lab) {
          if (style.color !== undefined) lab.color = style.color;
          if (style.fontSize !== undefined) lab.fontSize = style.fontSize;
          changed = true;
        }
      });
    }
  }
  if (selectedInkStrokeIndex !== null && style.color !== undefined && style.baseWidth !== undefined) {
    const stroke = model.inkStrokes[selectedInkStrokeIndex];
    if (stroke) {
      stroke.color = style.color;
      stroke.baseWidth = style.baseWidth;
      changed = true;
    }
  }
  if (changed) {
    draw();
    pushHistory();
  }
}

function reclaimLabel(label?: Label) {
  const occ = labelOccupiesSeqIdx(label);
  if (!occ) return;
  const { kind, idx } = occ;
  const pool = kind === 'upper' ? freeUpperIdx : kind === 'lower' ? freeLowerIdx : freeGreekIdx;
  if (!pool.includes(idx)) {
    pool.push(idx);
    pool.sort((a, b) => a - b);
  }
}

function resetLabelState() {
  labelUpperIdx = 0;
  labelLowerIdx = 0;
  labelGreekIdx = 0;
  freeUpperIdx = [];
  freeLowerIdx = [];
  freeGreekIdx = [];
}

function clearMultiSelection() {
  multiSelectedPoints.clear();
  multiSelectedLines.clear();
  multiSelectedCircles.clear();
  multiSelectedAngles.clear();
  multiSelectedPolygons.clear();
  multiSelectedInkStrokes.clear();
  multiSelectedLabels.clear();
  multiselectBoxStart = null;
  multiselectBoxEnd = null;
}

function isPointInBox(p: { x: number; y: number }, box: { x1: number; y1: number; x2: number; y2: number }): boolean {
  return p.x >= box.x1 && p.x <= box.x2 && p.y >= box.y1 && p.y <= box.y2;
}

function selectObjectsInBox(box: { x1: number; y1: number; x2: number; y2: number }) {
  model.points.forEach((p, idx) => {
    if (isPointInBox(p, box)) multiSelectedPoints.add(idx);
  });
  
  model.lines.forEach((line, idx) => {
    const allInside = line.points.every(pi => {
      const p = model.points[pi];
      return p && isPointInBox(p, box);
    });
    if (allInside) multiSelectedLines.add(idx);
  });
  
  model.circles.forEach((circle, idx) => {
    const center = model.points[circle.center];
    if (center && isPointInBox(center, box)) multiSelectedCircles.add(idx);
  });
  
  model.angles.forEach((ang, idx) => {
    const v = model.points[ang.vertex];
    if (v && isPointInBox(v, box)) multiSelectedAngles.add(idx);
  });
  
  model.polygons.forEach((poly, idx) => {
    const verts = polygonVerticesOrdered(idx);
    const allInside = verts.every(vi => {
      const p = model.points[vi];
      return p && isPointInBox(p, box);
    });
    if (allInside) {
      const pid = poly?.id;
      if (pid) multiSelectedPolygons.add(pid);
    }
  });
  
  model.inkStrokes.forEach((stroke, idx) => {
    const allInside = stroke.points.every(pt => isPointInBox(pt, box));
    if (allInside) multiSelectedInkStrokes.add(idx);
  });
  
  // free labels
  model.labels.forEach((lab, idx) => {
    if (lab.hidden && !viewState.showHidden) return;
    if (isPointInBox(lab.pos, box)) multiSelectedLabels.add(idx);
  });
}

// Measurement input box helpers
function showMeasurementInputBox(label: MeasurementLabel) {
  if (!canvas) return;
  
  editingMeasurementLabel = label.id;
  
  // Create input box if it doesn't exist
  if (!measurementInputBox) {
    measurementInputBox = document.createElement('input');
    measurementInputBox.type = 'text';
    measurementInputBox.style.position = 'absolute';
    measurementInputBox.style.zIndex = '10000';
    measurementInputBox.style.padding = '4px 8px';
    measurementInputBox.style.border = '2px solid ' + THEME.highlight;
    measurementInputBox.style.borderRadius = '4px';
    measurementInputBox.style.background = THEME.bg;
    measurementInputBox.style.color = THEME.defaultStroke;
    measurementInputBox.style.fontSize = labelFontSizePx(label.fontSize) + 'px';
    measurementInputBox.style.fontFamily = 'sans-serif';
    measurementInputBox.style.textAlign = 'center';
    measurementInputBox.style.minWidth = '60px';
    document.body.appendChild(measurementInputBox);
  }
  
  // Position the input box
  const canvasRect = canvas.getBoundingClientRect();
  const screenX = (label.pos.x * zoomFactor + panOffset.x) * dpr / dpr + canvasRect.left;
  const screenY = (label.pos.y * zoomFactor + panOffset.y) * dpr / dpr + canvasRect.top;
  
  measurementInputBox.style.left = screenX + 'px';
  measurementInputBox.style.top = screenY + 'px';
  measurementInputBox.style.transform = 'translate(-50%, -50%)';
  
  // Set initial value
  if (label.kind === 'segment') {
    const match = label.targetId.match(/^(.+)-seg(\d+)$/);
    if (match) {
      const lineId = match[1];
      const segIdx = parseInt(match[2], 10);
      const lineIdx = model.lines.findIndex(l => l.id === lineId);
      if (lineIdx !== -1) {
        const currentLength = getSegmentLength(lineIdx, segIdx);
        measurementInputBox.value = measurementScale ? (currentLength / measurementScale).toFixed(measurementPrecisionLength) : '';
      }
    }
  }
  
  measurementInputBox.focus();
  measurementInputBox.select();
  
  // Handle Enter key
  measurementInputBox.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitMeasurementInput();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMeasurementInputBox();
    }
  };
  
  // Handle blur - close only if not clicking inside the input
  measurementInputBox.onblur = () => {
    setTimeout(() => {
      if (document.activeElement !== measurementInputBox) {
        closeMeasurementInputBox();
      }
    }, 150);
  };
  
  // Prevent click from propagating to canvas
  measurementInputBox.onclick = (e) => {
    e.stopPropagation();
  };
  measurementInputBox.onpointerdown = (e) => {
    e.stopPropagation();
  };
}

function commitMeasurementInput() {
  if (!measurementInputBox || !editingMeasurementLabel) return;
  
  const label = measurementLabels.find(ml => ml.id === editingMeasurementLabel);
  if (!label) {
    closeMeasurementInputBox();
    return;
  }
  
  const inputValue = measurementInputBox.value.trim();
  
  if (label.kind === 'segment' && inputValue !== '') {
    const match = label.targetId.match(/^(.+)-seg(\d+)$/);
    if (match) {
      const lineId = match[1];
      const segIdx = parseInt(match[2], 10);
          const lineIdx = model.lines.findIndex(l => l.id === lineId);
      
      if (lineIdx !== -1) {
        const userValue = parseFloat(inputValue);
        if (!isNaN(userValue) && userValue > 0) {
          const currentLength = getSegmentLength(lineIdx, segIdx);
          measurementScale = currentLength / userValue;
          measurementReferenceSegment = { lineId, segIdx };
          measurementReferenceValue = userValue;
          
          generateMeasurementLabels();
          pushHistory();
        }
      }
    }
  }
  
  closeMeasurementInputBox();
  draw();
}

function closeMeasurementInputBox() {
  if (measurementInputBox && measurementInputBox.parentElement) {
    measurementInputBox.parentElement.removeChild(measurementInputBox);
  }
  measurementInputBox = null;
  editingMeasurementLabel = null;
}

// Measurement label helpers
function generateMeasurementLabels() {
  // Don't clear existing labels, update positions instead
  const existingLabels = new Map(measurementLabels.map(ml => [ml.targetId, ml]));
  measurementLabels = [];
  
  // Generate labels for all segments
  model.lines.forEach((line, lineIdx) => {
    const pts = line.points.map(idx => model.points[idx]).filter(Boolean);
    for (let segIdx = 0; segIdx < pts.length - 1; segIdx++) {
      const a = pts[segIdx];
      const b = pts[segIdx + 1];
      if (!a || !b) continue;
      
      const style = line.segmentStyles?.[segIdx] ?? line.style;
      if (style.hidden && !viewState.showHidden) continue;
      
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      
      const targetId = `${line.id}-seg${segIdx}`;
      const existing = existingLabels.get(targetId);
      
      if (existing) {
        // Update existing label position
        measurementLabels.push({
          ...existing,
          pos: { x: midX, y: midY }
        });
      } else {
        // Create new label
        measurementLabels.push({
          id: `ml${++measurementLabelIdCounter}`,
          kind: 'segment',
          targetId,
          pos: { x: midX, y: midY },
          pinned: false,
          color: THEME.defaultStroke
        });
      }
    }
  });
  
  // Generate labels for all angles
  model.angles.forEach((angle, angleIdx) => {
    if (angle.hidden && !viewState.showHidden) return;
    
    const v = model.points[angle.vertex];
    if (!v) return;
    
    const geom = angleGeometry(angle);
    if (!geom) return;
    
    const { start, end, clockwise, radius } = geom;
    const midAngle = clockwise 
      ? start - (start - end + (start < end ? Math.PI * 2 : 0)) / 2
      : start + (end - start + (end < start ? Math.PI * 2 : 0)) / 2;
    
    const labelRadius = radius + screenUnits(15);
    const labelX = v.x + Math.cos(midAngle) * labelRadius;
    const labelY = v.y + Math.sin(midAngle) * labelRadius;
    
    const existing = existingLabels.get(angle.id);
    
    if (existing) {
      // Update existing label position
      measurementLabels.push({
        ...existing,
        pos: { x: labelX, y: labelY }
      });
    } else {
      // Create new label
      measurementLabels.push({
        id: `ml${++measurementLabelIdCounter}`,
        kind: 'angle',
        targetId: angle.id,
        pos: { x: labelX, y: labelY },
        pinned: false,
        color: THEME.defaultStroke
      });
    }
  });
  
  // Apply label repulsion only to new labels (without pinned state)
  repelMeasurementLabels();
}

function repelMeasurementLabels() {
  const iterations = 50;
  const repulsionRadius = screenUnits(40);
  const repulsionStrength = 0.3;
  
  for (let iter = 0; iter < iterations; iter++) {
    const forces: { x: number; y: number }[] = measurementLabels.map(() => ({ x: 0, y: 0 }));
    
    for (let i = 0; i < measurementLabels.length; i++) {
      for (let j = i + 1; j < measurementLabels.length; j++) {
        const a = measurementLabels[i];
        const b = measurementLabels[j];
        
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < repulsionRadius && dist > 0.1) {
          const force = (repulsionRadius - dist) / repulsionRadius * repulsionStrength;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          
          forces[i].x -= fx;
          forces[i].y -= fy;
          forces[j].x += fx;
          forces[j].y += fy;
        }
      }
    }
    
    measurementLabels.forEach((label, idx) => {
      if (!label.pinned) {
        label.pos.x += forces[idx].x;
        label.pos.y += forces[idx].y;
      }
    });
  }
}

function getSegmentLength(lineIdx: number, segIdx: number): number {
  const line = model.lines[lineIdx];
  if (!line) return 0;
  
  const pts = line.points.map(idx => model.points[idx]);
  const a = pts[segIdx];
  const b = pts[segIdx + 1];
  if (!a || !b) return 0;
  
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function getAngleValue(angleIdx: number): number {
  const angle = model.angles[angleIdx];
  if (!angle) return 0;
  
  const geom = angleGeometry(angle);
  if (!geom) return 0;
  
  let { start, end, clockwise } = geom;
  let angleDiff = clockwise 
    ? (start - end + Math.PI * 2) % (Math.PI * 2)
    : (end - start + Math.PI * 2) % (Math.PI * 2);
  
  if (angle.style.exterior) {
    angleDiff = Math.PI * 2 - angleDiff;
  }
  
  return angleDiff * (180 / Math.PI);
}

function formatMeasurement(value: number, kind: 'segment' | 'angle'): string {
  if (kind === 'angle') {
    return `${value.toFixed(measurementPrecisionAngle)}°`;
  }
  
  if (measurementScale === null) {
    return ''; // Empty until scale is set
  }
  
  const scaledValue = value / measurementScale;
  return scaledValue.toFixed(measurementPrecisionLength);
}

function getMeasurementLabelText(label: MeasurementLabel): string {
  if (label.kind === 'segment') {
    const match = label.targetId.match(/^(.+)-seg(\d+)$/);
    if (!match) return '';
    
    const lineId = match[1];
    const segIdx = parseInt(match[2], 10);
    const lineIdx = model.lines.findIndex(l => l.id === lineId);
    if (lineIdx === -1) return '';
    
    const length = getSegmentLength(lineIdx, segIdx);
    const text = formatMeasurement(length, 'segment');
    return text || '—'; // Show placeholder when no scale
  } else {
    const angleIdx = model.angles.findIndex(a => a.id === label.targetId);
    if (angleIdx === -1) return '';
    
    const angleValue = getAngleValue(angleIdx);
    return formatMeasurement(angleValue, 'angle');
  }
}

// Use centralized `hasMultiSelection` from `selectionState` (imported above).

function hasAnySelection(): boolean {
  return (
    selectedLineIndex !== null ||
    selectedPointIndex !== null ||
    selectedCircleIndex !== null ||
    selectedPolygonIndex !== null ||
    selectedArcSegments.size > 0 ||
    selectedAngleIndex !== null ||
    selectedInkStrokeIndex !== null ||
    selectedLabel !== null ||
    hasMultiSelection()
  );
}

function normalizeLoadedResult(payload: any): LoadedFileResult {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload as LoadedFileResult;
  }
  return { data: payload };
}

function setCtrBundle(bundle: LoadedFileResult['bundle'] | undefined) {
  if (bundle && bundle.entries.length > 1) {
    const clampedIndex = clamp(bundle.index ?? 0, 0, bundle.entries.length - 1);
    currentCtrBundle = { entries: bundle.entries, index: clampedIndex };
  } else {
    currentCtrBundle = null;
  }
  updateArchiveNavButtons();
}

function updateArchiveNavButtons() {
  const hasBundle = currentCtrBundle && currentCtrBundle.entries.length > 1;
  const show = !!hasBundle && mode === 'move' && !hasAnySelection();
  [bundlePrevBtn, bundleNextBtn].forEach((btn) => {
    if (!btn) return;
    btn.style.display = show ? 'inline-flex' : 'none';
  });
  if (show && currentCtrBundle) {
    const { index, entries } = currentCtrBundle;
    if (bundlePrevBtn) bundlePrevBtn.disabled = index <= 0;
    if (bundleNextBtn) bundleNextBtn.disabled = index >= entries.length - 1;
  } else {
    if (bundlePrevBtn) bundlePrevBtn.disabled = true;
    if (bundleNextBtn) bundleNextBtn.disabled = true;
  }
}

function navigateCtrBundle(direction: number) {
  if (!currentCtrBundle) return;
  const nextIndex = clamp(currentCtrBundle.index + direction, 0, currentCtrBundle.entries.length - 1);
  if (nextIndex === currentCtrBundle.index) return;
  currentCtrBundle.index = nextIndex;
  try {
    applyPersistedDocument(currentCtrBundle.entries[nextIndex].data);
    updateSelectionButtons();
    draw();
  } catch (err) {
    window.alert('Nie udało się wczytać pliku z archiwum CTR.');
  }
  updateArchiveNavButtons();
}

function draw() {
  if (!canvas || !ctx) return;
  
  // Update measurement labels if they're visible
  if (showMeasurements && measurementLabels.length > 0) {
    generateMeasurementLabels();
  }
  
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * zoomFactor, 0, 0, dpr * zoomFactor, panOffset.x * dpr, panOffset.y * dpr);

  // draw grid / background guides (renderer)
  // keep runtime in sync with model for render/debug helpers
  try {
    runtime = modelToRuntime(model);
  } catch {}
  renderGrid(ctx!, { THEME, dpr, zoomFactor, renderWidth } as any);

  // draw polygons and lines (extracted to renderer)
  renderPolygonsAndLines(ctx!, model, {
    showHidden,
    THEME,
    dpr,
    zoomFactor,
    getRuntime: () => runtime,
    screenUnits,
    renderWidth,
    worldToCanvas,
    labelFontSizePx,
    getLabelAlignment,
    selectedLineIndex,
    selectedSegments,
    selectionEdges,
    selectedPolygonIndex,
    multiSelectedLines,
    selectedCircleIndex,
    selectedArcSegments,
    selectedAngleIndex,
    selectedLabel,
    multiSelectedAngles,
    polygonVerticesOrdered,
    segmentKey,
    lineExtent,
    circleRadius,
    getLineHandle,
    getLineRotateHandle,
    getCircleHandle,
    getCircleRotateHandle,
    defaultLineLabelOffset,
    defaultAngleLabelOffset,
    drawSegmentTicks,
    drawCircleTicks,
    drawArcTicks,
    drawDiagonalHandle,
    drawRotateIcon,
    drawLabelText,
    applyStrokeStyle,
    applySelectionStyle,
    isParallelLine,
    isPerpendicularLine,
    LABEL_PADDING_X,
    LABEL_PADDING_Y,
    pointRadius,
    activeAxisSnap,
    activeAxisSnaps
  } as any);
  // draw circles and arcs (extracted to renderer)
  renderCirclesAndArcs(ctx!, model, {
    showHidden,
    THEME,
    dpr,
    getRuntime: () => runtime,
    renderWidth,
    screenUnits,
    circleRadius,
    circlePerimeterPoints,
    circleArcs,
    drawCircleTicks,
    drawArcTicks,
    selectedCircleIndex,
    selectedArcSegments,
    getCircleHandle,
    getCircleRotateHandle,
    drawDiagonalHandle,
    drawRotateIcon,
    selectionEdges,
    applySelectionStyle,
    applyStrokeStyle,
    zoomFactor
  } as any);

  // draw angles (extracted to renderer)
  renderAngles(ctx!, model, {
    showHidden,
    THEME,
    renderWidth,
    getRuntime: () => runtime,
    applyStrokeStyle,
    applySelectionStyle,
    angleGeometry,
    getAngleLegSeg,
    defaultAngleLabelOffset,
    drawLabelText,
    labelFontSizePx,
    getLabelAlignment,
    dpr,
    RIGHT_ANGLE_MARK_MARGIN,
    RIGHT_ANGLE_MARK_MIN,
    RIGHT_ANGLE_MARK_MAX,
    RIGHT_ANGLE_MARK_RATIO,
    selectedAngleIndex,
    selectedLabel,
    multiSelectedAngles,
    worldToCanvas,
    LABEL_PADDING_X,
    LABEL_PADDING_Y,
    normalize
  } as any);
  // draw points (extracted to renderer)
  renderPoints(ctx!, model, {
    showHidden,
    THEME,
    pointRadius,
    getRuntime: () => runtime,
    zoomFactor,
    defaultPointLabelOffset,
    drawLabelText,
    worldToCanvas,
    labelFontSizePx,
    getLabelAlignment,
    dpr,
    selectedPointIndex,
    mode,
    circleThreePoints,
    hoverPointIndex,
    selectedLineIndex,
    selectionVertices,
    pointInLine,
    selectedPolygonIndex,
    polygonHasPoint,
    selectedCircleIndex,
    circleHasDefiningPoint,
    applySelectionStyle,
    selectedLabel,
    multiSelectedPoints,
    LABEL_PADDING_X,
    LABEL_PADDING_Y
  } as any);

  // free labels and measurement labels (extracted to renderer)
  renderFreeLabels(ctx!, model, { showHidden: viewState.showHidden, drawLabelText, worldToCanvas, labelFontSizePx, getLabelAlignment, dpr, THEME, LABEL_PADDING_X, LABEL_PADDING_Y, selectedLabel, multiSelectedLabels } as any);
  renderMeasurementLabels(ctx!, measurementLabels, { showMeasurements: viewState.showMeasurements, getMeasurementLabelText, zoomFactor, labelFontSizePx, THEME, screenUnits, dpr } as any);

  model.inkStrokes.forEach((stroke, idx) => {
    if (stroke.hidden && !showHidden) return;
    ctx!.save();
    if (stroke.hidden && showHidden) ctx!.globalAlpha = 0.4;
    renderInkStroke(stroke, ctx!, renderWidth);
    if (idx === selectedInkStrokeIndex) {
      const bounds = strokeBounds(stroke);
      if (bounds) {
        const margin = screenUnits(8);
        ctx!.beginPath();
        ctx!.rect(
          bounds.minX - margin,
          bounds.minY - margin,
          bounds.maxX - bounds.minX + margin * 2,
          bounds.maxY - bounds.minY + margin * 2
        );
        applySelectionStyle(ctx!, THEME.highlightWidth ?? 2, THEME.highlight);
      }
    }
    ctx!.restore();
  });

  // Draw multiselect box (delegated to renderer)
  renderMultiselectBox(ctx!, multiselectBoxStart, multiselectBoxEnd, { mode, THEME, renderWidth, zoomFactor } as any);

  // Highlight multiselected objects (delegated to renderer)
  renderMultiselectOverlays(ctx!, model, {
    THEME,
    showHidden,
    multiSelectedPoints,
    multiSelectedLines,
    multiSelectedCircles,
    multiSelectedAngles,
    multiSelectedInkStrokes,
    zoomFactor,
    renderWidth,
    applySelectionStyle,
    applyStrokeStyle,
    circleRadius,
    strokeBounds,
    screenUnits,
    angleGeometry
  } as any);

  // Draw group handles for multiselect (scale + rotate)
  if (mode === 'multiselect' && hasMultiSelection()) {
    const mh = getMultiHandles();
    if (mh) {
      // scale handle (bottom-right)
      ctx!.save();
      ctx!.translate(mh.scaleHandle.x, mh.scaleHandle.y);
      ctx!.scale(1 / zoomFactor, 1 / zoomFactor);
      const baseSquareColor = THEME.preview || '#22c55e';
      ctx!.beginPath();
      ctx!.fillStyle = hexToRgba(baseSquareColor, 0.33);
      ctx!.arc(0, 0, HANDLE_SIZE / 2 + HANDLE_HIT_PAD, 0, Math.PI * 2);
      ctx!.fill();
      drawDiagonalHandle(ctx!, HANDLE_SIZE, baseSquareColor);
      ctx!.restore();

      // rotate handle (top-center)
      ctx!.save();
      ctx!.translate(mh.rotateHandle.x, mh.rotateHandle.y);
      ctx!.scale(1 / zoomFactor, 1 / zoomFactor);
      const baseCircleColor = THEME.palette[3] || THEME.preview || '#f59e0b';
      ctx!.beginPath();
      ctx!.fillStyle = hexToRgba(baseCircleColor, 0.33);
      ctx!.arc(0, 0, HANDLE_SIZE / 2 + HANDLE_HIT_PAD, 0, Math.PI * 2);
      ctx!.fill();
      drawRotateIcon(ctx!, Math.max(10, Math.min(HANDLE_SIZE, 14)), baseCircleColor);
      ctx!.restore();
    }
  }

  // Interaction handles and rotate helpers (delegated to renderer)
  renderInteractionHelpers(ctx!, model, {
    mode,
    hasMultiSelection,
    getMultiHandles,
    rotatingMulti,
    activeAxisSnaps,
    zoomFactor,
    THEME,
    HANDLE_SIZE,
    HANDLE_HIT_PAD,
    hexToRgba,
    drawDiagonalHandle,
    drawRotateIcon,
    selectedLineIndex,
    getLineHandle,
    getLineRotateHandle
  } as any);

  if (document.getElementById('debugPanel')?.getAttribute('data-visible') === 'true') {
    drawDebugLabels();
  }
  renderDebugPanel();
}

function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  draw();
}

const nowTime = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

const currentInkColor = () => styleColorInput?.value ?? THEME.defaultStroke;

const pointerPressure = (ev: PointerEvent) => {
  const raw = Number(ev.pressure);
  if (!Number.isFinite(raw) || raw <= 0) return INK_PRESSURE_FALLBACK;
  return clamp(raw, 0.05, 1);
};

function createInkPoint(ev: PointerEvent): InkPoint {
  const pos = toPoint(ev);
  return {
    x: pos.x,
    y: pos.y,
    pressure: pointerPressure(ev),
    time: nowTime()
  };
}

function beginInkStroke(ev: PointerEvent) {
  if (!canvas) return;
  const point = createInkPoint(ev);
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `ink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const stroke: InkStroke = {
    id,
    points: [point],
    color: currentInkColor(),
    baseWidth: inkBaseWidth,
    opacity: highlighterActive ? highlighterAlpha : undefined
  };
  model.inkStrokes.push(stroke);
  activeInkStroke = { pointerId: ev.pointerId, stroke };
  clearSelectionState();
  updateSelectionButtons();
  movedDuringDrag = true;
  try {
    canvas.setPointerCapture(ev.pointerId);
  } catch {
    /* ignore capture errors */
  }
  ev.preventDefault();
  draw();
}

// Initialize UI refs and mirror into legacy top-level variables for
// backward-compatibility. Calling here keeps the existing code working
// while allowing gradual migration to `uiRefs`.
try {
  initUi();
  // mirror a few common refs
  strokeColorInput = uiRefs.strokeColorInput;
  modeAddBtn = uiRefs.modeAddBtn;
  modeMoveBtn = uiRefs.modeMoveBtn;
  modeMultiselectBtn = uiRefs.modeMultiselectBtn;
  modeSegmentBtn = uiRefs.modeSegmentBtn;
  modeParallelBtn = uiRefs.modeParallelBtn;
  modePerpBtn = uiRefs.modePerpBtn;
  modeCircleThreeBtn = uiRefs.modeCircleThreeBtn;
  modeTriangleBtn = uiRefs.modeTriangleBtn;
  modeSquareBtn = uiRefs.modeSquareBtn;
  // mirror selection state for incremental migration
  selectedPointIndex = selectionState.selectedPointIndex;
  selectedLineIndex = selectionState.selectedLineIndex;
  selectedCircleIndex = selectionState.selectedCircleIndex;
  selectedAngleIndex = selectionState.selectedAngleIndex;
  selectedPolygonIndex = selectionState.selectedPolygonIndex;
  selectedInkStrokeIndex = selectionState.selectedInkStrokeIndex;
  selectedLabel = selectionState.selectedLabel;
  // Point the central selectionState at the same Set instances used by main.ts
  selectionState.multiSelectedPoints = multiSelectedPoints;
  selectionState.multiSelectedLines = multiSelectedLines;
  selectionState.multiSelectedCircles = multiSelectedCircles;
  selectionState.multiSelectedAngles = multiSelectedAngles;
  selectionState.multiSelectedPolygons = multiSelectedPolygons;
  selectionState.multiSelectedInkStrokes = multiSelectedInkStrokes;
  selectionState.multiSelectedLabels = multiSelectedLabels;
  // mirror interaction state for incremental migration
  // Make interactionState share the same mutable objects/maps used by main.ts
  interactionState.isPanning = isPanning;
  interactionState.panStart = panStart;
  interactionState.panOffset = panOffset;
  interactionState.panStartOffset = panStartOffset;
  interactionState.pendingPanCandidate = pendingPanCandidate;
  interactionState.zoomFactor = zoomFactor;
  interactionState.activeTouches = activeTouches;
  interactionState.inkBaseWidth = inkBaseWidth;
  interactionState.activeInkStroke = activeInkStroke;
  interactionState.pinchState = pinchState;
  interactionState.circleDragContext = circleDragContext;
  interactionState.polygonDragContext = polygonDragContext;
  interactionState.draggingSelection = draggingSelection;
  interactionState.draggingMultiSelection = draggingMultiSelection;
  interactionState.dragStart = dragStart;
  interactionState.resizingMulti = resizingMulti;
  interactionState.rotatingMulti = rotatingMulti;
  interactionState.resizingLine = resizingLine;
  interactionState.rotatingLine = rotatingLine;
  interactionState.resizingCircle = resizingCircle;
  interactionState.rotatingCircle = rotatingCircle;
  interactionState.lineDragContext = lineDragContext;
  interactionState.stickyTool = stickyTool;
  // Mirror view-related flags and DOM refs into viewState for incremental migration
  viewState.currentTheme = currentTheme;
  viewState.showHidden = showHidden;
  viewState.showMeasurements = showMeasurements;
  viewState.zoomMenuOpen = zoomMenuOpen;
  viewState.zoomMenuBtn = zoomMenuBtn;
  viewState.zoomMenuContainer = zoomMenuContainer;
  viewState.showHiddenBtn = showHiddenBtn;
  viewState.showMeasurementsBtn = showMeasurementsBtn;
  viewState.viewModeOpen = viewModeOpen;
  viewState.rayModeOpen = rayModeOpen;
  viewState.themeDarkBtn = themeDarkBtn;
} catch (e) {
  // ignore: DOM may not be ready at import time in some test environments
}

function appendInkStrokePoint(ev: PointerEvent) {
  if (!activeInkStroke || activeInkStroke.pointerId !== ev.pointerId) return;
  const { stroke } = activeInkStroke;
  const next = createInkPoint(ev);
  const points = stroke.points;
  if (points.length) {
    const prev = points[points.length - 1];
    const dx = (next.x - prev.x) * zoomFactor;
    const dy = (next.y - prev.y) * zoomFactor;
    const dist = Math.hypot(dx, dy);
    if (dist < INK_MIN_SAMPLE_PX) {
      points[points.length - 1] = next;
      ev.preventDefault();
      draw();
      return;
    }
  }
  points.push(next);
  movedDuringDrag = true;
  ev.preventDefault();
  draw();
}

function endInkStroke(pointerId: number) {
  if (!activeInkStroke || activeInkStroke.pointerId !== pointerId) return;
  const { stroke } = activeInkStroke;
  if (stroke.points.length === 1) {
    const pt = stroke.points[0];
    stroke.points[0] = { ...pt, pressure: Math.max(pt.pressure, 0.5), time: pt.time };
  }
  try {
    canvas?.releasePointerCapture(pointerId);
  } catch {
    /* ignore release errors */
  }
  activeInkStroke = null;
}

function setMode(next: Mode) {
  // No special handling needed for measurements anymore
  
  // If switching to midpoint, proactively clear any existing selection (e.g., a selected polygon)
  // so the midpoint tool waits for the user to click a segment or two points.
  if (next === 'midpoint') {
    clearMultiSelection();
    selectedPointIndex = null;
    selectedLineIndex = null;
    selectedCircleIndex = null;
    selectedPolygonIndex = null;
    selectedAngleIndex = null;
    selectedInkStrokeIndex = null;
    selectedLabel = null;
    selectedSegments.clear();
    selectedArcSegments.clear();
    multiSelectedPoints.clear();
    multiSelectedLines.clear();
    multiSelectedCircles.clear();
    multiSelectedAngles.clear();
    multiSelectedPolygons.clear();
    multiSelectedInkStrokes.clear();
    updateSelectionButtons();
    draw();
  }

  const previousMode = mode;
  mode = next;
  if (next === 'label') {
    if (previousMode !== 'label') {
      pointLabelToolsEnabled = !hasAnySelection();
    }
  } else if (previousMode === 'label') {
    pointLabelToolsEnabled = false;
  }
  updatePointLabelToolButtons();
  
  // Wyłącz tryb kopiowania stylu przy zmianie narzędzia (ale nie gdy wracamy do 'move')
  if (copyStyleActive && next !== 'move') {
    copyStyleActive = false;
  }
  
  // Reset multi-buttons to main function when switching tools
  Object.entries(buttonConfig.multiButtons).forEach(([mainId, buttonIds]) => {
    const currentIndex = multiButtonStates[mainId] || 0;
    
    // If we're not on the main (first) function, reset to it
    if (currentIndex !== 0) {
      const currentToolId = buttonIds[currentIndex];
      const currentTool = TOOL_BUTTONS.find(t => t.id === currentToolId);
      
      // Check if we're leaving this tool
      let leavingThisTool = false;
      if (currentToolId === 'copyStyleBtn') {
        // copyStyleBtn is being deactivated above if mode !== 'move'
        leavingThisTool = next !== 'move';
      } else if (currentTool) {
        leavingThisTool = next !== currentTool.mode;
      }
      
      if (leavingThisTool) {
        // Reset to main function
        multiButtonStates[mainId] = 0;
        
        // Update button visual
        const mainBtn = document.getElementById(mainId);
        if (mainBtn) {
          const firstToolId = buttonIds[0];
          const firstTool = TOOL_BUTTONS.find(t => t.id === firstToolId);
          
          if (firstTool) {
            const svgElement = mainBtn.querySelector('svg');
            if (svgElement) {
              svgElement.setAttribute('viewBox', firstTool.viewBox);
              svgElement.innerHTML = firstTool.icon;
            }
            mainBtn.setAttribute('title', firstTool.label);
            mainBtn.setAttribute('aria-label', firstTool.label);
          }
        }
      }
    }
  });
  
  // Hide second row if switching to a mode that's not in the current second row
  if (secondRowVisible && secondRowToolIds.length > 0) {
    const currentToolButton = TOOL_BUTTONS.find(t => t.mode === mode);
    if (currentToolButton && !secondRowToolIds.includes(currentToolButton.id)) {
      hideSecondRow();
    }
  }
  
  // Update active states in second row if visible
  updateSecondRowActiveStates();
  
  // Clear all selections when changing mode (except multiselect itself)
  if (mode !== 'multiselect') {
    clearMultiSelection();
  }
  
  // For segment mode, capture selected point BEFORE clearing if coming from move mode
  // REMOVED: We don't want to use selected point as segment start
  
  // Clear single selections early (but not for 'move' or 'label' mode)
  if (mode !== 'move' && mode !== 'label') {
    selectedPointIndex = null;
    selectedLineIndex = null;
    selectedCircleIndex = null;
    selectedPolygonIndex = null;
    selectedAngleIndex = null;
    selectedInkStrokeIndex = null;
    selectedLabel = null;
    selectedSegments.clear();
    selectedArcSegments.clear();
  }
  
  if (mode !== 'segment') {
    segmentStartIndex = null;
    segmentStartTemporary = false;
  } else {
    // Switching TO segment mode - always clear start point
    segmentStartIndex = null;
    segmentStartTemporary = false;
  }
  if (mode === 'circle') {
    circleCenterIndex = null;
    pendingCircleRadiusPoint = null;
    updateSelectionButtons();
  }
  if (mode !== 'parallel' && mode !== 'perpendicular' && mode !== 'circle') {
    pendingParallelLine = null;
    pendingParallelPoint = null;
    circleCenterIndex = null;
    pendingCircleRadiusPoint = null;
    pendingCircleRadiusLength = null;
    circleThreePoints = [];
    triangleStartIndex = null;
    squareStartIndex = null;
    polygonChain = [];
    currentPolygonLines = [];
    angleFirstLeg = null;
    anglePoints = [];
    bisectorFirstLeg = null;
    bisectPointVertexIndex = null;
    bisectPointFirstSeg = null;
    midpointFirstIndex = null;
    symmetricSourceIndex = null;
  }
  if (mode !== 'parallelLine') {
    parallelAnchorPointIndex = null;
    parallelReferenceLineIndex = null;
  }
  if (mode !== 'tangent') {
    tangentPendingPoint = null;
    tangentPendingCircle = null;
  }
  if (mode !== 'perpBisector') {
    perpBisectorFirstPoint = null;
    perpBisectorSecondPoint = null;
    perpBisectorLine = null;
  }
  if (activeInkStroke && mode !== 'handwriting') {
    activeInkStroke = null;
  }
  if (eraserActive && mode !== 'handwriting') {
    eraserActive = false;
    if (eraserBtn) {
      eraserBtn.classList.remove('active');
      eraserBtn.setAttribute('aria-pressed', 'false');
    }
  }
  
  // Handle LABEL mode - add labels to selected objects and switch back to move
  if (mode === 'label') {
    const color = styleColorInput?.value || '#000';
    let changed = false;
    
    const polygonHasLabels = (polyIdx: number | null) => {
      if (polyIdx === null) return false;
      const verts = polygonVerticesOrdered(polyIdx);
      return verts.length > 0 && verts.every((vi) => !!model.points[vi]?.label);
    };
    
    // Add label to selected angle
    if (selectedAngleIndex !== null) {
      if (!model.angles[selectedAngleIndex].label) {
        const { text, seq } = nextGreek();
        model.angles[selectedAngleIndex].label = {
          text,
          color,
          offset: defaultAngleLabelOffset(selectedAngleIndex),
          fontSize: 0,
          seq
        };
        changed = true;
      }
    }
    // Add labels to selected polygon or line
    else if (selectedPolygonIndex !== null || selectedLineIndex !== null) {
      // Determine what to label based on selection mode
      const shouldLabelEdges = selectionEdges || selectedSegments.size > 0;
      const shouldLabelVertices = selectionVertices;
      
      if (selectedPolygonIndex !== null) {
        // Label polygon edges if selected
        if (shouldLabelEdges && selectedSegments.size > 0) {
          selectedSegments.forEach((key) => {
            const parsed = parseSegmentKey(key);
            if (!parsed || parsed.part !== 'segment') return;
            const li = parsed.line;
            if (!model.lines[li]) return;
            if (!model.lines[li].label) {
              const { text, seq } = nextLower();
              model.lines[li].label = {
                text,
                color,
                offset: defaultLineLabelOffset(li),
                fontSize: 0,
                seq
              };
              changed = true;
            }
          });
        }
        
        // Label polygon vertices - always label if not all vertices have labels
        // But only if we are not in specific edge selection mode (or if vertices are explicitly selected)
        if ((selectedSegments.size === 0 || shouldLabelVertices) && !polygonHasLabels(selectedPolygonIndex)) {
        // Label all vertices
        const verts = polygonVerticesOrdered(selectedPolygonIndex);
        
        // Check if any vertex already has a label
        let baseLabel: string | null = null;
        let startIndex = 1;
        let labeledVertexPosition = -1;
        let isLetterPattern = false;
        
        for (let i = 0; i < verts.length; i++) {
          const vi = verts[i];
          const existingLabel = model.points[vi]?.label?.text;
          if (existingLabel) {
            // Check for pattern: "base_number" (e.g., "P_1", "A_12")
            const subscriptMatch = existingLabel.match(/^(.+?)_(\d+)$/);
            if (subscriptMatch) {
              baseLabel = subscriptMatch[1];
              startIndex = parseInt(subscriptMatch[2], 10);
              labeledVertexPosition = i;
              isLetterPattern = false;
              break;
            }
            // Check for single uppercase letter pattern (e.g., "A", "B", "C")
            else if (existingLabel.length === 1) {
              const upperIdx = UPPER_SEQ.indexOf(existingLabel);
              if (upperIdx >= 0) {
                startIndex = upperIdx;
                labeledVertexPosition = i;
                isLetterPattern = true;
                break;
              }
            }
          }
        }
        
        if (isLetterPattern && labeledVertexPosition >= 0) {
          // Use letter sequence pattern (UPPER_SEQ)
          verts.forEach((vi, i) => {
            if (!model.points[vi].label) {
              const offset = (i - labeledVertexPosition + verts.length) % verts.length;
              const letterIdx = (startIndex + offset) % UPPER_SEQ.length;
              const text = UPPER_SEQ[letterIdx];
              model.points[vi].label = {
                text,
                color,
                offset: defaultPointLabelOffset(vi),
                fontSize: 0,
                seq: undefined // Custom label, no sequence
              };
            }
          });
          changed = true;
        } else if (baseLabel && labeledVertexPosition >= 0) {
          // Use the subscript pattern found, numbering in reverse direction from the labeled vertex
          verts.forEach((vi, i) => {
            if (!model.points[vi].label) {
              const offset = (labeledVertexPosition - i + verts.length) % verts.length;
              const index = ((startIndex - 1 + offset) % verts.length) + 1;
              const text = `${baseLabel}_${index}`;
              model.points[vi].label = {
                text,
                color,
                offset: defaultPointLabelOffset(vi),
                fontSize: 0,
                seq: undefined // Custom label, no sequence
              };
            }
          });
          changed = true;
        } else {
          // Default behavior - use sequential uppercase letters
          verts.forEach((vi) => {
            const { text, seq } = nextUpper();
            model.points[vi].label = {
              text,
              color,
              offset: defaultPointLabelOffset(vi),
              fontSize: 0,
              seq
            };
          });
          changed = verts.length > 0;
        }
        }
      } else if (selectedLineIndex !== null) {
        // Label line edges (segments)
        if (shouldLabelEdges && !model.lines[selectedLineIndex].label) {
          const { text, seq } = nextLower();
          model.lines[selectedLineIndex].label = {
            text,
            color,
            offset: defaultLineLabelOffset(selectedLineIndex),
            fontSize: 0,
            seq
          };
          changed = true;
        }
        // Label line vertices (endpoints)
        if (shouldLabelVertices) {
          const line = model.lines[selectedLineIndex];
          if (line && line.defining_points) {
            line.defining_points.forEach(pIdx => {
              if (!model.points[pIdx].label) {
                const { text, seq } = nextUpper();
                model.points[pIdx].label = {
                  text,
                  color,
                  offset: defaultPointLabelOffset(pIdx),
                  fontSize: 0,
                  seq
                };
                changed = true;
              }
            });
          }
        }
      }
    }
    // Add label to selected point
    else if (selectedPointIndex !== null) {
      if (!model.points[selectedPointIndex].label) {
        const { text, seq } = nextUpper();
        model.points[selectedPointIndex].label = {
          text,
          color,
          offset: defaultPointLabelOffset(selectedPointIndex),
          fontSize: 0,
          seq
        };
        changed = true;
      }
    }
    
    // If we added a label to a selected object, switch back to move mode
    if (changed) {
      pushHistory();
      mode = 'move';
      updateToolButtons();
      draw();
      return;
    }
    // Otherwise stay in label mode and wait for user to click on an object
  }
  
  updateToolButtons();
  draw();
}

function createNgonFromBase() {
  if (squareStartIndex === null || ngonSecondIndex === null) return;
  const aIdx = squareStartIndex;
  const bIdx = ngonSecondIndex;
  const a = model.points[aIdx];
  const b = model.points[bIdx];
  if (!a || !b) return;

  const base = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(base.x, base.y) || 1;
  let perp = { x: -base.y / len, y: base.x / len };
  if (perp.y > 0) {
    perp = { x: -perp.x, y: -perp.y };
  }
  const side = len;
  const R = side / (2 * Math.sin(Math.PI / ngonSides));
  const apothem = side / (2 * Math.tan(Math.PI / ngonSides));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const center = { x: mid.x + perp.x * apothem, y: mid.y + perp.y * apothem };
  const angA = Math.atan2(a.y - center.y, a.x - center.x);
  const angB = Math.atan2(b.y - center.y, b.x - center.x);
  const stepAngle = (2 * Math.PI) / ngonSides;
  const ccwDiff = (angB - angA + Math.PI * 2) % (Math.PI * 2);
  const cwDiff = (angA - angB + Math.PI * 2) % (Math.PI * 2);
  const useCcw = Math.abs(ccwDiff - stepAngle) <= Math.abs(cwDiff - stepAngle);
  const signedStep = useCcw ? stepAngle : -stepAngle;
  const startAng = angA;
  const coords: { x: number; y: number }[] = [];
  for (let i = 0; i < ngonSides; i++) {
    const ang = startAng + i * signedStep;
    coords.push({ x: center.x + Math.cos(ang) * R, y: center.y + Math.sin(ang) * R });
  }
  const verts: number[] = [];
  for (let i = 0; i < coords.length; i++) {
    if (i === 0) {
      verts.push(aIdx);
      continue;
    }
    if (i === 1) {
      verts.push(bIdx);
      continue;
    }
    const p = coords[i];
    const idx = addPoint(model, { ...p, style: currentPointStyle() });
    verts.push(idx);
  }
  const style = currentStrokeStyle();
  const polyLines: number[] = [];
  for (let i = 0; i < verts.length; i++) {
    const u = verts[i];
    const v = verts[(i + 1) % verts.length];
    const l = addLineFromPoints(model, u, v, style);
    polyLines.push(l);
  }
  const newPolyIdx = createPolygon(polyLines, 'free');
  squareStartIndex = null;
  ngonSecondIndex = null;
  selectedPolygonIndex = newPolyIdx;
  selectedLineIndex = polyLines[0];
  selectedPointIndex = null;
  draw();
  pushHistory();
  maybeRevertMode();
  updateSelectionButtons();
}

function ensureSegment(p1: number, p2: number): { line: number; seg: number } {
  // Check if segment exists
  for (let i = 0; i < model.lines.length; i++) {
    const line = model.lines[i];
    for (let j = 0; j < line.points.length - 1; j++) {
      const a = line.points[j];
      const b = line.points[j + 1];
      if ((a === p1 && b === p2) || (a === p2 && b === p1)) {
        return { line: i, seg: j };
      }
    }
  }
  // Create new line
  const lineIdx = addLineFromPoints(model, p1, p2, currentStrokeStyle());
  return { line: lineIdx, seg: 0 };
}

function handleCanvasClick(ev: PointerEvent) {
  if (!canvas) return;

  if (ev.pointerType === 'touch') {
    updateTouchPointFromEvent(ev);
    try {
      canvas!.setPointerCapture(ev.pointerId);
    } catch (_) {
      /* ignore capture errors */
    }
    if (activeTouches.size >= 2) {
      if (!pinchState) startPinchFromTouches();
      ev.preventDefault();
      return;
    }
  }
  if (mode === 'handwriting') {
    if (eraserActive) {
      eraserLastStrokeId = null;
      eraserChangedDuringDrag = false;
      eraseInkStrokeAtPoint(toPoint(ev));
      return;
    }
    beginInkStroke(ev);
    return;
  }
  const { x, y } = toPoint(ev);
  // Early check: if we're in multiselect and user pressed a group handle, start transform immediately
  if (mode === 'multiselect' && hasMultiSelection()) {
    const padWorld = screenUnits(HANDLE_SIZE / 2 + HANDLE_HIT_PAD);
    const mh = getMultiHandles();
    if (mh) {
      const dxs = x - mh.scaleHandle.x;
      const dys = y - mh.scaleHandle.y;
      if (Math.hypot(dxs, dys) <= padWorld) {
        // collect points
        const ptsSet = new Set<number>();
        multiSelectedPoints.forEach(i => ptsSet.add(i));
        multiSelectedLines.forEach(li => model.lines[li]?.points.forEach(pi => ptsSet.add(pi)));
        multiSelectedCircles.forEach(ci => {
          const c = model.circles[ci]; if (!c) return; ptsSet.add(c.center); if (c.radius_point !== undefined) ptsSet.add(c.radius_point); c.points.forEach(pi => ptsSet.add(pi));
        });
        multiSelectedAngles.forEach(ai => { const a = model.angles[ai]; if (a) ptsSet.add(a.vertex); });
        const vectors = Array.from(ptsSet).map(idx => { const p = model.points[idx]; return { idx, vx: p.x - mh.center.x, vy: p.y - mh.center.y, dist: Math.hypot(p.x - mh.center.x, p.y - mh.center.y) }; });
        const startHandleDist = Math.hypot(x - mh.center.x, y - mh.center.y) || 1;
        resizingMulti = { center: mh.center, vectors, startHandleDist };
        try { canvas?.setPointerCapture(ev.pointerId); } catch {}
        draggingMultiSelection = true;
        movedDuringDrag = false;
        updateSelectionButtons(); draw(); return;
      }
      const dxr = x - mh.rotateHandle.x;
      const dyr = y - mh.rotateHandle.y;
      if (Math.hypot(dxr, dyr) <= padWorld) {
        const ptsSet = new Set<number>();
        multiSelectedPoints.forEach(i => ptsSet.add(i));
        multiSelectedLines.forEach(li => model.lines[li]?.points.forEach(pi => ptsSet.add(pi)));
        multiSelectedCircles.forEach(ci => {
          const c = model.circles[ci]; if (!c) return; ptsSet.add(c.center); if (c.radius_point !== undefined) ptsSet.add(c.radius_point); c.points.forEach(pi => ptsSet.add(pi));
        });
        multiSelectedAngles.forEach(ai => { const a = model.angles[ai]; if (a) ptsSet.add(a.vertex); });
        const vectors = Array.from(ptsSet).map(idx => { const p = model.points[idx]; return { idx, vx: p.x - mh.center.x, vy: p.y - mh.center.y }; });
        const startAngle = Math.atan2(y - mh.center.y, x - mh.center.x);
        rotatingMulti = { center: mh.center, vectors, startAngle };
        try { canvas?.setPointerCapture(ev.pointerId); } catch {}
        draggingMultiSelection = true;
        movedDuringDrag = false;
        updateSelectionButtons(); draw(); return;
      }
    }
  }
  draggingCircleCenterAngles = null;
  circleDragContext = null;
  
  // Check for measurement label clicks (works in any mode when measurements are shown)
  if (showMeasurements) {
    const measurementLabelHit = measurementLabels.find(label => {
      const dx = label.pos.x - x;
      const dy = label.pos.y - y;
      const dist = Math.hypot(dx, dy);
      return dist <= screenUnits(LABEL_HIT_RADIUS);
    });
    
    if (measurementLabelHit && measurementLabelHit.kind === 'segment') {
      const text = getMeasurementLabelText(measurementLabelHit);
      const isEmpty = text === '—' || text === '';
      
      // For empty labels or pinned labels on double-click: show input box
      if (isEmpty || (measurementLabelHit.pinned && ev.detail === 2)) {
        ev.preventDefault();
        ev.stopPropagation();
        showMeasurementInputBox(measurementLabelHit);
        return;
      }
      
      // For filled labels: toggle pinned state (mark/unmark)
      if (!isEmpty) {
        measurementLabelHit.pinned = !measurementLabelHit.pinned;
        if (measurementLabelHit.pinned) {
          measurementLabelHit.color = '#fbbf24';
        } else {
          measurementLabelHit.color = THEME.defaultStroke;
        }
        draw();
        return;
      }
    }
    
    if (measurementLabelHit && measurementLabelHit.kind === 'angle') {
      // For angles: toggle pinned state or edit on double-click
      if (ev.detail === 2) {
        ev.preventDefault();
        ev.stopPropagation();
        showMeasurementInputBox(measurementLabelHit);
        return;
      }
      
      measurementLabelHit.pinned = !measurementLabelHit.pinned;
      if (measurementLabelHit.pinned) {
        measurementLabelHit.color = '#fbbf24';
      } else {
        measurementLabelHit.color = THEME.defaultStroke;
      }
      draw();
      return;
    }
  }
  
    if (mode === 'move') {
      const labelHit = findLabelAt({ x, y });
      if (labelHit) {
        // If copy-style mode is active, don't start label drag/selection here —
        // allow the copy/paste handler later in the function to apply the style.
        if (copyStyleActive && copiedStyle) {
          // do not handle label dragging/selection now
        } else {
      // detect double-click (mouse) or double-tap (touch) to open style menu and focus textarea
      let isDoubleClick = ev.detail === 2;
      let isDoubleTap = false;
      if (!isDoubleClick && ev.pointerType === 'touch') {
        const now = Date.now();
        const rect = canvas.getBoundingClientRect();
        const cx = ev.clientX - rect.left;
        const cy = ev.clientY - rect.top;
        if (lastLabelTouchTap && now - lastLabelTouchTap.t < 400) {
          const dx = cx - lastLabelTouchTap.x;
          const dy = cy - lastLabelTouchTap.y;
          if (Math.hypot(dx, dy) < 24) isDoubleTap = true;
          lastLabelTouchTap = null;
        } else {
          lastLabelTouchTap = { t: now, x: cx, y: cy };
          setTimeout(() => {
            if (lastLabelTouchTap && Date.now() - lastLabelTouchTap.t >= 400) lastLabelTouchTap = null;
          }, 400);
        }
      }

      if (isDoubleClick || isDoubleTap) {
        ev.preventDefault();
        ev.stopPropagation();
        selectLabel(labelHit);
        openStyleMenu();
        setTimeout(() => {
          if (labelTextInput) {
            labelTextInput.focus();
            // ensure autosize runs if needed
            labelTextInput.dispatchEvent(new Event('input'));
          }
        }, 50);
        return;
      }

      selectLabel(labelHit);
      let initialOffset = { x: 0, y: 0 };
      switch (labelHit.kind) {
        case 'point': {
          const p = model.points[labelHit.id];
          if (p?.label) {
            if (!p.label.offset) p.label.offset = defaultPointLabelOffset(labelHit.id);
            initialOffset = p.label.offset ?? { x: 0, y: 0 };
          }
          break;
        }
        case 'line': {
          const l = model.lines[labelHit.id];
          if (l?.label) {
            if (!l.label.offset) l.label.offset = defaultLineLabelOffset(labelHit.id);
            initialOffset = l.label.offset ?? { x: 0, y: 0 };
          }
          break;
        }
        case 'angle': {
          const a = model.angles[labelHit.id];
          if (a?.label) {
            if (!a.label.offset) a.label.offset = defaultAngleLabelOffset(labelHit.id);
            initialOffset = a.label.offset ?? { x: 0, y: 0 };
          }
          break;
        }
        case 'free': {
          const lab = model.labels[labelHit.id];
          if (lab) initialOffset = { x: lab.pos.x, y: lab.pos.y };
          break;
        }
      }
      draggingLabel = {
        kind: labelHit.kind,
        id: labelHit.id,
        start: { x, y },
        initialOffset: { ...initialOffset }
      };
      movedDuringDrag = false;
      return;
      }
    } else if (selectedLabel) {
      selectLabel(null);
    }
  }
  if (mode === 'move') {
  let handleHit = findHandle({ x, y });
    // If a point is currently selected, don't activate line handles that belong to that point
    if (handleHit !== null && handleHit.kind === 'line' && selectedPointIndex !== null) {
      const maybeLine = model.lines[handleHit.idx];
      if (maybeLine && maybeLine.points.includes(selectedPointIndex)) {
        handleHit = null;
      }
    }
    if (handleHit !== null) {
      if (handleHit.kind === 'line') {
        const hitIdx = handleHit.idx;
        if (!isLineDraggable(model.lines[hitIdx])) {
          return;
        }
        const extent = lineExtent(hitIdx);
        if (extent) {
          const polyLines =
            selectedPolygonIndex !== null &&
            selectedSegments.size === 0 &&
            polygonHasLine(selectedPolygonIndex, hitIdx)
              ? polygonLines(selectedPolygonIndex)
              : [hitIdx];
          const pointSet = new Set<number>();
          polyLines.forEach((li) => {
            model.lines[li]?.points.forEach((pi) => pointSet.add(pi));
          });
          const pts = Array.from(pointSet).map((pi) => ({ idx: pi, p: model.points[pi] })).filter((e) => e.p);
          const center =
            pts.length > 0
              ? {
                  x: pts.reduce((sum, e) => sum + e.p.x, 0) / pts.length,
                  y: pts.reduce((sum, e) => sum + e.p.y, 0) / pts.length
                }
              : extent.center;

          if (handleHit.type === 'scale') {
            const vectors: { idx: number; vx: number; vy: number }[] = [];
            let baseHalf = extent.half;
            pts.forEach(({ idx: pi, p }) => {
              const vx = p.x - center.x;
              const vy = p.y - center.y;
              vectors.push({ idx: pi, vx, vy });
              const proj = vx * extent.dir.x + vy * extent.dir.y;
              baseHalf = Math.max(baseHalf, Math.abs(proj));
            });
            resizingLine = {
              lineIdx: hitIdx,
              center,
              dir: extent.dir,
              vectors: vectors.length
                ? vectors
                : extent.order.map((d) => ({
                    idx: d.idx,
                    vx: model.points[d.idx].x - extent.center.x,
                    vy: model.points[d.idx].y - extent.center.y
                  })),
              baseHalf: Math.max(1, baseHalf),
              lines: polyLines
            };
            updateSelectionButtons();
            draw();
            return;
          } else if (handleHit.type === 'rotate') {
            const vectors: { idx: number; vx: number; vy: number }[] = [];
            pts.forEach(({ idx: pi, p }) => {
              const vx = p.x - center.x;
              const vy = p.y - center.y;
              vectors.push({ idx: pi, vx, vy });
            });
            const startAngle = Math.atan2(y - center.y, x - center.x);
            rotatingLine = { lineIdx: hitIdx, center, vectors, startAngle, lines: polyLines };
            updateSelectionButtons();
            draw();
            return;
          }
        }
      } else if (handleHit.kind === 'circle') {
        const ci = handleHit.idx;
        const c = model.circles[ci];
        if (!c) return;
        const center = model.points[c.center];
        if (!center) return;
        if (handleHit.type === 'scale') {
          resizingCircle = { circleIdx: ci, center: { x: center.x, y: center.y }, startRadius: circleRadius(c) };
          updateSelectionButtons();
          draw();
          return;
        } else if (handleHit.type === 'rotate') {
          const startAngle = Math.atan2(y - center.y, x - center.x);
          const perim = circlePerimeterPoints(c);
          const vectors = perim
            .map((pid) => {
              const p = model.points[pid];
              if (!p) return null;
              return { idx: pid, vx: p.x - center.x, vy: p.y - center.y };
            })
            .filter((v): v is { idx: number; vx: number; vy: number } => v !== null);
          rotatingCircle = { circleIdx: ci, center: { x: center.x, y: center.y }, vectors, startAngle, radius: circleRadius(c) };
          updateSelectionButtons();
          draw();
          return;
        }
      }
    }
  }
  // Multiselect specific handle activation
  if (mode === 'multiselect') {
    let handleHit = findHandle({ x, y });
    if (handleHit && handleHit.kind === 'group') {
      const mh = getMultiHandles();
      if (!mh) return;
      const ptsSet = new Set<number>();
      multiSelectedPoints.forEach(i => ptsSet.add(i));
      multiSelectedLines.forEach(li => model.lines[li]?.points.forEach(pi => ptsSet.add(pi)));
      multiSelectedCircles.forEach(ci => {
        const c = model.circles[ci];
        if (!c) return;
        ptsSet.add(c.center);
        if (c.radius_point !== undefined) ptsSet.add(c.radius_point);
        c.points.forEach(pi => ptsSet.add(pi));
      });
      multiSelectedAngles.forEach(ai => { const a = model.angles[ai]; if (a) ptsSet.add(a.vertex); });
      const vectors = Array.from(ptsSet).map(idx => {
        const p = model.points[idx];
        return { idx, vx: p.x - mh.center.x, vy: p.y - mh.center.y, dist: Math.hypot(p.x - mh.center.x, p.y - mh.center.y) };
      });
      if (handleHit.type === 'scale') {
        // start uniform scale about center
        const startHandleDist = Math.hypot(x - mh.center.x, y - mh.center.y) || 1;
        resizingMulti = { center: mh.center, vectors, startHandleDist };
        try { canvas?.setPointerCapture(ev.pointerId); } catch {}
        draggingMultiSelection = true;
        movedDuringDrag = false;
        updateSelectionButtons();
        draw();
        return;
      } else if (handleHit.type === 'rotate') {
        const startAngle = Math.atan2(y - mh.center.y, x - mh.center.x);
        rotatingMulti = { center: mh.center, vectors: vectors.map(v => ({ idx: v.idx, vx: v.vx, vy: v.vy })), startAngle };
        try { canvas?.setPointerCapture(ev.pointerId); } catch {}
        draggingMultiSelection = true;
        movedDuringDrag = false;
        updateSelectionButtons();
        draw();
        return;
      }
    }
  }
  if (mode === 'add') {
    // ensure previous circle highlight is cleared when placing a new point
    selectedCircleIndex = null;
    const lineHits = findLineHits({ x, y });
    const circleHits = findCircles({ x, y }, currentHitRadius(), false);
    let desiredPos: { x: number; y: number } = { x, y };

    const lineAnchors = lineHits
      .map((h) => ({ hit: h, anchors: lineAnchorForHit(h), line: model.lines[h.line] }))
      .filter(
        (h): h is { hit: LineHit; anchors: { a: { x: number; y: number }; b: { x: number; y: number } }; line: Line } =>
          !!h.anchors && !!h.line
      );
    const circleAnchors = circleHits
      .map((h) => {
        const c = model.circles[h.circle];
        const cen = model.points[c?.center ?? -1];
        if (!c || !cen) return null;
        const radius = circleRadius(c);
        if (radius <= 1e-3) return null;
        // If the circle has explicit arcs, ensure the hit corresponds to a visible arc
        const arcHit = findArcAt({ x, y }, currentHitRadius(), h.circle);
        const arcsExist = circleArcs(h.circle).length > 0;
        if (arcsExist && !arcHit) {
          // The click is on the circumference but not on any visible arc -> ignore
          return null;
        }
        return { center: { x: cen.x, y: cen.y }, radius, idx: h.circle, id: c.id };
      })
      .filter((v): v is { center: { x: number; y: number }; radius: number; idx: number; id: string } => !!v);

    const candidates: { pos: { x: number; y: number }; parents: ConstructionParent[] }[] = [];
    // line-line
    for (let i = 0; i < lineAnchors.length; i++) {
      for (let j = i + 1; j < lineAnchors.length; j++) {
        const inter = intersectLines(
          lineAnchors[i].anchors.a,
          lineAnchors[i].anchors.b,
          lineAnchors[j].anchors.a,
          lineAnchors[j].anchors.b
        );
        const lineA = lineAnchors[i].line;
        const lineB = lineAnchors[j].line;
        if (inter && lineA && lineB) {
          candidates.push({
            pos: inter,
            parents: [
              { kind: 'line', id: lineA.id },
              { kind: 'line', id: lineB.id }
            ]
          });
        }
      }
    }
    // line-circle
    for (const l of lineAnchors) {
      for (const c of circleAnchors) {
        const inters = lineCircleIntersections(l.anchors.a, l.anchors.b, c.center, c.radius);
        const line = l.line;
        inters.forEach((pos) => {
          if (!line) return;
          candidates.push({
            pos,
            parents: [
              { kind: 'line', id: line.id },
              { kind: 'circle', id: c.id }
            ]
          });
        });
      }
    }
    // circle-circle
    for (let i = 0; i < circleAnchors.length; i++) {
      for (let j = i + 1; j < circleAnchors.length; j++) {
        const inters = circleCircleIntersections(
          circleAnchors[i].center,
          circleAnchors[i].radius,
          circleAnchors[j].center,
          circleAnchors[j].radius
        );
        inters.forEach((pos) =>
          candidates.push({
            pos,
            parents: [
              { kind: 'circle', id: circleAnchors[i].id },
              { kind: 'circle', id: circleAnchors[j].id }
            ]
          })
        );
      }
    }

    let pointParents: ConstructionParent[] = [];
    if (candidates.length) {
      candidates.sort(
        (a, b) => Math.hypot(a.pos.x - x, a.pos.y - y) - Math.hypot(b.pos.x - x, b.pos.y - y)
      );
      // Create a point for each intersection candidate that lies close to the click.
      const closestDist = Math.hypot(candidates[0].pos.x - x, candidates[0].pos.y - y);
      const tol = Math.max(currentHitRadius(), 4);
      const selectedCandidates = candidates.filter((c) => Math.hypot(c.pos.x - x, c.pos.y - y) <= closestDist + tol);

      // For each selected candidate, create a separate intersection point (two-parent point).
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      let firstIdx: number | null = null;
      for (const cand of selectedCandidates) {
        const pos = cand.pos;
        const parents = cand.parents;
        const idx = addPoint(model, {
          ...pos,
          style: currentPointStyle(),
          defining_parents: parents,
          created_group: batchId
        });

        // Attach to matching nearby line hits for this candidate
        if (lineHits.length) {
          const parentLineIds = new Set(parents.filter((p) => p.kind === 'line').map((p) => p.id));
          const hitsToAttach = parents.length
            ? lineHits.filter((hit) => {
                const line = model.lines[hit.line];
                return !!line && parentLineIds.has(line.id);
              })
            : lineHits;
          hitsToAttach.forEach((hit) => attachPointToLine(idx, hit, { x, y }, pos));
          if (hitsToAttach.length && firstIdx === null) selectedLineIndex = hitsToAttach[0].line;
        }

        // Attach to matching circle hits for this candidate
        if (circleHits.length) {
          const parentCircleIds = new Set(parents.filter((p) => p.kind === 'circle').map((p) => p.id));
          for (const hit of circleHits) {
            const ci = hit.circle;
            if (parentCircleIds.size && !parentCircleIds.has(model.circles[ci].id)) continue;
            const arcsExist = circleArcs(ci).length > 0;
            if (arcsExist) {
              const arcAtPos = findArcAt(pos, currentHitRadius(), ci);
              if (!arcAtPos) continue;
            }
            attachPointToCircle(ci, idx, pos);
          }
        }

        if (firstIdx === null) firstIdx = idx;
      }

      // Select the first created point
      if (firstIdx !== null) {
        desiredPos = candidates[0].pos;
        pointParents = candidates[0].parents;
        selectedPointIndex = firstIdx;
      }
    } else if (circleAnchors.length === 1) {
      const c = circleAnchors[0];
      const dir = normalize({ x: x - c.center.x, y: y - c.center.y });
      desiredPos = { x: c.center.x + dir.x * c.radius, y: c.center.y + dir.y * c.radius };
      pointParents = [{ kind: 'circle', id: c.id }];
    } else if (lineAnchors.length === 1) {
      desiredPos = projectPointOnLine({ x, y }, lineAnchors[0].anchors.a, lineAnchors[0].anchors.b);
      const line = lineAnchors[0].line;
      if (line) pointParents = [{ kind: 'line', id: line.id }];
    }
    // If no candidate intersections were created above, fall back to single-point creation
    if (!selectedPointIndex) {
      const idx = addPoint(model, { ...desiredPos, style: currentPointStyle(), defining_parents: pointParents });
      if (lineHits.length) {
        const parentLineIds = new Set(pointParents.filter((p) => p.kind === 'line').map((p) => p.id));
        const hitsToAttach = pointParents.length
          ? lineHits.filter((hit) => {
              const line = model.lines[hit.line];
              return !!line && parentLineIds.has(line.id);
            })
          : lineHits;
        hitsToAttach.forEach((hit) => attachPointToLine(idx, hit, { x, y }, desiredPos));
        if (hitsToAttach.length) selectedLineIndex = hitsToAttach[0].line;
      }
      if (circleHits.length) {
        for (const hit of circleHits) {
          const ci = hit.circle;
          const arcsExist = circleArcs(ci).length > 0;
          if (arcsExist) {
            const arcAtPos = findArcAt(desiredPos, currentHitRadius(), ci);
            if (!arcAtPos) continue;
          }
          attachPointToCircle(ci, idx, desiredPos);
        }
      }
      selectedPointIndex = idx;
    }
    if (!lineHits.length) selectedLineIndex = null;
    selectedCircleIndex = null;
    updateSelectionButtons();
    draw();
    pushHistory();
    if (stickyTool === null) {
      setMode('move');
    } else {
      updateToolButtons();
    }
  } else if (mode === 'segment') {
    const hit = findPoint({ x, y });
    const start = segmentStartIndex ?? selectedPointIndex;
    selectedCircleIndex = null; // drop circle highlight when starting a segment
    selectedAngleIndex = null; // drop angle highlight when starting a segment
    if (start === null) {
      const newStart = hit ?? addPoint(model, { x, y, style: currentPointStyle() });
      segmentStartIndex = newStart;
      segmentStartTemporary = hit === null;
      selectedPointIndex = newStart;
      selectedLineIndex = null;
      draw();
    } else {
      const startPt = model.points[start];
      const endIsExisting = hit !== null;
      const endPos = endIsExisting ? { x, y } : snapDir(startPt, { x, y });
      const endIdx = hit ?? addPoint(model, { ...endPos, style: currentPointStyle() });
      const endPt = model.points[endIdx];
      if (startPt && endPt && startPt.x === endPt.x && startPt.y === endPt.y) {
        if (!endIsExisting) {
          model.points.pop();
          rebuildIndexMaps();
        } else if (segmentStartTemporary) {
          removePointsKeepingOrder([start]);
        }
        segmentStartIndex = null;
        segmentStartTemporary = false;
        selectedPointIndex = null;
        selectedLineIndex = null;
        draw();
        updateSelectionButtons();
        return;
      }
      const stroke = currentStrokeStyle();
      const lineIdx = addLineFromPoints(model, start, endIdx, stroke);
      segmentStartIndex = null;
      segmentStartTemporary = false;
      selectedPointIndex = null;
      selectedLineIndex = lineIdx;
      draw();
      maybeRevertMode();
      updateSelectionButtons();
      pushHistory();
    }
  } else if (mode === 'parallel' || mode === 'perpendicular') {
    let hitPoint = findPoint({ x, y });
    const lineHits = findLineHits({ x, y });
    let hitLine: LineHit | null = null;
    if (lineHits.length) {
      if (pendingParallelPoint !== null) {
        hitLine =
          lineHits.find((h) => !model.lines[h.line]?.points.includes(pendingParallelPoint!)) ?? lineHits[0];
      } else {
        hitLine = lineHits[0];
      }
      if (!hitPoint && hitLine.part === 'segment') {
        const line = model.lines[hitLine.line];
        const aIdx = line.points[0];
        const bIdx = line.points[line.points.length - 1];
        const a = model.points[aIdx];
        const b = model.points[bIdx];
        const tol = currentHitRadius();
        if (a && Math.hypot(a.x - x, a.y - y) <= tol) hitPoint = aIdx;
        else if (b && Math.hypot(b.x - x, b.y - y) <= tol) hitPoint = bIdx;
      }
    }
    if (hitPoint !== null) {
      pendingParallelPoint = hitPoint;
      selectedPointIndex = hitPoint;
      selectedCircleIndex = null;
      // keep existing line selection if set previously
    } else if (pendingParallelPoint === null && selectedPointIndex !== null) {
      pendingParallelPoint = selectedPointIndex;
    }
    if (hitLine !== null) {
      if (hitPoint !== null && model.lines[hitLine.line]?.points.includes(hitPoint)) {
        // prefer point selection; avoid overriding with the same line
      } else {
        pendingParallelLine = hitLine.line;
        selectedLineIndex = hitLine.line;
        selectedCircleIndex = null;
      }
    } else if (pendingParallelLine === null && selectedLineIndex !== null) {
      pendingParallelLine = selectedLineIndex;
    }
    draw();
    if (pendingParallelPoint !== null && pendingParallelLine !== null) {
      const created = createOffsetLineThroughPoint(mode, pendingParallelPoint, pendingParallelLine);
      pendingParallelLine = null;
      pendingParallelPoint = null;
      if (created !== null) {
        selectedLineIndex = created;
        selectedPointIndex = null;
        draw();
        pushHistory();
        maybeRevertMode();
        updateSelectionButtons();
      }
    }
  } else if (mode === 'symmetric') {
    const sourceIdx = symmetricSourceIndex;
    const hitPoint = findPoint({ x, y });
    const lineHit = findLine({ x, y });
    if (sourceIdx === null) {
      if (hitPoint === null) return;
      symmetricSourceIndex = hitPoint;
      selectedPointIndex = hitPoint;
      draw();
      return;
    }
    const source = model.points[sourceIdx];
    if (!source) {
      symmetricSourceIndex = null;
      maybeRevertMode();
      updateSelectionButtons();
      return;
    }
    let target: { x: number; y: number } | null = null;
    let meta: SymmetricMeta | null = null;
    let parents: ConstructionParent[] = [];
    if (hitPoint !== null) {
      const mirror = model.points[hitPoint];
      if (!mirror) return;
      meta = { source: source.id, mirror: { kind: 'point', id: mirror.id } };
      target = { x: mirror.x * 2 - source.x, y: mirror.y * 2 - source.y };
    } else if (lineHit && (lineHit.part === 'segment' || lineHit.part === 'rayLeft' || lineHit.part === 'rayRight')) {
      const line = model.lines[lineHit.line];
      if (!line) return;
      meta = { source: source.id, mirror: { kind: 'line', id: line.id } };
      parents = [{ kind: 'line', id: line.id }];
      target = reflectPointAcrossLine(source, line);
    } else {
      return;
    }
    if (!meta || !target) return;
    const idx = addPoint(model, {
      ...target,
      style: symmetricPointStyle(),
      construction_kind: 'symmetric',
      defining_parents: parents,
      symmetric: meta
    });
    recomputeSymmetricPoint(idx);
    selectedPointIndex = idx;
    symmetricSourceIndex = null;
    draw();
    pushHistory();
    maybeRevertMode();
    updateSelectionButtons();
  } else if (mode === 'parallelLine') {
    const hitPoint = findPoint({ x, y });
    const lineHit = findLine({ x, y });
    const setAnchor = (idx: number) => {
      parallelAnchorPointIndex = idx;
      selectedPointIndex = idx;
      selectedLineIndex = null;
      draw();
    };
    if (parallelAnchorPointIndex === null) {
      if (hitPoint !== null) {
        setAnchor(hitPoint);
        return;
      }
      if (lineHit && lineHit.part === 'segment') {
        parallelReferenceLineIndex = lineHit.line;
        selectedLineIndex = lineHit.line;
        draw();
        return;
      }
      const idx = addPoint(model, { x, y, style: currentPointStyle() });
      setAnchor(idx);
      return;
    }
    if (parallelReferenceLineIndex === null) {
      if (lineHit && lineHit.part === 'segment') {
        parallelReferenceLineIndex = lineHit.line;
        selectedLineIndex = lineHit.line;
        const created = createParallelLineThroughPoint(parallelAnchorPointIndex, parallelReferenceLineIndex);
        parallelAnchorPointIndex = null;
        parallelReferenceLineIndex = null;
        if (created !== null) {
          selectedLineIndex = created;
          selectedPointIndex = null;
          draw();
          pushHistory();
          maybeRevertMode();
          updateSelectionButtons();
        } else {
          draw();
        }
        return;
      }
      if (hitPoint !== null) {
        setAnchor(hitPoint);
      }
      return;
    }
    // both anchor and reference already set; attempt creation
    const created = createParallelLineThroughPoint(parallelAnchorPointIndex, parallelReferenceLineIndex);
    parallelAnchorPointIndex = null;
    parallelReferenceLineIndex = null;
    if (created !== null) {
      selectedLineIndex = created;
      selectedPointIndex = null;
      draw();
      pushHistory();
      maybeRevertMode();
      updateSelectionButtons();
    } else {
      draw();
    }
  } else if (mode === 'tangent') {
    const hitPoint = findPoint({ x, y });
    // Prefer arc-aware hit detection: only accept a circle hit if the click falls on
    // a visible arc (when the circle has explicit arcs), otherwise accept full-circle hits.
    const rawCircleHits = findCircles({ x, y }, currentHitRadius(), false);
    let circleHit: CircleHit | null = null;
    for (const ch of rawCircleHits) {
      const ci = ch.circle;
      const arcsExist = circleArcs(ci).length > 0;
      if (!arcsExist) {
        circleHit = ch;
        break;
      }
      const arcAtPos = findArcAt({ x, y }, currentHitRadius(), ci);
      if (arcAtPos) {
        circleHit = { circle: ci };
        break;
      }
      // otherwise skip this circle because the circumference at this point is not on a visible arc
    }

    // User clicks point and circle in any order
    if (hitPoint !== null) {
      tangentPendingPoint = hitPoint;
      selectedPointIndex = hitPoint;
      if (tangentPendingCircle !== null) {
        // Both selected, create tangent
        createTangentConstruction(tangentPendingPoint, tangentPendingCircle);
        tangentPendingPoint = null;
        tangentPendingCircle = null;
        draw();
        pushHistory();
        maybeRevertMode();
        updateSelectionButtons();
      } else {
        // Only point selected so far
        selectedCircleIndex = null;
        draw();
      }
    } else if (circleHit !== null) {
      tangentPendingCircle = circleHit.circle;
      selectedCircleIndex = circleHit.circle;
      if (tangentPendingPoint !== null) {
        // Both selected, create tangent
        createTangentConstruction(tangentPendingPoint, tangentPendingCircle);
        tangentPendingPoint = null;
        tangentPendingCircle = null;
        draw();
        pushHistory();
        maybeRevertMode();
        updateSelectionButtons();
      } else {
        // Only circle selected so far
        selectedPointIndex = null;
        draw();
      }
    }
  } else if (mode === 'perpBisector') {
    const hitPoint = findPoint({ x, y });
    const lineHit = findLine({ x, y });

    // User can click two points or a line
    if (hitPoint !== null) {
      if (perpBisectorFirstPoint === null) {
        // First point selected
        perpBisectorFirstPoint = hitPoint;
        selectedPointIndex = hitPoint;
        selectedLineIndex = null;
        draw();
      } else if (perpBisectorSecondPoint === null && hitPoint !== perpBisectorFirstPoint) {
        // Second point selected, create perpendicular bisector
        perpBisectorSecondPoint = hitPoint;
        createPerpBisectorFromPoints(perpBisectorFirstPoint, perpBisectorSecondPoint);
        perpBisectorFirstPoint = null;
        perpBisectorSecondPoint = null;
        perpBisectorLine = null;
        draw();
        pushHistory();
        maybeRevertMode();
        updateSelectionButtons();
      }
    } else if (lineHit && lineHit.part === 'segment') {
      // Line segment selected, create perpendicular bisector
      perpBisectorLine = lineHit.line;
      createPerpBisectorFromLine(lineHit.line, lineHit.seg);
      perpBisectorFirstPoint = null;
      perpBisectorSecondPoint = null;
      perpBisectorLine = null;
      draw();
      pushHistory();
      maybeRevertMode();
      updateSelectionButtons();
    }
  } else if (mode === 'circle') {
    const hitPoint = findPoint({ x, y });
    const centerIdx = circleCenterIndex ?? hitPoint ?? addPoint(model, { x, y, style: currentPointStyle() });
    
    if (circleCenterIndex === null) {
      // First click: set center
      circleCenterIndex = centerIdx;
      selectedPointIndex = centerIdx;
      draw();
      return;
    }
    
    // Second click: create circle with radius point
    const radiusPointIdx =
      pendingCircleRadiusPoint ??
      (hitPoint !== null && hitPoint !== centerIdx ? hitPoint : null) ??
      addPoint(
        model,
        hitPoint === null
          ? { ...snapDir(model.points[centerIdx], { x, y }), style: currentPointStyle() }
          : { x, y, style: currentPointStyle() }
      );
    const center = model.points[centerIdx];
    const radiusPt = model.points[radiusPointIdx];
    const radius = Math.hypot(center.x - radiusPt.x, center.y - radiusPt.y);
    
    if (radius <= 1e-6) {
      // Radius too small, cancel and keep center selected
      if (hitPoint === null && pendingCircleRadiusPoint === null) {
        removePointsKeepingOrder([radiusPointIdx]);
      }
      pendingCircleRadiusPoint = null;
      selectedPointIndex = centerIdx;
      draw();
      updateSelectionButtons();
      return;
    }
    
    const circleIdx = addCircleWithCenter(centerIdx, radius, [radiusPointIdx]);
    selectedCircleIndex = circleIdx;
    selectedPointIndex = null;
    circleCenterIndex = null;
    pendingCircleRadiusPoint = null;
    draw();
    pushHistory();
    if (stickyTool === null) {
      setMode('move');
    } else {
      maybeRevertMode();
    }
    updateSelectionButtons();
  } else if (mode === 'circleThree') {
    selectedLineIndex = null;
    selectedPointIndex = null;
    selectedCircleIndex = null;
    selectedPolygonIndex = null;
    selectedAngleIndex = null;
    selectedLabel = null;
    selectedArcSegments.clear();
    selectedSegments.clear();
    updateSelectionButtons();
    const hitPoint = findPoint({ x, y });
    const ptIdx = hitPoint ?? addPoint(model, { x, y, style: currentPointStyle() });
    const prevLen = circleThreePoints.length;
    circleThreePoints.push(ptIdx);
    // Keep the first selected point highlighted when picking the second one
    if (prevLen === 0) {
      selectedPointIndex = ptIdx;
    } else {
      selectedPointIndex = circleThreePoints[0];
    }
    selectedLineIndex = null;
    selectedCircleIndex = null;
    if (circleThreePoints.length === 3) {
      const circleIdx = addCircleThroughPoints(circleThreePoints as [number, number, number]);
      if (circleIdx !== null) {
        selectedCircleIndex = circleIdx;
        selectedPointIndex = null;
        pushHistory();
        maybeRevertMode();
      }
      circleThreePoints = [];
    }
    draw();
    updateSelectionButtons();
  } else if (mode === 'triangleUp') {
    const hitPoint = findPoint({ x, y });
    if (triangleStartIndex === null) {
      const idx = hitPoint ?? addPoint(model, { x, y, style: currentPointStyle() });
      triangleStartIndex = idx;
      selectedPolygonIndex = null;
      selectedPointIndex = idx;
      selectedLineIndex = null;
      selectedCircleIndex = null;
      draw();
      return;
    }
    const baseStart = model.points[triangleStartIndex];
    const snappedPos = hitPoint !== null ? { x, y } : snapDir(baseStart, { x, y });
    const idx = hitPoint ?? addPoint(model, { ...snappedPos, style: currentPointStyle() });
    const aIdx = triangleStartIndex;
    const bIdx = idx;
    const a = model.points[aIdx];
    const b = model.points[bIdx];
    const base = { x: b.x - a.x, y: b.y - a.y };
    const len = Math.hypot(base.x, base.y) || 1;
    let perp = { x: -base.y / len, y: base.x / len };
    if (perp.y > 0) {
      perp = { x: -perp.x, y: -perp.y };
    }
    const height = (Math.sqrt(3) / 2) * len;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const apex = { x: mid.x + perp.x * height, y: mid.y + perp.y * height };
    const cIdx = addPoint(model, { ...apex, style: currentPointStyle() });
    const style = currentStrokeStyle();
    const l1 = addLineFromPoints(model, aIdx, bIdx, style);
    const l2 = addLineFromPoints(model, bIdx, cIdx, style);
    const l3 = addLineFromPoints(model, cIdx, aIdx, style);
    const polyLines = [l1, l2, l3];
    const newPolyIdx = createPolygon(polyLines, 'free');
    triangleStartIndex = null;
    selectedPolygonIndex = newPolyIdx;
    selectedLineIndex = polyLines[0];
    selectedPointIndex = null;
    draw();
    pushHistory();
    maybeRevertMode();
    updateSelectionButtons();
  } else if (mode === 'square') {
    const hitPoint = findPoint({ x, y });
    if (squareStartIndex === null) {
      const idx = hitPoint ?? addPoint(model, { x, y, style: currentPointStyle() });
      squareStartIndex = idx;
      selectedPolygonIndex = null;
      selectedPointIndex = idx;
      selectedLineIndex = null;
      selectedCircleIndex = null;
      draw();
      return;
    }
    const baseStart = model.points[squareStartIndex];
    const snappedPos = hitPoint !== null ? { x, y } : snapDir(baseStart, { x, y });
    const idx = hitPoint ?? addPoint(model, { ...snappedPos, style: currentPointStyle() });
    const aIdx = squareStartIndex;
    const bIdx = idx;
    const a = model.points[aIdx];
    const b = model.points[bIdx];
    const base = { x: b.x - a.x, y: b.y - a.y };
    const len = Math.hypot(base.x, base.y) || 1;
    let perp = { x: -base.y / len, y: base.x / len };
    if (perp.y > 0) {
      perp = { x: -perp.x, y: -perp.y };
    }
    const p3 = { x: b.x + perp.x * len, y: b.y + perp.y * len };
    const p4 = { x: a.x + perp.x * len, y: a.y + perp.y * len };
    const cIdx = addPoint(model, { ...p3, style: currentPointStyle() });
    const dIdx = addPoint(model, { ...p4, style: currentPointStyle() });
    const style = currentStrokeStyle();
    const l1 = addLineFromPoints(model, aIdx, bIdx, style);
    const l2 = addLineFromPoints(model, bIdx, cIdx, style);
    const l3 = addLineFromPoints(model, cIdx, dIdx, style);
    const l4 = addLineFromPoints(model, dIdx, aIdx, style);
    const polyLines = [l1, l2, l3, l4];
    const newPolyIdx = createPolygon(polyLines, 'free');
    squareStartIndex = null;
    selectedPolygonIndex = newPolyIdx;
    selectedLineIndex = polyLines[0];
    selectedPointIndex = null;
    draw();
    pushHistory();
    maybeRevertMode();
    updateSelectionButtons();
  } else if (mode === 'polygon') {
    const hitPoint = findPoint({ x, y });
    const wasTemporary = hitPoint === null;
    const idx =
      hitPoint ??
      addPoint(
        model,
        polygonChain.length === 1
          ? { ...snapDir(model.points[polygonChain[0]], { x, y }), style: currentPointStyle() }
          : { x, y, style: currentPointStyle() }
      );
    if (!polygonChain.length) {
      currentPolygonLines = [];
      polygonChain.push(idx);
      selectedPointIndex = idx;
      selectedLineIndex = null;
      selectedCircleIndex = null;
      selectedPolygonIndex = null;
      draw();
      return;
    }
    const firstIdx = polygonChain[0];
    const lastIdx = polygonChain[polygonChain.length - 1];
    const lastPt = model.points[lastIdx];
    const newPt = model.points[idx];
    if (lastPt && newPt && Math.hypot(lastPt.x - newPt.x, lastPt.y - newPt.y) <= 1e-6) {
      if (wasTemporary) removePointsKeepingOrder([idx]);
      selectedPointIndex = lastIdx;
      draw();
      return;
    }
    const style = currentStrokeStyle();
    const tol = currentHitRadius();
    if (
      idx === firstIdx ||
      Math.hypot(model.points[firstIdx].x - model.points[idx].x, model.points[firstIdx].y - model.points[idx].y) <= tol
    ) {
      const closingLine = addLineFromPoints(model, lastIdx, firstIdx, style);
      currentPolygonLines.push(closingLine);
      const polyId = nextId('polygon', model);
      const poly: Polygon = {
        object_type: 'polygon',
        id: polyId,
        lines: [...currentPolygonLines],
        construction_kind: 'free',
        defining_parents: [],
        recompute: () => {},
        on_parent_deleted: () => {}
      };
      const newPolyIdx = createPolygon(poly.lines, 'free');
      selectedPolygonIndex = newPolyIdx;
      selectedLineIndex = poly.lines[0];
      selectedPointIndex = null;
      polygonChain = [];
      currentPolygonLines = [];
      draw();
      pushHistory();
      maybeRevertMode();
      updateSelectionButtons();
    } else {
      const newLine = addLineFromPoints(model, lastIdx, idx, style);
      currentPolygonLines.push(newLine);
      polygonChain.push(idx);
      selectedPointIndex = idx;
      selectedLineIndex = newLine;
      draw();
      updateSelectionButtons();
    }
  } else if (mode === 'angle') {
    const pointHit = findPoint({ x, y });
    if (pointHit !== null) {
      // Clear line selection if we start selecting points
      if (angleFirstLeg) {
        angleFirstLeg = null;
        selectedSegments.clear();
      }
      
      // Avoid adding the same point twice in a row
      if (anglePoints.length === 0 || anglePoints[anglePoints.length - 1] !== pointHit) {
        anglePoints.push(pointHit);
      }
      
      selectedPointIndex = pointHit;
      selectedLineIndex = null;
      selectedSegments.clear();
      
      if (anglePoints.length === 3) {
        const [p1, p2, p3] = anglePoints;
        
        if (p1 === p3) {
          anglePoints = [];
          selectedPointIndex = null;
          draw();
          return;
        }

        // p2 is the vertex
        const seg1 = ensureSegment(p1, p2).line;
        const seg1LineId = typeof seg1 === 'number' ? model.lines[seg1]?.id ?? seg1 : seg1;
        const seg2 = ensureSegment(p2, p3).line;
        const seg2LineId = typeof seg2 === 'number' ? model.lines[seg2]?.id ?? seg2 : seg2;
        
        const angleId = nextId('angle', model);
        model.angles.push({
          object_type: 'angle',
          id: angleId,
          point1: p1,
          vertex: p2,
          point2: p3,
          style: currentAngleStyle(),
          construction_kind: 'free',
          defining_parents: [],
          recompute: () => {},
          on_parent_deleted: () => {}
        });
        registerIndex(model, 'angle', angleId, model.angles.length - 1);
        selectedAngleIndex = model.angles.length - 1;
        selectedPointIndex = null;
        anglePoints = [];
        draw();
        pushHistory();
        maybeRevertMode();
      }
      updateSelectionButtons();
      draw();
      return;
    }

    const lineHit = findLine({ x, y });
    if (!lineHit || lineHit.part !== 'segment') return;
    
    // Clear point selection if we start selecting lines
    if (anglePoints.length > 0) {
      anglePoints = [];
      selectedPointIndex = null;
    }

    const l = model.lines[lineHit.line];
    const a = l.points[lineHit.seg];
    const b = l.points[lineHit.seg + 1];
    if (a === undefined || b === undefined) return;
    if (!angleFirstLeg) {
      angleFirstLeg = { line: lineHit.line, seg: lineHit.seg, a, b };
      selectedLineIndex = lineHit.line;
      selectedPointIndex = a;
      selectedSegments.clear();
      selectedSegments.add(segmentKey(lineHit.line, 'segment', lineHit.seg));
      updateSelectionButtons();
      draw();
      return;
    }
    const first = angleFirstLeg;
    // Prevent creating 0-degree angle (same segment clicked twice)
    if (first.line === lineHit.line && first.seg === lineHit.seg) {
      angleFirstLeg = null;
      selectedSegments.clear();
      selectedLineIndex = null;
      draw();
      return;
    }
    const shared = [a, b].find((p) => p === first.a || p === first.b);
    if (shared === undefined) {
      angleFirstLeg = null;
      selectedSegments.clear();
      selectedLineIndex = null;
      draw();
      return;
    }
    const vertex = shared;
    const other1 = vertex === first.a ? first.b : first.a;
    const other2 = a === vertex ? b : a;
    const v = model.points[vertex];
    const p1 = model.points[other1];
    const p2 = model.points[other2];
    if (!v || !p1 || !p2) {
      angleFirstLeg = null;
      return;
    }
    const style = currentStrokeStyle();
    const angleId = nextId('angle', model);
    model.angles.push({
      object_type: 'angle',
      id: angleId,
      point1: other1,
      vertex,
      point2: other2,
      style: currentAngleStyle(),
      construction_kind: 'free',
      defining_parents: [],
      recompute: () => {},
      on_parent_deleted: () => {}
    });
    registerIndex(model, 'angle', angleId, model.angles.length - 1);
    selectedAngleIndex = model.angles.length - 1;
    selectedLineIndex = null;
    selectedPointIndex = null;
    selectedSegments.clear();
    angleFirstLeg = null;
    draw();
    pushHistory();
    maybeRevertMode();
    updateSelectionButtons();
  } else if (mode === 'label') {
    // Label mode - wait for user to click on an object
    const pointHit = findPoint({ x, y });
    const lineHit = findLine({ x, y });
    const angleHit = findAngleAt({ x, y }, currentHitRadius(1.5));
    const polyHit = lineHit ? polygonForLine(lineHit.line) : selectedPolygonIndex;
    const color = styleColorInput?.value || '#000';
    let changed = false;
  const polygonHasLabels = (polyIdx: number | null) => {
    if (polyIdx === null) return false;
    const verts = polygonVerticesOrdered(polyIdx);
    return verts.length > 0 && verts.every((vi) => !!model.points[vi]?.label);
  };
    
    // Click on angle
    if (angleHit !== null) {
      if (!model.angles[angleHit].label) {
        const { text, seq } = nextGreek();
        model.angles[angleHit].label = {
          text,
          color,
          offset: defaultAngleLabelOffset(angleHit),
          fontSize: 0,
          seq
        };
        selectedAngleIndex = angleHit;
        changed = true;
        clearLabelSelection();
        setMode('move');
        updateToolButtons();
      } else {
        selectedAngleIndex = angleHit;
      }
    }
    // Click on point
    else if (pointHit !== null) {
      selectedPointIndex = pointHit;
      if (!model.points[pointHit].label) {
        const { text, seq } = nextUpper();
        model.points[pointHit].label = {
          text,
          color,
          offset: defaultPointLabelOffset(pointHit),
          fontSize: 0,
          seq
        };
        changed = true;
        clearLabelSelection();
        setMode('move');
        updateToolButtons();
      }
    }
    // Click on polygon
    else if (polyHit !== null) {
      selectedPolygonIndex = polyHit;
      if (!polygonHasLabels(polyHit)) {
        const verts = polygonVerticesOrdered(polyHit);
        verts.forEach((vi, i) => {
          const idx = labelUpperIdx + i;
          const text = seqLetter(idx, UPPER_SEQ);
          model.points[vi].label = {
            text,
            color,
            offset: defaultPointLabelOffset(vi),
            fontSize: 0,
            seq: { kind: 'upper' as const, idx }
          };
        });
        labelUpperIdx += verts.length;
        changed = verts.length > 0;
        if (changed) {
          clearLabelSelection();
          setMode('move');
          updateToolButtons();
        }
      }
    }
    // Click on line segment
    else if (lineHit && lineHit.part === 'segment') {
      selectedLineIndex = lineHit.line;
      if (!model.lines[lineHit.line].label) {
        const { text, seq } = nextLower();
        model.lines[lineHit.line].label = {
          text,
          color,
          offset: defaultLineLabelOffset(lineHit.line),
          fontSize: 0,
          seq
        };
        changed = true;
        clearLabelSelection();
        setMode('move');
        updateToolButtons();
      }
    }
    // Free label (no object clicked)
    else {
      const text = '';
      model.labels.push({ text, pos: { x, y }, color, fontSize: 0 });
      const newIdx = model.labels.length - 1;
      selectLabel({ kind: 'free', id: newIdx });
      
      // Ensure the style menu is open and input focused
      setTimeout(() => {
        openStyleMenu();
        if (labelTextInput) labelTextInput.focus();
      }, 1000);
      changed = true;
    }
    if (changed) {
      draw();
      pushHistory();
      maybeRevertMode();
      updateSelectionButtons();
    }
  } else if (mode === 'bisector') {
    // Allow clicking an existing angle to build bisector from it
    const angleHit = findAngleAt({ x, y }, currentHitRadius(1.5));
    if (angleHit !== null) {
      const ang = model.angles[angleHit];
      const geom = angleBaseGeometry(ang);
      if (geom) {
        const { v, p1, p2 } = geom;
        // compute bisector direction
        const d1 = normalize({ x: p1.x - v.x, y: p1.y - v.y });
        const d2 = normalize({ x: p2.x - v.x, y: p2.y - v.y });
        const bis = normalize({ x: d1.x + d2.x, y: d1.y + d2.y });
        const raw1 = Math.hypot(p1.x - v.x, p1.y - v.y);
        const raw2 = Math.hypot(p2.x - v.x, p2.y - v.y);
        const len = Math.max(1e-6, Math.min(BISECT_POINT_DISTANCE, raw1, raw2));
        const end = { x: v.x + bis.x * len, y: v.y + bis.y * len };
        // build segment refs from angle legs (prefer runtime fields first)
        const l1ref = getAngleArmRef(ang, 1);
        const l2ref = getAngleArmRef(ang, 2);
        let line1: Line | undefined;
        let line2: Line | undefined;
        if (typeof l1ref === 'number') {
          line1 = model.lines[l1ref];
        } else if (typeof l1ref === 'string') {
          const idx = model.indexById?.line?.[l1ref];
          line1 = idx !== undefined ? model.lines[idx] : undefined;
        }
        if (typeof l2ref === 'number') {
          line2 = model.lines[l2ref];
        } else if (typeof l2ref === 'string') {
          const idx2 = model.indexById?.line?.[l2ref];
          line2 = idx2 !== undefined ? model.lines[idx2] : undefined;
        }
        if (line1 && line2) {
          const seg1 = getAngleLegSeg(ang, 1);
          const seg2 = getAngleLegSeg(ang, 2);
          const a1 = line1.points[seg1];
          const b1 = line1.points[seg1 + 1];
          const a2 = line2.points[seg2];
          const b2 = line2.points[seg2 + 1];
          if (a1 !== undefined && b1 !== undefined && a2 !== undefined && b2 !== undefined) {
            const seg1Ref: BisectSegmentRef = { lineId: line1.id, a: model.points[a1].id, b: model.points[b1].id };
            const seg2Ref: BisectSegmentRef = { lineId: line2.id, a: model.points[a2].id, b: model.points[b2].id };
            const bisMeta: BisectMeta = { vertex: model.points[ang.vertex].id, seg1: seg1Ref, seg2: seg2Ref, epsilon: BISECT_POINT_CREATION_DISTANCE };
            const hiddenStyle = { ...bisectPointStyle(), hidden: true };
            const endIdx = addPoint(model, { ...end, style: hiddenStyle, construction_kind: 'bisect', bisect: bisMeta });
            const style = currentStrokeStyle();
            const lineIdx = addLineFromPoints(model, ang.vertex, endIdx, style);
            if (model.lines[lineIdx]) {
              model.lines[lineIdx].rightRay = { ...(model.lines[lineIdx].rightRay ?? style), hidden: false };
              model.lines[lineIdx].leftRay = { ...(model.lines[lineIdx].leftRay ?? style), hidden: true };
              (model.lines[lineIdx] as any).bisector = { vertex: model.points[ang.vertex].id, bisectPoint: model.points[endIdx].id };
            }
            // Recompute bisect point immediately so initial position matches recompute logic
            recomputeBisectPoint(endIdx);
            updateIntersectionsForLine(lineIdx);
            updateParallelLinesForLine(lineIdx);
            updatePerpendicularLinesForLine(lineIdx);
            selectedLineIndex = lineIdx;
            draw();
            pushHistory();
            maybeRevertMode();
            updateSelectionButtons();
          }
        }
      }
      return;
    }
    const lineHit = findLine({ x, y });
    if (!lineHit || lineHit.part !== 'segment') return;
    const l = model.lines[lineHit.line];
    const a = l.points[lineHit.seg];
    const b = l.points[lineHit.seg + 1];
    if (a === undefined || b === undefined) return;
    if (!bisectorFirstLeg) {
      bisectorFirstLeg = { line: lineHit.line, seg: lineHit.seg, a, b, vertex: a };
      selectedLineIndex = lineHit.line;
      selectedPointIndex = a;
      draw();
      return;
    }
    // Prevent creating 0-degree angle (same segment clicked twice)
    if (bisectorFirstLeg.line === lineHit.line && bisectorFirstLeg.seg === lineHit.seg) {
      bisectorFirstLeg = null;
      selectedLineIndex = null;
      draw();
      return;
    }
    const a2 = l.points[lineHit.seg];
    const b2 = l.points[lineHit.seg + 1];
    if (a2 === undefined || b2 === undefined) {
      bisectorFirstLeg = null;
      return;
    }
    const shared = [a2, b2].find((p) => p === bisectorFirstLeg?.a || p === bisectorFirstLeg?.b);
    if (shared === undefined) {
      bisectorFirstLeg = null;
      return;
    }
    const vertex = shared;
    const other1 = bisectorFirstLeg.a === vertex ? bisectorFirstLeg.b : bisectorFirstLeg.a;
    const other2 = a2 === vertex ? b2 : a2;
    const v = model.points[vertex];
    const p1 = model.points[other1];
    const p2 = model.points[other2];
    if (!v || !p1 || !p2) {
      bisectorFirstLeg = null;
      return;
    }
    const d1 = normalize({ x: p1.x - v.x, y: p1.y - v.y });
    const d2 = normalize({ x: p2.x - v.x, y: p2.y - v.y });
    const bis = normalize({ x: d1.x + d2.x, y: d1.y + d2.y });
    const raw1 = Math.hypot(p1.x - v.x, p1.y - v.y);
    const raw2 = Math.hypot(p2.x - v.x, p2.y - v.y);
    const len = Math.max(1e-6, Math.min(BISECT_POINT_DISTANCE, raw1, raw2));
    const end = { x: v.x + bis.x * len, y: v.y + bis.y * len };
    const seg1Line = model.lines[bisectorFirstLeg.line];
    const seg2Line = model.lines[lineHit.line];
    const seg1Ref: BisectSegmentRef = {
      lineId: seg1Line.id,
      a: model.points[bisectorFirstLeg.a].id,
      b: model.points[bisectorFirstLeg.b].id
    };
    const seg2Ref: BisectSegmentRef = {
      lineId: seg2Line.id,
      a: model.points[a2].id,
      b: model.points[b2].id
    };
    const bisMeta: BisectMeta = { vertex: v.id, seg1: seg1Ref, seg2: seg2Ref, epsilon: BISECT_POINT_CREATION_DISTANCE };
    const hiddenStyle = { ...bisectPointStyle(), hidden: true };
    const endIdx = addPoint(model, { ...end, style: hiddenStyle, construction_kind: 'bisect', bisect: bisMeta });
    const style = currentStrokeStyle();
    const lineIdx = addLineFromPoints(model, vertex, endIdx, style);
    // Make the created line appear as a half-line (ray) in the direction of the bisect point.
    // Points are [vertex, endIdx], so enable the right ray (extends past endIdx) and hide left ray.
    if (model.lines[lineIdx]) {
      model.lines[lineIdx].rightRay = { ...(model.lines[lineIdx].rightRay ?? style), hidden: false };
      model.lines[lineIdx].leftRay = { ...(model.lines[lineIdx].leftRay ?? style), hidden: true };
      (model.lines[lineIdx] as any).bisector = { vertex: v.id, bisectPoint: model.points[endIdx].id };
    }
    // Recompute bisect point immediately so initial position matches recompute logic
    recomputeBisectPoint(endIdx);
    updateIntersectionsForLine(lineIdx);
    updateParallelLinesForLine(lineIdx);
    updatePerpendicularLinesForLine(lineIdx);
    selectedLineIndex = lineIdx;
    selectedPointIndex = null;
    bisectorFirstLeg = null;
    draw();
    pushHistory();
    maybeRevertMode();
    updateSelectionButtons();
  } else if (mode === 'midpoint') {
    // If starting midpoint tool (no first point yet), clear any existing selection
    if (midpointFirstIndex === null) {
      selectedPointIndex = null;
      selectedLineIndex = null;
      selectedCircleIndex = null;
      selectedAngleIndex = null;
      selectedPolygonIndex = null;
      selectedInkStrokeIndex = null;
      selectedLabel = null;
      selectedSegments.clear();
      selectedArcSegments.clear();
      multiSelectedPoints.clear();
      multiSelectedLines.clear();
      multiSelectedCircles.clear();
      multiSelectedAngles.clear();
      multiSelectedPolygons.clear();
      multiSelectedInkStrokes.clear();
      draw();
      updateSelectionButtons();
    }
    const hitPoint = findPoint({ x, y });
    const lineHit = findLine({ x, y });
    
    // Prioritize point over line segment when both are close
    if (hitPoint !== null) {
      // Point found - use it for midpoint creation
      if (midpointFirstIndex === null) {
        midpointFirstIndex = hitPoint;
        selectedPointIndex = hitPoint;
        draw();
        return;
      }
      // Second point selected
      const secondIdx = hitPoint;
      const p1 = model.points[midpointFirstIndex];
      const p2 = model.points[secondIdx];
      if (!p1 || !p2) {
        midpointFirstIndex = null;
        maybeRevertMode();
        updateSelectionButtons();
        return;
      }
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const parents: [string, string] = [p1.id, p2.id];
      const idx = addPoint(model, {
        ...mid,
        style: midpointPointStyle(),
        defining_parents: [],
        construction_kind: 'midpoint',
        midpoint: { parents, parentLineId: null }
      });
      recomputeMidpoint(idx);
      selectedPointIndex = idx;
      draw();
      pushHistory();
      midpointFirstIndex = null;
      maybeRevertMode();
      updateSelectionButtons();
      return;
    }
    
    // No point hit, check for line segment
    if (lineHit && lineHit.part === 'segment' && midpointFirstIndex === null) {
      const l = model.lines[lineHit.line];
      const a = model.points[l.points[lineHit.seg]];
      const b = model.points[l.points[lineHit.seg + 1]];
      if (a && b) {
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const parents: [string, string] = [a.id, b.id];
        const lineParent = l?.id ?? null;
        const idx = addPoint(model, {
          ...mid,
          style: midpointPointStyle(),
          defining_parents: lineParent ? [{ kind: 'line', id: lineParent }] : [],
          construction_kind: 'midpoint',
          midpoint: { parents, parentLineId: lineParent }
        });
        recomputeMidpoint(idx);
        insertPointIntoLine(lineHit.line, idx, mid);
        selectedPointIndex = idx;
        selectedLineIndex = lineHit.line;
        draw();
        pushHistory();
        maybeRevertMode();
        updateSelectionButtons();
        return;
      }
    }
    
    // Nothing hit and no first point selected - do nothing
    if (midpointFirstIndex === null) {
      return;
    }
    
    // Create new point at click location as second point
    const secondIdx = addPoint(model, { x, y, style: currentPointStyle() });
    const p1 = model.points[midpointFirstIndex];
    const p2 = model.points[secondIdx];
    if (!p1 || !p2) {
      midpointFirstIndex = null;
      maybeRevertMode();
      updateSelectionButtons();
      return;
    }
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const parents: [string, string] = [p1.id, p2.id];
    const midIdx = addPoint(model, {
      ...mid,
      style: midpointPointStyle(),
      construction_kind: 'midpoint',
      midpoint: { parents, parentLineId: null }
    });
    recomputeMidpoint(midIdx);
    selectedPointIndex = midIdx;
    midpointFirstIndex = null;
    draw();
    pushHistory();
    maybeRevertMode();
    updateSelectionButtons();
  } else if (mode === 'intersection') {
    // Two-step selection: first pick one line/circle, then the second — create intersection points.
    const lineHits = findLineHits({ x, y });
    const circleHits = findCircles({ x, y }, currentHitRadius(), false);
    let hitObj: { kind: 'line' | 'circle'; idx: number } | null = null;
    if (lineHits.length) hitObj = { kind: 'line', idx: lineHits[0].line };
    else if (circleHits.length) hitObj = { kind: 'circle', idx: circleHits[0].circle };

    if (!hitObj && pendingIntersection === null) {
      // nothing selected yet
      return;
    }

    if (pendingIntersection === null && hitObj) {
      pendingIntersection = hitObj;
      if (hitObj.kind === 'line') selectedLineIndex = hitObj.idx;
      else selectedCircleIndex = hitObj.idx;
      draw();
      return;
    }

    if (pendingIntersection && hitObj) {
      // don't allow selecting same object twice
      if (pendingIntersection.kind === hitObj.kind && pendingIntersection.idx === hitObj.idx) {
        pendingIntersection = null;
        selectedLineIndex = null;
        selectedCircleIndex = null;
        draw();
        return;
      }

      // Compute intersections between pendingIntersection and hitObj
      const a = pendingIntersection;
      const b = hitObj;
      let pts: { x: number; y: number }[] = [];
      if (a.kind === 'line' && b.kind === 'line') {
        const l1 = model.lines[a.idx];
        const l2 = model.lines[b.idx];
        if (l1 && l2 && l1.points.length >= 2 && l2.points.length >= 2) {
          const a1 = model.points[l1.points[0]];
          const a2 = model.points[l1.points[l1.points.length - 1]];
          const b1 = model.points[l2.points[0]];
          const b2 = model.points[l2.points[l2.points.length - 1]];
          const inter = intersectLines(a1, a2, b1, b2);
          if (inter) pts.push(inter);
        }
      } else if (a.kind === 'line' && b.kind === 'circle') {
        const l = model.lines[a.idx];
        const c = model.circles[b.idx];
        if (l && c && l.points.length >= 2) {
          const a1 = model.points[l.points[0]];
          const a2 = model.points[l.points[l.points.length - 1]];
          const center = model.points[c.center];
          const radius = circleRadius(c);
          if (a1 && a2 && center && radius > 0) pts = lineCircleIntersections(a1, a2, center, radius, false);
        }
      } else if (a.kind === 'circle' && b.kind === 'line') {
        const l = model.lines[b.idx];
        const c = model.circles[a.idx];
        if (l && c && l.points.length >= 2) {
          const a1 = model.points[l.points[0]];
          const a2 = model.points[l.points[l.points.length - 1]];
          const center = model.points[c.center];
          const radius = circleRadius(c);
          if (a1 && a2 && center && radius > 0) pts = lineCircleIntersections(a1, a2, center, radius, false);
        }
      } else if (a.kind === 'circle' && b.kind === 'circle') {
        const c1 = model.circles[a.idx];
        const c2 = model.circles[b.idx];
        if (c1 && c2) pts = circleCircleIntersections(model.points[c1.center], circleRadius(c1), model.points[c2.center], circleRadius(c2));
      }

      // Create points for intersections
      if (pts.length) {
        const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
        let firstIdx: number | null = null;
        for (const ppos of pts) {
          const parents: ConstructionParent[] = [];
          if (a.kind === 'line') parents.push({ kind: 'line', id: model.lines[a.idx].id });
          else parents.push({ kind: 'circle', id: model.circles[a.idx].id });
          if (b.kind === 'line') parents.push({ kind: 'line', id: model.lines[b.idx].id });
          else parents.push({ kind: 'circle', id: model.circles[b.idx].id });
          const idx = addPoint(model, { ...ppos, style: currentPointStyle(), defining_parents: parents, created_group: batchId });
          // Attach to line/circle structures so points appear on objects
          if (a.kind === 'line') {
            const hit = findLineHitForPos(a.idx, ppos);
            if (hit) attachPointToLine(idx, hit, ppos, ppos);
            else applyPointConstruction(idx, [{ kind: 'line', id: model.lines[a.idx].id }]);
          } else {
            attachPointToCircle(a.idx, idx, ppos);
          }
          if (b.kind === 'line') {
            const hit = findLineHitForPos(b.idx, ppos);
            if (hit) attachPointToLine(idx, hit, ppos, ppos);
            else applyPointConstruction(idx, [{ kind: 'line', id: model.lines[b.idx].id }]);
          } else {
            attachPointToCircle(b.idx, idx, ppos);
          }
          if (firstIdx === null) firstIdx = idx;
        }
        if (firstIdx !== null) selectedPointIndex = firstIdx;
        pushHistory();
      }

      // After creating or cancelling intersection selection, revert to select (move)
      maybeRevertMode();
      updateToolButtons();

      pendingIntersection = null;
      selectedLineIndex = null;
      selectedCircleIndex = null;
      draw();
      return;
    }
  } else if (mode === 'ngon') {
    const hitPoint = findPoint({ x, y });
    if (squareStartIndex === null) {
      const idx = hitPoint ?? addPoint(model, { x, y, style: currentPointStyle() });
      squareStartIndex = idx;
      selectedPolygonIndex = null;
      selectedPointIndex = idx;
      selectedLineIndex = null;
      selectedCircleIndex = null;
      draw();
      return;
    }
    const baseStart = model.points[squareStartIndex];
    const snappedPos = hitPoint !== null ? { x, y } : snapDir(baseStart, { x, y });
    const idx = hitPoint ?? addPoint(model, { ...snappedPos, style: currentPointStyle() });
    ngonSecondIndex = idx;
    selectedPointIndex = idx;
    draw();
    
    // Show modal
    if (ngonModal) {
      ngonModal.style.display = 'flex';
    }
  } else if (mode === 'multiselect') {
    const { x, y } = canvasToWorld(ev.clientX, ev.clientY);
    
    // If move mode is active, start dragging
    if (multiMoveActive && hasMultiSelection()) {
      draggingMultiSelection = true;
      dragStart = { x, y };
      draw();
      return;
    }
    
    // Start drawing selection box
    multiselectBoxStart = { x, y };
    multiselectBoxEnd = { x, y };
    
    // Check if clicking on existing object to toggle selection (only if not in move mode)
    if (!multiMoveActive) {
      const pointHit = findPoint({ x, y });
      const lineHit = findLine({ x, y });
      const circleHit = findCircle({ x, y }, currentHitRadius(), false);
      const angleHit = findAngleAt({ x, y }, currentHitRadius(1.5));
      const inkHit = findInkStrokeAt({ x, y });
      const polyHit = lineHit ? polygonForLine(lineHit.line) : null;
      
      if (pointHit !== null) {
        if (multiSelectedPoints.has(pointHit)) {
          multiSelectedPoints.delete(pointHit);
        } else {
          multiSelectedPoints.add(pointHit);
        }
        multiselectBoxStart = null;
        multiselectBoxEnd = null;
        draw();
        updateSelectionButtons();
        return;
      }
      
      if (lineHit !== null) {
        const lineIdx = lineHit.line;
        if (multiSelectedLines.has(lineIdx)) {
          multiSelectedLines.delete(lineIdx);
        } else {
          multiSelectedLines.add(lineIdx);
        }
        multiselectBoxStart = null;
        multiselectBoxEnd = null;
        draw();
        updateSelectionButtons();
        return;
      }
      
      if (circleHit !== null) {
        const circleIdx = circleHit.circle;
        if (multiSelectedCircles.has(circleIdx)) {
          multiSelectedCircles.delete(circleIdx);
        } else {
          multiSelectedCircles.add(circleIdx);
        }
        multiselectBoxStart = null;
        multiselectBoxEnd = null;
        draw();
        updateSelectionButtons();
        return;
      }
      
      if (angleHit !== null) {
        if (multiSelectedAngles.has(angleHit)) {
          multiSelectedAngles.delete(angleHit);
        } else {
          multiSelectedAngles.add(angleHit);
        }
        multiselectBoxStart = null;
        multiselectBoxEnd = null;
        draw();
        updateSelectionButtons();
        return;
      }
      
      if (polyHit !== null) {
        const pid = polygonId(polyHit);
        if (pid) {
          if (multiSelectedPolygons.has(pid)) multiSelectedPolygons.delete(pid);
          else multiSelectedPolygons.add(pid);
        }
        multiselectBoxStart = null;
        multiselectBoxEnd = null;
        draw();
        updateSelectionButtons();
        return;
      }
      
      if (inkHit !== null) {
        if (multiSelectedInkStrokes.has(inkHit)) {
          multiSelectedInkStrokes.delete(inkHit);
        } else {
          multiSelectedInkStrokes.add(inkHit);
        }
        multiselectBoxStart = null;
        multiselectBoxEnd = null;
        draw();
        updateSelectionButtons();
        return;
      }
      const labelHit = findLabelAt({ x, y });
      if (labelHit) {
        if (labelHit.kind === 'free') {
          if (multiSelectedLabels.has(labelHit.id)) multiSelectedLabels.delete(labelHit.id);
          else multiSelectedLabels.add(labelHit.id);
        } else if (labelHit.kind === 'point') {
          if (multiSelectedPoints.has(labelHit.id)) multiSelectedPoints.delete(labelHit.id);
          else multiSelectedPoints.add(labelHit.id);
        } else if (labelHit.kind === 'line') {
          if (multiSelectedLines.has(labelHit.id)) multiSelectedLines.delete(labelHit.id);
          else multiSelectedLines.add(labelHit.id);
        } else if (labelHit.kind === 'angle') {
          if (multiSelectedAngles.has(labelHit.id)) multiSelectedAngles.delete(labelHit.id);
          else multiSelectedAngles.add(labelHit.id);
        }
        multiselectBoxStart = null;
        multiselectBoxEnd = null;
        draw();
        updateSelectionButtons();
        return;
      }
    }
    
    // If not clicking on object, will draw selection box (handled in pointer move)
    draw();
  } else if (mode === 'move') {
    // Jeśli aktywny jest tryb kopiowania stylu, zastosuj styl do klikniętego obiektu
    if (copyStyleActive && copiedStyle) {
      // copy-style click handler
      const pointHit = findPoint({ x, y });
      const lineHit = findLine({ x, y });
      const circleHit = findCircle({ x, y }, currentHitRadius(), false);
      const angleHit = findAngleAt({ x, y }, currentHitRadius(1.5));
      const inkHit = findInkStrokeAt({ x, y });
      const labelHitDebug = findLabelAt({ x, y });
      // hits computed
      
      // Zachowaj oryginalne zaznaczenie
      const originalPointIndex = selectedPointIndex;
      const originalLineIndex = selectedLineIndex;
      const originalCircleIndex = selectedCircleIndex;
      const originalAngleIndex = selectedAngleIndex;
      const originalPolygonIndex = selectedPolygonIndex;
      const originalInkStrokeIndex = selectedInkStrokeIndex;
      const originalSelectedLabel = selectedLabel;
      const originalSegments = new Set(selectedSegments);
      const originalArcSegments = new Set(selectedArcSegments);
      const originalSelectionEdges = selectionEdges;
      const originalSelectionVertices = selectionVertices;
      
      let applied = false;
      
      // Filtruj obiekty według typu skopiowanego stylu
      const labelHit = labelHitDebug;
      // labelHit computed

      if (copiedStyle.sourceType === 'ink' && inkHit !== null) {
        selectedInkStrokeIndex = inkHit;
        selectedPointIndex = null;
        selectedLineIndex = null;
        selectedCircleIndex = null;
        selectedAngleIndex = null;
        selectedPolygonIndex = null;
        selectedSegments.clear();
        selectedArcSegments.clear();
        applyStyleToSelection(copiedStyle);
        applied = true;
      } else if (copiedStyle.sourceType === 'angle' && angleHit !== null) {
        selectedAngleIndex = angleHit;
        selectedPointIndex = null;
        selectedLineIndex = null;
        selectedCircleIndex = null;
        selectedPolygonIndex = null;
        selectedInkStrokeIndex = null;
        selectedSegments.clear();
        selectedArcSegments.clear();
        applyStyleToSelection(copiedStyle);
        applied = true;
      } else if (copiedStyle.sourceType === 'circle' && circleHit !== null) {
        selectedCircleIndex = circleHit.circle;
        selectedPointIndex = null;
        selectedLineIndex = null;
        selectedAngleIndex = null;
        selectedPolygonIndex = null;
        selectedInkStrokeIndex = null;
        selectedSegments.clear();
        selectedArcSegments.clear();
        applyStyleToSelection(copiedStyle);
        applied = true;
      } else if (copiedStyle.sourceType === 'line' && lineHit !== null) {
        selectedLineIndex = lineHit.line;
        selectedPointIndex = null;
        selectedCircleIndex = null;
        selectedAngleIndex = null;
        selectedPolygonIndex = null;
        selectedInkStrokeIndex = null;
        selectedSegments.clear();
        selectedArcSegments.clear();
        selectionEdges = true;
        selectionVertices = false;
        applyStyleToSelection(copiedStyle);
        applied = true;
      } else if (copiedStyle.sourceType === 'point' && pointHit !== null) {
        selectedPointIndex = pointHit;
        selectedLineIndex = null;
        selectedCircleIndex = null;
        selectedAngleIndex = null;
        selectedPolygonIndex = null;
        selectedInkStrokeIndex = null;
        selectedSegments.clear();
        selectedArcSegments.clear();
        applyStyleToSelection(copiedStyle);
        applied = true;
      }
      else if (copiedStyle.sourceType === 'label' && labelHit !== null) {
        selectedLabel = labelHit;
        selectedPointIndex = null;
        selectedLineIndex = null;
        selectedCircleIndex = null;
        selectedAngleIndex = null;
        selectedPolygonIndex = null;
        selectedInkStrokeIndex = null;
        selectedSegments.clear();
        selectedArcSegments.clear();
        applyStyleToSelection(copiedStyle);
        applied = true;
      }
      // applied flag

      if (applied) {
        // Przywróć oryginalne zaznaczenie
        selectedPointIndex = originalPointIndex;
        selectedLineIndex = originalLineIndex;
        selectedCircleIndex = originalCircleIndex;
        selectedAngleIndex = originalAngleIndex;
        selectedLabel = originalSelectedLabel;
        selectedPolygonIndex = originalPolygonIndex;
        selectedInkStrokeIndex = originalInkStrokeIndex;
        selectedSegments.clear();
        originalSegments.forEach(key => selectedSegments.add(key));
        selectedArcSegments.clear();
        originalArcSegments.forEach(key => selectedArcSegments.add(key));
        selectionEdges = originalSelectionEdges;
        selectionVertices = originalSelectionVertices;
        
        updateSelectionButtons();
        draw();
        return;
      }
    }
    
    const pointHit = findPoint({ x, y });
    const lineHit = findLine({ x, y });
    let circleHit = findCircle({ x, y }, currentHitRadius(), false);
    let arcHit = findArcAt({ x, y }, currentHitRadius(1.5));
    const angleHit = findAngleAt({ x, y }, currentHitRadius(1.5));
    let fallbackCircleIdx: number | null = null;
    let circleFallback = false;
    if (pointHit !== null) {
      const pt = model.points[pointHit];
      const draggable = isPointDraggable(pt);
      const preferPointSelection =
        !draggable && (pt.construction_kind === 'intersection' || isMidpointPoint(pt) || isSymmetricPoint(pt));
      if (!draggable && !preferPointSelection) {
        if (circleHit !== null) {
          fallbackCircleIdx = circleHit.circle;
        } else {
          const circleParent = pt.parent_refs.find((pr) => pr.kind === 'circle');
          if (circleParent) {
            const idx = model.indexById.circle[circleParent.id];
            if (idx !== undefined) fallbackCircleIdx = idx;
          }
        }
      }
      circleFallback = fallbackCircleIdx !== null;
      const lineFallback =
        !draggable && !preferPointSelection && lineHit !== null && isLineDraggable(model.lines[lineHit.line]);
      if (!circleFallback && !lineFallback) {
        selectedPointIndex = pointHit;
        selectedLineIndex = null;
        selectedCircleIndex = null;
        selectedAngleIndex = null;
        selectedPolygonIndex = null;
        selectedArcSegments.clear();
        selectedSegments.clear();
        if (draggable) {
          const centerCircles = circlesWithCenter(pointHit).filter((ci) => {
            const circle = model.circles[ci];
            return circle?.circle_kind === 'center-radius';
          });
          if (centerCircles.length) {
            const context = new Map<number, Map<number, number>>();
            centerCircles.forEach((ci) => {
              const circle = model.circles[ci];
              const centerPoint = pt;
              if (!circle || !centerPoint) return;
              const angles = new Map<number, number>();
              circle.points.forEach((pid) => {
                const pnt = model.points[pid];
                if (!pnt) return;
                angles.set(pid, Math.atan2(pnt.y - centerPoint.y, pnt.x - centerPoint.x));
              });
              const radiusPt = model.points[circle.radius_point];
              if (radiusPt) {
                angles.set(
                  circle.radius_point,
                  Math.atan2(radiusPt.y - centerPoint.y, radiusPt.x - centerPoint.x)
                );
              }
              context.set(ci, angles);
            });
            draggingCircleCenterAngles = context;
          }
        }
        draggingSelection = draggable;
        dragStart = { x, y };
        // Capture line context for any point on a line, including endpoints
        const linesWithPoint = findLinesContainingPoint(pointHit);
        if (draggable && linesWithPoint.length > 0) {
          lineDragContext = captureLineContext(pointHit);
        } else {
          lineDragContext = null;
        }
        updateSelectionButtons();
        draw();
        return;
      }
      if (circleFallback && circleHit === null && fallbackCircleIdx !== null) {
        circleHit = { circle: fallbackCircleIdx };
      }
    }
    const targetedCircleIdx = circleHit?.circle ?? null;
    const arcMatchesCircle =
      arcHit !== null && targetedCircleIdx !== null && arcHit.circle === targetedCircleIdx;
    const allowArcToggle =
      arcMatchesCircle &&
      (selectedCircleIndex === targetedCircleIdx || ev.detail >= 2);
    if (angleHit !== null) {
      selectedAngleIndex = angleHit;
      selectedLineIndex = null;
      selectedPointIndex = null;
      selectedCircleIndex = null;
      selectedPolygonIndex = null;
      selectedArcSegments.clear();
      selectedSegments.clear();
      draggingSelection = false;
      dragStart = { x, y };
      updateSelectionButtons();
      draw();
      return;
    }
    if (circleHit !== null) {
      const previousCircle = selectedCircleIndex;
      const circleIdx = circleHit.circle;
      const c = model.circles[circleIdx];
      if (!c) {
        updateSelectionButtons();
        draw();
        return;
      }
      const centerIdx = c.center;
      const centerPoint = model.points[centerIdx];
      const centerDraggable = isPointDraggable(centerPoint);
      if (allowArcToggle && arcHit !== null) {
        const key = arcHit.key ?? arcKeyByIndex(circleIdx, arcHit.arcIdx);
        selectedCircleIndex = circleIdx;
        selectedLineIndex = null;
        selectedPointIndex = null;
        selectedAngleIndex = null;
        selectedPolygonIndex = null;
        selectedSegments.clear();
        if (previousCircle === circleIdx) {
          if (selectedArcSegments.has(key)) selectedArcSegments.delete(key);
          else selectedArcSegments.add(key);
        } else {
          selectedArcSegments.clear();
          selectedArcSegments.add(key);
        }
        draggingSelection = false;
        lineDragContext = null;
        dragStart = { x, y };
        updateSelectionButtons();
        draw();
        return;
      }
      selectedCircleIndex = circleIdx;
      selectedArcSegments.clear();
      selectedLineIndex = null;
      selectedPointIndex = null;
      selectedAngleIndex = null;
      selectedPolygonIndex = null;
      selectedSegments.clear();
      const originals = new Map<number, { x: number; y: number }>();
      const recordPoint = (idx: number | undefined) => {
        if (idx === undefined || idx < 0) return;
        const pt = model.points[idx];
        if (!pt) return;
        originals.set(idx, { x: pt.x, y: pt.y });
      };
      recordPoint(centerIdx);
      recordPoint(c.radius_point);
      c.points.forEach((pid) => recordPoint(pid));
      
      const dependentLines = new Map<number, number[]>();
      originals.forEach((_, pIdx) => {
        const lines = findLinesContainingPoint(pIdx);
        lines.forEach(lIdx => {
          if (isDefiningPointOfLine(pIdx, lIdx) && !dependentLines.has(lIdx)) {
            dependentLines.set(lIdx, calculateLineFractions(lIdx));
          }
        });
      });

      circleDragContext = { circleIdx, originals, dependentLines };
      draggingSelection = centerDraggable || originals.size > 0;
      dragStart = { x, y };
      lineDragContext = null;
      draggingCircleCenterAngles = null;
      updateSelectionButtons();
      draw();
      return;
    }
    if (allowArcToggle && arcHit !== null) {
      const circleIdx = arcHit.circle;
      const key = arcHit.key ?? arcKeyByIndex(circleIdx, arcHit.arcIdx);
      if (selectedCircleIndex === circleIdx) {
        if (selectedArcSegments.has(key)) selectedArcSegments.delete(key);
        else selectedArcSegments.add(key);
      } else {
        selectedCircleIndex = circleIdx;
        selectedArcSegments.clear();
        selectedArcSegments.add(key);
      }
      selectedLineIndex = null;
      selectedPointIndex = null;
      selectedAngleIndex = null;
      selectedPolygonIndex = null;
      selectedSegments.clear();
      draggingSelection = false;
      lineDragContext = null;
      dragStart = { x, y };
      updateSelectionButtons();
      draw();
      return;
    }
    const inkStrokeHit = findInkStrokeAt({ x, y });
    if (inkStrokeHit !== null) {
      selectedInkStrokeIndex = inkStrokeHit;
      selectedLineIndex = null;
      selectedPointIndex = null;
      selectedCircleIndex = null;
      selectedAngleIndex = null;
      selectedPolygonIndex = null;
      selectedArcSegments.clear();
      selectedSegments.clear();
      draggingSelection = true;
      dragStart = { x, y };
      updateSelectionButtons();
      draw();
      return;
    }
    if (lineHit !== null) {
      const hitLineObj = model.lines[lineHit.line];
      const lineIsDraggable = isLineDraggable(hitLineObj);
      const polyIdx = polygonForLine(lineHit.line);
      if (polyIdx !== null) {
        if (selectedPolygonIndex === polyIdx) {
          const key = hitKey(lineHit);
          if (selectedSegments.size === 0) {
            selectedSegments.add(key);
          } else if (selectedSegments.has(key)) {
            selectedSegments.delete(key);
          } else {
            selectedSegments.add(key);
          }
        } else {
          selectedPolygonIndex = polyIdx;
          selectedSegments.clear();
        }
        selectedLineIndex = lineHit.line;
        selectedArcSegments.clear();
        selectedAngleIndex = null;
        
        // Capture dependent lines for polygon drag
        const dependentLines = new Map<number, number[]>();
        // Use helper to read polygon lines and id in an id-aware way
        const pLines = polygonLines(polyIdx);
        if (pLines && pLines.length) {
          const verts = polygonVertices(polyIdx);
          const pointsInPoly = new Set<number>(verts);

          pointsInPoly.forEach(pIdx => {
            const lines = findLinesContainingPoint(pIdx);
            lines.forEach(lIdx => {
              if (!pLines.includes(lIdx) && isDefiningPointOfLine(pIdx, lIdx) && !dependentLines.has(lIdx)) {
                dependentLines.set(lIdx, calculateLineFractions(lIdx));
              }
            });
          });
        }
        polygonDragContext = { polygonId: polygonId(polyIdx) ?? `poly-${polyIdx}`, dependentLines };
      } else {
        if (selectedLineIndex === lineHit.line) {
          if (selectedSegments.size === 0) {
            selectedSegments.add(hitKey(lineHit));
          } else {
            const key = hitKey(lineHit);
            if (selectedSegments.has(key)) selectedSegments.delete(key);
            else selectedSegments.add(key);
          }
        } else {
          selectedLineIndex = lineHit.line;
          selectedSegments.clear();
        }
        selectedPolygonIndex = null;
        selectedArcSegments.clear();
        selectedAngleIndex = null;
      }
      selectedPointIndex = null;
      selectedCircleIndex = null;
      selectedArcSegments.clear();
      pendingCircleRadiusLength = lineLength(selectedLineIndex);
      draggingSelection = lineIsDraggable;
      dragStart = { x, y };
      updateSelectionButtons();
      draw();
      return;
    }
    // if no hit, clear selection and start panning the canvas
    selectedPointIndex = null;
    selectedLineIndex = null;
    selectedCircleIndex = null;
    selectedPolygonIndex = null;
    selectedArcSegments.clear();
    selectedAngleIndex = null;
    selectedInkStrokeIndex = null;
    selectedSegments.clear();
    lineDragContext = null;
    clearLabelSelection();
    // Wyłącz tryb kopiowania stylu gdy odznaczamy obiekt
    if (copyStyleActive) {
      copyStyleActive = false;
      copiedStyle = null;
    }
    pendingPanCandidate = { x, y };
    isPanning = true;
    panStart = { x: ev.clientX, y: ev.clientY };
    panStartOffset = { ...panOffset };
    updateSelectionButtons();
    draw();
  }
}

// Button configuration types and state
type SecondRowTriggerMode = 'swipe' | 'tap';

type ButtonConfig = {
  multiButtons: Record<string, string[]>; // key is main button ID, value is array of button IDs to cycle through
  secondRow: Record<string, string[]>; // key is main button ID, value is array of button IDs in second row
  secondRowTrigger?: SecondRowTriggerMode;
};

let buttonConfig: ButtonConfig = {
  multiButtons: {},
  secondRow: {},
  secondRowTrigger: 'swipe'
};

// Track current state of multi-buttons (which button in the cycle is currently active)
let multiButtonStates: Record<string, number> = {};

// Track second row state
let secondRowVisible = false;
let secondRowActiveButton: string | null = null;
let secondRowToolIds: string[] = []; // Track which tools are in the currently visible second row
let secondRowActivationMode: SecondRowTriggerMode = 'swipe';
const secondRowHandlerCleanup = new Map<string, () => void>();

// Track double tap for sticky tool
const doubleTapTimeouts: Map<HTMLElement, number> = new Map();
const DOUBLE_TAP_DELAY = 300; // ms

// Track touch drag in config menu
interface TouchDragState {
  element: HTMLElement | null;
  toolId: string;
  toolIcon: string;
  toolViewBox: string;
  toolLabel: string;
  startX: number;
  startY: number;
  fromGroup: boolean;
}
let configTouchDrag: TouchDragState | null = null;

// Button order in palette (determines toolbar order)
let buttonOrder: string[] = [];

// Button configuration - available tool buttons for configuration
const TOOL_BUTTONS = [
  { id: 'modeMove', label: 'Zaznaczanie', mode: 'move', icon: '<path d="M12 3 9.5 5.5 12 8l2.5-2.5L12 3Zm0 13-2.5 2.5L12 21l2.5-2.5L12 16Zm-9-4 2.5 2.5L8 12 5.5 9.5 3 12Zm13 0 2.5 2.5L21 12l-2.5-2.5L16 12ZM8 12l8 0" />', viewBox: '0 0 24 24' },
  { id: 'modeMultiselect', label: 'Zaznacz wiele', mode: 'multiselect', icon: '<rect x="3" y="3" width="8" height="8" rx="1" stroke-dasharray="2 2"/><rect x="13" y="3" width="8" height="8" rx="1" stroke-dasharray="2 2"/><rect x="3" y="13" width="8" height="8" rx="1" stroke-dasharray="2 2"/><rect x="13" y="13" width="8" height="8" rx="1" stroke-dasharray="2 2"/>', viewBox: '0 0 24 24' },
  { id: 'modeLabel', label: 'Etykieta', mode: 'label', icon: '<path d="M5 7h9l5 5-5 5H5V7Z"/><path d="M8 11h4" /><path d="M8 14h3" />', viewBox: '0 0 24 24' },
  { id: 'modeAdd', label: 'Punkt', mode: 'add', icon: '<circle cx="12" cy="12" r="4.5" class="icon-fill"/>', viewBox: '0 0 24 24' },
  { id: 'modeIntersection', label: 'Punkt przecięcia', mode: 'intersection', icon: '<path d="M3 12h6M15 12h6M12 3v6M12 15v6M6 6l12 12M6 18l12-12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>', viewBox: '0 0 24 24' },
  { id: 'modeSegment', label: 'Odcinek', mode: 'segment', icon: '<circle cx="6" cy="12" r="2.2" class="icon-fill"/><circle cx="18" cy="12" r="2.2" class="icon-fill"/><line x1="6" y1="12" x2="18" y2="12"/>', viewBox: '0 0 24 24' },
  { id: 'modeParallel', label: 'Równoległa', mode: 'parallel', icon: '<line x1="5" y1="8" x2="19" y2="8"/><line x1="5" y1="16" x2="19" y2="16"/>', viewBox: '0 0 24 24' },
  { id: 'modePerpendicular', label: 'Prostopadła', mode: 'perpendicular', icon: '<line x1="5" y1="12" x2="19" y2="12"/><line x1="12" y1="5" x2="12" y2="19"/>', viewBox: '0 0 24 24' },
  { id: 'modeCircle', label: 'Okrąg', mode: 'circle', icon: '<circle cx="12" cy="12" r="8"/><line x1="12" y1="12" x2="18" y2="12"/><circle cx="18" cy="12" r="1.4" class="icon-fill"/>', viewBox: '0 0 24 24' },
  { id: 'modeCircleThree', label: 'Okrąg przez 3 punkty', mode: 'circleThree', icon: '<ellipse cx="12" cy="12" rx="8.5" ry="7.5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="6.5" r="2.2" class="icon-fill" stroke="currentColor" stroke-width="0.8"/><circle cx="16.5" cy="6" r="2.2" class="icon-fill" stroke="currentColor" stroke-width="0.8"/><circle cx="17.5" cy="16" r="2.2" class="icon-fill" stroke="currentColor" stroke-width="0.8"/>', viewBox: '0 0 24 24' },
  { id: 'modeTriangleUp', label: 'Trójkąt foremny', mode: 'triangleUp', icon: '<path d="M4 18h16L12 5Z"/>', viewBox: '0 0 24 24' },
  { id: 'modeSquare', label: 'Kwadrat', mode: 'square', icon: '<rect x="5" y="5" width="14" height="14"/>', viewBox: '0 0 24 24' },
  { id: 'modeNgon', label: 'N-kąt', mode: 'ngon', icon: '<polygon points="20,15.5 15.5,20 8.5,20 4,15.5 4,8.5 8.5,4 15.5,4 20,8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>', viewBox: '0 0 24 24' },
  { id: 'modePolygon', label: 'Wielokąt', mode: 'polygon', icon: '<polygon points="5,4 19,7 16,19 5,15"/><circle cx="5" cy="4" r="1.2" class="icon-fill"/><circle cx="19" cy="7" r="1.2" class="icon-fill"/><circle cx="16" cy="19" r="1.2" class="icon-fill"/><circle cx="5" cy="15" r="1.2" class="icon-fill"/>', viewBox: '0 0 24 24' },
  { id: 'modeAngle', label: 'Kąt', mode: 'angle', icon: '<line x1="14" y1="54" x2="50" y2="54" stroke="currentColor" stroke-width="4" stroke-linecap="round" /><line x1="14" y1="54" x2="42" y2="18" stroke="currentColor" stroke-width="4" stroke-linecap="round" /><path d="M20 46 A12 12 0 0 1 32 54" fill="none" stroke="currentColor" stroke-width="3" />', viewBox: '0 0 64 64' },
  { id: 'modeBisector', label: 'Dwusieczna', mode: 'bisector', icon: '<line x1="6" y1="18" x2="20" y2="18" /><line x1="6" y1="18" x2="14" y2="6" /><line x1="6" y1="18" x2="20" y2="10" />', viewBox: '0 0 24 24' },
  { id: 'modeMidpoint', label: 'Punkt środkowy', mode: 'midpoint', icon: '<circle cx="6" cy="12" r="1.5" class="icon-fill"/><circle cx="18" cy="12" r="1.5" class="icon-fill"/><circle cx="12" cy="12" r="2.5" class="icon-fill"/><circle cx="12" cy="12" r="1" fill="var(--bg)" stroke="none"/>', viewBox: '0 0 24 24' },
  { id: 'modeSymmetric', label: 'Symetria', mode: 'symmetric', icon: '<line x1="12" y1="4" x2="12" y2="20" /><circle cx="7.5" cy="10" r="1.7" class="icon-fill"/><circle cx="16.5" cy="14" r="1.7" class="icon-fill"/><path d="M7.5 10 16.5 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>', viewBox: '0 0 24 24' },
  { id: 'modeTangent', label: 'Styczna', mode: 'tangent', icon: '<circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="2" y1="17" x2="22" y2="17" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" transform="rotate(-25 12 12)"/>', viewBox: '0 0 24 24' },
  { id: 'modePerpBisector', label: 'Symetralna', mode: 'perpBisector', icon: '<circle cx="7" cy="12" r="2" class="icon-fill"/><circle cx="17" cy="12" r="2" class="icon-fill"/><circle cx="12" cy="12" r="2.5" class="icon-fill"/><circle cx="12" cy="12" r="1" fill="var(--bg)" stroke="none"/><line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" stroke-width="1.5"/>', viewBox: '0 0 24 24' },
  { id: 'modeHandwriting', label: 'Pismo ręczne', mode: 'handwriting', icon: '<path d="M5.5 18.5 4 20l1.5-.1L9 19l10.5-10.5a1.6 1.6 0 0 0 0-2.2L17.7 4a1.6 1.6 0 0 0-2.2 0L5 14.5l.5 4Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.5 5.5 18.5 8.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>', viewBox: '0 0 24 24' },
] as const;

function initializeButtonConfig() {
  const cp = (window as any).configPane;
  if (cp && typeof cp.initializeButtonConfig === 'function') return cp.initializeButtonConfig();
  // fallback: no-op if config pane not available
}

function loadConfigIntoUI(multiGroups: HTMLElement, secondGroups: HTMLElement) {
  const cp = (window as any).configPane;
  if (cp && typeof cp.loadConfigIntoUI === 'function') return cp.loadConfigIntoUI(multiGroups, secondGroups);
  // fallback: no-op
}

function cleanupSecondRowHandlers() {
  const cp = (window as any).configPane;
  if (cp && typeof cp.cleanupSecondRowHandlers === 'function') return cp.cleanupSecondRowHandlers();
  // fallback: clear local handlers
  secondRowHandlerCleanup.forEach((dispose) => dispose());
  secondRowHandlerCleanup.clear();
}

function setSecondRowActivationMode(mode: SecondRowTriggerMode) {
  const cp = (window as any).configPane;
  if (cp && typeof cp.setSecondRowActivationMode === 'function') return cp.setSecondRowActivationMode(mode);
  if (secondRowActivationMode === mode) return;
  secondRowActivationMode = mode;
  buttonConfig.secondRowTrigger = mode;
  saveButtonConfigToStorage();
  applyButtonConfiguration();
  updateToolButtons();
}

function applyButtonConfiguration() {
  const toolRow = document.getElementById('toolbarMainRow');
  if (!toolRow) return;
  if (!buttonConfig.secondRowTrigger) {
    buttonConfig.secondRowTrigger = 'swipe';
  }
  secondRowActivationMode = buttonConfig.secondRowTrigger;
  hideSecondRow();
  cleanupSecondRowHandlers();
  
  // Get all TOOL buttons (only from TOOL_BUTTONS list, not other buttons!)
  const allButtons = new Map<string, HTMLElement>();
  TOOL_BUTTONS.forEach(tool => {
    const btn = document.getElementById(tool.id);
    if (btn) {
      allButtons.set(tool.id, btn as HTMLElement);
    }
  });
  allButtons.forEach((btn) => {
    const indicator = btn.querySelector('.multi-indicator');
    if (indicator) indicator.remove();
    btn.classList.remove('has-second-row');
    delete btn.dataset.secondRowConfig;
  });

  // Track which buttons have been placed
  const placedButtons = new Set<string>();
  
  // Apply multi-button configuration
  Object.entries(buttonConfig.multiButtons).forEach(([mainId, buttonIds]) => {
    const mainBtn = allButtons.get(mainId);
    if (!mainBtn || buttonIds.length === 0) return;
    
    // Mark all in group as placed
    buttonIds.forEach(id => placedButtons.add(id));
    
    // Initialize state if not exists
    if (!(mainId in multiButtonStates)) {
      multiButtonStates[mainId] = 0;
    }
    
    // Add indicator dot for multi-button
    if (buttonIds.length > 1) {
      // Remove old indicator if exists
      const oldIndicator = mainBtn.querySelector('.multi-indicator');
      if (oldIndicator) oldIndicator.remove();
      
      const indicator = document.createElement('span');
      indicator.className = 'multi-indicator';
      indicator.style.cssText = 'position:absolute; top:3px; right:3px; width:10px; height:10px; display:flex; flex-direction:column; align-items:center; gap:1px;';
      
      // Create three dots in triangle formation
      const dot1 = document.createElement('span');
      dot1.style.cssText = 'width:2.5px; height:2.5px; background:rgba(128,128,128,0.6); border-radius:50%;';
      
      const dotsRow = document.createElement('span');
      dotsRow.style.cssText = 'display:flex; gap:2px;';
      
      const dot2 = document.createElement('span');
      dot2.style.cssText = 'width:2.5px; height:2.5px; background:rgba(128,128,128,0.6); border-radius:50%;';
      
      const dot3 = document.createElement('span');
      dot3.style.cssText = 'width:2.5px; height:2.5px; background:rgba(128,128,128,0.6); border-radius:50%;';
      
      dotsRow.appendChild(dot2);
      dotsRow.appendChild(dot3);
      
      indicator.appendChild(dot1);
      indicator.appendChild(dotsRow);
      
      mainBtn.style.position = 'relative';
      mainBtn.appendChild(indicator);
      
      // Remove old click handler and add new cycling logic
      const newBtn = mainBtn.cloneNode(true) as HTMLElement;
      mainBtn.parentNode?.replaceChild(newBtn, mainBtn);
      allButtons.set(mainId, newBtn);
      
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const currentIndex = multiButtonStates[mainId];
        const currentToolId = buttonIds[currentIndex];
        const currentTool = TOOL_BUTTONS.find(t => t.id === currentToolId);
        
        if (!currentTool) return;
        
        // Check if current tool is already active
        let isCurrentToolActive = false;
        if (currentToolId === 'copyStyleBtn') {
          isCurrentToolActive = copyStyleActive;
        } else {
          isCurrentToolActive = mode === currentTool.mode;
        }
        
        // If tool is active, cycle to next. Otherwise, activate current tool
        if (isCurrentToolActive) {
          // Cycle to next button in the group
          multiButtonStates[mainId] = (multiButtonStates[mainId] + 1) % buttonIds.length;
          const newIndex = multiButtonStates[mainId];
          const newToolId = buttonIds[newIndex];
          const newTool = TOOL_BUTTONS.find(t => t.id === newToolId);
          
          if (newTool) {
            // Update button icon
            const svgElement = newBtn.querySelector('svg');
            if (svgElement) {
              svgElement.setAttribute('viewBox', newTool.viewBox);
              svgElement.innerHTML = newTool.icon;
            }
            
            // Update title
            newBtn.setAttribute('title', newTool.label);
            newBtn.setAttribute('aria-label', newTool.label);
            
            // If we cycled back to the first tool, deactivate instead of activating
            if (newIndex === 0) {
              // Deactivate
              if (newToolId === 'copyStyleBtn') {
                copyStyleActive = false;
                copiedStyle = null;
                updateSelectionButtons();
              } else {
                setMode('move');
              }
            } else {
              // Activate the new tool
              if (newToolId === 'copyStyleBtn') {
                if (!copyStyleActive) {
                  const style = copyStyleFromSelection();
                  if (style) {
                    copiedStyle = style;
                    copyStyleActive = true;
                    // activated via multi-button
                    updateSelectionButtons();
                  }
                }
              } else {
                setMode(newTool.mode as Mode);
              }
            }
          }
        } else {
          // Activate current tool
          if (currentToolId === 'copyStyleBtn') {
            if (!copyStyleActive) {
              const style = copyStyleFromSelection();
              if (style) {
                    copiedStyle = style;
                    copyStyleActive = true;
                    // activated via multi-button (current tool)
                    updateSelectionButtons();
              }
            } else {
              copyStyleActive = false;
              copiedStyle = null;
              updateSelectionButtons();
            }
          } else {
            setMode(currentTool.mode as Mode);
          }
        }
      });
      
      // Set initial icon
      const initialTool = TOOL_BUTTONS.find(t => t.id === buttonIds[multiButtonStates[mainId]]);
      if (initialTool) {
        const svgElement = newBtn.querySelector('svg');
        if (svgElement) {
          svgElement.setAttribute('viewBox', initialTool.viewBox);
          svgElement.innerHTML = initialTool.icon;
        }
        newBtn.setAttribute('title', initialTool.label);
        newBtn.setAttribute('aria-label', initialTool.label);
      }
    }
  });
  
  // Apply second-row configuration
  Object.entries(buttonConfig.secondRow).forEach(([mainId, secondRowIds]) => {
    const mainBtn = allButtons.get(mainId);
    if (!mainBtn || secondRowIds.length === 0) return;
    
    // Mark main and second row buttons as placed
    placedButtons.add(mainId);
    secondRowIds.forEach(id => placedButtons.add(id));
    
    // Add visual indicator for second row
    mainBtn.classList.add('has-second-row');
    
    // Store reference for later attachment of events
    mainBtn.dataset.secondRowConfig = JSON.stringify(secondRowIds);
  });
  
  // Show all buttons that are either:
  // 1. Not in any configuration (unconfigured buttons)
  // 2. Main buttons of configured groups
  allButtons.forEach((btn, id) => {
    // If button is in a multi-group, only show if it's the main (first) button
    const isMainInMulti = Object.keys(buttonConfig.multiButtons).includes(id);
    const isSecondaryInMulti = Object.values(buttonConfig.multiButtons).some(
      group => group.includes(id) && group[0] !== id
    );
    
    // If button is in a second-row group, only show main button
    const isMainInSecondRow = Object.keys(buttonConfig.secondRow).includes(id);
    const isInSecondRow = Object.values(buttonConfig.secondRow).some(
      group => group.includes(id)
    );
    
    if (isSecondaryInMulti || isInSecondRow) {
      // Hide secondary buttons in multi-groups and all second-row buttons
      btn.style.display = 'none';
    } else {
      // Show main buttons and unconfigured buttons
      btn.style.display = 'inline-flex';
    }
  });
  
  // Reorder buttons in toolbar according to buttonOrder
  const orderedButtons: HTMLElement[] = [];
  buttonOrder.forEach(toolId => {
    const btn = allButtons.get(toolId);
    if (btn && btn.style.display !== 'none') {
      orderedButtons.push(btn);
    }
  });
  
  // Append buttons in order
  orderedButtons.forEach(btn => {
    toolRow.appendChild(btn);
  });
  
  // Attach swipe-up handlers to buttons with second row after all buttons are in DOM
  attachSecondRowHandlers(allButtons);
}

function attachSecondRowHandlers(allButtons: Map<string, HTMLElement>) {
  const cp = (window as any).configPane;
  if (cp && typeof cp.attachSecondRowHandlers === 'function') return cp.attachSecondRowHandlers(allButtons);
  // fallback: minimal behavior - re-run local attach using existing implementation if needed
}

function toggleSecondRow(mainId: string, secondRowIds: string[], allButtons: Map<string, HTMLElement>) {
  const cp = (window as any).configPane;
  if (cp && typeof cp.toggleSecondRow === 'function') return cp.toggleSecondRow(mainId, secondRowIds, allButtons);
}

function hideSecondRow() {
  const cp = (window as any).configPane;
  if (cp && typeof cp.hideSecondRow === 'function') return cp.hideSecondRow();
  const secondRowContainer = document.getElementById('toolbarSecondRow');
  if (!secondRowContainer) return;
  secondRowContainer.classList.add('hidden');
  setTimeout(() => { secondRowContainer.style.display = 'none'; }, 250);
  secondRowContainer.innerHTML = '';
  secondRowVisible = false; secondRowActiveButton = null; secondRowToolIds = [];
}

function updateSecondRowActiveStates() {
  const cp = (window as any).configPane;
  if (cp && typeof cp.updateSecondRowActiveStates === 'function') return cp.updateSecondRowActiveStates();
  if (!secondRowVisible) return; const secondRowContainer = document.getElementById('toolbarSecondRow'); if (!secondRowContainer) return; const buttons = secondRowContainer.querySelectorAll('button.tool'); buttons.forEach(btn => { const element = btn as HTMLElement; const toolId = element.dataset.toolId; let btnTool = toolId ? TOOL_BUTTONS.find((t) => t.id === toolId) : undefined; if (!btnTool) { const btnTitle = btn.getAttribute('title'); if (btnTitle) btnTool = TOOL_BUTTONS.find((t) => t.label === btnTitle); } if (btnTool && btnTool.mode === mode) btn.classList.add('active'); else btn.classList.remove('active'); });
}

function setupPaletteDragAndDrop() {
  const cp = (window as any).configPane;
  if (cp && typeof cp.setupPaletteDragAndDrop === 'function') return cp.setupPaletteDragAndDrop();
}

function setupDropZone(element: HTMLElement, type: 'multi' | 'second') {
  element.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    element.style.borderColor = '#3b82f6';
    element.style.background = 'rgba(59, 130, 246, 0.1)';
  });
  
  element.addEventListener('dragleave', () => {
    element.style.borderColor = 'transparent';
    element.style.background = 'rgba(0,0,0,0.1)';
  });
  
  element.addEventListener('drop', (e) => {
    e.preventDefault();
    element.style.borderColor = 'transparent';
    element.style.background = 'rgba(0,0,0,0.1)';
    
    if (!e.dataTransfer) return;
    
    const toolId = e.dataTransfer.getData('toolId');
    const toolIcon = e.dataTransfer.getData('toolIcon');
    const toolViewBox = e.dataTransfer.getData('toolViewBox');
    const toolLabel = e.dataTransfer.getData('toolLabel');
    
    const target = e.target as HTMLElement;
    
    // Check if dropping on an existing group
    const droppedOnGroup = target.classList.contains('button-group') || target.closest('.button-group');
    
    if (toolId && toolIcon && toolViewBox) {
      if (droppedOnGroup && target !== element) {
        // Add to existing group
        const group = target.classList.contains('button-group') ? target : target.closest('.button-group');
        if (group) {
          const removeBtn = group.querySelector('.group-remove-btn');
          const toolBtn = createConfigToolButton(toolId, toolIcon, toolViewBox, toolLabel);
          
          if (removeBtn) {
            group.insertBefore(toolBtn, removeBtn);
          } else {
            group.appendChild(toolBtn);
          }
          saveButtonConfig();
        }
      } else {
        // Create new group
        addButtonGroup(element, type);
        const newGroup = element.lastElementChild as HTMLElement;
        if (newGroup) {
          const removeBtn = newGroup.querySelector('.group-remove-btn');
          const toolBtn = createConfigToolButton(toolId, toolIcon, toolViewBox, toolLabel);
          
          if (removeBtn) {
            newGroup.insertBefore(toolBtn, removeBtn);
          } else {
            newGroup.appendChild(toolBtn);
          }
          saveButtonConfig();
        }
      }
    }
  });
}

function createConfigToolButton(toolId: string, toolIcon: string, toolViewBox: string, toolLabel: string): HTMLElement {
  const toolBtn = document.createElement('div');
  toolBtn.className = 'config-tool-item';
  toolBtn.dataset.toolId = toolId;
  toolBtn.title = toolLabel;
  toolBtn.draggable = true;
  toolBtn.style.cssText = 'padding:6px; background:var(--btn); border:1px solid var(--btn-border); border-radius:6px; display:flex; gap:4px; align-items:center; justify-content:center; min-width:40px; min-height:40px; cursor:grab; position:relative;';
  
  const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgIcon.setAttribute('class', 'icon');
  svgIcon.setAttribute('viewBox', toolViewBox);
  svgIcon.setAttribute('aria-hidden', 'true');
  svgIcon.style.cssText = 'width:20px; height:20px; pointer-events:none; flex-shrink:0;';
  svgIcon.innerHTML = toolIcon;
  
  toolBtn.appendChild(svgIcon);
  
  // Add remove icon on hover
  const removeIcon = document.createElement('span');
  removeIcon.textContent = '✕';
  removeIcon.style.cssText = 'width:18px; height:18px; background:#ef4444; color:white; border-radius:50%; display:none; align-items:center; justify-content:center; font-size:12px; cursor:pointer; flex-shrink:0; position:absolute; top:-6px; right:-6px;';
  toolBtn.appendChild(removeIcon);
  
  toolBtn.addEventListener('mouseenter', () => {
    removeIcon.style.display = 'flex';
  });
  
  toolBtn.addEventListener('mouseleave', () => {
    removeIcon.style.display = 'none';
  });
  
  removeIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    toolBtn.remove();
    saveButtonConfig();
  });
  
  // Drag events for reordering within group
  toolBtn.addEventListener('dragstart', (e) => {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('toolId', toolId);
      e.dataTransfer.setData('toolIcon', toolIcon);
      e.dataTransfer.setData('toolViewBox', toolViewBox);
      e.dataTransfer.setData('toolLabel', toolLabel);
      e.dataTransfer.setData('fromGroup', 'true');
      toolBtn.style.opacity = '0.4';
    }
  });
  
  toolBtn.addEventListener('dragend', () => {
    toolBtn.style.opacity = '1';
  });
  
  // Allow dropping on this button to reorder
  toolBtn.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const fromGroup = e.dataTransfer?.types.includes('text/plain');
    if (fromGroup) {
      toolBtn.style.background = 'rgba(59, 130, 246, 0.2)';
    }
  });
  
  toolBtn.addEventListener('dragleave', () => {
    toolBtn.style.background = 'var(--btn)';
  });
  
  toolBtn.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toolBtn.style.background = 'var(--btn)';
    
    if (!e.dataTransfer) return;
    
    const draggedToolId = e.dataTransfer.getData('toolId');
    const draggedToolIcon = e.dataTransfer.getData('toolIcon');
    const draggedToolViewBox = e.dataTransfer.getData('toolViewBox');
    const draggedToolLabel = e.dataTransfer.getData('toolLabel');
    const fromGroup = e.dataTransfer.getData('fromGroup');
    
    if (draggedToolId && draggedToolId !== toolId) {
      const group = toolBtn.closest('.button-group');
      if (!group) return;
      
      // If dragging from another button in group, find and remove it
      if (fromGroup) {
        const existingBtn = Array.from(group.querySelectorAll('.config-tool-item')).find(
          btn => (btn as HTMLElement).dataset.toolId === draggedToolId
        );
        if (existingBtn) {
          existingBtn.remove();
        }
      }
      
      // Insert new button before this one
      const newBtn = createConfigToolButton(draggedToolId, draggedToolIcon, draggedToolViewBox, draggedToolLabel);
      toolBtn.parentElement?.insertBefore(newBtn, toolBtn);
      saveButtonConfig();
    }
  });
  
  // Setup touch drag support
  setupConfigTouchDrag(toolBtn, toolId, toolIcon, toolViewBox, toolLabel, true);
  
  return toolBtn;
}

function addButtonGroup(container: HTMLElement, type: 'multi' | 'second') {
  const group = document.createElement('div');
  group.className = 'button-group';
  group.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding:12px; background:var(--panel); border:2px solid var(--btn-border); border-radius:8px; min-height:60px; width:100%;';
  group.dataset.groupType = type;

  const removeBtn = document.createElement('button');
  removeBtn.textContent = '✕';
  removeBtn.className = 'tool icon-btn group-remove-btn';
  removeBtn.style.cssText = 'margin-left:auto; width:24px; height:24px; padding:0; background:transparent; border:none; font-size:18px; opacity:0.6; cursor:pointer;';
  removeBtn.addEventListener('click', () => {
    group.remove();
    saveButtonConfig();
  });

  group.appendChild(removeBtn);
  container.appendChild(group);

  group.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    group.style.background = 'rgba(59, 130, 246, 0.1)';
  });

  group.addEventListener('dragleave', (e) => {
    e.stopPropagation(); // Stop propagation to parent
    group.style.background = 'var(--panel)';
  });

  group.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation(); // CRITICAL: Stop propagation to prevent double-add
    group.style.background = 'var(--panel)';

    if (!e.dataTransfer) return;

    const toolId = e.dataTransfer.getData('toolId');
    const toolIcon = e.dataTransfer.getData('toolIcon');
    const toolViewBox = e.dataTransfer.getData('toolViewBox');
    const toolLabel = e.dataTransfer.getData('toolLabel');

    if (toolId && toolIcon && toolViewBox) {
      const existingRemove = group.querySelector('.group-remove-btn');
      const toolBtn = createConfigToolButton(toolId, toolIcon, toolViewBox, toolLabel);
      if (existingRemove) {
        group.insertBefore(toolBtn, existingRemove);
      } else {
        group.appendChild(toolBtn);
      }
      saveButtonConfig();
    }
  });
    return group;
}

// Save current buttonConfig state directly to localStorage without reading from DOM
function saveButtonConfigToStorage() {
  try {
    localStorage.setItem('geometryButtonConfig', JSON.stringify(buttonConfig));
  } catch (e) {
  }
}

function saveButtonConfig() {
  const multiGroups = document.getElementById('multiGroups');
  const secondGroups = document.getElementById('secondGroups');
  
  buttonConfig = {
    multiButtons: {},
    secondRow: {},
    secondRowTrigger: secondRowActivationMode
  };
  
  // Save multi-button groups
  if (multiGroups) {
    const groups = multiGroups.querySelectorAll('.button-group');
    groups.forEach((group, index) => {
      const buttons = group.querySelectorAll('.config-tool-item');
      const buttonIds: string[] = [];
      
      buttons.forEach(btn => {
        const toolId = (btn as HTMLElement).dataset.toolId;
        if (toolId) {
          buttonIds.push(toolId);
        }
      });
      
      if (buttonIds.length > 0) {
        // Use first button as the main ID
        const mainId = buttonIds[0];
        buttonConfig.multiButtons[mainId] = buttonIds;
      }
    });
  }
  
  // Save second-row groups
  if (secondGroups) {
    const groups = secondGroups.querySelectorAll('.button-group');
    groups.forEach((group) => {
      const buttons = group.querySelectorAll('.config-tool-item');
      const buttonIds: string[] = [];
      
      buttons.forEach(btn => {
        const toolId = (btn as HTMLElement).dataset.toolId;
        if (toolId) {
          buttonIds.push(toolId);
        }
      });
      
      if (buttonIds.length > 0) {
        // First button is main, rest are second row
        const mainId = buttonIds[0];
        const secondRowIds = buttonIds.slice(1);
        if (secondRowIds.length > 0) {
          buttonConfig.secondRow[mainId] = secondRowIds;
        }
      }
    });
  }
  
  // Save to localStorage
  saveButtonConfigToStorage();
  applyButtonConfiguration();
  updateToolButtons();
}

function saveButtonOrder() {
  try {
    localStorage.setItem('geometryButtonOrder', JSON.stringify(buttonOrder));
  } catch (e) {
  }
}

function loadButtonOrder() {
  try {
    const saved = localStorage.getItem('geometryButtonOrder');
    if (saved) {
      buttonOrder = JSON.parse(saved);
      
      // Add any new buttons that don't exist in saved config
      const allToolIds = TOOL_BUTTONS.map(t => t.id);
      const newButtons = allToolIds.filter(id => !buttonOrder.includes(id));
      if (newButtons.length > 0) {
        // Append new buttons at the end
        buttonOrder.push(...newButtons);
        saveButtonOrder(); // Save updated config
      }
    } else {
      // Initialize with default order
      buttonOrder = TOOL_BUTTONS.map(t => t.id);
    }
  } catch (e) {
    buttonOrder = TOOL_BUTTONS.map(t => t.id);
  }
}

function rebuildPalette() {
  const paletteGrid = document.getElementById('paletteGrid');
  if (!paletteGrid) return;
  
  paletteGrid.innerHTML = '';
  
  buttonOrder.forEach(toolId => {
    const tool = TOOL_BUTTONS.find(t => t.id === toolId);
    if (!tool) return;
    
    const btn = document.createElement('button');
    btn.className = 'config-tool-btn tool icon-btn';
    btn.dataset.toolId = tool.id;
    btn.title = tool.label;
    btn.style.cssText = 'padding:6px; background:var(--btn); border:1px solid var(--btn-border); border-radius:8px; cursor:move; display:flex; align-items:center; justify-content:center; min-height:44px; width:100%; aspect-ratio:1;';
    
    const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgIcon.setAttribute('class', 'icon');
    svgIcon.setAttribute('viewBox', tool.viewBox);
    svgIcon.setAttribute('aria-hidden', 'true');
    svgIcon.style.cssText = 'width:22px; height:22px; pointer-events:none;';
    svgIcon.innerHTML = tool.icon;
    
    btn.appendChild(svgIcon);
    paletteGrid.appendChild(btn);
  });
  
  setupPaletteDragAndDrop();
}

function setupConfigTouchDrag(toolBtn: HTMLElement, toolId: string, toolIcon: string, toolViewBox: string, toolLabel: string, fromGroup: boolean) {
  
  let isDragging = false;
  let phantom: HTMLElement | null = null;
  let currentDropZone: HTMLElement | null = null;
  
  toolBtn.addEventListener('touchstart', (e) => {
    // Prevent native scrolling so we can initiate a drag
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    isDragging = false;
    configTouchDrag = {
      element: toolBtn,
      toolId,
      toolIcon,
      toolViewBox,
      toolLabel,
      startX: touch.clientX,
      startY: touch.clientY,
      fromGroup
    };
  }, { passive: false });
  
  toolBtn.addEventListener('touchmove', (e) => {
    if (!configTouchDrag) return;
    
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - configTouchDrag.startX);
    const dy = Math.abs(touch.clientY - configTouchDrag.startY);
    
    // Start dragging if moved more than 5px
    if (!isDragging && (dx > 5 || dy > 5)) {
      isDragging = true;
      toolBtn.style.opacity = '0.4';
      
      // Create phantom element - only copy the icon, not all styles
      phantom = document.createElement('div');
      phantom.style.cssText = 'position:fixed; pointer-events:none; opacity:0.8; z-index:10000; padding:6px; background:var(--btn); border:2px solid #3b82f6; border-radius:6px; display:flex; align-items:center; justify-content:center; width:40px; height:40px;';
      
      const svgClone = toolBtn.querySelector('svg')?.cloneNode(true) as SVGElement;
      if (svgClone) {
        phantom.appendChild(svgClone);
      }
      
      phantom.style.left = (touch.clientX - 20) + 'px';
      phantom.style.top = (touch.clientY - 20) + 'px';
      document.body.appendChild(phantom);
      
      e.preventDefault();
    }
    
    if (isDragging && phantom) {
      phantom.style.left = (touch.clientX - 20) + 'px';
      phantom.style.top = (touch.clientY - 20) + 'px';
      
      // Highlight drop zones
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (target) {
        const group = target.closest('.button-group');
        const dropZone = target.closest('#multiGroups, #secondGroups') as HTMLElement;
        
        // Clear previous highlights
        if (currentDropZone && currentDropZone !== group && currentDropZone !== dropZone) {
          currentDropZone.style.background = '';
          currentDropZone.style.borderColor = '';
        }
        
        if (group) {
          if (currentDropZone !== group) {
            (group as HTMLElement).style.background = 'rgba(59, 130, 246, 0.1)';
          }
          currentDropZone = group as HTMLElement;
        } else if (dropZone) {
          if (currentDropZone !== dropZone) {
            dropZone.style.background = 'rgba(59, 130, 246, 0.05)';
            dropZone.style.borderColor = '#3b82f6';
          }
          currentDropZone = dropZone;
        } else {
          if (currentDropZone) {
            currentDropZone.style.background = '';
            currentDropZone.style.borderColor = '';
            currentDropZone = null;
          }
        }
      }
      
      e.preventDefault();
    }
  }, { passive: false });
  
  toolBtn.addEventListener('touchend', (e) => {
    // Clear highlights
    if (currentDropZone) {
      currentDropZone.style.background = '';
      currentDropZone.style.borderColor = '';
      currentDropZone = null;
    }
    
    if (phantom) {
      phantom.remove();
      phantom = null;
    }
    
    if (!configTouchDrag || !isDragging) {
      toolBtn.style.opacity = '1';
      configTouchDrag = null;
      isDragging = false;
      return;
    }
    
    toolBtn.style.opacity = '1';
    
    const touch = e.changedTouches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    
    if (!target) {
      configTouchDrag = null;
      isDragging = false;
      return;
    }
    
    // Check if dropped on palette button (for reordering palette)
    const paletteBtn = target.closest('.config-tool-btn');
    const paletteGrid = document.getElementById('paletteGrid');
    
    if (paletteBtn && paletteGrid && paletteBtn.parentElement === paletteGrid && !fromGroup) {
      // Reordering in palette
      const targetToolId = (paletteBtn as HTMLElement).dataset.toolId;
      const draggedToolId = configTouchDrag.toolId;
      
      if (targetToolId && draggedToolId && targetToolId !== draggedToolId) {
        const draggedIndex = buttonOrder.indexOf(draggedToolId);
        const targetIndex = buttonOrder.indexOf(targetToolId);
        
        if (draggedIndex !== -1 && targetIndex !== -1) {
          buttonOrder.splice(draggedIndex, 1);
          buttonOrder.splice(targetIndex, 0, draggedToolId);
          
          saveButtonOrder();
          rebuildPalette();
          applyButtonConfiguration();
        }
      }
      
      configTouchDrag = null;
      isDragging = false;
      return;
    }
    
    // Check if dropped on a group first
    const group = target.closest('.button-group');
    if (group) {
      // Check if dropped on another config button in group
      const targetBtn = target.closest('.config-tool-item') as HTMLElement;
      if (targetBtn && targetBtn !== toolBtn) {
        // Reordering within group - check if same group
        const toolBtnGroup = toolBtn.closest('.button-group');
        if (toolBtnGroup === group) {
          // Same group - just reorder (move, don't clone)
          group.insertBefore(toolBtn, targetBtn);
        } else {
          // Different group - remove from old, add to new
          toolBtn.remove();
          group.insertBefore(
            createConfigToolButton(configTouchDrag.toolId, configTouchDrag.toolIcon, configTouchDrag.toolViewBox, configTouchDrag.toolLabel),
            targetBtn
          );
        }
        saveButtonConfig();
      } else if (!targetBtn || targetBtn === toolBtn) {
        // Dropped on empty space in group but not on self
        if (targetBtn !== toolBtn) {
          const toolBtnGroup = toolBtn.closest('.button-group');
          if (fromGroup) {
            const existingBtn = Array.from(group.querySelectorAll('.config-tool-item')).find(
              btn => (btn as HTMLElement).dataset.toolId === configTouchDrag!.toolId
            );
            if (existingBtn && existingBtn !== toolBtn) {
              existingBtn.remove();
            }
          }
          
          if (toolBtnGroup === group && fromGroup) {
            // Same group, just dropped on empty space - do nothing
          } else {
            // Different group or from palette
            const removeBtn = group.querySelector('.group-remove-btn');
            const newBtn = createConfigToolButton(configTouchDrag.toolId, configTouchDrag.toolIcon, configTouchDrag.toolViewBox, configTouchDrag.toolLabel);
            if (removeBtn) {
              group.insertBefore(newBtn, removeBtn);
            } else {
              group.appendChild(newBtn);
            }
            if (fromGroup && toolBtnGroup !== group) {
              toolBtn.remove();
            }
          }
          saveButtonConfig();
        }
      }
      configTouchDrag = null;
      isDragging = false;
      return;
    }
    
    // Check if dropped on a drop zone (not in a group)
    const dropZone = target.closest('#multiGroups, #secondGroups');
    
    // If from group and not dropped on any valid target, remove it
    if (fromGroup && !dropZone) {
      // Dragged outside - remove the button
      toolBtn.remove();
      saveButtonConfig();
      configTouchDrag = null;
      isDragging = false;
      return;
    }
    
    // Only create new group if explicitly dropped on drop zone area (not just anywhere)
    if (dropZone && !fromGroup) {
      // Only allow creating new groups from palette, not from existing groups
      const dropZoneId = dropZone.id;
      const groupType = dropZoneId === 'multiGroups' ? 'multi' : 'second';
      const newGroup = addButtonGroup(dropZone as HTMLElement, groupType);
      
      if (newGroup) {
        const removeBtn = newGroup.querySelector('.group-remove-btn');
        const newBtn = createConfigToolButton(configTouchDrag.toolId, configTouchDrag.toolIcon, configTouchDrag.toolViewBox, configTouchDrag.toolLabel);
        if (removeBtn) {
          newGroup.insertBefore(newBtn, removeBtn);
        } else {
          newGroup.appendChild(newBtn);
        }
        saveButtonConfig();
      }
    }
    
    configTouchDrag = null;
    isDragging = false;
  }, { passive: false });
  
  toolBtn.addEventListener('touchcancel', () => {
    if (currentDropZone) {
      currentDropZone.style.background = '';
      currentDropZone.style.borderColor = '';
      currentDropZone = null;
    }
    if (phantom) {
      phantom.remove();
      phantom = null;
    }
    toolBtn.style.opacity = '1';
    configTouchDrag = null;
    isDragging = false;
  }, { passive: false });

  // Pointer events fallback (covers touch + mouse in many browsers)
  let pointerMoveHandler: ((ev: PointerEvent) => void) | null = null;
  let pointerUpHandler: ((ev: PointerEvent) => void) | null = null;
  toolBtn.addEventListener('pointerdown', (e: PointerEvent) => {
    // Only handle primary button
    if ((e as any).button && (e as any).button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    isDragging = false;
    configTouchDrag = {
      element: toolBtn,
      toolId,
      toolIcon,
      toolViewBox,
      toolLabel,
      startX,
      startY,
      fromGroup
    };

    try { toolBtn.setPointerCapture(e.pointerId); } catch {}

    pointerMoveHandler = (ev: PointerEvent) => {
      if (!configTouchDrag) return;
      const dx = Math.abs(ev.clientX - configTouchDrag.startX);
      const dy = Math.abs(ev.clientY - configTouchDrag.startY);

      if (!isDragging && (dx > 5 || dy > 5)) {
        isDragging = true;
        toolBtn.style.opacity = '0.4';
        phantom = document.createElement('div');
        phantom.style.cssText = 'position:fixed; pointer-events:none; opacity:0.8; z-index:10000; padding:6px; background:var(--btn); border:2px solid #3b82f6; border-radius:6px; display:flex; align-items:center; justify-content:center; width:40px; height:40px;';
        const svgClone = toolBtn.querySelector('svg')?.cloneNode(true) as SVGElement;
        if (svgClone) phantom.appendChild(svgClone);
        phantom.style.left = (ev.clientX - 20) + 'px';
        phantom.style.top = (ev.clientY - 20) + 'px';
        document.body.appendChild(phantom);
      }

      if (isDragging && phantom) {
        phantom.style.left = (ev.clientX - 20) + 'px';
        phantom.style.top = (ev.clientY - 20) + 'px';
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        if (target) {
          const group = target.closest('.button-group');
          const dropZone = target.closest('#multiGroups, #secondGroups') as HTMLElement;
          if (currentDropZone && currentDropZone !== group && currentDropZone !== dropZone) {
            currentDropZone.style.background = '';
            currentDropZone.style.borderColor = '';
          }
          if (group) {
            if (currentDropZone !== group) (group as HTMLElement).style.background = 'rgba(59, 130, 246, 0.1)';
            currentDropZone = group as HTMLElement;
          } else if (dropZone) {
            if (currentDropZone !== dropZone) {
              dropZone.style.background = 'rgba(59, 130, 246, 0.05)';
              dropZone.style.borderColor = '#3b82f6';
            }
            currentDropZone = dropZone;
          } else {
            if (currentDropZone) {
              currentDropZone.style.background = '';
              currentDropZone.style.borderColor = '';
              currentDropZone = null;
            }
          }
        }
      }
    };

    pointerUpHandler = (ev: PointerEvent) => {
      if (currentDropZone) {
        currentDropZone.style.background = '';
        currentDropZone.style.borderColor = '';
        currentDropZone = null;
      }
      if (phantom) {
        phantom.remove();
        phantom = null;
      }
      try { toolBtn.releasePointerCapture(e.pointerId); } catch {}
      if (!configTouchDrag || !isDragging) {
        toolBtn.style.opacity = '1';
        configTouchDrag = null;
        isDragging = false;
        // cleanup
        if (pointerMoveHandler) document.removeEventListener('pointermove', pointerMoveHandler as any);
        if (pointerUpHandler) document.removeEventListener('pointerup', pointerUpHandler as any);
        pointerMoveHandler = null;
        pointerUpHandler = null;
        return;
      }

      toolBtn.style.opacity = '1';
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!target) {
        configTouchDrag = null;
        isDragging = false;
        if (pointerMoveHandler) document.removeEventListener('pointermove', pointerMoveHandler as any);
        if (pointerUpHandler) document.removeEventListener('pointerup', pointerUpHandler as any);
        pointerMoveHandler = null;
        pointerUpHandler = null;
        return;
      }

      // Reuse same drop logic as touchend
      const paletteBtn = target.closest('.config-tool-btn');
      const paletteGrid = document.getElementById('paletteGrid');
      if (paletteBtn && paletteGrid && paletteBtn.parentElement === paletteGrid && !fromGroup) {
        const targetToolId = (paletteBtn as HTMLElement).dataset.toolId;
        const draggedToolId = configTouchDrag.toolId;
        if (targetToolId && draggedToolId && targetToolId !== draggedToolId) {
          const draggedIndex = buttonOrder.indexOf(draggedToolId);
          const targetIndex = buttonOrder.indexOf(targetToolId);
          if (draggedIndex !== -1 && targetIndex !== -1) {
            buttonOrder.splice(draggedIndex, 1);
            buttonOrder.splice(targetIndex, 0, draggedToolId);
            saveButtonOrder();
            rebuildPalette();
            applyButtonConfiguration();
          }
        }
        configTouchDrag = null;
        isDragging = false;
        if (pointerMoveHandler) document.removeEventListener('pointermove', pointerMoveHandler as any);
        if (pointerUpHandler) document.removeEventListener('pointerup', pointerUpHandler as any);
        pointerMoveHandler = null;
        pointerUpHandler = null;
        return;
      }

      const group = target.closest('.button-group');
      if (group) {
        const targetBtn = target.closest('.config-tool-item') as HTMLElement;
        if (targetBtn && targetBtn !== toolBtn) {
          const toolBtnGroup = toolBtn.closest('.button-group');
          if (toolBtnGroup === group) {
            group.insertBefore(toolBtn, targetBtn);
          } else {
            toolBtn.remove();
            group.insertBefore(
              createConfigToolButton(configTouchDrag.toolId, configTouchDrag.toolIcon, configTouchDrag.toolViewBox, configTouchDrag.toolLabel),
              targetBtn
            );
          }
          saveButtonConfig();
        } else if (!targetBtn || targetBtn === toolBtn) {
          if (targetBtn !== toolBtn) {
            const toolBtnGroup = toolBtn.closest('.button-group');
            if (fromGroup) {
              const existingBtn = Array.from(group.querySelectorAll('.config-tool-item')).find(
                btn => (btn as HTMLElement).dataset.toolId === configTouchDrag!.toolId
              );
              if (existingBtn && existingBtn !== toolBtn) {
                existingBtn.remove();
              }
            }
            if (toolBtnGroup === group && fromGroup) {
            } else {
              const removeBtn = group.querySelector('.group-remove-btn');
              const newBtn = createConfigToolButton(configTouchDrag.toolId, configTouchDrag.toolIcon, configTouchDrag.toolViewBox, configTouchDrag.toolLabel);
              if (removeBtn) {
                group.insertBefore(newBtn, removeBtn);
              } else {
                group.appendChild(newBtn);
              }
              if (fromGroup && toolBtnGroup !== group) {
                toolBtn.remove();
              }
            }
            saveButtonConfig();
          }
        }
        configTouchDrag = null;
        isDragging = false;
        if (pointerMoveHandler) document.removeEventListener('pointermove', pointerMoveHandler as any);
        if (pointerUpHandler) document.removeEventListener('pointerup', pointerUpHandler as any);
        pointerMoveHandler = null;
        pointerUpHandler = null;
        return;
      }

      const dropZone = target.closest('#multiGroups, #secondGroups');
      if (fromGroup && !dropZone) {
        toolBtn.remove();
        saveButtonConfig();
        configTouchDrag = null;
        isDragging = false;
        if (pointerMoveHandler) document.removeEventListener('pointermove', pointerMoveHandler as any);
        if (pointerUpHandler) document.removeEventListener('pointerup', pointerUpHandler as any);
        pointerMoveHandler = null;
        pointerUpHandler = null;
        return;
      }

      if (dropZone && !fromGroup) {
        const dropZoneId = (dropZone as HTMLElement).id;
        const groupType = dropZoneId === 'multiGroups' ? 'multi' : 'second';
        const newGroup = addButtonGroup(dropZone as HTMLElement, groupType);
        if (newGroup) {
          const removeBtn = newGroup.querySelector('.group-remove-btn');
          const newBtn = createConfigToolButton(configTouchDrag.toolId, configTouchDrag.toolIcon, configTouchDrag.toolViewBox, configTouchDrag.toolLabel);
          if (removeBtn) {
            newGroup.insertBefore(newBtn, removeBtn);
          } else {
            newGroup.appendChild(newBtn);
          }
          saveButtonConfig();
        }
      }

      configTouchDrag = null;
      isDragging = false;
      if (pointerMoveHandler) document.removeEventListener('pointermove', pointerMoveHandler as any);
      if (pointerUpHandler) document.removeEventListener('pointerup', pointerUpHandler as any);
      pointerMoveHandler = null;
      pointerUpHandler = null;
    };

    document.addEventListener('pointermove', pointerMoveHandler as any);
    document.addEventListener('pointerup', pointerUpHandler as any);
  });
}

function loadButtonConfiguration() {
  try {
    const saved = localStorage.getItem('geometryButtonConfig');
    if (saved) {
      buttonConfig = JSON.parse(saved);
    }
  } catch (e) {
  }
  // Validate loaded config: ensure referenced tool IDs exist in TOOL_BUTTONS
  try {
    const validIds = new Set(TOOL_BUTTONS.map(t => t.id));
    const sanitizeList = (arr: string[] | undefined) => (arr || []).filter((id: any) => validIds.has(id));
    const newMulti: Record<string, string[]> = {};
    Object.entries(buttonConfig.multiButtons || {}).forEach(([k, v]) => {
      const filtered = sanitizeList(v);
      if (filtered.length) newMulti[k] = filtered;
    });
    const newSecond: Record<string, string[]> = {};
    Object.entries(buttonConfig.secondRow || {}).forEach(([k, v]) => {
      const filtered = sanitizeList(v);
      if (filtered.length) newSecond[k] = filtered;
    });
    buttonConfig.multiButtons = newMulti;
    buttonConfig.secondRow = newSecond;
    // If the resulting configuration hides most tools, reset to defaults
    const placedCount = Object.keys(newMulti).length + Object.keys(newSecond).length;
    if (placedCount === 0 && Object.keys(buttonConfig.multiButtons).length === 0 && Object.keys(buttonConfig.secondRow).length === 0) {
      // keep empty default
    }
  } catch (e) {
    // if validation fails, reset to safe defaults
    buttonConfig = { multiButtons: {}, secondRow: {}, secondRowTrigger: 'swipe' };
  }
  if (!buttonConfig.secondRowTrigger || (buttonConfig.secondRowTrigger !== 'tap' && buttonConfig.secondRowTrigger !== 'swipe')) {
    buttonConfig.secondRowTrigger = 'swipe';
  }
  secondRowActivationMode = buttonConfig.secondRowTrigger;
  
  // Load measurement precision settings
  try {
    const savedPrecisionLength = localStorage.getItem('measurementPrecisionLength');
    if (savedPrecisionLength !== null) {
      const value = parseInt(savedPrecisionLength, 10);
      if (!isNaN(value) && value >= 0 && value <= 5) {
        measurementPrecisionLength = value;
      }
    }
  } catch (e) {
  }
  
  try {
    const savedPrecisionAngle = localStorage.getItem('measurementPrecisionAngle');
    if (savedPrecisionAngle !== null) {
      const value = parseInt(savedPrecisionAngle, 10);
      if (!isNaN(value) && value >= 0 && value <= 5) {
        measurementPrecisionAngle = value;
      }
    }
  } catch (e) {
  }

  try {
    const savedPointStyle = localStorage.getItem(POINT_STYLE_MODE_KEY);
    if (savedPointStyle === 'filled' || savedPointStyle === 'hollow') {
      defaultPointFillMode = savedPointStyle;
    }
  } catch (e) {
  }
}

function getTimestampString() {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

function getDateString() {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function exportButtonConfiguration() {
  const config = {
    version: 1,
    buttonOrder: buttonOrder,
    multiButtons: buttonConfig.multiButtons,
    secondRow: buttonConfig.secondRow,
    secondRowTrigger: buttonConfig.secondRowTrigger ?? secondRowActivationMode,
    themeOverrides: themeOverrides,
    measurementPrecisionLength: measurementPrecisionLength,
    measurementPrecisionAngle: measurementPrecisionAngle,
    pointStyleMode: defaultPointFillMode
  };
  
      const defaultName = `constrivia-${getTimestampString()}`;
      initCloudSaveUI(config, defaultName, '.config');
}

function importButtonConfiguration(jsonString: string) {
  try {
    const config = JSON.parse(jsonString);
    
    // Validate and apply configuration with backward compatibility
    if (config.buttonOrder && Array.isArray(config.buttonOrder)) {
      // Validate that all button IDs exist
      const validIds = config.buttonOrder.filter((id: string) => 
        TOOL_BUTTONS.some(t => t.id === id)
      );
      
      // Add any new buttons that don't exist in saved config
      const allToolIds = TOOL_BUTTONS.map(t => t.id);
      const newButtons = allToolIds.filter(id => !validIds.includes(id));
      
      // Combine: imported buttons first, then new buttons at the end
      buttonOrder = [...validIds, ...newButtons];
    } else {
      // No buttonOrder in config, use default
      buttonOrder = TOOL_BUTTONS.map(t => t.id);
    }
    
    if (config.multiButtons && typeof config.multiButtons === 'object') {
      // Filter out invalid button IDs from multi-button groups
      const validMultiButtons: Record<string, string[]> = {};
      Object.entries(config.multiButtons).forEach(([mainId, buttonIds]: [string, any]) => {
        if (Array.isArray(buttonIds)) {
          const validIds = buttonIds.filter((id: string) => 
            TOOL_BUTTONS.some(t => t.id === id)
          );
          if (validIds.length > 0) {
            validMultiButtons[mainId] = validIds;
          }
        }
      });
      buttonConfig.multiButtons = validMultiButtons;
    } else {
      buttonConfig.multiButtons = {};
    }
    
    if (config.secondRow && typeof config.secondRow === 'object') {
      // Filter out invalid button IDs from second-row groups
      const validSecondRow: Record<string, string[]> = {};
      Object.entries(config.secondRow).forEach(([mainId, buttonIds]: [string, any]) => {
        if (Array.isArray(buttonIds)) {
          const validIds = buttonIds.filter((id: string) => 
            TOOL_BUTTONS.some(t => t.id === id)
          );
          if (validIds.length > 0) {
            validSecondRow[mainId] = validIds;
          }
        }
      });
      buttonConfig.secondRow = validSecondRow;
    } else {
      buttonConfig.secondRow = {};
    }
    const trigger = config.secondRowTrigger === 'tap' ? 'tap' : 'swipe';
    buttonConfig.secondRowTrigger = trigger;
    secondRowActivationMode = trigger;
    
    // Restore theme overrides
    if (config.themeOverrides && typeof config.themeOverrides === 'object') {
      themeOverrides.dark = config.themeOverrides.dark || {};
      themeOverrides.light = config.themeOverrides.light || {};
      saveThemeOverrides();
      applyThemeWithOverrides(currentTheme);
      
      // Refresh appearance tab UI if available
      if (typeof (window as any).refreshAppearanceTab === 'function') {
        (window as any).refreshAppearanceTab();
      }
    }
    
    // Restore measurement precision
    if (typeof config.measurementPrecisionLength === 'number') {
      measurementPrecisionLength = config.measurementPrecisionLength;
      localStorage.setItem('measurementPrecisionLength', measurementPrecisionLength.toString());
    }
    if (typeof config.measurementPrecisionAngle === 'number') {
      measurementPrecisionAngle = config.measurementPrecisionAngle;
      localStorage.setItem('measurementPrecisionAngle', measurementPrecisionAngle.toString());
    }

    if (config.pointStyleMode === 'filled' || config.pointStyleMode === 'hollow') {
      setDefaultPointFillMode(config.pointStyleMode);
    }
    
    // Save to localStorage (use direct storage save to avoid reading from DOM)
    saveButtonConfigToStorage();
    saveButtonOrder();
    
    // Reload UI
    applyButtonConfiguration();
    
    // Reinitialize button references and event listeners
    reinitToolButtons();

    // Delegate toolbar clicks to ensure replaced/rebuilt buttons still activate tools
    const toolbarMain = document.getElementById('toolbarMainRow');
    if (toolbarMain) {
      toolbarMain.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const btn = target.closest('button') as HTMLButtonElement | null;
        if (!btn) return;
        // Determine tool id: prefer explicit id, fall back to data-tool-id
        const toolId = btn.id || (btn.dataset && btn.dataset.toolId) || null;
        if (!toolId) return;
        const tb = TOOL_BUTTONS.find(t => t.id === toolId || t.id === (btn.dataset.toolId ?? ''));
        if (tb) {
          // Call handleToolClick with the tool mode
            try {
              // debug: log delegated toolbar activation
              try { console.debug('[toolbar] clicked', tb.id, tb.mode); } catch {}
              handleToolClick(tb.mode as Mode);
            } catch (err) { /* swallow */ }
        }
      });
    }
    
    // Always refresh button config UI (regardless of modal state)
    // This ensures the UI reflects imported changes
    initializeButtonConfig();
    
    // Update precision inputs in settings UI
    const precisionLengthInput = document.getElementById('precisionLength') as HTMLInputElement | null;
    const precisionAngleInput = document.getElementById('precisionAngle') as HTMLInputElement | null;
    if (precisionLengthInput) precisionLengthInput.value = measurementPrecisionLength.toString();
    if (precisionAngleInput) precisionAngleInput.value = measurementPrecisionAngle.toString();
    
    // Redraw to apply theme changes
    draw();
    
    return true;
  } catch (e) {
    return false;
  }
}

function setDefaultPointFillMode(mode: PointFillMode, persist = true) {
  defaultPointFillMode = mode;
  if (persist) {
    try {
      localStorage.setItem(POINT_STYLE_MODE_KEY, mode);
    } catch (err) {
    }
  }
  updatePointStyleConfigButtons();
}

function updatePointStyleConfigButtons() {
  if (!pointStyleToggleBtn) return;
  const hollowActive = defaultPointFillMode === 'hollow';
  pointStyleToggleBtn.classList.toggle('active', hollowActive);
  pointStyleToggleBtn.setAttribute('aria-pressed', hollowActive ? 'true' : 'false');
  pointStyleToggleBtn.innerHTML = hollowActive
    ? '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5.2" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
    : '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5.2" class="icon-fill"/></svg>';
}

function initAppearanceTab() {
  // Przyciski wyboru motywu
  const themeBtns = document.querySelectorAll<HTMLButtonElement>('.appearance-theme-toggle .theme-btn');
  const previewCanvas = document.getElementById('previewCanvas') as HTMLCanvasElement;
  
  let activeTheme: ThemeName = currentTheme;
  
  // Ustawienia motywu
  const themeBgColor = document.getElementById('themeBgColor') as HTMLInputElement;
  const themeStrokeColor = document.getElementById('themeStrokeColor') as HTMLInputElement;
  const themePanelColor = document.getElementById('themePanelColor') as HTMLInputElement;
  const themeHighlightColor = document.getElementById('themeHighlightColor') as HTMLInputElement;
  const themeBgColorHex = document.getElementById('themeBgColorHex') as HTMLInputElement;
  const themeStrokeColorHex = document.getElementById('themeStrokeColorHex') as HTMLInputElement;
  const themeHighlightColorHex = document.getElementById('themeHighlightColorHex') as HTMLInputElement;
  const themeSelectionLineStyle = document.getElementById('themeSelectionLineStyle') as HTMLSelectElement;
  const themeSelectionEffect = document.getElementById('themeSelectionEffect') as HTMLSelectElement;
  const themeSelectionPointStyleSameAsLine = document.getElementById('themeSelectionPointStyleSameAsLine') as HTMLInputElement;
  const themePanelColorHex = document.getElementById('themePanelColorHex') as HTMLInputElement;
  const themeLineWidthValue = document.getElementById('themeLineWidthValue');
  const themePointSizeValue = document.getElementById('themePointSizeValue');
  const themeArcRadiusValue = document.getElementById('themeArcRadiusValue');
  const themeFontSizeValue = document.getElementById('themeFontSizeValue');
  const themeHighlightWidthValue = document.getElementById('themeHighlightWidthValue');
  const themeSelectionPointRadiusValue = document.getElementById('themeSelectionPointRadiusValue');
  const resetBtn = document.getElementById('resetThemeDefaults');
  
  // Wczytaj aktualne wartości
  function loadThemeValues() {
    const theme = activeTheme;
    const base = THEME_PRESETS[theme];
    const overrides = themeOverrides[theme];
    const current = { ...base, ...overrides };
    
    if (themeBgColor) themeBgColor.value = current.bg || base.bg;
    if (themeBgColorHex) themeBgColorHex.value = (current.bg || base.bg).toLowerCase();
    if (themeStrokeColor) themeStrokeColor.value = current.defaultStroke || base.defaultStroke;
    if (themeStrokeColorHex) themeStrokeColorHex.value = (current.defaultStroke || base.defaultStroke).toLowerCase();
    if (themePanelColor) themePanelColor.value = current.panel ?? base.panel;
    if (themePanelColorHex) themePanelColorHex.value = String(current.panel ?? base.panel).toLowerCase();
    if (themeHighlightColor) themeHighlightColor.value = current.highlight || base.highlight;
    if (themeHighlightColorHex) themeHighlightColorHex.value = (current.highlight || base.highlight).toLowerCase();
    if (themeSelectionLineStyle) themeSelectionLineStyle.value = current.selectionLineStyle || base.selectionLineStyle || 'auto';
    if (themeSelectionEffect) themeSelectionEffect.value = current.selectionEffect || base.selectionEffect || 'color';
    if (themeSelectionPointStyleSameAsLine) themeSelectionPointStyleSameAsLine.checked = current.selectionPointStyleSameAsLine ?? base.selectionPointStyleSameAsLine ?? false;
    if (themeLineWidthValue) themeLineWidthValue.textContent = `${current.lineWidth || base.lineWidth} px`;
    if (themePointSizeValue) themePointSizeValue.textContent = `${current.pointSize || base.pointSize} px`;
    if (themeArcRadiusValue) themeArcRadiusValue.textContent = `${current.angleDefaultRadius || base.angleDefaultRadius} px`;
    if (themeFontSizeValue) themeFontSizeValue.textContent = `${current.fontSize || base.fontSize} px`;
    if (themeHighlightWidthValue) themeHighlightWidthValue.textContent = `${current.highlightWidth || base.highlightWidth} px`;
    if (themeSelectionPointRadiusValue) themeSelectionPointRadiusValue.textContent = `${current.selectionPointRadius || base.selectionPointRadius} px`;
    
    // Aktualizuj przyciski motywu
    themeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    
    drawPreview();
  }
  
  // Make loadThemeValues accessible globally for configuration import
  (window as any).refreshAppearanceTab = loadThemeValues;
  
  // Przełączanie motywu
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme as ThemeName;
      if (theme) {
        activeTheme = theme;
        loadThemeValues();
      }
    });
  });
  
  // Zapisz zmianę
  function saveThemeValue(key: keyof ThemeConfig, value: any) {
    themeOverrides[activeTheme][key] = value;
    saveThemeOverrides();
    if (activeTheme === currentTheme) {
      applyThemeWithOverrides(currentTheme);
      draw();
    }
    drawPreview();
  }
  
  // Kolory
  themeBgColor?.addEventListener('input', (e) => {
    const v = (e.target as HTMLInputElement).value;
    if (themeBgColorHex) themeBgColorHex.value = v.toLowerCase();
    saveThemeValue('bg', v);
  });
  
  themeStrokeColor?.addEventListener('input', (e) => {
    const v = (e.target as HTMLInputElement).value;
    if (themeStrokeColorHex) themeStrokeColorHex.value = v.toLowerCase();
    saveThemeValue('defaultStroke', v);
  });

  themePanelColor?.addEventListener('input', (e) => {
    const v = (e.target as HTMLInputElement).value;
    // Apply immediately for live preview
    try {
      const root = document.documentElement;
      const body = document.body;
      root.style.setProperty('--panel', v);
      root.style.setProperty('--panel-border', v);
      if (body) {
        body.style.setProperty('--panel', v);
        body.style.setProperty('--panel-border', v);
      }
    } catch {}
    // Save both panel and panelBorder (use same value for border by default)
    saveThemeValue('panel', v);
    saveThemeValue('panelBorder', v);
  });

  // Helper: normalize/pick hex format
  function normalizeHex(input: string): string | null {
    if (!input) return null;
    let v = input.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#([0-9a-fA-F]{3})$/.test(v)) {
      // expand #rgb to #rrggbb
      const r = v.charAt(1); const g = v.charAt(2); const b = v.charAt(3);
      return ('#' + r + r + g + g + b + b).toLowerCase();
    }
    if (/^#([0-9a-fA-F]{6})$/.test(v)) return v.toLowerCase();
    return null;
  }

  // Hex text inputs: sync into color inputs and save
  themeBgColorHex?.addEventListener('change', (e) => {
    const raw = (e.target as HTMLInputElement).value;
    const v = normalizeHex(raw);
    if (v && themeBgColor) {
      themeBgColor.value = v;
      saveThemeValue('bg', v);
    } else if (raw === '') {
      // allow clearing
      themeBgColorHex.value = '';
    }
  });
  themeStrokeColorHex?.addEventListener('change', (e) => {
    const raw = (e.target as HTMLInputElement).value;
    const v = normalizeHex(raw);
    if (v && themeStrokeColor) {
      themeStrokeColor.value = v;
      saveThemeValue('defaultStroke', v);
    }
  });
  themeHighlightColorHex?.addEventListener('change', (e) => {
    const raw = (e.target as HTMLInputElement).value;
    const v = normalizeHex(raw);
    if (v && themeHighlightColor) {
      themeHighlightColor.value = v;
      saveThemeValue('highlight', v);
    }
  });
  themePanelColorHex?.addEventListener('change', (e) => {
    const raw = (e.target as HTMLInputElement).value;
    const v = normalizeHex(raw);
    if (v && themePanelColor) {
      themePanelColor.value = v;
      // apply immediate
      try { const root = document.documentElement; const body = document.body; root.style.setProperty('--panel', v); root.style.setProperty('--panel-border', v); if (body) { body.style.setProperty('--panel', v); body.style.setProperty('--panel-border', v); } } catch {}
      saveThemeValue('panel', v);
      saveThemeValue('panelBorder', v);
    }
  });
  
  themeHighlightColor?.addEventListener('input', (e) => {
    const v = (e.target as HTMLInputElement).value;
    if (themeHighlightColorHex) themeHighlightColorHex.value = v.toLowerCase();
    saveThemeValue('highlight', v);
  });

  themeSelectionLineStyle?.addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    saveThemeValue('selectionLineStyle', v);
  });
  themeSelectionEffect?.addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    saveThemeValue('selectionEffect', v);
  });
  themeSelectionPointStyleSameAsLine?.addEventListener('change', (e) => {
    const v = (e.target as HTMLInputElement).checked;
    saveThemeValue('selectionPointStyleSameAsLine', v);
  });
  
  // Rozmiary
  const sizeBtns = document.querySelectorAll<HTMLButtonElement>('.size-btn');
  
  function updateSize(btn: HTMLButtonElement) {
    const action = btn.dataset.action;
    const target = btn.dataset.target;
    if (!action || !target) return;
    
    const base = THEME_PRESETS[activeTheme];
    const overrides = themeOverrides[activeTheme];
    const current = { ...base, ...overrides };
    
    const delta = action === 'increase' ? 1 : -1;
    
    if (target === 'lineWidth') {
      const step = 0.1;
      const val = (current.lineWidth || base.lineWidth) + delta * step;
      const newValue = Math.max(0.1, Math.min(50, Math.round(val * 10) / 10));
      saveThemeValue('lineWidth', newValue);
      saveThemeValue('angleStrokeWidth', newValue);
      if (themeLineWidthValue) themeLineWidthValue.textContent = `${newValue} px`;
    } else if (target === 'pointSize') {
      const step = 0.1;
      const val = (current.pointSize || base.pointSize) + delta * step;
      const newValue = Math.max(0.1, Math.min(50, Math.round(val * 10) / 10));
      saveThemeValue('pointSize', newValue);
      if (themePointSizeValue) themePointSizeValue.textContent = `${newValue} px`;
    } else if (target === 'arcRadius') {
      const step = 1;
      const val = (current.angleDefaultRadius || base.angleDefaultRadius) + delta * step;
      const newValue = Math.max(1, Math.min(200, val));
      saveThemeValue('angleDefaultRadius', newValue);
      if (themeArcRadiusValue) themeArcRadiusValue.textContent = `${newValue} px`;
    } else if (target === 'fontSize') {
      const step = 1;
      const val = (current.fontSize || base.fontSize) + delta * step;
      const newValue = Math.max(4, Math.min(100, val));
      saveThemeValue('fontSize', newValue);
      if (themeFontSizeValue) themeFontSizeValue.textContent = `${newValue} px`;
    } else if (target === 'highlightWidth') {
      const step = 0.1;
      const val = (current.highlightWidth || base.highlightWidth) + delta * step;
      const newValue = Math.max(0.1, Math.min(20, Math.round(val * 10) / 10));
      saveThemeValue('highlightWidth', newValue);
      if (themeHighlightWidthValue) themeHighlightWidthValue.textContent = `${newValue} px`;
    } else if (target === 'selectionPointRadius') {
      const step = 1;
      const val = (current.selectionPointRadius || base.selectionPointRadius) + delta * step;
      const newValue = Math.max(1, Math.min(50, val));
      saveThemeValue('selectionPointRadius', newValue);
      if (themeSelectionPointRadiusValue) themeSelectionPointRadiusValue.textContent = `${newValue} px`;
    }
  }

  sizeBtns.forEach(btn => {
    let intervalId: any = null;
    let timeoutId: any = null;

    const stop = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      timeoutId = null;
      intervalId = null;
    };

    const start = (e: Event) => {
      // Only handle left click for mouse
      if (e instanceof MouseEvent && e.button !== 0) return;
      
      e.preventDefault(); // Prevent default click and focus behavior
      stop(); // Clear any existing timers
      
      updateSize(btn);
      
      timeoutId = setTimeout(() => {
        intervalId = setInterval(() => {
          updateSize(btn);
        }, 100);
      }, 500);
    };

    btn.addEventListener('mousedown', start);
    btn.addEventListener('touchstart', start, { passive: false });
    
    btn.addEventListener('mouseup', stop);
    btn.addEventListener('mouseleave', stop);
    btn.addEventListener('touchend', stop);
    btn.addEventListener('touchcancel', stop);
    
    // Handle keyboard interaction (Enter/Space)
    btn.addEventListener('click', (e) => {
      // Since we preventDefault on mousedown/touchstart, 
      // mouse clicks shouldn't fire this event in most browsers.
      // So this should mostly catch keyboard interactions.
      updateSize(btn);
    });
  });
  
  // Reset
  resetBtn?.addEventListener('click', () => {
    themeOverrides[activeTheme] = {};
    saveThemeOverrides();
    if (activeTheme === currentTheme) {
      applyThemeWithOverrides(currentTheme);
      draw();
    }
    loadThemeValues();
  });
  
  // Rysowanie podglądu
  function drawPreview() {
    if (!previewCanvas) return;
    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;
    
    const base = THEME_PRESETS[activeTheme];
    const overrides = themeOverrides[activeTheme];
    const theme = { ...base, ...overrides };
    
    const w = previewCanvas.width;
    const h = previewCanvas.height;
    
    // Tło
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, w, h);
    
    // Przykładowy trójkąt
    const points = [
      { x: w * 0.25, y: h * 0.7 },
      { x: w * 0.75, y: h * 0.7 },
      { x: w * 0.5, y: h * 0.3 }
    ];
    
    // Boki
    ctx.strokeStyle = theme.defaultStroke;
    ctx.lineWidth = theme.lineWidth;
    
    // Rysuj linie ciągłe (0-1 i 2-0)
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.moveTo(points[2].x, points[2].y);
    ctx.lineTo(points[0].x, points[0].y);
    ctx.stroke();

    // Rysuj linię przerywaną (1-2) - symulacja obiektu przerywanego
    ctx.save();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(points[1].x, points[1].y);
    ctx.lineTo(points[2].x, points[2].y);
    ctx.stroke();
    ctx.restore();
    
    // Podświetlony bok (1-2)
    const lineStyle = theme.selectionLineStyle || 'auto';
    const effect = theme.selectionEffect || 'color';
    
    ctx.save();
    
    // Determine line width and opacity based on effect
    if (effect === 'halo') {
      ctx.globalAlpha = 0.5;
      const extraWidth = (theme.highlightWidth || 1.5) * 4; 
      ctx.lineWidth = theme.lineWidth + extraWidth;
    } else {
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = theme.lineWidth + (theme.highlightWidth || 0);
    }

    ctx.strokeStyle = theme.highlight;

    // Apply line style
    if (lineStyle === 'dashed') {
      ctx.setLineDash([4, 4]);
    } else if (lineStyle === 'dotted') {
      const dotSize = ctx.lineWidth;
      ctx.setLineDash([0, dotSize * 2]);
      ctx.lineCap = 'round';
    } else {
      // 'auto' - preserve existing dash (which is [5, 5] for this segment)
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.moveTo(points[1].x, points[1].y);
    ctx.lineTo(points[2].x, points[2].y);
    ctx.stroke();
    
    if (lineStyle === 'dotted') {
      ctx.lineCap = 'butt';
    }
    
    ctx.restore();
    
    // Punkty
    const previewHollow = defaultPointFillMode === 'hollow';
    const previewRadius = theme.pointSize + 2;
    const drawPointMarker = (p: { x: number; y: number }) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, previewRadius, 0, Math.PI * 2);
      if (previewHollow) {
        ctx.strokeStyle = theme.defaultStroke;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(previewRadius - 3, 0), 0, Math.PI * 2);
        ctx.fillStyle = theme.bg;
        ctx.fill();
      } else {
        ctx.fillStyle = theme.defaultStroke;
        ctx.fill();
      }
    };
    points.forEach(drawPointMarker);
    
    // Zaznaczenie punktu B
    ctx.save();
    
    // Determine point selection style based on checkbox
    if (theme.selectionPointStyleSameAsLine) {
      // Use line settings
      if (effect === 'halo') {
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = (theme.highlightWidth || 1.5) * 4;
      } else {
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = theme.highlightWidth || 1.5;
      }
      
      if (lineStyle === 'dashed') {
        ctx.setLineDash([4, 4]);
      } else if (lineStyle === 'dotted') {
        const dotSize = ctx.lineWidth;
        ctx.setLineDash([0, dotSize * 2]);
        ctx.lineCap = 'round';
      } else {
        ctx.setLineDash([6, 3]);
      }
    } else {
      // Fixed default style for points
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
    }
    
    ctx.strokeStyle = theme.highlight;
    ctx.beginPath();
    ctx.arc(points[1].x, points[1].y, theme.selectionPointRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    if (theme.selectionPointStyleSameAsLine && lineStyle === 'dotted') {
      ctx.lineCap = 'butt';
    }
    ctx.restore();
    
    // Punkt centralny (zaznaczony)
    const centerPoint = {
      x: (points[0].x + points[1].x + points[2].x) / 3,
      y: (points[0].y + points[1].y + points[2].y) / 3
    };
    drawPointMarker(centerPoint);
    
    // Zaznaczenie punktu centralnego
    ctx.save();
    
    if (theme.selectionPointStyleSameAsLine) {
      // Use line settings
      if (effect === 'halo') {
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = (theme.highlightWidth || 1.5) * 4;
      } else {
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = theme.highlightWidth || 1.5;
      }
      
      if (lineStyle === 'dashed') {
        ctx.setLineDash([4, 4]);
      } else if (lineStyle === 'dotted') {
        const dotSize = ctx.lineWidth;
        ctx.setLineDash([0, dotSize * 2]);
        ctx.lineCap = 'round';
      } else {
        ctx.setLineDash([6, 3]);
      }
    } else {
      // Fixed default style for points
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
    }
    
    ctx.strokeStyle = theme.highlight;
    ctx.beginPath();
    ctx.arc(centerPoint.x, centerPoint.y, theme.selectionPointRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    if (theme.selectionPointStyleSameAsLine && lineStyle === 'dotted') {
      ctx.lineCap = 'butt';
    }
    ctx.restore();
    
    // Kąt przy wierzchołku C (górny)
    const angleCenter = points[2];
    const angle1 = Math.atan2(points[0].y - angleCenter.y, points[0].x - angleCenter.x);
    const angle2 = Math.atan2(points[1].y - angleCenter.y, points[1].x - angleCenter.x);
    ctx.strokeStyle = theme.defaultStroke;
    ctx.lineWidth = theme.lineWidth;
    ctx.beginPath();
    ctx.arc(angleCenter.x, angleCenter.y, theme.angleDefaultRadius, angle2, angle1);
    ctx.stroke();
    
    // Okrąg na zewnątrz trójkąta
    const circleCenter = { x: w * 0.75, y: h * 0.35 };
    const circleRadius = w * 0.12;
    ctx.strokeStyle = theme.defaultStroke;
    ctx.lineWidth = theme.lineWidth;
    ctx.beginPath();
    ctx.arc(circleCenter.x, circleCenter.y, circleRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Punkty na okręgu
    const circlePoint1 = { x: circleCenter.x + circleRadius * Math.cos(Math.PI * 0.25), y: circleCenter.y + circleRadius * Math.sin(Math.PI * 0.25) };
    const circlePoint2 = { x: circleCenter.x + circleRadius * Math.cos(Math.PI * 1.75), y: circleCenter.y + circleRadius * Math.sin(Math.PI * 1.75) };
    [circlePoint1, circlePoint2].forEach(drawPointMarker);
    
    // Etykiety
    ctx.fillStyle = theme.defaultStroke;
    ctx.font = `${theme.fontSize || 12}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', points[0].x, points[0].y + 20);
    ctx.fillText('B', points[1].x, points[1].y + 20);
    ctx.fillText('C', points[2].x, points[2].y - 20);
  }
  appearancePreviewCallback = () => drawPreview();

  // Inicjalizacja
  loadThemeValues();
}

function initLabelKeypad() {
  const container = document.getElementById('labelGreekRow');
  if (!container) return;

  // Greek letters (and extra slots for Script mode if needed)
  const count = Math.max(GREEK_LOWER.length, SCRIPT_LOWER.length);
  for (let i = 0; i < count; i++) {
    const lower = GREEK_LOWER[i];
    const upper = lower ? lower.toUpperCase() : ''; // GREEK_UPPER[i] || (lower ? lower.toUpperCase() : '');
    
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tool icon-btn label-greek-btn';
    
    if (lower) {
      btn.title = lower;
      btn.dataset.letter = lower;
      btn.dataset.letterLower = lower;
      btn.dataset.letterUpper = upper;
      btn.textContent = lower;
    } else {
      // Extra button for script mode, hidden by default in Greek mode
      btn.title = '';
      btn.dataset.letter = '';
      btn.dataset.letterLower = '';
      btn.dataset.letterUpper = '';
      btn.textContent = '';
      btn.style.display = 'none';
    }
    
    container.appendChild(btn);
  }
  
  // Symbols
  for (const sym of LABEL_SYMBOLS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tool icon-btn label-greek-btn label-symbol-btn';
    btn.title = sym;
    btn.dataset.letter = sym;
    btn.dataset.letterLower = sym;
    btn.dataset.letterUpper = sym;
    btn.textContent = sym;
    
    container.appendChild(btn);
  }
}


// Show import feedback icon next to button
function showImportFeedback(success: boolean) {
  const btn = document.getElementById('importConfigBtn');
  if (!btn) return;
  
  // Remove existing feedback
  const existing = btn.querySelector('.import-feedback');
  if (existing) existing.remove();
  
  // Create feedback icon
  const feedback = document.createElement('span');
  feedback.className = 'import-feedback';
  feedback.style.cssText = 'margin-left: 8px; font-size: 16px; display: inline-block; animation: fadeIn 0.3s ease;';
  feedback.textContent = success ? '✓' : '✗';
  feedback.style.color = success ? '#4ade80' : '#f87171';
  
  btn.appendChild(feedback);
  
  // Remove after delay
  setTimeout(() => {
    feedback.style.transition = 'opacity 0.3s ease';
    feedback.style.opacity = '0';
    setTimeout(() => feedback.remove(), 300);
  }, 2000);
}

// Reinitialize tool button references and event listeners after toolbar rebuild
function reinitToolButtons() {
  // Get fresh references to tool buttons
  modeTangentBtn = document.getElementById('modeTangent') as HTMLButtonElement | null;
  modePerpBisectorBtn = document.getElementById('modePerpBisector') as HTMLButtonElement | null;
  modeAddBtn = document.getElementById('modeAdd') as HTMLButtonElement | null;
  modeSegmentBtn = document.getElementById('modeSegment') as HTMLButtonElement | null;
  modeParallelBtn = document.getElementById('modeParallel') as HTMLButtonElement | null;
  modePerpBtn = document.getElementById('modePerpendicular') as HTMLButtonElement | null;
  modeCircleThreeBtn = document.getElementById('modeCircleThree') as HTMLButtonElement | null;
  modeTriangleBtn = document.getElementById('modeTriangleUp') as HTMLButtonElement | null;
  modeSquareBtn = document.getElementById('modeSquare') as HTMLButtonElement | null;
  modePolygonBtn = document.getElementById('modePolygon') as HTMLButtonElement | null;
  modeHandwritingBtn = document.getElementById('modeHandwriting') as HTMLButtonElement | null;
  modeAngleBtn = document.getElementById('modeAngle') as HTMLButtonElement | null;
  modeBisectorBtn = document.getElementById('modeBisector') as HTMLButtonElement | null;
  modeMidpointBtn = document.getElementById('modeMidpoint') as HTMLButtonElement | null;
  modeSymmetricBtn = document.getElementById('modeSymmetric') as HTMLButtonElement | null;
  modeParallelLineBtn = document.getElementById('modeParallelLine') as HTMLButtonElement | null;
  modeNgonBtn = document.getElementById('modeNgon') as HTMLButtonElement | null;
  modeLabelBtn = document.getElementById('modeLabel') as HTMLButtonElement | null;
  modeMoveBtn = document.getElementById('modeMove') as HTMLButtonElement | null;
  modeMultiselectBtn = document.getElementById('modeMultiselect') as HTMLButtonElement | null;
  
  // Attach event listeners to tool buttons
  modeAddBtn?.addEventListener('click', () => handleToolClick('add'));
  modeAddBtn?.addEventListener('dblclick', (e) => { e.preventDefault(); handleToolSticky('add'); });
  setupDoubleTapSticky(modeAddBtn, 'add');
  modeIntersectionBtn?.addEventListener('click', () => handleToolClick('intersection'));
  modeIntersectionBtn?.addEventListener('dblclick', (e) => { e.preventDefault(); handleToolSticky('intersection'); });
  setupDoubleTapSticky(modeIntersectionBtn, 'intersection');
  
  modeSegmentBtn?.addEventListener('click', () => handleToolClick('segment'));
  modeSegmentBtn?.addEventListener('dblclick', (e) => { e.preventDefault(); handleToolSticky('segment'); });
  setupDoubleTapSticky(modeSegmentBtn, 'segment');
  
  modeParallelBtn?.addEventListener('click', () => handleToolClick('parallel'));
  modePerpBtn?.addEventListener('click', () => handleToolClick('perpendicular'));
  modeCircleThreeBtn?.addEventListener('click', () => handleToolClick('circleThree'));
  modeTriangleBtn?.addEventListener('click', () => handleToolClick('triangleUp'));
  modeSquareBtn?.addEventListener('click', () => handleToolClick('square'));
  modePolygonBtn?.addEventListener('click', () => handleToolClick('polygon'));
  modeHandwritingBtn?.addEventListener('click', () => handleToolClick('handwriting'));
  modeAngleBtn?.addEventListener('click', () => handleToolClick('angle'));
  modeBisectorBtn?.addEventListener('click', () => handleToolClick('bisector'));
  modeMidpointBtn?.addEventListener('click', () => handleToolClick('midpoint'));
  modeSymmetricBtn?.addEventListener('click', () => handleToolClick('symmetric'));
  modeParallelLineBtn?.addEventListener('click', () => handleToolClick('parallelLine'));
  
  modeTangentBtn?.addEventListener('click', () => handleToolClick('tangent'));
  
  modePerpBisectorBtn?.addEventListener('click', () => handleToolClick('perpBisector'));
  
  modeNgonBtn?.addEventListener('click', () => handleToolClick('ngon'));
  
  modeLabelBtn?.addEventListener('click', () => {
    setMode('label');
    updateToolButtons();
  });
  
  modeMoveBtn?.addEventListener('click', () => {
    if (mode === 'move') {
      isPanning = false;
    } else {
      setMode('move');
      clearSelectionState();
      updateToolButtons();
      updateSelectionButtons();
      draw();
    }
  });
  
  modeMultiselectBtn?.addEventListener('click', () => handleToolClick('multiselect'));
}

function attachHoldHandler(btn: HTMLElement, action: () => void) {
  let intervalId: any = null;
  let timeoutId: any = null;

  const stop = () => {
    if (timeoutId) clearTimeout(timeoutId);
    if (intervalId) clearInterval(intervalId);
    timeoutId = null;
    intervalId = null;
  };

  const start = (e: Event) => {
    if (e instanceof MouseEvent && e.button !== 0) return;
    e.preventDefault();
    stop();
    action();
    timeoutId = setTimeout(() => {
      intervalId = setInterval(() => {
        action();
      }, 100);
    }, 500);
  };

  btn.addEventListener('mousedown', start);
  btn.addEventListener('touchstart', start, { passive: false });
  
  btn.addEventListener('mouseup', stop);
  btn.addEventListener('mouseleave', stop);
  btn.addEventListener('touchend', stop);
  btn.addEventListener('touchcancel', stop);
  
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) { // Keyboard click
        action();
    }
  });
}

function initRuntime() {
  canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
  ctx = canvas?.getContext('2d') ?? null;
  modeAddBtn = document.getElementById('modeAdd') as HTMLButtonElement | null;
  modeLabelBtn = document.getElementById('modeLabel') as HTMLButtonElement | null;
  modeMoveBtn = document.getElementById('modeMove') as HTMLButtonElement | null;
  modeMultiselectBtn = document.getElementById('modeMultiselect') as HTMLButtonElement | null;
  modeSegmentBtn = document.getElementById('modeSegment') as HTMLButtonElement | null;
  modeParallelBtn = document.getElementById('modeParallel') as HTMLButtonElement | null;
  modePerpBtn = document.getElementById('modePerpendicular') as HTMLButtonElement | null;
  modeCircleThreeBtn = document.getElementById('modeCircleThree') as HTMLButtonElement | null;
  modeTriangleBtn = document.getElementById('modeTriangleUp') as HTMLButtonElement | null;
  modeSquareBtn = document.getElementById('modeSquare') as HTMLButtonElement | null;
  modePolygonBtn = document.getElementById('modePolygon') as HTMLButtonElement | null;
  modeHandwritingBtn = document.getElementById('modeHandwriting') as HTMLButtonElement | null;
  modeAngleBtn = document.getElementById('modeAngle') as HTMLButtonElement | null;
  modeBisectorBtn = document.getElementById('modeBisector') as HTMLButtonElement | null;
  modeMidpointBtn = document.getElementById('modeMidpoint') as HTMLButtonElement | null;
  modeSymmetricBtn = document.getElementById('modeSymmetric') as HTMLButtonElement | null;
  modeParallelLineBtn = document.getElementById('modeParallelLine') as HTMLButtonElement | null;
  modeTangentBtn = document.getElementById('modeTangent') as HTMLButtonElement | null;
  modePerpBisectorBtn = document.getElementById('modePerpBisector') as HTMLButtonElement | null;
  modeNgonBtn = document.getElementById('modeNgon') as HTMLButtonElement | null;
  modeIntersectionBtn = document.getElementById('modeIntersection') as HTMLButtonElement | null;
  const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement | null;
  const helpBtn = document.getElementById('helpBtn') as HTMLButtonElement | null;
  const settingsModal = document.getElementById('settingsModal') as HTMLElement | null;
  const settingsCloseBtn = document.getElementById('settingsCloseBtn') as HTMLButtonElement | null;
  // Debug panel elements and wiring handled by `src/debugPanel.ts`
  viewModeToggleBtn = document.getElementById('viewModeToggle') as HTMLButtonElement | null;
  rayModeToggleBtn = document.getElementById('rayModeToggle') as HTMLButtonElement | null;
  raySegmentBtn = document.getElementById('raySegmentOption') as HTMLButtonElement | null;
  rayRightBtn = document.getElementById('rayRightOption') as HTMLButtonElement | null;
  rayLeftBtn = document.getElementById('rayLeftOption') as HTMLButtonElement | null;
  styleEdgesRow = document.getElementById('styleEdgesRow');
  viewModeMenuContainer = document.getElementById('viewModeMenuContainer') as HTMLElement | null;
  rayModeMenuContainer = document.getElementById('rayModeMenuContainer') as HTMLElement | null;
  hideBtn = document.getElementById('hideButton') as HTMLButtonElement | null;
  deleteBtn = document.getElementById('deletePoint') as HTMLButtonElement | null;
  // pasteBtn removed from DOM; copy/paste UI uses `multiCloneBtn`
  // Ensure delegated toolbar clicks are handled (buttons may be rebuilt later)
  const toolbarMainRow = document.getElementById('toolbarMainRow');
  if (toolbarMainRow) {
    toolbarMainRow.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest('button') as HTMLButtonElement | null;
      if (!btn) return;
      if (btn.id === 'modeIntersection') {
        handleToolClick('intersection');
      }
    });
  }

  // Global delegated handler as a fallback so clicks are caught even if
  // toolbar buttons are rebuilt or replaced dynamically.
  document.addEventListener('click', (ev: MouseEvent) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const btn = target.closest('button.tool, button[data-tool-id], button[id^="mode"]') as HTMLButtonElement | null;
    if (!btn) return;
    // Avoid intercepting config pane drag/drop clicks in palette
    if (btn.closest && btn.closest('#paletteGrid')) return;
    const toolId = btn.id || (btn.dataset && btn.dataset.toolId) || null;
    if (!toolId) return;
    const tb = TOOL_BUTTONS.find(t => t.id === toolId || t.id === (btn.dataset.toolId ?? ''));
    if (!tb) return;
    try { console.debug('[toolbar-global] clicked', tb.id, tb.mode); } catch {}
    try { handleToolClick(tb.mode as Mode); } catch {}
  }, true);
  copyStyleBtn = document.getElementById('copyStyleBtn') as HTMLButtonElement | null;
  multiMoveBtn = document.getElementById('multiMoveBtn') as HTMLButtonElement | null;
  multiCloneBtn = document.getElementById('multiCloneBtn') as HTMLButtonElement | null;
  zoomMenuBtn = document.getElementById('zoomMenu') as HTMLButtonElement | null;
  zoomMenuContainer = zoomMenuBtn?.parentElement ?? null;
  zoomMenuDropdown = zoomMenuContainer?.querySelector('.dropdown-menu') as HTMLElement | null;
  showHiddenBtn = document.getElementById('showHiddenBtn') as HTMLButtonElement | null;
  showMeasurementsBtn = document.getElementById('showMeasurementsBtn') as HTMLButtonElement | null;
  const showHintsToggle = document.getElementById('showHintsToggle') as HTMLInputElement | null;
  const hintBar = document.getElementById('hintBar') as HTMLElement | null;
  copyImageBtn = document.getElementById('copyImageBtn') as HTMLButtonElement | null;
  saveImageBtn = document.getElementById('saveImageBtn') as HTMLButtonElement | null;
  exportJsonBtn = document.getElementById('exportJsonBtn') as HTMLButtonElement | null;
  cloudFilesBtn = document.getElementById('cloudFilesBtn') as HTMLButtonElement | null;
  bundlePrevBtn = document.getElementById('bundlePrevBtn') as HTMLButtonElement | null;
  bundleNextBtn = document.getElementById('bundleNextBtn') as HTMLButtonElement | null;
  const invertColorsBtn = document.getElementById('invertColorsBtn') as HTMLButtonElement | null;

  // Initialize configuration pane (moved to external module)
  try {
    const configDeps = {
      getMode: () => mode,
      setMode: setMode,
      draw: draw,
      copyStyleFromSelection: copyStyleFromSelection,
      isCopyStyleActive: () => copyStyleActive,
      activateCopyStyle: (s: any) => { copiedStyle = s; copyStyleActive = true; },
      deactivateCopyStyle: () => { copiedStyle = null; copyStyleActive = false; },
      updateSelectionButtons: updateSelectionButtons,
      updateToolButtons: updateToolButtons,
      getMeasurementPrecisionLength: () => measurementPrecisionLength,
      setMeasurementPrecisionLength: (v: number) => { measurementPrecisionLength = v; try { localStorage.setItem('measurementPrecisionLength', String(v)); } catch {} },
      getMeasurementPrecisionAngle: () => measurementPrecisionAngle,
      setMeasurementPrecisionAngle: (v: number) => { measurementPrecisionAngle = v; try { localStorage.setItem('measurementPrecisionAngle', String(v)); } catch {} },
      POINT_STYLE_MODE_KEY,
      saveThemeOverrides: saveThemeOverrides,
      applyThemeWithOverrides: applyThemeWithOverrides,
      getCurrentTheme: () => currentTheme,
      getThemeOverrides: () => themeOverrides,
      initCloudSaveUI: initCloudSaveUI,
      handleToolClick: handleToolClick,
      handleToolSticky: handleToolSticky,
      setupDoubleTapSticky: setupDoubleTapSticky
    } as any;
    // expose tool metadata to the config pane (used by the extracted module)
    (window as any).TOOL_BUTTONS = TOOL_BUTTONS;
    const configPane = setupConfigPane(configDeps);
    // Load persisted config and initialize UI
    configPane.loadButtonOrder();
    configPane.loadButtonConfiguration();
    configPane.initializeButtonConfig();
    configPane.initAppearanceTab();
    configPane.updatePointStyleConfigButtons();
    // expose for debugging if needed
    (window as any).configPane = configPane;
  } catch (err) {
    console.error('Config pane init failed', err);
  }
  pointStyleToggleBtn = document.getElementById('pointStyleToggleBtn') as HTMLButtonElement | null;
  pointLabelsAutoBtn = document.getElementById('pointLabelsAutoBtn') as HTMLButtonElement | null;
  pointLabelsAwayBtn = document.getElementById('pointLabelsAwayBtn') as HTMLButtonElement | null;
  pointLabelsCloserBtn = document.getElementById('pointLabelsCloserBtn') as HTMLButtonElement | null;
  topbarLeft = document.querySelector('.topbar-left') as HTMLElement | null;
  labelToolsGroup = document.querySelector('.label-tools-group') as HTMLElement | null;
  labelToolsOverflowContainer = document.getElementById('labelToolsOverflowContainer');
  labelToolsOverflowBtn = document.getElementById('labelToolsOverflowBtn') as HTMLButtonElement | null;
  labelToolsOverflowMenu = document.getElementById('labelToolsOverflowMenu');
  labelToolsOverflowRow = document.getElementById('labelToolsOverflowRow');
  clearAllBtn = document.getElementById('clearAll') as HTMLButtonElement | null;
  themeDarkBtn = document.getElementById('themeDark') as HTMLButtonElement | null;
  undoBtn = document.getElementById('undo') as HTMLButtonElement | null;
  redoBtn = document.getElementById('redo') as HTMLButtonElement | null;
  styleMenuContainer = document.getElementById('styleMenuContainer') as HTMLElement | null;
  styleMenuBtn = document.getElementById('styleMenu') as HTMLButtonElement | null;
  styleMenuDropdown = styleMenuContainer?.querySelector('.dropdown-menu') as HTMLElement | null;
  eraserBtn = document.getElementById('eraserBtn') as HTMLButtonElement | null;
  if (eraserBtn) {
    eraserBtn.addEventListener('click', () => {
      eraserActive = !eraserActive;
      eraserBtn?.classList.toggle('active', eraserActive);
      eraserBtn?.setAttribute('aria-pressed', eraserActive ? 'true' : 'false');
      if (eraserActive) {
        if (styleMenuContainer) styleMenuContainer.style.display = 'inline-flex';
      }
    });
  }
  highlighterBtn = document.getElementById('highlighterBtn') as HTMLButtonElement | null;
  if (highlighterBtn) {
    const _hb = highlighterBtn;
    _hb.addEventListener('click', (e) => {
      // Toggle behavior: activate or deactivate. Scope UI/width changes to handwriting context only.
      const editingInk = selectedInkStrokeIndex !== null || mode === 'handwriting';
      if (!highlighterActive) {
        // activate: remember previous width/step and ink base width only when editing handwriting
        if (editingInk && styleWidthInput) {
          prevStyleWidthValue = styleWidthInput.value;
          prevStyleWidthStep = styleWidthInput.step;
          styleWidthInput.value = '20';
          styleWidthInput.step = '5';
        }
        prevInkBaseWidth = inkBaseWidth;
        // cycle alpha preset each activation
        highlighterAlphaIdx = (highlighterAlphaIdx + 1) % HIGHLIGHTER_ALPHA_PRESETS.length;
        highlighterAlpha = HIGHLIGHTER_ALPHA_PRESETS[highlighterAlphaIdx];
        highlighterActive = true;
        _hb.classList.add('active');
        _hb.setAttribute('aria-pressed', 'true');
        if (editingInk && styleMenuContainer) styleMenuContainer.style.display = 'inline-flex';
        _hb.title = `Podświetlacz (${Math.round(highlighterAlpha * 100)}%)`;
        if (highlighterAlphaInput) highlighterAlphaInput.value = String(highlighterAlpha);
        if (highlighterAlphaValueDisplay) highlighterAlphaValueDisplay.textContent = `${Math.round(highlighterAlpha * 100)}%`;
        // ensure current inputs are applied so inkBaseWidth is updated
        applyStyleFromInputs();
        updateStyleMenuValues();
      } else {
        // deactivate: restore previous values (only restore width/step when editingInk at activation time)
        highlighterActive = false;
        _hb.classList.remove('active');
        _hb.setAttribute('aria-pressed', 'false');
        _hb.title = 'Podświetlacz';
        if (editingInk && styleWidthInput) {
          if (prevStyleWidthValue !== null) styleWidthInput.value = prevStyleWidthValue;
          if (prevStyleWidthStep !== null) styleWidthInput.step = prevStyleWidthStep;
        }
        if (prevInkBaseWidth !== null) inkBaseWidth = prevInkBaseWidth;
        // ensure the style changes are applied to future strokes
        applyStyleFromInputs();
        updateStyleMenuValues();
        // clear remembered previous values
        prevStyleWidthValue = null;
        prevStyleWidthStep = null;
        prevInkBaseWidth = null;
      }
    });
  }
  if (showHintsToggle) {
    try {
      showHintsToggle.checked = !!showHints;
    } catch {}
    showHintsToggle.addEventListener('change', () => {
      showHints = !!showHintsToggle.checked;
      try {
        window.localStorage?.setItem(SHOW_HINTS_STORAGE_KEY, showHints ? 'true' : 'false');
      } catch {}
    });
  }
  // Hint bar helpers
  function setHint(text: string | null) {
    if (!hintBar) return;
    if (!showHints || !text) {
      hintBar.textContent = '';
      hintBar.style.display = 'none';
      return;
    }
    hintBar.style.display = 'block';
    hintBar.textContent = text;
  }
  function clearHint() { setHint(null); }

  // Keep hint bar above the bottom toolbar even when it wraps on small screens.
  // We expose the toolbar height via CSS variable `--toolbar-bottom-height`.
  function updateToolbarBottomHeightVar() {
    try {
      const toolbar = document.querySelector('.toolbar-bottom') as HTMLElement | null;
      const defaultHeight = 64;
      if (!toolbar) {
        document.documentElement.style.setProperty('--toolbar-bottom-height', `${defaultHeight}px`);
        return;
      }
      const rect = toolbar.getBoundingClientRect();
      // Find the topmost tool-row inside toolbar (handles multiple wrapped rows)
      // Use the toolbar container's top as the topmost edge of the bottom toolbar.
      // This ensures the hint bar sits above the entire bottom toolbar regardless of wrapped rows.
      const toolbarRect = toolbar.getBoundingClientRect();
      const topMost = toolbarRect.top;
      // calculate bottom offset so hint sits above the bottom toolbar block
      // use toolbarRect.bottom to measure distance from viewport bottom
      const gap = 12;
      const extraHintOffset = 100; // move hints further up by 100px
      let bottomOffset = Math.ceil(window.innerHeight - toolbarRect.bottom + gap + extraHintOffset);
      // Clamp to sensible range to avoid placing hint offscreen
      const minOffset = 48;
      const maxOffset = Math.max(48, Math.floor(window.innerHeight - 40));
      bottomOffset = Math.max(minOffset, Math.min(bottomOffset, maxOffset));
      document.documentElement.style.setProperty('--toolbar-bottom-height', `${bottomOffset}px`);
    } catch (e) {
      // ignore
    }
  }
  // initial update and listeners
  updateToolbarBottomHeightVar();
  window.addEventListener('resize', () => updateToolbarBottomHeightVar());
  // observe toolbar size/content changes
  const tb = document.querySelector('.toolbar-bottom');
  if (tb) {
    const mo = new MutationObserver(() => updateToolbarBottomHeightVar());
    mo.observe(tb, { attributes: true, childList: true, subtree: true });
  }

  // Map button IDs -> hint keys (tools)
  const TOOL_HINT_MAP: Record<string, string> = {
    modeMove: 'select',
    modeMultiselect: 'multiselect',
    modeLabel: 'label',
    modeAdd: 'point',
    modeSegment: 'segment',
    modeParallel: 'parallel',
    modePerpendicular: 'perpendicular',
    modeCircle: 'circle',
    modeCircleThree: 'circle3',
    modeTriangleUp: 'triangle',
    modeSquare: 'square',
    modePolygon: 'polygon',
    modeNgon: 'ngon',
    modeAngle: 'angle',
    modeBisector: 'bisector',
    modeMidpoint: 'midpoint',
    modeSymmetric: 'symmetric',
    modeTangent: 'tangent',
    modePerpBisector: 'perpBisector',
    modeIntersection: 'intersection',
    modeHandwriting: 'handwriting'
  };

  // Map option/menu button IDs -> menu hint keys
  const MENU_HINT_MAP: Record<string, string> = {
    clearAll: 'clearAll',
    showHiddenBtn: 'showHidden',
    showMeasurementsBtn: 'showMeasurements',
    copyImageBtn: 'copyImage',
    saveImageBtn: 'saveImage',
    invertColorsBtn: 'invertColors',
    debugToggle: 'debug',
    settingsBtn: 'settings',
    helpBtn: 'help',
    styleMenu: 'style'
    ,
    themeDark: 'themeToggle',
    eraserBtn: 'eraser',
    hideButton: 'hideSelected',
    copyStyleBtn: 'copyStyle',
    multiMoveBtn: 'multiMove',
    multiCloneBtn: 'multiClone',
    cloudFilesBtn: 'cloudFiles',
    exportJsonBtn: 'exportJson',
    bundlePrevBtn: 'bundlePrev',
    bundleNextBtn: 'bundleNext',
    pointLabelsAutoBtn: 'pointLabelsAuto',
    pointLabelsAwayBtn: 'pointLabelsAway',
    pointLabelsCloserBtn: 'pointLabelsCloser'
  };

  // Attach hover listeners for tool hints
  Object.keys(TOOL_HINT_MAP).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const key = TOOL_HINT_MAP[id];
    el.addEventListener('mouseenter', () => setHint(HINTS.tools[key] ?? ''));
    el.addEventListener('mouseleave', () => clearHint());
    el.addEventListener('click', () => setHint(HINTS.tools[key] ?? ''));
  });

  Object.keys(MENU_HINT_MAP).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const key = MENU_HINT_MAP[id];
    el.addEventListener('mouseenter', () => setHint(HINTS.menu[key] ?? ''));
    el.addEventListener('mouseleave', () => clearHint());
    el.addEventListener('click', () => setHint(HINTS.menu[key] ?? ''));
  });
  // Load previously copied objects from storage so paste persists across file loads
  try {
    loadCopiedObjectsFromStorage();
  } catch {}
  styleColorRow = document.getElementById('styleColorRow');
  styleWidthRow = document.getElementById('styleWidthRow');
  styleHighlighterAlphaRow = document.getElementById('styleHighlighterAlphaRow');
  styleTypeRow = document.getElementById('styleTypeRow');
  styleTypeInline = document.getElementById('styleTypeInline');
  styleRayGroup = document.getElementById('styleRayGroup');
  styleTickGroup = document.getElementById('styleTickGroup');
  styleTickButton = document.getElementById('styleTickToggle') as HTMLButtonElement | null;
  styleTypeGap = document.getElementById('styleTypeGap');
  styleArcRow = document.getElementById('styleArcRow');
  styleHideRow = document.getElementById('styleHideRow');
  labelTextRow = document.getElementById('labelTextRow');
  labelFontRow = document.getElementById('labelFontRow');
  labelGreekRow = document.getElementById('labelGreekRow');
  labelGreekToggleBtn = document.getElementById('labelGreekToggle') as HTMLButtonElement | null;
  labelGreekShiftBtn = document.getElementById('labelGreekShift') as HTMLButtonElement | null;
  labelScriptBtn = document.getElementById('labelScriptToggle') as HTMLButtonElement | null;
  styleColorInput = document.getElementById('styleColor') as HTMLInputElement | null;
  styleWidthInput = document.getElementById('styleWidth') as HTMLInputElement | null;
  highlighterAlphaInput = document.getElementById('highlighterAlpha') as HTMLInputElement | null;
  highlighterAlphaValueDisplay = document.getElementById('highlighterAlphaValue') as HTMLElement | null;

  // Prominent language selector wiring (header). The old selector was removed.
  const languageSelectProminent = document.getElementById('languageSelectProminent') as HTMLSelectElement | null;
  if (languageSelectProminent) {
    const cur2 = getLanguage();
    languageSelectProminent.value = cur2;
    languageSelectProminent.addEventListener('change', () => {
      const v = (languageSelectProminent.value as 'pl' | 'en');
      setLanguage(v);
      applyUILanguage(v);
      clearHint();
    });
    applyUILanguage(cur2);
  }
  lineWidthDecreaseBtn = document.getElementById('lineWidthDecrease') as HTMLButtonElement | null;
  lineWidthIncreaseBtn = document.getElementById('lineWidthIncrease') as HTMLButtonElement | null;
  lineWidthValueDisplay = document.getElementById('lineWidthValue');
  styleTypeSelect = document.getElementById('styleType') as HTMLSelectElement | null;
  labelTextInput = document.getElementById('labelText') as HTMLTextAreaElement | null;
  labelFontDecreaseBtn = document.getElementById('labelFontDecrease') as HTMLButtonElement | null;
  labelFontIncreaseBtn = document.getElementById('labelFontIncrease') as HTMLButtonElement | null;
  labelFontSizeDisplay = document.getElementById('labelFontSizeValue');
  labelAlignToggleBtn = document.getElementById('labelAlignToggle') as HTMLButtonElement | null;
  arcCountButtons = Array.from(document.querySelectorAll('.arc-count-btn')) as HTMLButtonElement[];
  rightAngleBtn = document.getElementById('rightAngleBtn') as HTMLButtonElement | null;
  exteriorAngleBtn = document.getElementById('exteriorAngleBtn') as HTMLButtonElement | null;
  fillToggleBtn = document.getElementById('fillToggleBtn') as HTMLButtonElement | null;
  pointHollowToggleBtn = document.getElementById('pointHollowToggleBtn') as HTMLButtonElement | null;
  angleRadiusDecreaseBtn = document.getElementById('angleRadiusDecreaseBtn') as HTMLButtonElement | null;
  angleRadiusIncreaseBtn = document.getElementById('angleRadiusIncreaseBtn') as HTMLButtonElement | null;
  colorSwatchButtons = Array.from(document.querySelectorAll('.color-btn:not(.custom-color-btn)')) as HTMLButtonElement[];
  customColorBtn = document.getElementById('customColorBtn') as HTMLButtonElement | null;
  styleTypeButtons = Array.from(document.querySelectorAll('.type-btn')) as HTMLButtonElement[];
  labelGreekButtons = Array.from(document.querySelectorAll('.label-greek-btn')) as HTMLButtonElement[];
  pointStyleToggleBtn?.addEventListener('click', () => {
    const nextMode: PointFillMode = defaultPointFillMode === 'hollow' ? 'filled' : 'hollow';
    setDefaultPointFillMode(nextMode);
    appearancePreviewCallback?.();
  });
  pointLabelsAutoBtn?.addEventListener('click', () => {
    alignPointLabelOffsets();
  });
  pointLabelsAwayBtn?.addEventListener('click', () => {
    adjustPointLabelOffsets(1.2);
  });
  pointLabelsCloserBtn?.addEventListener('click', () => {
    adjustPointLabelOffsets(0.85);
  });
  updatePointStyleConfigButtons();
  updatePointLabelToolButtons();

  ngonModal = document.getElementById('ngonModal');
  ngonCloseBtn = document.getElementById('ngonCloseBtn') as HTMLButtonElement | null;
  ngonConfirmBtn = document.getElementById('ngonConfirmBtn') as HTMLButtonElement | null;
  ngonInput = document.getElementById('ngonInput') as HTMLInputElement | null;
  ngonPresetButtons = Array.from(document.querySelectorAll('.ngon-preset-btn')) as HTMLButtonElement[];

  ngonCloseBtn?.addEventListener('click', () => {
    if (ngonModal) ngonModal.style.display = 'none';
    // Cancel creation - remove the base points if they were just created?
    // For now, just close. User can Undo.
    if (squareStartIndex !== null) {
       // If we want to be nice, we could remove the points, but Undo is safer.
       // Reset state
       squareStartIndex = null;
       selectedPointIndex = null;
       draw();
    }
  });

  const confirmNgon = () => {
    if (ngonInput) {
      const n = parseInt(ngonInput.value, 10);
      if (Number.isFinite(n) && n >= 3) {
        ngonSides = n;
        createNgonFromBase();
        if (ngonModal) ngonModal.style.display = 'none';
      }
    }
  };

  ngonConfirmBtn?.addEventListener('click', confirmNgon);
  ngonInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmNgon();
  });

  ngonPresetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const n = parseInt(btn.dataset.n || '5', 10);
      ngonSides = n;
      if (ngonInput) ngonInput.value = String(n);
      createNgonFromBase();
      if (ngonModal) ngonModal.style.display = 'none';
    });
  });

  initLabelKeypad();
  // Re-fetch buttons after dynamic generation
  labelGreekButtons = Array.from(document.querySelectorAll('.label-greek-btn')) as HTMLButtonElement[];
  strokeColorInput = styleColorInput;
  if (strokeColorInput) {
    strokeColorInput.value = THEME.defaultStroke;
  }
  
  // Initialize cloud panel
    initCloudPanel();

    // Initialize debug panel module (DOM wiring and rendering)
  initDebugPanel({
    getModel: () => model,
    getRuntime: () => runtime,
    friendlyLabelForId,
    isParallelLine,
    isPerpendicularLine,
    isCircleThroughPoints,
    circleRadius,
    lineExtent,
    polygonCentroid,
    clamp,
    DEBUG_PANEL_MARGIN,
    DEBUG_PANEL_TOP_MIN,
    draw,
    getShowHidden: () => showHidden
  });

  if (!canvas || !ctx) return;

  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('resize', () => {
    if (document.getElementById('debugPanel')?.getAttribute('data-visible') === 'true') ensureDebugPanelPosition();
    requestAnimationFrame(() => updatePointLabelToolButtons());
  });
  resizeCanvas();
  // ensure history baseline so undo/redo works after first action
  if (historyIndex < 0) {
    pushHistory();
  }
  const canvasHandlers = makeCanvasHandlers({
    canvas,
    canvasToWorld,
    getMode: () => mode,
    findLabelAt,
    selectLabel,
    openStyleMenu,
    labelTextInput
  });

  const canvasEvents = initCanvasEvents(canvas, {
    pointerdown: handleCanvasClick,
    dblclick: canvasHandlers.dblclick,
    pointermove: (ev: PointerEvent) => {
      if (handleCanvasPointerMove(ev, {
        updateTouchPointFromEvent,
        activeTouchesSize: () => activeTouches.size,
        startPinchFromTouches,
        pinchState,
        continuePinchGesture,
        getMode: () => mode,
        eraserActive: () => eraserActive,
        eraseInkStrokeAtPoint,
        appendInkStrokePoint,
        multiselectBoxStart: () => multiselectBoxStart,
        multiselectBoxEndSet: (p: any) => { multiselectBoxEnd = p; },
        canvasToWorld,
        draw,
        toPoint,
        getResizingMulti: () => resizingMulti,
        getRotatingMulti: () => rotatingMulti,
        getPoint: (idx: number) => model.points[idx],
        setPoint: (idx: number, p: any) => { model.points[idx] = p; },
        constrainToCircles,
        updateMidpointsForPoint,
        updateCirclesForPoint,
        findLinesContainingPoint,
        updateIntersectionsForLine,
        markMovedDuringDrag: () => { movedDuringDrag = true; },
        getResizingCircle: () => resizingCircle,
        getCircle: (idx: number) => model.circles[idx],
        updateIntersectionsForCircle,
        getResizingLine: () => resizingLine,
        getRotatingLine: () => rotatingLine,
        enforceIntersections,
        lineExtent,
        setActiveAxisSnaps: (m: Map<number, { axis: 'horizontal' | 'vertical'; strength: number }>) => { activeAxisSnaps.clear(); m.forEach((v, k) => activeAxisSnaps.set(k, v)); },
        setActiveAxisSnap: (v: { lineIdx: number; axis: 'horizontal' | 'vertical'; strength: number } | null) => { activeAxisSnap = v; },
        axisSnapWeight,
        LINE_SNAP_SIN_ANGLE,
        LINE_SNAP_INDICATOR_THRESHOLD
      })) return;
    }
  });
  // Wire pointer release handler into canvas events using handlers from canvas/handlers
  canvasEvents.setPointerRelease((ev: PointerEvent) => {
    handlersHandlePointerRelease(ev, {
      removeTouchPoint,
      activeTouchesSize: () => activeTouches.size,
      pinchState,
      startPinchFromTouches,
      canvasReleasePointerCapture: (id: number) => { try { canvas?.releasePointerCapture(id); } catch {} },
      getMode: () => mode,
      multiselectBoxStart: () => multiselectBoxStart,
      multiselectBoxEnd: () => multiselectBoxEnd,
      selectObjectsInBox,
      updateSelectionButtons,
      endInkStroke,
      clearDragState,
      getActiveAxisSnap: () => activeAxisSnap,
      getActiveAxisSnaps: () => activeAxisSnaps,
      clearActiveAxisSnaps: () => { activeAxisSnaps.clear(); activeAxisSnap = null; },
      enforceAxisAlignment,
      markHistoryIfNeeded,
      resetEraserState,
      pushHistory,
      draw
    });
  });
  modeNgonBtn?.addEventListener('click', () => {
    handleToolClick('ngon');
  });
  const modeCircleBtn = document.getElementById('modeCircle') as HTMLButtonElement | null;
  modeCircleBtn?.addEventListener('click', () => handleToolClick('circle'));
  modeCircleBtn?.addEventListener('dblclick', (e) => { e.preventDefault(); handleToolSticky('circle'); });
  setupDoubleTapSticky(modeCircleBtn, 'circle');
  modeMoveBtn?.addEventListener('click', () => {
    stickyTool = null;
    if (mode !== 'move') {
      setMode('move');
      clearSelectionState();
      updateToolButtons();
      updateSelectionButtons();
      draw();
    }
  });
  modeMultiselectBtn?.addEventListener('click', () => handleToolClick('multiselect'));
  if (lineWidthDecreaseBtn) attachHoldHandler(lineWidthDecreaseBtn, () => adjustLineWidth(-1));
  if (lineWidthIncreaseBtn) attachHoldHandler(lineWidthIncreaseBtn, () => adjustLineWidth(1));
  colorSwatchButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = btn.dataset.color;
      if (!c || !styleColorInput) return;
      styleColorInput.value = c;
      rememberColor(c);
      applyStyleFromInputs();
      updateStyleMenuValues();
    });
  });
  fillToggleBtn?.addEventListener('click', () => {
    if (selectedLabel !== null) return;
    if (!styleColorInput) return;
    const color = styleColorInput.value;
    let changed = false;
    // Opacity steps sequence (reversed as requested): none -> 5% -> 10% -> 15% -> 25% -> 50% -> none -> ...
    const STEPS: Array<number | undefined> = [undefined, 0.05, 0.1, 0.15, 0.25, 0.5];
    const findNext = (curOpacity: number | undefined) => {
      // find current index in STEPS (matching undefined or numeric within epsilon)
      const idx = STEPS.findIndex((s) => {
        if (s === undefined) return curOpacity === undefined;
        return curOpacity !== undefined && Math.abs(s - curOpacity) < 1e-6;
      });
      const nextIdx = idx === -1 ? 1 : (idx + 1) % STEPS.length;
      return STEPS[nextIdx];
    };

    const applyNextTo = (obj: any) => {
      const cur = obj?.fillOpacity;
      const next = findNext(cur);
      if (next === undefined) {
        // turn off fill
        return { fill: undefined, fillOpacity: undefined };
      }
      const colorToUse = obj?.fill ?? color;
      return { fill: colorToUse, fillOpacity: next };
    };

    if (selectedCircleIndex !== null) {
      const circle = model.circles[selectedCircleIndex];
      if (circle) {
        const n = applyNextTo(circle);
        model.circles[selectedCircleIndex] = { ...circle, fill: n.fill, fillOpacity: n.fillOpacity } as Circle;
        changed = true;
      }
    } else {
      const lineIdxForPoly = selectedLineIndex;
      const polyIdx =
        selectedPolygonIndex !== null
          ? selectedPolygonIndex
          : lineIdxForPoly !== null
            ? polygonForLine(lineIdxForPoly)
            : -1;
      if (polyIdx !== null) {
        const poly = polygonGet(polyIdx);
        if (poly) {
          const n = applyNextTo(poly);
          polygonSet(polyIdx, (old) => ({ ...old!, fill: n.fill, fillOpacity: n.fillOpacity } as Polygon));
          changed = true;
        }
      }
    }

    if (changed) {
      draw();
      pushHistory();
      updateStyleMenuValues();
    }
  });
  pointHollowToggleBtn?.addEventListener('click', () => {
    toggleSelectedPointsHollow();
  });
  customColorBtn?.addEventListener('click', () => {
    styleColorInput?.click();
  });
  arcCountButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      arcCountButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const count = Number(btn.dataset.count) || 1;
      rightAngleBtn?.classList.remove('active');
      if (selectedAngleIndex !== null) {
        const ang = model.angles[selectedAngleIndex];
        model.angles[selectedAngleIndex] = { ...ang, style: { ...ang.style, arcCount: count, right: false } };
        draw();
        pushHistory();
      }
    });
  });
  rightAngleBtn?.addEventListener('click', () => {
    if (!rightAngleBtn) return;
    const active = rightAngleBtn.classList.toggle('active');
    if (active) arcCountButtons.forEach((b) => b.classList.remove('active'));
    if (selectedAngleIndex !== null) {
      const ang = model.angles[selectedAngleIndex];
      const arcCount = active ? 1 : ang.style.arcCount ?? 1;
      model.angles[selectedAngleIndex] = { ...ang, style: { ...ang.style, right: active, arcCount } };
      draw();
      pushHistory();
    }
  });
  exteriorAngleBtn?.addEventListener('click', () => {
    if (!exteriorAngleBtn) return;
    const active = exteriorAngleBtn.classList.toggle('active');
    exteriorAngleBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (selectedAngleIndex !== null) {
      const ang = model.angles[selectedAngleIndex];
      model.angles[selectedAngleIndex] = { ...ang, style: { ...ang.style, exterior: active } };
      draw();
      pushHistory();
    }
  });
  if (angleRadiusDecreaseBtn) attachHoldHandler(angleRadiusDecreaseBtn, () => adjustSelectedAngleRadius(-1));
  if (angleRadiusIncreaseBtn) attachHoldHandler(angleRadiusIncreaseBtn, () => adjustSelectedAngleRadius(1));
  styleTypeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.type as StrokeStyle['type'] | undefined;
      if (styleTypeSelect && t) styleTypeSelect.value = t;
      applyStyleFromInputs();
      updateStyleMenuValues();
    });
  });
  viewModeToggleBtn?.addEventListener('click', toggleViewMenu);
  document.getElementById('viewEdgesOption')?.addEventListener('click', () => setViewMode('edges'));
  document.getElementById('viewVerticesOption')?.addEventListener('click', () => setViewMode('vertices'));
  document.getElementById('viewCircleLineOption')?.addEventListener('click', () => setViewMode('edges'));
  document.getElementById('viewCirclePointsOption')?.addEventListener('click', () => setViewMode('vertices'));
  rayModeToggleBtn?.addEventListener('click', toggleRayMenu);
  document.getElementById('rayRightOption')?.addEventListener('click', () => setRayMode('right'));
  document.getElementById('rayLeftOption')?.addEventListener('click', () => setRayMode('left'));
  document.getElementById('raySegmentOption')?.addEventListener('click', () => setRayMode('segment'));
  themeDarkBtn?.addEventListener('click', () => {
    const nextTheme: ThemeName = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  });

  // Settings modal handlers
  settingsBtn?.addEventListener('click', () => {
    if (settingsModal) {
      settingsModal.style.display = 'flex';
      initializeButtonConfig();

      // Update precision inputs
      const precisionLengthInput = document.getElementById('precisionLength') as HTMLInputElement | null;
      const precisionAngleInput = document.getElementById('precisionAngle') as HTMLInputElement | null;
      if (precisionLengthInput) precisionLengthInput.value = measurementPrecisionLength.toString();
      if (precisionAngleInput) precisionAngleInput.value = measurementPrecisionAngle.toString();
      updatePointStyleConfigButtons();
    }
  });

  // Adjust settings modal width to match the Appearance tab (Wygląd),
  // so it doesn't keep a too-wide size from other tabs.
  function fitSettingsModalToAppearanceTab() {
    const modalContent = document.querySelector('#settingsModal .modal-content') as HTMLElement | null;
    if (!modalContent) return;
    const modalBody = modalContent.querySelector('.modal-body') as HTMLElement | null;
    const modalHeader = modalContent.querySelector('.modal-header') as HTMLElement | null;
    const modalTabs = modalContent.querySelector('.modal-tabs') as HTMLElement | null;
    if (!modalBody || !modalHeader || !modalTabs) return;
    const tabAppearance = document.getElementById('tabAppearance') as HTMLElement | null;
    if (!tabAppearance) return;

    // Width: keep aligned to appearance tab on larger viewports; on small screens let CSS handle it.
    if (window.innerWidth <= 1000) {
      modalContent.style.width = '';
      modalContent.style.minWidth = '';
      modalContent.style.maxWidth = '';
    } else {
      const clone = tabAppearance.cloneNode(true) as HTMLElement;
      clone.style.position = 'absolute';
      clone.style.visibility = 'hidden';
      clone.style.display = 'block';
      clone.style.left = '-9999px';
      clone.style.top = '-9999px';
      clone.style.width = 'auto';
      document.body.appendChild(clone);
      const measuredWidth = clone.offsetWidth;
      clone.remove();

      const padding = 48; // px
      const desired = Math.min(window.innerWidth - 40, Math.max(400, measuredWidth + padding));
      modalContent.style.width = desired + 'px';
      modalContent.style.minWidth = desired + 'px';
      modalContent.style.maxWidth = Math.min(window.innerWidth - 20, desired) + 'px';
    }

    // Height: keep aligned to appearance tab height (within viewport constraints).
    const chromeHeight = modalHeader.offsetHeight + modalTabs.offsetHeight;
    const maxTotal = Math.floor(window.innerHeight * 0.9);
    const maxBody = Math.max(160, maxTotal - chromeHeight);

    const heightClone = tabAppearance.cloneNode(true) as HTMLElement;
    heightClone.style.position = 'absolute';
    heightClone.style.visibility = 'hidden';
    heightClone.style.display = 'block';
    heightClone.style.left = '-9999px';
    heightClone.style.top = '-9999px';
    heightClone.style.boxSizing = 'border-box';
    // Measure using current body width to reflect wrapping.
    const measureWidth = modalBody.clientWidth || Math.min(720, window.innerWidth - 64);
    heightClone.style.width = `${measureWidth}px`;
    document.body.appendChild(heightClone);
    const measuredHeight = heightClone.scrollHeight;
    heightClone.remove();

    const desiredBodyHeight = Math.min(maxBody, Math.max(160, measuredHeight));
    modalBody.style.height = `${desiredBodyHeight}px`;
    modalBody.style.maxHeight = `${maxBody}px`;
    modalContent.style.height = `${Math.min(maxTotal, chromeHeight + desiredBodyHeight)}px`;
    modalContent.style.maxHeight = `${maxTotal}px`;
  }

  // Refit when opening and on resize while modal is open
  settingsBtn?.addEventListener('click', () => {
    setTimeout(() => fitSettingsModalToAppearanceTab(), 20);
  });
  window.addEventListener('resize', () => {
    const settingsModalEl = document.getElementById('settingsModal');
    if (settingsModalEl && settingsModalEl.style.display !== 'none') fitSettingsModalToAppearanceTab();
  });

  settingsCloseBtn?.addEventListener('click', () => {
    if (settingsModal) {
      applyButtonConfiguration();
      settingsModal.style.display = 'none';
    }
  });
  
  // Export/Import configuration handlers
  const exportConfigBtn = document.getElementById('exportConfigBtn') as HTMLButtonElement | null;
  const importConfigBtn = document.getElementById('importConfigBtn') as HTMLButtonElement | null;
  const importConfigInput = document.getElementById('importConfigInput') as HTMLInputElement | null;
  const blurSettings = () => {
    const modal = document.getElementById('settingsModal') as HTMLElement | null;
    if (modal) {
      modal.dataset.prevFilter = modal.style.filter || '';
      modal.dataset.prevOpacity = modal.style.opacity || '';
      modal.style.filter = 'blur(4px)';
      modal.style.opacity = '0.5';
    }
  };
  const unblurSettings = () => {
    const modal = document.getElementById('settingsModal') as HTMLElement | null;
    if (modal) {
      modal.style.filter = modal.dataset.prevFilter || '';
      modal.style.opacity = modal.dataset.prevOpacity || '';
      delete (modal.dataset as any).prevFilter;
      delete (modal.dataset as any).prevOpacity;
    }
  };
  window.addEventListener('cloud-panel-closed', unblurSettings);
  
  exportConfigBtn?.addEventListener('click', () => {
    blurSettings();
    exportButtonConfiguration();
  });
  
  importConfigBtn?.addEventListener('click', async () => {
    blurSettings();
    initCloudUI((data) => {
      const normalized = normalizeLoadedResult(data);
      currentCtrBundle = null;
      updateArchiveNavButtons();
      const json = JSON.stringify(normalized.data);
      const success = importButtonConfiguration(json);
      showImportFeedback(success);
      closeCloudPanel();
    }, { hideLibraryTab: true, title: 'Konfiguracja', fileExtension: '.config' });
  });
  
  importConfigInput?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = importButtonConfiguration(content);
        showImportFeedback(success);
        unblurSettings();
      }
    };
    reader.readAsText(file);
    
    // Reset input so the same file can be imported again
    (e.target as HTMLInputElement).value = '';
  });
  
  // Tab switching in settings modal
  const tabButtons = document.querySelectorAll('.modal-tabs .tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = (btn as HTMLElement).dataset.tab;
      if (!tabName) return;
      
      // Update tab buttons
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update tab content
      const tabContents = document.querySelectorAll('.tab-content');
      tabContents.forEach(content => {
        content.classList.remove('active');
      });
      
      const targetTab = document.getElementById(`tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
      if (targetTab) {
        targetTab.classList.add('active');
      }

      // Keep modal width aligned to the Appearance tab, so switching from wider tabs
      // doesn't leave a large empty margin.
      setTimeout(() => fitSettingsModalToAppearanceTab(), 0);
    });
  });
  
  // Precision settings
  const precisionLengthInput = document.getElementById('precisionLength') as HTMLInputElement | null;
  const precisionAngleInput = document.getElementById('precisionAngle') as HTMLInputElement | null;
  
  if (precisionLengthInput) {
    precisionLengthInput.value = measurementPrecisionLength.toString();
    precisionLengthInput.addEventListener('change', () => {
      const value = parseInt(precisionLengthInput.value, 10);
      if (!isNaN(value) && value >= 0 && value <= 5) {
        measurementPrecisionLength = value;
        localStorage.setItem('measurementPrecisionLength', value.toString());
        if (showMeasurements) {
          draw(); // Refresh measurements with new precision
        }
      }
    });
  }
  
  if (precisionAngleInput) {
    precisionAngleInput.value = measurementPrecisionAngle.toString();
    precisionAngleInput.addEventListener('change', () => {
      const value = parseInt(precisionAngleInput.value, 10);
      if (!isNaN(value) && value >= 0 && value <= 5) {
        measurementPrecisionAngle = value;
        localStorage.setItem('measurementPrecisionAngle', value.toString());
        if (showMeasurements) {
          draw(); // Refresh measurements with new precision
        }
      }
    });
  }

  // Close modal when clicking outside
  settingsModal?.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      applyButtonConfiguration();
      settingsModal.style.display = 'none';
    }
  });

  // Prevent pull-to-refresh on modal
  settingsModal?.addEventListener('touchstart', (e) => {
    const modalContent = settingsModal.querySelector('.modal-content');
    if (modalContent && e.target instanceof Node && modalContent.contains(e.target)) {
      // Allow scrolling inside modal content
      e.stopPropagation();
    }
  }, { passive: true });

  settingsModal?.addEventListener('touchmove', (e) => {
    const modalContent = settingsModal.querySelector('.modal-content');
    const modalBody = settingsModal.querySelector('.modal-body');
    
    if (modalBody && e.target instanceof Node && modalBody.contains(e.target)) {
      // Check if we're at the top of scrollable content
      const atTop = modalBody.scrollTop === 0;
      const scrollingUp = e.touches[0].clientY > (e.target as any).lastTouchY;
      
      // Prevent pull-to-refresh only when at top and scrolling up
      if (atTop && scrollingUp) {
        e.preventDefault();
      }
    } else if (modalContent && e.target instanceof Node && modalContent.contains(e.target)) {
      // Inside modal but not in scrollable area - prevent pull-to-refresh
      e.preventDefault();
    }
  }, { passive: false });


  hideBtn?.addEventListener('click', () => {
    // Handle multiselection hide
    if (hasMultiSelection()) {
      multiSelectedPoints.forEach(idx => {
        const p = model.points[idx];
        if (p) {
          model.points[idx] = { ...p, style: { ...p.style, hidden: !p.style.hidden } };
        }
      });
      
      multiSelectedLines.forEach(idx => {
        if (model.lines[idx]) {
          model.lines[idx].hidden = !model.lines[idx].hidden;
        }
      });
      
      multiSelectedCircles.forEach(idx => {
        if (model.circles[idx]) {
          model.circles[idx].hidden = !model.circles[idx].hidden;
        }
      });
      
      multiSelectedAngles.forEach(idx => {
        const angle = model.angles[idx];
        if (angle) {
          model.angles[idx] = { ...angle, hidden: !angle.hidden };
        }
      });
      
      multiSelectedPolygons.forEach(pid => {
        const idx = model.indexById.polygon[pid];
        if (typeof idx !== 'number') return;
        const poly = polygonGet(idx);
        poly?.lines.forEach(li => {
          if (model.lines[li]) model.lines[li].hidden = !model.lines[li].hidden;
        });
      });
      
      multiSelectedInkStrokes.forEach(idx => {
        const stroke = model.inkStrokes[idx];
        if (stroke) {
          model.inkStrokes[idx] = { ...stroke, hidden: !stroke.hidden };
        }
      });
      
      draw();
      updateSelectionButtons();
      pushHistory();
      return;
    }
    
    if (selectedInkStrokeIndex !== null) {
      const stroke = model.inkStrokes[selectedInkStrokeIndex];
      if (stroke) {
        model.inkStrokes[selectedInkStrokeIndex] = { ...stroke, hidden: !stroke.hidden };
      }
    } else if (selectedLabel) {
      return;
    } else if (selectedPolygonIndex !== null) {
      const poly = polygonGet(selectedPolygonIndex);
      poly?.lines.forEach((li) => {
        if (model.lines[li]) model.lines[li].hidden = !model.lines[li].hidden;
      });
    } else if (selectedLineIndex !== null) {
      const line = model.lines[selectedLineIndex];
      if (!line) return;
      if (selectedSegments.size > 0) {
        // Toggle hidden on selected segments/rays
        ensureSegmentStylesForLine(selectedLineIndex);
        selectedSegments.forEach((key) => {
          const parsed = parseSegmentKey(key);
          if (!parsed || parsed.line !== selectedLineIndex) return;
          if (parsed.part === 'segment' && typeof parsed.seg === 'number') {
            if (!line.segmentStyles) line.segmentStyles = [];
            const prev = line.segmentStyles[parsed.seg] ?? line.style;
            line.segmentStyles[parsed.seg] = { ...prev, hidden: !prev.hidden };
          } else if (parsed.part === 'rayLeft') {
            const prev = line.leftRay ?? line.style;
            line.leftRay = { ...prev, hidden: !prev.hidden };
          } else if (parsed.part === 'rayRight') {
            const prev = line.rightRay ?? line.style;
            line.rightRay = { ...prev, hidden: !prev.hidden };
          }
        });
      } else {
        line.hidden = !line.hidden;
      }
    } else if (selectedCircleIndex !== null) {
      if (selectionEdges) {
        const circle = model.circles[selectedCircleIndex];
        if (selectedArcSegments.size > 0) {
          // Toggle hidden flag on selected arcStyles
          const arcs = circleArcs(selectedCircleIndex);
          ensureArcStyles(selectedCircleIndex, arcs.length);
          selectedArcSegments.forEach((key) => {
            const parsed = parseArcKey(key);
            if (!parsed || parsed.circle !== selectedCircleIndex || parsed.start === undefined || parsed.end === undefined) return;
            if (!circle.arcStyles) circle.arcStyles = {} as any;
            const mapKey = arcKey(selectedCircleIndex, parsed.start, parsed.end);
            const prev = (circle.arcStyles as any)[mapKey] ?? circle.style;
            (circle.arcStyles as any)[mapKey] = { ...prev, hidden: !prev.hidden };
          });
        } else {
          circle.hidden = !circle.hidden;
        }
      }
      if (selectionVertices) {
        const circle = model.circles[selectedCircleIndex];
        const pointsToToggle = new Set<number>();
        if (circle.center !== null) pointsToToggle.add(circle.center);
        if (circle.radius_point !== null) pointsToToggle.add(circle.radius_point);
        // Also toggle defining parents if they are points
        circle.defining_parents.forEach(pid => {
          const idx = model.points.findIndex(p => p.id === pid);
          if (idx !== -1) pointsToToggle.add(idx);
        });
        
        pointsToToggle.forEach(idx => {
          const p = model.points[idx];
          if (p) model.points[idx] = { ...p, style: { ...p.style, hidden: !p.style.hidden } };
        });
      }
    } else if (selectedAngleIndex !== null) {
      const angle = model.angles[selectedAngleIndex];
      if (angle) {
        model.angles[selectedAngleIndex] = { ...angle, hidden: !angle.hidden };
      }
    } else if (selectedPointIndex !== null) {
      const p = model.points[selectedPointIndex];
      model.points[selectedPointIndex] = { ...p, style: { ...p.style, hidden: !p.style.hidden } };
    }
    draw();
    updateSelectionButtons();
    pushHistory();
  });
  copyStyleBtn?.addEventListener('click', () => {
    // Przełącz na tryb edycji, nawet jeśli jest sticky tool
    stickyTool = null;
    setMode('move');
    
    // Zamknij menu stylu jeśli jest otwarte
    if (styleMenuOpen) {
      closeStyleMenu();
    }
    
    if (!copyStyleActive) {
      // Aktywuj tryb kopiowania stylu
      const style = copyStyleFromSelection();
      if (style) {
        copiedStyle = style;
        copyStyleActive = true;
        // activated via button
        updateSelectionButtons();
      }
    } else {
      // Dezaktywuj tryb kopiowania stylu
      copyStyleActive = false;
      copiedStyle = null;
      updateSelectionButtons();
    }
  });
  
  multiMoveBtn?.addEventListener('click', () => {
    if (!multiMoveActive) {
      multiMoveActive = true;
      multiMoveBtn?.classList.add('active');
      multiMoveBtn?.setAttribute('aria-pressed', 'true');
    } else {
      multiMoveActive = false;
      multiMoveBtn?.classList.remove('active');
      multiMoveBtn?.setAttribute('aria-pressed', 'false');
    }
  });
  
  multiCloneBtn?.addEventListener('click', () => {
    if (!hasMultiSelection()) return;

    // If we're in multiselect mode, treat this button as Copy/Paste toggle
    if (mode === 'multiselect') {
      if (!copiedObjects) {
        // Perform copy (serialize current multi-selection)
        copyMultiSelectionToClipboard();
        updateSelectionButtons();
        return;
      } else {
        // Paste stored objects into current model
        pasteCopiedObjects();
        updateSelectionButtons();
        return;
      }
    }

    // Fallback: original clone behavior (clone immediately)
    // First pass: collect all objects that need to be cloned
    const linesToClone = new Set<number>(multiSelectedLines);
    const pointsToClone = new Set<number>(multiSelectedPoints);
    
    // If cloning polygons, also clone their lines
    multiSelectedPolygons.forEach(pid => {
      const pidx = model.indexById.polygon[pid];
      if (typeof pidx !== 'number') return;
      const poly = polygonGet(pidx);
      if (poly) {
        poly.lines.forEach(li => linesToClone.add(li));
      }
    });
    
    // Collect all points used by selected lines, circles and polygons
    linesToClone.forEach(idx => {
      const line = model.lines[idx];
      if (line) {
        line.points.forEach(pi => pointsToClone.add(pi));
      }
    });
    
    multiSelectedCircles.forEach(idx => {
      const circle = model.circles[idx];
      if (circle) {
        pointsToClone.add(circle.center);
        if (circle.radius_point !== undefined) pointsToClone.add(circle.radius_point);
        circle.points.forEach(pi => pointsToClone.add(pi));
      }
    });
    
    multiSelectedAngles.forEach(idx => {
      const ang = model.angles[idx];
      if (ang) {
        pointsToClone.add(ang.vertex);
      }
    });
    
    // Clone points
    const pointRemap = new Map<number, number>();
    pointsToClone.forEach(idx => {
      const p = model.points[idx];
      if (p) {
        // Clone midpoint/symmetric/bisect metadata (prefer runtime meta if present)
        const midpointMeta = (p as any).midpointMeta ?? p.midpoint;
        const bisectMeta = (p as any).bisectMeta ?? p.bisect;
        const symmetricMeta = (p as any).symmetricMeta ?? p.symmetric;

        const midpoint = midpointMeta ? { ...midpointMeta } : undefined;
        const bisect = bisectMeta ? { ...bisectMeta } : undefined;
        const symmetric = symmetricMeta ? { ...symmetricMeta } : undefined;

        const newPoint: any = { ...p, id: nextId('point', model), midpoint, bisect, symmetric };
        // also retain runtime-named fields when present
        if (midpointMeta) newPoint.midpointMeta = { ...midpointMeta };
        if (bisectMeta) newPoint.bisectMeta = { ...bisectMeta };
        if (symmetricMeta) newPoint.symmetricMeta = { ...symmetricMeta };
        model.points.push(newPoint);
        const newIdx = model.points.length - 1;
        pointRemap.set(idx, newIdx);
        registerIndex(model, 'point', newPoint.id, newIdx);
      }
    });
    
    // Clone lines
    const lineRemap = new Map<number, number>();
    linesToClone.forEach(idx => {
      const line = model.lines[idx];
      if (line) {
        const newPoints = line.points.map(pi => pointRemap.get(pi) ?? pi);
        const newDefiningPoints: [number, number] = [
          pointRemap.get(line.defining_points[0]) ?? line.defining_points[0],
          pointRemap.get(line.defining_points[1]) ?? line.defining_points[1]
        ];
        
        // Clone parallel/perpendicular metadata with updated point/line references
        let parallel = line.parallel ? { ...line.parallel } : undefined;
        let perpendicular = line.perpendicular ? { ...line.perpendicular } : undefined;
        
        if (parallel) {
          const throughPointIdx = pointIndexById(parallel.throughPoint);
          const helperPointIdx = pointIndexById(parallel.helperPoint);
          const refLineIdx = lineIndexById(parallel.referenceLine);
          
          if (throughPointIdx !== null && pointRemap.has(throughPointIdx)) {
            parallel.throughPoint = model.points[pointRemap.get(throughPointIdx)!].id;
          }
          if (helperPointIdx !== null && pointRemap.has(helperPointIdx)) {
            parallel.helperPoint = model.points[pointRemap.get(helperPointIdx)!].id;
          }
          if (refLineIdx !== null && lineRemap.has(refLineIdx)) {
            parallel.referenceLine = model.lines[lineRemap.get(refLineIdx)!].id;
          }
        }
        
        if (perpendicular) {
          const throughPointIdx = pointIndexById(perpendicular.throughPoint);
          const helperPointIdx = pointIndexById(perpendicular.helperPoint);
          const refLineIdx = lineIndexById(perpendicular.referenceLine);
          
          if (throughPointIdx !== null && pointRemap.has(throughPointIdx)) {
            perpendicular.throughPoint = model.points[pointRemap.get(throughPointIdx)!].id;
          }
          if (helperPointIdx !== null && pointRemap.has(helperPointIdx)) {
            perpendicular.helperPoint = model.points[pointRemap.get(helperPointIdx)!].id;
          }
          if (refLineIdx !== null && lineRemap.has(refLineIdx)) {
            perpendicular.referenceLine = model.lines[lineRemap.get(refLineIdx)!].id;
          }
        }
        
        const newLine = { 
          ...line, 
          id: nextId('line', model),
          points: newPoints,
          defining_points: newDefiningPoints,
          parallel,
          perpendicular,
          segmentStyles: line.segmentStyles?.map(s => ({ ...s })),
          segmentKeys: line.segmentKeys ? [...line.segmentKeys] : undefined
        };
        model.lines.push(newLine);
        const newIdx = model.lines.length - 1;
        lineRemap.set(idx, newIdx);
        registerIndex(model, 'line', newLine.id, newIdx);
      }
    });
    
    // Update cloned points to reference cloned lines/circles
    pointRemap.forEach((newIdx, oldIdx) => {
      const newPoint = model.points[newIdx];
      const oldPoint = model.points[oldIdx];
      if (!newPoint || !oldPoint) return;
      
      // Update parent_refs to point to cloned objects
      const updatedParentRefs = oldPoint.parent_refs?.map(ref => {
        if (ref.kind === 'line') {
          const oldLineIdx = lineIndexById(ref.id);
          if (oldLineIdx !== null && lineRemap.has(oldLineIdx)) {
            const newLineIdx = lineRemap.get(oldLineIdx)!;
            const newLine = model.lines[newLineIdx];
            return { kind: 'line' as const, id: newLine.id };
          }
        }
        // Keep original reference if not cloned
        return ref;
      }) || [];
      
      // Update midpoint/bisect/symmetric metadata
      const origPoint = oldPoint as any;
      const origMid = origPoint.midpointMeta ?? origPoint.midpoint;
      let midpointUp = undefined as any;
      if (origMid) {
        const [parentA, parentB] = origMid.parents;
        const parentAIdx = pointIndexById(parentA);
        const parentBIdx = pointIndexById(parentB);
        const newParentA = parentAIdx !== null && pointRemap.has(parentAIdx) ? model.points[pointRemap.get(parentAIdx)!].id : parentA;
        const newParentB = parentBIdx !== null && pointRemap.has(parentBIdx) ? model.points[pointRemap.get(parentBIdx)!].id : parentB;
        let parentLineId = origMid.parentLineId;
        if (parentLineId) {
          const lineIdx = lineIndexById(parentLineId);
          if (lineIdx !== null && lineRemap.has(lineIdx)) parentLineId = model.lines[lineRemap.get(lineIdx)!].id;
        }
        midpointUp = { parents: [newParentA, newParentB], parentLineId };
      }

      const origBis = origPoint.bisectMeta ?? origPoint.bisect;
      let bisectUp = undefined as any;
      if (origBis) {
        const vertexIdx = pointIndexById(origBis.vertex);
        const newVertex = vertexIdx !== null && pointRemap.has(vertexIdx) ? model.points[pointRemap.get(vertexIdx)!].id : origBis.vertex;
        const mapSeg = (s: any) => {
          const aIdx = pointIndexById(s.a);
          const bIdx = pointIndexById(s.b);
          const lineIdx = s.lineId ? lineIndexById(s.lineId) : (s.line !== undefined ? s.line : null);
          const newA = aIdx !== null && pointRemap.has(aIdx) ? model.points[pointRemap.get(aIdx)!].id : s.a;
          const newB = bIdx !== null && pointRemap.has(bIdx) ? model.points[pointRemap.get(bIdx)!].id : s.b;
          const newLine = lineIdx !== null && lineRemap.has(lineIdx) ? model.lines[lineRemap.get(lineIdx)!].id : s.lineId ?? s.line;
          return { line: newLine, a: newA, b: newB };
        };
        bisectUp = { vertex: newVertex, seg1: mapSeg(origBis.seg1), seg2: mapSeg(origBis.seg2), epsilon: origBis.epsilon };
      }

      const origSym = origPoint.symmetricMeta ?? origPoint.symmetric;
      let symmetricUp = undefined as any;
      if (origSym) {
        const sourceIdx = pointIndexById(origSym.source);
        const newSource = sourceIdx !== null && pointRemap.has(sourceIdx) ? model.points[pointRemap.get(sourceIdx)!].id : origSym.source;
        let mirror = origSym.mirror;
        if (mirror.kind === 'point') {
          const mirrorIdx = pointIndexById(mirror.id);
          if (mirrorIdx !== null && pointRemap.has(mirrorIdx)) mirror = { kind: 'point', id: model.points[pointRemap.get(mirrorIdx)!].id };
        } else if (mirror.kind === 'line') {
          const mirrorIdx = lineIndexById(mirror.id);
          if (mirrorIdx !== null && lineRemap.has(mirrorIdx)) mirror = { kind: 'line', id: model.lines[lineRemap.get(mirrorIdx)!].id };
        }
        symmetricUp = { source: newSource, mirror };
      }
      
      const finalPoint: any = { ...newPoint, parent_refs: updatedParentRefs, defining_parents: updatedParentRefs.map((p: any) => p.id) };
      if (midpointUp) finalPoint.midpoint = midpointUp;
      if (bisectUp) finalPoint.bisect = bisectUp;
      if (symmetricUp) finalPoint.symmetric = symmetricUp;
      if ((newPoint as any).midpointMeta) finalPoint.midpointMeta = { ...(newPoint as any).midpointMeta };
      if ((newPoint as any).bisectMeta) finalPoint.bisectMeta = { ...(newPoint as any).bisectMeta };
      if ((newPoint as any).symmetricMeta) finalPoint.symmetricMeta = { ...(newPoint as any).symmetricMeta };
      model.points[newIdx] = finalPoint;
    });
    
    // Clone circles
    const circleRemap = new Map<number, number>();
    multiSelectedCircles.forEach(idx => {
      const circle = model.circles[idx];
      if (circle) {
        const newCenter = pointRemap.get(circle.center) ?? circle.center;
        const newPoints = circle.points.map(pi => pointRemap.get(pi) ?? pi);
        const newCircle = {
          ...circle,
          id: nextId('circle', model),
          center: newCenter,
          points: newPoints,
          arcStyles: circle.arcStyles && !Array.isArray(circle.arcStyles) ? { ...(circle.arcStyles as any) } : undefined
        };
        if (circle.circle_kind === 'center-radius') {
          newCircle.radius_point = circle.radius_point !== undefined ? (pointRemap.get(circle.radius_point) ?? circle.radius_point) : circle.radius_point;
        }
        model.circles.push(newCircle);
        const newIdx = model.circles.length - 1;
        circleRemap.set(idx, newIdx);
        registerIndex(model, 'circle', newCircle.id, newIdx);
      }
    });
    
    // Clone angles
    const angleRemap = new Map<number, number>();
    multiSelectedAngles.forEach(idx => {
      const ang = model.angles[idx];
      if (ang) {
        const mapLineRefForClone = (ref: any) => {
          if (typeof ref === 'number') return lineRemap.get(ref) ?? ref;
          return ref;
        };
        const newAngle: any = { ...ang, id: nextId('angle', model) };
        // remap vertex/points if present
        newAngle.vertex = pointRemap.get(ang.vertex) ?? ang.vertex;
        if ((ang as any).point1 !== undefined) newAngle.point1 = pointRemap.get((ang as any).point1) ?? (ang as any).point1;
        if ((ang as any).point2 !== undefined) newAngle.point2 = pointRemap.get((ang as any).point2) ?? (ang as any).point2;
        // Do not recreate legacy `leg1`/`leg2` on cloned angles; prefer runtime id fields.
        // If legacy refs exist on the source angle, derive runtime `arm*LineId` fields below instead.
        // Also populate runtime arm line ids (string ids) when possible from remapped refs.
        // Do not override existing `arm*LineId` if already present on the angle.
        if (!newAngle.arm1LineId && (ang as any).leg1) {
          const mapped = mapLineRefForClone((ang as any).leg1.line);
          if (typeof mapped === 'number') {
            newAngle.arm1LineId = model.lines[mapped]?.id ?? undefined;
          } else if (typeof mapped === 'string') {
            newAngle.arm1LineId = mapped;
          }
        }
        if (!newAngle.arm2LineId && (ang as any).leg2) {
          const mapped = mapLineRefForClone((ang as any).leg2.line);
          if (typeof mapped === 'number') {
            newAngle.arm2LineId = model.lines[mapped]?.id ?? undefined;
          } else if (typeof mapped === 'string') {
            newAngle.arm2LineId = mapped;
          }
        }
        // Ensure canonical point fields exist when possible (fallback from legacy leg.otherPoint)
        if (newAngle.point1 === undefined && (ang as any).leg1) {
          newAngle.point1 = pointRemap.get((ang as any).leg1.otherPoint) ?? (ang as any).leg1.otherPoint;
        }
        if (newAngle.point2 === undefined && (ang as any).leg2) {
          newAngle.point2 = pointRemap.get((ang as any).leg2.otherPoint) ?? (ang as any).leg2.otherPoint;
        }
        model.angles.push(newAngle);
        const newIdx = model.angles.length - 1;
        angleRemap.set(idx, newIdx);
        registerIndex(model, 'angle', newAngle.id, newIdx);
      }
    });
    
    // Clone polygons
    const polygonRemap = new Map<number, number>();
    multiSelectedPolygons.forEach(pid => {
      const pidx = model.indexById.polygon[pid];
      if (typeof pidx !== 'number') return;
      const poly = polygonGet(pidx);
      if (poly) {
        const newLines = poly.lines.map(li => lineRemap.get(li) ?? li);
        const newIdx = createPolygon(newLines, (poly as any).construction_kind ?? 'free');
        const created = polygonGet(newIdx);
        polygonSet(newIdx, { ...poly, id: created?.id ?? poly.id, lines: newLines } as Polygon);
        polygonRemap.set(pidx, newIdx);
      }
    });
    
    // Clone ink strokes
    const newInkIndices: number[] = [];
    multiSelectedInkStrokes.forEach(idx => {
      const stroke = model.inkStrokes[idx];
      if (stroke) {
        const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `ink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const newStroke = {
          ...stroke,
          id,
          points: stroke.points.map(pt => ({ ...pt }))
        };
        model.inkStrokes.push(newStroke);
        newInkIndices.push(model.inkStrokes.length - 1);
      }
    });
    
    // Clone free labels (keep mapping to select them later)
    const labelRemap = new Map<number, number>();
    multiSelectedLabels.forEach(li => {
      const lab = model.labels[li];
      if (lab) {
        const newLab = { ...lab, pos: { x: lab.pos.x, y: lab.pos.y } };
        model.labels.push(newLab);
        const newIdx = model.labels.length - 1;
        labelRemap.set(li, newIdx);
      }
    });
    
    // Clear old selection and select cloned objects
    const newPointSelection = new Set<number>();
    pointRemap.forEach((newIdx, _) => newPointSelection.add(newIdx));
    
    const newLineSelection = new Set<number>();
    lineRemap.forEach((newIdx, _) => newLineSelection.add(newIdx));
    
    // Offset cloned points slightly so they don't overlap with originals.
    // Apply the same translation to ALL cloned points (not only free points)
    // to preserve distances between them — cloning must be a pure shift.
    const CLONE_OFFSET = 20;
    newPointSelection.forEach(idx => {
      const pt = model.points[idx];
      if (pt) {
        model.points[idx] = { ...pt, x: pt.x + CLONE_OFFSET, y: pt.y + CLONE_OFFSET };
      }
    });

    // Offset cloned free labels as well
    labelRemap.forEach((newIdx, _) => {
      const lab = model.labels[newIdx];
      if (lab) model.labels[newIdx] = { ...lab, pos: { x: lab.pos.x + CLONE_OFFSET, y: lab.pos.y + CLONE_OFFSET } };
    });
    
    // Recompute dependent points (intersections, midpoints, etc.) after moving free points
    newLineSelection.forEach(lineIdx => {
      updateIntersectionsForLine(lineIdx);
    });
    newPointSelection.forEach(idx => {
      updateMidpointsForPoint(idx);
    });
    
    // Clear old selection
    multiSelectedPoints.clear();
    multiSelectedLines.clear();
    multiSelectedCircles.clear();
    multiSelectedAngles.clear();
    multiSelectedPolygons.clear();
    multiSelectedInkStrokes.clear();
    // Also clear label multiselection and single label selection so only clones become selected
    multiSelectedLabels.clear();
    selectedLabel = null;
    
    // Clear single selection as well
    selectedPointIndex = null;
    selectedLineIndex = null;
    selectedCircleIndex = null;
    selectedAngleIndex = null;
    selectedPolygonIndex = null;
    selectedInkStrokeIndex = null;
    selectedSegments.clear();
    selectedArcSegments.clear();
    
    // Select cloned objects
    newPointSelection.forEach(idx => multiSelectedPoints.add(idx));
    newLineSelection.forEach(idx => multiSelectedLines.add(idx));
    circleRemap.forEach((newIdx, _) => multiSelectedCircles.add(newIdx));
    angleRemap.forEach((newIdx, _) => multiSelectedAngles.add(newIdx));
    polygonRemap.forEach((newIdx, _) => {
      const id = polygonId(newIdx);
      if (id) multiSelectedPolygons.add(id);
    });
    // Select cloned ink strokes
    newInkIndices.forEach(i => multiSelectedInkStrokes.add(i));
    // Select cloned labels
    labelRemap.forEach((newIdx, _) => multiSelectedLabels.add(newIdx));
    
    // Activate move mode
    multiMoveActive = true;
    multiMoveBtn?.classList.add('active');
    multiMoveBtn?.setAttribute('aria-pressed', 'true');
    
    updateSelectionButtons();
    draw();
    pushHistory();
  });

  // Paste button in top menu
  // pasteBtn removed; paste via `multiCloneBtn` in multiselect or via top-level clone button when copied
  
  deleteBtn?.addEventListener('click', () => {
    let changed = false;
    
    // Handle multiselection delete
    if (hasMultiSelection()) {
      multiSelectedInkStrokes.forEach(idx => {
        if (idx >= 0 && idx < model.inkStrokes.length) {
          model.inkStrokes[idx].hidden = true;
          changed = true;
        }
      });
      
      const pointsToRemove = Array.from(multiSelectedPoints);
      if (pointsToRemove.length > 0) {
        removePointsAndRelated(pointsToRemove, true);
        changed = true;
      }
      
      const linesToRemove = Array.from(multiSelectedLines);
      linesToRemove.sort((a, b) => b - a);
      linesToRemove.forEach(idx => {
        const line = model.lines[idx];
        if (line?.label) reclaimLabel(line.label);
        model.lines.splice(idx, 1);
        changed = true;
      });
      if (linesToRemove.length > 0) {
        const remap = new Map<number, number>();
        model.lines.forEach((_, idx) => remap.set(idx, idx));
        remapAngles(remap);
        remapPolygons(remap);
      }
      
      const circlesToRemove = Array.from(multiSelectedCircles);
      circlesToRemove.sort((a, b) => b - a);
      const allCirclePointsToRemove = new Set<number>();
      circlesToRemove.forEach(idx => {
        const circle = model.circles[idx];
        if (circle) {
          if (circle.label) reclaimLabel(circle.label);
          const circleId = circle.id;
          
          // Check center point - only remove if not used as defining point for lines
          const centerUsedInLines = model.lines.some(line => line.defining_points.includes(circle.center));
          if (!centerUsedInLines) {
            allCirclePointsToRemove.add(circle.center);
          }
          
          // Check other points on circle
          const constrainedPoints = [circle.radius_point, ...circle.points];
          constrainedPoints.forEach((pid) => {
            if (circleHasDefiningPoint(circle, pid)) return;
            const point = model.points[pid];
            if (!point) return;
            const hasCircleParent = point.parent_refs.some((pr) => pr.kind === 'circle' && pr.id === circleId);
            
            // Only remove if not used as defining point for lines
            const usedInLines = model.lines.some(line => line.defining_points.includes(pid));
            if (!usedInLines && (!isCircleThroughPoints(circle) || hasCircleParent)) {
              allCirclePointsToRemove.add(pid);
            }
          });
          
          // Remove circle from parent_refs of points that are not being deleted
          model.points = model.points.map((pt, ptIdx) => {
            if (allCirclePointsToRemove.has(ptIdx)) return pt;
            const before = pt.parent_refs || [];
            const afterRefs = before.filter((pr) => !(pr.kind === 'circle' && pr.id === circleId));
            if (afterRefs.length !== before.length) {
              const newKind = resolveConstructionKind(afterRefs);
              return {
                ...pt,
                parent_refs: afterRefs,
                defining_parents: afterRefs.map((p) => p.id),
                construction_kind: newKind
              };
            }
            return pt;
          });
          
          model.circles.splice(idx, 1);
          changed = true;
        }
      });
      
      // Remove collected circle points after all circles are processed
      if (allCirclePointsToRemove.size > 0) {
        removePointsAndRelated(Array.from(allCirclePointsToRemove), true);
      }
      
      const anglesToRemove = Array.from(multiSelectedAngles);
      anglesToRemove.sort((a, b) => b - a);
      anglesToRemove.forEach(idx => {
        const angle = model.angles[idx];
        if (angle?.label) reclaimLabel(angle.label);
        model.angles.splice(idx, 1);
        changed = true;
      });
      
      const polygonsToRemove = Array.from(multiSelectedPolygons)
        .map(pid => model.indexById.polygon[pid])
        .filter((n): n is number => typeof n === 'number');
      polygonsToRemove.sort((a, b) => b - a);
      polygonsToRemove.forEach(idx => {
        const poly = polygonGet(idx);
        if (poly) {
          poly.lines.forEach(li => {
            const line = model.lines[li];
            if (line?.label) reclaimLabel(line.label);
          });
          removePolygon(idx);
          changed = true;
        }
      });
      
      // Remove free labels selected via multiselect
      const labelsToRemove = Array.from(multiSelectedLabels);
      if (labelsToRemove.length > 0) {
        labelsToRemove.sort((a, b) => b - a);
        labelsToRemove.forEach((li) => {
          if (li >= 0 && li < model.labels.length) {
            model.labels.splice(li, 1);
            changed = true;
          }
        });
      }
      clearMultiSelection();
      updateSelectionButtons();
      if (changed) {
        rebuildIndexMaps();
        draw();
        pushHistory();
      }
      return;
    }
    
    if (selectedInkStrokeIndex !== null) {
      if (selectedInkStrokeIndex >= 0 && selectedInkStrokeIndex < model.inkStrokes.length) {
        model.inkStrokes.splice(selectedInkStrokeIndex, 1);
        selectedInkStrokeIndex = null;
        changed = true;
      }
    } else if (selectedLabel) {
      switch (selectedLabel.kind) {
        case 'point':
          if (model.points[selectedLabel.id]?.label) {
            reclaimLabel(model.points[selectedLabel.id].label);
            model.points[selectedLabel.id].label = undefined;
            changed = true;
          }
          break;
        case 'line':
          if (model.lines[selectedLabel.id]?.label) {
            reclaimLabel(model.lines[selectedLabel.id].label);
            model.lines[selectedLabel.id].label = undefined;
            changed = true;
          }
          break;
        case 'angle':
          if (model.angles[selectedLabel.id]?.label) {
            reclaimLabel(model.angles[selectedLabel.id].label);
            model.angles[selectedLabel.id].label = undefined;
            changed = true;
          }
          break;
        case 'free':
          if (selectedLabel.id >= 0 && selectedLabel.id < model.labels.length) {
            model.labels.splice(selectedLabel.id, 1);
            changed = true;
          }
          break;
      }
      selectedLabel = null;
      if (labelTextInput) labelTextInput.value = '';
    } else if (selectedPolygonIndex !== null) {
      const poly = polygonGet(selectedPolygonIndex);
      if (poly) {
        const polygonPoints = new Set<number>(polygonVertices(selectedPolygonIndex));
        poly.lines.forEach((li) => {
          const line = model.lines[li];
          if (line?.label) reclaimLabel(line.label);
        });
        const remap = new Map<number, number>();
        const toRemove = new Set(poly.lines);
        const kept: Line[] = [];
        model.lines.forEach((line, idx) => {
          if (toRemove.has(idx)) {
            remap.set(idx, -1);
          } else {
            remap.set(idx, kept.length);
            kept.push(line);
          }
        });
        model.lines = kept;
        remapAngles(remap);
        remapPolygons(remap);
        const orphanVertices = Array.from(polygonPoints).filter((pi) => !pointUsedAnywhere(pi));
        if (orphanVertices.length) {
          removePointsAndRelated(orphanVertices, false);
        } else {
          polygonPoints.forEach((pi) => clearPointLabelIfUnused(pi));
        }
      }
      selectedPolygonIndex = null;
      selectedLineIndex = null;
      selectedPointIndex = null;
      selectedCircleIndex = null;
      selectedArcSegments.clear();
      changed = true;
    } else if (selectedLineIndex !== null) {
      const line = model.lines[selectedLineIndex];
      const deletedLineId = line?.id;
      if (line?.label) reclaimLabel(line.label);
      if (selectionVertices) {
        const pts = Array.from(new Set(line.points));
        removePointsAndRelated(pts, true);
        if (deletedLineId) {
          const removedParallelIds = removeParallelLinesReferencing(deletedLineId);
          const removedPerpendicularIds = removePerpendicularLinesReferencing(deletedLineId);
          const idsToRemove = new Set<string>([deletedLineId, ...removedParallelIds, ...removedPerpendicularIds]);
          model.points = model.points.map((pt) => {
            const before = pt.parent_refs || [];
            const afterRefs = before.filter((pr) => !(pr.kind === 'line' && idsToRemove.has(pr.id)));
            if (afterRefs.length !== before.length) {
              const newKind = resolveConstructionKind(afterRefs);
              return {
                ...pt,
                parent_refs: afterRefs,
                defining_parents: afterRefs.map((p) => p.id),
                construction_kind: newKind
              };
            }
            return pt;
          });
        }
      } else {
        const lineIdx = selectedLineIndex;
        const remap = new Map<number, number>();
        model.lines.forEach((_, idx) => {
          if (idx === lineIdx) remap.set(idx, -1);
          else remap.set(idx, idx > lineIdx ? idx - 1 : idx);
        });
        model.lines.splice(lineIdx, 1);
        remapAngles(remap);
        remapPolygons(remap);
        // detach deleted line as parent from points that referenced it
        if (deletedLineId) {
          const removedParallelIds = removeParallelLinesReferencing(deletedLineId);
          const idsToRemove = new Set<string>([deletedLineId, ...removedParallelIds]);

          // Collect intersection points that referenced any of the removed line ids.
          // Those should be deleted rather than converted to on_object.
          const intersectionPointsToRemove: number[] = [];
          model.points.forEach((pt, idx) => {
            if (!pt) return;
            if (pt.construction_kind === 'intersection') {
              const hadRemovedParent = (pt.parent_refs || []).some(
                (pr) => pr.kind === 'line' && idsToRemove.has(pr.id)
              );
              if (hadRemovedParent) intersectionPointsToRemove.push(idx);
            }
          });

          // Now detach references from remaining points
          model.points = model.points.map((pt) => {
            const before = pt.parent_refs || [];
            const afterRefs = before.filter((pr) => !(pr.kind === 'line' && idsToRemove.has(pr.id)));
            if (afterRefs.length !== before.length) {
              const newKind = resolveConstructionKind(afterRefs);
              return {
                ...pt,
                parent_refs: afterRefs,
                defining_parents: afterRefs.map((p) => p.id),
                construction_kind: newKind
              };
            }
            return pt;
          });

          // Remove intersection points that lost a parent
          if (intersectionPointsToRemove.length) {
            removePointsKeepingOrder(intersectionPointsToRemove, false);
          }

          // Cleanup any remaining dependent points
          cleanupDependentPoints();
        }
      }
      selectedLineIndex = null;
      selectedPointIndex = null;
      selectedCircleIndex = null;
      selectedPolygonIndex = null;
      changed = true;
    } else if (selectedAngleIndex !== null) {
      const angle = model.angles[selectedAngleIndex];
      if (angle?.label) reclaimLabel(angle.label);
      model.angles.splice(selectedAngleIndex, 1);
      selectedAngleIndex = null;
      selectedLineIndex = null;
      selectedPointIndex = null;
      selectedCircleIndex = null;
      selectedPolygonIndex = null;
      changed = true;
    } else if (selectedCircleIndex !== null) {
      const circle = model.circles[selectedCircleIndex];
      if (circle) {
        if (selectionVertices) {
          const pointsToDelete = new Set<number>();
          if (circle.center !== null) pointsToDelete.add(circle.center);
          if (circle.radius_point !== null) pointsToDelete.add(circle.radius_point);
          circle.defining_parents.forEach(pid => {
            const idx = model.points.findIndex(p => p.id === pid);
            if (idx !== -1) pointsToDelete.add(idx);
          });
          removePointsAndRelated(Array.from(pointsToDelete), true);
        } else {
          if (circle.label) reclaimLabel(circle.label);
          const circleId = circle.id;
          const idx = model.indexById.circle[circleId];
          if (idx !== undefined) {
            model.circles.splice(idx, 1);
          }
          
          model.points = model.points.map((pt) => {
            const before = pt.parent_refs || [];
            const afterRefs = before.filter((pr) => !(pr.kind === 'circle' && pr.id === circleId));
            if (afterRefs.length !== before.length) {
              const newKind = resolveConstructionKind(afterRefs);
              return {
                ...pt,
                parent_refs: afterRefs,
                defining_parents: afterRefs.map((p) => p.id),
                construction_kind: newKind
              };
            }
            return pt;
          });
        }
      }
      selectedCircleIndex = null;
      selectedLineIndex = null;
      selectedPointIndex = null;
      selectedPolygonIndex = null;
      changed = true;
    } else if (selectedPointIndex !== null) {
      // Also remove any coincident/dependent constructed points that lie exactly
      // under the selected point (e.g., multiple intersection points created at once).
      const baseIdx = selectedPointIndex;
      const basePt = model.points[baseIdx];
      const toRemove = new Set<number>([baseIdx]);
      if (basePt) {
        // If this point was created as part of a batch, remove all points from that batch.
        if (basePt.created_group) {
          for (let i = 0; i < model.points.length; i++) {
            const pt = model.points[i];
            if (!pt) continue;
            if (pt.created_group && pt.created_group === basePt.created_group) toRemove.add(i);
          }
        }
        const eps = 1e-6;
        for (let i = 0; i < model.points.length; i++) {
          if (i === baseIdx) continue;
          const pt = model.points[i];
          if (!pt) continue;
          const dist = Math.hypot(pt.x - basePt.x, pt.y - basePt.y);
          if (dist <= eps) {
            // Remove if the point explicitly depends on the base point
            const dependsOnBase = (pt.parent_refs || []).some((pr) => pr.kind === 'point' && pr.id === basePt.id);
            // Or if it's a constructed point (not 'free') and not used elsewhere
            const constructedAndUnused = pt.construction_kind !== 'free' && !pointUsedAnywhere(i);
            if (dependsOnBase || constructedAndUnused) toRemove.add(i);
          }
        }
      }
      removePointsAndRelated(Array.from(toRemove), true);
      selectedPointIndex = null;
      selectedCircleIndex = null;
      selectedPolygonIndex = null;
      changed = true;
    }
    
    // Wyłącz tryb kopiowania stylu po usunięciu obiektu
    if (changed && copyStyleActive) {
      copyStyleActive = false;
      copiedStyle = null;
    }
    
    updateSelectionButtons();
    if (changed) {
      rebuildIndexMaps();
      draw();
      pushHistory();
    }
  });
  showHiddenBtn?.addEventListener('click', () => {
    showHidden = !showHidden;
    try {
      window.localStorage?.setItem(SHOW_HIDDEN_STORAGE_KEY, showHidden ? 'true' : 'false');
    } catch {
      // ignore storage failures
    }
    updateOptionButtons();
    draw();
  });
  showMeasurementsBtn?.addEventListener('click', () => {
    // When disabling measurements, convert pinned labels to free labels
    if (showMeasurements) {
      const pinnedLabels = measurementLabels.filter(ml => ml.pinned);
      pinnedLabels.forEach(ml => {
        const text = getMeasurementLabelText(ml);
        if (text && text !== '—') {
          model.labels.push({
            text,
            pos: { x: ml.pos.x, y: ml.pos.y },
            color: ml.color ?? THEME.defaultStroke,
            fontSize: ml.fontSize
          });
        }
      });
      
      // Clear all measurement labels
      measurementLabels = [];
      closeMeasurementInputBox();
      
      showMeasurements = false;
      updateOptionButtons();
      draw();
      
      if (pinnedLabels.length > 0) {
        pushHistory();
      }
    } else {
      // Enabling measurements
      showMeasurements = true;
      generateMeasurementLabels();
      updateOptionButtons();
      draw();
    }
  });
  copyImageBtn?.addEventListener('click', async () => {
    try {
      const blob = await captureCanvasAsPng();
      const ClipboardItemCtor = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' || !ClipboardItemCtor) {
        throw new Error('Clipboard API niedostępne');
      }
      await navigator.clipboard.write([new ClipboardItemCtor({ 'image/png': blob })]);
      closeZoomMenu();
    } catch (err) {
      window.alert('Nie udało się skopiować obrazu do schowka. Sprawdź uprawnienia przeglądarki.');
    }
  });
  saveImageBtn?.addEventListener('click', async () => {
    try {
      const blob = await captureCanvasAsPng();
      const stamp = getTimestampString();
      const filename = `geometry-${stamp}.png`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      closeZoomMenu();
    } catch (err) {
      window.alert('Nie udało się przygotować pliku PNG.');
    }
  });
  
  // Show fullscreen help modal (in-app). Fetch help HTML and render inside an iframe via srcdoc
  // to avoid navigating to /help.html while keeping help styles sandboxed.
  async function showHelpModal() {
    const lang = typeof getLanguage === 'function' ? getLanguage() : (localStorage.getItem('geometry.lang') || 'pl');
    const helpPath = lang === 'en' ? '/help.en.html' : '/help.html';

    let modal = document.getElementById('helpModal') as HTMLElement | null;
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'helpModal';
      modal.className = 'modal help-modal';

      const headerTitle = lang === 'en' ? 'Help' : 'Pomoc';

      modal.innerHTML = `
        <div class="modal-content" style="width:100%; max-width:100%; height:100vh; max-height:100vh; border-radius:0;">
          <div class="modal-header" style="align-items:center;">
            <h2>${headerTitle}</h2>
            <div>
              <button class="help-close" aria-label="Close help">✕</button>
            </div>
          </div>
          <div class="modal-body help-body" style="padding:20px; overflow:auto;">
            <div class="help-content-inner"></div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const closeBtn = modal.querySelector('.help-close') as HTMLButtonElement | null;
      closeBtn?.addEventListener('click', () => {
        modal?.remove();
      });

      // close when clicking outside content
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal?.remove();
      });
    }

    const inner = modal.querySelector('.help-content-inner') as HTMLElement | null;
    if (!inner) return;

    try {
      const resp = await fetch(helpPath, { cache: 'no-store' });
      if (!resp.ok) throw new Error('fetch failed');
      const txt = await resp.text();
      // Parse fetched HTML and extract the main container content.
      const parser = new DOMParser();
      const doc = parser.parseFromString(txt, 'text/html');
      // Remove any stylesheet or style tags from help to allow app theme to apply
      doc.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => n.remove());
      const container = doc.querySelector('.container') || doc.body;
      // Make links open in a new tab for safety
      container.querySelectorAll('a').forEach((a) => {
        try {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener');
        } catch {}
      });
      // Replace visible GitHub textual link with a GitHub icon (keep href)
      try {
        const ghLinks = Array.from(container.querySelectorAll('a')).filter((a) => {
          try {
            return typeof a.href === 'string' && a.href.includes('github.com');
          } catch {
            return false;
          }
        });
        ghLinks.forEach((a) => {
          try {
            const href = a.getAttribute('href') || a.href;
            a.innerHTML = `
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 .5C5.73.5.75 5.48.75 11.78c0 4.94 3.2 9.12 7.64 10.59.56.1.76-.24.76-.53 0-.26-.01-1.12-.02-2.03-3.11.67-3.77-1.5-3.77-1.5-.51-1.29-1.24-1.63-1.24-1.63-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15.99 1.7 2.6 1.21 3.24.93.1-.73.39-1.21.71-1.49-2.48-.28-5.09-1.24-5.09-5.49 0-1.21.43-2.2 1.13-2.98-.11-.28-.49-1.42.11-2.97 0 0 .92-.29 3.01 1.14a10.5 10.5 0 0 1 2.74-.37c.93.01 1.87.13 2.74.37 2.09-1.43 3.01-1.14 3.01-1.14.6 1.55.22 2.69.11 2.97.7.78 1.13 1.77 1.13 2.98 0 4.26-2.62 5.2-5.11 5.48.4.35.76 1.05.76 2.12 0 1.53-.01 2.76-.01 3.14 0 .29.2.64.77.53 4.43-1.47 7.63-5.65 7.63-10.59C23.25 5.48 18.27.5 12 .5z" fill="currentColor"/>
              </svg>`;
            a.setAttribute('aria-label', 'GitHub');
            a.setAttribute('title', 'Repozytorium na GitHub');
            a.style.display = 'inline-flex';
            a.style.alignItems = 'center';
            a.style.gap = '8px';
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener');
            if (href) a.setAttribute('href', href);
          } catch {}
        });
      } catch {}
      inner.innerHTML = container.innerHTML;
      // inject a small scoped stylesheet to give the help content more "breath"
      try {
        const helpStyle = document.createElement('style');
        helpStyle.textContent = `
          .help-content-inner > * { margin-bottom: 18px; }
          .help-content-inner details { margin-bottom: 12px; padding: 10px 12px; border-radius: 8px; background: rgba(255,255,255,0.02); }
          .help-content-inner summary { cursor: pointer; font-weight:600; }
          .help-content-inner h1, .help-content-inner h2, .help-content-inner h3 { margin-top: 0; margin-bottom: 8px; }
          /* space between a section title (summary/h*) and its content */
          .help-content-inner details > :not(summary),
          .help-content-inner h2 + *,
          .help-content-inner h3 + * { margin-top: 8px; }
          .help-content-inner .tool-row{ margin-bottom:12px; }
          /* Keep link color consistent across states so clicking doesn't change color */
          .help-content-inner a { color: var(--accent) !important; }
          .help-content-inner a:visited, .help-content-inner a:active, .help-content-inner a:hover { color: var(--accent) !important; }
          .help-content-inner .help-hint { color: var(--muted); margin-top:6px; font-size:13px; }
          /* Ensure lists are indented when help content is injected into the app modal */
          .help-content-inner ul { margin: 8px 0 12px 0; padding-left: 28px; list-style-position: outside; }
          .help-content-inner ul ul { padding-left: 20px; margin-top: 6px; }
          .help-content-inner ul li { margin: 6px 0; }
          /* Ensure inline help buttons (copied from help.html) stay one row and are square */
          .help-content-inner .help-inline-buttons { display: inline-flex !important; gap: 6px !important; align-items: center !important; flex-wrap: nowrap !important; white-space: nowrap !important; }
          .help-content-inner .help-inline-buttons .config-tool-btn { min-height: 17px !important; height: 17px !important; width: 17px !important; min-width: 17px !important; max-width: 17px !important; flex: 0 0 17px !important; padding: 3px !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; box-sizing: border-box !important; }
          .help-content-inner .help-inline-buttons .icon { width: 11px !important; height: 11px !important; pointer-events: none !important; }
        `;
        inner.prepend(helpStyle);
      } catch {}
      // Fold all <details> so sections are closed by default
      try {
        inner.querySelectorAll('details').forEach((d) => {
          try {
            // remove the 'open' attribute and set property to false
            d.removeAttribute('open');
            // @ts-ignore
            d.open = false;
          } catch {}
        });
      } catch {}
      // Augment tool/menu rows with contextual hints from the HINTS data
      try {
        // language-aware mappings for common labels present in help.html
        const mappingsPl: Record<string, { group: 'tools' | 'menu'; key: string }> = {
          'Punkt': { group: 'tools', key: 'point' },
          'Odcinek': { group: 'tools', key: 'segment' },
          'Równoległa': { group: 'tools', key: 'parallel' },
          'Prostopadła': { group: 'tools', key: 'perpendicular' },
          'Okrąg': { group: 'tools', key: 'circle' },
          'Trójkąt': { group: 'tools', key: 'triangle' },
          'Kwadrat': { group: 'tools', key: 'square' },
          'Wielokąt': { group: 'tools', key: 'polygon' },
          'Kąt': { group: 'tools', key: 'angle' },
          'Dwusieczna': { group: 'tools', key: 'bisector' },
          'Punkt środkowy': { group: 'tools', key: 'midpoint' },
          'Symetria': { group: 'tools', key: 'symmetric' },
          'Styczna': { group: 'tools', key: 'tangent' },
          'Symetralna': { group: 'tools', key: 'perpBisector' },
          // menu icons
          'Wyczyść wszystko': { group: 'menu', key: 'clearAll' },
          'Pokaż ukryte': { group: 'menu', key: 'showHidden' },
          'Pokaż wymiary': { group: 'menu', key: 'showMeasurements' },
          'Kopiuj obraz': { group: 'menu', key: 'copyImage' },
          'Zapisz PNG': { group: 'menu', key: 'saveImage' },
          'Odwróć kolory': { group: 'menu', key: 'invertColors' },
          'Lista obiektów': { group: 'menu', key: 'debug' },
          'Konfiguracja': { group: 'menu', key: 'settings' },
          'Pomoc': { group: 'menu', key: 'help' }
        };
        const mappingsEn: Record<string, { group: 'tools' | 'menu'; key: string }> = {
          'Point': { group: 'tools', key: 'point' },
          'Segment': { group: 'tools', key: 'segment' },
          'Parallel': { group: 'tools', key: 'parallel' },
          'Perpendicular': { group: 'tools', key: 'perpendicular' },
          'Circle': { group: 'tools', key: 'circle' },
          'Triangle': { group: 'tools', key: 'triangle' },
          'Square': { group: 'tools', key: 'square' },
          'Polygon': { group: 'tools', key: 'polygon' },
          'Angle': { group: 'tools', key: 'angle' },
          'Bisector': { group: 'tools', key: 'bisector' },
          'Midpoint': { group: 'tools', key: 'midpoint' },
          'Symmetry': { group: 'tools', key: 'symmetric' },
          'Tangent': { group: 'tools', key: 'tangent' },
          'Perp bisector': { group: 'tools', key: 'perpBisector' },
          // menu icons
          'Clear': { group: 'menu', key: 'clearAll' },
          'Show hidden': { group: 'menu', key: 'showHidden' },
          'Show measurements': { group: 'menu', key: 'showMeasurements' },
          'Copy image': { group: 'menu', key: 'copyImage' },
          'Save PNG': { group: 'menu', key: 'saveImage' },
          'Invert colors': { group: 'menu', key: 'invertColors' },
          'Debug': { group: 'menu', key: 'debug' },
          'Settings': { group: 'menu', key: 'settings' },
          'Help': { group: 'menu', key: 'help' }
        };

        const map = (lang === 'en') ? mappingsEn : mappingsPl;

        inner.querySelectorAll('.tool-row').forEach((row) => {
          try {
            const b = row.querySelector('b');
            if (!b) return;
            const title = (b.textContent || '').trim();
            if (!title) return;
            for (const label in map) {
              if (!Object.prototype.hasOwnProperty.call(map, label)) continue;
              if (title.startsWith(label) || title.indexOf(label) !== -1) {
                const entry = map[label];
                const hintText = (HINTS as any)[entry.group]?.[entry.key];
                if (hintText) {
                  if (!row.querySelector('.help-hint')) {
                    const hintEl = document.createElement('div');
                    hintEl.className = 'help-hint';
                    hintEl.textContent = hintText;
                    row.appendChild(hintEl);
                  }
                }
                break;
              }
            }
          } catch {}
        });
      } catch {}
      // hide any visible hint bar so it doesn't overlay the help content
      try { clearHint(); } catch {}
      // ensure modal is visible
      modal.style.display = 'flex';
    } catch (err) {
      // fallback: open help in new window if fetch fails
      try {
        window.open(helpPath, 'constrivia-help', 'noopener');
      } catch {
        window.location.href = helpPath;
      }
    }
  }
  helpBtn?.addEventListener('click', () => {
    try {
      showHelpModal();
      closeZoomMenu();
    } catch (err) {
      const lang = localStorage.getItem('geometry.lang') || 'pl';
      window.location.href = lang === 'en' ? '/help.en.html' : '/help.html';
    }
  });
  exportJsonBtn?.addEventListener('click', () => {
    try {
      const snapshot = serializeCurrentDocument();
      const defaultName = lastLoadedConstructionName || `constr-${getTimestampString()}`;
      initCloudSaveUI(snapshot, defaultName, '.ctr');
      closeZoomMenu();
    } catch (err) {
      window.alert('Nie udało się przygotować pliku.');
    }
  });
  invertColorsBtn?.addEventListener('click', () => {
    invertConstructionColors();
  });
  cloudFilesBtn?.addEventListener('click', () => {
    initCloudUI((data) => {
      try {
        const normalized = normalizeLoadedResult(data);
        setCtrBundle(undefined);
        applyPersistedDocument(normalized.data);
        setCtrBundle(normalized.bundle);
        closeZoomMenu();
        updateSelectionButtons();
      } catch (err) {
        window.alert('Nie udało się wczytać pliku z chmury. Sprawdź poprawność danych.');
      }
    }, { fileExtension: '.ctr', allowedExtensions: ['.ctr'] });
  });
  bundlePrevBtn?.addEventListener('click', () => navigateCtrBundle(-1));
  bundleNextBtn?.addEventListener('click', () => navigateCtrBundle(1));
  clearAllBtn?.addEventListener('click', () => {
    model = createEmptyModel();
    resetLabelState();
    selectedLineIndex = null;
    selectedPointIndex = null;
    selectedCircleIndex = null;
    selectedAngleIndex = null;
    selectedPolygonIndex = null;
    selectedInkStrokeIndex = null;
    selectedLabel = null;
    selectedSegments.clear();
    selectedArcSegments.clear();
    segmentStartIndex = null;
    panOffset = { x: 0, y: 0 };
    zoomFactor = 1;
    currentCtrBundle = null;
    updateArchiveNavButtons();
    closeStyleMenu();
    closeZoomMenu();
    closeViewMenu();
  closeRayMenu();
  styleMenuSuppressed = false;
  updateSelectionButtons();
  draw();
  lastLoadedConstructionName = null;
  pushHistory();
});
  undoBtn?.addEventListener('click', undo);
  redoBtn?.addEventListener('click', redo);
  zoomMenuBtn?.addEventListener('click', toggleZoomMenu);
  styleMenuBtn?.addEventListener('click', toggleStyleMenu);
  labelToolsOverflowBtn?.addEventListener('click', toggleLabelToolsOverflowMenu);
  styleColorInput?.addEventListener('input', () => {
    if (!styleColorInput) return;
    rememberColor(styleColorInput.value);
    applyStyleFromInputs();
    updateStyleMenuValues();
  });
  styleWidthInput?.addEventListener('input', () => {
    applyStyleFromInputs();
    updateLineWidthControls();
  });
  styleTypeSelect?.addEventListener('change', applyStyleFromInputs);
  highlighterAlphaInput?.addEventListener('input', () => {
    if (!highlighterAlphaInput) return;
    const v = Number(highlighterAlphaInput.value) || 0;
    highlighterAlpha = clamp(v, 0.02, 1);
    if (highlighterAlphaValueDisplay) highlighterAlphaValueDisplay.textContent = `${Math.round(highlighterAlpha * 100)}%`;
    if (highlighterBtn) highlighterBtn.title = `Podświetlacz (${Math.round(highlighterAlpha * 100)}%)`;
    // If a stroke is selected, update its opacity
    if (selectedInkStrokeIndex !== null) {
      const s = model.inkStrokes[selectedInkStrokeIndex];
      if (s) {
        model.inkStrokes[selectedInkStrokeIndex] = { ...s, opacity: highlighterActive ? highlighterAlpha : s.opacity };
        draw();
        pushHistory();
      }
    }
  });
  styleTickButton?.addEventListener('click', () => {
    cycleTickState();
  });
  labelTextInput?.addEventListener('input', () => {
    if (!labelTextInput) return;
    if (!selectedLabel) return;
    const text = labelTextInput.value;
    let changed = false;
    switch (selectedLabel.kind) {
      case 'point':
        if (model.points[selectedLabel.id]?.label) {
          model.points[selectedLabel.id].label = { ...model.points[selectedLabel.id].label!, text };
          changed = true;
        }
        break;
      case 'line':
        if (model.lines[selectedLabel.id]?.label) {
          model.lines[selectedLabel.id].label = { ...model.lines[selectedLabel.id].label!, text };
          changed = true;
        }
        break;
      case 'angle':
        if (model.angles[selectedLabel.id]?.label) {
          model.angles[selectedLabel.id].label = { ...model.angles[selectedLabel.id].label!, text };
          changed = true;
        }
        break;
      case 'free':
        if (model.labels[selectedLabel.id]) {
          model.labels[selectedLabel.id] = { ...model.labels[selectedLabel.id], text };
          changed = true;
        }
        break;
    }
    if (changed) {
      draw();
      pushHistory();
    }
  });
  labelAlignToggleBtn?.addEventListener('click', () => {
    if (!selectedLabel) return;
    const current = selectedLabelAlignment() ?? DEFAULT_LABEL_ALIGNMENT;
    const next = current === 'left' ? 'center' : 'left';
    applySelectedLabelAlignment(next);
    updateLabelAlignControl();
  });
  labelGreekButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!labelTextInput) return;
      const symbol = btn.dataset.letter ?? btn.textContent ?? '';
      if (!symbol) return;
      insertLabelSymbol(symbol);
    });
  });
  if (labelScriptBtn) {
    labelScriptBtn.addEventListener('click', () => {
      if (selectedLabel === null) return;
      labelScriptVisible = !labelScriptVisible;
      // ensure greek panel is visible when switching to script
      if (labelScriptVisible) labelGreekVisible = true;
      refreshLabelKeyboard(true);
    });
  }
  labelGreekToggleBtn?.addEventListener('click', () => {
    if (selectedLabel === null) return;
    labelGreekVisible = !labelGreekVisible;
    refreshLabelKeyboard(true);
  });
  labelGreekShiftBtn?.addEventListener('click', () => {
    if (selectedLabel === null) return;
    labelGreekUppercase = !labelGreekUppercase;
    refreshLabelKeyboard(true);
  });
  if (labelFontDecreaseBtn) attachHoldHandler(labelFontDecreaseBtn, () => adjustSelectedLabelFont(-LABEL_FONT_STEP));
  if (labelFontIncreaseBtn) attachHoldHandler(labelFontIncreaseBtn, () => adjustSelectedLabelFont(LABEL_FONT_STEP));
  document.addEventListener('click', (e) => {
    if (zoomMenuOpen && !zoomMenuContainer?.contains(e.target as Node)) {
      closeZoomMenu();
    }
    if (viewModeOpen && !viewModeMenuContainer?.contains(e.target as Node)) {
      closeViewMenu();
    }
    if (rayModeOpen && !rayModeMenuContainer?.contains(e.target as Node)) {
      closeRayMenu();
    }
    if (labelToolsOverflowOpen && !labelToolsOverflowContainer?.contains(e.target as Node)) {
      closeLabelToolsOverflowMenu();
    }
  });
  updateToolButtons();
  updateSelectionButtons();
  updateOptionButtons();
  updateColorButtons();
  pushHistory();
  
  // Appearance tab initialization
  initAppearanceTab();
  
  // Apply button configuration after DOM is ready
  applyButtonConfiguration();
}

function tryApplyLabelToSelection() {
  if (mode !== 'label') return;
  const anySelection =
    selectedLineIndex !== null ||
    selectedPolygonIndex !== null ||
    selectedPointIndex !== null ||
    selectedAngleIndex !== null;
  if (!anySelection) return;
  // simulate a label application without user click by reusing current mode logic on selection
  const color = styleColorInput?.value || '#000';
  let changed = false;
  if (selectedAngleIndex !== null && !model.angles[selectedAngleIndex].label) {
    const { text, seq } = nextGreek();
    model.angles[selectedAngleIndex].label = {
      text,
      color,
      offset: defaultAngleLabelOffset(selectedAngleIndex),
      fontSize: 0,
      seq
    };
    changed = true;
  } else if (selectedPolygonIndex !== null) {
    const verts = polygonVerticesOrdered(selectedPolygonIndex).filter((vi) => !model.points[vi]?.label);
    verts.forEach((vi) => {
      const { text, seq } = nextUpper();
      model.points[vi].label = {
        text,
        color,
        offset: defaultPointLabelOffset(vi),
        fontSize: 0,
        seq
      };
    });
    if (verts.length) {
      changed = true;
    }
  } else if (selectedLineIndex !== null) {
    // Jeśli zaznaczone są wierzchołki, etykietuj je
    if (selectionVertices) {
      const line = model.lines[selectedLineIndex];
      if (line) {
        const verts = line.points.filter((vi) => !model.points[vi]?.label);
        verts.forEach((vi) => {
          const { text, seq } = nextUpper();
          model.points[vi].label = {
            text,
            color,
            offset: defaultPointLabelOffset(vi),
            fontSize: 0,
            seq
          };
        });
        if (verts.length) {
          changed = true;
        }
      }
    }
    // Jeśli zaznaczone są krawędzie (lub oba), etykietuj linię
    if (selectionEdges && !model.lines[selectedLineIndex].label) {
      const { text, seq } = nextLower();
      model.lines[selectedLineIndex].label = {
        text,
        color,
        offset: defaultLineLabelOffset(selectedLineIndex),
        fontSize: 0,
        seq
      };
      changed = true;
    }
  } else if (selectedPointIndex !== null && !model.points[selectedPointIndex].label) {
    const { text, seq } = nextUpper();
    model.points[selectedPointIndex].label = {
      text,
      color,
      offset: defaultPointLabelOffset(selectedPointIndex),
      fontSize: 0,
      seq
    };
    changed = true;
  }
  if (changed) {
    draw();
    pushHistory();
  }
  if (changed || anySelection) {
    // leave select mode after applying/attempting
    if (stickyTool === null) setMode('move');
    updateToolButtons();
    updateSelectionButtons();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initRuntime);
}

// helpers
function findPoint(p: { x: number; y: number }): number | null {
  const tol = currentHitRadius();
  for (let i = model.points.length - 1; i >= 0; i--) {
    const pt = model.points[i];
    if (pt.style.hidden && !showHidden) continue;
    const dx = pt.x - p.x;
    const dy = pt.y - p.y;
    if (Math.hypot(dx, dy) <= tol) return i;
  }
  return null;
}

function findPointWithRadius(p: { x: number; y: number }, radius: number): number | null {
  for (let i = model.points.length - 1; i >= 0; i--) {
    const pt = model.points[i];
    if (pt.style.hidden && !showHidden) continue;
    if (Math.hypot(pt.x - p.x, pt.y - p.y) <= radius) return i;
  }
  return null;
}

function findLinesContainingPoint(idx: number): number[] {
  const res: number[] = [];
  for (let i = 0; i < model.lines.length; i++) {
    if (model.lines[i].points.includes(idx)) res.push(i);
  }
  return res;
}

function normalize(v: { x: number; y: number }) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

function snapDir(start: { x: number; y: number }, target: { x: number; y: number }) {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const dist = Math.hypot(dx, dy) || 1;
  const candidates = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: Math.SQRT1_2, y: Math.SQRT1_2 },
    { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
    { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
    { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }
  ];
  const dir = { x: dx / dist, y: dy / dist };
  let best = candidates[0];
  let bestDot = -Infinity;
  for (const c of candidates) {
    const dot = c.x * dir.x + c.y * dir.y;
    if (dot > bestDot) {
      bestDot = dot;
      best = c;
    }
  }
  return { x: start.x + best.x * dist, y: start.y + best.y * dist };
}

function captureLineContext(pointIdx: number): { lineIdx: number; fractions: number[] } | null {
  const lineIdx = findLinesContainingPoint(pointIdx)[0];
  if (lineIdx === undefined) return null;
  const line = model.lines[lineIdx];
  if (line.points.length < 2) return null;
  // Use defining points if available, otherwise fall back to first/last (e.g. for free lines without defining points?)
  // Actually all lines should have defining points or be defined by 2 points.
  const def0 = line.defining_points?.[0] ?? line.points[0];
  const def1 = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  const origin = model.points[def0];
  const end = model.points[def1];
  if (!origin || !end) return null;
  const dir = normalize({ x: end.x - origin.x, y: end.y - origin.y });
  const len = Math.hypot(end.x - origin.x, end.y - origin.y);
  if (len === 0) return null;
  const fractions = line.points.map((idx) => {
    const p = model.points[idx];
    if (!p) return 0;
    const t = ((p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y) / len;
    return t;
  });
  return { lineIdx, fractions };
}

function calculateLineFractions(lineIdx: number): number[] {
  const line = model.lines[lineIdx];
  if (!line || line.points.length < 2) return [];
  const def0 = line.defining_points?.[0] ?? line.points[0];
  const def1 = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  const origin = model.points[def0];
  const end = model.points[def1];
  if (!origin || !end) return [];
  const dir = normalize({ x: end.x - origin.x, y: end.y - origin.y });
  const len = Math.hypot(end.x - origin.x, end.y - origin.y);
  if (len === 0) return [];
  
  return line.points.map((idx) => {
    const p = model.points[idx];
    if (!p) return 0;
    return ((p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y) / len;
  });
}

function applyFractionsToLine(lineIdx: number, fractions: number[]) {
  const line = model.lines[lineIdx];
  if (!line || line.points.length < 2) return;
  const def0 = line.defining_points?.[0] ?? line.points[0];
  const def1 = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  const origin = model.points[def0];
  const end = model.points[def1];
  if (!origin || !end) return;
  const dir = normalize({ x: end.x - origin.x, y: end.y - origin.y });
  const len = Math.hypot(end.x - origin.x, end.y - origin.y);
  if (len === 0) return;
  
  const changed = new Set<number>();
  fractions.forEach((t, idx) => {
    if (idx >= line.points.length) return;
    const pIdx = line.points[idx];
    
    // Don't reposition defining_points - they define the line!
    if (line.defining_points.includes(pIdx)) return;
    
    const pos = { x: origin.x + dir.x * t * len, y: origin.y + dir.y * t * len };
    model.points[pIdx] = { ...model.points[pIdx], ...pos };
    changed.add(pIdx);
  });
  enforceIntersections(lineIdx);
  changed.forEach((idx) => {
    updateMidpointsForPoint(idx);
    updateCirclesForPoint(idx);
  });
}

function applyLineFractions(lineIdx: number) {
  // prefer runtime implementation when available
  try {
    const rt = runtime;
    const lid = model.lines[lineIdx]?.id;
    if (lid) {
      const out = lineExtentRuntime(lid, rt);
      if (out) return out;
    }
  } catch {}
  const line = model.lines[lineIdx];
  if (!line) return null;
  const updates = recomputeLinePointsWithReferences(model.points, line, (idx, p) =>
    (p?.parent_refs ?? []).some((ref: any) => ref.kind === 'line' && ref.id === line.id)
  );
  if (updates && updates.length) {
    const changed = new Set<number>();
    updates.forEach(({ idx, pos }) => {
      const cur = model.points[idx];
      if (!cur) return;
      model.points[idx] = { ...cur, ...pos };
      changed.add(idx);
    });
    enforceIntersections(lineIdx);
    changed.forEach((idx) => {
      updateMidpointsForPoint(idx);
      updateCirclesForPoint(idx);
    });
  }
  const a = model.points[line.points[0]];
  const b = model.points[line.points[line.points.length - 1 ? line.points.length - 1 : 0]];
  if (!a || !b) return null;
  const dirVec = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(dirVec.x, dirVec.y) || 1;
  const dir = { x: dirVec.x / len, y: dirVec.y / len };
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const half = Math.hypot(b.x - center.x, b.y - center.y);
  return { center, dir, startPoint: a, endPoint: b, order: [], half };
}

type LineHit =
  | { line: number; part: 'segment'; seg: number }
  | { line: number; part: 'rayLeft' }
  | { line: number; part: 'rayRight' };
type CircleHit = { circle: number };

function findLineHits(p: { x: number; y: number }): LineHit[] {
  const hits: LineHit[] = [];
  const tol = currentHitRadius();
  for (let i = model.lines.length - 1; i >= 0; i--) {
    const line = model.lines[i];
    if (line.hidden && !showHidden) continue;
    if (line.points.length >= 2) {
      for (let s = 0; s < line.points.length - 1; s++) {
        const a = model.points[line.points[s]];
        const b = model.points[line.points[s + 1]];
        const style = line.segmentStyles?.[s] ?? line.style;
        if (!a || !b) continue;
        if (style.hidden && !showHidden) continue;
        // Removed check for hidden endpoints
        if (pointToSegmentDistance(p, a, b) <= tol) {
          hits.push({ line: i, part: 'segment', seg: s });
          break;
        }
      }
      const a = model.points[line.points[0]];
      const b = model.points[line.points[line.points.length - 1]];
      if (a && b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const dir = { x: dx / len, y: dy / len };
        const extend = (canvas!.width + canvas!.height) / (dpr * zoomFactor);
        if (line.leftRay && !(line.leftRay.hidden && !showHidden)) {
          const rayEnd = { x: a.x - dir.x * extend, y: a.y - dir.y * extend };
          if (pointToSegmentDistance(p, a, rayEnd) <= tol) hits.push({ line: i, part: 'rayLeft' });
        }
        if (line.rightRay && !(line.rightRay.hidden && !showHidden)) {
          const rayEnd = { x: b.x + dir.x * extend, y: b.y + dir.y * extend };
          if (pointToSegmentDistance(p, b, rayEnd) <= tol) hits.push({ line: i, part: 'rayRight' });
        }
      }
    }
  }
  return hits;
}

function findLine(p: { x: number; y: number }): LineHit | null {
  const hits = findLineHits(p);
  return hits.length ? hits[0] : null;
}

function findLineHitForPos(lineIdx: number, pos: { x: number; y: number }): LineHit | null {
  const line = model.lines[lineIdx];
  if (!line || line.points.length < 2) return null;
  let best: { seg: number; dist: number } | null = null;
  for (let s = 0; s < line.points.length - 1; s++) {
    const a = model.points[line.points[s]];
    const b = model.points[line.points[s + 1]];
    if (!a || !b) continue;
    const d = pointToSegmentDistance(pos, a, b);
    if (best === null || d < best.dist) best = { seg: s, dist: d };
  }
  if (!best) return null;
  return { line: lineIdx, part: 'segment', seg: best.seg };
}

function normalizeAngle(a: number) {
  let ang = a;
  while (ang < 0) ang += Math.PI * 2;
  while (ang >= Math.PI * 2) ang -= Math.PI * 2;
  return ang;
}

type DerivedArc = {
  circle: number;
  start: number;
  end: number;
  clockwise: boolean;
  center: { x: number; y: number };
  radius: number;
  style: StrokeStyle;
  hidden?: boolean;
  startIdx: number;
  endIdx: number;
  key: string;
};


function arcKey(circleIdx: number, startPointIdx: number, endPointIdx: number) {
  return `${circleIdx}:${startPointIdx}:${endPointIdx}`;
}

function arcKeyByIndex(circleIdx: number, arcIdx: number) {
  const arcs = circleArcs(circleIdx);
  const arc = arcs[arcIdx];
  if (!arc) return `${circleIdx}:${arcIdx}:0`;
  return arc.key;
}

function parseArcKey(key: string): { circle: number; arcIdx: number; start?: number; end?: number } | null {
  const parts = key.split(':').map((v) => Number(v));
  if (parts.length < 3) return null;
  const [c, s, e] = parts;
  if (!Number.isFinite(c) || !Number.isFinite(s) || !Number.isFinite(e)) return null;
  const arcs = circleArcs(c);
  const arcIdx = arcs.findIndex((a) => a.startIdx === s && a.endIdx === e);
  return { circle: c, arcIdx: arcIdx >= 0 ? arcIdx : -1, start: s, end: e };
}

function ensureArcStyles(circleIdx: number, count: number) {
  const circle = model.circles[circleIdx];
  if (!circle.arcStyles || Array.isArray(circle.arcStyles) || Object.keys(circle.arcStyles).length !== count) {
    // migrate to map keyed by start:end point indices
    const map: Record<string, StrokeStyle> = {};
    const perim = circlePerimeterPoints(circle).slice(0, count);
    for (let i = 0; i < count; i++) {
      const a = perim[i];
      const b = perim[(i + 1) % perim.length];
      const key = arcKey(circleIdx, a, b);
      map[key] = { ...circle.style };
    }
    circle.arcStyles = map as any;
  }
}

function circleArcs(circleIdx: number): DerivedArc[] {
  const circle = model.circles[circleIdx];
  if (!circle) return [];
  const center = model.points[circle.center];
  if (!center) return [];
  const radius = circleRadius(circle);
  if (radius <= 1e-3) return [];
  const pts = circlePerimeterPoints(circle)
    .map((pi) => {
      const p = model.points[pi];
      if (!p) return null;
      const ang = Math.atan2(p.y - center.y, p.x - center.x);
      return { idx: pi, ang };
    })
    .filter((v): v is { idx: number; ang: number } => v !== null)
    .sort((a, b) => a.ang - b.ang);
  if (pts.length < 2) return [];
  ensureArcStyles(circleIdx, pts.length);
  const arcs: DerivedArc[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const start = a.ang;
    const end = b.ang;
    const clockwise = false;
    const startIdx = a.idx;
    const endIdx = b.idx;
    const key = arcKey(circleIdx, startIdx, endIdx);
    const style: StrokeStyle = (circle.arcStyles && (circle.arcStyles as any)[key]) ?? circle.style;
    arcs.push({
      circle: circleIdx,
      start,
      end,
      clockwise,
      center,
      radius,
      style,
      hidden: style.hidden || circle.style.hidden,
      startIdx,
      endIdx,
      key
    });
  }
  return arcs;
}

function angleOnArc(test: number, start: number, end: number, clockwise: boolean) {
  const t = normalizeAngle(test);
  const s = normalizeAngle(start);
  const e = normalizeAngle(end);
  if (!clockwise) {
    const span = (e - s + Math.PI * 2) % (Math.PI * 2);
    const pos = (t - s + Math.PI * 2) % (Math.PI * 2);
    return pos <= span + 1e-6;
  }
  const span = (s - e + Math.PI * 2) % (Math.PI * 2);
  const pos = (s - t + Math.PI * 2) % (Math.PI * 2);
  return pos <= span + 1e-6;
}

function findArcAt(
  p: { x: number; y: number },
  tolerance = currentHitRadius(),
  onlyCircle?: number
): { circle: number; arcIdx: number; key?: string } | null {
  for (let ci = model.circles.length - 1; ci >= 0; ci--) {
    if (onlyCircle !== undefined && ci !== onlyCircle) continue;
    if (model.circles[ci].hidden && !showHidden) continue;
    const arcs = circleArcs(ci);
    for (let ai = arcs.length - 1; ai >= 0; ai--) {
      const arc = arcs[ai];
      // Respect arc hidden flag: skip hidden arcs unless we're showing hidden objects
      if (arc.hidden && !showHidden) continue;
      const center = arc.center;
      const dist = Math.hypot(p.x - center.x, p.y - center.y);
      if (Math.abs(dist - arc.radius) > tolerance) continue;
      const ang = Math.atan2(p.y - center.y, p.x - center.x);
      if (angleOnArc(ang, arc.start, arc.end, arc.clockwise)) return { circle: ci, arcIdx: ai, key: arc.key };
    }
  }
  return null;
}

function angleBaseGeometry(ang: Angle) {
  const rt = runtime;
  const angAny = ang as any;
  // Normalize mixed-model/runtime angle objects: if runtime is present but
  // `ang` contains numeric vertex/index references (legacy model form) while
  // some line references are ids (runtime form), convert numeric refs to ids
  // so `angleBaseGeometryRuntime` can resolve correctly.
  let res: any = null;
  if (rt) {
    const angForRt: any = { ...ang };
    try {
      if (typeof ang.vertex === 'number') angForRt.vertex = model.points[ang.vertex]?.id ?? ang.vertex;
      if (typeof ang.point1 === 'number') angForRt.point1 = model.points[ang.point1]?.id ?? angForRt.point1;
      if (typeof ang.point2 === 'number') angForRt.point2 = model.points[ang.point2]?.id ?? angForRt.point2;
      if (angAny?.leg1 && typeof angAny.leg1.line === 'number') angForRt.arm1LineId = model.lines[angAny.leg1.line]?.id ?? angForRt.arm1LineId;
      if (angAny?.leg2 && typeof angAny.leg2.line === 'number') angForRt.arm2LineId = model.lines[angAny.leg2.line]?.id ?? angForRt.arm2LineId;
    } catch {}
    res = angleBaseGeometryRuntime(angForRt as any, rt) ?? null;
  }
  if (!res) res = angleBaseGeometryPure(ang as any, model.points, model.lines);
  if (!res) {
    // diagnostic: provide more context when geometry lookup fails
    try {
      // eslint-disable-next-line no-console
      console.warn(`angleBaseGeometry: failed for angle id=${ang.id ?? 'no-id'}`, {
        runtimePresent: !!rt,
        leg1: (ang as any)?.arm1LineId ?? (ang as any)?.leg1?.line,
        leg2: (ang as any)?.arm2LineId ?? (ang as any)?.leg2?.line,
        vertex: ang?.vertex,
        ang
      });
    } catch {}
    return null;
  }
  const { v, p1, p2, ang1, ang2 } = res as any;
  let ccw = (ang2 - ang1 + Math.PI * 2) % (Math.PI * 2);
  let start = ang1;
  let end = ang2;
  if (ccw > Math.PI) {
    start = ang2;
    end = ang1;
    ccw = (end - start + Math.PI * 2) % (Math.PI * 2);
  }
  const clockwise = false;
  const legLen1 = Math.hypot(p1.x - v.x, p1.y - v.y);
  const legLen2 = Math.hypot(p2.x - v.x, p2.y - v.y);
  const legLimit = Math.max(4, Math.min(legLen1, legLen2) - ANGLE_RADIUS_MARGIN);
  const maxRadius = Math.max(500, legLimit);
  const minRadius = ANGLE_MIN_RADIUS;
  let radius = Math.min(ANGLE_DEFAULT_RADIUS, maxRadius);
  radius = clamp(radius, minRadius, maxRadius);
  return { v, p1, p2, start, end, span: ccw, clockwise, radius, minRadius, maxRadius };
}

function angleGeometry(ang: Angle) {
  const base = angleBaseGeometry(ang);
  if (!base) return null;
  const offset = ang.style.arcRadiusOffset ?? 0;
  const rawRadius = base.radius + offset;
  const radius = clamp(rawRadius, base.minRadius, base.maxRadius);
  
  // Handle exterior angles by inverting the direction (draws the reflex angle > 180°)
  const isExterior = !!ang.style.exterior;
  const clockwise = isExterior ? !base.clockwise : base.clockwise;
  
  return { ...base, start: base.start, end: base.end, clockwise, radius, style: ang.style };
}

function defaultAngleRadius(ang: Angle): number | null {
  const base = angleBaseGeometry(ang);
  return base ? base.radius : null;
}

function adjustSelectedAngleRadius(direction: 1 | -1) {
  if (selectedAngleIndex === null) return;
  const ang = model.angles[selectedAngleIndex];
  const base = angleBaseGeometry(ang);
  if (!base) return;
  const currentOffset = ang.style.arcRadiusOffset ?? 0;
  const desiredRadius = clamp(base.radius + currentOffset + direction * ANGLE_RADIUS_STEP, base.minRadius, base.maxRadius);
  const nextOffset = desiredRadius - base.radius;
  if (Math.abs(nextOffset - currentOffset) < 1e-6) {
    updateStyleMenuValues();
    return;
  }
  model.angles[selectedAngleIndex] = { ...ang, style: { ...ang.style, arcRadiusOffset: nextOffset } };
  draw();
  pushHistory();
  updateStyleMenuValues();
}

function findAngleAt(p: { x: number; y: number }, tolerance = currentHitRadius()): number | null {
  for (let i = model.angles.length - 1; i >= 0; i--) {
    const geom = angleGeometry(model.angles[i]);
    if (!geom) continue;
    const { v, start, end, clockwise, radius } = geom;
    const dist = Math.abs(Math.hypot(p.x - v.x, p.y - v.y) - radius);
    if (dist > tolerance) continue;
    const ang = Math.atan2(p.y - v.y, p.x - v.x);
    if (angleOnArc(ang, start, end, clockwise)) return i;
  }
  return null;
}

function pointInLine(idx: number, line: Line): boolean {
  return line.points.includes(idx);
}

function pointToSegmentDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const l2 = Math.max(1, (b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
  const proj = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}

function circlesContainingPoint(idx: number): number[] {
  const res = new Set<number>();
  model.circles.forEach((c, ci) => {
    // Only include points that are actually on the circle (constrained to it)
    // NOT the radius_point which just defines the circle size
    if (c.points.includes(idx) && !circleHasDefiningPoint(c, idx)) res.add(ci);
  });
  return Array.from(res);
}

function circlesReferencingPoint(idx: number): number[] {
  const res = new Set<number>();
  model.circles.forEach((c, ci) => {
    if (c.center === idx) res.add(ci);
    if (c.radius_point === idx) res.add(ci);
    if (c.points.includes(idx) && !circleHasDefiningPoint(c, idx)) res.add(ci);
    if (isCircleThroughPoints(c) && c.defining_points.includes(idx)) res.add(ci);
  });
  return Array.from(res);
}

function circlesWithCenter(idx: number): number[] {
  const res: number[] = [];
  model.circles.forEach((c, ci) => {
    if (c.center === idx) res.push(ci);
  });
  return res;
}

function strokeBounds(stroke: InkStroke): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!stroke.points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  stroke.points.forEach(pt => {
    minX = Math.min(minX, pt.x);
    minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x);
    maxY = Math.max(maxY, pt.y);
  });
  const margin = stroke.baseWidth * 2;
  return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
}

function findInkStrokeAt(p: { x: number; y: number }): number | null {
  for (let i = model.inkStrokes.length - 1; i >= 0; i--) {
    const stroke = model.inkStrokes[i];
    if (stroke.hidden && !showHidden) continue;
    const bounds = strokeBounds(stroke);
    if (!bounds) continue;
    if (p.x < bounds.minX || p.x > bounds.maxX || p.y < bounds.minY || p.y > bounds.maxY) continue;
    
    const tolerance = currentHitRadius();
    for (let j = 0; j < stroke.points.length; j++) {
      const pt = stroke.points[j];
      if (j === 0) {
        if (Math.hypot(p.x - pt.x, p.y - pt.y) <= tolerance) return i;
      } else {
        const prev = stroke.points[j - 1];
        if (pointToSegmentDistance(p, prev, pt) <= tolerance) return i;
      }
    }
  }
  return null;
}

function eraseInkStrokeAtPoint(p: { x: number; y: number }) {
  const hit = findInkStrokeAt(p);
  if (hit === null) return;
  const stroke = model.inkStrokes[hit];
  if (!stroke) return;
  const strokeId = stroke.id ?? null;
  if (strokeId && strokeId === eraserLastStrokeId) return;
  eraserLastStrokeId = strokeId;
  model.inkStrokes.splice(hit, 1);
  eraserChangedDuringDrag = true;
  draw();
}

function applyStrokeStyle(kind: StrokeStyle['type']) {
  if (!ctx) return;
  switch (kind) {
    case 'dashed':
      ctx.setLineDash([6, 4]);
      break;
    case 'dotted':
      ctx.setLineDash([2, 4]);
      break;
    default:
      ctx.setLineDash([]);
  }
}

function getPointLabelPos(idx: number): { x: number; y: number } | null {
  const p = model.points[idx];
  if (!p || !p.label) return null;
  if (!p.label.offset) p.label.offset = defaultPointLabelOffset(idx);
  const offScreen = p.label.offset ?? { x: 8, y: -8 };
  const offWorld = screenOffsetToWorld(offScreen);
  return { x: p.x + offWorld.x, y: p.y + offWorld.y };
}

function getLineLabelPos(idx: number): { x: number; y: number } | null {
  const line = model.lines[idx];
  if (!line || !line.label) return null;
  const ext = lineExtent(idx);
  if (!ext) return null;
  if (!line.label.offset) line.label.offset = defaultLineLabelOffset(idx);
  const offScreen = line.label.offset ?? { x: 0, y: -10 };
  const offWorld = screenOffsetToWorld(offScreen);
  return { x: ext.center.x + offWorld.x, y: ext.center.y + offWorld.y };
}

function getAngleLabelPos(idx: number): { x: number; y: number } | null {
  const ang = model.angles[idx];
  if (!ang || !ang.label) return null;
  const geom = angleGeometry(ang);
  if (!geom) return null;
  if (!ang.label.offset) ang.label.offset = defaultAngleLabelOffset(idx);
  const offScreen = ang.label.offset ?? { x: 0, y: 0 };
  const offWorld = screenOffsetToWorld(offScreen);
  return { x: geom.v.x + offWorld.x, y: geom.v.y + offWorld.y };
}

function getLabelAlignment(label?: { textAlign?: LabelAlignment }): LabelAlignment {
  return normalizeLabelAlignment(label?.textAlign);
}

function isPointInLabelBox(
  pScreen: { x: number; y: number },
  labelPosWorld: { x: number; y: number },
  label: Pick<Label, 'text' | 'fontSize' | 'textAlign'>
) {
  const posScreen = worldToCanvas(labelPosWorld.x, labelPosWorld.y);
  const dim = getLabelScreenDimensions(ctx!, label, labelFontSizePx);
  const padX = LABEL_PADDING_X;
  const padY = LABEL_PADDING_Y;
  const align = getLabelAlignment(label);
  const xMin = align === 'left' ? posScreen.x - padX : posScreen.x - dim.width / 2 - padX;
  const xMax = align === 'left' ? posScreen.x + dim.width + padX : posScreen.x + dim.width / 2 + padX;
  const yMin = posScreen.y - dim.height / 2 - padY;
  const yMax = posScreen.y + dim.height / 2 + padY;

  return pScreen.x >= xMin && pScreen.x <= xMax && pScreen.y >= yMin && pScreen.y <= yMax;
}

function findLabelAt(p: { x: number; y: number }): { kind: 'point' | 'line' | 'angle' | 'free'; id: number } | null {
  const pScreen = worldToCanvas(p.x, p.y);
  
  for (let i = model.angles.length - 1; i >= 0; i--) {
    const pos = getAngleLabelPos(i);
    const label = model.angles[i].label;
    if (pos && label && isPointInLabelBox(pScreen, pos, label)) return { kind: 'angle', id: i };
  }
  for (let i = model.lines.length - 1; i >= 0; i--) {
    const pos = getLineLabelPos(i);
    const label = model.lines[i].label;
    if (pos && label && isPointInLabelBox(pScreen, pos, label)) return { kind: 'line', id: i };
  }
  for (let i = model.points.length - 1; i >= 0; i--) {
    const pos = getPointLabelPos(i);
    const label = model.points[i].label;
    if (pos && label && isPointInLabelBox(pScreen, pos, label)) return { kind: 'point', id: i };
  }
  for (let i = model.labels.length - 1; i >= 0; i--) {
    const lab = model.labels[i];
    if (lab.hidden && !showHidden) continue;
    if (isPointInLabelBox(pScreen, lab.pos, lab)) return { kind: 'free', id: i };
  }
  return null;
}

function toPoint(ev: PointerEvent) {
  const rect = canvas!.getBoundingClientRect();
  const canvasX = ev.clientX - rect.left;
  const canvasY = ev.clientY - rect.top;
  return canvasToWorld(canvasX, canvasY);
}

function canvasToWorld(canvasX: number, canvasY: number) {
  return {
    x: (canvasX - panOffset.x) / zoomFactor,
    y: (canvasY - panOffset.y) / zoomFactor
  };
}

function worldToCanvas(worldX: number, worldY: number) {
  return {
    x: worldX * zoomFactor + panOffset.x,
    y: worldY * zoomFactor + panOffset.y
  };
}

function screenOffsetToWorld(offset: { x: number; y: number }): { x: number; y: number } {
  return { x: offset.x / zoomFactor, y: offset.y / zoomFactor };
}

function worldOffsetToScreen(offset: { x: number; y: number }): { x: number; y: number } {
  return { x: offset.x * zoomFactor, y: offset.y * zoomFactor };
}

function updateTouchPointFromEvent(ev: PointerEvent) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  activeTouches.set(ev.pointerId, { x: ev.clientX - rect.left, y: ev.clientY - rect.top });
}

function removeTouchPoint(pointerId: number) {
  activeTouches.delete(pointerId);
  if (pinchState && !pinchState.pointerIds.every((id) => activeTouches.has(id))) {
    pinchState = null;
  }
}

function startPinchFromTouches(): boolean {
  const entries = Array.from(activeTouches.entries());
  if (entries.length < 2) return false;
  const [[idA, ptA], [idB, ptB]] = entries as [[number, TouchPoint], [number, TouchPoint]];
  const distance = Math.hypot(ptA.x - ptB.x, ptA.y - ptB.y);
  if (!(distance > 0)) return false;
  pinchState = {
    pointerIds: [idA, idB],
    initialDistance: distance,
    initialZoom: zoomFactor
  };
  draggingSelection = false;
  resizingLine = null;
  lineDragContext = null;
  pendingPanCandidate = null;
  isPanning = false;
  return true;
}

function continuePinchGesture(): boolean {
  if (!pinchState) return false;
  const [idA, idB] = pinchState.pointerIds;
  const ptA = activeTouches.get(idA);
  const ptB = activeTouches.get(idB);
  if (!ptA || !ptB) return false;
  const distance = Math.hypot(ptA.x - ptB.x, ptA.y - ptB.y);
  if (!(distance > 0)) return false;
  const ratio = distance / pinchState.initialDistance;
  const midpoint = { x: (ptA.x + ptB.x) / 2, y: (ptA.y + ptB.y) / 2 };
  const worldBefore = canvasToWorld(midpoint.x, midpoint.y);
  const nextZoom = clamp(pinchState.initialZoom * ratio, MIN_ZOOM, MAX_ZOOM);
  const zoomChanged = Math.abs(nextZoom - zoomFactor) > 1e-6;
  const prevPan = { ...panOffset };
  zoomFactor = nextZoom;
  panOffset = {
    x: midpoint.x - worldBefore.x * zoomFactor,
    y: midpoint.y - worldBefore.y * zoomFactor
  };
  const panChanged = Math.abs(panOffset.x - prevPan.x) > 1e-6 || Math.abs(panOffset.y - prevPan.y) > 1e-6;
  if (zoomChanged || panChanged) {
    movedDuringPan = true;
    draw();
  }
  pinchState.initialDistance = distance;
  pinchState.initialZoom = zoomFactor;
  return zoomChanged || panChanged;
}

function clearDragState() {
  draggingLabel = null;
  resizingLine = null;
  lineDragContext = null;
  circleDragContext = null;
  polygonDragContext = null;
  draggingSelection = false;
  draggingMultiSelection = false;
  dragStart = { x: 0, y: 0 };
  resizingMulti = null;
  rotatingMulti = null;
  resizingCircle = null;
  rotatingCircle = null;
  movedDuringDrag = false;
  pendingPanCandidate = null;
  isPanning = false;
}

function markHistoryIfNeeded() {
  if (movedDuringDrag || activeInkStroke) {
    pushHistory();
  }
  movedDuringDrag = false;
}

function resetEraserState() {
  eraserActive = false;
  activeInkStroke = null;
}

function handleCanvasWheel(ev: WheelEvent) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const canvasX = ev.clientX - rect.left;
  const canvasY = ev.clientY - rect.top;
  const focusWorld = canvasToWorld(canvasX, canvasY);
  const deltaY = ev.deltaMode === WheelEvent.DOM_DELTA_LINE ? ev.deltaY * 16 : ev.deltaY;
  const zoomDelta = Math.exp(-deltaY * 0.001);
  const nextZoom = clamp(zoomFactor * zoomDelta, MIN_ZOOM, MAX_ZOOM);
  if (Math.abs(nextZoom - zoomFactor) < 1e-6) {
    ev.preventDefault();
    return;
  }
  zoomFactor = nextZoom;
  panOffset = {
    x: canvasX - focusWorld.x * zoomFactor,
    y: canvasY - focusWorld.y * zoomFactor
  };
  movedDuringPan = true;
  ev.preventDefault();
  draw();
}

function selectLabel(sel: { kind: 'point' | 'line' | 'angle' | 'free'; id: number } | null) {
  // Cleanup empty free label if we are switching selection
  if (selectedLabel && selectedLabel.kind === 'free') {
    const isSame = sel && sel.kind === 'free' && sel.id === selectedLabel.id;
    if (!isSame) {
      const l = model.labels[selectedLabel.id];
      if (l && (!l.text || !l.text.trim())) {
        model.labels.splice(selectedLabel.id, 1);
        // Adjust sel if it is a free label and index needs shifting
        if (sel && sel.kind === 'free' && sel.id > selectedLabel.id) {
          sel.id--;
        }
      }
    }
  }

  selectedLabel = sel;
  if (sel) {
    selectedPointIndex = null;
    selectedLineIndex = null;
    selectedCircleIndex = null;
    selectedAngleIndex = null;
    selectedPolygonIndex = null;
    selectedSegments.clear();
    selectedArcSegments.clear();
  }
  updateSelectionButtons();
  draw();
  updateStyleMenuValues();
}

function clearLabelSelection() {
  selectLabel(null);
}

function handleToolClick(tool: Mode) {
  try { console.debug('[handleToolClick] tool=', tool); } catch {}
  // Cleanup empty free label
  if (selectedLabel && selectedLabel.kind === 'free') {
    const l = model.labels[selectedLabel.id];
    if (l && (!l.text || !l.text.trim())) {
      model.labels.splice(selectedLabel.id, 1);
      selectedLabel = null;
      draw();
    }
  }

  if (stickyTool === tool) {
    stickyTool = null;
    setMode('move');
    return;
  }
  stickyTool = null;
  const symmetricSeed = tool === 'symmetric' ? selectedPointIndex : null;
  if (tool === 'midpoint') {
    // If any non-point selection exists (polygon, line, segments, multi-select),
    // clear it and enter midpoint mode instead of creating a midpoint immediately.
    const hasNonPointSelection =
      selectedPolygonIndex !== null ||
      selectedLineIndex !== null ||
      selectedSegments.size > 0 ||
      selectedArcSegments.size > 0 ||
      multiSelectedPoints.size > 0 ||
      multiSelectedLines.size > 0 ||
      multiSelectedPolygons.size > 0;
    if (hasNonPointSelection) {
      clearSelectionState();
      clearMultiSelection();
      updateSelectionButtons();
      draw();
      setMode('midpoint');
      updateToolButtons();
      return;
    }

    if (selectedPointIndex !== null) {
      clearSelectionState();
      updateSelectionButtons();
      draw();
    } else {
      const segEntry =
        Array.from(selectedSegments)
          .map(parseSegmentKey)
          .find((k) => k && k.part === 'segment' && k.seg !== undefined) ?? null;
      const candidateLine = segEntry?.line ?? selectedLineIndex;
      const candidateSeg = segEntry?.seg ?? 0;
      if (candidateLine !== null) {
        const line = model.lines[candidateLine];
        if (line && line.points[candidateSeg] !== undefined && line.points[candidateSeg + 1] !== undefined) {
          const a = model.points[line.points[candidateSeg]];
          const b = model.points[line.points[candidateSeg + 1]];
          if (a && b) {
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const midIdx = addPoint(model, {
              ...mid,
              style: currentPointStyle(),
              defining_parents: line?.id ? [{ kind: 'line', id: line.id }] : []
            });
            insertPointIntoLine(candidateLine, midIdx, mid);
            clearSelectionState();
            selectedPointIndex = midIdx;
            selectedLineIndex = candidateLine;
            updateSelectionButtons();
            draw();
            pushHistory();
            setMode('move');
            updateToolButtons();
            return;
          }
        }
      }
    }
  }
  if (tool === 'parallelLine') {
    parallelAnchorPointIndex = selectedPointIndex;
    parallelReferenceLineIndex = selectedLineIndex;
    if (parallelAnchorPointIndex !== null && parallelReferenceLineIndex !== null) {
      const created = createParallelLineThroughPoint(parallelAnchorPointIndex, parallelReferenceLineIndex);
      parallelAnchorPointIndex = null;
      parallelReferenceLineIndex = null;
      if (created !== null) {
        selectedLineIndex = created;
        selectedPointIndex = null;
        draw();
        pushHistory();
        maybeRevertMode();
        updateSelectionButtons();
        return;
      }
    }
  }
  if (
    tool === 'triangleUp' ||
    tool === 'square' ||
    tool === 'polygon' ||
    tool === 'ngon' ||
    tool === 'angle' ||
    tool === 'bisector' ||
    tool === 'circleThree'
  ) {
    clearSelectionState();
    updateSelectionButtons();
    draw();
  }
  setMode(tool);
  if (tool === 'symmetric') {
    symmetricSourceIndex = symmetricSeed;
    if (symmetricSourceIndex !== null) draw();
  }
  if (tool === 'label') {
    tryApplyLabelToSelection();
  }
  updateToolButtons();
  updateSelectionButtons();
}

function handleToolSticky(tool: Mode) {
  // Cleanup empty free label
  if (selectedLabel && selectedLabel.kind === 'free') {
    const l = model.labels[selectedLabel.id];
    if (l && (!l.text || !l.text.trim())) {
      model.labels.splice(selectedLabel.id, 1);
      selectedLabel = null;
      draw();
    }
  }

  if (stickyTool === tool) {
    stickyTool = null;
    setMode('move');
  } else {
    stickyTool = tool;
    setMode(tool);
  }
  updateToolButtons();
  updateSelectionButtons();
}

function setupDoubleTapSticky(btn: HTMLButtonElement | null, tool: Mode) {
  if (!btn) return;
  
  btn.addEventListener('touchend', (e) => {
    const now = Date.now();
    const lastTap = doubleTapTimeouts.get(btn);
    
    if (lastTap && now - lastTap < DOUBLE_TAP_DELAY) {
      // Double tap detected
      e.preventDefault();
      doubleTapTimeouts.delete(btn);
      handleToolSticky(tool);
    } else {
      // First tap
      doubleTapTimeouts.set(btn, now);
      // Clear timeout after delay
      setTimeout(() => {
        doubleTapTimeouts.delete(btn);
      }, DOUBLE_TAP_DELAY);
    }
  }, { passive: false });
}

function maybeRevertMode() {
  if (stickyTool === null && mode !== 'move') {
    setMode('move');
  }
  
  // Reset multi-buttons to their first (main) function after use
  Object.keys(buttonConfig.multiButtons).forEach(mainId => {
    if (multiButtonStates[mainId] !== 0) {
      multiButtonStates[mainId] = 0;
      
      // Update button visual to show first tool
      const mainBtn = document.getElementById(mainId);
      if (mainBtn) {
        const buttonIds = buttonConfig.multiButtons[mainId];
        const firstToolId = buttonIds[0];
        const firstTool = TOOL_BUTTONS.find(t => t.id === firstToolId);
        
        if (firstTool) {
          const svgElement = mainBtn.querySelector('svg');
          if (svgElement) {
            svgElement.setAttribute('viewBox', firstTool.viewBox);
            svgElement.innerHTML = firstTool.icon;
          }
          mainBtn.setAttribute('title', firstTool.label);
          mainBtn.setAttribute('aria-label', firstTool.label);
        }
      }
    }
  });
}

function updateToolButtons() {
  const applyClasses = (btn: HTMLButtonElement | null, tool: Mode) => {
    if (!btn) return;
    btn.classList.toggle('active', mode === tool);
    btn.classList.toggle('sticky', stickyTool === tool);
  };
  applyClasses(modeAddBtn, 'add');
  applyClasses(modeIntersectionBtn, 'intersection');
  applyClasses(modeSegmentBtn, 'segment');
  applyClasses(modeParallelBtn, 'parallel');
  applyClasses(modePerpBtn, 'perpendicular');
  applyClasses(modeTriangleBtn, 'triangleUp');
  applyClasses(modeSquareBtn, 'square');
  applyClasses(modeCircleThreeBtn, 'circleThree');
  applyClasses(modeLabelBtn, 'label');
  applyClasses(modeAngleBtn, 'angle');
  applyClasses(modePolygonBtn, 'polygon');
  applyClasses(modeBisectorBtn, 'bisector');
  applyClasses(modeMidpointBtn, 'midpoint');
  applyClasses(modeSymmetricBtn, 'symmetric');
  applyClasses(modeParallelLineBtn, 'parallelLine');
  applyClasses(modeTangentBtn, 'tangent');
  applyClasses(modePerpBisectorBtn, 'perpBisector');
  applyClasses(modeNgonBtn, 'ngon');
  applyClasses(modeMultiselectBtn, 'multiselect');
  applyClasses(document.getElementById('modeCircle') as HTMLButtonElement | null, 'circle');
  applyClasses(modeHandwritingBtn, 'handwriting');
    if (modeMoveBtn) {
    modeMoveBtn.classList.toggle('active', mode === 'move');
    modeMoveBtn.classList.toggle('sticky', false);
    const moveLabel = 'Zaznacz';
    modeMoveBtn.title = moveLabel;
    modeMoveBtn.setAttribute('aria-label', moveLabel);
    modeMoveBtn.innerHTML = `${ICONS.moveSelect}<span class="sr-only">${moveLabel}</span>`;
  }
  
  // Handle multi-buttons - check if current tool matches any in the group
  Object.entries(buttonConfig.multiButtons).forEach(([mainId, buttonIds]) => {
    const mainBtn = document.getElementById(mainId);
    if (!mainBtn) return;
    
    const currentIndex = multiButtonStates[mainId] || 0;
    const currentToolId = buttonIds[currentIndex];
    const currentTool = TOOL_BUTTONS.find(t => t.id === currentToolId);
    
    if (currentTool) {
      let isActive = false;
      if (currentToolId === 'copyStyleBtn') {
        isActive = copyStyleActive;
      } else {
        isActive = mode === currentTool.mode;
      }
      
      mainBtn.classList.toggle('active', isActive);
      mainBtn.classList.toggle('sticky', stickyTool === currentTool.mode);
    }
  });
}

function updateSelectionButtons() {
  const visible = selectedLineIndex !== null || selectedPolygonIndex !== null;
  if (viewModeToggleBtn) {
    if (viewModeMenuContainer) viewModeMenuContainer.style.display = 'none';
    const mode = getViewModeState();
    if (mode === 'edges') viewModeToggleBtn.innerHTML = ICONS.viewEdges;
    else viewModeToggleBtn.innerHTML = ICONS.viewVertices;
  }
  const anySelection = hasAnySelection();
  if (hideBtn) {
    // Do not show the hide/show button while in multiselect mode
    hideBtn.style.display = anySelection && mode !== 'multiselect' ? 'inline-flex' : 'none';
  }
  if (deleteBtn) {
    deleteBtn.style.display = anySelection ? 'inline-flex' : 'none';
  }
  if (copyStyleBtn) {
    const canCopyStyle =
      mode !== 'multiselect' &&
      (selectedPointIndex !== null ||
        selectedLineIndex !== null ||
        selectedCircleIndex !== null ||
        selectedAngleIndex !== null ||
        selectedInkStrokeIndex !== null ||
        selectedLabel !== null ||
        multiSelectedLabels.size > 0);
    copyStyleBtn.style.display = canCopyStyle ? 'inline-flex' : 'none';
    if (copyStyleActive) {
      copyStyleBtn.classList.add('active');
      copyStyleBtn.setAttribute('aria-pressed', 'true');
    } else {
      copyStyleBtn.classList.remove('active');
      copyStyleBtn.setAttribute('aria-pressed', 'false');
    }
  }
  const showIdleButtons = !anySelection && mode === 'move';
  if (cloudFilesBtn) {
    cloudFilesBtn.style.display = showIdleButtons ? 'inline-flex' : 'none';
  }
  if (exportJsonBtn) {
    exportJsonBtn.style.display = showIdleButtons ? 'inline-flex' : 'none';
  }
  updateArchiveNavButtons();
  
  // Show multiselect move and clone buttons
  const showMultiButtons = mode === 'multiselect' && hasMultiSelection();
  if (multiMoveBtn) {
    multiMoveBtn.style.display = showMultiButtons ? 'inline-flex' : 'none';
  }
  if (multiCloneBtn) {
    // Show when in multiselect with selection OR when there is copied content and top idle buttons are visible
    const showIdleButtons = !anySelection && mode === 'move';
    const showAsTopPaste = !!copiedObjects && showIdleButtons;
    multiCloneBtn.style.display = showMultiButtons || showAsTopPaste ? 'inline-flex' : 'none';

    // Swap icon and title depending on whether we have copied content
    const svgEl = multiCloneBtn.querySelector('svg') as SVGElement | null;
    if (copiedObjects) {
      multiCloneBtn.title = 'Wklej zaznaczone';
      multiCloneBtn.setAttribute('aria-label', 'Wklej zaznaczone');
      if (svgEl) {
        svgEl.setAttribute('viewBox', '0 0 64 64');
        svgEl.innerHTML = `
          <rect x="18" y="10" width="28" height="10" rx="3" />
          <path d="M22 10h20" />
          <rect x="14" y="18" width="36" height="36" rx="4" />
          <path d="M22 30h20M22 38h20M22 46h14" />
        `;
      }
    } else {
      // When in multiselect mode and nothing is in clipboard, show 'Kopiuj' (copy)
      if (mode === 'multiselect') {
        multiCloneBtn.title = 'Kopiuj zaznaczone';
        multiCloneBtn.setAttribute('aria-label', 'Kopiuj zaznaczone');
      } else {
        multiCloneBtn.title = 'Klonuj zaznaczone';
        multiCloneBtn.setAttribute('aria-label', 'Klonuj zaznaczone');
      }
      if (svgEl) {
        svgEl.setAttribute('viewBox', '0 0 24 24');
        svgEl.innerHTML = `
          <rect x="8" y="8" width="13" height="13" rx="2" fill="none" stroke="currentColor"/>
          <path d="M6 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />
        `;
      }
    }
  }
  
  if (styleMenuContainer) {
    // Show style menu when there is a selection OR when in handwriting mode
    const showStyle = (anySelection && !hasMultiSelection()) || mode === 'handwriting';
    styleMenuContainer.style.display = showStyle ? 'inline-flex' : 'none';
    if (!anySelection && mode !== 'handwriting') {
      closeStyleMenu();
      styleMenuSuppressed = false;
    }
    updateStyleMenuValues();
  }
  if (eraserBtn) {
    const showEraser = mode === 'handwriting';
    eraserBtn.style.display = showEraser ? 'inline-flex' : 'none';
    eraserBtn.classList.toggle('active', eraserActive);
    eraserBtn.setAttribute('aria-pressed', eraserActive ? 'true' : 'false');
  }
  if (highlighterBtn) {
    const showHl = mode === 'handwriting';
    highlighterBtn.style.display = showHl ? 'inline-flex' : 'none';
    highlighterBtn.classList.toggle('active', highlighterActive);
    highlighterBtn.setAttribute('aria-pressed', highlighterActive ? 'true' : 'false');
    if (highlighterActive) highlighterBtn.title = `Podświetlacz (${Math.round(highlighterAlpha * 100)}%)`;
    else highlighterBtn.title = 'Podświetlacz';
  }
  updatePointLabelToolButtons();
}

function renderWidth(w: number) {
  return Math.max(0.1, w / (dpr * zoomFactor));
}

function screenUnits(value: number) {
  return value / zoomFactor;
}

function hexToRgba(hex: string, alpha: number) {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  const int = parseInt(h.slice(0, 6), 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// `renderInkStroke` moved to `src/canvas/renderer.ts`; main uses the imported function.
 
// Instantiate selection style helper using renderer's factory
const applySelectionStyle = makeApplySelectionStyle(THEME, renderWidth);

function currentHitRadius(multiplier = 1) {
  return (HIT_RADIUS * multiplier) / zoomFactor;
}

function currentLabelHitRadius(multiplier = 1) {
  return (LABEL_HIT_RADIUS * multiplier) / zoomFactor;
}

function pointRadius(size: number) {
  const start = 4; // size 1
  const end = 6; // size 6
  const clamped = Math.max(1, Math.min(6, size));
  if (clamped <= 1) return start;
  return start + ((clamped - 1) * (end - start)) / 5;
}

function lineMidpoint(lineIdx: number) {
  const line = model.lines[lineIdx];
  if (!line || line.points.length < 2) return null;
  const a = model.points[line.points[0]];
  const b = model.points[line.points[line.points.length - 1]];
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, a, b };
}

function defaultLineLabelOffset(lineIdx: number): { x: number; y: number } {
  const mp = lineMidpoint(lineIdx);
  if (!mp) return worldOffsetToScreen({ x: 0, y: -16 });
  const dx = mp.b.x - mp.a.x;
  const dy = mp.b.y - mp.a.y;
  const len = Math.hypot(dx, dy) || 1;
  let normal = { x: -dy / len, y: dx / len };
  const polyIdx = polygonForLine(lineIdx);
  if (polyIdx !== null) {
    const c = polygonCentroid(polyIdx);
    if (c) {
      const toCentroid = { x: c.x - mp.x, y: c.y - mp.y };
      const dot = normal.x * toCentroid.x + normal.y * toCentroid.y;
      if (dot > 0) normal = { x: -normal.x, y: -normal.y }; // push outward
    }
  } else if (Math.abs(dx) < 1e-3) {
    normal = { x: -1, y: 0 };
  } else if (normal.y > 0) {
    normal = { x: -normal.x, y: -normal.y }; // aim upward
  }
  const margin = 18;
  return worldOffsetToScreen({ x: normal.x * margin, y: normal.y * margin });
}

function pointLineDirections(pointIdx: number): { x: number; y: number }[] {
  const dirs: { x: number; y: number }[] = [];
  const lines = findLinesContainingPoint(pointIdx);
  lines.forEach((li) => {
    const line = model.lines[li];
    const pos = line.points.indexOf(pointIdx);
    if (pos === -1) return;
    const prev = pos > 0 ? model.points[line.points[pos - 1]] : null;
    const next = pos < line.points.length - 1 ? model.points[line.points[pos + 1]] : null;
    const p = model.points[pointIdx];
    if (!p) return;
    if (prev) {
      const dx = prev.x - p.x;
      const dy = prev.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      dirs.push({ x: dx / len, y: dy / len });
    }
    if (next) {
      const dx = next.x - p.x;
      const dy = next.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      dirs.push({ x: dx / len, y: dy / len });
    }
  });
  return dirs;
}

function defaultPointLabelOffset(pointIdx: number): { x: number; y: number } {
  const p = model.points[pointIdx];
  const fallbackWorld = { x: 12, y: -12 };
  if (!p) return worldOffsetToScreen(fallbackWorld);

  const circleIdxs = circlesContainingPoint(pointIdx);
  if (circleIdxs.length) {
    const c = model.circles[circleIdxs[0]];
    const center = model.points[c.center];
    if (center) {
      const dir = normalize({ x: p.x - center.x, y: p.y - center.y });
      const margin = 18;
      return worldOffsetToScreen({ x: dir.x * margin, y: dir.y * margin });
    }
  }

  const dirs = pointLineDirections(pointIdx);
  const margin = 18;
  if (dirs.length >= 2) {
    const sum = dirs.reduce((acc, d) => ({ x: acc.x + d.x, y: acc.y + d.y }), { x: 0, y: 0 });
    const len = Math.hypot(sum.x, sum.y);
    let dir =
      len > 1e-3
        ? { x: sum.x / len, y: sum.y / len }
        : { x: -dirs[0].y, y: dirs[0].x }; // perpendicular fallback
    dir = { x: -dir.x, y: -dir.y }; // outside the angle
    return worldOffsetToScreen({ x: dir.x * margin, y: dir.y * margin });
  }

  if (dirs.length === 1) {
    let dir = { x: -dirs[0].y, y: dirs[0].x }; // perpendicular
    if (dir.y > 0) dir = { x: -dir.x, y: -dir.y };
    return worldOffsetToScreen({ x: dir.x * margin, y: dir.y * margin });
  }

  return worldOffsetToScreen(fallbackWorld);
}

function alignPointLabelOffsets() {
  let changed = false;
  model.points.forEach((pt, idx) => {
    if (!pt?.label) return;
    const next = defaultPointLabelOffset(idx);
    const prev = pt.label.offset;
    if (!prev || Math.abs(prev.x - next.x) > 1e-2 || Math.abs(prev.y - next.y) > 1e-2) {
      pt.label = { ...pt.label, offset: next };
      changed = true;
    }
  });
  if (changed) {
    draw();
    pushHistory();
  }
}

function adjustPointLabelOffsets(scale: number) {
  if (!Number.isFinite(scale) || scale <= 0) return;
  let changed = false;
  model.points.forEach((pt, idx) => {
    if (!pt?.label) return;
    const current = pt.label.offset ?? defaultPointLabelOffset(idx);
    const next = { x: current.x * scale, y: current.y * scale };
    if (Math.abs(next.x - current.x) < 1e-3 && Math.abs(next.y - current.y) < 1e-3) return;
    pt.label = { ...pt.label, offset: next };
    changed = true;
  });
  if (changed) {
    draw();
    pushHistory();
  }
}

function defaultAngleLabelOffset(angleIdx: number): { x: number; y: number } {
  const geom = angleGeometry(model.angles[angleIdx]);
  if (!geom) return worldOffsetToScreen({ x: 0, y: -12 });
  const mid = geom.start + geom.span / 2;
  const dir = { x: Math.cos(mid), y: Math.sin(mid) };
  const radius = Math.max(geom.radius * 0.65, 12);
  return worldOffsetToScreen({ x: dir.x * radius, y: dir.y * radius });
}

 

/**
 * Parse label text and automatically add braces for subscripts/superscripts
 * Examples:
 * - P_11 -> P_{11}
 * - a_BCd_EF -> a_{BC}d_{EF}
 * - P_abc -> P_{abc}
 */


function updateOptionButtons() {
  if (showHiddenBtn) {
    showHiddenBtn.classList.toggle('active', viewState.showHidden);
    showHiddenBtn.innerHTML = viewState.showHidden ? ICONS.eyeOff : ICONS.eye;
  }
  if (showMeasurementsBtn) {
    showMeasurementsBtn.classList.toggle('active', viewState.showMeasurements);
    showMeasurementsBtn.setAttribute('aria-pressed', viewState.showMeasurements ? 'true' : 'false');
    showMeasurementsBtn.title = viewState.showMeasurements ? 'Ukryj wymiary' : 'Pokaż wymiary';
    showMeasurementsBtn.setAttribute('aria-label', viewState.showMeasurements ? 'Ukryj wymiary' : 'Pokaż wymiary');
  }
  if (themeDarkBtn) {
    const isDark = viewState.currentTheme === 'dark';
    themeDarkBtn.classList.toggle('active', isDark);
    themeDarkBtn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
  }
}

function fitsHorizontally(container: HTMLElement | null): boolean {
  if (!container) return true;
  return container.scrollWidth <= container.clientWidth + 1;
}

function closeLabelToolsOverflowMenu() {
  labelToolsOverflowOpen = false;
  labelToolsOverflowContainer?.classList.remove('open');
  labelToolsOverflowBtn?.setAttribute('aria-expanded', 'false');
}

function openLabelToolsOverflowMenu() {
  if (!labelToolsOverflowContainer || !labelToolsOverflowMenu || !labelToolsOverflowBtn) return;
  const rect = labelToolsOverflowBtn.getBoundingClientRect();
  labelToolsOverflowMenu.style.position = 'fixed';
  labelToolsOverflowMenu.style.top = `${rect.bottom + 6}px`;
  labelToolsOverflowMenu.style.left = `${Math.max(8, rect.left)}px`;
  labelToolsOverflowMenu.style.right = 'auto';
  labelToolsOverflowMenu.style.maxWidth = 'calc(100vw - 16px)';
  labelToolsOverflowContainer.classList.add('open');
  labelToolsOverflowOpen = true;
  labelToolsOverflowBtn.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => {
    if (!labelToolsOverflowMenu) return;
    const menuRect = labelToolsOverflowMenu.getBoundingClientRect();
    const maxLeft = window.innerWidth - menuRect.width - 8;
    const nextLeft = Math.max(8, Math.min(rect.left, maxLeft));
    labelToolsOverflowMenu.style.left = `${nextLeft}px`;
  });
}

function toggleLabelToolsOverflowMenu() {
  if (labelToolsOverflowOpen) closeLabelToolsOverflowMenu();
  else openLabelToolsOverflowMenu();
}

function applyTopbarOverflowTiers(opts: {
  enabled: boolean;
  topbar: HTMLElement | null;
  host: HTMLElement | null;
  overflowContainer: HTMLElement | null;
  overflowRow: HTMLElement | null;
  closeOverflow: () => void;
  tiers: Array<Array<HTMLElement | null>>;
}) {
  const { enabled, topbar, host, overflowContainer, overflowRow, closeOverflow, tiers } = opts;
  if (!host || !overflowContainer || !overflowRow) return;

  const all = tiers.flat().filter(Boolean) as HTMLElement[];
  all.forEach((btn) => {
    if (btn.parentElement === host) return;
    host.insertBefore(btn, overflowContainer);
  });

  overflowContainer.style.display = 'none';
  closeOverflow();

  if (!enabled) return;
  if (fitsHorizontally(topbar)) return;

  overflowContainer.style.display = 'inline-flex';
  for (const tier of tiers) {
    tier.filter(Boolean).forEach((btn) => overflowRow.appendChild(btn as HTMLElement));
    if (fitsHorizontally(topbar)) break;
  }
}

function applyLabelToolsOverflowLayout(enabled: boolean) {
  applyTopbarOverflowTiers({
    enabled,
    topbar: topbarLeft,
    host: labelToolsGroup,
    overflowContainer: labelToolsOverflowContainer,
    overflowRow: labelToolsOverflowRow,
    closeOverflow: closeLabelToolsOverflowMenu,
    tiers: [
      [pointLabelsAutoBtn, pointLabelsAwayBtn, pointLabelsCloserBtn],
    ],
  });
}

function updatePointLabelToolButtons() {
  const anyLabels =
    model.labels.length > 0 ||
    model.points.some((pt) => !!pt?.label) ||
    model.lines.some((line) => !!line?.label) ||
    model.angles.some((angle) => !!angle?.label);
  const anyPointLabels = model.points.some((pt) => !!pt?.label);

  const anySelection = hasAnySelection();
  // show the label tools group when in label mode and there are any labels on the canvas
  const showGroup = mode === 'label' && anyLabels && !anySelection;
  // show the three point-label buttons only when there are point labels to act on
  const showPointLabelButtons = mode === 'label' && anyPointLabels && !anySelection;
  const display = showPointLabelButtons ? 'inline-flex' : 'none';

  [pointLabelsAutoBtn, pointLabelsAwayBtn, pointLabelsCloserBtn].forEach((btn) => {
    if (!btn) return;
    btn.style.display = display;
    btn.disabled = !showPointLabelButtons;
  });

  // overflow layout should follow whether the group is visible (not the individual buttons)
  // show/hide the whole label tools group and its overflow trigger when appropriate
  if (labelToolsGroup) labelToolsGroup.style.display = showGroup ? 'inline-flex' : 'none';
  if (labelToolsOverflowBtn) labelToolsOverflowBtn.style.display = showGroup ? '' : 'none';
  applyLabelToolsOverflowLayout(showGroup);
}

function copyMultiSelectionToClipboard() {
  if (!hasMultiSelection()) return;
  // Collect objects similarly to clone logic so pasted set is self-contained
  const linesToClone = new Set<number>(multiSelectedLines);
  const pointsToClone = new Set<number>(multiSelectedPoints);
  multiSelectedPolygons.forEach(pid => {
    const pidx = model.indexById.polygon[pid];
    if (typeof pidx !== 'number') return;
    const poly = polygonGet(pidx);
    if (poly) poly.lines.forEach(li => linesToClone.add(li));
  });
  linesToClone.forEach(idx => {
    const line = model.lines[idx];
    if (line) line.points.forEach(pi => pointsToClone.add(pi));
  });
  multiSelectedCircles.forEach(idx => {
    const circle = model.circles[idx];
    if (circle) {
      pointsToClone.add(circle.center);
      if (circle.radius_point !== undefined) pointsToClone.add(circle.radius_point);
      circle.points.forEach(pi => pointsToClone.add(pi));
    }
  });
  multiSelectedAngles.forEach(idx => {
    const ang = model.angles[idx];
    if (ang) pointsToClone.add(ang.vertex);
  });

  // Build serializable arrays of objects (deep copy)
  const stored: any = { points: [], lines: [], circles: [], angles: [], polygons: [], inkStrokes: [], labels: [] };
  // Points: keep full object (including id)
  pointsToClone.forEach(pi => {
    const p = model.points[pi];
    if (p) stored.points.push(JSON.parse(JSON.stringify(p)));
  });
  // Lines: serialize with point ids and defining point ids (not numeric indices)
  linesToClone.forEach(li => {
    const l = model.lines[li];
    if (!l) return;
    const out: any = JSON.parse(JSON.stringify(l));
    out.points = (l.points || []).map((idx) => model.points[idx]?.id).filter(Boolean);
    out.defining_points = [
      model.points[l.defining_points[0]]?.id ?? null,
      model.points[l.defining_points[1]]?.id ?? null
    ];
    stored.lines.push(out);
  });
  // Circles: serialize center/radius_point/points as ids
  multiSelectedCircles.forEach(ci => {
    const c = model.circles[ci];
    if (!c) return;
    const out: any = JSON.parse(JSON.stringify(c));
    out.center = model.points[c.center]?.id ?? null;
    out.radius_point = c.radius_point !== undefined ? model.points[c.radius_point]?.id ?? null : undefined;
    out.points = (c.points || []).map((idx) => model.points[idx]?.id).filter(Boolean);
    stored.circles.push(out);
  });
  // Angles: serialize vertex and leg line ids
  multiSelectedAngles.forEach(ai => {
    const a = model.angles[ai];
    if (!a) return;
    const out: any = JSON.parse(JSON.stringify(a));
    out.vertex = model.points[a.vertex]?.id ?? null;
    const serializeLineRef = (ref: any) => {
      if (typeof ref === 'number') return model.lines[ref]?.id ?? null;
      if (typeof ref === 'string') return ref;
      return null;
    };
    // Avoid emitting legacy numeric `leg1`/`leg2` in copied payloads; prefer id-based fields below.
    // Export runtime arm id fields when present to prefer id-based roundtrips
    if ((a as any).arm1LineId) out.arm1LineId = (a as any).arm1LineId;
    if ((a as any).arm2LineId) out.arm2LineId = (a as any).arm2LineId;
    // Include canonical point refs when present so copied payloads keep point-based angles too
    if ((a as any).point1 !== undefined) out.point1 = typeof (a as any).point1 === 'number' ? model.points[(a as any).point1]?.id ?? null : (a as any).point1;
    if ((a as any).point2 !== undefined) out.point2 = typeof (a as any).point2 === 'number' ? model.points[(a as any).point2]?.id ?? null : (a as any).point2;
    stored.angles.push(out);
  });
  // Polygons: serialize lines as ids
  multiSelectedPolygons.forEach(pid => {
    const pidx = model.indexById.polygon[pid];
    if (typeof pidx !== 'number') return;
    const p = polygonGet(pidx);
    if (!p) return;
    const out: any = JSON.parse(JSON.stringify(p));
    out.lines = (p.lines || []).map((li) => model.lines[li]?.id).filter(Boolean);
    stored.polygons.push(out);
  });
  // Ink strokes and labels (positions already stored)
  multiSelectedInkStrokes.forEach(ii => { const s = model.inkStrokes[ii]; if (s) stored.inkStrokes.push(JSON.parse(JSON.stringify(s))); });
  multiSelectedLabels.forEach(li => { const lab = model.labels[li]; if (lab) stored.labels.push(JSON.parse(JSON.stringify(lab))); });

  try {
    window.localStorage?.setItem(COPIED_OBJECTS_STORAGE_KEY, JSON.stringify(stored));
  } catch {}
  copiedObjects = stored;
}

function loadCopiedObjectsFromStorage() {
  try {
    const raw = window.localStorage?.getItem(COPIED_OBJECTS_STORAGE_KEY);
    if (raw) copiedObjects = JSON.parse(raw);
  } catch {
    copiedObjects = null;
  }
}

function pasteCopiedObjects() {
  if (!copiedObjects) return;
  const stored = copiedObjects;
  // Maps from stored ids to new indices
  const pointIdToIdx = new Map<string, number>();
  const lineIdToIdx = new Map<string, number>();
  const circleIdToIdx = new Map<string, number>();
  const angleIdToIdx = new Map<string, number>();
  const polyIdToIdx = new Map<string, number>();
  const inkIdToIdx = new Map<string, number>();
  const labelMap: Map<number, number> = new Map();

  // Insert points
  stored.points.forEach((sp: any) => {
    const newId = nextId('point', model);
    const pCopy = { ...sp, id: newId };
    // shift pasted points to avoid overlap
    pCopy.x = (pCopy.x ?? 0) + 20;
    pCopy.y = (pCopy.y ?? 0) + 20;
    model.points.push(pCopy);
    const newIdx = model.points.length - 1;
    pointIdToIdx.set(sp.id, newIdx);
    registerIndex(model, 'point', pCopy.id, newIdx);
  });

  // Insert lines
  stored.lines.forEach((sl: any) => {
    const newPoints = (sl.points || []).map((pid: string) => pointIdToIdx.get(pid) ?? -1).filter((i: number) => i >= 0);
    // Attempt to set defining points from stored defining ids; fall back to ends of newPoints
    let defA = pointIdToIdx.get(sl.defining_points?.[0]) ?? -1;
    let defB = pointIdToIdx.get(sl.defining_points?.[1]) ?? -1;
    if (defA < 0 || defB < 0) {
      if (newPoints.length >= 2) {
        defA = newPoints[0];
        defB = newPoints[newPoints.length - 1];
      }
    }
    const newDefining: [number, number] = [defA, defB];
    const newLine = { ...sl, id: nextId('line', model), points: newPoints, defining_points: newDefining };
    model.lines.push(newLine);
    const newIdx = model.lines.length - 1;
    lineIdToIdx.set(sl.id, newIdx);
    registerIndex(model, 'line', newLine.id, newIdx);
  });

  // Insert circles
  stored.circles.forEach((sc: any) => {
    const newPoints = (sc.points || []).map((pid: string) => pointIdToIdx.get(pid) ?? -1).filter((i: number) => i >= 0);
    const newCenter = pointIdToIdx.get(sc.center) ?? (newPoints.length ? newPoints[0] : -1);
    if (newCenter < 0) return; // skip circle if we can't resolve center
    const newCircle: any = { ...sc, id: nextId('circle', model), center: newCenter, points: newPoints };
    if (sc.radius_point) {
      const rp = pointIdToIdx.get(sc.radius_point) ?? -1;
      if (rp >= 0) newCircle.radius_point = rp;
    }
    model.circles.push(newCircle);
    const newIdx = model.circles.length - 1;
    circleIdToIdx.set(sc.id, newIdx);
    registerIndex(model, 'circle', newCircle.id, newIdx);
  });

  // Insert angles
  stored.angles.forEach((sa: any) => {
    const newAngle: any = { ...sa, id: nextId('angle', model) };
    newAngle.vertex = pointIdToIdx.get(sa.vertex) ?? -1;
    if (newAngle.vertex < 0) return; // skip angle if vertex missing
    // Prefer explicit point-based angle payloads when present
    if (sa.point1) {
      const p1 = pointIdToIdx.get(sa.point1) ?? -1;
      if (p1 >= 0) newAngle.point1 = p1;
    }
    if (sa.point2) {
      const p2 = pointIdToIdx.get(sa.point2) ?? -1;
      if (p2 >= 0) newAngle.point2 = p2;
    }
    // Preserve runtime arm ids on pasted payloads (they will be used by runtime adapters)
    if (sa.arm1LineId) newAngle.arm1LineId = sa.arm1LineId;
    if (sa.arm2LineId) newAngle.arm2LineId = sa.arm2LineId;
    if (sa.leg1) {
      const l1 = typeof sa.leg1.line === 'string' ? (lineIdToIdx.get(sa.leg1.line) ?? -1) : (typeof sa.leg1.line === 'number' ? sa.leg1.line : -1);
      if (l1 >= 0) {
        const line = model.lines[l1];
        // Prefer runtime arm id when available; fall back to numeric index for now
        if (line?.id) newAngle.arm1LineId = line.id;
        const a = line.points[sa.leg1.seg];
        const b = line.points[sa.leg1.seg + 1];
        const other = a === newAngle.vertex ? b : a;
        if (newAngle.point1 === undefined) newAngle.point1 = other;
      }
    }
    if (sa.leg2) {
      const l2 = typeof sa.leg2.line === 'string' ? (lineIdToIdx.get(sa.leg2.line) ?? -1) : (typeof sa.leg2.line === 'number' ? sa.leg2.line : -1);
      if (l2 >= 0) {
        const line = model.lines[l2];
        if (line?.id) newAngle.arm2LineId = line.id;
        const a = line.points[sa.leg2.seg];
        const b = line.points[sa.leg2.seg + 1];
        const other = a === newAngle.vertex ? b : a;
        if (newAngle.point2 === undefined) newAngle.point2 = other;
      }
    }
    model.angles.push(newAngle);
    const newIdx = model.angles.length - 1;
    angleIdToIdx.set(sa.id, newIdx);
  });

  // Insert polygons
  stored.polygons.forEach((spoly: any) => {
    const newLines = (spoly.lines || []).map((lid: string) => lineIdToIdx.get(lid) ?? -1).filter((i: number) => i >= 0);
    if (newLines.length === 0) return;
    const newIdx = createPolygon(newLines, (spoly as any).construction_kind ?? 'free');
    const created = polygonGet(newIdx);
    polygonSet(newIdx, { ...spoly, id: created?.id ?? spoly.id, lines: newLines } as Polygon);
    polyIdToIdx.set(spoly.id, newIdx);
  });

  // Insert ink strokes
  stored.inkStrokes.forEach((s: any) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `ink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    const newStroke = { ...s, id, points: (s.points || []).map((pt: any) => ({ ...pt, x: (pt.x||0)+20, y: (pt.y||0)+20 })) };
    model.inkStrokes.push(newStroke);
    inkIdToIdx.set(s.id, model.inkStrokes.length - 1);
  });

  // Insert free labels
  stored.labels.forEach((lab: any, idx: number) => {
    const newLab = { ...lab, pos: { x: (lab.pos?.x ?? 0) + 20, y: (lab.pos?.y ?? 0) + 20 } };
    model.labels.push(newLab);
    labelMap.set(idx, model.labels.length - 1);
  });

  // Recompute derived geometry and update indices
  rebuildIndexMaps();
  // Select pasted objects in multiselect
  clearMultiSelection();
  // Select newly inserted objects
  pointIdToIdx.forEach((newIdx) => multiSelectedPoints.add(newIdx));
  lineIdToIdx.forEach((newIdx) => multiSelectedLines.add(newIdx));
  circleIdToIdx.forEach((newIdx) => multiSelectedCircles.add(newIdx));
  angleIdToIdx.forEach((newIdx) => multiSelectedAngles.add(newIdx));
  polyIdToIdx.forEach((newIdx) => {
    const id = polygonId(newIdx);
    if (id) multiSelectedPolygons.add(id);
  });
  inkIdToIdx.forEach((newIdx) => multiSelectedInkStrokes.add(newIdx));
  labelMap.forEach((newIdx) => multiSelectedLabels.add(newIdx));

  // Activate multiselect move
  setMode('multiselect');
  multiMoveActive = true;
  multiMoveBtn?.classList.add('active');
  multiMoveBtn?.setAttribute('aria-pressed', 'true');

  // Clear clipboard after a paste so next multiselect shows COPY (KOPIUJ)
  try {
    window.localStorage?.removeItem(COPIED_OBJECTS_STORAGE_KEY);
  } catch {}
  copiedObjects = null;

  updateSelectionButtons();
  draw();
  pushHistory();
}


function normalizeColor(color: string) {
  return color.trim().toLowerCase();
}
// rotate hue of a hex color (uses shared color helpers defined later)
function rotateHueHex(hex: string, deg: number) {
  const parsed = parseHexColor(hex);
  if (!parsed) return hex;
  const hsl = rgbToHsl(parsed.r, parsed.g, parsed.b); // h in [0,1]
  const newHdeg = ((hsl.h * 360 + deg) % 360 + 360) % 360;
  const newH = newHdeg / 360; // convert to [0,1] for hslToRgb
  const nrgb = hslToRgb(newH, hsl.s, hsl.l);
  return rgbToHex(nrgb.r, nrgb.g, nrgb.b);
}

function mostCommonConstructionColor(includeHidden = false): string | null {
  const counts: Record<string, number> = {};
  const add = (col?: string, hidden?: boolean) => {
    if (!col) return;
    if (!includeHidden && hidden) return;
    const key = normalizeColor(col);
    counts[key] = (counts[key] || 0) + 1;
  };
  model.points.forEach((pt) => add(pt?.style?.color, pt?.style?.hidden));
  model.lines.forEach((ln) => {
    if (!ln) return;
    add(ln.style?.color, ln.style?.hidden);
    ln.segmentStyles?.forEach((s) => add(s.color, s.hidden));
  });
  model.circles.forEach((c) => add(c.style?.color, c.style?.hidden));
  let best: string | null = null;
  let bestCount = 0;
  for (const k in counts) {
    if (counts[k] > bestCount) {
      bestCount = counts[k];
      best = k;
    }
  }
  return best;
}

function rememberColor(color: string) {
  const norm = normalizeColor(color);
  const bgNorm = normalizeColor(THEME.bg);
  // Never record the theme background color in recentColors — it should not occupy
  // the primary (first) swatch slot. Still update the UI to reflect selection.
  if (norm === bgNorm) {
    try { updateColorButtons(); } catch {}
    return;
  }
  const existing = recentColors.findIndex((c) => normalizeColor(c) === norm);
  if (existing >= 0) recentColors.splice(existing, 1);
  recentColors.unshift(color);
  if (recentColors.length > 20) recentColors = recentColors.slice(0, 20);
  saveRecentColorsToStorage(recentColors);
  updateColorButtons();
}

function paletteColors(): string[] {
  const baseColors = THEME.palette.length ? [...THEME.palette] : [THEME.defaultStroke];
  const swatchCount = Math.max(colorSwatchButtons.length - 1, 4);

  // DEBUG

  const result: string[] = [];
  const usedNorm = new Set<string>();

  const bgNorm = normalizeColor(THEME.bg);
  usedNorm.add(bgNorm);

  const pushIfUnique = (hex: string) => {
    const n = normalizeColor(hex);
    if (usedNorm.has(n)) return false;
    // also avoid near-duplicates by rgb distance
    const parsed = parseHexColor(hex);
    if (!parsed) return false;
    for (const r of result) {
      const pr = parseHexColor(r);
      if (!pr) continue;
      const dr = (parsed.r - pr.r) ** 2 + (parsed.g - pr.g) ** 2 + (parsed.b - pr.b) ** 2;
      if (dr < 3600) return false; // too close (higher threshold to avoid near-duplicates)
    }
    result.push(hex);
    usedNorm.add(n);
    return true;
  };

  // Start with supplied base colors (respect order), but ensure uniqueness
  for (let i = 0; i < baseColors.length && result.length < swatchCount; i++) {
    const c = baseColors[i];
    if (!pushIfUnique(c)) continue;
  }

  // If there is a prominent stroke color in theme, include it early
  const primary = THEME.defaultStroke || baseColors[0];
  if (primary && result.length < swatchCount) pushIfUnique(primary);

  // Fill from recentColors (most-recent first)
  for (let i = 0; i < recentColors.length && result.length < swatchCount; i++) {
    pushIfUnique(recentColors[i]);
  }

  // Prefer clearly distinct hues (red, orange, yellow, green, cyan, blue, purple, magenta)
  // rotated by the theme/seed hue so palettes feel consistent with theme.
  const seed = (baseColors[0] ?? THEME.defaultStroke) || '#ff0000';
  const pSeed = parseHexColor(seed) || parseHexColor('#ff0000')!;
  const seedHsl = rgbToHsl(pSeed.r, pSeed.g, pSeed.b);
  const hueStart = Math.round((seedHsl.h * 360) % 360);
  const baseHues = [0, 30, 60, 120, 180, 210, 260, 300];
  const satCandidates = [0.92, 0.82, 0.72];
  const lightCandidates = [0.46, 0.36, 0.56];
  let hueIdx = 0;
  // Try base hues first, then allow small hue offsets if needed
  while (result.length < swatchCount && hueIdx < baseHues.length * 3) {
    const base = baseHues[hueIdx % baseHues.length];
    const ring = Math.floor(hueIdx / baseHues.length);
    const hue = (base + hueStart + ring * 8) % 360;
    let placed = false;
    for (let si = 0; si < satCandidates.length && !placed; si++) {
      for (let li = 0; li < lightCandidates.length && !placed; li++) {
        const s = satCandidates[si];
        const l = lightCandidates[li];
        const nrgb = hslToRgb(hue / 360, s, l);
        const cand = rgbToHex(nrgb.r, nrgb.g, nrgb.b);
        if (pushIfUnique(cand)) placed = true;
      }
    }
    hueIdx += 1;
  }

  // Final fallback: fill remaining with high-contrast neutral
  const fallback = bgNorm === '#ffffff' ? '#222222' : '#ffffff';
  while (result.length < swatchCount) {
    if (!pushIfUnique(fallback)) break;
    // if still not unique, push a deterministic black/white
    if (result.length < swatchCount && !pushIfUnique('#000000')) break;
  }

  return result.slice(0, swatchCount);
}

function updateColorButtons() {
  const colorInput = styleColorInput;
  if (!colorInput) return;
  const currentColor = colorInput.value;
  const swatchCount = colorSwatchButtons.length;
  if (swatchCount === 0) return;

  // Build ordered assigned list:
  // - index 0 = currentColor
  // - indices 1..swatchCount-2 = recent used colors (no duplicates), then palette, then generated
  // - last index = THEME.bg (fixed)
  const assigned: string[] = new Array(swatchCount).fill('');
  assigned[swatchCount - 1] = THEME.bg;

  // If the user picked the theme background color, don't put it in the first slot.
  const currentIsThemeBg = normalizeColor(currentColor) === normalizeColor(THEME.bg);
  if (!currentIsThemeBg) {
    assigned[0] = currentColor;
  } else {
    // choose a sensible non-bg fallback for the first slot (prefer palette)
    const pal = paletteColors();
    let fallback = pal.length ? pal[0] : THEME.defaultStroke;
    if (normalizeColor(fallback) === normalizeColor(THEME.bg)) {
      fallback = pal.find((c) => normalizeColor(c) !== normalizeColor(THEME.bg)) ?? THEME.defaultStroke;
    }
    assigned[0] = fallback;
  }

  const used = new Set<string>([normalizeColor(assigned[0]), normalizeColor(THEME.bg)]);

  // Candidates: prefer theme palette first, then recentColors (most-recent first)
  const candidates: string[] = [];
  paletteColors().forEach((c) => candidates.push(c));
  recentColors.forEach((c) => candidates.push(c));

  // DEBUG

  let fillIdx = 1;
  for (let i = 0; i < candidates.length && fillIdx < swatchCount - 1; i += 1) {
    const cand = candidates[i];
    if (!cand) continue;
    const nc = normalizeColor(cand);
    if (used.has(nc)) continue;
    if (nc === normalizeColor(THEME.bg)) continue;
    const parsed = parseHexColor(cand);
    let tooClose = false;
    if (parsed) {
      for (let j = 0; j < fillIdx; j++) {
        const ex = assigned[j];
        if (!ex) continue;
        const pr = parseHexColor(ex);
        if (!pr) continue;
        const dr = (parsed.r - pr.r) ** 2 + (parsed.g - pr.g) ** 2 + (parsed.b - pr.b) ** 2;
        if (dr < 3600) {
          tooClose = true;
          break;
        }
      }
    }
    if (tooClose) continue;
    assigned[fillIdx] = cand;
    used.add(nc);
    fillIdx += 1;
  }

  // Generate distinct colors if still empty slots
  let genBase = currentColor || (paletteColors()[0] ?? THEME.defaultStroke);
  let attempts = 0;
  while (fillIdx < swatchCount - 1) {
    const cand = rotateHueHex(genBase, 30 + (attempts % 12) * 25);
    const nc = normalizeColor(cand);
    // Reject if identical normalized color
    if (used.has(nc) || nc === normalizeColor(THEME.bg)) {
      attempts += 1;
      if (attempts > 120) break;
      continue;
    }
    // Reject if visually too close to any already assigned color (RGB distance threshold)
    const parsed = parseHexColor(cand);
    let tooClose = false;
    if (parsed) {
      for (let j = 0; j < fillIdx; j++) {
        const ex = assigned[j];
        if (!ex) continue;
        const pr = parseHexColor(ex);
        if (!pr) continue;
        const dr = (parsed.r - pr.r) ** 2 + (parsed.g - pr.g) ** 2 + (parsed.b - pr.b) ** 2;
        if (dr < 3600) {
          tooClose = true;
          break;
        }
      }
    }
    if (!tooClose) {
      assigned[fillIdx] = cand;
      used.add(nc);
      fillIdx += 1;
    }
    attempts += 1;
    if (attempts > 36) {
      const fallback = THEME.bg === '#ffffff' ? '#222222' : '#ffffff';
      if (!used.has(normalizeColor(fallback))) {
        assigned[fillIdx] = fallback;
        used.add(normalizeColor(fallback));
        fillIdx += 1;
      } else {
        assigned[fillIdx] = '#000000';
        fillIdx += 1;
      }
    }
  }

  colorSwatchButtons.forEach((btn, idx) => {
    const isLast = idx === swatchCount - 1;
    const color = assigned[idx] || (isLast ? THEME.bg : THEME.defaultStroke);
    btn.dataset.color = color;
    btn.style.background = color;
    btn.classList.toggle('theme-bg', isLast);
    const isActive = normalizeColor(color) === normalizeColor(currentColor);
    btn.classList.toggle('active', isActive);
  });
    const palette = paletteColors();
    
    if (customColorBtn) {
      const isCurrentThemeBg = normalizeColor(currentColor) === normalizeColor(THEME.bg);
      const isCustom = !isCurrentThemeBg && !palette.some((c) => normalizeColor(c) === normalizeColor(currentColor));
      customColorBtn.classList.toggle('active', isCustom);
    }
}

function insertLabelSymbol(symbol: string) {
  if (!labelTextInput) return;
  const input = labelTextInput;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const nextValue = input.value.slice(0, start) + symbol + input.value.slice(end);
  input.value = nextValue;
  const caret = start + symbol.length;
  input.focus();
  if (typeof input.setSelectionRange === 'function') {
    input.setSelectionRange(caret, caret);
  }
  const evt = new Event('input', { bubbles: true });
  input.dispatchEvent(evt);
}

function refreshLabelKeyboard(labelEditing: boolean) {
  if (!labelEditing) {
    labelGreekVisible = false;
    labelGreekUppercase = false;
  }
  if (labelGreekToggleBtn) {
    labelGreekToggleBtn.style.display = labelEditing ? 'inline-flex' : 'none';
    const active = labelEditing && labelGreekVisible;
    labelGreekToggleBtn.classList.toggle('active', active);
    labelGreekToggleBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  if (labelGreekRow) {
    labelGreekRow.style.display = labelEditing && labelGreekVisible ? 'flex' : 'none';
  }
  // use top-level SCRIPT_UPPER / SCRIPT_LOWER
  // Assign script letters only to non-symbol keys and stop when letters run out (no repeats)
  let scriptIndex = 0;
  labelGreekButtons.forEach((btn) => {
    if (labelScriptVisible) {
      // Preserve explicit symbol buttons (they have class 'label-symbol-btn')
      if (btn.classList.contains('label-symbol-btn')) {
        btn.disabled = false;
        btn.style.display = '';
        return;
      }
      if (scriptIndex < SCRIPT_LOWER.length) {
        const lower = SCRIPT_LOWER[scriptIndex];
        const upper = SCRIPT_UPPER[scriptIndex] || lower.toUpperCase();
        const symbol = labelGreekUppercase ? upper : lower;
        btn.dataset.letter = symbol;
        btn.textContent = symbol;
        btn.disabled = false;
        btn.style.display = '';
        scriptIndex += 1;
      } else {
        // No more letters — clear and disable the remaining keys to avoid repeats
        btn.dataset.letter = '';
        btn.textContent = '';
        btn.disabled = true;
        btn.style.display = 'none';
      }
    } else {
      // Restore original greek/symbol behavior
      const lower = btn.dataset.letterLower ?? btn.dataset.letter ?? btn.textContent ?? '';
      const upper = btn.dataset.letterUpper ?? lower.toUpperCase();
      const symbol = labelGreekUppercase ? upper : lower;
      btn.dataset.letter = symbol;
      btn.textContent = symbol;
      
      if (symbol) {
        btn.disabled = false;
        btn.style.display = '';
      } else {
        btn.disabled = true;
        btn.style.display = 'none';
      }
    }
  });
  if (labelGreekShiftBtn) {
    // const visible = labelEditing && labelGreekVisible;
    // labelGreekShiftBtn.style.display = visible ? 'inline-flex' : 'none';
    labelGreekShiftBtn.style.display = 'none';
    // labelGreekShiftBtn.classList.toggle('active', labelGreekUppercase && visible);
    // labelGreekShiftBtn.setAttribute('aria-pressed', labelGreekUppercase ? 'true' : 'false');
  }
  if (labelScriptBtn) {
    // const visible = labelEditing && labelGreekVisible;
    // labelScriptBtn.style.display = visible ? 'inline-flex' : 'none';
    labelScriptBtn.style.display = 'none';
    // labelScriptBtn.classList.toggle('active', labelScriptVisible && visible);
    // labelScriptBtn.setAttribute('aria-pressed', labelScriptVisible ? 'true' : 'false');
  }
}

function labelFontSizeForSelection(): number | null {
  if (!selectedLabel) return null;
  const sel = selectedLabel;
  const base = getLabelFontDefault();
  const normalizeAndGetPx = (
    label: { fontSize?: number },
    setter: (nextDelta: number) => void,
  ) => {
    const nextDelta = clampLabelFontDelta(label.fontSize, base);
    if (label.fontSize !== nextDelta) setter(nextDelta);
    return labelFontSizePx(nextDelta, base);
  };
  switch (sel.kind) {
    case 'point': {
      const point = model.points[sel.id];
      const label = point?.label;
      if (!label) return null;
      const id = sel.id;
      return normalizeAndGetPx(label, (nextDelta) => {
        model.points[id].label = { ...label, fontSize: nextDelta };
      });
    }
    case 'line': {
      const line = model.lines[sel.id];
      const label = line?.label;
      if (!label) return null;
      const id = sel.id;
      return normalizeAndGetPx(label, (nextDelta) => {
        model.lines[id].label = { ...label, fontSize: nextDelta };
      });
    }
    case 'angle': {
      const angle = model.angles[sel.id];
      const label = angle?.label;
      if (!label) return null;
      const id = sel.id;
      return normalizeAndGetPx(label, (nextDelta) => {
        model.angles[id].label = { ...label, fontSize: nextDelta };
      });
    }
    case 'free': {
      const label = model.labels[sel.id];
      if (!label) return null;
      const id = sel.id;
      return normalizeAndGetPx(label, (nextDelta) => {
        model.labels[id] = { ...label, fontSize: nextDelta };
      });
    }
  }
}

function updateLabelFontControls() {
  const size = labelFontSizeForSelection();
  const display = size !== null ? `${size} px` : '-';
  if (labelFontSizeDisplay) labelFontSizeDisplay.textContent = display;
  const atMin = size !== null && size <= LABEL_FONT_MIN;
  const atMax = size !== null && size >= LABEL_FONT_MAX;
  const defaultSize = getLabelFontDefault();
  const belowDefault = size !== null && size < defaultSize;
  const aboveDefault = size !== null && size > defaultSize;
  const updateBtn = (
    btn: HTMLButtonElement | null,
    disabled: boolean,
    limit: boolean,
    active: boolean,
  ) => {
    if (!btn) return;
    btn.disabled = disabled;
    btn.classList.toggle('limit', limit);
    btn.classList.toggle('active', active);
  };
  updateBtn(labelFontDecreaseBtn, size === null || atMin, size !== null && atMin, belowDefault);
  updateBtn(labelFontIncreaseBtn, size === null || atMax, size !== null && atMax, aboveDefault);
}

function adjustSelectedLabelFont(delta: number) {
  const activeLabel = selectedLabel;
  if (!activeLabel || delta === 0) {
    updateLabelFontControls();
    return;
  }
  let changed = false;
  const base = getLabelFontDefault();
  const apply = <T extends { fontSize?: number }>(label: T, setter: (next: T) => void) => {
    const currentPx = labelFontSizePx(label.fontSize, base);
    const nextPx = clampLabelFontSize(currentPx + delta);
    if (nextPx === currentPx) return;
    const nextDelta = nextPx - base;
    setter({ ...label, fontSize: nextDelta });
    changed = true;
  };
  switch (activeLabel.kind) {
    case 'point': {
      const point = model.points[activeLabel.id];
      if (point?.label) {
        apply(point.label, (next) => {
          model.points[activeLabel.id].label = next;
        });
      }
      break;
    }
    case 'line': {
      const line = model.lines[activeLabel.id];
      if (line?.label) {
        apply(line.label, (next) => {
          model.lines[activeLabel.id].label = next;
        });
      }
      break;
    }
    case 'angle': {
      const angle = model.angles[activeLabel.id];
      if (angle?.label) {
        apply(angle.label, (next) => {
          model.angles[activeLabel.id].label = next;
        });
      }
      break;
    }
    case 'free': {
      const freeLabel = model.labels[activeLabel.id];
      if (freeLabel) {
        apply(freeLabel, (next) => {
          model.labels[activeLabel.id] = next;
        });
      }
      break;
    }
  }
  updateLabelFontControls();
  if (changed) {
    draw();
    pushHistory();
  }
  updateLineWidthControls();
}

function selectedLabelAlignment(): LabelAlignment | null {
  if (!selectedLabel) return null;
  const sel = selectedLabel;
  switch (sel.kind) {
    case 'point':
      return getLabelAlignment(model.points[sel.id]?.label);
    case 'line':
      return getLabelAlignment(model.lines[sel.id]?.label);
    case 'angle':
      return getLabelAlignment(model.angles[sel.id]?.label);
    case 'free':
      return getLabelAlignment(model.labels[sel.id]);
  }
}

function applySelectedLabelAlignment(nextAlign: LabelAlignment) {
  if (!selectedLabel) return;
  const sel = selectedLabel;
  let changed = false;
  const apply = <T extends { textAlign?: LabelAlignment }>(label: T, setter: (next: T) => void) => {
    const current = getLabelAlignment(label);
    if (current === nextAlign) return;
    setter({ ...label, textAlign: nextAlign });
    changed = true;
  };
  switch (sel.kind) {
    case 'point': {
      const point = model.points[sel.id];
      if (point?.label) apply(point.label, (next) => (model.points[sel.id].label = next));
      break;
    }
    case 'line': {
      const line = model.lines[sel.id];
      if (line?.label) apply(line.label, (next) => (model.lines[sel.id].label = next));
      break;
    }
    case 'angle': {
      const angle = model.angles[sel.id];
      if (angle?.label) apply(angle.label, (next) => (model.angles[sel.id].label = next));
      break;
    }
    case 'free': {
      const lab = model.labels[sel.id];
      if (lab) apply(lab, (next) => (model.labels[sel.id] = next));
      break;
    }
  }
  if (changed) {
    draw();
    pushHistory();
  }
}

function updateLabelAlignControl() {
  if (!labelAlignToggleBtn) return;
  const align = selectedLabelAlignment() ?? DEFAULT_LABEL_ALIGNMENT;
  labelAlignToggleBtn.innerHTML = align === 'left' ? LABEL_ALIGN_ICON_LEFT : LABEL_ALIGN_ICON_CENTER;
  labelAlignToggleBtn.setAttribute('aria-pressed', align === 'left' ? 'true' : 'false');
  labelAlignToggleBtn.title =
    align === 'left' ? 'Wyrównanie etykiety: do lewej' : 'Wyrównanie etykiety: do środka';
  labelAlignToggleBtn.disabled = !selectedLabel;
}

function updateLineWidthControls() {
  if (!styleWidthInput) return;
  const min = Number(styleWidthInput.min) || 0.1;
  const max = Number(styleWidthInput.max) || 50;
  const raw = Number(styleWidthInput.value);
  const current = clamp(Number.isFinite(raw) ? Math.round(raw * 10) / 10 : min, min, max);
  if (styleWidthInput.value !== String(current)) styleWidthInput.value = String(current);
  const disabled = styleWidthInput.disabled;
  if (lineWidthValueDisplay) {
    lineWidthValueDisplay.textContent = disabled ? '—' : `${current} px`;
  }
  const defaultWidth = styleTypeSelect?.disabled ? THEME.pointSize : THEME.lineWidth;
  if (lineWidthDecreaseBtn) {
    const atMin = current <= min;
    lineWidthDecreaseBtn.disabled = disabled || atMin;
    lineWidthDecreaseBtn.classList.toggle('limit', atMin);
    lineWidthDecreaseBtn.classList.toggle('active', !disabled && current < defaultWidth);
  }
  if (lineWidthIncreaseBtn) {
    const atMax = current >= max;
    lineWidthIncreaseBtn.disabled = disabled || atMax;
    lineWidthIncreaseBtn.classList.toggle('limit', atMax);
    lineWidthIncreaseBtn.classList.toggle('active', !disabled && current > defaultWidth);
  }
}

function adjustLineWidth(delta: number) {
  if (!styleWidthInput || delta === 0) {
    updateLineWidthControls();
    return;
  }
  if (styleWidthInput.disabled) {
    updateLineWidthControls();
    return;
  }
  const min = Number(styleWidthInput.min) || 0.1;
  const max = Number(styleWidthInput.max) || 50;
  const current = Number(styleWidthInput.value) || min;
  // Use the input's configured step when available (highlighter forces step to '5')
  const inputStep = Number(styleWidthInput.step) || 0.1;
  // Perform a safe numeric increment and round to 3 decimals to avoid float noise
  const rawNext = current + delta * inputStep;
  const next = clamp(Number(rawNext.toFixed(3)), min, max);
  if (next === current) {
    updateLineWidthControls();
    return;
  }
  styleWidthInput.value = String(next);
  applyStyleFromInputs();
  updateLineWidthControls();
}

function getTickStateForSelection(labelEditing: boolean): {
  available: boolean;
  state: TickLevel;
  mixed: boolean;
} {
  if (labelEditing) return { available: false, state: 0, mixed: false };
  if (selectedLineIndex !== null || selectedPolygonIndex !== null) {
    const lines = new Set<number>();
    if (selectedLineIndex !== null) lines.add(selectedLineIndex);
    if (selectedPolygonIndex !== null) {
      const poly = polygonGet(selectedPolygonIndex);
      poly?.lines.forEach((li) => lines.add(li));
    }
    const ticks: TickLevel[] = [];
    lines.forEach((lineIdx) => {
      const line = model.lines[lineIdx];
      if (!line) return;
      const segCount = Math.max(0, line.points.length - 1);
      ensureSegmentStylesForLine(lineIdx);
      const allSegments = selectedSegments.size === 0;
      for (let i = 0; i < segCount; i++) {
        const key = segmentKey(lineIdx, 'segment', i);
        if (!allSegments && !selectedSegments.has(key)) continue;
        const style = line.segmentStyles?.[i] ?? line.style;
        ticks.push(style.tick ?? 0);
      }
    });
    if (!ticks.length) return { available: true, state: 0, mixed: false };
    const first = ticks[0];
    const mixed = ticks.some((t) => t !== first);
    return { available: true, state: mixed ? 0 : first ?? 0, mixed };
  }
  if (selectedCircleIndex !== null) {
    const circleIdx = selectedCircleIndex;
    const arcs = circleArcs(circleIdx);
    ensureArcStyles(circleIdx, arcs.length);
    const circleStyle = model.circles[circleIdx]?.style;
    const ticks: TickLevel[] = [];
    arcs.forEach((arc) => {
      const key = arc.key;
      if (selectedArcSegments.size > 0 && !selectedArcSegments.has(key)) return;
      const baseTick = circleStyle?.tick ?? 0;
      ticks.push((arc.style.tick ?? baseTick) as TickLevel);
    });
    if (!ticks.length) return { available: true, state: 0, mixed: false };
    const first = ticks[0];
    const mixed = ticks.some((t) => t !== first);
    return { available: true, state: mixed ? 0 : first ?? 0, mixed };
  }
  return { available: false, state: 0, mixed: false };
}

function applyTickState(nextTick: TickLevel) {
  let changed = false;
  const applyToSegment = (lineIdx: number, segIdx: number, tick: TickLevel) => {
    const line = model.lines[lineIdx];
    if (!line) return;
    ensureSegmentStylesForLine(lineIdx);
    if (!line.segmentStyles) line.segmentStyles = [];
    const base = line.segmentStyles[segIdx] ?? line.style;
    line.segmentStyles[segIdx] = { ...base, tick };
    changed = true;
  };
  const applyToLine = (lineIdx: number, tick: TickLevel) => {
    const line = model.lines[lineIdx];
    if (!line) return;
    ensureSegmentStylesForLine(lineIdx);
    const segCount = Math.max(0, line.points.length - 1);
    if (!line.segmentStyles) line.segmentStyles = [];
    line.style = { ...line.style, tick };
    changed = true;
    for (let i = 0; i < segCount; i++) {
      applyToSegment(lineIdx, i, tick);
    }
    line.leftRay = line.leftRay ? { ...line.leftRay, tick } : line.leftRay;
    line.rightRay = line.rightRay ? { ...line.rightRay, tick } : line.rightRay;
  };
  const applyToArc = (circleIdx: number, arcIdx: number, tick: TickLevel) => {
    ensureArcStyles(circleIdx, circleArcs(circleIdx).length);
    const circle = model.circles[circleIdx];
    if (!circle) return;
    const arcs = circleArcs(circleIdx);
    const arc = arcs[arcIdx];
    if (!arc) return;
    if (!circle.arcStyles) circle.arcStyles = {} as any;
    const key = arc.key;
    const base = (circle.arcStyles as any)[key] ?? circle.style;
    (circle.arcStyles as any)[key] = { ...base, tick };
    changed = true;
  };
  const applyToCircle = (circleIdx: number, tick: TickLevel) => {
    const circle = model.circles[circleIdx];
    if (!circle) return;
    ensureArcStyles(circleIdx, circleArcs(circleIdx).length);
    circle.style = { ...circle.style, tick };
    if (!circle.arcStyles) circle.arcStyles = {} as any;
    changed = true;
    const arcs = circleArcs(circleIdx);
    for (let i = 0; i < arcs.length; i++) {
      applyToArc(circleIdx, i, tick);
    }
  };

  if (selectedLineIndex !== null || selectedPolygonIndex !== null) {
    const lines = new Set<number>();
    if (selectedLineIndex !== null) lines.add(selectedLineIndex);
    if (selectedPolygonIndex !== null) {
      const poly = polygonGet(selectedPolygonIndex);
      poly?.lines.forEach((li) => lines.add(li));
    }
    lines.forEach((lineIdx) => {
      const line = model.lines[lineIdx];
      if (!line) return;
      const segCount = Math.max(0, line.points.length - 1);
      const specificSegments = selectedSegments.size > 0;
      if (!specificSegments) {
        applyToLine(lineIdx, nextTick);
        changed = true;
      } else {
        for (let i = 0; i < segCount; i++) {
          const key = segmentKey(lineIdx, 'segment', i);
          if (selectedSegments.has(key)) applyToSegment(lineIdx, i, nextTick);
        }
      }
    });
  } else if (selectedCircleIndex !== null) {
    const circleIdx = selectedCircleIndex;
    const arcs = circleArcs(circleIdx);
    const specificArcs = selectedArcSegments.size > 0;
    if (!specificArcs) {
      applyToCircle(circleIdx, nextTick);
      changed = true;
    } else {
      arcs.forEach((arc, idx) => {
        const key = arc.key;
        if (selectedArcSegments.has(key)) applyToArc(circleIdx, idx, nextTick);
      });
    }
  }

  if (changed) {
    draw();
    pushHistory();
    updateStyleMenuValues();
  }
}

function cycleTickState() {
  const tickInfo = getTickStateForSelection(false);
  if (!tickInfo.available) return;
  const current = tickInfo.mixed ? 0 : tickInfo.state;
  const next = ((current + 1) % 4) as TickLevel;
  applyTickState(next);
}

function collectPointStyleTargets(): number[] {
  const targets = new Set<number>();
  multiSelectedPoints.forEach((idx) => targets.add(idx));
  if (selectedPointIndex !== null) targets.add(selectedPointIndex);

  if (selectionVertices) {
    if (selectedLineIndex !== null) {
      const line = model.lines[selectedLineIndex];
      line?.points.forEach((pi) => targets.add(pi));
    }
    if (selectedPolygonIndex !== null) {
      const poly = polygonGet(selectedPolygonIndex);
      poly?.lines.forEach((li) => {
        const line = model.lines[li];
        line?.points.forEach((pi) => targets.add(pi));
      });
    }
    if (selectedCircleIndex !== null) {
      const circle = model.circles[selectedCircleIndex];
      if (circle) {
        circlePerimeterPoints(circle).forEach((pi) => targets.add(pi));
        targets.add(circle.center);
        targets.add(circle.radius_point);
      }
    }
  }

  return Array.from(targets).filter((idx) => typeof idx === 'number');
}

function toggleSelectedPointsHollow(force?: boolean) {
  const targets = collectPointStyleTargets();
  if (!targets.length) return;
  const allHollow = targets.every((idx) => !!model.points[idx]?.style.hollow);
  const desired = force === undefined ? !allHollow : force;
  let changed = false;
  targets.forEach((idx) => {
    const pt = model.points[idx];
    if (!pt) return;
    if (!!pt.style.hollow === desired) return;
    model.points[idx] = { ...pt, style: { ...pt.style, hollow: desired } };
    changed = true;
  });
  if (changed) {
    draw();
    pushHistory();
    updateStyleMenuValues();
  }
}

function updateStyleMenuValues() {
  if (!styleColorInput || !styleWidthInput || !styleTypeSelect) return;
  const polygonIdxForLine = (lineIdx: number): number | null => polygonForLine(lineIdx);
  const setRowVisible = (row: HTMLElement | null, visible: boolean) => {
    if (!row) return;
    row.style.display = visible ? 'flex' : 'none';
  };
  if (angleRadiusIncreaseBtn) {
    angleRadiusIncreaseBtn.disabled = true;
    angleRadiusIncreaseBtn.classList.remove('active');
    angleRadiusIncreaseBtn.classList.remove('limit');
  }
  if (angleRadiusDecreaseBtn) {
    angleRadiusDecreaseBtn.disabled = true;
    angleRadiusDecreaseBtn.classList.remove('active');
    angleRadiusDecreaseBtn.classList.remove('limit');
  }
  const labelEditing = selectedLabel !== null;
  const impliedPolygonIndex =
    selectedPolygonIndex !== null
      ? selectedPolygonIndex
      : selectedLineIndex !== null
      ? polygonIdxForLine(selectedLineIndex)
      : null;
  const fillAvailable = !labelEditing && (selectedCircleIndex !== null || impliedPolygonIndex !== null);
  const fillActive =
    (selectedCircleIndex !== null && model.circles[selectedCircleIndex]?.fillOpacity !== undefined) ||
    (impliedPolygonIndex !== null && polygonGet(impliedPolygonIndex)?.fillOpacity !== undefined);

  if (fillToggleBtn) {
    fillToggleBtn.style.display = fillAvailable ? 'inline-flex' : 'none';
    fillToggleBtn.classList.toggle('active', !!fillActive);
    fillToggleBtn.setAttribute('aria-pressed', fillActive ? 'true' : 'false');
    const badge = fillToggleBtn.querySelector('.fill-perc') as HTMLElement | null;
    if (badge) {
      let val: number | undefined = undefined;
      if (selectedCircleIndex !== null) val = model.circles[selectedCircleIndex]?.fillOpacity as number | undefined;
      else if (impliedPolygonIndex !== null) val = polygonGet(impliedPolygonIndex)?.fillOpacity as number | undefined;
      if (val === undefined) {
        badge.classList.add('hidden');
        badge.textContent = '';
      } else {
        badge.classList.remove('hidden');
        badge.textContent = `${Math.round((val || 0) * 100)}%`;
      }
    }
  }
  const pointTargets = collectPointStyleTargets();
  if (pointHollowToggleBtn) {
    const showPointToggle = !labelEditing && pointTargets.length > 0;
    pointHollowToggleBtn.style.display = showPointToggle ? 'inline-flex' : 'none';
    if (showPointToggle) {
      const allHollow = pointTargets.every((idx) => !!model.points[idx]?.style.hollow);
      pointHollowToggleBtn.classList.toggle('active', allHollow);
      pointHollowToggleBtn.setAttribute('aria-pressed', allHollow ? 'true' : 'false');
    } else {
      pointHollowToggleBtn.classList.remove('active');
      pointHollowToggleBtn.setAttribute('aria-pressed', 'false');
    }
  }
  const selectedPolygonLines =
    selectedPolygonIndex !== null ? polygonLines(selectedPolygonIndex) : [];
  const lineIdxForStyle =
    selectedLineIndex !== null ? selectedLineIndex : selectedPolygonLines.length ? selectedPolygonLines[0] : null;
  const isPoint = selectedPointIndex !== null;
  const isLineLike = selectedLineIndex !== null || selectedPolygonIndex !== null;
  const preferPoints = selectionVertices && (!selectionEdges || selectedSegments.size > 0);
  const editingInk = selectedInkStrokeIndex !== null || mode === 'handwriting';
  if (labelTextRow) labelTextRow.style.display = labelEditing ? 'flex' : 'none';
  if (labelFontRow) labelFontRow.style.display = labelEditing ? 'flex' : 'none';
  refreshLabelKeyboard(labelEditing);
  updateLabelFontControls();
  updateLabelAlignControl();

  if (labelEditing && selectedLabel) {
    let labelColor = styleColorInput.value;
    let text = '';
    switch (selectedLabel.kind) {
      case 'point':
        labelColor = model.points[selectedLabel.id]?.label?.color ?? labelColor;
        text = model.points[selectedLabel.id]?.label?.text ?? '';
        break;
      case 'line':
        labelColor = model.lines[selectedLabel.id]?.label?.color ?? labelColor;
        text = model.lines[selectedLabel.id]?.label?.text ?? '';
        break;
      case 'angle':
        labelColor = model.angles[selectedLabel.id]?.label?.color ?? labelColor;
        text = model.angles[selectedLabel.id]?.label?.text ?? '';
        break;
      case 'free':
        labelColor = model.labels[selectedLabel.id]?.color ?? labelColor;
        text = model.labels[selectedLabel.id]?.text ?? '';
        break;
    }
    styleColorInput.value = labelColor;
    if (labelTextInput) labelTextInput.value = text;
    styleWidthInput.disabled = true;
    styleTypeSelect.disabled = true;
  } else if (lineIdxForStyle !== null) {
    const line = model.lines[lineIdxForStyle];
    const style = line.segmentStyles?.[0] ?? line.style;
    if (preferPoints) {
      const ptIdx = line.points[0];
      const pt = ptIdx !== undefined ? model.points[ptIdx] : null;
      const base = pt ?? { style: { color: style.color, size: THEME.pointSize } as PointStyle };
      styleColorInput.value = base.style.color;
      styleWidthInput.value = String(base.style.size);
      styleTypeSelect.value = 'solid';
      styleWidthInput.disabled = false;
      styleTypeSelect.disabled = true;
    } else {
      styleColorInput.value = style.color;
      styleWidthInput.value = String(style.width);
      styleTypeSelect.value = style.type;
      styleWidthInput.disabled = false;
      styleTypeSelect.disabled = false;
    }
  } else if (selectedCircleIndex !== null) {
    const c = model.circles[selectedCircleIndex];
    const arcs = circleArcs(selectedCircleIndex!);
    const style =
      selectedArcSegments.size > 0
        ? (() => {
            const key = Array.from(selectedArcSegments)[0];
            const parsed = parseArcKey(key);
            if (parsed && parsed.circle === selectedCircleIndex && arcs[parsed.arcIdx]) {
              return arcs[parsed.arcIdx].style;
            }
            return c.style;
          })()
        : c.style;
    styleColorInput.value = style.color;
    styleWidthInput.value = String(style.width);
    styleTypeSelect.value = style.type;
    styleWidthInput.disabled = false;
    styleTypeSelect.disabled = false;
  } else if (selectedAngleIndex !== null) {
    const ang = model.angles[selectedAngleIndex];
    const style = ang.style;
    styleColorInput.value = style.color;
    styleWidthInput.value = String(style.width);
    styleTypeSelect.value = style.type;
    styleWidthInput.disabled = false;
    styleTypeSelect.disabled = false;
    arcCountButtons.forEach((btn) => {
      const count = Number(btn.dataset.count) || 1;
      btn.classList.toggle('active', count === (style.arcCount ?? 1));
    });
    if (rightAngleBtn) {
      rightAngleBtn.classList.toggle('active', !!style.right);
      if (style.right) arcCountButtons.forEach((b) => b.classList.remove('active'));
    }
    if (exteriorAngleBtn) {
      exteriorAngleBtn.classList.toggle('active', !!style.exterior);
      exteriorAngleBtn.setAttribute('aria-pressed', style.exterior ? 'true' : 'false');
    }
    const baseGeom = angleBaseGeometry(ang);
    const actualGeom = angleGeometry(ang);
    const offset = style.arcRadiusOffset ?? 0;
    const hasRadius = !!(baseGeom && actualGeom);
    let atMin = false;
    let atMax = false;
    if (baseGeom && actualGeom) {
      atMin = actualGeom.radius <= baseGeom.minRadius + ANGLE_RADIUS_EPSILON;
      atMax = actualGeom.radius >= baseGeom.maxRadius - ANGLE_RADIUS_EPSILON;
    }
    if (angleRadiusIncreaseBtn) {
      angleRadiusIncreaseBtn.disabled = !hasRadius || atMax;
      angleRadiusIncreaseBtn.classList.toggle('active', offset > 0);
      angleRadiusIncreaseBtn.classList.toggle('limit', hasRadius && atMax);
    }
    if (angleRadiusDecreaseBtn) {
      angleRadiusDecreaseBtn.disabled = !hasRadius || atMin;
      angleRadiusDecreaseBtn.classList.toggle('active', offset < 0);
      angleRadiusDecreaseBtn.classList.toggle('limit', hasRadius && atMin);
    }
  } else if (selectedPointIndex !== null) {
    const pt = model.points[selectedPointIndex];
    styleColorInput.value = pt.style.color;
    styleWidthInput.value = String(pt.style.size);
    styleTypeSelect.value = 'solid';
    styleWidthInput.disabled = false;
    styleTypeSelect.disabled = true;
  } else if (selectedInkStrokeIndex !== null) {
    const stroke = model.inkStrokes[selectedInkStrokeIndex];
    if (stroke) {
      styleColorInput.value = stroke.color;
      styleWidthInput.value = String(stroke.baseWidth);
      styleTypeSelect.value = 'solid';
      styleWidthInput.disabled = false;
      styleTypeSelect.disabled = true;
    }
  } else if (preferPoints && selectedLineIndex !== null) {
    const line = model.lines[selectedLineIndex];
    const firstPt = line?.points[0];
    const pt = firstPt !== undefined ? model.points[firstPt] : null;
    const base = pt ?? { style: { color: styleColorInput.value, size: THEME.pointSize } as PointStyle };
    styleColorInput.value = base.style.color;
    styleWidthInput.value = String(base.style.size);
    styleTypeSelect.value = 'solid';
    styleWidthInput.disabled = false;
    styleTypeSelect.disabled = true;
  } else if (preferPoints && selectedPolygonIndex !== null) {
    const verts = polygonVerticesOrdered(selectedPolygonIndex);
    const firstPt = verts[0] !== undefined ? model.points[verts[0]] : null;
    const base = firstPt ?? { style: { color: styleColorInput.value, size: THEME.pointSize } as PointStyle };
    styleColorInput.value = base.style.color;
    styleWidthInput.value = String(base.style.size);
    styleTypeSelect.value = 'solid';
    styleWidthInput.disabled = false;
    styleTypeSelect.disabled = true;
  }
  updateLineWidthControls();
  const showTypeGroup = !isPoint && !labelEditing && selectedInkStrokeIndex === null && mode !== 'handwriting';
  if (styleTypeInline) {
    styleTypeInline.style.display = showTypeGroup ? 'inline-flex' : 'none';
    setRowVisible(styleTypeRow, false);
  } else {
    setRowVisible(styleTypeRow, showTypeGroup);
  }
  if (styleTypeGap) styleTypeGap.style.display = showTypeGroup ? 'flex' : 'none';
  const showRays = selectedLineIndex !== null && !labelEditing;
  if (styleRayGroup) styleRayGroup.style.display = showRays ? 'flex' : 'none';
  const tickInfo = getTickStateForSelection(labelEditing);
  const tickVisible = tickInfo.available && !labelEditing;
  if (styleTickGroup) styleTickGroup.style.display = tickVisible ? 'flex' : 'none';
  if (styleTickButton) {
    styleTickButton.disabled = !tickVisible;
    const iconState = (tickInfo.mixed || tickInfo.state === 0 ? 1 : tickInfo.state) as 1 | 2 | 3;
    const iconMarkup = iconState === 3 ? ICONS.tick3 : iconState === 2 ? ICONS.tick2 : ICONS.tick1;
    styleTickButton.innerHTML = iconMarkup;
    styleTickButton.classList.toggle('active', tickInfo.state > 0 && !tickInfo.mixed);
    styleTickButton.classList.toggle('mixed', tickInfo.mixed);
    styleTickButton.setAttribute('aria-pressed', tickInfo.state > 0 && !tickInfo.mixed ? 'true' : 'false');
    styleTickButton.dataset.tickState = tickInfo.mixed ? 'mixed' : String(tickInfo.state);
    const tickTitle = tickInfo.mixed
      ? 'Znacznik zgodności: różne'
      : tickInfo.state === 0
      ? 'Znacznik zgodności: brak'
      : tickInfo.state === 1
      ? 'Znacznik zgodności: pojedynczy'
      : tickInfo.state === 2
      ? 'Znacznik zgodności: podwójny'
      : 'Znacznik zgodności: potrójny';
    styleTickButton.title = tickTitle;
    styleTickButton.setAttribute('aria-label', tickTitle);
  }
  setRowVisible(styleArcRow, selectedAngleIndex !== null && !labelEditing);
  setRowVisible(styleHideRow, !labelEditing);
  setRowVisible(styleEdgesRow, isLineLike && !labelEditing);
  const styleCircleRow = document.getElementById('styleCircleRow');
  setRowVisible(styleCircleRow, selectedCircleIndex !== null && !labelEditing);
  setRowVisible(styleColorRow, true);
  setRowVisible(styleWidthRow, !labelEditing);
  // Show highlighter alpha control only when highlighter mode is active AND we're editing handwriting
  setRowVisible(styleHighlighterAlphaRow, highlighterActive && editingInk && !labelEditing);
  if (highlighterActive && editingInk && highlighterAlphaInput) {
    highlighterAlphaInput.value = String(highlighterAlpha);
    if (highlighterAlphaValueDisplay) highlighterAlphaValueDisplay.textContent = `${Math.round(highlighterAlpha * 100)}%`;
  }
  // If highlighter is active and we're editing handwriting, force width controls to highlighter defaults
  if (highlighterActive && editingInk && styleWidthInput) {
    styleWidthInput.step = '5';
    styleWidthInput.value = '20';
  } else if (styleWidthInput) {
    styleWidthInput.step = '0.1';
  }
  // Show/hide exterior angle button
  if (exteriorAngleBtn) {
    exteriorAngleBtn.style.display = selectedAngleIndex !== null && !labelEditing ? '' : 'none';
  }
  // sync toggles
  const typeVal = styleTypeSelect?.value;
  styleTypeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === typeVal);
  });
  const viewVerticesBtn = document.getElementById('viewVerticesOption');
  const viewEdgesBtn = document.getElementById('viewEdgesOption');
  if (viewVerticesBtn && viewEdgesBtn) {
    const mode = getViewModeState();
    const verticesActive = mode === 'vertices' || mode === 'both';
    const edgesActive = mode === 'edges' || mode === 'both';
    viewVerticesBtn.classList.toggle('active', verticesActive);
    viewEdgesBtn.classList.toggle('active', edgesActive);
  }
  const viewCirclePointsBtn = document.getElementById('viewCirclePointsOption');
  const viewCircleLineBtn = document.getElementById('viewCircleLineOption');
  if (viewCirclePointsBtn && viewCircleLineBtn) {
    const mode = getViewModeState();
    const verticesActive = mode === 'vertices' || mode === 'both';
    const edgesActive = mode === 'edges' || mode === 'both';
    viewCirclePointsBtn.classList.toggle('active', verticesActive);
    viewCircleLineBtn.classList.toggle('active', edgesActive);
  }
  if (selectedLineIndex !== null && raySegmentBtn && rayLeftBtn && rayRightBtn) {
    const line = model.lines[selectedLineIndex];
    const leftOn = !!line.leftRay && !line.leftRay.hidden;
    const rightOn = !!line.rightRay && !line.rightRay.hidden;
    const segmentOn = !leftOn && !rightOn;
    raySegmentBtn.classList.toggle('active', segmentOn);
    rayLeftBtn.classList.toggle('active', leftOn);
    rayRightBtn.classList.toggle('active', rightOn);
  }
  updateColorButtons();
}

function setTheme(theme: ThemeName) {
  currentTheme = theme;
  const body = document.body;
  const root = document.documentElement;
  body?.classList.remove('theme-dark', 'theme-light');
  root?.classList.remove('theme-dark', 'theme-light');
  applyThemeWithOverrides(theme);
  const palette = THEME.palette;
  if (theme === 'light') {
    body?.classList.add('theme-light');
    root?.classList.add('theme-light');
  } else {
    body?.classList.add('theme-dark');
    root?.classList.add('theme-dark');
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage failures
    }
  }
  HIGHLIGHT_LINE.color = THEME.highlight;
  HIGHLIGHT_LINE.width = THEME.highlightWidth;
  if (strokeColorInput) strokeColorInput.value = palette[0] ?? THEME.defaultStroke;
  if (styleWidthInput) styleWidthInput.value = String(THEME.lineWidth);
  if (!recentColors.length) recentColors = palette.length ? [palette[0]] : [THEME.defaultStroke];
  updateOptionButtons();
  updateColorButtons();
  // Update any model objects that were flagged to follow theme background color
  try {
    const applyBgFlag = (style: any) => {
      if (!style || typeof style !== 'object') return;
      if ((style as any).colorIsThemeBg) style.color = THEME.bg;
    };
    model.points.forEach((p) => applyBgFlag((p as any).style));
    model.lines.forEach((l: any) => {
      applyBgFlag(l.style);
      if (Array.isArray(l.segmentStyles)) l.segmentStyles.forEach((s: any) => applyBgFlag(s));
      if (l.leftRay) applyBgFlag(l.leftRay);
      if (l.rightRay) applyBgFlag(l.rightRay);
    });
    model.circles.forEach((c: any) => { applyBgFlag(c.style); if (c.fillIsThemeBg) c.fill = THEME.bg; });
    model.angles.forEach((a: any) => applyBgFlag(a.style));
    model.polygons.forEach((p: any, idx: number) => {
      if ((p as any).fillIsThemeBg) {
        polygonSet(idx, (old) => ({ ...old!, fill: THEME.bg } as Polygon));
      }
    });
  } catch {}
  draw();
}

function applyStyleFromInputs() {
  if (!styleColorInput || !styleWidthInput || !styleTypeSelect) return;
  const rawColor = styleColorInput.value;
  // If the user explicitly picked the theme background, apply fully transparent
  // color instead of the background hex to avoid theme-tracking complexity.
  const color = normalizeColor(rawColor) === normalizeColor(THEME.bg) ? 'transparent' : rawColor;
  // Remember the raw chosen color (so recentColors/history still reflects the selection)
  rememberColor(rawColor);
  const width = Number(styleWidthInput.value) || 1;
  const type = styleTypeSelect.value as StrokeStyle['type'];
  let changed = false;
  const applyPointStyle = (pointIdx: number) => {
    const pt = model.points[pointIdx];
    if (!pt) return;
    model.points[pointIdx] = { ...pt, style: { ...pt.style, color, size: width } };
    changed = true;
  };
  const applyPointsForLine = (lineIdx: number) => {
    if (!selectionVertices) return;
    const line = model.lines[lineIdx];
    if (!line) return;
    const seen = new Set<number>();
    line.points.forEach((pi) => {
      if (seen.has(pi)) return;
      seen.add(pi);
      applyPointStyle(pi);
    });
  };
  const applyPointsForPolygon = (polyIdx: number) => {
    if (!selectionVertices) return;
    const poly = polygonGet(polyIdx);
    if (!poly) return;
    const seen = new Set<number>();
    poly.lines.forEach((li) => {
      const line = model.lines[li];
      line?.points.forEach((pi) => {
        if (seen.has(pi)) return;
        seen.add(pi);
        applyPointStyle(pi);
      });
    });
  };
  if (selectedLabel) {
    switch (selectedLabel.kind) {
      case 'point':
        if (model.points[selectedLabel.id]?.label) {
          model.points[selectedLabel.id].label = { ...model.points[selectedLabel.id].label!, color };
          changed = true;
        }
        break;
      case 'line':
        if (model.lines[selectedLabel.id]?.label) {
          model.lines[selectedLabel.id].label = { ...model.lines[selectedLabel.id].label!, color };
          changed = true;
        }
        break;
      case 'angle':
        if (model.angles[selectedLabel.id]?.label) {
          model.angles[selectedLabel.id].label = { ...model.angles[selectedLabel.id].label!, color };
          changed = true;
        }
        break;
      case 'free':
        if (model.labels[selectedLabel.id]) {
          model.labels[selectedLabel.id] = { ...model.labels[selectedLabel.id], color };
          changed = true;
        }
        break;
    }
    if (changed) {
      draw();
      pushHistory();
    }
    return;
  }
  const applyStyleToLine = (lineIdx: number) => {
    const canStyleLine = selectionEdges || selectedSegments.size > 0;
    if (!canStyleLine) return;
    ensureSegmentStylesForLine(lineIdx);
    const line = model.lines[lineIdx];
    const segCount = Math.max(0, line.points.length - 1);
    if (!line.segmentStyles || line.segmentStyles.length !== segCount) {
      line.segmentStyles = Array.from({ length: segCount }, () => ({ ...line.style }));
    }
    const updateSegment = (segIdx: number) => {
      if (!line.segmentStyles) line.segmentStyles = [];
      line.segmentStyles[segIdx] = { ...(line.segmentStyles[segIdx] ?? line.style), color, width, type };
      changed = true;
    };
    const updateRay = (side: 'left' | 'right') => {
      const src = side === 'left' ? line.leftRay : line.rightRay;
      const updated = { ...(src ?? line.style), color, width, type };
      if (side === 'left') line.leftRay = updated;
      else line.rightRay = updated;
      changed = true;
    };

    if (selectedSegments.size > 0) {
      selectedSegments.forEach((key) => {
        const parsed = parseSegmentKey(key);
        if (!parsed || parsed.line !== lineIdx) return;
        if (parsed.part === 'segment' && parsed.seg !== undefined) {
          updateSegment(parsed.seg);
        } else if (parsed.part === 'rayLeft') {
          updateRay('left');
        } else if (parsed.part === 'rayRight') {
          updateRay('right');
        }
      });
    } else {
      line.style = { ...line.style, color, width, type };
      for (let i = 0; i < segCount; i++) {
        updateSegment(i);
      }
      if (line.leftRay) line.leftRay = { ...line.leftRay, color, width, type };
      if (line.rightRay) line.rightRay = { ...line.rightRay, color, width, type };
    }
  };
    if (selectedLineIndex !== null || selectedPolygonIndex !== null) {
    if (selectedPolygonIndex !== null) {
      const poly = polygonGet(selectedPolygonIndex);
      poly?.lines.forEach((li) => {
        applyStyleToLine(li);
        applyPointsForLine(li);
      });
      if (poly) applyPointsForPolygon(selectedPolygonIndex);
      if (poly?.fill !== undefined && poly.fill !== color) {
        polygonSet(selectedPolygonIndex, (old) => ({ ...old!, fill: color } as Polygon));
        changed = true;
      }
    }
    if (selectedLineIndex !== null) {
      applyStyleToLine(selectedLineIndex);
      applyPointsForLine(selectedLineIndex);

      // If the selected line belongs to a polygon that already has fill, keep the fill color in sync.
      const polyIdx = polygonForLine(selectedLineIndex!);
      if (polyIdx !== null) {
        const poly = polygonGet(polyIdx);
        if (poly?.fill !== undefined && poly.fill !== color) {
          polygonSet(polyIdx, (old) => ({ ...old!, fill: color } as Polygon));
          changed = true;
        }
      }
    }
  } else if (selectedCircleIndex !== null) {
    const c = model.circles[selectedCircleIndex!];
    const arcs = circleArcs(selectedCircleIndex!);
    const segCount = arcs.length;
    ensureArcStyles(selectedCircleIndex!, segCount);
    if (c.fill !== undefined && c.fill !== color) {
      c.fill = color;
      changed = true;
    }
    const applyArc = (arcIdx: number) => {
      const arcs = circleArcs(selectedCircleIndex!);
      const arc = arcs[arcIdx];
      if (!arc) return;
      if (!c.arcStyles || Array.isArray(c.arcStyles)) c.arcStyles = {} as any;
      const k = arc.key;
      const prev = (c.arcStyles as any)[k] ?? c.style;
      (c.arcStyles as any)[k] = { ...(prev ?? c.style), color, width, type };
      changed = true;
    };
    if (selectedArcSegments.size > 0) {
      selectedArcSegments.forEach((key) => {
        const parsed = parseArcKey(key);
        if (!parsed || parsed.circle !== selectedCircleIndex) return;
        if (parsed.arcIdx >= 0 && parsed.arcIdx < segCount) applyArc(parsed.arcIdx);
      });
    } else {
      c.style = { ...c.style, color, width, type };
      changed = true;
      for (let i = 0; i < segCount; i++) applyArc(i);
    }
  } else if (selectedAngleIndex !== null) {
    const ang = model.angles[selectedAngleIndex];
    const arcBtn = arcCountButtons.find((b) => b.classList.contains('active'));
    const arcCount = arcBtn ? Number(arcBtn.dataset.count) || 1 : ang.style.arcCount ?? 1;
    const right = rightAngleBtn ? rightAngleBtn.classList.contains('active') : false;
    model.angles[selectedAngleIndex] = { ...ang, style: { ...ang.style, color, width, type, arcCount, right } };
    changed = true;
  } else if (selectedPointIndex !== null) {
    const pt = model.points[selectedPointIndex];
    model.points[selectedPointIndex] = { ...pt, style: { ...pt.style, color, size: width } };
    changed = true;
  } else if (selectedInkStrokeIndex !== null) {
    const stroke = model.inkStrokes[selectedInkStrokeIndex];
    if (stroke) {
      model.inkStrokes[selectedInkStrokeIndex] = { ...stroke, color, baseWidth: width, opacity: highlighterActive ? highlighterAlpha : stroke.opacity };
      changed = true;
    }
  }
  else if (!changed && mode === 'handwriting') {
    // Update default handwriting style for new strokes
    inkBaseWidth = width;
    // when highlighter is active, ensure default width/step behavior
    if (highlighterActive) {
      // enforce base width for highlighter
      inkBaseWidth = Number(styleWidthInput?.value || 20);
    }
    // color is already taken from styleColorInput via currentInkColor()
  }
  if (changed) {
    draw();
    pushHistory();
  }
}

function addCircleWithCenter(centerIdx: number, radius: number, points: number[]) {
  const style = currentStrokeStyle();
  const center = model.points[centerIdx];
  const id = nextId('circle', model);
  if (!center) return -1;
  const assignedPoints = points.length ? [...points] : [addPoint(model, { x: center.x + radius, y: center.y, style: currentPointStyle() })];
  const adjustedPoints: number[] = [];
  assignedPoints.forEach((pid, i) => {
    const pt = model.points[pid];
    if (!pt) return;
    const angle = Math.atan2(pt.y - center.y, pt.x - center.x);
    const safeAngle = Number.isFinite(angle) ? angle : i * (Math.PI / 4);
    const pos = { x: center.x + Math.cos(safeAngle) * radius, y: center.y + Math.sin(safeAngle) * radius };
    model.points[pid] = { ...pt, ...pos };
    if (i > 0) adjustedPoints.push(pid);
  });
  const radiusPointIdx = assignedPoints[0];
  if (!Number.isFinite(radius) || radius < 1e-6) return -1;
  const circle: CircleWithCenter = {
    object_type: 'circle',
    id,
    center: centerIdx,
    radius_point: radiusPointIdx,
    points: adjustedPoints,
    style,
    circle_kind: 'center-radius',
    construction_kind: 'free',
    defining_parents: [],
    recompute: () => {},
    on_parent_deleted: () => {}
  };
  const circleIdx = model.circles.length;
  model.circles.push(circle);
  registerIndex(model, 'circle', id, circleIdx);
  // Don't change construction_kind of existing free points - they define the circle, but aren't constrained by it
  // Only mark additional points as on_object
  adjustedPoints.forEach((pid) => applyPointConstruction(pid, [{ kind: 'circle', id }]));
  return circleIdx;
}

function addCircleThroughPoints(definingPoints: [number, number, number]): number | null {
  const unique = Array.from(new Set(definingPoints));
  if (unique.length !== 3) return null;
  const [aIdx, bIdx, cIdx] = unique as [number, number, number];
  const a = model.points[aIdx];
  const b = model.points[bIdx];
  const c = model.points[cIdx];
  if (!a || !b || !c) return null;
  const centerPos = circleFromThree(a, b, c);
  if (!centerPos) return null;
  const centerIdx = addPoint(model, { ...centerPos, style: currentPointStyle() });
  const radius = Math.hypot(centerPos.x - a.x, centerPos.y - a.y);
  if (!Number.isFinite(radius) || radius < 1e-6) {
    removePointsKeepingOrder([centerIdx]);
    return null;
  }
  const style = currentStrokeStyle();
  const id = nextId('circle', model);
  const circle: CircleThroughPoints = {
    object_type: 'circle',
    id,
    center: centerIdx,
    radius_point: aIdx,
    points: [],
    style,
    circle_kind: 'three-point',
    defining_points: [aIdx, bIdx, cIdx],
    construction_kind: 'free',
    defining_parents: [],
    recompute: () => {},
    on_parent_deleted: () => {}
  };
  const circleIdx = model.circles.length;
  model.circles.push(circle);
  registerIndex(model, 'circle', id, circleIdx);
  return circleIdx;
}

function recomputeCircleThroughPoints(circleIdx: number) {
  const circle = model.circles[circleIdx];
  if (!circle || !isCircleThroughPoints(circle)) return;
  const [aIdx, bIdx, cIdx] = circle.defining_points;
  const a = model.points[aIdx];
  const b = model.points[bIdx];
  const c = model.points[cIdx];
  if (!a || !b || !c) return;
  const centerPos = circleFromThree(a, b, c);
  if (!centerPos) return;
  const newRadius = Math.hypot(centerPos.x - a.x, centerPos.y - a.y);
  if (!Number.isFinite(newRadius) || newRadius < 1e-6) return;
  const centerPoint = model.points[circle.center];
  if (centerPoint) {
    model.points[circle.center] = { ...centerPoint, x: centerPos.x, y: centerPos.y };
    updateMidpointsForPoint(circle.center);
  }
  circle.points.forEach((pid) => {
    if (circleHasDefiningPoint(circle, pid)) return;
    const pt = model.points[pid];
    if (!pt) return;
    const angle = Math.atan2(pt.y - centerPos.y, pt.x - centerPos.x);
    if (!Number.isFinite(angle)) return;
    const projected = {
      x: centerPos.x + Math.cos(angle) * newRadius,
      y: centerPos.y + Math.sin(angle) * newRadius
    };
    model.points[pid] = { ...pt, ...projected };
    updateMidpointsForPoint(pid);
  });
  updateIntersectionsForCircle(circleIdx);
}

function updateCirclesForPoint(pointIdx: number) {
  const handled = new Set<number>();
  model.circles.forEach((circle, ci) => {
    if (!isCircleThroughPoints(circle)) return;
    if (!circle.defining_points.includes(pointIdx)) return;
    if (handled.has(ci)) return;
    handled.add(ci);
    recomputeCircleThroughPoints(ci);
  });
  updateMidpointsForPoint(pointIdx);
}

function segmentsAdjacent(line: Line, aIdx: number, bIdx: number): boolean {
  for (let i = 0; i < line.points.length - 1; i++) {
    const p = line.points[i];
    const n = line.points[i + 1];
    if ((p === aIdx && n === bIdx) || (p === bIdx && n === aIdx)) return true;
  }
  return false;
}

function resolveBisectSegment(ref: BisectSegmentRef, vertexIdx: number): { lineIdx: number; otherIdx: number; length: number } | null {
  const lineIdx = lineIndexById(ref.lineId);
  if (lineIdx === null) return null;
  const line = model.lines[lineIdx];
  if (!line) return null;
  const aIdx = pointIndexById(ref.a);
  const bIdx = pointIndexById(ref.b);
  if (aIdx === null || bIdx === null) return null;
  if (!line.points.includes(aIdx) || !line.points.includes(bIdx)) return null;
  if (!segmentsAdjacent(line, aIdx, bIdx)) return null;
  if (aIdx !== vertexIdx && bIdx !== vertexIdx) return null;
  const otherIdx = aIdx === vertexIdx ? bIdx : bIdx === vertexIdx ? aIdx : null;
  if (otherIdx === null) return null;
  const vertex = model.points[vertexIdx];
  const other = model.points[otherIdx];
  if (!vertex || !other) return null;
  const length = Math.hypot(other.x - vertex.x, other.y - vertex.y);
  if (!Number.isFinite(length) || length < 1e-6) return null;
  return { lineIdx, otherIdx, length };
}

function recomputeMidpoint(pointIdx: number) {
  const point = model.points[pointIdx];
  if (!isMidpointPoint(point)) return;
  const mid = getMidpointMeta(point);
  if (!mid) return;
  const [parentAId, parentBId] = mid.parents;
  const parentAIdx = pointIndexById(parentAId);
  const parentBIdx = pointIndexById(parentBId);
  if (parentAIdx === null || parentBIdx === null) return;
  const parentA = model.points[parentAIdx];
  const parentB = model.points[parentBIdx];
  if (!parentA || !parentB) return;
  let target = {
    x: (parentA.x + parentB.x) / 2,
    y: (parentA.y + parentB.y) / 2
  };
  const parentLineId = mid.parentLineId ?? null;
  if (parentLineId) {
    const lineIdx = lineIndexById(parentLineId);
    if (lineIdx !== null) {
      target = constrainToLineIdx(lineIdx, target);
    }
  }
  const constrained = constrainToCircles(pointIdx, target);
  model.points[pointIdx] = { ...point, ...constrained };
  updateMidpointsForPoint(pointIdx);

  // Ensure any lines containing this midpoint are updated so their
  // dependent intersections react to the new midpoint position.
  const lines = findLinesContainingPoint(pointIdx);
  lines.forEach((lIdx) => {
    const line = model.lines[lIdx];
    if (!line) return;
    applyLineFractions(lIdx);
    updateIntersectionsForLine(lIdx);
    updateParallelLinesForLine(lIdx);
    updatePerpendicularLinesForLine(lIdx);
  });
}

function recomputeBisectPoint(pointIdx: number) {
  const point = model.points[pointIdx];
  if (!isBisectPoint(point)) return;
  const bm = getBisectMeta(point);
  if (!bm) return;
  const vertexIdx = pointIndexById(bm.vertex);
  if (vertexIdx === null) return;
  const vertex = model.points[vertexIdx];
  if (!vertex) return;
  const seg1 = resolveBisectSegment(bm.seg1, vertexIdx);
  const seg2 = resolveBisectSegment(bm.seg2, vertexIdx);
  if (!seg1 || !seg2) return;
  const other1 = model.points[seg1.otherIdx];
  const other2 = model.points[seg2.otherIdx];
  if (!other1 || !other2) return;
  const epsilon = bm.epsilon ?? BISECT_POINT_DISTANCE;
  const dist = Math.max(1e-6, Math.min(epsilon, seg1.length, seg2.length));
  const dir1 = normalize({ x: other1.x - vertex.x, y: other1.y - vertex.y });
  const dir2 = normalize({ x: other2.x - vertex.x, y: other2.y - vertex.y });
  const p1 = { x: vertex.x + dir1.x * dist, y: vertex.y + dir1.y * dist };
  const p2 = { x: vertex.x + dir2.x * dist, y: vertex.y + dir2.y * dist };
  const target = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  // If p1 and p2 coincide (or are extremely close) or their midpoint falls
  // effectively on top of the vertex (e.g. two opposite arms), nudge the
  // computed bisect target slightly perpendicular to one arm so the bisect
  // point remains visible and distinct.
  let finalTarget = target;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const sep = Math.hypot(dx, dy);
  const distToVertex = Math.hypot(target.x - vertex.x, target.y - vertex.y);
  if (sep < 1e-3 || distToVertex < 1e-3) {
    // perpendicular to first arm
    let perp = { x: -dir1.y, y: dir1.x };
    const plen = Math.hypot(perp.x, perp.y) || 1;
    perp.x /= plen;
    perp.y /= plen;
    // choose a small offset relative to epsilon/segment lengths
    const offset = Math.max(2, Math.min(6, (epsilon || 6) * 0.12));
    finalTarget = { x: finalTarget.x + perp.x * offset, y: finalTarget.y + perp.y * offset };
  }

  const constrained = constrainToCircles(pointIdx, finalTarget);
  model.points[pointIdx] = { ...point, ...constrained };
  updateMidpointsForPoint(pointIdx);
}

function reflectPointAcrossLine(source: { x: number; y: number }, line: Line): { x: number; y: number } | null {
  if (!line || line.points.length < 2) return null;
  const a = model.points[line.points[0]];
  const b = model.points[line.points[line.points.length - 1]];
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) return null;
  const t = ((source.x - a.x) * dx + (source.y - a.y) * dy) / lenSq;
  const proj = { x: a.x + dx * t, y: a.y + dy * t };
  return { x: 2 * proj.x - source.x, y: 2 * proj.y - source.y };
}

function recomputeSymmetricPoint(pointIdx: number) {
  const point = model.points[pointIdx];
  if (!isSymmetricPoint(point)) return;
  const sm = getSymmetricMeta(point);
  if (!sm) return;
  const sourceIdx = pointIndexById(sm.source);
  if (sourceIdx === null) return;
  const source = model.points[sourceIdx];
  if (!source) return;
  let target: { x: number; y: number } | null = null;
  if (sm.mirror.kind === 'point') {
    const mirrorIdx = pointIndexById(sm.mirror.id);
    if (mirrorIdx === null) return;
    const mirror = model.points[mirrorIdx];
    if (!mirror) return;
    target = { x: mirror.x * 2 - source.x, y: mirror.y * 2 - source.y };
  } else {
    const lineIdx = lineIndexById(sm.mirror.id);
    if (lineIdx === null) return;
    const line = model.lines[lineIdx];
    if (!line) return;
    target = reflectPointAcrossLine(source, line);
  }
  if (!target) return;
  const constrained = constrainToCircles(pointIdx, target);
  model.points[pointIdx] = { ...point, ...constrained };
  updateMidpointsForPoint(pointIdx);
}

function updateSymmetricPointsForLine(lineIdx: number) {
  const line = model.lines[lineIdx];
  if (!line) return;
  const lineId = line.id;
  model.points.forEach((pt, idx) => {
    if (!isSymmetricPoint(pt)) return;
    const sm = getSymmetricMeta(pt);
    if (!sm) return;
    if (sm.mirror.kind === 'line' && sm.mirror.id === lineId) recomputeSymmetricPoint(idx);
    
  });
}

function updateParallelLinesForPoint(pointIdx: number) {
  const point = model.points[pointIdx];
  if (!point) return;
  const pid = point.id;
  model.lines.forEach((line, li) => {
    if (!isParallelLine(line)) return;
    if (line.parallel.throughPoint === pid || line.parallel.helperPoint === pid) {
      recomputeParallelLine(li);
    }
  });
}

function updateParallelLinesForLine(lineIdx: number) {
  const line = model.lines[lineIdx];
  if (!line) return;
  const lineId = line.id;
  model.lines.forEach((other, idx) => {
    if (idx === lineIdx) return;
    if (isParallelLine(other) && other.parallel.referenceLine === lineId) {
      recomputeParallelLine(idx);
    }
  });
}

function updatePerpendicularLinesForPoint(pointIdx: number) {
  const point = model.points[pointIdx];
  if (!point) return;
  const pid = point.id;
  model.lines.forEach((line, li) => {
    if (!isPerpendicularLine(line)) return;
    if (line.perpendicular.throughPoint === pid || line.perpendicular.helperPoint === pid) {
      recomputePerpendicularLine(li);
    }
  });
}

function updatePerpendicularLinesForLine(lineIdx: number) {
  const line = model.lines[lineIdx];
  if (!line) return;
  const lineId = line.id;
  model.lines.forEach((other, idx) => {
    if (idx === lineIdx) return;
    if (isPerpendicularLine(other) && other.perpendicular.referenceLine === lineId) {
      recomputePerpendicularLine(idx);
    }
  });
}

function updateMidpointsForPoint(parentIdx: number) {
  const parent = model.points[parentIdx];
  if (!parent) return;
  const parentId = parent.id;
  model.points.forEach((pt, idx) => {
    if (isMidpointPoint(pt)) {
      const mm = getMidpointMeta(pt as Point);
      if (mm && (mm.parents[0] === parentId || mm.parents[1] === parentId)) recomputeMidpoint(idx);
    }
    if (isBisectPoint(pt)) {
      const bm = getBisectMeta(pt as Point);
      if (bm) {
        if (bm.vertex === parentId || bm.seg1.a === parentId || bm.seg1.b === parentId || bm.seg2.a === parentId || bm.seg2.b === parentId) {
          recomputeBisectPoint(idx);
        }
      }
    }
    if (isSymmetricPoint(pt)) {
      const sm = getSymmetricMeta(pt as Point);
      if (sm && (sm.source === parentId || (sm.mirror.kind === 'point' && sm.mirror.id === parentId))) recomputeSymmetricPoint(idx);
    }
  });
  updateParallelLinesForPoint(parentIdx);
  updatePerpendicularLinesForPoint(parentIdx);
}

function findCircles(
  p: { x: number; y: number },
  tolerance = currentHitRadius(),
  includeInterior = true
): CircleHit[] {
  const hits: CircleHit[] = [];
  for (let i = model.circles.length - 1; i >= 0; i--) {
    const c = model.circles[i];
    if (c.hidden && !showHidden) continue;
    const center = model.points[c.center];
    if (!center) continue;
    const radius = circleRadius(c);
    if (radius <= 0) continue;
    const dist = Math.hypot(center.x - p.x, center.y - p.y);
    if (Math.abs(dist - radius) <= tolerance || (includeInterior && dist <= radius)) {
      hits.push({ circle: i });
    }
  }
  return hits;
}

function findCircle(
  p: { x: number; y: number },
  tolerance = currentHitRadius(),
  includeInterior = true
): CircleHit | null {
  const hits = findCircles(p, tolerance, includeInterior);
  if (!hits.length) return null;
  // Prefer a circle hit that corresponds to a visible arc when the circle has explicit arcs.
  for (const h of hits) {
    const ci = h.circle;
    const arcs = circleArcs(ci);
    if (arcs.length === 0) return h; // full-circle strokes accept immediately
    const arcAtPos = findArcAt(p, tolerance, ci);
    if (arcAtPos) return h;
    // otherwise continue to next hit
  }
  return null;
}

function createOffsetLineThroughPoint(kind: 'parallel' | 'perpendicular', pointIdx: number, baseLineIdx: number) {
  if (kind === 'parallel') {
    return createParallelLineThroughPoint(pointIdx, baseLineIdx);
  }
  if (kind === 'perpendicular') {
    return createPerpendicularLineThroughPoint(pointIdx, baseLineIdx);
  }
  return null;
}

function primaryLineDirection(line: Line): { dir: { x: number; y: number }; length: number } | null {
  const candidateIdxs = [...line.defining_points, ...line.points];
  const seen = new Set<number>();
  let origin: Point | null = null;
  for (const idx of candidateIdxs) {
    if (idx === undefined) continue;
    if (seen.has(idx)) continue;
    seen.add(idx);
    const pt = model.points[idx];
    if (!pt) continue;
    if (!origin) {
      origin = pt;
      continue;
    }
    const dx = pt.x - origin.x;
    const dy = pt.y - origin.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      return { dir: { x: dx / len, y: dy / len }, length: len };
    }
  }
  return null;
}

function createParallelLineThroughPoint(pointIdx: number, baseLineIdx: number): number | null {
  const anchor = model.points[pointIdx];
  const baseLine = model.lines[baseLineIdx];
  if (!anchor || !baseLine) return null;
  if (!baseLine.id || !anchor.id) return null;
  const dirInfo = primaryLineDirection(baseLine);
  if (!dirInfo) return null;
  const baseLength = lineLength(baseLineIdx) ?? dirInfo.length;
  const helperDistance = 0.001;
  const helperPos = {
    x: anchor.x + dirInfo.dir.x * helperDistance,
    y: anchor.y + dirInfo.dir.y * helperDistance
  };
  const helperIdx = addPoint(model, {
    ...helperPos,
    style: { color: anchor.style.color, size: anchor.style.size, hidden: true },
    construction_kind: 'free'
  });
  const helperPoint = model.points[helperIdx];
  if (!helperPoint) return null;
  const baseStroke = baseLine.segmentStyles?.[0] ?? baseLine.style;
  const style: StrokeStyle = { ...baseStroke, hidden: false };
  const id = nextId('line', model);
  const meta: ParallelLineMeta = {
    throughPoint: anchor.id,
    referenceLine: baseLine.id,
    helperPoint: helperPoint.id
  };
  const parallelLine: ParallelLine = {
    object_type: 'line',
    id,
    points: [pointIdx, helperIdx],
    defining_points: [pointIdx, helperIdx],
    segmentStyles: [{ ...style }],
    segmentKeys: [segmentKeyForPoints(pointIdx, helperIdx)],
    leftRay: { ...style, hidden: false },
    rightRay: { ...style, hidden: false },
    style,
    hidden: false,
    construction_kind: 'parallel',
    defining_parents: [anchor.id, baseLine.id],
    parallel: meta,
    recompute: () => {},
    on_parent_deleted: () => {}
  };
  model.lines.push(parallelLine);
  const lineIdx = model.lines.length - 1;
  registerIndex(model, 'line', id, lineIdx);
  model.lines[lineIdx] = {
    ...parallelLine,
    recompute: () => recomputeParallelLine(lineIdx)
  } as ParallelLine;
  model.points[helperIdx] = { ...helperPoint, parallel_helper_for: id };
  applyPointConstruction(helperIdx, [{ kind: 'line', id }]);
  recomputeParallelLine(lineIdx);
  ensureSegmentStylesForLine(lineIdx);
  updateIntersectionsForLine(lineIdx);
  updateMidpointsForPoint(helperIdx);
  return lineIdx;
}

function createPerpendicularLineThroughPoint(pointIdx: number, baseLineIdx: number): number | null {
  const anchor = model.points[pointIdx];
  const baseLine = model.lines[baseLineIdx];
  if (!anchor || !baseLine) return null;
  if (!baseLine.id || !anchor.id) return null;
  const dirInfo = primaryLineDirection(baseLine);
  if (!dirInfo) return null;
  const baseLength = lineLength(baseLineIdx) ?? dirInfo.length;
  const baseNormal = { x: -dirInfo.dir.y, y: dirInfo.dir.x };
  const baseFirstIdx = baseLine.points[0];
  const baseLastIdx = baseLine.points[baseLine.points.length - 1];
  const baseFirst = baseFirstIdx !== undefined ? model.points[baseFirstIdx] : null;
  const baseLast = baseLastIdx !== undefined ? model.points[baseLastIdx] : null;
  const ON_LINE_EPS = 1e-3;
  
  let anchorOnBase = false;
  if (baseFirst) {
    const anchorVec = { x: anchor.x - baseFirst.x, y: anchor.y - baseFirst.y };
    const signedDistance = anchorVec.x * baseNormal.x + anchorVec.y * baseNormal.y;
    anchorOnBase = Math.abs(signedDistance) <= ON_LINE_EPS;
  }

  let helperMode: 'projection' | 'normal' = 'normal';
  let helperPos: { x: number; y: number } | null = null;
  let helperHidden = false;
  let forceRaysVisible = false;

  if (anchorOnBase) {
    const smallOffset = 1.0;
    helperPos = {
      x: anchor.x + baseNormal.x * smallOffset,
      y: anchor.y + baseNormal.y * smallOffset
    };
    helperMode = 'normal';
    helperHidden = true;
    forceRaysVisible = true;
  } else {
    if (baseFirst && baseLast) {
      const projected = projectPointOnLine(anchor, baseFirst, baseLast);
      const projDist = Math.hypot(projected.x - anchor.x, projected.y - anchor.y);
      if (projDist >= ON_LINE_EPS) {
        helperMode = 'projection';
        helperPos = projected;
      }
    }
    
    if (!helperPos) {
      const reflected = reflectPointAcrossLine(anchor, baseLine);
      helperPos = reflected;
      if (!helperPos || Math.hypot(helperPos.x - anchor.x, helperPos.y - anchor.y) < ON_LINE_EPS) {
        const fallback = baseLength > 1e-3 ? baseLength : 120;
        helperPos = {
          x: anchor.x + baseNormal.x * fallback,
          y: anchor.y + baseNormal.y * fallback
        };
        helperMode = 'normal';
      }
    }
  }

  const helperIdx = addPoint(model, {
    ...helperPos,
    style: { color: anchor.style.color, size: anchor.style.size, hidden: helperHidden },
    construction_kind: 'free'
  });
  if (helperMode === 'projection') {
    insertPointIntoLine(baseLineIdx, helperIdx, helperPos);
  }
  let helperPoint = model.points[helperIdx];
  if (!helperPoint) return null;
  const helperVector = { x: helperPoint.x - anchor.x, y: helperPoint.y - anchor.y };
  let helperDistance = Math.hypot(helperVector.x, helperVector.y);
  if (!Number.isFinite(helperDistance) || helperDistance < 1e-3) {
    helperDistance = Math.max(baseLength, 120);
  }
  const helperOrientation: 1 | -1 = helperVector.x * baseNormal.x + helperVector.y * baseNormal.y >= 0 ? 1 : -1;
  const baseStroke = baseLine.segmentStyles?.[0] ?? baseLine.style;
  const style: StrokeStyle = { ...baseStroke, hidden: false };
  const id = nextId('line', model);
  const meta: PerpendicularLineMeta = {
    throughPoint: anchor.id,
    referenceLine: baseLine.id,
    helperPoint: helperPoint.id,
    helperDistance,
    helperOrientation
  };
  if (helperMode === 'projection') {
    meta.helperMode = 'projection';
  }
  const perpendicularLine: PerpendicularLine = {
    object_type: 'line',
    id,
    points: [pointIdx, helperIdx],
    defining_points: [pointIdx, helperIdx],
    segmentStyles: [{ ...style }],
    segmentKeys: [segmentKeyForPoints(pointIdx, helperIdx)],
    leftRay: forceRaysVisible ? { ...style, hidden: false } : (baseLine.leftRay ? { ...baseLine.leftRay } : { ...style, hidden: true }),
    rightRay: forceRaysVisible ? { ...style, hidden: false } : (baseLine.rightRay ? { ...baseLine.rightRay } : { ...style, hidden: true }),
    style,
    hidden: false,
    construction_kind: 'perpendicular',
    defining_parents: [anchor.id, baseLine.id],
    perpendicular: meta,
    recompute: () => {},
    on_parent_deleted: () => {}
  };
  model.lines.push(perpendicularLine);
  const lineIdx = model.lines.length - 1;
  registerIndex(model, 'line', id, lineIdx);
  model.lines[lineIdx] = {
    ...perpendicularLine,
    recompute: () => recomputePerpendicularLine(lineIdx)
  } as PerpendicularLine;
  helperPoint = model.points[helperIdx];
  model.points[helperIdx] = { ...helperPoint, perpendicular_helper_for: id };
  const helperParents: ConstructionParent[] = [{ kind: 'line', id }];
  if (helperMode === 'projection' && baseLine.id) {
    helperParents.push({ kind: 'line', id: baseLine.id });
  }
  applyPointConstruction(helperIdx, helperParents);
  recomputePerpendicularLine(lineIdx);
  ensureSegmentStylesForLine(lineIdx);
  updateIntersectionsForLine(lineIdx);
  updateMidpointsForPoint(helperIdx);
  return lineIdx;
}

function recomputeParallelLine(lineIdx: number) {
  if (parallelRecomputeStack.has(lineIdx)) return;
  const line = model.lines[lineIdx];
  if (!isParallelLine(line)) return;
  const throughIdx = pointIndexById(line.parallel.throughPoint);
  const helperIdx = pointIndexById(line.parallel.helperPoint);
  const baseIdx = lineIndexById(line.parallel.referenceLine);
  if (throughIdx === null || helperIdx === null || baseIdx === null) return;
  const anchor = model.points[throughIdx];
  const helper = model.points[helperIdx];
  const baseLine = model.lines[baseIdx];
  if (!anchor || !helper || !baseLine) return;
  const dirInfo = primaryLineDirection(baseLine);
  if (!dirInfo) return;
  parallelRecomputeStack.add(lineIdx);
  try {
    const direction = dirInfo.dir;
    const distances = new Map<number, number>();
    line.points.forEach((idx) => {
      const pt = model.points[idx];
      if (!pt) return;
      const vec = { x: pt.x - anchor.x, y: pt.y - anchor.y };
      const dist = vec.x * direction.x + vec.y * direction.y;
      distances.set(idx, dist);
    });
    if (!distances.has(helperIdx)) {
      const vec = { x: helper.x - anchor.x, y: helper.y - anchor.y };
      distances.set(helperIdx, vec.x * direction.x + vec.y * direction.y);
    }
    const helperDist = distances.get(helperIdx) ?? 0;
    if (Math.abs(helperDist) < 1e-6) {
      const baseLen = lineLength(baseIdx) ?? dirInfo.length;
      const fallback = Math.max(baseLen, 120);
      distances.set(helperIdx, fallback);
    }
    const touched = new Set<number>();
    distances.forEach((dist, idx) => {
      if (idx === throughIdx) return;
      const target = { x: anchor.x + direction.x * dist, y: anchor.y + direction.y * dist };
      const current = model.points[idx];
      if (!current) return;
      const constrained = constrainToCircles(idx, target);
      if (Math.abs(current.x - constrained.x) > 1e-6 || Math.abs(current.y - constrained.y) > 1e-6) {
        model.points[idx] = { ...current, ...constrained };
        touched.add(idx);
      }
    });
    if (!line.points.includes(throughIdx)) line.points.unshift(throughIdx);
    if (!line.points.includes(helperIdx)) line.points.push(helperIdx);
    line.defining_points = [throughIdx, helperIdx];
    ensureSegmentStylesForLine(lineIdx);
    reorderLinePoints(lineIdx);
    touched.forEach((idx) => updateMidpointsForPoint(idx));
    updateIntersectionsForLine(lineIdx);
    updateParallelLinesForLine(lineIdx);
    updatePerpendicularLinesForLine(lineIdx);
  } finally {
    parallelRecomputeStack.delete(lineIdx);
  }
}

function recomputePerpendicularLine(lineIdx: number) {
  if (perpendicularRecomputeStack.has(lineIdx)) return;
  const line = model.lines[lineIdx];
  if (!isPerpendicularLine(line)) return;
  const throughIdx = pointIndexById(line.perpendicular.throughPoint);
  const helperIdx = pointIndexById(line.perpendicular.helperPoint);
  const baseIdx = lineIndexById(line.perpendicular.referenceLine);
  if (throughIdx === null || helperIdx === null || baseIdx === null) return;
  const anchor = model.points[throughIdx];
  let helper = model.points[helperIdx];
  const baseLine = model.lines[baseIdx];
  if (!anchor || !helper || !baseLine) return;
  const dirInfo = primaryLineDirection(baseLine);
  if (!dirInfo) return;
  perpendicularRecomputeStack.add(lineIdx);
  try {
    const baseNormal = { x: -dirInfo.dir.y, y: dirInfo.dir.x };
    const helperMode = line.perpendicular.helperMode ?? 'normal';
    if (helperMode === 'projection' && baseLine.points.length >= 2) {
      const baseStartIdx = baseLine.points[0];
      const baseEndIdx = baseLine.points[baseLine.points.length - 1];
      const baseStart = baseStartIdx !== undefined ? model.points[baseStartIdx] : null;
      const baseEnd = baseEndIdx !== undefined ? model.points[baseEndIdx] : null;
      if (baseStart && baseEnd) {
        const projected = projectPointOnLine(anchor, baseStart, baseEnd);
        const constrained = constrainToCircles(helperIdx, projected);
        if (
          Math.abs(helper.x - constrained.x) > 1e-6 ||
          Math.abs(helper.y - constrained.y) > 1e-6
        ) {
          model.points[helperIdx] = { ...helper, ...constrained };
          helper = model.points[helperIdx];
        }
        helper = model.points[helperIdx];
      }
    }
    const helperVecRaw = { x: helper.x - anchor.x, y: helper.y - anchor.y };
    const baseProjection = helperVecRaw.x * baseNormal.x + helperVecRaw.y * baseNormal.y;
    let orientation: 1 | -1 = line.perpendicular.helperOrientation ?? (baseProjection >= 0 ? 1 : -1);
    if (selectedPointIndex === helperIdx && draggingSelection) {
      orientation = baseProjection >= 0 ? 1 : -1;
    }
    if (helperMode === 'projection') {
      orientation = baseProjection >= 0 ? 1 : -1;
    }
    line.perpendicular.helperOrientation = orientation;
    const direction = orientation === 1 ? baseNormal : { x: -baseNormal.x, y: -baseNormal.y };
    const distances = new Map<number, number>();
    line.points.forEach((idx) => {
      const pt = model.points[idx];
      if (!pt) return;
      const vec = { x: pt.x - anchor.x, y: pt.y - anchor.y };
      const dist = vec.x * direction.x + vec.y * direction.y;
      distances.set(idx, dist);
    });
    const helperProjection = helperVecRaw.x * direction.x + helperVecRaw.y * direction.y;
    let helperDistance = line.perpendicular.helperDistance;
    if (helperMode === 'projection') {
      const inferred = Math.abs(helperProjection);
      helperDistance = inferred;
      line.perpendicular.helperDistance = helperDistance;
    } else if (selectedPointIndex === helperIdx && draggingSelection) {
      let updatedDistance = Math.abs(helperProjection);
      if (!Number.isFinite(updatedDistance) || updatedDistance < 1e-3) {
        const fallback = Math.abs(helperProjection);
        if (Number.isFinite(fallback) && fallback > 1e-3) {
          updatedDistance = fallback;
        } else {
          const baseLen = lineLength(baseIdx) ?? dirInfo.length;
          updatedDistance = baseLen > 1e-3 ? baseLen : 120;
        }
      }
      helperDistance = updatedDistance;
      line.perpendicular.helperDistance = helperDistance;
    } else if (helperDistance === undefined || helperDistance < 1e-3) {
      let inferred = Math.abs(helperProjection);
      if (!Number.isFinite(inferred) || inferred < 1e-3) {
        const baseLen = lineLength(baseIdx) ?? dirInfo.length;
        inferred = baseLen > 1e-3 ? baseLen : 120;
      }
      helperDistance = inferred;
      line.perpendicular.helperDistance = helperDistance;
    }
    helperDistance = line.perpendicular.helperDistance ?? helperDistance ?? 0;
    if (!Number.isFinite(helperDistance) || helperDistance < 1e-3) {
      const baseLen = lineLength(baseIdx) ?? dirInfo.length;
      helperDistance = baseLen > 1e-3 ? baseLen : 120;
    }
    line.perpendicular.helperDistance = helperDistance;
    distances.set(helperIdx, helperDistance);
    const touched = new Set<number>();
    distances.forEach((dist, idx) => {
      if (idx === throughIdx) return;
      const target = {
        x: anchor.x + direction.x * dist,
        y: anchor.y + direction.y * dist
      };
      const current = model.points[idx];
      if (!current) return;
      const constrained = constrainToCircles(idx, target);
      if (Math.abs(current.x - constrained.x) > 1e-6 || Math.abs(current.y - constrained.y) > 1e-6) {
        model.points[idx] = { ...current, ...constrained };
        touched.add(idx);
      }
    });
    if (!line.points.includes(throughIdx)) line.points.unshift(throughIdx);
    if (!line.points.includes(helperIdx)) line.points.push(helperIdx);
    line.defining_points = [throughIdx, helperIdx];
    ensureSegmentStylesForLine(lineIdx);
    reorderLinePoints(lineIdx);
    touched.forEach((idx) => updateMidpointsForPoint(idx));
    updateIntersectionsForLine(lineIdx);
    updateParallelLinesForLine(lineIdx);
    updatePerpendicularLinesForLine(lineIdx);
  } finally {
    perpendicularRecomputeStack.delete(lineIdx);
  }
}

function pushHistory() {
  refreshLabelPoolsFromModel();
  rebuildIndexMaps();
  const snapshot: Snapshot = {
    model: deepClone(model),
    panOffset: { ...panOffset },
    zoom: zoomFactor,
    labelState: {
      upperIdx: labelUpperIdx,
      lowerIdx: labelLowerIdx,
      greekIdx: labelGreekIdx,
      freeUpper: [...freeUpperIdx],
      freeLower: [...freeLowerIdx],
      freeGreek: [...freeGreekIdx]
    }
  };
  history = history.slice(0, historyIndex + 1);
  history.push(snapshot);
  historyIndex = history.length - 1;
  updateUndoRedoButtons();
  updatePointLabelToolButtons();
}

function deepClone<T>(obj: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(obj);
    } catch {
      // Fallback when cloning functions or non-cloneable fields
    }
  }
  return JSON.parse(JSON.stringify(obj));
}

function serializeCurrentDocument(): PersistedDocument {
  refreshLabelPoolsFromModel();
  rebuildIndexMaps();
  const pointData = model.points.map((point) => {
    const { recompute: _r, on_parent_deleted: _d, ...rest } = point;
    return deepClone(rest) as PersistedPoint;
  });
  const lineData = model.lines.map((line) => {
    const { children: _ignoreChildren, recompute: _r, on_parent_deleted: _d, ...rest } = line as any;
    return deepClone(rest) as PersistedLine;
  });
  const circleData = model.circles.map((circle) => {
    const { children: _ignoreChildren, recompute: _r, on_parent_deleted: _d, ...rest } = circle as any;
    return deepClone(rest) as PersistedCircle;
  });
  const angleData = model.angles.map((angle) => {
    const { children: _ignoreChildren, recompute: _r, on_parent_deleted: _d, ...rest } = angle as any;
    return deepClone(rest) as PersistedAngle;
  });
  // Ensure exported angle leg.line references use line ids when possible
  if (angleData && angleData.length) {
    angleData.forEach((a: any) => {
      try {
        if (a && a.leg1 && typeof a.leg1.line === 'number') {
          const idx = Number(a.leg1.line);
          const id = model.lines[idx]?.id;
          if (typeof id === 'string') a.leg1.line = id;
        }
        if (a && a.leg2 && typeof a.leg2.line === 'number') {
          const idx2 = Number(a.leg2.line);
          const id2 = model.lines[idx2]?.id;
          if (typeof id2 === 'string') a.leg2.line = id2;
        }
      } catch {}
    });
  }
  const polygonData = model.polygons.map((polygon) => {
    const { children: _ignoreChildren, recompute: _r, on_parent_deleted: _d, ...rest } = polygon as any;
    return deepClone(rest) as PersistedPolygon;
  });
  const persistedModel: PersistedModel = {};
  if (pointData.length) persistedModel.points = pointData;
  if (lineData.length) persistedModel.lines = lineData;
  if (circleData.length) persistedModel.circles = circleData;
  if (angleData.length) persistedModel.angles = angleData;
  if (polygonData.length) persistedModel.polygons = polygonData;
  if (model.inkStrokes.length) persistedModel.inkStrokes = deepClone(model.inkStrokes);
  if (model.labels.length) persistedModel.labels = deepClone(model.labels);

  const doc: PersistedDocument = { model: persistedModel };
  if (measurementReferenceSegment != null && measurementReferenceValue != null) {
    // Persist measurement reference as compact string "lineId:segIdx"
    doc.measurementReferenceSegment = `${measurementReferenceSegment.lineId}:${measurementReferenceSegment.segIdx}`;
    doc.measurementReferenceValue = measurementReferenceValue;
  }
  // Mark any styles that currently equal the theme background so they can be restored
  // as theme-following colors when the file is reloaded.
  try {
    const markBg = (style: any) => {
      if (!style || typeof style !== 'object') return;
      try {
        if (typeof style.color === 'string' && normalizeColor(style.color) === normalizeColor(THEME.bg)) {
          style.colorIsThemeBg = true;
        }
      } catch {}
    };
    (persistedModel.points || []).forEach((p) => markBg((p as any).style));
    (persistedModel.lines || []).forEach((l: any) => {
      markBg(l.style);
      if (Array.isArray(l.segmentStyles)) l.segmentStyles.forEach((s: any) => markBg(s));
      if (l.leftRay) markBg(l.leftRay);
      if (l.rightRay) markBg(l.rightRay);
    });
    (persistedModel.circles || []).forEach((c: any) => {
      markBg(c.style);
      if (c.fill && normalizeColor(c.fill) === normalizeColor(THEME.bg)) c.fillIsThemeBg = true;
    });
    (persistedModel.angles || []).forEach((a: any) => markBg(a.style));
    (persistedModel.polygons || []).forEach((p: any) => {
      if (p.fill && normalizeColor(p.fill) === normalizeColor(THEME.bg)) p.fillIsThemeBg = true;
    });
  } catch {}
  return doc;
}

function centerConstruction() {
  // Oblicz bounding box wszystkich obiektów w konstrukcji
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  
  // Uwzględnij punkty
  for (const point of model.points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  
  // Uwzględnij środki i promienie okręgów
  for (const circle of model.circles) {
    const cp = model.points[circle.center];
    const rp = model.points[circle.radius_point];
    if (cp && rp) {
      const radius = Math.sqrt((cp.x - rp.x) ** 2 + (cp.y - rp.y) ** 2);
      minX = Math.min(minX, cp.x - radius);
      maxX = Math.max(maxX, cp.x + radius);
      minY = Math.min(minY, cp.y - radius);
      maxY = Math.max(maxY, cp.y + radius);
    }
  }
  
  // Uwzględnij swobodne etykiety
  for (const label of model.labels) {
    minX = Math.min(minX, label.pos.x);
    maxX = Math.max(maxX, label.pos.x);
    minY = Math.min(minY, label.pos.y);
    maxY = Math.max(maxY, label.pos.y);
  }
  
  // Uwzględnij pisma ręczne
  for (const stroke of model.inkStrokes) {
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }
  
  // Jeśli nie ma żadnych obiektów, nie centruj
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || 
      !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return;
  }
  
  // Oblicz środek konstrukcji
  const constructionCenterX = (minX + maxX) / 2;
  const constructionCenterY = (minY + maxY) / 2;
  
  // Oblicz środek ekranu i dopasuj przybliżenie
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const bboxWidth = Math.max(maxX - minX, 1e-3);
  const bboxHeight = Math.max(maxY - minY, 1e-3);
  const targetWidth = rect.width * 0.75;
  const targetHeight = rect.height * 0.75;
  const zoomCandidates: number[] = [];
  if (bboxWidth > 0) zoomCandidates.push(targetWidth / bboxWidth);
  if (bboxHeight > 0) zoomCandidates.push(targetHeight / bboxHeight);
  const nextZoom = zoomCandidates.length
    ? clamp(Math.min(...zoomCandidates), MIN_ZOOM, MAX_ZOOM)
    : clamp(1, MIN_ZOOM, MAX_ZOOM);
  zoomFactor = nextZoom;
  const screenCenterX = rect.width / 2;
  const screenCenterY = rect.height / 2;
  
  // Ustaw panOffset tak, żeby środek konstrukcji był w środku ekranu
  panOffset.x = screenCenterX - constructionCenterX * zoomFactor;
  panOffset.y = screenCenterY - constructionCenterY * zoomFactor;
}

function applyPersistedDocument(raw: unknown) {
  if (!raw || typeof raw !== 'object') throw new Error('Brak danych w pliku JSON');
  const doc = raw as Partial<PersistedDocument>;
  const declaredVersion = (doc as any).version;
  const version = typeof declaredVersion === 'number' ? declaredVersion : null;
  if (version !== null && ![1, 2, 3].includes(version)) throw new Error('Nieobsługiwana wersja pliku JSON');
  if (!doc.model) throw new Error('Brak sekcji modelu w pliku JSON');
  resetLabelState();
  const baseLabelFont = getLabelFontDefault();
  const persistedFontToDelta = (value?: number): number => {
    if (version === 1) {
      if (!Number.isFinite(value ?? NaN)) return 0;
      const px = normalizeLabelFontSize(value);
      return px - baseLabelFont;
    }
    return clampLabelFontDelta(value, baseLabelFont);
  };
  const persistedModel = doc.model;
  const toPoint = (p: PersistedPoint): Point => {
    const clone = deepClone(p) as any;
    if (clone.label)
      clone.label = {
        ...clone.label,
        fontSize: persistedFontToDelta(clone.label.fontSize),
        textAlign: normalizeLabelAlignment(clone.label.textAlign)
      };
    const { incident_objects: _ignoreIncident, children: _ignoreChildren, ...rest } = clone;
    // If this point style was saved as theme-background-bound, restore it to current theme
    try {
      if (rest.style && (rest.style as any).colorIsThemeBg) {
        (rest.style as any).color = THEME.bg;
      }
    } catch {}
    return {
      ...rest,
      recompute: () => {},
      on_parent_deleted: () => {}
    };
  };
  const toLine = (l: PersistedLine): Line => {
    const clone = deepClone(l) as any;
    if (clone.label)
      clone.label = {
        ...clone.label,
        fontSize: persistedFontToDelta(clone.label.fontSize),
        textAlign: normalizeLabelAlignment(clone.label.textAlign)
      };
    const { children: _ignoreChildren, ...rest } = clone;
    try {
      if (rest.style && (rest.style as any).colorIsThemeBg) (rest.style as any).color = THEME.bg;
      if (Array.isArray(rest.segmentStyles)) rest.segmentStyles.forEach((s: any) => { if (s && s.colorIsThemeBg) s.color = THEME.bg; });
      if (rest.leftRay && (rest.leftRay as any).colorIsThemeBg) (rest.leftRay as any).color = THEME.bg;
      if (rest.rightRay && (rest.rightRay as any).colorIsThemeBg) (rest.rightRay as any).color = THEME.bg;
    } catch {}
    return {
      ...rest,
      recompute: () => {},
      on_parent_deleted: () => {}
    };
  };
  const toCircle = (c: PersistedCircle): Circle => {
    const clone = deepClone(c) as any;
    if (clone.label)
      clone.label = {
        ...clone.label,
        fontSize: persistedFontToDelta(clone.label.fontSize),
        textAlign: normalizeLabelAlignment(clone.label.textAlign)
      };
    const { children: _ignoreChildren, ...rest } = clone;
    try {
      if (rest.style && (rest.style as any).colorIsThemeBg) (rest.style as any).color = THEME.bg;
      if (rest.fillIsThemeBg) rest.fill = THEME.bg;
    } catch {}
    return {
      ...rest,
      recompute: () => {},
      on_parent_deleted: () => {}
    };
  };
  const toAngle = (a: PersistedAngle): Angle => {
    const clone = deepClone(a) as any;
    if (clone.label)
      clone.label = {
        ...clone.label,
        fontSize: persistedFontToDelta(clone.label.fontSize),
        textAlign: normalizeLabelAlignment(clone.label.textAlign)
      };
    const { children: _ignoreChildren, ...rest } = clone;
    try { if (rest.style && (rest.style as any).colorIsThemeBg) (rest.style as any).color = THEME.bg; } catch {}
    return {
      ...rest,
      recompute: () => {},
      on_parent_deleted: () => {}
    };
  };
  const toPolygon = (p: PersistedPolygon): Polygon => {
    const clone = deepClone(p) as any;
    const { children: _ignoreChildren, ...rest } = clone;
    try { if (rest.fillIsThemeBg) rest.fill = THEME.bg; } catch {}
    return {
      ...rest,
      recompute: () => {},
      on_parent_deleted: () => {}
    };
  };
  const restored: Model = {
    points: Array.isArray(persistedModel.points) ? persistedModel.points.map(toPoint) : [],
    lines: Array.isArray(persistedModel.lines) ? persistedModel.lines.map(toLine) : [],
    circles: Array.isArray(persistedModel.circles) ? persistedModel.circles.map(toCircle) : [],
    angles: Array.isArray(persistedModel.angles) ? persistedModel.angles.map(toAngle) : [],
    polygons: Array.isArray(persistedModel.polygons) ? persistedModel.polygons.map(toPolygon) : [],
    inkStrokes: Array.isArray(persistedModel.inkStrokes) ? deepClone(persistedModel.inkStrokes) : [],
    labels: Array.isArray(persistedModel.labels)
      ? deepClone(persistedModel.labels).map((label) => ({
          ...label,
          fontSize: persistedFontToDelta(label.fontSize),
          textAlign: normalizeLabelAlignment(label.textAlign)
        }))
      : [],
    idCounters: {
      point: 0,
      line: 0,
      circle: 0,
      angle: 0,
      polygon: 0
    },
    indexById: {
      point: {},
      line: {},
      circle: {},
      angle: {},
      polygon: {}
    }
  };
  const providedCounters = persistedModel.idCounters ?? {};
  const counters: Record<GeometryKind, number> = {
    point: Number(providedCounters.point) || 0,
    line: Number(providedCounters.line) || 0,
    circle: Number(providedCounters.circle) || 0,
    angle: Number(providedCounters.angle) || 0,
    polygon: Number(providedCounters.polygon) || 0
  };
  const bumpCounter = (kind: GeometryKind, id: string | undefined) => {
    if (!id) return;
    const prefix = ID_PREFIX[kind];
    if (!id.startsWith(prefix)) return;
    const parsed = Number(id.slice(prefix.length));
    if (Number.isFinite(parsed) && parsed > counters[kind]) counters[kind] = parsed;
  };
  restored.points.forEach((p) => bumpCounter('point', p.id));
  restored.lines.forEach((l) => bumpCounter('line', l.id));
  restored.circles.forEach((c) => bumpCounter('circle', c.id));
  restored.angles.forEach((a) => bumpCounter('angle', a.id));
  restored.polygons.forEach((p) => bumpCounter('polygon', p.id));
  restored.idCounters = counters;
  model = restored;
  panOffset = { x: 0, y: 0 };
  zoomFactor = 1;
  refreshLabelPoolsFromModel(model);
  rebuildIndexMaps();
  selectedPointIndex = null;
  selectedLineIndex = null;
  selectedCircleIndex = null;
  selectedAngleIndex = null;
  selectedPolygonIndex = null;
  selectedLabel = null;
  selectedSegments.clear();
  selectedArcSegments.clear();
  segmentStartIndex = null;
  segmentStartTemporary = false;
  circleCenterIndex = null;
  triangleStartIndex = null;
  squareStartIndex = null;
  polygonChain = [];
  currentPolygonLines = [];
  angleFirstLeg = null;
  anglePoints = [];
  bisectorFirstLeg = null;
  bisectPointVertexIndex = null;
  bisectPointFirstSeg = null;
  midpointFirstIndex = null;
  symmetricSourceIndex = null;
  parallelAnchorPointIndex = null;
  parallelReferenceLineIndex = null;
  pendingParallelPoint = null;
  pendingParallelLine = null;
  pendingCircleRadiusPoint = null;
  pendingCircleRadiusLength = null;
  circleThreePoints = [];
  activeAxisSnap = null;
  draggingLabel = null;
  draggingCircleCenterAngles = null;
  draggingSelection = false;
  resizingLine = null;
  lineDragContext = null;
  hoverPointIndex = null;
  isPanning = false;
  panStart = { x: 0, y: 0 };
  panStartOffset = { x: 0, y: 0 };
  dragStart = { x: 0, y: 0 };
  pendingPanCandidate = null;
  stickyTool = null;
  styleMenuSuppressed = false;
  styleMenuOpen = false;
  viewModeOpen = false;
  rayModeOpen = false;
  zoomMenuOpen = false;
  movedDuringDrag = false;
  movedDuringPan = false;
  // debug panel internal state managed by src/debugPanel.ts
  
  // Restore measurement scale from reference value (DPI-independent)
  // persisted format may store measurementReferenceSegment as compact string ("line:seg") or legacy object
  const rawRef = (doc as any).measurementReferenceSegment;
  if (typeof rawRef === 'string') {
    const parts = rawRef.split(':');
    if (parts.length === 2) {
      const lineId = parts[0];
      const segIdx = Number(parts[1]);
      if (lineId && Number.isFinite(segIdx)) measurementReferenceSegment = { lineId, segIdx };
      else measurementReferenceSegment = null;
    } else {
      measurementReferenceSegment = null;
    }
  } else if (rawRef && typeof rawRef === 'object') {
    // Legacy object form { lineIdx, segIdx } or { lineId, segIdx }
    if (typeof (rawRef as any).lineId === 'string') {
      measurementReferenceSegment = { lineId: (rawRef as any).lineId, segIdx: Number((rawRef as any).segIdx) };
    } else if (typeof (rawRef as any).lineIdx === 'number') {
      const legacyLineIdx = (rawRef as any).lineIdx;
      const line = model.lines[legacyLineIdx];
      measurementReferenceSegment = line ? { lineId: line.id, segIdx: Number((rawRef as any).segIdx) } : null;
    } else {
      measurementReferenceSegment = null;
    }
  } else {
    measurementReferenceSegment = null;
  }
  measurementReferenceValue = typeof doc.measurementReferenceValue === 'number' ? doc.measurementReferenceValue : null;
  
  if (measurementReferenceSegment && measurementReferenceValue && measurementReferenceValue > 0) {
    const { lineId, segIdx } = measurementReferenceSegment;
    const lineIdx = lineIndexById(lineId);
    if (lineIdx !== null && lineIdx >= 0 && lineIdx < model.lines.length) {
      const currentLength = getSegmentLength(lineIdx, segIdx);
      measurementScale = currentLength / measurementReferenceValue;
    } else {
      // Reference segment doesn't exist anymore, clear scale
      measurementScale = null;
      measurementReferenceSegment = null;
      measurementReferenceValue = null;
    }
  } else {
    // No scale set
    measurementScale = null;
  }
  
  measurementLabels = [];
  measurementLabelIdCounter = 0;
  showMeasurements = false;
  editingMeasurementLabel = null;
  closeMeasurementInputBox();
  endDebugPanelDrag();
  closeStyleMenu();
  closeZoomMenu();
  closeViewMenu();
  closeRayMenu();
  setMode('move');
  updateSelectionButtons();
  updateOptionButtons();
  
  // Wycentruj konstrukcję na ekranie
  centerConstruction();
  
  draw();
  history = [];
  historyIndex = -1;
  pushHistory();
  if (document.getElementById('debugPanel')?.getAttribute('data-visible') === 'true') {
    requestAnimationFrame(() => ensureDebugPanelPosition());
  }
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex -= 1;
  restoreHistory();
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex += 1;
  restoreHistory();
}

function restoreHistory() {
  const snap = history[historyIndex];
  if (!snap) return;
  model = deepClone(snap.model);
  panOffset = { ...snap.panOffset };
  zoomFactor = clamp(snap.zoom ?? 1, MIN_ZOOM, MAX_ZOOM);
  if (snap.labelState) {
    labelUpperIdx = snap.labelState.upperIdx;
    labelLowerIdx = snap.labelState.lowerIdx;
    labelGreekIdx = snap.labelState.greekIdx;
    freeUpperIdx = [...snap.labelState.freeUpper];
    freeLowerIdx = [...snap.labelState.freeLower];
    freeGreekIdx = [...snap.labelState.freeGreek];
  }
  rebuildIndexMaps();
  selectedLineIndex = null;
  selectedPointIndex = null;
  selectedPolygonIndex = null;
  selectedCircleIndex = null;
  selectedAngleIndex = null;
  selectedArcSegments.clear();
  updateSelectionButtons();
  updateUndoRedoButtons();
  draw();
}

function updateUndoRedoButtons() {
  undoBtn?.classList.toggle('disabled', historyIndex <= 0);
  redoBtn?.classList.toggle('disabled', historyIndex >= history.length - 1);
}

async function captureCanvasAsPng(): Promise<Blob> {
  if (!canvas) throw new Error('Płótno jest niedostępne');
  return await new Promise<Blob>((resolve, reject) => {
    canvas!.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Brak danych obrazu'));
      }
    }, 'image/png');
  });
}

function toggleZoomMenu() {
  zoomMenuOpen = !zoomMenuOpen;
  if (zoomMenuOpen) {
    if (zoomMenuBtn && zoomMenuDropdown) {
      const rect = zoomMenuBtn.getBoundingClientRect();
      zoomMenuDropdown.style.position = 'fixed';
      zoomMenuDropdown.style.top = `${rect.bottom + 6}px`;
      zoomMenuDropdown.style.left = `${rect.left}px`;
      zoomMenuDropdown.style.right = 'auto';
    }
    zoomMenuContainer?.classList.add('open');
  } else {
    closeZoomMenu();
  }
}

function closeZoomMenu() {
  zoomMenuOpen = false;
  zoomMenuContainer?.classList.remove('open');
}

function toggleStyleMenu() {
  if (!styleMenuContainer) return;
  styleMenuOpen = !styleMenuOpen;
  if (styleMenuOpen) {
    // Dezaktywuj tryb kopiowania stylu przy otwieraniu menu
    if (copyStyleActive) {
      copyStyleActive = false;
      copiedStyle = null;
      updateSelectionButtons();
    }
    openStyleMenu();
  } else {
    styleMenuSuppressed = true;
    closeStyleMenu();
  }
}

function closeStyleMenu() {
  styleMenuOpen = false;
  styleMenuContainer?.classList.remove('open');
}

function openStyleMenu() {
  if (!styleMenuContainer) return;
  if (styleMenuDropdown) {
    styleMenuDropdown.style.position = 'fixed';
    const btnRect = styleMenuBtn?.getBoundingClientRect();
    styleMenuDropdown.style.top = `${btnRect ? btnRect.bottom + 6 : 52}px`;
    styleMenuDropdown.style.left = `${btnRect ? btnRect.left : 8}px`;
    styleMenuDropdown.style.right = 'auto';
    styleMenuDropdown.style.width = 'auto';
    styleMenuDropdown.style.minWidth = '240px';
    styleMenuDropdown.style.maxWidth = '360px';
  }
  styleMenuContainer.classList.add('open');
  styleMenuOpen = true;
  updateStyleMenuValues();
}

type ViewModeState = 'edges' | 'vertices' | 'both';

function getViewModeState(): ViewModeState {
  if (selectionEdges && selectionVertices) return 'both';
  if (selectionVertices && !selectionEdges) return 'vertices';
  return 'edges';
}

function setViewMode(mode: 'edges' | 'vertices') {
  if (mode === 'edges') {
    selectionEdges = !selectionEdges;
    if (!selectionEdges && !selectionVertices) selectionVertices = true;
  } else {
    selectionVertices = !selectionVertices;
    if (!selectionEdges && !selectionVertices) selectionEdges = true;
  }
  updateSelectionButtons();
  updateStyleMenuValues();
  draw();
  closeViewMenu();
}

function toggleViewMenu() {
  viewModeOpen = !viewModeOpen;
  if (viewModeOpen) {
    if (viewModeToggleBtn && viewModeMenuContainer) {
      const dropdown = viewModeMenuContainer.querySelector('.dropdown-menu') as HTMLElement | null;
      if (dropdown) {
        const rect = viewModeToggleBtn.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = `${rect.bottom + 6}px`;
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.right = 'auto';
      }
    }
    viewModeMenuContainer?.classList.add('open');
  } else {
    closeViewMenu();
  }
}

function closeViewMenu() {
  viewModeOpen = false;
  viewModeMenuContainer?.classList.remove('open');
}

function setRayMode(next: 'segment' | 'left' | 'right') {
  if (selectedLineIndex === null) return;
  const line = model.lines[selectedLineIndex];
  const ensureRay = (side: 'left' | 'right') => {
    if (side === 'left' && !line.leftRay) line.leftRay = { ...line.style, hidden: true };
    if (side === 'right' && !line.rightRay) line.rightRay = { ...line.style, hidden: true };
  };
  ensureRay('left');
  ensureRay('right');
  const leftOn = !!line.leftRay && !line.leftRay.hidden;
  const rightOn = !!line.rightRay && !line.rightRay.hidden;
  if (next === 'segment') {
    if (!leftOn && !rightOn) {
      line.leftRay!.hidden = false;
      line.rightRay!.hidden = false;
    } else {
      line.leftRay!.hidden = true;
      line.rightRay!.hidden = true;
    }
  } else if (next === 'right') {
    const newState = !rightOn;
    line.rightRay!.hidden = !newState;
    if (!line.leftRay) line.leftRay = { ...line.style, hidden: true };
    const leftAfter = !!line.leftRay && !line.leftRay.hidden;
    if (!leftAfter && !newState) {
      line.leftRay!.hidden = true;
      line.rightRay!.hidden = true;
    }
  } else if (next === 'left') {
    const newState = !leftOn;
    line.leftRay!.hidden = !newState;
    if (!line.rightRay) line.rightRay = { ...line.style, hidden: true };
    const rightAfter = !!line.rightRay && !line.rightRay.hidden;
    if (!rightAfter && !newState) {
      line.leftRay!.hidden = true;
      line.rightRay!.hidden = true;
    }
  }
  updateStyleMenuValues();
  updateSelectionButtons();
  draw();
  pushHistory();
  closeRayMenu();
}

function toggleRayMenu() {
  rayModeOpen = !rayModeOpen;
  if (rayModeOpen) {
    if (rayModeToggleBtn && rayModeMenuContainer) {
      const dropdown = rayModeMenuContainer.querySelector('.dropdown-menu') as HTMLElement | null;
      if (dropdown) {
        const rect = rayModeToggleBtn.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = `${rect.bottom + 6}px`;
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.right = 'auto';
      }
    }
    rayModeMenuContainer?.classList.add('open');
  } else {
    closeRayMenu();
  }
}

function closeRayMenu() {
  rayModeOpen = false;
  rayModeMenuContainer?.classList.remove('open');
}

function removePointsAndRelated(points: number[], removeLines = false) {
  if (!points.length) return;
  const toRemove = new Set(points);
  const extraPoints: number[] = [];
  if (removeLines) {
    const remap = new Map<number, number>();
    const kept: Line[] = [];
    model.lines.forEach((line, idx) => {
      if (line.defining_points.some((pi) => toRemove.has(pi))) {
        if (line.label) reclaimLabel(line.label);
        remap.set(idx, -1);
        if (isParallelLine(line)) {
          const helperIdx = pointIndexById(line.parallel.helperPoint);
          if (helperIdx !== null) extraPoints.push(helperIdx);
        }
      } else {
        const filteredPoints = line.points.filter((pi) => !toRemove.has(pi));
        remap.set(idx, kept.length);
        kept.push({ ...line, points: filteredPoints });
      }
    });
    model.lines = kept;
    remapAngles(remap);
    remapPolygons(remap);
    model.circles = model.circles.filter((circle) => {
      const removeCircle =
        toRemove.has(circle.center) ||
        toRemove.has(circle.radius_point) ||
        (isCircleThroughPoints(circle) && circle.defining_points.some((pi) => toRemove.has(pi)));
      if (removeCircle && circle.label) reclaimLabel(circle.label);
      return !removeCircle;
    });
    model.angles = model.angles.filter((ang) => {
      if (toRemove.has(ang.vertex)) {
        if (ang.label) reclaimLabel(ang.label);
        return false;
      }
      return true;
    });
  } else {
    const remap = new Map<number, number>();
    const rebuiltLines: Line[] = [];
    model.lines.forEach((line, idx) => {
      const filteredPoints = line.points.filter((idx) => !toRemove.has(idx));
      if (filteredPoints.length < 2) {
        if (line.label) reclaimLabel(line.label);
        remap.set(idx, -1);
        return;
      }
      const segCount = Math.max(0, filteredPoints.length - 1);
      const styles =
        line.segmentStyles && line.segmentStyles.length
          ? Array.from({ length: segCount }, (_, i) => line.segmentStyles![Math.min(i, line.segmentStyles!.length - 1)])
          : undefined;
      const rebuilt: Line = { ...line, points: filteredPoints, segmentStyles: styles };
      remap.set(idx, rebuiltLines.length);
      rebuiltLines.push(rebuilt);
    });
    model.lines = rebuiltLines;
    remapAngles(remap);
    remapPolygons(remap);
    model.circles = model.circles
      .map((circle) => {
        if (toRemove.has(circle.center) || toRemove.has(circle.radius_point)) {
          if (circle.label) reclaimLabel(circle.label);
          return null;
        }
        if (isCircleThroughPoints(circle) && circle.defining_points.some((pi) => toRemove.has(pi))) {
          if (circle.label) reclaimLabel(circle.label);
          return null;
        }
        const pts = circle.points.filter((idx) => !toRemove.has(idx));
        return { ...circle, points: pts };
      })
      .filter((c): c is Circle => c !== null);
    model.angles = model.angles.filter((ang) => {
      if (toRemove.has(ang.vertex)) {
        if (ang.label) reclaimLabel(ang.label);
        return false;
      }
      return true;
    });
  }
  if (extraPoints.length) {
    extraPoints
      .filter((idx) => !toRemove.has(idx))
      .forEach((idx) => {
        toRemove.add(idx);
        points.push(idx);
      });
  }
  // Reclaim labels from removed points
  points.forEach((idx) => {
    const pt = model.points[idx];
    if (pt?.label) reclaimLabel(pt.label);
  });
  removePointsKeepingOrder(points);
}

function removeParallelLinesReferencing(lineId: string): string[] {
  if (!lineId) return [];
  const lineIndices: number[] = [];
  const helperPoints: number[] = [];
  const removedIds: string[] = [];
  model.lines.forEach((line, idx) => {
    if (!isParallelLine(line)) return;
    if (line.parallel.referenceLine !== lineId) return;
    if (line.label) reclaimLabel(line.label);
    lineIndices.push(idx);
    removedIds.push(line.id);
    const helperIdx = pointIndexById(line.parallel.helperPoint);
    if (helperIdx !== null) helperPoints.push(helperIdx);
  });
  if (!lineIndices.length) return [];
  const remap = new Map<number, number>();
  const kept: Line[] = [];
  model.lines.forEach((line, idx) => {
    if (lineIndices.includes(idx)) {
      remap.set(idx, -1);
    } else {
      remap.set(idx, kept.length);
      kept.push(line);
    }
  });
  model.lines = kept;
  remapAngles(remap);
  remapPolygons(remap);
  if (helperPoints.length) {
    const uniqueHelpers = Array.from(new Set(helperPoints));
    removePointsKeepingOrder(uniqueHelpers, false);
  } else {
    rebuildIndexMaps();
  }
  cleanupDependentPoints();
  return removedIds;
}

function removePerpendicularLinesReferencing(lineId: string): string[] {
  if (!lineId) return [];
  const lineIndices: number[] = [];
  const helperPoints: number[] = [];
  const removedIds: string[] = [];
  model.lines.forEach((line, idx) => {
    if (!isPerpendicularLine(line)) return;
    if (line.perpendicular.referenceLine !== lineId) return;
    if (line.label) reclaimLabel(line.label);
    lineIndices.push(idx);
    removedIds.push(line.id);
    const helperIdx = pointIndexById(line.perpendicular.helperPoint);
    if (helperIdx !== null) helperPoints.push(helperIdx);
  });
  if (!lineIndices.length) return [];
  const remap = new Map<number, number>();
  const kept: Line[] = [];
  model.lines.forEach((line, idx) => {
    if (lineIndices.includes(idx)) {
      remap.set(idx, -1);
    } else {
      remap.set(idx, kept.length);
      kept.push(line);
    }
  });
  model.lines = kept;
  remapAngles(remap);
  remapPolygons(remap);
  if (helperPoints.length) {
    const uniqueHelpers = Array.from(new Set(helperPoints));
    removePointsKeepingOrder(uniqueHelpers, false);
  } else {
    rebuildIndexMaps();
  }
  cleanupDependentPoints();
  return removedIds;
}

function removePointsKeepingOrder(points: number[], allowCleanup = true) {
  const sorted = [...points].sort((a, b) => b - a);
  sorted.forEach((idx) => {
    const point = model.points[idx];
    if (point?.label) reclaimLabel(point.label);
    model.points.splice(idx, 1);
    // shift point indices in remaining lines
    model.lines.forEach((line) => {
      const mapped = line.defining_points.map((pIdx) => (pIdx > idx ? pIdx - 1 : pIdx));
      line.defining_points = [mapped[0], mapped[1]] as [number, number];
      line.points = line.points.map((pIdx) => (pIdx > idx ? pIdx - 1 : pIdx));
    });
    // adjust circles
    model.circles = model.circles
      .map((c) => {
        if (c.center === idx) return null;
        if (isCircleThroughPoints(c) && c.defining_points.includes(idx)) return null;
        if (c.radius_point === idx) return null;
        const center = c.center > idx ? c.center - 1 : c.center;
        const radius_point = c.radius_point > idx ? c.radius_point - 1 : c.radius_point;
        const pts = c.points
          .map((p) => (p > idx ? p - 1 : p))
          .filter((p) => p !== idx);
        if (isCircleThroughPoints(c)) {
          const defining = c.defining_points.map((p) => (p > idx ? p - 1 : p)) as [number, number, number];
          return { ...c, center, radius_point, points: pts, defining_points: defining };
        }
        return { ...c, center, radius_point, points: pts };
      })
      .filter((c): c is Circle => c !== null);
  });
  model.lines.forEach((_, li) => ensureSegmentStylesForLine(li));
  rebuildIndexMaps();
  if (allowCleanup) cleanupDependentPoints();
}

function cleanupDependentPoints() {
  const orphanIdxs = new Set<number>();
  model.points.forEach((pt, idx) => {
    if (!pt) return;

    // Remove intersection points if one of their parents was deleted
    if (pt.construction_kind === 'intersection') {
      const parents = pt.parent_refs ?? [];
      let missing = false;
      for (const pr of parents) {
        if (pr.kind === 'line') {
          if (lineIndexById(pr.id) === null) missing = true;
        } else if (pr.kind === 'circle') {
          if (model.indexById.circle[pr.id] === undefined) missing = true;
        }
        if (missing) break;
      }
      if (missing) {
        orphanIdxs.add(idx);
      }
    }

    if (isMidpointPoint(pt)) {
      const mm = getMidpointMeta(pt as Point);
      if (!mm || mm.parents.some((pid) => pointIndexById(pid) === null)) orphanIdxs.add(idx);
    }
    if (isSymmetricPoint(pt)) {
      const sm = getSymmetricMeta(pt as Point);
      if (!sm) {
        orphanIdxs.add(idx);
      } else {
        const sourceMissing = pointIndexById(sm.source) === null;
        const mirrorMissing = sm.mirror.kind === 'point' ? pointIndexById(sm.mirror.id) === null : lineIndexById(sm.mirror.id) === null;
        if (sourceMissing || mirrorMissing) orphanIdxs.add(idx);
      }
    }
    if (isBisectPoint(pt)) {
      const bm = getBisectMeta(pt as Point);
      if (!bm) {
        orphanIdxs.add(idx);
      } else {
        const vertexIdx = pointIndexById(bm.vertex);
        if (vertexIdx === null) {
          orphanIdxs.add(idx);
        } else {
          const s1 = resolveBisectSegment(bm.seg1, vertexIdx);
          const s2 = resolveBisectSegment(bm.seg2, vertexIdx);
          if (!s1 || !s2) orphanIdxs.add(idx);
        }
      }
    }
    if (pt.parallel_helper_for) {
      if (lineIndexById(pt.parallel_helper_for) === null) {
        orphanIdxs.add(idx);
      }
    }
    if (pt.perpendicular_helper_for) {
      if (lineIndexById(pt.perpendicular_helper_for) === null) {
        orphanIdxs.add(idx);
      }
    }
  });
  if (orphanIdxs.size) {
    // Before removing orphan bisect points, remove any bisector lines that reference them
    const orphanArr = Array.from(orphanIdxs);
    const bisectorLineIndices: number[] = [];
    model.lines.forEach((line, li) => {
      const meta = (line as any)?.bisector;
      if (!meta) return;
      const bisectPointId = meta.bisectPoint;
      if (!bisectPointId) return;
      const ptIdx = pointIndexById(bisectPointId);
      if (ptIdx !== null && orphanIdxs.has(ptIdx)) bisectorLineIndices.push(li);
    });
    if (bisectorLineIndices.length) {
      const remap = new Map<number, number>();
      const kept: Line[] = [];
      model.lines.forEach((line, idx) => {
        if (bisectorLineIndices.includes(idx)) {
          if (line.label) reclaimLabel(line.label);
          remap.set(idx, -1);
        } else {
          remap.set(idx, kept.length);
          kept.push(line);
        }
      });
      model.lines = kept;
      remapAngles(remap);
      remapPolygons(remap);
      rebuildIndexMaps();
    }
    removePointsKeepingOrder(orphanArr, false);
  }
}

function pointUsedAnywhere(idx: number): boolean {
  const point = model.points[idx];
  if (!point) return false;
  const usedByLines = model.lines.some((line) => line.points.includes(idx));
  if (usedByLines) return true;
  const usedByCircles = model.circles.some((circle) => {
    if (circle.center === idx || circle.radius_point === idx) return true;
    return circle.points.includes(idx);
  });
  if (usedByCircles) return true;
  const usedByAngles = model.angles.some((angle) => angle.vertex === idx);
  if (usedByAngles) return true;
  const usedByPolygons = model.polygons.some((poly) =>
    poly.lines.some((li) => {
      const line = model.lines[li];
      return !!line && line.points.includes(idx);
    })
  );
  if (usedByPolygons) return true;
  if (point.parent_refs.length > 0) return true;
  if (point.parallel_helper_for || point.perpendicular_helper_for) return true;
  return false;
}

function clearPointLabelIfUnused(idx: number) {
  const point = model.points[idx];
  if (!point?.label) return;
  if (pointUsedAnywhere(idx)) return;
  reclaimLabel(point.label);
  model.points[idx] = { ...point, label: undefined };
}

function lineLength(idx: number): number | null {
  const line = model.lines[idx];
  if (!line || line.points.length < 2) return null;
  const a = model.points[line.points[0]];
  const b = model.points[line.points[line.points.length - 1]];
  if (!a || !b) return null;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function circleFromThree(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-6) return null;
  const ux =
    ((a.x * a.x + a.y * a.y) * (b.y - c.y) + (b.x * b.x + b.y * b.y) * (c.y - a.y) + (c.x * c.x + c.y * c.y) * (a.y - b.y)) /
    d;
  const uy =
    ((a.x * a.x + a.y * a.y) * (c.x - b.x) + (b.x * b.x + b.y * b.y) * (a.x - c.x) + (c.x * c.x + c.y * c.y) * (b.x - a.x)) /
    d;
  return { x: ux, y: uy };
}

function segmentKey(line: number, part: 'segment' | 'rayLeft' | 'rayRight', seg?: number) {
  if (part === 'segment') return `${line}:s:${seg ?? 0}`;
  return `${line}:${part}`;
}

function hitKey(hit: LineHit) {
  return segmentKey(hit.line, hit.part, hit.part === 'segment' ? hit.seg : undefined);
}

function clearSelectedSegmentsForLine(lineIdx: number) {
  Array.from(selectedSegments).forEach((key) => {
    const parsed = parseSegmentKey(key);
    if (parsed && parsed.line === lineIdx) selectedSegments.delete(key);
  });
}

function parseSegmentKey(
  key: string
): { line: number; part: 'segment' | 'rayLeft' | 'rayRight'; seg?: number } | null {
  if (key.includes(':s:')) {
    const [lineStr, , segStr] = key.split(':');
    const line = Number(lineStr);
    const seg = Number(segStr);
    if (Number.isNaN(line) || Number.isNaN(seg)) return null;
    return { line, part: 'segment', seg };
  }
  const [lineStr, part] = key.split(':');
  const line = Number(lineStr);
  if (Number.isNaN(line)) return null;
  if (part === 'rayLeft' || part === 'rayRight') return { line, part };
  return null;
}

function lineAnchorForHit(hit: LineHit): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  const line = model.lines[hit.line];
  if (!line) return null;
  if (hit.part === 'segment') {
    const a = model.points[line.points[hit.seg]];
    const b = model.points[line.points[hit.seg + 1]];
    if (!a || !b) return null;
    return { a, b };
  }
  const firstIdx = line.points[0];
  const lastIdx = line.points[line.points.length - 1];
  const anchorIdx = hit.part === 'rayLeft' ? firstIdx : lastIdx;
  const otherIdx = hit.part === 'rayLeft' ? line.points[1] ?? lastIdx : line.points[line.points.length - 2] ?? firstIdx;
  const anchor = model.points[anchorIdx];
  const other = model.points[otherIdx];
  if (!anchor || !other) return null;
  const extent = (canvas ? canvas.width + canvas.height : 2000) / dpr;
  const dirRaw = { x: anchor.x - other.x, y: anchor.y - other.y };
  const len = Math.hypot(dirRaw.x, dirRaw.y) || 1;
  const dir = { x: dirRaw.x / len, y: dirRaw.y / len };
  return {
    a: anchor,
    b: {
      x: anchor.x + dir.x * extent,
      y: anchor.y + dir.y * extent
    }
  };
}

function rebuildSegmentStylesAfterInsert(line: Line, insertAt: number) {
  const segCount = Math.max(0, line.points.length - 1);
  const srcStyles = line.segmentStyles?.length ? line.segmentStyles : undefined;
  const srcKeys = line.segmentKeys ?? [];
  const styles: StrokeStyle[] = [];
  const keys: string[] = [];
  for (let i = 0; i < segCount; i++) {
    let refIdx = i;
    if (i >= insertAt) refIdx = Math.max(0, i - 1);
    const base = srcStyles?.[Math.min(refIdx, (srcStyles?.length ?? 1) - 1)] ?? line.style;
    styles.push({ ...base });
    const key = segmentKeyForPoints(line.points[i], line.points[i + 1]);
    keys.push(key);
  }
  line.segmentStyles = styles;
  line.segmentKeys = keys;
}

function attachPointToLine(pointIdx: number, hit: LineHit, click: { x: number; y: number }, fixedPos?: { x: number; y: number }) {
  const line = model.lines[hit.line];
  if (!line) return;
  const point = model.points[pointIdx];
  if (!point) return;

  if (hit.part === 'segment') {
    const aIdx = line.points[hit.seg];
    const bIdx = line.points[hit.seg + 1];
    const a = model.points[aIdx];
    const b = model.points[bIdx];
    if (!a || !b) return;
    const proj = fixedPos ?? projectPointOnSegment(click, a, b);
    model.points[pointIdx] = { ...point, x: proj.x, y: proj.y };
    // Save current other points for angles before modifying line
    const angleUpdates: { angle: Angle, leg1Other: number | null, leg2Other: number | null }[] = [];
    for (const angle of model.angles) {
      let leg1Other: number | null = null;
      let leg2Other: number | null = null;
      const leg1Ref = (angle as any).arm1LineId ?? (angle as any).leg1?.line;
      const leg2Ref = (angle as any).arm2LineId ?? (angle as any).leg2?.line;
      const leg1IdxResolved = resolveLineRefIndex(leg1Ref);
      const leg2IdxResolved = resolveLineRefIndex(leg2Ref);
      const leg1Matches = leg1IdxResolved === hit.line;
      const leg2Matches = leg2IdxResolved === hit.line;
      if (leg1Matches) {
        const legObj = (angle as any).leg1 ?? { line: (angle as any).arm1LineId, otherPoint: (angle as any).point1 ?? undefined };
        const res = getVertexOnLeg(legObj, angle.vertex);
        leg1Other = res >= 0 ? res : null;
      }
      if (leg2Matches) {
        const legObj = (angle as any).leg2 ?? { line: (angle as any).arm2LineId, otherPoint: (angle as any).point2 ?? undefined };
        const res = getVertexOnLeg(legObj, angle.vertex);
        leg2Other = res >= 0 ? res : null;
      }
      if (leg1Other !== null || leg2Other !== null) {
        angleUpdates.push({ angle, leg1Other, leg2Other });
      }
    }
    line.points.splice(hit.seg + 1, 0, pointIdx);
    const style = line.segmentStyles?.[hit.seg] ?? line.style;
    if (!line.segmentStyles) line.segmentStyles = [];
    line.segmentStyles.splice(hit.seg, 1, { ...style }, { ...style });
    // Update angle otherPoints after insertion
    for (const update of angleUpdates) {
      if (update.leg1Other !== null) {
        if ((update.angle as any).point1 !== undefined) (update.angle as any).point1 = update.leg1Other;
      }
      if (update.leg2Other !== null) {
        if ((update.angle as any).point2 !== undefined) (update.angle as any).point2 = update.leg2Other;
      }
    }
  } else if (hit.part === 'rayLeft' || hit.part === 'rayRight') {
    if (line.points.length < 1) return;
    const anchorIdx = hit.part === 'rayLeft' ? line.points[0] : line.points[line.points.length - 1];
    const otherIdx = hit.part === 'rayLeft' ? line.points[1] ?? anchorIdx : line.points[line.points.length - 2] ?? anchorIdx;
    const anchor = model.points[anchorIdx];
    const other = model.points[otherIdx];
    if (!anchor || !other) return;
    const dirProj = fixedPos ?? projectPointOnLine(click, anchor, other);
    model.points[pointIdx] = { ...point, x: dirProj.x, y: dirProj.y };
    if (hit.part === 'rayLeft') {
      // Save current other points for angles before modifying line
      const angleUpdates: { angle: Angle, leg1Other: number | null, leg2Other: number | null }[] = [];
      for (const angle of model.angles) {
        let leg1Other: number | null = null;
        let leg2Other: number | null = null;
        const leg1Ref = getAngleArmRef(angle, 1);
        const leg2Ref = getAngleArmRef(angle, 2);
        const leg1IdxResolved = resolveLineRefIndex(leg1Ref);
        const leg2IdxResolved = resolveLineRefIndex(leg2Ref);
        const leg1Matches = leg1IdxResolved === hit.line;
        const leg2Matches = leg2IdxResolved === hit.line;
        if (leg1Matches) {
          const legObj = makeAngleLeg(angle, 1);
          const res = getVertexOnLeg(legObj, angle.vertex);
          leg1Other = res >= 0 ? res : null;
        }
        if (leg2Matches) {
          const legObj = makeAngleLeg(angle, 2);
          const res = getVertexOnLeg(legObj, angle.vertex);
          leg2Other = res >= 0 ? res : null;
        }
        if (leg1Other !== null || leg2Other !== null) {
          angleUpdates.push({ angle, leg1Other, leg2Other });
        }
      }
      const insertAt = Math.min(1, line.points.length);
      line.points.splice(insertAt, 0, pointIdx);
      reorderLinePoints(hit.line);
      clearSelectedSegmentsForLine(hit.line);
      selectedSegments.add(segmentKey(hit.line, 'segment', 0));
      // Update canonical point refs after insertion (do not write legacy leg.otherPoint)
      for (const update of angleUpdates) {
        if (update.leg1Other !== null) {
          if ((update.angle as any).point1 !== undefined) (update.angle as any).point1 = update.leg1Other;
        }
        if (update.leg2Other !== null) {
          if ((update.angle as any).point2 !== undefined) (update.angle as any).point2 = update.leg2Other;
        }
      }
    } else {
      // Save current other points for angles before modifying line
      const angleUpdates: { angle: Angle, leg1Other: number | null, leg2Other: number | null }[] = [];
      for (const angle of model.angles) {
        let leg1Other: number | null = null;
        let leg2Other: number | null = null;
        const leg1Ref = getAngleArmRef(angle, 1);
        const leg2Ref = getAngleArmRef(angle, 2);
        const leg1IdxResolved = resolveLineRefIndex(leg1Ref);
        const leg2IdxResolved = resolveLineRefIndex(leg2Ref);
        const leg1Matches = leg1IdxResolved === hit.line;
        const leg2Matches = leg2IdxResolved === hit.line;
        if (leg1Matches) {
          const legObj = makeAngleLeg(angle, 1);
          const res = getVertexOnLeg(legObj, angle.vertex);
          leg1Other = res >= 0 ? res : null;
        }
        if (leg2Matches) {
          const legObj = makeAngleLeg(angle, 2);
          const res = getVertexOnLeg(legObj, angle.vertex);
          leg2Other = res >= 0 ? res : null;
        }
        if (leg1Other !== null || leg2Other !== null) {
          angleUpdates.push({ angle, leg1Other, leg2Other });
        }
      }
      const insertAt = Math.max(line.points.length - 1, 1);
      line.points.splice(insertAt, 0, pointIdx);
      reorderLinePoints(hit.line);
      clearSelectedSegmentsForLine(hit.line);
      const segIdx = Math.max(0, line.points.length - 2);
      selectedSegments.add(segmentKey(hit.line, 'segment', segIdx));
      // Update canonical point refs after insertion (do not write legacy leg.otherPoint)
      for (const update of angleUpdates) {
        if (update.leg1Other !== null) {
          if ((update.angle as any).point1 !== undefined) (update.angle as any).point1 = update.leg1Other;
        }
        if (update.leg2Other !== null) {
          if ((update.angle as any).point2 !== undefined) (update.angle as any).point2 = update.leg2Other;
        }
      }
    }
  }
  if (line.id) applyPointConstruction(pointIdx, [{ kind: 'line', id: line.id }]);
  ensureSegmentStylesForLine(hit.line);
  clearSelectedSegmentsForLine(hit.line);
  recomputeIntersectionPoint(pointIdx);
}

function projectPointOnSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  return engineProjectPointOnSegment(p as any, a as any, b as any);
}

function projectPointOnLine(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  return engineProjectPointOnLine(p as any, a as any, b as any);
}

function constrainToCircles(idx: number, desired: { x: number; y: number }) {
  const circleIdxs = circlesContainingPoint(idx);
  if (!circleIdxs.length) return desired;
  const circle = model.circles[circleIdxs[0]];
  const center = model.points[circle.center];
  const current = model.points[idx];
  if (!center || !current) return desired;
  const radius = circleRadius(circle);
  if (radius <= 0) return desired;
  let dir = { x: desired.x - center.x, y: desired.y - center.y };
  let len = Math.hypot(dir.x, dir.y);
  if (len < 1e-6) {
    dir = { x: current.x - center.x, y: current.y - center.y };
    len = Math.hypot(dir.x, dir.y) || 1;
  }
  const norm = { x: dir.x / len, y: dir.y / len };
  return { x: center.x + norm.x * radius, y: center.y + norm.y * radius };
}

function constrainToLineParent(idx: number, desired: { x: number; y: number }) {
  const p = model.points[idx];
  if (!p) return desired;
  const line = primaryLineParent(p);
  if (!line || line.points.length < 2) return desired;
  const a = model.points[line.points[0]];
  const b = model.points[line.points[line.points.length - 1]];
  if (!a || !b) return desired;
  return projectPointOnLine(desired, a, b);
}

function constrainToLineIdx(lineIdx: number | null | undefined, desired: { x: number; y: number }) {
  if (lineIdx === null || lineIdx === undefined) return desired;
  const line = model.lines[lineIdx];
  if (!line || line.points.length < 2) return desired;
  // Use DEFINING points to establish the line, not first/last in sorted array
  const aIdx = line.defining_points?.[0] ?? line.points[0];
  const bIdx = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  const a = model.points[aIdx];
  const b = model.points[bIdx];
  if (!a || !b) return desired;
  return projectPointOnLine(desired, a, b);
}

function lineCircleIntersections(
  a: { x: number; y: number },
  b: { x: number; y: number },
  center: { x: number; y: number },
  radius: number,
  clampToSegment = true
) {
  return engineLineCircleIntersections(a as any, b as any, center as any, radius, clampToSegment);
}

function createPerpBisectorFromPoints(pointIdx1: number, pointIdx2: number) {
  const point1 = model.points[pointIdx1];
  const point2 = model.points[pointIdx2];
  if (!point1 || !point2) return;

  // Create hidden line segment between the two points
  const hiddenSegmentStyle: StrokeStyle = { ...currentStrokeStyle(), hidden: true };
  const hiddenLineIdx = addLineFromPoints(model, pointIdx1, pointIdx2, hiddenSegmentStyle);

  // Create visible midpoint
  const midX = (point1.x + point2.x) / 2;
  const midY = (point1.y + point2.y) / 2;
  const midpointIdx = addPoint(model, {
    x: midX,
    y: midY,
    style: currentPointStyle(),
    construction_kind: 'midpoint',
    midpoint: {
      parents: [point1.id, point2.id],
      parentLineId: model.lines[hiddenLineIdx]?.id || null
    }
  });

  // Create perpendicular line through the midpoint
  const perpendicularIdx = createPerpendicularLineThroughPoint(midpointIdx, hiddenLineIdx);
  
  if (perpendicularIdx !== null) {
    selectedLineIndex = perpendicularIdx;
    selectedPointIndex = null;
  }
}

function createPerpBisectorFromLine(lineIdx: number, segmentIndex: number) {
  const line = model.lines[lineIdx];
  if (!line || segmentIndex >= line.points.length - 1) return;

  const pointIdx1 = line.points[segmentIndex];
  const pointIdx2 = line.points[segmentIndex + 1];
  const point1 = model.points[pointIdx1];
  const point2 = model.points[pointIdx2];
  if (!point1 || !point2) return;

  // Create visible midpoint
  const midX = (point1.x + point2.x) / 2;
  const midY = (point1.y + point2.y) / 2;
  const midpointIdx = addPoint(model, {
    x: midX,
    y: midY,
    style: currentPointStyle(),
    construction_kind: 'midpoint',
    midpoint: {
      parents: [point1.id, point2.id],
      parentLineId: line.id
    }
  });

  // Attach midpoint to the line
  insertPointIntoLine(lineIdx, midpointIdx, { x: midX, y: midY });

  // Create perpendicular line through the midpoint
  const perpendicularIdx = createPerpendicularLineThroughPoint(midpointIdx, lineIdx);
  
  if (perpendicularIdx !== null) {
    selectedLineIndex = perpendicularIdx;
    selectedPointIndex = null;
  }
}

function createTangentConstruction(pointIdx: number, circleIdx: number) {
  const point = model.points[pointIdx];
  const circle = model.circles[circleIdx];
  if (!point || !circle) return;

  const center = model.points[circle.center];
  if (!center) return;

  const radius = circleRadius(circle);
  if (radius <= 1e-6) return;

  // Check if point is inside the circle
  const distToCenter = Math.hypot(point.x - center.x, point.y - center.y);
  if (distToCenter < radius - 1e-2) {
    // Point is inside the circle - clear selections and do nothing
    selectedPointIndex = null;
    selectedCircleIndex = null;
    selectedLineIndex = null;
    return;
  }

  // Check if point is on the circle
  const ON_CIRCLE_TOLERANCE = 1e-2;
  
  if (Math.abs(distToCenter - radius) < ON_CIRCLE_TOLERANCE) {
    // Point is on circle: draw hidden radius and perpendicular to it
    // Use existing center point
    const radiusIdx = circle.center;

    // Create hidden radius line
    const radiusLineStyle: StrokeStyle = { ...currentStrokeStyle(), hidden: true };
    const radiusLineIdx = addLineFromPoints(model, radiusIdx, pointIdx, radiusLineStyle);

    // Create perpendicular tangent line through the point
    const perpendicularIdx = createPerpendicularLineThroughPoint(pointIdx, radiusLineIdx);
    
    if (perpendicularIdx !== null) {
      selectedLineIndex = perpendicularIdx;
      selectedPointIndex = null;
      selectedCircleIndex = null;
    }
  } else {
    // Point is not on circle: construct tangent lines using auxiliary circle
    // Create hidden midpoint between point and center
    const midX = (point.x + center.x) / 2;
    const midY = (point.y + center.y) / 2;
    const midpointIdx = addPoint(model, {
      x: midX,
      y: midY,
      style: { color: point.style.color, size: point.style.size, hidden: true },
      construction_kind: 'midpoint',
      midpoint: { parents: [point.id, center.id], parentLineId: null }
    });

    // Create hidden auxiliary circle centered at midpoint, passing through point
    const auxRadius = Math.hypot(point.x - midX, point.y - midY);
    const auxCircleIdx = addCircleWithCenter(midpointIdx, auxRadius, [pointIdx]);
    const auxCircle = model.circles[auxCircleIdx];
    if (auxCircle) {
      auxCircle.style = { ...auxCircle.style, hidden: true };
      auxCircle.hidden = true;
    }

    // Find intersection points of the two circles
    const intersections = circleCircleIntersections(
      { x: midX, y: midY },
      auxRadius,
      { x: center.x, y: center.y },
      radius
    );

    if (intersections.length > 0) {
      // Create intersection points (tangent points on the original circle)
      const tangentPointIndices: number[] = [];
      for (const inter of intersections) {
        const tangentPointIdx = addPoint(model, {
          ...inter,
          style: currentPointStyle(),
          construction_kind: 'free'
        });
        // Attach to both circles
        attachPointToCircle(circleIdx, tangentPointIdx, inter);
        attachPointToCircle(auxCircleIdx, tangentPointIdx, inter);
        tangentPointIndices.push(tangentPointIdx);
      }

      // Create hidden radii and tangents as perpendiculars to those radii
      const radiusIdx = circle.center;
      const radiusLineStyle: StrokeStyle = { ...currentStrokeStyle(), hidden: true };
      const tangentLineIndices: number[] = [];
      for (const tangentPointIdx of tangentPointIndices) {
        const radiusLineIdx = addLineFromPoints(model, radiusIdx, tangentPointIdx, radiusLineStyle);
        const tangentLineIdx = createPerpendicularLineThroughPoint(tangentPointIdx, radiusLineIdx);
        if (tangentLineIdx !== null) {
          tangentLineIndices.push(tangentLineIdx);
        }
      }

      // Select the first tangent line
      if (tangentLineIndices.length > 0) {
        const firstLineIdx = tangentLineIndices[0];
        selectedLineIndex = firstLineIdx;
        selectedPointIndex = null;
        selectedCircleIndex = null;
      }
    }
  }
}

function circleCircleIntersections(
  c1: { x: number; y: number },
  r1: number,
  c2: { x: number; y: number },
  r2: number
) {
  return engineCircleCircleIntersections(c1 as any, r1, c2 as any, r2);
}

function insertPointIntoLine(lineIdx: number, pointIdx: number, pos: { x: number; y: number }) {
  const line = model.lines[lineIdx];
  if (!line) return;
  if (line.points.includes(pointIdx)) return;
  const origin = model.points[line.points[0]];
  const end = model.points[line.points[line.points.length - 1]];
  if (!origin || !end) return;
  const dir = normalize({ x: end.x - origin.x, y: end.y - origin.y });
  const len = Math.hypot(end.x - origin.x, end.y - origin.y) || 1;
  const tFor = (p: { x: number; y: number }) => ((p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y) / len;
  const tNew = tFor(pos);
  const params = line.points.map((idx) => tFor(model.points[idx]));
  let insertAt = params.findIndex((t) => t > tNew + 1e-6);
  if (insertAt === -1) insertAt = line.points.length;
  line.points.splice(insertAt, 0, pointIdx);
  rebuildSegmentStylesAfterInsert(line, insertAt);
  clearSelectedSegmentsForLine(lineIdx);
}

function attachPointToCircle(circleIdx: number, pointIdx: number, pos: { x: number; y: number }) {
  const circle = model.circles[circleIdx];
  const center = model.points[circle.center];
  if (!circle || !center) return;
  const radius = circleRadius(circle);
  if (radius <= 0) return;
  const angle = Math.atan2(pos.y - center.y, pos.x - center.x);
  const target = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  model.points[pointIdx] = { ...model.points[pointIdx], ...target };
  if (!circle.points.includes(pointIdx)) circle.points.push(pointIdx);
  applyPointConstruction(pointIdx, [{ kind: 'circle', id: circle.id }]);
  if (selectedCircleIndex === circleIdx) {
    selectedArcSegments.clear();
  }
  recomputeIntersectionPoint(pointIdx);
}

function intersectLines(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number }
): { x: number; y: number } | null {
  const dxa = a2.x - a1.x;
  const dya = a2.y - a1.y;
  const dxb = b2.x - b1.x;
  const dyb = b2.y - b1.y;
  const denom = dxa * dyb - dya * dxb;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((b1.x - a1.x) * dyb - (b1.y - a1.y) * dxb) / denom;
  return { x: a1.x + dxa * t, y: a1.y + dya * t };
}

function enforceIntersections(lineIdx: number) {
  const line = model.lines[lineIdx];
  if (!line || line.points.length < 2) return;
  const a = model.points[line.points[0]];
  const b = model.points[line.points[line.points.length - 1]];
  if (!a || !b) return;
  line.points.forEach((pIdx) => {
    const otherLines = findLinesContainingPoint(pIdx).filter((li) => li !== lineIdx);
    if (!otherLines.length) return;
    otherLines.forEach((li) => {
      const other = model.lines[li];
      if (!other || other.points.length < 2) return;
      const oa = model.points[other.points[0]];
      const ob = model.points[other.points[other.points.length - 1]];
      if (!oa || !ob) return;
      const inter = intersectLines(a, b, oa, ob);
      if (inter) {
        model.points[pIdx] = { ...model.points[pIdx], ...inter };
      }
    });
  });
}

function getLineHandle(lineIdx: number) {
  const line = model.lines[lineIdx];
  if (!line) return null;
  if (line.hidden && !showHidden) return null;
  const raysHidden = (!line.leftRay || line.leftRay.hidden) && (!line.rightRay || line.rightRay.hidden);
  if (!raysHidden) return null;
  const extent = lineExtent(lineIdx);
  if (!extent) return null;
  const end = extent.endPointCoord;
  // offset handle further along the line direction and slightly perpendicular to avoid overlap
  const offset = 40;
  const vec = { x: end.x - extent.center.x, y: end.y - extent.center.y };
  const len = Math.hypot(vec.x, vec.y) || 1;
  const dir = { x: vec.x / len, y: vec.y / len };
  const perp = { x: -dir.y, y: dir.x };
  const perpOffset = 12;
  return {
    x: end.x + dir.x * offset + perp.x * perpOffset,
    y: end.y + dir.y * offset + perp.y * perpOffset
  };
}

function getLineRotateHandle(lineIdx: number) {
  const line = model.lines[lineIdx];
  if (!line) return null;
  if (line.hidden && !showHidden) return null;
  const raysHidden = (!line.leftRay || line.leftRay.hidden) && (!line.rightRay || line.rightRay.hidden);
  if (!raysHidden) return null;
  const extent = lineExtent(lineIdx);
  if (!extent) return null;
  // Place rotate handle above the center, offset perpendicular to line direction
  const center = extent.center;
  const dir = extent.dir;
  const perp = { x: -dir.y, y: dir.x };
  const offsetAlong = 0; // no further along the line
  const perpDistance = 44; // px in world units approx (visual distance)
  return {
    x: center.x + dir.x * offsetAlong + perp.x * perpDistance,
    y: center.y + dir.y * offsetAlong + perp.y * perpDistance
  };
}

function getCircleHandle(circleIdx: number) {
  const circle = model.circles[circleIdx];
  if (!circle) return null;
  if (circle.hidden && !showHidden) return null;
  const center = model.points[circle.center];
  if (!center) return null;
  const radius = circleRadius(circle);
  if (!(radius > 1e-3)) return null;
  // place scale handle to the right of circle, slightly offset outward
  const offset = 28;
  return { x: center.x + (radius + offset), y: center.y };
}

function getCircleRotateHandle(circleIdx: number) {
  const circle = model.circles[circleIdx];
  if (!circle) return null;
  if (circle.hidden && !showHidden) return null;
  const center = model.points[circle.center];
  if (!center) return null;
  const radius = circleRadius(circle);
  if (!(radius > 1e-3)) return null;
  // place rotate handle above the circle
  const perpDistance = radius + 44;
  return { x: center.x, y: center.y - perpDistance };
}

function lineExtent(lineIdx: number) {
  const line = model.lines[lineIdx];
  if (!line) return null;
  if (line.points.length < 2) return null;
  const a = model.points[line.points[0]];
  const b = model.points[line.points[line.points.length - 1]];
  if (!a || !b) return null;
  const dirVec = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(dirVec.x, dirVec.y) || 1;
  const dir = { x: dirVec.x / len, y: dirVec.y / len };
  const base = a;
  const projections: { idx: number; proj: number }[] = [];
  line.points.forEach((idx) => {
    if (!projections.some((p) => p.idx === idx)) {
      const p = model.points[idx];
      if (p) projections.push({ idx, proj: (p.x - base.x) * dir.x + (p.y - base.y) * dir.y });
    }
  });
  if (!projections.length) return null;
  const sorted = projections.sort((p1, p2) => p1.proj - p2.proj);
  const startProj = sorted[0];
  const endProj = sorted[sorted.length - 1];
  const centerProj = (startProj.proj + endProj.proj) / 2;
  const center = { x: base.x + dir.x * centerProj, y: base.y + dir.y * centerProj };
  const startPoint = model.points[startProj.idx];
  const endPoint = model.points[endProj.idx];
  const half = Math.abs(endProj.proj - centerProj);
  return {
    center,
    centerProj,
    dir,
    startPoint,
    endPoint,
    order: sorted,
    half,
    endPointIdx: endProj.idx,
    endPointCoord: endPoint ?? { x: base.x + dir.x * endProj.proj, y: base.y + dir.y * endProj.proj }
  };
}

function enforceAxisAlignment(lineIdx: number, axis: 'horizontal' | 'vertical') {
  const line = model.lines[lineIdx];
  if (!line) return;
  const refPoints = line.points
    .map((idx) => model.points[idx])
    .filter((pt): pt is Point => !!pt);
  if (!refPoints.length) return;
  const movable = line.points.filter((idx) => {
    const pt = model.points[idx];
    if (!pt) return false;
    if (!isPointDraggable(pt)) return false;
    if (circlesWithCenter(idx).length > 0) return false;
    return true;
  });
  if (!movable.length) return;
  const axisValue = axis === 'horizontal'
    ? refPoints.reduce((sum, p) => sum + p.y, 0) / refPoints.length
    : refPoints.reduce((sum, p) => sum + p.x, 0) / refPoints.length;
  const moved = new Set<number>();
  movable.forEach((idx) => {
    const pt = model.points[idx];
    if (!pt) return;
    if (axis === 'horizontal') {
      if (pt.y !== axisValue) {
        model.points[idx] = { ...pt, y: axisValue };
        moved.add(idx);
      }
    } else if (pt.x !== axisValue) {
      model.points[idx] = { ...pt, x: axisValue };
      moved.add(idx);
    }
  });
  if (moved.size) {
    updateIntersectionsForLine(lineIdx);
    updateParallelLinesForLine(lineIdx);
    updatePerpendicularLinesForLine(lineIdx);
    moved.forEach((idx) => {
      updateMidpointsForPoint(idx);
      updateCirclesForPoint(idx);
    });
  }
}

function polygonForLine(lineIdx: number): number | null {
  for (let i = 0; i < model.polygons.length; i++) {
    if (polygonHasLine(i, lineIdx)) return i;
  }
  return null;
}

function polygonHasPoint(pointIdx: number, poly: Polygon | undefined): boolean {
  if (!poly) return false;
  return poly.lines.some((li) => {
    const line = model.lines[li];
    return !!line && line.points.includes(pointIdx);
  });
}

function polygonVertices(polyRef: number | string): number[] {
  const idx = typeof polyRef === 'string' ? model.indexById.polygon[polyRef] : polyRef;
  const poly = polygonGet(idx as any);
  if (!poly) return [];
  const rt = runtime;
  const ids = polygonVerticesFromPolyRuntime(poly as any, rt) ?? polygonVerticesFromPoly(poly, model.points, model.lines);
  return ids.map((id: string) => model.indexById.point[id]).filter((v: any) => typeof v === 'number');
}

function polygonVerticesOrdered(polyRef: number | string): number[] {
  const idx = typeof polyRef === 'string' ? model.indexById.polygon[polyRef] : polyRef;
  const poly = polygonGet(idx as any);
  if (!poly) return [];
  const rt = runtime;
  const ordered = polygonVerticesOrderedFromPolyRuntime(poly as any, rt) ?? polygonVerticesOrderedFromPoly(poly, model.points, model.lines);
  if (!ordered || ordered.length === 0) return [];
  // normalize ordered vertex identifiers to numeric indices (runtime may return ids)
  const orderedIdxs = ordered.map((v) => (typeof v === 'string' ? model.indexById.point[v] : v)).filter((n) => typeof n === 'number') as number[];
  if (!orderedIdxs.length) return [];
  // rotate to start from top-most (highest y) like previous behavior
  const pts = orderedIdxs.map((idx) => ({ idx, p: model.points[idx] })).filter((v) => !!v.p);
  if (!pts.length) return [];
  const centroid = { x: pts.reduce((s, v) => s + v.p.x, 0) / pts.length, y: pts.reduce((s, v) => s + v.p.y, 0) / pts.length };
  pts.sort((a, b) => Math.atan2(a.p.y - centroid.y, a.p.x - centroid.x) - Math.atan2(b.p.y - centroid.y, b.p.x - centroid.x));
  const startIdx = pts.reduce((best, cur, i) => {
    const bestPt = pts[best].p;
    const curPt = cur.p;
    if (curPt.y > bestPt.y + 1e-6) return i;
    if (Math.abs(curPt.y - bestPt.y) < 1e-6 && curPt.x < bestPt.x) return i;
    return best;
  }, 0);
  const out: number[] = [];
  for (let i = 0; i < pts.length; i++) out.push(pts[(startIdx - i + pts.length) % pts.length].idx);
  return out;
}

function polygonLines(polyRef: number | string): number[] {
  const poly = polygonGet(polyRef);
  return poly && Array.isArray(poly.lines) ? poly.lines : [];
}

function polygonHasLine(polyRef: number | string, lineIdx: number): boolean {
  return polygonLines(polyRef).includes(lineIdx);
}

function polygonId(polyRef: number | string): string | undefined {
  const poly = polygonGet(polyRef);
  return poly?.id;
}

function polygonGet(polyRef: number | string) {
  const idx = typeof polyRef === 'string' ? model.indexById.polygon[polyRef] : polyRef;
  return typeof idx === 'number' ? model.polygons[idx] : undefined;
}

function polygonSet(polyRef: number | string, updater: Polygon | ((old?: Polygon) => Polygon | undefined)) {
  const idx = typeof polyRef === 'string' ? model.indexById.polygon[polyRef] : polyRef;
  if (typeof idx !== 'number' || idx < 0 || idx >= model.polygons.length) return;
  const old = model.polygons[idx];
  const next = typeof updater === 'function' ? (updater as (o?: Polygon) => Polygon | undefined)(old) : updater;
  if (!next) return;
  model.polygons[idx] = next;
}

function createPolygon(lines: number[], kind: string = 'free'): number {
  const polyId = nextId('polygon', model);
  const poly: Polygon = {
    object_type: 'polygon',
    id: polyId,
    lines: [...lines],
    construction_kind: kind as any,
    defining_parents: [],
    recompute: () => {},
    on_parent_deleted: () => {}
  };
  model.polygons.push(poly);
  registerIndex(model, 'polygon', polyId, model.polygons.length - 1);
  return model.polygons.length - 1;
}

function removePolygon(polyRef: number | string) {
  const idx = typeof polyRef === 'string' ? model.indexById.polygon[polyRef] : polyRef;
  if (typeof idx !== 'number' || idx < 0 || idx >= model.polygons.length) return;
  const copy = model.polygons.slice();
  copy.splice(idx, 1);
  setPolygonsArray(copy);
}

function ensurePolygonClosed(poly: Polygon): Polygon {
  // If polygon already uses vertex list, ensure closure by checking edges between consecutive vertices
  if ((poly as any).vertices && Array.isArray((poly as any).vertices) && (poly as any).vertices.length) {
    // Normalize vertices to numeric indices if runtime ids are present
    const rawVerts = Array.from(new Set((poly as any).vertices as any[]));
    const verts = rawVerts
      .map((v) => (typeof v === 'string' ? model.indexById.point[v] : v))
      .filter((n) => typeof n === 'number') as number[];
    if (verts.length < 3) return poly;
    const hasEdgePair = (a: number, b: number) => model.lines.some((ln) => ln && ln.defining_points && ((ln.defining_points[0] === a && ln.defining_points[1] === b) || (ln.defining_points[0] === b && ln.defining_points[1] === a)));
    const baseStyle = currentStrokeStyle();
    const newLineIndices: number[] = [];
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      if (!hasEdgePair(a, b)) {
        const ln = addLineFromPoints(model, a, b, { ...baseStyle });
        newLineIndices.push(ln);
      }
    }
    if (newLineIndices.length === 0) return poly;
    return { ...poly, lines: [...(poly.lines || []), ...newLineIndices] };
  }

  // Try runtime helper to build ordered vertex list (preferred)
  if (!poly.lines || poly.lines.length < 2) return poly;
  try {
    const rt = modelToRuntime(model as any);
    const edgeLineIds = (poly.lines || []).map((li) => model.lines[li]?.id).filter(Boolean) as string[];
    const tempPoly = { edgeLines: edgeLineIds } as any;
    const vertIds = polygonVerticesOrderedFromPolyRuntime(tempPoly, rt);
    const orderedVerts = vertIds.map((id) => model.indexById.point[id]).filter((n): n is number => Number.isInteger(n));
    if (orderedVerts.length < 3) return poly;
    const hasEdge = (a: number, b: number) => poly.lines.some((li) => {
      const line = model.lines[li];
      if (!line || !line.defining_points) return false;
      const s = line.defining_points[0];
      const e = line.defining_points[1];
      return (s === a && e === b) || (s === b && e === a);
    });
    const baseStyle = (() => {
      for (const li of poly.lines) {
        const line = model.lines[li];
        if (line) return { ...line.style };
      }
      return currentStrokeStyle();
    })();
    const newLineIndices: number[] = [];
    for (let i = 0; i < orderedVerts.length; i++) {
      const a = orderedVerts[i];
      const b = orderedVerts[(i + 1) % orderedVerts.length];
      if (!hasEdge(a, b)) newLineIndices.push(addLineFromPoints(model, a, b, { ...baseStyle }));
    }
    if (newLineIndices.length === 0) return poly;
    return { ...poly, lines: [...(poly.lines || []), ...newLineIndices] };
  } catch (e) {
    // Fallback: legacy numeric-line case
    const vertsLegacy: number[] = [];
    for (const li of poly.lines) {
      const line = model.lines[li];
      if (!line || !line.defining_points || line.defining_points.length < 2) continue;
      const s = line.defining_points[0];
      const e = line.defining_points[1];
      if (vertsLegacy.length === 0) {
        vertsLegacy.push(s, e);
      } else {
        const last = vertsLegacy[vertsLegacy.length - 1];
        if (s === last) vertsLegacy.push(e);
        else if (e === last) vertsLegacy.push(s);
        else {
          const first = vertsLegacy[0];
          if (e === first) vertsLegacy.unshift(s);
          else if (s === first) vertsLegacy.unshift(e);
          else {
            // disconnected; ignore
          }
        }
      }
    }
    const ordered: number[] = [];
    for (let i = 0; i < vertsLegacy.length; i++) if (i === 0 || vertsLegacy[i] !== vertsLegacy[i - 1]) ordered.push(vertsLegacy[i]);
    if (ordered.length < 3 || ordered[ordered.length - 1] === ordered[0]) return poly;
    const hasEdge2 = (a: number, b: number) => poly.lines.some((li) => {
      const line = model.lines[li];
      if (!line || !line.defining_points) return false;
      const s = line.defining_points[0];
      const e = line.defining_points[1];
      return (s === a && e === b) || (s === b && e === a);
    });
    const baseStyle2 = (() => {
      for (const li of poly.lines) {
        const line = model.lines[li];
        if (line) return { ...line.style };
      }
      return currentStrokeStyle();
    })();
    const newLineIndices2: number[] = [];
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i];
      const b = ordered[i + 1];
      if (!hasEdge2(a, b)) newLineIndices2.push(addLineFromPoints(model, a, b, { ...baseStyle2 }));
    }
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (!hasEdge2(last, first)) newLineIndices2.push(addLineFromPoints(model, last, first, { ...baseStyle2 }));
    if (newLineIndices2.length === 0) return poly;
    return { ...poly, lines: [...(poly.lines || []), ...newLineIndices2] };
  }
}

function remapAngles(lineRemap: Map<number, number>) {
  model.angles = model.angles.filter((ang) => {
    // Handle legacy leg1/leg2 and new arm1LineId/arm2LineId
    const legacy1 = (ang as any).leg1;
    const legacy2 = (ang as any).leg2;
    const arm1 = (ang as any).arm1LineId;
    const arm2 = (ang as any).arm2LineId;
    const arm1Idx = typeof arm1 === 'number' ? arm1 : typeof arm1 === 'string' ? model.indexById?.line?.[arm1] : undefined;
    const arm2Idx = typeof arm2 === 'number' ? arm2 : typeof arm2 === 'string' ? model.indexById?.line?.[arm2] : undefined;
    const newLeg1Line = legacy1 ? lineRemap.get(legacy1.line) : (arm1Idx !== undefined ? lineRemap.get(arm1Idx) : undefined);
    const newLeg2Line = legacy2 ? lineRemap.get(legacy2.line) : (arm2Idx !== undefined ? lineRemap.get(arm2Idx) : undefined);
    // If neither maps to a valid line, drop the angle
    if ((newLeg1Line === undefined || newLeg1Line < 0) && (newLeg2Line === undefined || newLeg2Line < 0)) {
      if (ang.label) reclaimLabel(ang.label);
      return false;
    }
    // Do not mutate legacy `leg1`/`leg2` objects; migrate mapped numeric indices
    // into runtime arm id fields so runtime consumers remain id-first.
    if (newLeg1Line !== undefined && newLeg1Line >= 0) {
      const mappedId = model.lines[newLeg1Line]?.id;
      if (mappedId) (ang as any).arm1LineId = mappedId;
    }
    if (newLeg2Line !== undefined && newLeg2Line >= 0) {
      const mappedId2 = model.lines[newLeg2Line]?.id;
      if (mappedId2) (ang as any).arm2LineId = mappedId2;
    }
    return true;
  });
}

function remapPolygons(lineRemap: Map<number, number>) {
  const remapped = model.polygons
    .map((poly) => {
      // Prefer mapping existing lines; if polygon uses vertices, try to remap edgeLines
      if ((poly as any).vertices && Array.isArray((poly as any).vertices) && (poly as any).vertices.length) {
        // attempt to map vertex pairs to existing remapped lines
        const verts = (poly as any).vertices as number[];
        const lines: number[] = [];
        for (let i = 0; i < verts.length; i++) {
          const a = verts[i];
          const b = verts[(i + 1) % verts.length];
          // find original line index that connected a and b
          const found = model.lines.findIndex((ln) => ln && ln.defining_points && ((ln.defining_points[0] === a && ln.defining_points[1] === b) || (ln.defining_points[0] === b && ln.defining_points[1] === a)));
          if (found >= 0) {
            const mapped = lineRemap.get(found);
            if (mapped !== undefined && mapped >= 0) lines.push(mapped);
          }
        }
        return {
          object_type: 'polygon' as const,
          id: poly.id,
          lines,
          construction_kind: poly.construction_kind,
          defining_parents: [...poly.defining_parents],
          recompute: poly.recompute,
          on_parent_deleted: poly.on_parent_deleted
        };
      }
      const lines = poly.lines
        .map((li) => lineRemap.get(li))
        .filter((v): v is number => v !== undefined && v >= 0);
      return {
        object_type: 'polygon' as const,
        id: poly.id,
        lines,
        construction_kind: poly.construction_kind,
        defining_parents: [...poly.defining_parents],
        recompute: poly.recompute,
        on_parent_deleted: poly.on_parent_deleted
      };
    })
    .filter((p) => p.lines.length > 1);
  const finalPolys = remapped.map((poly) => ensurePolygonClosed(poly)).filter((p) => p.lines.length >= 3);
  setPolygonsArray(finalPolys);
}

function setPolygonsArray(polys: Polygon[]) {
  model.polygons = polys;
  rebuildIndexMaps();
}

function lineIndexById(id: string): number | null {
  const idx = model.indexById.line[id];
  return Number.isInteger(idx) ? (idx as number) : null;
}

function pointIndexById(id: string): number | null {
  const idx = model.points.findIndex((p) => p.id === id);
  return idx >= 0 ? idx : null;
}

function anyIndexById(id: string): { kind: GeometryKind; idx: number } | null {
  const kinds: GeometryKind[] = ['point', 'line', 'circle', 'angle', 'polygon'];
  for (const k of kinds) {
    const mapIdx = model.indexById[k][id];
    if (Number.isInteger(mapIdx)) return { kind: k, idx: mapIdx as number };
  }
  return null;
}

function friendlyLabelForId(id: string): string {
  const resolved = anyIndexById(id);
  if (!resolved) return '?';
  // if (!resolved) return id;
  const prefix = LABEL_PREFIX[resolved.kind] ?? '';
  return `${prefix}${resolved.idx + 1}`;
}

function primaryLineParent(p: Point): Line | null {
  const lp = p.parent_refs.find((pr) => pr.kind === 'line');
  if (!lp) return null;
  const idx = lineIndexById(lp.id);
  if (idx === null) return null;
  return model.lines[idx] ?? null;
}

function ensureSegmentStylesForLine(lineIdx: number) {
  const line = model.lines[lineIdx];
  if (!line) return;
  const segCount = Math.max(0, line.points.length - 1);
  const srcStyles = line.segmentStyles ?? [];
  const srcKeys = line.segmentKeys ?? [];
  const styles: StrokeStyle[] = [];
  const keys: string[] = [];
  for (let i = 0; i < segCount; i++) {
    const key = segmentKeyForPoints(line.points[i], line.points[i + 1]);
    const existingIdx = srcKeys.indexOf(key);
    const base =
      (existingIdx >= 0 ? srcStyles[existingIdx] : srcStyles[Math.min(i, srcStyles.length - 1)]) ?? line.style;
    styles.push({ ...base });
    keys.push(key);
  }
  line.segmentStyles = styles;
  line.segmentKeys = keys;
}

function reorderLinePoints(lineIdx: number) {
  const line = model.lines[lineIdx];
  if (!line) return;
  const rt = runtime;
  const reorderedIds = reorderLinePointIdsRuntime(line.id, rt);
  const reordered = reorderedIds ? reorderedIds.map((id: string) => model.indexById.point[id]) : reorderLinePointsPure(line, model.points);
  if (!reordered) return;
  line.points = reordered;
  ensureSegmentStylesForLine(lineIdx);
}

function findSegmentIndex(line: Line, p1: number, p2: number): number {
  return findSegmentIndexPure(line, p1, p2, model.points);
}

// Helpers to centralize mixed legacy/runtime angle leg access
function getAngleArmRef(ang: any, leg: 1 | 2): string | number | undefined {
  return leg === 1 ? (ang as any).arm1LineId ?? (ang as any).leg1?.line : (ang as any).arm2LineId ?? (ang as any).leg2?.line;
}

function makeAngleLeg(ang: any, leg: 1 | 2) {
  if (leg === 1) return (ang as any).leg1 ?? { line: (ang as any).arm1LineId, otherPoint: (ang as any).point1 ?? undefined };
  return (ang as any).leg2 ?? { line: (ang as any).arm2LineId, otherPoint: (ang as any).point2 ?? undefined };
}

function getVertexOnLeg(leg: any, vertex: number): number {
  // legacy numeric-line case
  if (leg && typeof leg.line === 'number') return getVertexOnLegPure(leg, vertex, model.points, model.lines);
  // runtime/object-id case
  const rt = runtime;
  const vertexId = model.points[vertex]?.id;
  if (!vertexId) return -1;
  const otherId = getVertexOnLegRuntime(leg, vertexId, rt);
  return otherId ? (model.indexById.point[otherId] ?? -1) : -1;
}

function getAngleLegSeg(angle: Angle, leg: 1 | 2): number {
  const legacy = leg === 1 ? (angle as any).leg1 : (angle as any).leg2;
  if (legacy && typeof legacy.line === 'number') return findSegmentIndexPure(model.lines[legacy.line], angle.vertex, legacy.otherPoint, model.points);
  const armLine = leg === 1 ? (angle as any).arm1LineId : (angle as any).arm2LineId;
  if (typeof armLine === 'number') {
    const other = getVertexOnLegPure({ line: armLine }, angle.vertex, model.points, model.lines);
    return findSegmentIndexPure(model.lines[armLine], angle.vertex, other, model.points);
  }
  // runtime armLine id case
  if (typeof armLine === 'string') {
    const rt = runtime;
    const otherId = getVertexOnLegRuntime({ line: armLine }, model.points[angle.vertex]?.id, rt);
    const otherIdx = otherId ? model.indexById.point[otherId] : -1;
    const armLineIdx = model.indexById.line[armLine] ?? -1;
    if (armLineIdx >= 0 && otherIdx >= 0) return findSegmentIndexPure(model.lines[armLineIdx], angle.vertex, otherIdx, model.points);
  }
  return 0;
}

// Debug panel DOM functions moved to src/debugPanel.ts; main.ts uses the exported helpers.

function drawDebugLabels() {
  // Delegate pure drawing to the renderer module. Keep DOM/event logic here.
  try {
    drawDebugLabelsCanvas(ctx, model, worldToCanvas, screenUnits, pointRadius, zoomFactor, lineExtent, circleRadius, polygonCentroid, friendlyLabelForId, showHidden, dpr);
  } catch (e) {
    // Fail silently to avoid breaking rendering flow
  }
}

function recomputeIntersectionPoint(pointIdx: number) {
  const point = model.points[pointIdx];
  if (!point || point.parent_refs.length < 2) return;
  // Support points that may have been created with more than two parents
  // (e.g., intersection of multiple lines recorded with extra parents).
  // Use the first two parents to compute the intersection for recompute purposes.
  const [pa, pb] = point.parent_refs.slice(0, 2);
  const finalize = () => updateMidpointsForPoint(pointIdx);

  const styleWithHidden = (target: Point, hidden: boolean) => {
    const currentHidden = target.style.hidden ?? false;
    if (hidden === currentHidden) return target.style;
    return { ...target.style, hidden };
  };

  // Fast-path: try id-based runtime engine adapter (works on maps)
  try {
    const ptsMap = new Map<string, Point>();
    model.points.forEach((p) => { if (p && p.id) ptsMap.set(p.id, p); });
    const linesMap = new Map<string, Line>();
    model.lines.forEach((l) => { if (l && l.id) linesMap.set(l.id, l); });
    const circlesMap = new Map<string, Circle>();
    model.circles.forEach((c) => { if (c && c.id) circlesMap.set(c.id, c); });

    const res = recomputeIntersectionPointEngineById(ptsMap, linesMap, circlesMap, point.id, {
      intersectLines,
      lineCircleIntersections,
      projectPointOnLine,
      circleRadius
    });
    if (res) {
      model.points[pointIdx] = { ...point, x: res.x, y: res.y, style: styleWithHidden(point, !!res.hidden) };
      finalize();
      return;
    }
  } catch (e) {
    // swallow and fall back to legacy implementation
  }

  // line-line
  if (pa.kind === 'line' && pb.kind === 'line') {
    const lineAIdx = lineIndexById(pa.id);
    const lineBIdx = lineIndexById(pb.id);
    if (lineAIdx === null || lineBIdx === null) return;
    const lineA = model.lines[lineAIdx];
    const lineB = model.lines[lineBIdx];
    if (!lineA || !lineB || lineA.points.length < 2 || lineB.points.length < 2) return;
    const a1 = model.points[lineA.points[0]];
    const a2 = model.points[lineA.points[lineA.points.length - 1]];
    const b1 = model.points[lineB.points[0]];
    const b2 = model.points[lineB.points[lineB.points.length - 1]];
    if (!a1 || !a2 || !b1 || !b2) return;
    const inter = intersectLines(a1, a2, b1, b2);
    if (inter) {
      model.points[pointIdx] = { ...point, x: inter.x, y: inter.y, style: styleWithHidden(point, false) };
    }
    finalize();
    return;
  }

  // line-circle
  if ((pa.kind === 'line' && pb.kind === 'circle') || (pa.kind === 'circle' && pb.kind === 'line')) {
    const lineRef = pa.kind === 'line' ? pa : pb;
    const circRef = pa.kind === 'circle' ? pa : pb;
    const lineIdx = lineIndexById(lineRef.id);
    const circleIdx = model.indexById.circle[circRef.id];
    if (lineIdx === null || circleIdx === undefined) return;
    const line = model.lines[lineIdx];
    const circle = model.circles[circleIdx];
    if (!line || !circle || line.points.length < 2) return;
    const a = model.points[line.points[0]];
    const b = model.points[line.points[line.points.length - 1]];
    const center = model.points[circle.center];
    const radius = circleRadius(circle);
    if (!a || !b || !center || radius <= 0) return;
    const pts = lineCircleIntersections(a, b, center, radius, false);
    if (!pts.length) {
      const fallback = projectPointOnLine({ x: point.x, y: point.y }, a, b);
      model.points[pointIdx] = { ...point, ...fallback, style: styleWithHidden(point, true) };
      finalize();
      return;
    }
    pts.sort((p1, p2) => Math.hypot(p1.x - point.x, p1.y - point.y) - Math.hypot(p2.x - point.x, p2.y - point.y));
    const best = pts[0];
    model.points[pointIdx] = { ...point, x: best.x, y: best.y, style: styleWithHidden(point, false) };
    finalize();
    return;
  }

  // circle-circle
  if (pa.kind === 'circle' && pb.kind === 'circle') {
    const circleAIdx = model.indexById.circle[pa.id];
    const circleBIdx = model.indexById.circle[pb.id];
    if (circleAIdx === undefined || circleBIdx === undefined) return;
    const circleA = model.circles[circleAIdx];
    const circleB = model.circles[circleBIdx];
    if (!circleA || !circleB) return;
    const centerA = model.points[circleA.center];
    const centerB = model.points[circleB.center];
    const radiusA = circleRadius(circleA);
    const radiusB = circleRadius(circleB);
    if (!centerA || !centerB || radiusA <= 0 || radiusB <= 0) return;
    const pts = circleCircleIntersections(centerA, radiusA, centerB, radiusB);
    const shareSameParentPair = (other: Point) => {
      if (other.parent_refs.length !== 2) return false;
      const circles = other.parent_refs.filter((pr) => pr.kind === 'circle');
      if (circles.length !== 2) return false;
      const ids = circles.map((pr) => pr.id);
      return ids.includes(pa.id) && ids.includes(pb.id);
    };
    const siblingIdxs = model.points
      .map((other, idx) => (idx !== pointIdx && other && other.construction_kind === 'intersection' && shareSameParentPair(other) ? idx : null))
      .filter((idx): idx is number => idx !== null);
    const groupIdxs = [pointIdx, ...siblingIdxs].filter((idx, i, arr) => arr.indexOf(idx) === i);

    if (!pts.length) {
      groupIdxs.forEach((idx) => {
        const target = model.points[idx];
        if (!target) return;
        model.points[idx] = { ...target, style: styleWithHidden(target, true) };
      });
      finalize();
      return;
    }

    if (pts.length === 1) {
      const pos = pts[0];
      groupIdxs.forEach((idx) => {
        const target = model.points[idx];
        if (!target) return;
        model.points[idx] = { ...target, x: pos.x, y: pos.y, style: styleWithHidden(target, false) };
      });
      finalize();
      return;
    }

    if (groupIdxs.length >= 2) {
      const idxA = groupIdxs[0];
      const idxB = groupIdxs[1];
      const pointA = model.points[idxA];
      const pointB = model.points[idxB];
      if (pointA && pointB) {
        const dist = (pt: Point, pos: { x: number; y: number }) => Math.hypot(pt.x - pos.x, pt.y - pos.y);
        const dA0 = dist(pointA, pts[0]);
        const dA1 = dist(pointA, pts[1]);
        const dB0 = dist(pointB, pts[0]);
        const dB1 = dist(pointB, pts[1]);
        const assignFirst = dA0 + dB1 <= dA1 + dB0;
        const assignments = assignFirst
          ? [
              { idx: idxA, target: pointA, pos: pts[0] },
              { idx: idxB, target: pointB, pos: pts[1] }
            ]
          : [
              { idx: idxA, target: pointA, pos: pts[1] },
              { idx: idxB, target: pointB, pos: pts[0] }
            ];
        assignments.forEach(({ idx, target, pos }) => {
          model.points[idx] = { ...target, x: pos.x, y: pos.y, style: styleWithHidden(target, false) };
        });
        if (groupIdxs.length > 2) {
          groupIdxs.slice(2).forEach((idx) => {
            const target = model.points[idx];
            if (!target) return;
            model.points[idx] = { ...target, style: styleWithHidden(target, true) };
          });
        }
        finalize();
        return;
      }
    }

    pts.sort((p1, p2) => Math.hypot(p1.x - point.x, p1.y - point.y) - Math.hypot(p2.x - point.x, p2.y - point.y));
    const best = pts[0];
    model.points[pointIdx] = { ...point, x: best.x, y: best.y, style: styleWithHidden(point, false) };
    finalize();
    return;
  }

  finalize();
}

function updateIntersectionsForLine(lineIdx: number) {
  const line = model.lines[lineIdx];
  if (!line) return;
  const lineId = line.id;
  model.points.forEach((_, pi) => {
    const pt = model.points[pi];
    if (!pt) return;
    if (pt.parent_refs.some((pr) => pr.kind === 'line' && pr.id === lineId)) {
      if (pt.construction_kind === 'intersection') {
        recomputeIntersectionPoint(pi);
      }
      // Don't constrain on_object points - they are already positioned correctly
      // by applyLineFractions when line endpoints move
    }
  });
  updateSymmetricPointsForLine(lineIdx);
}

function updateIntersectionsForCircle(circleIdx: number) {
  const circle = model.circles[circleIdx];
  if (!circle) return;
  const cid = circle.id;
  model.points.forEach((pt, pi) => {
    if (!pt) return;
    if (pt.parent_refs.some((pr) => pr.kind === 'circle' && pr.id === cid)) {
      if (pt.construction_kind === 'intersection') {
        recomputeIntersectionPoint(pi);
      } else {
        const constrained = constrainToCircles(pi, constrainToLineParent(pi, { x: pt.x, y: pt.y }));
        model.points[pi] = { ...pt, ...constrained };
        updateMidpointsForPoint(pi);
      }
    }
  });
}

function findHandle(p: { x: number; y: number }): { kind: 'line' | 'circle' | 'group'; idx: number; type: 'scale' | 'rotate' } | null {
  const padWorld = screenUnits(HANDLE_SIZE / 2 + HANDLE_HIT_PAD);
  // check lines first (top-most order)
  for (let i = model.lines.length - 1; i >= 0; i--) {
    // Only consider line handles if the line is actually selected (handlers are drawn only for selected lines)
    if (selectedLineIndex === i) {
      const handle = getLineHandle(i);
      if (handle) {
        const dx = p.x - handle.x;
        const dy = p.y - handle.y;
        if (Math.hypot(dx, dy) <= padWorld) {
          return { kind: 'line', idx: i, type: 'scale' };
        }
      }
      const rotateHandle = getLineRotateHandle(i);
      if (rotateHandle) {
        const dx = p.x - rotateHandle.x;
        const dy = p.y - rotateHandle.y;
        if (Math.hypot(dx, dy) <= padWorld) {
          return { kind: 'line', idx: i, type: 'rotate' };
        }
      }
    }
  }
  // check circles
  for (let i = model.circles.length - 1; i >= 0; i--) {
    // Only consider circle handles when the circle is selected and edge handles are visible
    if (selectedCircleIndex === i && selectionEdges) {
      const handle = getCircleHandle(i);
      if (handle) {
        const dx = p.x - handle.x;
        const dy = p.y - handle.y;
        if (Math.hypot(dx, dy) <= padWorld) {
          return { kind: 'circle', idx: i, type: 'scale' };
        }
      }
      const rotateHandle = getCircleRotateHandle(i);
      if (rotateHandle) {
        const dx = p.x - rotateHandle.x;
        const dy = p.y - rotateHandle.y;
        if (Math.hypot(dx, dy) <= padWorld) {
          return { kind: 'circle', idx: i, type: 'rotate' };
        }
      }
    }
  }
  // check multiselect group handles (when active)
  if (mode === 'multiselect' && hasMultiSelection()) {
    const mh = getMultiHandles();
    if (mh) {
      const dxs = p.x - mh.scaleHandle.x;
      const dys = p.y - mh.scaleHandle.y;
      if (Math.hypot(dxs, dys) <= padWorld) return { kind: 'group', idx: -1, type: 'scale' };
      const dxr = p.x - mh.rotateHandle.x;
      const dyr = p.y - mh.rotateHandle.y;
      if (Math.hypot(dxr, dyr) <= padWorld) return { kind: 'group', idx: -1, type: 'rotate' };
    }
  }
  return null;
}

// Compute group (multiselect) handles: scale at bottom-right of bbox, rotate above top-center
function getMultiHandles() {
  // collect all selected object points
  const points = new Set<number>();
  multiSelectedPoints.forEach((i) => points.add(i));
  multiSelectedLines.forEach((li) => model.lines[li]?.points.forEach((pi) => points.add(pi)));
  multiSelectedCircles.forEach((ci) => {
    const c = model.circles[ci];
    if (!c) return;
    points.add(c.center);
    if (c.radius_point !== undefined) points.add(c.radius_point);
    c.points.forEach((pi) => points.add(pi));
  });
  multiSelectedAngles.forEach((ai) => {
    const a = model.angles[ai];
    if (!a) return;
    points.add(a.vertex);
  });
  multiSelectedPolygons.forEach((pid) => {
    const pidx = model.indexById.polygon[pid];
    if (typeof pidx !== 'number') return;
    polygonGet(pidx)?.lines.forEach((li) => model.lines[li]?.points.forEach((p) => points.add(p)));
  });
  multiSelectedInkStrokes.forEach((si) => {
    const s = model.inkStrokes[si];
    if (!s) return;
    s.points.forEach(() => {}); // no world points for ink here
  });

  const pts = Array.from(points).map((i) => model.points[i]).filter(Boolean) as Point[];
  if (pts.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  pts.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });
  const bbox = { minX, minY, maxX, maxY };
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  // Use world-space offsets similar to other handle functions
  const scaleHandle = { x: maxX + 40, y: maxY + 40 };
  const rotateHandle = { x: center.x, y: minY - 44 };
  return { bbox, center, scaleHandle, rotateHandle };
}

// Button configuration now initialized from config pane in initRuntime()

function showUpdatePrompt(
  message = 'Dostępna jest nowa wersja. Kliknij, aby odświeżyć aplikację.',
  action?: () => void
) {
  updatePromptAction = action ?? null;

  const toast = document.getElementById('swUpdateToast') as HTMLElement | null;
  const toastText = document.getElementById('swUpdateText') as HTMLElement | null;
  const toastApply = document.getElementById('swUpdateBtn') as HTMLButtonElement | null;
  const toastDismiss = document.getElementById('swDismissBtn') as HTMLButtonElement | null;
  if (toast && toastText && toastApply && toastDismiss) {
    toastText.textContent = message;
    toast.style.display = 'block';
    toastApply.disabled = false;
    toastApply.textContent = 'Zastosuj';
    toastApply.onclick = () => {
      toastApply.disabled = true;
      toastApply.textContent = 'Aktualizuj¦...';
      if (updatePromptAction) {
        try {
          updatePromptAction();
        } catch (err) {
          
          window.location.reload();
        }
      } else {
        window.location.reload();
      }
    };
    toastDismiss.onclick = () => {
      toast.style.display = 'none';
      updatePromptEl = null;
      updatePromptAction = null;
    };
    updatePromptEl = toast;
    return;
  }

  if (updatePromptEl) {
    const textNode = updatePromptEl.querySelector('.update-banner__text');
    if (textNode) textNode.textContent = message;
    updatePromptEl.classList.add('update-banner--visible');
    return;
  }
  
  if (!document.body) return;
  
  const banner = document.createElement('div');
  banner.className = 'update-banner update-banner--visible';
  banner.style.cssText = `
    position:fixed;
    bottom:16px;
    right:16px;
    z-index:9999;
    display:flex;
    align-items:center;
    gap:12px;
    padding:12px 16px;
    border-radius:999px;
    background:rgba(17,24,39,0.95);
    color:#fff;
    box-shadow:0 10px 30px rgba(0,0,0,0.35);
    font-size:14px;
    line-height:1.4;
    max-width:90vw;
  `;
  
  const textSpan = document.createElement('span');
  textSpan.className = 'update-banner__text';
  textSpan.textContent = message;
  textSpan.style.flex = '1';
  banner.appendChild(textSpan);
  
  const reloadBtn = document.createElement('button');
  reloadBtn.type = 'button';
  reloadBtn.textContent = 'Odśwież';
  reloadBtn.style.cssText = `
    background:#3b82f6;
    color:#fff;
    border:none;
    border-radius:999px;
    padding:6px 14px;
    font-weight:600;
    cursor:pointer;
  `;
  reloadBtn.addEventListener('click', () => {
    reloadBtn.disabled = true;
    reloadBtn.textContent = 'Ładowanie...';
    if (updatePromptAction) {
      try {
        updatePromptAction();
      } catch (err) {
        
        window.location.reload();
      }
    } else {
      window.location.reload();
    }
  });
  banner.appendChild(reloadBtn);
  
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Zamknij');
  closeBtn.style.cssText = `
    background:transparent;
    border:none;
    color:inherit;
    font-size:18px;
    line-height:1;
    cursor:pointer;
  `;
  closeBtn.addEventListener('click', () => {
    banner.classList.remove('update-banner--visible');
    banner.style.opacity = '0';
    banner.style.pointerEvents = 'none';
    setTimeout(() => banner.remove(), 300);
    updatePromptEl = null;
    updatePromptAction = null;
  });
  banner.appendChild(closeBtn);
  
  document.body.appendChild(banner);
  updatePromptEl = banner;
}

// Rejestracja service workera
if ('serviceWorker' in navigator) {
  let reloadPending = false;
  let updateRequestedByUser = false;
  // whether the page was controlled by a SW when we started
  const pageWasControlled = !!navigator.serviceWorker.controller;

  const promptForUpdate = (worker: ServiceWorker) => {
    const message = navigator.onLine
      ? 'Dostępna jest nowa wersja. Kliknij, aby odświeżyć aplikację.'
      : 'Dostępna jest nowa wersja. Gdy wróci internet, kliknij Odśwież.';
    showUpdatePrompt(message, () => {
      const triggerSkipWaiting = () => {
        updateRequestedByUser = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
        window.setTimeout(() => {
          if (reloadPending) return;
          if (!updateRequestedByUser) return;
          if (!navigator.onLine) return;
          reloadPending = true;
          window.location.reload();
        }, 3000);
      };
      if (navigator.onLine) {
        triggerSkipWaiting();
      } else {
        window.addEventListener(
          'online',
          () => {
            triggerSkipWaiting();
          },
          { once: true }
        );
      }
    });
  };

  const monitorRegistration = (registration: ServiceWorkerRegistration) => {
    if (registration.waiting) {
      promptForUpdate(registration.waiting);
    }
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed') {
          // If the page was already controlled, show the prompt.
          // Also prompt if the registration already has a waiting worker.
          if (navigator.serviceWorker.controller || registration.waiting || pageWasControlled) {
            promptForUpdate(newWorker);
          }
        }
      });
    });
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadPending) return;

    // If the user explicitly requested the update, proceed with reload as before
    if (updateRequestedByUser) {
      if (!navigator.onLine) {
        showUpdatePrompt('Aktualizacja gotowa. Po powrocie internetu aplikacja odświeży się sama.');
        window.addEventListener(
          'online',
          () => {
            if (reloadPending) return;
            reloadPending = true;
            window.location.reload();
          },
          { once: true }
        );
        return;
      }
      reloadPending = true;
      window.location.reload();
      return;
    }

    // If the SW activated on its own (no explicit user action), show a prompt
    // so the user can reload to start using the new version instead of leaving
    // the app in a possibly broken state.
    showUpdatePrompt('Aktualizacja gotowa. Kliknij Odśwież, aby uruchomić nową wersję.', () => {
      reloadPending = true;
      window.location.reload();
    });
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none', scope: '/' });
      registration.update().catch(() => {});
      monitorRegistration(registration);
    } catch (err) {
      
    }
  });
}
function parseHexColor(input: string): { r: number; g: number; b: number } | null {
  if (!input) return null;
  let color = input.trim();
  if (!color) return null;
  if (color.startsWith('#')) {
    color = color.slice(1);
  }
  if (color.length === 3) {
    color = color
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (color.length !== 6) return null;
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return { r, g, b };
}

function componentToHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) {
    const val = Math.round(l * 255);
    return { r: val, g: val, b: val };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hueToRgb(p, q, h + 1 / 3);
  const g = hueToRgb(p, q, h);
  const b = hueToRgb(p, q, h - 1 / 3);
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function invertColor(value: string): string {
  const parsed = parseHexColor(value);
  if (!parsed) return value;
  const { h, s, l } = rgbToHsl(parsed.r, parsed.g, parsed.b);
  const lowerBound = 0.35;
  const upperBound = 0.65;
  if (l > lowerBound && l < upperBound) {
    return value;
  }
  const inverted = hslToRgb(h, s, 1 - l);
  return rgbToHex(inverted.r, inverted.g, inverted.b);
}

function invertConstructionColors(options?: { includeHidden?: boolean }) {
  const includeHidden = options?.includeHidden ?? false;
  const dominantColor = mostCommonConstructionColor(includeHidden);
  const userDefaultColor = styleColorInput?.value ?? THEME.palette[0] ?? THEME.defaultStroke;
  const normalizedDominant = dominantColor ? normalizeColor(dominantColor) : null;
  const mapColor = (value: string): string => {
    if (normalizedDominant && normalizeColor(value) === normalizedDominant) {
      return userDefaultColor;
    }
    return invertColor(value);
  };

  model.points.forEach((pt) => {
    if (!pt || (!includeHidden && pt.style.hidden)) return;
    pt.style = { ...pt.style, color: mapColor(pt.style.color) };
    if (pt.label?.color) {
      pt.label = { ...pt.label, color: mapColor(pt.label.color) };
    }
  });
  model.lines.forEach((line) => {
    if (!line) return;
    const applyLineStyle = (style?: StrokeStyle | null) => {
      if (!style || (!includeHidden && style.hidden)) return style;
      return { ...style, color: mapColor(style.color) };
    };
    line.style = applyLineStyle(line.style) ?? line.style;
    if (line.segmentStyles) {
      line.segmentStyles = line.segmentStyles.map((seg) => applyLineStyle(seg) ?? seg);
    }
    line.leftRay = applyLineStyle(line.leftRay) ?? line.leftRay;
    line.rightRay = applyLineStyle(line.rightRay) ?? line.rightRay;
    line.label = line.label
      ? { ...line.label, color: mapColor(line.label.color ?? line.style.color) }
      : line.label;
  });
  model.circles.forEach((circle) => {
    if (!circle) return;
    const applyCircleStyle = (style?: StrokeStyle | null) => {
      if (!style || (!includeHidden && style.hidden)) return style;
      return { ...style, color: mapColor(style.color) };
    };
    circle.style = applyCircleStyle(circle.style) ?? circle.style;
    if (circle.arcStyles) {
      circle.arcStyles = circle.arcStyles.map((arc) => applyCircleStyle(arc) ?? arc);
    }
    if (circle.fill) circle.fill = mapColor(circle.fill);
    circle.label = circle.label
      ? { ...circle.label, color: mapColor(circle.label.color ?? circle.style.color) }
      : circle.label;
  });
  model.angles.forEach((angle) => {
    if (!angle) return;
    const style = angle.style;
    angle.style = {
      ...style,
      color: mapColor(style.color),
      fill: style.fill ? mapColor(style.fill) : undefined
    };
    angle.label = angle.label ? { ...angle.label, color: mapColor(angle.label.color ?? style.color) } : angle.label;
  });
  model.polygons.forEach((poly) => {
    if (!poly) return;
    if (poly.fill) poly.fill = mapColor(poly.fill);
  });
  model.inkStrokes.forEach((stroke) => {
    if (!stroke || (!includeHidden && stroke.hidden)) return;
    stroke.color = mapColor(stroke.color);
  });
  model.labels = model.labels.map((label) => ({
    ...label,
    color: label.color ? mapColor(label.color) : label.color
  }));
  draw();
  pushHistory();
}
