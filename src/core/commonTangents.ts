import { addPoint, nextId } from './engineActions';
import { commonCircleTangentGeometry, type CommonTangentContact } from './tangentGeometry';
import type { ConstructionRuntime, ObjectId, PointStyle, StrokeStyle } from './runtimeTypes';

/** Construct contacts and normal-direction tangents without auxiliary circles or radius lines. */
export function createCommonCircleTangents(runtime: ConstructionRuntime, circles: [ObjectId,ObjectId], pointStyle: PointStyle, strokeStyle: StrokeStyle): ObjectId[] {
  if (circles.some(id => !runtime.circles[id] || runtime.circles[id].geometryValid === false)) return [];
  const solutions=commonCircleTangentGeometry(runtime,circles), lines: ObjectId[]=[];
  for (const solution of solutions) {
    const contacts=([solution.first,solution.second] as const).map((position,contact)=>{
      const meta: CommonTangentContact={circles:[...circles],branch:solution.branch,contact:contact as 0|1};
      const id=addPoint(runtime,{...position,style:{...pointStyle},construction_kind:'common-tangent',commonTangent:meta,
        defining_parents:[{kind:'circle',id:circles[contact]}]});
      runtime.circles[circles[contact]].points.push(id);
      return id;
    });
    const id=nextId('line',runtime);
    const helper=addPoint(runtime,{x:solution.first.x-solution.normal.y*solution.helperDistance,
      y:solution.first.y+solution.normal.x*solution.helperDistance,style:{...pointStyle,hidden:true},
      construction_kind:'on_object',defining_parents:[{kind:'line',id}],perpendicular_helper_for:id,auxiliaryFor:id});
    const points=[...contacts,helper], style={...strokeStyle,hidden:false};
    runtime.lines[id]={id,object_type:'line',points,defining_points:[contacts[0],helper],style,
      segmentStyles:points.slice(1).map(()=>({...style})),
      segmentKeys:points.slice(0,-1).map((a,i)=>[a,points[i+1]].sort().join('-')),
      leftRay:{...style,hidden:false},rightRay:{...style,hidden:false},construction_kind:'perpendicular',
      defining_parents:[runtime.circles[circles[0]].center,contacts[0]],
      perpendicular:{throughPoint:contacts[0],referencePoints:[runtime.circles[circles[0]].center,contacts[0]],
        helperPoint:helper,helperDistance:solution.helperDistance,helperOrientation:1}};
    lines.push(id);
  }
  return lines;
}
