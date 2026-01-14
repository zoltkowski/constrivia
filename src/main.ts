// @ts-nocheck
import { initCloudPanel, initCloudUI, initCloudSaveUI, closeCloudPanel } from './filePane';
import { setupConfigPane } from './configPane';
import { HINTS, setLanguage, getLanguage, applyUILanguage } from './i18n';
import type { LoadedFileResult } from './filePane';
import type {
  BisectMeta,
  SymmetricMeta,
  ParallelLineMeta,
  PerpendicularLineMeta,
  LineConstructionKind,
  GeometryKind,
  GeoObjectType,
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
  ObjectId,
  Point,
  Line,
  Circle,
  Angle,
  Polygon,
  ConstructionRuntime,
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
} from './core/runtimeTypes';
import { makeEmptyRuntime } from './core/runtimeTypes';
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
  drawDiagonalHandle,
  drawRotateIcon,
  drawSegmentTicks,
  drawArcTicks,
  drawCircleTicks,
  autoAddBraces,
  measureFormattedText,
  renderFormattedText,
  getLabelScreenDimensions,
  drawLabelText,
  drawDebugLabelsCanvas
} from './canvas/renderer';
import { getAngleOtherPointsForLine } from './core/angleTools';
import { segmentKeyForPointsPure, reorderLinePointsPure, projectPointOnSegment as engineProjectPointOnSegment, projectPointOnLine as engineProjectPointOnLine, lineCircleIntersections as engineLineCircleIntersections, circleCircleIntersections as engineCircleCircleIntersections, reorderLinePointIdsRuntime, circleRadiusRuntime, circleRadiusVectorRuntime, circlePerimeterPointIdsRuntime, circleDefiningPointIdsRuntime, circleHasDefiningPointRuntime, axisSnapWeight, clamp, constrainPointToParentLineRuntime } from './core/engine';
import { nextId, addPoint, addLineFromPoints, normalizeParents, resolveConstructionKind, applyAction, Action } from './core/engineActions';
import { applyEngineState, toEngineState } from './core/engineAdapter';
import { movePointAndRecompute, movePointsByDeltaAndRecompute, transformPointsAndRecompute } from './core/engineCompute';
import { createRuntimeRecomputeHandlers } from './core/runtimeRecomputeHandlers';
import { createRuntimeLineConstraintHandlers } from './core/runtimeLineConstraintHandlers';
import { initDebugPanel, ensureDebugPanelPosition, endDebugPanelDrag, renderDebugPanel } from './debugPanel';
import { initUi } from './ui/initUi';
import { uiRefs } from './ui/uiRefs';
import { ICONS, LABEL_ALIGN_ICON_CENTER, LABEL_ALIGN_ICON_LEFT, POINT_STYLE_ICON_FILLED, POINT_STYLE_ICON_HOLLOW, TOOL_ICON_DEFS, GITHUB_ICON, MULTI_CLONE_ICON_COPY, MULTI_CLONE_ICON_PASTE, applyUiIcons } from './ui/icons';
import { initServiceWorkerUpdates } from './swUpdates';
import { parseHexColor, rgbToHex, rgbToHsl, hslToRgb, invertColor } from './colorUtils';
import { selectionState, hasMultiSelection } from './state/selectionState';
import { interactionState, hasActiveInteraction } from './state/interactionState';
import { viewState } from './state/viewState';
import { initCanvasEvents } from './canvas/events';
import { makeCanvasHandlers, handlePointerRelease as handlersHandlePointerRelease, handleCanvasPointerMove, handlePointerMoveEarly, handlePointerMoveTransforms, handlePointerMoveCircle, handlePointerMoveLine, handlePointerDownEarly } from './canvas/handlers';
import { createLabelHelpers } from './ui/labelHelpers';
import { createStyleHelpers } from './ui/styler';
import { createStyleSelectionHandlers } from './ui/styleSelection';
import { createStylePaletteHandlers } from './ui/stylePalette';
import { createStyleMenuHandlers } from './ui/styleMenu';
import { renderScene, resizeCanvasAndRender } from './canvas/sceneRenderer';
import { lineExtentWithEndPoint } from './canvas/lineExtent';
import { computeAxisSnapsForLines } from './canvas/axisSnaps';
import { findLineHits as findLineHitsCore, findLine as findLineCore, findLineHitForPos as findLineHitForPosCore, findPoint as findPointCore, findPointWithRadius as findPointWithRadiusCore, type HitTestDeps } from './canvas/hitTesting';
import { getCircleHandle as getCircleHandleCore, getCircleRotateHandle as getCircleRotateHandleCore, getLineHandle as getLineHandleCore, getLineRotateHandle as getLineRotateHandleCore, getPolygonHandles as getPolygonHandlesCore, lineAnchorForHit as lineAnchorForHitCore } from './canvas/handles';
import { type LineHit, type CircleHit } from './core/hitTypes';
import { hitKey as hitKeyCore, parseSegmentKey as parseSegmentKeyCore, segmentKey as segmentKeyCore } from './core/segmentKeys';
import { findLineIdForSegment as findLineIdForSegmentCore, getOrCreateLineBetweenPoints as getOrCreateLineBetweenPointsCore, isParallelLine, isPerpendicularLine, isLineDraggable, pointInLine as pointInLineCore, pointToSegmentDistance as pointToSegmentDistanceCore, lineLength as lineLengthCore, type ParallelLine, type PerpendicularLine } from './core/lineTools';
import { isMidpointPoint, isBisectPoint, isSymmetricPoint, getMidpointMeta, getBisectMeta, getSymmetricMeta } from './core/pointTools';
import { isCircleThroughPoints, circleDefiningPoints as circleDefiningPointsCore, circlePerimeterPoints as circlePerimeterPointsCore, circleRadius as circleRadiusCore, circleRadiusVector as circleRadiusVectorCore, circleHasDefiningPoint as circleHasDefiningPointCore, circlesContainingPoint as circlesContainingPointCore, circlesReferencingPoint as circlesReferencingPointCore, circlesWithCenter as circlesWithCenterCore, circleFromThree as circleFromThreeCore } from './core/circleTools';
import { arcKey as arcKeyCore, arcKeyByIndex as arcKeyByIndexCore, parseArcKeyForUi as parseArcKeyCore, ensureArcStyles as ensureArcStylesCore, circleArcs as circleArcsCore, angleOnArc as angleOnArcCore, findArcAt as findArcAtCore, normalizeAngle as normalizeAngleCore, type DerivedArc, type ArcToolsDeps } from './core/arcTools';
import { angleBaseGeometry as angleBaseGeometryCore, angleGeometry as angleGeometryCore, defaultAngleRadius as defaultAngleRadiusCore, getAngleArmRef, getAngleLegSeg as getAngleLegSegCore, getVertexOnLeg as getVertexOnLegCore, makeAngleLeg } from './core/angleTools';
import { canDragPolygonVertices } from './core/polygonConstraints';
import { buildPolygonLockRef, ensurePolygonLockRef } from './core/polygonLock';
import { dragTargetForPolygonLineSelection } from './core/selectionDrag';
import { polygonAtPoint as polygonAtPointCore, polygonCentroid as polygonCentroidCore, polygonForLine as polygonForLineCore, polygonForLineHit as polygonForLineHitCore, polygonForPoint as polygonForPointCore, polygonHasLine as polygonHasLineCore, polygonHasPoint as polygonHasPointCore, polygonVertices as polygonVerticesCore, polygonVerticesOrdered as polygonVerticesOrderedCore, polygonEdgeSegmentKeys as polygonEdgeSegmentKeysCore, polygonLines as polygonLinesCore } from './core/polygonTools';

// Label/font defaults and constraints
const LABEL_FONT_MIN = 8;
const LABEL_FONT_MAX = 48;
const LABEL_FONT_DEFAULT = 14;
const LABEL_FONT_STEP = 1;
const DEFAULT_LABEL_ALIGNMENT: LabelAlignment = 'left';

// Used by label UI flow.
function getLabelFontDefault(): number {
  return LABEL_FONT_DEFAULT;
}

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

// Used by point tools.
const segmentKeyForPoints = (aId: string, bId: string) =>
  segmentKeyForPointsPure(listPoints(), aId, bId);

// Used by line tools.
function findLineIdForSegment(aId: string, bId: string): string | null {
  return findLineIdForSegmentCore(runtime, aId, bId);
}

// Used by line tools.
function getOrCreateLineBetweenPoints(aId: string, bId: string, style: StrokeStyle): string {
  return getOrCreateLineBetweenPointsCore(runtime, aId, bId, style);
}


// Point tool helpers are imported from core/pointTools.

// Used by point tools.
const isPointDraggable = (point: Point | null | undefined): boolean => {
  if (!point) return false;
  if (point.construction_kind === 'intersection') return false;
  if (point.construction_kind === 'midpoint') return false;
  if (point.construction_kind === 'bisect') return false;
  if (point.construction_kind === 'symmetric') return false;
  
  // Check if point is center of a three-point circle (computed center, not draggable)
  const pointId = point.id;
  if (pointId !== undefined) {
    const isThreePointCenter = listCircles().some((c) =>
      isCircleThroughPoints(c) &&
      (c.center === pointId || String(c.center) === String(pointId))
    );
    if (isThreePointCenter) return false;
  }
  
  return true;
};

// Used by line tools.
const isDefiningPointOfLine = (pointId: string, lineId: string): boolean => {
  const line = getLineById(lineId);
  return !!line && line.defining_points.includes(pointId);
};

// Line tool types and helpers are imported from core/lineTools.

// Circle/Angle/Polygon/Ink types are imported from ./core/runtimeTypes

// Used by circle tools.
const circleDefiningPoints = (circle: Circle): string[] =>
  circleDefiningPointsCore(runtime, circle);

// Used by circle tools.
const circlePerimeterPoints = (circle: Circle): string[] =>
  circlePerimeterPointsCore(runtime, circle);

// Used by circle tools.
const circleRadius = (circle: Circle): number =>
  circleRadiusCore(runtime, circle);

// Used by circle tools.
const circleRadiusVector = (circle: Circle): { x: number; y: number } | null =>
  circleRadiusVectorCore(runtime, circle);

// Used by circle tools.
const circleHasDefiningPoint = (circle: Circle, pointId: string): boolean =>
  circleHasDefiningPointCore(runtime, circle, pointId);

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

