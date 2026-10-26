const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {unzipSync,strFromU8,zipSync,strToU8}=require('fflate');
const output=path.resolve(__dirname,'../../output/playwright/multipage');fs.mkdirSync(output,{recursive:true});
const result={checks:[],errors:[]};
const check=(name,ok,data)=>{result.checks.push({name,passed:!!ok,data});if(!ok)throw new Error(name+': '+JSON.stringify(data));};
const fixture=()=>({model:{points:[{id:'a',x:200,y:300},{id:'b',x:360,y:300},{id:'c',x:240,y:450},{id:'m',x:280,y:300,construction_kind:'midpoint',midpointMeta:{parents:['a','b']}}],lines:[...['ab','bc','ca'].map(id=>({id,points:id.split(''),style:{color:'#22aaff',width:2},leftRay:{hidden:true},rightRay:{hidden:true}}))],polygons:[{id:'tri',points:['a','b','c'],fill:'#22aaff',fillOpacity:.15}],circles:[{id:'circle',center:'a',radius_point:'b',points:[],circle_kind:'center-radius',style:{color:'#dd44aa'}}],inkStrokes:[{id:'ink',points:[{x:240,y:470,pressure:.5,time:0},{x:300,y:485,pressure:.5,time:1}],color:'#ffcc00',baseWidth:2}]}});
const decode=bytes=>JSON.parse(strFromU8(Object.values(unzipSync(Uint8Array.from(bytes)))[0]));
(async()=>{
 const {createServer}=await import('vite'),server=await createServer({server:{host:'127.0.0.1',port:5253,strictPort:true}});await server.listen();let browser;
 try{
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  const page=await browser.newPage({viewport:{width:1100,height:850},hasTouch:true,serviceWorkers:'block'});page.on('pageerror',e=>result.errors.push(e.message));
  await page.addInitScript(()=>{
   localStorage.setItem('geometry.grid',JSON.stringify({visible:false}));
   window.addEventListener('cloud-file-loaded',event=>{window.__loadedName=event.detail.name;});
   window.__savedFiles={};const handles={};
   const file=name=>handles[name]??=( {kind:'file',name,getFile:async()=>new File([Uint8Array.from(window.__savedFiles[name]??[])],name),createWritable:async()=>({write:async bytes=>{window.__savedFiles[name]=Array.from(new Uint8Array(bytes));},close:async()=>{}})} );
   window.__testDirectory={kind:'directory',name:'Test pages',queryPermission:async()=> 'granted',requestPermission:async()=> 'granted',getFileHandle:async name=>file(name),values:async function*(){for(const name of Object.keys(window.__savedFiles))yield file(name);}};
   window.showDirectoryPicker=async()=>window.__testDirectory;
  });
  await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\nwindow.__pages={state:()=>({runtime,mode,circleCenterId,book:currentCtrBundle,historyIndex,historyLength:history.length,pan:panOffset,zoom:zoomFactor}),screen:worldToCanvas,single:serializeCurrentDocument,all:serializeMultipageDocument,load:d=>{setCtrBundle(undefined);applyPersistedDocument(d);panOffset={x:0,y:0};zoomFactor=1;draw();},legacy:entries=>{setCtrBundle(undefined);applyPersistedDocument(entries[0].data);setCtrBundle({entries,index:0});},view:(pan,zoom)=>{panOffset=pan;zoomFactor=zoom;draw();}};`});});
  let cloudBytes;
  await page.route('**/api/json/**',async route=>{if(route.request().method()==='PUT'){cloudBytes=Array.from(route.request().postDataBuffer());await route.fulfill({json:{success:true}});}else await route.fulfill({json:{result:[]}});});
  await page.goto('http://127.0.0.1:5253/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__pages);
  if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('default-folder-changed',{detail:{handle:window.__testDirectory}})));
  const state=()=>page.evaluate(()=>window.__pages.state());
  const screen=p=>page.evaluate(p=>{const q=window.__pages.screen(p.x,p.y),r=document.getElementById('canvas').getBoundingClientRect();return{x:q.x+r.left,y:q.y+r.top};},p);
  const click=async p=>{const q=await screen(p);await page.mouse.click(q.x,q.y);};
  const drag=async(a,b)=>{a=await screen(a);b=await screen(b);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();};
  const menu=async id=>{await page.locator('#zoomMenu').click();await page.locator(id).click();};
  const idle=async()=>{await page.locator('#modeMove').click();await click({x:600,y:600});};
  const close=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<1e-5;
  await page.evaluate(d=>window.__pages.load(d),fixture());
  check('Single-page documents hide page navigation',await page.locator('#bundleNextBtn').isHidden());
  await menu('#multipageDocumentBtn');let s=await state();
  check('Enabling retains the construction as page one',s.book.entries.length===1&&s.runtime.polygons.tri&&await page.locator('#multipageDocumentBtn').getAttribute('aria-pressed')==='true');
  check('First page disables Previous and last page shows the plus',await page.locator('#bundlePrevBtn').isDisabled()&&await page.locator('#bundleNextBtn').isEnabled()&&await page.locator('#bundleNextBtn .document-page-plus').isVisible());
  const original=await page.evaluate(()=>window.__pages.single());
  await page.locator('#bundleNextBtn').click();s=await state();
  check('Next on the last page clones geometry, dependencies and handwriting',s.book.entries.length===2&&s.book.index===1&&JSON.stringify((await page.evaluate(()=>window.__pages.single())).model)===JSON.stringify(original.model));
  await drag({x:200,y:300},{x:220,y:315});s=await state();const moved={x:s.runtime.points.a.x,y:s.runtime.points.a.y};
  check('Cloned construction remains editable with dependent midpoint',close(moved,{x:220,y:315})&&close(s.runtime.points.m,{x:290,y:307.5}));
  await page.evaluate(()=>window.__pages.view({x:40,y:25},.9));
  await page.locator('#bundlePrevBtn').click();s=await state();
  check('Previous preserves page one and hides the plus before the end',s.book.index===0&&close(s.runtime.points.a,{x:200,y:300})&&await page.locator('#bundleNextBtn .document-page-plus').isHidden());
  await page.locator('#modeAdd').click();await click({x:420,y:450});const pageOneCount=Object.keys((await state()).runtime.points).length;
  await page.locator('#bundleNextBtn').click();s=await state();
  check('Returning restores page edits and its view without cloning again',s.book.entries.length===2&&close(s.runtime.points.a,moved)&&s.zoom===.9&&close(s.pan,{x:40,y:25})&&Object.keys(s.runtime.points).length===4);
  await page.locator('#undo').click();s=await state();check('Undo belongs to the active page',close(s.runtime.points.a,{x:200,y:300})&&s.book.index===1);
  await page.locator('#redo').click();check('Redo restores the active page edit',close((await state()).runtime.points.a,moved));
  await page.locator('#bundlePrevBtn').click();s=await state();check('Page one retains its independent edit history',Object.keys(s.runtime.points).length===pageOneCount&&s.historyIndex>0);
  await page.locator('#undo').click();check('Undo on page one does not change page two',Object.keys((await state()).runtime.points).length===4);
  await page.locator('#redo').click();await page.locator('#bundleNextBtn').click();await idle();

  const save=async(name,scope,cloud=false)=>{await page.locator('#exportJsonBtn').click();check('Multipage save offers current page and all pages',await page.locator('#cloudPageScopeRow').isVisible());await page.locator('#cloudPageScope').selectOption(scope);await page.locator('#cloudFilenameInput').fill(name);if(cloud)await page.locator('#cloudPanel [data-tab="cloud"]').click();await page.locator('#cloudSaveBtn').click();await page.waitForFunction(()=>document.getElementById('cloudPanel').style.display==='none');};
  await save('presentation','all');const allBytes=await page.evaluate(()=>window.__savedFiles['presentation.ctr']),saved=decode(allBytes);
  check('Local CTR contains every edited page and active page',saved.pages.length===2&&saved.activePage===1&&saved.pages[0].model.points.length===pageOneCount&&close(saved.pages[1].model.points.find(p=>p.id==='a'),moved));
  await save('current','current');const single=decode(await page.evaluate(()=>window.__savedFiles['current.ctr']));
  check('Current-page CTR remains a normal single-page document',!single.pages&&close(single.model.points.find(p=>p.id==='a'),moved));
  await save('cloud-presentation','all',true);check('Cloud saves the same complete CTR presentation',decode(cloudBytes).pages.length===2);
  await page.locator('#exportJsonBtn').click();await page.screenshot({path:path.join(output,'desktop-save-pages.png')});await page.locator('#cloudCloseBtn').click();

  await page.locator('#cloudFilesBtn').click();await page.locator('#localFileList [aria-label="Wczytaj presentation"]').click();await page.waitForFunction(()=>window.__loadedName==='presentation');s=await state();
  check('Opening the actual saved CTR restores multipage mode and active geometry',s.book.entries.length===2&&s.book.index===1&&close(s.runtime.points.a,moved));await page.locator('#cloudCloseBtn').click();
  await page.locator('#bundlePrevBtn').click();check('Loaded pages can be browsed independently',Object.keys((await state()).runtime.points).length===pageOneCount);
  await menu('#clearAll');s=await state();check('Trash removes the current page and shows the remaining page',s.book.entries.length===1&&close(s.runtime.points.a,moved));
  await menu('#clearAll');s=await state();check('Deleting the final page leaves an empty multipage canvas',s.book.entries.length===1&&Object.keys(s.runtime.points).length===0);
  await page.locator('#bundleNextBtn').click();check('An empty final page can also be cloned',(await state()).book.entries.length===2);
  await page.locator('#modeAdd').click();await click({x:150,y:300});await page.locator('#modeCircle').click();await click({x:150,y:300});
  page.once('dialog',dialog=>dialog.dismiss());await menu('#multipageDocumentBtn');check('Canceling the warning preserves all pages',(await state()).book.entries.length===2);
  page.once('dialog',dialog=>dialog.accept());await page.locator('#multipageDocumentBtn').click();s=await state();
  check('Accepting disable removes every page and clears undo history',s.book===null&&s.mode==='move'&&s.circleCenterId===null&&Object.keys(s.runtime.points).length===0&&s.historyIndex===0&&await page.locator('#bundleNextBtn').isHidden());
  await page.locator('#undo').click();check('Cleared pages cannot reappear through Undo',Object.keys((await state()).runtime.points).length===0);
  await page.locator('#exportJsonBtn').click();check('Single-page save hides the page scope',await page.locator('#cloudPageScopeRow').isHidden());await page.locator('#cloudCloseBtn').click();
  await page.locator('#cloudFilesBtn').click();await page.locator('#localFileList [aria-label="Wczytaj current"]').click();await page.waitForFunction(()=>window.__loadedName==='current');s=await state();check('Opening a single-page CTR turns off multipage mode',s.book===null&&close(s.runtime.points.a,moved));await page.locator('#cloudCloseBtn').click();

  const legacy=zipSync({'02.json':strToU8(JSON.stringify({...fixture(),measurementScale:2})),'01.json':strToU8(JSON.stringify(fixture()))});
  await page.evaluate(bytes=>{window.__savedFiles['legacy.ctr']=bytes;},Array.from(legacy));await idle();await page.locator('#cloudFilesBtn').click();await page.locator('#localFileList [aria-label="Wczytaj legacy"]').click();await page.waitForFunction(()=>window.__loadedName==='legacy');s=await state();check('Legacy multi-JSON archives open as editable pages',s.book.entries.length===2&&s.book.index===0);await page.locator('#cloudCloseBtn').click();

  await page.setViewportSize({width:390,height:844});await page.locator('#bundleNextBtn').click();await page.locator('#bundleNextBtn').tap();s=await state();
  check('Touch clones the final page at 390px',s.book.entries.length===3&&s.book.index===2);
  const controls=await page.locator('#bundleNextBtn').boundingBox(),menuBox=await page.locator('#zoomMenu').boundingBox();check('Mobile navigation is visible beside the file buttons',controls.x>=0&&controls.x+controls.width<=menuBox.x,controls);
  await page.screenshot({path:path.join(output,'mobile-pages.png')});await idle();await page.locator('#exportJsonBtn').tap();await page.screenshot({path:path.join(output,'mobile-save-pages.png')});
  check('Mobile save scope stays within the viewport',await page.locator('#cloudPageScope').isVisible()&&(await page.locator('#cloudPageScope').boundingBox()).x>=0);
  check('No browser exceptions',result.errors.length===0,result.errors);
 }catch(error){result.errors.push(error.stack||String(error));process.exitCode=1;}
 finally{await browser?.close();await server.close();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));}
 console.log(JSON.stringify({checks:result.checks.length,passed:result.checks.filter(c=>c.passed).length,errors:result.errors}));if(result.errors.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
