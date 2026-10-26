const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const output=path.resolve(__dirname,'../../output/playwright/inversion');fs.mkdirSync(output,{recursive:true});
const result={checks:[],errors:[]};
const check=(name,ok,data)=>{result.checks.push({name,passed:!!ok,data});if(!ok)throw new Error(name+': '+JSON.stringify(data));};
const base=()=>({points:[{id:'o',x:500,y:400},{id:'r',x:500,y:240},{id:'a',x:740,y:280},{id:'b',x:740,y:520}],circles:[{id:'mirror',center:'o',radius_point:'r',points:[],circle_kind:'center-radius',style:{color:'#888888'}}],lines:[{id:'ab',points:['a','b'],leftRay:{hidden:true},rightRay:{hidden:true},style:{color:'#22aaff',width:3}}]});
(async()=>{
 const {createServer}=await import('vite'),server=await createServer({server:{host:'127.0.0.1',port:5252,strictPort:true}});await server.listen();let browser;
 try{
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  const page=await browser.newPage({viewport:{width:1100,height:850},hasTouch:true,serviceWorkers:'block'});
  page.on('pageerror',e=>result.errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('geometry.grid',JSON.stringify({visible:false})));
  await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\nwindow.__inversion={state:()=>({runtime,historyIndex,symmetricObjectSource}),screen:worldToCanvas,load:d=>{applyPersistedDocument(d);panOffset={x:0,y:0};zoomFactor=1;draw();},serialize:serializeCurrentDocument,readOnly:selectionHasSymmetry,handles:getMultiHandles,copy:copyMultiSelectionToClipboard,paste:pasteCopiedObjects,hit:p=>findCircle(p,3,false)};`});});
  await page.goto('http://127.0.0.1:5252/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__inversion);
  if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
  const state=()=>page.evaluate(()=>window.__inversion.state());
  const load=async model=>{await page.evaluate(model=>window.__inversion.load({model}),model);await page.locator('#modeMove').click();};
  const screen=p=>page.evaluate(p=>{const q=window.__inversion.screen(p.x,p.y),r=document.getElementById('canvas').getBoundingClientRect();return{x:r.left+q.x,y:r.top+q.y};},p);
  const click=async p=>{const q=await screen(p);await page.mouse.click(q.x,q.y);};
  const drag=async(a,b)=>{a=await screen(a);b=await screen(b);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
  const invertUI=async(source,mirror={x:500,y:560})=>{await page.locator('#modeSymmetric').click();await click(source);check('First click selects a source',!!(await state()).symmetricObjectSource);await click(mirror);};
  const images=(s,key)=>Object.values(s.runtime[key]).filter(p=>p.symmetry?.mirror.kind==='circle');
  const curve=s=>images(s,'circles').find(c=>c.geometryValid!==false);
  const close=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y)<1e-5;
  const inverse=(p,o={x:500,y:400},radius=160)=>{const dx=p.x-o.x,dy=p.y-o.y,n=dx*dx+dy*dy;return{x:o.x+radius*radius*dx/n,y:o.y+radius*radius*dy/n};};
  const pixel=async p=>page.evaluate(p=>{const c=document.getElementById('canvas'),q=window.__inversion.screen(p.x,p.y),d=c.width/c.getBoundingClientRect().width;return [...c.getContext('2d').getImageData(Math.round(q.x*d),Math.round(q.y*d),1,1).data];},p);

  await load(base());await invertUI({x:740,y:400});let s=await state(),c=curve(s);
  check('Circle as the second click creates a dependent inverted arc',!!c&&c.inversion.mirror==='mirror'&&images(s,'lines').every(l=>l.geometryValid===false));
  const imageA=images(s,'points').find(p=>p.symmetricMeta?.source==='a');check('Endpoint obeys the reciprocal distance law',close(imageA,inverse(s.runtime.points.a)));
  check('The complementary arc is hidden',Object.values(c.arcStyles).some(a=>a.hidden)&&Object.values(c.arcStyles).some(a=>!a.hidden));
  check('Image group is read-only without transform handles',await page.evaluate(()=>window.__inversion.readOnly()&&window.__inversion.handles()===null));
  const before=JSON.stringify(images(s,'points')),history=s.historyIndex;
  await page.locator('#modeMove').click();await drag({x:606.6666667,y:400},{x:620,y:430});s=await state();
  check('Dragging the arc cannot edit its construction',s.historyIndex===history&&JSON.stringify(images(s,'points'))===before);
  await click({x:980,y:600});const shown=await pixel({x:606.6666667,y:400}),chord=await pixel({x:585.3333333,y:400});
  check('Canvas renders the circular arc rather than the chord',shown[2]>shown[0]+30&&!(chord[2]>chord[0]+30),{shown,chord});
  check('Hidden complementary arc cannot be selected',await page.evaluate(()=>window.__inversion.hit({x:500,y:400})===null));
  await page.screenshot({path:path.join(output,'segment-arc.png')});
  await page.locator('#undo').click();check('Undo removes the complete inversion',images(await state(),'circles').length===0);
  await page.locator('#redo').click();check('Redo restores the complete inversion',!!curve(await state()));
  await drag({x:740,y:280},{x:760,y:260});s=await state();check('Source movement recomputes the image',close(images(s,'points').find(p=>p.symmetricMeta?.source==='a'),inverse(s.runtime.points.a)),{source:s.runtime.points.a,image:images(s,'points').find(p=>p.symmetricMeta?.source==='a')});
  await drag({x:500,y:240},{x:500,y:220});s=await state();check('Changing the inversion radius recomputes the image',close(images(s,'points').find(p=>p.symmetricMeta?.source==='a'),inverse(s.runtime.points.a,s.runtime.points.o,180)));
  const saved=await page.evaluate(()=>window.__inversion.serialize());await page.evaluate(d=>window.__inversion.load(d),saved);s=await state();
  check('Native reload preserves curve definitions and read-only metadata',!!curve(s)&&images(s,'points').some(p=>p.inversionHelper));

  const through=base();through.points.find(p=>p.id==='a').x=260;through.points.find(p=>p.id==='a').y=400;through.points.find(p=>p.id==='b').y=400;
  await load(through);await invertUI({x:620,y:400});s=await state();const rays=images(s,'lines').find(l=>l.geometryValid!==false);
  check('Segment crossing the pole becomes two rays with a hidden gap',!!rays&&!rays.leftRay.hidden&&!rays.rightRay.hidden&&rays.segmentStyles.some(a=>a.hidden));
  await page.locator('#modeMove').click();await click({x:980,y:600});await page.screenshot({path:path.join(output,'two-rays.png')});

  const circles=base();circles.lines=[];circles.points.push({id:'s',x:600,y:400},{id:'t',x:700,y:400});circles.circles.push({id:'source',center:'s',radius_point:'t',points:[],circle_kind:'center-radius',style:{color:'#22aaff',width:3},fill:'#22aaff',fillOpacity:.3});
  await load(circles);await invertUI({x:600,y:300});s=await state();
  check('Circle through the pole becomes a line and a half-plane',images(s,'lines').some(l=>l.geometryValid!==false)&&!curve(s)&&images(s,'polygons').some(p=>p.inversionRegion));
  await page.locator('#modeMove').click();await click({x:980,y:600});const inside=await pixel({x:680,y:550}),outside=await pixel({x:580,y:550});
  check('Canvas fills the correct half-plane',inside[2]>outside[2]+30&&inside[2]>inside[0]+30,{inside,outside});
  await page.screenshot({path:path.join(output,'circle-half-plane.png')});
  await drag({x:600,y:400},{x:610,y:400});s=await state();check('Moving the source center switches the line image back to a circle',!!curve(s)&&images(s,'lines').every(l=>l.geometryValid===false));

  const polygon=base();polygon.points.push({id:'d',x:850,y:400});polygon.lines.push({id:'bd',points:['b','d'],leftRay:{hidden:true},rightRay:{hidden:true},style:{color:'#22aaff'}},{id:'da',points:['d','a'],leftRay:{hidden:true},rightRay:{hidden:true},style:{color:'#22aaff'}});polygon.polygons=[{id:'tri',points:['a','b','d'],fill:'#22aaff',fillOpacity:.3}];polygon.labels=[{id:'label',pos:{x:800,y:550},text:'Inwersja'}];polygon.inkStrokes=[{id:'ink',color:'#dd44aa',baseWidth:2,points:[{x:650,y:600,pressure:.5,time:0},{x:900,y:600,pressure:.5,time:1}]}];polygon.objectGroups={g:{id:'g',members:{points:['a','b','d'],lines:['ab','bd','da'],polygons:['tri'],labels:['label'],inkStrokes:['ink']}}};
  await load(polygon);await invertUI({x:780,y:400});s=await state();
  check('A grouped member inverts the complete group including text and handwriting',images(s,'polygons').length===1&&images(s,'labels').length===1&&images(s,'inkStrokes').length===1&&images(s,'circles').filter(c=>c.geometryValid!==false).length===3);
  check('Handwriting follows curved samples',images(s,'inkStrokes')[0].points.length>2);
  const curvedFill=await pixel(inverse({x:780,y:400}));check('Polygon fill follows curved edges beyond the vertex chords',curvedFill[2]>curvedFill[0]+40,curvedFill);
  await page.screenshot({path:path.join(output,'mixed-group-inversion.png')});
  await page.evaluate(()=>{window.__inversion.copy();window.__inversion.paste();});s=await state();
  check('Copy/paste carries independent source and inversion-circle dependencies',images(s,'polygons').length===2&&images(s,'polygons').every(p=>s.runtime.polygons[p.inversionRegion.source.id]&&s.runtime.circles[p.inversionRegion.mirror]));

  await load(base());await invertUI({x:740,y:280});await page.locator('#modeMove').click();await drag({x:740,y:280},{x:500,y:400});s=await state();
  check('Image of the pole becomes unavailable',images(s,'points').find(p=>p.symmetricMeta?.source==='a').geometryValid===false);
  await drag({x:500,y:400},{x:740,y:280});s=await state();check('Leaving the pole restores the dependent point',images(s,'points').find(p=>p.symmetricMeta?.source==='a').geometryValid!==false);

  await load(base());await invertUI({x:740,y:400});await page.locator('#modeMove').click();await click({x:500,y:240});await page.locator('#deletePoint').click();s=await state();
  check('Deleting the inversion circle input removes images and preserves sources',images(s,'circles').length===0&&!!s.runtime.lines.ab);

  await page.setViewportSize({width:390,height:844});const mobile=base();mobile.points=[{id:'o',x:175,y:400},{id:'r',x:175,y:280},{id:'a',x:310,y:350},{id:'b',x:310,y:450}];
  await load(mobile);await page.locator('#modeSymmetric').click();let q=await screen({x:310,y:400});await page.touchscreen.tap(q.x,q.y);q=await screen({x:55,y:400});await page.touchscreen.tap(q.x,q.y);s=await state();
  check('Touch chooses a circle as the second symmetry input',!!curve(s)&&close(images(s,'points').find(p=>p.symmetricMeta?.source==='a'),inverse(s.runtime.points.a,{x:175,y:400},120)));
  await page.locator('#modeMove').click();await page.screenshot({path:path.join(output,'mobile-inversion.png')});
  check('No browser exceptions',result.errors.length===0,result.errors);
 }catch(error){result.errors.push(error.stack||String(error));process.exitCode=1;}
 finally{await browser?.close();await server.close();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));}
 console.log(JSON.stringify({checks:result.checks.length,passed:result.checks.filter(c=>c.passed).length,errors:result.errors}));if(result.errors.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
