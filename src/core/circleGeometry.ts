import type { ObjectId } from './runtimeTypes';
import { triangleIncircle } from './triangleIncircle';
import { invertGeneralizedCircle, invertPosition, inversionTangent, isometryPosition, isometryGeneralizedCircle, type InversionCurve, type InversionHelper, type GeneralizedCircle } from './inversionGeometry';
import { resolveAngleDefinition } from './angleDefinition';

export type CircleKind = 'center-radius' | 'three-point' | 'compass' | 'incircle';
export type CompassLineSource = { lineId: ObjectId; a: ObjectId; b: ObjectId };
export type CompassDistanceSource =
  | { kind: 'point-line'; pointId: ObjectId; line: CompassLineSource }
  | { kind: 'parallel-lines'; lines: [CompassLineSource, CompassLineSource] };
export type CircleDefinition = {
  inversion?: InversionCurve;
  center: ObjectId;
  radius_point?: ObjectId;
  circle_kind?: CircleKind;
  defining_points?: [ObjectId, ObjectId, ObjectId];
  compassSource?: CompassDistanceSource;
};
type Position = { x: number; y: number };
type PointGeometry = { points: Record<ObjectId, Position>; lines?: Record<ObjectId, any>; circles?:Record<ObjectId,CircleDefinition>; angles?:Record<string,any> };
const finite = (p?: Position): p is Position => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

export function compassSourceLines(source: CompassDistanceSource): CompassLineSource[] {
  return source.kind === 'point-line' ? [source.line] : source.lines;
}
export function compassSourcePoints(source: CompassDistanceSource): ObjectId[] {
  return Array.from(new Set([
    ...(source.kind === 'point-line' ? [source.pointId] : []),
    ...compassSourceLines(source).flatMap(line => [line.a, line.b])
  ]));
}

/** Perpendicular distance to the supporting line, including outside a selected side. */
export function compassDistanceGeometry(geometry: PointGeometry, source: CompassDistanceSource): Position | null {
  const lines = compassSourceLines(source).map(line => {
    const a = geometry.points[line.a], b = geometry.points[line.b];
    if (!geometry.lines?.[line.lineId] || !finite(a) || !finite(b)) return null;
    const length = Math.hypot(b.x-a.x, b.y-a.y);
    return length > 1e-6 ? { a, x: (b.x-a.x)/length, y: (b.y-a.y)/length } : null;
  });
  const first = lines[0];
  if (!first) return null;
  let point: Position | undefined;
  if (source.kind === 'point-line') point = geometry.points[source.pointId];
  else {
    const second = lines[1];
    if (!second || Math.abs(first.x*second.y-first.y*second.x) > 1e-7) return null;
    point = second.a;
  }
  if (!finite(point)) return null;
  const distance = (point.x-first.a.x)*-first.y+(point.y-first.a.y)*first.x;
  return Math.abs(distance) > 1e-6 ? { x: -first.y*distance, y: first.x*distance } : null;
}

/** Resolve radius independently of styles and cached validity, including recovery. */
export function resolveCircleGeometry(geometry: PointGeometry, circle: CircleDefinition,depth=0):{center:Position;radius:number;vector:Position}|null {
  if(depth>32)return null;
  if(circle.inversion){
    const result=resolveInversionCurve(geometry,circle.inversion,depth+1);
    return result?.kind==='circle'?{...result,vector:{x:result.radius,y:0}}:null;
  }
  const center = geometry.points[circle.center];
  if (!finite(center)) return null;
  if(circle.circle_kind==='incircle'){
    const points=circle.defining_points?.map(id=>geometry.points[id]);
    return points?.length===3&&points.every(finite)?triangleIncircle(points[0],points[1],points[2]):null;
  }
  let vector: Position;
  if (circle.circle_kind === 'compass') {
    if (circle.compassSource) {
      const distance = compassDistanceGeometry(geometry, circle.compassSource);
      return distance ? { center, radius: Math.hypot(distance.x, distance.y), vector: distance } : null;
    }
    const defs = circle.defining_points;
    if (!defs || defs.length !== 3 || defs[0] !== circle.center) return null;
    const a = geometry.points[defs[1]], b = geometry.points[defs[2]];
    if (!finite(a) || !finite(b)) return null;
    vector = { x: b.x - a.x, y: b.y - a.y };
  } else {
    const id = circle.radius_point ?? circle.defining_points?.[0];
    const point = id ? geometry.points[id] : undefined;
    if (!finite(point)) return null;
    vector = { x: point.x - center.x, y: point.y - center.y };
  }
  const radius = Math.hypot(vector.x, vector.y);
  return Number.isFinite(radius) && radius > 1e-6 ? { center, radius, vector } : null;
}

