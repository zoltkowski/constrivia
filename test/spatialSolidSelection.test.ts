import {describe,it,expect} from 'vitest';
import {makeEmptyRuntime} from '../src/core/runtimeTypes';
import {createPrismOrPyramid,addSpatialEdgePoint,syncSpatialGeometry} from '../src/core/spatialGeometry';
import {createSpatialParallelSection} from '../src/core/spatialPlaneTools';
import {truncatePyramidAtSection} from '../src/core/spatialSolidEditing';
import {spatialSolidPointIds,toggleSpatialSolidVisibility,copySpatialSolidStyle,applySpatialSolidStyle} from '../src/core/spatialSolidSelection';
const make=()=>{const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'prism',{x:0,y:0},50,4)!;return{r,id,s:r.solids![id]};};
const vertices={vertices:true,edges:false},edges={vertices:false,edges:true},both={vertices:true,edges:true};
describe('solid selection actions',()=>{
 it('hides only selected vertices and uniformly reveals a mixed vertex selection',()=>{
  const {r,id,s}=make(),others=JSON.stringify([r.lines,r.polygons]);r.points[s.vertices[0]].style.hidden=true;
  expect(toggleSpatialSolidVisibility(r,id,vertices)).toBe(true);expect(s.vertices.every(id=>r.points[id].style.hidden)).toBe(true);
  expect(JSON.stringify([r.lines,r.polygons])).toBe(others);
  toggleSpatialSolidVisibility(r,id,vertices);expect(s.vertices.every(id=>!r.points[id].style.hidden)).toBe(true);
 });
 it('hides edges with their face fills while preserving vertices, split styles and unrelated solids',()=>{
  const {r,id,s}=make(),other=createPrismOrPyramid(r,'pyramid',{x:300,y:0},30,3)!,otherBefore=JSON.stringify(r.solids![other]);
  const line=r.lines[s.edges[0]];addSpatialEdgePoint(r,...line.defining_points,.4,line.id);line.segmentStyles=[{hidden:true,color:'#ff0000'},{color:'#00ff00'}];
  const style=JSON.stringify(line.segmentStyles),points=JSON.stringify(r.points);
  toggleSpatialSolidVisibility(r,id,edges);
  expect(s.edges.every(id=>r.lines[id].hidden)).toBe(true);expect(s.faces!.every(id=>r.polygons[id].hidden)).toBe(true);
  expect(JSON.stringify(r.points)).toBe(points);expect(JSON.stringify(line.segmentStyles)).toBe(style);expect(JSON.stringify(r.solids![other])).toBe(otherBefore);
  toggleSpatialSolidVisibility(r,id,edges);expect(s.edges.every(id=>!r.lines[id].hidden)).toBe(true);expect(JSON.stringify(line.segmentStyles)).toBe(style);
 });
 it('hides and reveals the complete solid when both filters are enabled',()=>{
  const {r,id,s}=make();toggleSpatialSolidVisibility(r,id,both);
  expect(s.vertices.every(id=>r.points[id].style.hidden)).toBe(true);expect(s.edges.every(id=>r.lines[id].hidden)).toBe(true);expect(s.faces!.every(id=>r.polygons[id].hidden)).toBe(true);
  toggleSpatialSolidVisibility(r,id,both);expect(s.vertices.every(id=>!r.points[id].style.hidden)).toBe(true);expect(s.edges.every(id=>!r.lines[id].hidden)).toBe(true);expect(s.faces!.every(id=>!r.polygons[id].hidden)).toBe(true);
 });
 it('copies a point style from vertices-only selection and applies it without changing target edges',()=>{
  const {r,id,s}=make(),target=createPrismOrPyramid(r,'prism',{x:300,y:0},50,3)!;r.points[s.vertices[0]].style={color:'#cc1234',size:7};
  const before=JSON.stringify(r.lines),copy=copySpatialSolidStyle(r,id,vertices)!;
  expect(copy).toEqual({sourceType:'point',color:'#cc1234',size:7});expect(applySpatialSolidStyle(r,target,vertices,copy)).toBe(true);
  expect(spatialSolidPointIds(r,target).every(id=>r.points[id].style.color==='#cc1234'&&r.points[id].style.size===7)).toBe(true);expect(JSON.stringify(r.lines)).toBe(before);
 });
 it('copies edge and face appearance without copying visibility or changing target vertices',()=>{
  const {r,id,s}=make(),target=createPrismOrPyramid(r,'prism',{x:300,y:0},50,3)!,t=r.solids![target];
  r.lines[s.edges[0]].style={color:'#1a3456',width:7,type:'dashed'};r.lines[s.edges[0]].segmentStyles=[{...r.lines[s.edges[0]].style}];r.polygons[s.faces![0]].fill='#123abc';r.polygons[s.faces![0]].fillOpacity=.3;
  const line=r.lines[t.edges[0]];line.segmentStyles=[{hidden:true,color:'#000000'}];const points=JSON.stringify(r.points);
  applySpatialSolidStyle(r,target,edges,copySpatialSolidStyle(r,id,edges)!);
  expect(t.edges.every(id=>r.lines[id].style.color==='#1a3456'&&r.lines[id].style.width===7&&r.lines[id].style.type==='dashed')).toBe(true);
  expect(t.faces!.every(id=>r.polygons[id].fill==='#123abc'&&r.polygons[id].fillOpacity===.3)).toBe(true);expect(line.segmentStyles[0].hidden).toBe(true);expect(JSON.stringify(r.points)).toBe(points);
 });
 it('does not truncate a pyramid just because all its vertices are hidden',()=>{
  const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'pyramid',{x:0,y:0},50,4)!,s=r.solids![id],apex=s.vertices[4];
  const line=s.edges.map(id=>r.lines[id]).find(l=>l.defining_points.includes(apex))!;
  const driver=addSpatialEdgePoint(r,...line.defining_points,.5,line.id)!;expect(createSpatialParallelSection(r,s.faces![0],driver)).toBeTruthy();
  const before=s.faces!.map(id=>[...r.polygons[id].points]);toggleSpatialSolidVisibility(r,id,vertices);syncSpatialGeometry(r);
  expect(s.faces!.map(id=>r.polygons[id].points)).toEqual(before);expect(s.hiddenApexSectionId).toBeUndefined();
 });
 it.each(['explicit','implicit'])('keeps the removed apex hidden and hides the cap of a %s truncated pyramid',kind=>{
  const r=makeEmptyRuntime(),id=createPrismOrPyramid(r,'pyramid',{x:0,y:0},50,4)!,s=r.solids![id],apex=s.vertices[4];
  const line=s.edges.map(id=>r.lines[id]).find(l=>l.defining_points.includes(apex))!,driver=addSpatialEdgePoint(r,...line.defining_points,.5,line.id)!;
  const section=createSpatialParallelSection(r,s.faces![0],driver)!;if(kind==='explicit')expect(truncatePyramidAtSection(r,id,section)).toBe(true);else{r.points[apex].style.hidden=true;syncSpatialGeometry(r);expect(s.hiddenApexSectionId).toBe(section);}const before=s.faces!.map(id=>[...r.polygons[id].points]);
  expect(spatialSolidPointIds(r,id)).not.toContain(apex);toggleSpatialSolidVisibility(r,id,vertices);syncSpatialGeometry(r);toggleSpatialSolidVisibility(r,id,vertices);syncSpatialGeometry(r);
  expect(r.points[apex].style.hidden).toBe(true);expect(s.faces!.map(id=>r.polygons[id].points)).toEqual(before);
  toggleSpatialSolidVisibility(r,id,both);syncSpatialGeometry(r);expect(r.polygons[section].hidden).toBe(true);
  const capLines=Object.values(r.polygons[section].spatialSection!.edgeLines!);expect(capLines.length).toBeGreaterThan(0);expect(capLines.every(id=>r.lines[id].hidden)).toBe(true);
 });
});
