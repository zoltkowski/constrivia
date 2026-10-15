import { paintTransformControl, drawPlaneRotationIcon } from './transformControl';
import { spatialHandles } from '../core/spatialGeometry';
import { spatialEditHandles } from '../core/spatialEditControls';
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
    selectedPolygonId?: string | null;
    selectedPointId?: string | null;
};
/** Draws accessible-size interaction affordances for the selected solid. */
export function renderSpatialControls(ctx: CanvasRenderingContext2D, runtime: any, solidId: string | null, deps: ControlDeps) {
    if (!solidId)
        return;
    const offset=deps.screenUnits(26);
    const handles = spatialHandles(runtime, solidId, offset);
    const edits = spatialEditHandles(runtime,solidId,{polygonId:deps.selectedPolygonId,pointId:deps.selectedPointId},offset);
    const point = (handle: {x:number;y:number}) => deps.worldToCanvas(handle.x, handle.y);
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
    for(const handle of edits){
        const p=point(handle),source=point(handle.source),color=handle.kind==='tilt'?'#2dd4bf':'#c084fc';
        ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1/deps.zoomFactor;ctx.globalAlpha *= handle.disabled ? .12 : .3;
        ctx.beginPath();ctx.moveTo(source.x,source.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.restore();
        ctx.save();ctx.translate(p.x,p.y);ctx.scale(1/deps.zoomFactor,1/deps.zoomFactor);
        if(handle.disabled)ctx.globalAlpha*=.35;
        ctx.rotate(Math.atan2(handle.projectedDirection.y,handle.projectedDirection.x));
        paintTransformControl(ctx,'scale',color,drawSpatialDirectionArrow);
        ctx.restore();
    }
}

/** Bidirectional arrows share the same disc and icon size as the scale control. */
export function drawSpatialDirectionArrow(ctx:CanvasRenderingContext2D,size:number,color:string) {
    const end=size*.5,head=size*.24;
    ctx.strokeStyle=color;ctx.lineWidth=1.8;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(-end,0);ctx.lineTo(end,0);
    ctx.moveTo(-end+head,-head);ctx.lineTo(-end,0);ctx.lineTo(-end+head,head);
    ctx.moveTo(end-head,-head);ctx.lineTo(end,0);ctx.lineTo(end-head,head);ctx.stroke();
}
