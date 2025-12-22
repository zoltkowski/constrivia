import type {
  Angle,
  Circle,
  ConstructionParent,
  GeometryKind,
  Line,
  Model,
  Point,
  PointConstructionKind,
  PointStyle,
  Polygon,
  StrokeStyle,
  AngleStyle,
  Label,
  FreeLabel,
  InkStroke
} from './runtimeTypes';

export type EngineState = {
  model: Model;
};

export type PointInit = Omit<
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

export type Action =
  | { type: 'ADD'; kind: 'point'; payload: PointInit | Point }
  | { type: 'ADD'; kind: 'line'; payload: { a: number; b: number; style: StrokeStyle; id?: string } | Line }
  | { type: 'ADD'; kind: 'circle'; payload: Circle }
  | { type: 'ADD'; kind: 'angle'; payload: Angle }
  | { type: 'ADD'; kind: 'polygon'; payload: Polygon }
  | { type: 'ADD'; kind: 'label'; payload: Label | FreeLabel }
  | { type: 'ADD'; kind: 'ink'; payload: InkStroke }
  | { type: 'UPDATE'; kind: GeometryKind; id?: string; index?: number; patch: any }
  | { type: 'DELETE'; kind: GeometryKind | 'label' | 'ink'; ids?: string[]; indices?: number[] }
  | { type: 'BATCH'; actions: Action[] };

const ID_PREFIX: Record<GeometryKind, string> = {
  point: 'pt',
  line: 'ln',
  circle: 'c',
  angle: 'ang',
  polygon: 'poly'
};

// Used by engine state initialization.
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

// Used by id generation in action handlers.
export function nextId(kind: GeometryKind, target: Model): string {
  const count = (target.idCounters[kind] ?? 0) + 1;
  target.idCounters[kind] = count;
  return `${ID_PREFIX[kind]}${count}`;
}

// Used by action handlers to keep id/index maps in sync.
export function registerIndex(target: Model, kind: GeometryKind, id: string | number, idx: number) {
  if (!target.indexById) {
    target.indexById = {
      point: {},
      line: {},
      circle: {},
      angle: {},
      polygon: {}
    };
  }
  target.indexById[kind][String(id)] = idx;
}

