const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const output=path.resolve(__dirname,'../../output/playwright/animation-toolbar');fs.mkdirSync(output,{recursive:true});
const base=()=>({model:{points:[{id:'a',x:50,y:400},{id:'b',x:350,y:400}],lines:[{id:'l',points:['a','b'],defining_points:['a','b'],style:{color:'#22aaff',width:2},leftRay:{hidden:true},rightRay:{hidden:true}}]}});
(async()=>{
 const {createServer}=await import('vite'),server=await createServer({server:{host:'127.0.0.1',port:5263,strictPort:true}});await server.listen();let browser;
 try{
  browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  for(const mobile of [false,true]){
   const viewport=mobile?{width:390,height:844}:{width:1100,height:850};
   const page=await browser.newPage({viewport,hasTouch:mobile,serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/json/list',route=>route.fulfill({json:{result:[]}}));
   await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\nwindow.__toolbar={
    load:d=>{applyPersistedDocument(d);panOffset={x:0,y:0};zoomFactor=1;draw();},save:serializeCurrentDocument,
    label:()=>worldToCanvas(...(()=>{const p=measurementLabels.find(l=>l.targetId==='l-seg0').pos;return[p.x,p.y];})()),
    addPoint:()=>{runtime.points.p={id:'p',x:50,y:400,style:{color:'#22aaff'},construction_kind:'on_object',parent_refs:[{kind:'line',id:'l'}]};runtime.lines.l.points=['a','p','b'];recomputeAllConstraints();pushHistory();setMode('move');draw();},
    select:()=>{selectedPointId='p';updateSelectionButtons();draw();},state:()=>({scale:measurementScale,p:runtime.points.p,playing:animationPlaying,ended:animationEnded}),
    view:z=>{zoomFactor=z;draw();},width:()=>canvas.getBoundingClientRect().width,
    advance:seconds=>{if(animationBegin())for(let i=0;i<Math.round(seconds*60);i++)if(!animationAdvance(1/60)){animationEnded=true;break;}updateAnimationUI();},
    clock:()=>{animationBegin();animationPlaying=true;animationPreviousTime=1000;animationTick(3000);cancelAnimationFrame(animationFrame);}
   };`});});
   await page.goto('http://127.0.0.1:5263/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__toolbar);
   await page.evaluate(()=>{
    window.__timing={start:null,end:null};const button=document.getElementById('animationPlay');
    button.addEventListener('click',()=>{if(window.__toolbar.state().playing)window.__timing={start:performance.now(),end:null};});
    new MutationObserver(()=>{if(button.dataset.action==='stop'&&window.__timing.start!==null&&window.__timing.end===null)window.__timing.end=performance.now();}).observe(button,{attributes:true,attributeFilter:['data-action']});
   });
   if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
   const click=async selector=>{if(mobile)await page.locator(selector).tap();else await page.locator(selector).click();};
   await page.evaluate(d=>window.__toolbar.load(d),base());
   await click('#zoomMenu');await click('#showMeasurementsBtn');
   if(await page.locator('#optionsMenuContainer').evaluate(node=>node.classList.contains('open')))await click('#zoomMenu');
   const label=await page.evaluate(()=>window.__toolbar.label());if(mobile)await page.touchscreen.tap(label.x,label.y);else await page.mouse.click(label.x,label.y);
   await page.locator('#measurementValueInput').fill('10');await page.locator('#measurementValueInput').press('Enter');
   if((await page.evaluate(()=>window.__toolbar.state())).scale!==30)throw Error('Setting length 10 did not calibrate the construction');
   await click('#zoomMenu');await click('#showMeasurementsBtn');if(await page.locator('#optionsMenuContainer').evaluate(node=>node.classList.contains('open')))await click('#zoomMenu');
   await page.evaluate(()=>window.__toolbar.addPoint());await click('#zoomMenu');await click('#animationToggle');await page.evaluate(()=>window.__toolbar.select());await click('#styleMenu');await page.locator('#animationSpeed').fill('5');await click('#styleMenu');
   const calibrated=await page.evaluate(()=>window.__toolbar.save());
   for(let i=0;i<10;i++)await click('#animationStep');let state=await page.evaluate(()=>window.__toolbar.state());
   if(Math.abs(state.p.x-200)>1e-4||state.ended)throw Error('One simulated second did not travel five calibrated units');
   for(let i=0;i<10;i++)await click('#animationStep');state=await page.evaluate(()=>window.__toolbar.state());
   if(Math.abs(state.p.x-350)>1e-4||!state.ended)throw Error('Length 10 at speed 5 did not finish in two simulated seconds');await click('#animationPlay');
   await page.evaluate(()=>window.__toolbar.clock());state=await page.evaluate(()=>window.__toolbar.state());
   if(!state.ended||Math.abs(state.p.x-350)>1e-4)throw Error('A delayed clock callback discarded elapsed time');await click('#animationPlay');
   await click('#animationPlay');await page.waitForFunction(()=>window.__toolbar.state().ended);const elapsed=await page.evaluate(()=>window.__timing.end-window.__timing.start);
   if(!Number.isFinite(elapsed)||elapsed<1800||elapsed>3500)throw Error('Calibrated movement took '+elapsed+' ms instead of two seconds');await click('#animationPlay');
   const toolbar=page.locator('#animationPlayer'),handle=page.locator('#animationPlayerHandle');
   const before=await toolbar.boundingBox(),grip=await handle.boundingBox(),x=grip.x+grip.width/2,y=grip.y+grip.height/2,dx=24-before.x,dy=160-before.y;
   if(mobile){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
   else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:5});await page.mouse.up();}
   let moved=await toolbar.boundingBox();if(Math.abs(moved.x-24)>2||Math.abs(moved.y-160)>2)throw Error('Toolbar did not follow the drag gesture');
   await page.screenshot({path:path.join(output,mobile?'mobile-dragged.png':'desktop-dragged.png')});
   await page.reload({waitUntil:'networkidle'});await page.evaluate(d=>window.__toolbar.load(d),calibrated);moved=await toolbar.boundingBox();
   if(Math.abs(moved.x-24)>2||Math.abs(moved.y-160)>2)throw Error('Toolbar position did not survive reload');
   await handle.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');moved=await toolbar.boundingBox();if(Math.abs(moved.x-34)>2||Math.abs(moved.y-170)>2)throw Error('Keyboard movement failed');
   await page.setViewportSize({width:220,height:500});await page.waitForFunction(()=>document.getElementById('animationLoop').hidden);
   moved=await toolbar.boundingBox();if(moved.x<0||moved.x+moved.width>220||moved.y<0||moved.y+moved.height>500)throw Error('Toolbar escaped the small viewport');
   await page.setViewportSize(viewport);await page.waitForFunction(()=>!document.getElementById('animationLoop').hidden);
   const circle={measurementScale:30,model:{points:[{id:'a',x:200,y:400},{id:'b',x:260,y:400},{id:'p',x:260,y:400,construction_kind:'on_object',parent_refs:[{kind:'circle',id:'c'}]}],circles:[{id:'c',center:'a',radius_point:'b',points:['p'],circle_kind:'center-radius',style:{}}]},animation:{motions:[{pointId:'p',speed:5,direction:1}],loop:false}};
   await page.evaluate(d=>window.__toolbar.load(d),circle);await click('#animationStep');state=await page.evaluate(()=>window.__toolbar.state());
   if(Math.hypot(state.p.x-(200+60*Math.cos(.25)),state.p.y-(400-60*Math.sin(.25)))>1e-3)throw Error('Circle motion ignored calibrated arc length');
   for(const zoom of [.5,1,2]){
    const width=await page.evaluate(()=>window.__toolbar.width()),length=width/zoom;
    const uncalibrated=base();uncalibrated.model.points=[{id:'a',x:0,y:400},{id:'b',x:length,y:400},{id:'p',x:0,y:400,construction_kind:'on_object',parent_refs:[{kind:'line',id:'l'}]}];uncalibrated.model.lines[0].points=['a','p','b'];uncalibrated.animation={motions:[{pointId:'p',speed:1,direction:1}],loop:false};
    await page.evaluate(({doc,zoom})=>{window.__toolbar.load(doc);window.__toolbar.view(zoom);},{doc:uncalibrated,zoom});await click('#animationStep');state=await page.evaluate(()=>window.__toolbar.state());
    if(Math.abs(state.p.x-length/30)>1e-4)throw Error('Default Step did not travel 1/30 of the screen at zoom '+zoom);
    await page.evaluate(z=>window.__toolbar.view(z),zoom*1.5);await page.setViewportSize({width:viewport.width+100,height:viewport.height});
    await page.evaluate(()=>window.__toolbar.advance(.9));state=await page.evaluate(()=>window.__toolbar.state());
    if(Math.abs(state.p.x-length/3)>1e-4||state.ended)throw Error('Zoom or resize changed the running default scale');
    await page.evaluate(()=>window.__toolbar.advance(2));state=await page.evaluate(()=>window.__toolbar.state());
    if(Math.abs(state.p.x-length)>1e-4||!state.ended)throw Error('Uncalibrated screen traversal did not end in three seconds');
    await page.setViewportSize(viewport);
   }
   if(errors.length)throw Error(errors.join('; '));console.log((mobile?'Mobile':'Desktop')+': uncalibrated three-second traversal at multiple zoom levels, stable run scale, calibrated 10/5 movement '+elapsed+' ms, circle speed, drag, persistence, keyboard, bounds and loop visibility passed');await page.close();
  }
 }finally{await browser?.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
