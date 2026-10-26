const fs = require('fs');
const path = require('path');
const OUTPUT_ROOT = path.resolve(__dirname, '../../output/playwright');
fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
const VERIFY = process.argv.includes('--verify');
const rayOutput = VERIFY ? path.join(OUTPUT_ROOT, 'geometry-visibility') : OUTPUT_ROOT;
fs.mkdirSync(rayOutput, { recursive: true });
const { chromium } = require('playwright');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true } });
  await server.listen();
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
  try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({ response, body: body + `\nwindow.__review = {
      state: () => ({runtime, mode, stickyTool, selectedLabel, selectedPointId, selectedLineId, selectedCircleId, selectedPolygonId, selectedAngleId, selectedSegments: [...selectedSegments], selectedArcSegments:[...selectedArcSegments], multiSelectedPoints:[...multiSelectedPoints], multiSelectedCircles:[...multiSelectedCircles], selectionVertices,selectionEdges, historyIndex, historyLength: history.length, panOffset, zoomFactor, inProgress:{segmentStartId,segmentStartTemporary,circleCenterId,circleThreePoints:[...circleThreePoints],triangleStartId,squareStartId,ngonSecondId,polygonChain:[...polygonChain],pendingIntersection:pendingIntersection?{...pendingIntersection}:null}}),
      load: applyPersistedDocument, serialize: serializeCurrentDocument, draw, undo, redo, pushHistory,
      recompute: recomputeAllConstraints, setMode, handleToolClick,
      worldToCanvas, openStyleMenu,
      selectAll: () => { clearMultiSelection(); Object.keys(runtime.points).forEach(id => multiSelectedPoints.add(id)); Object.keys(runtime.lines).forEach(id => multiSelectedLines.add(id)); Object.keys(runtime.circles).forEach(id => multiSelectedCircles.add(id)); Object.keys(runtime.labels).forEach(id => multiSelectedLabels.add(id)); },
      copy: copyMultiSelectionToClipboard, paste: pasteCopiedObjects,
      createPoint: (x, y, extra = {}) => addPoint(runtime, {x, y, style: currentPointStyle(), ...extra}),
      createLine: (a, b) => addLineFromPoints(runtime, a, b, currentStrokeStyle()),
      createPerpendicular: createPerpendicularLineThroughPoint,
      findPoint, findCircles, getAngleValue, angleGeometry, polygonVerticesOrdered, polygonAtPoint: (pos) => polygonAtPointCore(runtime, pos),
      resetView: () => { panOffset = {x:0,y:0}; zoomFactor = 1; clearSelectionState(); updateSelectionButtons(); draw(); },
      selectPoint: id => { clearSelectionState(); selectedPointId = id; updateSelectionButtons(); draw(); },
      selectLine: id => { clearSelectionState(); selectedLineId = id; updateSelectionButtons(); draw(); },
      selectPolygon: id => { clearSelectionState(); selectedPolygonId = id; updateSelectionButtons(); draw(); },
      hidePoint: id => { runtime.points[id].style.hidden = true; },
      movePoint: (id, target) => { const engine = toEngineState(runtime); movePointAndRecompute(engine, id, target); applyEngineState(runtime, engine, {points: true, lines: true, circles: true}); draw(); },
      selectLabel, clearSelectionState, selectObjectsInBox, centerConstruction, getPolygonHandles,
      availableCanvasViewport: (element) => availableCanvasViewport(element),
      applyStyle: applyStyleFromInputs, updateToolButtons
    };` });
  });
  // Keep exact-coordinate construction fixtures independent of optional grid snapping.
    await page.addInitScript(() => localStorage.setItem('geometry.grid', JSON.stringify({ visible: false })));
    await page.goto('http://127.0.0.1:5174/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__review);
  if (process.argv.includes('--logic')) {
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
    const scenarios = {};
    const checks = [];
    const verify = (name, condition, observed) => {
      checks.push({name, passed: !!condition, ...(observed === undefined ? {} : {observed})});
    };
    const load = async document => page.evaluate(d => {window.__review.load(d);window.__review.resetView();}, document);
    const modelCounts = state => ({
      points: Object.keys(state.runtime.points).length,
      lines: Object.keys(state.runtime.lines).length,
      circles: Object.keys(state.runtime.circles).length,
      polygons: Object.keys(state.runtime.polygons).length,
      historyIndex: state.historyIndex,
      historyLength: state.historyLength
    });
    const addWithStickyPoint = async (name, touch) => {
      const before = await page.evaluate(() => window.__review.state());
      const coordinates = [{x:80,y:360},{x:180,y:440},{x:280,y:520}];
      for (const position of coordinates) {
        const screen = await page.evaluate(p => {
          const rect = document.getElementById('canvas').getBoundingClientRect();
          const c = window.__review.worldToCanvas(p.x,p.y);
          return {x:rect.left+c.x,y:rect.top+c.y};
        }, position);
        if (touch) await page.touchscreen.tap(screen.x,screen.y);
        else await page.mouse.click(screen.x,screen.y);
      }
      const after = await page.evaluate(() => window.__review.state());
      const added = Object.values(after.runtime.points).filter(point => !before.runtime.points[point.id]);
      const observed = {added:added.map(p=>({id:p.id,x:p.x,y:p.y})),mode:after.mode,stickyTool:after.stickyTool,historyBefore:before.historyLength,historyAfter:after.historyLength};
      scenarios[`stickyPointPlacement-${name}`] = observed;
      verify(`R10 ${name} adds three consecutive points while locked`, added.length === 3 && coordinates.every((p,i)=>added[i] && Math.hypot(p.x-added[i].x,p.y-added[i].y)<1e-5) && after.mode === 'add' && after.stickyTool === 'add' && after.historyLength === before.historyLength+3, observed);
    };

    // R10: exercise sticky behavior on the untouched startup toolbar before loading a document.
    await page.locator('#modeAdd').dblclick();
    scenarios.stickyFreshDoubleClick = await page.evaluate(() => {const s=window.__review.state();return {mode:s.mode,stickyTool:s.stickyTool};});
    verify('R10 fresh startup Point double-click is sticky', scenarios.stickyFreshDoubleClick.mode === 'add' && scenarios.stickyFreshDoubleClick.stickyTool === 'add', scenarios.stickyFreshDoubleClick);
    await addWithStickyPoint('fresh double-click', false);
    await page.locator('#modeMove').click();
    await page.locator('#modeAdd').tap();
    await page.locator('#modeAdd').tap();
    scenarios.stickyFreshDoubleTap = await page.evaluate(() => {const s=window.__review.state();return {mode:s.mode,stickyTool:s.stickyTool};});
    verify('R10 fresh startup Point double-tap is sticky', scenarios.stickyFreshDoubleTap.mode === 'add' && scenarios.stickyFreshDoubleTap.stickyTool === 'add', scenarios.stickyFreshDoubleTap);
    await addWithStickyPoint('fresh double-tap', true);
    for (const [gesture, action] of [
      ['double-click', () => page.locator('#modeAdd').dblclick()],
      ['double-tap', async () => {await page.locator('#modeAdd').tap();await page.locator('#modeAdd').tap();}]
    ]) {
      await page.locator('#modeMove').click();
      await page.evaluate(() => {const old=document.getElementById('modeAdd');const replacement=old.cloneNode(true);old.replaceWith(replacement);});
      await action();
      const state = await page.evaluate(() => {const s=window.__review.state();return {mode:s.mode,stickyTool:s.stickyTool};});
      scenarios[`stickyRebuiltPoint${gesture}`] = state;
      verify(`R10 rebuilt Point ${gesture} is sticky`, state.mode === 'add' && state.stickyTool === 'add', state);
      await addWithStickyPoint(`rebuilt ${gesture}`, gesture === 'double-tap');
    }
    // A selected previously created point must not suppress new points bound to geometry either.
    await load({model:{points:[{id:'pt1',x:60,y:300},{id:'pt2',x:330,y:300},{id:'pt3',x:200,y:520},{id:'pt4',x:280,y:520}],lines:[{id:'ln1',points:['pt1','pt2']}],circles:[{id:'c1',center:'pt3',radius_point:'pt4',circle_kind:'center-radius',points:[]}]}});
    await page.locator('#modeAdd').dblclick();
    const boundBefore = await page.evaluate(() => window.__review.state());
    for (const [x,y] of [[120,300],[240,300],[200,440],[200,600]]) await page.mouse.click(x,y);
    const boundAfter = await page.evaluate(() => window.__review.state());
    const boundAdded = Object.values(boundAfter.runtime.points).filter(p=>!boundBefore.runtime.points[p.id]);
    const boundResult = boundAdded.map(p=>({id:p.id,x:p.x,y:p.y,kind:p.construction_kind,parents:p.parent_refs}));
    scenarios.stickyBoundPoints = boundResult;
    verify('R10 locked Point adds consecutive points on a line and circle', boundAdded.length===4 && boundAdded.every((p,i)=>p.construction_kind==='on_object' && p.parent_refs?.some(parent=>parent.id===(i<2?'ln1':'c1'))) && boundAfter.mode==='add' && boundAfter.stickyTool==='add', boundResult);
    await page.locator('#undo').click();
    const boundUndo = await page.evaluate(() => window.__review.state());
    await page.locator('#redo').click();
    const boundRedo = await page.evaluate(() => window.__review.state());
    verify('R10 repeated point creation remains undoable and redoable', modelCounts(boundUndo).points===modelCounts(boundAfter).points-1 && modelCounts(boundRedo).points===modelCounts(boundAfter).points && boundRedo.mode==='add' && boundRedo.stickyTool==='add', {before:modelCounts(boundAfter),undo:modelCounts(boundUndo),redo:modelCounts(boundRedo)});

    // U3: changing tools commits the unfinished segment to history; Undo removes the work.
    await load({model:{}});
    await page.evaluate(() => window.__review.setMode('segment'));
    await page.mouse.click(100,300);
    const startedSegment = await page.evaluate(() => window.__review.state());
    await page.locator('#modeMove').click();
    const committedSegment = await page.evaluate(() => window.__review.state());
    await page.evaluate(() => window.__review.undo());
    const undoneSegment = await page.evaluate(() => window.__review.state());
    scenarios.unfinishedSegmentUndo = {started:modelCounts(startedSegment),committed:modelCounts(committedSegment),undone:modelCounts(undoneSegment),committedStep:committedSegment.inProgress,undoneStep:undoneSegment.inProgress};
    verify('U3 tool change commits unfinished segment history', committedSegment.historyLength > startedSegment.historyLength && committedSegment.runtime.points && Object.keys(committedSegment.runtime.points).length === 1, scenarios.unfinishedSegmentUndo);
    verify('U3 Undo after tool change removes unfinished segment', Object.keys(undoneSegment.runtime.points).length === 0, scenarios.unfinishedSegmentUndo);
    await load({model:{}});
    await page.evaluate(() => window.__review.setMode('segment'));
    await page.mouse.click(100,300);
    await page.locator('#undo').click();
    const directUndo = await page.evaluate(() => window.__review.state());
    await page.locator('#redo').click();
    const directRedo = await page.evaluate(() => window.__review.state());
    verify('U3 direct Undo and Redo handle an unfinished first point', modelCounts(directUndo).points === 0 && modelCounts(directRedo).points === 1, {undone:modelCounts(directUndo),redone:modelCounts(directRedo)});

    // U4: duplicate construction clicks are rejected without adding points or geometry.
    const repeatedTools = [
      ['circle', 'circle', 'center'],
      ['square', 'square', 'square'],
      ['triangleUp', 'triangleUp', 'triangle'],
      ['ngon', 'ngon', 'n-gon'],
      ['circleThree', 'circleThree', 'three-point circle']
    ];
    for (const [mode, buttonId, label] of repeatedTools) {
      await load({model:{}});
      await page.evaluate(m => window.__review.setMode(m), mode);
      await page.mouse.click(160,300);
      const afterFirst = await page.evaluate(() => window.__review.state());
      await page.mouse.click(160,300);
      const afterRepeat = await page.evaluate(() => window.__review.state());
      const result = {afterFirst:modelCounts(afterFirst),afterRepeat:modelCounts(afterRepeat),inProgress:afterRepeat.inProgress};
      scenarios[`repeated${label.replace(/\W/g,'')}`] = result;
      verify(`U4 repeated ${label} click adds no geometry`, Object.keys(afterFirst.runtime.points).length === 1 && modelCounts(afterRepeat).points === 1 && modelCounts(afterRepeat).lines === 0 && modelCounts(afterRepeat).circles === 0 && modelCounts(afterRepeat).polygons === 0, result);
      await page.mouse.click(260,300);
      if (mode === 'circleThree') await page.mouse.click(200,400);
      if (mode === 'ngon') {
        await page.locator('#ngonInput').fill('5');
        await page.locator('#ngonConfirmBtn').click();
      }
      const completed = await page.evaluate(() => window.__review.state());
      const isCircle = mode === 'circle' || mode === 'circleThree';
      verify(`U4 ${label} continues after rejected input`, isCircle ? modelCounts(completed).circles === 1 : modelCounts(completed).polygons === 1, modelCounts(completed));
    }
    await load({model:{}});
    await page.evaluate(() => window.__review.setMode('ngon'));
    await page.mouse.click(160,300);await page.mouse.click(260,300);
    await page.locator('#ngonCloseBtn').click();
    const cancelledNgon = await page.evaluate(() => window.__review.state());
    await page.locator('#undo').click();
    const undoneNgon = await page.evaluate(() => window.__review.state());
    verify('U3 cancelled n-gon base can be undone', modelCounts(cancelledNgon).points === 2 && modelCounts(cancelledNgon).polygons === 0 && modelCounts(undoneNgon).points === 0, {cancelled:modelCounts(cancelledNgon),undone:modelCounts(undoneNgon)});

    // U5: the nearest point wins; reverse insertion order is retained only for exact ties.
    scenarios.nearbyPointSelection = await page.evaluate(() => {
      const r=window.__review;
      r.load({model:{points:[{id:'pt1',x:100,y:300},{id:'pt2',x:112,y:300}]}});r.resetView();
      const nearest = r.findPoint({x:100,y:300});
      r.load({model:{points:[{id:'pt1',x:96,y:300},{id:'pt2',x:104,y:300}]}});r.resetView();
      return {nearest,tie:r.findPoint({x:100,y:300})};
    });
    verify('U5 nearest point beats newer farther point', scenarios.nearbyPointSelection.nearest === 'pt1', scenarios.nearbyPointSelection);
    verify('U5 exact-distance tie keeps latest point', scenarios.nearbyPointSelection.tie === 'pt2', scenarios.nearbyPointSelection);

    // Intersection tool: when both objects are under the second click, prefer the target different from the pending object.
    const runIntersection = async (name, model, clicks) => {
      await load({model});
      await page.evaluate(() => window.__review.setMode('intersection'));
      await page.mouse.click(...clicks[0]);
      const first = await page.evaluate(() => window.__review.state());
      await page.mouse.click(...clicks[1]);
      const after = await page.evaluate(() => window.__review.state());
      const originalIds = new Set((model.points ?? []).map(point=>point.id));
      const added = Object.values(after.runtime.points).filter(point => !originalIds.has(point.id));
      const result = {pendingAfterFirst:first.inProgress.pendingIntersection,pendingAfterSecond:after.inProgress.pendingIntersection,added:added.map(point=>({x:point.x,y:point.y,parents:point.defining_parents})),counts:modelCounts(after),circleHits:name==='CircleCircle'?await page.evaluate(([x,y])=>window.__review.findCircles({x,y},16,false),clicks[1]):undefined};
      scenarios[`intersection${name}`] = result;
      return result;
    };
    const lineCircleIntersection = await runIntersection('LineCircle', {
      points:[{id:'l1a',x:60,y:300},{id:'l1b',x:340,y:300},{id:'center',x:200,y:300},{id:'radius',x:200,y:400}],
      lines:[{id:'line',points:['l1a','l1b']}],
      circles:[{id:'circle',center:'center',radius_point:'radius',points:[],circle_kind:'center-radius'}]
    }, [[180,300],[100,300]]);
    verify('Intersection line-circle crossing creates both candidates', lineCircleIntersection.pendingAfterFirst?.kind === 'line' && lineCircleIntersection.added.length === 2 && lineCircleIntersection.added.every(point=>point.parents?.includes('line')&&point.parents?.includes('circle')), lineCircleIntersection);
    const lineLineIntersection = await runIntersection('LineLine', {
      points:[{id:'a',x:60,y:300},{id:'b',x:340,y:300},{id:'c',x:200,y:180},{id:'d',x:200,y:420}],
      lines:[{id:'horizontal',points:['a','b']},{id:'vertical',points:['c','d']}]
    }, [[100,300],[200,300]]);
    verify('Intersection line-line crossing creates a point', lineLineIntersection.pendingAfterFirst?.id === 'horizontal' && lineLineIntersection.added.length === 1 && lineLineIntersection.added[0].parents?.includes('horizontal') && lineLineIntersection.added[0].parents?.includes('vertical'), lineLineIntersection);
    const circleCircleIntersection = await runIntersection('CircleCircle', {
      points:[{id:'c1',x:120,y:300},{id:'r1',x:120,y:400},{id:'c2',x:280,y:300},{id:'r2',x:280,y:400}],
      circles:[{id:'circle1',center:'c1',radius_point:'r1',points:[],circle_kind:'center-radius'},{id:'circle2',center:'c2',radius_point:'r2',points:[],circle_kind:'center-radius'}]
    }, [[120,200],[200,240]]);
    verify('Intersection circle-circle crossing creates both candidates', circleCircleIntersection.pendingAfterFirst?.id === 'circle1' && circleCircleIntersection.added.length === 2 && circleCircleIntersection.added.every(point=>point.parents?.includes('circle1')&&point.parents?.includes('circle2')), circleCircleIntersection);

    // U7: concave boundary stays in creation order and its notch remains outside.
    await load({model:{}});
    await page.evaluate(() => window.__review.setMode('polygon'));
    for (const [x,y] of [[60,260],[300,260],[120,320],[300,460],[60,460],[60,260]]) await page.mouse.click(x,y);
    scenarios.concavePolygon = await page.evaluate(() => {
      const r=window.__review,s=r.state(),p=Object.values(s.runtime.polygons)[0];
      const order=r.polygonVerticesOrdered(p.id);
      return {stored:p.points,order,insideNotch:r.polygonAtPoint({x:200,y:330}),insideBody:r.polygonAtPoint({x:90,y:350}),points:s.runtime.points,lines:s.runtime.lines};
    });
    verify('U7 concave boundary order follows recorded order', JSON.stringify(scenarios.concavePolygon.order) === JSON.stringify(scenarios.concavePolygon.stored), {stored:scenarios.concavePolygon.stored,order:scenarios.concavePolygon.order});
    verify('U7 concave notch is outside while body is inside', scenarios.concavePolygon.insideNotch === null && !!scenarios.concavePolygon.insideBody, {notch:scenarios.concavePolygon.insideNotch,body:scenarios.concavePolygon.insideBody});
    await page.screenshot({path:path.join(OUTPUT_ROOT,'concave-polygon.png')});

    // A polygon cannot close with two vertices; it remains editable until a third vertex exists.
    await load({model:{}});
    await page.evaluate(() => window.__review.setMode('polygon'));
    for (const [x,y] of [[60,260],[300,260],[60,260]]) await page.mouse.click(x,y);
    const twoVertexState = await page.evaluate(() => window.__review.state());
    await page.mouse.click(120,380);
    await page.mouse.click(60,260);
    const threeVertexState = await page.evaluate(() => window.__review.state());
    scenarios.polygonMinimumVertices = {afterTwoVertexClose:modelCounts(twoVertexState),afterThreeVertexClose:modelCounts(threeVertexState),chainAfterTwo:twoVertexState.inProgress.polygonChain,polygons:Object.values(threeVertexState.runtime.polygons).map(p=>p.points)};
    verify('U7 two-vertex polygon stays open and can continue to a valid triangle', modelCounts(twoVertexState).polygons === 0 && twoVertexState.inProgress.polygonChain.length === 2 && modelCounts(threeVertexState).polygons === 1 && Object.values(threeVertexState.runtime.polygons)[0].points.length === 3, scenarios.polygonMinimumVertices);

    // Keep the U1 deletion and U2 construction-path observations as diagnostics; their semantics remain open.
    const base={model:{points:[{id:'pt1',x:60,y:300},{id:'pt2',x:300,y:300}],lines:[{id:'ln1',points:['pt1','pt2']}]}};
    await page.evaluate(d=>{window.__review.load(d);window.__review.resetView();},base);
    await page.evaluate(() => window.__review.setMode('add'));
    await page.mouse.click(160,300);
    scenarios.pointOnLine = await page.evaluate(()=>window.__review.state().runtime.points);
    await page.evaluate(d=>{window.__review.load(d);window.__review.resetView();},base);
    await page.evaluate(() => window.__review.setMode('segment'));
    await page.mouse.click(160,300);
    await page.mouse.click(220,420);
    scenarios.segmentStartOnLine = await page.evaluate(()=>window.__review.state().runtime.points);
    await page.evaluate(()=>{const r=window.__review;r.load({model:{points:[{id:'pt1',x:60,y:300},{id:'pt2',x:160,y:300},{id:'pt3',x:300,y:300}],lines:[{id:'ln1',points:['pt1','pt2','pt3'],defining_points:['pt1','pt3']}]}});r.resetView();});
    await page.mouse.click(110,300);await page.mouse.click(110,300);
    const beforeDelete=await page.evaluate(()=>window.__review.state());
    await page.locator('#deletePoint').click();
    scenarios.deleteSelectedSegment={before:beforeDelete,after:await page.evaluate(()=>window.__review.state())};

    // U6: each edit updates its selected attribute across the whole line only.
    const styledLine = {model:{points:[{id:'pt1',x:60,y:300},{id:'pt2',x:160,y:300},{id:'pt3',x:300,y:300}],lines:[{id:'ln1',points:['pt1','pt2','pt3'],defining_points:['pt1','pt3'],style:{color:'#123456',width:2,type:'dashed'},segmentStyles:[{color:'#ff0000',width:2,type:'dashed'},{color:'#00ff00',width:8,type:'solid'}]}]}};
    const editLineAttribute = async (attribute, value) => page.evaluate(({modelDocument,attribute,value}) => {
      const r=window.__review;r.load(modelDocument);r.resetView();r.selectLine('ln1');r.openStyleMenu();
      const selector=attribute==='color'?'#styleColor':attribute==='width'?'#styleWidth':'#styleType';
      const control=document.querySelector(selector);control.value=value;
      control.dispatchEvent(new Event(attribute === 'type' ? 'change' : 'input', {bubbles:true}));
      return JSON.parse(JSON.stringify(r.state().runtime.lines.ln1.segmentStyles));
    }, {modelDocument:styledLine,attribute,value});
    scenarios.styleEdits = {
      color: await editLineAttribute('color','#0000ff'),
      width: await editLineAttribute('width','6'),
      type: await editLineAttribute('type','dotted')
    };
    verify('U6 color edit preserves each segment width and type', scenarios.styleEdits.color[0].color === '#0000ff' && scenarios.styleEdits.color[1].color === '#0000ff' && scenarios.styleEdits.color[0].width === 2 && scenarios.styleEdits.color[1].width === 8 && scenarios.styleEdits.color[0].type === 'dashed' && scenarios.styleEdits.color[1].type === 'solid', scenarios.styleEdits.color);
    verify('U6 width edit preserves each segment color and type', scenarios.styleEdits.width[0].width === 6 && scenarios.styleEdits.width[1].width === 6 && scenarios.styleEdits.width[0].color === '#ff0000' && scenarios.styleEdits.width[1].color === '#00ff00' && scenarios.styleEdits.width[0].type === 'dashed' && scenarios.styleEdits.width[1].type === 'solid', scenarios.styleEdits.width);
    verify('U6 line type edit preserves each segment color and width', scenarios.styleEdits.type[0].type === 'dotted' && scenarios.styleEdits.type[1].type === 'dotted' && scenarios.styleEdits.type[0].color === '#ff0000' && scenarios.styleEdits.type[1].color === '#00ff00' && scenarios.styleEdits.type[0].width === 2 && scenarios.styleEdits.type[1].width === 8, scenarios.styleEdits.type);

    // Width buttons retain precision for clicks and accelerate after a sustained hold.
    scenarios.widthHold = [];
    const widthValue = () => page.locator('#styleWidth').inputValue().then(Number);
    for (const touch of [false, true]) for (const direction of [1, -1]) {
      await editLineAttribute('width', '10');
      await page.evaluate(() => {
        window.__widthSamples = [Number(document.getElementById('styleWidth').value)];
        window.__widthObserver = new MutationObserver(() => window.__widthSamples.push(Number(document.getElementById('styleWidth').value)));
        window.__widthObserver.observe(document.getElementById('lineWidthValue'), { childList: true, subtree: true });
      });
      const button = page.locator(direction > 0 ? '#lineWidthIncrease' : '#lineWidthDecrease');
      const box = await button.boundingBox(), pos = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const client = touch ? await page.context().newCDPSession(page) : null;
      if (touch) await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...pos }] });
      else { await page.mouse.move(pos.x, pos.y); await page.mouse.down(); }
      await page.waitForTimeout(1750);
      if (touch) { await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await client.detach(); }
      else await page.mouse.up();
      const released = await widthValue();
      await page.waitForTimeout(250);
      const samples = await page.evaluate(() => { window.__widthObserver.disconnect(); return window.__widthSamples; });
      const steps = samples.slice(1).map((value, i) => Number(((value - samples[i]) * direction).toFixed(3))).filter(value => value !== 0);
      const name = (touch ? 'Touch' : 'Mouse') + (direction > 0 ? ' +' : ' −');
      scenarios.widthHold.push({ name, samples, steps });
      verify(name + ' starts precisely and then repeats in 0.5 steps', steps[0] === 0.1 && steps.includes(0.5) && steps[steps.length - 1] === 0.5, { samples, steps });
      verify(name + ' stops repeating on release', await widthValue() === released);
      await button.click();
      verify(name + ' resets to a 0.1 step on the next click', Math.abs((await widthValue()) - released - direction * 0.1) < 1e-6);
    }
    for (const [initial, id, limit] of [[49.8, '#lineWidthIncrease', 50], [0.8, '#lineWidthDecrease', 0.1]]) {
      await editLineAttribute('width', String(initial));
      const button = page.locator(id), box = await button.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(1500);
      await page.mouse.up();
      verify('Held width button respects limit ' + limit, await widthValue() === limit && await button.isDisabled());
    }
    await editLineAttribute('width', '10');
    await page.locator('#lineWidthIncrease').focus();
    await page.keyboard.press('Enter');
    verify('Keyboard width adjustment remains precise', Math.abs(await widthValue() - 10.1) < 1e-6);

    // U8: the measured exterior sector is the same 270-degree sector that is drawn.
    scenarios.angleSector=await page.evaluate(()=>{
      const r=window.__review;
      r.load({model:{points:[{id:'pt1',x:100,y:300},{id:'pt2',x:200,y:300},{id:'pt3',x:200,y:200}],angles:[{id:'ang1',point1:'pt1',vertex:'pt2',point2:'pt3',style:{}}]}});
      const minor=r.getAngleValue('ang1');r.state().runtime.angles.ang1.style.exterior=true;
      return {minor,exterior:r.getAngleValue('ang1'),geometry:r.angleGeometry(r.state().runtime.angles.ang1)};
    });
    verify('U8 exterior angle measures 270 degrees', Math.round(scenarios.angleSector.exterior) === 270, scenarios.angleSector);

    // U9: paste through the visible idle action after clearing selection.
    await page.evaluate(()=>{const r=window.__review;r.load({model:{}});r.createPoint(100,300);r.selectAll();r.copy();r.setMode('move');r.clearSelectionState();r.resetView();});
    const beforePaste=await page.evaluate(()=>Object.keys(window.__review.state().runtime.points).length);
    const pasteVisible=await page.locator('#multiCloneBtn').isVisible();
    await page.locator('#multiCloneBtn').click();
    scenarios.topPaste={pasteVisible,beforePointCount:beforePaste,afterPointCount:await page.evaluate(()=>Object.keys(window.__review.state().runtime.points).length)};
    verify('U9 paste is available and works with no selection', scenarios.topPaste.pasteVisible && scenarios.topPaste.afterPointCount > scenarios.topPaste.beforePointCount, scenarios.topPaste);

    // U10: real box-drag selection excludes hidden and unavailable points.
    await page.evaluate(()=>{const r=window.__review;r.load({model:{points:[{id:'pt1',x:100,y:300},{id:'pt2',x:180,y:300},{id:'pt3',x:110,y:310,style:{hidden:true}},{id:'pt4',x:115,y:315}]}});r.state().runtime.points.pt4.geometryValid=false;r.resetView();});
    await page.evaluate(()=>window.__review.setMode('multiselect'));
    const boxScreen = await page.evaluate(()=>{const r=window.__review,rect=document.getElementById('canvas').getBoundingClientRect(),a=r.worldToCanvas(80,280),b=r.worldToCanvas(120,320);return {a:{x:rect.left+a.x,y:rect.top+a.y},b:{x:rect.left+b.x,y:rect.top+b.y}};});
    await page.mouse.move(boxScreen.a.x,boxScreen.a.y);await page.mouse.down();await page.mouse.move(boxScreen.b.x,boxScreen.b.y,{steps:4});await page.mouse.up();
    scenarios.boxSelection=await page.evaluate(()=>{const s=window.__review.state();return {points:s.multiSelectedPoints,hiddenPoint:s.runtime.points.pt3,invalidPoint:s.runtime.points.pt4};});
    verify('U10 box selection excludes hidden and unavailable points', !scenarios.boxSelection.points.includes('pt3') && !scenarios.boxSelection.points.includes('pt4'), scenarios.boxSelection);

    // R8: defer touch construction until pointerup and cancel pending clicks when a pinch starts.
    const cdp = await page.context().newCDPSession(page);
    const canvasPoint = async (x,y) => page.evaluate(({x,y})=>{const rect=document.getElementById('canvas').getBoundingClientRect(),p=window.__review.worldToCanvas(x,y);return {x:rect.left+p.x,y:rect.top+p.y};},{x,y});
    const touchStart = async points => cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
    const touchMove = async points => cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points});
    const touchEnd = async points => cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:points});
    await load({model:{}});await page.evaluate(()=>window.__review.setMode('segment'));
    const segTouch = await canvasPoint(100,300);
    await touchStart([{...segTouch,id:11}]);await page.waitForTimeout(60);
    const segmentDuringDownState=await page.evaluate(()=>window.__review.state());
    const segmentDuringDown=modelCounts(segmentDuringDownState);
    await touchEnd([]);await page.waitForTimeout(80);
    const segmentAfterUp=await page.evaluate(()=>window.__review.state());
    scenarios.touchSegmentDeferred={duringDown:segmentDuringDown,afterUp:modelCounts(segmentAfterUp),inProgress:segmentAfterUp.inProgress};
    verify('R8 segment touch commits its first point only on release', segmentDuringDown.points === 0 && Object.keys(segmentAfterUp.runtime.points).length === 1 && segmentAfterUp.inProgress.segmentStartId !== null, scenarios.touchSegmentDeferred);
    const segBeforePinch=modelCounts(segmentAfterUp);
    const segA=await canvasPoint(120,300),segB=await canvasPoint(240,300);
    await touchStart([{...segA,id:12}]);await touchStart([{...segA,id:12},{...segB,id:13}]);
    const segA2={x:segA.x-30,y:segA.y},segB2={x:segB.x+30,y:segB.y};
    await touchMove([{...segA2,id:12},{...segB2,id:13}]);await touchEnd([]);await page.waitForTimeout(100);
    const segAfterPinch=await page.evaluate(()=>window.__review.state());
    scenarios.segmentPinchNoMutation={before:segBeforePinch,after:modelCounts(segAfterPinch),inProgress:segAfterPinch.inProgress};
    verify('R8 pinch during segment second step does not mutate geometry or history', JSON.stringify(segBeforePinch) === JSON.stringify(modelCounts(segAfterPinch)) && segAfterPinch.inProgress.segmentStartId !== null, scenarios.segmentPinchNoMutation);
    await load({model:{}});await page.evaluate(()=>window.__review.setMode('circle'));
    const circleTouch=await canvasPoint(100,300);
    await touchStart([{...circleTouch,id:21}]);await touchEnd([]);await page.waitForTimeout(80);
    const circleAfterCenter=await page.evaluate(()=>window.__review.state());
    const circleBeforePinch=modelCounts(circleAfterCenter);
    const circA=await canvasPoint(140,300),circB=await canvasPoint(250,300);
    await touchStart([{...circA,id:22}]);await touchStart([{...circA,id:22},{...circB,id:23}]);
    await touchMove([{x:circA.x-25,y:circA.y,id:22},{x:circB.x+25,y:circB.y,id:23}]);await touchEnd([]);await page.waitForTimeout(100);
    const circleAfterPinch=await page.evaluate(()=>window.__review.state());
    scenarios.circlePinchNoMutation={before:circleBeforePinch,after:modelCounts(circleAfterPinch),inProgress:circleAfterPinch.inProgress};
    verify('R8 pinch during circle radius step does not mutate geometry or history', JSON.stringify(circleBeforePinch) === JSON.stringify(modelCounts(circleAfterPinch)) && circleAfterPinch.inProgress.circleCenterId !== null, scenarios.circlePinchNoMutation);

    // R9: fit geometry and actual selected polygon handles inside the free canvas in portrait and landscape.
    for (const viewport of [{width:390,height:844,name:'portrait'},{width:844,height:390,name:'landscape'}]) {
      await page.setViewportSize({width:viewport.width,height:viewport.height});
      const fitted = await page.evaluate(() => {
        const r=window.__review;
        r.load({model:{points:[{id:'a',x:-600,y:-300},{id:'b',x:600,y:-300},{id:'c',x:500,y:0},{id:'d',x:600,y:300},{id:'e',x:-600,y:300}],polygons:[{id:'poly',points:['a','b','c','d','e']}]}});
        r.selectPolygon('poly');r.centerConstruction();r.draw();
        const canvas=document.getElementById('canvas'),canvasRect=canvas.getBoundingClientRect();
        const topRect=document.querySelector('.toolbar-top').getBoundingClientRect();
        const bottomRect=document.querySelector('.toolbar-bottom').getBoundingClientRect();
        const hintRect=document.getElementById('hintBar').getBoundingClientRect();
        const free=r.availableCanvasViewport(canvas);
        const safeTop=canvasRect.top+free.top,safeBottom=canvasRect.top+free.bottom;
        const points=Object.values(r.state().runtime.points).map(p=>({id:p.id,...r.worldToCanvas(p.x,p.y)}));
        const handles=r.getPolygonHandles('poly');
        const testTargets=[...points.map(p=>({kind:'point',id:p.id,...p})),...['scaleHandle','rotateHandle'].map(k=>({kind:k,...r.worldToCanvas(handles[k].x,handles[k].y)}))];
        const projected=testTargets.map(t=>{
          const x=canvasRect.left+t.x,y=canvasRect.top+t.y,element=document.elementFromPoint(x,y);
          return {kind:t.kind,id:t.id,x,y,tag:element?.tagName,idAtPoint:element?.id,withinFreeViewport:y>=safeTop&&y<=safeBottom&&x>=canvasRect.left&&x<=canvasRect.right};
        });
        return {zoom:r.state().zoomFactor,canvasRect:canvasRect.toJSON(),topRect:topRect.toJSON(),bottomRect:bottomRect.toJSON(),hintRect:hintRect.toJSON(),freeViewport:free,safeTop,safeBottom,points,handles,projected};
      });
      scenarios[`centerConstruction${viewport.name}`]=fitted;
      const allUsable=fitted.projected.every(target=>target.withinFreeViewport&&target.tag==='CANVAS');
      verify(`R9 ${viewport.name} construction points and handles fit and hit the canvas`, allUsable, {zoom:fitted.zoom,freeViewport:{top:fitted.safeTop,bottom:fitted.safeBottom},projected:fitted.projected});
    }

    // Write diagnostics before failing so CI and the parent can inspect every observed result.
    const failed = checks.filter(check => !check.passed);
    fs.writeFileSync(path.join(OUTPUT_ROOT,'logic-review-results.json'),JSON.stringify({scenarios,checks,errors,failed},null,2));
    console.log(JSON.stringify({scenarioNames:Object.keys(scenarios),passed:checks.filter(c=>c.passed).length,failed,errors},null,2));
    if (VERIFY && (failed.length || errors.length)) throw new Error(`Logic UI regressions failed (${failed.length} assertions, ${errors.length} page errors). See ${path.join(OUTPUT_ROOT,'logic-review-results.json')}`);
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
    await page.screenshot({path:path.join(rayOutput,'ray-hidden-before.png')});
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
    await page.screenshot({path:path.join(rayOutput,'ray-hidden-after.png')});
    const result={before,after,errors};
    if(VERIFY){
      const reloaded=await page.evaluate(()=>{
        const r=window.__review,d=r.serialize();r.load(d);r.resetView();
        return {pixel:[...document.getElementById('canvas').getContext('2d').getImageData(250,300,1,1).data],line:r.state().runtime.lines.ln1};
      });
      result.reloaded=reloaded;
      if(JSON.stringify(reloaded.pixel)!==JSON.stringify(before.pixel)||!reloaded.line.segmentStyles?.[1]?.hidden)throw new Error('Saved hidden ray interval became visible after reload');
    }
    fs.writeFileSync(path.join(rayOutput,'ray-review-results.json'),JSON.stringify(result,null,2));
    if(VERIFY&&(errors.length||JSON.stringify(before.pixel)!==JSON.stringify(after.pixel)||!after.baseLine.rightRay.hidden))throw new Error('Hidden half-line reappeared; see '+rayOutput);
    console.log(JSON.stringify(result,null,2));
    return;
  }
  const initial = await page.evaluate(() => ({state: window.__review.state(), buttons: [...document.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => ({id:b.id,title:b.title,text:b.textContent.trim(),rect:b.getBoundingClientRect().toJSON()})), canvas: document.querySelector('canvas').getBoundingClientRect().toJSON(), scrollWidth: document.documentElement.scrollWidth }));
  await page.screenshot({ path: path.join(OUTPUT_ROOT, 'mobile-initial.png') });
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'initial-state.json'), JSON.stringify({initial, errors}, null, 2));
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
  await page.screenshot({path:path.join(OUTPUT_ROOT,'mobile-after-pinch.png')});
  await page.setViewportSize({width:320,height:568});
  scenarios.centerOnSmallScreen = await page.evaluate(() => {
    const r=window.__review;
    r.load({model:{points:[{id:'pt1',x:0,y:0},{id:'pt2',x:0,y:1000}],lines:[{id:'ln1',points:['pt1','pt2']}]}});
    const endpoint=r.worldToCanvas(0,1000);
    const element=document.elementFromPoint(endpoint.x,endpoint.y);
    return {endpoint,toolbar:document.querySelector('.toolbar-bottom').getBoundingClientRect().toJSON(),elementAtEndpoint:{tag:element.tagName,id:element.id,classes:element.className}};
  });
  await page.screenshot({path:path.join(OUTPUT_ROOT,'small-screen-centering.png')});
  fs.writeFileSync(path.join(OUTPUT_ROOT,'review-results.json'),JSON.stringify({scenarios,errors},null,2));
  console.log(JSON.stringify({scenarioNames:Object.keys(scenarios),eraser:scenarios.eraser,stickyTouch:scenarios.stickyAfterTouchDoubleTap,centering:scenarios.centerOnSmallScreen,errors},null,2));
  } finally {
    await browser.close();
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
