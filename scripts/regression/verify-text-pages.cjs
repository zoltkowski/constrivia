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
        window.__textPages = { load: applyPersistedDocument, bundle: entries => {
          applyPersistedDocument(entries[0].data); setCtrBundle({entries,index:0});
          clearSelectionState(); setMode('move'); updateSelectionButtons();
        }, inspect: () => ({
          zoom: zoomFactor, pan: {...panOffset}, viewport: availableCanvasViewport(canvas),
          labels: listLabels().map(label => {
            const p = worldToCanvas(label.pos.x, label.pos.y);
            const d = getLabelScreenDimensions(ctx, label, labelFontSizePx);
            return {left:p.x, right:p.x+d.width, top:p.y-d.height/2, bottom:p.y+d.height/2};
          })
        }) };` });
    });
    const archive = unzipSync(fs.readFileSync(path.resolve('public/content/omj-geometria-etap-II-2005-2024.ctr')));
    const documents = Object.values(archive).map(bytes => JSON.parse(strFromU8(bytes)));
    const tasks = JSON.parse(fs.readFileSync(path.resolve('materials/omj-geometria-zadania.json'), 'utf8'));
    assert.equal(documents.length, 36);
    assert.deepEqual(documents.map(doc => doc.title), tasks.map(task => `OMJ ${task.year} - zadanie ${task.number}`));
    for (const [index, doc] of documents.entries()) {
      assert.equal(doc.model.labels[1].text.replace(/\s+/g, ' '), tasks[index].text.replace(/\s+/g, ' '), 'Wrapping preserves the full statement');
      assert.equal(doc.source.file, tasks[index].file);
      assert.equal(doc.model.labels[0].text, `zadanie ${tasks[index].number} OMJ etap II ${tasks[index].year}r.`);
    }
    assert.ok(documents.every(doc => !['OMJ 2022 - zadanie 5', 'OMJ 2024 - zadanie 2'].includes(doc.title)));
    const output = path.resolve('output/text-pages');
    fs.mkdirSync(output, { recursive: true });
    const screens = [[360, 800], [390, 844], [412, 915], [800, 600], [1024, 768], [1366, 768], [1920, 1080]];
    for (const [width, height] of screens) {
      await page.setViewportSize({ width, height });
      await page.goto('http://127.0.0.1:5197/', { waitUntil: 'networkidle' });
      await page.evaluate(documents => window.__textPages.bundle(documents.map((data, i) => ({name: `${i}.json`, data}))), documents);
      let firstPan;
      for (const [index, doc] of documents.entries()) {
        assert.equal(doc.model.points.length, 0, 'No artificial framing points');
        if (index) await page.locator('#bundleNextBtn').click();
        const { zoom, pan, labels, viewport } = await page.evaluate(() => window.__textPages.inspect());
        firstPan ??= pan;
        assert.deepEqual(pan, firstPan, 'Turning a page must not move the grid');
        assert.equal(labels[0].left, viewport.left + 16, 'All statements share the same left margin');
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
    console.log(`Verified ${documents.length} text pages at ${screens.length} viewport sizes with grid enabled.`);
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