export function circleInputPointIds(circle: CircleDefinition): ObjectId[] {
  if(circle.inversion)return [];
  if (circle.circle_kind === 'compass' && circle.compassSource) return Array.from(new Set([circle.center, ...compassSourcePoints(circle.compassSource)]));
  if (circle.circle_kind === 'three-point' || circle.circle_kind === 'incircle') return circle.defining_points?.slice() ?? [];
  if (circle.circle_kind === 'compass') return Array.from(new Set([circle.center, ...(circle.defining_points ?? [])]));
  const radius = circle.radius_point ?? circle.defining_points?.[0];
  return radius ? [circle.center, radius] : [circle.center];
}

export function resolveInversionCurve(geometry:PointGeometry,definition:InversionCurve,depth=0):GeneralizedCircle|null {
  if(depth>32)return null;
  const circle=geometry.circles?.[definition.mirror],mirror=circle&&resolveCircleGeometry(geometry,circle,depth+1);
  if(!mirror&&!definition.isometry)return null;
  let source:GeneralizedCircle|null=null;
  if(definition.source.collection==='circles'){
    const c=geometry.circles?.[definition.source.id],g=c&&resolveCircleGeometry(geometry,c,depth+1);
    if(g)source={kind:'circle',...g};
  }else{
    const line=geometry.lines?.[definition.source.id];
    if(!definition.source.edge&&line?.inversion){
      const g=resolveInversionCurve(geometry,line.inversion,depth+1);if(g?.kind==='line')source=g;
    }else{
      const ids=definition.source.edge??line?.defining_points??[line?.points[0],line?.points[line.points.length-1]];
      const a=geometry.points[ids[0]],b=geometry.points[ids[1]];
      if(finite(a)&&finite(b)&&Math.hypot(b.x-a.x,b.y-a.y)>1e-12)source={kind:'line',origin:a,direction:{x:b.x-a.x,y:b.y-a.y}};
    }
  }
  if(!source)return null;
  if(definition.isometry)return isometryGeneralizedCircle(source,p=>isometryPosition(geometry,definition.isometry!,p));
  return invertGeneralizedCircle(source,mirror!);
}

export function inversionHelperPosition(geometry:PointGeometry,helper:InversionHelper):Position|null {
  const mirrorId='curve' in helper?helper.curve.mirror:helper.mirror;
  const circle=geometry.circles?.[mirrorId],mirror=circle&&resolveCircleGeometry(geometry,circle);
  if(!mirror)return null;
  if('angle' in helper){
    const angle=geometry.angles?.[helper.angle],g=angle&&geometry.lines&&resolveAngleDefinition({points:geometry.points,lines:geometry.lines},angle);
    if(!g)return null;
    const p=helper.arm===1?g.p1:g.p2,v={x:p.x-g.v.x,y:p.y-g.v.y};
    const origin=invertPosition(g.v,mirror),tangent=inversionTangent(g.v,v,mirror);
    if(!origin||!tangent)return null;
    const n=Math.hypot(tangent.x,tangent.y);if(!(n>1e-12))return null;
    return{x:origin.x+tangent.x/n*100,y:origin.y+tangent.y/n*100};
  }
  const g=resolveInversionCurve(geometry,helper.curve);if(!g)return null;
  if(helper.role==='infinity')return{x:mirror.center.x,y:mirror.center.y};
  if(g.kind==='circle')return helper.role==='center'?g.center:helper.role==='radius'?{x:g.center.x+g.radius,y:g.center.y}:null;
  if(helper.role!=='lineA'&&helper.role!=='lineB')return null;
  const distance=Math.max(1,mirror.radius)*(helper.role==='lineA'?-1:1);
  return{x:g.origin.x+g.direction.x*distance,y:g.origin.y+g.direction.y*distance};
}

export function compassDistanceCircleDefinition(geometry: PointGeometry, source: CompassDistanceSource, center: ObjectId) {
  const inputs = compassSourcePoints(source);
  const definition = {
    center, circle_kind: 'compass' as const, compassSource: structuredClone(source),
    defining_points: [center, inputs[0], inputs[1]] as [ObjectId, ObjectId, ObjectId],
    defining_parents: Array.from(new Set([center, ...inputs]))
  };
  return resolveCircleGeometry(geometry, definition) ? definition : null;
}

/** A compass circle uses its source length directly; no hidden radius point. */
export function compassCircleDefinition(geometry: PointGeometry, source: [ObjectId, ObjectId], center: ObjectId) {
  const definition = {
    center,
    circle_kind: 'compass' as const,
    defining_points: [center, ...source] as [ObjectId, ObjectId, ObjectId],
    defining_parents: Array.from(new Set([center, ...source]))
  };
  return resolveCircleGeometry(geometry, definition) ? definition : null;
}
