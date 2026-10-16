const { zipSync, strToU8 } = require('fflate');
const fs = require('node:fs'), path = require('node:path'), { chromium } = require('playwright');
const out = path.resolve(__dirname, '../../output/playwright/bisector-topology');
fs.mkdirSync(out, { recursive: true });
const result = { checks: [], errors: [] };
const check = (name, passed, data) => { result.checks.push({ name, passed: !!passed, data }); if (!passed)
    throw Error(name + ': ' + JSON.stringify(data)); };
(async () => {
    const { createServer } = await import('vite'), server = await createServer({ server: { host: '127.0.0.1', port: 5214, strictPort: true } });
    await server.listen();
    let browser;
    try {
        browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
        for (const segmentInput of [false, true]) {
            const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, serviceWorkers: 'block' });
            page.on('pageerror', e => result.errors.push(e.message));
            await page.route('**/src/main.ts*', async (route) => { const response = await route.fetch(); await route.fulfill({ response, body: await response.text() + `\nwindow.__bis={state:()=>({runtime,selectedPointId,selectedLineId,selectedSegments:[...selectedSegments],multiSelectedLines:[...multiSelectedLines],historyIndex}),worldToCanvas,hits:findLineHits,serialize:serializeCurrentDocument,labelPos:getLineLabelPos};` }); });
            await page.goto('http://127.0.0.1:5214/', { waitUntil: 'networkidle' });
            if (await page.locator('#swDismissBtn').isVisible())
                await page.locator('#swDismissBtn').click();
            const state = () => page.evaluate(() => window.__bis.state());
            const click = async (p) => { const q = await page.evaluate(p => { const q = window.__bis.worldToCanvas(p.x, p.y), r = document.getElementById('canvas').getBoundingClientRect(); return { x: r.x + q.x, y: r.y + q.y }; }, p); const target = await page.evaluate(q => document.elementFromPoint(q.x, q.y)?.id, q); if (target !== 'canvas')
                throw Error('Canvas click intercepted by ' + target); await page.mouse.click(q.x, q.y); };
            const add = async (x, y) => { const before = await state(); await page.locator('#modeAdd').click(); await click({ x, y }); return Object.keys((await state()).runtime.points).find(id => !before.runtime.points[id]); };
            const A = await add(300, 300), B = await add(500, 300);
            if (segmentInput) {
                await page.locator('#modeSegment').click();
                await click({ x: 300, y: 300 });
                await click({ x: 500, y: 300 });
            }
            await page.locator('#modePerpBisector').click();
            if (segmentInput)
                await click({ x: 400, y: 300 });
            else {
                await click({ x: 300, y: 300 });
                await click({ x: 500, y: 300 });
            }
            let s = await state(), line = Object.values(s.runtime.lines).find(l => l.perpendicular?.directBisector), id = line?.id;
            check('Creates bare bisector from ' + (segmentInput ? 'segment' : 'points'), !!id && line.points.length === 0 && line.segmentStyles.length === 0 && !Object.values(s.runtime.points).some(p => p.construction_kind === 'midpoint'), s);
            await page.locator('#modeLabel').click();
            await page.locator('#modeMove').click();
            await click({ x: 80, y: 200 });
            check('A bisector label is offset from the line without adding endpoints', await page.evaluate(id => { const p = window.__bis.labelPos(id); return p && Math.abs(p.x - 400) > 10 && Math.abs(p.y - 300) < 1e-6; }, id));
            for (const y of [260, 290, 310, 340])
                check('The former middle region is a ray at ' + y, await page.evaluate(({ id, y }) => window.__bis.hits({ x: 400, y }).filter(h => h.lineId === id).every(h => h.part !== 'segment') && window.__bis.hits({ x: 400, y }).some(h => h.lineId === id), { id, y }));
            const P = await add(400, 390);
            line = (await state()).runtime.lines[id];
            check('One real point adds no finite interval', line.points.length === 1 && line.points[0] === P && line.segmentStyles.length === 0, line);
            const Q = await add(400, 490);
            line = (await state()).runtime.lines[id];
            check('Two real points create precisely their segment', JSON.stringify(line.points) === JSON.stringify([P, Q]) && line.segmentStyles.length === 1, line);
            check('Finite interval can be hit between its actual endpoints', await page.evaluate(id => window.__bis.hits({ x: 400, y: 440 }).some(h => h.lineId === id && h.part === 'segment' && h.seg === 0), id));
            await page.locator('#modeMove').click();
            await click({ x: 400, y: 440 });
            if (!await page.locator('#styleColor').isVisible())
                await page.locator('#styleMenu').click();
            await page.locator('#styleColor').evaluate(el => { el.value = '#ff5500'; el.dispatchEvent(new Event('input', { bubbles: true })); });
            check('Styles only the true finite interval', (await state()).runtime.lines[id].segmentStyles[0].color === '#ff5500');
            await page.locator('#styleMenu').click();
            await page.locator('#modeMove').click();
            await click({ x: 80, y: 200 });
            await click({ x: 400, y: 560 });
            await click({ x: 400, y: 560 });
            check('Selects only the right ray', (await state()).selectedSegments.length === 1 && (await state()).selectedSegments[0].includes('rayRight'), await state());
            await page.locator('#hideButton').click();
            line = (await state()).runtime.lines[id];
            check('Hides only the selected right ray', line.rightRay.hidden && !line.leftRay.hidden && !line.segmentStyles[0].hidden, line);
            check('Hidden right ray is not hit while segment remains available', await page.evaluate(id => !window.__bis.hits({ x: 400, y: 560 }).some(h => h.lineId === id) && window.__bis.hits({ x: 400, y: 440 }).some(h => h.lineId === id && h.part === 'segment'), id));
            await page.locator('#undo').click();
            check('Undo restores the selected ray', !(await state()).runtime.lines[id].rightRay.hidden);
            await page.locator('#redo').click();
            check('Redo hides the same ray', (await state()).runtime.lines[id].rightRay.hidden);
            for (const point of [P, Q]) {
                await page.locator('#modeMove').click();
                await click((await state()).runtime.points[point]);
                await page.locator('#deletePoint').click();
            }
            line = (await state()).runtime.lines[id];
            check('Removing both subdivision points retains the bare bisector', !!line && line.points.length === 0 && line.segmentStyles.length === 0, line);
            const document = await page.evaluate(() => window.__bis.serialize());
            check('Saved line has no subdivision endpoints but retains its direction definition', (document.model.lines.find(l => l.id === id).points ?? []).length === 0 && document.model.lines.find(l => l.id === id).defining_points.length === 2);
            await page.locator('#modeMultiselect').click();
            const boxStart = await page.evaluate(() => window.__bis.worldToCanvas(70, 180)), boxEnd = await page.evaluate(() => window.__bis.worldToCanvas(180, 250)), rect = await page.locator('#canvas').boundingBox();
            await page.mouse.move(rect.x + boxStart.x, rect.y + boxStart.y);
            await page.mouse.down();
            await page.mouse.move(rect.x + boxEnd.x, rect.y + boxEnd.y, { steps: 12 });
            await page.mouse.up();
            check('An unrelated empty selection box excludes the bare bisector', !(await state()).multiSelectedLines.includes(id));
            await page.locator('#modeMove').click();
            await click({ x: 80, y: 200 });
            const name = 'bisector-roundtrip.ctr', bytes = zipSync({ 'bisector-roundtrip.json': strToU8(JSON.stringify(document)) });
            fs.writeFileSync(path.join(out, (segmentInput ? 'segment' : 'points') + '.ctr'), bytes);
            await page.evaluate(({ name, bytes }) => { const file = new File([new Uint8Array(bytes)], name, { type: 'application/zip' }), handle = { kind: 'file', name, getFile: async () => file }; window.showDirectoryPicker = async () => ({ kind: 'directory', name: 'bisector-roundtrip', queryPermission: async () => 'granted', requestPermission: async () => 'granted', async *values() { yield handle; }, async *entries() { yield [name, handle]; } }); }, { name, bytes: Array.from(bytes) });
            await page.locator('#cloudFilesBtn').click();
            await page.locator('#localFileList [data-change-folder]').click();
            await page.locator('#localFileList .cloud-file-item').filter({ hasText: 'bisector-roundtrip' }).click();
            await page.locator('#cloudCloseBtn').click();
            line = (await state()).runtime.lines[id];
            check('Local file reload keeps the bisector without an artificial interval', !!line && line.points.length === 0 && (line.segmentStyles ?? []).length === 0 && (!line.rightRay || line.rightRay.hidden), line);
            check('Reloaded bisector still has its visible half and hidden half', await page.evaluate(id => window.__bis.hits({ x: 400, y: 260 }).some(h => h.lineId === id) && !window.__bis.hits({ x: 400, y: 440 }).some(h => h.lineId === id), id));
            await page.screenshot({ path: path.join(out, (segmentInput ? 'segment' : 'points') + '.png') });
            await page.close();
        }
        check('No browser exceptions', result.errors.length === 0, result.errors);
    }
    catch (e) {
        result.errors.push(e.stack || String(e));
        process.exitCode = 1;
    }
    finally {
        await browser?.close();
        await server.close();
        fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
    }
    console.log(JSON.stringify({ checks: result.checks.length, passed: result.checks.filter(c => c.passed).length, errors: result.errors }));
    if (result.errors.length)
        process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