// Used by theme handling.
if (typeof window !== 'undefined') {
  try {
    const storedTheme = window.localStorage?.getItem(THEME_STORAGE_KEY);
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

// User-customizable theme overrides
type ThemeOverrides = Partial<ThemeConfig>;
const themeOverrides: Record<ThemeName, ThemeOverrides> = {
  dark: {},
  light: {}
};

// Load theme overrides from localStorage
const THEME_OVERRIDES_KEY = 'geometry.themeOverrides';
// Used by theme handling.
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

// Used by theme handling.
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

// Used by theme handling.
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
let runtime: ConstructionRuntime = makeEmptyRuntime();

// Used by main UI flow to resolve ids into runtime objects.
const getPointById = (id: string | null | undefined, target: ConstructionRuntime = runtime): Point | null => {
  if (!id) return null;
  return target.points[String(id)] ?? null;
};
const getLineById = (id: string | null | undefined, target: ConstructionRuntime = runtime): Line | null => {
  if (!id) return null;
  return target.lines[String(id)] ?? null;
};
const getCircleById = (id: string | null | undefined, target: ConstructionRuntime = runtime): Circle | null => {
  if (!id) return null;
  return target.circles[String(id)] ?? null;
};
const getAngleById = (id: string | null | undefined, target: ConstructionRuntime = runtime): Angle | null => {
  if (!id) return null;
  return target.angles[String(id)] ?? null;
};
const getPolygonById = (id: string | null | undefined, target: ConstructionRuntime = runtime): Polygon | null => {
  if (!id) return null;
  return target.polygons[String(id)] ?? null;
};
const getInkStrokeById = (id: string | null | undefined, target: ConstructionRuntime = runtime): InkStroke | null => {
  if (!id) return null;
  return target.inkStrokes[String(id)] ?? null;
};
const getLabelById = (id: string | null | undefined, target: ConstructionRuntime = runtime): FreeLabel | null => {
  if (!id) return null;
  return target.labels[String(id)] ?? null;
};

const listPoints = () => Object.values(runtime.points);
const listLines = () => Object.values(runtime.lines);
const listCircles = () => Object.values(runtime.circles);
const listAngles = () => Object.values(runtime.angles);
const listPolygons = () => Object.values(runtime.polygons);
const listLabels = () => Object.values(runtime.labels);
const listInkStrokes = () => Object.values(runtime.inkStrokes);

const {
  recomputeAllConstraints,
  updateCirclesForPoint,
  updateMidpointsForPoint,
  recomputeMidpoint,
  recomputeBisectPoint,
  recomputeSymmetricPoint,
  recomputeParallelLine,
  recomputePerpendicularLine,
  recomputeIntersectionPoint,
  updateIntersectionsForLine,
  updateIntersectionsForCircle,
  updateParallelLinesForLine,
  updatePerpendicularLinesForLine
} = createRuntimeRecomputeHandlers(() => runtime);

const {
  findLinesContainingPoint,
  calculateLineFractions,
  applyFractionsToLine,
  applyLineFractions,
  captureLineContext
} = createRuntimeLineConstraintHandlers(() => runtime, {
  updateIntersectionsForLine,
  updateParallelLinesForLine,
  updatePerpendicularLinesForLine,
  updateMidpointsForPoint,
  updateCirclesForPoint
});

const replaceRuntimeCollection = <T extends { id?: string }>(
  kind: keyof ConstructionRuntime,
  nextList: T[]
) => {
  const store: Record<string, T> = {};
  nextList.forEach((item) => {
    if (item?.id) store[String(item.id)] = item;
  });
  (runtime as any)[kind] = store as any;
};

const resolvePointRef = (ref: ObjectId | null | undefined): Point | null => {
  if (!ref) return null;
  return getPointById(String(ref));
};
const resolveLineRef = (ref: ObjectId | null | undefined): Line | null => {
  if (!ref) return null;
  return getLineById(String(ref));
};
const resolveCircleRef = (ref: ObjectId | null | undefined): Circle | null => {
  if (!ref) return null;
  return getCircleById(String(ref));
};
const resolveAngleRef = (ref: ObjectId | null | undefined): Angle | null => {
  if (!ref) return null;
  return getAngleById(String(ref));
};
const resolvePolygonRef = (ref: ObjectId | null | undefined): Polygon | null => {
  if (!ref) return null;
  return getPolygonById(String(ref));
};

const updatePointRef = (ref: ObjectId | null | undefined, patch: Partial<Point> | ((cur: Point) => Point)) => {
  const point = resolvePointRef(ref);
  if (!point?.id) return null;
  const next = typeof patch === 'function' ? patch(point) : { ...point, ...patch };
  runtime.points[String(point.id)] = next;
  return next;
};
// Used by main UI flow to route model changes through engine actions.
function dispatchAction(action: Action) {
  applyAction({ runtime }, action);
}

// Used by main UI flow to refresh id/index lookups after bulk edits.
function rebuildIndexMaps() {
  // no-op: runtime is keyed by id
}

// Used by label UI flow.
const clampLabelFontSize = (value: number) => clamp(value, LABEL_FONT_MIN, LABEL_FONT_MAX);
// Used by label UI flow.
const normalizeLabelFontSize = (value?: number): number => {
  if (!Number.isFinite(value ?? NaN)) return LABEL_FONT_DEFAULT;
  const rounded = Math.round(value!);
  const snapped = LABEL_FONT_MIN + Math.round((rounded - LABEL_FONT_MIN) / LABEL_FONT_STEP) * LABEL_FONT_STEP;
  return clampLabelFontSize(snapped);
};
// Used by label UI flow.
const normalizeLabelFontDelta = (value?: number): number => {
  if (!Number.isFinite(value ?? NaN)) return 0;
  const rounded = Math.round(value!);
  const snapped = Math.round(rounded / LABEL_FONT_STEP) * LABEL_FONT_STEP;
  return snapped;
};
// Used by label UI flow.
const labelFontSizePx = (delta?: number, base: number = getLabelFontDefault()): number =>
  normalizeLabelFontSize(base + normalizeLabelFontDelta(delta));
// Used by label UI flow.
const clampLabelFontDelta = (delta?: number, base: number = getLabelFontDefault()): number =>
  labelFontSizePx(delta, base) - base;
// Used by label UI flow.
const normalizeLabelAlignment = (value?: string): LabelAlignment =>
  value === 'left' ? 'left' : DEFAULT_LABEL_ALIGNMENT;

// Used by main UI flow.
const mergeParents = (existing: ConstructionParent[] = [], incoming: ConstructionParent[] = []) =>
  normalizeParents([...(existing ?? []), ...incoming]);

// Used by point tools.
function applyPointConstruction(pointId: string, parents: ConstructionParent[]) {
  const point = getPointById(pointId);
  if (!point) return;
  const merged = mergeParents(point.parent_refs, parents);
  const construction_kind = isMidpointPoint(point)
    ? 'midpoint'
    : isBisectPoint(point)
    ? 'bisect'
    : isSymmetricPoint(point)
    ? 'symmetric'
    : resolveConstructionKind(merged);
  runtime.points[String(pointId)] = {
    ...point,
    parent_refs: merged,
    defining_parents: merged.map((p) => p.id),
    construction_kind
  };
}

let selectedPointId: string | null = null;
let selectedLineId: string | null = null;
let selectedCircleId: string | null = null;
let selectedAngleId: string | null = null;
let selectedPolygonId: string | null = null;
let selectedInkStrokeId: string | null = null;
let selectedLabel: { kind: 'point' | 'line' | 'angle' | 'free'; id: string } | null = null;
const selectedSegments = new Set<string>();
const selectedArcSegments = new Set<string>();

// Multi-selection
const multiSelectedPoints = new Set<string>();
const multiSelectedLines = new Set<string>();
const multiSelectedCircles = new Set<string>();
const multiSelectedAngles = new Set<string>();
const multiSelectedPolygons = new Set<string>();
const multiSelectedInkStrokes = new Set<string>();
const multiSelectedLabels = new Set<string>();
let multiselectBoxStart: { x: number; y: number } | null = null;
let multiselectBoxEnd: { x: number; y: number } | null = null;

let mode: Mode = 'move';
let segmentStartId: string | null = null;
let segmentStartTemporary = false;
let circleCenterId: string | null = null;
let triangleStartId: string | null = null;
let squareStartId: string | null = null;
let ngonSecondId: string | null = null;
let polygonChain: string[] = [];
let angleFirstLeg: { lineId: string; seg: number; a: string; b: string; click: { x: number; y: number } } | null = null;
let anglePoints: string[] = [];
let bisectorFirstLeg: { lineId: string; seg: number; a: string; b: string; vertex: string } | null = null;
let bisectPointVertexId: string | null = null;
let bisectPointFirstSeg: { lineId: string; seg: number } | null = null;
let midpointFirstId: string | null = null;
let symmetricSourceId: string | null = null;
let parallelAnchorPointId: string | null = null;
let parallelReferenceLineId: string | null = null;
let ngonSides = 9;
let currentPolygonLines: string[] = [];
let hoverPointId: string | null = null;
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
const WHEEL_ZOOM_SPEED = 0.0015;
const WHEEL_LINE_HEIGHT = 16;
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
  circleId: string;
  originals: Map<string, { x: number; y: number }>;
  dependentLines?: Map<string, number[]>;
};
type PolygonDragContext = {
  polygonId: string;
  dependentLines: Map<string, number[]>;
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
let activeDragPointerId: number | null = null;
let selectionDragOriginals: Map<string, { x: number; y: number } | undefined> | null = null;
let inkDragOriginals: InkPoint[] | null = null;
let multiDragOriginals:
  | { points: Map<string, { x: number; y: number }>; labels: Map<string, { x: number; y: number }>; ink: Map<string, InkPoint[]> }
  | null = null;
type MultiSelectTarget = {
  kind: 'point' | 'line' | 'circle' | 'angle' | 'polygon' | 'ink' | 'label';
  id: string;
};
let pendingMultiToggle: (MultiSelectTarget & { start: { x: number; y: number } }) | null = null;
// Multi-select resize/rotate contexts
type ResizeMultiContext = {
  center: { x: number; y: number };
  vectors: { idx: string; vx: number; vy: number; dist: number }[];
  startHandleDist: number;
  dependentLines?: Map<string, number[]>;
};
type RotateMultiContext = {
  center: { x: number; y: number };
  vectors: { idx: string; vx: number; vy: number }[];
  startAngle: number;
  currentAngle?: number;
  dependentLines?: Map<string, number[]>;
};
let resizingMulti: ResizeMultiContext | null = null;
let rotatingMulti: RotateMultiContext | null = null;
type ResizeContext = {
  lineId: string;
  center: { x: number; y: number };
  dir: { x: number; y: number };
  vectors: { idx: string; vx: number; vy: number }[];
  baseHalf: number;
  lines: string[];
};
let resizingLine: ResizeContext | null = null;
type RotateContext = {
  lineId: string;
  center: { x: number; y: number };
  // store original vectors relative to center
  vectors: { idx: string; vx: number; vy: number }[];
  startAngle: number;
  lines?: string[];
};
let rotatingLine: RotateContext | null = null;
type ResizeCircleContext = {
  circleId: string;
  center: { x: number; y: number };
  startRadius: number;
};
type RotateCircleContext = {
  circleId: string;
  center: { x: number; y: number };
  // original vectors (relative to center) for all perimeter points included in rotation
  vectors: { idx: string; vx: number; vy: number }[];
  startAngle: number;
  radius: number;
};
let resizingCircle: ResizeCircleContext | null = null;
let rotatingCircle: RotateCircleContext | null = null;
let lineDragContext: { lineId: string; fractions: number[] } | null = null;
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
let multiHideBtn: HTMLButtonElement | null = null;
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
let toggleStyleMenu: () => void = () => {};
let closeStyleMenu: () => void = () => {};
let openStyleMenu: () => void = () => {};
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
  let polygonLockToggleBtn: HTMLButtonElement | null = null;
  let pointHollowToggleBtn: HTMLButtonElement | null = null;
let angleRadiusDecreaseBtn: HTMLButtonElement | null = null;
let angleRadiusIncreaseBtn: HTMLButtonElement | null = null;
let colorSwatchButtons: HTMLButtonElement[] = [];
let customColorBtn: HTMLButtonElement | null = null;
let customColorRow: HTMLElement | null = null;
let customColorInput: HTMLInputElement | null = null;
let customColorAlphaInput: HTMLInputElement | null = null;
let customColorAlphaValue: HTMLElement | null = null;
let styleColorAlpha = 1;
let customColorRowOpen = false;
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

// Used by persistence flow.
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

// Used by persistence flow.
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
let pendingParallelPoint: string | null = null;
let pendingParallelLine: string | null = null;
let pendingIntersection: { kind: 'line' | 'circle'; id: string } | null = null;
let pendingCircleRadiusPoint: string | null = null;
let tangentPendingPoint: string | null = null;
let tangentPendingCircle: string | null = null;
let perpBisectorFirstPoint: string | null = null;
let perpBisectorSecondPoint: string | null = null;
let perpBisectorLine: string | null = null;
let pendingCircleRadiusLength: number | null = null;
let draggingLabel:
  | null
  | {
      kind: 'point' | 'line' | 'angle' | 'free';
      id: ObjectId;
      start: { x: number; y: number };
      initialOffset: { x: number; y: number };
    };
let draggingCircleCenterAngles: Map<string, Map<string, number>> | null = null;
let circleThreePoints: string[] = [];
let activeAxisSnap: { lineId: string; axis: 'horizontal' | 'vertical'; strength: number } | null = null;
let activeAxisSnaps: Map<string, { axis: 'horizontal' | 'vertical'; strength: number }> = new Map();
type Snapshot = {
  runtime: ConstructionRuntime;
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

// Used by polygon tools.
function polygonCentroid(polyId: string): { x: number; y: number } | null {
  return polygonCentroidCore(runtime, polyId);
}

let history: Snapshot[] = [];
let historyIndex = -1;
let movedDuringDrag = false;
let movedDuringPan = false;

const UPPER_SEQ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER_SEQ = 'abcdefghijklmnopqrstuvwxyz';
const GREEK_SEQ = GREEK_LOWER;

// Used by main UI flow.
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

// Used by main UI flow.
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
// Used by main UI flow.
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
// Used by main UI flow.
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

// Used by label UI flow.
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

// Used by label UI flow.
function refreshLabelPoolsFromRuntime(target: ConstructionRuntime = runtime) {
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

  Object.values(target.points).forEach((p) => addUsed(p.label));
  Object.values(target.lines).forEach((l) => addUsed(l.label));
  Object.values(target.circles).forEach((c) => addUsed(c.label));
  Object.values(target.angles).forEach((a) => addUsed(a.label));
  Object.values(target.labels).forEach((l) => addUsed(l));

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

// Used by main UI flow.
function clearSelectionState() {
  selectedLineId = null;
  selectedPointId = null;
  selectedCircleId = null;
  selectedAngleId = null;
  selectedPolygonId = null;
  selectedInkStrokeId = null;
  selectedLabel = null;
  selectedSegments.clear();
  selectedArcSegments.clear();
  draggingLabel = null;
  resizingLine = null;
  lineDragContext = null;
  parallelAnchorPointId = null;
  parallelReferenceLineId = null;
  squareStartId = null;
  ngonSecondId = null;
}


// Used by label UI flow.
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

// Used by label UI flow.
function resetLabelState() {
  labelUpperIdx = 0;
  labelLowerIdx = 0;
  labelGreekIdx = 0;
  freeUpperIdx = [];
  freeLowerIdx = [];
  freeGreekIdx = [];
}

// Used by main UI flow.
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

// Used by multiselect click toggles.
function removeFromMultiSelection(target: MultiSelectTarget) {
  switch (target.kind) {
    case 'point':
      multiSelectedPoints.delete(target.id);
      break;
    case 'line':
      multiSelectedLines.delete(target.id);
      break;
    case 'circle':
      multiSelectedCircles.delete(target.id);
      break;
    case 'angle':
      multiSelectedAngles.delete(target.id);
      break;
    case 'polygon':
      multiSelectedPolygons.delete(target.id);
      break;
    case 'ink':
      multiSelectedInkStrokes.delete(target.id);
      break;
    case 'label':
      multiSelectedLabels.delete(target.id);
      break;
  }
}

// Used by point tools.
function isPointInBox(p: { x: number; y: number }, box: { x1: number; y1: number; x2: number; y2: number }): boolean {
  return p.x >= box.x1 && p.x <= box.x2 && p.y >= box.y1 && p.y <= box.y2;
}

// Used by selection logic.
function selectObjectsInBox(box: { x1: number; y1: number; x2: number; y2: number }) {
  listPoints().forEach((p) => {
    if (p?.id && isPointInBox(p, box)) multiSelectedPoints.add(p.id);
  });

  listLines().forEach((line) => {
    const allInside = line.points.every(pi => {
      const p = getPointById(pi);
      return p && isPointInBox(p, box);
    });
    if (allInside && line?.id) multiSelectedLines.add(line.id);
  });

  listCircles().forEach((circle) => {
    const center = getPointById(circle.center);
    if (center && isPointInBox(center, box) && circle?.id) multiSelectedCircles.add(circle.id);
  });

  listAngles().forEach((ang) => {
    const v = getPointById((ang as any).vertex);
    if (v && isPointInBox(v, box) && ang?.id) multiSelectedAngles.add(ang.id);
  });

  listPolygons().forEach((poly) => {
    if (!poly?.id) return;
    const verts = polygonVerticesOrdered(poly.id);
    const allInside = verts.every(vi => {
      const p = getPointById(vi);
      return p && isPointInBox(p, box);
    });
    if (allInside) {
      const pid = poly?.id;
      if (pid) multiSelectedPolygons.add(pid);
    }
  });
  
  listInkStrokes().forEach((stroke) => {
    const allInside = stroke.points.every(pt => isPointInBox(pt, box));
    if (allInside && stroke?.id) multiSelectedInkStrokes.add(stroke.id);
  });
  
  // free labels
  listLabels().forEach((lab) => {
    if (lab.hidden && !viewState.showHidden) return;
    if (lab?.id && isPointInBox(lab.pos, box)) multiSelectedLabels.add(lab.id);
  });
}

// Measurement input box helpers
function showMeasurementInputBox(label: MeasurementLabel) {
  if (!canvas) return;
  try {
  } catch {}
  
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
      if (getLineById(lineId)) {
        const currentLength = getSegmentLength(lineId, segIdx);
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

// Used by measurement UI flow.
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
      if (getLineById(lineId)) {
        const userValue = parseFloat(inputValue);
        if (!isNaN(userValue) && userValue > 0) {
          const currentLength = getSegmentLength(lineId, segIdx);
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

// Used by measurement UI flow.
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
  listLines().forEach((line) => {
    const pts = line.points.map((id) => getPointById(id)).filter(Boolean) as any[];
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
  listAngles().forEach((angle) => {
    if (angle.hidden && !viewState.showHidden) return;
    
    const v = getPointById((angle as any).vertex);
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

// Used by label UI flow.
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

// Used by UI state helpers.
function getSegmentLength(lineId: ObjectId, segIdx: number): number {
  const line = getLineById(lineId);
  if (!line) return 0;
  
  const pts = line.points.map((id: ObjectId) => getPointById(id));
  const a = pts[segIdx];
  const b = pts[segIdx + 1];
  if (!a || !b) return 0;
  
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// Used by angle tools.
function getAngleValue(angleId: ObjectId): number {
  const angle = getAngleById(angleId);
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

// Used by measurement UI flow.
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

// Used by label UI flow.
function getMeasurementLabelText(label: MeasurementLabel): string {
  if (label.kind === 'segment') {
    const match = label.targetId.match(/^(.+)-seg(\d+)$/);
    if (!match) return '';
    
    const lineId = match[1];
    const segIdx = parseInt(match[2], 10);
    if (!getLineById(lineId)) return '';
    
    const length = getSegmentLength(lineId, segIdx);
    const text = formatMeasurement(length, 'segment');
    return text || '-'; // Show placeholder when no scale
  } else {
    const angle = getAngleById(label.targetId);
    if (!angle) return '';
    
    const angleValue = getAngleValue(angle.id);
    return formatMeasurement(angleValue, 'angle');
  }
}

// Use centralized `hasMultiSelection` from `selectionState` (imported above).

// Used by main UI flow.
function hasAnySelection(): boolean {
  return (
    selectedLineId !== null ||
    selectedPointId !== null ||
    selectedCircleId !== null ||
    selectedPolygonId !== null ||
    selectedArcSegments.size > 0 ||
    selectedAngleId !== null ||
    selectedInkStrokeId !== null ||
    selectedLabel !== null ||
    hasMultiSelection()
  );
}

// Used by normalization helpers.
function normalizeLoadedResult(payload: any): LoadedFileResult {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload as LoadedFileResult;
  }
  return { data: payload };
}

// Used by UI state helpers.
function setCtrBundle(bundle: LoadedFileResult['bundle'] | undefined) {
  if (bundle && bundle.entries.length > 1) {
    const clampedIndex = clamp(bundle.index ?? 0, 0, bundle.entries.length - 1);
    currentCtrBundle = { entries: bundle.entries, index: clampedIndex };
  } else {
    currentCtrBundle = null;
  }
  updateArchiveNavButtons();
}

// Used by UI/state updates.
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

// Used by main UI flow.
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

// Used by rendering flow.
function draw() {
  if (!canvas || !ctx) return;
  if (mode === 'multiselect' && rotatingMulti) {
    updateMultiRotateAxisSnaps();
  } else if (mode === 'move' && rotatingMulti && selectedPolygonId) {
    updatePolygonRotateAxisSnaps();
  }
    renderScene(ctx, {
      canvas,
      runtime,
    showMeasurements,
    measurementLabels,
    generateMeasurementLabels,
    THEME,
    dpr,
    zoomFactor,
    panOffset,
    renderWidth,
    screenUnits,
    worldToCanvas,
    labelFontSizePx,
    getLabelAlignment,
    showHidden,
    selectedLineId,
    selectedSegments,
    selectionEdges,
    selectedPolygonId,
    multiSelectedLines,
    selectedCircleId,
    selectedArcSegments,
    selectedAngleId,
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
    getPolygonHandles,
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
    activeAxisSnaps,
    circlePerimeterPoints,
    circleArcs,
    angleGeometry,
    getAngleLegSeg,
    defaultPointLabelOffset,
    mode,
    circleThreePoints,
    hoverPointId,
    selectionVertices,
    pointInLine,
    polygonHasPoint,
    circleHasDefiningPoint,
    selectedPointId,
    multiSelectedPoints,
    multiSelectedCircles,
    multiSelectedInkStrokes,
    multiselectBoxStart,
    multiselectBoxEnd,
    hasMultiSelection,
    getMultiHandles,
    rotatingMulti,
    hexToRgba,
    selectedInkStrokeId,
    strokeBounds,
    showDebugLabels: () => document.getElementById('debugPanel')?.getAttribute('data-visible') === 'true',
    drawDebugLabels,
    renderDebugPanel,
    getMeasurementLabelText,
    normalize,
    RIGHT_ANGLE_MARK_MARGIN,
    RIGHT_ANGLE_MARK_MIN,
    RIGHT_ANGLE_MARK_MAX,
    RIGHT_ANGLE_MARK_RATIO,
    HANDLE_SIZE,
    HANDLE_HIT_PAD,
    multiSelectedLabels
  });
}

// Used by main UI flow.
function resizeCanvas() {
  resizeCanvasAndRender(canvas, dpr, draw);
}

// Used by main UI flow.
const nowTime = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

// Used by main UI flow.
const currentInkColor = () => {
  const base = styleColorInput?.value ?? THEME.defaultStroke;
  return colorWithAlpha(base, styleColorAlpha);
};

// Used by point tools.
const pointerPressure = (ev: PointerEvent) => {
  const raw = Number(ev.pressure);
  if (!Number.isFinite(raw) || raw <= 0) return INK_PRESSURE_FALLBACK;
  return clamp(raw, 0.05, 1);
};

// Used by point tools.
function createInkPoint(ev: PointerEvent): InkPoint {
  const pos = toPoint(ev);
  return {
    x: pos.x,
    y: pos.y,
    pressure: pointerPressure(ev),
    time: nowTime()
  };
}

// Used by main UI flow.
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
  dispatchAction({ type: 'ADD', kind: 'ink', payload: stroke });
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
  selectedPointId = selectionState.selectedPointId;
  selectedLineId = selectionState.selectedLineId;
  selectedCircleId = selectionState.selectedCircleId;
  selectedAngleId = selectionState.selectedAngleId;
  selectedPolygonId = selectionState.selectedPolygonId;
  selectedInkStrokeId = selectionState.selectedInkStrokeId;
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

// Used by point tools.
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

// Used by gesture handling.
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

// Used by UI state helpers.
function setMode(next: Mode) {
  // No special handling needed for measurements anymore
  
  // If switching to midpoint, proactively clear any existing selection (e.g., a selected polygon)
  // so the midpoint tool waits for the user to click a segment or two points.
  if (next === 'midpoint') {
    clearMultiSelection();
    selectedPointId = null;
    selectedLineId = null;
    selectedCircleId = null;
    selectedPolygonId = null;
    selectedAngleId = null;
    selectedInkStrokeId = null;
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
  if (mode === 'multiselect') {
    multiMoveActive = true;
    if (multiMoveBtn) {
      multiMoveBtn.classList.add('active');
      multiMoveBtn.setAttribute('aria-pressed', 'true');
    }
  } else if (previousMode === 'multiselect') {
    multiMoveActive = false;
    if (multiMoveBtn) {
      multiMoveBtn.classList.remove('active');
      multiMoveBtn.setAttribute('aria-pressed', 'false');
    }
  }
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
    selectedPointId = null;
    selectedLineId = null;
    selectedCircleId = null;
    selectedPolygonId = null;
    selectedAngleId = null;
    selectedInkStrokeId = null;
    selectedLabel = null;
    selectedSegments.clear();
    selectedArcSegments.clear();
  }
  
  if (mode !== 'segment') {
    segmentStartId = null;
    segmentStartTemporary = false;
  } else {
    // Switching TO segment mode - always clear start point
    segmentStartId = null;
    segmentStartTemporary = false;
  }
  if (mode === 'circle') {
    circleCenterId = null;
    pendingCircleRadiusPoint = null;
    updateSelectionButtons();
  }
  if (mode !== 'parallel' && mode !== 'perpendicular' && mode !== 'circle') {
    pendingParallelLine = null;
    pendingParallelPoint = null;
    circleCenterId = null;
    pendingCircleRadiusPoint = null;
    pendingCircleRadiusLength = null;
    circleThreePoints = [];
    triangleStartId = null;
    squareStartId = null;
    polygonChain = [];
    currentPolygonLines = [];
    angleFirstLeg = null;
    anglePoints = [];
    bisectorFirstLeg = null;
    bisectPointVertexId = null;
    bisectPointFirstSeg = null;
    midpointFirstId = null;
    symmetricSourceId = null;
  }
  if (mode !== 'parallelLine') {
    parallelAnchorPointId = null;
    parallelReferenceLineId = null;
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
    const color = colorWithAlpha(styleColorInput?.value ?? '#000', styleColorAlpha);
    let changed = false;
    
    const polygonHasLabels = (polyId: string | null) => {
      if (polyId === null) return false;
      const verts = polygonVerticesOrdered(polyId);
      return verts.length > 0 && verts.every((vi) => !!getPointById(vi)?.label);
    };
    
    // Add label to selected angle
    if (selectedAngleId !== null) {
      const angle = getAngleById(selectedAngleId);
      if (angle && !angle.label) {
        const { text, seq } = nextGreek();
        angle.label = {
          text,
          color,
          offset: defaultAngleLabelOffset(selectedAngleId),
          fontSize: 0,
          seq
        };
        changed = true;
      }
    }
    // Add labels to selected polygon or line
    else if (selectedPolygonId !== null || selectedLineId !== null) {
      // Determine what to label based on selection mode
      const shouldLabelEdges = selectionEdges || selectedSegments.size > 0;
      const shouldLabelVertices = selectionVertices;
      
      if (selectedPolygonId !== null) {
        // Label polygon edges if selected
        if (shouldLabelEdges && selectedSegments.size > 0) {
          selectedSegments.forEach((key) => {
            const parsed = parseSegmentKey(key);
            if (!parsed || parsed.part !== 'segment') return;
            const li = parsed.lineId;
            const line = getLineById(li);
            if (!line) return;
            if (!line.label) {
              const { text, seq } = nextLower();
              line.label = {
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
        if ((selectedSegments.size === 0 || shouldLabelVertices) && !polygonHasLabels(selectedPolygonId)) {
        // Label all vertices
        const verts = polygonVerticesOrdered(selectedPolygonId);
        
        // Check if any vertex already has a label
        let baseLabel: string | null = null;
        let startIndex = 1;
        let labeledVertexPosition = -1;
        let isLetterPattern = false;
        
        for (let i = 0; i < verts.length; i++) {
          const vi = verts[i];
          const existingLabel = getPointById(vi)?.label?.text;
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
            const pt = getPointById(vi);
            if (pt && !pt.label) {
              const offset = (i - labeledVertexPosition + verts.length) % verts.length;
              const letterIdx = (startIndex + offset) % UPPER_SEQ.length;
              const text = UPPER_SEQ[letterIdx];
              pt.label = {
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
            const pt = getPointById(vi);
            if (pt && !pt.label) {
              const offset = (labeledVertexPosition - i + verts.length) % verts.length;
              const index = ((startIndex - 1 + offset) % verts.length) + 1;
              const text = `${baseLabel}_${index}`;
              pt.label = {
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
            const pt = getPointById(vi);
            if (pt) {
              const { text, seq } = nextUpper();
              pt.label = {
                text,
                color,
                offset: defaultPointLabelOffset(vi),
                fontSize: 0,
                seq
              };
            }
          });
          changed = verts.length > 0;
        }
        }
      } else if (selectedLineId !== null) {
        // Label line edges (segments)
        if (shouldLabelEdges) {
          const line = getLineById(selectedLineId);
          if (line && !line.label) {
            const { text, seq } = nextLower();
            line.label = {
              text,
              color,
              offset: defaultLineLabelOffset(selectedLineId),
              fontSize: 0,
              seq
            };
            changed = true;
          }
        }
        // Label line vertices (endpoints)
        if (shouldLabelVertices) {
          const line = getLineById(selectedLineId);
          if (line && line.defining_points) {
            line.defining_points.forEach((pid) => {
              const pt = getPointById(pid);
              if (pt && !pt.label) {
                const { text, seq } = nextUpper();
                pt.label = {
                  text,
                  color,
                  offset: defaultPointLabelOffset(pid),
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
    else if (selectedPointId !== null) {
      const sp = getPointById(selectedPointId);
      if (sp && !sp.label) {
        const { text, seq } = nextUpper();
        sp.label = {
          text,
          color,
          offset: defaultPointLabelOffset(selectedPointId),
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

// Used by tool actions.
function createNgonFromBase() {
  if (squareStartId === null || ngonSecondId === null) return;
  const aIdx = squareStartId;
  const bIdx = ngonSecondId;
  const a = getPointById(aIdx);
  const b = getPointById(bIdx);
  if (!a || !b) return;

  const base = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(base.x, base.y) || 1;
  const perp = { x: base.y / len, y: -base.x / len };
  const side = len;
  const R = side / (2 * Math.sin(Math.PI / ngonSides));
  const apothem = side / (2 * Math.tan(Math.PI / ngonSides));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const center = { x: mid.x + perp.x * apothem, y: mid.y + perp.y * apothem };
  const angA = Math.atan2(a.y - center.y, a.x - center.x);
  const stepAngle = (2 * Math.PI) / ngonSides;
  const signedStep = stepAngle;
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
    const idx = addPoint(runtime, { ...p, style: currentPointStyle() });
    verts.push(idx);
  }
  const style = currentStrokeStyle();
  const polyLines: number[] = [];
  for (let i = 0; i < verts.length; i++) {
    const u = verts[i];
    const v = verts[(i + 1) % verts.length];
    const l = getOrCreateLineBetweenPoints(u, v, style);
    polyLines.push(l);
  }
  const newPolyIdx = createPolygon(verts, 'free', polyLines);
  squareStartId = null;
  ngonSecondId = null;
  selectedPolygonId = newPolyIdx;
  selectedLineId = null;
  selectedSegments.clear();
  selectedPointId = null;
  draw();
  pushHistory();
  maybeRevertMode();
  updateSelectionButtons();
}

// Used by main UI flow.
function ensureSegment(p1: ObjectId, p2: ObjectId): { line: ObjectId; seg: number } {
  for (const line of listLines()) {
    for (let j = 0; j < line.points.length - 1; j++) {
      const a = line.points[j];
      const b = line.points[j + 1];
      if ((a === p1 && b === p2) || (a === p2 && b === p1)) {
        return { line: line.id, seg: j };
      }
    }
  }
  const lineId = addLineFromPoints(runtime, p1, p2, currentStrokeStyle());
  return { line: lineId, seg: 0 };
}

// Used by event handling flow.
function handleCanvasClick(ev: PointerEvent) {
  if (!canvas) return;
  if (handlePointerDownEarly(ev, {
    canvas,
    setPointerCapture: (id: number) => { try { canvas?.setPointerCapture(id); } catch {} },
    updateTouchPointFromEvent,
    activeTouchesSize: () => activeTouches.size,
    startPinchFromTouches,
    pinchState,
    getMode: () => mode,
    eraserActive: () => eraserActive,
    resetEraserState: () => { eraserLastStrokeId = null; eraserChangedDuringDrag = false; },
    eraseInkStrokeAtPoint,
    beginInkStroke,
    toPoint
  })) {
    return;
  }
  const { x, y } = toPoint(ev);
  activeDragPointerId = null;
  // Early check: if we're in multiselect and user pressed a group handle, start transform immediately
  if (mode === 'multiselect' && hasMultiSelection()) {
    const padWorld = screenUnits(HANDLE_SIZE / 2 + HANDLE_HIT_PAD);
    const mh = getMultiHandles();
    if (mh) {
      const dxs = x - mh.scaleHandle.x;
      const dys = y - mh.scaleHandle.y;
      if (Math.hypot(dxs, dys) <= padWorld) {
        // collect points
        const ptsSet = new Set<string>();
        multiSelectedPoints.forEach((id) => ptsSet.add(id));
        multiSelectedLines.forEach((lineId) => getLineById(lineId)?.points.forEach((pi: string) => ptsSet.add(pi)));
        multiSelectedCircles.forEach((circleId) => {
          const c = getCircleById(circleId);
          if (!c) return;
          ptsSet.add(c.center);
          if (c.radius_point !== undefined) ptsSet.add(c.radius_point);
          c.points.forEach((pi) => ptsSet.add(pi));
        });
        multiSelectedAngles.forEach((angleId) => {
          const a = getAngleById(angleId);
          if (a) ptsSet.add(a.vertex);
        });
        const vectors = Array.from(ptsSet)
          .map((idx) => {
            const p = getPointById(idx);
            return p ? { idx, vx: p.x - mh.center.x, vy: p.y - mh.center.y, dist: Math.hypot(p.x - mh.center.x, p.y - mh.center.y) } : null;
          })
          .filter(Boolean) as any[];
        const startHandleDist = Math.hypot(x - mh.center.x, y - mh.center.y) || 1;
        resizingMulti = { center: mh.center, vectors, startHandleDist };
        try { canvas?.setPointerCapture(ev.pointerId); } catch {}
        draggingMultiSelection = true;
        activeDragPointerId = ev.pointerId;
        movedDuringDrag = false;
        updateSelectionButtons(); draw(); return;
      }
      const dxr = x - mh.rotateHandle.x;
      const dyr = y - mh.rotateHandle.y;
      if (Math.hypot(dxr, dyr) <= padWorld) {
        const ptsSet = new Set<string>();
        multiSelectedPoints.forEach((id) => ptsSet.add(id));
        multiSelectedLines.forEach((lineId) => getLineById(lineId)?.points.forEach((pi: string) => ptsSet.add(pi)));
        multiSelectedCircles.forEach((circleId) => {
          const c = getCircleById(circleId);
          if (!c) return;
          ptsSet.add(c.center);
          if (c.radius_point !== undefined) ptsSet.add(c.radius_point);
          c.points.forEach((pi) => ptsSet.add(pi));
        });
        multiSelectedAngles.forEach((angleId) => {
          const a = getAngleById(angleId);
          if (a) ptsSet.add(a.vertex);
        });
        const vectors = Array.from(ptsSet)
          .map((idx) => {
            const p = getPointById(idx);
            return p ? { idx, vx: p.x - mh.center.x, vy: p.y - mh.center.y } : null;
          })
          .filter(Boolean) as any[];
        const startAngle = Math.atan2(y - mh.center.y, x - mh.center.x);
        rotatingMulti = { center: mh.center, vectors, startAngle };
        try { canvas?.setPointerCapture(ev.pointerId); } catch {}
        draggingMultiSelection = true;
        activeDragPointerId = ev.pointerId;
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
          const p = getPointById(labelHit.id);
          if (p?.label) {
            if (!p.label.offset) p.label.offset = defaultPointLabelOffset(labelHit.id);
            initialOffset = p.label.offset ?? { x: 0, y: 0 };
          }
          break;
        }
        case 'line': {
          const l = getLineById(labelHit.id);
          if (l?.label) {
            if (!l.label.offset) l.label.offset = defaultLineLabelOffset(labelHit.id);
            initialOffset = l.label.offset ?? { x: 0, y: 0 };
          }
          break;
        }
        case 'angle': {
          const a = runtime.angles[labelHit.id];
          if (a?.label) {
            if (!a.label.offset) a.label.offset = defaultAngleLabelOffset(labelHit.id);
            initialOffset = a.label.offset ?? { x: 0, y: 0 };
          }
          break;
        }
        case 'free': {
          const lab = runtime.labels[labelHit.id];
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
      activeDragPointerId = ev.pointerId;
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
    if (handleHit !== null && handleHit.kind === 'line' && selectedPointId !== null) {
      const maybeLine = getLineById(handleHit.id);
      if (maybeLine && maybeLine.points.includes(selectedPointId)) {
        handleHit = null;
      }
    }
      if (handleHit !== null) {
        if (handleHit.kind === 'line') {
        const lineId = handleHit.id;
        if (!isLineDraggable(getLineById(lineId))) {
          return;
        }
        const extent = lineExtent(lineId);
        if (extent) {
          const polyLines =
            selectedPolygonId !== null &&
            selectedSegments.size === 0 &&
            polygonHasLine(selectedPolygonId, lineId)
              ? polygonLines(selectedPolygonId)
              : [lineId];
          const pointSet = new Set<string>();
          polyLines.forEach((li) => {
            getLineById(li)?.points.forEach((pi) => pointSet.add(pi));
          });
          const pts = Array.from(pointSet).map((pi) => ({ idx: pi, p: getPointById(pi) })).filter((e) => e.p);
          const center =
            pts.length > 0
              ? {
                  x: pts.reduce((sum, e) => sum + e.p.x, 0) / pts.length,
                  y: pts.reduce((sum, e) => sum + e.p.y, 0) / pts.length
                }
              : extent.center;

          if (handleHit.type === 'scale') {
            const vectors: { idx: string; vx: number; vy: number }[] = [];
            let baseHalf = extent.half;
            pts.forEach(({ idx: pi, p }) => {
              const vx = p.x - center.x;
              const vy = p.y - center.y;
              vectors.push({ idx: pi, vx, vy });
              const proj = vx * extent.dir.x + vy * extent.dir.y;
              baseHalf = Math.max(baseHalf, Math.abs(proj));
            });
            resizingLine = {
              lineId,
              center,
              dir: extent.dir,
              vectors: vectors.length
                ? vectors
                : extent.order.map((d) => ({
                    idx: d.id,
                    vx: (getPointById(d.id)?.x ?? 0) - extent.center.x,
                    vy: (getPointById(d.id)?.y ?? 0) - extent.center.y
                  })),
              baseHalf: Math.max(1, baseHalf),
              lines: polyLines
            };
            updateSelectionButtons();
            draw();
            return;
          } else if (handleHit.type === 'rotate') {
            const vectors: { idx: string; vx: number; vy: number }[] = [];
            pts.forEach(({ idx: pi, p }) => {
              const vx = p.x - center.x;
              const vy = p.y - center.y;
              vectors.push({ idx: pi, vx, vy });
            });
            const startAngle = Math.atan2(y - center.y, x - center.x);
            rotatingLine = { lineId, center, vectors, startAngle, lines: polyLines };
            updateSelectionButtons();
            draw();
            return;
          }
        }
      } else if (handleHit.kind === 'circle') {
        const circleId = handleHit.id;
        const c = getCircleById(circleId);
        if (!c) return;
        const center = getPointById(c.center);
        if (!center) return;
        if (handleHit.type === 'scale') {
          if (isCircleThroughPoints(c)) {
            return;
          }
          resizingCircle = { circleId, center: { x: center.x, y: center.y }, startRadius: circleRadius(c) };
          updateSelectionButtons();
          draw();
          return;
        } else if (handleHit.type === 'rotate') {
          if (isCircleThroughPoints(c)) {
            return;
          }
          const startAngle = Math.atan2(y - center.y, x - center.x);
          const perim = circlePerimeterPoints(c);
          const vectors = perim
            .map((pid) => {
              const p = getPointById(pid);
              if (!p) return null;
              return { idx: pid, vx: p.x - center.x, vy: p.y - center.y };
            })
            .filter((v): v is { idx: string; vx: number; vy: number } => v !== null);
          rotatingCircle = { circleId, center: { x: center.x, y: center.y }, vectors, startAngle, radius: circleRadius(c) };
          updateSelectionButtons();
          draw();
          return;
        }
      } else if (handleHit.kind === 'polygon') {
        const polyId = handleHit.id;
        const handles = getPolygonHandles(polyId);
        if (!handles) return;
        const verts = polygonVertices(polyId);
        if (!verts.length) return;
        const vectors = verts
          .map((idx) => {
            const p = getPointById(idx);
            return p
              ? { idx, vx: p.x - handles.center.x, vy: p.y - handles.center.y, dist: Math.hypot(p.x - handles.center.x, p.y - handles.center.y) }
              : null;
          })
          .filter((v) => v !== null) as any[];
        if (!vectors.length) return;
        const dependentLines = new Map<string, number[]>();
        const pointsInPoly = new Set<string>(verts);
        pointsInPoly.forEach((pointId) => {
          const lines = findLinesContainingPoint(pointId);
          lines.forEach((lineId) => {
            if (isDefiningPointOfLine(pointId, lineId) && !dependentLines.has(lineId)) {
              dependentLines.set(lineId, calculateLineFractions(lineId));
            }
          });
        });
        if (handleHit.type === 'scale') {
          const startHandleDist = Math.hypot(x - handles.center.x, y - handles.center.y) || 1;
          resizingMulti = { center: handles.center, vectors, startHandleDist, dependentLines };
          try { canvas?.setPointerCapture(ev.pointerId); } catch {}
          draggingMultiSelection = true;
          movedDuringDrag = false;
          updateSelectionButtons();
          draw();
          return;
        } else if (handleHit.type === 'rotate') {
          const startAngle = Math.atan2(y - handles.center.y, x - handles.center.x);
          rotatingMulti = { center: handles.center, vectors: vectors.map(v => ({ idx: v.idx, vx: v.vx, vy: v.vy })), startAngle, dependentLines };
          try { canvas?.setPointerCapture(ev.pointerId); } catch {}
          draggingMultiSelection = true;
          movedDuringDrag = false;
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
      const ptsSet = new Set<string>();
      multiSelectedPoints.forEach((id) => ptsSet.add(id));
      multiSelectedLines.forEach((lineId) => getLineById(lineId)?.points.forEach((pi) => ptsSet.add(pi)));
      multiSelectedCircles.forEach((circleId) => {
        const c = getCircleById(circleId);
        if (!c) return;
        ptsSet.add(c.center);
        if (c.radius_point !== undefined) ptsSet.add(c.radius_point);
        c.points.forEach((pi) => ptsSet.add(pi));
      });
      multiSelectedAngles.forEach((angleId) => {
        const a = getAngleById(angleId);
        if (a) ptsSet.add(a.vertex);
      });
      const vectors = Array.from(ptsSet).map((idx) => {
        const p = getPointById(idx);
        return { idx, vx: p.x - mh.center.x, vy: p.y - mh.center.y, dist: Math.hypot(p.x - mh.center.x, p.y - mh.center.y) };
      });
      if (handleHit.type === 'scale') {
        // start uniform scale about center
        const startHandleDist = Math.hypot(x - mh.center.x, y - mh.center.y) || 1;
        resizingMulti = { center: mh.center, vectors, startHandleDist };
        try { canvas?.setPointerCapture(ev.pointerId); } catch {}
        draggingMultiSelection = true;
        activeDragPointerId = ev.pointerId;
        movedDuringDrag = false;
        updateSelectionButtons();
        draw();
        return;
      } else if (handleHit.type === 'rotate') {
        const startAngle = Math.atan2(y - mh.center.y, x - mh.center.x);
        rotatingMulti = { center: mh.center, vectors: vectors.map(v => ({ idx: v.idx, vx: v.vx, vy: v.vy })), startAngle };
        try { canvas?.setPointerCapture(ev.pointerId); } catch {}
        draggingMultiSelection = true;
        activeDragPointerId = ev.pointerId;
        movedDuringDrag = false;
        updateSelectionButtons();
        draw();
        return;
      }
    }
  }
  if (mode === 'add') {
    // ensure previous circle highlight is cleared when placing a new point
    selectedCircleId = null;
    const lineHits = findLineHits({ x, y });
    const circleHits = findCircles({ x, y }, currentHitRadius(), false);
    let desiredPos: { x: number; y: number } = { x, y };

    const lineAnchors = lineHits
      .map((h) => ({ hit: h, anchors: lineAnchorForHit(h), line: getLineById(h.lineId) }))
      .filter(
        (h): h is { hit: LineHit; anchors: { a: { x: number; y: number }; b: { x: number; y: number } }; line: Line } =>
          !!h.anchors && !!h.line
      );
    const circleAnchors = circleHits
      .map((h) => {
        const c = getCircleById(h.circleId);
        const cen = c ? getPointById(c.center) : null;
        if (!c || !cen) return null;
        const radius = circleRadius(c);
        if (radius <= 1e-3) return null;
        // If the circle has explicit arcs, ensure the hit corresponds to a visible arc
        const arcHit = findArcAt({ x, y }, currentHitRadius(), h.circleId);
        const arcsExist = circleArcs(h.circleId).length > 0;
        if (arcsExist && !arcHit) {
          // The click is on the circumference but not on any visible arc -> ignore
          return null;
        }
        return { center: { x: cen.x, y: cen.y }, radius, id: c.id };
      })
      .filter((v): v is { center: { x: number; y: number }; radius: number; id: string } => !!v);

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
        const idx = addPoint(runtime, {
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
                const line = getLineById(hit.lineId);
                return !!line && parentLineIds.has(line.id);
              })
            : lineHits;
          hitsToAttach.forEach((hit) => attachPointToLine(idx, hit, { x, y }, pos));
          if (hitsToAttach.length && firstIdx === null) selectedLineId = hitsToAttach[0].lineId;
        }

        // Attach to matching circle hits for this candidate
        if (circleHits.length) {
          const parentCircleIds = new Set(parents.filter((p) => p.kind === 'circle').map((p) => p.id));
          for (const hit of circleHits) {
            const cid = hit.circleId;
            if (parentCircleIds.size && !parentCircleIds.has(cid)) continue;
            const arcsExist = circleArcs(cid).length > 0;
            if (arcsExist) {
              const arcAtPos = findArcAt(pos, currentHitRadius(), cid);
              if (!arcAtPos) continue;
            }
            attachPointToCircle(cid, idx, pos);
          }
        }

        if (firstIdx === null) firstIdx = idx;
      }

      // Select the first created point
      if (firstIdx !== null) {
        desiredPos = candidates[0].pos;
        pointParents = candidates[0].parents;
        selectedPointId = firstIdx;
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
    if (!selectedPointId) {
      const idx = addPoint(runtime, { ...desiredPos, style: currentPointStyle(), defining_parents: pointParents });
      if (lineHits.length) {
        const parentLineIds = new Set(pointParents.filter((p) => p.kind === 'line').map((p) => p.id));
        const hitsToAttach = pointParents.length
          ? lineHits.filter((hit) => {
              const line = getLineById(hit.lineId);
              return !!line && parentLineIds.has(line.id);
            })
          : lineHits;
        hitsToAttach.forEach((hit) => attachPointToLine(idx, hit, { x, y }, desiredPos));
        if (hitsToAttach.length) selectedLineId = hitsToAttach[0].lineId;
      }
      if (circleHits.length) {
        for (const hit of circleHits) {
          const cid = hit.circleId;
          const arcsExist = circleArcs(cid).length > 0;
          if (arcsExist) {
            const arcAtPos = findArcAt(desiredPos, currentHitRadius(), cid);
            if (!arcAtPos) continue;
          }
          attachPointToCircle(cid, idx, desiredPos);
        }
      }
      selectedPointId = idx;
    }
    if (!lineHits.length) selectedLineId = null;
    selectedCircleId = null;
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
    const start = segmentStartId ?? selectedPointId;
    selectedCircleId = null; // drop circle highlight when starting a segment
    selectedAngleId = null; // drop angle highlight when starting a segment
    if (start === null) {
      const newStart = hit ?? addPoint(runtime, { x, y, style: currentPointStyle() });
      segmentStartId = newStart;
      segmentStartTemporary = hit === null;
      selectedPointId = newStart;
      selectedLineId = null;
      draw();
    } else {
      const startPt = getPointById(start);
      const endIsExisting = hit !== null;
      const endPos = endIsExisting ? { x, y } : snapDir(startPt, { x, y });
      const endIdx = hit ?? addPoint(runtime, { ...endPos, style: currentPointStyle() });
      const endPt = getPointById(endIdx);
      if (startPt && endPt && startPt.x === endPt.x && startPt.y === endPt.y) {
        if (!endIsExisting) {
          delete runtime.points[String(endIdx)];
        } else if (segmentStartTemporary) {
          removePointsKeepingOrder([start]);
        }
        segmentStartId = null;
        segmentStartTemporary = false;
        selectedPointId = null;
        selectedLineId = null;
        draw();
        updateSelectionButtons();
        return;
      }
      const stroke = currentStrokeStyle();
      const lineId = addLineFromPoints(runtime, start, endIdx, stroke);
      segmentStartId = null;
      segmentStartTemporary = false;
      selectedPointId = null;
      selectedLineId = lineId;
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
          lineHits.find((h) => {
            const pts = getLineById(h.lineId)?.points ?? [];
            return !pts.some((pid) => String(pid) === String(pendingParallelPoint));
          }) ?? lineHits[0];
      } else {
        hitLine = lineHits[0];
      }
      if (!hitPoint && hitLine.part === 'segment') {
        const line = getLineById(hitLine.lineId);
        const aIdx = line.points[0];
        const bIdx = line.points[line.points.length - 1];
        const a = getPointById(aIdx);
        const b = getPointById(bIdx);
        const tol = currentHitRadius();
        if (a && Math.hypot(a.x - x, a.y - y) <= tol) hitPoint = aIdx;
        else if (b && Math.hypot(b.x - x, b.y - y) <= tol) hitPoint = bIdx;
      }
    }
    if (hitPoint !== null) {
      pendingParallelPoint = hitPoint;
      selectedPointId = hitPoint;
      selectedCircleId = null;
      // keep existing line selection if set previously
    } else if (pendingParallelPoint === null && selectedPointId !== null) {
      pendingParallelPoint = selectedPointId;
    }
    if (hitLine !== null) {
      if (hitPoint !== null && getLineById(hitLine.lineId)?.points.some((pid) => String(pid) === String(hitPoint))) {
        // prefer point selection; avoid overriding with the same line
      } else {
        pendingParallelLine = hitLine.lineId;
        selectedLineId = hitLine.lineId;
        selectedCircleId = null;
      }
    } else if (pendingParallelLine === null && selectedLineId !== null) {
      pendingParallelLine = selectedLineId;
    }
    draw();
    if (pendingParallelPoint !== null && pendingParallelLine !== null) {
      const created = createOffsetLineThroughPoint(mode, pendingParallelPoint, pendingParallelLine);
      pendingParallelLine = null;
      pendingParallelPoint = null;
      if (created !== null) {
        selectedLineId = created;
        selectedPointId = null;
        draw();
        pushHistory();
        maybeRevertMode();
        updateSelectionButtons();
      }
    }
  } else if (mode === 'symmetric') {
    const sourceIdx = symmetricSourceId;
    const hitPoint = findPoint({ x, y });
    const lineHit = findLine({ x, y });
    if (sourceIdx === null) {
      if (hitPoint === null) return;
      symmetricSourceId = hitPoint;
      selectedPointId = hitPoint;
      draw();
      return;
    }
    const source = getPointById(sourceIdx);
    if (!source) {
      symmetricSourceId = null;
      maybeRevertMode();
      updateSelectionButtons();
      return;
    }
    let target: { x: number; y: number } | null = null;
    let meta: SymmetricMeta | null = null;
    let parents: ConstructionParent[] = [];
    if (hitPoint !== null) {
      const mirror = getPointById(hitPoint);
      if (!mirror) return;
      meta = { source: source.id, mirror: { kind: 'point', id: mirror.id } };
      target = { x: mirror.x * 2 - source.x, y: mirror.y * 2 - source.y };
    } else if (lineHit && (lineHit.part === 'segment' || lineHit.part === 'rayLeft' || lineHit.part === 'rayRight')) {
      const line = getLineById(lineHit.lineId);
      if (!line) return;
      meta = { source: source.id, mirror: { kind: 'line', id: line.id } };
      parents = [{ kind: 'line', id: line.id }];
      target = reflectPointAcrossLine(source, line);
    } else {
      return;
    }
    if (!meta || !target) return;
    const idx = addPoint(runtime, {
      ...target,
      style: symmetricPointStyle(),
      construction_kind: 'symmetric',
      defining_parents: parents,
      symmetricMeta: meta
    });
    recomputeSymmetricPoint(idx);
    selectedPointId = idx;
    symmetricSourceId = null;
    draw();
    pushHistory();
    maybeRevertMode();
    updateSelectionButtons();
  } else if (mode === 'parallelLine') {
    const hitPoint = findPoint({ x, y });
    const lineHit = findLine({ x, y });
    const setAnchor = (idx: number) => {
      parallelAnchorPointId = idx;
      selectedPointId = idx;
      selectedLineId = null;
      draw();
    };
    if (parallelAnchorPointId === null) {
      if (hitPoint !== null) {
        setAnchor(hitPoint);
        return;
      }
      if (lineHit && lineHit.part === 'segment') {
        parallelReferenceLineId = lineHit.lineId;
        selectedLineId = lineHit.lineId;
        draw();
        return;
      }
      const idx = addPoint(runtime, { x, y, style: currentPointStyle() });
      setAnchor(idx);
      return;
    }
    if (parallelReferenceLineId === null) {
      if (lineHit && lineHit.part === 'segment') {
        parallelReferenceLineId = lineHit.lineId;
        selectedLineId = lineHit.lineId;
        const created = createParallelLineThroughPoint(parallelAnchorPointId, parallelReferenceLineId);
        parallelAnchorPointId = null;
        parallelReferenceLineId = null;
        if (created !== null) {
          selectedLineId = created;
          selectedPointId = null;
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
    const created = createParallelLineThroughPoint(parallelAnchorPointId, parallelReferenceLineId);
    parallelAnchorPointId = null;
    parallelReferenceLineId = null;
    if (created !== null) {
      selectedLineId = created;
      selectedPointId = null;
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
      const ci = ch.circleId;
      const arcsExist = circleArcs(ci).length > 0;
      if (!arcsExist) {
        circleHit = ch;
        break;
      }
      const arcAtPos = findArcAt({ x, y }, currentHitRadius(), ci);
      if (arcAtPos) {
        circleHit = { circleId: ci };
        break;
      }
      // otherwise skip this circle because the circumference at this point is not on a visible arc
    }

    // User clicks point and circle in any order
    if (hitPoint !== null) {
      tangentPendingPoint = hitPoint;
      selectedPointId = hitPoint;
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
        selectedCircleId = null;
        draw();
      }
    } else if (circleHit !== null) {
      tangentPendingCircle = circleHit.circleId;
      selectedCircleId = circleHit.circleId;
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
        selectedPointId = null;
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
        selectedPointId = hitPoint;
        selectedLineId = null;
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
      perpBisectorLine = lineHit.lineId;
      createPerpBisectorFromLine(lineHit.lineId, lineHit.seg);
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
    const centerIdx = circleCenterId ?? hitPoint ?? addPoint(runtime, { x, y, style: currentPointStyle() });
    
    if (circleCenterId === null) {
      // First click: set center
      circleCenterId = centerIdx;
      selectedPointId = centerIdx;
      draw();
      return;
    }
    
    // Second click: create circle with radius point
    const radiusPointIdx =
      pendingCircleRadiusPoint ??
      (hitPoint !== null && hitPoint !== centerIdx ? hitPoint : null) ??
      addPoint(
        runtime,
        hitPoint === null
          ? { ...snapDir(getPointById(centerIdx), { x, y }), style: currentPointStyle() }
          : { x, y, style: currentPointStyle() }
      );
    const center = getPointById(centerIdx);
    const radiusPt = getPointById(radiusPointIdx);
    const radius = Math.hypot(center.x - radiusPt.x, center.y - radiusPt.y);
    
    if (radius <= 1e-6) {
      // Radius too small, cancel and keep center selected
      if (hitPoint === null && pendingCircleRadiusPoint === null) {
        removePointsKeepingOrder([radiusPointIdx]);
      }
      pendingCircleRadiusPoint = null;
      selectedPointId = centerIdx;
      draw();
      updateSelectionButtons();
      return;
    }
    
    const circleId = addCircleWithCenter(centerIdx, radius, [radiusPointIdx]);
    selectedCircleId = circleId ?? null;
    selectedPointId = null;
    circleCenterId = null;
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
    selectedLineId = null;
    selectedPointId = null;
    selectedCircleId = null;
    selectedPolygonId = null;
    selectedAngleId = null;
    selectedLabel = null;
    selectedArcSegments.clear();
    selectedSegments.clear();
    updateSelectionButtons();
    const hitPoint = findPoint({ x, y });
    const ptIdx = hitPoint ?? addPoint(runtime, { x, y, style: currentPointStyle() });
    const prevLen = circleThreePoints.length;
    circleThreePoints.push(ptIdx);
    // Keep the first selected point highlighted when picking the second one
    if (prevLen === 0) {
      selectedPointId = ptIdx;
    } else {
      selectedPointId = circleThreePoints[0];
    }
    selectedLineId = null;
    selectedCircleId = null;
    if (circleThreePoints.length === 3) {
      const circleId = addCircleThroughPoints(circleThreePoints as [string, string, string]);
      if (circleId !== null) {
        selectedCircleId = circleId;
        selectedPointId = null;
        pushHistory();
        maybeRevertMode();
      }
      circleThreePoints = [];
    }
    draw();
    updateSelectionButtons();
  } else if (mode === 'triangleUp') {
    const hitPoint = findPoint({ x, y });
    if (triangleStartId === null) {
      const idx = hitPoint ?? addPoint(runtime, { x, y, style: currentPointStyle() });
      triangleStartId = idx;
      selectedPolygonId = null;
      selectedPointId = idx;
      selectedLineId = null;
      selectedCircleId = null;
      draw();
      return;
    }
    const baseStart = getPointById(triangleStartId);
    const snappedPos = hitPoint !== null ? { x, y } : snapDir(baseStart, { x, y });
    const idx = hitPoint ?? addPoint(runtime, { ...snappedPos, style: currentPointStyle() });
    const aIdx = triangleStartId;
    const bIdx = idx;
    const a = getPointById(aIdx);
    const b = getPointById(bIdx);
    const base = { x: b.x - a.x, y: b.y - a.y };
    const len = Math.hypot(base.x, base.y) || 1;
    const perp = { x: base.y / len, y: -base.x / len };
    const height = (Math.sqrt(3) / 2) * len;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const apex = { x: mid.x + perp.x * height, y: mid.y + perp.y * height };
    const cIdx = addPoint(runtime, { ...apex, style: currentPointStyle() });
    const style = currentStrokeStyle();
    const l1 = getOrCreateLineBetweenPoints(aIdx, bIdx, style);
    const l2 = getOrCreateLineBetweenPoints(bIdx, cIdx, style);
    const l3 = getOrCreateLineBetweenPoints(cIdx, aIdx, style);
    const polyLines = [l1, l2, l3];
    const newPolyIdx = createPolygon([aIdx, bIdx, cIdx], 'free', polyLines);
    triangleStartId = null;
    selectedPolygonId = newPolyIdx;
    selectedLineId = null;
    selectedSegments.clear();
    selectedPointId = null;
    draw();
    pushHistory();
    maybeRevertMode();
    updateSelectionButtons();
  } else if (mode === 'square') {
    const hitPoint = findPoint({ x, y });
    if (squareStartId === null) {
      const idx = hitPoint ?? addPoint(runtime, { x, y, style: currentPointStyle() });
      squareStartId = idx;
      selectedPolygonId = null;
      selectedPointId = idx;
      selectedLineId = null;
      selectedCircleId = null;
      draw();
      return;
    }
    const baseStart = getPointById(squareStartId);
    const snappedPos = hitPoint !== null ? { x, y } : snapDir(baseStart, { x, y });
    const idx = hitPoint ?? addPoint(runtime, { ...snappedPos, style: currentPointStyle() });
    const aIdx = squareStartId;
    const bIdx = idx;
    const a = getPointById(aIdx);
    const b = getPointById(bIdx);
    const base = { x: b.x - a.x, y: b.y - a.y };
    const len = Math.hypot(base.x, base.y) || 1;
    const perp = { x: base.y / len, y: -base.x / len };
    const p3 = { x: b.x + perp.x * len, y: b.y + perp.y * len };
    const p4 = { x: a.x + perp.x * len, y: a.y + perp.y * len };
    const cIdx = addPoint(runtime, { ...p3, style: currentPointStyle() });
    const dIdx = addPoint(runtime, { ...p4, style: currentPointStyle() });
    const style = currentStrokeStyle();
    const l1 = getOrCreateLineBetweenPoints(aIdx, bIdx, style);
    const l2 = getOrCreateLineBetweenPoints(bIdx, cIdx, style);
    const l3 = getOrCreateLineBetweenPoints(cIdx, dIdx, style);
    const l4 = getOrCreateLineBetweenPoints(dIdx, aIdx, style);
    const polyLines = [l1, l2, l3, l4];
    const newPolyIdx = createPolygon([aIdx, bIdx, cIdx, dIdx], 'free', polyLines);
    squareStartId = null;
    selectedPolygonId = newPolyIdx;
    selectedLineId = null;
    selectedSegments.clear();
    selectedPointId = null;
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
        runtime,
        polygonChain.length === 1
          ? { ...snapDir(getPointById(polygonChain[0]), { x, y }), style: currentPointStyle() }
          : { x, y, style: currentPointStyle() }
      );
    if (!polygonChain.length) {
      currentPolygonLines = [];
      polygonChain.push(idx);
      selectedPointId = idx;
      selectedLineId = null;
      selectedCircleId = null;
      selectedPolygonId = null;
      draw();
      return;
    }
    const firstIdx = polygonChain[0];
    const lastIdx = polygonChain[polygonChain.length - 1];
    const lastPt = getPointById(lastIdx);
    const newPt = getPointById(idx);
    if (lastPt && newPt && Math.hypot(lastPt.x - newPt.x, lastPt.y - newPt.y) <= 1e-6) {
      if (wasTemporary) removePointsKeepingOrder([idx]);
      selectedPointId = lastIdx;
      draw();
      return;
    }
    const style = currentStrokeStyle();
    const tol = currentHitRadius();
    if (
      idx === firstIdx ||
      Math.hypot((getPointById(firstIdx)?.x ?? 0) - (getPointById(idx)?.x ?? 0), (getPointById(firstIdx)?.y ?? 0) - (getPointById(idx)?.y ?? 0)) <= tol
    ) {
      const closingLine = getOrCreateLineBetweenPoints(lastIdx, firstIdx, style);
      currentPolygonLines.push(closingLine);
      // polygonChain contains the vertex indices in order
      const newPolyIdx = createPolygon(polygonChain, 'free', currentPolygonLines);
      selectedPolygonId = newPolyIdx;
      selectedLineId = null;
      selectedSegments.clear();
      selectedPointId = null;
      polygonChain = [];
      currentPolygonLines = [];
      draw();
      pushHistory();
      maybeRevertMode();
      updateSelectionButtons();
    } else {
      // const newLine = getOrCreateLineBetweenPoints(lastIdx, idx, style);
      const newLine = addLineFromPoints(model, lastIdx, idx, style);
      currentPolygonLines.push(newLine);
      polygonChain.push(idx);
      selectedPointId = idx;
      selectedLineId = newLine;
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
      
      selectedPointId = pointHit;
      selectedLineId = null;
      selectedSegments.clear();
      
      if (anglePoints.length === 3) {
        const [p1, p2, p3] = anglePoints;
        
        if (p1 === p3) {
          anglePoints = [];
          selectedPointId = null;
          draw();
          return;
        }

        // p2 is the vertex
        const seg1LineId = ensureSegment(p1, p2).line;
        const seg2LineId = ensureSegment(p2, p3).line;
        
        const angleId = nextId('angle', runtime);
        dispatchAction({
          type: 'ADD',
          kind: 'angle',
          payload: {
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
          }
        });
        selectedAngleId = angleId;
        selectedPointId = null;
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
      selectedPointId = null;
    }

    const l = getLineById(lineHit.lineId);
    const a = l ? l.points[lineHit.seg] : undefined;
    const b = l ? l.points[lineHit.seg + 1] : undefined;
    if (a === undefined || b === undefined) return;
    if (!angleFirstLeg) {
      angleFirstLeg = { line: lineHit.lineId, seg: lineHit.seg, a, b, click: { x, y } };
      selectedLineId = lineHit.lineId;
      selectedPointId = a;
      selectedSegments.clear();
      selectedSegments.add(segmentKey(lineHit.lineId, 'segment', lineHit.seg));
      updateSelectionButtons();
      draw();
      return;
    }
    const first = angleFirstLeg;
    // Prevent creating 0-degree angle (same segment clicked twice)
    if (first.line === lineHit.lineId && first.seg === lineHit.seg) {
      angleFirstLeg = null;
      selectedSegments.clear();
      selectedLineId = null;
      draw();
      return;
    }
    const shared = [a, b].find((p) => p === first.a || p === first.b);
    if (shared === undefined) {
      const lineA = getLineById(first.line);
      const lineB = getLineById(lineHit.lineId);
      const a1 = lineA ? getPointById(lineA.points[0]) : null;
      const a2 = lineA ? getPointById(lineA.points[lineA.points.length - 1]) : null;
      const b1 = lineB ? getPointById(lineB.points[0]) : null;
      const b2 = lineB ? getPointById(lineB.points[lineB.points.length - 1]) : null;
      if (!lineA || !lineB || !a1 || !a2 || !b1 || !b2) {
        angleFirstLeg = null;
        selectedSegments.clear();
        selectedLineId = null;
        draw();
        return;
      }
      const inter = intersectLines(a1, a2, b1, b2);
      if (!inter) {
        angleFirstLeg = null;
        selectedSegments.clear();
        selectedLineId = null;
        draw();
        return;
      }
      let vertex = lineA.points.find((pid) => lineB.points.includes(pid)) ?? null;
      if (!vertex) {
        vertex = addPoint(runtime, {
          x: inter.x,
          y: inter.y,
          style: currentPointStyle(),
          defining_parents: [
            { kind: 'line', id: lineA.id },
            { kind: 'line', id: lineB.id }
          ]
        });
        insertPointIntoLine(lineA.id, vertex, inter);
        insertPointIntoLine(lineB.id, vertex, inter);
      }
      const v = vertex ? getPointById(vertex) : null;
      if (!v) {
        angleFirstLeg = null;
        selectedSegments.clear();
        selectedLineId = null;
        draw();
        return;
      }
      const pickLegPointFromClick = (clickPos: { x: number; y: number }, pA: string, pB: string) => {
        const ptA = getPointById(pA);
        const ptB = getPointById(pB);
        if (!ptA || !ptB) return null;
        const dir = { x: clickPos.x - v.x, y: clickPos.y - v.y };
        const len = Math.hypot(dir.x, dir.y);
        if (len < 1e-6) {
          const distA = Math.hypot(ptA.x - v.x, ptA.y - v.y);
          const distB = Math.hypot(ptB.x - v.x, ptB.y - v.y);
          return distA >= distB ? pA : pB;
        }
        const dotA = (ptA.x - v.x) * dir.x + (ptA.y - v.y) * dir.y;
        const dotB = (ptB.x - v.x) * dir.x + (ptB.y - v.y) * dir.y;
        if (dotA === dotB) {
          const distA = Math.hypot(ptA.x - v.x, ptA.y - v.y);
          const distB = Math.hypot(ptB.x - v.x, ptB.y - v.y);
          return distA >= distB ? pA : pB;
        }
        return dotA >= dotB ? pA : pB;
      };
      const other1 = pickLegPointFromClick(first.click, first.a, first.b);
      const other2 = pickLegPointFromClick({ x, y }, a, b);
      if (!other1 || !other2 || other1 === vertex || other2 === vertex) {
        angleFirstLeg = null;
        selectedSegments.clear();
        selectedLineId = null;
        draw();
        return;
      }
      const angleId = nextId('angle', runtime);
      dispatchAction({
        type: 'ADD',
        kind: 'angle',
        payload: {
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
        }
      });
      selectedAngleId = angleId;
      selectedLineId = null;
      selectedPointId = null;
      selectedSegments.clear();
      angleFirstLeg = null;
      draw();
      pushHistory();
      maybeRevertMode();
      updateSelectionButtons();
      return;
    }
    const vertex = shared;
    const other1 = vertex === first.a ? first.b : first.a;
    const other2 = a === vertex ? b : a;
    const v = getPointById(vertex);
    const p1 = getPointById(other1);
    const p2 = getPointById(other2);
    if (!v || !p1 || !p2) {
      angleFirstLeg = null;
      return;
    }
    const style = currentStrokeStyle();
    const angleId = nextId('angle', runtime);
    dispatchAction({
      type: 'ADD',
      kind: 'angle',
      payload: {
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
      }
    });
    selectedAngleId = angleId;
    selectedLineId = null;
    selectedPointId = null;
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
    const polyHit = lineHit ? polygonForLineHit(lineHit) : selectedPolygonId;
    const color = colorWithAlpha(styleColorInput?.value ?? '#000', styleColorAlpha);
    let changed = false;
  const polygonHasLabels = (polyId: string | null) => {
    if (polyId === null) return false;
    const verts = polygonVerticesOrdered(polyId);
    return verts.length > 0 && verts.every((vi) => !!getPointById(vi)?.label);
  };
    
    // Click on angle
    if (angleHit !== null) {
      const ang = getAngleById(angleHit);
      if (ang && !ang.label) {
        const { text, seq } = nextGreek();
        ang.label = {
          text,
          color,
          offset: defaultAngleLabelOffset(angleHit),
          fontSize: 0,
          seq
        };
        selectedAngleId = angleHit;
        changed = true;
        clearLabelSelection();
        setMode('move');
        updateToolButtons();
      } else if (ang) {
        selectedAngleId = angleHit;
      }
    }
    // Click on point
    else if (pointHit !== null) {
      selectedPointId = pointHit;
      const ptObj = getPointById(pointHit);
      if (ptObj && !ptObj.label) {
        const { text, seq } = nextUpper();
        ptObj.label = {
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
      selectedPolygonId = polyHit;
      if (!polygonHasLabels(polyHit)) {
        const verts = polygonVerticesOrdered(polyHit);
        verts.forEach((vi, i) => {
          const idx = labelUpperIdx + i;
          const text = seqLetter(idx, UPPER_SEQ);
          const vpt = getPointById(vi);
          if (vpt) vpt.label = {
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
      selectedLineId = lineHit.lineId;
      const lh = getLineById(lineHit.lineId);
      if (lh && !lh.label) {
        const { text, seq } = nextLower();
        lh.label = {
          text,
          color,
          offset: defaultLineLabelOffset(lineHit.lineId),
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
      dispatchAction({ type: 'ADD', kind: 'label', payload: { text, pos: { x, y }, color, fontSize: 0 } as any });
      const newLabel = listLabels().slice(-1)[0];
      if (newLabel?.id) selectLabel({ kind: 'free', id: newLabel.id });
      
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
      const ang = getAngleById(angleHit);
      if (!ang) return;
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
        const line1: Line | undefined = getLineById(l1ref);
        const line2: Line | undefined = getLineById(l2ref);
        if (line1 && line2) {
          const seg1 = getAngleLegSeg(ang, 1);
          const seg2 = getAngleLegSeg(ang, 2);
          const a1 = line1.points[seg1];
          const b1 = line1.points[seg1 + 1];
          const a2 = line2.points[seg2];
          const b2 = line2.points[seg2 + 1];
          if (a1 !== undefined && b1 !== undefined && a2 !== undefined && b2 !== undefined) {
            const seg1Ref: BisectSegmentRef = { lineId: line1.id, a: getPointById(a1)?.id ?? '', b: getPointById(b1)?.id ?? '' };
            const seg2Ref: BisectSegmentRef = { lineId: line2.id, a: getPointById(a2)?.id ?? '', b: getPointById(b2)?.id ?? '' };
            const bisMeta: BisectMeta = { vertex: getPointById(ang.vertex)?.id ?? '', seg1: seg1Ref, seg2: seg2Ref, epsilon: BISECT_POINT_CREATION_DISTANCE };
            const hiddenStyle = { ...bisectPointStyle(), hidden: true };
            const endIdx = addPoint(runtime, { ...end, style: hiddenStyle, construction_kind: 'bisect', bisectMeta: bisMeta });
            const style = currentStrokeStyle();
            const lineId = addLineFromPoints(runtime, ang.vertex, endIdx, style);
            const newLine = getLineById(lineId);
            if (newLine) {
              newLine.rightRay = { ...(newLine.rightRay ?? style), hidden: false };
              newLine.leftRay = { ...(newLine.leftRay ?? style), hidden: true };
              (newLine as any).bisector = { vertex: getPointById(ang.vertex)?.id ?? '', bisectPoint: getPointById(endIdx)?.id ?? '' };
            }
            // Recompute bisect point immediately so initial position matches recompute logic
            recomputeBisectPoint(endIdx);
            updateIntersectionsForLine(lineId);
            updateParallelLinesForLine(lineId);
            updatePerpendicularLinesForLine(lineId);
            selectedLineId = lineId;
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
    const l = getLineById(lineHit.lineId);
    const a = l.points[lineHit.seg];
    const b = l.points[lineHit.seg + 1];
    if (a === undefined || b === undefined) return;
    if (!bisectorFirstLeg) {
      bisectorFirstLeg = { line: lineHit.lineId, seg: lineHit.seg, a, b, vertex: a };
      selectedLineId = lineHit.lineId;
      selectedPointId = a;
      draw();
      return;
    }
    // Prevent creating 0-degree angle (same segment clicked twice)
    if (bisectorFirstLeg.line === lineHit.lineId && bisectorFirstLeg.seg === lineHit.seg) {
      bisectorFirstLeg = null;
      selectedLineId = null;
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
    const v = getPointById(vertex);
    const p1 = getPointById(other1);
    const p2 = getPointById(other2);
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
    const seg1Line = getLineById(bisectorFirstLeg.line);
    const seg2Line = getLineById(lineHit.lineId);
    const seg1Ref: BisectSegmentRef = {
      lineId: seg1Line?.id ?? '',
      a: getPointById(bisectorFirstLeg.a)?.id ?? '',
      b: getPointById(bisectorFirstLeg.b)?.id ?? ''
    };
    const seg2Ref: BisectSegmentRef = {
      lineId: seg2Line?.id ?? '',
      a: getPointById(a2)?.id ?? '',
      b: getPointById(b2)?.id ?? ''
    };
    const bisMeta: BisectMeta = { vertex: v?.id ?? '', seg1: seg1Ref, seg2: seg2Ref, epsilon: BISECT_POINT_CREATION_DISTANCE };
    const hiddenStyle = { ...bisectPointStyle(), hidden: true };
    const endIdx = addPoint(runtime, { ...end, style: hiddenStyle, construction_kind: 'bisect', bisectMeta: bisMeta });
    const style = currentStrokeStyle();
    const lineId = addLineFromPoints(runtime, vertex, endIdx, style);
    // Make the created line appear as a half-line (ray) in the direction of the bisect point.
    // Points are [vertex, endIdx], so enable the right ray (extends past endIdx) and hide left ray.
    const bisectorLine = getLineById(lineId);
    if (bisectorLine) {
      bisectorLine.rightRay = { ...(bisectorLine.rightRay ?? style), hidden: false };
      bisectorLine.leftRay = { ...(bisectorLine.leftRay ?? style), hidden: true };
      (bisectorLine as any).bisector = { vertex: v?.id ?? '', bisectPoint: getPointById(endIdx)?.id ?? '' };
    }
    // Recompute bisect point immediately so initial position matches recompute logic
    recomputeBisectPoint(endIdx);
    updateIntersectionsForLine(lineId);
    updateParallelLinesForLine(lineId);
    updatePerpendicularLinesForLine(lineId);
    selectedLineId = lineId;
    selectedPointId = null;
    bisectorFirstLeg = null;
    draw();
    pushHistory();
    maybeRevertMode();
    updateSelectionButtons();
  } else if (mode === 'midpoint') {
    // If starting midpoint tool (no first point yet), clear any existing selection
    if (midpointFirstId === null) {
      selectedPointId = null;
      selectedLineId = null;
      selectedCircleId = null;
      selectedAngleId = null;
      selectedPolygonId = null;
      selectedInkStrokeId = null;
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
      if (midpointFirstId === null) {
        midpointFirstId = hitPoint;
        selectedPointId = hitPoint;
        draw();
        return;
      }
      // Second point selected
      const secondIdx = hitPoint;
      const p1 = getPointById(midpointFirstId);
      const p2 = getPointById(secondIdx);
      if (!p1 || !p2) {
        midpointFirstId = null;
        maybeRevertMode();
        updateSelectionButtons();
        return;
      }
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const parents: [string, string] = [p1.id, p2.id];
      const idx = addPoint(runtime, {
        ...mid,
        style: midpointPointStyle(),
        defining_parents: [],
        construction_kind: 'midpoint',
        midpointMeta: { parents, parentLineId: null }
      });
      recomputeMidpoint(idx);
      selectedPointId = idx;
      draw();
      pushHistory();
      midpointFirstId = null;
      maybeRevertMode();
      updateSelectionButtons();
      return;
    }
    
    // No point hit, check for line segment
    if (lineHit && lineHit.part === 'segment' && midpointFirstId === null) {
      const l = getLineById(lineHit.lineId);
      const a = l ? getPointById(l.points[lineHit.seg]) : undefined;
      const b = l ? getPointById(l.points[lineHit.seg + 1]) : undefined;
      if (a && b) {
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const parents: [string, string] = [a.id, b.id];
        const lineParent = l?.id ?? null;
        const idx = addPoint(runtime, {
          ...mid,
          style: midpointPointStyle(),
          defining_parents: lineParent ? [{ kind: 'line', id: lineParent }] : [],
          construction_kind: 'midpoint',
          midpointMeta: { parents, parentLineId: lineParent }
        });
        recomputeMidpoint(idx);
        insertPointIntoLine(lineHit.lineId, idx, mid);
        selectedPointId = idx;
        selectedLineId = lineHit.lineId;
        draw();
        pushHistory();
        maybeRevertMode();
        updateSelectionButtons();
        return;
      }
    }
    
    // Nothing hit and no first point selected - do nothing
    if (midpointFirstId === null) {
      return;
    }
    
    // Create new point at click location as second point
    const secondIdx = addPoint(runtime, { x, y, style: currentPointStyle() });
    const p1 = getPointById(midpointFirstId);
    const p2 = getPointById(secondIdx);
    if (!p1 || !p2) {
      midpointFirstId = null;
      maybeRevertMode();
      updateSelectionButtons();
      return;
    }
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const parents: [string, string] = [p1.id, p2.id];
    const midIdx = addPoint(runtime, {
      ...mid,
      style: midpointPointStyle(),
      construction_kind: 'midpoint',
      midpointMeta: { parents, parentLineId: null }
    });
    recomputeMidpoint(midIdx);
    selectedPointId = midIdx;
    midpointFirstId = null;
    draw();
    pushHistory();
    maybeRevertMode();
    updateSelectionButtons();
  } else if (mode === 'intersection') {
    // Two-step selection: first pick one line/circle, then the second — create intersection points.
    const lineHits = findLineHits({ x, y });
    const circleHits = findCircles({ x, y }, currentHitRadius(), false);
    let hitObj: { kind: 'line' | 'circle'; id: string } | null = null;
    if (lineHits.length) hitObj = { kind: 'line', id: lineHits[0].lineId };
    else if (circleHits.length) hitObj = { kind: 'circle', id: circleHits[0].circleId };

    if (!hitObj && pendingIntersection === null) {
      // nothing selected yet
      return;
    }

    if (pendingIntersection === null && hitObj) {
      pendingIntersection = hitObj;
      if (hitObj.kind === 'line') selectedLineId = hitObj.id;
      else selectedCircleId = hitObj.id;
      draw();
      return;
    }

    if (pendingIntersection && hitObj) {
      // don't allow selecting same object twice
      if (pendingIntersection.kind === hitObj.kind && pendingIntersection.id === hitObj.id) {
        pendingIntersection = null;
        selectedLineId = null;
        selectedCircleId = null;
        draw();
        return;
      }

      // Compute intersections between pendingIntersection and hitObj
      const a = pendingIntersection;
      const b = hitObj;
      let pts: { x: number; y: number }[] = [];
      if (a.kind === 'line' && b.kind === 'line') {
        const l1 = getLineById(a.id);
        const l2 = getLineById(b.id);
        if (l1 && l2 && l1.points.length >= 2 && l2.points.length >= 2) {
          const a1 = getPointById(l1.points[0]);
          const a2 = getPointById(l1.points[l1.points.length - 1]);
          const b1 = getPointById(l2.points[0]);
          const b2 = getPointById(l2.points[l2.points.length - 1]);
          const inter = intersectLines(a1, a2, b1, b2);
          if (inter) pts.push(inter);
        }
      } else if (a.kind === 'line' && b.kind === 'circle') {
        const l = getLineById(a.id);
        const c = getCircleById(b.id);
        if (l && c && l.points.length >= 2) {
          const a1 = getPointById(l.points[0]);
          const a2 = getPointById(l.points[l.points.length - 1]);
          const center = getPointById(c.center);
          const radius = circleRadius(c);
          if (a1 && a2 && center && radius > 0) pts = lineCircleIntersections(a1, a2, center, radius, false);
        }
      } else if (a.kind === 'circle' && b.kind === 'line') {
        const l = getLineById(b.id);
        const c = getCircleById(a.id);
        if (l && c && l.points.length >= 2) {
          const a1 = getPointById(l.points[0]);
          const a2 = getPointById(l.points[l.points.length - 1]);
          const center = getPointById(c.center);
          const radius = circleRadius(c);
          if (a1 && a2 && center && radius > 0) pts = lineCircleIntersections(a1, a2, center, radius, false);
        }
      } else if (a.kind === 'circle' && b.kind === 'circle') {
        const c1 = getCircleById(a.id);
        const c2 = getCircleById(b.id);
        if (c1 && c2) pts = circleCircleIntersections(getPointById(c1.center), circleRadius(c1), getPointById(c2.center), circleRadius(c2));
      }

      // Create points for intersections
      if (pts.length) {
        const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
        let firstIdx: number | null = null;
        for (const ppos of pts) {
          const parents: ConstructionParent[] = [];
          if (a.kind === 'line') parents.push({ kind: 'line', id: a.id });
          else parents.push({ kind: 'circle', id: a.id });
          if (b.kind === 'line') parents.push({ kind: 'line', id: b.id });
          else parents.push({ kind: 'circle', id: b.id });
          const idx = addPoint(runtime, { ...ppos, style: currentPointStyle(), defining_parents: parents, created_group: batchId });
          // Attach to line/circle structures so points appear on objects
          if (a.kind === 'line') {
            const hit = findLineHitForPos(a.id, ppos);
            if (hit) attachPointToLine(idx, hit, ppos, ppos);
            else applyPointConstruction(idx, [{ kind: 'line', id: a.id }]);
          } else {
            attachPointToCircle(a.id, idx, ppos);
          }
          if (b.kind === 'line') {
            const hit = findLineHitForPos(b.id, ppos);
            if (hit) attachPointToLine(idx, hit, ppos, ppos);
            else applyPointConstruction(idx, [{ kind: 'line', id: b.id }]);
          } else {
            attachPointToCircle(b.id, idx, ppos);
          }
          if (firstIdx === null) firstIdx = idx;
        }
        if (firstIdx !== null) selectedPointId = firstIdx;
        pushHistory();
      }

      // After creating or cancelling intersection selection, revert to select (move)
      maybeRevertMode();
      updateToolButtons();

      pendingIntersection = null;
      selectedLineId = null;
      selectedCircleId = null;
      draw();
      return;
    }
  } else if (mode === 'ngon') {
    const hitPoint = findPoint({ x, y });
    if (squareStartId === null) {
      const idx = hitPoint ?? addPoint(runtime, { x, y, style: currentPointStyle() });
      squareStartId = idx;
      selectedPolygonId = null;
      selectedPointId = idx;
      selectedLineId = null;
      selectedCircleId = null;
      draw();
      return;
    }
    const baseStart = getPointById(squareStartId);
    const snappedPos = hitPoint !== null ? { x, y } : snapDir(baseStart, { x, y });
    const idx = hitPoint ?? addPoint(runtime, { ...snappedPos, style: currentPointStyle() });
    ngonSecondId = idx;
    selectedPointId = idx;
    draw();
    
    // Show modal
    if (ngonModal) {
      ngonModal.style.display = 'flex';
    }
  } else if (mode === 'multiselect') {
    const { x, y } = canvasToWorld(ev.clientX, ev.clientY);
    const pointHit = findPoint({ x, y });
    const lineHit = findLine({ x, y });
    const circleHit = findCircle({ x, y }, currentHitRadius(), false);
    const angleHit = findAngleAt({ x, y }, currentHitRadius(1.5));
    const inkHit = findInkStrokeAt({ x, y }) ?? findSelectedInkStrokeBoxAt({ x, y });
    const polyHit = lineHit ? polygonForLineHit(lineHit) : null;
    const labelHit = findLabelAt({ x, y });
    const polyIdHit = polyHit ? polygonId(polyHit) : null;
    const pendingTarget = (() => {
      if (pointHit !== null && multiSelectedPoints.has(pointHit)) return { kind: 'point', id: pointHit };
      if (labelHit?.kind === 'point' && multiSelectedPoints.has(labelHit.id)) return { kind: 'point', id: labelHit.id };
      if (lineHit !== null && multiSelectedLines.has(lineHit.lineId)) return { kind: 'line', id: lineHit.lineId };
      if (labelHit?.kind === 'line' && multiSelectedLines.has(labelHit.id)) return { kind: 'line', id: labelHit.id };
      if (circleHit !== null && multiSelectedCircles.has(circleHit.circleId)) return { kind: 'circle', id: circleHit.circleId };
      if (angleHit !== null && multiSelectedAngles.has(angleHit)) return { kind: 'angle', id: angleHit };
      if (labelHit?.kind === 'angle' && multiSelectedAngles.has(labelHit.id)) return { kind: 'angle', id: labelHit.id };
      if (polyIdHit !== null && multiSelectedPolygons.has(polyIdHit)) return { kind: 'polygon', id: polyIdHit };
      if (inkHit !== null && multiSelectedInkStrokes.has(inkHit)) return { kind: 'ink', id: inkHit };
      if (labelHit?.kind === 'free' && multiSelectedLabels.has(labelHit.id)) return { kind: 'label', id: labelHit.id };
      return null;
    })();

    if (pendingTarget) {
      pendingMultiToggle = { ...pendingTarget, start: { x, y } };
      draw();
      return;
    }

    // Start drawing selection box
    multiselectBoxStart = { x, y };
    multiselectBoxEnd = { x, y };

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
      const lineId = lineHit.lineId;
      if (multiSelectedLines.has(lineId)) {
        multiSelectedLines.delete(lineId);
      } else {
        multiSelectedLines.add(lineId);
      }
      multiselectBoxStart = null;
      multiselectBoxEnd = null;
      draw();
      updateSelectionButtons();
      return;
    }

    if (circleHit !== null) {
      const circleId = circleHit.circleId;
      if (multiSelectedCircles.has(circleId)) {
        multiSelectedCircles.delete(circleId);
      } else {
        multiSelectedCircles.add(circleId);
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

    if (polyIdHit !== null) {
      if (multiSelectedPolygons.has(polyIdHit)) multiSelectedPolygons.delete(polyIdHit);
      else multiSelectedPolygons.add(polyIdHit);
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
      let polygonHit = lineHit
        ? (polygonForLineHit(lineHit) ?? polygonForLine(lineHit.lineId))
        : (pointHit ? polygonForPointCore(runtime, pointHit) : null);
      if (!polygonHit) {
        polygonHit = polygonAtPointCore(runtime, { x, y }, { includeHidden: showHidden });
      }
      // hits computed
      
      // Zachowaj oryginalne zaznaczenie
      const originalPointIndex = selectedPointId;
      const originalLineIndex = selectedLineId;
      const originalCircleIndex = selectedCircleId;
      const originalAngleIndex = selectedAngleId;
      const originalPolygonIndex = selectedPolygonId;
      const originalInkStrokeIndex = selectedInkStrokeId;
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
        selectedInkStrokeId = inkHit;
        selectedPointId = null;
        selectedLineId = null;
        selectedCircleId = null;
        selectedAngleId = null;
        selectedPolygonId = null;
        selectedSegments.clear();
        selectedArcSegments.clear();
        applyStyleToSelection(copiedStyle);
        applied = true;
      } else if (copiedStyle.sourceType === 'angle' && angleHit !== null) {
        selectedAngleId = angleHit;
        selectedPointId = null;
        selectedLineId = null;
        selectedCircleId = null;
        selectedPolygonId = null;
        selectedInkStrokeId = null;
        selectedSegments.clear();
        selectedArcSegments.clear();
        applyStyleToSelection(copiedStyle);
        applied = true;
      } else if (copiedStyle.sourceType === 'circle' && circleHit !== null) {
        selectedCircleId = circleHit.circleId;
        selectedPointId = null;
        selectedLineId = null;
        selectedAngleId = null;
        selectedPolygonId = null;
        selectedInkStrokeId = null;
        selectedSegments.clear();
        selectedArcSegments.clear();
        applyStyleToSelection(copiedStyle);
        applied = true;
      } else if (copiedStyle.sourceType === 'line' && lineHit !== null) {
        selectedLineId = lineHit.lineId;
        selectedPointId = null;
        selectedCircleId = null;
        selectedAngleId = null;
        selectedPolygonId = null;
        selectedInkStrokeId = null;
        selectedSegments.clear();
        selectedArcSegments.clear();
        selectionEdges = true;
        selectionVertices = false;
        applyStyleToSelection(copiedStyle);
        applied = true;
      } else if (copiedStyle.sourceType === 'polygon' && polygonHit !== null) {
        selectedPolygonId = polygonHit;
        selectedPointId = null;
        selectedLineId = null;
        selectedCircleId = null;
        selectedAngleId = null;
        selectedInkStrokeId = null;
        selectedSegments.clear();
        selectedArcSegments.clear();
        if (lineHit) {
          const edgeKeys = polygonEdgeSegmentKeys(polygonHit);
          const lineKeys = Array.from(edgeKeys).filter((key) => {
            const parsed = parseSegmentKey(key);
            return parsed && String(parsed.lineId) === String(lineHit.lineId);
          });
          if (lineKeys.length) {
            lineKeys.forEach((key) => selectedSegments.add(key));
          } else {
            selectedSegments.add(hitKey(lineHit));
          }
        }
        applyStyleToSelection(copiedStyle);
        applied = true;
      } else if (copiedStyle.sourceType === 'point' && pointHit !== null) {
        selectedPointId = pointHit;
        selectedLineId = null;
        selectedCircleId = null;
        selectedAngleId = null;
        selectedPolygonId = null;
        selectedInkStrokeId = null;
        selectedSegments.clear();
        selectedArcSegments.clear();
        applyStyleToSelection(copiedStyle);
        applied = true;
      }
      else if (copiedStyle.sourceType === 'label' && labelHit !== null) {
        selectedLabel = labelHit;
        selectedPointId = null;
        selectedLineId = null;
        selectedCircleId = null;
        selectedAngleId = null;
        selectedPolygonId = null;
        selectedInkStrokeId = null;
        selectedSegments.clear();
        selectedArcSegments.clear();
        applyStyleToSelection(copiedStyle);
        applied = true;
      }
      // applied flag

      if (applied) {
        // Przywróć oryginalne zaznaczenie
        selectedPointId = originalPointIndex;
        selectedLineId = originalLineIndex;
        selectedCircleId = originalCircleIndex;
        selectedAngleId = originalAngleIndex;
        selectedLabel = originalSelectedLabel;
        selectedPolygonId = originalPolygonIndex;
        selectedInkStrokeId = originalInkStrokeIndex;
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
    let fallbackCircleId: string | null = null;
    let circleFallback = false;
    if (pointHit !== null) {
      const pt = getPointById(pointHit);
      const draggable = isPointDraggable(pt);
      const preferPointSelection =
        !draggable && (pt.construction_kind === 'intersection' || isMidpointPoint(pt) || isSymmetricPoint(pt));
      if (!draggable && !preferPointSelection) {
        if (circleHit !== null) {
          fallbackCircleId = circleHit.circleId;
        } else {
          const circleParent = pt.parent_refs.find((pr: ConstructionParent) => pr.kind === 'circle');
          if (circleParent) {
            fallbackCircleId = circleParent.id;
          }
        }
      }
      circleFallback = fallbackCircleId !== null;
      const lineFallback =
        !draggable && !preferPointSelection && lineHit !== null && isLineDraggable(getLineById(lineHit.lineId));
      if (!circleFallback && !lineFallback) {
        selectedPointId = pointHit;
        selectedLineId = null;
        selectedCircleId = null;
        selectedAngleId = null;
        selectedPolygonId = null;
        selectedArcSegments.clear();
        selectedSegments.clear();
        if (draggable) {
          const centerCircles = circlesWithCenter(pointHit).filter((circleId) => {
            const circle = getCircleById(circleId);
            return circle?.circle_kind === 'center-radius';
          });
          if (centerCircles.length) {
            const context = new Map<string, Map<string, number>>();
            centerCircles.forEach((circleId) => {
              const circle = getCircleById(circleId);
              const centerPoint = pt;
              if (!circle || !centerPoint) return;
              const angles = new Map<string, number>();
              circle.points.forEach((pid) => {
                const pnt = getPointById(pid);
                if (!pnt) return;
                angles.set(pid, Math.atan2(pnt.y - centerPoint.y, pnt.x - centerPoint.x));
              });
              const radiusPt = circle.radius_point ? getPointById(circle.radius_point) : null;
              if (radiusPt) {
                angles.set(
                  circle.radius_point,
                  Math.atan2(radiusPt.y - centerPoint.y, radiusPt.x - centerPoint.x)
                );
              }
              context.set(circleId, angles);
            });
            draggingCircleCenterAngles = context;
          }
        }
        draggingSelection = draggable;
        dragStart = { x, y };
        activeDragPointerId = draggingSelection ? ev.pointerId : null;
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
      if (circleFallback && circleHit === null && fallbackCircleId !== null) {
        circleHit = { circleId: fallbackCircleId };
      }
    }
    const targetedCircleIdx = circleHit?.circleId ?? null;
    const arcMatchesCircle =
      arcHit !== null && targetedCircleIdx !== null && arcHit.circle === targetedCircleIdx;
    const allowArcToggle =
      arcMatchesCircle &&
      (selectedCircleId === targetedCircleIdx || ev.detail >= 2);
    if (angleHit !== null) {
      selectedAngleId = angleHit;
      selectedLineId = null;
      selectedPointId = null;
      selectedCircleId = null;
      selectedPolygonId = null;
      selectedArcSegments.clear();
      selectedSegments.clear();
      draggingSelection = false;
      dragStart = { x, y };
      updateSelectionButtons();
      draw();
      return;
    }
    if (circleHit !== null) {
      const previousCircle = selectedCircleId;
      const circleId = circleHit.circleId;
      const c = getCircleById(circleId);
      if (!c) {
        updateSelectionButtons();
        draw();
        return;
      }
      const centerId = c.center;
      const centerPoint = getPointById(centerId);
      const centerDraggable = isPointDraggable(centerPoint);
      if (allowArcToggle && arcHit !== null) {
        const key = arcHit.key ?? arcKeyByIndex(circleId, arcHit.arcIdx);
        selectedCircleId = circleId;
        selectedLineId = null;
        selectedPointId = null;
        selectedAngleId = null;
        selectedPolygonId = null;
        selectedSegments.clear();
        if (previousCircle === circleId) {
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
      selectedCircleId = circleId;
      selectedArcSegments.clear();
      selectedLineId = null;
      selectedPointId = null;
      selectedAngleId = null;
      selectedPolygonId = null;
      selectedSegments.clear();
      const originals = new Map<string, { x: number; y: number }>();
      const recordPoint = (pointId: string | undefined) => {
        if (!pointId) return;
        const pt = getPointById(pointId);
        if (!pt) return;
        originals.set(pointId, { x: pt.x, y: pt.y });
      };
      recordPoint(centerId);
      recordPoint(c.radius_point);
      c.points.forEach((pid) => recordPoint(pid));
      
      const dependentLines = new Map<string, number[]>();
      originals.forEach((_, pointId) => {
        const lines = findLinesContainingPoint(pointId);
        lines.forEach(lineId => {
          if (isDefiningPointOfLine(pointId, lineId) && !dependentLines.has(lineId)) {
            dependentLines.set(lineId, calculateLineFractions(lineId));
          }
        });
      });

      circleDragContext = { circleId, originals, dependentLines };
      draggingSelection = centerDraggable || originals.size > 0;
      dragStart = { x, y };
      activeDragPointerId = draggingSelection ? ev.pointerId : null;
      lineDragContext = null;
      draggingCircleCenterAngles = null;
      updateSelectionButtons();
      draw();
      return;
    }
    if (allowArcToggle && arcHit !== null) {
      const circleId = arcHit.circle;
      const key = arcHit.key ?? arcKeyByIndex(circleId, arcHit.arcIdx);
      if (selectedCircleId === circleId) {
        if (selectedArcSegments.has(key)) selectedArcSegments.delete(key);
        else selectedArcSegments.add(key);
      } else {
        selectedCircleId = circleId;
        selectedArcSegments.clear();
        selectedArcSegments.add(key);
      }
      selectedLineId = null;
      selectedPointId = null;
      selectedAngleId = null;
      selectedPolygonId = null;
      selectedSegments.clear();
      draggingSelection = false;
      lineDragContext = null;
      dragStart = { x, y };
      updateSelectionButtons();
      draw();
      return;
    }
    const inkStrokeHit = findInkStrokeAt({ x, y }) ?? findSelectedInkStrokeBoxAt({ x, y });
    if (inkStrokeHit !== null) {
      selectedInkStrokeId = inkStrokeHit;
      inkDragOriginals = null;
      selectedLineId = null;
      selectedPointId = null;
      selectedCircleId = null;
      selectedAngleId = null;
      selectedPolygonId = null;
      selectedArcSegments.clear();
      selectedSegments.clear();
      draggingSelection = true;
      dragStart = { x, y };
      activeDragPointerId = ev.pointerId;
      updateSelectionButtons();
      draw();
      return;
    }
    if (lineHit !== null) {
      const hitLineObj = getLineById(lineHit.lineId);
      const lineIsDraggable = isLineDraggable(hitLineObj);
      const polyId = polygonForLineHit(lineHit);
      const polygonDraggable = polyId !== null ? canDragPolygonVertices(runtime, polygonVertices(polyId)) : false;
      if (polyId !== null) {
        const samePolygon = selectedPolygonId === polyId;
        if (!samePolygon) {
          selectedSegments.clear();
          selectedPolygonId = polyId;
          selectedLineId = null;
        } else {
          const key = hitKey(lineHit);
          if (selectedSegments.has(key)) {
            selectedSegments.delete(key);
          } else {
            selectedSegments.add(key);
          }
          selectedLineId = selectedSegments.size > 0 ? lineHit.lineId : null;
        }
        selectedArcSegments.clear();
        selectedAngleId = null;

        const dragTarget = dragTargetForPolygonLineSelection({
          selectedSegmentsSize: selectedSegments.size,
          lineIsDraggable,
          polygonDraggable
        });

        if (dragTarget === 'polygon') {
          // Capture dependent lines for polygon drag
          const dependentLines = new Map<string, number[]>();
          // Use helper to read polygon lines and id in an id-aware way
          const pLines = polygonLines(polyId);
          if (pLines && pLines.length) {
            const verts = polygonVertices(polyId);
            const pointsInPoly = new Set<string>(verts);

            pointsInPoly.forEach(pointId => {
              const lines = findLinesContainingPoint(pointId);
              lines.forEach(lineId => {
                if (isDefiningPointOfLine(pointId, lineId) && !dependentLines.has(lineId)) {
                  dependentLines.set(lineId, calculateLineFractions(lineId));
                }
              });
            });
          }
          polygonDragContext = { polygonId: polyId, dependentLines };
        } else {
          polygonDragContext = null;
        }
        draggingSelection = dragTarget !== null;
      } else {
        if (selectedLineId === lineHit.lineId) {
          if (selectedSegments.size === 0) {
            selectedSegments.add(hitKey(lineHit));
          } else {
            const key = hitKey(lineHit);
            if (selectedSegments.has(key)) selectedSegments.delete(key);
            else selectedSegments.add(key);
          }
        } else {
          selectedLineId = lineHit.lineId;
          selectedSegments.clear();
        }
        selectedPolygonId = null;
        selectedArcSegments.clear();
        selectedAngleId = null;
        draggingSelection = lineIsDraggable;
      }
      selectedPointId = null;
      selectedCircleId = null;
      selectedArcSegments.clear();
      pendingCircleRadiusLength = lineLength(selectedLineId);
      dragStart = { x, y };
      activeDragPointerId = draggingSelection ? ev.pointerId : null;
      updateSelectionButtons();
      draw();
      return;
    }
    // if no hit, clear selection and start panning the canvas
    selectedPointId = null;
    selectedLineId = null;
    selectedCircleId = null;
    selectedPolygonId = null;
    selectedArcSegments.clear();
    selectedAngleId = null;
    selectedInkStrokeId = null;
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
    activeDragPointerId = ev.pointerId;
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
// Used by main UI flow.
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
  { id: 'modeMove', label: 'Zaznaczanie', mode: 'move', ...TOOL_ICON_DEFS.modeMove },
  { id: 'modeMultiselect', label: 'Zaznacz wiele', mode: 'multiselect', ...TOOL_ICON_DEFS.modeMultiselect },
  { id: 'modeLabel', label: 'Etykieta', mode: 'label', ...TOOL_ICON_DEFS.modeLabel },
  { id: 'modeAdd', label: 'Punkt', mode: 'add', ...TOOL_ICON_DEFS.modeAdd },
  { id: 'modeIntersection', label: 'Punkt przeci©cia', mode: 'intersection', ...TOOL_ICON_DEFS.modeIntersection },
  { id: 'modeSegment', label: 'Odcinek', mode: 'segment', ...TOOL_ICON_DEFS.modeSegment },
  { id: 'modeParallel', label: 'R¢wnolegˆa', mode: 'parallel', ...TOOL_ICON_DEFS.modeParallel },
  { id: 'modePerpendicular', label: 'Prostopadˆa', mode: 'perpendicular', ...TOOL_ICON_DEFS.modePerpendicular },
  { id: 'modeCircle', label: 'Okr¥g', mode: 'circle', ...TOOL_ICON_DEFS.modeCircle },
  { id: 'modeCircleThree', label: 'Okr¥g przez 3 punkty', mode: 'circleThree', ...TOOL_ICON_DEFS.modeCircleThree },
  { id: 'modeTriangleUp', label: 'Tr¢jk¥t foremny', mode: 'triangleUp', ...TOOL_ICON_DEFS.modeTriangleUp },
  { id: 'modeSquare', label: 'Kwadrat', mode: 'square', ...TOOL_ICON_DEFS.modeSquare },
  { id: 'modeNgon', label: 'N-k¥t', mode: 'ngon', ...TOOL_ICON_DEFS.modeNgon },
  { id: 'modePolygon', label: 'Wielok¥t', mode: 'polygon', ...TOOL_ICON_DEFS.modePolygon },
  { id: 'modeAngle', label: 'K¥t', mode: 'angle', ...TOOL_ICON_DEFS.modeAngle },
  { id: 'modeBisector', label: 'Dwusieczna', mode: 'bisector', ...TOOL_ICON_DEFS.modeBisector },
  { id: 'modeMidpoint', label: 'Punkt ˜rodkowy', mode: 'midpoint', ...TOOL_ICON_DEFS.modeMidpoint },
  { id: 'modeSymmetric', label: 'Symetria', mode: 'symmetric', ...TOOL_ICON_DEFS.modeSymmetric },
  { id: 'modeTangent', label: 'Styczna', mode: 'tangent', ...TOOL_ICON_DEFS.modeTangent },
  { id: 'modePerpBisector', label: 'Symetralna', mode: 'perpBisector', ...TOOL_ICON_DEFS.modePerpBisector },
  { id: 'modeHandwriting', label: 'Pismo r©czne', mode: 'handwriting', ...TOOL_ICON_DEFS.modeHandwriting },
] as const;

// Used by UI/state updates.
function syncToolButtonIcons() {
  TOOL_BUTTONS.forEach((tool) => {
    const btn = document.getElementById(tool.id) as HTMLButtonElement | null;
    if (!btn) return;
    let svg = btn.querySelector('svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      btn.prepend(svg);
    }
    svg.classList.add('icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', tool.viewBox);
    svg.innerHTML = tool.icon;
  });
}

// Used by UI initialization.
function initializeButtonConfig() {
  const cp = (window as any).configPane;
  if (cp && typeof cp.initializeButtonConfig === 'function') return cp.initializeButtonConfig();
  // fallback: no-op if config pane not available
}

// Used by persistence flow.
function loadConfigIntoUI(multiGroups: HTMLElement, secondGroups: HTMLElement) {
  const cp = (window as any).configPane;
  if (cp && typeof cp.loadConfigIntoUI === 'function') return cp.loadConfigIntoUI(multiGroups, secondGroups);
  // fallback: no-op
}

// Used by cleanup/delete flow.
function cleanupSecondRowHandlers() {
  const cp = (window as any).configPane;
  if (cp && typeof cp.cleanupSecondRowHandlers === 'function') return cp.cleanupSecondRowHandlers();
  // fallback: clear local handlers
  secondRowHandlerCleanup.forEach((dispose) => dispose());
  secondRowHandlerCleanup.clear();
}

// Used by UI state helpers.
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

// Used by UI/state updates.
function applyButtonConfiguration() {
  const toolRow = document.getElementById('toolbarMainRow');
  if (!toolRow) return;
  syncToolButtonIcons();
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

// Used by main UI flow.
function attachSecondRowHandlers(allButtons: Map<string, HTMLElement>) {
  const cp = (window as any).configPane;
  if (cp && typeof cp.attachSecondRowHandlers === 'function') return cp.attachSecondRowHandlers(allButtons);
  // fallback: minimal behavior - re-run local attach using existing implementation if needed
}

// Used by UI controls.
function toggleSecondRow(mainId: string, secondRowIds: string[], allButtons: Map<string, HTMLElement>) {
  const cp = (window as any).configPane;
  if (cp && typeof cp.toggleSecondRow === 'function') return cp.toggleSecondRow(mainId, secondRowIds, allButtons);
}

// Used by main UI flow.
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

// Used by UI/state updates.
function updateSecondRowActiveStates() {
  const cp = (window as any).configPane;
  if (cp && typeof cp.updateSecondRowActiveStates === 'function') return cp.updateSecondRowActiveStates();
  if (!secondRowVisible) return; const secondRowContainer = document.getElementById('toolbarSecondRow'); if (!secondRowContainer) return; const buttons = secondRowContainer.querySelectorAll('button.tool'); buttons.forEach(btn => { const element = btn as HTMLElement; const toolId = element.dataset.toolId; let btnTool = toolId ? TOOL_BUTTONS.find((t) => t.id === toolId) : undefined; if (!btnTool) { const btnTitle = btn.getAttribute('title'); if (btnTitle) btnTool = TOOL_BUTTONS.find((t) => t.label === btnTitle); } if (btnTool && btnTool.mode === mode) btn.classList.add('active'); else btn.classList.remove('active'); });
}

// Used by palette UI flow.
function setupPaletteDragAndDrop() {
  const cp = (window as any).configPane;
  if (cp && typeof cp.setupPaletteDragAndDrop === 'function') return cp.setupPaletteDragAndDrop();
}

// Used by tool actions.
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

// Used by tool actions.
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

// Used by persistence flow.
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

// Used by persistence flow.
function saveButtonOrder() {
  try {
    localStorage.setItem('geometryButtonOrder', JSON.stringify(buttonOrder));
  } catch (e) {
  }
}

// Used by persistence flow.
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

// Used by palette UI flow.
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

// Used by UI state helpers.
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

// Used by persistence flow.
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

// Used by UI state helpers.
function getTimestampString() {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

// Used by persistence flow.
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

// Used by persistence flow.
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

// Used by point tools.
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

// Used by point tools.
function updatePointStyleConfigButtons() {
  if (!pointStyleToggleBtn) return;
  const hollowActive = defaultPointFillMode === 'hollow';
  pointStyleToggleBtn.classList.toggle('active', hollowActive);
  pointStyleToggleBtn.setAttribute('aria-pressed', hollowActive ? 'true' : 'false');
  pointStyleToggleBtn.innerHTML = hollowActive ? POINT_STYLE_ICON_HOLLOW : POINT_STYLE_ICON_FILLED;
}

// Used by UI initialization.
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

// Used by label UI flow.
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

// Used by main UI flow.
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

// Used by UI initialization.
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
    try { handleToolClick(tb.mode as Mode); } catch {}
  }, true);
  copyStyleBtn = document.getElementById('copyStyleBtn') as HTMLButtonElement | null;
  multiMoveBtn = document.getElementById('multiMoveBtn') as HTMLButtonElement | null;
  multiHideBtn = document.getElementById('multiHideBtn') as HTMLButtonElement | null;
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
      const editingInk = selectedInkStrokeId !== null || mode === 'handwriting';
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
    multiHideBtn: 'multiHide',
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
  customColorRow = document.getElementById('customColorRow');
  customColorInput = document.getElementById('customColorInput') as HTMLInputElement | null;
  customColorAlphaInput = document.getElementById('customColorAlpha') as HTMLInputElement | null;
  customColorAlphaValue = document.getElementById('customColorAlphaValue') as HTMLElement | null;
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
    polygonLockToggleBtn = document.getElementById('polygonLockToggleBtn') as HTMLButtonElement | null;
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
    if (squareStartId !== null) {
       // If we want to be nice, we could remove the points, but Undo is safer.
       // Reset state
       squareStartId = null;
       selectedPointId = null;
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
    wheel: handleCanvasWheel,
    pointermove: (ev: PointerEvent) => {
      // Prioritize polygon dragging when a whole polygon is selected
      try {
        const buttons = (ev as any).__CONSTRIVIA_BUTTONS_OVERRIDE ?? ((typeof window !== 'undefined' && (window as any).__CONSTRIVIA_POINTER_DOWN) ? 1 : ev.buttons);
        const effectivePolygonId = selectedPolygonId !== null ? selectedPolygonId : (selectedLineId !== null ? polygonForLine(selectedLineId) : null);
        const primaryDown = (buttons & 1) === 1 || (activeDragPointerId !== null && ev.pointerId === activeDragPointerId);
        if (primaryDown && draggingSelection && effectivePolygonId !== null && selectedSegments.size === 0) {
          const pIdx = effectivePolygonId;
          const verts = polygonVertices(pIdx);
          if (verts.length) {
            if (!selectionDragOriginals) {
              selectionDragOriginals = new Map<string, { x: number; y: number }>();
              verts.forEach((pi) => selectionDragOriginals!.set(pi, { x: getPointById(pi)?.x ?? 0, y: getPointById(pi)?.y ?? 0 }));
            }
            const { x, y } = toPoint(ev);
            const dx = x - dragStart.x;
            const dy = y - dragStart.y;
            const engine = toEngineState(runtime);
            movePointsByDeltaAndRecompute(engine, selectionDragOriginals, { x: dx, y: dy });
            applyEngineState(runtime, engine, { points: true, lines: true, circles: true });
            movedDuringDrag = true;
            draw();
            return;
          }
        }
      } catch (e) {}
      if (mode === 'multiselect' && pendingMultiToggle && !draggingMultiSelection && !resizingMulti && !rotatingMulti) {
        const { x, y } = toPoint(ev);
        const dx = x - pendingMultiToggle.start.x;
        const dy = y - pendingMultiToggle.start.y;
        if (Math.hypot(dx, dy) >= screenUnits(4) && multiMoveActive && hasMultiSelection()) {
          dragStart = { ...pendingMultiToggle.start };
          draggingMultiSelection = true;
          activeDragPointerId = ev.pointerId;
          movedDuringDrag = false;
          multiDragOriginals = null;
          pendingMultiToggle = null;
        }
      }
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
        applyTransform: (opts: {
          center: { x: number; y: number };
          vectors: Array<{ idx: string; vx: number; vy: number }>;
          scale?: number;
          rotation?: number;
          dependentLines?: Map<string, number[]>;
        }) => {
          const engine = toEngineState(runtime);
          const vectors = opts.vectors.map((v) => ({ id: v.idx, vx: v.vx, vy: v.vy }));
          transformPointsAndRecompute(engine, {
            center: opts.center,
            vectors,
            scale: opts.scale,
            rotation: opts.rotation,
            dependentLineFractions: opts.dependentLines
          });
          applyEngineState(runtime, engine, { points: true, lines: true, circles: true });
        },
        applyPointMove: (pointId: string, target: { x: number; y: number }) => {
          if (!pointId) return;
          const engine = toEngineState(runtime);
          movePointAndRecompute(engine, pointId, target);
          applyEngineState(runtime, engine, { points: true, lines: true, circles: true });
        },
        getPoint: (pointId: string) => getPointById(pointId),
        setPoint: (pointId: string, p: any) => {
          runtime.points[String(pointId)] = p;
        },
        constrainToLineParent,
        constrainToCircles,
        updateMidpointsForPoint: (pointId: string) => {
          updateMidpointsForPoint(pointId);
        },
        updateCirclesForPoint: (pointId: string) => {
          updateCirclesForPoint(pointId);
        },
        findLinesContainingPoint,
        updateIntersectionsForLine,
        updateParallelLinesForLine,
        updatePerpendicularLinesForLine,
        applyFractionsToLine,
        markMovedDuringDrag: () => {
          movedDuringDrag = true;
        },
        getResizingCircle: () => resizingCircle,
        getRotatingCircle: () => rotatingCircle,
        getCircle: (circleId: string) => getCircleById(circleId),
        updateIntersectionsForCircle,
        getResizingLine: () => resizingLine,
        getRotatingLine: () => rotatingLine,
        enforceIntersections,
        applyLineFractions,
        lineExtent,
        setActiveAxisSnaps: (m: Map<string, { axis: 'horizontal' | 'vertical'; strength: number }>) => { activeAxisSnaps.clear(); m.forEach((v, k) => activeAxisSnaps.set(k, v)); },
        setActiveAxisSnap: (v: { lineId: string; axis: 'horizontal' | 'vertical'; strength: number } | null) => { activeAxisSnap = v; },
        axisSnapWeight,
        LINE_SNAP_SIN_ANGLE,
        LINE_SNAP_INDICATOR_THRESHOLD
      })) return;

      try {
        const buttons = (ev as any).__CONSTRIVIA_BUTTONS_OVERRIDE ?? ((typeof window !== 'undefined' && (window as any).__CONSTRIVIA_POINTER_DOWN) ? 1 : ev.buttons);
        const primaryDown = (buttons & 1) === 1 || (activeDragPointerId !== null && ev.pointerId === activeDragPointerId);
        if (primaryDown && draggingLabel) {
          const { x, y } = toPoint(ev);
          const dxWorld = x - draggingLabel.start.x;
          const dyWorld = y - draggingLabel.start.y;
          const deltaScreen = worldOffsetToScreen({ x: dxWorld, y: dyWorld });
          switch (draggingLabel.kind) {
            case 'point': {
              const p = getPointById(draggingLabel.id);
              if (p?.label) {
                const nextOffset = {
                  x: draggingLabel.initialOffset.x + deltaScreen.x,
                  y: draggingLabel.initialOffset.y + deltaScreen.y
                };
                p.label = { ...p.label, offset: nextOffset };
                movedDuringDrag = true;
                draw();
                return;
              }
              break;
            }
            case 'line': {
              const line = getLineById(draggingLabel.id);
              if (line?.label) {
                const nextOffset = {
                  x: draggingLabel.initialOffset.x + deltaScreen.x,
                  y: draggingLabel.initialOffset.y + deltaScreen.y
                };
                line.label = { ...line.label, offset: nextOffset };
                movedDuringDrag = true;
                draw();
                return;
              }
              break;
            }
            case 'angle': {
              const ang = getAngleById(draggingLabel.id);
              if (ang?.label) {
                const nextOffset = {
                  x: draggingLabel.initialOffset.x + deltaScreen.x,
                  y: draggingLabel.initialOffset.y + deltaScreen.y
                };
                ang.label = { ...ang.label, offset: nextOffset };
                movedDuringDrag = true;
                draw();
                return;
              }
              break;
            }
            case 'free': {
              const label = getLabelById(draggingLabel.id);
              if (label) {
                runtime.labels[String(label.id)] = {
                  ...label,
                  pos: {
                    x: draggingLabel.initialOffset.x + dxWorld,
                    y: draggingLabel.initialOffset.y + dyWorld
                  }
                };
                movedDuringDrag = true;
                draw();
                return;
              }
              break;
            }
          }
        }
      } catch (e) {
        // swallow
      }

      try {
        const buttons = (ev as any).__CONSTRIVIA_BUTTONS_OVERRIDE ?? ((typeof window !== 'undefined' && (window as any).__CONSTRIVIA_POINTER_DOWN) ? 1 : ev.buttons);
        const primaryDown = (buttons & 1) === 1 || (activeDragPointerId !== null && ev.pointerId === activeDragPointerId);
        if (primaryDown && mode === 'move' && isPanning && !draggingSelection && !draggingMultiSelection) {
          const dx = ev.clientX - panStart.x;
          const dy = ev.clientY - panStart.y;
          if (pendingPanCandidate && Math.hypot(dx, dy) < 3) {
            return;
          }
          pendingPanCandidate = null;
          panOffset = {
            x: panStartOffset.x + dx,
            y: panStartOffset.y + dy
          };
          movedDuringPan = true;
          draw();
          return;
        }
      } catch (e) {
        // swallow
      }

      // If no specialized handler consumed the event, handle simple selection dragging
      try {
        const buttons = (ev as any).__CONSTRIVIA_BUTTONS_OVERRIDE ?? ((typeof window !== 'undefined' && (window as any).__CONSTRIVIA_POINTER_DOWN) ? 1 : ev.buttons);
        const primaryDown = (buttons & 1) === 1 || (activeDragPointerId !== null && ev.pointerId === activeDragPointerId);
        if (primaryDown && draggingMultiSelection && multiMoveActive && hasMultiSelection() && !resizingMulti && !rotatingMulti) {
          const { x, y } = toPoint(ev);
          if (!multiDragOriginals) {
            const points = new Map<string, { x: number; y: number }>();
            const labels = new Map<string, { x: number; y: number }>();
            const ink = new Map<string, InkPoint[]>();

            const addPoint = (pointId: ObjectId | null | undefined) => {
              if (!pointId) return;
              const p = getPointById(pointId);
              if (!p) return;
              if (!points.has(pointId)) points.set(pointId, { x: p.x, y: p.y });
            };

            multiSelectedPoints.forEach((id) => addPoint(id));
            multiSelectedLines.forEach((lineId) => {
              const line = getLineById(lineId);
              if (!line) return;
              line.points.forEach((pid) => addPoint(pid));
            });
            multiSelectedCircles.forEach((circleId) => {
              const circle = getCircleById(circleId);
              if (!circle) return;
              addPoint(circle.center);
              if (circle.radius_point !== undefined) addPoint(circle.radius_point);
              circle.points.forEach((pid) => addPoint(pid));
              circle.defining_points?.forEach((pid) => addPoint(pid));
            });
            multiSelectedAngles.forEach((angleId) => {
              const ang = getAngleById(angleId);
              if (!ang) return;
              addPoint(ang.vertex);
              if (ang.point1) addPoint(ang.point1);
              if (ang.point2) addPoint(ang.point2);
            });
            multiSelectedPolygons.forEach((polyId) => {
              const verts = polygonVertices(polyId);
              verts.forEach((pid) => addPoint(pid));
            });
            multiSelectedLabels.forEach((labelId) => {
              const label = getLabelById(labelId);
              if (!label) return;
              labels.set(labelId, { x: label.pos.x, y: label.pos.y });
            });
            multiSelectedInkStrokes.forEach((strokeId) => {
              const stroke = getInkStrokeById(strokeId);
              if (!stroke) return;
              ink.set(strokeId, stroke.points.map((pt) => ({ ...pt })));
            });

            multiDragOriginals = { points, labels, ink };
          }

          const dx = x - dragStart.x;
          const dy = y - dragStart.y;
          const engine = toEngineState(runtime);
          movePointsByDeltaAndRecompute(engine, multiDragOriginals.points, { x: dx, y: dy });
          applyEngineState(runtime, engine, { points: true, lines: true, circles: true });

          try {
            multiDragOriginals.labels.forEach((pos, labelId) => {
              const label = getLabelById(labelId);
              if (!label) return;
              runtime.labels[String(label.id)] = { ...label, pos: { x: pos.x + dx, y: pos.y + dy } };
            });

            multiDragOriginals.ink.forEach((points, strokeId) => {
              const stroke = getInkStrokeById(strokeId);
              if (!stroke) return;
              const movedPoints = points.map((pt) => ({ ...pt, x: pt.x + dx, y: pt.y + dy }));
              runtime.inkStrokes[String(stroke.id)] = { ...stroke, points: movedPoints };
            });

          } catch (e) {}

          movedDuringDrag = true;
          draw();
          return;
        }
        if (primaryDown && draggingSelection && selectedPointId !== null) {
          const { x, y } = toPoint(ev);
          const cur = getPointById(selectedPointId);
          if (cur) {
            try {
              const engine = toEngineState(runtime);
              movePointAndRecompute(engine, selectedPointId, { x, y });
              applyEngineState(runtime, engine, { points: true, lines: true, circles: true });
            } catch (e) {}
            movedDuringDrag = true;
            draw();
            return;
          }
        }
      } catch (e) {
        // swallow
      }

      // Fallback: drag entire selected line
      try {
        const buttons = (ev as any).__CONSTRIVIA_BUTTONS_OVERRIDE ?? ((typeof window !== 'undefined' && (window as any).__CONSTRIVIA_POINTER_DOWN) ? 1 : ev.buttons);
        const primaryDown = (buttons & 1) === 1 || (activeDragPointerId !== null && ev.pointerId === activeDragPointerId);
        if (primaryDown && draggingSelection) {
          const { x, y } = toPoint(ev);
          // Ink stroke drag
          if (selectedInkStrokeId !== null) {
            const stroke = getInkStrokeById(selectedInkStrokeId);
            if (stroke) {
              if (!inkDragOriginals) {
                inkDragOriginals = stroke.points.map((pt) => ({ ...pt }));
              }
              const dx = x - dragStart.x;
              const dy = y - dragStart.y;
              const movedPoints = inkDragOriginals.map((pt) => ({ ...pt, x: pt.x + dx, y: pt.y + dy }));
              runtime.inkStrokes[String(stroke.id)] = { ...stroke, points: movedPoints };
              movedDuringDrag = true;
              draw();
              return;
            }
          }
          // Line drag
          if (selectedLineId !== null) {
            const line = getLineById(selectedLineId);
            if (line) {
              if (!selectionDragOriginals) {
                selectionDragOriginals = new Map<string, { x: number; y: number }>();
                line.points.forEach((pi) => selectionDragOriginals!.set(pi, { x: getPointById(pi)?.x ?? 0, y: getPointById(pi)?.y ?? 0 }));
              }
              const dx = x - dragStart.x;
              const dy = y - dragStart.y;
              const engine = toEngineState(runtime);
              movePointsByDeltaAndRecompute(engine, selectionDragOriginals, { x: dx, y: dy });
              applyEngineState(runtime, engine, { points: true, lines: true, circles: true });
              movedDuringDrag = true;
              draw();
              return;
            }
          }
          // Circle drag
          if (selectedCircleId !== null) {
            const ci = selectedCircleId;
            const c = getCircleById(ci);
            if (c && isCircleThroughPoints(c)) {
              return;
            }
            if (c) {
              if (!selectionDragOriginals) {
                selectionDragOriginals = new Map<string, { x: number; y: number }>();
                // include center, radius_point and perimeter points
                selectionDragOriginals.set(c.center, { x: getPointById(c.center)?.x ?? 0, y: getPointById(c.center)?.y ?? 0 });
                if (c.radius_point !== undefined) selectionDragOriginals.set(c.radius_point, { x: getPointById(c.radius_point)?.x ?? 0, y: getPointById(c.radius_point)?.y ?? 0 });
                c.points.forEach((pi) => selectionDragOriginals!.set(pi, { x: getPointById(pi)?.x ?? 0, y: getPointById(pi)?.y ?? 0 }));
              }
              const dx = x - dragStart.x;
              const dy = y - dragStart.y;
              const engine = toEngineState(runtime);
              movePointsByDeltaAndRecompute(
                engine,
                selectionDragOriginals,
                { x: dx, y: dy },
                { constrainToLine: false, constrainToCircle: false }
              );
              applyEngineState(runtime, engine, { points: true, lines: true, circles: true });
              movedDuringDrag = true;
              draw();
              return;
            }
          }
          // Polygon drag
          if (selectedPolygonId !== null) {
            const pIdx = selectedPolygonId;
            const verts = polygonVertices(pIdx);
            if (verts.length) {
              if (!selectionDragOriginals) {
                selectionDragOriginals = new Map<string, { x: number; y: number }>();
                verts.forEach((pi) => selectionDragOriginals!.set(pi, { x: getPointById(pi)?.x ?? 0, y: getPointById(pi)?.y ?? 0 }));
              }
              const dx = x - dragStart.x;
              const dy = y - dragStart.y;
              const engine = toEngineState(runtime);
              movePointsByDeltaAndRecompute(engine, selectionDragOriginals, { x: dx, y: dy });
              applyEngineState(runtime, engine, { points: true, lines: true, circles: true });
              movedDuringDrag = true;
              draw();
              return;
            }
          }
        }
      } catch (e) {
        // swallow fallback errors
      }
    }
  });
  // Wire pointer release handler into canvas events using handlers from canvas/handlers
  canvasEvents.setPointerRelease((ev: PointerEvent) => {
    if (mode === 'multiselect' && pendingMultiToggle && !draggingMultiSelection && !resizingMulti && !rotatingMulti) {
      removeFromMultiSelection(pendingMultiToggle);
      pendingMultiToggle = null;
      updateSelectionButtons();
      draw();
    }
    handlersHandlePointerRelease(ev, {
      removeTouchPoint,
      activeTouchesSize: () => activeTouches.size,
      pinchState,
      startPinchFromTouches,
      canvasReleasePointerCapture: (id: number) => { try { canvas?.releasePointerCapture(id); } catch {} },
      getMode: () => mode,
      multiselectBoxStart: () => multiselectBoxStart,
      multiselectBoxEnd: () => multiselectBoxEnd,
      clearMultiselectBox: () => { multiselectBoxStart = null; multiselectBoxEnd = null; },
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
      setStyleColorAlpha(1);
      if (customColorInput) customColorInput.value = c;
      rememberColor(c);
      applyStyleFromInputs();
      updateStyleMenuValues();
    });
  });
    fillToggleBtn?.addEventListener('click', () => {
      if (selectedLabel !== null) return;
      if (!styleColorInput) return;
    const color = colorWithAlpha(styleColorInput.value, styleColorAlpha);
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

    if (selectedCircleId !== null) {
      const circle = getCircleById(selectedCircleId);
      if (circle) {
        const n = applyNextTo(circle);
        runtime.circles[String(circle.id)] = { ...circle, fill: n.fill, fillOpacity: n.fillOpacity } as Circle;
        changed = true;
      }
    } else {
      const lineIdForPoly = selectedLineId;
      const polyId =
        selectedPolygonId !== null
          ? selectedPolygonId
          : lineIdForPoly !== null
            ? polygonForLine(lineIdForPoly)
            : null;
      if (polyId !== null) {
        const poly = polygonGet(polyId);
        if (poly) {
          const n = applyNextTo(poly);
          polygonSet(polyId, (old) => ({ ...old!, fill: n.fill, fillOpacity: n.fillOpacity } as Polygon));
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
    polygonLockToggleBtn?.addEventListener('click', () => {
      if (selectedLabel !== null) return;
      const polyId =
        selectedPolygonId !== null
          ? selectedPolygonId
          : selectedLineId !== null
            ? polygonForLine(selectedLineId)
            : null;
      if (!polyId) return;
      const poly = polygonGet(polyId);
      if (!poly) return;
      if (!poly.locked) {
        let base: [ObjectId, ObjectId] | undefined;
        if (selectedSegments.size > 0) {
          const segEntry =
            Array.from(selectedSegments)
              .map(parseSegmentKey)
              .find((k) => k && k.part === 'segment' && k.seg !== undefined) ?? null;
          if (segEntry) {
            const line = getLineById(segEntry.lineId);
            if (line && line.points[segEntry.seg!] !== undefined && line.points[segEntry.seg! + 1] !== undefined) {
              base = [line.points[segEntry.seg!], line.points[segEntry.seg! + 1]];
            }
          }
        }
        if (!base && selectedLineId !== null) {
          const line = getLineById(selectedLineId);
          const verts = polygonVerticesOrdered(polyId);
          if (line && verts.length >= 2) {
            for (let i = 0; i < verts.length; i++) {
              const aId = verts[i];
              const bId = verts[(i + 1) % verts.length];
              for (let j = 0; j < line.points.length - 1; j++) {
                const p = line.points[j];
                const n = line.points[j + 1];
                if (
                  (String(p) === String(aId) && String(n) === String(bId)) ||
                  (String(p) === String(bId) && String(n) === String(aId))
                ) {
                  base = [aId, bId];
                  break;
                }
              }
              if (base) break;
            }
          }
        }
        if (base) {
          const ordered = polygonVerticesOrdered(polyId);
          for (let i = 0; i < ordered.length; i++) {
            const aId = ordered[i];
            const bId = ordered[(i + 1) % ordered.length];
            if (String(aId) === String(base[0]) && String(bId) === String(base[1])) break;
            if (String(aId) === String(base[1]) && String(bId) === String(base[0])) {
              base = [bId, aId];
              break;
            }
          }
        }
        const lockRef = buildPolygonLockRef(runtime, poly, base);
        if (!lockRef) return;
        polygonSet(polyId, (old) => ({ ...old!, locked: true, lockRef } as Polygon));
      } else {
        polygonSet(polyId, (old) => ({ ...old!, locked: false, lockRef: undefined } as Polygon));
      }
      draw();
      pushHistory();
      updateStyleMenuValues();
    });
  pointHollowToggleBtn?.addEventListener('click', () => {
    toggleSelectedPointsHollow();
  });
  customColorBtn?.addEventListener('click', () => {
    if (!customColorRow) {
      styleColorInput?.click();
      return;
    }
    customColorRowOpen = !customColorRowOpen;
    customColorRow.style.display = customColorRowOpen ? 'flex' : 'none';
    if (customColorRowOpen) {
      syncCustomColorInputs();
      customColorInput?.focus();
    }
  });
  customColorInput?.addEventListener('input', () => {
    if (!customColorInput || !styleColorInput) return;
    styleColorInput.value = customColorInput.value;
    rememberColor(styleColorInput.value);
    applyStyleFromInputs();
    updateStyleMenuValues();
  });
  customColorAlphaInput?.addEventListener('input', () => {
    if (!customColorAlphaInput) return;
    const v = Number(customColorAlphaInput.value);
    setStyleColorAlpha(Number.isFinite(v) ? v : 1);
    applyStyleFromInputs();
    updateStyleMenuValues();
  });
  arcCountButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      arcCountButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const count = Number(btn.dataset.count) || 1;
      rightAngleBtn?.classList.remove('active');
      if (selectedAngleId !== null) {
        const ang = getAngleById(selectedAngleId);
        if (ang) {
          runtime.angles[String(ang.id)] = { ...ang, style: { ...ang.style, arcCount: count, right: false } };
        }
        draw();
        pushHistory();
      }
    });
  });
  rightAngleBtn?.addEventListener('click', () => {
    if (!rightAngleBtn) return;
    const active = rightAngleBtn.classList.toggle('active');
    if (active) arcCountButtons.forEach((b) => b.classList.remove('active'));
    if (selectedAngleId !== null) {
      const ang = getAngleById(selectedAngleId);
      if (ang) {
        const arcCount = active ? 1 : ang.style.arcCount ?? 1;
        runtime.angles[String(ang.id)] = { ...ang, style: { ...ang.style, right: active, arcCount } };
      }
      draw();
      pushHistory();
    }
  });
  exteriorAngleBtn?.addEventListener('click', () => {
    if (!exteriorAngleBtn) return;
    const active = exteriorAngleBtn.classList.toggle('active');
    exteriorAngleBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (selectedAngleId !== null) {
      const ang = getAngleById(selectedAngleId);
      if (ang) {
        runtime.angles[String(ang.id)] = { ...ang, style: { ...ang.style, exterior: active } };
      }
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

  const hideMultiSelection = () => {
    let changed = false;
    multiSelectedPoints.forEach((pointId) => {
      const p = getPointById(pointId);
      if (p && !p.style?.hidden) {
        runtime.points[String(pointId)] = { ...p, style: { ...p.style, hidden: true } };
        changed = true;
      }
    });

    multiSelectedLines.forEach((lineId) => {
      const l = getLineById(lineId);
      if (l && !l.hidden) {
        runtime.lines[String(lineId)].hidden = true;
        changed = true;
      }
    });
    
    multiSelectedCircles.forEach((circleId) => {
      const circle = getCircleById(circleId);
      if (circle && !circle.hidden) {
        runtime.circles[String(circleId)] = { ...circle, hidden: true };
        changed = true;
      }
    });
    
    multiSelectedAngles.forEach((angleId) => {
      const angle = getAngleById(angleId);
      if (angle && !angle.hidden) {
        runtime.angles[String(angleId)] = { ...angle, hidden: true };
        changed = true;
      }
    });
    
    multiSelectedPolygons.forEach((polyId) => {
      const poly = getPolygonById(polyId);
      if (poly && !poly.hidden) {
        runtime.polygons[String(polyId)] = { ...poly, hidden: true };
        changed = true;
      }
      const pls = polygonLines(polyId);
      pls.forEach((lineId) => {
        const line = getLineById(lineId);
        if (line && !line.hidden) {
          runtime.lines[String(lineId)].hidden = true;
          changed = true;
        }
      });
    });
    
    multiSelectedInkStrokes.forEach((strokeId) => {
      const stroke = getInkStrokeById(strokeId);
      if (stroke && !stroke.hidden) {
        runtime.inkStrokes[String(strokeId)] = { ...stroke, hidden: true };
        changed = true;
      }
    });
    
    multiSelectedLabels.forEach((labelId) => {
      const label = getLabelById(labelId);
      if (label && !label.hidden) {
        runtime.labels[String(labelId)] = { ...label, hidden: true };
        changed = true;
      }
    });

    if (changed) {
      draw();
      updateSelectionButtons();
      pushHistory();
    }
  };


  hideBtn?.addEventListener('click', () => {
    // Handle multiselection hide
    if (hasMultiSelection()) {
      multiSelectedPoints.forEach((pointId) => {
        const p = getPointById(pointId);
        if (p) {
          runtime.points[String(pointId)] = { ...p, style: { ...p.style, hidden: !p.style.hidden } };
        }
      });

      multiSelectedLines.forEach((lineId) => {
        const l = getLineById(lineId);
        if (l) {
          runtime.lines[String(lineId)].hidden = !runtime.lines[String(lineId)].hidden;
        }
      });
      
      multiSelectedCircles.forEach((circleId) => {
        const circle = getCircleById(circleId);
        if (circle) {
          runtime.circles[String(circleId)].hidden = !runtime.circles[String(circleId)].hidden;
        }
      });
      
      multiSelectedAngles.forEach((angleId) => {
        const angle = getAngleById(angleId);
        if (angle) {
          runtime.angles[String(angleId)] = { ...angle, hidden: !angle.hidden };
        }
      });
      
      multiSelectedPolygons.forEach((polyId) => {
        const poly = getPolygonById(polyId);
        if (poly) {
          runtime.polygons[String(polyId)].hidden = !runtime.polygons[String(polyId)].hidden;
        }
        const pls = polygonLines(polyId);
        pls.forEach((lineId) => {
          const line = getLineById(lineId);
          if (line) runtime.lines[String(lineId)].hidden = !runtime.lines[String(lineId)].hidden;
        });
      });
      
      multiSelectedInkStrokes.forEach((strokeId) => {
        const stroke = getInkStrokeById(strokeId);
        if (stroke) {
          runtime.inkStrokes[String(strokeId)] = { ...stroke, hidden: !stroke.hidden };
        }
      });
      
      draw();
      updateSelectionButtons();
      pushHistory();
      return;
    }
    
    if (selectedInkStrokeId !== null) {
      const stroke = getInkStrokeById(selectedInkStrokeId);
      if (stroke) {
        runtime.inkStrokes[String(selectedInkStrokeId)] = { ...stroke, hidden: !stroke.hidden };
      }
    } else if (selectedLabel) {
      return;
    } else if (selectedSegments.size > 0) {
      // Toggle hidden on selected segments/rays across all lines.
      const touched = new Set<string>();
      selectedSegments.forEach((key) => {
        const parsed = parseSegmentKey(key);
        if (!parsed) return;
        const lineId = String(parsed.lineId);
        const line = getLineById(lineId);
        if (!line) return;
        if (!touched.has(lineId)) {
          ensureSegmentStylesForLine(lineId);
          touched.add(lineId);
        }
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
    } else if (selectedPolygonId !== null) {
      const edgeKeys = polygonEdgeSegmentKeys(selectedPolygonId);
      if (edgeKeys.size) {
        const touched = new Set<string>();
        edgeKeys.forEach((key) => {
          const parsed = parseSegmentKey(key);
          if (!parsed) return;
          const lineId = String(parsed.lineId);
          const line = getLineById(lineId);
          if (!line) return;
          if (!touched.has(lineId)) {
            ensureSegmentStylesForLine(lineId);
            touched.add(lineId);
          }
          if (parsed.part === 'segment' && typeof parsed.seg === 'number') {
            if (!line.segmentStyles) line.segmentStyles = [];
            const prev = line.segmentStyles[parsed.seg] ?? line.style;
            line.segmentStyles[parsed.seg] = { ...prev, hidden: !prev.hidden };
          }
        });
      } else {
        const pls = polygonLines(selectedPolygonId);
        pls.forEach((lineId) => {
          const line = getLineById(lineId);
          if (line) runtime.lines[String(lineId)].hidden = !runtime.lines[String(lineId)].hidden;
        });
      }
    } else if (selectedLineId !== null) {
      const line = getLineById(selectedLineId);
      if (!line) return;
      line.hidden = !line.hidden;
    } else if (selectedCircleId !== null) {
      const circleId = selectedCircleId;
      const circle = getCircleById(circleId);
      if (!circle) return;
      if (selectionEdges) {
        if (selectedArcSegments.size > 0) {
          // Toggle hidden flag on selected arcStyles
          const arcs = circleArcs(circleId);
          ensureArcStyles(circleId, arcs.length);
          selectedArcSegments.forEach((key) => {
            const parsed = parseArcKey(key);
            if (!parsed || parsed.circleId !== circleId || parsed.start === undefined || parsed.end === undefined) return;
            if (!circle.arcStyles) circle.arcStyles = {} as any;
            const mapKey = arcKey(circleId, parsed.start, parsed.end);
            const prev = (circle.arcStyles as any)[mapKey] ?? circle.style;
            (circle.arcStyles as any)[mapKey] = { ...prev, hidden: !prev.hidden };
          });
        } else {
          circle.hidden = !circle.hidden;
        }
      }
      if (selectionVertices) {
        if (circle) {
          const pointsToToggle = new Set<string>();
          if (circle.center) pointsToToggle.add(String(circle.center));
          if (circle.radius_point) pointsToToggle.add(String(circle.radius_point));
          circle.defining_parents?.forEach((pid: string) => pointsToToggle.add(String(pid)));

          pointsToToggle.forEach((pid) => {
            const p = getPointById(pid);
            if (p) runtime.points[String(pid)] = { ...p, style: { ...p.style, hidden: !p.style.hidden } };
          });
        }
      }
    } else if (selectedAngleId !== null) {
      const angle = getAngleById(selectedAngleId);
      if (angle) runtime.angles[String(angle.id)] = { ...angle, hidden: !angle.hidden };
    } else if (selectedPointId !== null) {
      const p = getPointById(selectedPointId);
      if (p) runtime.points[String(selectedPointId)] = { ...p, style: { ...p.style, hidden: !p.style.hidden } };
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

  multiHideBtn?.addEventListener('click', () => {
    if (!hasMultiSelection()) return;
    hideMultiSelection();
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

    // Clone selection by reusing the copy/paste flow (id-based).
    copyMultiSelectionToClipboard();
    pasteCopiedObjects();
    return;
  });

  // Paste button in top menu
  // pasteBtn removed; paste via `multiCloneBtn` in multiselect or via top-level clone button when copied
  
  deleteBtn?.addEventListener('click', () => {
    let changed = false;
    
    // Handle multiselection delete
    if (hasMultiSelection()) {
      multiSelectedInkStrokes.forEach((strokeId) => {
        const stroke = getInkStrokeById(strokeId);
        if (!stroke) return;
        runtime.inkStrokes[String(stroke.id)] = { ...stroke, hidden: true };
        changed = true;
      });
      
      const pointsToRemove = Array.from(multiSelectedPoints);
      if (pointsToRemove.length > 0) {
        removePointsAndRelated(pointsToRemove, true);
        changed = true;
      }
      
      const linesToRemove = Array.from(multiSelectedLines).map((id) => String(id));
      linesToRemove.forEach((lineId) => {
        const line = getLineById(lineId);
        if (line?.label) reclaimLabel(line.label);
        delete runtime.lines[String(lineId)];
        changed = true;
      });
      if (linesToRemove.length > 0) {
        cleanupAnglesAfterLineRemoval();
        cleanupDependentPoints();
      }
      
      const circlesToRemove = Array.from(multiSelectedCircles).map((id) => String(id));
      const allCirclePointsToRemove = new Set<string>();
      circlesToRemove.forEach((circleId) => {
        const circle = getCircleById(circleId);
        if (circle) {
          if (circle.label) reclaimLabel(circle.label);
          
          // Check center point - only remove if not used as defining point for lines
          const centerUsedInLines = listLines().some((line) => line.defining_points?.includes(circle.center));
          if (!centerUsedInLines) {
            allCirclePointsToRemove.add(String(circle.center));
          }
          
          // Check other points on circle
          const constrainedPoints = [circle.radius_point, ...circle.points];
          constrainedPoints.forEach((pid) => {
            if (pid === undefined || pid === null) return;
            if (circleHasDefiningPoint(circle, pid)) return;
            const point = getPointById(pid);
            if (!point) return;
            const hasCircleParent = (point.parent_refs || []).some((pr) => pr.kind === 'circle' && pr.id === circleId);
            
            // Only remove if not used as defining point for lines
            const usedInLines = listLines().some((line) => line.defining_points?.includes(pid));
            if (!usedInLines && (!isCircleThroughPoints(circle) || hasCircleParent)) {
              allCirclePointsToRemove.add(String(pid));
            }
          });
          
          // Remove circle from parent_refs of points that are not being deleted
          listPoints().forEach((pt) => {
            if (allCirclePointsToRemove.has(String(pt.id))) return;
            const before = pt.parent_refs || [];
            const afterRefs = before.filter((pr) => !(pr.kind === 'circle' && pr.id === circleId));
            if (afterRefs.length !== before.length) {
              const newKind = resolveConstructionKind(afterRefs);
              updatePointRef(pt.id, {
                parent_refs: afterRefs,
                defining_parents: afterRefs.map((p) => p.id),
                construction_kind: newKind
              });
            }
          });
          
          delete runtime.circles[String(circleId)];
          changed = true;
        }
      });
      
      // Remove collected circle points after all circles are processed
      if (allCirclePointsToRemove.size > 0) {
        removePointsAndRelated(Array.from(allCirclePointsToRemove), true);
      }
      
      const anglesToRemove = Array.from(multiSelectedAngles).map((id) => String(id));
      anglesToRemove.forEach((angleId) => {
        const angle = getAngleById(angleId);
        if (angle?.label) reclaimLabel(angle.label);
        delete runtime.angles[String(angleId)];
        changed = true;
      });
      
      const polygonsToRemove = Array.from(multiSelectedPolygons)
        .map((pid) => String(pid))
        .filter((pid) => !!polygonGet(pid));
      polygonsToRemove.forEach((pid) => {
        removePolygonWithEdges(pid);
        changed = true;
      });
      
      // Remove free labels selected via multiselect
      const labelsToRemove = Array.from(multiSelectedLabels);
      if (labelsToRemove.length > 0) {
        labelsToRemove.forEach((labelId) => {
          delete runtime.labels[String(labelId)];
          changed = true;
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
    
    if (selectedInkStrokeId !== null) {
      delete runtime.inkStrokes[String(selectedInkStrokeId)];
      selectedInkStrokeId = null;
      changed = true;
    } else if (selectedLabel) {
      switch (selectedLabel.kind) {
        case 'point': {
          const point = getPointById(selectedLabel.id);
          if (point?.label) {
            reclaimLabel(point.label);
            runtime.points[String(point.id)] = { ...point, label: undefined };
            changed = true;
          }
          break;
        }
        case 'line': {
          const line = getLineById(selectedLabel.id);
          if (line?.label) {
            reclaimLabel(line.label);
            runtime.lines[String(line.id)] = { ...line, label: undefined };
            changed = true;
          }
          break;
        }
        case 'angle': {
          const angle = getAngleById(selectedLabel.id);
          if (angle?.label) {
            reclaimLabel(angle.label);
            runtime.angles[String(angle.id)] = { ...angle, label: undefined };
            changed = true;
          }
          break;
        }
        case 'free':
          delete runtime.labels[String(selectedLabel.id)];
          changed = true;
          break;
      }
      selectedLabel = null;
      if (labelTextInput) labelTextInput.value = '';
    } else if (selectedPolygonId !== null) {
      removePolygonWithEdges(selectedPolygonId);
      selectedPolygonId = null;
      selectedLineId = null;
      selectedPointId = null;
      selectedCircleId = null;
      selectedArcSegments.clear();
      changed = true;
    } else if (selectedLineId !== null) {
      const line = getLineById(selectedLineId);
      if (!line) return;
      const deletedLineId = line.id;
      if (line?.label) reclaimLabel(line.label);
      if (selectionVertices) {
        const pts = Array.from(new Set(line.points));
        removePointsAndRelated(pts, true);
        if (deletedLineId) {
          const removedParallelIds = removeParallelLinesReferencing(deletedLineId);
          const removedPerpendicularIds = removePerpendicularLinesReferencing(deletedLineId);
          const idsToRemove = new Set<string>([deletedLineId, ...removedParallelIds, ...removedPerpendicularIds]);
          listPoints().forEach((pt) => {
            const before = pt.parent_refs || [];
            const afterRefs = before.filter((pr) => !(pr.kind === 'line' && idsToRemove.has(pr.id)));
            if (afterRefs.length !== before.length) {
              const newKind = resolveConstructionKind(afterRefs);
              updatePointRef(pt.id, {
                parent_refs: afterRefs,
                defining_parents: afterRefs.map((p) => p.id),
                construction_kind: newKind
              });
            }
          });
        }
      } else {
        delete runtime.lines[String(deletedLineId)];
        // detach deleted line as parent from points that referenced it
        if (deletedLineId) {
          const removedParallelIds = removeParallelLinesReferencing(deletedLineId);
          const idsToRemove = new Set<string>([deletedLineId, ...removedParallelIds]);

          // Collect intersection points that referenced any of the removed line ids.
          // Those should be deleted rather than converted to on_object.
          const intersectionPointsToRemove: ObjectId[] = [];
          listPoints().forEach((pt) => {
            if (!pt) return;
            if (pt.construction_kind === 'intersection') {
              const hadRemovedParent = (pt.parent_refs || []).some(
                (pr) => pr.kind === 'line' && idsToRemove.has(pr.id)
              );
              if (hadRemovedParent) intersectionPointsToRemove.push(pt.id);
            }
          });

          // Now detach references from remaining points
          listPoints().forEach((pt) => {
            const before = pt.parent_refs || [];
            const afterRefs = before.filter((pr) => !(pr.kind === 'line' && idsToRemove.has(pr.id)));
            if (afterRefs.length !== before.length) {
              const newKind = resolveConstructionKind(afterRefs);
              updatePointRef(pt.id, {
                parent_refs: afterRefs,
                defining_parents: afterRefs.map((p) => p.id),
                construction_kind: newKind
              });
            }
          });

          // Remove intersection points that lost a parent
          if (intersectionPointsToRemove.length) {
            removePointsKeepingOrder(intersectionPointsToRemove, false);
          }

          // Cleanup any remaining dependent points
          cleanupDependentPoints();
        }
      }
      selectedLineId = null;
      selectedPointId = null;
      selectedCircleId = null;
      selectedPolygonId = null;
      changed = true;
    } else if (selectedAngleId !== null) {
      const angle = getAngleById(selectedAngleId);
      if (angle?.label) reclaimLabel(angle.label);
      if (angle) delete runtime.angles[String(angle.id)];
      selectedAngleId = null;
      selectedLineId = null;
      selectedPointId = null;
      selectedCircleId = null;
      selectedPolygonId = null;
      changed = true;
    } else if (selectedCircleId !== null) {
      const circle = getCircleById(selectedCircleId);
      if (circle) {
        if (selectionVertices) {
          const pointsToDelete = new Set<string>();
          if (circle.center) pointsToDelete.add(circle.center);
          if (circle.radius_point) pointsToDelete.add(circle.radius_point);
          circle.defining_parents.forEach((pid) => pointsToDelete.add(pid));
          removePointsAndRelated(Array.from(pointsToDelete), true);
        } else {
          if (circle.label) reclaimLabel(circle.label);
          const circleId = circle.id;
          delete runtime.circles[String(circleId)];
          
          listPoints().forEach((pt) => {
            const before = pt.parent_refs || [];
            const afterRefs = before.filter((pr) => !(pr.kind === 'circle' && pr.id === circleId));
            if (afterRefs.length !== before.length) {
              const newKind = resolveConstructionKind(afterRefs);
              updatePointRef(pt.id, {
                parent_refs: afterRefs,
                defining_parents: afterRefs.map((p) => p.id),
                construction_kind: newKind
              });
            }
          });
        }
      }
      selectedCircleId = null;
      selectedLineId = null;
      selectedPointId = null;
      selectedPolygonId = null;
      changed = true;
    } else if (selectedPointId !== null) {
      // Also remove any coincident/dependent constructed points that lie exactly
      // under the selected point (e.g., multiple intersection points created at once).
      const baseId = selectedPointId;
      const basePt = getPointById(baseId);
      const toRemove = new Set<ObjectId>([baseId]);
      if (basePt) {
        const eps = 1e-6;
        // If this point was created as part of a batch, remove batch-mates only
        // for non-intersection constructions (intersection points are independent).
        if (basePt.created_group && basePt.construction_kind !== 'intersection') {
          listPoints().forEach((pt) => {
            if (!pt.created_group || pt.created_group !== basePt.created_group) return;
            toRemove.add(pt.id);
          });
        }
        listPoints().forEach((pt) => {
          if (pt.id === baseId) return;
          const dist = Math.hypot(pt.x - basePt.x, pt.y - basePt.y);
          if (dist <= eps) {
            // Remove if the point explicitly depends on the base point
            const dependsOnBase = (pt.parent_refs || []).some((pr) => pr.kind === 'point' && pr.id === basePt.id);
            // Or if it's a constructed point (not 'free') and not used elsewhere
            const constructedAndUnused = pt.construction_kind !== 'free' && !pointUsedAnywhere(pt.id);
            if (dependsOnBase || constructedAndUnused) toRemove.add(pt.id);
          }
        });
      }
      removePointsAndRelated(Array.from(toRemove), true);
      selectedPointId = null;
      selectedCircleId = null;
      selectedPolygonId = null;
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
          dispatchAction({
            type: 'ADD',
            kind: 'label',
            payload: {
              text,
              pos: { x: ml.pos.x, y: ml.pos.y },
              color: ml.color ?? THEME.defaultStroke,
              fontSize: ml.fontSize
            } as any
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
            a.innerHTML = GITHUB_ICON;
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
      applyUiIcons(inner);
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
    runtime = makeEmptyRuntime();
    resetLabelState();
    selectedLineId = null;
    selectedPointId = null;
    selectedCircleId = null;
    selectedAngleId = null;
    selectedPolygonId = null;
    selectedInkStrokeId = null;
    selectedLabel = null;
    selectedSegments.clear();
    selectedArcSegments.clear();
    segmentStartId = null;
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
    setStyleColorAlpha(1);
    if (customColorInput) customColorInput.value = styleColorInput.value;
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
    if (selectedInkStrokeId !== null) {
      const s = getInkStrokeById(selectedInkStrokeId);
      if (s) {
        runtime.inkStrokes[String(selectedInkStrokeId)] = { ...s, opacity: highlighterActive ? highlighterAlpha : s.opacity };
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
        {
          const point = getPointById(selectedLabel.id);
          if (point?.label) {
            runtime.points[String(point.id)] = { ...point, label: { ...point.label, text } };
            changed = true;
          }
        }
        break;
      case 'line':
        {
          const line = getLineById(selectedLabel.id);
          if (line?.label) {
            runtime.lines[String(line.id)] = { ...line, label: { ...line.label, text } };
            changed = true;
          }
        }
        break;
      case 'angle':
        {
          const angle = getAngleById(selectedLabel.id);
          if (angle?.label) {
            runtime.angles[String(angle.id)] = { ...angle, label: { ...angle.label, text } };
            changed = true;
          }
        }
        break;
      case 'free':
        {
          const label = getLabelById(selectedLabel.id);
          if (label) {
            runtime.labels[String(label.id)] = { ...label, text };
            changed = true;
          }
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
  applyUiIcons(document);
}

// Used by label UI flow.
function tryApplyLabelToSelection() {
  if (mode !== 'label') return;
  const anySelection =
    selectedLineId !== null ||
    selectedPolygonId !== null ||
    selectedPointId !== null ||
    selectedAngleId !== null;
  if (!anySelection) return;
  // simulate a label application without user click by reusing current mode logic on selection
  const color = colorWithAlpha(styleColorInput?.value ?? '#000', styleColorAlpha);
  let changed = false;
  if (selectedAngleId !== null) {
    const ang = getAngleById(selectedAngleId);
    if (ang && !ang.label) {
      const { text, seq } = nextGreek();
      ang.label = {
        text,
        color,
        offset: defaultAngleLabelOffset(selectedAngleId),
        fontSize: 0,
        seq
      };
      changed = true;
    }
  } else if (selectedPolygonId !== null) {
    const verts = polygonVerticesOrdered(selectedPolygonId).filter((vi) => !getPointById(vi)?.label);
    verts.forEach((vi) => {
      const pt = getPointById(vi);
      if (!pt) return;
      const { text, seq } = nextUpper();
      pt.label = {
        text,
        color,
        offset: defaultPointLabelOffset(vi),
        fontSize: 0,
        seq
      };
    });
    if (verts.length) changed = true;
  } else if (selectedLineId !== null) {
    // Je˜li zaznaczone s¥ wierzchoˆki, etykietuj je
    if (selectionVertices) {
      const line = getLineById(selectedLineId);
      if (line) {
        const verts = line.points.filter((vi) => !getPointById(vi)?.label);
        verts.forEach((vi) => {
          const pt = getPointById(vi);
          if (!pt) return;
          const { text, seq } = nextUpper();
          pt.label = {
            text,
            color,
            offset: defaultPointLabelOffset(vi),
            fontSize: 0,
            seq
          };
        });
        if (verts.length) changed = true;
      }
    }
    // Je˜li zaznaczone s¥ kraw©dzie (lub oba), etykietuj lini©
    if (selectionEdges) {
      const line = getLineById(selectedLineId);
      if (line && !line.label) {
        const { text, seq } = nextLower();
        line.label = {
          text,
          color,
          offset: defaultLineLabelOffset(selectedLineId),
          fontSize: 0,
          seq
        };
        changed = true;
      }
    }
  } else if (selectedPointId !== null) {
    const pt = getPointById(selectedPointId);
    if (pt && !pt.label) {
      const { text, seq } = nextUpper();
      pt.label = {
        text,
        color,
        offset: defaultPointLabelOffset(selectedPointId),
        fontSize: 0,
        seq
      };
      changed = true;
    }
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

// Used by hit-testing wrappers to capture shared dependencies.
function getHitTestDeps(): HitTestDeps {
  return {
    runtime,
    showHidden,
    currentHitRadius,
    canvas,
    dpr,
    zoomFactor,
    getPointById: getPointById,
    pointToSegmentDistance
  };
}

// Used by point tools.
function findPoint(p: { x: number; y: number }): string | null {
  return findPointCore(p, getHitTestDeps());
}

// Used by point tools.
function findPointWithRadius(p: { x: number; y: number }, radius: number): string | null {
  return findPointWithRadiusCore(p, radius, getHitTestDeps());
}

// Used by normalization helpers.
function normalize(v: { x: number; y: number }) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

// Used by drag constraints.
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

// Used by line tools.
function findLineHits(p: { x: number; y: number }): LineHit[] {
  return findLineHitsCore(p, getHitTestDeps());
}

// Used by line tools.
function findLine(p: { x: number; y: number }): LineHit | null {
  return findLineCore(p, getHitTestDeps());
}

// Used by line tools.
function findLineHitForPos(lineId: string, pos: { x: number; y: number }): LineHit | null {
  return findLineHitForPosCore(lineId, pos, getHitTestDeps());
}

// Used by main UI flow.
function getArcDeps(): ArcToolsDeps {
  return { runtime, showHidden };
}

// Used by angle tools.
function normalizeAngle(a: number) {
  return normalizeAngleCore(a);
}

// Used by main UI flow.
function arcKey(circleId: string, startPointId: string, endPointId: string) {
  return arcKeyCore(circleId, startPointId, endPointId);
}

// Used by main UI flow.
function arcKeyByIndex(circleId: string, arcIdx: number) {
  return arcKeyByIndexCore(circleId, arcIdx, getArcDeps());
}

// Used by main UI flow.
function parseArcKey(key: string): { circleId: string; arcIdx: number; start?: string; end?: string } | null {
  return parseArcKeyCore(key, getArcDeps());
}

// Used by main UI flow.
function ensureArcStyles(circleId: string, count: number) {
  ensureArcStylesCore(circleId, count, getArcDeps());
}

// Used by circle tools.
function circleArcs(circleId: string): DerivedArc[] {
  return circleArcsCore(circleId, getArcDeps());
}

// Used by angle tools.
function angleOnArc(test: number, start: number, end: number, clockwise: boolean) {
  return angleOnArcCore(test, start, end, clockwise);
}

// Used by hit-testing and selection.
function findArcAt(
  p: { x: number; y: number },
  tolerance = currentHitRadius(),
  onlyCircle?: string
): { circle: string; arcIdx: number; key?: string } | null {
  return findArcAtCore(p, getArcDeps(), tolerance, onlyCircle);
}

// Used by angle tools.
function angleBaseGeometry(ang: Angle) {
  return angleBaseGeometryCore(ang, { runtime }, {
    radiusMargin: ANGLE_RADIUS_MARGIN,
    minRadius: ANGLE_MIN_RADIUS,
    defaultRadius: ANGLE_DEFAULT_RADIUS
  });
}

// Used by angle tools.
function angleGeometry(ang: Angle) {
  return angleGeometryCore(ang, { runtime }, {
    radiusMargin: ANGLE_RADIUS_MARGIN,
    minRadius: ANGLE_MIN_RADIUS,
    defaultRadius: ANGLE_DEFAULT_RADIUS
  });
}

// Used by angle tools.
function defaultAngleRadius(ang: Angle): number | null {
  return defaultAngleRadiusCore(ang, { runtime }, {
    radiusMargin: ANGLE_RADIUS_MARGIN,
    minRadius: ANGLE_MIN_RADIUS,
    defaultRadius: ANGLE_DEFAULT_RADIUS
  });
}

// Used by angle tools.
function adjustSelectedAngleRadius(direction: 1 | -1) {
  if (selectedAngleId === null) return;
  const ang = getAngleById(selectedAngleId);
  if (!ang) return;
  const base = angleBaseGeometry(ang);
  if (!base) return;
  const currentOffset = ang.style.arcRadiusOffset ?? 0;
  const desiredRadius = clamp(base.radius + currentOffset + direction * ANGLE_RADIUS_STEP, base.minRadius, base.maxRadius);
  const nextOffset = desiredRadius - base.radius;
  if (Math.abs(nextOffset - currentOffset) < 1e-6) {
    updateStyleMenuValues();
    return;
  }
  runtime.angles[String(ang.id)] = { ...ang, style: { ...ang.style, arcRadiusOffset: nextOffset } };
  draw();
  pushHistory();
  updateStyleMenuValues();
}

// Used by angle tools.
function findAngleAt(p: { x: number; y: number }, tolerance = currentHitRadius()): string | null {
  const angles = listAngles();
  for (let i = angles.length - 1; i >= 0; i--) {
    const angle = angles[i];
    const geom = angleGeometry(angle);
    if (!geom) continue;
    const { v, start, end, clockwise, radius } = geom;
    const dist = Math.abs(Math.hypot(p.x - v.x, p.y - v.y) - radius);
    if (dist > tolerance) continue;
    const ang = Math.atan2(p.y - v.y, p.x - v.x);
    if (angleOnArc(ang, start, end, clockwise)) return angle.id;
  }
  return null;
}

// Used by line tools.
function pointInLine(pointId: string, line: Line): boolean {
  return pointInLineCore(pointId, line);
}

// Used by point tools.
function pointToSegmentDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  return pointToSegmentDistanceCore(p, a, b);
}

// Used by circle tools.
function circlesContainingPoint(pointId: string): string[] {
  if (!pointId) return [];
  return circlesContainingPointCore(runtime, pointId);
}

// Used by circle tools.
function circlesReferencingPoint(pointId: string): string[] {
  if (!pointId) return [];
  return circlesReferencingPointCore(runtime, pointId);
}

// Used by circle tools.
function circlesWithCenter(pointId: string): string[] {
  if (!pointId) return [];
  return circlesWithCenterCore(runtime, pointId);
}

// Used by main UI flow.
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

function findInkStrokeBoxAt(p: { x: number; y: number }, onlySelected: Set<ObjectId> | null = null): string | null {
  const strokes = listInkStrokes();
  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i];
    if (stroke.hidden && !showHidden) continue;
    if (onlySelected && !onlySelected.has(String(stroke.id))) continue;
    const bounds = strokeBounds(stroke);
    if (!bounds) continue;
    if (p.x < bounds.minX || p.x > bounds.maxX || p.y < bounds.minY || p.y > bounds.maxY) continue;
    return stroke.id;
  }
  return null;
}

function findSelectedInkStrokeBoxAt(p: { x: number; y: number }): string | null {
  const selected = new Set<string>();
  if (selectedInkStrokeId) selected.add(String(selectedInkStrokeId));
  multiSelectedInkStrokes.forEach((id) => selected.add(String(id)));
  if (!selected.size) return null;
  return findInkStrokeBoxAt(p, selected);
}

// Used by hit-testing and selection.
function findInkStrokeAt(p: { x: number; y: number }): string | null {
  const strokes = listInkStrokes();
  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i];
    if (stroke.hidden && !showHidden) continue;
    const bounds = strokeBounds(stroke);
    if (!bounds) continue;
    if (p.x < bounds.minX || p.x > bounds.maxX || p.y < bounds.minY || p.y > bounds.maxY) continue;
    
    const tolerance = currentHitRadius();
    for (let j = 0; j < stroke.points.length; j++) {
      const pt = stroke.points[j];
      if (j === 0) {
        if (Math.hypot(p.x - pt.x, p.y - pt.y) <= tolerance) return stroke.id;
      } else {
        const prev = stroke.points[j - 1];
        if (pointToSegmentDistance(p, prev, pt) <= tolerance) return stroke.id;
      }
    }
  }
  return null;
}

// Used by point tools.
function eraseInkStrokeAtPoint(p: { x: number; y: number }) {
  const hit = findInkStrokeAt(p);
  if (hit === null) return;
  const stroke = getInkStrokeById(hit);
  if (!stroke) return;
  const strokeId = stroke.id ?? null;
  if (strokeId && strokeId === eraserLastStrokeId) return;
  eraserLastStrokeId = strokeId;
  delete runtime.inkStrokes[String(hit)];
  eraserChangedDuringDrag = true;
  draw();
}

// Used by UI/state updates.
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

// Used by point tools.
function toPoint(ev: PointerEvent) {
  const rect = canvas!.getBoundingClientRect();
  const canvasX = ev.clientX - rect.left;
  const canvasY = ev.clientY - rect.top;
  return canvasToWorld(canvasX, canvasY);
}

// Used by main UI flow.
function canvasToWorld(canvasX: number, canvasY: number) {
  return {
    x: (canvasX - panOffset.x) / zoomFactor,
    y: (canvasY - panOffset.y) / zoomFactor
  };
}

// Used by main UI flow.
function worldToCanvas(worldX: number, worldY: number) {
  return {
    x: worldX * zoomFactor + panOffset.x,
    y: worldY * zoomFactor + panOffset.y
  };
}

// Used by main UI flow.
function normalizeWheelDelta(ev: WheelEvent): number {
  if (ev.deltaMode === 1) return ev.deltaY * WHEEL_LINE_HEIGHT;
  if (ev.deltaMode === 2) {
    const fallback = canvas?.clientHeight ?? 800;
    return ev.deltaY * fallback;
  }
  return ev.deltaY;
}

// Used by main UI flow.
function applyZoomAt(canvasX: number, canvasY: number, nextZoom: number): boolean {
  const worldBefore = canvasToWorld(canvasX, canvasY);
  const clamped = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  if (Math.abs(clamped - zoomFactor) < 1e-6) return false;
  zoomFactor = clamped;
  panOffset = {
    x: canvasX - worldBefore.x * zoomFactor,
    y: canvasY - worldBefore.y * zoomFactor
  };
  movedDuringPan = true;
  draw();
  return true;
}

// Used by main UI flow.
function handleCanvasWheel(ev: WheelEvent) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const canvasX = ev.clientX - rect.left;
  const canvasY = ev.clientY - rect.top;
  const delta = normalizeWheelDelta(ev);
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.01) return;
  const factor = Math.exp(-delta * WHEEL_ZOOM_SPEED);
  if (!Number.isFinite(factor) || Math.abs(factor - 1) < 1e-6) return;
  ev.preventDefault();
  applyZoomAt(canvasX, canvasY, zoomFactor * factor);
}

// Used by main UI flow.
function screenOffsetToWorld(offset: { x: number; y: number }): { x: number; y: number } {
  return { x: offset.x / zoomFactor, y: offset.y / zoomFactor };
}

// Used by main UI flow.
function worldOffsetToScreen(offset: { x: number; y: number }): { x: number; y: number } {
  return { x: offset.x * zoomFactor, y: offset.y * zoomFactor };
}

// Used by point tools.
function updateTouchPointFromEvent(ev: PointerEvent) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  activeTouches.set(ev.pointerId, { x: ev.clientX - rect.left, y: ev.clientY - rect.top });
}

// Used by point tools.
function removeTouchPoint(pointerId: number) {
  activeTouches.delete(pointerId);
  if (pinchState && !pinchState.pointerIds.every((id) => activeTouches.has(id))) {
    pinchState = null;
  }
}

// Used by gesture handling.
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

// Used by gesture handling.
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

// Used by main UI flow.
function clearDragState() {
  draggingLabel = null;
  resizingLine = null;
  rotatingLine = null;
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
  activeDragPointerId = null;
  selectionDragOriginals = null;
  inkDragOriginals = null;
  multiDragOriginals = null;
  pendingMultiToggle = null;
}

// Used by main UI flow.
function markHistoryIfNeeded() {
  if (movedDuringDrag || activeInkStroke) {
    pushHistory();
  }
  movedDuringDrag = false;
}

// Used by main UI flow.
function resetEraserState() {
  eraserActive = false;
  activeInkStroke = null;
}

// Used by label UI flow.
function selectLabel(sel: { kind: 'point' | 'line' | 'angle' | 'free'; id: string } | null) {
  // Cleanup empty free label if we are switching selection
  if (selectedLabel && selectedLabel.kind === 'free') {
    const isSame = sel && sel.kind === 'free' && sel.id === selectedLabel.id;
    if (!isSame) {
      const l = getLabelById(selectedLabel.id);
      if (l && (!l.text || !l.text.trim())) {
        delete runtime.labels[String(l.id)];
      }
    }
  }

  selectedLabel = sel;
  if (sel) {
    selectedPointId = null;
    selectedLineId = null;
    selectedCircleId = null;
    selectedAngleId = null;
    selectedPolygonId = null;
    selectedSegments.clear();
    selectedArcSegments.clear();
  }
  updateSelectionButtons();
  draw();
  updateStyleMenuValues();
}

// Used by label UI flow.
function clearLabelSelection() {
  selectLabel(null);
}

// Used by event handling flow.
function handleToolClick(tool: Mode) {
  // Cleanup empty free label
  if (selectedLabel && selectedLabel.kind === 'free') {
    const l = getLabelById(selectedLabel.id);
    if (l && (!l.text || !l.text.trim())) {
      delete runtime.labels[String(l.id)];
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
  const symmetricSeed = tool === 'symmetric' ? selectedPointId : null;
  if (tool === 'midpoint') {
    // If any non-point selection exists (polygon, line, segments, multi-select),
    // clear it and enter midpoint mode instead of creating a midpoint immediately.
    const hasNonPointSelection =
      selectedPolygonId !== null ||
      selectedLineId !== null ||
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

    if (selectedPointId !== null) {
      clearSelectionState();
      updateSelectionButtons();
      draw();
    } else {
      const segEntry =
        Array.from(selectedSegments)
          .map(parseSegmentKey)
          .find((k) => k && k.part === 'segment' && k.seg !== undefined) ?? null;
      const candidateLine = segEntry?.line ?? selectedLineId;
      const candidateSeg = segEntry?.seg ?? 0;
      if (candidateLine !== null) {
        const line = getLineById(candidateLine);
        if (line && line.points[candidateSeg] !== undefined && line.points[candidateSeg + 1] !== undefined) {
          const a = getPointById(line.points[candidateSeg]);
          const b = getPointById(line.points[candidateSeg + 1]);
          if (a && b) {
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const midIdx = addPoint(runtime, {
              ...mid,
              style: currentPointStyle(),
              defining_parents: line?.id ? [{ kind: 'line', id: line.id }] : []
            });
            insertPointIntoLine(candidateLine, midIdx, mid);
            clearSelectionState();
            selectedPointId = midIdx;
            selectedLineId = candidateLine;
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
    parallelAnchorPointId = selectedPointId;
    parallelReferenceLineId = selectedLineId;
    if (parallelAnchorPointId !== null && parallelReferenceLineId !== null) {
      const created = createParallelLineThroughPoint(parallelAnchorPointId, parallelReferenceLineId);
      parallelAnchorPointId = null;
      parallelReferenceLineId = null;
      if (created !== null) {
        selectedLineId = created;
        selectedPointId = null;
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
    symmetricSourceId = symmetricSeed;
    if (symmetricSourceId !== null) draw();
  }
  if (tool === 'label') {
    tryApplyLabelToSelection();
  }
  updateToolButtons();
  updateSelectionButtons();
}

// Used by event handling flow.
function handleToolSticky(tool: Mode) {
  // Cleanup empty free label
  if (selectedLabel && selectedLabel.kind === 'free') {
    const l = getLabelById(selectedLabel.id);
    if (l && (!l.text || !l.text.trim())) {
      delete runtime.labels[String(l.id)];
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

// Used by UI state helpers.
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

// Used by main UI flow.
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

// Used by UI/state updates.
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

// Used by UI/state updates.
function updateSelectionButtons() {
  const visible = selectedLineId !== null || selectedPolygonId !== null;
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
      (selectedPointId !== null ||
        selectedLineId !== null ||
        selectedCircleId !== null ||
        selectedAngleId !== null ||
        selectedPolygonId !== null ||
        selectedInkStrokeId !== null ||
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
  const showMultiMode = mode === 'multiselect';
  const showMultiButtons = showMultiMode && hasMultiSelection();
  if (multiMoveBtn) {
    multiMoveBtn.style.display = showMultiMode ? 'inline-flex' : 'none';
  }
  if (multiHideBtn) {
    multiHideBtn.style.display = showMultiButtons ? 'inline-flex' : 'none';
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
        svgEl.setAttribute('viewBox', MULTI_CLONE_ICON_PASTE.viewBox);
        svgEl.innerHTML = MULTI_CLONE_ICON_PASTE.markup;
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
        svgEl.setAttribute('viewBox', MULTI_CLONE_ICON_COPY.viewBox);
        svgEl.innerHTML = MULTI_CLONE_ICON_COPY.markup;
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

// Used by rendering flow.
function renderWidth(w: number) {
  return Math.max(0.1, w / (dpr * zoomFactor));
}

// Used by main UI flow.
function screenUnits(value: number) {
  return value / zoomFactor;
}

// Used by main UI flow.
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

const {
  currentPointStyle,
  midpointPointStyle,
  bisectPointStyle,
  symmetricPointStyle,
  currentStrokeStyle,
  currentAngleStyle,
  applySelectionStyle
} = createStyleHelpers({
  getTheme: () => THEME,
  getDefaultPointFillMode: () => defaultPointFillMode,
  renderWidth
});

const {
  defaultLineLabelOffset,
  defaultPointLabelOffset,
  defaultAngleLabelOffset,
  getPointLabelPos,
  getLineLabelPos,
  getAngleLabelPos,
  getLabelAlignment,
  findLabelAt,
  alignPointLabelOffsets,
  adjustPointLabelOffsets
} = createLabelHelpers({
  getPointById,
  getLineById,
  getCircleById,
  getAngleById,
  listPoints,
  listLines,
  listAngles,
  listLabels,
  circlesContainingPoint,
  findLinesContainingPoint,
  polygonForLine,
  polygonCentroid,
  lineExtent,
  angleGeometry,
  normalize,
  worldToCanvas,
  worldOffsetToScreen,
  screenOffsetToWorld,
  labelFontSizePx,
  getLabelScreenDimensions,
  normalizeLabelAlignment,
  getCtx: () => ctx,
  draw,
  pushHistory,
  getShowHidden: () => showHidden,
  LABEL_PADDING_X,
  LABEL_PADDING_Y
});

const { copyStyleFromSelection, applyStyleToSelection } = createStyleSelectionHandlers({
  getSelection: () => ({
    selectedPointId,
    selectedLineId,
    selectedCircleId,
    selectedAngleId,
    selectedPolygonId,
    selectedLabel,
    selectedInkStrokeId,
    selectedSegments,
    selectedArcSegments,
    multiSelectedLabels
  }),
  getPointById,
  getLineById,
  getCircleById,
  getAngleById,
  getPolygonById,
  polygonLines,
  polygonEdgeSegmentKeys,
  getLabelById,
  getInkStrokeById,
  parseSegmentKey,
  parseArcKey,
  arcKey,
  circleArcs,
  ensureSegmentStylesForLine,
  ensureArcStyles,
  normalizeLabelFontSize,
  draw,
  pushHistory
});

const {
  setStyleColorAlpha,
  syncCustomColorInputs,
  setStyleColorFromValue,
  rememberColor,
  paletteColors,
  updateColorButtons
} = createStylePaletteHandlers({
  getTheme: () => THEME,
  getStyleColorInput: () => styleColorInput,
  getCustomColorInput: () => customColorInput,
  getCustomColorAlphaInput: () => customColorAlphaInput,
  getCustomColorAlphaValue: () => customColorAlphaValue,
  getColorSwatchButtons: () => colorSwatchButtons,
  getCustomColorBtn: () => customColorBtn,
  getRecentColors: () => recentColors,
  setRecentColors: (colors) => { recentColors = colors; },
  saveRecentColorsToStorage,
  normalizeColor,
  parseHexColor,
  clamp,
  clamp01,
  getStyleColorAlpha: () => styleColorAlpha,
  setStyleColorAlphaState: (value) => { styleColorAlpha = value; }
});

if (typeof document !== 'undefined') {
  setTheme(viewState.currentTheme);
  recentColors = loadRecentColorsFromStorage([THEME.palette[0] ?? THEME.defaultStroke]);
  updateColorButtons();
}

const styleMenuHandlers = createStyleMenuHandlers({
  getStyleMenuContainer: () => styleMenuContainer,
  getStyleMenuDropdown: () => styleMenuDropdown,
  getStyleMenuBtn: () => styleMenuBtn,
  getStyleMenuOpen: () => styleMenuOpen,
  setStyleMenuOpen: (open) => { styleMenuOpen = open; },
  setStyleMenuSuppressed: (suppressed) => { styleMenuSuppressed = suppressed; },
  getCustomColorRow: () => customColorRow,
  setCustomColorRowOpen: (open) => { customColorRowOpen = open; },
  clearCopyStyle: () => {
    if (copyStyleActive) {
      copyStyleActive = false;
      copiedStyle = null;
    }
  },
  updateSelectionButtons,
  updateStyleMenuValues
});
toggleStyleMenu = styleMenuHandlers.toggleStyleMenu;
closeStyleMenu = styleMenuHandlers.closeStyleMenu;
openStyleMenu = styleMenuHandlers.openStyleMenu;

// Used by main UI flow.
function currentHitRadius(multiplier = 1) {
  return (HIT_RADIUS * multiplier) / zoomFactor;
}

// Used by point tools.
function pointRadius(size: number) {
  const start = 4; // size 1
  const end = 6; // size 6
  const clamped = Math.max(1, Math.min(6, size));
  if (clamped <= 1) return start;
  return start + ((clamped - 1) * (end - start)) / 5;
}


/**
 * Parse label text and automatically add braces for subscripts/superscripts
 * Examples:
 * - P_11 -> P_{11}
 * - a_BCd_EF -> a_{BC}d_{EF}
 * - P_abc -> P_{abc}
 */


// Used by UI/state updates.
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

// Used by main UI flow.
function fitsHorizontally(container: HTMLElement | null): boolean {
  if (!container) return true;
  return container.scrollWidth <= container.clientWidth + 1;
}

// Used by label UI flow.
function closeLabelToolsOverflowMenu() {
  labelToolsOverflowOpen = false;
  labelToolsOverflowContainer?.classList.remove('open');
  labelToolsOverflowBtn?.setAttribute('aria-expanded', 'false');
}

// Used by label UI flow.
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

// Used by label UI flow.
function toggleLabelToolsOverflowMenu() {
  if (labelToolsOverflowOpen) closeLabelToolsOverflowMenu();
  else openLabelToolsOverflowMenu();
}

// Used by UI/state updates.
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

// Used by label UI flow.
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

// Used by label UI flow.
function updatePointLabelToolButtons() {
  const anyLabels =
    listLabels().length > 0 ||
    listPoints().some((pt) => !!pt?.label) ||
    listLines().some((line) => !!line?.label) ||
    listAngles().some((angle) => !!angle?.label);
  const anyPointLabels = listPoints().some((pt) => !!pt?.label);

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

// Used by main UI flow.
function copyMultiSelectionToClipboard() {
  if (!hasMultiSelection()) return;
  const linesToClone = new Set<string>();
  const pointsToClone = new Set<string>();

  multiSelectedLines.forEach((id) => linesToClone.add(id));
  multiSelectedPoints.forEach((id) => pointsToClone.add(id));

  multiSelectedPolygons.forEach((polyId) => {
    const poly = polygonGet(polyId);
    if (!poly) return;
    polygonLines(polyId).forEach((lineId) => linesToClone.add(lineId));
  });

  linesToClone.forEach((lineId) => {
    const line = getLineById(lineId);
    if (line) line.points.forEach((pid) => pointsToClone.add(pid));
  });

  multiSelectedCircles.forEach((circleId) => {
    const circle = getCircleById(circleId);
    if (!circle) return;
    pointsToClone.add(circle.center);
    if (circle.radius_point !== undefined) pointsToClone.add(circle.radius_point);
    circle.points.forEach((pid) => pointsToClone.add(pid));
  });

  multiSelectedAngles.forEach((angleId) => {
    const ang = getAngleById(angleId);
    if (!ang) return;
    pointsToClone.add(ang.vertex);
    if (ang.point1) pointsToClone.add(ang.point1);
    if (ang.point2) pointsToClone.add(ang.point2);
  });

  const stored: any = { points: [], lines: [], circles: [], angles: [], polygons: [], inkStrokes: [], labels: [] };

  pointsToClone.forEach((pid) => {
    const p = getPointById(pid);
    if (p) stored.points.push(JSON.parse(JSON.stringify(p)));
  });

  linesToClone.forEach((lineId) => {
    const l = getLineById(lineId);
    if (!l) return;
    const out: any = JSON.parse(JSON.stringify(l));
    out.points = (l.points || []).map((pid) => String(pid));
    out.defining_points = [l.defining_points?.[0], l.defining_points?.[1]];
    stored.lines.push(out);
  });

  multiSelectedCircles.forEach((circleId) => {
    const c = getCircleById(circleId);
    if (!c) return;
    const out: any = JSON.parse(JSON.stringify(c));
    out.center = c.center;
    out.radius_point = c.radius_point;
    out.points = (c.points || []).map((pid) => String(pid));
    stored.circles.push(out);
  });

  multiSelectedAngles.forEach((angleId) => {
    const a = getAngleById(angleId);
    if (!a) return;
    const out: any = JSON.parse(JSON.stringify(a));
    out.vertex = a.vertex;
    if (a.point1 !== undefined) out.point1 = a.point1;
    if (a.point2 !== undefined) out.point2 = a.point2;
    if (a.arm1LineId) out.arm1LineId = a.arm1LineId;
    if (a.arm2LineId) out.arm2LineId = a.arm2LineId;
    stored.angles.push(out);
  });

    multiSelectedPolygons.forEach((polyId) => {
      const p = polygonGet(polyId);
      if (!p) return;
      const out: any = JSON.parse(JSON.stringify(p));
      out.points = polygonVertices(polyId);
      delete out.lockRef;
      stored.polygons.push(out);
    });

  multiSelectedInkStrokes.forEach((strokeId) => {
    const s = getInkStrokeById(strokeId);
    if (s) stored.inkStrokes.push(JSON.parse(JSON.stringify(s)));
  });

  multiSelectedLabels.forEach((labelId) => {
    const lab = getLabelById(labelId);
    if (lab) stored.labels.push(JSON.parse(JSON.stringify(lab)));
  });

  try {
    window.localStorage?.setItem(COPIED_OBJECTS_STORAGE_KEY, JSON.stringify(stored));
  } catch {}
  copiedObjects = stored;
}

// Used by persistence flow.
function loadCopiedObjectsFromStorage() {
  try {
    const raw = window.localStorage?.getItem(COPIED_OBJECTS_STORAGE_KEY);
    if (raw) copiedObjects = JSON.parse(raw);
  } catch {
    copiedObjects = null;
  }
}

// Used by main UI flow.
function pasteCopiedObjects() {
  if (!copiedObjects) return;
  const stored = copiedObjects;
  const pointIdMap = new Map<string, string>();
  const lineIdMap = new Map<string, string>();
  const circleIdMap = new Map<string, string>();
  const angleIdMap = new Map<string, string>();
  const polyIdMap = new Map<string, string>();
  const inkIdMap = new Map<string, string>();
  const labelIdMap = new Map<string, string>();

  // Insert points
  stored.points.forEach((sp: any) => {
    const newId = nextId('point', runtime);
    const pCopy = { ...sp, id: newId };
    pCopy.x = (pCopy.x ?? 0) + 20;
    pCopy.y = (pCopy.y ?? 0) + 20;
    dispatchAction({ type: 'ADD', kind: 'point', payload: pCopy });
    pointIdMap.set(sp.id, newId);
  });

  // Reserve line ids so parallel/perpendicular references can be mapped
  stored.lines.forEach((sl: any) => {
    if (sl?.id) lineIdMap.set(sl.id, nextId('line', runtime));
  });

  // Insert lines
  stored.lines.forEach((sl: any) => {
    const newId = lineIdMap.get(sl.id) ?? nextId('line', runtime);
    const newPoints = (sl.points || [])
      .map((pid: string) => pointIdMap.get(pid) ?? pid)
      .filter((pid: string) => typeof pid === 'string' && pid.length > 0);
    if (newPoints.length < 2) return;
    const defA = sl.defining_points?.[0] ? (pointIdMap.get(sl.defining_points[0]) ?? sl.defining_points[0]) : newPoints[0];
    const defB = sl.defining_points?.[1]
      ? (pointIdMap.get(sl.defining_points[1]) ?? sl.defining_points[1])
      : newPoints[newPoints.length - 1];
    const newLine: any = {
      ...sl,
      id: newId,
      points: newPoints,
      defining_points: [defA, defB]
    };
    if (newLine.parallel) {
      const ref = lineIdMap.get(newLine.parallel.referenceLine) ?? newLine.parallel.referenceLine;
      const through = pointIdMap.get(newLine.parallel.throughPoint) ?? newLine.parallel.throughPoint;
      const helper = pointIdMap.get(newLine.parallel.helperPoint) ?? newLine.parallel.helperPoint;
      newLine.parallel = { ...newLine.parallel, referenceLine: ref, throughPoint: through, helperPoint: helper };
    }
    if (newLine.perpendicular) {
      const ref = lineIdMap.get(newLine.perpendicular.referenceLine) ?? newLine.perpendicular.referenceLine;
      const through = pointIdMap.get(newLine.perpendicular.throughPoint) ?? newLine.perpendicular.throughPoint;
      const helper = pointIdMap.get(newLine.perpendicular.helperPoint) ?? newLine.perpendicular.helperPoint;
      newLine.perpendicular = { ...newLine.perpendicular, referenceLine: ref, throughPoint: through, helperPoint: helper };
    }
    if (newLine.bisector) {
      newLine.bisector = {
        ...newLine.bisector,
        vertex: pointIdMap.get(newLine.bisector.vertex) ?? newLine.bisector.vertex,
        bisectPoint: pointIdMap.get(newLine.bisector.bisectPoint) ?? newLine.bisector.bisectPoint
      };
    }
    newLine.segmentKeys = newPoints.slice(0, -1).map((pid: string, i: number) => segmentKeyForPoints(newPoints[i], newPoints[i + 1]));
    dispatchAction({ type: 'ADD', kind: 'line', payload: newLine });
  });

  // Insert circles
  stored.circles.forEach((sc: any) => {
    const newId = nextId('circle', runtime);
    const newCenter = pointIdMap.get(sc.center) ?? sc.center;
    if (!newCenter) return;
    const newPoints = (sc.points || []).map((pid: string) => pointIdMap.get(pid) ?? pid).filter(Boolean);
    const newCircle: any = { ...sc, id: newId, center: newCenter, points: newPoints };
    if (sc.radius_point) newCircle.radius_point = pointIdMap.get(sc.radius_point) ?? sc.radius_point;
    if (Array.isArray(sc.defining_points)) {
      newCircle.defining_points = sc.defining_points.map((pid: string) => pointIdMap.get(pid) ?? pid);
    }
    dispatchAction({ type: 'ADD', kind: 'circle', payload: newCircle });
    circleIdMap.set(sc.id, newId);
  });

  // Insert angles
  stored.angles.forEach((sa: any) => {
    const newId = nextId('angle', runtime);
    const newVertex = pointIdMap.get(sa.vertex) ?? sa.vertex;
    if (!newVertex) return;
    const newAngle: any = { ...sa, id: newId, vertex: newVertex };
    if (sa.point1) newAngle.point1 = pointIdMap.get(sa.point1) ?? sa.point1;
    if (sa.point2) newAngle.point2 = pointIdMap.get(sa.point2) ?? sa.point2;
    if (sa.arm1LineId && lineIdMap.has(sa.arm1LineId)) newAngle.arm1LineId = lineIdMap.get(sa.arm1LineId);
    if (sa.arm2LineId && lineIdMap.has(sa.arm2LineId)) newAngle.arm2LineId = lineIdMap.get(sa.arm2LineId);
    dispatchAction({ type: 'ADD', kind: 'angle', payload: newAngle });
    angleIdMap.set(sa.id, newId);
  });

    // Insert polygons
    stored.polygons.forEach((spoly: any) => {
      const newId = nextId('polygon', runtime);
      const newPoints = (spoly.points || []).map((pid: string) => pointIdMap.get(pid) ?? pid).filter(Boolean);
      if (newPoints.length < 3) return;
      const newPoly: any = { ...spoly, id: newId, points: newPoints };
      dispatchAction({ type: 'ADD', kind: 'polygon', payload: newPoly });
      polyIdMap.set(spoly.id, newId);
    });
    polyIdMap.forEach((newId) => {
      const poly = polygonGet(newId);
      if (poly?.locked) ensurePolygonLockRef(runtime, poly);
    });

    // Insert ink strokes
  stored.inkStrokes.forEach((s: any) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `ink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    const newStroke = { ...s, id, points: (s.points || []).map((pt: any) => ({ ...pt, x: (pt.x || 0) + 20, y: (pt.y || 0) + 20 })) };
    dispatchAction({ type: 'ADD', kind: 'ink', payload: newStroke });
    inkIdMap.set(s.id, id);
  });

  // Insert free labels
  stored.labels.forEach((lab: any) => {
    const newLabel = { ...lab, pos: { x: (lab.pos?.x ?? 0) + 20, y: (lab.pos?.y ?? 0) + 20 } };
    dispatchAction({ type: 'ADD', kind: 'label', payload: newLabel });
  const created = listLabels().slice(-1)[0];
    if (created?.id) labelIdMap.set(lab.id, created.id);
  });

  rebuildIndexMaps();

  clearMultiSelection();
  pointIdMap.forEach((newId) => multiSelectedPoints.add(newId));
  lineIdMap.forEach((newId) => multiSelectedLines.add(newId));
  circleIdMap.forEach((newId) => multiSelectedCircles.add(newId));
  angleIdMap.forEach((newId) => multiSelectedAngles.add(newId));
  polyIdMap.forEach((newId) => multiSelectedPolygons.add(newId));
  inkIdMap.forEach((newId) => multiSelectedInkStrokes.add(newId));
  labelIdMap.forEach((newId) => multiSelectedLabels.add(newId));

  setMode('multiselect');
  multiMoveActive = true;
  multiMoveBtn?.classList.add('active');
  multiMoveBtn?.setAttribute('aria-pressed', 'true');

  try {
    window.localStorage?.removeItem(COPIED_OBJECTS_STORAGE_KEY);
  } catch {}
  copiedObjects = null;

  updateSelectionButtons();
  draw();
  pushHistory();
}


// Used by normalization helpers.
function normalizeColor(color: string) {
  return color.trim().toLowerCase();
}
function clamp01(value: number) {
  return clamp(value, 0, 1);
}
function colorWithAlpha(hex: string, alpha: number) {
  const clamped = clamp01(alpha);
  if (!Number.isFinite(clamped) || clamped >= 1) return hex;
  const parsed = parseHexColor(hex);
  if (!parsed) return hex;
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${clamped})`;
}

// Used by main UI flow.
function mostCommonConstructionColor(includeHidden = false): string | null {
  const counts: Record<string, number> = {};
  const add = (col?: string, hidden?: boolean) => {
    if (!col) return;
    if (!includeHidden && hidden) return;
    const key = normalizeColor(col);
    counts[key] = (counts[key] || 0) + 1;
  };
  listPoints().forEach((pt) => add(pt?.style?.color, pt?.style?.hidden));
  listLines().forEach((ln) => {
    if (!ln) return;
    add(ln.style?.color, ln.style?.hidden);
    ln.segmentStyles?.forEach((s) => add(s.color, s.hidden));
  });
  listCircles().forEach((c) => add(c.style?.color, c.style?.hidden));
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


// Used by label UI flow.
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

// Used by label UI flow.
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

// Used by label UI flow.
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
      const point = getPointById(sel.id);
      const label = point?.label;
      if (!label) return null;
      return normalizeAndGetPx(label, (nextDelta) => {
        runtime.points[String(point!.id)] = { ...point!, label: { ...label, fontSize: nextDelta } };
      });
    }
    case 'line': {
      const line = getLineById(sel.id);
      const label = line?.label;
      if (!label) return null;
      return normalizeAndGetPx(label, (nextDelta) => {
        runtime.lines[String(line!.id)] = { ...line!, label: { ...label, fontSize: nextDelta } };
      });
    }
    case 'angle': {
      const angle = getAngleById(sel.id);
      const label = angle?.label;
      if (!label) return null;
      return normalizeAndGetPx(label, (nextDelta) => {
        runtime.angles[String(angle!.id)] = { ...angle!, label: { ...label, fontSize: nextDelta } };
      });
    }
    case 'free': {
      const label = getLabelById(sel.id);
      if (!label) return null;
      return normalizeAndGetPx(label, (nextDelta) => {
        runtime.labels[String(label.id)] = { ...label, fontSize: nextDelta };
      });
    }
  }
}

// Used by label UI flow.
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

// Used by label UI flow.
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
      const point = getPointById(activeLabel.id);
      if (point?.label) apply(point.label, (next) => {
        runtime.points[String(point.id)] = { ...point, label: next };
      });
      break;
    }
    case 'line': {
      const line = getLineById(activeLabel.id);
      if (line?.label) apply(line.label, (next) => {
        runtime.lines[String(line.id)] = { ...line, label: next };
      });
      break;
    }
    case 'angle': {
      const angle = getAngleById(activeLabel.id);
      if (angle?.label) apply(angle.label, (next) => {
        runtime.angles[String(angle.id)] = { ...angle, label: next };
      });
      break;
    }
    case 'free': {
      const freeLabel = getLabelById(activeLabel.id);
      if (freeLabel) {
        apply(freeLabel, (next) => {
          runtime.labels[String(freeLabel.id)] = next;
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

// Used by label UI flow.
function selectedLabelAlignment(): LabelAlignment | null {
  if (!selectedLabel) return null;
  const sel = selectedLabel;
  switch (sel.kind) {
    case 'point': {
      const point = getPointById(sel.id);
      return point ? getLabelAlignment(point.label) : null;
    }
    case 'line': {
      const line = getLineById(sel.id);
      return line ? getLabelAlignment(line.label) : null;
    }
    case 'angle': {
      const angle = getAngleById(sel.id);
      return angle ? getLabelAlignment(angle.label) : null;
    }
    case 'free':
      return getLabelAlignment(getLabelById(sel.id));
  }
}

// Used by label UI flow.
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
      const point = getPointById(sel.id);
      if (point?.label) apply(point.label, (next) => {
        runtime.points[String(point.id)] = { ...point, label: next };
      });
      break;
    }
    case 'line': {
      const line = getLineById(sel.id);
      if (line?.label) apply(line.label, (next) => {
        runtime.lines[String(line.id)] = { ...line, label: next };
      });
      break;
    }
    case 'angle': {
      const angle = getAngleById(sel.id);
      if (angle?.label) apply(angle.label, (next) => {
        runtime.angles[String(angle.id)] = { ...angle, label: next };
      });
      break;
    }
    case 'free': {
      const lab = getLabelById(sel.id);
      if (lab) apply(lab, (next) => (runtime.labels[String(lab.id)] = next));
      break;
    }
  }
  if (changed) {
    draw();
    pushHistory();
  }
}

// Used by label UI flow.
function updateLabelAlignControl() {
  if (!labelAlignToggleBtn) return;
  const align = selectedLabelAlignment() ?? DEFAULT_LABEL_ALIGNMENT;
  labelAlignToggleBtn.innerHTML = align === 'left' ? LABEL_ALIGN_ICON_LEFT : LABEL_ALIGN_ICON_CENTER;
  labelAlignToggleBtn.setAttribute('aria-pressed', align === 'left' ? 'true' : 'false');
  labelAlignToggleBtn.title =
    align === 'left' ? 'Wyrównanie etykiety: do lewej' : 'Wyrównanie etykiety: do środka';
  labelAlignToggleBtn.disabled = !selectedLabel;
}

// Used by line tools.
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

// Used by line tools.
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

// Used by UI state helpers.
function getTickStateForSelection(labelEditing: boolean): {
  available: boolean;
  state: TickLevel;
  mixed: boolean;
} {
  if (labelEditing) return { available: false, state: 0, mixed: false };
  if (selectedLineId !== null || selectedPolygonId !== null) {
    const lines = new Set<ObjectId>();
    if (selectedLineId) lines.add(selectedLineId);
    const polyId = selectedPolygonId ?? (selectedLineId ? polygonForLine(selectedLineId) : null);
    if (polyId) polygonLines(polyId).forEach((lineId) => lines.add(lineId));
    const polygonEdgeKeys =
      selectedSegments.size === 0 && selectedPolygonId !== null ? polygonEdgeSegmentKeys(selectedPolygonId) : null;
    const segmentKeys = selectedSegments.size > 0 ? selectedSegments : polygonEdgeKeys;
    const useSegmentKeys = !!segmentKeys && segmentKeys.size > 0;
    const ticks: TickLevel[] = [];
    lines.forEach((lineId) => {
      const line = getLineById(lineId);
      if (!line) return;
      const segCount = Math.max(0, line.points.length - 1);
      ensureSegmentStylesForLine(lineId);
      const allSegments = !useSegmentKeys;
      for (let i = 0; i < segCount; i++) {
        const key = segmentKey(line.id, 'segment', i);
        if (!allSegments && !segmentKeys!.has(key)) continue;
        const style = line.segmentStyles?.[i] ?? line.style;
        ticks.push(style.tick ?? 0);
      }
    });
    if (!ticks.length) return { available: true, state: 0, mixed: false };
    const first = ticks[0];
    const mixed = ticks.some((t) => t !== first);
    return { available: true, state: mixed ? 0 : first ?? 0, mixed };
  }
  if (selectedCircleId !== null) {
    const circleId = selectedCircleId;
    const circle = getCircleById(circleId);
    if (!circle) return { available: false, state: 0, mixed: false };
    const arcs = circleArcs(circleId);
    ensureArcStyles(circleId, arcs.length);
    const circleStyle = circle.style;
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

// Used by UI/state updates.
function applyTickState(nextTick: TickLevel) {
  let changed = false;
  const applyToSegment = (lineId: ObjectId, segIdx: number, tick: TickLevel) => {
    const line = getLineById(lineId);
    if (!line) return;
    ensureSegmentStylesForLine(lineId);
    if (!line.segmentStyles) line.segmentStyles = [];
    const base = line.segmentStyles[segIdx] ?? line.style;
    line.segmentStyles[segIdx] = { ...base, tick };
    changed = true;
  };
  const applyToLine = (lineId: ObjectId, tick: TickLevel) => {
    const line = getLineById(lineId);
    if (!line) return;
    ensureSegmentStylesForLine(lineId);
    const segCount = Math.max(0, line.points.length - 1);
    if (!line.segmentStyles) line.segmentStyles = [];
    line.style = { ...line.style, tick };
    changed = true;
    for (let i = 0; i < segCount; i++) {
      applyToSegment(lineId, i, tick);
    }
    line.leftRay = line.leftRay ? { ...line.leftRay, tick } : line.leftRay;
    line.rightRay = line.rightRay ? { ...line.rightRay, tick } : line.rightRay;
  };
  const applyToArc = (circleId: string, arcIdx: number, tick: TickLevel) => {
    const circle = getCircleById(circleId);
    if (!circle) return;
    const arcs = circleArcs(circleId);
    ensureArcStyles(circleId, arcs.length);
    const arc = arcs[arcIdx];
    if (!arc) return;
    if (!circle.arcStyles) circle.arcStyles = {} as any;
    const key = arc.key;
    const base = (circle.arcStyles as any)[key] ?? circle.style;
    (circle.arcStyles as any)[key] = { ...base, tick };
    changed = true;
  };
  const applyToCircle = (circleId: string, tick: TickLevel) => {
    const circle = getCircleById(circleId);
    if (!circle) return;
    const arcs = circleArcs(circleId);
    ensureArcStyles(circleId, arcs.length);
    circle.style = { ...circle.style, tick };
    if (!circle.arcStyles) circle.arcStyles = {} as any;
    changed = true;
    for (let i = 0; i < arcs.length; i++) {
      applyToArc(circleId, i, tick);
    }
  };

  if (selectedLineId !== null || selectedPolygonId !== null) {
    const lines = new Set<ObjectId>();
    if (selectedLineId) lines.add(selectedLineId);
    const selPolyId = selectedPolygonId ?? (selectedLineId ? polygonForLine(selectedLineId) : null);
    if (selPolyId) {
      const pls = polygonLines(selPolyId);
      pls.forEach((lineId) => lines.add(lineId));
    }
    const polygonEdgeKeys =
      selectedSegments.size === 0 && selectedPolygonId !== null ? polygonEdgeSegmentKeys(selectedPolygonId) : null;
    const segmentKeys = selectedSegments.size > 0 ? selectedSegments : polygonEdgeKeys;
    const useSegments = !!segmentKeys && segmentKeys.size > 0;
    lines.forEach((lineId) => {
      const line = getLineById(lineId);
      if (!line) return;
      const segCount = Math.max(0, line.points.length - 1);
      if (!useSegments) {
        applyToLine(lineId, nextTick);
        changed = true;
      } else {
        for (let i = 0; i < segCount; i++) {
          const key = segmentKey(line.id, 'segment', i);
          if (segmentKeys!.has(key)) applyToSegment(lineId, i, nextTick);
        }
      }
    });
  } else if (selectedCircleId !== null) {
    const circleId = selectedCircleId;
    const arcs = circleArcs(circleId);
    const specificArcs = selectedArcSegments.size > 0;
    if (!specificArcs) {
      applyToCircle(circleId, nextTick);
      changed = true;
    } else {
      arcs.forEach((arc, idx) => {
        const key = arc.key;
        if (selectedArcSegments.has(key)) applyToArc(circleId, idx, nextTick);
      });
    }
  }

  if (changed) {
    draw();
    pushHistory();
    updateStyleMenuValues();
  }
}

// Used by main UI flow.
function cycleTickState() {
  const tickInfo = getTickStateForSelection(false);
  if (!tickInfo.available) return;
  const current = tickInfo.mixed ? 0 : tickInfo.state;
  const next = ((current + 1) % 4) as TickLevel;
  applyTickState(next);
}

// Used by point tools.
function collectPointStyleTargets(): ObjectId[] {
  const targets = new Set<ObjectId>();
  multiSelectedPoints.forEach((id) => targets.add(id));
  if (selectedPointId !== null) {
    targets.add(selectedPointId);
  }

  if (selectionVertices) {
    if (selectedLineId) {
      const line = getLineById(selectedLineId);
      line?.points.forEach((pi) => targets.add(pi));
    }
    const selPolyId = selectedPolygonId ?? (selectedLineId ? polygonForLine(selectedLineId) : null);
    if (selPolyId) {
      const pls = polygonLines(selPolyId);
      pls.forEach((lineId) => {
        const line = getLineById(lineId);
        line?.points.forEach((pi) => targets.add(pi));
      });
    }
    if (selectedCircleId) {
      const circle = getCircleById(selectedCircleId);
      if (circle) {
        circlePerimeterPoints(circle).forEach((pid) => targets.add(pid));
        if (circle.center) targets.add(circle.center);
        if (circle.radius_point) targets.add(circle.radius_point);
      }
    }
  }

  return Array.from(targets);
}

// Used by point tools.
function toggleSelectedPointsHollow(force?: boolean) {
  const targets = collectPointStyleTargets();
  if (!targets.length) return;
  const allHollow = targets.every((id) => !!getPointById(id)?.style.hollow);
  const desired = force === undefined ? !allHollow : force;
  let changed = false;
  targets.forEach((id) => {
    const pt = getPointById(id);
    if (!pt) return;
    if (!!pt.style.hollow === desired) return;
    runtime.points[String(id)] = { ...pt, style: { ...pt.style, hollow: desired } };
    changed = true;
  });
  if (changed) {
    draw();
    pushHistory();
    updateStyleMenuValues();
  }
}

// Used by UI/state updates.
function updateStyleMenuValues() {
  if (!styleColorInput || !styleWidthInput || !styleTypeSelect) return;
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
  const selLineId = selectedLineId ?? null;
  const selPolyId = selectedPolygonId ?? null;
  const selCircleId = selectedCircleId ?? null;
  const selCircle = selCircleId ? getCircleById(selCircleId) : null;
  const selPointId = selectedPointId ?? null;
  const selAngleId = selectedAngleId ?? null;
  const impliedPolygonId = selPolyId ?? (selLineId ? polygonForLine(selLineId) : null);
  const fillAvailable = !labelEditing && (selCircleId !== null || impliedPolygonId !== null);
  const fillActive =
    (selCircle?.fillOpacity !== undefined) ||
    (impliedPolygonId !== null && polygonGet(impliedPolygonId)?.fillOpacity !== undefined);

    if (fillToggleBtn) {
      fillToggleBtn.style.display = fillAvailable ? 'inline-flex' : 'none';
      fillToggleBtn.classList.toggle('active', !!fillActive);
      fillToggleBtn.setAttribute('aria-pressed', fillActive ? 'true' : 'false');
      const badge = fillToggleBtn.querySelector('.fill-perc') as HTMLElement | null;
    if (badge) {
      let val: number | undefined = undefined;
      if (selCircleId !== null) val = selCircle?.fillOpacity as number | undefined;
      else if (impliedPolygonId !== null) val = polygonGet(impliedPolygonId)?.fillOpacity as number | undefined;
      if (val === undefined) {
        badge.classList.add('hidden');
        badge.textContent = '';
      } else {
        badge.classList.remove('hidden');
        badge.textContent = `${Math.round((val || 0) * 100)}%`;
      }
    }
  }
  if (polygonLockToggleBtn) {
    const lockAvailable = !labelEditing && selectedPolygonId !== null && selectedSegments.size === 0;
    const lockActive = lockAvailable ? !!polygonGet(selectedPolygonId!)?.locked : false;
    polygonLockToggleBtn.style.display = lockAvailable ? 'inline-flex' : 'none';
    polygonLockToggleBtn.classList.toggle('active', lockActive);
    polygonLockToggleBtn.setAttribute('aria-pressed', lockActive ? 'true' : 'false');
  }
  const pointTargets = collectPointStyleTargets();
  if (pointHollowToggleBtn) {
    const showPointToggle = !labelEditing && pointTargets.length > 0;
    pointHollowToggleBtn.style.display = showPointToggle ? 'inline-flex' : 'none';
    if (showPointToggle) {
      const allHollow = pointTargets.every((id) => !!getPointById(id)?.style.hollow);
      pointHollowToggleBtn.classList.toggle('active', allHollow);
      pointHollowToggleBtn.setAttribute('aria-pressed', allHollow ? 'true' : 'false');
    } else {
      pointHollowToggleBtn.classList.remove('active');
      pointHollowToggleBtn.setAttribute('aria-pressed', 'false');
    }
  }
  const selPolyRef = selPolyId;
  const selectedPolygonLines = selPolyRef !== null ? polygonLines(selPolyRef) : [];
  const polygonEdgeKeysForStyle =
    selPolyRef !== null && selectedSegments.size === 0 ? polygonEdgeSegmentKeys(selPolyRef) : null;
  const lineIdForStyle = selLineId ?? (selectedPolygonLines.length ? selectedPolygonLines[0] : null);
  const isPoint = selPointId !== null;
  const isLineLike = selLineId !== null || selPolyRef !== null;
  const preferPoints = selectionVertices && (!selectionEdges || selectedSegments.size > 0);
  const editingInk = selectedInkStrokeId !== null || mode === 'handwriting';
  if (labelTextRow) labelTextRow.style.display = labelEditing ? 'flex' : 'none';
  if (labelFontRow) labelFontRow.style.display = labelEditing ? 'flex' : 'none';
  refreshLabelKeyboard(labelEditing);
  updateLabelFontControls();
  updateLabelAlignControl();

  if (labelEditing && selectedLabel) {
    let labelColor = styleColorInput.value;
    let text = '';
    switch (selectedLabel.kind) {
      case 'point': {
        const point = getPointById(selectedLabel.id);
        if (point?.label) {
          labelColor = point.label.color ?? labelColor;
          text = point.label.text ?? '';
        }
        break;
      }
      case 'line': {
        const line = getLineById(selectedLabel.id);
        if (line?.label) {
          labelColor = line.label.color ?? labelColor;
          text = line.label.text ?? '';
        }
        break;
      }
      case 'angle': {
        const angle = getAngleById(selectedLabel.id);
        if (angle?.label) {
          labelColor = angle.label.color ?? labelColor;
          text = angle.label.text ?? '';
        }
        break;
      }
      case 'free':
        {
          const label = getLabelById(selectedLabel.id);
          if (label) {
            labelColor = label.color ?? labelColor;
            text = label.text ?? '';
          }
        }
        break;
    }
    setStyleColorFromValue(labelColor);
    if (labelTextInput) labelTextInput.value = text;
    styleWidthInput.disabled = true;
    styleTypeSelect.disabled = true;
  } else if (lineIdForStyle !== null) {
    const line = getLineById(lineIdForStyle);
    if (!line) {
      updateLineWidthControls();
      return;
    }
    let style = line.segmentStyles?.[0] ?? line.style;
    const pickSegmentStyle = (key: string) => {
      const parsed = parseSegmentKey(key);
      if (!parsed || parsed.part !== 'segment' || parsed.seg === undefined) return false;
      if (String(parsed.lineId) !== String(lineIdForStyle)) return false;
      style = line.segmentStyles?.[parsed.seg] ?? line.style;
      return true;
    };
    if (selectedSegments.size > 0) {
      for (const key of selectedSegments) {
        if (pickSegmentStyle(key)) break;
      }
    } else if (polygonEdgeKeysForStyle && polygonEdgeKeysForStyle.size > 0) {
      for (const key of polygonEdgeKeysForStyle) {
        if (pickSegmentStyle(key)) break;
      }
    }
    if (preferPoints) {
      const ptId = line.points[0];
      const pt = ptId !== undefined ? getPointById(ptId) : null;
      const base = pt ?? { style: { color: style.color, size: THEME.pointSize } as PointStyle };
      setStyleColorFromValue(base.style.color);
      styleWidthInput.value = String(base.style.size);
      styleTypeSelect.value = 'solid';
      styleWidthInput.disabled = false;
      styleTypeSelect.disabled = true;
    } else {
      setStyleColorFromValue(style.color);
      styleWidthInput.value = String(style.width);
      styleTypeSelect.value = style.type;
      styleWidthInput.disabled = false;
      styleTypeSelect.disabled = false;
    }
  } else if (selCircleId !== null && selCircle) {
    const c = selCircle;
    const arcs = circleArcs(selCircleId);
    const style =
      selectedArcSegments.size > 0
        ? (() => {
            const key = Array.from(selectedArcSegments)[0];
            const parsed = parseArcKey(key);
            if (parsed && parsed.circleId === selCircleId && arcs[parsed.arcIdx]) {
              return arcs[parsed.arcIdx].style;
            }
            return c.style;
          })()
        : c.style;
    setStyleColorFromValue(style.color);
    styleWidthInput.value = String(style.width);
    styleTypeSelect.value = style.type;
    styleWidthInput.disabled = false;
    styleTypeSelect.disabled = false;
  } else if (selAngleId !== null) {
    const ang = getAngleById(selAngleId);
    if (!ang) {
      updateLineWidthControls();
      return;
    }
    const style = ang.style;
    setStyleColorFromValue(style.color);
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
  } else if (selPointId !== null) {
    const pt = getPointById(selPointId);
    if (!pt) {
      updateLineWidthControls();
      return;
    }
    setStyleColorFromValue(pt.style.color);
    styleWidthInput.value = String(pt.style.size);
    styleTypeSelect.value = 'solid';
    styleWidthInput.disabled = false;
    styleTypeSelect.disabled = true;
  } else if (selectedInkStrokeId !== null) {
    const stroke = getInkStrokeById(selectedInkStrokeId);
    if (stroke) {
      setStyleColorFromValue(stroke.color);
      styleWidthInput.value = String(stroke.baseWidth);
      styleTypeSelect.value = 'solid';
      styleWidthInput.disabled = false;
      styleTypeSelect.disabled = true;
    }
  } else if (preferPoints && selLineId !== null) {
    const line = getLineById(selLineId);
    const firstPt = line?.points[0];
    const pt = firstPt !== undefined ? getPointById(firstPt) : null;
    const base = pt ?? { style: { color: styleColorInput.value, size: THEME.pointSize } as PointStyle };
    setStyleColorFromValue(base.style.color);
    styleWidthInput.value = String(base.style.size);
    styleTypeSelect.value = 'solid';
    styleWidthInput.disabled = false;
    styleTypeSelect.disabled = true;
  } else if (preferPoints && selectedPolygonId !== null) {
    const verts = polygonVerticesOrdered(selectedPolygonId);
    const firstPt = verts[0] !== undefined ? getPointById(verts[0]) : null;
    const base = firstPt ?? { style: { color: styleColorInput.value, size: THEME.pointSize } as PointStyle };
    setStyleColorFromValue(base.style.color);
    styleWidthInput.value = String(base.style.size);
    styleTypeSelect.value = 'solid';
    styleWidthInput.disabled = false;
    styleTypeSelect.disabled = true;
  }
  updateLineWidthControls();
  const showTypeGroup = !isPoint && !labelEditing && selectedInkStrokeId === null && mode !== 'handwriting';
  if (styleTypeInline) {
    styleTypeInline.style.display = showTypeGroup ? 'inline-flex' : 'none';
    setRowVisible(styleTypeRow, false);
  } else {
    setRowVisible(styleTypeRow, showTypeGroup);
  }
  if (styleTypeGap) styleTypeGap.style.display = showTypeGroup ? 'flex' : 'none';
  const showRays = selectedLineId !== null && !labelEditing;
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
  setRowVisible(styleArcRow, selectedAngleId !== null && !labelEditing);
  setRowVisible(styleHideRow, !labelEditing);
  setRowVisible(styleEdgesRow, isLineLike && !labelEditing);
  const styleCircleRow = document.getElementById('styleCircleRow');
  setRowVisible(styleCircleRow, selectedCircleId !== null && !labelEditing);
  setRowVisible(styleColorRow, true);
  if (customColorRow) customColorRow.style.display = customColorRowOpen ? 'flex' : 'none';
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
    exteriorAngleBtn.style.display = selectedAngleId !== null && !labelEditing ? '' : 'none';
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
  if (selectedLineId !== null && raySegmentBtn && rayLeftBtn && rayRightBtn) {
    const line = getLineById(selectedLineId);
    if (!line) return;
    const leftOn = !!line.leftRay && !line.leftRay.hidden;
    const rightOn = !!line.rightRay && !line.rightRay.hidden;
    const segmentOn = !leftOn && !rightOn;
    raySegmentBtn.classList.toggle('active', segmentOn);
    rayLeftBtn.classList.toggle('active', leftOn);
    rayRightBtn.classList.toggle('active', rightOn);
  }
  updateColorButtons();
}

// Used by theme handling.
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
    listPoints().forEach((p) => applyBgFlag((p as any).style));
    listLines().forEach((l: any) => {
      applyBgFlag(l.style);
      if (Array.isArray(l.segmentStyles)) l.segmentStyles.forEach((s: any) => applyBgFlag(s));
      if (l.leftRay) applyBgFlag(l.leftRay);
      if (l.rightRay) applyBgFlag(l.rightRay);
    });
    listCircles().forEach((c: any) => { applyBgFlag(c.style); if (c.fillIsThemeBg) c.fill = THEME.bg; });
    listAngles().forEach((a: any) => applyBgFlag(a.style));
    listPolygons().forEach((p: any, idx: number) => {
      if ((p as any).fillIsThemeBg) {
        polygonSet(idx, (old) => ({ ...old!, fill: THEME.bg } as Polygon));
      }
    });
  } catch {}
  draw();
}

// Used by UI/state updates.
function applyStyleFromInputs() {
  if (!styleColorInput || !styleWidthInput || !styleTypeSelect) return;
  const rawColor = styleColorInput.value;
  const color = colorWithAlpha(rawColor, styleColorAlpha);
  // Remember the raw chosen color (so recentColors/history still reflects the selection)
  rememberColor(rawColor);
  const width = Number(styleWidthInput.value) || 1;
  const type = styleTypeSelect.value as StrokeStyle['type'];
  let changed = false;
  const applyPointStyle = (pointId: ObjectId) => {
    const pt = getPointById(pointId);
    if (!pt) return;
    runtime.points[String(pointId)] = { ...pt, style: { ...pt.style, color, size: width } };
    changed = true;
  };
  const applyPointsForLine = (lineId: ObjectId) => {
    if (!selectionVertices) return;
    const line = getLineById(lineId);
    if (!line) return;
    const seen = new Set<ObjectId>();
    line.points.forEach((pi) => {
      if (seen.has(pi)) return;
      seen.add(pi);
      applyPointStyle(pi);
    });
  };
  const applyPointsForPolygon = (polyId: ObjectId) => {
    if (!selectionVertices) return;
    const poly = polygonGet(polyId);
    if (!poly) return;
    const seen = new Set<ObjectId>();
    const verts = polygonVertices(polyId);
    verts.forEach((pi) => {
      if (seen.has(pi)) return;
      seen.add(pi);
      applyPointStyle(pi);
    });
  };
  const selLineId = selectedLineId ?? null;
  const selPolyRef = selectedPolygonId ?? (selLineId ? polygonForLine(selLineId) : null);
  const selCircleId = selectedCircleId ?? null;
  const selCircle = selCircleId ? getCircleById(selCircleId) : null;
  const selAngleId = selectedAngleId ?? null;
  const selPointId = selectedPointId ?? null;
  const polygonEdgeKeys =
    selectedSegments.size === 0 && selectedPolygonId !== null && selectionEdges
      ? polygonEdgeSegmentKeys(selectedPolygonId)
      : null;
  if (selectedLabel) {
    switch (selectedLabel.kind) {
      case 'point': {
        const point = getPointById(selectedLabel.id);
        if (point?.label) {
          runtime.points[String(point.id)] = { ...point, label: { ...point.label, color } };
          changed = true;
        }
        break;
      }
      case 'line': {
        const line = getLineById(selectedLabel.id);
        if (line?.label) {
          runtime.lines[String(line.id)] = { ...line, label: { ...line.label, color } };
          changed = true;
        }
        break;
      }
      case 'angle': {
        const angle = getAngleById(selectedLabel.id);
        if (angle?.label) {
          runtime.angles[String(angle.id)] = { ...angle, label: { ...angle.label, color } };
          changed = true;
        }
        break;
      }
      case 'free':
        {
          const label = getLabelById(selectedLabel.id);
          if (label) {
            runtime.labels[String(label.id)] = { ...label, color };
            changed = true;
          }
        }
        break;
    }
    if (changed) {
      draw();
      pushHistory();
    }
    return;
  }
  const applyStyleToLine = (lineId: ObjectId, segmentKeysOverride?: Set<string> | null) => {
    const canStyleLine = selectionEdges || selectedSegments.size > 0;
    if (!canStyleLine) return;
    ensureSegmentStylesForLine(lineId);
    const line = getLineById(lineId);
    if (!line) return;
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

    const segmentKeys =
      selectedSegments.size > 0 ? selectedSegments : (segmentKeysOverride && segmentKeysOverride.size > 0 ? segmentKeysOverride : null);
    if (segmentKeys && segmentKeys.size > 0) {
      segmentKeys.forEach((key) => {
        const parsed = parseSegmentKey(key);
        if (!parsed || String(parsed.lineId) !== String(lineId)) return;
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
    if (selLineId !== null || selPolyRef !== null) {
      if (selPolyRef !== null) {
        const pls = polygonLines(selPolyRef);
        pls.forEach((lineId) => {
          const segmentKeys = selPolyRef === selectedPolygonId ? polygonEdgeKeys : null;
          applyStyleToLine(lineId, segmentKeys);
          applyPointsForLine(lineId);
        });
        const poly = polygonGet(selPolyRef);
        if (poly) applyPointsForPolygon(selPolyRef);
        if (poly && (poly as any).fill !== undefined && (poly as any).fill !== color) {
          polygonSet(selPolyRef, (old) => ({ ...old!, fill: color } as Polygon));
          changed = true;
        }
      }
      if (selLineId !== null) {
        applyStyleToLine(selLineId);
        applyPointsForLine(selLineId);

        // If the selected line belongs to a polygon that already has fill, keep the fill color in sync.
        const polyId = polygonForLine(selLineId);
        if (polyId !== null) {
          const poly = polygonGet(polyId);
          if (poly?.fill !== undefined && poly.fill !== color) {
            polygonSet(polyId, (old) => ({ ...old!, fill: color } as Polygon));
            changed = true;
          }
        }
      }
    } else if (selCircleId !== null && selCircle) {
      const c = selCircle;
      const arcs = circleArcs(selCircleId);
      const segCount = arcs.length;
      ensureArcStyles(selCircleId, segCount);
      if (c.fill !== undefined && c.fill !== color) {
        c.fill = color;
        changed = true;
      }
      const applyArc = (arcIdx: number) => {
        const arcs = circleArcs(selCircleId);
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
          if (!parsed || parsed.circleId !== selCircleId) return;
          if (parsed.arcIdx >= 0 && parsed.arcIdx < segCount) applyArc(parsed.arcIdx);
        });
      } else {
        c.style = { ...c.style, color, width, type };
        changed = true;
        for (let i = 0; i < segCount; i++) applyArc(i);
      }
    } else if (selAngleId !== null) {
      const ang = getAngleById(selAngleId);
      if (!ang) return;
      const arcBtn = arcCountButtons.find((b) => b.classList.contains('active'));
      const arcCount = arcBtn ? Number(arcBtn.dataset.count) || 1 : ang.style.arcCount ?? 1;
      const right = rightAngleBtn ? rightAngleBtn.classList.contains('active') : false;
      runtime.angles[String(ang.id)] = { ...ang, style: { ...ang.style, color, width, type, arcCount, right } };
      changed = true;
    } else if (selPointId !== null) {
      const pt = getPointById(selPointId);
      if (!pt) return;
      runtime.points[String(pt.id)] = { ...pt, style: { ...pt.style, color, size: width } };
      changed = true;
    } else if (selectedInkStrokeId !== null) {
    const stroke = getInkStrokeById(selectedInkStrokeId);
    if (stroke) {
      runtime.inkStrokes[String(selectedInkStrokeId)] = { ...stroke, color, baseWidth: width, opacity: highlighterActive ? highlighterAlpha : stroke.opacity };
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

// Used by circle tools.
function addCircleWithCenter(centerId: ObjectId, radius: number, points: ObjectId[]): string | null {
  const style = currentStrokeStyle();
  const center = getPointById(centerId);
  const id = nextId('circle', runtime);
  if (!center) return null;
  const assignedPoints = points.length
    ? points
    : [addPoint(runtime, { x: center.x + radius, y: center.y, style: currentPointStyle() })];
  const adjustedPoints: string[] = [];
  assignedPoints.forEach((pid, i) => {
    const pt = getPointById(pid);
    if (!pt) return;
    const angle = Math.atan2(pt.y - center.y, pt.x - center.x);
    const safeAngle = Number.isFinite(angle) ? angle : i * (Math.PI / 4);
    const pos = { x: center.x + Math.cos(safeAngle) * radius, y: center.y + Math.sin(safeAngle) * radius };
    runtime.points[String(pt.id)] = { ...pt, ...pos };
    if (i > 0) adjustedPoints.push(pid);
  });
  const radiusPointId = assignedPoints[0];
  if (!Number.isFinite(radius) || radius < 1e-6) return null;
  const circle: CircleWithCenter = {
    object_type: 'circle',
    id,
    center: centerId,
    radius_point: radiusPointId,
    points: adjustedPoints,
    style,
    circle_kind: 'center-radius',
    construction_kind: 'free',
    defining_parents: [],
    recompute: () => {},
    on_parent_deleted: () => {}
  };
  dispatchAction({ type: 'ADD', kind: 'circle', payload: circle });
  // Don't change construction_kind of existing free points - they define the circle, but aren't constrained by it
  // Only mark additional points as on_object
  adjustedPoints.forEach((pid) => applyPointConstruction(pid, [{ kind: 'circle', id }]));
  return id;
}

// Used by circle tools.
function addCircleThroughPoints(definingPoints: [string, string, string]): string | null {
  const unique = Array.from(new Set(definingPoints));
  if (unique.length !== 3) return null;
  const [aId, bId, cId] = unique as [string, string, string];
  const a = getPointById(aId);
  const b = getPointById(bId);
  const c = getPointById(cId);
  if (!a || !b || !c) return null;
  const centerPos = circleFromThree(a, b, c);
  if (!centerPos) return null;
  const centerIdx = addPoint(runtime, { ...centerPos, style: currentPointStyle() });
  const radius = Math.hypot(centerPos.x - a.x, centerPos.y - a.y);
  if (!Number.isFinite(radius) || radius < 1e-6) {
    removePointsKeepingOrder([centerIdx]);
    return null;
  }
  const style = currentStrokeStyle();
  const id = nextId('circle', runtime);
  const circle: CircleThroughPoints = {
    object_type: 'circle',
    id,
    center: centerIdx,
    radius_point: aId,
    points: [],
    style,
    circle_kind: 'three-point',
    defining_points: [aId, bId, cId],
    construction_kind: 'free',
    defining_parents: [],
    recompute: () => {},
    on_parent_deleted: () => {}
  };
  dispatchAction({ type: 'ADD', kind: 'circle', payload: circle });
  return id;
}

// Used by main UI flow.
function segmentsAdjacent(line: Line, aId: string, bId: string): boolean {
  for (let i = 0; i < line.points.length - 1; i++) {
    const p = String(line.points[i]);
    const n = String(line.points[i + 1]);
    if ((p === aId && n === bId) || (p === bId && n === aId)) return true;
  }
  return false;
}

// Used by main UI flow.
function resolveBisectSegment(ref: BisectSegmentRef, vertexId: string): { lineId: ObjectId; otherId: string; length: number } | null {
  const line = getLineById(ref.lineId);
  if (!line) return null;
  const aId = String(ref.a);
  const bId = String(ref.b);
  const linePointIds = line.points.map((p) => String(p));
  if (!linePointIds.includes(aId) || !linePointIds.includes(bId)) return null;
  if (!segmentsAdjacent(line, aId, bId)) return null;
  if (aId !== vertexId && bId !== vertexId) return null;
  const otherId = aId === vertexId ? bId : aId;
  const vertex = getPointById(vertexId);
  const other = getPointById(otherId);
  if (!vertex || !other) return null;
  const length = Math.hypot(other.x - vertex.x, other.y - vertex.y);
  if (!Number.isFinite(length) || length < 1e-6) return null;
  return { lineId: line.id, otherId, length };
}

// Used by line tools.
function reflectPointAcrossLine(source: { x: number; y: number }, line: Line): { x: number; y: number } | null {
  if (!line || line.points.length < 2) return null;
  const aId = line.points[0];
  const bId = line.points[line.points.length - 1];
  const a = getPointById(aId);
  const b = getPointById(bId);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) return null;
  const t = ((source.x - a.x) * dx + (source.y - a.y) * dy) / lenSq;
  const proj = { x: a.x + dx * t, y: a.y + dy * t };
  return { x: 2 * proj.x - source.x, y: 2 * proj.y - source.y };
}

// Used by circle tools.
function findCircles(
  p: { x: number; y: number },
  tolerance = currentHitRadius(),
  includeInterior = true
): CircleHit[] {
  const hits: CircleHit[] = [];
  const circles = listCircles();
  for (let i = circles.length - 1; i >= 0; i--) {
    const c = circles[i];
    if (c.hidden && !showHidden) continue;
    const center = getPointById(c.center);
    if (!center) continue;
    const radius = circleRadius(c);
    if (radius <= 0) continue;
    const dist = Math.hypot(center.x - p.x, center.y - p.y);
    if (Math.abs(dist - radius) <= tolerance || (includeInterior && dist <= radius)) {
      hits.push({ circleId: c.id });
    }
  }
  return hits;
}

// Used by circle tools.
function findCircle(
  p: { x: number; y: number },
  tolerance = currentHitRadius(),
  includeInterior = true
): CircleHit | null {
  const hits = findCircles(p, tolerance, includeInterior);
  if (!hits.length) return null;
  // Prefer a circle hit that corresponds to a visible arc when the circle has explicit arcs.
  for (const h of hits) {
    const cid = h.circleId;
    const arcs = circleArcs(cid);
    if (arcs.length === 0) return h; // full-circle strokes accept immediately
    const arcAtPos = findArcAt(p, tolerance, cid);
    if (arcAtPos) return h;
    // otherwise continue to next hit
  }
  return null;
}

// Used by line tools.
function createOffsetLineThroughPoint(kind: 'parallel' | 'perpendicular', pointRef: ObjectId, baseLineRef: ObjectId) {
  if (kind === 'parallel') {
    return createParallelLineThroughPoint(pointRef, baseLineRef);
  }
  if (kind === 'perpendicular') {
    return createPerpendicularLineThroughPoint(pointRef, baseLineRef);
  }
  return null;
}

// Used by line tools.
function primaryLineDirection(line: Line): { dir: { x: number; y: number }; length: number } | null {
  const candidateIds = [...(line.defining_points ?? []), ...(line.points ?? [])];
  const seen = new Set<string>();
  let origin: Point | null = null;
  for (const pid of candidateIds) {
    if (pid === undefined || pid === null) continue;
    const key = String(pid);
    if (seen.has(key)) continue;
    seen.add(key);
    const pt = getPointById(pid);
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

// Used by line tools.
function createParallelLineThroughPoint(pointRef: ObjectId, baseLineRef: ObjectId): string | null {
  const anchor = getPointById(pointRef);
  const baseLine = getLineById(baseLineRef);
  if (!anchor || !baseLine || !baseLine.id || !anchor.id) return null;
  const dirInfo = primaryLineDirection(baseLine);
  if (!dirInfo) return null;
  const helperDistance = 0.001;
  const helperPos = {
    x: anchor.x + dirInfo.dir.x * helperDistance,
    y: anchor.y + dirInfo.dir.y * helperDistance
  };
  const helperId = addPoint(runtime, {
    ...helperPos,
    style: { color: anchor.style.color, size: anchor.style.size, hidden: true },
    construction_kind: 'free'
  });
  const helperPoint = getPointById(helperId);
  if (!helperPoint) return null;
  const baseStroke = baseLine.segmentStyles?.[0] ?? baseLine.style;
  const style: StrokeStyle = { ...baseStroke, hidden: false };
  const id = nextId('line', runtime);
  const meta: ParallelLineMeta = {
    throughPoint: anchor.id,
    referenceLine: baseLine.id,
    helperPoint: helperPoint.id
  };
  const parallelLine: ParallelLine = {
    object_type: 'line',
    id,
    points: [anchor.id, helperPoint.id],
    defining_points: [anchor.id, helperPoint.id],
    segmentStyles: [{ ...style }],
    segmentKeys: [segmentKeyForPoints(anchor.id, helperPoint.id)],
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
  dispatchAction({ type: 'ADD', kind: 'line', payload: parallelLine });
  const stored = getLineById(id);
  if (stored) {
    runtime.lines[String(id)] = {
      ...stored,
      recompute: () => recomputeParallelLine(id)
    } as ParallelLine;
  }
  runtime.points[String(helperPoint.id)] = { ...helperPoint, parallel_helper_for: id };
  applyPointConstruction(helperPoint.id, [{ kind: 'line', id }]);
  recomputeParallelLine(id);
  ensureSegmentStylesForLine(id);
  updateIntersectionsForLine(id);
  updateMidpointsForPoint(helperPoint.id);
  return id;
}

// Used by line tools.
function createPerpendicularLineThroughPoint(pointRef: ObjectId, baseLineRef: ObjectId): string | null {
  const anchor = getPointById(pointRef);
  const baseLine = getLineById(baseLineRef);
  if (!anchor || !baseLine || !baseLine.id || !anchor.id) return null;
  const dirInfo = primaryLineDirection(baseLine);
  if (!dirInfo) return null;
  const baseLength = lineLength(baseLine.id) ?? dirInfo.length;
  const baseNormal = { x: -dirInfo.dir.y, y: dirInfo.dir.x };
  const baseFirstId = baseLine.points[0];
  const baseLastId = baseLine.points[baseLine.points.length - 1];
  const baseFirst = baseFirstId !== undefined ? getPointById(baseFirstId) : null;
  const baseLast = baseLastId !== undefined ? getPointById(baseLastId) : null;
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

  const helperId = addPoint(runtime, {
    ...helperPos,
    style: { color: anchor.style.color, size: anchor.style.size, hidden: helperHidden },
    construction_kind: 'free'
  });
  if (helperMode === 'projection') {
    insertPointIntoLine(baseLine.id, helperId, helperPos);
  }
  let helperPoint = helperId ? getPointById(helperId) : null;
  if (!helperPoint) return null;
  const helperVector = { x: helperPoint.x - anchor.x, y: helperPoint.y - anchor.y };
  let helperDistance = Math.hypot(helperVector.x, helperVector.y);
  if (!Number.isFinite(helperDistance) || helperDistance < 1e-3) {
    helperDistance = Math.max(baseLength, 120);
  }
  const helperOrientation: 1 | -1 = helperVector.x * baseNormal.x + helperVector.y * baseNormal.y >= 0 ? 1 : -1;
  const baseStroke = baseLine.segmentStyles?.[0] ?? baseLine.style;
  const style: StrokeStyle = { ...baseStroke, hidden: false };
  const id = nextId('line', runtime);
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
    points: [anchor.id, helperPoint.id],
    defining_points: [anchor.id, helperPoint.id],
    segmentStyles: [{ ...style }],
    segmentKeys: [segmentKeyForPoints(anchor.id, helperPoint.id)],
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
  dispatchAction({ type: 'ADD', kind: 'line', payload: perpendicularLine });
  const stored = getLineById(id);
  if (stored) {
    runtime.lines[String(id)] = {
      ...stored,
      recompute: () => recomputePerpendicularLine(id)
    } as PerpendicularLine;
  }
  helperPoint = getPointById(helperPoint.id);
  if (!helperPoint) return null;
  runtime.points[String(helperPoint.id)] = { ...helperPoint, perpendicular_helper_for: id };
  const helperParents: ConstructionParent[] = [{ kind: 'line', id }];
  if (helperMode === 'projection' && baseLine.id) {
    helperParents.push({ kind: 'line', id: baseLine.id });
  }
  applyPointConstruction(helperPoint.id, helperParents);
  recomputePerpendicularLine(id);
  ensureSegmentStylesForLine(id);
  updateIntersectionsForLine(id);
  updateMidpointsForPoint(helperPoint.id);
  return id;
}

// Used by history tracking.
function pushHistory() {
  refreshLabelPoolsFromRuntime();
  rebuildIndexMaps();
  const snapshot: Snapshot = {
    runtime: deepClone(runtime),
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

// Used by main UI flow.
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

function stripEmptyFields<T extends Record<string, any>>(obj: T): T {
  Object.keys(obj).forEach((key) => {
    const value = (obj as any)[key];
    if (value === undefined || value === null) {
      delete (obj as any)[key];
      return;
    }
    if (Array.isArray(value) && value.length === 0) {
      delete (obj as any)[key];
      return;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      if (Object.keys(value).length === 0) {
        delete (obj as any)[key];
      }
    }
  });
  return obj;
}

function strokeStyleEquals(a?: StrokeStyle, b?: StrokeStyle): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.color === b.color &&
    a.width === b.width &&
    a.type === b.type &&
    a.hidden === b.hidden &&
    a.tick === b.tick
  );
}

function compactLabel<T extends Record<string, any>>(label: T | undefined | null): T | undefined {
  if (!label) return undefined;
  const clone = deepClone(label);
  if (clone.offset) stripEmptyFields(clone.offset);
  return stripEmptyFields(clone);
}

function hasSegmentStyleOverrides(line: Line): boolean {
  if (!Array.isArray(line.segmentStyles) || line.segmentStyles.length === 0) return false;
  return line.segmentStyles.some((style) => !strokeStyleEquals(style, line.style));
}

function isDefaultRay(ray: StrokeStyle | undefined, baseStyle: StrokeStyle): boolean {
  if (!ray) return true;
  const baseRay: StrokeStyle = { ...baseStyle, hidden: true };
  return strokeStyleEquals(ray, baseRay);
}

// Used by main UI flow.
function serializeCurrentDocument(): PersistedDocument {
  refreshLabelPoolsFromRuntime();
  rebuildIndexMaps();
  const pointData = listPoints().map((point) => {
    const out: PersistedPoint = {
      id: point.id,
      x: point.x,
      y: point.y,
      style: deepClone(point.style)
    };
    const label = compactLabel(point.label as any);
    if (label) out.label = label;
    if (point.construction_kind && point.construction_kind !== 'free') out.construction_kind = point.construction_kind;
    if (Array.isArray(point.parent_refs) && point.parent_refs.length) out.parent_refs = deepClone(point.parent_refs);
    if (Array.isArray(point.defining_parents) && point.defining_parents.length) out.defining_parents = [...point.defining_parents];
    if (point.created_group) out.created_group = point.created_group;
    if (point.parallel_helper_for) out.parallel_helper_for = point.parallel_helper_for;
    if (point.perpendicular_helper_for) out.perpendicular_helper_for = point.perpendicular_helper_for;
    if (point.midpointMeta) out.midpointMeta = deepClone(point.midpointMeta);
    if (point.bisectMeta) out.bisectMeta = deepClone(point.bisectMeta);
    if (point.symmetricMeta) out.symmetricMeta = deepClone(point.symmetricMeta);
    return stripEmptyFields(out);
  });
  const lineData = listLines().map((line) => {
    const out: PersistedLine = {
      id: line.id,
      points: [...line.points],
      style: deepClone(line.style)
    };
    const first = line.points[0];
    const last = line.points[line.points.length - 1];
    if (
      Array.isArray(line.defining_points) &&
      line.defining_points.length === 2 &&
      (String(line.defining_points[0]) !== String(first) || String(line.defining_points[1]) !== String(last))
    ) {
      out.defining_points = [...line.defining_points];
    }
    if (hasSegmentStyleOverrides(line)) out.segmentStyles = deepClone(line.segmentStyles);
    const label = compactLabel(line.label as any);
    if (label) out.label = label;
    if (line.hidden) out.hidden = true;
    if (line.construction_kind && line.construction_kind !== 'free') out.construction_kind = line.construction_kind;
    if (Array.isArray(line.defining_parents) && line.defining_parents.length) out.defining_parents = [...line.defining_parents];
    if (line.parallel) out.parallel = deepClone(line.parallel);
    if (line.perpendicular) out.perpendicular = deepClone(line.perpendicular);
    if (!isDefaultRay(line.leftRay, line.style)) out.leftRay = deepClone(line.leftRay);
    if (!isDefaultRay(line.rightRay, line.style)) out.rightRay = deepClone(line.rightRay);
    if ((line as any).bisector) out.bisector = deepClone((line as any).bisector);
    return stripEmptyFields(out);
  });
  const circleData = listCircles().map((circle) => {
    const out: PersistedCircle = {
      id: circle.id,
      center: circle.center,
      style: deepClone(circle.style)
    };
    if (circle.radius_point) out.radius_point = circle.radius_point;
    if (Array.isArray(circle.points) && circle.points.length) out.points = deepClone(circle.points);
    if (Array.isArray(circle.defining_points) && circle.defining_points.length) out.defining_points = deepClone(circle.defining_points);
    const label = compactLabel(circle.label as any);
    if (label) out.label = label;
    if (circle.hidden) out.hidden = true;
    if (circle.fill !== undefined) out.fill = circle.fill;
    if (circle.fillOpacity !== undefined) out.fillOpacity = circle.fillOpacity;
    if (circle.arcStyles && Object.keys(circle.arcStyles).length) out.arcStyles = deepClone(circle.arcStyles);
    if (circle.construction_kind && circle.construction_kind !== 'free') out.construction_kind = circle.construction_kind;
    if (Array.isArray(circle.defining_parents) && circle.defining_parents.length) out.defining_parents = [...circle.defining_parents];
    if (circle.circle_kind && circle.circle_kind !== 'center-radius') out.circle_kind = circle.circle_kind;
    return stripEmptyFields(out);
  });
  const angleData = listAngles().map((angle) => {
    const out: PersistedAngle = {
      id: angle.id,
      vertex: angle.vertex,
      style: deepClone(angle.style)
    };
    if (angle.point1 !== undefined) out.point1 = angle.point1;
    if (angle.point2 !== undefined) out.point2 = angle.point2;
    if (angle.arm1LineId !== undefined) out.arm1LineId = angle.arm1LineId;
    if (angle.arm2LineId !== undefined) out.arm2LineId = angle.arm2LineId;
    const label = compactLabel(angle.label as any);
    if (label) out.label = label;
    if (angle.hidden) out.hidden = true;
    if (angle.construction_kind && angle.construction_kind !== 'free') out.construction_kind = angle.construction_kind;
    if (Array.isArray(angle.defining_parents) && angle.defining_parents.length) out.defining_parents = [...angle.defining_parents];
    return stripEmptyFields(out);
  });
  // Ensure exported angle leg.line references use line ids when possible
  if (angleData && angleData.length) {
    const pointsArr = listPoints();
    const linesArr = listLines();
    angleData.forEach((a: any) => {
      try {
        const leg1Ref = getAngleArmRef(a, 1);
        if (a && a.leg1 && typeof leg1Ref === 'number') {
          const idx = Number(leg1Ref);
          const id = linesArr[idx]?.id;
          if (typeof id === 'string') a.leg1.line = id;
        }
        const leg2Ref = getAngleArmRef(a, 2);
        if (a && a.leg2 && typeof leg2Ref === 'number') {
          const idx2 = Number(leg2Ref);
          const id2 = linesArr[idx2]?.id;
          if (typeof id2 === 'string') a.leg2.line = id2;
        }
        // Prefer canonical persisted shape: emit point1/point2 as line IDs (strings)
        // and runtime arm ids `arm1LineId`/`arm2LineId`. Remove deprecated `leg1`/`leg2`.
        try {
          // convert numeric point refs to ids
          if (typeof a.point1 === 'number') {
            const p = pointsArr[a.point1];
            if (p && typeof p.id === 'string') a.point1 = p.id;
          }
          if (typeof a.point2 === 'number') {
            const p2 = pointsArr[a.point2];
            if (p2 && typeof p2.id === 'string') a.point2 = p2.id;
          }
          // vertex: prefer id when available
          if (typeof a.vertex === 'number') {
            const pv = pointsArr[a.vertex];
            if (pv && typeof pv.id === 'string') a.vertex = pv.id;
          }
          // populate arm1LineId / arm2LineId from existing leg or arm refs
          const arm1Ref = getAngleArmRef(a, 1);
          if (typeof arm1Ref === 'number') {
            const li = linesArr[Number(arm1Ref)];
            if (li && typeof li.id === 'string') a.arm1LineId = li.id;
          } else if (typeof arm1Ref === 'string') {
            a.arm1LineId = arm1Ref;
          }
          const arm2Ref = getAngleArmRef(a, 2);
          if (typeof arm2Ref === 'number') {
            const li2 = linesArr[Number(arm2Ref)];
            if (li2 && typeof li2.id === 'string') a.arm2LineId = li2.id;
          } else if (typeof arm2Ref === 'string') {
            a.arm2LineId = arm2Ref;
          }
          // drop legacy leg fields to keep persisted payloads canonical
          if (a.leg1) delete a.leg1;
          if (a.leg2) delete a.leg2;
        } catch {}
      } catch {}
    });
  }
  const polygonData = listPolygons().map((polygon) => {
    const out: PersistedPolygon = {
      id: polygon.id,
      points: [...polygon.points]
    };
      if (polygon.fill !== undefined) out.fill = polygon.fill;
      if (polygon.fillOpacity !== undefined) out.fillOpacity = polygon.fillOpacity;
      if (polygon.hidden) out.hidden = true;
      if (polygon.locked) out.locked = true;
      if (polygon.construction_kind && polygon.construction_kind !== 'free') out.construction_kind = polygon.construction_kind;
    if (Array.isArray(polygon.defining_parents) && polygon.defining_parents.length) out.defining_parents = [...polygon.defining_parents];
    return stripEmptyFields(out);
  });
  const persistedModel: PersistedModel = {};
  if (pointData.length) persistedModel.points = pointData;
  if (lineData.length) persistedModel.lines = lineData;
  if (circleData.length) persistedModel.circles = circleData;
  if (angleData.length) persistedModel.angles = angleData;
  if (polygonData.length) persistedModel.polygons = polygonData;
  if (listInkStrokes().length) persistedModel.inkStrokes = deepClone(listInkStrokes());
  if (listLabels().length) persistedModel.labels = deepClone(listLabels());

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

// Used by main UI flow.
function centerConstruction() {
  // Oblicz bounding box wszystkich obiektów w konstrukcji
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  
  // Uwzględnij punkty
  listPoints().forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  });
  
  // Uwzględnij środki i promienie okręgów
  listCircles().forEach((circle) => {
    const cp = getPointById(circle.center);
    const rp = circle.radius_point !== undefined ? getPointById(circle.radius_point) : null;
    if (cp && rp) {
      const radius = Math.sqrt((cp.x - rp.x) ** 2 + (cp.y - rp.y) ** 2);
      minX = Math.min(minX, cp.x - radius);
      maxX = Math.max(maxX, cp.x + radius);
      minY = Math.min(minY, cp.y - radius);
      maxY = Math.max(maxY, cp.y + radius);
    }
  });
  
  // Uwzględnij swobodne etykiety
  listLabels().forEach((label) => {
    minX = Math.min(minX, label.pos.x);
    maxX = Math.max(maxX, label.pos.x);
    minY = Math.min(minY, label.pos.y);
    maxY = Math.max(maxY, label.pos.y);
  });
  
  // Uwzględnij pisma ręczne
  listInkStrokes().forEach((stroke) => {
    stroke.points.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    });
  });
  
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

// Used by UI/state updates.
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
    const parentRefs: ConstructionParent[] = Array.isArray(rest.parent_refs) ? rest.parent_refs : [];
    const definingParents: ObjectId[] = Array.isArray(rest.defining_parents)
      ? rest.defining_parents
      : parentRefs.map((pr) => pr.id);
    let constructionKind = rest.construction_kind ?? resolveConstructionKind(parentRefs);
    if (rest.midpointMeta) constructionKind = 'midpoint';
    if (rest.bisectMeta) constructionKind = 'bisect';
    if (rest.symmetricMeta) constructionKind = 'symmetric';
    const style = rest.style ?? currentPointStyle();
    // If this point style was saved as theme-background-bound, restore it to current theme
    try {
      if (style && (style as any).colorIsThemeBg) {
        (style as any).color = THEME.bg;
      }
    } catch {}
    return {
      ...rest,
      style,
      parent_refs: parentRefs,
      defining_parents: definingParents,
      construction_kind: constructionKind,
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
    const points: ObjectId[] = Array.isArray(rest.points) ? rest.points : [];
    let definingPoints =
      Array.isArray(rest.defining_points) && rest.defining_points.length === 2
        ? rest.defining_points
        : null;
    if (!definingPoints && rest.parallel) {
      definingPoints = [rest.parallel.throughPoint, rest.parallel.helperPoint];
    }
    if (!definingPoints && rest.perpendicular) {
      definingPoints = [rest.perpendicular.throughPoint, rest.perpendicular.helperPoint];
    }
    if (!definingPoints) {
      definingPoints = points.length >= 2 ? [points[0], points[points.length - 1]] : [points[0] ?? '', points[0] ?? ''];
    }
    const definingParents: ObjectId[] = Array.isArray(rest.defining_parents) ? rest.defining_parents : [];
    let constructionKind = rest.construction_kind ?? 'free';
    if (rest.parallel) constructionKind = 'parallel';
    if (rest.perpendicular) constructionKind = 'perpendicular';
    const style = rest.style ?? currentStrokeStyle();
    try {
      if (style && (style as any).colorIsThemeBg) (style as any).color = THEME.bg;
      if (Array.isArray(rest.segmentStyles)) rest.segmentStyles.forEach((s: any) => { if (s && s.colorIsThemeBg) s.color = THEME.bg; });
      if (rest.leftRay && (rest.leftRay as any).colorIsThemeBg) (rest.leftRay as any).color = THEME.bg;
      if (rest.rightRay && (rest.rightRay as any).colorIsThemeBg) (rest.rightRay as any).color = THEME.bg;
    } catch {}
    return {
      ...rest,
      points,
      defining_points: definingPoints as any,
      defining_parents: definingParents,
      construction_kind: constructionKind,
      style,
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
    const points: ObjectId[] = Array.isArray(rest.points) ? rest.points : [];
    const definingParents: ObjectId[] = Array.isArray(rest.defining_parents) ? rest.defining_parents : [];
    const constructionKind = rest.construction_kind ?? 'free';
    const style = rest.style ?? currentStrokeStyle();
    if (!rest.circle_kind && Array.isArray(rest.defining_points) && rest.defining_points.length === 3) {
      rest.circle_kind = 'three-point';
    }
    try {
      if (style && (style as any).colorIsThemeBg) (style as any).color = THEME.bg;
      if (rest.fillIsThemeBg) rest.fill = THEME.bg;
    } catch {}
    return {
      ...rest,
      points,
      defining_parents: definingParents,
      construction_kind: constructionKind,
      style,
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
    const definingParents: ObjectId[] = Array.isArray(rest.defining_parents) ? rest.defining_parents : [];
    const constructionKind = rest.construction_kind ?? 'free';
    const style = rest.style ?? currentAngleStyle();
    try { if (style && (style as any).colorIsThemeBg) (style as any).color = THEME.bg; } catch {}
    return {
      ...rest,
      defining_parents: definingParents,
      construction_kind: constructionKind,
      style,
      recompute: () => {},
      on_parent_deleted: () => {}
    };
  };
    const toPolygon = (p: PersistedPolygon): Polygon => {
      const clone = deepClone(p) as any;
      const { children: _ignoreChildren, lockRef: _ignoreLockRef, ...rest } = clone;
      const points: ObjectId[] = Array.isArray(rest.points) ? rest.points : [];
      const definingParents: ObjectId[] = Array.isArray(rest.defining_parents) ? rest.defining_parents : [];
      const constructionKind = rest.construction_kind ?? 'free';
      try { if (rest.fillIsThemeBg) rest.fill = THEME.bg; } catch {}
      return {
        ...rest,
        points,
        defining_parents: definingParents,
        construction_kind: constructionKind,
        recompute: () => {},
        on_parent_deleted: () => {}
      };
    };
  const pointsArr = Array.isArray(persistedModel.points) ? persistedModel.points.map(toPoint) : [];
  const linesArr = Array.isArray(persistedModel.lines) ? persistedModel.lines.map(toLine) : [];
  const circlesArr = Array.isArray(persistedModel.circles) ? persistedModel.circles.map(toCircle) : [];
  const anglesArr = Array.isArray(persistedModel.angles) ? persistedModel.angles.map(toAngle) : [];
  const polygonsArr = Array.isArray(persistedModel.polygons) ? persistedModel.polygons.map(toPolygon) : [];
  const inkArr = Array.isArray(persistedModel.inkStrokes) ? deepClone(persistedModel.inkStrokes) : [];
  const labelsArr = Array.isArray(persistedModel.labels)
    ? deepClone(persistedModel.labels).map((label, i) => ({
        ...label,
        id: label.id ?? `lbl${i}`,
        fontSize: persistedFontToDelta(label.fontSize),
        textAlign: normalizeLabelAlignment(label.textAlign)
      }))
    : [];

  const restored: ConstructionRuntime = makeEmptyRuntime();
  pointsArr.forEach((p) => { if (p?.id) restored.points[String(p.id)] = p; });
  linesArr.forEach((l) => { if (l?.id) restored.lines[String(l.id)] = l; });
  circlesArr.forEach((c) => { if (c?.id) restored.circles[String(c.id)] = c; });
  anglesArr.forEach((a) => { if (a?.id) restored.angles[String(a.id)] = a; });
    polygonsArr.forEach((p) => { if (p?.id) restored.polygons[String(p.id)] = p; });
    inkArr.forEach((s) => { if (s?.id) restored.inkStrokes[String(s.id)] = s; });
    labelsArr.forEach((l) => { if (l?.id) restored.labels[String(l.id)] = l; });
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
  pointsArr.forEach((p) => bumpCounter('point', p.id));
  linesArr.forEach((l) => bumpCounter('line', l.id));
  circlesArr.forEach((c) => bumpCounter('circle', c.id));
  anglesArr.forEach((a) => bumpCounter('angle', a.id));
    polygonsArr.forEach((p) => bumpCounter('polygon', p.id));
    restored.idCounters = counters;
    runtime = restored;
    Object.values(runtime.polygons).forEach((poly) => {
      if (poly?.locked) ensurePolygonLockRef(runtime, poly);
    });
  panOffset = { x: 0, y: 0 };
  zoomFactor = 1;
  refreshLabelPoolsFromRuntime(runtime);
  rebuildIndexMaps();
  selectedPointId = null;
  selectedLineId = null;
  selectedCircleId = null;
  selectedAngleId = null;
  selectedPolygonId = null;
  selectedLabel = null;
  selectedSegments.clear();
  selectedArcSegments.clear();
  segmentStartId = null;
  segmentStartTemporary = false;
  circleCenterId = null;
  triangleStartId = null;
  squareStartId = null;
  polygonChain = [];
  currentPolygonLines = [];
  angleFirstLeg = null;
  anglePoints = [];
  bisectorFirstLeg = null;
  bisectPointVertexId = null;
  bisectPointFirstSeg = null;
  midpointFirstId = null;
  symmetricSourceId = null;
  parallelAnchorPointId = null;
  parallelReferenceLineId = null;
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
  hoverPointId = null;
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
      const line = listLines()[legacyLineIdx];
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
    const line = getLineById(lineId);
    if (line && segIdx >= 0 && segIdx + 1 < line.points.length) {
      const currentLength = getSegmentLength(lineId, segIdx);
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

// Used by history navigation.
function undo() {
  if (historyIndex <= 0) return;
  historyIndex -= 1;
  restoreHistory();
}

// Used by history navigation.
function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex += 1;
  restoreHistory();
}

// Used by history navigation.
  function restoreHistory() {
    const snap = history[historyIndex];
    if (!snap) return;
    runtime = deepClone(snap.runtime);
    Object.values(runtime.polygons).forEach((poly) => {
      if (poly?.locked) ensurePolygonLockRef(runtime, poly);
    });
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
  selectedLineId = null;
  selectedPointId = null;
  selectedPolygonId = null;
  selectedCircleId = null;
  selectedAngleId = null;
  selectedArcSegments.clear();
  updateSelectionButtons();
  updateUndoRedoButtons();
  draw();
}

// Used by UI/state updates.
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

// Used by UI controls.
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

// Used by UI controls.
function closeZoomMenu() {
  zoomMenuOpen = false;
  zoomMenuContainer?.classList.remove('open');
}



type ViewModeState = 'edges' | 'vertices' | 'both';

// Used by UI state helpers.
function getViewModeState(): ViewModeState {
  if (selectionEdges && selectionVertices) return 'both';
  if (selectionVertices && !selectionEdges) return 'vertices';
  return 'edges';
}

// Used by UI state helpers.
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

// Used by UI controls.
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

// Used by UI controls.
function closeViewMenu() {
  viewModeOpen = false;
  viewModeMenuContainer?.classList.remove('open');
}

// Used by UI state helpers.
function setRayMode(next: 'segment' | 'left' | 'right') {
  if (selectedLineId === null) return;
  const line = getLineById(selectedLineId);
  if (!line) return;
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

// Used by UI controls.
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

// Used by UI controls.
function closeRayMenu() {
  rayModeOpen = false;
  rayModeMenuContainer?.classList.remove('open');
}

// Used by point tools.
function removePointsAndRelated(points: string[], _removeLines = false) {
  if (!points.length) return;
  const toRemove = new Set(points.map((id) => String(id)));
  const extraPoints: string[] = [];

  listLines().forEach((line) => {
    if (line.defining_points.some((pid) => toRemove.has(pid))) {
      if (isParallelLine(line)) extraPoints.push(line.parallel.helperPoint);
      if (isPerpendicularLine(line)) extraPoints.push(line.perpendicular.helperPoint);
    }
  });

  extraPoints.forEach((pid) => toRemove.add(pid));
  removePointsKeepingOrder(Array.from(toRemove), true);
}

// Used by line tools.
function removeParallelLinesReferencing(lineId: string): string[] {
  if (!lineId) return [];
  const lineIds: string[] = [];
  const helperPoints: string[] = [];
  const removedIds: string[] = [];
  listLines().forEach((line) => {
    if (!isParallelLine(line)) return;
    if (line.parallel.referenceLine !== lineId) return;
    if (line.label) reclaimLabel(line.label);
    removedIds.push(line.id);
    lineIds.push(line.id);
    helperPoints.push(line.parallel.helperPoint);
  });
  if (!lineIds.length) return [];
  const removed = new Set(lineIds);
  replaceRuntimeCollection('lines', listLines().filter((line) => !removed.has(line.id)));
  cleanupAnglesAfterLineRemoval();
  if (helperPoints.length) {
    const uniqueHelpers = Array.from(new Set(helperPoints));
    removePointsKeepingOrder(uniqueHelpers, false);
  } else {
    rebuildIndexMaps();
  }
  cleanupDependentPoints();
  return removedIds;
}

// Used by line tools.
function removePerpendicularLinesReferencing(lineId: string): string[] {
  if (!lineId) return [];
  const lineIds: string[] = [];
  const helperPoints: string[] = [];
  const removedIds: string[] = [];
  listLines().forEach((line) => {
    if (!isPerpendicularLine(line)) return;
    if (line.perpendicular.referenceLine !== lineId) return;
    if (line.label) reclaimLabel(line.label);
    removedIds.push(line.id);
    lineIds.push(line.id);
    helperPoints.push(line.perpendicular.helperPoint);
  });
  if (!lineIds.length) return [];
  const removed = new Set(lineIds);
  replaceRuntimeCollection('lines', listLines().filter((line) => !removed.has(line.id)));
  cleanupAnglesAfterLineRemoval();
  if (helperPoints.length) {
    const uniqueHelpers = Array.from(new Set(helperPoints));
    removePointsKeepingOrder(uniqueHelpers, false);
  } else {
    rebuildIndexMaps();
  }
  cleanupDependentPoints();
  return removedIds;
}

// Used by point tools.
function removePointsKeepingOrder(points: string[], allowCleanup = true) {
  const toRemove = new Set(points.map((id) => String(id)));
  if (!toRemove.size) return;

  const polygonPlans: { id: string; points: string[]; baseStyle: StrokeStyle }[] = [];
  listPolygons().forEach((poly) => {
    if (!poly || !Array.isArray(poly.points) || !poly.points.length) return;
    const ordered = poly.points.map((pid) => String(pid));
    const nextPoints = ordered.filter((pid) => !toRemove.has(pid));
    if (nextPoints.length === ordered.length) return;
    if (nextPoints.length < 3) return;
    let baseStyle: StrokeStyle | null = null;
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i];
      const b = ordered[(i + 1) % ordered.length];
      const lineId = findLineIdForSegment(a, b);
      if (!lineId) continue;
      const line = getLineById(lineId);
      if (line) {
        baseStyle = { ...line.style };
        break;
      }
    }
    polygonPlans.push({ id: poly.id, points: nextPoints, baseStyle: baseStyle ?? currentStrokeStyle() });
  });

  replaceRuntimeCollection('points', listPoints().filter((pt) => {
    if (!pt) return false;
    if (toRemove.has(pt.id)) {
      if (pt.label) reclaimLabel(pt.label);
      return false;
    }
    return true;
  }));

  const removedLineIds = new Set<string>();
  replaceRuntimeCollection('lines', listLines().filter((line) => {
    if (line.defining_points.some((pid) => toRemove.has(pid))) {
      if (line.label) reclaimLabel(line.label);
      removedLineIds.add(line.id);
      return false;
    }
    const nextPoints = line.points.filter((pid) => !toRemove.has(pid));
    if (nextPoints.length < 2) {
      if (line.label) reclaimLabel(line.label);
      removedLineIds.add(line.id);
      return false;
    }
    line.points = nextPoints;
    return true;
  }));

  replaceRuntimeCollection('circles', listCircles().filter((circle) => {
    const removeCircle =
      toRemove.has(circle.center) ||
      (circle.radius_point !== undefined && toRemove.has(circle.radius_point)) ||
      (isCircleThroughPoints(circle) && circle.defining_points.some((pid) => toRemove.has(pid)));
    if (removeCircle) {
      if (circle.label) reclaimLabel(circle.label);
      return false;
    }
    circle.points = circle.points.filter((pid) => !toRemove.has(pid));
    return true;
  }));

  const polygonPlanById = new Map(polygonPlans.map((plan) => [String(plan.id), plan]));
  replaceRuntimeCollection('polygons', listPolygons().filter((poly) => {
    if (!poly) return false;
    const plan = polygonPlanById.get(String(poly.id));
    const nextPoints = plan ? plan.points : (poly.points || []).filter((pid) => !toRemove.has(String(pid)));
    if (nextPoints.length < 3) return false;
    if (plan || nextPoints.length !== (poly.points || []).length) poly.points = nextPoints;
    return true;
  }));

  replaceRuntimeCollection('angles', listAngles().filter((ang) => {
    const removeAngle =
      toRemove.has(ang.vertex) ||
      (ang.point1 && toRemove.has(ang.point1)) ||
      (ang.point2 && toRemove.has(ang.point2));
    if (removeAngle) {
      if (ang.label) reclaimLabel(ang.label);
      return false;
    }
    return true;
  }));

  if (removedLineIds.size) cleanupAnglesAfterLineRemoval();

  if (polygonPlans.length) {
    polygonPlans.forEach((plan) => {
      const poly = listPolygons().find((p) => p && String(p.id) === String(plan.id));
      if (!poly || plan.points.length < 3) return;
      for (let i = 0; i < plan.points.length; i++) {
        const a = plan.points[i];
        const b = plan.points[(i + 1) % plan.points.length];
        if (!findLineIdForSegment(a, b)) {
          addLineFromPoints(runtime, a, b, { ...plan.baseStyle });
        }
      }
    });
  }

  listLines().forEach((line) => ensureSegmentStylesForLine(line.id));
  rebuildIndexMaps();
  if (allowCleanup) cleanupDependentPoints();
}

// Used by cleanup after line deletions.
function cleanupAnglesAfterLineRemoval() {
  const lineIds = new Set(listLines().map((l) => l.id));
  replaceRuntimeCollection('angles', listAngles().filter((ang) => {
    const arm1 = ang.arm1LineId;
    const arm2 = ang.arm2LineId;
    const hasArm1 = !!arm1 && lineIds.has(arm1);
    const hasArm2 = !!arm2 && lineIds.has(arm2);
    const hasPointDef = !!ang.point1 && !!ang.point2;
    if (!hasPointDef && (!hasArm1 || !hasArm2)) {
      if (ang.label) reclaimLabel(ang.label);
      return false;
    }
    if (!hasArm1) delete (ang as any).arm1LineId;
    if (!hasArm2) delete (ang as any).arm2LineId;
    return true;
  }));
}

// Used by point tools.
function cleanupDependentPoints() {
  const orphanIds = new Set<ObjectId>();
  listPoints().forEach((pt) => {
    if (!pt) return;

    // Remove intersection points if one of their parents was deleted
    if (pt.construction_kind === 'intersection') {
      const parents = pt.parent_refs ?? [];
      let missing = false;
      for (const pr of parents) {
        if (pr.kind === 'line') {
          if (!getLineById(pr.id)) missing = true;
        } else if (pr.kind === 'circle') {
          if (!getCircleById(pr.id)) missing = true;
        }
        if (missing) break;
      }
      if (missing) {
        orphanIds.add(pt.id);
      }
    }

    if (isMidpointPoint(pt)) {
      const mm = getMidpointMeta(pt as Point);
      if (!mm || mm.parents.some((pid) => !getPointById(pid))) orphanIds.add(pt.id);
    }
    if (isSymmetricPoint(pt)) {
      const sm = getSymmetricMeta(pt as Point);
      if (!sm) {
        orphanIds.add(pt.id);
      } else {
        const sourceMissing = !getPointById(sm.source);
        const mirrorMissing = sm.mirror.kind === 'point' ? !getPointById(sm.mirror.id) : !getLineById(sm.mirror.id);
        if (sourceMissing || mirrorMissing) orphanIds.add(pt.id);
      }
    }
    if (isBisectPoint(pt)) {
      const bm = getBisectMeta(pt as Point);
      if (!bm) {
        orphanIds.add(pt.id);
      } else {
        const vertex = getPointById(bm.vertex);
        if (!vertex) {
          orphanIds.add(pt.id);
        } else {
          const s1 = resolveBisectSegment(bm.seg1, vertex.id);
          const s2 = resolveBisectSegment(bm.seg2, vertex.id);
          if (!s1 || !s2) orphanIds.add(pt.id);
        }
      }
    }
    if (pt.parallel_helper_for) {
      if (!getLineById(pt.parallel_helper_for)) {
        orphanIds.add(pt.id);
      }
    }
    if (pt.perpendicular_helper_for) {
      if (!getLineById(pt.perpendicular_helper_for)) {
        orphanIds.add(pt.id);
      }
    }
  });
  if (orphanIds.size) {
    // Before removing orphan bisect points, remove any bisector lines that reference them
    const bisectorLineIds: ObjectId[] = [];
    listLines().forEach((line) => {
      const meta = (line as any)?.bisector;
      if (!meta) return;
      const bisectPointId = meta.bisectPoint;
      if (!bisectPointId) return;
      if (orphanIds.has(String(bisectPointId))) bisectorLineIds.push(line.id);
    });
    if (bisectorLineIds.length) {
      bisectorLineIds.forEach((lineId) => {
        const line = getLineById(lineId);
        if (line?.label) reclaimLabel(line.label);
        delete runtime.lines[String(lineId)];
      });
      cleanupAnglesAfterLineRemoval();
      rebuildIndexMaps();
    }
    removePointsKeepingOrder(Array.from(orphanIds), false);
  }
}

// Used by point tools.
function pointUsedAnywhere(pointId: ObjectId): boolean {
  const point = getPointById(pointId);
  if (!point) return false;
  const usedByLines = listLines().some((line) => line.points.some((pid) => String(pid) === String(pointId)));
  if (usedByLines) return true;
  const usedByCircles = listCircles().some((circle) => {
    if (String(circle.center) === String(pointId) || String(circle.radius_point) === String(pointId)) return true;
    return circle.points.some((pid) => String(pid) === String(pointId));
  });
  if (usedByCircles) return true;
  const usedByAngles = listAngles().some((angle) => String(angle.vertex) === String(pointId));
  if (usedByAngles) return true;
  const usedByPolygons = listPolygons().some((poly) => {
    const verts = polygonVertices(poly.id);
    return verts.includes(String(pointId));
  });
  if (usedByPolygons) return true;
  if (point.parent_refs.length > 0) return true;
  if (point.parallel_helper_for || point.perpendicular_helper_for) return true;
  return false;
}

// Used by label UI flow.
function clearPointLabelIfUnused(pointId: ObjectId) {
  const point = getPointById(pointId);
  if (!point?.label) return;
  if (pointUsedAnywhere(pointId)) return;
  reclaimLabel(point.label);
  runtime.points[String(point.id)] = { ...point, label: undefined };
}

// Used by line tools.
function lineLength(lineId: string): number | null {
  return lineLengthCore(runtime, lineId);
}

// Used by circle tools.
function circleFromThree(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  return circleFromThreeCore(a, b, c);
}

// Used by main UI flow.
function segmentKey(lineId: string, part: 'segment' | 'rayLeft' | 'rayRight', seg?: number) {
  return segmentKeyCore(lineId, part, seg);
}

// Used by main UI flow.
function hitKey(hit: LineHit) {
  return hitKeyCore(hit);
}

// Used by line tools.
function clearSelectedSegmentsForLine(lineId: string) {
  Array.from(selectedSegments).forEach((key) => {
    const parsed = parseSegmentKey(key);
    if (parsed && parsed.lineId === lineId) selectedSegments.delete(key);
  });
}

// Used by main UI flow.
function parseSegmentKey(
  key: string
): { lineId: string; part: 'segment' | 'rayLeft' | 'rayRight'; seg?: number } | null {
  return parseSegmentKeyCore(key);
}

// Used by line tools.
function lineAnchorForHit(hit: LineHit): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  return lineAnchorForHitCore(hit, { runtime, canvas, dpr });
}

// Used by UI refresh/rebuild.
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

// Used by line tools.
function attachPointToLine(pointId: string, hit: LineHit, click: { x: number; y: number }, fixedPos?: { x: number; y: number }) {
  const line = getLineById(hit.lineId);
  if (!line) return;
  const point = getPointById(pointId);
  if (!point) return;

  if (hit.part === 'segment') {
    const aId = line.points[hit.seg];
    const bId = line.points[hit.seg + 1];
    const a = getPointById(aId);
    const b = getPointById(bId);
    if (!a || !b) return;
    const proj = fixedPos ?? projectPointOnSegment(click, a, b);
    runtime.points[String(point.id)] = { ...point, x: proj.x, y: proj.y };
    const angleUpdates: { angle: Angle; leg1Other: string | null; leg2Other: string | null }[] = [];
    for (const angle of listAngles()) {
      const { leg1Other, leg2Other } = getAngleOtherPointsForLine(angle, hit.lineId, runtime);
      if (leg1Other !== null || leg2Other !== null) angleUpdates.push({ angle, leg1Other, leg2Other });
    }
    line.points.splice(hit.seg + 1, 0, pointId);
    const style = line.segmentStyles?.[hit.seg] ?? line.style;
    if (!line.segmentStyles) line.segmentStyles = [];
    line.segmentStyles.splice(hit.seg, 1, { ...style }, { ...style });
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
    const anchorId = hit.part === 'rayLeft' ? line.points[0] : line.points[line.points.length - 1];
    const otherId = hit.part === 'rayLeft' ? line.points[1] ?? anchorId : line.points[line.points.length - 2] ?? anchorId;
    const anchor = getPointById(anchorId);
    const other = getPointById(otherId);
    if (!anchor || !other) return;
    const dirProj = fixedPos ?? projectPointOnLine(click, anchor, other);
    runtime.points[String(point.id)] = { ...point, x: dirProj.x, y: dirProj.y };
    const angleUpdates: { angle: Angle; leg1Other: string | null; leg2Other: string | null }[] = [];
    for (const angle of listAngles()) {
      const { leg1Other, leg2Other } = getAngleOtherPointsForLine(angle, hit.lineId, runtime);
      if (leg1Other !== null || leg2Other !== null) angleUpdates.push({ angle, leg1Other, leg2Other });
    }
    const insertAt = hit.part === 'rayLeft' ? Math.min(1, line.points.length) : Math.max(line.points.length - 1, 1);
    line.points.splice(insertAt, 0, pointId);
    reorderLinePoints(hit.lineId);
    clearSelectedSegmentsForLine(hit.lineId);
    const segIdx = hit.part === 'rayLeft' ? 0 : Math.max(0, line.points.length - 2);
    selectedSegments.add(segmentKey(hit.lineId, 'segment', segIdx));
    for (const update of angleUpdates) {
      if (update.leg1Other !== null) {
        if ((update.angle as any).point1 !== undefined) (update.angle as any).point1 = update.leg1Other;
      }
      if (update.leg2Other !== null) {
        if ((update.angle as any).point2 !== undefined) (update.angle as any).point2 = update.leg2Other;
      }
    }
  }
  if (line.id) applyPointConstruction(pointId, [{ kind: 'line', id: line.id }]);
  ensureSegmentStylesForLine(hit.lineId);
  clearSelectedSegmentsForLine(hit.lineId);
  recomputeIntersectionPoint(pointId);
}

// Used by point tools.
function projectPointOnSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  return engineProjectPointOnSegment(p as any, a as any, b as any);
}

// Used by line tools.
function projectPointOnLine(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  return engineProjectPointOnLine(p as any, a as any, b as any);
}

// Used by circle tools.
function constrainToCircles(pointId: ObjectId, desired: { x: number; y: number }) {
  if (!pointId) return desired;
  const circleIds = circlesContainingPoint(pointId);
  if (!circleIds.length) return desired;
  const circle = getCircleById(circleIds[0]);
  const center = circle ? getPointById(circle.center) : null;
  const current = getPointById(pointId);
  if (!circle || !center || !current) return desired;
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

// Used by line tools.
function constrainToLineParent(pointId: ObjectId, desired: { x: number; y: number }) {
  const point = getPointById(pointId);
  if (!point) return desired;
  const constrained = constrainPointToParentLineRuntime(runtime, point.id, desired);
  return constrained ?? desired;
}

// Used by line tools.
function constrainToLineId(lineId: ObjectId | null | undefined, desired: { x: number; y: number }) {
  if (!lineId) return desired;
  const line = getLineById(lineId);
  if (!line || line.points.length < 2) return desired;
  // Use DEFINING points to establish the line, not first/last in sorted array
  const aIdx = line.defining_points?.[0] ?? line.points[0];
  const bIdx = line.defining_points?.[1] ?? line.points[line.points.length - 1];
  const a = getPointById(aIdx);
  const b = getPointById(bIdx);
  if (!a || !b) return desired;
  return projectPointOnLine(desired, a, b);
}

// Used by circle tools.
function lineCircleIntersections(
  a: { x: number; y: number },
  b: { x: number; y: number },
  center: { x: number; y: number },
  radius: number,
  clampToSegment = true
) {
  return engineLineCircleIntersections(a as any, b as any, center as any, radius, clampToSegment);
}

// Used by point tools.
function createPerpBisectorFromPoints(pointRef1: ObjectId, pointRef2: ObjectId) {
  const point1 = getPointById(pointRef1);
  const point2 = getPointById(pointRef2);
  if (!point1 || !point2) return;

  // Create hidden line segment between the two points
  const hiddenSegmentStyle: StrokeStyle = { ...currentStrokeStyle(), hidden: true };
  const hiddenLineId = addLineFromPoints(runtime, point1.id, point2.id, hiddenSegmentStyle);

  // Create visible midpoint
  const midX = (point1.x + point2.x) / 2;
  const midY = (point1.y + point2.y) / 2;
  const midpointId = addPoint(runtime, {
    x: midX,
    y: midY,
    style: currentPointStyle(),
    construction_kind: 'midpoint',
    midpointMeta: {
      parents: [point1.id, point2.id],
      parentLineId: hiddenLineId
    }
  });

  // Create perpendicular line through the midpoint
  const perpendicularId = createPerpendicularLineThroughPoint(midpointId, hiddenLineId);

  if (perpendicularId !== null) {
    selectedLineId = perpendicularId;
    selectedPointId = null;
  }
}

// Used by line tools.
function createPerpBisectorFromLine(lineId: ObjectId, segmentIndex: number) {
  const line = getLineById(lineId);
  if (!line || segmentIndex >= line.points.length - 1) return;

  const pointId1 = line.points[segmentIndex];
  const pointId2 = line.points[segmentIndex + 1];
  const point1 = getPointById(pointId1);
  const point2 = getPointById(pointId2);
  if (!point1 || !point2) return;

  // Create visible midpoint
  const midX = (point1.x + point2.x) / 2;
  const midY = (point1.y + point2.y) / 2;
  const midpointId = addPoint(runtime, {
    x: midX,
    y: midY,
    style: currentPointStyle(),
    construction_kind: 'midpoint',
    midpointMeta: {
      parents: [point1.id, point2.id],
      parentLineId: line.id
    }
  });

  // Attach midpoint to the line
  insertPointIntoLine(line.id, midpointId, { x: midX, y: midY });

  // Create perpendicular line through the midpoint
  const perpendicularId = createPerpendicularLineThroughPoint(midpointId, line.id);

  if (perpendicularId !== null) {
    selectedLineId = perpendicularId;
    selectedPointId = null;
  }
}

// Used by tool actions.
function createTangentConstruction(pointId: string, circleId: string) {
  const point = getPointById(pointId);
  const circle = getCircleById(circleId);
  if (!point || !circle) return;

  const center = getPointById(circle.center);
  if (!center) return;

  const radius = circleRadius(circle);
  if (radius <= 1e-6) return;

  // Check if point is inside the circle
  const distToCenter = Math.hypot(point.x - center.x, point.y - center.y);
  if (distToCenter < radius - 1e-2) {
    // Point is inside the circle - clear selections and do nothing
    selectedPointId = null;
    selectedCircleId = null;
    selectedLineId = null;
    return;
  }

  // Check if point is on the circle
  const ON_CIRCLE_TOLERANCE = 1e-2;
  
  if (Math.abs(distToCenter - radius) < ON_CIRCLE_TOLERANCE) {
    // Point is on circle: draw hidden radius and perpendicular to it
    const radiusLineStyle: StrokeStyle = { ...currentStrokeStyle(), hidden: true };
    const radiusLineId = addLineFromPoints(runtime, circle.center, pointId, radiusLineStyle);

    // Create perpendicular tangent line through the point
    const perpendicularId = createPerpendicularLineThroughPoint(pointId, radiusLineId);
    
    if (perpendicularId !== null) {
      selectedLineId = perpendicularId;
      selectedPointId = null;
      selectedCircleId = null;
    }
  } else {
    // Point is not on circle: construct tangent lines using auxiliary circle
    const midX = (point.x + center.x) / 2;
    const midY = (point.y + center.y) / 2;
    const midpointId = addPoint(runtime, {
      x: midX,
      y: midY,
      style: { color: point.style.color, size: point.style.size, hidden: true },
      construction_kind: 'midpoint',
      midpointMeta: { parents: [point.id, center.id], parentLineId: null }
    });

    // Create hidden auxiliary circle centered at midpoint, passing through point
    const auxRadius = Math.hypot(point.x - midX, point.y - midY);
    const auxCircleId = addCircleWithCenter(midpointId, auxRadius, [pointId]);
    const auxCircle = auxCircleId ? getCircleById(auxCircleId) : null;
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
      const tangentPointIds: string[] = [];
      for (const inter of intersections) {
        const tangentPointId = addPoint(runtime, {
          ...inter,
          style: currentPointStyle(),
          construction_kind: 'free'
        });
        // Attach to both circles
        attachPointToCircle(circleId, tangentPointId, inter);
        if (auxCircleId) attachPointToCircle(auxCircleId, tangentPointId, inter);
        tangentPointIds.push(tangentPointId);
      }

      // Create hidden radii and tangents as perpendiculars to those radii
      const radiusLineStyle: StrokeStyle = { ...currentStrokeStyle(), hidden: true };
      const tangentLineIds: string[] = [];
      for (const tangentPointId of tangentPointIds) {
        const radiusLineId = addLineFromPoints(runtime, circle.center, tangentPointId, radiusLineStyle);
        const tangentLineId = createPerpendicularLineThroughPoint(tangentPointId, radiusLineId);
        if (tangentLineId !== null) {
          tangentLineIds.push(tangentLineId);
        }
      }

      // Select the first tangent line
      if (tangentLineIds.length > 0) {
        const firstLineId = tangentLineIds[0];
        selectedLineId = firstLineId;
        selectedPointId = null;
        selectedCircleId = null;
      }
    }
  }
}

// Used by circle tools.
function circleCircleIntersections(
  c1: { x: number; y: number },
  r1: number,
  c2: { x: number; y: number },
  r2: number
) {
  return engineCircleCircleIntersections(c1 as any, r1, c2 as any, r2);
}

// Used by line tools.
function insertPointIntoLine(lineId: string, pointId: string, pos: { x: number; y: number }) {
  const line = getLineById(lineId);
  if (!line) return;
  if (line.points.some((pid) => String(pid) === String(pointId))) return;
  const startId = line.points[0];
  const endId = line.points[line.points.length - 1];
  const origin = getPointById(startId);
  const end = getPointById(endId);
  if (!origin || !end) return;
  const dir = normalize({ x: end.x - origin.x, y: end.y - origin.y });
  const len = Math.hypot(end.x - origin.x, end.y - origin.y) || 1;
  const tFor = (p: { x: number; y: number }) => ((p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y) / len;
  const tNew = tFor(pos);
  const params = line.points.map((pid) => {
    const p = getPointById(pid);
    return p ? tFor(p) : 0;
  });
  let insertAt = params.findIndex((t) => t > tNew + 1e-6);
  if (insertAt === -1) insertAt = line.points.length;
  line.points.splice(insertAt, 0, pointId);
  rebuildSegmentStylesAfterInsert(line, insertAt);
  clearSelectedSegmentsForLine(lineId);
}

// Used by circle tools.
function attachPointToCircle(circleId: string, pointId: string, pos: { x: number; y: number }) {
  const circle = getCircleById(circleId);
  const center = circle ? getPointById(circle.center) : null;
  if (!circle || !center) return;
  const radius = circleRadius(circle);
  if (radius <= 0) return;
  const angle = Math.atan2(pos.y - center.y, pos.x - center.x);
  const target = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  const point = getPointById(pointId);
  if (point) runtime.points[String(point.id)] = { ...point, ...target };
  if (!circle.points.includes(pointId)) circle.points.push(pointId);
  applyPointConstruction(pointId, [{ kind: 'circle', id: circle.id }]);
  if (selectedCircleId === circleId) {
    selectedArcSegments.clear();
  }
  recomputeIntersectionPoint(pointId);
}

// Used by line tools.
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

// Used by main UI flow.
function enforceIntersections(lineId: string) {
  recomputeAllConstraints();
}

// Used by line tools.
function getLineHandle(lineId: string) {
  return getLineHandleCore(lineId, { runtime, showHidden, lineExtent, circleRadius });
}

// Used by line tools.
function getLineRotateHandle(lineId: string) {
  return getLineRotateHandleCore(lineId, { runtime, showHidden, lineExtent, circleRadius });
}

// Used by circle tools.
function getCircleHandle(circleId: string) {
  return getCircleHandleCore(circleId, { runtime, showHidden, lineExtent, circleRadius });
}

// Used by circle tools.
function getCircleRotateHandle(circleId: string) {
  return getCircleRotateHandleCore(circleId, { runtime, showHidden, lineExtent, circleRadius });
}

// Used by line tools.
function lineExtent(lineId: string) {
  return lineExtentWithEndPoint(lineId, runtime);
}

// Used by main UI flow.
function enforceAxisAlignment(lineId: string, axis: 'horizontal' | 'vertical') {
  const line = getLineById(lineId);
  if (!line) return;
  const refPoints = line.points
    .map((pid) => getPointById(pid))
    .filter((pt): pt is Point => !!pt);
  if (!refPoints.length) return;
  const movable = line.points.filter((pid) => {
    const pt = getPointById(pid);
    if (!pt) return false;
    if (!isPointDraggable(pt)) return false;
    if (circlesWithCenter(pid).length > 0) return false;
    return true;
  });
  if (!movable.length) return;
  const axisValue = axis === 'horizontal'
    ? refPoints.reduce((sum, p) => sum + p.y, 0) / refPoints.length
    : refPoints.reduce((sum, p) => sum + p.x, 0) / refPoints.length;
  const moved = new Set<string>();
  movable.forEach((pid) => {
    const pt = getPointById(pid);
    if (!pt) return;
    if (axis === 'horizontal') {
      if (pt.y !== axisValue) {
        runtime.points[String(pt.id)] = { ...pt, y: axisValue };
        moved.add(pid);
      }
    } else if (pt.x !== axisValue) {
      runtime.points[String(pt.id)] = { ...pt, x: axisValue };
      moved.add(pid);
    }
  });
  if (moved.size) {
    updateIntersectionsForLine(lineId);
    updateParallelLinesForLine(lineId);
    updatePerpendicularLinesForLine(lineId);
    moved.forEach((pid) => {
      updateMidpointsForPoint(pid);
      updateCirclesForPoint(pid);
    });
  }
}

// Used by rotation hints.
function updateRotateAxisSnapsForLines(lineIds: Iterable<string>) {
  const { snaps, best } = computeAxisSnapsForLines(lineIds, {
    lineExtent,
    lineSnapSinAngle: LINE_SNAP_SIN_ANGLE,
    lineSnapIndicatorThreshold: LINE_SNAP_INDICATOR_THRESHOLD
  });
  activeAxisSnaps.clear();
  snaps.forEach((v, k) => activeAxisSnaps.set(k, v));
  activeAxisSnap = best;
}

// Used by multiselect rotation hints.
function updateMultiRotateAxisSnaps() {
  if (mode !== 'multiselect' || !rotatingMulti) return;
  updateRotateAxisSnapsForLines(multiSelectedLines);
}

// Used by polygon rotation hints.
function updatePolygonRotateAxisSnaps() {
  if (mode !== 'move' || !rotatingMulti || !selectedPolygonId) return;
  const lines = polygonLines(selectedPolygonId);
  if (!lines.length) {
    activeAxisSnaps.clear();
    activeAxisSnap = null;
    return;
  }
  updateRotateAxisSnapsForLines(lines);
}

// Used by polygon tools.
function polygonForLine(lineId: ObjectId): string | null {
  return polygonForLineCore(runtime, lineId);
}

// Used by hit-testing and selection.
function polygonForLineHit(hit: LineHit | null): string | null {
  return polygonForLineHitCore(runtime, hit);
}

// Used by polygon tools.
function polygonHasPoint(pointId: string, poly: Polygon | undefined): boolean {
  return polygonHasPointCore(pointId, poly);
}

// Used by polygon tools.
function polygonVertices(polyId: ObjectId): string[] {
  return polygonVerticesCore(runtime, polyId);
}

// Used by polygon tools.
function polygonVerticesOrdered(polyId: ObjectId): string[] {
  return polygonVerticesOrderedCore(runtime, polyId);
}

// Used by polygon tools to map polygon edges to line segment keys.
function polygonEdgeSegmentKeys(polyId: ObjectId): Set<string> {
  return polygonEdgeSegmentKeysCore(runtime, polyId);
}

// Used by polygon tools.
function polygonLines(polyId: ObjectId): string[] {
  return polygonLinesCore(runtime, polyId);
}

// Used by polygon tools.
function polygonHasLine(polyId: ObjectId, lineId: ObjectId): boolean {
  return polygonHasLineCore(runtime, polyId, lineId);
}

// Used by polygon tools.
function polygonId(polyId: ObjectId): string | undefined {
  const poly = polygonGet(polyId);
  return poly?.id ?? undefined;
}

// Used by polygon tools.
function polygonGet(polyId: ObjectId) {
  return getPolygonById(polyId) ?? undefined;
}

// Used by polygon tools.
function polygonSet(polyId: ObjectId, updater: Polygon | ((old?: Polygon) => Polygon | undefined)) {
  const old = getPolygonById(polyId);
  if (!old) return;
  const next = typeof updater === 'function' ? (updater as (o?: Polygon) => Polygon | undefined)(old) : updater;
  if (!next) return;
  runtime.polygons[String(polyId)] = next;
}

// Create a polygon from vertex ids (and optionally line ids) for UI tools and history.
function createPolygon(vertices: string[], kind: string = 'free', lines?: string[]): string {
  const polyId = nextId('polygon', runtime);
  const poly: Polygon = {
    object_type: 'polygon',
    id: polyId,
    points: [...vertices],
    construction_kind: kind as any,
    defining_parents: [],
    recompute: () => {},
    on_parent_deleted: () => {}
  } as Polygon;
  dispatchAction({ type: 'ADD', kind: 'polygon', payload: poly });
  return polyId;
}

// Used by polygon tools.
function removePolygon(polyId: string) {
  delete runtime.polygons[String(polyId)];
}

// Used by polygon tools.
function removePolygonWithEdges(polyId: string) {
  const poly = polygonGet(polyId);
  if (!poly) return;
  const polygonPointIds = new Set(
    polygonVertices(polyId)
      .map((pid) => String(pid))
      .filter((pid): pid is string => !!pid)
  );
  const edgeLineIds = polygonLines(polyId);
  const lineIdsToRemove = edgeLineIds.filter((lineId) => {
    return !listPolygons().some((other) => other && other.id !== polyId && polygonHasLine(other.id, lineId));
  });

  removePolygon(polyId);

  if (lineIdsToRemove.length) {
    lineIdsToRemove.forEach((lineId) => {
      const line = getLineById(lineId);
      if (line?.label) reclaimLabel(line.label);
      delete runtime.lines[String(lineId)];
    });
  }

  const orphanPointIds: string[] = [];
  polygonPointIds.forEach((pid) => {
    if (!pointUsedAnywhere(pid)) orphanPointIds.push(pid);
  });
  if (orphanPointIds.length) {
    removePointsAndRelated(orphanPointIds, false);
  } else {
    polygonPointIds.forEach((pid) => {
      clearPointLabelIfUnused(pid);
    });
  }
}

// Used by label UI flow.
function friendlyLabelForId(id: string): string {
  if (!id) return '?';
  const kind = (Object.keys(ID_PREFIX) as GeometryKind[]).find((k) => id.startsWith(ID_PREFIX[k]));
  if (!kind) return '?';
  const prefix = LABEL_PREFIX[kind] ?? '';
  const suffix = id.slice(ID_PREFIX[kind].length);
  const number = Number(suffix);
  if (!Number.isFinite(number)) return '?';
  return `${prefix}${number}`;
}

// Used by line tools.
function ensureSegmentStylesForLine(lineId: string) {
  const line = getLineById(lineId);
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

// Used by line tools.
function reorderLinePoints(lineId: string) {
  const line = getLineById(lineId);
  if (!line) return;
  const reorderedIds = reorderLinePointIdsRuntime(line.id, runtime);
  const reordered = reorderedIds ?? reorderLinePointsPure(line, listPoints());
  if (!reordered) return;
  line.points = reordered;
  ensureSegmentStylesForLine(line.id);
}

// Used by UI state helpers.
function getVertexOnLeg(leg: any, vertex: ObjectId): ObjectId {
  return getVertexOnLegCore(leg, vertex, { runtime });
}

// Return the 'other' point indices for an angle when a specific line index
// (candidate arm) is involved. Prefers `point1`/`point2` numeric refs when present,
// otherwise falls back to legacy leg/arm resolution via `makeAngleLeg`/`getVertexOnLeg`.
// `getAngleOtherPointsForLine` lives in `src/core/angleTools.ts` and is imported above.

// Used by angle tools.
function getAngleLegSeg(angle: Angle, leg: 1 | 2): number {
  return getAngleLegSegCore(angle, leg, { runtime });
}

// Debug panel DOM functions moved to src/debugPanel.ts; main.ts uses the exported helpers.

// Used by label UI flow.
function drawDebugLabels() {
  // Delegate pure drawing to the renderer module. Keep DOM/event logic here.
  try {
    drawDebugLabelsCanvas(ctx, runtime, worldToCanvas, screenUnits, pointRadius, zoomFactor, lineExtent, circleRadius, polygonCentroid, friendlyLabelForId, showHidden, dpr);
  } catch (e) {
    // Fail silently to avoid breaking rendering flow
  }
}

// Used by hit-testing and UI handles.
function getPolygonHandles(polyId: string) {
  return getPolygonHandlesCore(polyId, { runtime, showHidden });
}

// Used by hit-testing and selection.
function findHandle(
  p: { x: number; y: number }
): { kind: 'line' | 'circle' | 'polygon'; id: string; type: 'scale' | 'rotate' } | { kind: 'group'; type: 'scale' | 'rotate' } | null {
  const padWorld = screenUnits(HANDLE_SIZE / 2 + HANDLE_HIT_PAD);
  // check lines first (top-most order)
  const lines = listLines();
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    // Only consider line handles if the line is actually selected (handlers are drawn only for selected lines)
    if (line && selectedLineId === line.id) {
      const handle = getLineHandle(line.id);
      if (handle) {
        const dx = p.x - handle.x;
        const dy = p.y - handle.y;
        if (Math.hypot(dx, dy) <= padWorld) {
          return { kind: 'line', id: line.id, type: 'scale' };
        }
      }
      const rotateHandle = getLineRotateHandle(line.id);
      if (rotateHandle) {
        const dx = p.x - rotateHandle.x;
        const dy = p.y - rotateHandle.y;
        if (Math.hypot(dx, dy) <= padWorld) {
          return { kind: 'line', id: line.id, type: 'rotate' };
        }
      }
    }
  }
  // check circles
  const circles = listCircles();
  for (let i = circles.length - 1; i >= 0; i--) {
    const circle = circles[i];
    // Only consider circle handles when the circle is selected and edge handles are visible
    if (circle && selectedCircleId === circle.id && selectionEdges) {
      const handle = getCircleHandle(circle.id);
      if (handle) {
        const dx = p.x - handle.x;
        const dy = p.y - handle.y;
        if (Math.hypot(dx, dy) <= padWorld) {
          return { kind: 'circle', id: circle.id, type: 'scale' };
        }
      }
      const rotateHandle = getCircleRotateHandle(circle.id);
      if (rotateHandle) {
        const dx = p.x - rotateHandle.x;
        const dy = p.y - rotateHandle.y;
        if (Math.hypot(dx, dy) <= padWorld) {
          return { kind: 'circle', id: circle.id, type: 'rotate' };
        }
      }
    }
  }
  // check polygon handles (selected polygon only)
  if (mode === 'move' && selectedPolygonId !== null && selectedSegments.size === 0) {
    const polyHandles = getPolygonHandles(selectedPolygonId);
    if (polyHandles) {
      const dxs = p.x - polyHandles.scaleHandle.x;
      const dys = p.y - polyHandles.scaleHandle.y;
      if (Math.hypot(dxs, dys) <= padWorld) {
        return { kind: 'polygon', id: selectedPolygonId, type: 'scale' };
      }
      const dxr = p.x - polyHandles.rotateHandle.x;
      const dyr = p.y - polyHandles.rotateHandle.y;
      if (Math.hypot(dxr, dyr) <= padWorld) {
        return { kind: 'polygon', id: selectedPolygonId, type: 'rotate' };
      }
    }
  }
  // check multiselect group handles (when active)
  if (mode === 'multiselect' && hasMultiSelection()) {
    const mh = getMultiHandles();
    if (mh) {
      const dxs = p.x - mh.scaleHandle.x;
      const dys = p.y - mh.scaleHandle.y;
      if (Math.hypot(dxs, dys) <= padWorld) return { kind: 'group', type: 'scale' };
      const dxr = p.x - mh.rotateHandle.x;
      const dyr = p.y - mh.rotateHandle.y;
      if (Math.hypot(dxr, dyr) <= padWorld) return { kind: 'group', type: 'rotate' };
    }
  }
  return null;
}

// Compute group (multiselect) handles: scale at bottom-right of bbox, rotate above top-center
function getMultiHandles() {
  // collect all selected object points
  const points = new Set<string>();
  multiSelectedPoints.forEach((id) => points.add(id));
  multiSelectedLines.forEach((lineId) => getLineById(lineId)?.points.forEach((pi) => points.add(pi)));
  multiSelectedCircles.forEach((circleId) => {
    const c = getCircleById(circleId);
    if (!c) return;
    points.add(c.center);
    if (c.radius_point !== undefined) points.add(c.radius_point);
    c.points.forEach((pi) => points.add(pi));
  });
  multiSelectedAngles.forEach((angleId) => {
    const a = getAngleById(angleId);
    if (!a) return;
    points.add(a.vertex);
    points.add(a.point1);
    points.add(a.point2);
  });
  multiSelectedPolygons.forEach((polyId) => {
    const pls = polygonLines(polyId);
    pls.forEach((lineId) => getLineById(lineId)?.points.forEach((p) => points.add(p)));
  });
  multiSelectedInkStrokes.forEach((strokeId) => {
    const s = getInkStrokeById(strokeId);
    if (!s) return;
    s.points.forEach(() => {}); // no world points for ink here
  });

  const pts = Array.from(points).map((id) => getPointById(id)).filter(Boolean) as Point[];
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

// Rejestracja service workera
initServiceWorkerUpdates();

// Used by main UI flow.
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

  listPoints().forEach((pt) => {
    if (!pt || (!includeHidden && pt.style.hidden)) return;
    pt.style = { ...pt.style, color: mapColor(pt.style.color) };
    if (pt.label?.color) {
      pt.label = { ...pt.label, color: mapColor(pt.label.color) };
    }
  });
  listLines().forEach((line) => {
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
  listCircles().forEach((circle) => {
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
  listAngles().forEach((angle) => {
    if (!angle) return;
    const style = angle.style;
    angle.style = {
      ...style,
      color: mapColor(style.color),
      fill: style.fill ? mapColor(style.fill) : undefined
    };
    angle.label = angle.label ? { ...angle.label, color: mapColor(angle.label.color ?? style.color) } : angle.label;
  });
  listPolygons().forEach((poly) => {
    if (!poly) return;
    if (poly.fill) poly.fill = mapColor(poly.fill);
  });
  listInkStrokes().forEach((stroke) => {
    if (!stroke || (!includeHidden && stroke.hidden)) return;
    stroke.color = mapColor(stroke.color);
  });
  replaceRuntimeCollection('labels', listLabels().map((label) => ({
    ...label,
    color: label.color ? mapColor(label.color) : label.color
  })));
  draw();
  pushHistory();
}
