const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const output = path.resolve(__dirname, '../../output/playwright/spatial-ux');
fs.mkdirSync(output, { recursive: true });
const results = { checks: [], errors: [] };
const check = (name, passed, observed) => {
  results.checks.push({ name, passed: !!passed, observed });
  if (!passed) throw new Error(`${name}: ${JSON.stringify(observed)}`);
};

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5202, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1180, height: 850 }, serviceWorkers: 'block' });
    page.on('pageerror', error => results.errors.push(error.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}\nwindow.__spatialUX={state:()=>({runtime,mode,selectedSolidId,selectedPointId,selectedLineId,selectedPolygonId,selectedSegments:[...selectedSegments],menuOpen:styleMenuOpen,selectionVertices,selectionEdges,panOffset:{...panOffset},zoomFactor,selectedLabel}),worldToCanvas,handles:id=>spatialHandles(runtime,id,screenUnits(26)),faces:id=>spatialFaces(runtime,id),faceHit:p=>hitSpatialFace(runtime,p,showHidden),pointHit:p=>findPoint(p),edgeHit:p=>spatialEdgeAt(p),whole:()=>wholeSpatialSolid()?.id};` });
    });
    await page.goto('http://127.0.0.1:5202/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__spatialUX);
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
    const state = () => page.evaluate(() => window.__spatialUX.state());
    const handleScreen = async handle => {
      const rect = await page.locator('#canvas').boundingBox();
      return { x: rect.x + handle.x, y: rect.y + handle.y };
    };
    const gesture = async (from, to) => {
      const a = await handleScreen(from), b = await handleScreen(to);
      await page.mouse.move(a.x, a.y); await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up();
    };
    await page.locator('#modePrism').click();
    if (await page.locator('#ngonModal').isVisible()) {
      await page.locator('#ngonInput').fill('4'); await page.locator('#ngonConfirmBtn').click();
    }
    const rect = await page.locator('#canvas').boundingBox();
    await page.mouse.click(rect.x + rect.width * .52, rect.y + rect.height * .48);
    let s = await state();
    const id = s.selectedSolidId, solid = s.runtime.solids[id], group = s.runtime.spatialGroups[solid.groupId];
    check('Four-side Prism creates a cube-shaped prism', !!solid && solid.polyhedron?.kind === 'prism' && solid.polyhedron.basePoints?.length === 4 && Math.abs(solid.size.x - solid.size.z) < 1e-6 && Math.abs(solid.size.y - solid.size.z) < 1e-6,
      solid && { kind: solid.polyhedron?.kind, basePointCount: solid.polyhedron?.basePoints?.length, size: solid.size });
    check('Default square prism identifies three rear edges and one rear vertex for reduced intensity',
      solid.edges.filter(e=>s.runtime.lines[e].spatialHiddenEdge).length===3&&solid.vertices.filter(p=>s.runtime.points[p].spatialHiddenPoint).length===1,
      {edges:solid.edges.filter(e=>s.runtime.lines[e].spatialHiddenEdge),vertices:solid.vertices.filter(p=>s.runtime.points[p].spatialHiddenPoint)});
    check('Custom color slider is labeled intensity',await page.locator('label[for="customColorAlpha"]').textContent()==='Intensywność',await page.locator('label[for="customColorAlpha"]').textContent());
    await page.locator('#modeMove').click();
    const handles = () => page.evaluate(solidId => window.__spatialUX.handles(solidId), id);
    let hs = await handles();
    check('Whole-solid selection exposes free rotate, three axis rotate, and scale handles',
      ['rotate', 'scale'].every(kind => hs.some(h => h.kind === kind)) && [0, 1, 2].every(axis => hs.some(h => h.kind === 'rotateAxis' && h.axis === axis)), hs);
    const edgeLengths = async solidId => page.evaluate(solidId => {
      const s = window.__spatialUX.state(), so = s.runtime.solids[solidId], base = so.polyhedron.basePoints;
      const pos = pid => s.runtime.points[pid].spatialPosition;
      const dist = (a,b) => Math.hypot(pos(a).x-pos(b).x,pos(a).y-pos(b).y,pos(a).z-pos(b).z);
      return [dist(base[0],base[1]),dist(base[1],base[2]),dist(base[0],so.vertices[base.length]),dist(so.vertices[base.length],so.vertices[base.length+1])];
    }, solidId);
    const initialOrientation = [...group.orientation], initialEdgeLengths = await edgeLengths(id);
    for (const axis of [0,1,2]) {
      const before = [...(await state()).runtime.spatialGroups[solid.groupId].orientation];
      hs = await handles(); const axisHandle = hs.find(h => h.kind === 'rotateAxis' && h.axis === axis);
      check(`Axis ${axis} rotate handle is available`, !!axisHandle, axisHandle);
      await gesture(axisHandle, { x: axisHandle.x + 21 + axis * 3, y: axisHandle.y + 29 });
      s = await state();
      const lengths = await edgeLengths(id);
      check(`Axis ${axis} rotate changes orientation and preserves true 3D edge lengths`,
        JSON.stringify(s.runtime.spatialGroups[solid.groupId].orientation) !== JSON.stringify(before) && lengths.every((v,i)=>Math.abs(v-initialEdgeLengths[i])<1e-5), {before,after:s.runtime.spatialGroups[solid.groupId].orientation,lengths,initialEdgeLengths});
    }
    await page.locator('#undo').click(); await page.locator('#undo').click(); await page.locator('#undo').click();
    check('Undo restores all three axis rotations', JSON.stringify((await state()).runtime.spatialGroups[solid.groupId].orientation) === JSON.stringify(initialOrientation), null);
    await page.locator('#redo').click(); await page.locator('#redo').click(); await page.locator('#redo').click();
    check('Redo reapplies all three axis rotations', JSON.stringify((await state()).runtime.spatialGroups[solid.groupId].orientation) !== JSON.stringify(initialOrientation), null);

    // History restoration clears selection; select a visible face again before testing its handles.
    let visibleFace = await page.evaluate(solidId => {
      const face=window.__spatialUX.faces(solidId).find(f=>f.visible),p={x:face.points.reduce((v,q)=>v+q.x,0)/face.points.length,y:face.points.reduce((v,q)=>v+q.y,0)/face.points.length};
      const c=window.__spatialUX.worldToCanvas(p.x,p.y);return {...c,faceCenter:p,hit:window.__spatialUX.faceHit(p)};
    },id);
    check('A visible cube face can be targeted after history restoration',!!visibleFace?.hit,visibleFace);
    let canvasBox = await page.locator('#canvas').boundingBox();
    await page.mouse.click(canvasBox.x+visibleFace.x,canvasBox.y+visibleFace.y);
    s=await state();
    check('Whole solid is selected again after undo and redo before scaling',s.selectedSolidId===id&&await page.evaluate(()=>window.__spatialUX.whole())===id,s);
    hs = await handles();
    const beforeScale = await edgeLengths(id);
    const scale = hs.find(h => h.kind === 'scale');
    const scaleTarget=await page.evaluate(h=>{const r=document.getElementById('canvas').getBoundingClientRect();return{tag:document.elementFromPoint(r.left+h.x,r.top+h.y)?.id,canvas:document.elementFromPoint(r.left+h.x,r.top+h.y)===document.getElementById('canvas')};},scale);
    check('Scale handle is a real unobscured canvas target',!!scale&&scaleTarget.canvas,scaleTarget);
    await gesture(scale, { x: scale.x + 28, y: scale.y + 20 });
    s = await state();
    const afterScale = await edgeLengths(id);
    check('Scale handle changes true spatial edge lengths uniformly',
      afterScale.every((v,i)=>Math.abs(v-beforeScale[i])>1) && afterScale.every(v=>Math.abs(v/afterScale[0]-1)<1e-5),
      { before: beforeScale, after: afterScale, metadataSize:s.runtime.solids[id].size,selection:{solid:s.selectedSolidId,whole:await page.evaluate(()=>window.__spatialUX.whole())},scaleTarget });

    // The menu must remain open while its view filters and solid locks are used.
    await page.locator('#styleMenu').click();
    for (const selector of ['#viewVerticesOption', '#viewEdgesOption']) {
      check(`${selector} exists and is visible in the open style menu`, await page.locator(selector).isVisible(), await state());
      const before = await state();
      await page.locator(selector).click(); const after = await state();
      check(`${selector} changes its filter flag and keeps the style menu open`, before.selectionVertices!==after.selectionVertices || before.selectionEdges!==after.selectionEdges,
        {before:{vertices:before.selectionVertices,edges:before.selectionEdges},after:{vertices:after.selectionVertices,edges:after.selectionEdges},menuOpen:after.menuOpen});
      check(`${selector} menu remains open`, after.menuOpen && await page.locator('#styleMenuContainer').isVisible(), after);
    }
    // Vertices-only styling must not recolor edges; edges-only styling must not recolor vertices.
    s=await state();
    check('Vertex style test is in vertices-only filter mode',s.selectionVertices&&!s.selectionEdges,s);
    let colorState = await page.evaluate(solidId => { const s=window.__spatialUX.state(),so=s.runtime.solids[solidId]; return {point:s.runtime.points[so.vertices[0]].style.color,line:s.runtime.lines[so.edges[0]].style.color}; }, id);
    await page.locator('#styleColor').evaluate(el=>{el.value='#e12345';el.dispatchEvent(new Event('input',{bubbles:true}));});
    let colorAfterVertices = await page.evaluate(solidId => { const s=window.__spatialUX.state(),so=s.runtime.solids[solidId]; return {point:s.runtime.points[so.vertices[0]].style.color,line:s.runtime.lines[so.edges[0]].style.color}; }, id);
    check('Vertices-only color changes vertices while leaving edge style unchanged', colorAfterVertices.point==='#e12345'&&colorAfterVertices.line===colorState.line,{before:colorState,after:colorAfterVertices});
    await page.locator('#viewVerticesOption').click(); // vertices only -> edges only
    s=await state();check('Edge style test is in edges-only filter mode',!s.selectionVertices&&s.selectionEdges,s);
    await page.locator('#styleColor').evaluate(el=>{el.value='#1e73d8';el.dispatchEvent(new Event('input',{bubbles:true}));});
    let colorAfterEdges = await page.evaluate(solidId => { const s=window.__spatialUX.state(),so=s.runtime.solids[solidId]; return {point:s.runtime.points[so.vertices[0]].style.color,line:s.runtime.lines[so.edges[0]].style.color}; }, id);
    check('Edges-only color changes edges while leaving vertex style unchanged', colorAfterEdges.point===colorAfterVertices.point&&colorAfterEdges.line==='#1e73d8',{before:colorAfterVertices,after:colorAfterEdges});
    check('Whole-solid selection exposes both shape and tilt locks', await page.locator('#polygonLockToggleBtn').isVisible() && await page.locator('#solidTiltLockBtn').isVisible(), null);
    // Use a pyramid apex, whose actual drag edits its height and lateral offset.
    await page.locator('#modePyramid').click();
    if(await page.locator('#ngonModal').isVisible()){await page.locator('#ngonInput').fill('4');await page.locator('#ngonConfirmBtn').click();}
    const pr=await page.locator('#canvas').boundingBox(); await page.mouse.click(pr.x+pr.width*.78,pr.y+pr.height*.46);
    s=await state(); const pyramidId=s.selectedSolidId, pyramid=s.runtime.solids[pyramidId], apexId=pyramid.vertices.find(pid=>!pyramid.polyhedron.basePoints.includes(pid));
    check('Fresh pyramid selection exposes its active tilt lock',s.selectedSolidId===pyramidId&&await page.locator('#solidTiltLockBtn').isVisible()&&await page.locator('#solidTiltLockBtn').getAttribute('aria-pressed')==='true',s);
    await page.locator('#solidTiltLockBtn').click();
    check('Unlocking tilt preserves the open style menu', (await state()).menuOpen&&await page.locator('#styleMenuContainer').isVisible(), await state());
    await page.locator('#modeMove').click();
    const apexPosition=async()=>page.evaluate(pid=>{const p=window.__spatialUX.state().runtime.points[pid];return window.__spatialUX.worldToCanvas(p.x,p.y);},apexId);
    const apex=await apexPosition(), canvas=await page.locator('#canvas').boundingBox();
    await page.mouse.click(canvas.x+apex.x,canvas.y+apex.y);
    await page.mouse.move(canvas.x+apex.x,canvas.y+apex.y);await page.mouse.down();await page.mouse.move(canvas.x+apex.x+44,canvas.y+apex.y+31,{steps:10});await page.mouse.up();
    let tilted=await page.evaluate(solidId=>{const s=window.__spatialUX.state(),d=s.runtime.solids[solidId].polyhedron;return{offset:{...d.offset},height:d.height,coords:s.runtime.solids[solidId].vertices.map(pid=>({...s.runtime.points[pid].spatialPosition}))};},pyramidId);
    check('Dragging the pyramid apex creates a nonzero tilt before relocking',Math.hypot(tilted.offset.x,tilted.offset.y,tilted.offset.z)>1,tilted);
    const beforeRelock=tilted;
    const pyramidFace=await page.evaluate(solidId=>{const f=window.__spatialUX.faces(solidId).find(f=>f.visible),p={x:f.points.reduce((v,q)=>v+q.x,0)/f.points.length,y:f.points.reduce((v,q)=>v+q.y,0)/f.points.length};return window.__spatialUX.worldToCanvas(p.x,p.y);},pyramidId);
    const pyramidCanvas=await page.locator('#canvas').boundingBox();
    const blank=await page.evaluate(()=>{const r=document.getElementById('canvas').getBoundingClientRect(),s=window.__spatialUX.state();for(let y=r.top+60;y<r.bottom-60;y+=24)for(let x=r.left+50;x<r.right-50;x+=24){if(document.elementFromPoint(x,y)?.id!=='canvas')continue;const p={x:(x-r.left-s.panOffset.x)/s.zoomFactor,y:(y-r.top-s.panOffset.y)/s.zoomFactor};if(!window.__spatialUX.pointHit(p)&&!window.__spatialUX.edgeHit(p)&&!window.__spatialUX.faceHit(p))return{x,y};}return null;});
    check('Canvas has a real blank target to clear point selection',!!blank,blank);
    await page.mouse.click(blank.x,blank.y);
    await page.mouse.click(pyramidCanvas.x+pyramidFace.x,pyramidCanvas.y+pyramidFace.y);
    s=await state();
    if(!s.menuOpen){await page.locator('#styleMenu').click();s=await state();}
    const tiltDom=await page.locator('#solidTiltLockBtn').evaluate(el=>({style:el.style.display,computed:getComputedStyle(el).display,parent:getComputedStyle(el.parentElement).display,grandparent:getComputedStyle(el.parentElement.parentElement).display,container:el.closest('#styleMenuContainer')?.className,rect:el.getBoundingClientRect().toJSON()}));
    check('Pyramid is selected as a whole before relocking tilt',s.selectedSolidId===pyramidId&&await page.evaluate(()=>window.__spatialUX.whole())===pyramidId&&await page.locator('#solidTiltLockBtn').isVisible(),{selectedSolidId:s.selectedSolidId,whole:await page.evaluate(()=>window.__spatialUX.whole()),polygon:s.selectedPolygonId,selectedLabel:s.selectedLabel,tiltLockVisible:await page.locator('#solidTiltLockBtn').isVisible(),tiltDom,menuOpen:s.menuOpen});
    await page.locator('#solidTiltLockBtn').click();
    const afterRelock=await page.evaluate(solidId=>{const s=window.__spatialUX.state(),d=s.runtime.solids[solidId].polyhedron;return{offset:{...d.offset},height:d.height,coords:s.runtime.solids[solidId].vertices.map(pid=>({...s.runtime.points[pid].spatialPosition}))};},pyramidId);
    check('Relocking tilt preserves the true 3D pyramid geometry',JSON.stringify(afterRelock.coords)===JSON.stringify(beforeRelock.coords),{before:beforeRelock,after:afterRelock});
    check('Tilt lock click keeps the style menu open', (await state()).menuOpen&&await page.locator('#styleMenuContainer').isVisible(),await state());
    const lockedOffset=afterRelock.offset;
    const lockedApex=await apexPosition();
    await page.mouse.click(canvas.x+lockedApex.x,canvas.y+lockedApex.y);
    await page.mouse.move(canvas.x+lockedApex.x,canvas.y+lockedApex.y);await page.mouse.down();await page.mouse.move(canvas.x+lockedApex.x+30,canvas.y+lockedApex.y+22,{steps:8});await page.mouse.up();
    const afterLockedDrag=await page.evaluate(solidId=>window.__spatialUX.state().runtime.solids[solidId].polyhedron.offset,pyramidId);
    check('A subsequent apex drag cannot change the locked tilt',JSON.stringify(afterLockedDrag)===JSON.stringify(lockedOffset),{lockedOffset,afterLockedDrag});
    // Return selection to the original prism for shape lock checks.
    await page.locator('#modeMove').click();
    const prismFaceCenter=await page.evaluate(solidId=>{const f=window.__spatialUX.faces(solidId).find(f=>f.visible),p={x:f.points.reduce((v,q)=>v+q.x,0)/f.points.length,y:f.points.reduce((v,q)=>v+q.y,0)/f.points.length};return window.__spatialUX.worldToCanvas(p.x,p.y);},id);
    const prismBlank=await page.evaluate(()=>{const r=document.getElementById('canvas').getBoundingClientRect(),s=window.__spatialUX.state();for(let y=r.top+60;y<r.bottom-60;y+=24)for(let x=r.left+50;x<r.right-50;x+=24){if(document.elementFromPoint(x,y)?.id!=='canvas')continue;const p={x:(x-r.left-s.panOffset.x)/s.zoomFactor,y:(y-r.top-s.panOffset.y)/s.zoomFactor};if(!window.__spatialUX.pointHit(p)&&!window.__spatialUX.edgeHit(p)&&!window.__spatialUX.faceHit(p))return{x,y};}return null;});
    check('Canvas exposes a blank target before reselecting the prism',!!prismBlank,prismBlank);
    await page.mouse.click(prismBlank.x,prismBlank.y);
    const cRect=await page.locator('#canvas').boundingBox();await page.mouse.click(cRect.x+prismFaceCenter.x,cRect.y+prismFaceCenter.y);
    s=await state();if(!s.menuOpen){await page.locator('#styleMenu').click();s=await state();}
    check('Prism is selected as a whole before changing its shape lock',s.selectedSolidId===id&&await page.evaluate(()=>window.__spatialUX.whole())===id&&s.selectedPolygonId===null&&await page.locator('#polygonLockToggleBtn').isVisible(),{selectedSolidId:s.selectedSolidId,whole:await page.evaluate(()=>window.__spatialUX.whole()),polygon:s.selectedPolygonId,menuOpen:s.menuOpen,shapeLockVisible:await page.locator('#polygonLockToggleBtn').isVisible()});
    await page.locator('#polygonLockToggleBtn').click();
    check('Shape lock stays available from the open style menu', (await state()).menuOpen && await page.locator('#styleMenuContainer').isVisible(), null);

    // Select a single vertex, then an edge, with real canvas clicks.
    const clickCanvasLocal = async point => {
      const r = await page.locator('#canvas').boundingBox(); await page.mouse.click(r.x + point.x, r.y + point.y);
    };
    const projected = await page.evaluate(solidId => {
      const s = window.__spatialUX.state(), solid = s.runtime.solids[solidId];
      const project = p => window.__spatialUX.worldToCanvas(p.x,p.y);
      const edge=solid.edges.map(lineId=>s.runtime.lines[lineId]).filter(e=>e&&!e.spatialHiddenEdge).map(e=>{const [a,b]=e.defining_points.map(pid=>s.runtime.points[pid]),p={x:(a.x+b.x)/2,y:(a.y+b.y)/2};return{lineId:e.id,world:p,screen:project(p),hit:window.__spatialUX.edgeHit(p),point:window.__spatialUX.pointHit(p)}}).find(e=>e.hit?.lineId===e.lineId&&!e.point);
      return { vertex: project(s.runtime.points[solid.vertices[0]]), edge };
    }, id);
    await page.locator('#modeMove').click();
    await clickCanvasLocal(projected.vertex);
    s=await state();
    check('Clicking a vertex selects its point ID, keeps style menu open, and hides whole-solid locks', s.selectedPointId===solid.vertices[0]&&s.menuOpen&&await page.locator('#styleMenuContainer').isVisible()&&!await page.locator('#polygonLockToggleBtn').isVisible()&&!await page.locator('#solidTiltLockBtn').isVisible(),s);
    await clickCanvasLocal(projected.edge.screen);
    await clickCanvasLocal(projected.edge.screen); // prism selection first drills into the owning face, then into the edge
    s=await state();
    check('Clicking an edge selects its actual line ID, keeps style menu open, and hides whole-solid locks', s.selectedLineId===projected.edge.lineId&&s.menuOpen&&await page.locator('#styleMenuContainer').isVisible()&&!await page.locator('#polygonLockToggleBtn').isVisible()&&!await page.locator('#solidTiltLockBtn').isVisible(),{selectedLineId:s.selectedLineId,target:projected.edge,selectedPolygonId:s.selectedPolygonId,menuOpen:s.menuOpen,shapeLockVisible:await page.locator('#polygonLockToggleBtn').isVisible(),tiltLockVisible:await page.locator('#solidTiltLockBtn').isVisible()});
    const faceTarget=await page.evaluate(solidId=>{for(const f of window.__spatialUX.faces(solidId).filter(f=>f.visible)){const [a,b,c,d]=f.points;for(const u of [.35,.5,.65])for(const v of [.35,.5,.65]){const p={x:a.x*(1-u)*(1-v)+b.x*u*(1-v)+c.x*u*v+d.x*(1-u)*v,y:a.y*(1-u)*(1-v)+b.y*u*(1-v)+c.y*u*v+d.y*(1-u)*v},hit=window.__spatialUX.faceHit(p);if(hit?.polygonId===f.polygonId&&!window.__spatialUX.pointHit(p)&&!window.__spatialUX.edgeHit(p))return{screen:window.__spatialUX.worldToCanvas(p.x,p.y),polygonId:f.polygonId,hit};}}return null;},id);
    check('An unobstructed face interior resolves to its stable polygon ID',!!faceTarget?.hit?.polygonId,faceTarget);
    const blankForFace=await page.evaluate(()=>{const r=document.getElementById('canvas').getBoundingClientRect(),s=window.__spatialUX.state();for(let y=r.top+60;y<r.bottom-60;y+=24)for(let x=r.left+50;x<r.right-50;x+=24){if(document.elementFromPoint(x,y)?.id!=='canvas')continue;const p={x:(x-r.left-s.panOffset.x)/s.zoomFactor,y:(y-r.top-s.panOffset.y)/s.zoomFactor};if(!window.__spatialUX.pointHit(p)&&!window.__spatialUX.edgeHit(p)&&!window.__spatialUX.faceHit(p))return{x,y};}return null;});
    await page.mouse.click(blankForFace.x,blankForFace.y);
    await clickCanvasLocal(faceTarget.screen);s=await state();
    check('Face body click selects the whole solid before drilling into its face',s.selectedSolidId===id&&await page.evaluate(()=>window.__spatialUX.whole())===id,s);
    if(!s.menuOpen){await page.locator('#styleMenu').click();s=await state();}
    await clickCanvasLocal(faceTarget.screen);s=await state();
    check('Selecting a single face selects its polygon ID, keeps style menu open, and hides whole-solid locks',s.selectedPolygonId===faceTarget.polygonId&&s.selectedSolidId===id&&s.menuOpen&&!await page.locator('#polygonLockToggleBtn').isVisible()&&!await page.locator('#solidTiltLockBtn').isVisible(),{selectedPolygonId:s.selectedPolygonId,target:faceTarget.polygonId,selectedSolidId:s.selectedSolidId,menuOpen:s.menuOpen,shapeLockVisible:await page.locator('#polygonLockToggleBtn').isVisible(),tiltLockVisible:await page.locator('#solidTiltLockBtn').isVisible()});
    await page.locator('#modeMove').click();
    hs=await handles();const wholeRotate=hs.find(h=>h.kind==='rotate');await clickCanvasLocal(wholeRotate);s=await state();
    check('Whole-solid selection restores lock controls while style menu stays open',s.selectedSolidId===id&&await page.evaluate(()=>window.__spatialUX.whole())===id&&s.menuOpen&&await page.locator('#polygonLockToggleBtn').isVisible()&&await page.locator('#solidTiltLockBtn').isVisible(),s);
    await page.screenshot({path:path.join(output,'whole-controls-style-menu.png')});

    const mobile=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
    mobile.on('pageerror',error=>results.errors.push(error.message));
    await mobile.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:`${await response.text()}\nwindow.__spatialUX={state:()=>({runtime,mode,selectedSolidId,menuOpen:styleMenuOpen}),worldToCanvas,handles:id=>spatialHandles(runtime,id,screenUnits(26))};`});});
    await mobile.goto('http://127.0.0.1:5202/',{waitUntil:'networkidle'});await mobile.waitForFunction(()=>window.__spatialUX);if(await mobile.locator('#swDismissBtn').isVisible())await mobile.locator('#swDismissBtn').click();
    await mobile.locator('#modePrism').scrollIntoViewIfNeeded();await mobile.locator('#modePrism').click();
    if(await mobile.locator('#ngonModal').isVisible()){await mobile.locator('#ngonInput').fill('4');await mobile.locator('#ngonConfirmBtn').click();}
    const mobileCanvas=await mobile.locator('#canvas').boundingBox();await mobile.touchscreen.tap(mobileCanvas.x+mobileCanvas.width/2,mobileCanvas.y+mobileCanvas.height/2);
    let ms=await mobile.evaluate(()=>window.__spatialUX.state());const mobileId=ms.selectedSolidId;
    check('390px touch flow creates a fresh four-side prism',!!mobileId&&ms.runtime.solids[mobileId].polyhedron?.basePoints?.length===4,{id:mobileId,viewport:await mobile.evaluate(()=>({width:innerWidth,height:innerHeight}))});
    const mobileHandles=await mobile.evaluate(id=>window.__spatialUX.handles(id),mobileId);
    const hitReport=await mobile.evaluate(hs=>{const r=document.getElementById('canvas').getBoundingClientRect();return hs.map(h=>({kind:h.kind,axis:h.axis,x:r.left+h.x,y:r.top+h.y,target:document.elementFromPoint(r.left+h.x,r.top+h.y)?.id,isCanvas:document.elementFromPoint(r.left+h.x,r.top+h.y)===document.getElementById('canvas')}));},mobileHandles);
    const adjacentDistances=mobileHandles.slice(0,4).slice(1).map((h,i)=>Math.hypot(h.x-mobileHandles[i].x,h.y-mobileHandles[i].y));
    check('390px layout exposes all five separated, tappable handles',mobileHandles.length===5&&hitReport.every(h=>h.isCanvas)&&adjacentDistances.every(d=>d>=40),{handles:mobileHandles,hits:hitReport,adjacentDistances});
    const mobileAxis=mobileHandles.find(h=>h.kind==='rotateAxis'&&h.axis===1),mobileRect=await mobile.locator('#canvas').boundingBox(),cdp=await mobile.context().newCDPSession(mobile);
    const mobileBeforeOrientation=await mobile.evaluate(solidId=>[...window.__spatialUX.state().runtime.spatialGroups[window.__spatialUX.state().runtime.solids[solidId].groupId].orientation],mobileId);
    const ax={x:mobileRect.x+mobileAxis.x,y:mobileRect.y+mobileAxis.y},bx={x:ax.x+24,y:ax.y+28};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:37,...ax}]});
    for(let n=1;n<=8;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:37,x:ax.x+(bx.x-ax.x)*n/8,y:ax.y+(bx.y-ax.y)*n/8}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    ms=await mobile.evaluate(()=>window.__spatialUX.state());
    check('390px touch drag rotates the selected prism around axis 1',JSON.stringify(ms.runtime.spatialGroups[ms.runtime.solids[mobileId].groupId].orientation)!==JSON.stringify(mobileBeforeOrientation),{before:mobileBeforeOrientation,after:ms.runtime.spatialGroups[ms.runtime.solids[mobileId].groupId].orientation});
    await mobile.close();
    check('Regression has no browser exceptions', results.errors.length === 0, results.errors);
  } catch (error) {
    results.errors.push(error.stack || String(error)); process.exitCode = 1;
  } finally {
    await browser?.close(); await server.close();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  }
  console.log(JSON.stringify(results));
  if (results.errors.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
