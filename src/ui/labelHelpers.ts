import type { Angle, Circle, Label, LabelAlignment, Line, ObjectId, Point } from '../core/runtimeTypes';

export type LabelHelpers = {
  defaultLineLabelOffset: (lineId: ObjectId) => { x: number; y: number };
  defaultPointLabelOffset: (pointId: ObjectId) => { x: number; y: number };
  defaultAngleLabelOffset: (angleId: ObjectId) => { x: number; y: number };
  getPointLabelPos: (pointId: ObjectId) => { x: number; y: number } | null;
  getLineLabelPos: (lineId: ObjectId) => { x: number; y: number } | null;
  getAngleLabelPos: (angleId: ObjectId) => { x: number; y: number } | null;
  getLabelAlignment: (label?: { textAlign?: LabelAlignment }) => LabelAlignment;
  findLabelAt: (p: { x: number; y: number }) => { kind: 'point' | 'line' | 'angle' | 'free'; id: string } | null;
  alignPointLabelOffsets: () => void;
  adjustPointLabelOffsets: (scale: number) => void;
};

export function createLabelHelpers(deps: {
  getPointById: (id: ObjectId) => Point | null;
  getLineById: (id: ObjectId) => Line | null;
  getCircleById: (id: ObjectId) => Circle | null;
  getAngleById: (id: ObjectId) => Angle | null;
  listPoints: () => Point[];
  listLines: () => Line[];
  listAngles: () => Angle[];
  listLabels: () => Array<{ id: string; pos: { x: number; y: number }; hidden?: boolean } & Pick<Label, 'text' | 'fontSize' | 'textAlign' | 'color'>>;
  circlesContainingPoint: (pointId: ObjectId) => ObjectId[];
  findLinesContainingPoint: (pointId: ObjectId) => ObjectId[];
  polygonForLine: (lineId: ObjectId) => ObjectId | null;
  polygonCentroid: (polyId: ObjectId) => { x: number; y: number } | null;
  lineExtent: (lineId: ObjectId) => { center: { x: number; y: number } } | null;
  angleGeometry: (angle: Angle) => { v: { x: number; y: number }; start: number; span: number; radius: number } | null;
  normalize: (v: { x: number; y: number }) => { x: number; y: number };
  worldToCanvas: (x: number, y: number) => { x: number; y: number };
  worldOffsetToScreen: (offset: { x: number; y: number }) => { x: number; y: number };
  screenOffsetToWorld: (offset: { x: number; y: number }) => { x: number; y: number };
  labelFontSizePx: (delta?: number, base?: number) => number;
  getLabelScreenDimensions: (
    ctx: CanvasRenderingContext2D,
    label: Pick<Label, 'text' | 'fontSize' | 'textAlign'>,
    fontSizer: (delta?: number, base?: number) => number
  ) => { width: number; height: number };
  normalizeLabelAlignment: (value?: string) => LabelAlignment;
  getCtx: () => CanvasRenderingContext2D | null;
  draw: () => void;
  pushHistory: () => void;
  getShowHidden: () => boolean;
  LABEL_PADDING_X: number;
  LABEL_PADDING_Y: number;
}): LabelHelpers {
  const lineMidpoint = (lineId: ObjectId) => {
    const line = deps.getLineById(lineId);
    if (!line || line.points.length < 2) return null;
    const a = deps.getPointById(line.points[0]);
    const b = deps.getPointById(line.points[line.points.length - 1]);
    if (!a || !b) return null;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, a, b };
  };

  const pointLineDirections = (pointId: ObjectId): { x: number; y: number }[] => {
    const dirs: { x: number; y: number }[] = [];
    const lines = deps.findLinesContainingPoint(pointId);
    lines.forEach((lineId) => {
      const line = deps.getLineById(lineId);
      if (!line) return;
      const pos = line.points.indexOf(pointId);
      if (pos === -1) return;
      const prev = pos > 0 ? deps.getPointById(line.points[pos - 1]) : null;
      const next = pos < line.points.length - 1 ? deps.getPointById(line.points[pos + 1]) : null;
      const p = deps.getPointById(pointId);
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
  };

  const defaultLineLabelOffset = (lineId: ObjectId): { x: number; y: number } => {
    const mp = lineMidpoint(lineId);
    if (!mp) return deps.worldOffsetToScreen({ x: 0, y: -16 });
    const dx = mp.b.x - mp.a.x;
    const dy = mp.b.y - mp.a.y;
    const len = Math.hypot(dx, dy) || 1;
    let normal = { x: -dy / len, y: dx / len };
    const polyId = deps.polygonForLine(lineId);
    if (polyId !== null) {
      const c = deps.polygonCentroid(polyId);
      if (c) {
        const toCentroid = { x: c.x - mp.x, y: c.y - mp.y };
        const dot = normal.x * toCentroid.x + normal.y * toCentroid.y;
        if (dot > 0) normal = { x: -normal.x, y: -normal.y };
      }
    } else if (Math.abs(dx) < 1e-3) {
      normal = { x: -1, y: 0 };
    } else if (normal.y > 0) {
      normal = { x: -normal.x, y: -normal.y };
    }
    const margin = 18;
    return deps.worldOffsetToScreen({ x: normal.x * margin, y: normal.y * margin });
  };

  const defaultPointLabelOffset = (pointId: ObjectId): { x: number; y: number } => {
    const p = deps.getPointById(pointId);
    const fallbackWorld = { x: 12, y: -12 };
    if (!p) return deps.worldOffsetToScreen(fallbackWorld);

    const circleIds = deps.circlesContainingPoint(pointId);
    if (circleIds.length) {
      const c = deps.getCircleById(circleIds[0]);
      const center = c ? deps.getPointById(c.center) : null;
      if (center) {
        const dir = deps.normalize({ x: p.x - center.x, y: p.y - center.y });
        const margin = 18;
        return deps.worldOffsetToScreen({ x: dir.x * margin, y: dir.y * margin });
      }
    }

    const dirs = pointLineDirections(pointId);
    const margin = 18;
    if (dirs.length >= 2) {
      const sum = dirs.reduce((acc, d) => ({ x: acc.x + d.x, y: acc.y + d.y }), { x: 0, y: 0 });
      const len = Math.hypot(sum.x, sum.y);
      let dir =
        len > 1e-3
          ? { x: sum.x / len, y: sum.y / len }
          : { x: -dirs[0].y, y: dirs[0].x };
      dir = { x: -dir.x, y: -dir.y };
      return deps.worldOffsetToScreen({ x: dir.x * margin, y: dir.y * margin });
    }

    if (dirs.length === 1) {
      let dir = { x: -dirs[0].y, y: dirs[0].x };
      if (dir.y > 0) dir = { x: -dir.x, y: -dir.y };
      return deps.worldOffsetToScreen({ x: dir.x * margin, y: dir.y * margin });
    }

    return deps.worldOffsetToScreen(fallbackWorld);
  };

  const defaultAngleLabelOffset = (angleId: ObjectId): { x: number; y: number } => {
    const ang = deps.getAngleById(angleId);
    const geom = ang ? deps.angleGeometry(ang) : null;
    if (!geom) return deps.worldOffsetToScreen({ x: 0, y: -12 });
    const mid = geom.start + geom.span / 2;
    const dir = { x: Math.cos(mid), y: Math.sin(mid) };
    const radius = Math.max(geom.radius * 0.65, 12);
    return deps.worldOffsetToScreen({ x: dir.x * radius, y: dir.y * radius });
  };

  const getPointLabelPos = (pointId: ObjectId): { x: number; y: number } | null => {
    const p = deps.getPointById(pointId);
    if (!p || !p.label) return null;
    if (!p.label.offset) p.label.offset = defaultPointLabelOffset(p.id);
    const offScreen = p.label.offset ?? { x: 8, y: -8 };
    const offWorld = deps.screenOffsetToWorld(offScreen);
    return { x: p.x + offWorld.x, y: p.y + offWorld.y };
  };

  const getLineLabelPos = (lineId: ObjectId): { x: number; y: number } | null => {
    const line = deps.getLineById(lineId);
    if (!line || !line.label) return null;
    const ext = deps.lineExtent(line.id);
    if (!ext) return null;
    if (!line.label.offset) line.label.offset = defaultLineLabelOffset(line.id);
    const offScreen = line.label.offset ?? { x: 0, y: -10 };
    const offWorld = deps.screenOffsetToWorld(offScreen);
    return { x: ext.center.x + offWorld.x, y: ext.center.y + offWorld.y };
  };

  const getAngleLabelPos = (angleId: ObjectId): { x: number; y: number } | null => {
    const ang = deps.getAngleById(angleId);
    if (!ang || !ang.label) return null;
    const geom = deps.angleGeometry(ang);
    if (!geom) return null;
    if (!ang.label.offset) ang.label.offset = defaultAngleLabelOffset(ang.id);
    const offScreen = ang.label.offset ?? { x: 0, y: 0 };
    const offWorld = deps.screenOffsetToWorld(offScreen);
    return { x: geom.v.x + offWorld.x, y: geom.v.y + offWorld.y };
  };

  const getLabelAlignment = (label?: { textAlign?: LabelAlignment }): LabelAlignment => {
    return deps.normalizeLabelAlignment(label?.textAlign);
  };

  const isPointInLabelBox = (
    pScreen: { x: number; y: number },
    labelPosWorld: { x: number; y: number },
    label: Pick<Label, 'text' | 'fontSize' | 'textAlign'>
  ) => {
    const ctx = deps.getCtx();
    if (!ctx) return false;
    const posScreen = deps.worldToCanvas(labelPosWorld.x, labelPosWorld.y);
    const dim = deps.getLabelScreenDimensions(ctx, label, deps.labelFontSizePx);
    const padX = deps.LABEL_PADDING_X;
    const padY = deps.LABEL_PADDING_Y;
    const align = getLabelAlignment(label);
    const xMin = align === 'left' ? posScreen.x - padX : posScreen.x - dim.width / 2 - padX;
    const xMax = align === 'left' ? posScreen.x + dim.width + padX : posScreen.x + dim.width / 2 + padX;
    const yMin = posScreen.y - dim.height / 2 - padY;
    const yMax = posScreen.y + dim.height / 2 + padY;

    return pScreen.x >= xMin && pScreen.x <= xMax && pScreen.y >= yMin && pScreen.y <= yMax;
  };

  const findLabelAt = (p: { x: number; y: number }): { kind: 'point' | 'line' | 'angle' | 'free'; id: string } | null => {
    const pScreen = deps.worldToCanvas(p.x, p.y);

    const angles = deps.listAngles();
    for (let i = angles.length - 1; i >= 0; i--) {
      const ang = angles[i];
      const pos = getAngleLabelPos(ang.id);
      const label = ang.label;
      if (pos && label && isPointInLabelBox(pScreen, pos, label)) return { kind: 'angle', id: ang.id };
    }
    const lines = deps.listLines();
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const pos = getLineLabelPos(line.id);
      const label = line.label;
      if (pos && label && isPointInLabelBox(pScreen, pos, label)) return { kind: 'line', id: line.id };
    }
    const points = deps.listPoints();
    for (let i = points.length - 1; i >= 0; i--) {
      const point = points[i];
      const pos = getPointLabelPos(point.id);
      const label = point.label;
      if (pos && label && isPointInLabelBox(pScreen, pos, label)) return { kind: 'point', id: point.id };
    }
    const labels = deps.listLabels();
    for (let i = labels.length - 1; i >= 0; i--) {
      const lab = labels[i];
      if (lab.hidden && !deps.getShowHidden()) continue;
      if (isPointInLabelBox(pScreen, lab.pos, lab)) return { kind: 'free', id: lab.id };
    }
    return null;
  };

  const alignPointLabelOffsets = () => {
    let changed = false;
    deps.listPoints().forEach((pt) => {
      if (!pt?.label) return;
      const next = defaultPointLabelOffset(pt.id);
      const prev = pt.label.offset;
      if (!prev || Math.abs(prev.x - next.x) > 1e-2 || Math.abs(prev.y - next.y) > 1e-2) {
        pt.label = { ...pt.label, offset: next };
        changed = true;
      }
    });
    if (changed) {
      deps.draw();
      deps.pushHistory();
    }
  };

  const adjustPointLabelOffsets = (scale: number) => {
    if (!Number.isFinite(scale) || scale <= 0) return;
    let changed = false;
    deps.listPoints().forEach((pt) => {
      if (!pt?.label) return;
      const current = pt.label.offset ?? defaultPointLabelOffset(pt.id);
      const next = { x: current.x * scale, y: current.y * scale };
      if (Math.abs(next.x - current.x) < 1e-3 && Math.abs(next.y - current.y) < 1e-3) return;
      pt.label = { ...pt.label, offset: next };
      changed = true;
    });
    if (changed) {
      deps.draw();
      deps.pushHistory();
    }
  };

  return {
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
  };
}
