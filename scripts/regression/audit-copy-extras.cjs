const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { zipSync, strToU8 } = require('fflate');

const OUT = path.resolve('output/playwright/copy-audit-extras');
fs.mkdirSync(OUT, { recursive: true });
const checks = [], errors = [], suggestions = [], steps = [];
const check = (name, passed, observed = {}) => checks.push({ name, passed: !!passed, observed });

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5198, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true, serviceWorkers:'block' });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('copy-recovery-fixture')) return;
      sessionStorage.setItem('copy-recovery-fixture','seeded');
      // Old versions could persist spatial points without the group/solid needed to paste them.
      localStorage.setItem('constrivia.copied_objects.v1',JSON.stringify({
        points:[{id:'old-spatial-point',x:10,y:20,style:{},spatial:{groupId:'missing-group',binding:{kind:'vertex',solidId:'missing-solid',vertex:0}}}],
        lines:[],circles:[],angles:[],polygons:[],labels:[],inkStrokes:[]
      }));
    });
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', async d => { errors.push('dialog: ' + d.message()); await d.dismiss(); });
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
window.__copyExtras = {
 state:()=>({runtime,mode,selectedPointId,selectedLineId,selectedPolygonId,selectedAngleId,selectedInkStrokeId,selectionVertices,selectionEdges,multiSelectedPoints:[...multiSelectedPoints],multiSelectedLines:[...multiSelectedLines],multiSelectedLabels:[...multiSelectedLabels],multiSelectedInkStrokes:[...multiSelectedInkStrokes],selectedSegments:[...selectedSegments],historyIndex,historyLength:history.length}),
 clipboard:()=>copiedObjects?JSON.parse(JSON.stringify(copiedObjects)):null,
 serialize:serializeCurrentDocument,worldToCanvas,getPointLabelPos,hitLines:(p)=>findLineHits(p)
};` });
    });
    await page.goto('http://127.0.0.1:5198/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__copyExtras);
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
    const state = () => page.evaluate(() => window.__copyExtras.state());
    check('Niekompletny schowek ze starszej wersji jest odrzucany i usuwany z localStorage',await page.evaluate(()=>!window.__copyExtras.clipboard()&&!localStorage.getItem('constrivia.copied_objects.v1')));
    await page.reload({waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.__copyExtras);
    check('Odświeżenie nie przywraca wadliwego schowka',await page.evaluate(()=>!window.__copyExtras.clipboard()&&!localStorage.getItem('constrivia.copied_objects.v1')));
    const worldScreen = async p => page.evaluate(p => { const r=document.getElementById('canvas').getBoundingClientRect(),c=window.__copyExtras.worldToCanvas(p.x,p.y); return {x:r.left+c.x,y:r.top+c.y}; }, p);
    const click = async p => { const q=await worldScreen(p); const target=await page.evaluate(q=>document.elementFromPoint(q.x,q.y)?.outerHTML.slice(0,300),q); if(!target?.startsWith('<canvas')) throw new Error(`Canvas target obscured at ${JSON.stringify(p)}: ${target}`); await page.mouse.click(q.x,q.y); };
    const drag = async (a,b) => { const p=await worldScreen(a),q=await worldScreen(b); await page.mouse.move(p.x,p.y); await page.mouse.down(); await page.mouse.move(q.x,q.y,{steps:10}); await page.mouse.up(); };
    const frame = async (a,b) => { await page.locator('#modeMultiselect').click(); await drag(a,b); };
    const counts = s => Object.fromEntries(['points','lines','labels','inkStrokes'].map(k=>[k,Object.keys(s.runtime[k]||{}).length]));
    const copyFrame = async (a,b) => { await frame(a,b); const pre=await state(); const selected={labels:[...pre.multiSelectedLabels],ink:[...pre.multiSelectedInkStrokes],lines:[...pre.multiSelectedLines]}; await page.locator('#multiCloneBtn').click(); const clip=await page.evaluate(()=>window.__copyExtras.clipboard()); await page.locator('#multiCloneBtn').click(); return {pre,selected,clip,after:await state()}; };

    // Free label: add and edit in the actual label UI, then frame-copy and drag the copy.
    await page.locator('#modeLabel').click(); await click({x:260,y:190});
    await page.locator('#labelText').fill('etykieta niezależna');
    let s=await state();
    const freeSource=Object.values(s.runtime.labels).find(l=>l.text==='etykieta niezależna');
    check('Wolna etykieta została utworzona i zapisana z UI',!!freeSource,{source:freeSource});
    if (freeSource) {
      const result=await copyFrame({x:freeSource.pos.x-30,y:freeSource.pos.y-30},{x:freeSource.pos.x+200,y:freeSource.pos.y+100});
      const copyId=Object.keys(result.after.runtime.labels).find(id=>id!==freeSource.id);
      const copiedBefore=copyId?structuredClone(result.after.runtime.labels[copyId]):null;
      await page.locator('#modeMove').click();
      if (copiedBefore) await drag(copiedBefore.pos,{x:copiedBefore.pos.x+48,y:copiedBefore.pos.y+24});
      s=await state(); const copiedAfter=copyId?s.runtime.labels[copyId]:null; const sourceAfter=s.runtime.labels[freeSource.id];
      check('Kopia etykiety ma nowe ID, zachowuje tekst i przesuwa się niezależnie',!!copyId&&copyId!==freeSource.id&&copiedAfter?.text==='etykieta niezależna'&&Math.hypot(copiedAfter.pos.x-copiedBefore.pos.x,copiedAfter.pos.y-copiedBefore.pos.y)>10&&JSON.stringify(sourceAfter)===JSON.stringify(freeSource),{sourceId:freeSource.id,copyId,copiedBefore,copiedAfter,sourceBefore:freeSource,sourceAfter});
      if (copiedAfter) {
        const target=await worldScreen(copiedAfter.pos);
        await page.mouse.dblclick(target.x,target.y);
        await page.locator('#labelText').fill('zmieniona tylko kopia');
        s=await state();
        check('Edycja tekstu kopii etykiety przez podwójny klik nie zmienia źródła',s.runtime.labels[copyId].text==='zmieniona tylko kopia'&&s.runtime.labels[freeSource.id].text===freeSource.text,{source:s.runtime.labels[freeSource.id],copy:s.runtime.labels[copyId]});
      }
      steps.push({name:'free-label-copy-and-move',selection:result.selected,copyId,source:freeSource,copyBefore:copiedBefore,copyAfter:copiedAfter});
    }

    // Point-attached label: duplicate the labeled point through a real frame, then drag the copied label itself.
    await page.locator('#modeAdd').click(); await click({x:700,y:400});
    await page.locator('#modeMove').click(); await click({x:700,y:400});
    await page.locator('#modeLabel').click(); await click({x:700,y:400});
    s=await state();
    const labeledSource=Object.values(s.runtime.points).find(p=>Math.abs(p.x-700)<3&&Math.abs(p.y-400)<3&&p.label?.text);
    check('Etykieta punktu została przypisana narzędziem Label',!!labeledSource?.label,{point:labeledSource});
    if(labeledSource) {
      const sourcePos=await page.evaluate(id=>window.__copyExtras.getPointLabelPos(id),labeledSource.id);
      const result=await copyFrame({x:660,y:360},{x:750,y:450});
      const copyPointId=result.after.multiSelectedPoints.find(id=>id!==labeledSource.id&&result.after.runtime.points[id]?.label?.text===labeledSource.label.text);
      const copyPoint=result.after.runtime.points[copyPointId];
      const copyPos=copyPointId?await page.evaluate(id=>window.__copyExtras.getPointLabelPos(id),copyPointId):null;
      await page.locator('#modeMove').click();
      if(copyPos) await drag(copyPos,{x:copyPos.x+36,y:copyPos.y+28});
      s=await state();
      const sourceAfter=s.runtime.points[labeledSource.id],copyAfter=s.runtime.points[copyPointId];
      const copyPosAfter=copyPointId?await page.evaluate(id=>window.__copyExtras.getPointLabelPos(id),copyPointId):null;
      check('Kopia zachowuje etykietę punktu; przesunięcie etykiety zmienia tylko jej offset, nie punkt ani źródło',!!copyPointId&&result.after.multiSelectedPoints.includes(copyPointId)&&copyAfter?.label?.text===labeledSource.label.text&&Math.hypot(copyPosAfter.x-copyPos.x,copyPosAfter.y-copyPos.y)>10&&copyAfter.x===copyPoint.x&&copyAfter.y===copyPoint.y&&JSON.stringify(sourceAfter)===JSON.stringify(labeledSource),{sourceId:labeledSource.id,copyPointId,sourcePos,copyPos,copyPosAfter,sourceBefore:labeledSource,sourceAfter,copyBefore:copyPoint,copyAfter});
      steps.push({name:'point-label-copy-and-offset-drag',sourceId:labeledSource.id,copyPointId,sourcePos,copyPos,copyPosAfter,sourceAfter,copyAfter});
    }

    // Handwriting: draw an actual stroke, frame it, paste, and move the copied stroke via the move tool.
    await page.locator('#modeHandwriting').click();
    await drag({x:470,y:190},{x:550,y:230});
    s=await state(); const inkSource=Object.values(s.runtime.inkStrokes).at(-1);
    check('Narzędzie pisma odręcznego utworzyło tusz gestem',!!inkSource&&inkSource.points?.length>=2,{inkSource});
    if (inkSource) {
      const xs=inkSource.points.map(p=>p.x),ys=inkSource.points.map(p=>p.y);
      const result=await copyFrame({x:Math.min(...xs)-15,y:Math.min(...ys)-15},{x:Math.max(...xs)+15,y:Math.max(...ys)+15});
      const copyId=Object.keys(result.after.runtime.inkStrokes).find(id=>id!==inkSource.id);
      const copyBefore=copyId?structuredClone(result.after.runtime.inkStrokes[copyId]):null;
      await page.locator('#modeMove').click();
      if(copyBefore) await drag(copyBefore.points[0],{x:copyBefore.points[0].x+40,y:copyBefore.points[0].y+20});
      s=await state(); const copyAfter=copyId?s.runtime.inkStrokes[copyId]:null;
      const sourceAfter=s.runtime.inkStrokes[inkSource.id];
      check('Tuszkopia ma nowe ID, zaznaczono ją i gest move zmienia wyłącznie kopię',!!copyId&&result.after.multiSelectedInkStrokes.includes(copyId)&&copyAfter?.points?.some((p,i)=>Math.hypot(p.x-copyBefore.points[i].x,p.y-copyBefore.points[i].y)>10)&&JSON.stringify(sourceAfter)===JSON.stringify(inkSource),{sourceId:inkSource.id,copyId,selected:result.after.multiSelectedInkStrokes,sourceBefore:inkSource,sourceAfter,copyBefore,copyAfter});
      steps.push({name:'ink-copy-and-move',selected:result.selected,copyId,source:inkSource,copyBefore,copyAfter});
    }

    // Create one subdivided line using the real point-on-line tool (no angle overlay at the hit target).
    await page.locator('#modeSegment').click(); await click({x:210,y:450}); await click({x:410,y:450});
    await page.locator('#modeAdd').click(); await click({x:310,y:450});
    s=await state();
    const subdivided=Object.values(s.runtime.lines).find(l=>l.points?.length===3);
    check('Wstawienie punktu narzędziem Point rzeczywiście podzieliło linię na dwa interwały',!!subdivided&&subdivided.segmentStyles?.length===2,{line:subdivided,allLines:Object.values(s.runtime.lines).map(l=>({id:l.id,points:l.points,styles:l.segmentStyles})),allPoints:Object.values(s.runtime.points).map(p=>({id:p.id,x:p.x,y:p.y})),mode:s.mode});
    if (subdivided) {
      const pointAt=id=>s.runtime.points[id];
      const first=pointAt(subdivided.points[0]),mid=pointAt(subdivided.points[1]),last=pointAt(subdivided.points[2]);
      await page.locator('#modeMove').click();
      const segmentMid={x:(first.x+mid.x)/2,y:(first.y+mid.y)/2};
      const hitEvidence=await page.evaluate(p=>window.__copyExtras.hitLines(p),segmentMid);
      await click(segmentMid);
      if (!(await state()).selectedSegments.includes(`${subdivided.id}:s:0`)) await click(segmentMid);
      const beforeHide=await state();
      if (!beforeHide.selectedSegments.includes(`${subdivided.id}:s:0`)) throw new Error('Source interval selection failed');
      await page.locator('#hideButton').click(); s=await state();
      const hiddenSource=structuredClone(s.runtime.lines[subdivided.id]);
      const sourceHiddenByUi=s.runtime.lines[subdivided.id]?.segmentStyles?.some(st=>st.hidden===true);
      check('Ukrywanie zaznaczonego fragmentu ukrywa tylko pierwszy interwał',sourceHiddenByUi&&!hiddenSource.hidden&&!hiddenSource.segmentStyles[1].hidden,{selected:beforeHide.selectedSegments,hitEvidence,line:hiddenSource});
      // Select full source line by frame and copy its hidden segment state.
      const minX=Math.min(first.x,mid.x,last.x)-25,maxX=Math.max(first.x,mid.x,last.x)+25,minY=Math.min(first.y,mid.y,last.y)-25,maxY=Math.max(first.y,mid.y,last.y)+25;
      const result=await copyFrame({x:minX,y:minY},{x:maxX,y:maxY});
      const copyLineId=result.after.multiSelectedLines.find(id=>id!==subdivided.id&&result.after.runtime.lines[id]?.points?.length===3);
      const copyLine=copyLineId?result.after.runtime.lines[copyLineId]:null;
      const sourcePoints=subdivided.points,copyPoints=copyLine?.points||[];
      check('Kopia podzielonej linii ma nowe ID, nowe punkty i zachowuje style interwałów',!!copyLine&&copyLineId!==subdivided.id&&copyPoints.length===3&&copyPoints.every(id=>!sourcePoints.includes(id))&&JSON.stringify(copyLine.segmentStyles)===JSON.stringify(hiddenSource.segmentStyles),{sourceId:subdivided.id,copyLineId,sourcePoints,copyPoints,sourceStyles:hiddenSource.segmentStyles,copyStyles:copyLine?.segmentStyles,preSelection:result.pre.multiSelectedLines,preSelectionVertices:result.pre.multiSelectedPoints,selectionEdges:result.pre.selectionEdges,selectedAfter:result.after.multiSelectedLines});
      if(copyLine) {
        const p0=result.after.runtime.points[copyLine.points[0]],pm=result.after.runtime.points[copyLine.points[1]];
        const hiddenIndex=(copyLine.segmentStyles||[]).findIndex(st=>st.hidden);
        const a=hiddenIndex===0?p0:pm,b=hiddenIndex===0?pm:result.after.runtime.points[copyLine.points[2]];
        if(!sourceHiddenByUi) { /* Visibility isolation cannot be established without a hidden source fragment. */ }
        else if(hiddenIndex<0||!a||!b) { suggestions.push(`Kopia nie zachowała indeksu hidden=${hiddenIndex}; style kopii: ${JSON.stringify(copyLine.segmentStyles)}.`); }
        else {
        const target={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        await page.locator('#modeMove').click();
        const showHidden=page.locator('#showHiddenBtn');
        const showing=await showHidden.getAttribute('aria-pressed');
        if(showing!=='true') { await page.locator('#zoomMenu').click(); await showHidden.click(); }
        await click(target);
        const segmentKey=`${copyLineId}:s:${hiddenIndex}`;
        if (!(await state()).selectedSegments.includes(segmentKey)) await click(target);
        if (!(await state()).selectedSegments.includes(segmentKey)) throw new Error('Copied interval selection failed');
        await page.locator('#hideButton').click();
        s=await state();
        check('Zmiana widoczności interwału kopii nie ujawnia interwału źródła',s.runtime.lines[copyLineId].segmentStyles[hiddenIndex].hidden===false&&s.runtime.lines[subdivided.id].segmentStyles.some(st=>st.hidden===true),{showHiddenPressed:await showHidden.getAttribute('aria-pressed'),source:hiddenSource.segmentStyles,sourceAfter:s.runtime.lines[subdivided.id].segmentStyles,copyAfter:s.runtime.lines[copyLineId].segmentStyles,hiddenIndex});
        steps.push({name:'hidden-segment-copy-toggle',sourceId:subdivided.id,copyLineId,sourceStyles:hiddenSource.segmentStyles,copyStyles:s.runtime.lines[copyLineId].segmentStyles,sourcePoints,copyPoints});
        }
      }
    }

    // Save an actual native CTR plus a machine-readable report.
    const document=await page.evaluate(()=>window.__copyExtras.serialize());
    fs.writeFileSync(path.join(OUT,'copy-audit-extras.ctr'),zipSync({'copy-audit-extras.json':strToU8(JSON.stringify(document,null,2))}));
    const report={title:'Audyt kopiowania etykiet, tuszu i ukrytych interwałów',date:new Date().toISOString(),port:5198,checks,errors,suggestions,steps,finalCounts:counts(await state()),ctr:'copy-audit-extras.ctr'};
    fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
    const md=['# Audyt kopiowania: etykiety, tusz i ukryte interwały','',`Wynik: **${checks.filter(c=>c.passed).length}/${checks.length} asercji zaliczonych**.`, '', '## Asercje', ...checks.map(c=>`- ${c.passed?'PASS':'FAIL'} — ${c.name}\n  \n  Dowód: \`${JSON.stringify(c.observed)}\``), '', '## Błędy runtime', ...(errors.length?errors.map(e=>`- ${e}`):['- Brak']), '', '## Sugestie / niepokryte obszary', ...(suggestions.length?suggestions.map(e=>`- ${e}`):['- Brak dodatkowych sugestii.']), '', 'Zapisano bieżący dokument jako `copy-audit-extras.ctr`; skrypt wykonał gesty UI i odczyt stanu bez mutowania modelu przez evaluate.'].join('\n');
    fs.writeFileSync(path.join(OUT,'report.md'),md);
    await page.screenshot({path:path.join(OUT,'final.png'),fullPage:false});
    const failed=checks.filter(c=>!c.passed);
    console.log(`Copy extras: ${checks.length-failed.length}/${checks.length} PASS; runtime errors=${errors.length}; CTR=${path.join(OUT,'copy-audit-extras.ctr')}`);
    if(errors.length||(process.argv.includes('--verify')&&failed.length)) process.exitCode=1;
  } catch(e) { errors.push(e.stack||String(e)); fs.writeFileSync(path.join(OUT,'failure.txt'),errors.at(-1)); process.exitCode=1; }
  finally { if(browser) await browser.close(); await server.close(); }
})().catch(e=>{console.error(e);fs.writeFileSync(path.join(OUT,'failure.txt'),e.stack||String(e));process.exitCode=1;});
