const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const out=path.resolve(__dirname,'../../output/playwright/polygon-move-handles');fs.mkdirSync(out,{recursive:true});
const results={checks:[],errors:[]};
const check=(name,passed,data)=>{results.checks.push({name,passed:!!passed,data});if(!passed)throw Error(name+': '+JSON.stringify(data));};
(async()=>{
 const {createServer}=await import('vite');const server=await createServer({server:{host:'127.0.0.1',port:5221,strictPort:true}});await server.listen();let browser,page;
 try{
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  page=await browser.newPage({viewport:{width:1100,height:850},hasTouch:true,serviceWorkers:'block'});
  page.on('pageerror',error=>results.errors.push(error.message));
  await page.addInitScript(()=>{localStorage.setItem('geometry.grid',JSON.stringify({visible:false}));localStorage.setItem('geometry.lang','pl');localStorage.setItem('measurementPrecisionLength','1');});
  await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
   window.__moves={load:applyPersistedDocument,worldToCanvas,
    state:()=>({runtime,handle:getSelectionMoveHandle(),selectedPolygonId,selectedLineId,segments:[...selectedSegments],historyIndex,objectsMovementLocked,zoomFactor}),
    zoom:value=>{zoomFactor=value;draw();}
   };`});});
  await page.goto('http://127.0.0.1:5221/',{waitUntil:'networkidle'});if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
  const state=()=>page.evaluate(()=>window.__moves.state());
  const fixture={model:{points:[{id:'A',x:260,y:280},{id:'B',x:500,y:280},{id:'C',x:500,y:500},{id:'D',x:260,y:500}],lines:[{id:'ab',points:['A','B'],defining_points:['A','B'],leftRay:{hidden:true},rightRay:{hidden:true}},{id:'bc',points:['B','C'],leftRay:{hidden:true},rightRay:{hidden:true}},{id:'cd',points:['C','D'],leftRay:{hidden:true},rightRay:{hidden:true}},{id:'da',points:['D','A'],leftRay:{hidden:true},rightRay:{hidden:true}}],polygons:[{id:'poly',points:['A','B','C','D'],fill:'#15a3ff',fillOpacity:.1}],labels:[{id:'length',text:'',pos:{x:380,y:258},measurement:{kind:'segment',lineId:'ab',points:['A','B'],scale:20,offset:{x:0,y:-22}}}]}};
  const load=()=>page.evaluate(doc=>window.__moves.load(doc),fixture);
  const screen=p=>page.evaluate(p=>{const q=window.__moves.worldToCanvas(p.x,p.y),r=document.getElementById('canvas').getBoundingClientRect();return{x:r.x+q.x,y:r.y+q.y};},p);
  const click=async(p,touch=false)=>{const q=await screen(p);if(touch)await page.touchscreen.tap(q.x,q.y);else await page.mouse.click(q.x,q.y);};
  const drag=async(from,dx,dy,touch=false)=>{const a=await screen(from),b=await screen({x:from.x+dx,y:from.y+dy});
   check('Visible handle receives canvas input',await page.evaluate(q=>document.elementFromPoint(q.x,q.y)?.id,a)==='canvas',a);
   if(touch){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...a}]});for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:a.x+(b.x-a.x)*i/12,y:a.y+(b.y-a.y)*i/12}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
   else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();}
  };
  const moved=(before,after,ids,dx,dy)=>ids.every(id=>Math.abs(after[id].x-before[id].x-dx)<1e-4&&Math.abs(after[id].y-before[id].y-dy)<1e-4);
  await load();await click({x:380,y:280});let s=await state();
  check('Selecting a whole polygon displays its move handle',s.selectedPolygonId==='poly'&&s.selectedLineId===null&&!!s.handle,s);
  const before=s.runtime.points,h=s.historyIndex;await drag(s.handle,30,20);s=await state();
  check('Whole polygon translates rigidly',moved(before,s.runtime.points,['A','B','C','D'],30,20),s.runtime.points);
  check('Selection survives handle dragging',s.selectedPolygonId==='poly'&&s.segments.length===0,s);
  check('One handle gesture creates one undo step',s.historyIndex===h+1,{h,after:s.historyIndex});
  check('Bound length moves with the polygon',s.runtime.labels.length.text==='12.0'&&Math.abs(s.runtime.labels.length.pos.x-410)<1e-4,s.runtime.labels.length);
  await page.locator('#undo').click();s=await state();check('Undo restores every polygon vertex',moved(before,s.runtime.points,['A','B','C','D'],0,0));
  await page.locator('#redo').click();s=await state();check('Redo restores translation',moved(before,s.runtime.points,['A','B','C','D'],30,20));
  await load();await click({x:380,y:280});await click({x:380,y:280});s=await state();
  check('Selecting a polygon side displays its own move handle',s.selectedLineId==='ab'&&s.segments.length===1&&!!s.handle,s);
  const edgeBefore=s.runtime.points;await drag(s.handle,24,18);s=await state();
  check('Side handle moves its endpoints',moved(edgeBefore,s.runtime.points,['A','B'],24,18),s.runtime.points);
  check('Other vertices stay in place',moved(edgeBefore,s.runtime.points,['C','D'],0,0));
  check('Side selection remains selected',s.selectedLineId==='ab'&&s.segments.length===1,s);
  const unchanged=s.historyIndex;await click(s.handle);check('Clicking a handle without dragging creates no history',(await state()).historyIndex===unchanged);
  const toggleLock=async()=>{if(!await page.locator('#objectMovementLockBtn').isVisible())await page.locator('#zoomMenu').click();await page.locator('#objectMovementLockBtn').click();if(await page.locator('#objectMovementLockBtn').isVisible())await page.locator('#zoomMenu').click();};
  await toggleLock();
  check('Movement lock hides the move handle',(await state()).handle===null);
  await toggleLock();
  check('Unlocking restores the move handle',!!(await state()).handle);
  await page.screenshot({path:path.join(out,'desktop.png')});
  for(const zoom of [.6,1.8]){await page.evaluate(zoom=>window.__moves.zoom(zoom),zoom);s=await state();const mid={x:(s.runtime.points.A.x+s.runtime.points.B.x)/2,y:(s.runtime.points.A.y+s.runtime.points.B.y)/2},a=await screen(mid),b=await screen(s.handle);check('Handle spacing stays constant at zoom '+zoom,Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(44,32))<1e-4);}
  await page.setViewportSize({width:390,height:844});await load();await click({x:380,y:280},true);s=await state();const touchBefore=s.runtime.points;await drag(s.handle,20,15,true);s=await state();check('Touch moves the whole polygon',moved(touchBefore,s.runtime.points,['A','B','C','D'],20,15),s.runtime.points);
  await load();await click({x:380,y:280},true);await click({x:380,y:280},true);s=await state();const touchEdge=s.runtime.points;await drag(s.handle,-12,16,true);s=await state();check('Touch moves only the selected side',moved(touchEdge,s.runtime.points,['A','B'],-12,16)&&moved(touchEdge,s.runtime.points,['C','D'],0,0),s.runtime.points);
  await page.screenshot({path:path.join(out,'mobile.png')});
  check('No browser exceptions',results.errors.length===0,results.errors);
 }catch(error){results.errors.push(error.stack||String(error));process.exitCode=1;await page?.screenshot({path:path.join(out,'error.png')}).catch(()=>{});}
 finally{await browser?.close();await server.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
 console.log(JSON.stringify({checks:results.checks.length,passed:results.checks.filter(c=>c.passed).length,errors:results.errors}));if(results.errors.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
