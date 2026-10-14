const fs = require('node:fs');
const path = require('node:path');
const { zipSync, strToU8 } = require('fflate');
const { chromium } = require('playwright');

const OUTPUT = path.resolve(__dirname, '../../output/playwright/spatial');
fs.mkdirSync(OUTPUT, { recursive: true });
const results = { checks: [], errors: [] };
const check = (name, pass, observed) => {
  results.checks.push({ name, passed: !!pass, observed });
  if (!pass) throw new Error(`${name}: ${JSON.stringify(observed)}`);
};
const archive = (name, document) => ({
  name: `${name}.ctr`,
  bytes: Array.from(zipSync({ [`${name}.json`]: strToU8(JSON.stringify(document)) }))
});

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5191, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
      headless: true
    });
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, serviceWorkers: 'block', hasTouch: true });
    page.on('pageerror', (error) => results.errors.push(error.message));
    page.on('dialog', async (dialog) => { results.errors.push(dialog.message()); await dialog.dismiss(); });
    await page.addInitScript(() => {
      window.__spatialFiles = [];
      window.showDirectoryPicker = async () => ({
        name: 'Spatial regression', kind: 'directory',
        queryPermission: async () => 'granted', requestPermission: async () => 'granted',
        async *values() {
          for (const file of window.__spatialFiles) {
            yield {
              kind: 'file', name: file.name,
              getFile: async () => new File([new Uint8Array(file.bytes)], file.name, { type: 'application/zip' })
            };
          }
        }
      });
    });
    await page.route('**/src/main.ts*', async (route) => {
      const response = await route.fetch();
      const suffix = `
        let spatialRevision=0;
        const originalSpatialLoad=applyPersistedDocument;
        applyPersistedDocument=(...args)=>{const value=originalSpatialLoad(...args);spatialRevision++;return value;};
        window.__spatial={
          state:()=>({runtime,mode,selectedSolidId,panOffset,zoomFactor,revision:spatialRevision}),
          worldToCanvas,serialize:serializeCurrentDocument,
          handles:id=>spatialHandles(runtime,id,screenUnits(26))
        };
      `;
      await route.fulfill({ response, body: `${await response.text()}\n${suffix}` });
    });
    await page.goto('http://127.0.0.1:5191/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__spatial);
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();

    const state = () => page.evaluate(() => window.__spatial.state());
    const canvasRect = () => page.locator('#canvas').evaluate((canvas) => {
      const r = canvas.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    const screen = async (point) => page.evaluate((p) => {
      const r = document.getElementById('canvas').getBoundingClientRect();
      const c = window.__spatial.worldToCanvas(p.x, p.y);
      return { x: r.left + c.x, y: r.top + c.y };
    }, point);
    const clickWorld = async (point) => {
      const pos = await screen(point);
      const target = await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.id, pos);
      if (target !== 'canvas') throw new Error(`Canvas target obscured: ${JSON.stringify({ point, pos, target })}`);
      await page.mouse.click(pos.x, pos.y);
    };
    const clickCanvasAt = async (x, y) => {
      const rect = await canvasRect(), s = await state();
      await clickWorld({ x: (x - s.panOffset.x) / s.zoomFactor, y: (y - s.panOffset.y) / s.zoomFactor });
      return rect;
    };
    const point = async (id) => clickWorld((await state()).runtime.points[id]);
    const touchAt = async (x, y) => {
      const r = await canvasRect();
      await page.touchscreen.tap(r.left + x, r.top + y);
    };
    const dragWorld = async (from, to) => {
      const a = await screen(from), b = await screen(to);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 12 });
      await page.mouse.up();
    };
    const selectPoint = async (id) => {
      await page.locator('#modeMove').click();
      await point(id);
    };
    const loadFromFilePane = async (name) => {
      const revision = (await state()).revision;
      if (!(await page.locator('#cloudPanel').isVisible())) await page.locator('#cloudFilesBtn').click();
      await page.locator('#localFileList [data-change-folder]').click();
      await page.locator(`#localFileList [aria-label="Wczytaj ${name}"]`).click();
      await page.waitForFunction((previous) => window.__spatial.state().revision > previous, revision);
      await page.locator('#cloudCloseBtn').click();
    };

    const rect = await canvasRect();
    const center = { x: rect.width / 2, y: rect.height / 2 };
    await page.locator('#modeCube').click();
    await clickCanvasAt(center.x, center.y);
    let s = await state();
    let solidId = s.selectedSolidId;
    let solid = s.runtime.solids[solidId];
    check('Cube tool click creates one solid with eight labelled corners and twelve edges',
      !!solid && Object.keys(s.runtime.solids).length === 1 && solid.vertices.length === 8 && solid.edges.length === 12 &&
      solid.vertices.every((id) => !!s.runtime.points[id]?.label?.text),
      solid && { id: solidId, vertices: solid.vertices.length, edges: solid.edges.length });

    await page.locator('#undo').click();
    check('Undo removes the newly created cube', !((await state()).runtime.solids ?? {})[solidId], null);
    await page.locator('#redo').click();
    s = await state(); solid = s.runtime.solids[solidId];
    check('Redo restores the same cube and all its construction edges', !!solid && solid.vertices.length === 8 && solid.edges.length === 12, solid && solid.id);

    // Add an independent cube and an ordinary 2D point, then verify a group rotation is local.
    const secondScreen = { x: Math.min(rect.width - 170, center.x + 300), y: center.y + 10 };
    await page.locator('#modeCube').click();
    await clickCanvasAt(secondScreen.x, secondScreen.y);
    s = await state();
    const secondId = s.selectedSolidId, second = s.runtime.solids[secondId];
    check('A second cube creates an independent spatial group', !!second && secondId !== solidId && second.groupId !== s.runtime.solids[solidId].groupId, second && { id: secondId, groupId: second.groupId });

    const freeScreen = { x: 170, y: Math.min(rect.height - 110, center.y + 230) };
    await page.locator('#modeAdd').click();
    await clickCanvasAt(freeScreen.x, freeScreen.y);
    s = await state();
    const freePoint = Object.values(s.runtime.points).find((p) => !p.spatial && Math.hypot(p.x - ((freeScreen.x - s.panOffset.x) / s.zoomFactor), p.y - ((freeScreen.y - s.panOffset.y) / s.zoomFactor)) < 1);
    check('Point tool still creates an ordinary 2D point', !!freePoint && !freePoint.spatial, freePoint && { id: freePoint.id, x: freePoint.x, y: freePoint.y });
    const sharedVertexId = s.runtime.solids[solidId].vertices[7];
    await page.locator('#modeCube').click();
    await point(sharedVertexId);
    s = await state();
    const attachedId = s.selectedSolidId, attached = s.runtime.solids[attachedId];
    check('Cube tool attaches at an existing spatial vertex and reuses its group',
      !!attached && attachedId !== solidId && attached.vertices[0] === sharedVertexId && attached.originPointId === sharedVertexId && attached.groupId === s.runtime.solids[solidId].groupId,
      attached && { id: attached.id, groupId: attached.groupId, sharedVertex: attached.vertices[0] });

    await selectPoint(sharedVertexId);
    const independentBefore = await page.evaluate((id) => {
      const d = window.__spatial, s = d.state(), other = s.runtime.solids[id];
      return { vertices: other.vertices.map((pid) => ({ x: s.runtime.points[pid].x, y: s.runtime.points[pid].y })), point: { x: s.runtime.points[Object.values(s.runtime.points).find((p) => !p.spatial).id].x, y: s.runtime.points[Object.values(s.runtime.points).find((p) => !p.spatial).id].y } };
    }, secondId);
    s = await state();
    const rotate = s.selectedSolidId === solidId;
    const rotateHandle = s.selectedSolidId && s.runtime.solids[solidId] ? (await page.evaluate((id) => window.__spatial.handles(id).find((h) => h.kind === 'rotate'), solidId)) : null;
    check('Move mode selects the first cube and exposes a rotation control', !!rotate && !!rotateHandle, rotateHandle);
    await dragWorld(rotateHandle, { x: rotateHandle.x + 65 / s.zoomFactor, y: rotateHandle.y + 42 / s.zoomFactor });
    s = await state();
    const orientationAfterRotate = s.runtime.spatialGroups[s.runtime.solids[solidId].groupId].orientation;
    const independentAfter = await page.evaluate((id) => {
      const d = window.__spatial, s = d.state(), other = s.runtime.solids[id], free = Object.values(s.runtime.points).find((p) => !p.spatial);
      return { vertices: other.vertices.map((pid) => ({ x: s.runtime.points[pid].x, y: s.runtime.points[pid].y })), point: { x: free.x, y: free.y } };
    }, secondId);
    check('Rotating the first group leaves the other cube and 2D point unchanged',
      JSON.stringify(independentAfter) === JSON.stringify(independentBefore) && orientationAfterRotate.some((v, i) => Math.abs(v - (i % 4 === 0 ? 1 : 0)) > 1e-4),
      { independentUnchanged: JSON.stringify(independentAfter) === JSON.stringify(independentBefore), orientationAfterRotate });
    check('Attached cube vertices rotate with their shared group',
      s.runtime.solids[attachedId].vertices.some((id, i) => {
        if (i === 0) return false;
        const p = s.runtime.points[id];
        return Math.hypot(p.x - s.runtime.points[sharedVertexId].x, p.y - s.runtime.points[sharedVertexId].y) > 1;
      }), s.runtime.solids[attachedId].vertices);

    // Drag the axis-a resize handle and verify resize is a history operation.
    await selectPoint(s.runtime.solids[solidId].vertices[0]);
    s = await state(); solid = s.runtime.solids[solidId];
    const sizeBefore = { ...solid.size };
    const resize = await page.evaluate((id) => window.__spatial.handles(id).find((h) => h.kind === 'resize' && h.axis === 0), solidId);
    check('Selected cube exposes the axis-a resize handle', !!resize, resize);
    await dragWorld(resize, { x: resize.x + 42 / s.zoomFactor, y: resize.y });
    s = await state();
    const sizeAfterResize = { ...s.runtime.solids[solidId].size };
    check('Dragging the dimension handle changes the cube into a cuboid', Math.abs(sizeAfterResize.x - sizeBefore.x) > 8, { sizeBefore, sizeAfterResize });
    await page.locator('#undo').click();
    check('Undo restores the cube dimension', Math.abs((await state()).runtime.solids[solidId].size.x - sizeBefore.x) < 1e-6, (await state()).runtime.solids[solidId].size);
    await page.locator('#redo').click();
    check('Redo restores the resized cuboid', Math.abs((await state()).runtime.solids[solidId].size.x - sizeAfterResize.x) < 1e-6, (await state()).runtime.solids[solidId].size);

    // Add a dependent point on a visible edge, then connect opposite corners with a spatial segment.
    s = await state(); solid = s.runtime.solids[solidId];
    const edgeTarget = await page.evaluate((id) => {
      const s = window.__spatial.state(), solid = s.runtime.solids[id];
      const candidates = solid.edges.map((lineId) => s.runtime.lines[lineId]).filter((line) => line && !line.spatialHiddenEdge);
      candidates.sort((a, b) => {
        const length = (l) => { const p=l.defining_points.map(id=>s.runtime.points[id]); return Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y); };
        return length(b)-length(a);
      });
      for (const line of candidates) {
        const [a,b]=line.defining_points.map(pid=>s.runtime.points[pid]);
        if(Math.hypot(a.x-b.x,a.y-b.y)>40)return{x:(a.x+b.x)/2,y:(a.y+b.y)/2,lineId:line.id};
      }
      return null;
    }, solidId);
    check('Visible cube edge is available for the Point tool', !!edgeTarget, edgeTarget);
    await page.locator('#modeAdd').click();
    await clickWorld(edgeTarget);
    s = await state(); solid = s.runtime.solids[solidId];
    const edgePoint = Object.values(s.runtime.points).find((p) => p.spatial?.binding.kind === 'edge');
    check('Point tool creates a point bound to a spatial edge', !!edgePoint && edgePoint.spatial.binding.kind === 'edge' && solid.edges.includes(edgeTarget.lineId), edgePoint && edgePoint.spatial);
    await page.locator('#undo').click();
    check('Undo removes the edge point and its line subdivision', !Object.values((await state()).runtime.points).some((p) => p.spatial?.binding.kind === 'edge'), null);
    await page.locator('#redo').click();
    s = await state();
    const restoredEdgePoint = Object.values(s.runtime.points).find((p) => p.spatial?.binding.kind === 'edge');
    check('Redo restores the edge point binding', !!restoredEdgePoint && restoredEdgePoint.spatial.binding.kind === 'edge', restoredEdgePoint && restoredEdgePoint.spatial);
    const edgePointLine = Object.values(s.runtime.lines).find((line) => line.points.includes(restoredEdgePoint.id));
    const edgePointLineId = edgePointLine?.id;
    check('Spatial edge point is inserted into its actual subdivided line', !!edgePointLineId && solid.edges.includes(edgePointLineId), edgePointLineId);

    // A point's edge parameter belongs to its defining 3D segment, so changing the group's view and a cube dimension cannot change t.
    const edgeTBefore = restoredEdgePoint.spatial.binding.t;
    await selectPoint(restoredEdgePoint.id);
    s = await state();
    const rotateAgain = await page.evaluate((id) => window.__spatial.handles(id).find((h) => h.kind === 'rotate'), solidId);
    await dragWorld(rotateAgain, { x: rotateAgain.x - 48 / s.zoomFactor, y: rotateAgain.y + 36 / s.zoomFactor });
    s = await state();
    const resizeAgain = await page.evaluate((id) => window.__spatial.handles(id).find((h) => h.kind === 'resize' && h.axis === 1), solidId);
    await dragWorld(resizeAgain, { x: resizeAgain.x, y: resizeAgain.y + 28 / s.zoomFactor });
    s = await state();
    check('Edge point t remains fixed across group rotation and another dimension resize',
      Math.abs(s.runtime.points[restoredEdgePoint.id].spatial.binding.t - edgeTBefore) < 1e-12,
      { before: edgeTBefore, after: s.runtime.points[restoredEdgePoint.id].spatial.binding.t });

    const dragBinding = s.runtime.points[restoredEdgePoint.id].spatial.binding;
    const [dragA, dragB] = dragBinding.endpoints.map((id) => s.runtime.points[id]);
    const edgePointTarget = {
      x: dragA.x * 0.72 + dragB.x * 0.28,
      y: dragA.y * 0.72 + dragB.y * 0.28
    };
    await dragWorld(s.runtime.points[restoredEdgePoint.id], edgePointTarget);
    s = await state();
    const movedT = s.runtime.points[restoredEdgePoint.id].spatial.binding.t;
    check('Dragging an edge point changes its spatial parameter', Math.abs(movedT - edgeTBefore) > 0.08, { before: edgeTBefore, after: movedT });
    await page.locator('#undo').click();
    s = await state();
    check('Undo restores the edge point parameter after a drag', Math.abs(s.runtime.points[restoredEdgePoint.id].spatial.binding.t - edgeTBefore) < 1e-12, s.runtime.points[restoredEdgePoint.id].spatial.binding.t);
    await page.locator('#redo').click();
    s = await state();
    check('Redo reapplies the edge point drag', Math.abs(s.runtime.points[restoredEdgePoint.id].spatial.binding.t - movedT) < 1e-12, s.runtime.points[restoredEdgePoint.id].spatial.binding.t);

    // Midpoint must bind to the selected subdivided segment, not to the original full edge.
    const subdividedLine = s.runtime.lines[edgePointLineId];
    const edgeIndex = subdividedLine.points.indexOf(restoredEdgePoint.id);
    const adjacentSegments = [
      edgeIndex > 0 ? [subdividedLine.points[edgeIndex - 1], restoredEdgePoint.id] : null,
      edgeIndex < subdividedLine.points.length - 1 ? [restoredEdgePoint.id, subdividedLine.points[edgeIndex + 1]] : null
    ].filter(Boolean).map((ids) => ids.map((id) => s.runtime.points[id]));
    const midpointSegment = adjacentSegments.find(([a, b]) => Math.hypot(a.x - b.x, a.y - b.y) > 24);
    check('A subdivided spatial edge retains a selectable segment', !!midpointSegment, subdividedLine.points);
    const midpointTarget = { x: (midpointSegment[0].x + midpointSegment[1].x) / 2, y: (midpointSegment[0].y + midpointSegment[1].y) / 2 };
    await page.locator('#modeMidpoint').click();
    await clickWorld(midpointTarget);
    s = await state();
    const midpoint = Object.values(s.runtime.points).find((p) => p.spatial?.binding.kind === 'edge' && p.id !== restoredEdgePoint.id && p.spatial.binding.t === 0.5 && p.spatial.binding.endpoints[0] === midpointSegment[0].id && p.spatial.binding.endpoints[1] === midpointSegment[1].id);
    check('Midpoint tool uses LineHit seg to bind to the selected subdivision', !!midpoint && s.runtime.lines[edgePointLineId].points.includes(midpoint.id), midpoint && midpoint.spatial);
    await page.locator('#undo').click();
    check('Undo removes the midpoint on the subdivided edge', !(await state()).runtime.points[midpoint?.id], midpoint?.id);
    await page.locator('#redo').click();
    s = await state();
    check('Redo restores the midpoint binding and line subdivision', !!s.runtime.points[midpoint?.id] && s.runtime.lines[edgePointLineId].points.includes(midpoint.id), midpoint?.spatial);

    await selectPoint(s.runtime.solids[solidId].vertices[0]);
    await page.locator('#modeSegment').click();
    await point(s.runtime.solids[solidId].vertices[0]);
    await point(s.runtime.solids[solidId].vertices[7]);
    s = await state();
    const diagonal = Object.values(s.runtime.lines).find((line) => line.defining_points[0] === s.runtime.solids[solidId].vertices[0] && line.defining_points[1] === s.runtime.solids[solidId].vertices[7]);
    check('Segment tool connects opposite cube vertices as a true spatial diagonal', !!diagonal && diagonal.geometryValid !== false && Math.abs(Math.hypot(s.runtime.points[diagonal.defining_points[1]].spatialPosition.x-s.runtime.points[diagonal.defining_points[0]].spatialPosition.x,s.runtime.points[diagonal.defining_points[1]].spatialPosition.y-s.runtime.points[diagonal.defining_points[0]].spatialPosition.y,s.runtime.points[diagonal.defining_points[1]].spatialPosition.z-s.runtime.points[diagonal.defining_points[0]].spatialPosition.z)-Math.hypot(s.runtime.solids[solidId].size.x,s.runtime.solids[solidId].size.y,s.runtime.solids[solidId].size.z)) < 1e-5, diagonal && diagonal.id);
    await page.locator('#undo').click();
    check('Undo removes the diagonal segment', !Object.values((await state()).runtime.lines).some((line) => line.defining_points[0] === solid.vertices[0] && line.defining_points[1] === solid.vertices[7]), null);
    await page.locator('#redo').click();
    check('Redo restores the diagonal segment', Object.values((await state()).runtime.lines).some((line) => line.defining_points[0] === solid.vertices[0] && line.defining_points[1] === solid.vertices[7]), null);

    // Set a custom edge color and edit a labelled spatial vertex through their UI controls.
    s = await state();
    const styledVertex = s.runtime.solids[solidId].vertices[0];
    await page.locator('#modeMove').click();
    await point(styledVertex);
    await page.locator('#styleMenu').click();
    await page.locator('#styleColor').evaluate((el) => { el.value = '#bb4477'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    s = await state();
    check('Style color control applies a custom color to a spatial vertex', s.runtime.points[styledVertex].style.color === '#bb4477', s.runtime.points[styledVertex].style);

    // Edit the automatically displayed label on an existing cube corner. This
    // exercises the same double-click path users use to rename point labels.
    const labelState = await state();
    const labelVertex = labelState.runtime.solids[solidId].vertices[0];
    const labelPoint = labelState.runtime.points[labelVertex];
    const labelCanvasPos = await page.evaluate((p) => {
      const c = window.__spatial.worldToCanvas(p.x, p.y);
      return { x: c.x + (p.label?.offset?.x ?? 12), y: c.y + (p.label?.offset?.y ?? -12) };
    }, labelPoint);
    const labelRect = await canvasRect();
    const labelPos = { x: labelRect.left + labelCanvasPos.x, y: labelRect.top + labelCanvasPos.y };
    await page.mouse.dblclick(labelPos.x, labelPos.y);
    await page.locator('#labelText').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#labelText').fill('Cube corner');
    s = await state();
    check('Label text control renames a cube vertex through the UI', s.runtime.points[labelVertex]?.label?.text === 'Cube corner', s.runtime.points[labelVertex]?.label);
    await page.locator('#styleMenu').click();
    await clickCanvasAt(90, 90);

    const saved = await page.evaluate(() => window.__spatial.serialize());
    const file = archive('spatial-roundtrip', saved);
    fs.writeFileSync(path.join(OUTPUT, 'experimental-cubes.ctr'), Buffer.from(file.bytes));
    await page.evaluate((entry) => window.__spatialFiles.push(entry), file);
    await loadFromFilePane('spatial-roundtrip');
    s = await state();
    solid = s.runtime.solids[solidId];
    check('File pane reload preserves attached and independent cubes, shared geometry, styles, labels and spatial points',
      !!solid && Object.keys(s.runtime.solids).length === 3 && solid.vertices.length === 8 && solid.edges.length === 12 &&
      Object.values(s.runtime.points).some((p) => p.spatial?.binding.kind === 'edge') &&
      Object.values(s.runtime.lines).some((line) => line.defining_points[0] === solid.vertices[0] && line.defining_points[1] === solid.vertices[7]) &&
      s.runtime.points[labelVertex]?.label?.text === 'Cube corner' &&
      s.runtime.points[styledVertex].style.color === '#bb4477' &&
      Object.keys(saved.model.solids ?? {}).length === 3 && Object.keys(saved.model.spatialGroups ?? {}).length === 2,
      { solids: Object.keys(s.runtime.solids ?? {}).length, groups: Object.keys(s.runtime.spatialGroups ?? {}).length, points: Object.keys(s.runtime.points).length, lines: Object.keys(s.runtime.lines).length });

    await page.locator('#modeMove').click();
    await point(styledVertex);
    await page.screenshot({ path: path.join(OUTPUT, 'spatial-controls.png') });

    // Mobile touch flow: create, rotate and resize with one finger; a two-finger gesture during a drag must roll back.
    const empty = archive('spatial-empty', { model: {} });
    await page.evaluate((entry) => window.__spatialFiles.push(entry), empty);
    await clickCanvasAt(90, 90);
    await loadFromFilePane('spatial-empty');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#modeCube').scrollIntoViewIfNeeded();
    const cubeButton = await page.locator('#modeCube').boundingBox();
    await page.touchscreen.tap(cubeButton.x + cubeButton.width / 2, cubeButton.y + cubeButton.height / 2);
    const mobileRect = await canvasRect(), mobileCenter = { x: mobileRect.width / 2, y: mobileRect.height / 2 };
    const mobileWorld = await page.evaluate((local) => {
      const s=window.__spatial.state();
      return {x:(local.x-s.panOffset.x)/s.zoomFactor,y:(local.y-s.panOffset.y)/s.zoomFactor};
    }, mobileCenter);
    const mobileCanvasPoint = await screen(mobileWorld);
    await page.touchscreen.tap(mobileCanvasPoint.x, mobileCanvasPoint.y);
    s = await state();
    const mobileSolidId = s.selectedSolidId, mobileSolid = s.runtime.solids[mobileSolidId];
    check('Mobile touch creates a cube', !!mobileSolid && mobileSolid.vertices.length === 8, mobileSolid && mobileSolid.id);
    const modeMoveBox = await page.locator('#modeMove').boundingBox();
    await page.touchscreen.tap(modeMoveBox.x + modeMoveBox.width / 2, modeMoveBox.y + modeMoveBox.height / 2);
    const cdp = await page.context().newCDPSession(page);
    const touchDrag = async (from, to) => {
      const a = await screen(from), b = await screen(to);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 11, x: a.x, y: a.y }] });
      for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 11, x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8 }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    s = await state();
    const mobileRotate = await page.evaluate((id) => window.__spatial.handles(id).find((h) => h.kind === 'rotate'), mobileSolidId);
    const mobileDistanceBefore = await page.evaluate((id) => { const s=window.__spatial.state(),v=s.runtime.solids[id].vertices; return Math.hypot(s.runtime.points[v[7]].spatialPosition.x-s.runtime.points[v[0]].spatialPosition.x,s.runtime.points[v[7]].spatialPosition.y-s.runtime.points[v[0]].spatialPosition.y,s.runtime.points[v[7]].spatialPosition.z-s.runtime.points[v[0]].spatialPosition.z); }, mobileSolidId);
    await touchDrag(mobileRotate, { x: mobileRotate.x + 32 / s.zoomFactor, y: mobileRotate.y + 24 / s.zoomFactor });
    s = await state();
    const mobileDistanceAfterRotate = await page.evaluate((id) => { const s=window.__spatial.state(),v=s.runtime.solids[id].vertices; return Math.hypot(s.runtime.points[v[7]].spatialPosition.x-s.runtime.points[v[0]].spatialPosition.x,s.runtime.points[v[7]].spatialPosition.y-s.runtime.points[v[0]].spatialPosition.y,s.runtime.points[v[7]].spatialPosition.z-s.runtime.points[v[0]].spatialPosition.z); }, mobileSolidId);
    check('Mobile touch rotation preserves a cube diagonal length', Math.abs(mobileDistanceAfterRotate - mobileDistanceBefore) < 1e-4, { mobileDistanceBefore, mobileDistanceAfterRotate });
    const mobileResize = await page.evaluate((id) => window.__spatial.handles(id).find((h) => h.kind === 'resize' && h.axis === 0), mobileSolidId);
    const mobileSizeBefore = { ...s.runtime.solids[mobileSolidId].size };
    await touchDrag(mobileResize, { x: mobileResize.x + 28 / s.zoomFactor, y: mobileResize.y });
    s = await state();
    const mobileDistanceAfter = await page.evaluate((id) => { const s=window.__spatial.state(),v=s.runtime.solids[id].vertices; return Math.hypot(s.runtime.points[v[7]].spatialPosition.x-s.runtime.points[v[0]].spatialPosition.x,s.runtime.points[v[7]].spatialPosition.y-s.runtime.points[v[0]].spatialPosition.y,s.runtime.points[v[7]].spatialPosition.z-s.runtime.points[v[0]].spatialPosition.z); }, mobileSolidId);
    const expectedMobileDiagonal = Math.hypot(s.runtime.solids[mobileSolidId].size.x, s.runtime.solids[mobileSolidId].size.y, s.runtime.solids[mobileSolidId].size.z);
    check('Mobile touch resizes a dimension and updates the cube diagonal',
      Math.abs(s.runtime.solids[mobileSolidId].size.x - mobileSizeBefore.x) > 4 && Math.abs(mobileDistanceAfter - expectedMobileDiagonal) < 1e-4,
      { sizeBefore: mobileSizeBefore, sizeAfter: s.runtime.solids[mobileSolidId].size, mobileDistanceBefore, mobileDistanceAfter });

    const prePinchDocument = await page.evaluate(() => window.__spatial.serialize());
    const pinchResize = await page.evaluate((id) => window.__spatial.handles(id).find((h) => h.kind === 'resize' && h.axis === 0), mobileSolidId);
    const dragStart = await screen(pinchResize), dragMoved = { x: dragStart.x + 44, y: dragStart.y + 3 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 21, x: dragStart.x, y: dragStart.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 21, x: dragMoved.x, y: dragMoved.y }] });
    s = await state();
    const duringPinchSize = { ...s.runtime.solids[mobileSolidId].size };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 21, x: dragMoved.x, y: dragMoved.y }, { id: 22, x: dragMoved.x + 35, y: dragMoved.y + 8 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    s = await state();
    const postPinchDocument = await page.evaluate(() => window.__spatial.serialize());
    check('Pinch during a mobile handle drag rolls back the preview without changing saved geometry',
      Math.abs(duringPinchSize.x - prePinchDocument.model.solids[mobileSolidId].size.x) > 1 && JSON.stringify(postPinchDocument.model) === JSON.stringify(prePinchDocument.model),
      { duringPinchSize, prePinchSize: prePinchDocument.model.solids[mobileSolidId].size, restoredSize: s.runtime.solids[mobileSolidId].size, postPinchSolid: postPinchDocument.model.solids[mobileSolidId], prePinchSolid: prePinchDocument.model.solids[mobileSolidId] });
    await page.locator('#undo').click();
    s = await state();
    check('Cancelled mobile drag adds no history entry', !!s.runtime.solids[mobileSolidId] && JSON.stringify(s.runtime.solids[mobileSolidId].size) === JSON.stringify(mobileSizeBefore), s.runtime.solids[mobileSolidId]?.size);
    await page.locator('#redo').click();
    s = await state();
    check('Redo restores the mobile resize after cancelled pinch', !!s.runtime.solids[mobileSolidId] && JSON.stringify((await page.evaluate(() => window.__spatial.serialize())).model) === JSON.stringify(prePinchDocument.model), Object.keys(s.runtime.solids ?? {}));
    const mobileMove = await page.locator('#modeMove').boundingBox();
    await page.touchscreen.tap(mobileMove.x + mobileMove.width / 2, mobileMove.y + mobileMove.height / 2);
    const mobileVertex = (await state()).runtime.solids[mobileSolidId].vertices[0];
    await point(mobileVertex);
    await page.screenshot({ path: path.join(OUTPUT, 'spatial-mobile-controls.png') });

    check('No browser exceptions or error dialogs', results.errors.length === 0, results.errors);
    console.log(JSON.stringify({ checks: results.checks.length, passed: results.checks.filter((item) => item.passed).length, errors: results.errors }));
  } finally {
    fs.writeFileSync(path.join(OUTPUT, 'results.json'), JSON.stringify(results, null, 2));
    await browser?.close();
    await server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
