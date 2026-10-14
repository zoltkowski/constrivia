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
        import { spatialFaces as __testSpatialFaces } from './core/spatialGeometry';
        let spatialRevision=0;
        const originalSpatialLoad=applyPersistedDocument;
        applyPersistedDocument=(...args)=>{const value=originalSpatialLoad(...args);spatialRevision++;return value;};
        window.__spatial={
          state:()=>({runtime,mode,selectedSolidId,selectedLineId,selectedPointId,selectedAngleId,selectedPolygonId,panOffset,zoomFactor,revision:spatialRevision}),
          worldToCanvas,serialize:serializeCurrentDocument,
          handles:id=>spatialHandles(runtime,id,screenUnits(26)),
          faces:id=>__testSpatialFaces(runtime,id),
          angleDegrees:id=>spatialAngleDegrees(runtime,runtime.angles[id]),
          angleGeometry:id=>angleGeometry(runtime.angles[id]),
          angleHit:p=>findAngleAt(p),
          pointHit:p=>findPoint(p),edgeHit:p=>spatialEdgeAt(p),
          faceHit:p=>{const f=hitSpatialFace(runtime,p,showHidden);return f?{solidId:f.solidId,axis:f.axis,side:f.side,visible:f.visible}:null;}
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
    const clearSelectionAtBlankCanvas = async () => {
      await page.locator('#modeMove').click();
      const blank = await page.evaluate(() => {
        const canvas=document.getElementById('canvas'),r=canvas.getBoundingClientRect(),s=window.__spatial.state();
        for(let y=r.top+90;y<r.bottom-90;y+=24)for(let x=r.left+60;x<r.right-60;x+=24){
          if(document.elementFromPoint(x,y)?.id!=='canvas')continue;
          const p={x:(x-r.left-s.panOffset.x)/s.zoomFactor,y:(y-r.top-s.panOffset.y)/s.zoomFactor};
          if(!window.__spatial.pointHit(p)&&!window.__spatial.edgeHit(p)&&!window.__spatial.faceHit(p))return{x,y};
        }
        return null;
      });
      if(!blank)throw new Error('Could not find a blank canvas point to clear selection');
      await page.mouse.click(blank.x,blank.y);
    };
    const point = async (id) => clickWorld((await state()).runtime.points[id]);
    const edgeMidpoint = async (id, axisBit) => page.evaluate(({ id, axisBit }) => {
      const s = window.__spatial.state(), solid = s.runtime.solids[id];
      const line = solid.edges.map(eid => s.runtime.lines[eid]).find(l => {
        const [a,b]=l.defining_points.map(pid=>solid.vertices.indexOf(pid)); return (a ^ b) === axisBit;
      });
      if (!line) return null;
      const [a,b]=line.defining_points.map(pid=>s.runtime.points[pid]);
      return { x:(a.x+b.x)/2, y:(a.y+b.y)/2, lineId:line.id };
    }, { id, axisBit });
    const faceInterior = async (id, axis, side, excludePolygonId = null) => page.evaluate(({ id, axis, side, excludePolygonId }) => {
      const s=window.__spatial.state(),faces=window.__spatial.faces(id).filter(f=>f.visible&&(axis===null||f.axis===axis)&&(side===null||f.side===side));
      for(const face of faces){
        const polygon=Object.values(s.runtime.polygons).find(p=>p.solidFace?.solidId===id&&p.solidFace.axis===face.axis&&p.solidFace.side===face.side);
        if(!polygon||polygon.id===excludePolygonId)continue;
        const [a,b,c,d]=face.points;
        for(const u of [.2,.35,.5,.65,.8])for(const v of [.2,.35,.5,.65,.8]){
          const p={x:a.x*(1-u)*(1-v)+b.x*u*(1-v)+c.x*u*v+d.x*(1-u)*v,y:a.y*(1-u)*(1-v)+b.y*u*(1-v)+c.y*u*v+d.y*(1-u)*v};
          if(!window.__spatial.pointHit(p)&&!window.__spatial.edgeHit(p)&&window.__spatial.angleHit(p)===null)return {...p,axis:face.axis,side:face.side,polygonId:polygon.id};
        }
      }
      return null;
    }, { id, axis, side, excludePolygonId });
    const solidFaceEntries = (runtime, id) => Object.values(runtime.polygons ?? {}).filter((polygon) => polygon.solidFace?.solidId === id);
    const userPolygonEntries = (runtime) => Object.values(runtime.polygons ?? {}).filter((polygon) => !polygon.solidFace);
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
      if (!(await page.locator('#cloudPanel').isVisible())) {
        if (!(await page.locator('#cloudFilesBtn').isVisible())) await clearSelectionAtBlankCanvas();
        await page.locator('#cloudFilesBtn').click();
      }
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
    check('Cube tool click creates one solid with eight unlabeled corners, twelve edges, and six faces',
      !!solid && Object.keys(s.runtime.solids).length === 1 && solid.vertices.length === 8 && solid.edges.length === 12 &&
      solid.vertices.every((id) => !s.runtime.points[id]?.label?.text) && solidFaceEntries(s.runtime, solidId).length === 6,
      solid && { id: solidId, vertices: solid.vertices.length, edges: solid.edges.length, faces:solidFaceEntries(s.runtime,solidId).map(p=>p.solidFace) });

    await page.locator('#undo').click();
    check('Undo removes the newly created cube', !((await state()).runtime.solids ?? {})[solidId], null);
    await page.locator('#redo').click();
    s = await state(); solid = s.runtime.solids[solidId];
    check('Redo restores the same cube, construction edges, and stable face records', !!solid && solid.vertices.length === 8 && solid.edges.length === 12 && solidFaceEntries(s.runtime,solidId).length===6, solid && {id:solid.id,faces:solidFaceEntries(s.runtime,solidId).map(p=>p.id)});

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
    check('Selected cube exposes only the rotation control', JSON.stringify((await page.evaluate((id) => window.__spatial.handles(id).map(h=>h.kind),solidId)))==='["rotate"]', await page.evaluate((id) => window.__spatial.handles(id).map(h=>h.kind),solidId));
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

    // Edges and unselected faces move a cube; selecting a face first makes its next drag resize it.
    await selectPoint(s.runtime.solids[solidId].vertices[0]);
    s = await state(); solid = s.runtime.solids[solidId];
    const sizeBeforeEdgeMove = { ...solid.size }, anchorBeforeEdgeMove = { ...s.runtime.spatialGroups[solid.groupId].anchor };
    const moveEdge = await edgeMidpoint(solidId, 1);
    check('Cube edge is available as a group-move target', !!moveEdge, moveEdge);
    await dragWorld(moveEdge, { x: moveEdge.x + 42 / s.zoomFactor, y: moveEdge.y + 8 / s.zoomFactor });
    s = await state(); solid = s.runtime.solids[solidId];
    check('Dragging a cube edge moves the group without resizing it', Math.hypot(s.runtime.spatialGroups[solid.groupId].anchor.x-anchorBeforeEdgeMove.x,s.runtime.spatialGroups[solid.groupId].anchor.y-anchorBeforeEdgeMove.y)>8 && JSON.stringify(solid.size)===JSON.stringify(sizeBeforeEdgeMove), { anchorBeforeEdgeMove, anchorAfter:s.runtime.spatialGroups[solid.groupId].anchor, sizeBeforeEdgeMove, sizeAfter:solid.size });

    const unselectedFace = await faceInterior(solidId, null, null);
    const sizeBeforeFaceMove = { ...solid.size }, anchorBeforeFaceMove = { ...s.runtime.spatialGroups[solid.groupId].anchor };
    check('Unselected cube face has an interior move target', !!unselectedFace, unselectedFace);
    await dragWorld(unselectedFace, { x: unselectedFace.x + 36 / s.zoomFactor, y: unselectedFace.y + 16 / s.zoomFactor });
    s = await state(); solid = s.runtime.solids[solidId];
    check('Dragging an unselected face moves the group without resizing it', Math.hypot(s.runtime.spatialGroups[solid.groupId].anchor.x-anchorBeforeFaceMove.x,s.runtime.spatialGroups[solid.groupId].anchor.y-anchorBeforeFaceMove.y)>8 && JSON.stringify(solid.size)===JSON.stringify(sizeBeforeFaceMove), { anchorBeforeFaceMove, anchorAfter:s.runtime.spatialGroups[solid.groupId].anchor, sizeBeforeFaceMove, sizeAfter:solid.size });

    const resizeFace = await faceInterior(solidId, unselectedFace.axis, 1);
    await clickWorld(resizeFace);
    s = await state();
    check('Clicking a face without movement selects that face', s.selectedPolygonId===resizeFace.polygonId && s.runtime.polygons[resizeFace.polygonId]?.solidFace?.solidId===solidId, { selectedPolygonId:s.selectedPolygonId, target:resizeFace });
    const selectedFaceCenter = await faceInterior(solidId, resizeFace.axis, resizeFace.side);
    const sizeBeforeResize = { ...s.runtime.solids[solidId].size };
    const resizeDelta = await page.evaluate(({ id, face }) => {
      const s=window.__spatial.state(),solid=s.runtime.solids[id],a=s.runtime.points[solid.vertices[0]],b=s.runtime.points[solid.vertices[1<<face.axis]],length=Math.hypot(b.x-a.x,b.y-a.y),direction=face.side?1:-1;
      return {x:(b.x-a.x)/length*direction*32,y:(b.y-a.y)/length*direction*32};
    }, {id:solidId,face:resizeFace});
    await dragWorld(selectedFaceCenter, { x:selectedFaceCenter.x+resizeDelta.x, y:selectedFaceCenter.y+resizeDelta.y });
    s = await state();
    const sizeAfterResize = { ...s.runtime.solids[solidId].size }, resizedDimension = ['x','y','z'][resizeFace.axis];
    check('Dragging the selected face resizes its matching cube dimension', Math.abs(sizeAfterResize[resizedDimension]-sizeBeforeResize[resizedDimension])>8, { dimension:resizedDimension, sizeBeforeResize, sizeAfterResize });
    await page.locator('#undo').click();
    check('Undo restores the selected face dimension', Math.abs((await state()).runtime.solids[solidId].size[resizedDimension]-sizeBeforeResize[resizedDimension])<1e-6, (await state()).runtime.solids[solidId].size);
    await page.locator('#redo').click();
    check('Redo restores the resized face dimension', Math.abs((await state()).runtime.solids[solidId].size[resizedDimension]-sizeAfterResize[resizedDimension])<1e-6, (await state()).runtime.solids[solidId].size);

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
    const resizeAgain = await faceInterior(solidId, null, null);
    await clickWorld(resizeAgain);
    const resizeAgainCenter = await faceInterior(solidId, resizeAgain.axis, resizeAgain.side);
    const resizeAgainDelta = await page.evaluate(({ id, face }) => {
      const s=window.__spatial.state(),solid=s.runtime.solids[id],a=s.runtime.points[solid.vertices[0]],b=s.runtime.points[solid.vertices[1<<face.axis]],length=Math.hypot(b.x-a.x,b.y-a.y),direction=face.side?1:-1;
      return {x:(b.x-a.x)/length*direction*28,y:(b.y-a.y)/length*direction*28};
    }, {id:solidId,face:resizeAgain});
    await dragWorld(resizeAgainCenter, { x:resizeAgainCenter.x+resizeAgainDelta.x, y:resizeAgainCenter.y+resizeAgainDelta.y });
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

    // Set a custom spatial vertex color through the style controls.
    s = await state();
    const styledVertex = s.runtime.solids[solidId].vertices[0];
    await page.locator('#modeMove').click();
    await point(styledVertex);
    await page.locator('#styleMenu').click();
    await page.locator('#styleColor').evaluate((el) => { el.value = '#bb4477'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    s = await state();
    check('Style color control applies a custom color to a spatial vertex', s.runtime.points[styledVertex].style.color === '#bb4477', s.runtime.points[styledVertex].style);

    await page.locator('#styleMenu').click();
    await clickCanvasAt(90, 90);

    const saved = await page.evaluate(() => window.__spatial.serialize());
    const savedFaceIds = Object.fromEntries(Object.values(saved.model.solids ?? {}).map(solid => [solid.id,[...(solid.faces??[])].sort()]));
    const file = archive('spatial-roundtrip', saved);
    fs.writeFileSync(path.join(OUTPUT, 'experimental-cubes.ctr'), Buffer.from(file.bytes));
    await page.evaluate((entry) => window.__spatialFiles.push(entry), file);
    await loadFromFilePane('spatial-roundtrip');
    s = await state();
    solid = s.runtime.solids[solidId];
    check('File pane reload preserves attached and independent cubes, shared geometry, styles, unlabeled corners and spatial points',
      !!solid && Object.keys(s.runtime.solids).length === 3 && solid.vertices.length === 8 && solid.edges.length === 12 &&
      Object.values(s.runtime.points).some((p) => p.spatial?.binding.kind === 'edge') &&
      Object.values(s.runtime.lines).some((line) => line.defining_points[0] === solid.vertices[0] && line.defining_points[1] === solid.vertices[7]) &&
      solid.vertices.every((id) => !s.runtime.points[id]?.label?.text) &&
      Object.values(s.runtime.solids).every(item => item.faces?.length===6 && JSON.stringify([...item.faces].sort())===JSON.stringify(savedFaceIds[item.id])) && Object.values(s.runtime.polygons).filter(p=>p.solidFace).length===18 &&
      s.runtime.points[styledVertex].style.color === '#bb4477' &&
      Object.keys(saved.model.solids ?? {}).length === 3 && Object.keys(saved.model.spatialGroups ?? {}).length === 2,
      { solids: Object.keys(s.runtime.solids ?? {}).length, groups: Object.keys(s.runtime.spatialGroups ?? {}).length, points: Object.keys(s.runtime.points).length, lines: Object.keys(s.runtime.lines).length, faces:Object.values(s.runtime.solids).map(item=>item.faces),solidFacePolygons:Object.values(s.runtime.polygons).filter(p=>p.solidFace).length });

    await page.locator('#modeMove').click();
    await point(styledVertex);
    await page.screenshot({ path: path.join(OUTPUT, 'spatial-controls.png') });

    // Mobile touch flow: create, rotate and resize from an edge; a two-finger gesture during a drag must roll back.
    const empty = archive('spatial-empty', { model: {} });
    await page.evaluate((entry) => window.__spatialFiles.push(entry), empty);
    await clickCanvasAt(90, 90);
    await loadFromFilePane('spatial-empty');

    // Exercise the spatial construction tools through their actual toolbar and canvas input paths.
    const toolCubeScreen = { x: center.x, y: center.y };
    await page.locator('#modeCube').click();
    await clickCanvasAt(toolCubeScreen.x, toolCubeScreen.y);
    s = await state();
    const toolSolidId = s.selectedSolidId, toolSolid = s.runtime.solids[toolSolidId];
    const toolFaceIds = solidFaceEntries(s.runtime,toolSolidId).map(p=>p.id).sort();
    check('New spatial cube has six stable face ids and no automatic corner labels', !!toolSolid && toolFaceIds.length===6 && toolSolid.faces?.length===6 && toolSolid.vertices.every((id) => !s.runtime.points[id]?.label?.text), toolSolid && {faces:toolSolid.faces,labels:toolSolid.vertices.map(id=>s.runtime.points[id]?.label)});

    await page.locator('#modeMove').click();
    await point(toolSolid.vertices[0]);
    await page.locator('#modeLabel').click();
    s = await state();
    check('Label tool labels an individually selected spatial point', !!s.runtime.points[toolSolid.vertices[0]]?.label?.text, s.runtime.points[toolSolid.vertices[0]]?.label);

    const labeledEdge = await edgeMidpoint(toolSolidId, 1);
    await page.locator('#modeMove').click();
    await clickWorld(labeledEdge);
    await page.locator('#modeLabel').click();
    s = await state();
    check('Label tool labels an individually selected spatial edge', !!s.runtime.lines[labeledEdge.lineId]?.label?.text, s.runtime.lines[labeledEdge.lineId]?.label);

    const selectableFace = await faceInterior(toolSolidId,null,null);
    await page.locator('#modeMove').click();
    await clickWorld(selectableFace);
    s = await state();
    check('Clicking a solid face selects its stable face polygon', s.selectedPolygonId===selectableFace.polygonId && s.runtime.polygons[s.selectedPolygonId]?.solidFace?.solidId===toolSolidId && s.selectedPointId===null && s.selectedLineId===null, { selectedPolygonId:s.selectedPolygonId, selectedPointId:s.selectedPointId, selectedLineId:s.selectedLineId, selectableFace });
    const selectedFaceVertices=s.runtime.polygons[selectableFace.polygonId].points;
    await page.locator('#modeLabel').click();
    s = await state();
    check('Label tool labels the four corners of the selected cube face', selectedFaceVertices.every((id) => !!s.runtime.points[id]?.label?.text), selectedFaceVertices.map((id)=>s.runtime.points[id]?.label?.text));
    await page.locator('#styleMenu').click();
    await page.locator('#styleColor').evaluate((el) => { el.value = '#dd8844'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    s = await state();
    check('Style color applies to the selected solid face', s.runtime.polygons[selectableFace.polygonId]?.fill === '#dd8844', s.runtime.polygons[selectableFace.polygonId]);
    await page.locator('#styleMenu').click();

    const rotateToSelectBody=await page.evaluate((id)=>window.__spatial.handles(id).find(h=>h.kind==='rotate'),toolSolidId);
    await clickWorld(rotateToSelectBody);
    s=await state();
    check('Clicking the rotation control clears face selection and selects the whole cube',s.selectedSolidId===toolSolidId&&s.selectedPolygonId===null&&s.selectedPointId===null&&s.selectedLineId===null,{selectedSolidId:s.selectedSolidId,selectedPolygonId:s.selectedPolygonId,selectedPointId:s.selectedPointId,selectedLineId:s.selectedLineId});
    await page.locator('#modeLabel').click();
    s=await state();
    check('Label tool labels all eight corners of the selected cube body',s.runtime.solids[toolSolidId].vertices.every(id=>!!s.runtime.points[id]?.label?.text),s.runtime.solids[toolSolidId].vertices.map(id=>s.runtime.points[id]?.label?.text));

    const toolVertices = toolSolid.vertices;
    await page.locator('#modePolygon').click();
    await point(toolVertices[0]); await point(toolVertices[1]); await point(toolVertices[3]); await point(toolVertices[4]);
    s = await state();
    check('Polygon tool rejects a noncoplanar fourth point without adding a user polygon or geometry', userPolygonEntries(s.runtime).length === 0 && Object.keys(s.runtime.lines).length === 12 && Object.keys(s.runtime.points).length === 8, { userPolygons: userPolygonEntries(s.runtime).length, solidFaces:solidFaceEntries(s.runtime,toolSolidId).length, lines: Object.keys(s.runtime.lines).length, points: Object.keys(s.runtime.points).length });
    await point(toolVertices[2]); await point(toolVertices[0]);
    s = await state();
    const toolPolygonId = userPolygonEntries(s.runtime)[0]?.id;
    check('The polygon tool retains its valid chain, excludes the rejected point, and closes the intended face', !!toolPolygonId && JSON.stringify(s.runtime.polygons[toolPolygonId].points) === JSON.stringify([toolVertices[0],toolVertices[1],toolVertices[3],toolVertices[2]]) && Object.keys(s.runtime.lines).length === 12 && Object.keys(s.runtime.points).length === 8, { polygonId: toolPolygonId, polygon:s.runtime.polygons[toolPolygonId]?.points, lines: Object.keys(s.runtime.lines).length, points: Object.keys(s.runtime.points).length });
    await page.locator('#styleMenu').click();
    await page.locator('#styleColor').evaluate((el) => { el.value = '#55aa77'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    s = await state();
    check('Fill style applies to the selected spatial polygon', s.runtime.polygons[toolPolygonId]?.fill === '#55aa77', s.runtime.polygons[toolPolygonId]);
    await page.locator('#styleMenu').click();

    await page.locator('#modeAngle').click();
    await point(toolVertices[1]); await point(toolVertices[0]); await point(toolVertices[2]);
    s = await state();
    const pointAngleId = Object.keys(s.runtime.angles)[0];
    check('Angle tool creates a 3D angle from three points with the middle point as vertex', !!pointAngleId && Math.abs(await page.evaluate((id) => window.__spatial.angleDegrees(id), pointAngleId) - 90) < 1e-5, pointAngleId && s.runtime.angles[pointAngleId]);

    const angleArcTarget = await page.evaluate((id) => {
      const geom=window.__spatial.angleGeometry(id);
      for (const p of geom?.spatialArc ?? []) {
        if (!window.__spatial.pointHit(p) && window.__spatial.angleHit(p) === id) return p;
      }
      return null;
    }, pointAngleId);
    check('3D angle arc exposes a pickable location', !!angleArcTarget, angleArcTarget);
    await page.locator('#modeMove').click();
    await clickWorld(angleArcTarget);
    s = await state();
    check('Clicking the spatial angle arc selects that angle', s.selectedAngleId === pointAngleId && s.selectedPointId === null, { selectedAngleId:s.selectedAngleId, selectedPointId:s.selectedPointId });
    await page.locator('#styleMenu').click();
    await page.locator('#styleColor').evaluate((el) => { el.value = '#ff00ff'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    s = await state();
    check('Style color control applies to the selected spatial angle', s.runtime.angles[pointAngleId]?.style?.color === '#ff00ff', s.runtime.angles[pointAngleId]?.style);
    await page.locator('#styleMenu').click();
    await clickCanvasAt(90, 90);
    const visibleAngleArc = await page.evaluate((id) => {
      const geom=window.__spatial.angleGeometry(id),canvas=document.getElementById('canvas'),rect=canvas.getBoundingClientRect(),ctx=canvas.getContext('2d');
      for(const p of geom?.spatialArc??[]){
        const c=window.__spatial.worldToCanvas(p.x,p.y),cx=Math.round(c.x*canvas.width/rect.width),cy=Math.round(c.y*canvas.height/rect.height);
        for(let y=Math.max(0,cy-2);y<=Math.min(canvas.height-1,cy+2);y++)for(let x=Math.max(0,cx-2);x<=Math.min(canvas.width-1,cx+2);x++){
          const pixel=ctx.getImageData(x,y,1,1).data;
          if(pixel[0]>160&&pixel[1]<100&&pixel[2]>160)return {x:c.x,y:c.y,pixel:Array.from(pixel)};
        }
      }
      return null;
    }, pointAngleId);
    check('Magenta pixels from the spatial angle arc are visible on the canvas', !!visibleAngleArc, visibleAngleArc);

    await page.locator('#modeAngle').click();
    await clickWorld(await edgeMidpoint(toolSolidId, 1)); await clickWorld(await edgeMidpoint(toolSolidId, 2));
    s = await state();
    const lineAngleId = Object.keys(s.runtime.angles).find((id) => id !== pointAngleId);
    check('Angle tool also accepts two spatial edges', !!lineAngleId && Math.abs(await page.evaluate((id) => window.__spatial.angleDegrees(id), lineAngleId) - 90) < 1e-5, lineAngleId && s.runtime.angles[lineAngleId]);

    await page.locator('#modeParallel').click();
    await point(toolVertices[4]); await clickWorld(await edgeMidpoint(toolSolidId, 1));
    s = await state();
    const parallelLineId = Object.keys(s.runtime.lines).find((id) => {
      const line = s.runtime.lines[id], binding = s.runtime.points[line.defining_points[1]]?.spatial?.binding;
      return line.defining_parents?.includes(toolVertices[4]) && binding?.kind === 'direction' && !binding.perpendicular;
    });
    check('Parallel tool accepts a spatial point and reference edge', !!parallelLineId && s.runtime.lines[parallelLineId].geometryValid, parallelLineId && s.runtime.lines[parallelLineId]);

    await page.locator('#modePerpendicular').click();
    await point(toolVertices[4]); await clickWorld(await edgeMidpoint(toolSolidId, 1)); await point(toolVertices[2]);
    s = await state();
    const perpendicularPointGuideId = Object.keys(s.runtime.lines).find((id) => {
      const line = s.runtime.lines[id], binding = s.runtime.points[line.defining_points[1]]?.spatial?.binding;
      return line.defining_parents?.includes(toolVertices[2]) && binding?.kind === 'direction' && binding.perpendicular && binding.planeGuide === toolVertices[2];
    });
    check('Perpendicular tool accepts an extra point to define the plane', !!perpendicularPointGuideId && s.runtime.lines[perpendicularPointGuideId].geometryValid, perpendicularPointGuideId && s.runtime.lines[perpendicularPointGuideId]);

    await page.locator('#modePerpendicular').click();
    await point(toolVertices[4]); await clickWorld(await edgeMidpoint(toolSolidId, 1)); await clickWorld(await edgeMidpoint(toolSolidId, 2));
    s = await state();
    const perpendicularEdgeGuideId = Object.keys(s.runtime.lines).find((id) => {
      const line = s.runtime.lines[id], binding = s.runtime.points[line.defining_points[1]]?.spatial?.binding;
      return line.defining_parents?.includes(toolVertices[4]) && binding?.kind === 'direction' && binding.perpendicular && Array.isArray(binding.planeGuide);
    });
    check('Perpendicular tool accepts an extra edge to define the plane', !!perpendicularEdgeGuideId && s.runtime.lines[perpendicularEdgeGuideId].geometryValid, perpendicularEdgeGuideId && s.runtime.lines[perpendicularEdgeGuideId]);

    const angleBeforeTransform = await page.evaluate((id) => window.__spatial.angleDegrees(id), pointAngleId);
    await page.locator('#modeMove').click();
    await clickWorld(await faceInterior(toolSolidId, 1, null));
    const toolRotateHandle = await page.evaluate((id) => window.__spatial.handles(id).find((h) => h.kind === 'rotate'), toolSolidId);
    s = await state();
    await dragWorld(toolRotateHandle, { x: toolRotateHandle.x + 40 / s.zoomFactor, y: toolRotateHandle.y + 25 / s.zoomFactor });
    const angleAfterRotate = await page.evaluate((id) => window.__spatial.angleDegrees(id), pointAngleId);
    check('3D angle measurement remains correct after rotating its spatial group', Math.abs(angleAfterRotate - angleBeforeTransform) < 1e-5, { angleBeforeTransform, angleAfterRotate });
    const angleResizeFace = await faceInterior(toolSolidId, null, null);
    await clickWorld(angleResizeFace);
    const resizeFaceCenter = await faceInterior(toolSolidId, angleResizeFace.axis, angleResizeFace.side);
    const resizeFaceDelta = await page.evaluate(({ id, face }) => {
      const s=window.__spatial.state(),solid=s.runtime.solids[id],a=s.runtime.points[solid.vertices[0]],b=s.runtime.points[solid.vertices[1<<face.axis]],length=Math.hypot(b.x-a.x,b.y-a.y),direction=face.side?1:-1;
      return {x:(b.x-a.x)/length*direction*24,y:(b.y-a.y)/length*direction*24};
    }, {id:toolSolidId,face:angleResizeFace});
    s = await state();
    await dragWorld(resizeFaceCenter, { x:resizeFaceCenter.x+resizeFaceDelta.x, y:resizeFaceCenter.y+resizeFaceDelta.y });
    const angleAfterResize = await page.evaluate((id) => window.__spatial.angleDegrees(id), pointAngleId);
    check('3D angle measurement remains correct after resizing a face', Math.abs(angleAfterResize - angleBeforeTransform) < 1e-5, { angleBeforeTransform, angleAfterResize });

    const spatialToolsDoc = await page.evaluate(() => window.__spatial.serialize());
    const spatialToolsFile = archive('spatial-tools-roundtrip', spatialToolsDoc);
    fs.writeFileSync(path.join(OUTPUT, 'spatial-construction-tools.ctr'),Buffer.from(spatialToolsFile.bytes));
    await page.screenshot({path:path.join(OUTPUT,'spatial-construction-tools.png')});
    await page.evaluate((entry) => window.__spatialFiles.push(entry), spatialToolsFile);
    await loadFromFilePane('spatial-tools-roundtrip');
    s = await state();
    check('Archive reload preserves labels, user and solid face fills, stable face ids, both 3D angles, and dependent directions',
      !!s.runtime.polygons[toolPolygonId] && s.runtime.polygons[toolPolygonId].fill === '#55aa77' &&
      s.runtime.solids[toolSolidId].faces?.length===6 && JSON.stringify([...s.runtime.solids[toolSolidId].faces].sort())===JSON.stringify(toolFaceIds) &&
      solidFaceEntries(s.runtime,toolSolidId).some(p=>p.id===selectableFace.polygonId&&p.fill==='#dd8844') &&
      !!s.runtime.angles[pointAngleId] && !!s.runtime.angles[lineAngleId] &&
      !!s.runtime.lines[parallelLineId] && !!s.runtime.lines[perpendicularPointGuideId] && !!s.runtime.lines[perpendicularEdgeGuideId] &&
      s.runtime.solids[toolSolidId].vertices.every((id) => !!s.runtime.points[id]?.label?.text) && !!s.runtime.lines[labeledEdge.lineId]?.label?.text,
      { polygons: Object.keys(s.runtime.polygons).length, angles: Object.keys(s.runtime.angles).length, lines: Object.keys(s.runtime.lines).length, faces:s.runtime.solids[toolSolidId].faces, solidFaceFills:solidFaceEntries(s.runtime,toolSolidId).map(p=>p.fill), solidLabels:s.runtime.solids[toolSolidId].vertices.map((id)=>s.runtime.points[id]?.label?.text), edgeLabel:s.runtime.lines[labeledEdge.lineId]?.label?.text });

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
    check('Mobile touch creates a cube with six stable faces', !!mobileSolid && mobileSolid.vertices.length === 8 && solidFaceEntries(s.runtime,mobileSolidId).length===6 && mobileSolid.faces?.length===6, mobileSolid && {id:mobileSolid.id,faces:mobileSolid.faces});
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
    const mobileFace = await faceInterior(mobileSolidId,null,null);
    await page.touchscreen.tap(...Object.values(await screen(mobileFace)));
    s=await state();
    check('Mobile tap selects a stable solid face before resizing',s.selectedPolygonId===mobileFace.polygonId,{selectedPolygonId:s.selectedPolygonId,mobileFace});
    const mobileResize = await faceInterior(mobileSolidId,mobileFace.axis,mobileFace.side);
    const mobileSizeBefore = { ...s.runtime.solids[mobileSolidId].size };
    const mobileResizeDelta = await page.evaluate(({id,face})=>{
      const s=window.__spatial.state(),solid=s.runtime.solids[id],a=s.runtime.points[solid.vertices[0]],b=s.runtime.points[solid.vertices[1<<face.axis]],length=Math.hypot(b.x-a.x,b.y-a.y),direction=face.side?1:-1;
      return {x:(b.x-a.x)/length*direction*28,y:(b.y-a.y)/length*direction*28,dimension:['x','y','z'][face.axis]};
    },{id:mobileSolidId,face:mobileResize});
    await touchDrag(mobileResize, { x: mobileResize.x + mobileResizeDelta.x, y: mobileResize.y + mobileResizeDelta.y });
    s = await state();
    const mobileDistanceAfter = await page.evaluate((id) => { const s=window.__spatial.state(),v=s.runtime.solids[id].vertices; return Math.hypot(s.runtime.points[v[7]].spatialPosition.x-s.runtime.points[v[0]].spatialPosition.x,s.runtime.points[v[7]].spatialPosition.y-s.runtime.points[v[0]].spatialPosition.y,s.runtime.points[v[7]].spatialPosition.z-s.runtime.points[v[0]].spatialPosition.z); }, mobileSolidId);
    const expectedMobileDiagonal = Math.hypot(s.runtime.solids[mobileSolidId].size.x, s.runtime.solids[mobileSolidId].size.y, s.runtime.solids[mobileSolidId].size.z);
    check('Mobile touch resizes a dimension and updates the cube diagonal',
      Math.abs(s.runtime.solids[mobileSolidId].size[mobileResizeDelta.dimension] - mobileSizeBefore[mobileResizeDelta.dimension]) > 1 && Math.abs(mobileDistanceAfter - expectedMobileDiagonal) < 1e-4,
      { dimension:mobileResizeDelta.dimension, sizeBefore: mobileSizeBefore, sizeAfter: s.runtime.solids[mobileSolidId].size, mobileDistanceBefore, mobileDistanceAfter });

    const prePinchDocument = await page.evaluate(() => window.__spatial.serialize());
    const pinchResize = await faceInterior(mobileSolidId,mobileFace.axis,mobileFace.side);
    await page.touchscreen.tap(...Object.values(await screen(pinchResize)));
    const pinchDelta=await page.evaluate(({id,face})=>{
      const s=window.__spatial.state(),solid=s.runtime.solids[id],a=s.runtime.points[solid.vertices[0]],b=s.runtime.points[solid.vertices[1<<face.axis]],length=Math.hypot(b.x-a.x,b.y-a.y),direction=face.side?1:-1;
      return {x:(b.x-a.x)/length*direction*34,y:(b.y-a.y)/length*direction*34,dimension:['x','y','z'][face.axis]};
    },{id:mobileSolidId,face:pinchResize});
    const dragStart = await screen(pinchResize), dragEnd=await screen({x:pinchResize.x+pinchDelta.x,y:pinchResize.y+pinchDelta.y}),dragMoved = { x:dragStart.x+(dragEnd.x-dragStart.x)*.7, y:dragStart.y+(dragEnd.y-dragStart.y)*.7 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 21, x: dragStart.x, y: dragStart.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 21, x: dragMoved.x, y: dragMoved.y }] });
    s = await state();
    const duringPinchSize = { ...s.runtime.solids[mobileSolidId].size };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 21, x: dragMoved.x, y: dragMoved.y }, { id: 22, x: dragMoved.x + 35, y: dragMoved.y + 8 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    s = await state();
    const postPinchDocument = await page.evaluate(() => window.__spatial.serialize());
    check('Pinch during a mobile handle drag rolls back the preview without changing saved geometry',
      Math.abs(duringPinchSize[pinchDelta.dimension] - prePinchDocument.model.solids[mobileSolidId].size[pinchDelta.dimension]) > 1 && JSON.stringify(postPinchDocument.model) === JSON.stringify(prePinchDocument.model),
      { duringPinchSize, prePinchSize: prePinchDocument.model.solids[mobileSolidId].size, restoredSize: s.runtime.solids[mobileSolidId].size, postPinchSolid: postPinchDocument.model.solids[mobileSolidId], prePinchSolid: prePinchDocument.model.solids[mobileSolidId], changedCollections:Object.keys(prePinchDocument.model).filter(k=>JSON.stringify(prePinchDocument.model[k])!==JSON.stringify(postPinchDocument.model[k])) });
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
