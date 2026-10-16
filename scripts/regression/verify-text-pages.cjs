const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { unzipSync, strFromU8 } = require('fflate');
const { chromium } = require('playwright');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5197, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
    const page = await browser.newPage({ serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('geometry.grid', JSON.stringify({ visible: true })));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
        window.__textPages = { load: applyPersistedDocument, inspect: () => ({
          zoom: zoomFactor, viewport: availableCanvasViewport(canvas),
          labels: listLabels().map(label => {
            const p = worldToCanvas(label.pos.x, label.pos.y);
            const d = getLabelScreenDimensions(ctx, label, labelFontSizePx);
            return {left:p.x, right:p.x+d.width, top:p.y-d.height/2, bottom:p.y+d.height/2};
          })
        }) };` });
    });
    const archive = unzipSync(fs.readFileSync(path.resolve('public/content/omj-geometria-etap-II-2020-2024.ctr')));
    const documents = Object.values(archive).map(bytes => JSON.parse(strFromU8(bytes)));
    const output = path.resolve('output/text-pages');
    fs.mkdirSync(output, { recursive: true });
    for (const [width, height] of [[800, 600], [1024, 768], [1366, 768], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      await page.goto('http://127.0.0.1:5197/', { waitUntil: 'networkidle' });
      for (const doc of documents) {
        assert.equal(doc.model.points.length, 0, 'No artificial framing points');
        await page.evaluate(doc => window.__textPages.load(doc), doc);
        const { zoom, labels, viewport } = await page.evaluate(() => window.__textPages.inspect());
        assert.equal(zoom, 1, `${width}: opening text must keep a normal grid scale`);
        assert.equal(labels.length, 2);
        assert.ok(Math.abs(labels[0].top - viewport.top - 16) < 1);
        for (const box of labels) {
          assert.ok(box.left >= viewport.left && box.right <= viewport.right, `${width}: text fits horizontally`);
          assert.ok(box.top >= viewport.top && box.bottom <= viewport.bottom, `${height}: text fits vertically`);
        }
        assert.ok(labels[0].bottom < labels[1].top, 'Source and statement do not overlap');
      }
      await page.screenshot({ path: path.join(output, `${width}x${height}.png`) });
    }
    assert.deepEqual(errors, []);
    console.log(`Verified ${documents.length} text pages at four viewport sizes with grid enabled.`);
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
