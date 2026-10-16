export type GridSettings = {
  visible: boolean;
  color: string;
  opacity: number;
  width: number;
  dotsOnly: boolean;
};

export const GRID_STORAGE_KEY = 'geometry.grid';
export const GRID_SPACING = 24;
export const DEFAULT_GRID: GridSettings = {
  visible: false,
  color: '#94a3b8',
  opacity: 0.22,
  width: 0.6,
  dotsOnly: false
};

export function normalizeGridSettings(value: unknown): GridSettings {
  const input = value && typeof value === 'object' ? value as Partial<GridSettings> : {};
  const number = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  return {
    visible: typeof input.visible === 'boolean' ? input.visible : DEFAULT_GRID.visible,
    color: typeof input.color === 'string' && /^#[\da-f]{6}$/i.test(input.color) ? input.color : DEFAULT_GRID.color,
    opacity: number(input.opacity, DEFAULT_GRID.opacity, 0.05, 1),
    width: number(input.width, DEFAULT_GRID.width, 0.25, 3),
    dotsOnly: typeof input.dotsOnly === 'boolean' ? input.dotsOnly : DEFAULT_GRID.dotsOnly
  };
}

// A fixed world-space lattice keeps existing points on the paper when zooming.
// Only user-placed free points use this; construction results retain their geometry.
export function snapToGrid(point: { x: number; y: number }, grid: GridSettings) {
  if (!grid.visible) return point;
  return {
    x: Math.round(point.x / GRID_SPACING) * GRID_SPACING,
    y: Math.round(point.y / GRID_SPACING) * GRID_SPACING
  };
}

// Only the coordinate along the line snaps; the fixed coordinate belongs to
// the construction, even when the line lies between grid rows or columns.
export function snapToGridOnLine(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }, grid: GridSettings) {
  if (!grid.visible) return point;
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 1e-6) return point;
  const tolerance = length * 1e-9;
  if (Math.abs(dy) <= tolerance) return { x: Math.round(point.x / GRID_SPACING) * GRID_SPACING, y: a.y };
  if (Math.abs(dx) <= tolerance) return { x: a.x, y: Math.round(point.y / GRID_SPACING) * GRID_SPACING };
  return point;
}

export function renderGrid(ctx: CanvasRenderingContext2D | null, deps: {
  grid: GridSettings;
  zoomFactor: number;
}) {
  if (!ctx || !deps.grid.visible) return;
  const { grid, zoomFactor } = deps;
  const inverse = ctx.getTransform().inverse();
  const a = inverse.transformPoint({ x: 0, y: 0 });
  const b = inverse.transformPoint({ x: ctx.canvas.width, y: ctx.canvas.height });
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  const startX = Math.ceil(minX / GRID_SPACING), endX = Math.floor(maxX / GRID_SPACING);
  const startY = Math.ceil(minY / GRID_SPACING), endY = Math.floor(maxY / GRID_SPACING);
  ctx.save();
  ctx.globalAlpha = grid.opacity;
  ctx.strokeStyle = ctx.fillStyle = grid.color;
  ctx.lineWidth = grid.width / zoomFactor;
  ctx.setLineDash([]);
  ctx.beginPath();
  if (grid.dotsOnly) {
    const radius = Math.max(1, grid.width) / zoomFactor;
    for (let i = startX; i <= endX; i++) {
      for (let j = startY; j <= endY; j++) {
        const x = i * GRID_SPACING, y = j * GRID_SPACING;
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  } else {
    for (let i = startX; i <= endX; i++) {
      ctx.moveTo(i * GRID_SPACING, minY);
      ctx.lineTo(i * GRID_SPACING, maxY);
    }
    for (let j = startY; j <= endY; j++) {
      ctx.moveTo(minX, j * GRID_SPACING);
      ctx.lineTo(maxX, j * GRID_SPACING);
    }
    ctx.stroke();
  }
  ctx.restore();
}
