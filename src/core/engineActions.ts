import type {
  Angle,
  Circle,
  ConstructionParent,
  ConstructionRuntime,
  GeometryKind,
  Line,
  ObjectId,
  Point,
  PointConstructionKind,
  PointStyle,
  Polygon,
  StrokeStyle,
  AngleStyle,
  Label,
  LabelRuntime,
  InkStroke
} from './runtimeTypes';

export type EngineState = {
  runtime: ConstructionRuntime;
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
  | { type: 'ADD'; kind: 'line'; payload: { a: ObjectId; b: ObjectId; style: StrokeStyle; id?: string } | Line }
  | { type: 'ADD'; kind: 'circle'; payload: Circle }
  | { type: 'ADD'; kind: 'angle'; payload: Angle }
  | { type: 'ADD'; kind: 'polygon'; payload: Polygon }
  | { type: 'ADD'; kind: 'label'; payload: LabelRuntime }
  | { type: 'ADD'; kind: 'ink'; payload: InkStroke }
  | { type: 'UPDATE'; kind: GeometryKind; id?: ObjectId; index?: number; patch: any }
  | { type: 'DELETE'; kind: GeometryKind | 'label' | 'ink'; ids?: ObjectId[]; indices?: number[] }
  | { type: 'BATCH'; actions: Action[] };

const ID_PREFIX: Record<GeometryKind, string> = {
  point: 'pt',
  line: 'ln',
  circle: 'c',
  angle: 'ang',
  polygon: 'poly'
};

// Used by label actions to guarantee stable label ids.
const ensureLabelId = (label: LabelRuntime): LabelRuntime => {
  if (label.id && String(label.id).length > 0) return label;
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { ...label, id: `lbl-${suffix}` };
};

// Used by id generation in action handlers.
export function nextId(kind: GeometryKind, target: ConstructionRuntime): string {
  const count = (target.idCounters[kind] ?? 0) + 1;
  target.idCounters[kind] = count;
  return `${ID_PREFIX[kind]}${count}`;
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
function applyAddPoint(target: ConstructionRuntime, p: PointInit): ObjectId {
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
  target.points[pid] = point;
  return pid;
}

// Used by action handlers to add a line to the model.
function applyAddLine(target: ConstructionRuntime, a: ObjectId, b: ObjectId, style: StrokeStyle, id?: string): ObjectId {
  const lid = id ?? nextId('line', target);
  const aId = String(a);
  const bId = String(b);
  const segKey = aId < bId ? `${aId}-${bId}` : `${bId}-${aId}`;
  const line: Line = {
    object_type: 'line',
    id: lid,
    points: [aId, bId],
    defining_points: [aId, bId],
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
  target.lines[lid] = line;
  return lid;
}

// Used by engine dispatchers to apply stateful actions.
export function applyAction(state: EngineState, action: Action): EngineState {
  const runtime = state.runtime;
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
            runtime.points[payload.id] = payload;
          } else {
            applyAddPoint(runtime, action.payload as PointInit);
          }
          return state;
        }
        case 'line': {
          const payload = action.payload as any;
          if (payload?.object_type === 'line') {
            runtime.lines[payload.id] = payload;
          } else {
            applyAddLine(runtime, payload.a, payload.b, payload.style, payload.id);
          }
          return state;
        }
        case 'circle':
          runtime.circles[action.payload.id] = action.payload;
          return state;
        case 'angle':
          runtime.angles[action.payload.id] = action.payload;
          return state;
        case 'polygon':
          runtime.polygons[action.payload.id] = action.payload;
          return state;
        case 'label':
          {
            const label = ensureLabelId(action.payload as LabelRuntime);
            runtime.labels[label.id] = label;
          }
          return state;
        case 'ink':
          if (action.payload?.id) runtime.inkStrokes[action.payload.id] = action.payload;
          return state;
      }
      return state;
    }
    case 'UPDATE': {
      const { kind, id, index, patch } = action;
      const targetMap = (runtime as any)[`${kind}s`] as Record<string, any> | undefined;
      if (!targetMap) return state;
      let targetId = id ?? undefined;
      if (!targetId && typeof index === 'number') {
        const keys = Object.keys(targetMap);
        targetId = keys[index];
      }
      if (!targetId || !targetMap[targetId]) return state;
      const current = targetMap[targetId];
      targetMap[targetId] = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
      return state;
    }
    case 'DELETE': {
      const { kind, ids, indices } = action;
      const map = (runtime as any)[`${kind}s`] as Record<string, any> | undefined;
      if (!map) return state;
      const idsToRemove = new Set<string>();
      (ids ?? []).forEach((id) => {
        if (id) idsToRemove.add(String(id));
      });
      if (indices && indices.length) {
        const keys = Object.keys(map);
        indices.forEach((idx) => {
          const key = keys[idx];
          if (key) idsToRemove.add(key);
        });
      }
      idsToRemove.forEach((rid) => {
        delete map[rid];
      });
      return state;
    }
  }
}

// Used by UI tools to add a point via the action system.
export const addPoint = (runtime: ConstructionRuntime, p: PointInit): ObjectId => {
  return applyAddPoint(runtime, p);
};

// Used by UI tools to add a line via the action system.
export const addLineFromPoints = (runtime: ConstructionRuntime, a: ObjectId, b: ObjectId, style: StrokeStyle): ObjectId => {
  return applyAddLine(runtime, a, b, style);
};
