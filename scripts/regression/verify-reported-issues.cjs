const fs = require('fs');
const path = require('path');
const OUTPUT_ROOT = path.resolve(__dirname, '../../output/playwright');
fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
const { zipSync, strToU8 } = require('fflate');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(OUTPUT_ROOT, 'reported-issues');
fs.mkdirSync(OUT, { recursive: true });
const results = { checks: [], errors: [] };
const archive = (name, document) => ({ name: name + '.ctr', bytes: Array.from(zipSync({ [name + '.json']: strToU8(JSON.stringify(document)) })) });
const toolsDocument = { model: { points: [{ id: 'pt1', x: 200, y: 400 }, { id: 'pt2', x: 600, y: 400 }, { id: 'pt3', x: 400, y: 150 }, { id: 'pt4', x: 750, y: 250 }], lines: [{ id: 'ln1', points: ['pt1', 'pt2'] }] } };
const files = [archive('test-incircle', JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/classical/incircle.json')))), archive('test-tools', toolsDocument)];
function check(name, passed, observed) {
  results.checks.push({ name, passed: !!passed, observed });
  if (!passed) throw Error(name + ': ' + JSON.stringify(observed));
}

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5187, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, serviceWorkers: 'block' });
    page.on('pageerror', error => results.errors.push(error.message));
    page.on('dialog', async dialog => { results.errors.push(dialog.message()); await dialog.dismiss(); });
    await page.addInitScript(data => {
      window.__reportedFiles = data;
      window.showDirectoryPicker = async () => ({
        kind: 'directory', name: 'Reported regressions', queryPermission: async () => 'granted', requestPermission: async () => 'granted',
        async *values() { for (const item of window.__reportedFiles) yield { kind: 'file', name: item.name, getFile: async () => new File([new Uint8Array(item.bytes)], item.name, { type: 'application/zip' }) }; }
      });
    }, files);
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `\nlet reportedLoadRevision=0;const reportedOriginalLoad=applyPersistedDocument;applyPersistedDocument=(...args)=>{const r=reportedOriginalLoad(...args);reportedLoadRevision++;return r;};window.__reported={state:()=>({runtime,mode,selectedPointId,selectedLineId,symmetricSourceId,pendingParallelPoint,pendingParallelLine,revision:reportedLoadRevision,selectedPolygonId,selectedCircleId,selectedAngleId,selectedLabel}),serialize:serializeCurrentDocument,worldToCanvas,findPoint,findLine,findCircle,findLabelAt};` });
    });
    await page.goto('http://127.0.0.1:5187/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__reported);
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
    const state = () => page.evaluate(() => window.__reported.state());
    const click = async p => {
      const c = await page.evaluate(p => { const r=document.getElementById('canvas').getBoundingClientRect(), c=window.__reported.worldToCanvas(p.x,p.y);return {x:r.left+c.x,y:r.top+c.y}; }, p);
      await page.mouse.click(c.x, c.y);
    };
    const clickPoint = async id => click((await state()).runtime.points[id]);
    const clearCanvasSelection = async () => {
      const blank=await page.evaluate(()=>{const a=window.__reported,rect=document.getElementById('canvas').getBoundingClientRect();for(let y=60;y<760;y+=53)for(let x=1030;x>60;x-=59){const p={x,y},c=a.worldToCanvas(x,y);if(document.elementFromPoint(rect.left+c.x,rect.top+c.y)?.id!=='canvas'||a.findPoint(p)||a.findLine(p)||a.findCircle(p,undefined,false)||a.findLabelAt(p))continue;return p;}return null;});
      if(!blank)throw Error('No blank canvas target for clearing selection');await click(blank);
    };
    const load = async name => {
      await page.locator('#modeMove').click();
      await clearCanvasSelection();
      results.lastLoadSelection={name,...await state()};
      delete results.lastLoadSelection.runtime;
      const revision = (await state()).revision;
      if (!(await page.locator('#cloudPanel').isVisible())) await page.locator('#cloudFilesBtn').click();
      await page.locator('#localFileList [data-change-folder]').click();
      await page.getByRole('button', { name: 'Wczytaj ' + name, exact: true }).click();
      await page.waitForFunction(r => window.__reported.state().revision > r, revision);
      await page.locator('#cloudCloseBtn').click();
    };
    const drag = async (id, target) => {
      const before = await state(), original = before.runtime.points[id];
      const screen = await page.evaluate(({ from, to }) => { const r=document.getElementById('canvas').getBoundingClientRect(), convert=p=>{const c=window.__reported.worldToCanvas(p.x,p.y);return {x:r.left+c.x,y:r.top+c.y};};return {from:convert(from),to:convert(to)}; }, { from: original, to: target });
      await page.mouse.move(screen.from.x, screen.from.y); await page.mouse.down();
      await page.mouse.move(screen.to.x, screen.to.y, { steps: 10 }); await page.mouse.up();
      const after = await state();
      check('Vertex actually moves', Math.hypot(after.runtime.points[id].x-original.x, after.runtime.points[id].y-original.y)>0.5, { original, actual:after.runtime.points[id] });
      return after;
    };

    await load('test-incircle');
    const contacts = [];
    for (const lineId of ['ln2', 'ln3']) {
      const before = await state(), line = before.runtime.lines[lineId], a = before.runtime.points[line.defining_points[0]], b = before.runtime.points[line.defining_points[1]], circle = before.runtime.circles.c1;
      const center = before.runtime.points[circle.center], rp = before.runtime.points[circle.radius_point], radius = Math.hypot(rp.x-center.x,rp.y-center.y);
      await page.locator('#modeIntersection').click();
      await click({ x: a.x + (b.x-a.x)*0.2, y: a.y + (b.y-a.y)*0.2 });
      await click({ x: center.x, y: center.y-radius });
      const after = await state(), added = Object.values(after.runtime.points).filter(p => !before.runtime.points[p.id] && p.parent_refs?.some(ref=>ref.id===lineId) && p.parent_refs?.some(ref=>ref.id==='c1'));
      check('UI creates one stable incircle contact', added.length===1 && added[0].geometryValid!==false, { lineId, added });
      contacts.push({ id: added[0].id, lineId });
    }
    let maxError = 0;
    for (let i = 0; i < 25; i++) {
      const s = await drag('pt3', { x: 430+65*Math.sin(i*0.37+0.5), y: 260+45*Math.cos(i*0.29+0.2) });
      const center = s.runtime.points[s.runtime.circles.c1.center];
      for (const contact of contacts) {
        const p=s.runtime.points[contact.id], line=s.runtime.lines[contact.lineId], a=s.runtime.points[line.defining_points[0]], b=s.runtime.points[line.defining_points[1]];
        const dx=b.x-a.x,dy=b.y-a.y,t=((center.x-a.x)*dx+(center.y-a.y)*dy)/(dx*dx+dy*dy);
        const error=Math.hypot(p.x-(a.x+dx*t),p.y-(a.y+dy*t)); maxError=Math.max(maxError,error);
        check('Incircle contact stays available at the tangency', p.geometryValid!==false && error<1e-5, { i, id:p.id, error, valid:p.geometryValid });
      }
    }
    results.contactSummary = { contacts, deformations:25, maxError };
    const saved = await page.evaluate(() => window.__reported.serialize());
    await page.evaluate(file => window.__reportedFiles.push(file), archive('test-roundtrip', saved));
    await load('test-roundtrip');
    const restored = await state();
    check('Contact IDs and validity survive native file import', contacts.every(c=>restored.runtime.points[c.id]?.geometryValid!==false), contacts);

    await load('test-tools');
    await page.locator('#modeMidpoint').click(); await click({ x:400,y:400 });
    const midpointState = await state(), midpoint = Object.values(midpointState.runtime.points).find(p=>p.midpointMeta);
    check('Midpoint tool creates a dependent midpoint', !!midpoint && midpoint.x===400 && midpoint.y===400, midpoint);
    for (const tool of [
      { id:'modePerpendicular', kind:'perpendicular', pointId:midpoint.id },
      { id:'modeParallel', kind:'parallel', pointId:'pt4' }
    ]) {
      await page.locator('#modeMove').click(); await clickPoint(tool.pointId); await click({x:260,y:400});
      const inputs = await state();
      check(tool.kind + ': selecting a side replaces point selection', inputs.selectedLineId==='ln1' && inputs.selectedPointId===null, {point:inputs.selectedPointId,line:inputs.selectedLineId});
      const before = Object.keys(inputs.runtime.lines);
      await page.locator('#'+tool.id).click();
      const start = await state();
      check(tool.kind + ': toolbar activation creates no construction from previous selections', Object.keys(start.runtime.lines).length===before.length && start.pendingParallelPoint===null && start.pendingParallelLine===null, {point:start.pendingParallelPoint,line:start.pendingParallelLine});
      await clickPoint(tool.pointId);
      const first = await state();
      check(tool.kind + ': first explicit input only selects the point', Object.keys(first.runtime.lines).length===before.length && first.pendingParallelPoint===tool.pointId, null);
      await click({x:260,y:400});
      const added = Object.values((await state()).runtime.lines).filter(l=>!before.includes(l.id));
      check(tool.kind + ': explicit point and side create the expected line', added.length===1 && added[0][tool.kind]?.throughPoint===tool.pointId && added[0][tool.kind]?.referenceLine==='ln1', added);
      await page.locator('#undo').click();
      check(tool.kind + ': Undo removes the new line', Object.keys((await state()).runtime.lines).length===before.length, null);
      await page.locator('#redo').click();
      check(tool.kind + ': Redo restores the new line', Object.keys((await state()).runtime.lines).length===before.length+1, null);
    }

    await page.locator('#modeMove').click(); await clickPoint('pt3');
    const pointCount = Object.keys((await state()).runtime.points).length;
    await page.locator('#modeSymmetric').click();
    const symmetricStart = await state();
    check('Reflection activation clears previous selection and source', symmetricStart.selectedPointId===null && symmetricStart.selectedLineId===null && symmetricStart.symmetricSourceId===null, { point:symmetricStart.selectedPointId,line:symmetricStart.selectedLineId,source:symmetricStart.symmetricSourceId });
    await clickPoint('pt2');
    const explicitSource = await state();
    check('First reflection click chooses a fresh source without creating a point', explicitSource.symmetricSourceId==='pt2' && Object.keys(explicitSource.runtime.points).length===pointCount, null);
    await clickPoint(midpoint.id);
    const reflected = await state(), image = Object.values(reflected.runtime.points).find(p=>p.symmetricMeta?.source==='pt2');
    check('Reflection uses the explicitly chosen source', !!image && Math.hypot(image.x-200,image.y-400)<1e-6, image);

    await page.locator('#modeMove').click(); await clickPoint('pt3'); await click({x:260,y:400}); await clearCanvasSelection();
    const beforeCancel = Object.keys((await state()).runtime.lines).length;
    await page.locator('#modePerpendicular').click();
    const cancelled = await state();
    check('Tool starts without inputs after clearing selection', Object.keys(cancelled.runtime.lines).length===beforeCancel && cancelled.pendingParallelPoint===null && cancelled.pendingParallelLine===null, {point:cancelled.pendingParallelPoint,line:cancelled.pendingParallelLine});
    check('No browser exceptions or error dialogs', results.errors.length===0, results.errors);
    await page.screenshot({ path:path.join(OUT,'final.png') });
    console.log(JSON.stringify({checks:results.checks.length,passed:results.checks.filter(c=>c.passed).length,contacts:results.contactSummary,errors:results.errors}));
  } finally {
    fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));
    await browser?.close(); await server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
