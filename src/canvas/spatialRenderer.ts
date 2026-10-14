import { spatialFaces, spatialHandles } from '../core/spatialGeometry';
import type { SpatialFace, SpatialHandle } from '../core/spatialTypes';
type CanvasPoint = {
    x: number;
    y: number;
};
type SpatialRenderDeps = {
    worldToCanvas: (x: number, y: number) => CanvasPoint;
    selectedSolidId: string | null;
    showHidden: boolean;
    color: string;
};
function rgba(color: string, alpha: number): string {
    const match = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
    if (!match)
        return color;
    let hex = match[1];
    if (hex.length === 3)
        hex = [...hex].map((part) => part + part).join('');
    const n = Number.parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
/** Draws translucent solid faces beneath the ordinary 2D construction. Edges remain the line renderer's job. */
export function renderSpatialFaces(ctx: CanvasRenderingContext2D, runtime: any, deps: SpatialRenderDeps) {
    const faces: SpatialFace[] = Object.keys(runtime?.solids ?? {}).flatMap((solidId) => spatialFaces(runtime, solidId));
    faces.sort((a, b) => a.depth - b.depth);
    for (const face of faces) {
        const solid = runtime?.solids?.[face.solidId];
        if (solid?.hidden && !deps.showHidden)
            continue;
        if (!face.visible || face.points.length < 3)
            continue;
        const selected = face.solidId === deps.selectedSolidId;
        ctx.beginPath();
        face.points.forEach((point, index) => {
            const p = deps.worldToCanvas(point.x, point.y);
            if (index === 0)
                ctx.moveTo(p.x, p.y);
            else
                ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fillStyle = rgba(deps.color, selected ? 0.24 : 0.12);
        ctx.fill();
        ctx.strokeStyle = rgba(deps.color, selected ? 0.5 : 0.22);
        ctx.lineWidth = selected ? 1.6 : 1;
        ctx.stroke();
    }
}
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
        else if (handle.kind === 'move') {
            ctx.beginPath();
            ctx.moveTo(p.x - radius, p.y);
            ctx.lineTo(p.x + radius, p.y);
            ctx.moveTo(p.x, p.y - radius);
            ctx.lineTo(p.x, p.y + radius);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius * 0.48, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }
}
