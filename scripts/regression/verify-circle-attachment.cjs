const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const output=path.resolve(__dirname,'../../output/playwright/circle-attachment');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const {createServer}=await import('vite'),server=await createServer({server:{host:'127.0.0.1',port:5265,strictPort:true}});await server.listen();let browser;
 try{
  browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  for(const touch of [false,true]){
   const page=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1100,height:850},hasTouch:touch,serviceWorkers:'block'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/json/list',r=>r.fulfill({json:{result:[]}}));
   await page.addInitScript(()=>localStorage.setItem('geometry.grid',JSON.stringify({visible:false})));
   await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
    window.__attachment={load:d=>{setCtrBundle(undefined);applyPersistedDocument(d);panOffset={x:0,y:0};zoomFactor=1;draw();},save:serializeCurrentDocument,
    screen:p=>{const q=worldToCanvas(p.x,p.y),r=canvas.getBoundingClientRect();return{x:q.x+r.left,y:q.y+r.top};},
    state:()=>({points:runtime.points,circles:runtime.circles,traces:[...pointTraces],ended:animationEnded})};`});});
   await page.goto('http://127.0.0.1:5265/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__attachment);
   if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
   const state=()=>page.evaluate(()=>window.__attachment.state());
   const control=async id=>{if(touch)await page.locator('#'+id).tap();else await page.locator('#'+id).click();};
   const screen=p=>page.evaluate(p=>window.__attachment.screen(p),p);
   const click=async p=>{const q=await screen(p);if(touch)await page.touchscreen.tap(q.x,q.y);else await page.mouse.click(q.x,q.y);};
   const drag=async(id,target)=>{
    const from=await screen((await state()).points[id]),to=await screen(target);
    if(touch){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/12,y:from.y+(to.y-from.y)*i/12}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
    else{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();}
   };
   const offset=(s,id,center,x,y)=>{assert.ok(Math.abs(s.points[id].x-s.points[center].x-x)<1e-4,'Horizontal offset changed');assert.ok(Math.abs(s.points[id].y-s.points[center].y-y)<1e-4,'Vertical offset changed');};
   await page.evaluate(d=>window.__attachment.load(d),{model:{points:[{id:'c',x:140,y:450},{id:'s',x:200,y:200},{id:'t',x:300,y:200}]}});
   await control('modeCompass');await click({x:200,y:200});await click({x:300,y:200});await click({x:140,y:450});
   const circle=Object.values((await state()).circles)[0];assert.equal(circle?.circle_kind,'compass');
   await control('modeAdd');await click({x:200,y:530});let s=await state();
   const attached=Object.values(s.points).find(p=>p.construction_kind==='on_object'&&p.parent_refs?.some(ref=>ref.kind==='circle'&&ref.id===circle.id));assert.ok(attached,'No constrained point created through the actual point tool');
   await control('modeMove');await click({x:20,y:300});await drag('c',{x:180,y:410});s=await state();
   assert.ok(Math.hypot(s.points.c.x-180,s.points.c.y-410)<1e-4,'Center drag did not reach target');offset(s,attached.id,'c',60,80);
   await page.locator('#undo').click();await page.waitForFunction(()=>Math.abs(window.__attachment.state().points.c.x-140)<1e-4,null,{timeout:3000});offset(await state(),attached.id,'c',60,80);
   await page.locator('#redo').click();await page.waitForFunction(()=>Math.abs(window.__attachment.state().points.c.x-180)<1e-4,null,{timeout:3000});offset(await state(),attached.id,'c',60,80);
   await click({x:20,y:300});await drag(attached.id,{x:100,y:470});offset(await state(),attached.id,'c',-80,60);
   await click({x:20,y:300});await drag('c',{x:190,y:430});offset(await state(),attached.id,'c',-80,60);
   await page.screenshot({path:path.join(output,touch?'touch-compass.png':'mouse-compass.png')});
   const animation={measurementScale:1,model:{points:[{id:'a',x:40,y:420},{id:'b',x:360,y:420},...['c','r'].map((id,i)=>({id,x:100+i*100,y:420,construction_kind:'on_object',parent_refs:[{kind:'line',id:'l'}]})),{id:'p',x:160,y:500,construction_kind:'on_object',parent_refs:[{kind:'circle',id:'o'}]}],lines:[{id:'l',points:['a','c','r','b'],defining_points:['a','b'],style:{},leftRay:{hidden:true},rightRay:{hidden:true}}],circles:[{id:'o',center:'c',radius_point:'r',circle_kind:'center-radius',points:['p'],style:{}}]},animation:{motions:['c','r'].map(pointId=>({pointId,speed:100,direction:1})),loop:false}};
   await page.evaluate(d=>window.__attachment.load(d),animation);await click({x:160,y:500});await control('styleMenu');await page.locator('#pointTraceEnabled').check();await control('styleMenu');
   for(let i=0;i<10;i++){await control('animationStep');s=await state();offset(s,'p','c',60,80);assert.ok(Math.abs(s.points.c.x-(110+i*10))<1e-4,'Animation driver speed changed');}
   await control('animationPlay');await page.waitForFunction(()=>window.__attachment.state().ended,null,{timeout:10000});s=await state();offset(s,'p','c',60,80);assert.ok(Math.abs(s.points.r.x-360)<1e-4);
   const samples=s.traces.find(([id])=>id==='p')?.[1].samples.filter(Boolean);assert.ok(samples.length>60&&samples.every(p=>Math.abs(p.y-500)<1e-4),'Passive point trace drifted instead of translating');
   await page.screenshot({path:path.join(output,touch?'touch-animation.png':'mouse-animation.png')});
   await control('animationStop');offset(await state(),'p','c',60,80);assert.ok(Math.abs((await state()).points.c.x-100)<1e-4,'Stop did not restore the baseline');
   const saved=await page.evaluate(()=>window.__attachment.save());await page.evaluate(d=>window.__attachment.load(d),saved);
   assert.ok(await page.locator('#animationStep').isEnabled(),'Reload lost active motions: '+JSON.stringify(saved));await control('animationStep');offset(await state(),'p','c',60,80);
   assert.deepEqual(errors,[]);console.log((touch?'Touch':'Mouse')+': real compass construction, constrained point, center drag, Undo/Redo, direct perimeter drag, equal-speed center/radius animation, trace, Stop and reload passed');await page.close();
  }
 }finally{await browser?.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
