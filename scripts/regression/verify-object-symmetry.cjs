const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const output=path.resolve(__dirname,'../../output/playwright/object-symmetry');fs.mkdirSync(output,{recursive:true});
const result={checks:[],errors:[]};
const check=(name,ok,data)=>{result.checks.push({name,passed:!!ok,data});if(!ok)throw new Error(name+': '+JSON.stringify(data));};
const clone=value=>JSON.parse(JSON.stringify(value));
const model=()=>({points:[{id:'o',x:550,y:400},{id:'u',x:550,y:170},{id:'v',x:550,y:650},{id:'a',x:200,y:300},{id:'b',x:360,y:300},{id:'c',x:240,y:450}],lines:[{id:'axis',points:['u','v'],leftRay:{hidden:true},rightRay:{hidden:true}},...['ab','bc','ca'].map(id=>({id,points:id.split(''),style:{width:2,color:'#22aaff'},leftRay:{hidden:true},rightRay:{hidden:true}}))],polygons:[{id:'tri',points:['a','b','c'],fill:'#22aaff',fillOpacity:.2}]});
(async()=>{
 const {createServer}=await import('vite'),server=await createServer({server:{host:'127.0.0.1',port:5251,strictPort:true}});await server.listen();let browser;
 try{
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  const page=await browser.newPage({viewport:{width:1100,height:850},hasTouch:true,serviceWorkers:'block'});
  page.on('pageerror',e=>result.errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('geometry.grid',JSON.stringify({visible:false})));
  await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\nwindow.__symmetry={state:()=>({runtime,mode,historyIndex,selectedPointId,selectedLineId,symmetricSourceId,symmetricObjectSource}),screen:worldToCanvas,load:d=>{applyPersistedDocument(d);panOffset={x:0,y:0};zoomFactor=1;draw();},serialize:serializeCurrentDocument,multiHandles:getMultiHandles,readOnly:selectionHasSymmetry,copy:copyMultiSelectionToClipboard,paste:pasteCopiedObjects,setMode};`});});
  await page.goto('http://127.0.0.1:5251/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__symmetry);
  if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
  const state=()=>page.evaluate(()=>window.__symmetry.state());
  const load=async data=>{await page.evaluate(model=>window.__symmetry.load({model}),data);await page.locator('#modeMove').click();};
  const screen=p=>page.evaluate(p=>{const q=window.__symmetry.screen(p.x,p.y),r=document.getElementById('canvas').getBoundingClientRect();return{x:r.left+q.x,y:r.top+q.y};},p);
  const click=async p=>{const q=await screen(p);await page.mouse.click(q.x,q.y);};
  const drag=async(p,dx,dy)=>{const q=await screen(p);await page.mouse.move(q.x,q.y);await page.mouse.down();await page.mouse.move(q.x+dx,q.y+dy,{steps:8});await page.mouse.up();};
  const images=s=>Object.fromEntries(['points','lines','circles','angles','polygons','labels','inkStrokes'].map(key=>[key,Object.values(s.runtime[key]).filter(object=>object.symmetry)]));
  const image=s=>images(s).points.find(p=>p.symmetricMeta?.source==='a');
  const close=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<1e-5;
  const reflect=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy);return{x:2*(a.x+t*dx)-p.x,y:2*(a.y+t*dy)-p.y};};
  const reflectUI=async(source,mirror)=>{await page.locator('#modeSymmetric').click();await click(source);const pending=await state();check('First symmetry click chooses the source without creating an image',pending.symmetricObjectSource&&images(pending).points.length===0,pending.symmetricObjectSource);await click(mirror);};

  await load(model());
  check('The tool is named Symetria',await page.locator('#modeSymmetric').getAttribute('title')==='Symetria');
  await reflectUI({x:200,y:300},{x:550,y:400});
  let s=await state();check('Point symmetry uses the selected center',close(image(s),{x:900,y:500}));
  const pointBefore=clone(image(s)),history=s.historyIndex;
  await page.locator('#modeMove').click();await drag(pointBefore,30,25);s=await state();
  check('An image point cannot be dragged or styled',close(image(s),pointBefore)&&s.historyIndex===history&&await page.locator('#styleMenu').isHidden());

  await load(model());await reflectUI({x:280,y:300},{x:550,y:230});s=await state();
  check('A segment is reflected with its endpoints and styles',images(s).lines.length===1&&images(s).points.length===2&&close(image(s),{x:900,y:300})&&images(s).lines[0].style.color==='#22aaff');

  await load(model());await reflectUI({x:260,y:350},{x:550,y:230});s=await state();
  check('A polygon is reflected with all three boundary segments',images(s).polygons.length===1&&images(s).lines.length===3&&images(s).points.length===3);
  check('Reflected polygons form a read-only group without transform handles',await page.evaluate(()=>window.__symmetry.readOnly()&&window.__symmetry.multiHandles()===null));
  const polygonBefore=JSON.stringify(images(s)),polygonHistory=s.historyIndex;
  await page.locator('#modeMove').click();await drag({x:840,y:350},25,20);s=await state();
  check('Dragging an image group preserves geometry and history',JSON.stringify(images(s))===polygonBefore&&s.historyIndex===polygonHistory);
  check('Read-only groups cannot be unlocked or ungrouped',await page.locator('#groupShapeLockBtn').isDisabled()&&await page.locator('#ungroupObjectsBtn').isDisabled());
  await page.locator('#undo').click();check('Undo removes the whole symmetry construction',images(await state()).points.length===0);
  await page.locator('#redo').click();check('Redo restores the whole symmetry construction',images(await state()).polygons.length===1);
  await drag({x:200,y:300},20,15);s=await state();
  check('Moving the source vertex updates its image',close(image(s),reflect(s.runtime.points.a,s.runtime.points.u,s.runtime.points.v)));
  await drag({x:550,y:170},15,10);s=await state();
  check('Moving the axis updates all image vertices',images(s).points.every(p=>close(p,reflect(s.runtime.points[p.symmetricMeta.source],s.runtime.points.u,s.runtime.points.v))));
  const saved=await page.evaluate(()=>window.__symmetry.serialize());await page.evaluate(d=>window.__symmetry.load(d),saved);s=await state();
  check('Native reload preserves dependencies and read-only metadata',images(s).polygons.length===1&&images(s).points.every(p=>close(p,reflect(s.runtime.points[p.symmetricMeta.source],s.runtime.points.u,s.runtime.points.v))));
  await page.screenshot({path:path.join(output,'polygon-reflection.png')});

  const circle=model();circle.circles=[{id:'circle',center:'a',radius_point:'b',points:[],circle_kind:'center-radius',style:{color:'#ff00ff'}}];
  await load(circle);await reflectUI({x:200,y:140},{x:550,y:230});s=await state();
  check('A circle is reflected with its center and radius',images(s).circles.length===1&&close(image(s),{x:900,y:300}));

  const grouped=model();grouped.circles=[{id:'circle',center:'a',radius_point:'b',points:[],circle_kind:'center-radius',style:{color:'#ff00ff'}}];
  grouped.labels=[{id:'note',text:'Grupa',pos:{x:300,y:500}}];grouped.inkStrokes=[{id:'ink',points:[{x:210,y:510,pressure:.5,time:1},{x:260,y:540,pressure:.6,time:2}],color:'#ffcc00',baseWidth:3}];
  grouped.objectGroups={g:{id:'g',members:{points:['a','b','c'],lines:['ab','bc','ca'],polygons:['tri'],circles:['circle'],labels:['note'],inkStrokes:['ink']}}};
  await load(grouped);await reflectUI({x:260,y:350},{x:550,y:230});s=await state();
  check('Clicking a grouped member reflects the complete mixed group',images(s).circles.length===1&&images(s).labels.length===1&&images(s).inkStrokes.length===1&&images(s).polygons.length===1);
  check('Text and handwriting positions reflect correctly',close(images(s).labels[0].pos,{x:800,y:500})&&close(images(s).inkStrokes[0].points[0],{x:890,y:510}));
  await page.evaluate(()=>{window.__symmetry.copy();window.__symmetry.paste();});s=await state();
  check('Copy/paste retains a complete independent symmetry graph',images(s).polygons.length===2&&images(s).polygons.every(p=>s.runtime.polygons[p.symmetry.source.id]&&s.runtime.lines[p.symmetry.mirror.id]));
  await page.screenshot({path:path.join(output,'group-reflection.png')});

  await load(model());await reflectUI({x:260,y:350},{x:550,y:230});await page.locator('#modeMove').click();await click({x:550,y:230});await page.locator('#deletePoint').click();s=await state();
  check('Deleting the axis removes dependent images while preserving sources',images(s).points.length===0&&images(s).polygons.length===0&&!!s.runtime.polygons.tri);
  await page.locator('#undo').click();check('Undo axis deletion restores the reflected objects',images(await state()).polygons.length===1);

  await page.setViewportSize({width:390,height:844});
  const mobile={points:[{id:'o',x:195,y:400},{id:'a',x:100,y:300},{id:'b',x:150,y:330}],lines:[{id:'ab',points:['a','b'],leftRay:{hidden:true},rightRay:{hidden:true},style:{color:'#22aaff'}}]};
  await load(mobile);await page.locator('#modeSymmetric').click();
  let p=await screen({x:125,y:315});await page.touchscreen.tap(p.x,p.y);p=await screen({x:195,y:400});await page.touchscreen.tap(p.x,p.y);s=await state();
  check('Touch creates a centrally symmetric segment',images(s).lines.length===1&&close(image(s),{x:290,y:500}));
  const cdp=await page.context().newCDPSession(page);await page.locator('#modeMove').click();p=await screen({x:265,y:485});const before=clone(images(await state()));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:41,...p}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:41,x:p.x+20,y:p.y+20}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  check('Touch cannot deform a reflected group',JSON.stringify(images(await state()))===JSON.stringify(before));
  await page.screenshot({path:path.join(output,'mobile-reflection.png')});
  check('No browser exceptions',result.errors.length===0,result.errors);
 }catch(error){result.errors.push(error.stack||String(error));process.exitCode=1;}
 finally{await browser?.close();await server.close();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));}
 console.log(JSON.stringify({checks:result.checks.length,passed:result.checks.filter(c=>c.passed).length,errors:result.errors}));if(result.errors.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
