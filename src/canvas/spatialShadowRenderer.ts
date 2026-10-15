import type { ConstructionRuntime } from '../core/runtimeTypes';
import { spatialSolidShadow } from '../core/spatialShadow';
import { spatialSolidFaceIds, spatialSolidLineIds } from '../core/spatialSolidSelection';

/** A footprint is a fill only and does not participate in construction hit testing. */
export function renderSpatialShadows(ctx: CanvasRenderingContext2D, runtime: ConstructionRuntime, showHidden: boolean) {
  for(const solid of Object.values(runtime.solids??{})) {
    const hidden=solid.hidden || (spatialSolidFaceIds(runtime,solid.id).every(id=>runtime.polygons[id]?.hidden)
      && spatialSolidLineIds(runtime,solid.id).every(id=>runtime.lines[id]?.hidden||runtime.lines[id]?.style.hidden));
    if(hidden&&!showHidden)continue;
    const shadow=spatialSolidShadow(runtime,solid.id);
    if(!shadow||shadow.opacity<=0)continue;
    ctx.save();ctx.globalAlpha=shadow.opacity*(hidden?.4:1);ctx.fillStyle=shadow.color;
    ctx.beginPath();shadow.screen.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.restore();
  }
}
