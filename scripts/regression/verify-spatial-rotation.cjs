const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const output = path.resolve(__dirname, '../../output/playwright/spatial-rotation');
fs.mkdirSync(output, { recursive: true });
const result = { checks: [], errors: [] };
function check(name, passed, data) {
  result.checks.push({ name, passed: !!passed, data });
  if (!passed) throw new Error(name + ': ' + JSON.stringify(data));
}
(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5209, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
    const setup = async options => {
      const page = await browser.newPage({ serviceWorkers: 'block', ...options });
      page.on('pageerror', e => result.errors.push(e.message));
      await page.route('**/src/main.ts*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() + `\nwindow.__rotation={state:()=>({runtime,mode,selectedSolidId,selectedPointId,selectedLineId,selectedPolygonId,selectedSegments:[...selectedSegments],selectedLabel,menuOpen:styleMenuOpen,historyIndex,panOffset,zoomFactor}),worldToCanvas,handles:id=>spatialHandles(runtime,id,screenUnits(26)),faces:id=>spatialFaces(runtime,id),pointHit:findPoint,edgeHit:spatialEdgeAt,faceHit:p=>hitSpatialFace(runtime,p,showHidden),serialize:serializeCurrentDocument,load:applyPersistedDocument,setView:(zoom,pan)=>{zoomFactor=zoom;panOffset=pan;draw();},selectSolid:id=>{clearSelectionState();selectedSolidId=id;updateSelectionButtons();draw();}};` });
      });
      await page.goto('http://127.0.0.1:5209/', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__rotation);
      if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
      return page;
    };
    const state = page => page.evaluate(() => window.__rotation.state());
    const screen = (page, p) => page.evaluate(p => {
      const q = window.__rotation.worldToCanvas(p.x, p.y), r = document.getElementById('canvas').getBoundingClientRect();
      return { x: r.left+q.x, y: r.top+q.y };
    }, p);
    const click = async (page, p) => { const q = await screen(page, p); await page.mouse.click(q.x, q.y); };
    const handle = (page, id, axis) => page.evaluate(({ id, axis }) => window.__rotation.handles(id).find(h => axis === null ? h.kind === 'rotate' : h.kind === 'rotateAxis' && h.axis === axis), { id, axis });
    const drag = async (page, h, dx, dy) => {
      const p = await screen(page, h);
      await page.mouse.move(p.x, p.y); await page.mouse.down();
      await page.mouse.move(p.x+dx, p.y+dy, { steps: 10 }); await page.mouse.up();
    };
    const selection = s => JSON.stringify({ solid:s.selectedSolidId,point:s.selectedPointId,line:s.selectedLineId,polygon:s.selectedPolygonId,segments:s.selectedSegments,label:s.selectedLabel });
    const orientation = (s, id) => s.runtime.spatialGroups[s.runtime.solids[id].groupId].orientation;
    const geometry = s => JSON.stringify({ solids:s.runtime.solids, points:Object.values(s.runtime.points).map(p=>({id:p.id,spatial:p.spatial,position:p.spatialPosition,style:p.style,label:p.label})),lines:s.runtime.lines,polygons:s.runtime.polygons }, (key,value) => ['spatialHiddenEdge','solidBackFace'].includes(key) ? undefined : value);
    const testPanelMove = async (page,id,touch=false) => {
      if((await state(page)).selectedSolidId!==id)await selectFace(page,id);
      const label=touch?'Touch':'Mouse',before=await state(page),beforeHandles=await page.evaluate(id=>window.__rotation.handles(id),id);
      const mover=beforeHandles.find(h=>h.kind==='moveControls'),p=await screen(page,mover);
      const fixedGeometry=s=>JSON.stringify({model:JSON.parse(geometry(s)),groups:s.runtime.spatialGroups,positions:Object.values(s.runtime.points).map(p=>[p.id,p.x,p.y])},(key,value)=>key==='rotationControlOffset'?undefined:value);
      const close=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<1e-7;
      check(`${label} panel move handle is reachable`,await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.id==='canvas',p),p);
      await click(page,mover);
      check(`${label} clicking the panel move handle keeps selection and history`,selection(await state(page))===selection(before)&&(await state(page)).historyIndex===before.historyIndex);
      const dx=touch?30:-90,dy=-50;
      const cdp=touch?await page.context().newCDPSession(page):null;
      if(touch){
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:21,...p}]});
        for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:21,x:p.x+dx*step/8,y:p.y+dy*step/8}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      }else await drag(page,mover,dx,dy);
      const after=await state(page),moved=await page.evaluate(id=>window.__rotation.handles(id),id);
      check(`${label} moving the panel changes neither geometry nor selection`,fixedGeometry(after)===fixedGeometry(before)&&selection(after)===selection(before));
      check(`${label} all rotation controls and the move handle follow the drag`,moved.filter(h=>h.kind!=='scale').every(h=>{const old=beforeHandles.find(o=>o.kind===h.kind&&o.axis===h.axis);return close(h,{x:old.x+dx/before.zoomFactor,y:old.y+dy/before.zoomFactor});}),{beforeHandles,moved});
      check(`${label} moving the panel adds one history entry`,after.historyIndex===before.historyIndex+1);
      await page.locator('#undo').click();
      check(`${label} Undo restores panel placement`,JSON.stringify(await page.evaluate(id=>window.__rotation.handles(id),id))===JSON.stringify(beforeHandles));
      await page.locator('#redo').click();
      check(`${label} Redo restores panel placement`,JSON.stringify(await page.evaluate(id=>window.__rotation.handles(id),id))===JSON.stringify(moved));
      // Undo/Redo clears the application's selection; expose the controls again.
      if((await state(page)).selectedSolidId!==id)await selectFace(page,id);
      if(touch){
        const start=await screen(page,moved.find(h=>h.kind==='moveControls')),saved=await state(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:22,...start}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:22,x:start.x-20,y:start.y-20}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
        check('Cancelling panel movement restores placement, selection and history',JSON.stringify(await page.evaluate(id=>window.__rotation.handles(id),id))===JSON.stringify(moved)&&selection(await state(page))===selection(saved)&&(await state(page)).historyIndex===saved.historyIndex);
      }
      const document=await page.evaluate(()=>window.__rotation.serialize());
      await page.evaluate(({document,id})=>{window.__rotation.load(document);window.__rotation.selectSolid(id);},{document,id});
      check(`${label} native reload retains the saved panel offset`,JSON.stringify((await state(page)).runtime.solids[id].rotationControlOffset)===JSON.stringify(document.model.solids[id].rotationControlOffset));
      // Loading fits the camera to the construction. Compare positions at the same zoom.
      await page.evaluate(({zoom,pan})=>window.__rotation.setView(zoom,pan),{zoom:after.zoomFactor,pan:after.panOffset});
      const reloaded=await page.evaluate(id=>window.__rotation.handles(id),id);
      check(`${label} native reload keeps the moved panel placement`,JSON.stringify(reloaded)===JSON.stringify(moved),{moved,reloaded});
      const rotationBefore=orientation(await state(page),id);
      await drag(page,await handle(page,id,null),12,5);
      check(`${label} relocated rotation control remains usable`,JSON.stringify(orientation(await state(page),id))!==JSON.stringify(rotationBefore));
      await page.screenshot({path:path.join(output,touch?'mobile-moved-panel.png':'desktop-moved-panel.png')});
    };
    const create = async (page, kind, sides, position) => {
      await page.locator(kind === 'prism' ? '#modePrism' : '#modePyramid').click();
      await page.locator('#ngonInput').fill(String(sides)); await page.locator('#ngonConfirmBtn').click();
      const p = await screen(page, position); await page.mouse.click(p.x, p.y);
      const s = await state(page), id = s.selectedSolidId;
      check(`UI creates ${sides}-sided ${kind}`, !!id && s.runtime.solids[id].polyhedron?.kind === kind);
      return id;
    };
    const faceTarget = (page, id, polygonId) => page.evaluate(({id,polygonId}) => {
      for (const f of window.__rotation.faces(id).filter(f => f.visible && (!polygonId || f.polygonId === polygonId))) {
        const minX=Math.min(...f.points.map(p=>p.x)),maxX=Math.max(...f.points.map(p=>p.x)),minY=Math.min(...f.points.map(p=>p.y)),maxY=Math.max(...f.points.map(p=>p.y));
        for(let y=minY+8;y<maxY-8;y+=6)for(let x=minX+8;x<maxX-8;x+=6){
          const p={x,y},c=window.__rotation.worldToCanvas(x,y),r=document.getElementById('canvas').getBoundingClientRect();
          if(document.elementFromPoint(r.left+c.x,r.top+c.y)?.id==='canvas'&&!window.__rotation.pointHit(p)&&!window.__rotation.edgeHit(p)&&window.__rotation.faceHit(p)?.polygonId===f.polygonId)return{...p,polygonId:f.polygonId};
        }
      }
      return null;
    }, {id,polygonId});
    const selectFace = async (page, id, polygonId) => {
      const p = await faceTarget(page,id,polygonId); if (!p) throw new Error('No selectable face '+polygonId);
      for(let n=0;n<3&&(await state(page)).selectedPolygonId!==p.polygonId;n++)await click(page,p);
      check('Face is selected through real hit testing',(await state(page)).selectedPolygonId===p.polygonId,p);
      return p.polygonId;
    };
    const page=await setup({viewport:{width:1340,height:1000}});
    const id=await create(page,'prism',4,{x:650,y:460});
    // Turn the prism over so the lower base itself can be selected.
    await drag(page,await handle(page,id,null),0,220);
    const baseId=(await state(page)).runtime.solids[id].faces[0];
    await selectFace(page,id,baseId);
    if(!(await state(page)).menuOpen)await page.locator('#styleMenu').click();
    for(const axis of [null,0,1,2]){
      let before=await state(page),saved=selection(before),h=await handle(page,id,axis);
      await click(page,h);let after=await state(page);
      check(`Click rotation ${axis??'free'} keeps selected base and style menu`,selection(after)===saved&&after.menuOpen&&!await page.locator('#solidTiltLockBtn').isVisible(),{before:saved,after:selection(after)});
      check(`Single click rotation ${axis??'free'} creates no history`,after.historyIndex===before.historyIndex);
      const model=geometry(after),oldOrientation=orientation(after,id);
      const stationaryPlanes=await page.evaluate(id=>window.__rotation.handles(id).filter(h=>h.kind==='rotateAxis'),id);
      await drag(page,await handle(page,id,axis),21,9);after=await state(page);
      check(`Drag rotation ${axis??'free'} keeps selected base`,selection(after)===saved&&after.menuOpen&&!await page.locator('#solidTiltLockBtn').isVisible());
      check(`Rotation ${axis??'free'} keeps all three plane handles stationary`,JSON.stringify(await page.evaluate(id=>window.__rotation.handles(id).filter(h=>h.kind==='rotateAxis'),id))===JSON.stringify(stationaryPlanes));
      check(`Drag rotation ${axis??'free'} changes only view and adds one history entry`,JSON.stringify(orientation(after,id))!==JSON.stringify(oldOrientation)&&geometry(after)===model&&after.historyIndex===before.historyIndex+1);
    }
    // Vertex and edge selections, including the exact segment, survive rotation too.
    const vertex=await page.evaluate(id=>window.__rotation.state().runtime.solids[id].vertices.find(id=>window.__rotation.pointHit(window.__rotation.state().runtime.points[id])===id),id);
    await click(page,(await state(page)).runtime.points[vertex]);
    let before=await state(page);check('A vertex is selected',before.selectedPointId===vertex);
    await drag(page,await handle(page,id,1),18,7);
    check('Axis rotation retains the selected vertex',selection(await state(page))===selection(before));
    const edge=await page.evaluate(id=>{const s=window.__rotation.state();for(const lineId of s.runtime.solids[id].edges){const l=s.runtime.lines[lineId],[a,b]=l.defining_points.map(id=>s.runtime.points[id]);const p={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(window.__rotation.edgeHit(p)?.lineId===lineId&&!window.__rotation.pointHit(p))return{...p,lineId};}return null;},id);
    if(!edge)throw new Error('No selectable edge');
    for(let n=0;n<4&&(await state(page)).selectedLineId!==edge.lineId;n++)await click(page,edge);
    before=await state(page);check('An edge segment is selected',before.selectedLineId===edge.lineId&&before.selectedSegments.length>0);
    await drag(page,await handle(page,id,null),18,7);
    check('Free rotation retains the exact selected edge segment',selection(await state(page))===selection(before));
    const savedSelection=selection(await state(page)),model=geometry(await state(page));
    for(const axis of [0,1]){
      before=await state(page);const h=await handle(page,id,axis),p=await screen(page,h);
      await page.mouse.dblclick(p.x,p.y,{delay:axis===0?430:60});
      const after=await state(page);
      check(`Double-click axis ${axis} keeps component selection`,selection(after)===savedSelection);
      const old=orientation(before,id),m=orientation(after,id),changed=JSON.stringify(m)!==JSON.stringify(old);
      check(`Double-click axis ${axis} aligns its component with one history step`,Math.abs(m[axis===0?4:3])<1e-8&&m[5]<0&&after.historyIndex===before.historyIndex+(changed?1:0));
      check(`Double-click axis ${axis} rotates only its own local axis`,[axis,axis+3,axis+6].every(i=>m[i]===old[i]));
      const again=await screen(page,await handle(page,id,axis));await page.mouse.dblclick(again.x,again.y,{delay:60});
      check(`Repeating axis ${axis} alignment adds no history`,(await state(page)).historyIndex===after.historyIndex);
      check(`Double-click axis ${axis} preserves all construction definitions`,geometry(after)===model);
    }
    const sideView=orientation(await state(page),id);
    check('Both alignments produce an upright side view with the base horizontal',Math.abs(sideView[2])<1e-8&&Math.abs(sideView[5]+1)<1e-8&&Math.abs(sideView[8])<1e-8);
    before=await state(page);const blue=await screen(page,await handle(page,id,2));await page.mouse.dblclick(blue.x,blue.y,{delay:60});
    check('Blue double-click leaves view, history and selection unchanged',JSON.stringify(orientation(await state(page),id))===JSON.stringify(orientation(before,id))&&(await state(page)).historyIndex===before.historyIndex&&selection(await state(page))===selection(before));
    await page.screenshot({path:path.join(output,'desktop-rotation-selection.png')});
    const pyramidId=await create(page,'pyramid',5,{x:920,y:420});
    await selectFace(page,pyramidId);
    before=await state(page);const ph=await screen(page,await handle(page,pyramidId,0));
    await page.mouse.dblclick(ph.x,ph.y,{delay:60});
    const partial=await state(page),partialView=orientation(partial,pyramidId);
    check('Pyramid red double-click retains its face and only partially aligns the view',selection(partial)===selection(before)&&Math.abs(partialView[4])<1e-8&&Math.abs(partialView[8])>.1&&partial.historyIndex===before.historyIndex+1);
    before=await state(page);
    const canonicalTarget=await screen(page,await handle(page,pyramidId,null)),canonicalModel=geometry(before);
    await page.mouse.dblclick(canonicalTarget.x,canonicalTarget.y,{delay:430});
    let canonical=await state(page),canonicalView=orientation(canonical,pyramidId);
    check('Yellow control double-click retains the selected pyramid face',selection(canonical)===selection(before));
    check('Yellow control restores a three-quarter view with one history entry',Math.abs(canonicalView[8]-.5)<1e-8&&Math.abs(canonicalView[5]+Math.sqrt(3)/2)<1e-8&&canonical.historyIndex===before.historyIndex+1);
    check('Canonical view preserves construction definitions and dimensions',geometry(canonical)===canonicalModel);
    const repeat=await screen(page,await handle(page,pyramidId,null));
    await page.mouse.dblclick(repeat.x,repeat.y,{delay:60});
    check('Repeated canonical view adds no empty history entry',(await state(page)).historyIndex===canonical.historyIndex);
    await page.locator('#undo').click();
    check('Undo canonical view restores the preceding orientation',JSON.stringify(orientation(await state(page),pyramidId))===JSON.stringify(orientation(before,pyramidId)));
    await page.locator('#redo').click();
    check('Redo restores the canonical view',JSON.stringify(orientation(await state(page),pyramidId))===JSON.stringify(canonicalView));
    await page.screenshot({path:path.join(output,'desktop-canonical-view.png')});
    await testPanelMove(page,pyramidId);
    await page.close();

    const mobile=await setup({viewport:{width:390,height:844},hasTouch:true});
    const mobileId=await create(mobile,'pyramid',4,{x:195,y:400});
    const mobileVertex=(await state(mobile)).runtime.solids[mobileId].vertices[4];
    let p=await screen(mobile,(await state(mobile)).runtime.points[mobileVertex]);
    await mobile.touchscreen.tap(p.x,p.y);
    before=await state(mobile);check('Touch selects the pyramid apex',before.selectedPointId===mobileVertex);
    for(const axis of [0,1]){
      const h=await handle(mobile,mobileId,axis);p=await screen(mobile,h);before=await state(mobile);
      check(`Mobile axis ${axis} control is exposed`,await mobile.evaluate(p=>document.elementFromPoint(p.x,p.y)?.id==='canvas',p),p);
      await mobile.touchscreen.tap(p.x,p.y);await mobile.touchscreen.tap(p.x,p.y);
      const after=await state(mobile);
      check(`Double-tap axis ${axis} keeps the apex selected`,selection(after)===selection(before));
      const m=orientation(after,mobileId),old=orientation(before,mobileId);
      check(`Double-tap axis ${axis} aligns only its axis with one history step`,Math.abs(m[axis===0?4:3])<1e-8&&[axis,axis+3,axis+6].every(i=>m[i]===old[i])&&after.historyIndex===before.historyIndex+1);
    }
    const mobileSide=orientation(await state(mobile),mobileId);
    check('Both touch alignments reach a side view',Math.abs(mobileSide[5]+1)<1e-8&&Math.abs(mobileSide[8])<1e-8);
    const mobilePlanes=await mobile.evaluate(id=>window.__rotation.handles(id),mobileId);
    check('Yellow is inside the three-axis triangle with separate touch targets',await mobile.evaluate(hs=>{const y=hs.find(h=>h.kind==='rotate'),ps=hs.filter(h=>h.kind==='rotateAxis');const crosses=ps.map((a,i)=>{const b=ps[(i+1)%3];return(b.x-a.x)*(y.y-a.y)-(b.y-a.y)*(y.x-a.x);});return(crosses.every(c=>c>0)||crosses.every(c=>c<0))&&ps.every(h=>Math.hypot(h.x-y.x,h.y-y.y)>=40);},mobilePlanes));
    before=await state(mobile);
    const cdp=await mobile.context().newCDPSession(mobile),target=await screen(mobile,await handle(mobile,mobileId,null));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:11,...target}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:11,x:target.x+25,y:target.y+20}]});
    check('Touch rotation starts without changing apex selection',selection(await state(mobile))===selection(before)&&JSON.stringify(orientation(await state(mobile),mobileId))!==JSON.stringify(orientation(before,mobileId)));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    const cancelled=await state(mobile);
    check('Cancelled touch rotation restores view, selection and history',selection(cancelled)===selection(before)&&JSON.stringify(orientation(cancelled,mobileId))===JSON.stringify(orientation(before,mobileId))&&cancelled.historyIndex===before.historyIndex);
    const touchPlanes=await mobile.evaluate(id=>window.__rotation.handles(id).filter(h=>h.kind==='rotateAxis'),mobileId);
    check('Mobile grouped planes remain inside the canvas',await mobile.evaluate(planes=>{const r=document.getElementById('canvas').getBoundingClientRect();return planes.every(h=>{const p=window.__rotation.worldToCanvas(h.x,h.y);return p.x>=20&&p.x<=r.width-20&&document.elementFromPoint(r.left+p.x,r.top+p.y)?.id==='canvas';});},touchPlanes),touchPlanes);
    await mobile.screenshot({path:path.join(output,'mobile-rotation-selection.png')});
    before=await state(mobile);
    const yellow=await screen(mobile,await handle(mobile,mobileId,null));
    await mobile.touchscreen.tap(yellow.x,yellow.y);await mobile.touchscreen.tap(yellow.x,yellow.y);
    canonical=await state(mobile);canonicalView=orientation(canonical,mobileId);
    check('Yellow control double-tap retains the apex selection',selection(canonical)===selection(before));
    check('Yellow control double-tap restores the three-quarter view once',Math.abs(canonicalView[8]-.5)<1e-8&&Math.abs(canonicalView[5]+Math.sqrt(3)/2)<1e-8&&canonical.historyIndex===before.historyIndex+1);
    check('Mobile canonical view preserves true geometry',geometry(canonical)===geometry(before));
    await mobile.screenshot({path:path.join(output,'mobile-canonical-view.png')});
    await testPanelMove(mobile,mobileId,true);
    await mobile.close();
    check('No browser exceptions',result.errors.length===0,result.errors);
  }catch(error){result.errors.push(error.stack||String(error));process.exitCode=1;}
  finally{await browser?.close();await server.close();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));}
  console.log(JSON.stringify({checks:result.checks.length,passed:result.checks.filter(c=>c.passed).length,errors:result.errors}));
  if(result.errors.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
