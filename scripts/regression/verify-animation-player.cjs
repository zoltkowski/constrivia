const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const output=path.resolve(__dirname,'../../output/playwright/animation-player');fs.mkdirSync(output,{recursive:true});
const fixture=()=>({measurementScale:1,model:{points:[{id:'a',x:50,y:400},{id:'b',x:350,y:400},{id:'p',x:100,y:400,construction_kind:'on_object',parent_refs:[{kind:'line',id:'l'}]}],lines:[{id:'l',points:['a','p','b'],defining_points:['a','b'],style:{color:'#22aaff',width:2},leftRay:{hidden:true},rightRay:{hidden:true}}]}});
(async()=>{
 const {createServer}=await import('vite'),server=await createServer({server:{host:'127.0.0.1',port:5262,strictPort:true}});await server.listen();let browser;
 try{
  browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  for(const mobile of [false,true]){
   const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1100,height:850},hasTouch:mobile,serviceWorkers:'block'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/json/list',route=>route.fulfill({json:{result:[]}}));
   await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\nwindow.__player={load:d=>{applyPersistedDocument(d);panOffset={x:0,y:0};zoomFactor=1;draw();},state:()=>({x:runtime.points.p.x,y:runtime.points.p.y,playing:animationPlaying,ended:animationEnded,direction:animationDirection,samples:pointTraces.get('p')?.samples.length??0})};`});});
   await page.goto('http://127.0.0.1:5262/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__player);
   if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
   await page.evaluate(d=>window.__player.load(d),fixture());
   const click=async selector=>{if(mobile)await page.locator(selector).tap();else await page.locator(selector).click();};
   const state=()=>page.evaluate(()=>window.__player.state());
   const action=()=>page.locator('#animationPlay').getAttribute('data-action');
   const visibleFiles=async()=>{
    for(const id of ['cloudFilesBtn','exportJsonBtn']){
     const button=page.locator('#'+id),box=await button.boundingBox();
     if(!await button.isVisible()||!box||box.x<0||box.x+box.width>(mobile?390:1100))throw Error('File button hidden or clipped: '+id);
     if(!await button.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}))throw Error('File button covered: '+id);
    }
   };
   await click('#zoomMenu');await click('#animationToggle');await visibleFiles();
   if(!await page.locator('#animationPlay').isDisabled()||!await page.locator('#animationStep').isDisabled())throw Error('Controls enabled without a speed');
   const order=await page.locator('#animationPlayer > button').evaluateAll(nodes=>nodes.map(node=>node.id));
   if(JSON.stringify(order)!==JSON.stringify(['animationPlayerHandle','animationPlay','animationStep','animationLoop']))throw Error('Incorrect player order: '+order);
   for(const id of ['cloudFilesBtn','exportJsonBtn'])if(!await page.locator('#'+id).evaluate(node=>node.parentElement.classList.contains('topbar-left')))throw Error('File button left its fixed main toolbar location: '+id);
   if(mobile)await page.touchscreen.tap(100,400);else await page.mouse.click(100,400);
   await visibleFiles();await click('#styleMenu');
   const speed=page.locator('#animationSpeed');
   if(!await speed.isVisible()||!await speed.isEditable()||!await speed.evaluate(node=>!!node.closest('#styleMenuContainer')))throw Error('Speed is not editable in point style menu');
   await speed.fill('200');await page.locator('#pointTraceEnabled').check();
   await visibleFiles();
   if(await page.locator('#animationPlay').isDisabled()||await page.locator('#animationStep').isDisabled())throw Error('Controls stayed disabled after setting a speed');
   await page.screenshot({path:path.join(output,mobile?'mobile-style.png':'desktop-style.png')});await click('#styleMenu');
   await click('#animationStep');let s=await state();
   if(Math.abs(s.x-120)>1e-4||s.samples<6||await action()!=='play')throw Error('Step did not advance 0.1 seconds with a smooth trace: '+JSON.stringify(s));
   await click('#animationPlay');if(await action()!=='pause'||await page.locator('#animationStep').isDisabled())throw Error('Play did not become Pause or disabled Step');
   await page.waitForTimeout(120);await click('#animationPlay');if((await state()).playing||await action()!=='play')throw Error('Pause did not return to Play');
   await click('#styleMenu');if(!await speed.isEditable())throw Error('Speed cannot be edited while paused');await click('#styleMenu');
   await click('#animationPlay');const beforeStep=(await state()).x;await click('#animationStep');s=await state();
   if(s.playing||s.x<beforeStep+20-1e-4)throw Error('Step while playing did not pause and advance 0.1 seconds');
   for(let i=0;i<15&&await action()!=='stop';i++)await click('#animationStep');s=await state();
   if(await action()!=='stop'||Math.abs(s.x-350)>1e-4)throw Error('Stepping to endpoint did not become Stop');
   await click('#animationPlay');s=await state();if(await action()!=='play'||Math.abs(s.x-100)>1e-4||s.samples>1)throw Error('Stop did not restore start and clear traces');
   await click('#styleMenu');await speed.fill('1000');await click('#styleMenu');
   await click('#animationPlay');await page.waitForFunction(()=>document.getElementById('animationPlay').dataset.action==='stop');
   if(Math.abs((await state()).x-350)>1e-4)throw Error('Playback did not stop at endpoint');await click('#animationPlay');
   await click('#styleMenu');await speed.fill('5000');await click('#styleMenu');await click('#animationLoop');await click('#animationStep');s=await state();
   if(await action()!=='play'||Math.abs(s.x-100)>1e-3||s.direction!==-1)throw Error('0.1-second step failed to reverse in loop');
   await click('#cloudFilesBtn');if(!await page.locator('#cloudPanel').isVisible())throw Error('Open unavailable with point selection');await click('#cloudCloseBtn');
   await click('#exportJsonBtn');if(!await page.locator('#cloudSaveBar').isVisible())throw Error('Save unavailable with point selection');await click('#cloudCloseBtn');
   await page.screenshot({path:path.join(output,mobile?'mobile-player.png':'desktop-player.png')});
   await click('#zoomMenu');await click('#animationToggle');
   if(!await page.locator('#cloudFilesBtn').evaluate(node=>node.parentElement.classList.contains('topbar-left')))throw Error('File buttons did not return to the normal toolbar');
   const vertical=fixture();vertical.model.points[0]={id:'a',x:100,y:600};vertical.model.points[1]={id:'b',x:100,y:300};Object.assign(vertical.model.points[2],{x:100,y:500});vertical.animation={loop:false,motions:[{pointId:'p',speed:100,direction:1}]};
   await page.evaluate(d=>window.__player.load(d),vertical);if(mobile)await page.touchscreen.tap(100,500);else await page.mouse.click(100,500);await click('#styleMenu');
   if(await page.locator('#animationDirection').textContent()!=='↑')throw Error('Vertical direction arrow does not point up');await click('#animationDirection');if(await page.locator('#animationDirection').textContent()!=='↓')throw Error('Vertical direction arrow did not reverse');await click('#styleMenu');await click('#animationStep');
   if(Math.abs((await state()).y-510)>1e-4)throw Error('Reversed vertical motion did not advance ten units in 0.1 seconds');
   if(errors.length)throw Error(errors.join('; '));await page.close();
  }
  console.log('Desktop and mobile: style speed input, persistent Open/Save, Play/Pause/Stop, 0.1-second Step, traces and loop passed');
 }finally{await browser?.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
