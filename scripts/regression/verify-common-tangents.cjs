const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const out=path.resolve(__dirname,'../../output/playwright/common-tangents');fs.mkdirSync(out,{recursive:true});
const results={checks:[],errors:[]};
function check(name,passed,data){results.checks.push({name,passed:!!passed,data});if(!passed)throw Error(name+': '+JSON.stringify(data));}
const fixture=(equal=false,nested=false)=>({model:{points:[
  {id:'A',x:260,y:430},{id:'AR',x:260,y:510},{id:'B',x:nested?290:620,y:430},{id:'BR',x:nested?290:620,y:equal?510:550}
],circles:[
  {id:'first',center:'A',radius_point:'AR',circle_kind:'center-radius'},
  {id:'second',center:'B',radius_point:'BR',circle_kind:'center-radius'}
]}});
(async()=>{
 const {createServer}=await import('vite');const server=await createServer({server:{host:'127.0.0.1',port:5219,strictPort:true}});await server.listen();
 let browser,page;
 try{
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  page=await browser.newPage({viewport:{width:1100,height:850},hasTouch:true,serviceWorkers:'block'});
  page.on('pageerror',error=>results.errors.push(error.message));
  await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
   window.__tangents={load:applyPersistedDocument,save:serializeCurrentDocument,state:()=>({runtime,mode,historyIndex,tangentPendingCircle,tangentPendingPoint}),worldToCanvas,radius:id=>circleRadius(runtime.circles[id])};
  `});});
  await page.addInitScript(()=>localStorage.setItem('geometry.grid',JSON.stringify({visible:false})));
  await page.goto('http://127.0.0.1:5219/',{waitUntil:'networkidle'});if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
  const state=()=>page.evaluate(()=>window.__tangents.state());
  const load=doc=>page.evaluate(doc=>window.__tangents.load(doc),doc);
  const screen=p=>page.evaluate(p=>{const c=window.__tangents.worldToCanvas(p.x,p.y),r=document.getElementById('canvas').getBoundingClientRect();return{x:r.x+c.x,y:r.y+c.y};},p);
  const click=async(p,touch=false)=>{const q=await screen(p);if(await page.evaluate(q=>document.elementFromPoint(q.x,q.y)?.id,q)!=='canvas')throw Error('Obscured target '+JSON.stringify({p,q}));if(touch)await page.touchscreen.tap(q.x,q.y);else await page.mouse.click(q.x,q.y);};
  const tangentLines=s=>Object.values(s.runtime.lines).filter(l=>s.runtime.points[l.perpendicular?.throughPoint]?.commonTangent);
  const verify=async(name,expected=2)=>{
   const s=await state(),lines=tangentLines(s).filter(l=>l.geometryValid!==false),r=s.runtime;
   check(name+': expected tangent count',lines.length===expected,lines.map(l=>l.id));
   for(const line of lines){
    const [a,b]=line.defining_points.map(id=>r.points[id]),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    const circles=r.points[line.perpendicular.throughPoint].commonTangent.circles;
    for(const id of circles){const c=r.points[r.circles[id].center],radius=await page.evaluate(id=>window.__tangents.radius(id),id),distance=Math.abs((c.x-a.x)*dy-(c.y-a.y)*dx)/len;check(name+': tangent '+line.id+' touches '+id,Math.abs(distance-radius)<1e-5,{distance,radius});}
   }
   return lines;
  };
  const create=async(equal=false,touch=false)=>{
   await load(fixture(equal));await page.locator('#modeTangent').click();
   await click({x:340,y:430},touch);const before=await state();
   await click({x:340,y:430},touch);
   check('Repeated source circle creates no objects or history',Object.keys((await state()).runtime.lines).length===0&&(await state()).historyIndex===before.historyIndex);
   await click({x:equal?540:500,y:430},touch);
   const lines=await verify((touch?'Touch':'Mouse')+(equal?' equal radii':' unequal radii'));
   const s=await state();check('Common tangents add no auxiliary circle or radius lines',Object.keys(s.runtime.circles).length===2&&Object.keys(s.runtime.lines).length===2);
   check('Four visible contacts and two internal direction points',Object.values(s.runtime.points).filter(p=>p.commonTangent).length===4&&Object.values(s.runtime.points).filter(p=>p.auxiliaryFor).length===2);
   check('The pair is one history operation',s.historyIndex===before.historyIndex+1);
   return lines;
  };
  let lines=await create();
  await page.locator('#undo').click();check('Undo removes both tangents and their contacts',Object.keys((await state()).runtime.lines).length===0&&Object.keys((await state()).runtime.points).length===4);
  await page.locator('#redo').click();await verify('Redo');
  const drag=async(id,target)=>{await page.locator('#modeMove').click();const p=(await state()).runtime.points[id],from=await screen(p),to=await screen(target);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();const actual=(await state()).runtime.points[id];check('Input '+id+' actually moves',Math.hypot(actual.x-p.x,actual.y-p.y)>1,actual);};
  await drag('B',{x:650,y:400});await verify('Moved center');
  await drag('AR',{x:260,y:490});await verify('Changed radius');
  const snapshot=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__tangents.save())));await load(snapshot);lines=await verify('Native serialization and reload');
  const r=(await state()).runtime,first=lines[0],contact=r.points[first.perpendicular.throughPoint],other=Object.values(r.points).find(p=>p.commonTangent?.branch===contact.commonTangent.branch&&p.commonTangent?.contact===1);
  await page.locator('#modeMultiselect').click();await click({x:(contact.x+other.x)/2,y:(contact.y+other.y)/2});
  await page.locator('#multiCloneBtn').click();await page.locator('#multiCloneBtn').click();
  const copied=(await state()).runtime,copiedLine=tangentLines(await state()).find(l=>!lines.some(original=>original.id===l.id));
  check('Copy includes remapped contact and both source circles',!!copiedLine&&copied.points[copiedLine.perpendicular.throughPoint].commonTangent.circles.every(id=>!['first','second'].includes(id)),copiedLine);
  const copyPositions=JSON.stringify(copiedLine.defining_points.map(id=>copied.points[id]));
  await drag('AR',{x:260,y:480});
  const afterCopy=(await state()).runtime;
  check('Copied tangent is independent of original inputs',copyPositions===JSON.stringify(copiedLine.defining_points.map(id=>afterCopy.points[id])));
  await verify('Original and independent copy',3);
  await load(snapshot);await page.locator('#modeMove').click();
  const deletionState=(await state()).runtime,second=deletionState.circles.second,secondCenter=deletionState.points[second.center],secondRadius=await page.evaluate(()=>window.__tangents.radius('second'));
  await click({x:secondCenter.x-secondRadius,y:secondCenter.y});await page.locator('#deletePoint').click();
  check('Deleting the second source removes dependent contacts and tangents',tangentLines(await state()).length===0&&Object.values((await state()).runtime.points).every(p=>!p.commonTangent));
  const afterDeletion=(await state()).runtime;
  check('Source deletion leaves no orphan direction helpers',Object.values(afterDeletion.points).every(p=>!p.auxiliaryFor||afterDeletion.lines[p.auxiliaryFor]));
  await page.locator('#undo').click();await verify('Undo source deletion');
  await create(true);
  await load(fixture(false,true));await page.locator('#modeTangent').click();await click({x:340,y:430});await click({x:410,y:430});
  check('Contained circles create no spurious tangents or helper objects',Object.keys((await state()).runtime.lines).length===0&&Object.keys((await state()).runtime.points).length===4);
  await load(fixture());await page.locator('#modeMultiselect').click();await click({x:340,y:430});await click({x:500,y:430});await page.locator('#modeTangent').click();await verify('Two preselected circles');
  await page.screenshot({path:path.join(out,'desktop.png')});
  const withRadius=fixture();withRadius.model.lines=[{id:'radius-line',points:['A','AR']}];await load(withRadius);
  await page.locator('#modeTangent').click();await click({x:340,y:430});await click({x:500,y:430});await verify('Sources with an existing radius line');
  await page.locator('#modeMultiselect').click();await click({x:340,y:430});await page.locator('#deletePoint').click();
  check('Multiselect source deletion also removes tangents when source points remain in another line',tangentLines(await state()).length===0&&Object.values((await state()).runtime.points).every(p=>!p.commonTangent));
  const afterMultiDeletion=(await state()).runtime;
  check('Multiselect deletion leaves no orphan direction helpers',Object.values(afterMultiDeletion.points).every(p=>!p.auxiliaryFor||afterMultiDeletion.lines[p.auxiliaryFor]));
  await page.locator('#undo').click();await verify('Undo multiselect source deletion');
  await page.setViewportSize({width:390,height:844});await create(false,true);await create(true,true);
  await page.screenshot({path:path.join(out,'mobile.png')});
  check('No browser exceptions',results.errors.length===0,results.errors);
 }catch(error){results.errors.push(error.stack||String(error));process.exitCode=1;await page?.screenshot({path:path.join(out,'error.png')}).catch(()=>{});}
 finally{await browser?.close();await server.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
 console.log(JSON.stringify({checks:results.checks.length,passed:results.checks.filter(c=>c.passed).length,errors:results.errors}));if(results.errors.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
