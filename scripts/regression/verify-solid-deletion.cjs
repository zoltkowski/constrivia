const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const output=path.resolve(__dirname,'../../output/playwright/solid-deletion');
fs.mkdirSync(output,{recursive:true});
const results={checks:[],errors:[]};
const check=(name,passed)=>{results.checks.push({name,passed:!!passed});if(!passed)throw new Error(name);};
(async()=>{
  const {createServer}=await import('vite');
  const server=await createServer({server:{host:'127.0.0.1',port:5201,strictPort:true}});await server.listen();
  let browser;
  try{
    browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
    for(const scenario of [{kind:'cube',tool:'Prism',sides:4},{kind:'prism',tool:'Prism',sides:3},{kind:'pyramid',tool:'Pyramid',sides:4}]){
      const {kind,tool,sides}=scenario;
      const page=await browser.newPage({viewport:{width:1180,height:850},serviceWorkers:'block'});
      page.on('pageerror',e=>results.errors.push(e.message));
      await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
window.__deleteSolid={state:()=>({runtime,whole:wholeSpatialSolid()?.id,selectedSolidId,selectedPointId}),worldToCanvas,faces:id=>spatialFaces(runtime,id),faceHit:p=>hitSpatialFace(runtime,p),pointHit:p=>findPoint(p),edgeHit:p=>spatialEdgeAt(p)};`});});
      await page.goto('http://127.0.0.1:5201/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__deleteSolid);
      if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
      const click=async p=>{const q=await page.evaluate(p=>{const r=document.getElementById('canvas').getBoundingClientRect(),q=window.__deleteSolid.worldToCanvas(p.x,p.y);return{x:r.left+q.x,y:r.top+q.y};},p);await page.mouse.click(q.x,q.y);};
      const state=()=>page.evaluate(()=>window.__deleteSolid.state());
      await page.locator('#modeAdd').click();await click({x:850,y:550});
      const pointId=Object.keys((await state()).runtime.points)[0];
      await page.locator(`#mode${tool}`).click();
      if(await page.locator('#ngonModal').isVisible()){await page.locator('#ngonInput').fill(String(sides));await page.locator('#ngonConfirmBtn').click();}
      await click({x:430,y:350});
      let s=await state();const solidId=Object.keys(s.runtime.solids)[0];
      check(`${kind}: creation selects the complete solid`,s.whole===solidId);
      check(`${kind}: trash is visible for a whole solid`,await page.locator('#deletePoint').isVisible());
      await page.locator('#modeMove').click();await click({x:950,y:200});
      const face=await page.evaluate(id=>{
        for(const f of window.__deleteSolid.faces(id).filter(f=>f.visible)){
          const xs=f.points.map(p=>p.x),ys=f.points.map(p=>p.y);
          for(let i=1;i<12;i++)for(let j=1;j<12;j++){
            const p={x:Math.min(...xs)+(Math.max(...xs)-Math.min(...xs))*i/12,y:Math.min(...ys)+(Math.max(...ys)-Math.min(...ys))*j/12};
            if(window.__deleteSolid.faceHit(p)?.solidId===id&&!window.__deleteSolid.pointHit(p)&&!window.__deleteSolid.edgeHit(p))return{center:p};
          }
        }return null;
      },solidId);
      if(!face)throw new Error(`No unobscured face for ${kind}`);
      await click(face.center);s=await state();
      check(`${kind}: clicking the body selects the whole solid and shows trash`,s.whole===solidId&&await page.locator('#deletePoint').isVisible());
      await page.locator('#deletePoint').click();s=await state();
      check(`${kind}: trash removes all geometry of the solid`,Object.keys(s.runtime.solids).length===0&&Object.keys(s.runtime.spatialGroups).length===0&&Object.keys(s.runtime.lines).length===0&&Object.keys(s.runtime.polygons).length===0&&Object.keys(s.runtime.points).length===1);
      check(`${kind}: an independent 2D point survives and trash hides`,!!s.runtime.points[pointId]&&!await page.locator('#deletePoint').isVisible());
      await page.locator('#undo').click();s=await state();
      check(`${kind}: undo restores the solid`,!!s.runtime.solids[solidId]&&!!s.runtime.points[pointId]&&Object.keys(s.runtime.points).length>1);
      await page.locator('#redo').click();s=await state();
      check(`${kind}: redo removes it again without removing other objects`,!s.runtime.solids[solidId]&&!!s.runtime.points[pointId]);
      await page.close();
    }
  }catch(error){results.errors.push(error.stack||String(error));process.exitCode=1;}
  finally{await browser?.close();await server.close();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));}
  console.log(JSON.stringify(results));if(results.errors.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
