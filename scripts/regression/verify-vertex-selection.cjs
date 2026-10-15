const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const output=path.resolve(__dirname,'../../output/playwright/vertex-selection');fs.mkdirSync(output,{recursive:true});
const result={checks:[],errors:[]};const check=(name,passed,data)=>{result.checks.push({name,passed:!!passed,data});if(!passed)throw Error(name+': '+JSON.stringify(data));};
(async()=>{const {createServer}=await import('vite');const server=await createServer({server:{host:'127.0.0.1',port:5212,strictPort:true}});await server.listen();let browser;
try{browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
 for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1180,height:900},hasTouch:mobile,serviceWorkers:'block'});page.on('pageerror',e=>result.errors.push(e.message));
 await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\nwindow.__vertex={state:()=>({runtime,selectedSolidId,selectedPointId,historyIndex}),worldToCanvas,pointHit:findPoint,edgeHit:spatialEdgeAt,faces:id=>spatialFaces(runtime,id),faceHit:p=>hitSpatialFace(runtime,p,showHidden)};`});});
 await page.route('**/src/canvas/renderer.ts*',async route=>{const response=await route.fetch(),body=await response.text(),marker=/applySelectionStyle\(ctx,\s*2,\s*highlightColor,\s*true,\s*spatialIntensity\(p,\s*THEME\)\);/;if(!marker.test(body))throw Error('Point ring instrumentation marker missing');await route.fulfill({response,body:body.replace(marker,match=>'(globalThis.__vertexColors??={})[pointId]=highlightColor;'+match)});});
 await page.goto('http://127.0.0.1:5212/',{waitUntil:'networkidle'});if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
 const state=()=>page.evaluate(()=>window.__vertex.state());
 const click=async p=>{const q=await page.evaluate(p=>{const q=window.__vertex.worldToCanvas(p.x,p.y),r=document.getElementById('canvas').getBoundingClientRect();return{x:q.x+r.x,y:q.y+r.y};},p);if(mobile)await page.touchscreen.tap(q.x,q.y);else await page.mouse.click(q.x,q.y);};
 const select=async id=>{await click((await state()).runtime.points[id]);check('Real input selects the intended vertex',(await state()).selectedPointId===id,id);return page.evaluate(id=>window.__vertexColors[id],id);};
 const whole=async id=>{await click({x:25,y:300});const p=await page.evaluate(id=>{for(const f of window.__vertex.faces(id).filter(f=>f.visible)){for(let y=Math.min(...f.points.map(p=>p.y))+8;y<Math.max(...f.points.map(p=>p.y))-8;y+=4)for(let x=Math.min(...f.points.map(p=>p.x))+8;x<Math.max(...f.points.map(p=>p.x))-8;x+=4){const p={x,y};if(!window.__vertex.pointHit(p)&&!window.__vertex.edgeHit(p)&&window.__vertex.faceHit(p)?.solidId===id)return p;}}return null;},id);if(!p)throw Error('No solid target');await click(p);if(!await page.locator('#polygonLockToggleBtn').isVisible())await page.locator('#styleMenu').click();};
 for(const kind of ['prism','pyramid']){
 await page.locator(kind==='prism'?'#modePrism':'#modePyramid').click();await page.locator('#ngonInput').fill('4');await page.locator('#ngonConfirmBtn').click();await click({x:mobile?195:500,y:410});
 const s=await state(),id=s.selectedSolidId,solid=s.runtime.solids[id],base=solid.polyhedron.basePoints.find(id=>!s.runtime.points[id].spatialHiddenPoint),upper=solid.vertices.find(id=>!solid.polyhedron.basePoints.includes(id)&&!s.runtime.points[id].spatialHiddenPoint);
 check(kind+' locked base has the midpoint gray ring',await select(base)==='#9ca3af');check(kind+' upper vertex has the midpoint gray ring',await select(upper)==='#9ca3af');
 await whole(id);await page.locator('#polygonLockToggleBtn').click();
 const free=await select(base);check(kind+' unlocking shape changes the base ring to the free highlight',free!=='#9ca3af',free);
 check(kind+' unlocking shape leaves upper vertices gray',await select(upper)==='#9ca3af');
 await select(base);const before=await state(),p=before.runtime.points[base],screen=await page.evaluate(p=>{const q=window.__vertex.worldToCanvas(p.x,p.y),r=document.getElementById('canvas').getBoundingClientRect();return{x:q.x+r.x,y:q.y+r.y};},p);
 await page.mouse.move(screen.x,screen.y);await page.mouse.down();await page.mouse.move(screen.x+12,screen.y+4,{steps:8});await page.mouse.up();
 const after=await state();check(kind+' unlocked highlighted base vertex actually deforms',JSON.stringify(after.runtime.points[base].spatialPosition)!==JSON.stringify(p.spatialPosition));
 await whole(id);await page.locator('#polygonLockToggleBtn').click();check(kind+' relocking restores the gray ring',await select(base)==='#9ca3af');
 await page.locator('#undo').click();check(kind+' undo unlocks the base ring again',await select(base)!=='#9ca3af');await page.locator('#redo').click();check(kind+' redo restores the gray ring',await select(base)==='#9ca3af');
 await page.screenshot({path:path.join(output,(mobile?'mobile':'desktop')+'-'+kind+'.png')});
 // A fresh document avoids overlapping solids in the next case.
 await page.reload({waitUntil:'networkidle'});if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
 }
 await page.close();
 }
 check('No browser exceptions',result.errors.length===0,result.errors);
}catch(e){result.errors.push(e.stack||String(e));process.exitCode=1;}finally{await browser?.close();await server.close();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));}console.log(JSON.stringify({checks:result.checks.length,passed:result.checks.filter(c=>c.passed).length,errors:result.errors}));if(result.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
