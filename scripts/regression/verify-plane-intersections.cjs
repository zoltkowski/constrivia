const fs=require('node:fs'),path=require('node:path');
const {zipSync,strToU8}=require('fflate');
const {chromium}=require('playwright');
const out=path.resolve(__dirname,'../../output/playwright/plane-intersections');fs.mkdirSync(out,{recursive:true});
const results={checks:[],errors:[]};
const check=(name,passed,observed)=>{results.checks.push({name,passed:!!passed,observed});if(!passed)throw new Error(name+': '+JSON.stringify(observed));};
const archive=document=>({name:'plane-intersections.ctr',bytes:Array.from(zipSync({'plane-intersections.json':strToU8(JSON.stringify(document))}))});
(async()=>{
 const {createServer}=await import('vite');const server=await createServer({server:{host:'127.0.0.1',port:5206,strictPort:true}});await server.listen();let browser;
 try{
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  const page=await browser.newPage({viewport:{width:1250,height:900},serviceWorkers:'block'});
  page.on('pageerror',e=>results.errors.push(e.stack||e.message));page.on('dialog',async d=>{results.errors.push(d.message());await d.dismiss();});
  await page.addInitScript(()=>{window.__planeFiles=[];window.showDirectoryPicker=async()=>({name:'Plane intersections',kind:'directory',queryPermission:async()=>'granted',requestPermission:async()=>'granted',async *values(){for(const f of window.__planeFiles)yield{kind:'file',name:f.name,getFile:async()=>new File([new Uint8Array(f.bytes)],f.name,{type:'application/zip'})};}});});
  await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();const suffix=String.raw`
    let planeTestRevision=0;const planeTestLoad=applyPersistedDocument;applyPersistedDocument=(...args)=>{const value=planeTestLoad(...args);planeTestRevision++;return value;};
    window.__planeTest={
      state:()=>({runtime,mode,pendingIntersection,selectedLineId,selectedSolidId,revision:planeTestRevision}),serialize:serializeCurrentDocument,worldToCanvas,
      faces:id=>spatialFaces(runtime,id).map(face=>({...face,polygonId:face.polygonId??spatialFacePolygon(runtime,id,face.axis,face.side)})),
      handles:id=>spatialHandles(runtime,id,screenUnits(26)),
      target:p=>{const lines=findLineHits(p),circles=findCircles(p,currentHitRadius(),false);return !lines.length&&!circles.length?(hitSpatialFace(runtime,p,showHidden)?.polygonId??polygonAtPointCore(runtime,p,{includeHidden:showHidden})):null;}
    };
  `;await route.fulfill({response,body:`${await response.text()}\n${suffix}`});});
  await page.goto('http://127.0.0.1:5206/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__planeTest);if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
  const state=()=>page.evaluate(()=>window.__planeTest.state());
  const screen=p=>page.evaluate(p=>{const c=window.__planeTest.worldToCanvas(p.x,p.y),r=document.getElementById('canvas').getBoundingClientRect();return{x:r.left+c.x,y:r.top+c.y};},p);
  const body=async id=>{const result=await page.evaluate(id=>{const s=window.__planeTest.state(),poly=s.runtime.polygons[id],ps=poly.points.map(id=>s.runtime.points[id]);const minX=Math.min(...ps.map(p=>p.x)),maxX=Math.max(...ps.map(p=>p.x)),minY=Math.min(...ps.map(p=>p.y)),maxY=Math.max(...ps.map(p=>p.y)),targets=[];for(let y=minY+5;y<maxY-5;y+=4)for(let x=minX+5;x<maxX-5;x+=4){const target=window.__planeTest.target({x,y});if(target===id){const c=window.__planeTest.worldToCanvas(x,y),r=document.getElementById('canvas').getBoundingClientRect();if(document.elementFromPoint(r.left+c.x,r.top+c.y)?.id==='canvas')return{point:{x,y}};}if(target)targets.push(target);}return{bounds:{minX,maxX,minY,maxY},targets:[...new Set(targets)].slice(0,10),visible:s.runtime.solids&&Object.values(s.runtime.solids).map(s=>s.faces)};},id);if(!result.point)throw new Error('No selectable face interior for '+id+': '+JSON.stringify(result));const q=await screen(result.point);await page.mouse.click(q.x,q.y);};
  const load=async doc=>{await page.locator('#modeMove').click();const rect=await page.locator('#canvas').boundingBox();await page.mouse.click(rect.x+rect.width-24,rect.y+rect.height-24);await page.locator('#zoomMenu').click();await page.locator('#clearAll').click();let empty=await state();check('UI clear all resets spatial selection and solids',empty.selectedSolidId===null&&Object.keys(empty.runtime.solids||{}).length===0,{selectedSolidId:empty.selectedSolidId,solids:Object.keys(empty.runtime.solids||{})});const rev=empty.revision;await page.evaluate(file=>window.__planeFiles=[file],archive(doc));await page.locator('#cloudFilesBtn').click();await page.locator('#localFileList [data-change-folder]').click();await page.locator('#localFileList .cloud-file-item').filter({hasText:'plane-intersections'}).click();await page.waitForFunction(n=>window.__planeTest.state().revision>n,rev);await page.locator('#cloudCloseBtn').click();};
  await page.locator('#modePrism').click();if(await page.locator('#ngonModal').isVisible()){await page.locator('#ngonInput').fill('4');await page.locator('#ngonConfirmBtn').click();}
  const canvas=await page.locator('#canvas').boundingBox();await page.mouse.click(canvas.x+canvas.width*.52,canvas.y+canvas.height*.48);
  let s=await state(),solidId=s.selectedSolidId,solid=s.runtime.solids[solidId];check('UI creates a square prism as the source solid',!!solid&&solid.polyhedron?.kind==='prism'&&solid.polyhedron.basePoints.length===4,{solidId,kind:solid?.polyhedron?.kind});
  const edgeLength=()=>page.evaluate(id=>{const s=window.__planeTest.state(),solid=s.runtime.solids[id],[a,b]=s.runtime.lines[solid.edges[0]].defining_points.map(pid=>s.runtime.points[pid].spatialPosition);return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);},solidId);
  const beforeRotate=await edgeLength(),rotate=await page.evaluate(id=>window.__planeTest.handles(id).find(handle=>handle.kind==='rotate'),solidId),r0=await screen(rotate),r1=await screen({x:rotate.x+28,y:rotate.y+18});
  await page.mouse.move(r0.x,r0.y);await page.mouse.down();await page.mouse.move(r1.x,r1.y,{steps:12});await page.mouse.up();
  const afterRotate=await edgeLength();check('UI rotation preserves true 3D source edge length',Math.abs(afterRotate-beforeRotate)<1e-5,{beforeRotate,afterRotate});
  const visible=await page.evaluate(id=>window.__planeTest.faces(id).filter(face=>face.visible&&face.polygonId),solidId);const first=visible[0],second=visible.find(face=>face.axis!==first?.axis),top=first?.polygonId,front=second?.polygonId;
  if(!top||!front)throw new Error('No visible nonparallel plane pair after UI rotation: '+JSON.stringify(visible));
  await page.locator('#modeIntersection').click();await body(top);check('First polygon is pending', (await state()).pendingIntersection?.id===top,(await state()).pendingIntersection);
  await body(front);s=await state();let lines=Object.values(s.runtime.lines).filter(l=>l.defining_parents?.includes(top)&&l.defining_parents?.includes(front));
  check('Two polygon clicks create one finite 3D segment',lines.length===1&&lines[0].geometryValid!==false,lines.map(l=>({id:l.id,geometryValid:l.geometryValid,points:l.defining_points})));
  const line=lines[0],ends=line.defining_points.map(id=>s.runtime.points[id].spatialPosition);const length=Math.hypot(ends[0].x-ends[1].x,ends[0].y-ends[1].y,ends[0].z-ends[1].z);
  check('Segment endpoints span the shared finite face edge',Math.abs(length-beforeRotate)<1e-5,{length,beforeRotate,ends});
  check('Segment endpoint bindings retain both polygon inputs',line.defining_points.every(id=>s.runtime.points[id].spatial?.binding.kind==='polygonIntersection'&&s.runtime.points[id].spatial.binding.polygons.includes(top)&&s.runtime.points[id].spatial.binding.polygons.includes(front)),line.defining_points.map(id=>s.runtime.points[id].spatial?.binding));
  await page.locator('#undo').click();let historyState=await state();let historyLines=Object.values(historyState.runtime.lines).filter(l=>l.defining_parents?.includes(top)&&l.defining_parents?.includes(front));check('Undo removes the intersection segment',historyLines.length===0,historyLines.map(l=>l.id));await page.locator('#redo').click();historyState=await state();historyLines=Object.values(historyState.runtime.lines).filter(l=>l.defining_parents?.includes(top)&&l.defining_parents?.includes(front));check('Redo restores the intersection segment',historyLines.length===1,historyLines.map(l=>l.id));
  const saved=await page.evaluate(()=>window.__planeTest.serialize());await load(saved);s=await state();lines=Object.values(s.runtime.lines).filter(l=>l.defining_parents?.includes(top)&&l.defining_parents?.includes(front));
  check('Intersection segment survives a real CTR save and reload',lines.length===1&&lines[0].geometryValid!==false,lines.map(l=>({id:l.id,valid:l.geometryValid,points:l.defining_points})));
  check('Reload preserves the segment input definitions',lines[0]?.defining_points.every(id=>s.runtime.points[id].spatial?.binding.kind==='polygonIntersection'),lines[0]?.defining_points);
  check('No browser exceptions',results.errors.length===0,results.errors);
 }catch(e){results.errors.push(e.stack||String(e));process.exitCode=1;}finally{await browser?.close();await server.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
 console.log(JSON.stringify({checks:results.checks.length,passed:results.checks.filter(c=>c.passed).length,errors:results.errors}));if(results.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
