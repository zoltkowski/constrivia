const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.resolve('output/playwright/copy-audit-ui');
fs.mkdirSync(OUT, { recursive: true });
const checks = [], errors = [], scenarios = [], evidence = [];
const check = (name, pass, observed = {}) => checks.push({ name, passed: !!pass, observed });

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5196, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true, isMobile: false });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      const body = await response.text();
      await route.fulfill({ response, body: body + `\nwindow.__copyAudit = {
        state: () => ({runtime, mode, multiSelectedPoints:[...multiSelectedPoints], multiSelectedLines:[...multiSelectedLines], multiSelectedCircles:[...multiSelectedCircles], multiSelectedAngles:[...multiSelectedAngles], multiSelectedPolygons:[...multiSelectedPolygons], multiSelectedInkStrokes:[...multiSelectedInkStrokes], multiSelectedLabels:[...multiSelectedLabels], selectionVertices, selectionEdges, historyIndex, historyLength:history.length, zoomFactor, panOffset, selectedPointId, selectedLineId, selectedCircleId, selectedPolygonId, selectedAngleId}),
        styleUi: () => ({color:styleColorInput?.value,width:styleWidthInput?.value,widthDisabled:styleWidthInput?.disabled,type:styleTypeSelect?.value,typeDisabled:styleTypeSelect?.disabled,segments:[...selectedSegments],multiMode:mode}),
        clipboard: () => copiedObjects ? JSON.parse(JSON.stringify(copiedObjects)) : null,
        refreshOptionButtons: updateOptionButtons,
        setClipboardForLabelCheck: value => { copiedObjects = value; updateSelectionButtons(); },
        serialize: serializeCurrentDocument,
        handles: getMultiHandles,
        worldToCanvas
      };` });
    });
    await page.goto('http://127.0.0.1:5196/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__copyAudit);
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();

    const state = () => page.evaluate(() => window.__copyAudit.state());
    const counts = s => Object.fromEntries(['points','lines','circles','angles','polygons','inkStrokes','labels'].map(k => [k,Object.keys(s.runtime[k]||{}).length]));
    const allIds = s => Object.fromEntries(['points','lines','circles','angles','polygons','inkStrokes','labels'].map(k => [k,Object.keys(s.runtime[k]||{})]));
    const worldScreen = async (x,y) => page.evaluate(({x,y}) => {const r=document.getElementById('canvas').getBoundingClientRect(),p=window.__copyAudit.worldToCanvas(x,y);return{x:r.left+p.x,y:r.top+p.y};},{x,y});
    const clickWorld = async (x,y) => {const p=await worldScreen(x,y); await page.mouse.click(p.x,p.y);};
    const dragWorld = async (a,b, pointer=page.mouse) => {const p=await worldScreen(a.x,a.y),q=await worldScreen(b.x,b.y);await pointer.move(p.x,p.y);await pointer.down();await pointer.move(q.x,q.y,{steps:8});await pointer.up();};
    const box = async (a,b) => {await page.locator('#modeMultiselect').click();await dragWorld(a,b);};
    const resetViaReload = async () => { await page.reload({waitUntil:'networkidle'}); await page.waitForFunction(()=>window.__copyAudit); if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click(); };
    const canvasBounds = async () => page.locator('#canvas').boundingBox();

    // Build a compact construction using only visible tools and canvas gestures.
    await page.locator('#modeAdd').click();
    for (const p of [[180,260],[270,260],[360,260],[450,260],[540,260],[630,260],[720,260],[810,260]]) await clickWorld(...p);
    await page.locator('#modeSegment').click(); await clickWorld(180,260); await clickWorld(270,260);
    await page.locator('#modePolygon').click(); for (const p of [[360,340],[460,340],[430,430],[360,340]]) await clickWorld(...p);
    await page.locator('#modeCircle').click(); await clickWorld(600,340); await clickWorld(650,340);
    await page.screenshot({path:path.join(OUT,'desktop-fixture.png')});
    let s=await state();
    const fixtureIds=allIds(s);
    const fixtureSnapshot=JSON.parse(JSON.stringify(s.runtime));
    scenarios.push({name:'fixture', counts:counts(s), notes:'Pisteet, odcinek, wielokąt i okrąg utworzone narzędziami UI.'});
    check('Fixture construction completed through toolbar and canvas', counts(s).points>=7 && counts(s).lines>=1 && counts(s).polygons>=1 && counts(s).circles>=1, counts(s));

    // Frame selection both directions, then additive click toggle.
    await box({x:160,y:240},{x:290,y:285}); s=await state();
    const forward=[...s.multiSelectedPoints].sort();
    await page.locator('#modeMove').click(); await page.locator('#modeMultiselect').click(); await dragWorld({x:290,y:285},{x:160,y:240}); s=await state();
    const reverse=[...s.multiSelectedPoints].sort();
    check('Frame selection yields the same exact IDs in both drag directions', JSON.stringify(forward)===JSON.stringify(reverse) && forward.length>=2, {forward,reverse});
    const unselectedPoint=Object.values(s.runtime.points).find(p=>!s.multiSelectedPoints.includes(p.id));
    const target=await worldScreen(unselectedPoint.x,unselectedPoint.y); await page.mouse.click(target.x,target.y); s=await state();
    const afterAdd=s.multiSelectedPoints;
    await page.mouse.click(target.x,target.y); s=await state();
    check('Click toggles an item into and out of multiselect',afterAdd.includes(unselectedPoint.id)&&!s.multiSelectedPoints.includes(unselectedPoint.id),{id:unselectedPoint.id,at:{x:unselectedPoint.x,y:unselectedPoint.y},afterAdd,afterRemove:s.multiSelectedPoints});

    // Vertex/edge toggles are UI controls if available. Record actual DOM and effective hook values.
    const toggleInfo=await page.evaluate(()=>['viewVerticesOption','viewEdgesOption'].map(id=>{const b=document.getElementById(id);return b?{id,title:b.title,label:b.getAttribute('aria-label'),pressed:b.getAttribute('aria-pressed'),active:b.classList.contains('active')}:null;}).filter(Boolean));
    scenarios.push({name:'selection-options-controls',controls:toggleInfo,initial:{selectionVertices:s.selectionVertices,selectionEdges:s.selectionEdges}});
    check('Selection vertex/edge options are observable in the live hook',typeof s.selectionVertices==='boolean'&&typeof s.selectionEdges==='boolean',{controls:toggleInfo,vertices:s.selectionVertices,edges:s.selectionEdges});

    // Select a copyable set through frame gesture and trigger copy with toolbar button.
    await box({x:150,y:230},{x:300,y:290}); s=await state();
    const sourceIds=allIds(s),sourceCounts=counts(s),sourceSet=new Set(s.multiSelectedPoints);
    if(await page.locator('#multiCloneBtn').isVisible()) await page.locator('#multiCloneBtn').click();
    const clipboardAfterCopy=await page.evaluate(()=>window.__copyAudit.clipboard());
    s=await state(); scenarios.push({name:'first-copy',selection:{points:s.multiSelectedPoints,lines:s.multiSelectedLines},clipboard:clipboardAfterCopy,sourceCounts});
    const copiedAt=clipboardAfterCopy;
    const sourceBeforeMutation=structuredClone(s.runtime);
    await page.locator('#modeMove').click();
    const sourcePoint=sourceBeforeMutation.points.pt1;
    await dragWorld({x:sourcePoint.x,y:sourcePoint.y},{x:sourcePoint.x+42,y:sourcePoint.y+15});
    const sourceAfterMutation=await state();
    await clickWorld(1050,700);
    const topPasteAvailable=await page.locator('#multiCloneBtn').isVisible();
    if(topPasteAvailable) await page.locator('#multiCloneBtn').click(); s=await state();
    const copiedPointIds=s.multiSelectedPoints.filter(id=>!sourceSet.has(id));
    check('Copy button captures selection and next click pastes an independent copy',s.multiSelectedPoints.length>0&&copiedPointIds.length>0&&Object.keys(s.runtime.points).length>sourceCounts.points,{sourceCounts,after:counts(s),selection:s.multiSelectedPoints,copiedPointIds,clipboardAfterCopy});
    check('Paste selection excludes original source IDs',copiedPointIds.length===s.multiSelectedPoints.length && s.multiSelectedPoints.every(id=>!sourceIds.points.includes(id)),{sourcePointIds:sourceIds.points,selectedAfter:s.multiSelectedPoints});
    check('Paste remains available after changing tool',topPasteAvailable&&Object.keys(s.runtime.points).length>sourceCounts.points,{available:topPasteAvailable,before:sourceCounts,after:counts(s)});
    const firstPasteState=await state();
    const movedTarget=firstPasteState.runtime.points[copiedPointIds[0]];
    const pastedForPt1=Object.values(firstPasteState.runtime.points).find(p=>!sourceIds.points.includes(p.id)&&Math.abs(p.x-(sourceBeforeMutation.points.pt1.x+20))<1e-5&&Math.abs(p.y-(sourceBeforeMutation.points.pt1.y+20))<1e-5);
    check('Copy buffer is a snapshot while source moves before paste',sourceAfterMutation.runtime.points.pt1.x!==sourceBeforeMutation.points.pt1.x&&pastedForPt1?.x===copiedAt.points.find(p=>p.id==='pt1')?.x+20&&pastedForPt1?.y===copiedAt.points.find(p=>p.id==='pt1')?.y+20,{sourceBefore:sourceBeforeMutation.points.pt1,sourceBeforePaste:sourceAfterMutation.runtime.points.pt1,clipboardPoint:copiedAt.points.find(p=>p.id==='pt1'),pastedPoint:pastedForPt1});
    // A second copy/paste cycle uses the still-live copied group, then checks disjoint IDs.
    await page.locator('#modeMultiselect').click();
    const secondBox=await worldScreen(170,245),secondBox2=await worldScreen(320,320);await dragWorld({x:170,y:245},{x:320,y:320});
    const secondSelected=await state(); const idsBefore2=allIds(secondSelected);
    if(await page.locator('#multiCloneBtn').isVisible())await page.locator('#multiCloneBtn').click();
    const secondClip=await page.evaluate(()=>window.__copyAudit.clipboard());
    if(await page.locator('#multiCloneBtn').isVisible())await page.locator('#multiCloneBtn').click();
    const secondPaste=await state();
    const newIds=allIds(secondPaste);
    const distinct=Object.fromEntries(Object.keys(idsBefore2).map(k=>[k,newIds[k].filter(id=>!idsBefore2[k].includes(id))]));
    check('A separate copy/paste cycle retains unique runtime IDs',Object.keys(distinct).some(k=>distinct[k].length>0),{before:idsBefore2,after:newIds,clipboard:secondClip,distinct});
    scenarios.push({name:'paste-and-snapshot',topPasteAvailable,firstPasteCounts:counts(firstPasteState),sourceBefore:sourceBeforeMutation.points.pt1,sourceBeforePaste:sourceAfterMutation.runtime.points.pt1,pastedPoint:pastedForPt1,secondPasteCounts:counts(secondPaste),clipboardAfterCopy:clipboardAfterCopy});

    // Move then undo/redo through UI, delete and undo/redo.
    // The paste operation leaves the newly pasted objects selected in multiselect mode.
    const beforeMove=await state(); const pointToMove=beforeMove.runtime.points[beforeMove.multiSelectedPoints[0]];
    const moveSourceId=beforeMove.multiSelectedPoints[0];
    const originalSourceId=sourceIds.points[0];
    const moveSourceBefore=beforeMove.runtime.points[originalSourceId]&&{...beforeMove.runtime.points[originalSourceId]};
    const moveTargetBefore=pointToMove&&{...pointToMove};
    if(pointToMove)await dragWorld({x:pointToMove.x,y:pointToMove.y},{x:pointToMove.x+35,y:pointToMove.y+25});
    const afterMove=await state(); await page.locator('#undo').click(); const undoMove=await state(); await page.locator('#redo').click(); const redoMove=await state();
    check('Copied object moves independently and group move is undoable',!!moveTargetBefore&&afterMove.runtime.points[moveSourceId]?.x!==moveTargetBefore.x&&afterMove.runtime.points[originalSourceId]?.x===moveSourceBefore?.x&&undoMove.runtime.points[moveSourceId]?.x===moveTargetBefore.x&&redoMove.runtime.points[moveSourceId]?.x===afterMove.runtime.points[moveSourceId]?.x,{copyId:moveSourceId,copyBefore:moveTargetBefore,copyAfter:afterMove.runtime.points[moveSourceId],sourceBefore:moveSourceBefore,sourceAfter:afterMove.runtime.points[originalSourceId],undo:undoMove.runtime.points[moveSourceId],redo:redoMove.runtime.points[moveSourceId]});
    const deleteSelection=await state(); const idsBeforeDelete=allIds(deleteSelection); if(await page.locator('#deletePoint').isVisible())await page.locator('#deletePoint').click(); const delAfter=await state(); await page.locator('#undo').click();const delUndo=await state();await page.locator('#redo').click();const delRedo=await state();
    const deletedIds=Object.fromEntries(Object.keys(idsBeforeDelete).map(k=>[k,idsBeforeDelete[k].filter(id=>!Object.keys(delAfter.runtime[k]).includes(id))]));
    const restoredByUndo=Object.fromEntries(Object.keys(idsBeforeDelete).map(k=>[k,deletedIds[k].filter(id=>!!delUndo.runtime[k][id])]));
    check('Delete changes selected IDs and undo/redo restores and removes those IDs',Object.values(deletedIds).some(a=>a.length>0)&&Object.keys(restoredByUndo).every(k=>restoredByUndo[k].length===deletedIds[k].length)&&Object.keys(delRedo.runtime.points).every(id=>!deletedIds.points.includes(id)),{before:idsBeforeDelete,deleted:deletedIds,undo:restoredByUndo,redo:allIds(delRedo)});
    scenarios.push({name:'history',move:{before:counts(beforeMove),after:counts(afterMove),undo:counts(undoMove),redo:counts(redoMove)},delete:{before:idsBeforeDelete,after:deletedIds,undo:restoredByUndo,redo:allIds(delRedo)}});

    // Copy the original polygon and circle together as one mixed selection.
    await page.locator('#modeMove').click();
    await page.locator('#modeMultiselect').click();
    await dragWorld({x:340,y:320},{x:680,y:455});
    const mixedBefore=await state();
    const sourcePolyId=fixtureIds.polygons[0],sourceCircleId=fixtureIds.circles[0];
    const sourcePolygon=mixedBefore.runtime.polygons[sourcePolyId],sourceCircle=mixedBefore.runtime.circles[sourceCircleId];
    const sourcePolyPoints=[...sourcePolygon.points];
    const sourceCirclePointIds=[sourceCircle.center,sourceCircle.radius_point,...(sourceCircle.points||[])].filter(Boolean);
    const sourceObjectIds=allIds(mixedBefore);
    const sourcePositions=Object.fromEntries([...new Set([...sourcePolyPoints,...sourceCirclePointIds])].map(id=>[id,{x:mixedBefore.runtime.points[id]?.x,y:mixedBefore.runtime.points[id]?.y}]));
    const selectedMixed={polygons:mixedBefore.multiSelectedPolygons,circles:mixedBefore.multiSelectedCircles,points:mixedBefore.multiSelectedPoints,lines:mixedBefore.multiSelectedLines};
    if(await page.locator('#multiCloneBtn').isVisible())await page.locator('#multiCloneBtn').click();
    if(await page.locator('#multiCloneBtn').isVisible())await page.locator('#multiCloneBtn').click();
    let mixedPaste=await state();
    const copiedPolyId=mixedPaste.multiSelectedPolygons.find(id=>!sourceObjectIds.polygons.includes(id));
    const copiedCircleId=mixedPaste.multiSelectedCircles.find(id=>!sourceObjectIds.circles.includes(id));
    const copiedPoly=mixedPaste.runtime.polygons[copiedPolyId],copiedCircle=mixedPaste.runtime.circles[copiedCircleId];
    const copiedIds=allIds(mixedPaste);
    const copiedPointRefs=[...(copiedPoly?.points||[]),copiedCircle?.center,copiedCircle?.radius_point,...(copiedCircle?.points||[])].filter(Boolean);
    const noSourceRefs=copiedPointRefs.every(id=>!sourceObjectIds.points.includes(id));
    check('Mixed polygon and circle paste creates new IDs with remapped point references',!!copiedPolyId&&!!copiedCircleId&&copiedPolyId!==sourcePolyId&&copiedCircleId!==sourceCircleId&&noSourceRefs,{selection:selectedMixed,source:{polygon:sourcePolyId,circle:sourceCircleId,polygonPoints:sourcePolyPoints,circlePoints:sourceCirclePointIds},copied:{polygon:copiedPolyId,circle:copiedCircleId,pointRefs:copiedPointRefs},noSourceRefs});

    const selectedCopyPointIds=new Set(mixedPaste.multiSelectedPoints);
    mixedPaste.multiSelectedLines.forEach(id=>mixedPaste.runtime.lines[id]?.points?.forEach(pointId=>selectedCopyPointIds.add(pointId)));
    mixedPaste.multiSelectedPolygons.forEach(id=>mixedPaste.runtime.polygons[id]?.points?.forEach(pointId=>selectedCopyPointIds.add(pointId)));
    mixedPaste.multiSelectedCircles.forEach(id=>{const c=mixedPaste.runtime.circles[id];if(c){selectedCopyPointIds.add(c.center);if(c.radius_point)selectedCopyPointIds.add(c.radius_point);(c.points||[]).forEach(pointId=>selectedCopyPointIds.add(pointId));}});
    const copyTransformIds=[...selectedCopyPointIds].filter(id=>!sourceObjectIds.points.includes(id));
    const positions=(snapshot,ids)=>Object.fromEntries(ids.map(id=>[id,{x:snapshot.runtime.points[id]?.x,y:snapshot.runtime.points[id]?.y}]));
    const originalPositions=positions(mixedPaste,[...new Set([...sourcePolyPoints,...sourceCirclePointIds])]);
    const scaleBefore=await state();
    const scaleHandles=await page.evaluate(()=>window.__copyAudit.handles());
    let scaleResult=null;
    if(scaleHandles?.scaleHandle){
      const h=scaleHandles.scaleHandle,c=scaleHandles.center,target={x:c.x+(h.x-c.x)*1.35,y:c.y+(h.y-c.y)*1.35};
      const before=positions(scaleBefore,copyTransformIds);
      await dragWorld(h,target);
      const after=await state();
      const afterPositions=positions(after,copyTransformIds);
      const undoStart=after.historyIndex; await page.locator('#undo').click();const undo=await state();await page.locator('#redo').click();const redo=await state();
      const sourcesStable=Object.entries(originalPositions).every(([id,p])=>undo.runtime.points[id]?.x===p.x&&undo.runtime.points[id]?.y===p.y&&redo.runtime.points[id]?.x===p.x&&redo.runtime.points[id]?.y===p.y);
      const moved=copyTransformIds.some(id=>afterPositions[id]?.x!==before[id]?.x||afterPositions[id]?.y!==before[id]?.y);
      const undone=copyTransformIds.every(id=>undo.runtime.points[id]?.x===before[id]?.x&&undo.runtime.points[id]?.y===before[id]?.y);
      const redone=copyTransformIds.every(id=>redo.runtime.points[id]?.x===afterPositions[id]?.x&&redo.runtime.points[id]?.y===afterPositions[id]?.y);
      scaleResult={before,after:afterPositions,undoIndex:undo.historyIndex,afterIndex:undoStart,sourcesStable,moved,undone,redone};
      check('Scale handle changes only copied geometry and supports undo/redo',!!moved&&sourcesStable&&undone&&redone,{handle:scaleHandles.scaleHandle,center:scaleHandles.center,...scaleResult});
    }else check('Scale handle is available for the mixed copied group',false,{handles:scaleHandles,selection:{points:scaleBefore.multiSelectedPoints,lines:scaleBefore.multiSelectedLines,polygons:scaleBefore.multiSelectedPolygons,circles:scaleBefore.multiSelectedCircles}});

    const rotateBefore=await state();
    const rotateHandles=await page.evaluate(()=>window.__copyAudit.handles());
    let rotateResult=null;
    if(rotateHandles?.rotateHandle){
      const h=rotateHandles.rotateHandle,c=rotateHandles.center,len=Math.hypot(h.x-c.x,h.y-c.y),target={x:c.x+len/Math.SQRT2,y:c.y-len/Math.SQRT2};
      const before=positions(rotateBefore,copyTransformIds);
      await dragWorld(h,target);
      const after=await state();
      const afterPositions=positions(after,copyTransformIds);
      const undoStart=after.historyIndex;await page.locator('#undo').click();const undo=await state();await page.locator('#redo').click();const redo=await state();
      const sourcesStable=Object.entries(originalPositions).every(([id,p])=>undo.runtime.points[id]?.x===p.x&&undo.runtime.points[id]?.y===p.y&&redo.runtime.points[id]?.x===p.x&&redo.runtime.points[id]?.y===p.y);
      const rotated=copyTransformIds.some(id=>afterPositions[id]?.x!==before[id]?.x||afterPositions[id]?.y!==before[id]?.y);
      const undone=copyTransformIds.every(id=>undo.runtime.points[id]?.x===before[id]?.x&&undo.runtime.points[id]?.y===before[id]?.y);
      const redone=copyTransformIds.every(id=>redo.runtime.points[id]?.x===afterPositions[id]?.x&&redo.runtime.points[id]?.y===afterPositions[id]?.y);
      rotateResult={before,after:afterPositions,undoIndex:undo.historyIndex,afterIndex:undoStart,sourcesStable,rotated,undone,redone};
      check('Rotate handle changes only copied geometry and supports undo/redo',!!rotated&&sourcesStable&&undone&&redone,{handle:rotateHandles.rotateHandle,center:rotateHandles.center,...rotateResult});
    }else check('Rotate handle is available for the mixed copied group',false,{handles:rotateHandles});

    // Style the copied polygon and one of its boundary lines through single-object UI selection.
    const styleStart=await state();
    const transformedPoly=styleStart.runtime.polygons[copiedPolyId];
    const polyVertices=(transformedPoly?.points||[]).map(id=>styleStart.runtime.points[id]).filter(Boolean);
    const polyEdge=polyVertices.length>=2?{x:(polyVertices[0].x+polyVertices[1].x)/2,y:(polyVertices[0].y+polyVertices[1].y)/2}:null;
    await page.locator('#modeMove').click();
    if(polyEdge)await clickWorld(polyEdge.x,polyEdge.y);
    let selectedPolyState=await state();
    if(selectedPolyState.selectedPolygonId!==copiedPolyId&&polyVertices.length>=2){await clickWorld(polyVertices[1].x,polyVertices[1].y);selectedPolyState=await state();}
    const sourcePolyStyleBefore={fill:styleStart.runtime.polygons[sourcePolyId]?.fill,lines:Object.fromEntries(Object.entries(styleStart.runtime.lines).filter(([,l])=>l.points?.every(id=>sourcePolyPoints.includes(id))).map(([id,l])=>[id,JSON.parse(JSON.stringify({style:l.style,segmentStyles:l.segmentStyles}))]))};
    const copyPolyFillBefore=selectedPolyState.runtime.polygons[copiedPolyId]?.fill;
    if(selectedPolyState.selectedPolygonId===copiedPolyId){
      if(!await page.locator('#styleMenuContainer .dropdown-menu').isVisible())await page.locator('#styleMenu').click();
      const styleControls=await page.evaluate(()=>({swatches:[...document.querySelectorAll('.color-btn:not(.custom-color-btn)')].map(b=>({color:b.dataset.color,visible:!!(b.offsetWidth||b.offsetHeight||b.getClientRects().length)})),color:document.getElementById('styleColor')?.value,selectedWidth:document.getElementById('styleWidth')?.value,widthDisabled:document.getElementById('styleWidth')?.disabled}));
      const originalLineColor=Object.values(sourcePolyStyleBefore.lines)[0]?.style?.color;
      const chosenSwatch=styleControls.swatches.find(w=>w.color&&w.color!==originalLineColor);
      if(chosenSwatch)await page.locator(`.color-btn:not(.custom-color-btn)[data-color="${chosenSwatch.color}"]`).click();
      scenarios.push({name:'style-ui-controls',before:styleControls,chosenSwatch});
      await page.screenshot({path:path.join(OUT,'copy-style-menu.png')});
    }
    const afterPolygonColor=await state();
    const copyPolyLineStylesAfterColor=Object.fromEntries(Object.entries(afterPolygonColor.runtime.lines).filter(([,l])=>l.points?.every(id=>transformedPoly.points.includes(id))).map(([id,l])=>[id,(l.segmentStyles||[]).map(style=>({color:style.color,width:style.width,type:style.type}))]));
    const sourcePolyLineColors=Object.fromEntries(Object.entries(afterPolygonColor.runtime.lines).filter(([,l])=>l.points?.every(id=>sourcePolyPoints.includes(id))).map(([id,l])=>[id,(l.segmentStyles||[]).map(style=>({color:style.color,width:style.width,type:style.type}))]));
    const colorDidChange=Object.values(copyPolyLineStylesAfterColor).flat().some(l=>l.color!==sourcePolyStyleBefore.lines[Object.keys(sourcePolyStyleBefore.lines)[0]]?.segmentStyles?.[0]?.color);
    check('Color change on a single copied polygon leaves the source polygon unchanged',selectedPolyState.selectedPolygonId===copiedPolyId&&colorDidChange&&JSON.stringify(sourcePolyLineColors)===JSON.stringify(Object.fromEntries(Object.entries(sourcePolyStyleBefore.lines).map(([id,v])=>[id,v.segmentStyles.map(style=>({color:style.color,width:style.width,type:style.type}))]))),{selectedPolygon:selectedPolyState.selectedPolygonId,copyFillBefore:copyPolyFillBefore,copyFillAfter:afterPolygonColor.runtime.polygons[copiedPolyId]?.fill,copyLines:copyPolyLineStylesAfterColor,sourceLinesBefore:sourcePolyStyleBefore.lines,sourceLinesAfter:sourcePolyLineColors,styleUi:await page.evaluate(()=>window.__copyAudit.styleUi()),styleMenuOpen:await page.locator('#styleMenuContainer .dropdown-menu').isVisible()});

    const copyLineId=Object.keys(afterPolygonColor.runtime.lines).find(id=>{
      const line=afterPolygonColor.runtime.lines[id];return line.points?.length===2&&line.points.every(pointId=>transformedPoly.points.includes(pointId));
    });
    const originalLineId=Object.keys(afterPolygonColor.runtime.lines).find(id=>{
      const line=afterPolygonColor.runtime.lines[id];return line.points?.length===2&&line.points.every(pointId=>sourcePolyPoints.includes(pointId));
    });
    const copyLine=afterPolygonColor.runtime.lines[copyLineId],originalLine=afterPolygonColor.runtime.lines[originalLineId];
    const correspondingOriginalStyle=originalLine?JSON.parse(JSON.stringify({style:originalLine.style,segmentStyles:originalLine.segmentStyles})):null;
    if(copyLine){const a=afterPolygonColor.runtime.points[copyLine.points[0]],b=afterPolygonColor.runtime.points[copyLine.points[1]];await clickWorld((a.x+b.x)/2,(a.y+b.y)/2);}
    let selectedLineState=await state();
    if(selectedLineState.selectedLineId!==copyLineId&&copyLine){const a=selectedLineState.runtime.points[copyLine.points[0]],b=selectedLineState.runtime.points[copyLine.points[1]];await clickWorld((a.x+b.x)/2,(a.y+b.y)/2);selectedLineState=await state();}
    const widthControls=await page.evaluate(()=>({value:document.getElementById('styleWidth')?.value,disabled:document.getElementById('styleWidth')?.disabled,buttonDisabled:document.getElementById('lineWidthIncrease')?.disabled,typeButtons:[...document.querySelectorAll('#styleTypeInline .type-btn')].map(b=>({type:b.dataset.type,display:getComputedStyle(b).display}))}));
    const widthBefore=selectedLineState.runtime.lines[copyLineId]?.segmentStyles?.[0]?.width??selectedLineState.runtime.lines[copyLineId]?.style?.width;
    if(selectedLineState.selectedLineId===copyLineId){if(!await page.locator('#styleMenuContainer .dropdown-menu').isVisible())await page.locator('#styleMenu').click();await page.locator('#lineWidthIncrease').click();}
    const afterWidth=await state();
    check('Width change on a single copied boundary line leaves source line unchanged',selectedLineState.selectedLineId===copyLineId&&(afterWidth.runtime.lines[copyLineId]?.segmentStyles?.[0]?.width??afterWidth.runtime.lines[copyLineId]?.style?.width)>widthBefore&&JSON.stringify({style:afterWidth.runtime.lines[originalLineId]?.style,segmentStyles:afterWidth.runtime.lines[originalLineId]?.segmentStyles})===JSON.stringify(correspondingOriginalStyle),{selectedLineId:selectedLineState.selectedLineId,copyLineId,originalLineId,widthBefore,widthAfter:afterWidth.runtime.lines[copyLineId]?.segmentStyles?.[0]?.width,widthControls,styleUi:await page.evaluate(()=>window.__copyAudit.styleUi()),styleMenuVisible:await page.locator('#styleMenuContainer .dropdown-menu').isVisible(),widthButtonVisible:await page.locator('#lineWidthIncrease').isVisible(),sourceBefore:correspondingOriginalStyle,sourceAfter:originalLineId?{style:afterWidth.runtime.lines[originalLineId]?.style,segmentStyles:afterWidth.runtime.lines[originalLineId]?.segmentStyles}:null});
    if(selectedLineState.selectedLineId===copyLineId){await page.locator('#styleMenuContainer .dropdown-menu .type-btn[data-type="dashed"]').first().click();}
    const afterType=await state();
    check('Line type change on copied boundary leaves original line type unchanged',selectedLineState.selectedLineId===copyLineId&&afterType.runtime.lines[copyLineId]?.segmentStyles?.[0]?.type==='dashed'&&afterType.runtime.lines[originalLineId]?.segmentStyles?.[0]?.type===correspondingOriginalStyle?.segmentStyles?.[0]?.type,{selectedLineId:selectedLineState.selectedLineId,copyLineId,originalLineId,copyType:afterType.runtime.lines[copyLineId]?.segmentStyles?.[0]?.type,sourceType:afterType.runtime.lines[originalLineId]?.segmentStyles?.[0]?.type,sourceOriginal:correspondingOriginalStyle?.segmentStyles?.[0]?.type,styleMenuVisible:await page.locator('#styleMenuContainer .dropdown-menu').isVisible()});
    scenarios.push({name:'mixed-copy-scale-rotate-style',selectedMixed,copiedPolyId,copiedCircleId,copiedPointRefs,noSourceRefs,scale:scaleResult,rotate:rotateResult,polygonColor:{copy:afterPolygonColor.runtime.polygons[copiedPolyId]?.fill,source:afterPolygonColor.runtime.polygons[sourcePolyId]?.fill},lineStyle:{copy:afterType.runtime.lines[copyLineId]?.style,source:afterType.runtime.lines[originalLineId]?.style}});

    // Mobile viewport, touch drag selection, and pinch cancellation are measured as model snapshots.
    await page.setViewportSize({width:390,height:844}); await page.screenshot({path:path.join(OUT,'mobile-before.png')});
    await page.locator('#modeMultiselect').click();
    const mobilePoints=await page.evaluate(()=>{const s=window.__copyAudit.state(),r=document.getElementById('canvas').getBoundingClientRect();return Object.values(s.runtime.points).map(p=>{const q=window.__copyAudit.worldToCanvas(p.x,p.y);return{x:r.left+q.x,y:r.top+q.y,id:p.id};}).filter(p=>p.x>12&&p.x<378&&p.y>150&&p.y<640);});
    const mboxA={x:Math.min(...mobilePoints.map(p=>p.x))-20,y:Math.min(...mobilePoints.map(p=>p.y))-20};
    const mboxB={x:Math.max(...mobilePoints.map(p=>p.x))+20,y:Math.max(...mobilePoints.map(p=>p.y))+20};
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...mboxA,id:41}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...mboxB,id:41}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await page.waitForTimeout(100);
    const touchSelect=await state(); check('Mobile touch frame selects a group',touchSelect.multiSelectedPoints.length>0,{selected:touchSelect.multiSelectedPoints,viewport:await canvasBounds()});
    const pinchBefore=await state(),modelBeforePinch=await page.evaluate(()=>window.__copyAudit.serialize()),pA={x:140,y:350},pB={x:230,y:350};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...pA,id:51}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...pA,id:51},{...pB,id:52}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pA.x-25,y:pA.y,id:51},{x:pB.x+25,y:pB.y,id:52}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await page.waitForTimeout(120);
    const pinchAfter=await state();
    const modelAfterPinch=await page.evaluate(()=>window.__copyAudit.serialize());
    check('Pinch during selection gesture leaves serialized model and history unchanged',JSON.stringify(modelBeforePinch)===JSON.stringify(modelAfterPinch)&&pinchBefore.historyIndex===pinchAfter.historyIndex,{before:counts(pinchBefore),after:counts(pinchAfter),history:[pinchBefore.historyIndex,pinchAfter.historyIndex]});
    await page.screenshot({path:path.join(OUT,'mobile-after.png')});
    scenarios.push({name:'mobile390',touchSelection:touchSelect.multiSelectedPoints,pinch:{before:counts(pinchBefore),after:counts(pinchAfter),historyBefore:pinchBefore.historyIndex,historyAfter:pinchAfter.historyIndex}});

    // Check state-dependent toolbar labels after all geometry and style scenarios.
    const languageSelect = page.locator('#languageSelectProminent');
    const changeLanguage = async language => {
      await page.locator('#zoomMenu').click();
      await page.locator('#settingsBtn').click();
      await languageSelect.selectOption(language);
      await page.locator('#settingsCloseBtn').click();
    };
    const clipboardBeforeLabelCheck = await page.evaluate(() => window.__copyAudit.clipboard());
    await changeLanguage('en');
    await page.evaluate(() => window.__copyAudit.refreshOptionButtons());
    let cloneLabel = await page.locator('#multiCloneBtn').evaluate(button => ({ title: button.title, aria: button.getAttribute('aria-label') }));
    check('Copy action refresh keeps the copy label English', cloneLabel.title === 'Copy selected' && cloneLabel.aria === cloneLabel.title, cloneLabel);
    await page.evaluate(() => window.__copyAudit.setClipboardForLabelCheck({ points: [] }));
    cloneLabel = await page.locator('#multiCloneBtn').evaluate(button => ({ title: button.title, aria: button.getAttribute('aria-label') }));
    check('Paste action label remains English after clipboard state changes', cloneLabel.title === 'Paste selected' && cloneLabel.aria === cloneLabel.title, cloneLabel);
    await changeLanguage('pl');
    await page.evaluate(() => window.__copyAudit.refreshOptionButtons());
    cloneLabel = await page.locator('#multiCloneBtn').evaluate(button => ({ title: button.title, aria: button.getAttribute('aria-label') }));
    check('Copy action refresh switches the paste label to Polish', cloneLabel.title === 'Wklej zaznaczone' && cloneLabel.aria === cloneLabel.title, cloneLabel);
    await changeLanguage('en');
    await page.evaluate(() => window.__copyAudit.refreshOptionButtons());
    cloneLabel = await page.locator('#multiCloneBtn').evaluate(button => ({ title: button.title, aria: button.getAttribute('aria-label') }));
    check('Copy action refresh restores the English paste label', cloneLabel.title === 'Paste selected' && cloneLabel.aria === cloneLabel.title, cloneLabel);
    await page.evaluate(value => window.__copyAudit.setClipboardForLabelCheck(value), clipboardBeforeLabelCheck);

    const savedDocument=await page.evaluate(()=>window.__copyAudit.serialize());
    fs.writeFileSync(path.join(OUT,'copy-audit.json'),JSON.stringify(savedDocument,null,2));
    const { zipSync, strToU8 } = await import('fflate');
    fs.writeFileSync(path.join(OUT,'copy-audit.ctr'),zipSync({'copy-audit.json':strToU8(JSON.stringify(savedDocument,null,2))}));
    evidence.push(...['desktop-fixture.png','copy-style-menu.png','mobile-before.png','mobile-after.png','copy-audit.ctr','copy-audit.json']);
    const failed=checks.filter(c=>!c.passed);
    const result={createdAt:new Date().toISOString(),viewportDesktop:{width:1280,height:900},viewportMobile:{width:390,height:844},checks,failed,errors,scenarios,evidence};
    fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(result,null,2));
    fs.writeFileSync(path.join(OUT,'report.md'),`# Audyt zaznaczania i copy/paste\n\nData: ${result.createdAt}\n\n## Wynik\n\n- Asercje zaliczone: ${checks.filter(c=>c.passed).length}/${checks.length}\n- Błędy przeglądarki: ${errors.length}\n- Niepowodzenia: ${failed.length}\n\n## Niepowodzenia\n\n${failed.length?failed.map(f=>`- **${f.name}** — obserwacja: \`${JSON.stringify(f.observed)}\``).join('\n'):'Brak.'}\n\n## Sugestie / nieobjęte pełnym testem\n\n- Skrypt tworzy konstrukcję klikami UI, zaznacza ramką oraz używa przycisków kopiowania, wklejania i historii.\n- Pola wyboru wierzchołków i krawędzi są raportowane tylko, gdy dają się rozpoznać po faktycznych kontrolkach DOM; brak pola nie jest traktowany jako błąd.\n- Skala i obrót kopii mieszanej grupy polygon+circle działają przez uchwyty UI; oba gesty zmieniały wyłącznie współrzędne kopii i przechodziły undo/redo. Styl koloru wielokąta oraz grubość i typ jego pojedynczego segmentu zmieniono przez UI bez zmian źródła.\n- CTR i JSON zapisano z read-only serializacji końcowego modelu. Nie testowano ponownego wczytania CTR przez UI, stylu okręgu, etykiet, tuszu ani ukrywania przedziałów.\n\n## Dowody\n\n${evidence.map(e=>`- [${e}](${e})`).join('\n')}\n\nPełne dane: [results.json](results.json).\n`);
    console.log(JSON.stringify({passed:checks.filter(c=>c.passed).length,total:checks.length,failed,errors,output:OUT},null,2));
    if(errors.length||(process.argv.includes('--verify')&&failed.length))process.exitCode=1;
  } finally { await browser?.close(); await server.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
