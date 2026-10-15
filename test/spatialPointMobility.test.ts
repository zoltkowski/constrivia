import {describe,it,expect,vi} from 'vitest';
import {makeEmptyRuntime} from '../src/core/runtimeTypes';
import {createCuboid,createPrismOrPyramid,spatialPosition,addSpatialEdgePoint} from '../src/core/spatialGeometry';
import {setSpatialSolidShapeLocked,deformSpatialVertex} from '../src/core/spatialSolidEditing';
import {canDeformSpatialBaseVertex,isFixedSpatialVertex} from '../src/core/spatialPointMobility';
import {renderPoints,renderMultiselectOverlays} from '../src/canvas/renderer';

const theme={defaultStroke:'#123456',pointSize:3,highlight:'#ffaa00',selectionPointRadius:8};
function colors(r:ReturnType<typeof makeEmptyRuntime>,selected:string,multi=false){
 const selection=vi.fn(),noop=()=>{},ctx:any={save:noop,restore:noop,translate:noop,scale:noop,beginPath:noop,arc:noop,fill:noop};
 const deps:any={showHidden:false,THEME:theme,pointRadius:(n:number)=>n,zoomFactor:1,selectedPointId:selected,applySelectionStyle:selection,selectedLineId:null,selectedPolygonId:null,selectedCircleId:null,multiSelectedPoints:new Set([selected]),multiSelectedLines:new Set(),multiSelectedCircles:new Set(),multiSelectedAngles:new Set(),multiSelectedInkStrokes:new Set(),selectedLabel:null};
 if(multi)renderMultiselectOverlays(ctx,r,deps);else renderPoints(ctx,r,deps);
 return selection.mock.calls.map(c=>c[2]);
}
describe('Solid vertex selection rings',()=>{
 it.each(['prism','pyramid','cuboid'] as const)('matches midpoint rings until only the %s base is unlocked',kind=>{
  const r=makeEmptyRuntime(),id=kind==='cuboid'?createCuboid(r,{x:0,y:0},60):createPrismOrPyramid(r,kind,{x:0,y:0},60,4)!,solid=r.solids![id];
  r.points.mid={id:'mid',x:200,y:200,style:{},construction_kind:'midpoint'};
  expect(colors(r,'mid')).toEqual(['#9ca3af']);
  for(const pid of solid.vertices){expect(isFixedSpatialVertex(r,pid)).toBe(true);expect(colors(r,pid)).toEqual(colors(r,'mid'));expect(colors(r,pid,true)).toEqual(['#9ca3af']);}
  setSpatialSolidShapeLocked(r,id,false);
  const base=solid.polyhedron!.basePoints,upper=solid.vertices.filter(p=>!base.includes(p));
  for(const pid of base){expect(canDeformSpatialBaseVertex(r,id,pid)).toBe(true);expect(colors(r,pid)).toEqual([theme.highlight]);expect(colors(r,pid,true)).toEqual([theme.highlight]);}
  for(const pid of upper){expect(isFixedSpatialVertex(r,pid)).toBe(true);expect(colors(r,pid)).toEqual(['#9ca3af']);expect(colors(r,pid,true)).toEqual(['#9ca3af']);}
  const snapshot=JSON.parse(JSON.stringify(r)),pid=base[0],before=spatialPosition(r,pid);
  expect(deformSpatialVertex(r,id,pid,{x:5,y:2},snapshot)).toBe(true);expect(spatialPosition(r,pid)).not.toEqual(before);
  setSpatialSolidShapeLocked(r,id,true);
  expect(colors(r,pid)).toEqual(['#9ca3af']);expect(deformSpatialVertex(r,id,pid,{x:5,y:2},JSON.parse(JSON.stringify(r)))).toBe(false);
 });
 it('keeps attached base vertices fixed when their source is another solid',()=>{
  const r=makeEmptyRuntime(),parentId=createCuboid(r,{x:0,y:0},60),parent=r.solids![parentId];
  const childId=createPrismOrPyramid(r,'prism',{x:0,y:0},40,4,parent.faces![0])!,child=r.solids![childId];setSpatialSolidShapeLocked(r,childId,false);
  for(const pid of child.polyhedron!.basePoints){expect(canDeformSpatialBaseVertex(r,childId,pid)).toBe(false);expect(colors(r,pid)).toEqual(['#9ca3af']);}
 });
 it('leaves ordinary free points and sliding edge points with their existing ring colors',()=>{
  const r=makeEmptyRuntime(),id=createCuboid(r,{x:0,y:0},60),solid=r.solids![id],edge=r.lines[solid.edges[0]],pid=addSpatialEdgePoint(r,...edge.defining_points,.5,edge.id)!;
  r.points.free={id:'free',x:200,y:200,style:{},construction_kind:'free'};
  expect(isFixedSpatialVertex(r,'free')).toBe(false);expect(colors(r,'free')).toEqual([theme.highlight]);
  expect(isFixedSpatialVertex(r,pid)).toBe(false);expect(colors(r,pid)).toEqual([theme.highlight]);
 });
});
