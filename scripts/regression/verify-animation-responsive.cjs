const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const output=path.resolve(__dirname,'../../output/playwright/animation-responsive');fs.mkdirSync(output,{recursive:true});
const fixture=()=>({measurementScale:1,model:{points:[{id:'a',x:50,y:400},{id:'b',x:350,y:400},{id:'p',x:100,y:400,construction_kind:'on_object',parent_refs:[{kind:'line',id:'l'}]}],lines:[{id:'l',points:['a','p','b'],defining_points:['a','b'],style:{},leftRay:{hidden:true},rightRay:{hidden:true}}]},animation:{motions:[{pointId:'p',speed:20,direction:1}],loop:false}});
(async()=>{
 const {createServer}=await import('vite'),server=await createServer({server:{host:'127.0.0.1',port:5264,strictPort:true}});await server.listen();let browser;
 try{
  browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  for(const touch of [false,true]){
   const page=await browser.newPage({viewport:{width:1440,height:844},hasTouch:touch,serviceWorkers:'block'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/json/list',r=>r.fulfill({json:{result:[]}}));
   await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__responsive={load:d=>{setCtrBundle(undefined);applyPersistedDocument(d);panOffset={x:0,y:0};zoomFactor=1;draw();},select:id=>{selectedPointId=id;updateSelectionButtons();closeStyleMenu();draw();}};'});});
   await page.goto('http://127.0.0.1:5264/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__responsive);
   if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
   const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const verify=async()=>{
    await settle();
    return page.evaluate(()=>{
     const rect=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
     const bar=document.querySelector('.toolbar-top'),player=document.getElementById('animationPlayer'),layout=player.dataset.layout,b=rect(bar),p=rect(player);
     const ids=['cloudFilesBtn','exportJsonBtn','undo','redo','zoomMenu','animationPlay','animationStep','animationLoop'];
     const buttons=Object.fromEntries(ids.map(id=>{const node=document.getElementById(id),r=rect(node),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return[id,{...r,visible:!!node.getClientRects().length,hit:node.contains(hit),inPlayer:!!node.closest('#animationPlayer')}];}));
     return{layout,bar:b,player:p,buttons,afterSave:document.getElementById('exportJsonBtn').nextElementSibling===player,handle:!document.getElementById('animationPlayerHandle').hidden,width:innerWidth,scroll:document.documentElement.scrollWidth};
    });
   };
   const check=state=>{
    assert.ok(['inline','floating'].includes(state.layout),JSON.stringify(state));
    for(const [id,b]of Object.entries(state.buttons)){
     assert.ok(b.visible&&b.hit&&b.x>=-1&&b.right<=state.width+1,'Clipped/covered '+id+': '+JSON.stringify(state));
     if(!id.startsWith('animation'))assert.ok(!b.inPlayer&&b.y>=state.bar.y&&b.bottom<=state.bar.bottom+1,'Main icon moved out of main bar: '+id);
     else if(state.layout==='inline')assert.ok(b.y>=state.bar.y&&b.bottom<=state.bar.bottom+1,'Inline player below main bar');
    }
    assert.equal(state.handle,state.layout==='floating');
    assert.ok(state.afterSave,'Player is not immediately after Save');
    if(state.layout==='inline')assert.ok(Math.abs(state.buttons.animationPlay.x-state.buttons.exportJsonBtn.right-4)<1,'Player is not directly to the right of Save');
    if(state.layout==='floating')assert.ok(state.player.y>=state.bar.bottom+3,'Floating player overlaps main bar');
    assert.ok(state.scroll<=state.width,'Horizontal page overflow');
   };
   let checks=0;
   const filePositions=()=>page.locator('#cloudFilesBtn, #exportJsonBtn').evaluateAll(nodes=>nodes.map(node=>{
    const {x,y,width,height}=node.getBoundingClientRect();return{id:node.id,x,y,width,height,parent:node.parentElement.className};
   }));
   for(const multipage of [false,true])for(const width of [220,320,390,768,1440]){
    const doc=fixture();delete doc.animation;
    await page.setViewportSize({width,height:844});await page.evaluate(d=>window.__responsive.load(d),multipage?{...doc,pages:[doc,doc],activePage:0}:doc);await settle();
    const original=await filePositions();
    for(let repeat=0;repeat<2;repeat++){
     await page.locator('#zoomMenu').click();await page.locator('#animationToggle').click();check(await verify());
     assert.deepEqual(await filePositions(),original,'Animation moved Open/Save at width '+width);
     await page.evaluate(()=>window.__responsive.select('p'));check(await verify());
     assert.deepEqual(await filePositions(),original,'Point selection moved Open/Save at width '+width);
     await page.evaluate(()=>window.__responsive.select(null));
     await page.locator('#zoomMenu').click();await page.locator('#animationToggle').click();await settle();
     assert.deepEqual(await filePositions(),original,'Disabling animation moved Open/Save at width '+width);checks++;
    }
   }
   for(const multipage of [false,true])for(const selected of [false,true]){
    const doc=fixture();await page.evaluate(d=>window.__responsive.load(d),multipage?{...doc,pages:[doc,fixture()],activePage:0}:doc);
    await page.evaluate(id=>window.__responsive.select(id),selected?'p':null);
    for(const width of [1440,1024,768,640,520,430,390,360,320,280,220,320,768,1440]){
     await page.setViewportSize({width,height:844});const state=await verify();check(state);checks++;
     if(width===1440)assert.equal(state.layout,'inline','Wide viewport should fit all controls');
     if(width<=320)assert.equal(state.layout,'floating','Narrow viewport should detach only the player');
     if([320,390,768,1440].includes(width))await page.screenshot({path:path.join(output,(touch?'touch':'mouse')+'-'+width+'-'+(multipage?'pages':'single')+'-'+(selected?'selected':'idle')+'.png')});
    }
   }
   // Find and test the exact transition rather than relying on a fixed media breakpoint.
   let low=320,high=1440;
   while(high-low>1){const width=Math.floor((low+high)/2);await page.setViewportSize({width,height:844});const state=await verify();check(state);if(state.layout==='inline')high=width;else low=width;}
   for(const width of [low,high,low,high]){await page.setViewportSize({width,height:844});const state=await verify();check(state);assert.equal(state.layout,width===low?'floating':'inline');checks++;}
   for(const [width,height]of [[844,390],[390,844],[568,320]]){await page.setViewportSize({width,height});check(await verify());checks++;}
   await page.evaluate(()=>{for(const [key,value]of Object.entries({'--safe-area-top':'20px','--safe-area-left':'24px','--safe-area-right':'24px'}))document.documentElement.style.setProperty(key,value);});
   await page.setViewportSize({width:390,height:844});check(await verify());checks++;
   await page.evaluate(()=>{for(const key of ['--safe-area-top','--safe-area-left','--safe-area-right'])document.documentElement.style.removeProperty(key);});
   await page.evaluate(d=>window.__responsive.load(d),fixture());await page.setViewportSize({width:430,height:844});
   assert.equal((await verify()).layout,'inline');await page.locator('#zoomMenu').click();await page.locator('#multipageDocumentBtn').click();
   const addedPages=await verify();check(addedPages);assert.equal(addedPages.layout,'floating','Enabling multipage should recalculate available space without resizing');checks++;
   // Playback keeps the same layout across Play/Pause and resizing.
   await page.setViewportSize({width:320,height:844});await settle();await page.locator('#animationPlay').click();assert.equal(await page.locator('#animationPlay').getAttribute('data-action'),'pause');
   await page.setViewportSize({width:1440,height:844});check(await verify());await page.locator('#animationPlay').click();assert.equal(await page.locator('#animationPlay').getAttribute('data-action'),'play');
   await page.locator('#zoomMenu').click();await page.locator('#animationToggle').click();assert.ok(!await page.locator('#animationPlayer').isVisible());
   for(const id of ['cloudFilesBtn','exportJsonBtn'])assert.ok(await page.locator('#'+id).evaluate(node=>node.parentElement.classList.contains('topbar-left')));
   await page.locator('#zoomMenu').click();await page.locator('#animationToggle').click();check(await verify());
   assert.deepEqual(errors,[]);console.log((touch?'Touch':'Mouse')+': '+checks+' responsive layout checks, exact transition '+low+'/'+high+', main icons, hit targets, multipage, selection, playback, resizing and toggle passed');await page.close();
  }
 }finally{await browser?.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
