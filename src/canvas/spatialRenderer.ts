import { spatialHandles } from '../core/spatialGeometry';
import type { SpatialHandle } from '../core/spatialTypes';
import { drawDiagonalHandle, drawRotateIcon } from './renderer';
type CanvasPoint = {
    x: number;
    y: number;
};
type ControlDeps = {
    worldToCanvas: (x: number, y: number) => CanvasPoint;
    screenUnits: (value: number) => number;
    zoomFactor: number;
    color: string;
    rotateColor?: string;
    scaleColor?: string;
};
/** Draws accessible-size interaction affordances for the selected solid. */
export function renderSpatialControls(ctx: CanvasRenderingContext2D, runtime: any, solidId: string | null, deps: ControlDeps) {
    if (!solidId)
        return;
    const handles: SpatialHandle[] = spatialHandles(runtime, solidId, 26 / Math.max(deps.zoomFactor, 0.1));
    const point = (handle: SpatialHandle) => deps.worldToCanvas(handle.x, handle.y);
    const radius = 12;
    const axisColors = ['#d95757', '#38a66a', '#4c7fd1'];
    for (const handle of handles) {
        const p = point(handle);
        ctx.save();
        ctx.translate(p.x,p.y);
        ctx.scale(1/deps.zoomFactor,1/deps.zoomFactor);
        const color = handle.kind === 'rotateAxis' ? axisColors[handle.axis ?? 0] : handle.kind === 'scale' ? deps.scaleColor??'#22c55e' : deps.rotateColor??'#f59e0b';
        ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);
        ctx.fillStyle=color;ctx.globalAlpha=.33;ctx.fill();ctx.globalAlpha=1;
        const iconSize = handle.kind === 'scale' ? 16 : 14;
        if (handle.kind === 'scale') drawDiagonalHandle(ctx, iconSize, color);
        else drawRotateIcon(ctx, iconSize, color);
        if (handle.kind === 'rotateAxis') {
            ctx.fillStyle = color; ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillText(['X', 'Y', 'Z'][handle.axis ?? 0], 0, radius + 4);
        }
        ctx.restore();
    }
}
