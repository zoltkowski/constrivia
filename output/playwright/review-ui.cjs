const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/yellow/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true } });
  await server.listen();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({ response, body: body + `\nwindow.__review = {
      state: () => ({runtime, mode, stickyTool, selectedLabel, selectedPointId, selectedLineId, selectedCircleId, selectedPolygonId, selectedAngleId, selectedSegments: [...selectedSegments], selectedArcSegments:[...selectedArcSegments], multiSelectedPoints:[...multiSelectedPoints], multiSelectedCircles:[...multiSelectedCircles], selectionVertices,selectionEdges, historyIndex, historyLength: history.length, panOffset, zoomFactor}),
      load: applyPersistedDocument, serialize: serializeCurrentDocument, draw, undo, redo, pushHistory,
      recompute: recomputeAllConstraints, setMode, handleToolClick,
      worldToCanvas, openStyleMenu,
      selectAll: () => { clearMultiSelection(); Object.keys(runtime.points).forEach(id => multiSelectedPoints.add(id)); Object.keys(runtime.lines).forEach(id => multiSelectedLines.add(id)); Object.keys(runtime.circles).forEach(id => multiSelectedCircles.add(id)); Object.keys(runtime.labels).forEach(id => multiSelectedLabels.add(id)); },
      copy: copyMultiSelectionToClipboard, paste: pasteCopiedObjects,
      createPoint: (x, y, extra = {}) => addPoint(runtime, {x, y, style: currentPointStyle(), ...extra}),
      createLine: (a, b) => addLineFromPoints(runtime, a, b, currentStrokeStyle()),
      createPerpendicular: createPerpendicularLineThroughPoint,
      findPoint, getAngleValue, angleGeometry, polygonVerticesOrdered,
      resetView: () => { panOffset = {x:0,y:0}; zoomFactor = 1; clearSelectionState(); updateSelectionButtons(); draw(); },
      selectPoint: id => { clearSelectionState(); selectedPointId = id; updateSelectionButtons(); draw(); },
      hidePoint: id => { runtime.points[id].style.hidden = true; },
      movePoint: (id, target) => { const engine = toEngineState(runtime); movePointAndRecompute(engine, id, target); applyEngineState(runtime, engine, {points: true, lines: true, circles: true}); draw(); },
      selectLabel, clearSelectionState
    };` });
  });
  await page.goto('http://127.0.0.1:5174/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__review);
  if (process.argv.includes('--logic')) {
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
    const scenarios={};
    await page.evaluate(()=>{window.__review.load({model:{}});window.__review.resetView();});
    await page.locator('#modeSegment').click();
    await page.mouse.click(100,300);
    await page.locator('#modeMove').click();
    scenarios.cancelSegment=await page.evaluate(()=>window.__review.state());
    await page.evaluate(()=>{window.__review.load({model:{}});window.__review.resetView();});
    await page.locator('#modePolygon').click();
    for(const [x,y] of [[60,260],[300,260],[120,320],[300,460],[60,460],[60,260]]) await page.mouse.click(x,y);
    scenarios.concavePolygon=await page.evaluate(()=>{
      const r=window.__review,s=r.state(),p=Object.values(s.runtime.polygons)[0];
      p.fill='#ff4d4f';p.fillOpacity=0.35;r.clearSelectionState();r.draw();
      return {stored:p.points,renderOrder:r.polygonVerticesOrdered(p.id),points:s.runtime.points,lines:s.runtime.lines};
    });
    await page.screenshot({path:path.join(__dirname,'concave-polygon.png')});
    scenarios.nearbyPointSelection=await page.evaluate(()=>{
      const r=window.__review;r.load({model:{points:[{id:'pt1',x:100,y:300},{id:'pt2',x:112,y:300}]}});r.resetView();
      return {clicked:{x:100,y:300},selected:r.findPoint({x:100,y:300})};
    });
    const base={model:{points:[{id:'pt1',x:60,y:300},{id:'pt2',x:300,y:300}],lines:[{id:'ln1',points:['pt1','pt2']}]}};
    await page.evaluate(d=>{window.__review.load(d);window.__review.resetView();},base);
    await page.locator('#modeAdd').click();
    await page.mouse.click(160,300);
    scenarios.pointOnLine=await page.evaluate(()=>window.__review.state().runtime.points);
    await page.evaluate(d=>{window.__review.load(d);window.__review.resetView();},base);
    await page.locator('#modeSegment').click();
    await page.mouse.click(160,300);
    await page.mouse.click(220,420);
    scenarios.segmentStartOnLine=await page.evaluate(()=>window.__review.state().runtime.points);
    await page.evaluate(()=>{window.__review.load({model:{}});window.__review.resetView();});
    await page.locator('#modeSquare').click();
    await page.mouse.click(160,300);await page.mouse.click(160,300);
    scenarios.squareRepeatedPoint=await page.evaluate(()=>window.__review.state());
    await page.evaluate(()=>{window.__review.load({model:{}});window.__review.resetView();});
    await page.locator('#modeCircle').click();
    await page.mouse.click(160,300);await page.mouse.click(160,300);
    scenarios.circleRepeatedCenter=await page.evaluate(()=>window.__review.state());
    await page.evaluate(()=>{window.__review.load({model:{points:[{id:'pt1',x:60,y:300},{id:'pt2',x:160,y:300},{id:'pt3',x:300,y:300}],lines:[{id:'ln1',points:['pt1','pt2','pt3'],defining_points:['pt1','pt3']}]}});window.__review.resetView();});
    await page.mouse.click(110,300);await page.mouse.click(110,300);
    const beforeDelete=await page.evaluate(()=>window.__review.state());
    await page.locator('#deletePoint').click();
    scenarios.deleteSelectedSegment={before:beforeDelete,after:await page.evaluate(()=>window.__review.state())};
    await page.evaluate(()=>{const r=window.__review;r.load({model:{points:[{id:'pt1',x:60,y:300},{id:'pt2',x:160,y:300},{id:'pt3',x:300,y:300}],lines:[{id:'ln1',points:['pt1','pt2','pt3'],defining_points:['pt1','pt3'],style:{color:'#ff0000',width:2,type:'dashed'},segmentStyles:[{color:'#ff0000',width:2,type:'dashed'},{color:'#00ff00',width:8,type:'solid'}]}]}});r.resetView();});
    await page.mouse.click(110,300);
    await page.evaluate(()=>window.__review.openStyleMenu());
    const beforeColorChange=await page.evaluate(()=>window.__review.state().runtime.lines.ln1);
    await page.locator('#styleColorRow .color-btn[data-slot="1"]').click();
    scenarios.colorOnlyEdit={before:beforeColorChange,after:await page.evaluate(()=>window.__review.state().runtime.lines.ln1)};
    await page.evaluate(()=>{const r=window.__review;r.load({model:{}});r.createPoint(100,300);r.selectAll();r.copy();r.setMode('move');r.clearSelectionState();r.resetView();});
    const beforePaste=await page.evaluate(()=>Object.keys(window.__review.state().runtime.points).length);
    const pasteVisible=await page.locator('#multiCloneBtn').isVisible();
    await page.locator('#multiCloneBtn').click();
    scenarios.topPaste={pasteVisible,beforePointCount:beforePaste,afterPointCount:await page.evaluate(()=>Object.keys(window.__review.state().runtime.points).length)};
    await page.evaluate(()=>{const r=window.__review;r.load({model:{points:[{id:'pt1',x:100,y:300},{id:'pt2',x:180,y:300},{id:'pt3',x:110,y:310,style:{hidden:true}}],circles:[{id:'c1',center:'pt1',radius_point:'pt2',points:[],circle_kind:'center-radius'}]}});r.resetView();});
    await page.locator('#modeMultiselect').click();
    await page.mouse.move(80,280);await page.mouse.down();await page.mouse.move(120,320,{steps:4});await page.mouse.up();
    scenarios.boxSelection=await page.evaluate(()=>{const s=window.__review.state();return {box:{left:80,top:280,right:120,bottom:320},points:s.multiSelectedPoints,circles:s.multiSelectedCircles,hiddenPoint:s.runtime.points.pt3};});
    scenarios.angleSector=await page.evaluate(()=>{
      const r=window.__review;
      r.load({model:{points:[{id:'pt1',x:100,y:300},{id:'pt2',x:200,y:300},{id:'pt3',x:200,y:200}],angles:[{id:'ang1',point1:'pt1',vertex:'pt2',point2:'pt3',style:{}}]}});
      const minor=JSON.parse(JSON.stringify({value:r.getAngleValue('ang1'),geometry:r.angleGeometry(r.state().runtime.angles.ang1)}));
      r.state().runtime.angles.ang1.style.exterior=true;
      return {minor,exterior:{value:r.getAngleValue('ang1'),geometry:r.angleGeometry(r.state().runtime.angles.ang1)}};
    });
    fs.writeFileSync(path.join(__dirname,'logic-review-results.json'),JSON.stringify({scenarios,errors},null,2));
    console.log(JSON.stringify({scenarioNames:Object.keys(scenarios),nearbyPointSelection:scenarios.nearbyPointSelection,concavePolygon:{stored:scenarios.concavePolygon.stored,renderOrder:scenarios.concavePolygon.renderOrder},angleSector:scenarios.angleSector,errors},null,2));
    return;
  }
  if (process.argv.includes('--rays')) {
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
    const before = await page.evaluate(() => {
      const r=window.__review;
      r.load({model:{points:[{id:'pt1',x:80,y:300,label:{text:'A'}},{id:'pt2',x:200,y:300,label:{text:'B'}},{id:'pt3',x:140,y:420,label:{text:'P'}}],lines:[{id:'ln1',points:['pt1','pt2'],style:{color:'#15a3ff',width:3},leftRay:{color:'#15a3ff',width:3,hidden:false},rightRay:{color:'#15a3ff',width:3,hidden:true}}]}});
      const perpendicularId=r.createPerpendicular('pt3','ln1');
      const helperId=r.state().runtime.lines[perpendicularId].perpendicular.helperPoint;
      r.state().runtime.points[helperId].label={text:'H'};
      r.resetView();
      const s=r.state();
      const pixel=[...document.getElementById('canvas').getContext('2d').getImageData(250,300,1,1).data];
      return JSON.parse(JSON.stringify({perpendicularId,helperId,baseLine:s.runtime.lines.ln1,points:s.runtime.points,pixel}));
    });
    await page.screenshot({path:path.join(__dirname,'ray-hidden-before.png')});
    // Real mouse drag of P moves the dependent projection H beyond B.
    await page.mouse.move(140,420);
    await page.mouse.down();
    await page.mouse.move(300,420,{steps:12});
    await page.mouse.up();
    const after=await page.evaluate(() => {
      const r=window.__review;r.clearSelectionState();r.draw();
      const s=r.state();
      const pixel=[...document.getElementById('canvas').getContext('2d').getImageData(250,300,1,1).data];
      return JSON.parse(JSON.stringify({baseLine:s.runtime.lines.ln1,points:s.runtime.points,pixel}));
    });
    await page.screenshot({path:path.join(__dirname,'ray-hidden-after.png')});
    const result={before,after,errors};
    fs.writeFileSync(path.join(__dirname,'ray-review-results.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
    return;
  }
  const initial = await page.evaluate(() => ({state: window.__review.state(), buttons: [...document.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => ({id:b.id,title:b.title,text:b.textContent.trim(),rect:b.getBoundingClientRect().toJSON()})), canvas: document.querySelector('canvas').getBoundingClientRect().toJSON(), scrollWidth: document.documentElement.scrollWidth }));
  await page.screenshot({ path: path.join(__dirname, 'mobile-initial.png') });
  fs.writeFileSync(path.join(__dirname, 'initial-state.json'), JSON.stringify({initial, errors}, null, 2));
  if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
  const scenarios = {};
  await page.locator('#modeAdd').dblclick();
  scenarios.stickyAfterDoubleClick = await page.evaluate(() => { const s=window.__review.state(); return {mode:s.mode,stickyTool:s.stickyTool}; });
  await page.locator('#modeAdd').click();
  scenarios.stickyAfterSingleClick = await page.evaluate(() => { const s=window.__review.state(); return {mode:s.mode,stickyTool:s.stickyTool}; });
  scenarios.cloning = await page.evaluate(() => {
    const r=window.__review; r.load({model:{}});
    const a=r.createPoint(100,200), b=r.createPoint(200,200);
    const m=r.createPoint(150,200,{construction_kind:'midpoint',midpointMeta:{parents:[a,b]}});
    r.selectAll(); r.copy(); r.paste();
    const before=JSON.parse(JSON.stringify(r.state().runtime.points));
    r.movePoint(a,{x:50,y:200});
    return {before,after:r.state().runtime.points};
  });
  scenarios.labelClone = await page.evaluate(() => {
    const r=window.__review;
    r.load({model:{labels:[{id:'lbl-test',text:'Test',pos:{x:100,y:200}}]}});
    r.selectAll(); r.copy(); r.paste();
    return r.state().runtime.labels;
  });
  scenarios.importedLineClone = await page.evaluate(() => {
    const r=window.__review;
    r.load({model:{points:[{id:'pt1',x:100,y:200},{id:'pt2',x:200,y:200}],lines:[{id:'ln1',points:['pt1','pt2']}]}});
    r.selectAll();r.copy();r.paste();
    return r.state().runtime.lines;
  });
  scenarios.styleReorder = await page.evaluate(() => {
    const r=window.__review;
    r.load({model:{points:[{id:'pt1',x:0,y:0},{id:'pt2',x:100,y:0},{id:'pt3',x:200,y:0},{id:'pt4',x:300,y:0}],lines:[{id:'ln1',points:['pt1','pt2','pt3','pt4'],defining_points:['pt1','pt4'],style:{color:'#111111'},segmentStyles:[{color:'#ff0000'},{color:'#00ff00'},{color:'#0000ff'}]}]}});
    const before=JSON.parse(JSON.stringify(r.state().runtime.lines.ln1));
    r.movePoint('pt2',{x:250,y:0});
    return {before,after:r.state().runtime.lines.ln1};
  });
  scenarios.intersections = await page.evaluate(() => {
    const r=window.__review;
    r.load({model:{points:[{id:'pt1',x:0,y:0},{id:'pt2',x:10,y:0},{id:'pt3',x:-20,y:0},{id:'pt4',x:20,y:0},...['pt5','pt6'].map((id,i)=>({id,x:i?10:-10,y:0,construction_kind:'intersection',parent_refs:[{kind:'line',id:'ln1'},{kind:'circle',id:'c1'}]}))],lines:[{id:'ln1',points:['pt3','pt5','pt6','pt4'],defining_points:['pt3','pt4']}],circles:[{id:'c1',center:'pt1',radius_point:'pt2',points:['pt2','pt5','pt6'],defining_points:['pt1','pt2','pt2'],circle_kind:'center-radius'}]}});
    r.hidePoint('pt5'); r.recompute();
    const hiddenAfterRecompute=r.state().runtime.points.pt5.style.hidden;
    const rt=r.state().runtime;
    rt.points.pt3.y=10; rt.points.pt4.y=10; r.recompute();
    const tangent=JSON.parse(JSON.stringify([rt.points.pt5,rt.points.pt6]));
    rt.points.pt3.y=0; rt.points.pt4.y=0; r.recompute();
    return {hiddenAfterRecompute,tangent,afterSplit:[rt.points.pt5,rt.points.pt6]};
  });
  scenarios.parallelIntersection = await page.evaluate(() => {
    const r=window.__review;
    r.load({model:{points:[{id:'pt1',x:0,y:0},{id:'pt2',x:10,y:0},{id:'pt3',x:5,y:-5},{id:'pt4',x:5,y:5},{id:'pt5',x:5,y:0,construction_kind:'intersection',parent_refs:[{kind:'line',id:'ln1'},{kind:'line',id:'ln2'}]}],lines:[{id:'ln1',points:['pt1','pt5','pt2'],defining_points:['pt1','pt2']},{id:'ln2',points:['pt3','pt5','pt4'],defining_points:['pt3','pt4']}]}});
    const rt=r.state().runtime; rt.points.pt4.x=15; rt.points.pt4.y=-5; r.recompute();
    return rt.points.pt5;
  });
  scenarios.undoLabel = await page.evaluate(() => {
    const r=window.__review; r.load({model:{}});
    r.state().runtime.labels.test={id:'test',text:'Test',pos:{x:100,y:200}};
    r.pushHistory(); r.selectLabel({kind:'free',id:'test'}); r.undo();
    return r.state();
  });
  await page.evaluate(() => {
    const r=window.__review;
    r.load({model:{inkStrokes:[{id:'ink-test',color:'#ff0000',baseWidth:5,points:[{x:100,y:200,pressure:1,time:0},{x:200,y:200,pressure:1,time:1}]}]}});
  });
  await page.locator('#modeHandwriting').click();
  await page.locator('#styleMenu').click();
  await page.locator('#eraserBtn').click();
  const inkCanvasPosition=await page.evaluate(()=>window.__review.worldToCanvas(150,200));
  await page.mouse.click(inkCanvasPosition.x,inkCanvasPosition.y);
  scenarios.eraser = await page.evaluate(() => {
    const r=window.__review;
    const beforeUndo={inkIds:Object.keys(r.state().runtime.inkStrokes),historyIndex:r.state().historyIndex,historyLength:r.state().historyLength};
    r.undo();
    return {beforeUndo,afterUndo:{inkIds:Object.keys(r.state().runtime.inkStrokes),historyIndex:r.state().historyIndex,historyLength:r.state().historyLength}};
  });
  await page.evaluate(() => {window.__review.load({model:{}});});
  await page.locator('#modeAdd').tap();
  await page.locator('#modeAdd').tap();
  scenarios.stickyAfterTouchDoubleTap = await page.evaluate(() => {const s=window.__review.state();return {mode:s.mode,stickyTool:s.stickyTool};});
  // Touch gestures use the browser's touch input path, not synthetic pointer events.
  await page.evaluate(() => { window.__review.load({model:{}}); window.__review.setMode('add'); });
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:300,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:300,id:1},{x:240,y:300,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:80,y:300,id:1},{x:280,y:300,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  scenarios.pinchInAddMode = await page.evaluate(() => window.__review.state());
  await page.screenshot({path:path.join(__dirname,'mobile-after-pinch.png')});
  await page.setViewportSize({width:320,height:568});
  scenarios.centerOnSmallScreen = await page.evaluate(() => {
    const r=window.__review;
    r.load({model:{points:[{id:'pt1',x:0,y:0},{id:'pt2',x:0,y:1000}],lines:[{id:'ln1',points:['pt1','pt2']}]}});
    const endpoint=r.worldToCanvas(0,1000);
    const element=document.elementFromPoint(endpoint.x,endpoint.y);
    return {endpoint,toolbar:document.querySelector('.toolbar-bottom').getBoundingClientRect().toJSON(),elementAtEndpoint:{tag:element.tagName,id:element.id,classes:element.className}};
  });
  await page.screenshot({path:path.join(__dirname,'small-screen-centering.png')});
  fs.writeFileSync(path.join(__dirname,'review-results.json'),JSON.stringify({scenarios,errors},null,2));
  console.log(JSON.stringify({scenarioNames:Object.keys(scenarios),eraser:scenarios.eraser,stickyTouch:scenarios.stickyAfterTouchDoubleTap,centering:scenarios.centerOnSmallScreen,errors},null,2));
  } finally {
    await browser.close();
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
