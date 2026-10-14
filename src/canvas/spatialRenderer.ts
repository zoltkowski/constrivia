import { spatialHandles } from '../core/spatialGeometry';
import type { SpatialHandle } from '../core/spatialTypes';
type CanvasPoint = {
    x: number;
    y: number;
};
type ControlDeps = {
    worldToCanvas: (x: number, y: number) => CanvasPoint;
    screenUnits: (value: number) => number;
    zoomFactor: number;
    color: string;
};
/** Draws accessible-size interaction affordances for the selected solid. */
export function renderSpatialControls(ctx: CanvasRenderingContext2D, runtime: any, solidId: string | null, deps: ControlDeps) {
    if (!solidId)
        return;
    const handles: SpatialHandle[] = spatialHandles(runtime, solidId, 26 / Math.max(deps.zoomFactor, 0.1));
    const point = (handle: SpatialHandle) => deps.worldToCanvas(handle.x, handle.y);
    const radius = deps.screenUnits(6);
    const line = deps.screenUnits(1.5);
    for (const handle of handles) {
        const p = point(handle);
        ctx.save();
        ctx.lineWidth = line;
        ctx.strokeStyle = deps.color;
        ctx.fillStyle = '#fff';
        if (handle.kind === 'rotate') {
            const r = radius + 3;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, Math.PI * 0.18, Math.PI * 1.78);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(p.x + r * 0.78, p.y - r * 0.63);
            ctx.lineTo(p.x + r * 1.15, p.y - r * 0.58);
            ctx.lineTo(p.x + r * 1.02, p.y - r * 0.22);
            ctx.closePath();
            ctx.fillStyle = deps.color;
            ctx.fill();
        }
        ctx.restore();
    }
}
