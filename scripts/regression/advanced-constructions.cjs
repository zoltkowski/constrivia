const fs = require('fs');
const path = require('path');
const OUTPUT_ROOT = path.resolve(__dirname, '../../output/playwright');
fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
const { zipSync, strToU8, unzipSync } = require('fflate');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const VERIFY = process.argv.includes('--verify');
const OUT = path.join(OUTPUT_ROOT, 'advanced-constructions');
const MATERIALS = VERIFY ? path.join(OUT, 'materials') : path.join(ROOT, 'materials', 'zaawansowane-konstrukcje');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(MATERIALS, { recursive: true });
const copy = value => JSON.parse(JSON.stringify(value));
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const mid = (a,b) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const cross = (a,b,p) => (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
const lineDistance = (a,b,p) => Math.abs(cross(a,b,p))/Math.max(distance(a,b),1e-12);
const results = { constructions: [], errors: [] };

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5179, strictPort: true } });
  await server.listen();
  const browser = await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1100,height:800},hasTouch:true,serviceWorkers:'block'});
    page.on('pageerror',error=>results.errors.push(error.message));
    await page.route('**/src/main.ts*',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:await response.text()+`\nwindow.__edu={
        state:()=>({runtime,mode,selectedPointId,selectedLineId,selectedPolygonId,selectedSegments:[...selectedSegments],panOffset,zoomFactor,rotating:!!rotatingMulti,resizing:!!resizingMulti,draggingSelection,draggingMultiSelection}),
        serialize:serializeCurrentDocument,load:applyPersistedDocument,worldToCanvas,findPoint,findLineHits,findCircle,findAngleAt,capture:async()=>Array.from(new Uint8Array(await(await captureCanvasAsPng()).arrayBuffer())),
        polygonHandles:getPolygonHandles,multiHandles:getMultiHandles,circleHandle:getCircleHandle,
        labelEditor:(id)=>{selectLabel({kind:'point',id});openStyleMenu();},recomputeForDiagnosis:()=>recomputeAllConstraints(),
        selectAllForInspection:()=>({points:[...multiSelectedPoints],lines:[...multiSelectedLines],polygons:[...multiSelectedPolygons]})
      };`});
    });
    // Keep exact-coordinate fixtures independent of optional grid snapping.
    await page.addInitScript(() => localStorage.setItem('geometry.grid', JSON.stringify({ visible: false })));
    await page.goto('http://127.0.0.1:5179/',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.__edu);
    const buttonInventory=await page.locator('button').evaluateAll(bs=>bs.map(b=>({id:b.id,title:b.title})));
    fs.writeFileSync(path.join(OUT,'button-inventory.json'),JSON.stringify(buttonInventory,null,2));
    let log=[];
    const state=()=>page.evaluate(()=>window.__edu.state());
    const doc=()=>page.evaluate(()=>window.__edu.serialize());
    const tool=async id=>{log.push({tool:id});await page.locator('#'+id).click();};
    const worldClick=async p=>{
      const c=await page.evaluate(p=>window.__edu.worldToCanvas(p.x,p.y),p);
      const target=await page.evaluate(c=>{const e=document.elementFromPoint(c.x,c.y);return {tag:e?.tagName,id:e?.id};},c);
      if(target.id!=='canvas') throw new Error(`Canvas click obscured at ${JSON.stringify(c)}: ${JSON.stringify(target)}`);
      log.push({click:copy(p)});await page.mouse.click(c.x,c.y);
    };
    const clickPoint=async id=>{const s=await state();if(!s.runtime.points[id])throw new Error('Missing point '+id);await worldClick(s.runtime.points[id]);};
    const idle=async()=>{
      await tool('modeMove');
      const p=await page.evaluate(()=>{
        const r=window.__edu,s=r.state();
        for(const c of [{x:1030,y:110},{x:70,y:650},{x:1030,y:650},{x:70,y:110}]){
          const p={x:(c.x-s.panOffset.x)/s.zoomFactor,y:(c.y-s.panOffset.y)/s.zoomFactor};
          if(!r.findPoint(p)&&!r.findLineHits(p).length&&!r.findCircle(p,16/s.zoomFactor,false)&&!r.findAngleAt(p,20/s.zoomFactor))return p;
        }return null;
      });
      if(p)await worldClick(p);
    };
    const linePosition=async(id,segmentsOnly=false)=>{
      const p=await page.evaluate(({id,segmentsOnly})=>{
        const r=window.__edu,s=r.state(),l=s.runtime.lines[id];if(!l)return null;
        const pts=l.points.map(id=>s.runtime.points[id]);const candidates=[];
        for(let i=0;i<pts.length-1;i++)if(!l.segmentStyles?.[i]?.hidden){
          for(const t of [.5,.3,.7,.15,.85])candidates.push({x:pts[i].x*(1-t)+pts[i+1].x*t,y:pts[i].y*(1-t)+pts[i+1].y*t});
        }
        // Direction-only helpers do not delimit visible intervals.
        if(!segmentsOnly&&(l.perpendicular?.directBisector||l.bisector)){
          const [da,db]=l.defining_points.map(id=>s.runtime.points[id]);
          if(da&&db){const len=Math.hypot(db.x-da.x,db.y-da.y)||1,dx=(db.x-da.x)/len,dy=(db.y-da.y)/len;
            const origin={x:(da.x+db.x)/2,y:(da.y+db.y)/2},a=pts[0]??origin,b=pts.at(-1)??origin;
            for(const d of [35,70,130,220,320]){
              if(l.leftRay&&!l.leftRay.hidden)candidates.push({x:a.x-dx*d,y:a.y-dy*d});
              if(l.rightRay&&!l.rightRay.hidden)candidates.push({x:b.x+dx*d,y:b.y+dy*d});
            }
          }
        }
        if(!segmentsOnly&&l.construction_kind&&pts.length>1){
          const a=pts[0],b=pts.at(-1),len=Math.hypot(b.x-a.x,b.y-a.y)||1,dx=(b.x-a.x)/len,dy=(b.y-a.y)/len;
          for(const d of [70,130,220])for(const sign of [-1,1])candidates.push({x:a.x+sign*dx*d,y:a.y+sign*dy*d});
        }
        if(!segmentsOnly&&pts.length>1){const a=pts[0],b=pts.at(-1),len=Math.hypot(b.x-a.x,b.y-a.y)||1,dx=(b.x-a.x)/len,dy=(b.y-a.y)/len;
          for(const d of [70,130,220]){if(l.leftRay&&!l.leftRay.hidden)candidates.push({x:a.x-dx*d,y:a.y-dy*d});if(l.rightRay&&!l.rightRay.hidden)candidates.push({x:b.x+dx*d,y:b.y+dy*d});}}
        for(const p of candidates){const c=r.worldToCanvas(p.x,p.y),e=document.elementFromPoint(c.x,c.y);if(e?.id!=='canvas'||c.y<65||c.y>700)continue;
          const hit=r.findLineHits(p)[0];if(hit?.lineId===id&&(!segmentsOnly||hit.part==='segment')&&!r.findPoint(p)&&!r.findAngleAt(p,18/s.zoomFactor))return p;}
        return null;
      },{id,segmentsOnly});
      if(!p){const detail=await page.evaluate(id=>{const r=window.__edu,s=r.state(),l=s.runtime.lines[id],pts=l?.points.map(id=>s.runtime.points[id])||[];return {line:l,pts,probes:pts.length>1?[-220,-130,-70,70,130,220].map(d=>{const a=pts[0],b=pts.at(-1),len=Math.hypot(b.x-a.x,b.y-a.y)||1,p={x:a.x+(b.x-a.x)*d/len,y:a.y+(b.y-a.y)*d/len},c=r.worldToCanvas(p.x,p.y);return {p,hits:r.findLineHits(p),element:document.elementFromPoint(c.x,c.y)?.id};}):[]};},id);throw new Error('No unambiguous clickable position for '+id+' '+JSON.stringify(detail));}return p;
    };
    const clickLine=async(id,segmentsOnly=false)=>worldClick(await linePosition(id,segmentsOnly));
    const circlePosition=async(id,angle)=>{
      const p=await page.evaluate(({id,angle})=>{
        const r=window.__edu,s=r.state(),circle=s.runtime.circles[id];if(!circle)return null;
        const o=s.runtime.points[circle.center],q=s.runtime.points[circle.radius_point],rad=Math.hypot(q.x-o.x,q.y-o.y);
        const p={x:o.x+rad*Math.cos(angle),y:o.y+rad*Math.sin(angle)},c=r.worldToCanvas(p.x,p.y),e=document.elementFromPoint(c.x,c.y);
        return e?.id==='canvas'&&r.findCircle(p,18/s.zoomFactor,false)?.circleId===id?p:null;
      },{id,angle});
      if(!p)throw new Error('No unambiguous point on circle '+id);return p;
    };
    const fresh=async()=>{await page.setViewportSize({width:1100,height:800});await page.evaluate(()=>window.__edu.load({model:{}}));log=[];};
    const newIds=(before,after,kind)=>Object.keys(after.runtime[kind]).filter(id=>!before.runtime[kind][id]);
    const segment=async(a,b)=>{await tool('modeSegment');await clickPoint(a);await clickPoint(b);return (await state()).selectedLineId;};
    const intersection=async(a,b)=>{const before=await state();await tool('modeIntersection');await clickLine(a);await clickLine(b);const after=await state();const ids=newIds(before,after,'points');if(!ids.length)throw new Error('No intersection '+a+' '+b);return ids[0];};
    const midpointOn=async line=>{const before=await state();await tool('modeMidpoint');await clickLine(line,true);return newIds(before,await state(),'points')[0];};
    const perpendicular=async(p,l)=>{const before=await state();await tool('modePerpendicular');await clickPoint(p);await clickLine(l,true);const ids=newIds(before,await state(),'lines');if(!ids.length)throw new Error('No perpendicular');return ids[0];};
    const bisector=async(l1,l2)=>{const before=await state();await tool('modeBisector');await clickLine(l1,true);await clickLine(l2,true);const ids=newIds(before,await state(),'lines');if(!ids.length)throw new Error('No bisector');return ids[0];};
    const perpBisectorPoints=async(a,b)=>{const before=await state();await tool('modePerpBisector');await clickPoint(a);await clickPoint(b);const after=await state(),ids=newIds(before,after,'lines').filter(id=>after.runtime.lines[id].construction_kind==='perpendicular');if(!ids.length)throw new Error('No perpendicular bisector');return ids[0];};
    const circle=async(o,p)=>{const before=await state();await tool('modeCircle');await clickPoint(o);await clickPoint(p);const ids=newIds(before,await state(),'circles');if(!ids.length)throw new Error('No circle');return ids[0];};
    const label=async(id,text)=>{
      await idle();await tool('modeLabel');await clickPoint(id);
      await page.evaluate(id=>window.__edu.labelEditor(id),id);await page.locator('#labelText').fill(text);
      const actual=(await state()).runtime.points[id]?.label?.text;
      if(actual!==text)throw new Error(`Label ${id} not applied: ${actual}`);
      await idle();
    };
    const triangle=async()=>{
      await tool('modePolygon');for(const p of [{x:300,y:520},{x:700,y:520},{x:430,y:260},{x:300,y:520}])await worldClick(p);
      const s=await state(),poly=Object.values(s.runtime.polygons)[0];if(!poly)throw new Error('Triangle not created');
      const [A,B,C]=poly.points;await label(A,'A');await label(B,'B');await label(C,'C');
      const t=await state();const side=(a,b)=>Object.values(t.runtime.lines).find(l=>l.points.includes(a)&&l.points.includes(b)).id;
      return {A,B,C,AB:side(A,B),BC:side(B,C),CA:side(C,A),polygon:poly.id};
    };
    const stages=[];
    const stage=async(name)=>{stages.push({name,data:await doc()});};
    const dragPoint=async(id,target,steps=24)=>{
      await idle();const s=await state(),p=s.runtime.points[id];
      const start=await page.evaluate(p=>window.__edu.worldToCanvas(p.x,p.y),p),end=await page.evaluate(p=>window.__edu.worldToCanvas(p.x,p.y),target);
      await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps});await page.mouse.up();
    };
    const geometry=s=>({points:Object.fromEntries(Object.entries(s.runtime.points).map(([id,p])=>[id,{x:p.x,y:p.y}])),lines:Object.fromEntries(Object.entries(s.runtime.lines).map(([id,l])=>[id,l.points]))});
    const positionsDiff=(a,b)=>{
      const ids=Object.keys(a.runtime.points),ids2=Object.keys(b.runtime.points);if(JSON.stringify(ids)!==JSON.stringify(ids2))return Infinity;
      return Math.max(0,...ids.map(id=>distance(a.runtime.points[id],b.runtime.points[id])));
    };
    const saveEvidence=async(name)=>{fs.writeFileSync(path.join(OUT,name+'.json'),JSON.stringify(await doc(),null,2));await page.screenshot({path:path.join(OUT,name+'.png')});};
    const check=(kind,s,ids)=>{
      const p=id=>s.runtime.points[id],out={};
      const A=p(ids.A),B=p(ids.B),C=p(ids.C);
      if(kind==='centroid'){
        const expected={x:(A.x+B.x+C.x)/3,y:(A.y+B.y+C.y)/3};out.centroidError=distance(p(ids.G),expected);
        for(const [m,a,b] of [[ids.Ma,B,C],[ids.Mb,C,A],[ids.Mc,A,B]])out['midpoint-'+m]=distance(p(m),mid(a,b));
      }
      if(kind==='orthocenter'){
        const H=p(ids.H);out.altitudeA=Math.abs((H.x-A.x)*(C.x-B.x)+(H.y-A.y)*(C.y-B.y))/Math.max(distance(B,C),1);
        out.altitudeB=Math.abs((H.x-B.x)*(A.x-C.x)+(H.y-B.y)*(A.y-C.y))/Math.max(distance(C,A),1);
        out.altitudeC=Math.abs((H.x-C.x)*(B.x-A.x)+(H.y-C.y)*(B.y-A.y))/Math.max(distance(A,B),1);
      }
      if(kind==='circumcircle'){
        const c=s.runtime.circles[ids.circle],O=p(c.center),r=distance(O,p(c.radius_point));
        out.circleA=Math.abs(distance(O,A)-r);out.circleB=Math.abs(distance(O,B)-r);out.circleC=Math.abs(distance(O,C)-r);
        for(const lid of ids.bisectors){const l=s.runtime.lines[lid];out['bisector-'+lid]=lineDistance(p(l.defining_points[0]),p(l.defining_points[1]),O);}
      }
      if(kind==='incircle'){
        const c=s.runtime.circles[ids.circle],I=p(c.center),r=distance(I,p(c.radius_point));
        out.sideAB=Math.abs(lineDistance(A,B,I)-r);out.sideBC=Math.abs(lineDistance(B,C,I)-r);out.sideCA=Math.abs(lineDistance(C,A,I)-r);
      }
      if(kind==='tangents'){
        const c=s.runtime.circles[ids.circle],O=p(c.center),P=p(ids.P),r=distance(O,p(c.radius_point));
        out.external=distance(O,P)>r+1e-5;
        out.circleAvailable=c.geometryValid!==false;
        for(const [i,lid]of ids.tangents.entries()){
          const l=s.runtime.lines[lid],T=p(l.perpendicular.throughPoint),U=p(l.perpendicular.helperPoint);
          out['contact'+i]=Math.abs(distance(O,T)-r);
          out['throughP'+i]=lineDistance(T,U,P);
          out['perpendicular'+i]=Math.abs((U.x-T.x)*(T.x-O.x)+(U.y-T.y)*(T.y-O.y))/Math.max(distance(T,U),1);
          out['contactHidden'+i]=!!T.style.hidden;
          out['contactAvailable'+i]=T.geometryValid!==false;
          out['tangentAvailable'+i]=l.geometryValid!==false;
        }
      }
      if(kind==='euler-ninepoint'){
        const O=p(ids.O),G=p(ids.G),H=p(ids.H),circle=s.runtime.circles[ids.nineCircle],N=p(circle.center),r=distance(N,p(circle.radius_point));
        out.eulerLine=lineDistance(O,G,H);
        for(const id of ids.midpoints.concat(ids.feet))out['ninepoint-'+id]=Math.abs(distance(N,p(id))-r);
        out.circleA=Math.abs(distance(N,p(ids.midpoints[0]))-r);
      }
      if(kind==='simson'){
        const [E,F,G]=ids.feet.map(p),line=s.runtime.lines[ids.simsonLine],a=p(line.points[0]),b=p(line.points[1]);
        out.collinear=lineDistance(a,b,G);
        out.circlePoint=Math.abs(distance(p(ids.O),p(ids.P))-distance(p(ids.O),p(ids.circumferencePoint)));
        out.circleAvailable=s.runtime.circles[ids.circumcircle]?.geometryValid!==false;
        out.pointAvailable=p(ids.P)?.geometryValid!==false;
        out.feetAvailable=ids.feet.every(id=>p(id)?.geometryValid!==false);
        out.simsonLineAvailable=s.runtime.lines[ids.simsonLine]?.geometryValid!==false;
      }
      if(kind==='power-secants'){
        const P=p(ids.P),a=ids.secant1Points.map(p),b=ids.secant2Points.map(p),products=[distance(P,a[0])*distance(P,a[1]),distance(P,b[0])*distance(P,b[1])];
        out.secantPowerRelativeError=Math.abs(products[0]-products[1])/Math.max(1,products[0],products[1]);
      }
      out.maxError=Math.max(0,...Object.values(out).filter(v=>typeof v==='number'));
      out.finite=Object.values(s.runtime.points).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
      out.allAvailable=['points','lines','circles','polygons'].every(kind=>Object.values(s.runtime[kind]).every(object=>object.geometryValid!==false));
      return out;
    };
    const runCase=async(kind,title,build)=>{
      await fresh();stages.length=0;
      const ids=await build();await idle();const rawExport=await doc();const initial=await state(),baseline=rawExport;
      const result={kind,title,ids,initial:check(kind,initial,ids),actions:copy(log),tests:[]};
      await stage('gotowa-konstrukcja');
      fs.writeFileSync(path.join(MATERIALS,kind+'.png'),Buffer.from(await page.evaluate(()=>window.__edu.capture())));
      const archive={};for(let i=0;i<stages.length;i++)archive[String(i+1).padStart(2,'0')+'-'+stages[i].name+'.json']=strToU8(JSON.stringify(stages[i].data,null,2));
      fs.writeFileSync(path.join(MATERIALS,kind+'-kroki.ctr'),zipSync(archive));
      fs.writeFileSync(path.join(MATERIALS,kind+'.ctr'),zipSync({[kind+'.json']:strToU8(JSON.stringify(baseline,null,2))}));
      fs.writeFileSync(path.join(MATERIALS,kind+'.json'),JSON.stringify(baseline,null,2));
      fs.writeFileSync(path.join(OUT,kind+'-raw-export.json'),JSON.stringify(rawExport,null,2));
      const sampleTargets=kind==='tangents'?[{x:740,y:300},{x:500,y:350},{x:410,y:350},{x:740,y:450}]:kind==='power-secants'?[{x:350,y:340},{x:180,y:450},{x:250,y:450},{x:220,y:460}]:[{x:350,y:340},{x:180,y:450},{x:430,y:570},{x:430,y:260}];
      for(let i=0;i<sampleTargets.length;i++){
        const target=sampleTargets[i],dragId=ids.C||ids.P;await dragPoint(dragId,target);
        const s=await state(),metrics=check(kind,s,ids),diagnostics=kind==='simson'?(()=>{
          const circle=s.runtime.circles[ids.circumcircle],circleCenter=s.runtime.points[circle.center],circleRadius=distance(circleCenter,s.runtime.points[circle.radius_point]),secantInputs=ids.secantInputs.map(id=>copy(s.runtime.points[id]));
          const circleLineGap=lineDistance(secantInputs[0],secantInputs[1],circleCenter);
          return {A:copy(s.runtime.points[ids.A]),B:copy(s.runtime.points[ids.B]),C:copy(s.runtime.points[ids.C]),
            O:copy(s.runtime.points[ids.O]),circle:copy(circle),circleCenter:copy(circleCenter),circleRadius,circleLineGap,
            expectedIntersection:circle.geometryValid!==false&&circleLineGap<=circleRadius+1e-6,
            view:{zoomFactor:s.zoomFactor,panOffset:copy(s.panOffset)},
            secantInputs,P:copy(s.runtime.points[ids.P]),feet:ids.feet.map(id=>copy(s.runtime.points[id])),simsonLine:copy(s.runtime.lines[ids.simsonLine])};
        })():undefined;
        result.tests.push({action:'drag-point',target,actual:copy(s.runtime.points[dragId]),metrics,diagnostics});
        if(kind==='simson'){
          await page.waitForTimeout(250);
          await page.screenshot({path:path.join(OUT,'simson-drag-'+i+'.png')});
          fs.writeFileSync(path.join(OUT,'simson-drag-'+i+'-canvas.png'),Buffer.from(await page.evaluate(()=>window.__edu.capture())));
        }
        if(metrics.maxError>0.05||!metrics.finite){await saveEvidence(kind+'-drag-'+i);}
        if(kind==='incircle'&&i===0){await page.evaluate(()=>window.__edu.recomputeForDiagnosis());result.tests.push({action:'diagnostic-extra-recompute-after-vertex',metrics:check(kind,await state(),ids)});}
      }
      if(kind==='tangents'){
        await page.evaluate(d=>window.__edu.load(d),rawExport);
        const reloaded=await state();
        const kindsBefore=Object.fromEntries(Object.values(initial.runtime.circles).map(c=>[c.id,c.circle_kind||'center-radius']));
        const kindsAfter=Object.fromEntries(Object.values(reloaded.runtime.circles).map(c=>[c.id,c.circle_kind||'center-radius']));
        await dragPoint(ids.P,{x:740,y:300});const changed=await state();
        result.tests.push({action:'raw-app-export-reload-and-drag',kindsBefore,kindsAfter,centerDrift:distance(initial.runtime.points[ids.O],changed.runtime.points[ids.O]),metrics:check(kind,changed,ids)});
        await saveEvidence(kind+'-raw-reload-drag');
      }
      if(kind==='incircle'){
        const comparison=[];
        for(const [name,document]of[['before-contact-point',stages.find(s=>s.name==='dwusieczne').data],['after-contact-point',baseline]]){
          await page.evaluate(d=>window.__edu.load(d),document);await dragPoint(ids.C,{x:350,y:340});const s=await state(),p=id=>s.runtime.points[id];
          const angles=ids.bisectors.map(lid=>{
            const l=s.runtime.lines[lid],v=p(l.bisector.vertex),h=p(l.bisector.bisectPoint),m=h.bisectMeta;
            const other=ref=>p(ref.a===v.id?ref.b:ref.a),a=other(m.seg1),b=other(m.seg2),la=distance(v,a),lb=distance(v,b);
            const u={x:(a.x-v.x)/la+(b.x-v.x)/lb,y:(a.y-v.y)/la+(b.y-v.y)/lb},ul=Math.hypot(u.x,u.y),hl=distance(v,h);
            const errorDegrees=Math.acos(Math.max(-1,Math.min(1,((h.x-v.x)*u.x+(h.y-v.y)*u.y)/(ul*hl))))*180/Math.PI;
            const adjacent=ref=>{const pts=s.runtime.lines[ref.lineId].points;return Math.abs(pts.indexOf(ref.a)-pts.indexOf(ref.b))===1;};
            return {line:lid,errorDegrees,refsAdjacent:[adjacent(m.seg1),adjacent(m.seg2)]};
          });comparison.push({name,angles});
        }
        result.tests.push({action:'bisector-split-side-comparison',comparison});
      }
      // Restore the construction through the application's existing importer.
      await page.evaluate(d=>window.__edu.load(d),baseline);
      if(ids.polygon){
        await idle();const start=await linePosition(ids.AB,true);const c=await page.evaluate(p=>window.__edu.worldToCanvas(p.x,p.y),start);
        await page.mouse.move(c.x,c.y);await page.mouse.down();await page.mouse.move(c.x+65,c.y-30,{steps:20});await page.mouse.up();
        let s=await state();result.tests.push({action:'drag-polygon',metrics:check(kind,s,ids),vertexDelta:{x:s.runtime.points[ids.A].x-initial.runtime.points[ids.A].x,y:s.runtime.points[ids.A].y-initial.runtime.points[ids.A].y}});
        if(check(kind,s,ids).maxError>0.05)await saveEvidence(kind+'-polygon-drag');
        if(kind==='incircle'){
          const settling=[];for(let n=0;n<5;n++){await page.evaluate(()=>window.__edu.recomputeForDiagnosis());settling.push(check(kind,await state(),ids));}
          result.tests.push({action:'diagnostic-extra-recompute-after-drag',metricsByCall:settling});
        }
        await page.evaluate(d=>window.__edu.load(d),baseline);await idle();await clickLine(ids.AB,true);
        let handles=await page.evaluate(id=>window.__edu.polygonHandles(id),ids.polygon);
        if(handles){
          const obstruction=await page.evaluate(p=>{const c=window.__edu.worldToCanvas(p.x,p.y),e=document.elementFromPoint(c.x,c.y);return {position:c,element:e?.id,classes:e?.className};},handles.scaleHandle);
          result.tests.push({action:'scale-handle-access',...obstruction});
          for(let n=0;n<3;n++){
            const visible=await page.evaluate(p=>{const c=window.__edu.worldToCanvas(p.x,p.y);return document.elementFromPoint(c.x,c.y)?.id==='canvas';},handles.scaleHandle);
            if(visible)break;await page.mouse.move(550,400);await page.mouse.wheel(0,180);
          }
          const source=handles.scaleHandle,target={x:handles.center.x+(source.x-handles.center.x)*1.2,y:handles.center.y+(source.y-handles.center.y)*1.2};
          const from=await page.evaluate(p=>window.__edu.worldToCanvas(p.x,p.y),source),to=await page.evaluate(p=>window.__edu.worldToCanvas(p.x,p.y),target);
          await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:20});await page.mouse.up();
          s=await state();result.tests.push({action:'scale-polygon',metrics:check(kind,s,ids),baseLengthRatio:distance(s.runtime.points[ids.A],s.runtime.points[ids.B])/distance(initial.runtime.points[ids.A],initial.runtime.points[ids.B])});
          if(check(kind,s,ids).maxError>0.05)await saveEvidence(kind+'-polygon-scale');
          const scaled=s;await page.locator('#undo').click();const undone=await state();await page.locator('#redo').click();const redone=await state();
          result.tests.push({action:'undo-redo-scale',undoPositionError:positionsDiff(initial,undone),redoPositionError:positionsDiff(scaled,redone)});
          await page.evaluate(d=>window.__edu.load(d),baseline);await idle();await clickLine(ids.AB,true);
          handles=await page.evaluate(id=>window.__edu.polygonHandles(id),ids.polygon);
          const rotateAccess=await page.evaluate(p=>{const c=window.__edu.worldToCanvas(p.x,p.y),e=document.elementFromPoint(c.x,c.y);return {position:c,element:e?.id,classes:e?.className};},handles.rotateHandle);
          result.tests.push({action:'rotate-handle-access',...rotateAccess});
          for(let n=0;n<3;n++){
            const visible=await page.evaluate(p=>{const c=window.__edu.worldToCanvas(p.x,p.y);return document.elementFromPoint(c.x,c.y)?.id==='canvas';},handles.rotateHandle);
            if(visible)break;await page.mouse.move(550,400);await page.mouse.wheel(0,180);
          }
          const angle=Math.PI/9,dx=handles.rotateHandle.x-handles.center.x,dy=handles.rotateHandle.y-handles.center.y;
          const rotateTarget={x:handles.center.x+dx*Math.cos(angle)-dy*Math.sin(angle),y:handles.center.y+dx*Math.sin(angle)+dy*Math.cos(angle)};
          const rf=await page.evaluate(p=>window.__edu.worldToCanvas(p.x,p.y),handles.rotateHandle),rt=await page.evaluate(p=>window.__edu.worldToCanvas(p.x,p.y),rotateTarget);
          await page.mouse.move(rf.x,rf.y);await page.mouse.down();const rotationStart=await state();await page.mouse.move(rt.x,rt.y,{steps:20});const duringRotation=await state();await page.mouse.up();
          s=await state();result.tests.push({action:'rotate-polygon',metrics:check(kind,s,ids),actualRotation:Math.atan2(s.runtime.points[ids.B].y-s.runtime.points[ids.A].y,s.runtime.points[ids.B].x-s.runtime.points[ids.A].x),started:rotationStart.rotating,during:duringRotation.rotating,selectedPolygon:rotationStart.selectedPolygonId});
          if(check(kind,s,ids).maxError>0.05)await saveEvidence(kind+'-polygon-rotation');
        }
      }
      // Group the entire construction using the actual selection rectangle.
      await page.evaluate(d=>window.__edu.load(d),baseline);await idle();await tool('modeMultiselect');
      const boxStart=await page.evaluate(()=>{const r=window.__edu,s=r.state();for(const c of[{x:35,y:65},{x:70,y:85},{x:100,y:65}]){const p={x:(c.x-s.panOffset.x)/s.zoomFactor,y:(c.y-s.panOffset.y)/s.zoomFactor};if(!r.findPoint(p)&&!r.findLineHits(p).length&&!r.findCircle(p,16/s.zoomFactor,false))return c;}return null;});
      if(boxStart){
        await page.mouse.move(boxStart.x,boxStart.y);await page.mouse.down();await page.mouse.move(1060,710,{steps:10});await page.mouse.up();
        result.tests.push({action:'group-selection',selection:await page.evaluate(()=>window.__edu.selectAllForInspection())});
        let handles=await page.evaluate(()=>window.__edu.multiHandles());
        if(handles){
          for(let n=0;n<3;n++){
            const visible=await page.evaluate(p=>{const c=window.__edu.worldToCanvas(p.x,p.y);return document.elementFromPoint(c.x,c.y)?.id==='canvas';},handles.scaleHandle);
            if(visible)break;await page.mouse.move(550,400);await page.mouse.wheel(0,180);
          }
          const pId=ids.A||ids.P,source=(await state()).runtime.points[pId],from=await page.evaluate(p=>window.__edu.worldToCanvas(p.x,p.y),source);
          await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+30,from.y-20,{steps:12});await page.mouse.up();
          let s=await state();result.tests.push({action:'drag-group',metrics:check(kind,s,ids),pointDelta:{x:s.runtime.points[pId].x-source.x,y:s.runtime.points[pId].y-source.y}});
          if(check(kind,s,ids).maxError>0.05)await saveEvidence(kind+'-group-drag');
          handles=await page.evaluate(()=>window.__edu.multiHandles());
          if(handles){
            const start=handles.scaleHandle,target={x:handles.center.x+(start.x-handles.center.x)*1.15,y:handles.center.y+(start.y-handles.center.y)*1.15};
            const a=await page.evaluate(p=>window.__edu.worldToCanvas(p.x,p.y),start),b=await page.evaluate(p=>window.__edu.worldToCanvas(p.x,p.y),target);
            const beforeGroupScale=await state();await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:15});await page.mouse.up();s=await state();
            const refPair=ids.A?[ids.A,ids.B]:[ids.O,ids.P];
            result.tests.push({action:'scale-group',metrics:check(kind,s,ids),ratio:distance(s.runtime.points[refPair[0]],s.runtime.points[refPair[1]])/distance(beforeGroupScale.runtime.points[refPair[0]],beforeGroupScale.runtime.points[refPair[1]])});
            if(check(kind,s,ids).maxError>0.05)await saveEvidence(kind+'-group-scale');
          }
        }
      }
      await page.evaluate(d=>window.__edu.load(d),baseline);await idle();const beforeView=await state();
      await page.mouse.move(500,400);await page.mouse.wheel(0,-450);
      const zoomed=await state();result.tests.push({action:'wheel-zoom',positionError:positionsDiff(beforeView,zoomed),zoomBefore:beforeView.zoomFactor,zoomAfter:zoomed.zoomFactor});
      await idle();let blank=await page.evaluate(()=>{const r=window.__edu,s=r.state();for(const c of [{x:80,y:650},{x:1030,y:110},{x:1030,y:650}]){const p={x:(c.x-s.panOffset.x)/s.zoomFactor,y:(c.y-s.panOffset.y)/s.zoomFactor};if(!r.findPoint(p)&&!r.findLineHits(p).length&&!r.findCircle(p,16/s.zoomFactor,false))return c;}return null;});
      if(blank){await page.mouse.move(blank.x,blank.y);await page.mouse.down();await page.mouse.move(blank.x+35,blank.y-25,{steps:8});await page.mouse.up();result.tests.push({action:'pan',positionError:positionsDiff(beforeView,await state())});}
      // Mobile re-open, pinch and pan must preserve the geometry.
      await page.setViewportSize({width:390,height:844});await page.evaluate(d=>window.__edu.load(d),baseline);
      const mobileBefore=await state(),cdp=await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:110,y:500,id:1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:110,y:500,id:1},{x:260,y:500,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:80,y:500,id:1},{x:290,y:500,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      const mobileAfter=await state();result.tests.push({action:'mobile-pinch',positionError:positionsDiff(mobileBefore,mobileAfter),zoomBefore:mobileBefore.zoomFactor,zoomAfter:mobileAfter.zoomFactor});
      await page.screenshot({path:path.join(OUT,kind+'-mobile.png')});
      // Every stage in the exported ZIP must load and contain finite points.
      for(const [name,data]of Object.entries(unzipSync(fs.readFileSync(path.join(MATERIALS,kind+'-kroki.ctr'))))){
        const exported=JSON.parse(new TextDecoder().decode(data));await page.evaluate(d=>window.__edu.load(d),exported);const loaded=await state();result.tests.push({action:'reload-ctr-stage',name,metrics:name.includes('gotowa-konstrukcja')?check(kind,loaded,ids):{finite:Object.values(loaded.runtime.points).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),pointCount:Object.keys(loaded.runtime.points).length}});
      }
      if(VERIFY){
        result.failures=[];
        for(const [index,test]of[{action:'initial',metrics:result.initial},...result.tests].entries()){
          const m=test.metrics;
          const requiresMetric=index===0||['drag-point','drag-polygon','scale-polygon','rotate-polygon','drag-group','scale-group','reload-ctr-stage'].includes(test.action);
          const requiresError=index===0||['drag-point','drag-polygon','scale-polygon','rotate-polygon','drag-group','scale-group'].includes(test.action);
          if(requiresMetric&&(!m||typeof m.finite!=='boolean'))result.failures.push({index,action:test.action,error:'missing geometry metrics',metrics:m});
          if(requiresError&&typeof m?.maxError!=='number')result.failures.push({index,action:test.action,error:'missing invariant error metric',metrics:m});
          const hasExistingSimson=kind!=='simson'||m?.pointAvailable!==false;
          if(m&&(!m.finite||(hasExistingSimson&&m.external!==false&&typeof m.maxError==='number'&&m.maxError>0.05)))result.failures.push({index,action:test.action,metrics:m});
          if(m&&typeof m.maxError==='number'&&['euler-ninepoint','power-secants'].includes(kind)&&m.allAvailable!==true)result.failures.push({index,action:test.action,error:'valid construction became unavailable',metrics:m});
          if(kind==='simson'&&m&&typeof m.maxError==='number'&&(m.circleAvailable!==true||(test.action!=='drag-point'&&m.allAvailable!==true)))result.failures.push({index,action:test.action,error:'expected valid Simson configuration',metrics:m});
          if(['wheel-zoom','pan','mobile-pinch'].includes(test.action)&&typeof test.positionError!=='number')result.failures.push({index,action:test.action,error:'missing view position metric'});
          if(test.action==='undo-redo-scale'&&(typeof test.undoPositionError!=='number'||typeof test.redoPositionError!=='number'))result.failures.push({index,action:test.action,error:'missing undo/redo position metrics'});
          if(m&&kind==='tangents'&&m.external===false&&(!m.circleAvailable||m.contactAvailable0||m.contactAvailable1||m.tangentAvailable0||m.tangentAvailable1))result.failures.push({index,action:'invalid-tangents-visible',metrics:m});
          if(test.positionError>1e-6||test.undoPositionError>1e-6||test.redoPositionError>1e-6)result.failures.push({index,action:test.action,error:'unexpected coordinate change'});
          if(test.action==='rotate-polygon'&&(!test.started||Math.abs(test.actualRotation-Math.PI/9)>1e-5))result.failures.push({index,action:test.action,error:'rotation did not occur'});
          if(test.action==='scale-polygon'&&Math.abs(test.baseLengthRatio-1.2)>1e-5)result.failures.push({index,action:test.action,error:'scale did not occur'});
          if(test.action==='scale-group'&&Math.abs(test.ratio-1.15)>1e-5)result.failures.push({index,action:test.action,error:'group scale did not occur'});
        }
        if(kind==='simson'){
          const drags=result.tests.filter(t=>t.action==='drag-point'),availability=[result.initial.pointAvailable,...drags.map(t=>t.diagnostics.expectedIntersection)];
          for(const [index,test]of drags.entries()){
            const d=test.diagnostics,pointAvailable=d.P.geometryValid!==false,feetAvailable=d.feet.every(p=>p.geometryValid!==false),lineAvailable=d.simsonLine.geometryValid!==false;
            if(d.expectedIntersection!==pointAvailable)result.failures.push({action:'simson-point-availability',index,expected:d.expectedIntersection,actual:pointAvailable,circleLineGap:d.circleLineGap,circleRadius:d.circleRadius});
            if(d.expectedIntersection!==feetAvailable||d.expectedIntersection!==lineAvailable)result.failures.push({action:'simson-dependent-availability',index,expected:d.expectedIntersection,feetAvailable,lineAvailable});
          }
          const lostAt=availability.findIndex(value=>!value),recovered=lostAt>=0&&availability.slice(lostAt+1).some(Boolean);
          if(lostAt<0||!recovered)result.failures.push({action:'simson-unavailable-recovery',availability,error:'expected no-intersection state followed by recovered construction'});
        }
      }
      results.constructions.push(result);fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));
      console.log(JSON.stringify({kind,initial:result.initial,tests:result.tests.map(t=>({action:t.action,error:t.metrics?.maxError,positionError:t.positionError,ratio:t.baseLengthRatio,rotation:t.actualRotation,started:t.started,element:t.element}))}));
    };
    const selected=process.argv[2]||'all';
    const cases={
      centroid:['Środek ciężkości trójkąta',async()=>{const t=await triangle();await stage('trojkat');const Mc=await midpointOn(t.AB),Ma=await midpointOn(t.BC),Mb=await midpointOn(t.CA);await stage('srodki-bokow');const mC=await segment(t.C,Mc),mA=await segment(t.A,Ma);const G=await intersection(mC,mA);await segment(t.B,Mb);await label(Ma,'D');await label(Mb,'E');await label(Mc,'F');await label(G,'G');return {...t,Ma,Mb,Mc,G};}],
      orthocenter:['Ortocentrum trójkąta',async()=>{const t=await triangle();await stage('trojkat');const hC=await perpendicular(t.C,t.AB),hA=await perpendicular(t.A,t.BC),H=await intersection(hC,hA);await perpendicular(t.B,t.CA);await label(H,'H');return {...t,H};}],
      circumcircle:['Okrąg opisany na trójkącie',async()=>{const t=await triangle();await stage('trojkat');const before=await state();await tool('modeCircleThree');await clickPoint(t.A);await clickPoint(t.B);await clickPoint(t.C);const circleId=newIds(before,await state(),'circles')[0];await stage('okrag-przez-trzy-punkty');const bisectors=[];for(const l of[t.AB,t.BC]){const s=await state();await tool('modePerpBisector');await clickLine(l,true);bisectors.push(newIds(s,await state(),'lines')[0]);}const O=(await state()).runtime.circles[circleId].center;await label(O,'O');return {...t,circle:circleId,bisectors};}],
      incircle:['Okrąg wpisany w trójkąt',async()=>{const t=await triangle();await stage('trojkat');const dA=await bisector(t.AB,t.CA),dB=await bisector(t.AB,t.BC);await stage('dwusieczne');const I=await intersection(dA,dB);const normal=await perpendicular(I,t.AB),T=(await state()).runtime.lines[normal].perpendicular.helperPoint;const circleId=await circle(I,T);await label(I,'I');await label(T,'T');return {...t,I,T,circle:circleId,bisectors:[dA,dB]};}],
      tangents:['Dwie styczne z punktu do okręgu',async()=>{await tool('modeCircle');await worldClick({x:330,y:350});await worldClick({x:450,y:350});let s=await state();const circleId=Object.keys(s.runtime.circles)[0],O=s.runtime.circles[circleId].center;await tool('modeAdd');await worldClick({x:650,y:350});s=await state();const P=s.selectedPointId;await stage('okrag-i-punkt');const before=await state();await tool('modeTangent');await clickPoint(P);await worldClick({x:330,y:230});const after=await state();const tangents=newIds(before,after,'lines').filter(id=>after.runtime.lines[id].construction_kind==='perpendicular');if(tangents.length!==2)throw new Error('Expected two tangents');await label(O,'O');await label(P,'P');for(const [i,l]of tangents.entries())await label(after.runtime.lines[l].perpendicular.throughPoint,i?'T_2':'T_1');return {O,P,circle:circleId,tangents};}],
      'euler-ninepoint':['Prosta Eulera i okrąg dziewięciu punktów',async()=>{
        const t=await triangle();await stage('trojkat');
        const Mab=await midpointOn(t.AB),Mbc=await midpointOn(t.BC),Mca=await midpointOn(t.CA);await stage('srodki-bokow');
        const medianA=await segment(t.A,Mbc),medianB=await segment(t.B,Mca),G=await intersection(medianA,medianB);
        const sb1=await perpBisectorPoints(t.A,t.B),sb2=await perpBisectorPoints(t.B,t.C);
        const O=await intersection(sb1,sb2);const altA=await perpendicular(t.A,t.BC),altB=await perpendicular(t.B,t.CA),H=await intersection(altA,altB);
        const footA=await intersection(altA,t.BC),footB=await intersection(altB,t.CA),altC=await perpendicular(t.C,t.AB),footC=await intersection(altC,t.AB);
        await stage('ortocentrum-i-stopy-wysokosci');
        const before=await state();await tool('modeCircleThree');await clickPoint(Mab);await clickPoint(Mbc);await clickPoint(Mca);const nineCircle=newIds(before,await state(),'circles')[0];
        const euler=await segment(O,G);await label(O,'O');await label(G,'G');await label(H,'H');
        return {...t,O,G,H,Mab,Mbc,Mca,midpoints:[Mab,Mbc,Mca],feet:[footA,footB,footC],nineCircle,euler};
      }],
      simson:['Prosta Simsona dla punktu na okręgu opisanym',async()=>{
        const t=await triangle();await stage('trojkat');
        const before=await state();await tool('modeCircleThree');await clickPoint(t.A);await clickPoint(t.B);await clickPoint(t.C);const circumcircle=newIds(before,await state(),'circles')[0];
        const cs=(await state()).runtime.circles[circumcircle],O=cs.center,center=(await state()).runtime.points[O],rad=Math.hypot((await state()).runtime.points[cs.radius_point].x-center.x,(await state()).runtime.points[cs.radius_point].y-center.y);
        const y=center.y+rad*.7;await tool('modeAdd');await worldClick({x:center.x-2*rad,y});const q1=(await state()).selectedPointId;await tool('modeAdd');await worldClick({x:center.x+2*rad,y});const q2=(await state()).selectedPointId;
        const secant=await segment(q1,q2);const px=center.x+rad*Math.sqrt(1-.7*.7);await stage('okrag-i-sieczna');
        const beforeP=await state();await tool('modeIntersection');await clickLine(secant,true);await worldClick({x:center.x,y:center.y-rad});const P=newIds(beforeP,await state(),'points')[0];if(!P)throw new Error('Circle and secant intersection was not created');
        const altA=await perpendicular(P,t.AB),altB=await perpendicular(P,t.BC),altC=await perpendicular(P,t.CA);
        const footAB=await intersection(altA,t.AB),footBC=await intersection(altB,t.BC),footCA=await intersection(altC,t.CA);
        const simsonLine=await segment(footAB,footBC);await label(P,'P');await label(footAB,'X');await label(footBC,'Y');await label(footCA,'Z');await stage('stopy-i-prosta-simsona');
        return {...t,O,P,circumferencePoint:cs.radius_point,feet:[footAB,footBC,footCA],simsonLine,circumcircle,secantInputs:[q1,q2]};
      }],
      'power-secants':['Twierdzenie o siecznych i potędze punktu',async()=>{
        await tool('modeCircle');await worldClick({x:450,y:390});await worldClick({x:550,y:390});let s=await state();const circleId=Object.keys(s.runtime.circles)[0],circle=s.runtime.circles[circleId],O=circle.center;
        await tool('modeAdd');await worldClick({x:190,y:390});const P=(await state()).selectedPointId;
        await tool('modeAdd');await worldClick({x:730,y:390});const q1=(await state()).selectedPointId;
        await tool('modeAdd');await worldClick({x:730,y:260});const q2=(await state()).selectedPointId;
        await stage('okrag-i-punkt-zewnetrzny');
        const secant1=await segment(P,q1),secant2=await segment(P,q2);await stage('dwie-sieczne');
        const before1=await state();await tool('modeIntersection');await clickLine(secant1,true);await worldClick(await circlePosition(circleId,-Math.PI/2));const secant1Points=newIds(before1,await state(),'points');
        const before2=await state();await tool('modeIntersection');await clickLine(secant2,true);await worldClick(await circlePosition(circleId,-Math.PI/2));const secant2Points=newIds(before2,await state(),'points');
        if(secant1Points.length<2||secant2Points.length<2)throw new Error('Both secants must intersect the circle twice: '+JSON.stringify({secant1Points,secant2Points,pointCount:Object.keys((await state()).runtime.points).length}));
        await stage('punkty-przeciecia');await label(P,'P');return {P,O,circle:circleId,secant1,secant2,secant1Points:secant1Points.slice(0,2),secant2Points:secant2Points.slice(0,2)};
      }]
    };
    for(const [kind,[title,build]]of Object.entries(cases))if(selected==='all'?['euler-ninepoint','simson','power-secants'].includes(kind):selected===kind){try{await runCase(kind,title,build);}catch(error){results.constructions.push({kind,title,error:error.message,actions:copy(log)});fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));await page.screenshot({path:path.join(OUT,kind+'-build-error.png')});console.log(JSON.stringify({kind,error:error.message}));}}
    if(VERIFY&&(results.errors.length||results.constructions.some(c=>c.error||c.failures?.length)))throw new Error('Construction UI regression failed; see '+path.join(OUT,'results.json'));
  }finally{await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
