import { paintTransformControl, drawPlaneRotationIcon } from './transformControl';
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
    const axisColors = ['#d95757', '#38a66a', '#4c7fd1'];
    for (const handle of handles) {
        const p = point(handle);
        ctx.save();
        ctx.translate(p.x,p.y);
        ctx.scale(1/deps.zoomFactor,1/deps.zoomFactor);
        const color = handle.kind === 'rotateAxis' ? axisColors[handle.axis ?? 0] : handle.kind === 'scale' ? deps.scaleColor??'#22c55e' : deps.rotateColor??'#f59e0b';
        const painter=handle.kind==='rotateAxis'
          ? (ctx:CanvasRenderingContext2D,size:number,color:string)=>drawPlaneRotationIcon(ctx,size,color,handle.axis??0)
          : handle.kind==='scale'?drawDiagonalHandle:drawRotateIcon;
        paintTransformControl(ctx,handle.kind==='scale'?'scale':'rotate',color,painter);
        ctx.restore();
    }
}
