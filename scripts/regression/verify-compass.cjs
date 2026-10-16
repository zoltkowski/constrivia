const fs = require('node:fs');
const path = require('node:path');
const OUTPUT_ROOT = path.resolve(__dirname, '../../output/playwright');
const { zipSync, strToU8 } = require('fflate');
const { chromium } = require('playwright');
const OUT = path.join(OUTPUT_ROOT, 'compass');
fs.mkdirSync(OUT, { recursive:true });
const archive = (name, document) => ({name:name+'.ctr',bytes:Array.from(zipSync({[name+'.json']:strToU8(JSON.stringify(document))}))});
const document = {model:{points:[
  {id:'pt1',x:200,y:440,label:{text:'A'},style:{}},
  {id:'pt2',x:500,y:440,label:{text:'B'},style:{}},
  {id:'pt3',x:730,y:260,label:{text:'O'},style:{}},
  {id:'pt4',x:350,y:440,construction_kind:'midpoint',midpointMeta:{parents:['pt1','pt2'],parentLineId:'ln1'},parent_refs:[{kind:'point',id:'pt1'},{kind:'point',id:'pt2'}],style:{}}
],lines:[{id:'ln1',points:['pt1','pt4','pt2'],defining_points:['pt1','pt2'],style:{color:'#15a3ff',width:3,type:'dashed'}}]}};
const mobile = {model:{points:[{id:'pt1',x:100,y:350},{id:'pt2',x:250,y:350},{id:'pt3',x:175,y:180}],lines:[]}};
const results={checks:[],errors:[]};
function check(name,pass,observed){results.checks.push({name,passed:!!pass,observed});if(!pass)throw Error(name+': '+JSON.stringify(observed));}
(async()=>{
  const {createServer}=await import('vite');
  const server=await createServer({server:{host:'127.0.0.1',port:5189,strictPort:true}});await server.listen();
  let browser;
  try{
    browser=await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),headless:true});
    const page=await browser.newPage({viewport:{width:1100,height:800},hasTouch:true,serviceWorkers:'block'});
    page.on('pageerror',e=>results.errors.push(e.message));
    page.on('dialog',async d=>{results.errors.push(d.message());await d.dismiss();});
    await page.addInitScript(files=>{
      window.__compassFiles=files;
      window.showDirectoryPicker=async()=>({name:'Compass tests',kind:'directory',queryPermission:async()=>'granted',requestPermission:async()=>'granted',
        async *values(){for(const file of window.__compassFiles)yield{kind:'file',name:file.name,getFile:async()=>new File([new Uint8Array(file.bytes)],file.name,{type:'application/zip'})};}});
    },[archive('compass-input',document),archive('compass-mobile',mobile)]);
    await page.route('**/src/main.ts*',async route=>{
      const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\nlet compassRevision=0;const originalCompassLoad=applyPersistedDocument;applyPersistedDocument=(...args)=>{const r=originalCompassLoad(...args);compassRevision++;return r;};window.__compass={state:()=>({runtime,mode,compassPoints,selectedCircleId,selectedPointId,selectedLineId,revision:compassRevision,panOffset,zoomFactor}),serialize:serializeCurrentDocument,worldToCanvas,findPoint,findLine,findCircle,findLabelAt,circleRadius,getCircleHandle,getCircleRotateHandle};`});
    });
    // Keep exact-coordinate construction fixtures independent of optional grid snapping.
    await page.addInitScript(() => localStorage.setItem('geometry.grid', JSON.stringify({ visible: false })));
    await page.goto('http://127.0.0.1:5189/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__compass);
    if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
    const state=()=>page.evaluate(()=>window.__compass.state());
    const screen=p=>page.evaluate(p=>{const r=document.getElementById('canvas').getBoundingClientRect(),c=window.__compass.worldToCanvas(p.x,p.y);return{x:r.left+c.x,y:r.top+c.y};},p);
    const click=async p=>{const c=await screen(p);const target=await page.evaluate(c=>document.elementFromPoint(c.x,c.y)?.id,c);if(target!=='canvas')throw Error('Canvas target obscured: '+JSON.stringify({p,c,target}));await page.mouse.click(c.x,c.y);};
    const point=async id=>click((await state()).runtime.points[id]);
    const clear=async()=>{await page.locator('#modeMove').click();const p=await page.evaluate(()=>{const d=window.__compass,r=document.getElementById('canvas').getBoundingClientRect();for(let y=70;y<r.height-80;y+=43)for(let x=60;x<r.width-30;x+=47){if(document.elementFromPoint(r.left+x,r.top+y)?.id!=='canvas')continue;const s=d.state(),p={x:(x-s.panOffset.x)/s.zoomFactor,y:(y-s.panOffset.y)/s.zoomFactor};if(!d.findPoint(p)&&!d.findLine(p)&&!d.findCircle(p,undefined,false)&&!d.findLabelAt(p))return p;}return null;});if(!p)throw Error('No clear canvas point');await click(p);};
    const load=async name=>{await clear();const revision=(await state()).revision;if(!(await page.locator('#cloudPanel').isVisible()))await page.locator('#cloudFilesBtn').click();await page.locator('#localFileList [data-change-folder]').click();await page.getByRole('button',{name:'Wczytaj '+name,exact:true}).click();await page.waitForFunction(r=>window.__compass.state().revision>r,revision);await page.locator('#cloudCloseBtn').click();};
    const radius=id=>page.evaluate(id=>{const d=window.__compass;return d.circleRadius(d.state().runtime.circles[id]);},id);
    const drag=async(id,target)=>{await clear();const before=(await state()).runtime.points[id],from=await screen(before),to=await screen(target);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();const actual=(await state()).runtime.points[id];check('Source point actually moves',Math.hypot(actual.x-before.x,actual.y-before.y)>1,{id,before,actual});};
    await load('compass-input');
    check('Compass button is available',await page.locator('#modeCompass').isVisible(),null);
    await page.locator('#modeCompass').click();await click({x:275,y:440});
    const segmentInput=await state();check('One click takes only the selected subdivided segment',segmentInput.compassPoints.join(',')==='pt1,pt4'&&Object.keys(segmentInput.runtime.circles).length===0,segmentInput.compassPoints);
    await point('pt3');const segmentCircle=(await state()).selectedCircleId;
    check('Segment and center create a compass circle without an auxiliary point',!!segmentCircle&&Object.keys((await state()).runtime.points).length===4&&(await state()).runtime.circles[segmentCircle].radius_point===undefined,null);
    check('Radius matches the selected part, not the whole line',Math.abs(await radius(segmentCircle)-150)<1e-6,await radius(segmentCircle));
    await page.locator('#undo').click();check('Undo removes the circle without its existing inputs',Object.keys((await state()).runtime.circles).length===0&&Object.keys((await state()).runtime.points).length===4,null);
    await page.locator('#redo').click();check('Redo restores the same circle',!!(await state()).runtime.circles[segmentCircle],segmentCircle);
    await drag('pt2',{x:540,y:380});
    const moved=await state(),a=moved.runtime.points.pt1,h=moved.runtime.points.pt4;
    check('Length follows a dependent midpoint when its parent moves',Math.abs(await radius(segmentCircle)-Math.hypot(h.x-a.x,h.y-a.y))<1e-6,await radius(segmentCircle));
    await page.locator('#undo').click();
    await clear();await page.locator('#modeCompass').click();await point('pt1');
    await point('pt1');check('Repeated source point is rejected without orphan objects',(await state()).compassPoints.length===1&&Object.keys((await state()).runtime.points).length===4,null);
    await point('pt2');check('Two explicit points set the length',(await state()).compassPoints.join(',')==='pt1,pt2',null);
    await point('pt1');const pairCircle=(await state()).selectedCircleId;
    check('Source endpoint can also be the new center',!!pairCircle&&(await state()).runtime.circles[pairCircle].center==='pt1'&&Math.abs(await radius(pairCircle)-300)<1e-6,null);
    check('No independent scale/rotate handles for a dependent radius',await page.evaluate(id=>!window.__compass.getCircleHandle(id)&&!window.__compass.getCircleRotateHandle(id),pairCircle),null);
    await page.locator('#styleMenu').click();
    await page.locator('#styleColor').evaluate(el=>{el.value='#cc3366';el.dispatchEvent(new Event('input',{bubbles:true}));});
    check('Circle accepts its own color',(await state()).runtime.circles[pairCircle].style.color==='#cc3366',null);
    await clear();await page.locator('#modeLabel').click();await click({x:200,y:180});await page.locator('#labelText').fill('k: r = AB');
    check('Construction accepts a text annotation',Object.values((await state()).runtime.labels).some(l=>l.text==='k: r = AB'),null);
    await clear();
    const saved=await page.evaluate(()=>window.__compass.serialize());
    await page.evaluate(file=>window.__compassFiles.push(file),archive('compass-roundtrip',saved));await load('compass-roundtrip');
    const restored=(await state()).runtime.circles[pairCircle];
    check('Native reload preserves compass definition, source labels, annotation and style',restored?.circle_kind==='compass'&&restored.defining_points.join(',')==='pt1,pt1,pt2'&&(await state()).runtime.points.pt1.label?.text==='A'&&Object.values((await state()).runtime.labels).some(l=>l.text==='k: r = AB')&&restored.style.color==='#cc3366',restored);
    await drag('pt2',{x:540,y:380});check('Reloaded radius still follows its source',Math.abs(await radius(pairCircle)-Math.hypot(340,-60))<1e-4,await radius(pairCircle));
    await page.locator('#undo').click();await clear();
    const modelBefore=JSON.stringify((await page.evaluate(()=>window.__compass.serialize())).model);
    await page.mouse.move(600,400);await page.mouse.wheel(0,-100);
    check('Zoom changes only the view',JSON.stringify((await page.evaluate(()=>window.__compass.serialize())).model)===modelBefore,null);
    await load('compass-input');await clear();await page.locator('#modeCompass').click();await point('pt1');await point('pt2');await point('pt3');
    const independentCircle=(await state()).selectedCircleId;
    await clear();await page.locator('#modeMultiselect').click();await click({x:430,y:260});
    await page.locator('#multiCloneBtn').click();await page.locator('#multiCloneBtn').click();
    const copiedState=await state(),copy=Object.values(copiedState.runtime.circles).find(c=>c.id!==independentCircle);
    check('Copy remaps all three defining inputs',!!copy&&copy.defining_points.every(id=>!['pt1','pt2','pt3'].includes(id))&&Math.abs(await radius(copy.id)-300)<1e-6,copy);
    await drag('pt2',{x:540,y:380});check('Copied radius does not follow original source points',Math.abs(await radius(copy.id)-300)<1e-6,await radius(copy.id));
    await load('compass-input');await clear();await page.locator('#modeCompass').click();await click({x:275,y:440});await point('pt3');
    const dependentCircle=(await state()).selectedCircleId;
    await clear();await page.locator('#modeMultiselect').click();await click({x:580,y:260});
    await page.locator('#multiCloneBtn').click();await page.locator('#multiCloneBtn').click();
    const dependentCopy=Object.values((await state()).runtime.circles).find(c=>c.id!==dependentCircle);
    check('Copy preserves a length defined by a dependent midpoint',!!dependentCopy&&Math.abs(await radius(dependentCopy.id)-150)<1e-6,dependentCopy);
    const copiedMidpoint=(await state()).runtime.points[dependentCopy.defining_points[2]];
    check('Copied midpoint references copied parents and line',!!copiedMidpoint.midpointMeta&&copiedMidpoint.midpointMeta.parents.every(id=>!['pt1','pt2'].includes(id))&&copiedMidpoint.midpointMeta.parentLineId!=='ln1',copiedMidpoint.midpointMeta);
    await drag('pt2',{x:540,y:380});check('Dependent copy remains independent of the original base',Math.abs(await radius(dependentCopy.id)-150)<1e-6,await radius(dependentCopy.id));
    await clear();await point('pt2');await page.locator('#deletePoint').click();
    check('Deleting a source removes only its dependent compass construction',!(await state()).runtime.circles[dependentCircle]&&!!(await state()).runtime.circles[dependentCopy.id],null);
    await page.locator('#undo').click();check('Undo restores the removed compass construction',!!(await state()).runtime.circles[dependentCircle],null);
    await load('compass-input');await clear();await page.locator('#modeCompass').click();await point('pt1');await point('pt2');await click({x:600,y:500});
    const blankCenter=(await state()).runtime.circles[(await state()).selectedCircleId].center;
    check('Blank center creates just one real point',Object.keys((await state()).runtime.points).length===5,null);
    await page.locator('#undo').click();check('Undo removes the new circle and its new center',Object.keys((await state()).runtime.points).length===4&&!(await state()).runtime.points[blankCenter],null);
    await page.locator('#redo').click();check('Redo restores the same new center',!!(await state()).runtime.points[blankCenter],null);
    await load('compass-input');await clear();await page.locator('#modeCompass').click();await click({x:600,y:500});
    const unfinished=(await state()).compassPoints[0];await page.locator('#modeMove').click();await page.locator('#undo').click();
    check('Unfinished source point can be undone after changing tools',!(await state()).runtime.points[unfinished],unfinished);
    await page.locator('#redo').click();check('Redo restores only the unfinished point with no stale tool input',!!(await state()).runtime.points[unfinished]&&(await state()).compassPoints.length===0,null);
    await page.setViewportSize({width:390,height:844});await load('compass-mobile');
    await page.locator('#modeCompass').click();
    const touchPoint=async id=>{const c=await screen((await state()).runtime.points[id]);await page.touchscreen.tap(c.x,c.y);};
    await touchPoint('pt1');await touchPoint('pt2');
    check('Mobile touches select both source points',(await state()).compassPoints.length===2,null);
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:120,y:520}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:120,y:520},{id:2,x:240,y:520}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:110,y:520},{id:2,x:250,y:520}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    check('Pinch preserves pending length and creates no circle',(await state()).compassPoints.length===2&&Object.keys((await state()).runtime.circles).length===0&&Object.keys((await state()).runtime.points).length===3,null);
    await touchPoint('pt3');const mobileCircle=(await state()).selectedCircleId;
    check('Mobile center touch completes the circle',!!mobileCircle&&Math.abs(await radius(mobileCircle)-150)<1e-6,null);
    await page.screenshot({path:path.join(OUT,'mobile.png')});
    await load('compass-mobile');
    const constructionCircles=[];
    for(const center of ['pt1','pt2']){
      await page.locator('#modeCompass').click();await touchPoint('pt1');await touchPoint('pt2');await touchPoint(center);constructionCircles.push((await state()).selectedCircleId);
    }
    await page.locator('#modeIntersection').click();await click({x:100,y:200});await click({x:250,y:200});
    const vertices=Object.values((await state()).runtime.points).filter(p=>p.construction_kind==='intersection');
    check('Two compass circles produce both classical intersection vertices',vertices.length===2&&vertices.every(p=>p.geometryValid!==false),vertices);
    for(const p of vertices)check('Each intersection completes an equilateral triangle',Math.abs(Math.hypot(p.x-100,p.y-350)-150)<1e-5&&Math.abs(Math.hypot(p.x-250,p.y-350)-150)<1e-5,p);
    const vertex=vertices.sort((a,b)=>a.y-b.y)[0].id;
    for(const [a,b]of [['pt1','pt2'],['pt1',vertex],['pt2',vertex]]){await page.locator('#modeSegment').click();await point(a);await point(b);}
    await clear();await point('pt3');await page.locator('#deletePoint').click();
    for(const id of ['pt1','pt2',vertex]){await clear();await page.locator('#modeLabel').click();await point(id);}
    const labelled=(await state()).runtime;
    check('Classical compass construction has labelled triangle vertices',['pt1','pt2',vertex].every(id=>!!labelled.points[id].label?.text),null);
    for(const x of [100,250]){
      await clear();await click({x,y:200});
      if(!(await page.locator('#styleColor').isVisible()))await page.locator('#styleMenu').click();
      await page.locator('#styleColor').evaluate(el=>{el.value='#8592a3';el.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.locator('#styleTypeInline [data-type="dashed"]').click();
    }
    await clear();
    const example=await page.evaluate(()=>window.__compass.serialize());
    fs.writeFileSync(path.join(OUT,'trojkat-rowno-boczny.json'),JSON.stringify(example,null,2));
    fs.writeFileSync(path.join(OUT,'trojkat-rowno-boczny.ctr'),new Uint8Array(archive('trojkat-rowno-boczny',example).bytes));
    await page.evaluate(file=>window.__compassFiles.push(file),archive('compass-equilateral',example));await load('compass-equilateral');
    const exampleReload=(await state()).runtime;
    check('Educational construction reloads with its compass circles and labelled vertices',constructionCircles.every(id=>exampleReload.circles[id]?.circle_kind==='compass')&&['pt1','pt2',vertex].every(id=>!!exampleReload.points[id]?.label?.text),null);
    check('Source circles keep their helper style after reload',constructionCircles.every(id=>exampleReload.circles[id].style.color==='#8592a3'&&exampleReload.circles[id].style.type==='dashed'),constructionCircles.map(id=>exampleReload.circles[id].style));
    await page.screenshot({path:path.join(OUT,'trojkat-rowno-boczny-mobile.png')});
    check('No browser exceptions or error dialogs',results.errors.length===0,results.errors);
    console.log(JSON.stringify({checks:results.checks.length,passed:results.checks.filter(c=>c.passed).length,errors:results.errors}));
  }finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));await browser?.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
