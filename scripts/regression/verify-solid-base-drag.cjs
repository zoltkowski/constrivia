const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{zipSync,strToU8}=require('fflate');
const out=path.resolve(__dirname,'../../output/playwright/solid-base-drag');fs.mkdirSync(out,{recursive:true});
const result={checks:[],errors:[]};
const check=(name,passed,data)=>{result.checks.push({name,passed:!!passed,data});if(!passed)throw Error(name+': '+JSON.stringify(data));};
(async()=>{
 const {createServer}=await import('vite');const server=await createServer({server:{host:'127.0.0.1',port:5216,strictPort:true}});await server.listen();let browser,page;
 try{
  const {makeEmptyRuntime}=await server.ssrLoadModule('/src/core/runtimeTypes.ts');
  const {createCuboid,createPrismOrPyramid,syncSpatialGeometry}=await server.ssrLoadModule('/src/core/spatialGeometry.ts');
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  for(const [kind,mobile] of [['prism',false],['pyramid',false],['cuboid',false],['prism',true],['pyramid',true]]){
   const label=kind+(mobile?'-touch':'-mouse'),width=mobile?390:1100;
   page=await browser.newPage({viewport:{width,height:850},hasTouch:true,serviceWorkers:'block'});
   page.on('pageerror',e=>result.errors.push(e.message));page.on('dialog',async d=>{result.errors.push(d.message());await d.dismiss();});
   await page.addInitScript(()=>{window.__baseFile=null;window.showDirectoryPicker=async()=>({name:'Base drag test',kind:'directory',queryPermission:async()=>'granted',requestPermission:async()=>'granted',async *values(){const f=window.__baseFile;yield{kind:'file',name:f.name,getFile:async()=>new File([new Uint8Array(f.bytes)],f.name,{type:'application/zip'})};}});});
   await page.route('**/src/main.ts*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+`\nlet baseRevision=0;const baseOriginalLoad=applyPersistedDocument;applyPersistedDocument=(...args)=>{const r=baseOriginalLoad(...args);baseRevision++;return r;};window.__base={state:()=>({runtime,selectedSolidId,selectedPolygonId,selectedPointId,historyIndex,panOffset,zoomFactor,revision:baseRevision}),worldToCanvas,faces:id=>spatialFaces(runtime,id).map(f=>({...f,polygonId:f.polygonId??spatialFacePolygon(runtime,id,f.axis,f.side)})),pointHit:findPoint,edgeHit:spatialEdgeAt,faceHit:p=>hitSpatialFace(runtime,p,showHidden)};`});});
   await page.goto('http://127.0.0.1:5216/',{waitUntil:'networkidle'});if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
   const state=()=>page.evaluate(()=>window.__base.state());
   const screen=p=>page.evaluate(p=>{const q=window.__base.worldToCanvas(p.x,p.y),r=document.getElementById('canvas').getBoundingClientRect();return{x:r.x+q.x,y:r.y+q.y};},p);
   const click=async p=>{const q=await screen(p);if(await page.evaluate(q=>document.elementFromPoint(q.x,q.y)?.id,q)!=='canvas')throw Error('Obscured click');await page.mouse.click(q.x,q.y);};
   const blank=async()=>{
    const q=await page.evaluate(()=>{const s=window.__base.state(),r=document.getElementById('canvas').getBoundingClientRect();for(let sy=r.top+100;sy<r.bottom-80;sy+=25)for(let sx=r.left+60;sx<r.right-60;sx+=25){const p={x:(sx-r.left-s.panOffset.x)/s.zoomFactor,y:(sy-r.top-s.panOffset.y)/s.zoomFactor};if(document.elementFromPoint(sx,sy)?.id==='canvas'&&!window.__base.pointHit(p)&&!window.__base.edgeHit(p)&&!window.__base.faceHit(p))return{x:sx,y:sy};}return null;});
    if(!q)throw Error('No unobscured blank canvas');await page.mouse.click(q.x,q.y);
   };
   const load=async doc=>{
    await page.locator('#modeMove').click();
    const revision=(await state()).revision,bytes=Array.from(zipSync({'base-drag.json':strToU8(JSON.stringify(doc))}));
    await page.evaluate(bytes=>window.__baseFile={name:'base-drag.ctr',bytes},bytes);
    await page.locator('#cloudFilesBtn').click();await page.locator('#localFileList [data-change-folder]').click();await page.locator('#localFileList .cloud-file-item').filter({hasText:'base-drag'}).click();await page.waitForFunction(n=>window.__base.state().revision>n,revision);await page.locator('#cloudCloseBtn').click();
   };
   const r=makeEmptyRuntime(),size=mobile?90:150,anchor={x:width/2,y:440};
   const id=kind==='cuboid'?createCuboid(r,anchor,size):createPrismOrPyramid(r,kind,anchor,size,4);
   const solid=r.solids[id],group=r.spatialGroups[solid.groupId],canonical=[...group.orientation];
   group.orientation=[1,0,0,0,-.6,-.8,0,.8,-.6];syncSpatialGeometry(r);
   const doc=()=>({model:{points:Object.values(r.points),lines:Object.values(r.lines),polygons:Object.values(r.polygons),solids:r.solids,spatialGroups:r.spatialGroups}});
   await load(doc());
   const face=async side=>page.evaluate(({id,side})=>{
    for(const f of window.__base.faces(id).filter(f=>f.visible&&f.axis===2&&f.side===side)){
     const xs=f.points.map(p=>p.x),ys=f.points.map(p=>p.y);
     for(let y=Math.min(...ys)+8;y<Math.max(...ys)-8;y+=5)for(let x=Math.min(...xs)+8;x<Math.max(...xs)-8;x+=5){
      const p={x,y},h=window.__base.faceHit(p),q=window.__base.worldToCanvas(x,y),rect=document.getElementById('canvas').getBoundingClientRect();
      if(h?.solidId===id&&h.axis===f.axis&&h.side===f.side&&!window.__base.pointHit(p)&&!window.__base.edgeHit(p)&&document.elementFromPoint(rect.x+q.x,rect.y+q.y)?.id==='canvas')return{p,id:f.polygonId};
     }
    }return null;
   },{id,side});
   const target=await face(0);check(label+': lower base is visible and clickable',!!target,target);
   await click(target.p);await click(target.p);
   check(label+': selected the actual lower base',(await state()).selectedPolygonId===target.id);
   const before=await state(),from=await screen(target.p),end=await screen({x:target.p.x+24,y:target.p.y-18});
   if(mobile){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...from}]});for(let n=1;n<=8;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:from.x+(end.x-from.x)*n/8,y:from.y+(end.y-from.y)*n/8}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   else{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:12});await page.mouse.up();}
   let after=await state();const g=after.runtime.spatialGroups[solid.groupId],old=before.runtime.spatialGroups[solid.groupId];
   check(label+': lower-base drag moves only the group anchor',JSON.stringify(after.runtime.solids[id])===JSON.stringify(before.runtime.solids[id])&&Math.abs(g.anchor.x-old.anchor.x-24)<1e-3&&Math.abs(g.anchor.y-old.anchor.y+18)<1e-3,{solid:after.runtime.solids[id],old:old.anchor,next:g.anchor});
   const positions=s=>JSON.stringify(Object.values(s.runtime.points).map(p=>({id:p.id,spatial:p.spatial,position:p.spatialPosition})));
   check(label+': lower-base drag retains local positions and orientation, selecting the moved solid',positions(after)===positions(before)&&JSON.stringify(g.orientation)===JSON.stringify(old.orientation)&&after.selectedPolygonId===null&&after.selectedSolidId===id,{selected:after.selectedPolygonId,solid:after.selectedSolidId});
   check(label+': one drag produces one history step',after.historyIndex===before.historyIndex+1);
   await page.locator('#undo').click();check(label+': undo restores anchor and height',JSON.stringify((await state()).runtime.spatialGroups[solid.groupId])===JSON.stringify(old)&&JSON.stringify((await state()).runtime.solids[id])===JSON.stringify(before.runtime.solids[id]));
   await page.locator('#redo').click();check(label+': redo restores translation without resizing',JSON.stringify((await state()).runtime.spatialGroups[solid.groupId])===JSON.stringify(g)&&JSON.stringify((await state()).runtime.solids[id])===JSON.stringify(before.runtime.solids[id]));
   await page.screenshot({path:path.join(out,label+'.png')});
   // Reload the same solid from above to verify the intended height driver remains available.
   group.orientation=canonical;syncSpatialGeometry(r);
   await page.locator('#modeMove').click();await blank();await load(doc());
   let driver;
   if(kind==='pyramid'){const p=(await state()).runtime.points[solid.vertices[solid.polyhedron.basePoints.length]];driver={p,id:p.id};await click(p);}
   else{driver=await face(1);check(label+': upper base is clickable',!!driver,driver);await click(driver.p);await click(driver.p);}
   const topBefore=await state(),a=await screen(driver.p),b=await screen({x:driver.p.x,y:driver.p.y-25});
   await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();
   after=await state();const oldHeight=topBefore.runtime.solids[id].polyhedron?.height??topBefore.runtime.solids[id].size.z,newHeight=after.runtime.solids[id].polyhedron?.height??after.runtime.solids[id].size.z;
   check(label+': upper base or apex still changes height',Math.abs(newHeight-oldHeight)>10,{oldHeight,newHeight});
   await page.close();page=null;
  }
  check('No browser exceptions',result.errors.length===0,result.errors);
 }catch(e){result.errors.push(e.stack||String(e));process.exitCode=1;await page?.screenshot({path:path.join(out,'error.png')}).catch(()=>{});}
 finally{await browser?.close();await server.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));}
 console.log(JSON.stringify({checks:result.checks.length,passed:result.checks.filter(c=>c.passed).length,errors:result.errors}));if(result.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
