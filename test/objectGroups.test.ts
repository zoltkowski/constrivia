import { describe, expect, it } from 'vitest';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { applyObjectGroupStyle, createObjectGroup, expandObjectGroupSelection, groupCollections, groupForObject, restoreObjectGroups, setObjectGroupSelection, type GroupSelection } from '../src/core/objectGroups';
import { createConstructionClipboard, pasteConstructionClipboard } from '../src/core/constructionClipboard';

const selection = (values: Partial<Record<typeof groupCollections[number], string[]>> = {}) => Object.fromEntries(groupCollections.map(key => [key,new Set(values[key] ?? [])])) as GroupSelection;
function fixture() {
  const runtime = makeEmptyRuntime();
  runtime.points = { a:{id:'a',x:0,y:0,style:{}}, b:{id:'b',x:100,y:0,style:{}}, c:{id:'c',x:50,y:80,style:{}} };
  runtime.lines.ab = { id:'ab',points:['a','b'],defining_points:['a','b'],style:{color:'#111111',width:2},segmentStyles:[{hidden:true,width:3}],leftRay:{hidden:true} };
  runtime.labels.note = {id:'note',text:'Test',pos:{x:10,y:50}};
  return runtime;
}
describe('object groups', () => {
  it('owns control points and selects or deselects a whole group from any member', () => {
    const runtime=fixture(), selected=selection({lines:['ab'],labels:['note']});
    const group=createObjectGroup(runtime,selected)!;
    expect(group.members.points).toEqual(['a','b']);
    expect(groupForObject(runtime,'points','a')?.id).toBe(group.id);
    const next=selection({labels:['note']});expandObjectGroupSelection(runtime,next);
    expect([...next.lines]).toEqual(['ab']);expect([...next.points]).toEqual(['a','b']);
    setObjectGroupSelection(group,next,false);expect(groupCollections.every(key=>!next[key].size)).toBe(true);
  });
  it('merges overlapping groups without losing lock state', () => {
    const runtime=fixture(), first=createObjectGroup(runtime,selection({points:['a','b']}))!;first.locked=true;
    const second=createObjectGroup(runtime,selection({points:['a','c']}))!;
    expect(Object.keys(runtime.objectGroups!)).toEqual([second.id]);expect(second.locked).toBe(true);
    expect(second.members.points?.sort()).toEqual(['a','b','c']);
  });
  it('updates shared styles without exposing hidden segments or overwriting unrelated style attributes', () => {
    const runtime=fixture(), selected=selection({lines:['ab'],labels:['note']});createObjectGroup(runtime,selected);
    applyObjectGroupStyle(runtime,selected,'color','#ff0000');
    expect(runtime.lines.ab.segmentStyles![0]).toMatchObject({hidden:true,width:3,color:'#ff0000'});
    expect(runtime.lines.ab.leftRay).toMatchObject({hidden:true,color:'#ff0000'});
    expect(runtime.points.a.style.color).toBe('#ff0000');expect(runtime.labels.note.color).toBe('#ff0000');expect(runtime.points.c.style.color).toBeUndefined();
  });
  it('roundtrips metadata and prunes deleted members and malformed data', () => {
    const runtime=fixture(), group=createObjectGroup(runtime,selection({points:['a','b','c']}))!;group.locked=true;
    const saved=JSON.parse(JSON.stringify(runtime.objectGroups));delete runtime.points.c;
    restoreObjectGroups(runtime,saved);expect(runtime.objectGroups![group.id].members.points).toEqual(['a','b']);expect(runtime.objectGroups![group.id].locked).toBe(true);
    delete runtime.points.b;restoreObjectGroups(runtime,runtime.objectGroups);expect(runtime.objectGroups).toEqual({});
    restoreObjectGroups(runtime,{bad:{id:'bad',members:{points:[null,'missing']}}});expect(runtime.objectGroups).toEqual({});
  });
  it('styles circles, their arcs, polygons, angles and handwriting as a group', () => {
    const runtime=fixture();
    runtime.circles.circle={id:'circle',center:'a',radius_point:'b',defining_points:['a','b','b'],points:['b'],style:{width:2},fill:'#000000',fillOpacity:.25,arcStyles:{arc:{hidden:true,width:4}}};
    runtime.angles.angle={id:'angle',vertex:'a',point1:'b',point2:'c',style:{arcCount:2}};
    runtime.polygons.poly={id:'poly',points:['a','b','c'],fillOpacity:.1};
    runtime.inkStrokes.ink={id:'ink',points:[],baseWidth:3,color:'#000000'};
    const selected=selection({circles:['circle'],angles:['angle'],polygons:['poly'],inkStrokes:['ink']});createObjectGroup(runtime,selected);
    applyObjectGroupStyle(runtime,selected,'color','#00ff00');
    expect(runtime.circles.circle.fill).toBe('#00ff00');expect(runtime.polygons.poly.fill).toBe('#00ff00');expect(runtime.inkStrokes.ink.color).toBe('#00ff00');
    applyObjectGroupStyle(runtime,selected,'width',5);
    expect(runtime.inkStrokes.ink.baseWidth).toBe(5);expect(runtime.circles.circle.arcStyles).toMatchObject({arc:{hidden:true,width:5}});expect(runtime.angles.angle.style).toMatchObject({arcCount:2,width:5});
    expect(runtime.polygons.poly.fillOpacity).toBe(.1);
  });
  it('copies independent groups with fresh member IDs and preserves the lock', () => {
    const runtime=fixture(), selected=selection({lines:['ab'],labels:['note']});const group=createObjectGroup(runtime,selected)!;group.locked=true;
    const buffer=createConstructionClipboard(runtime,selected), maps=pasteConstructionClipboard(runtime,buffer)!;
    const groups=Object.values(runtime.objectGroups!);expect(groups).toHaveLength(2);
    const copy=groups.find(g=>g.id!==group.id)!;expect(copy.locked).toBe(true);
    expect(copy.members.lines).toEqual([maps.lines.get('ab')]);expect(copy.members.points).toEqual(['a','b'].map(id=>maps.points.get(id)));
    expect(copy.members.labels).toEqual([maps.labels.get('note')]);
  });
});
