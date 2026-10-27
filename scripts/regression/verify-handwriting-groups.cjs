const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5267, strictPort: true } });
  await server.listen(); let browser;
  try {
    browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, hasTouch: true, serviceWorkers: 'block' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
window.__inkGroups = { state: () => ({ runtime, group: wholeObjectGroup(), selection: [...multiSelectedInkStrokes] }), screen: worldToCanvas,
  load: applyPersistedDocument, save: serializeCurrentDocument };` });
    });
    await page.goto('http://127.0.0.1:5267/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__inkGroups);
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
    const state = () => page.evaluate(() => window.__inkGroups.state());
    const draw = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 3, y + 22, { steps: 6 }); await page.mouse.up(); };
    await page.locator('#modeHandwriting').click();
    await draw(300, 300); await draw(307, 300); await draw(314, 300);
    let s = await state(); assert.equal(Object.keys(s.runtime.inkStrokes).length, 3);
    assert.equal(Object.values(s.runtime.objectGroups)[0].members.inkStrokes.length, 3, 'Adjacent strokes should form one group');
    await draw(314, 327); await draw(360, 300); await draw(360, 345);
    s = await state(); assert.equal(Object.keys(s.runtime.objectGroups).length, 1, 'Separate word and line must stay outside group');
    const saved = await page.evaluate(() => window.__inkGroups.save());
    await page.evaluate(doc => window.__inkGroups.load(doc), saved);
    assert.equal(Object.values((await state()).runtime.objectGroups)[0].members.inkStrokes.length, 3, 'Save/load must preserve group');
    await page.locator('#modeMove').click();
    const member = Object.values((await state()).runtime.inkStrokes)[0].points[0];
    const position = await page.evaluate(p => window.__inkGroups.screen(p.x, p.y), member);
    await page.mouse.click(position.x, position.y);
    s = await state(); assert.equal(s.selection.length, 3, 'Clicking handwriting selects the whole group');
    if (!await page.locator('#ungroupObjectsBtn').isVisible()) await page.locator('#styleMenu').click();
    await page.locator('#ungroupObjectsBtn').click();
    assert.equal(Object.keys((await state()).runtime.objectGroups).length, 0, 'Ungroup must separate strokes');
    await page.locator('#undo').click(); assert.equal(Object.keys((await state()).runtime.objectGroups).length, 1, 'Undo restores grouping');
    await page.locator('#redo').click(); assert.equal(Object.keys((await state()).runtime.objectGroups).length, 0, 'Redo restores ungrouping');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.__inkGroups.load({ model: {} }));
    await page.locator('#modeHandwriting').click();
    const cdp = await page.context().newCDPSession(page);
    for (const x of [180, 187]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y: 300 }] });
      for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x + 3 * i / 5, y: 300 + 22 * i / 5 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    s = await state();
    assert.equal(Object.values(s.runtime.objectGroups)[0]?.members.inkStrokes.length, 2, 'Touch strokes should form a group on a phone');
    assert.deepEqual(errors, []);
    console.log('Mouse and touch grouping, separate words and lines, save/load, selection, ungroup, undo and redo passed');
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