// Used by bulk updates after deletes or reloads.
export function rebuildIndexMaps(target?: Model | null) {
  if (!target) return;
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

// Used by point creation to sanitize parent references.
export const normalizeParents = (parents?: ConstructionParent[]): ConstructionParent[] => {
  const res: ConstructionParent[] = [];
  parents?.forEach((p) => {
    if (!p) return;
    if (p.kind !== 'line' && p.kind !== 'circle') return;
    if (typeof p.id !== 'string' || !p.id.length) return;
    // Only keep up to two parents - if multiple objects intersect at one point,
    // pick the first two unique parents encountered.
    if (res.length >= 2) return;
    if (!res.some((r) => r.kind === p.kind && r.id === p.id)) res.push({ kind: p.kind, id: p.id });
  });
  return res;
};

// Used by point creation to infer construction kind.
export const resolveConstructionKind = (
  parents: ConstructionParent[],
  explicit?: PointConstructionKind
): PointConstructionKind => {
  if (explicit) return explicit;
  if (parents.length >= 2) return 'intersection';
  if (parents.length === 1) return 'on_object';
  return 'free';
};

// Used by action handlers to add a point to the model.
function applyAddPoint(target: Model, p: PointInit): number {
  const { style: maybeStyle, construction_kind, defining_parents, id, ...rest } = p;
  const style: PointStyle = maybeStyle ?? { color: '#ffffff', size: 4 };
  const parents = normalizeParents(defining_parents);
  const pid = id ?? nextId('point', target);
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
  target.points.push(point);
  registerIndex(target, 'point', pid, target.points.length - 1);
  return target.points.length - 1;
}

// Used by action handlers to add a line to the model.
function applyAddLine(target: Model, a: number, b: number, style: StrokeStyle, id?: string): number {
  const lid = id ?? nextId('line', target);
  const aId = target.points[a]?.id;
  const bId = target.points[b]?.id;
  const segKey = aId && bId ? (aId < bId ? `${aId}-${bId}` : `${bId}-${aId}`) : `${a}-${b}`;
  const line: Line = {
    object_type: 'line',
    id: lid,
    definingPoints: [a, b],
    pointIds: [a, b],
    points: [a, b],
    defining_points: [a, b],
    segmentStyles: [style],
    segmentKeys: [segKey],
    style,
    leftRay: { ...style, hidden: true },
    rightRay: { ...style, hidden: true },
    construction_kind: 'free',
    defining_parents: [],
    recompute: () => {},
    on_parent_deleted: () => {}
  };
  target.lines.push(line);
  registerIndex(target, 'line', lid, target.lines.length - 1);
  return target.lines.length - 1;
}

// Used by engine dispatchers to apply stateful actions.
export function applyAction(state: EngineState, action: Action): EngineState {
  switch (action.type) {
    case 'BATCH': {
      action.actions.forEach((a) => applyAction(state, a));
      return state;
    }
    case 'ADD': {
      switch (action.kind) {
        case 'point': {
          const payload = action.payload as any;
          if (payload?.object_type === 'point') {
            state.model.points.push(payload);
            registerIndex(state.model, 'point', payload.id, state.model.points.length - 1);
          } else {
            applyAddPoint(state.model, action.payload as PointInit);
          }
          return state;
        }
        case 'line': {
          const payload = action.payload as any;
          if (payload?.object_type === 'line') {
            state.model.lines.push(payload);
            registerIndex(state.model, 'line', payload.id, state.model.lines.length - 1);
          } else {
            applyAddLine(state.model, payload.a, payload.b, payload.style, payload.id);
          }
          return state;
        }
        case 'circle':
          state.model.circles.push(action.payload);
          registerIndex(state.model, 'circle', action.payload.id, state.model.circles.length - 1);
          return state;
        case 'angle':
          state.model.angles.push(action.payload);
          registerIndex(state.model, 'angle', action.payload.id, state.model.angles.length - 1);
          return state;
        case 'polygon':
          state.model.polygons.push(action.payload);
          registerIndex(state.model, 'polygon', action.payload.id, state.model.polygons.length - 1);
          return state;
        case 'label':
          state.model.labels.push(action.payload as any);
          return state;
        case 'ink':
          state.model.inkStrokes.push(action.payload);
          return state;
      }
      return state;
    }
    case 'UPDATE': {
      const { kind, id, index, patch } = action;
      const idx = typeof index === 'number'
        ? index
        : id && state.model.indexById?.[kind]?.[id] !== undefined
        ? state.model.indexById[kind][id]
        : undefined;
      if (typeof idx !== 'number') return state;
      const targetArr = (state.model as any)[`${kind}s`];
      if (!Array.isArray(targetArr) || !targetArr[idx]) return state;
      const current = targetArr[idx];
      targetArr[idx] = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
      return state;
    }
    case 'DELETE': {
      const { kind, ids, indices } = action;
      const list = (state.model as any)[`${kind}s`];
      if (!Array.isArray(list)) return state;
      const idxs = indices ? [...indices] : [];
      if (ids && state.model.indexById && state.model.indexById[kind as GeometryKind]) {
        ids.forEach((id) => {
          const idx = state.model.indexById[kind as GeometryKind][id];
          if (typeof idx === 'number') idxs.push(idx);
        });
      }
      idxs.sort((a, b) => b - a);
      idxs.forEach((idx) => {
        if (idx >= 0 && idx < list.length) list.splice(idx, 1);
      });
      if (kind !== 'label' && kind !== 'ink') rebuildIndexMaps(state.model);
      return state;
    }
  }
}

// Used by UI tools to add a point via the action system.
export const addPoint = (model: Model, p: PointInit): number => {
  const prevLen = model.points.length;
  applyAction({ model }, { type: 'ADD', kind: 'point', payload: p });
  return prevLen;
};

// Used by UI tools to add a line via the action system.
export const addLineFromPoints = (model: Model, a: number, b: number, style: StrokeStyle): number => {
  const prevLen = model.lines.length;
  applyAction({ model }, { type: 'ADD', kind: 'line', payload: { a, b, style } });
  return prevLen;
};
