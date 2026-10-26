const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const OUTPUT_ROOT = path.resolve(__dirname, '../../output/playwright');
fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
const { chromium } = require('playwright');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5178, strictPort: true } });
  await server.listen();
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, hasTouch: true, serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      const body = await response.text();
      await route.fulfill({ response, body: body + `
window.__eraserRegression = {
  load: applyPersistedDocument,
  undo,
  redo,
  worldToCanvas,
  state: () => ({ inkIds: Object.keys(runtime.inkStrokes), historyIndex, historyLength: history.length, eraserActive })
};` });
    });
    await page.goto('http://127.0.0.1:5178/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__eraserRegression);
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();

    await page.evaluate(() => window.__eraserRegression.load({ model: { inkStrokes: [{
      id: 'ink-history-test', color: '#ff0000', baseWidth: 6,
      points: [
        { x: 100, y: 200, pressure: 1, time: 0 },
        { x: 200, y: 200, pressure: 1, time: 1 }
      ]
    }] } }));
    const initial = await page.evaluate(() => window.__eraserRegression.state());
    assert.deepEqual(initial.inkIds, ['ink-history-test']);

    await page.locator('#modeHandwriting').click();
    await page.locator('#styleMenu').click();
    await page.locator('#eraserBtn').click();
    const strokePosition = await page.evaluate(() => window.__eraserRegression.worldToCanvas(150, 200));
    await page.mouse.click(strokePosition.x, strokePosition.y);

    const erased = await page.evaluate(() => window.__eraserRegression.state());
    assert.deepEqual(erased.inkIds, []);
    assert.equal(erased.historyLength, initial.historyLength + 1, 'one erase gesture should add exactly one snapshot');
    assert.equal(erased.historyIndex, initial.historyIndex + 1);
    assert.equal(erased.eraserActive, true, 'eraser remains enabled after release');
    assert.equal(await page.locator('#eraserBtn').getAttribute('aria-pressed'), 'true');

    await page.locator('#undo').click();
    const undone = await page.evaluate(() => window.__eraserRegression.state());
    assert.deepEqual(undone.inkIds, ['ink-history-test'], 'Undo should restore the erased stroke');
    assert.equal(undone.historyIndex, initial.historyIndex);

    await page.locator('#redo').click();
    const redone = await page.evaluate(() => window.__eraserRegression.state());
    assert.deepEqual(redone.inkIds, [], 'Redo should erase the stroke again');
    assert.equal(redone.historyIndex, initial.historyIndex + 1);

    const beforeEmpty = await page.evaluate(() => window.__eraserRegression.state());
    const emptyPosition = await page.evaluate(() => window.__eraserRegression.worldToCanvas(350, 400));
    await page.mouse.click(emptyPosition.x, emptyPosition.y);
    const afterEmpty = await page.evaluate(() => window.__eraserRegression.state());
    assert.deepEqual(afterEmpty.inkIds, []);
    assert.equal(afterEmpty.historyLength, beforeEmpty.historyLength, 'an empty eraser gesture should not add a snapshot');
    assert.equal(afterEmpty.historyIndex, beforeEmpty.historyIndex);
    assert.equal(afterEmpty.eraserActive, true, 'empty gestures keep the eraser enabled');

    const consecutive = [];
    for (const touch of [false, true]) {
      await page.evaluate(() => window.__eraserRegression.load({ model: { inkStrokes: [200, 260, 320].map((y, i) => ({
        id: 'ink-' + i, color: '#ff0000', baseWidth: 6,
        points: [{ x: 100, y, pressure: 1, time: 0 }, { x: 200, y, pressure: 1, time: 1 }]
      })) } }));
      await page.locator('#modeHandwriting').click();
      if (await page.locator('#eraserBtn').getAttribute('aria-pressed') !== 'true') await page.locator('#eraserBtn').click();
      const positions = await page.evaluate(() => [200, 260, 320].map(y => window.__eraserRegression.worldToCanvas(150, y)));
      const before = await page.evaluate(() => window.__eraserRegression.state());
      const client = touch ? await page.context().newCDPSession(page) : null;
      if (touch) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...positions[0] }] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, ...positions[1] }] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await page.mouse.move(positions[0].x, positions[0].y);
        await page.mouse.down();
        await page.mouse.move(positions[1].x, positions[1].y, { steps: 8 });
        await page.mouse.up();
      }
      const first = await page.evaluate(() => window.__eraserRegression.state());
      assert.deepEqual(first.inkIds, ['ink-2'], 'one drag erases every crossed stroke');
      assert.equal(first.eraserActive, true);
      assert.equal(first.historyIndex, before.historyIndex + 1, 'one drag produces one history step');
      if (touch) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...positions[2] }] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await client.detach();
      } else await page.mouse.click(positions[2].x, positions[2].y);
      const second = await page.evaluate(() => window.__eraserRegression.state());
      assert.deepEqual(second.inkIds, [], 'the next gesture keeps erasing without another toggle');
      assert.equal(second.eraserActive, true);
      assert.equal(second.historyIndex, before.historyIndex + 2);
      await page.locator('#eraserBtn').click();
      assert.equal((await page.evaluate(() => window.__eraserRegression.state())).eraserActive, false);
      assert.equal(await page.locator('#eraserBtn').getAttribute('aria-pressed'), 'false');
      await page.mouse.move(positions[0].x, positions[0].y);
      await page.mouse.down();
      await page.mouse.move(positions[1].x, positions[1].y, { steps: 8 });
      await page.mouse.up();
      assert.equal((await page.evaluate(() => window.__eraserRegression.state())).inkIds.length, 1, 'toggling off restores writing');
      consecutive.push({ touch, first, second });
    }

    assert.deepEqual(errors, []);
    const result = { initial, erased, undone, redone, afterEmpty, consecutive, errors };
    const out = path.join(OUTPUT_ROOT, 'geometry-visibility');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'eraser-history.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
