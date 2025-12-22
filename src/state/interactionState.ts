// Centralized interaction state to slowly migrate top-level interaction variables.
type TouchPoint = { x: number; y: number };

type ActiveInkStroke = {
  pointerId: number;
  stroke: any; // InkStroke type lives in main.ts; keep any here to avoid circular import
};

type PinchState = {
  pointerIds: [number, number];
  initialDistance: number;
  initialZoom: number;
};

type CircleDragContext = {
  circleIdx: number;
  originals: Map<number, { x: number; y: number }>;
  dependentLines?: Map<number, number[]>;
};

type PolygonDragContext = {
  polygonId: string;
  dependentLines: Map<number, number[]>;
};

type ResizeMultiContext = {
  center: { x: number; y: number };
  vectors: { idx: number; vx: number; vy: number; dist?: number }[];
  startHandleDist: number;
};

type RotateMultiContext = {
  center: { x: number; y: number };
  vectors: { idx: number; vx: number; vy: number }[];
  startAngle: number;
  currentAngle?: number;
};

type ResizeContext = {
  lineIdx: number;
  center: { x: number; y: number };
  dir: { x: number; y: number };
  vectors: { idx: number; vx: number; vy: number }[];
  baseHalf: number;
  lines: number[];
};

type RotateContext = {
  lineIdx: number;
  center: { x: number; y: number };
  vectors: { idx: number; vx: number; vy: number }[];
  startAngle: number;
  lines?: number[];
};

export const interactionState = {
  isPanning: false as boolean,
  panStart: { x: 0, y: 0 } as { x: number; y: number },
  panOffset: { x: 0, y: 0 } as { x: number; y: number },
  panStartOffset: { x: 0, y: 0 } as { x: number; y: number },
  pendingPanCandidate: null as { x: number; y: number } | null,
  zoomFactor: 1 as number,
  activeTouches: new Map<number, TouchPoint>() as Map<number, TouchPoint>,
  inkBaseWidth: 3 as number,
  activeInkStroke: null as ActiveInkStroke | null,
  pinchState: null as PinchState | null,
  circleDragContext: null as CircleDragContext | null,
  polygonDragContext: null as PolygonDragContext | null,
  draggingSelection: false as boolean,
  draggingMultiSelection: false as boolean,
  dragStart: { x: 0, y: 0 } as { x: number; y: number },
  resizingMulti: null as any,
  rotatingMulti: null as any,
  resizingLine: null as any,
  rotatingLine: null as any,
  resizingCircle: null as any,
  rotatingCircle: null as any,
  lineDragContext: null as any,
  stickyTool: null as any
};

// Used by main UI flow.
export const hasActiveInteraction = () => {
  return (
    interactionState.isPanning ||
    interactionState.activeTouches.size > 0 ||
    interactionState.activeInkStroke !== null ||
    interactionState.pinchState !== null ||
    interactionState.draggingSelection ||
    interactionState.draggingMultiSelection
  );
};

export default interactionState;
