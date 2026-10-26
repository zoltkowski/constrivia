import { describe, expect, it } from 'vitest';
import { makeEmptyRuntime } from '../src/core/runtimeTypes';
import { syncBoundMeasurements, setMeasurementLabelPosition } from '../src/core/boundMeasurements';
import { createConstructionClipboard, pasteConstructionClipboard, readConstructionClipboard } from '../src/core/constructionClipboard';

function fixture(){
  const r=makeEmptyRuntime();
  for(const [id,x,y] of [['A',0,0],['B',100,0],['C',0,100]] as const)r.points[id]={id,x,y,style:{}};
  r.lines.base={id:'base',points:['A','B'],defining_points:['A','B'],style:{}};
  r.angles.angle={id:'angle',vertex:'A',point1:'B',point2:'C',style:{}};
  r.labels.length={id:'length',text:'5',pos:{x:50,y:-10},measurement:{kind:'segment',lineId:'base',points:['A','B'],scale:20,offset:{x:0,y:-10}}};
  r.labels.angle={id:'angle-label',text:'90°',pos:{x:10,y:10},measurement:{kind:'angle',angleId:'angle',offset:{x:10,y:10}}};
  // Use dictionary keys matching runtime label IDs, just as the application does.
  r.labels['angle-label']=r.labels.angle;delete r.labels.angle;
  return r;
}
const options={lengthPrecision:1,anglePrecision:1,angleValue:()=>90};
describe('bound measurement labels',()=>{
  it('updates length and position from stable endpoints, even after subdividing and reordering a line',()=>{
    const r=fixture();syncBoundMeasurements(r,options);
    expect(r.labels.length.text).toBe('5.0');
    r.points.M={id:'M',x:50,y:0,style:{}};r.lines.base.points=['B','M','A'];
    r.points.B.x=200;r.points.B.y=40;syncBoundMeasurements(r,options);
    expect(r.labels.length.text).toBe('10.2');
    expect(r.labels.length.pos).toEqual({x:100,y:10});
  });
  it('uses the current angle, degree suffix and source anchor',()=>{
    const r=fixture();syncBoundMeasurements(r,{...options,angleValue:()=>123.456,angleAnchor:()=>({x:30,y:40})});
    expect(r.labels['angle-label'].text).toBe('123.5°');
    expect(r.labels['angle-label'].pos).toEqual({x:40,y:50});
  });
  it('preserves manual placement and avoids double translation when moving the label with its source',()=>{
    const r=fixture();setMeasurementLabelPosition(r,r.labels.length,{x:70,y:-20});
    expect(r.labels.length.measurement!.offset).toEqual({x:20,y:-20});
    r.points.A.x+=30;r.points.B.x+=30;
    setMeasurementLabelPosition(r,r.labels.length,{x:100,y:-20});syncBoundMeasurements(r,options);
    expect(r.labels.length.pos).toEqual({x:100,y:-20});
    r.points.A.x+=10;r.points.B.x+=10;syncBoundMeasurements(r,options);
    expect(r.labels.length.pos).toEqual({x:110,y:-20});
  });
  it('keeps units fixed while the calibration side changes and supports spatial distances',()=>{
    const r=fixture();r.points.B.x=200;syncBoundMeasurements(r,options);
    expect(r.labels.length.text).toBe('10.0');
    syncBoundMeasurements(r,{...options,distance:()=>300});expect(r.labels.length.text).toBe('15.0');
    const restored=JSON.parse(JSON.stringify(r));syncBoundMeasurements(restored,options);
    expect(restored.labels.length.text).toBe('10.0');
  });
  it('hides temporarily invalid measurements, recovers them and removes missing-source labels',()=>{
    const r=fixture();r.lines.base.geometryValid=false;r.angles.angle.geometryValid=false;
    syncBoundMeasurements(r,options);expect(r.labels.length.text).toBe('');expect(r.labels['angle-label'].text).toBe('');
    r.lines.base.geometryValid=true;r.angles.angle.geometryValid=true;syncBoundMeasurements(r,options);
    expect(r.labels.length.text).toBe('5.0');expect(r.labels['angle-label'].text).toBe('90.0°');
    delete r.lines.base;delete r.angles.angle;syncBoundMeasurements(r,options);expect(r.labels).toEqual({});
  });
  it('copies attached labels with a source and remaps their endpoints and angle references',()=>{
    const r=fixture();r.labels.note={id:'note',text:'ordinary note',pos:{x:0,y:0}};
    const buffer=createConstructionClipboard(r,{lines:['base'],angles:['angle']});
    expect(buffer.labels.map(l=>l.id).sort()).toEqual(['angle-label','length']);
    const copy=makeEmptyRuntime(),maps=pasteConstructionClipboard(copy,buffer)!;
    const length=copy.labels[maps.labels.get('length')!],angle=copy.labels[maps.labels.get('angle-label')!];
    expect(length.measurement).toMatchObject({lineId:maps.lines.get('base'),points:[maps.points.get('A'),maps.points.get('B')],scale:20});
    expect(angle.measurement).toMatchObject({angleId:maps.angles.get('angle')});
    syncBoundMeasurements(copy,options);expect(length.text).toBe('5.0');
    expect(length.pos).toEqual({x:70,y:10});
    r.points.B.x=200;syncBoundMeasurements(copy,options);expect(length.text).toBe('5.0');
  });
  it('includes a bound label’s complete construction when copying the label alone and rejects dangling clipboard refs',()=>{
    const r=fixture(),buffer=createConstructionClipboard(r,{labels:['length']});
    expect(buffer.lines.map(l=>l.id)).toEqual(['base']);expect(buffer.points).toHaveLength(2);
    expect(readConstructionClipboard(buffer)).not.toBeNull();
    buffer.labels[0].measurement={kind:'segment',lineId:'missing',points:['A','B'],scale:20,offset:{x:0,y:0}};
    expect(readConstructionClipboard(buffer)).toBeNull();
  });
});
