const {chromium}=require('playwright');
const {unzipSync,strFromU8}=require('fflate');
const fs=require('node:fs'),path=require('node:path');
const output=path.resolve(__dirname,'../../output/playwright/animation');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const {createServer}=await import('vite');const server=await createServer({server:{host:'127.0.0.1',port:5259,strictPort:true}});await server.listen();let browser;
 try{
  browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});const page=await browser.newPage({viewport:{width:1200,height:800},serviceWorkers:'block'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\nwindow.__anim={
    load:d=>{setCtrBundle(undefined);applyPersistedDocument(d);},
    save:serializeCurrentDocument,undo,reset:animationStop,
    edit:(id,x,y)=>{const engine=toEngineState(runtime);movePointAndRecompute(engine,id,{x,y});applyEngineState(runtime,engine,{points:true,lines:true,circles:true});pushHistory();draw();},
    select:id=>{document.activeElement?.blur();selectedPointId=id;updateSelectionButtons();if(id&&animationPath(id))openStyleMenu();else closeStyleMenu();draw();},
    screen:id=>{const p=runtime.points[id],q=worldToCanvas(p.x,p.y),r=canvas.getBoundingClientRect();return{x:q.x+r.left,y:q.y+r.top};},
    arrow:()=>{const a=animationArrow(),r=canvas.getBoundingClientRect();return a&&{x:a.x+r.left,y:a.y+r.top};},
    advance:n=>{if(animationBegin())for(let i=0;i<n;i++)if(!animationAdvance(1/60)){animationEnded=true;break;}updateAnimationUI();},
    advanceOnce:seconds=>{if(!animationBegin())return false;const result=animationAdvance(seconds);animationEnded=!result;updateAnimationUI();return result;},
    state:()=>({points:runtime.points,motions:[...animationMotions],snapshot:!!animationSnapshot,playing:animationPlaying,ended:animationEnded,direction:animationDirection,traces:[...pointTraces]})};`});});
  let savedBytes;
  await page.route('**/api/json/**',async route=>{if(route.request().method()==='PUT'){savedBytes=route.request().postDataBuffer();await route.fulfill({json:{success:true}});}else await route.fulfill({json:{result:[]}});});
  await page.goto('http://127.0.0.1:5259/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__anim);
  await page.evaluate(()=>window.__anim.load({model:{points:[{id:'a',x:100,y:100},{id:'b',x:200,y:100},{id:'p',x:190,y:100,construction_kind:'on_object',parent_refs:[{kind:'line',id:'l'}]},{id:'c',x:400,y:300},{id:'r',x:450,y:300},{id:'q',x:400,y:350,construction_kind:'on_object',parent_refs:[{kind:'circle',id:'o'}]},{id:'m',x:245,y:200,construction_kind:'midpoint',midpointMeta:{parents:['p','q']}}],lines:[{id:'l',points:['a','p','b'],defining_points:['a','b'],style:{color:'#00aaff',width:2},leftRay:{hidden:true},rightRay:{hidden:true}}],circles:[{id:'o',center:'c',radius_point:'r',circle_kind:'center-radius',points:['q'],style:{color:'#00aaff',width:2}}]}}));
  await page.locator('#zoomMenu').click();await page.locator('#animationToggle').click();
  if(!await page.locator('#animationPlay').isDisabled()||!await page.locator('#animationStep').isDisabled())throw Error('Player enabled without speed');
  const select=async id=>page.evaluate(id=>window.__anim.select(id),id);
  const screen=await page.evaluate(()=>window.__anim.screen('p'));await page.mouse.click(screen.x,screen.y);await page.locator('#styleMenu').click();if(!await page.locator('#animationPointPanel').isVisible())throw Error('No settings in point style menu');
  await page.locator('#animationSpeed').fill('60');await select('q');await page.locator('#animationSpeed').fill('60');
  await select('m');await page.evaluate(()=>{const input=document.getElementById('pointTraceEnabled');input.checked=true;input.dispatchEvent(new Event('change'));});
  await page.evaluate(()=>window.__anim.advance(1));let s=await page.evaluate(()=>window.__anim.state());
  if(Math.abs(s.points.p.x-191)>1e-4||!s.snapshot||s.traces[0][1].samples.length<2)throw Error('Step failed to move and record dependent trace');
  await page.evaluate(()=>window.__anim.reset());s=await page.evaluate(()=>window.__anim.state());
  if(Math.abs(s.points.p.x-190)>1e-4||s.snapshot||s.traces[0][1].samples.length>1)throw Error('Stop failed to restore positions and clear traces');
  await page.evaluate(()=>window.__anim.advance(20));s=await page.evaluate(()=>window.__anim.state());if(Math.abs(s.points.p.x-200)>1e-4||s.direction!==1)throw Error('Motion did not stop at first segment endpoint');await page.locator('#animationPlay').click();
  await page.locator('#animationLoop').click();await page.evaluate(()=>window.__anim.advance(12));s=await page.evaluate(()=>window.__anim.state());
  if(Math.abs(s.points.p.x-198)>1e-3||s.direction!==-1)throw Error('Loop did not reverse at endpoint: '+JSON.stringify({x:s.points.p.x,direction:s.direction}));
  await page.evaluate(()=>window.__anim.reset());await select('p');const arrow=await page.evaluate(()=>window.__anim.arrow());await page.mouse.click(arrow.x,arrow.y);await page.evaluate(()=>window.__anim.advance(1));s=await page.evaluate(()=>window.__anim.state());
  if(Math.abs(s.points.p.x-189)>1e-4)throw Error('Direction reversal failed');
  await page.locator('#animationPlay').click();await page.waitForTimeout(100);await page.locator('#animationPlay').click();s=await page.evaluate(()=>window.__anim.state());if(s.playing)throw Error('Pause failed');
  await page.evaluate(()=>window.__anim.reset());
  await page.evaluate(()=>window.__anim.load({model:{points:[{id:'a',x:100,y:100},{id:'b',x:300,y:100},{id:'c',x:150,y:100,construction_kind:'on_object',parent_refs:[{kind:'line',id:'l'}]},{id:'s',x:400,y:300},{id:'t',x:420,y:300},{id:'q',x:150,y:120,construction_kind:'on_object',parent_refs:[{kind:'circle',id:'o'}]}],lines:[{id:'l',points:['a','c','b'],defining_points:['a','b'],style:{color:'#00aaff',width:2},leftRay:{hidden:true},rightRay:{hidden:true}}],circles:[{id:'o',center:'c',circle_kind:'compass',defining_points:['c','s','t'],points:['q'],style:{color:'#00aaff',width:2}}]}}));
  if(await page.locator('#animationPlayer').isVisible()||await page.locator('#animationToggle').getAttribute('aria-pressed')!=='false')throw Error('Plain document did not reset animation mode');
  await page.locator('#zoomMenu').click();await page.locator('#animationToggle').click();
  await select('c');await page.locator('#animationSpeed').fill('20');await select('q');await page.locator('#animationSpeed').fill('20');await page.locator('#animationDirection').click();
  await page.evaluate(()=>window.__anim.advance(60));s=await page.evaluate(()=>window.__anim.state());
  if(Math.abs(s.points.c.x-170)>1e-3||Math.abs(s.points.q.x-(170-20*Math.sin(1)))>1e-2||Math.abs(s.points.q.y-(100+20*Math.cos(1)))>1e-2)throw Error('Rolling circle did not combine translation and rotation: '+JSON.stringify({c:s.points.c,q:s.points.q}));
  await page.evaluate(()=>window.__anim.reset());s=await page.evaluate(()=>window.__anim.state());if(Math.abs(s.points.c.x-150)>1e-4||Math.abs(s.points.q.y-120)>1e-4)throw Error('Stop did not restore rolling circle');
  await page.evaluate(()=>{const input=document.getElementById('pointTraceEnabled');input.checked=true;input.dispatchEvent(new Event('change'));});await page.evaluate(()=>window.__anim.advance(1));
  await page.locator('#animationLoop').click();
  await select(null);
  await page.locator('#exportJsonBtn').click();await page.locator('#cloudFilenameInput').fill('animation-roundtrip');await page.locator('#cloudPanel [data-tab="cloud"]').click();await page.locator('#cloudSaveBtn').click();await page.waitForFunction(()=>document.getElementById('cloudPanel').style.display==='none');
  const saved=JSON.parse(strFromU8(Object.values(unzipSync(new Uint8Array(savedBytes)))[0]));
  if(!saved.animation?.loop||saved.animation.motions.length!==2||saved.animation.motions.find(m=>m.pointId==='q')?.direction!==-1||JSON.stringify(saved).includes('samples'))throw Error('Actual CTR file did not preserve only animation settings');
  await page.evaluate(doc=>window.__anim.load(JSON.parse(JSON.stringify(doc))),saved);s=await page.evaluate(()=>window.__anim.state());
  if(!await page.locator('#animationPlayer').isVisible()||await page.locator('#animationToggle').getAttribute('aria-pressed')!=='true'||await page.locator('#animationPlay').isDisabled()||s.snapshot||s.playing||s.traces.length||s.motions.find(([id])=>id==='c')[1].speed!==20||await page.locator('#animationLoop').getAttribute('aria-pressed')!=='true')throw Error('Reload did not restore ready player without trace or playback state');
  await select('q');if(await page.locator('#animationSpeed').inputValue()!=='20')throw Error('Reload did not restore speed input');
  await page.screenshot({path:path.join(output,'desktop.png')});
  await page.setViewportSize({width:390,height:844});const box=await page.locator('#animationPlayer').boundingBox();if(!box||box.x<0||box.x+box.width>390)throw Error('Player exceeds mobile viewport');
  await page.screenshot({path:path.join(output,'mobile.png')});
  await page.locator('#zoomMenu').click();await page.locator('#animationToggle').click();if(await page.locator('#animationPlayer').isVisible())throw Error('Cannot turn animation off');
  const disabled=await page.evaluate(()=>window.__anim.save());
  if(disabled.animation.enabled!==false)throw Error('Disabled animation mode was not saved');
  await page.evaluate(doc=>window.__anim.load(doc),disabled);
  if(await page.locator('#animationPlayer').isVisible()||(await page.evaluate(()=>window.__anim.state())).motions.length!==2)throw Error('Reload re-enabled a disabled animation or discarded its settings');
  await page.setViewportSize({width:1200,height:800});
  const initialC=disabled.model.points.find(p=>p.id==='c').x;
  await page.evaluate(doc=>window.__anim.load({...doc,animation:{...doc.animation,enabled:true}}),disabled);
  await page.evaluate(()=>window.__anim.advance(5));const dragStart=await page.evaluate(()=>window.__anim.screen('s'));
  await page.mouse.move(dragStart.x,dragStart.y);await page.mouse.down();await page.mouse.move(dragStart.x+10,dragStart.y,{steps:5});await page.mouse.up();s=await page.evaluate(()=>window.__anim.state());
  if(s.snapshot||s.playing||s.ended)throw Error('Editing during a preview left a stale Stop snapshot');
  await page.evaluate(()=>window.__anim.undo());s=await page.evaluate(()=>window.__anim.state());
  if(Math.abs(s.points.c.x-initialC)>1e-4||Math.abs(s.points.s.x-400)>1e-4)throw Error('Undo after editing an animated pose did not restore the baseline');
  await page.evaluate(()=>window.__anim.advance(5));await page.evaluate(()=>window.__anim.undo());
  if((await page.evaluate(()=>window.__anim.state())).snapshot)throw Error('History entry point failed to stop the animation preview');
  await page.evaluate(doc=>window.__anim.load({...doc,animation:{...doc.animation,enabled:true},pages:[{...doc,animation:{...doc.animation,enabled:true}},{model:doc.model}],activePage:0}),disabled);
  await page.evaluate(()=>window.__anim.advance(5));await select(null);await page.locator('#bundleNextBtn').click();await page.locator('#bundlePrevBtn').click();s=await page.evaluate(()=>window.__anim.state());
  if(s.snapshot||Math.abs(s.points.c.x-initialC)>1e-4)throw Error('Page switch retained a transient animation pose inconsistent with history');
  const chain=JSON.parse(JSON.stringify(disabled));chain.animation={loop:false,motions:[{pointId:'r',speed:20,direction:1},{pointId:'q',speed:20,direction:1},{pointId:'c',speed:20,direction:1}]};
  chain.model.points.find(p=>p.id==='c').x=150;Object.assign(chain.model.points.find(p=>p.id==='q'),{x:150,y:120});chain.model.points.push({id:'r',x:150,y:140,construction_kind:'on_object',parent_refs:[{kind:'circle',id:'o2'}]});chain.model.circles.push({id:'o2',center:'q',circle_kind:'compass',defining_points:['q','s','t'],points:['r'],style:{color:'#00aaff',width:2}});
  await page.evaluate(doc=>{window.__anim.load(doc);window.__anim.advance(60);},chain);s=await page.evaluate(()=>window.__anim.state());
  if(Math.abs(s.points.r.x-(170+40*Math.sin(1)))>1e-2||Math.abs(s.points.r.y-(100+40*Math.cos(1)))>1e-2)throw Error('Nested moving circles depend on the order speeds were configured');
  const movingSegment={model:{points:[{id:'a',x:100,y:100},{id:'t',x:150,y:100},{id:'q',x:100,y:150,construction_kind:'on_object',parent_refs:[{kind:'circle',id:'o'}]},{id:'b',x:300,y:150},{id:'p',x:200,y:150,construction_kind:'on_object',parent_refs:[{kind:'line',id:'l'}]}],lines:[{id:'l',points:['q','p','b'],defining_points:['q','b'],style:{},leftRay:{hidden:true},rightRay:{hidden:true}}],circles:[{id:'o',center:'a',radius_point:'t',circle_kind:'center-radius',points:['q'],style:{}}]},animation:{loop:false,motions:[{pointId:'p',speed:60,direction:1},{pointId:'q',speed:60,direction:1}]}};
  await page.evaluate(doc=>{window.__anim.load(doc);window.__anim.advance(1);},movingSegment);s=await page.evaluate(()=>window.__anim.state());
  const qx=100+50*Math.sin(.02),qy=100+50*Math.cos(.02),fraction=.505;
  if(Math.hypot(s.points.p.x-(qx+(300-qx)*fraction),s.points.p.y-(qy+(150-qy)*fraction))>1e-3)throw Error('Point did not follow its updated moving segment');
  movingSegment.model.points.find(p=>p.id==='p').x=299.5;
  await page.evaluate(doc=>{window.__anim.load(doc);window.__anim.advance(1);},movingSegment);s=await page.evaluate(()=>window.__anim.state());
  if(Math.hypot(s.points.p.x-300,s.points.p.y-150)>1e-4)throw Error('Moving segment endpoint detection disagrees with phase advancement');
  movingSegment.animation.loop=true;movingSegment.animation.motions[0].speed=1e9;
  const fast=await page.evaluate(doc=>{window.__anim.load(doc);return window.__anim.advanceOnce(1/60);},movingSegment);
  if(fast!==false)throw Error('Reversal budget silently discarded animation time instead of pausing');
  if(errors.length)throw Error('Browser errors: '+errors.join('; '));console.log('Animation controls, step, trace, stop, loop, direction, pause and rolling circle passed');
 }finally{await browser?.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
