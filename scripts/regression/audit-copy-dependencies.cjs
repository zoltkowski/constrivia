const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { zipSync, strToU8 } = require('fflate');

const output = path.resolve(__dirname, '../../output/playwright/copy-audit-dependencies');
fs.mkdirSync(output, { recursive: true });
const report = { checks: [], errors: [] };
const check = (name, passed, observed) => report.checks.push({ name, passed, observed });

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5197, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    const setup = async () => {
      const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, serviceWorkers: 'block' });
      page.on('pageerror', error => report.errors.push(error.message));
      await page.route('**/src/main.ts*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__dependencyAudit={state:()=>({runtime,mode,panOffset,zoomFactor,selectedLineId,multiSelectedPoints:[...multiSelectedPoints],multiSelectedLines:[...multiSelectedLines],clipboard:copiedObjects,historyIndex}),serialize:serializeCurrentDocument,worldToCanvas,pointHit:p=>findPoint(p),lineHit:p=>findLine(p)};` });
      });
      await page.goto('http://127.0.0.1:5197/', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__dependencyAudit);
      if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
      const state = () => page.evaluate(() => window.__dependencyAudit.state());
      const screen = p => page.evaluate(p => {
        const rect = document.getElementById('canvas').getBoundingClientRect();
        const q = window.__dependencyAudit.worldToCanvas(p.x, p.y);
        return { x: rect.left + q.x, y: rect.top + q.y };
      }, p);
      const click = async p => {
        const q = await screen(p);
        if (await page.evaluate(q => document.elementFromPoint(q.x, q.y)?.id, q) !== 'canvas') throw new Error('Canvas target obscured');
        await page.mouse.click(q.x, q.y);
      };
      const drag = async (a, b) => {
        const p = await screen(a), q = await screen(b);
        await page.mouse.move(p.x, p.y); await page.mouse.down();
        await page.mouse.move(q.x, q.y, { steps: 12 }); await page.mouse.up();
      };
      for (const p of [{ x: 180, y: 260 }, { x: 440, y: 260 }, { x: 260, y: 440 }]) {
        await page.locator('#modeAdd').click(); await click(p);
      }
      let s = await state();
      const points = Object.values(s.runtime.points);
      if (points.length !== 3) throw new Error('Free point UI setup did not create exactly three points');
      const [a, b, c] = points;
      await page.locator('#modeSegment').click(); await click(a); await click(b);
      s = await state();
      const base = Object.values(s.runtime.lines).find(line => line.defining_points.includes(a.id) && line.defining_points.includes(b.id));
      if (!base) throw new Error('Segment UI setup failed');
      const save = async name => {
        const doc = await page.evaluate(() => window.__dependencyAudit.serialize());
        fs.writeFileSync(path.join(output, `${name}.ctr`), zipSync({ [`${name}.json`]: strToU8(JSON.stringify(doc)) }));
        await page.screenshot({ path: path.join(output, `${name}.png`) });
      };
      return { page, state, click, drag, a, b, c, base, save };
    };

    const midpoint = await setup();
    try {
      const { page, state, click, drag, a, b, base, save } = midpoint;
      await page.locator('#modeMidpoint').click(); await click({ x: (a.x + b.x) / 2, y: a.y });
      let s = await state();
      const m = Object.values(s.runtime.points).find(p => p.midpointMeta?.parentLineId === base.id);
      if (!m) throw new Error('Midpoint tool did not create a line midpoint');
      await page.locator('#modeMultiselect').click(); await click(m);
      s = await state();
      if (s.multiSelectedPoints.length !== 1 || s.multiSelectedPoints[0] !== m.id) throw new Error('Midpoint-only selection precondition failed');
      await page.locator('#multiCloneBtn').click();
      const clipboard = (await state()).clipboard;
      await page.locator('#multiCloneBtn').click();
      s = await state();
      const copyId = s.multiSelectedPoints.find(id => id !== m.id);
      const copy = s.runtime.points[copyId];
      if (!copy) throw new Error('Midpoint paste did not create a new point');
      check('Midpoint copy contains no references to original inputs', copy.midpointMeta.parents.every(id => ![a.id, b.id].includes(id)) && copy.midpointMeta.parentLineId !== base.id,
        { source: m.id, copy: copyId, clipboardPoints: clipboard.points.map(p => p.id), clipboardLines: clipboard.lines.map(l => l.id), copiedMeta: copy.midpointMeta });
      const before = { x: copy.x, y: copy.y };
      await page.locator('#modeMove').click(); await drag(a, { x: a.x - 70, y: a.y - 50 });
      s = await state();
      if (Math.hypot(s.runtime.points[a.id].x - a.x, s.runtime.points[a.id].y - a.y) < 10) throw new Error('Original source point did not move');
      const after = s.runtime.points[copyId];
      check('Moving the original endpoint leaves the copied midpoint fixed', !!after && Math.hypot(after.x - before.x, after.y - before.y) < 1e-6,
        { before, after: after && { x: after.x, y: after.y }, originalEndpoint: s.runtime.points[a.id], copiedMeta: after?.midpointMeta });
      await save('midpoint-follows-original');
      await click(s.runtime.points[a.id]); await page.locator('#deletePoint').click();
      s = await state();
      check('Deleting an original endpoint keeps the copied midpoint', !!s.runtime.points[copyId], { copyId, remaining: Object.keys(s.runtime.points) });
      await page.locator('#undo').click();
      check('Undo restores the source and copied midpoint', !!(await state()).runtime.points[a.id] && !!(await state()).runtime.points[copyId], { copyId });
    } catch (error) { report.errors.push(`midpoint: ${error.stack || error}`); }
    finally { await midpoint.page.close(); }

    const parallel = await setup();
    try {
      const { page, state, click, drag, a, b, c, base, save } = parallel;
      await page.locator('#modeParallel').click(); await click(c); await click({ x: (a.x + b.x) / 2, y: a.y });
      let s = await state();
      const line = Object.values(s.runtime.lines).find(l => l.parallel?.referenceLine === base.id);
      if (!line) throw new Error('Parallel tool did not create a dependent line');
      const inputs = line.defining_points.map(id => s.runtime.points[id]);
      const dx = inputs[1].x - inputs[0].x, dy = inputs[1].y - inputs[0].y, length = Math.hypot(dx, dy);
      const target = { x: inputs[0].x + dx / length * 90, y: inputs[0].y + dy / length * 90 };
      await page.locator('#modeMultiselect').click(); await click(target);
      s = await state();
      if (s.multiSelectedLines.length !== 1 || s.multiSelectedLines[0] !== line.id) throw new Error(`Parallel-only selection precondition failed: ${JSON.stringify({line,target,points:s.multiSelectedPoints,lines:s.multiSelectedLines,hit:await page.evaluate(p=>({point:window.__dependencyAudit.pointHit(p),line:window.__dependencyAudit.lineHit(p)}),target)})}`);
      await page.locator('#multiCloneBtn').click(); await page.locator('#multiCloneBtn').click();
      s = await state();
      const copyId = s.multiSelectedLines.find(id => id !== line.id), copy = s.runtime.lines[copyId];
      if (!copy) throw new Error('Parallel paste did not create a new line');
      check('Copied parallel has its own reference line', copy.parallel.referenceLine !== base.id,
        { source: line.id, copy: copyId, copiedMeta: copy.parallel, copiedPoints: copy.points });
      const before = copy.defining_points.map(id => ({ x: s.runtime.points[id].x, y: s.runtime.points[id].y }));
      await page.locator('#modeMove').click(); await drag(b, { x: b.x + 30, y: b.y + 70 });
      s = await state();
      if (Math.hypot(s.runtime.points[b.id].x - b.x, s.runtime.points[b.id].y - b.y) < 10) throw new Error('Original reference line did not rotate');
      const after = s.runtime.lines[copyId].defining_points.map(id => ({ x: s.runtime.points[id].x, y: s.runtime.points[id].y }));
      check('Rotating the original reference leaves the pasted parallel fixed', after.every((p, i) => Math.hypot(p.x - before[i].x, p.y - before[i].y) < 1e-6), { before, after });
      await save('parallel-follows-original');
    } catch (error) { report.errors.push(`parallel: ${error.stack || error}`); }
    finally { await parallel.page.close(); }
  } finally {
    await browser?.close(); await server.close();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify({ checks: report.checks.length, violations: report.checks.filter(c => !c.passed).length, errors: report.errors }));
  if (report.errors.length || (process.argv.includes('--verify') && report.checks.some(check => !check.passed))) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
