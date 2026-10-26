const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const out=path.resolve(__dirname,'../../output/playwright/solid-face-move');fs.mkdirSync(out,{recursive:true});
const result={checks:[],errors:[]},check=(name,passed,data)=>{result.checks.push({name,passed:!!passed,data});if(!passed)throw Error(name+': '+JSON.stringify(data));};
(async()=>{
 const {createServer}=await import('vite'),server=await createServer({server:{host:'127.0.0.1',port:5222,strictPort:true}});await server.listen();let browser,page;
 try{
  const {makeEmptyRuntime}=await server.ssrLoadModule('/src/core/runtimeTypes.ts');
  const {createCuboid,createPrismOrPyramid,syncSpatialGeometry}=await server.ssrLoadModule('/src/core/spatialGeometry.ts');
  const {setSpatialSolidShapeLocked}=await server.ssrLoadModule('/src/core/spatialSolidEditing.ts');
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  for(const [kind,mobile] of [['prism',false],['pyramid',false],['cuboid',false],['prism',true],['pyramid',true]]){
   const tag=kind+(mobile?'-touch':'-mouse');page=await browser.newPage({viewport:{width:mobile?390:1100,height:850},hasTouch:true,serviceWorkers:'block'});page.on('pageerror',e=>result.errors.push(e.message));
   await page.addInitScript(()=>{localStorage.setItem('geometry.grid',JSON.stringify({visible:false}));localStorage.setItem('geometry.lang','pl');});
   await page.route('**/src/main.ts*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+`
    window.__faceMove={load:applyPersistedDocument,save:serializeCurrentDocument,worldToCanvas,control:spatialControlAt,faceHit:p=>hitSpatialFace(runtime,p,showHidden),pointHit:findPoint,edgeHit:spatialEdgeAt,
     state:()=>({runtime,selectedSolidId,selectedPolygonId,historyIndex,panOffset,zoomFactor,handle:selectedSolidId?spatialFaceMoveHandle(runtime,selectedSolidId,selectedPolygonId,screenUnits(26),showHidden):null}),
     faces:id=>spatialFaces(runtime,id).map(f=>({...f,polygonId:f.polygonId??spatialFacePolygon(runtime,id,f.axis,f.side)})),
     lock:(id,value)=>{setSpatialSolidShapeLocked(runtime,id,value);draw();},zoom:value=>{zoomFactor=value;draw();}
    };`});});
   await page.goto('http://127.0.0.1:5222/',{waitUntil:'networkidle'});if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
   const state=()=>page.evaluate(()=>window.__faceMove.state()),screen=p=>page.evaluate(p=>{const q=window.__faceMove.worldToCanvas(p.x,p.y),r=document.getElementById('canvas').getBoundingClientRect();return{x:r.x+q.x,y:r.y+q.y};},p);
   const click=async p=>{const q=await screen(p);if(mobile)await page.touchscreen.tap(q.x,q.y);else await page.mouse.click(q.x,q.y);};
   const drag=async(h,along,across=0,cancel=false)=>{const d=h.projectedDirection,from=await screen(h),to=await screen({x:h.x+d.x*along-d.y*across,y:h.y+d.y*along+d.x*across});check(tag+': handle receives canvas input',await page.evaluate(q=>document.elementFromPoint(q.x,q.y)?.id,from)==='canvas',from);
    if(mobile){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...from}]});for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:from.x+(to.x-from.x)*i/10,y:from.y+(to.y-from.y)*i/10}]});await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();}
    else{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:10});await page.mouse.up();}
   };
   const r=makeEmptyRuntime(),id=kind==='cuboid'?createCuboid(r,{x:300,y:350},100):createPrismOrPyramid(r,kind,{x:300,y:350},100,4);setSpatialSolidShapeLocked(r,id,false);r.solids[id].heightLocked=true;syncSpatialGeometry(r);
   const doc={model:{points:Object.values(r.points),lines:Object.values(r.lines),polygons:Object.values(r.polygons),solids:r.solids,spatialGroups:r.spatialGroups}};
   await page.evaluate(doc=>window.__faceMove.load(doc),JSON.parse(JSON.stringify(doc)));
   const findTarget=polygonId=>page.evaluate(({id,polygonId})=>{for(const f of window.__faceMove.faces(id).filter(f=>f.visible&&f.axis!==2&&(!polygonId||f.polygonId===polygonId))){
    for(let y=Math.min(...f.points.map(p=>p.y))+8;y<Math.max(...f.points.map(p=>p.y))-8;y+=4)for(let x=Math.min(...f.points.map(p=>p.x))+8;x<Math.max(...f.points.map(p=>p.x))-8;x+=4){const p={x,y},q=window.__faceMove.worldToCanvas(x,y),r=document.getElementById('canvas').getBoundingClientRect();if(document.elementFromPoint(q.x+r.x,q.y+r.y)?.id==='canvas'&&!window.__faceMove.pointHit(p)&&!window.__faceMove.edgeHit(p)&&window.__faceMove.faceHit(p)?.polygonId===f.polygonId)return{p,id:f.polygonId};}
   }return null;},{id,polygonId});
   const target=await findTarget();check(tag+': movable side is visible',!!target,target);
   for(let n=0;n<3&&(await state()).selectedPolygonId!==target.id;n++)await click(target.p);
   let s=await state();check(tag+': selecting a movable side shows a directional handle',!!s.handle&&s.selectedPolygonId===target.id,s.handle);
   check(tag+': hit testing uses the same handle and existing face gesture',await page.evaluate(h=>window.__faceMove.control(h)?.kind===h.kind,s.handle));
   const before=s,h=s.handle,solid=s.runtime.solids[id],group=s.runtime.spatialGroups[solid.groupId],base=solid.polyhedron.basePoints,members=solid.polyhedron.faceVertices[h.faceIndex].filter(id=>base.includes(id));
   await drag(h,0,16);s=await state();check(tag+': movement along the face is ignored without history',JSON.stringify(s.runtime.solids[id])===JSON.stringify(solid)&&base.every(id=>JSON.stringify(s.runtime.points[id].spatial)===JSON.stringify(before.runtime.points[id].spatial))&&s.historyIndex===before.historyIndex);
   await drag(s.handle,12,8);s=await state();
   check(tag+': side moves without translating the whole solid',JSON.stringify(s.runtime.spatialGroups[solid.groupId])===JSON.stringify(group)&&members.every(id=>Math.hypot(s.runtime.points[id].x-before.runtime.points[id].x,s.runtime.points[id].y-before.runtime.points[id].y)>5));
   check(tag+': opposite base vertices stay fixed',base.filter(id=>!members.includes(id)).every(id=>Math.hypot(s.runtime.points[id].x-before.runtime.points[id].x,s.runtime.points[id].y-before.runtime.points[id].y)<1e-5));
   check(tag+': height and tilt remain unchanged',s.runtime.solids[id].polyhedron.height===solid.polyhedron.height&&JSON.stringify(s.runtime.solids[id].polyhedron.offset)===JSON.stringify(solid.polyhedron.offset));
   check(tag+': the handle and face stay selected after one undoable gesture',s.selectedPolygonId===target.id&&!!s.handle&&s.historyIndex===before.historyIndex+1);
   const changed=s;await page.locator('#undo').click();s=await state();check(tag+': undo restores side positions',base.every(id=>Math.hypot(s.runtime.points[id].x-before.runtime.points[id].x,s.runtime.points[id].y-before.runtime.points[id].y)<1e-5));
   await page.locator('#redo').click();s=await state();check(tag+': redo restores side movement',base.every(id=>Math.hypot(s.runtime.points[id].x-changed.runtime.points[id].x,s.runtime.points[id].y-changed.runtime.points[id].y)<1e-5));
   let current=await findTarget(target.id);for(let n=0;n<3&&(await state()).selectedPolygonId!==target.id;n++)await click(current.p);
   await page.evaluate(id=>window.__faceMove.lock(id,true),id);check(tag+': shape lock removes the handle',(await state()).handle===null);
   await page.evaluate(id=>window.__faceMove.lock(id,false),id);s=await state();check(tag+': unlocking restores the same directional control',!!s.handle);
   if(mobile){const initial=s;await drag(s.handle,10,0,true);s=await state();check(tag+': canceled touch restores the geometry and history',base.every(id=>Math.hypot(s.runtime.points[id].x-initial.runtime.points[id].x,s.runtime.points[id].y-initial.runtime.points[id].y)<1e-5)&&s.historyIndex===initial.historyIndex);}
   const saved=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__faceMove.save())));await page.evaluate(doc=>window.__faceMove.load(doc),saved);
   current=await findTarget(target.id);for(let n=0;n<3&&(await state()).selectedPolygonId!==target.id;n++)await click(current.p);s=await state();check(tag+': native reload preserves editability and direction',!!s.handle&&Math.abs(s.handle.projectedDirection.x*h.projectedDirection.y-s.handle.projectedDirection.y*h.projectedDirection.x)<1e-5);
   await page.screenshot({path:path.join(out,tag+'.png')});await page.close();page=null;
  }
  check('No browser exceptions',result.errors.length===0,result.errors);
 }catch(e){result.errors.push(e.stack||String(e));process.exitCode=1;await page?.screenshot({path:path.join(out,'error.png')}).catch(()=>{});}
 finally{await browser?.close();await server.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));}
 console.log(JSON.stringify({checks:result.checks.length,passed:result.checks.filter(c=>c.passed).length,errors:result.errors}));if(result.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
