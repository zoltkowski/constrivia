// End-to-end regression for copying complete spatial groups through the visible UI.
// The injected bridge is read-only: all model changes in this test come from UI gestures.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { zipSync, strToU8 } = require('fflate');

const OUT = path.resolve(__dirname, '../../output/playwright/copy-audit-3d');
fs.mkdirSync(OUT, { recursive: true });
const report = { title: 'Kopiowanie brył 3D', checks: [], errors: [] };
const check = (name, pass, observed = {}) => {
  report.checks.push({ name, passed: !!pass, observed });
  if (!pass) throw new Error(`${name}: ${JSON.stringify(observed)}`);
};
const keys = value => Object.keys(value || {});
const serializeGroup = (runtime, solidId) => {
  const solid = runtime.solids?.[solidId];
  if (!solid) return null;
  const groupId = solid.groupId;
  const pointIds = keys(runtime.points).filter(id => runtime.points[id]?.spatial?.groupId === groupId);
  const lineIds = keys(runtime.lines).filter(id => {
    const line=runtime.lines[id];
    return line?.spatialGroupId === groupId || line?.spatialParameters?.groupId === groupId ||
      (line?.defining_points?.length===2 && line.defining_points.every(pointId=>runtime.points[pointId]?.spatial?.groupId===groupId));
  });
  const faceIds = keys(runtime.polygons).filter(id => runtime.polygons[id]?.spatialGroupId === groupId);
  const angleIds = keys(runtime.angles).filter(id => {
    const angle = runtime.angles[id];
    return angle?.spatial?.groupId === groupId || runtime.points[angle?.vertex]?.spatial?.groupId === groupId;
  });
  return {
    solid, groupId, spatialGroup:runtime.spatialGroups?.[groupId], pointIds, lineIds, faceIds, angleIds,
    points: pointIds.map(id => runtime.points[id]),
    lines: lineIds.map(id => runtime.lines[id]),
    faces: faceIds.map(id => runtime.polygons[id]),
    angles: angleIds.map(id => runtime.angles[id])
  };
};

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5200, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
    for (const scenario of [
      { kind: 'cube', tool: 'Prism', sides: 4, expectedVertices: 8, expectedEdges: 12 },
      { kind: 'prism', sides: 3, expectedVertices: 6, expectedEdges: 9 },
      { kind: 'pyramid', sides: 4, expectedVertices: 5, expectedEdges: 8 }
    ]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
      await page.addInitScript(() => {
        window.__copy3dFiles = [];
        window.showDirectoryPicker = async () => ({ name:'Copy regression', kind:'directory', queryPermission:async()=> 'granted', requestPermission:async()=> 'granted',
          async *values() { for (const file of window.__copy3dFiles) yield { kind:'file', name:file.name,
            getFile:async()=>new File([new Uint8Array(file.bytes)],file.name,{type:'application/zip'}) }; }
        });
      });
      page.on('pageerror', error => report.errors.push(`${scenario.kind}: ${error.message}`));
      page.on('dialog', async dialog => { report.errors.push(`${scenario.kind}: ${dialog.message()}`); await dialog.dismiss(); });
      await page.route('**/src/main.ts*', async route => {
        const response = await route.fetch();
        const suffix = `
          import { spatialHandles as __copy3dHandles } from './core/spatialGeometry';
          let __copy3dRevision=0;const __copy3dLoad=applyPersistedDocument;
          applyPersistedDocument=(...args)=>{const value=__copy3dLoad(...args);__copy3dRevision++;return value;};
          window.__copy3d = {
            state: () => ({ runtime, mode, selectedSolidId, selectedPointId, selectedLineId, selectedPolygonId,
              multi: { points:[...multiSelectedPoints], lines:[...multiSelectedLines], polygons:[...multiSelectedPolygons],
                angles:[...multiSelectedAngles] },
              clipboard: copiedObjects ? JSON.parse(JSON.stringify(copiedObjects)) : null, historyIndex, panOffset, zoomFactor, revision:__copy3dRevision, multiMoveActive }),
            serialize: serializeCurrentDocument,
            worldToCanvas, handles:id=>__copy3dHandles(runtime,id,screenUnits(26)), multiHandles:getMultiHandles
          };
        `;
        await route.fulfill({ response, body: `${await response.text()}\n${suffix}` });
      });
      await page.goto('http://127.0.0.1:5200/', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__copy3d);
      if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
      const state = () => page.evaluate(() => window.__copy3d.state());
      const canvasRect = () => page.locator('#canvas').evaluate(canvas => { const r = canvas.getBoundingClientRect(); return { left:r.left, top:r.top, width:r.width, height:r.height }; });
      const clickCanvas = async (x, y) => { const r = await canvasRect(); await page.mouse.click(r.left + x, r.top + y); };
      const screen = async p => page.evaluate(p=>{const r=document.querySelector('#canvas').getBoundingClientRect(),q=window.__copy3d.worldToCanvas(p.x,p.y);return{x:r.left+q.x,y:r.top+q.y};},p);
      const dragWorld = async (from,to) => {const a=await screen(from),b=await screen(to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();};
      const create = async () => {
        await page.locator(`#mode${scenario.tool ?? scenario.kind[0].toUpperCase()+scenario.kind.slice(1)}`).click();
        if (scenario.sides && await page.locator('#ngonModal').isVisible()) {
          await page.locator('#ngonInput').fill(String(scenario.sides));
          await page.locator('#ngonConfirmBtn').click();
        }
        const r = await canvasRect();
        await clickCanvas(r.width * .48, r.height * .48);
        const s = await state();
        const id = s.selectedSolidId;
        check(`${scenario.kind}: widoczny przycisk tworzy bryłę`, !!s.runtime.solids?.[id], { id, kind: s.runtime.solids?.[id]?.polyhedron?.kind });
        return id;
      };
      const selectGroup = async solidId => {
        const s = await state(), group = serializeGroup(s.runtime, solidId);
        if (!group) throw new Error(`Missing source solid ${solidId}`);
        const pts = await page.evaluate(points => points.map(p => window.__copy3d.worldToCanvas(p.x, p.y)), group.points);
        const r = await canvasRect();
        const margin = 45;
        const bounds = {
          x1: r.left + Math.min(...pts.map(p => p.x)) - margin,
          y1: r.top + Math.min(...pts.map(p => p.y)) - margin,
          x2: r.left + Math.max(...pts.map(p => p.x)) + margin,
          y2: r.top + Math.max(...pts.map(p => p.y)) + margin
        };
        await page.locator('#modeMultiselect').click();
        await page.mouse.move(bounds.x1, bounds.y1);
        await page.mouse.down();
        await page.mouse.move(bounds.x2, bounds.y2, { steps: 12 });
        await page.mouse.up();
        return { group, selection: await state() };
      };

      const sourceId = await create();
      let s = await state();
      let source = serializeGroup(s.runtime, sourceId);
      check(`${scenario.kind}: źródło ma oczekiwaną topologię`, source?.points.length === scenario.expectedVertices && source?.lines.length === scenario.expectedEdges && source?.faces.length > 0,
        { vertices:source?.points.length, edges:source?.lines.length, faces:source?.faces.length, groupId:source?.groupId });

      // Exercise dependency closure through actual construction tools before copying the cube.
      if (scenario.kind === 'cube') {
        const edge = [...source.solid.edges].map(id=>s.runtime.lines[id]).filter(line=>line&&!line.spatialHiddenEdge)
          .sort((a,b)=>{const length=l=>{const [p,q]=l.defining_points.map(id=>s.runtime.points[id]);return Math.hypot(q.x-p.x,q.y-p.y);};return length(b)-length(a);})[0];
        const [a,b]=edge.defining_points.map(id=>s.runtime.points[id]);
        const edgeMid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        await page.locator('#modeAdd').click();
        let q=await screen(edgeMid); await page.mouse.click(q.x,q.y);
        s=await state();
        const edgePoint=Object.values(s.runtime.points).find(p=>p.spatial?.binding?.kind==='edge');
        check('cube: UI creates a point-on-edge dependency',!!edgePoint,{id:edgePoint?.id,binding:edgePoint?.spatial?.binding});
        const vertices=s.runtime.solids[sourceId].vertices;
        await page.locator('#modeSegment').click();
        const oppositeVertex=vertices[[0,1,3,2,4,5,7,6][7]];
        for(const id of [vertices[0],oppositeVertex]){q=await screen(s.runtime.points[id]);await page.mouse.click(q.x,q.y);}
        s=await state();
        const diagonal=Object.values(s.runtime.lines).find(line=>line.defining_points?.[0]===vertices[0]&&line.defining_points?.[1]===oppositeVertex);
        check('cube: UI creates a dependent spatial segment',!!diagonal,{id:diagonal?.id,defining_points:diagonal?.defining_points});
        await page.locator('#modeAngle').click();
        for(const id of [vertices[2],vertices[1],vertices[4]]){q=await screen(s.runtime.points[id]);await page.mouse.click(q.x,q.y);}
        s=await state();
        const angle=Object.values(s.runtime.angles).find(item=>s.runtime.points[item.vertex]?.spatial?.groupId===source.groupId);
        check('cube: UI creates a dependent spatial angle',!!angle,{id:angle?.id,vertex:angle?.vertex,point1:angle?.point1,point2:angle?.point2});
      }
      s=await state();
      source=serializeGroup(s.runtime,sourceId);

      const selected = await selectGroup(sourceId);
      s = selected.selection;
      const allSourceMembersSelected = source.pointIds.every(id => s.multi.points.includes(id)) &&
        source.lineIds.every(id => s.multi.lines.includes(id)) && source.faceIds.every(id => s.multi.polygons.includes(id)) &&
        source.angleIds.every(id=>s.multi.angles.includes(id));
      check(`${scenario.kind}: zaznaczenie ramką obejmuje kompletną grupę przestrzenną`, allSourceMembersSelected,
        { expected:{ points:source.pointIds.length, lines:source.lineIds.length, faces:source.faceIds.length, angles:source.angleIds.length, solidId:sourceId, groupId:source.groupId }, selected:s.multi });

      const copyButton = page.locator('#multiCloneBtn');
      check(`${scenario.kind}: akcja kopiowania jest widoczna`, await copyButton.isVisible(), { aria:await copyButton.getAttribute('aria-label') });
      await copyButton.click();
      s = await state();
      const clipboard = s.clipboard;
      const hasSpatialClipboard = !!clipboard && (
        clipboard.solids?.length || clipboard.spatialGroups?.length || clipboard.points?.some(p => p.spatial) ||
        clipboard.lines?.some(line => line.spatialGroupId || line.spatialParameters) || clipboard.polygons?.some(poly => poly.spatialGroupId) || clipboard.angles?.length
      );
      check(`${scenario.kind}: kopiowanie zapisuje bryłę i zależności przestrzenne`, !!hasSpatialClipboard,
        { clipboardKeys:keys(clipboard), solids:clipboard?.solids?.length, groups:clipboard?.spatialGroups?.length,
          points:clipboard?.points?.length, lines:clipboard?.lines?.length, polygons:clipboard?.polygons?.length });
      check(`${scenario.kind}: schowek 3D jest obsługiwany bez ostrzeżenia`, !await page.locator('[role="alert"]').filter({ hasText: /przestrzen|3D/i }).count(),
        { clipboardKeys:keys(clipboard) });

      await copyButton.click();
      s = await state();
      const sourceNow = serializeGroup(s.runtime, sourceId);
      const solidIds = keys(s.runtime.solids);
      const copyId = solidIds.find(id => id !== sourceId);
      const copy = copyId && serializeGroup(s.runtime, copyId);
      check(`${scenario.kind}: wklejenie tworzy osobną bryłę z nowym ID grupy`, !!copy && copyId !== sourceId && copy.groupId !== source.groupId,
        { sourceId, copyId, sourceGroup:source.groupId, copyGroup:copy?.groupId, solidIds });
      check(`${scenario.kind}: kopia ma komplet nowych ID i zachowaną topologię`, !!copy &&
        copy.points.length === source.points.length && copy.lines.length === source.lines.length && copy.faces.length === source.faces.length &&
        copy.angles.length === source.angles.length &&
        !copy.pointIds.some(id => source.pointIds.includes(id)) && !copy.lineIds.some(id => source.lineIds.includes(id)) &&
        !copy.faceIds.some(id => source.faceIds.includes(id)) && !copy.angleIds.some(id=>source.angleIds.includes(id)) &&
        copy.solid.vertices.every(id=>copy.pointIds.includes(id)) && copy.solid.edges.every(id=>copy.lineIds.includes(id)) &&
        copy.lines.every(line=>(line.points||[]).every(id=>copy.pointIds.includes(id))) &&
        copy.points.every(point=>point.spatial?.binding?.kind!=='edge'||point.spatial.binding.endpoints?.every(id=>copy.pointIds.includes(id))) &&
        copy.angles.every(angle=>[angle.vertex,angle.point1,angle.point2].filter(Boolean).every(id=>copy.pointIds.includes(id))),
        { source:{ points:source.pointIds.length, lines:source.lineIds.length, faces:source.faceIds.length, angles:source.angleIds.length },
          copy:{ points:copy?.pointIds.length, lines:copy?.lineIds.length, faces:copy?.faceIds.length, angles:copy?.angleIds.length } });
      check(`${scenario.kind}: źródło pozostaje obecne i niezmienione po wklejeniu`, !!sourceNow &&
        JSON.stringify(sourceNow.points) === JSON.stringify(source.points) && JSON.stringify(sourceNow.lines) === JSON.stringify(source.lines),
        { sourceId, pointCount:sourceNow?.points.length, lineCount:sourceNow?.lines.length });
      check(`${scenario.kind}: schowek zostaje skonsumowany po wklejeniu`, s.clipboard == null, { clipboard:!!s.clipboard });

      if (scenario.kind === 'cube') {
        // Exercise the multiselect scale handle on the newly pasted spatial group.
        const baseline=serializeGroup(s.runtime,copyId), sourceBaseline=serializeGroup(s.runtime,sourceId);
        const scaleHandle=await page.evaluate(()=>window.__copy3d.multiHandles());
        check('cube: selekcja kopii udostępnia uchwyty skali i obrotu',!!scaleHandle?.scaleHandle&&!!scaleHandle?.rotateHandle,scaleHandle);
        const scaleVector={x:scaleHandle.scaleHandle.x-scaleHandle.center.x,y:scaleHandle.scaleHandle.y-scaleHandle.center.y};
        const scaleTarget={x:scaleHandle.center.x+scaleVector.x*1.2,y:scaleHandle.center.y+scaleVector.y*1.2};
        await dragWorld(scaleHandle.scaleHandle,scaleTarget);
        s=await state();
        const scaled=serializeGroup(s.runtime,copyId),sourceAfterScale=serializeGroup(s.runtime,sourceId);
        check('cube: uchwyt skali zmienia model kopii około 1.2x',Math.abs(scaled.solid.size.x/baseline.solid.size.x-1.2)<.04&&
          JSON.stringify(scaled.points)!==JSON.stringify(baseline.points),
          {before:baseline.solid.size,after:scaled.solid.size,pointDelta:scaled.points[0]&&baseline.points[0]?{x:scaled.points[0].x-baseline.points[0].x,y:scaled.points[0].y-baseline.points[0].y}:null});
        check('cube: skalowanie kopii pozostawia źródło bez zmian',JSON.stringify(sourceAfterScale.points)===JSON.stringify(sourceBaseline.points)&&
          JSON.stringify(sourceAfterScale.spatialGroup)===JSON.stringify(sourceBaseline.spatialGroup)&&JSON.stringify(sourceAfterScale.solid)===JSON.stringify(sourceBaseline.solid),{sourceId});
        await page.locator('#undo').click(); s=await state();
        const scaleUndo=serializeGroup(s.runtime,copyId);
        check('cube: undo przywraca geometrię sprzed skalowania',JSON.stringify(scaleUndo.points)===JSON.stringify(baseline.points)&&
          JSON.stringify(scaleUndo.solid.size)===JSON.stringify(baseline.solid.size),{size:scaleUndo.solid.size});
        await page.locator('#redo').click(); s=await state();
        const scaleRedo=serializeGroup(s.runtime,copyId);
        check('cube: redo stabilnie przywraca przeskalowaną kopię',JSON.stringify(scaleRedo.points)===JSON.stringify(scaled.points)&&
          JSON.stringify(scaleRedo.solid.size)===JSON.stringify(scaled.solid.size),{size:scaleRedo.solid.size});

        // Rotate the spatial group with the visible multiselect rotate handle.
        const rotationBefore=serializeGroup(s.runtime,copyId),sourceBeforeMultiRotate=serializeGroup(s.runtime,sourceId);
        const rotateHandles=await page.evaluate(()=>window.__copy3d.multiHandles()),h=rotateHandles.rotateHandle,c=rotateHandles.center;
        const radius=Math.hypot(h.x-c.x,h.y-c.y),angle=Math.atan2(h.y-c.y,h.x-c.x)+.38;
        const rotateTarget={x:c.x+Math.cos(angle)*radius,y:c.y+Math.sin(angle)*radius};
        await dragWorld(h,rotateTarget); s=await state();
        const multiRotated=serializeGroup(s.runtime,copyId),sourceAfterMultiRotate=serializeGroup(s.runtime,sourceId);
        check('cube: uchwyt obrotu multiselect obraca kopię przestrzenną',
          JSON.stringify(multiRotated.points)!==JSON.stringify(rotationBefore.points)&&
          JSON.stringify(multiRotated.spatialGroup.orientation)!==JSON.stringify(rotationBefore.spatialGroup.orientation),
          {before:rotationBefore.spatialGroup.orientation,after:multiRotated.spatialGroup.orientation});
        check('cube: obrót multiselect nie zmienia źródła',JSON.stringify(sourceAfterMultiRotate.points)===JSON.stringify(sourceBeforeMultiRotate.points)&&
          JSON.stringify(sourceAfterMultiRotate.spatialGroup)===JSON.stringify(sourceBeforeMultiRotate.spatialGroup),{sourceId});
        await page.locator('#undo').click(); s=await state();
        const rotationUndo=serializeGroup(s.runtime,copyId);
        check('cube: undo cofa obrót multiselect bez cofania wcześniejszej skali',JSON.stringify(rotationUndo.points)===JSON.stringify(rotationBefore.points)&&
          JSON.stringify(rotationUndo.spatialGroup.orientation)===JSON.stringify(rotationBefore.spatialGroup.orientation),{orientation:rotationUndo.spatialGroup.orientation});
        await page.locator('#redo').click(); s=await state();
        const rotationRedo=serializeGroup(s.runtime,copyId);
        check('cube: redo stabilnie przywraca obrót multiselect',JSON.stringify(rotationRedo.points)===JSON.stringify(multiRotated.points)&&
          JSON.stringify(rotationRedo.spatialGroup.orientation)===JSON.stringify(multiRotated.spatialGroup.orientation),{orientation:rotationRedo.spatialGroup.orientation});
      }

      // Move the selected pasted group using the normal multiselect move gesture.
      const copyBeforeMove=serializeGroup(s.runtime,copyId);
      const copyPoint=s.runtime.points[copyBeforeMove.pointIds[0]];
      if (!s.multiMoveActive) await page.locator('#multiMoveBtn').click();
      await dragWorld(copyPoint,{x:copyPoint.x+260/s.zoomFactor,y:copyPoint.y+35/s.zoomFactor});
      s=await state();
      const movedCopy=serializeGroup(s.runtime,copyId),afterMoveSource=serializeGroup(s.runtime,sourceId);
      const moveDelta={x:movedCopy.points[0].x-copyBeforeMove.points[0].x,y:movedCopy.points[0].y-copyBeforeMove.points[0].y};
      check(`${scenario.kind}: przeciągnięcie przesuwa wybraną kopię jako grupę`,Math.hypot(moveDelta.x,moveDelta.y)>100&&
        movedCopy.points.every((p,i)=>Math.hypot((p.x-copyBeforeMove.points[i].x)-moveDelta.x,(p.y-copyBeforeMove.points[i].y)-moveDelta.y)<1e-4),
        {moveDelta,sourceUnchanged:JSON.stringify(afterMoveSource.points)===JSON.stringify(source.points)});
      check(`${scenario.kind}: przesunięcie kopii nie zmienia źródła`,JSON.stringify(afterMoveSource.points)===JSON.stringify(source.points),{sourceId});
      check(`${scenario.kind}: przesunięcie kopii zachowuje kotwicę i orientację źródła`,
        JSON.stringify(afterMoveSource.spatialGroup)===JSON.stringify(source.spatialGroup),{sourceGroup:afterMoveSource.spatialGroup});

      // Select the copied solid in Move mode and rotate it with its visible spatial handle.
      await page.locator('#modeMove').click();
      const movedVertex=await screen(movedCopy.points[0]); await page.mouse.click(movedVertex.x,movedVertex.y);
      s=await state();
      const rotateHandle=await page.evaluate(id=>window.__copy3d.handles(id).find(handle=>handle.kind==='rotate'),copyId);
      const orientationBefore=s.runtime.spatialGroups[movedCopy.groupId]?.orientation;
      check(`${scenario.kind}: zaznaczenie kopii udostępnia uchwyt obrotu`,!!rotateHandle&&s.selectedSolidId===copyId,{selectedSolidId:s.selectedSolidId,rotateHandle});
      await dragWorld(rotateHandle,{x:rotateHandle.x+72/s.zoomFactor,y:rotateHandle.y+38/s.zoomFactor});
      s=await state();
      const rotatedSource=serializeGroup(s.runtime,sourceId),orientationAfter=s.runtime.spatialGroups[movedCopy.groupId]?.orientation;
      check(`${scenario.kind}: obrót kopii przez uchwyt nie zmienia źródła`,!!orientationAfter&&orientationAfter.some((v,i)=>Math.abs(v-orientationBefore[i])>1e-4)&&
        JSON.stringify(rotatedSource.points)===JSON.stringify(source.points)&&JSON.stringify(rotatedSource.spatialGroup)===JSON.stringify(source.spatialGroup),
        {orientationBefore,orientationAfter,sourceUnchanged:JSON.stringify(rotatedSource.points)===JSON.stringify(source.points),sourceGroup:rotatedSource.spatialGroup});

      if (scenario.kind === 'cube') {
        // A mixed frame must retain an ordinary 2D point and the complete moved 3D group.
        await page.locator('#modeAdd').click();
        await clickCanvas(1120,790);
        s=await state();
        const freePoint=Object.values(s.runtime.points).find(point=>!point.spatial);
        check('cube: UI creates an independent 2D point beside the copied group',!!freePoint,{id:freePoint?.id,x:freePoint?.x,y:freePoint?.y});
        const group=serializeGroup(s.runtime,copyId);
        const targets=[...group.points,freePoint];
        const projected=await page.evaluate(points=>points.map(p=>window.__copy3d.worldToCanvas(p.x,p.y)),targets);
        const rect=await canvasRect(),pad=14;
        const mixedBox={x1:rect.left+Math.min(...projected.map(p=>p.x))-pad,y1:rect.top+Math.min(...projected.map(p=>p.y))-pad,
          x2:rect.left+Math.max(...projected.map(p=>p.x))+pad,y2:rect.top+Math.max(...projected.map(p=>p.y))+pad};
        await page.locator('#modeMultiselect').click();
        await page.mouse.move(mixedBox.x1,mixedBox.y1);await page.mouse.down();await page.mouse.move(mixedBox.x2,mixedBox.y2,{steps:12});await page.mouse.up();
        s=await state();
        check('cube: mieszana ramka zaznacza punkt 2D i całą kopię przestrzenną',s.multi.points.includes(freePoint.id)&&
          group.pointIds.every(id=>s.multi.points.includes(id))&&group.lineIds.every(id=>s.multi.lines.includes(id))&&
          group.faceIds.every(id=>s.multi.polygons.includes(id))&&group.angleIds.every(id=>s.multi.angles.includes(id))&&
          !source.pointIds.some(id=>s.multi.points.includes(id)),
          {freePointId:freePoint.id,selected:s.multi,sourcePointIds:source.pointIds});
      }

      // Save and load a native CTR through the application's file panel.
      const document = await page.evaluate(() => window.__copy3d.serialize());
      const persisted = document?.runtime ?? document?.model ?? document;
      check(`${scenario.kind}: natywny dokument zawiera źródło i kopię`, !!persisted.solids?.[sourceId] && !!persisted.solids?.[copyId] &&
        persisted.solids[sourceId].groupId !== persisted.solids[copyId].groupId,
        { documentKeys:keys(document), solidIds:keys(persisted.solids), spatialGroupIds:keys(persisted.spatialGroups) });
      const ctrName=scenario.kind==='cube'?'copy-audit-3d.ctr':`copy-${scenario.kind}.ctr`;
      const ctrArchive=zipSync({ [`copy-${scenario.kind}.json`]:strToU8(JSON.stringify(document)) }), ctrBytes=Array.from(ctrArchive);
      fs.writeFileSync(path.join(OUT,ctrName),Buffer.from(ctrArchive));
      await page.evaluate(file=>window.__copy3dFiles.push(file),{name:ctrName,bytes:ctrBytes});
      await page.locator('#modeMove').click();
      await clickCanvas(42,42); // Clear the selected solid so the file panel can be opened through its visible control.
      if(!await page.locator('#cloudPanel').isVisible()) await page.locator('#cloudFilesBtn').click();
      await page.locator('#localFileList [data-change-folder]').click();
      const revision=s.revision;
      await page.locator(`#localFileList [aria-label="Wczytaj ${ctrName.replace(/\.ctr$/, '')}"]`).click();
      await page.waitForFunction(previous=>window.__copy3d.state().revision>previous,revision);
      s=await state();
      check(`${scenario.kind}: import natywnego CTR przywraca oba niezależne modele`,!!s.runtime.solids[sourceId]&&!!s.runtime.solids[copyId]&&
        s.runtime.solids[sourceId].groupId!==s.runtime.solids[copyId].groupId,
        {solidIds:keys(s.runtime.solids),groups:keys(s.runtime.spatialGroups)});
      await page.locator('#cloudCloseBtn').click();

      // Delete only the source after the copy has moved away; undo and redo must preserve the copy.
      await page.locator('#modeMove').click();
      await clickCanvas(42,42);
      if(await page.locator('#cloudPanel').isVisible()) await page.locator('#cloudCloseBtn').click();
      const sourceBounds=await (async()=>{
        const group=serializeGroup(s.runtime,sourceId),pts=await page.evaluate(points=>points.map(p=>window.__copy3d.worldToCanvas(p.x,p.y)),group.points),r=await canvasRect(),pad=34;
        return{x1:r.left+Math.min(...pts.map(p=>p.x))-pad,y1:r.top+Math.min(...pts.map(p=>p.y))-pad,x2:r.left+Math.max(...pts.map(p=>p.x))+pad,y2:r.top+Math.max(...pts.map(p=>p.y))+pad};
      })();
      const selectionSurface=await page.evaluate(box=>({cloudPanelVisible:getComputedStyle(document.querySelector('#cloudPanel')).display!=='none',
        start:document.elementFromPoint(box.x1+2,box.y1+2)?.id,end:document.elementFromPoint(box.x2-2,box.y2-2)?.id}),sourceBounds);
      check(`${scenario.kind}: źródło selection box pozostaje odsłonięte po imporcie CTR`,!selectionSurface.cloudPanelVisible&&selectionSurface.start==='canvas'&&selectionSurface.end==='canvas',selectionSurface);
      await page.locator('#modeMultiselect').click(); await page.mouse.move(sourceBounds.x1,sourceBounds.y1); await page.mouse.down(); await page.mouse.move(sourceBounds.x2,sourceBounds.y2,{steps:12}); await page.mouse.up();
      const deleteSelection=await state();
      check(`${scenario.kind}: po przesunięciu kopii można osobno wybrać źródło`,source.pointIds.every(id=>deleteSelection.multi.points.includes(id))&&
        !copy.pointIds.some(id=>deleteSelection.multi.points.includes(id)),{selected:deleteSelection.multi,copyId,sourceId,bounds:sourceBounds,canvas:await canvasRect(),mode:deleteSelection.mode,
          sourcePoints:serializeGroup(deleteSelection.runtime,sourceId)?.points.map(p=>({id:p.id,x:p.x,y:p.y})),copyPoints:serializeGroup(deleteSelection.runtime,copyId)?.points.map(p=>({id:p.id,x:p.x,y:p.y}))});
      await page.locator('#deletePoint').click(); s=await state();
      check(`${scenario.kind}: usunięcie źródła pozostawia niezależną kopię`,!s.runtime.solids[sourceId]&&!!s.runtime.solids[copyId],{solidIds:keys(s.runtime.solids)});
      await page.locator('#undo').click(); s=await state();
      check(`${scenario.kind}: cofnięcie usuwań przywraca źródło i zachowuje kopię`,!!s.runtime.solids[sourceId]&&!!s.runtime.solids[copyId],{solidIds:keys(s.runtime.solids)});
      await page.locator('#redo').click(); s=await state();
      check(`${scenario.kind}: ponowienie usuwań usuwa źródło i zachowuje kopię`,!s.runtime.solids[sourceId]&&!!s.runtime.solids[copyId],{solidIds:keys(s.runtime.solids)});
      await page.close();
    }
    if (report.errors.length) throw new Error(`Browser errors: ${report.errors.join('; ')}`);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(OUT, 'report.md'), `# Kopiowanie brył 3D\n\n${report.checks.map(c=>`- **${c.passed===null?'INFO':c.passed?'OK':'BŁĄD'}** ${c.name}\n  - ${JSON.stringify(c.observed)}`).join('\n')}\n`);
    console.log(JSON.stringify({ checks:report.checks.length, failures:report.checks.filter(c=>c.passed===false).length, output:OUT }));
    if (process.argv.includes('--verify') && report.checks.some(c => c.passed === false)) process.exitCode = 1;
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch(error => {
  report.errors.push(error.stack || error.message);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, 'report.md'), `# Kopiowanie brył 3D\n\nTest nie został ukończony.\n\n\`\`\`\n${error.stack || error.message}\n\`\`\`\n`);
  console.error(error);
  process.exitCode = 1;
});
